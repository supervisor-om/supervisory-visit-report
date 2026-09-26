// اختبار انحدار: node tests/gate.test.js
// بوّابة الدخول (js/gate.js) بالرموز القائمة نفسها:
//   ١) بلا جلسةٍ تُقفل الصفحة، وبجلسةٍ صالحةٍ تُفتح بلا سؤال
//   ٢) الرمز الخاطئ يُرفض ولا يفتح ولا يحفظ جلسة
//   ٣) الرمز الصحيح يفتح، ويربط صاحبه بمعلّميه بلا رمزٍ ثانٍ
//   ٤) رمزٌ غيّره صاحبه (supervisor_codes) يُقبل بلا إنترنت بعد حفظه
//   ٥) الخروج يمسح الجلسة، والصفحات الثلاث تحمل البوّابة في <head>
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const IDENTITY = read('js/identity.js');
const GATE = read('js/gate.js');
const BEGIN = '/* === SUPERVISORS:BEGIN === */';
const END = '/* === SUPERVISORS:END === */';
const TEST_BLOCK = `
    const SUPERVISORS = [
        { id: 'a', name: 'المشرف أ', hash: '${sha('code-a')}' },
        { id: 'b', name: 'المشرف ب', hash: '${sha('code-b')}' }
    ];
    const ADMIN_HASH = '${sha('admin-x')}';
    `;
const identitySrc = IDENTITY.slice(0, IDENTITY.indexOf(BEGIN) + BEGIN.length) + TEST_BLOCK + IDENTITY.slice(IDENTITY.indexOf(END));

function env(store, opts) {
    opts = opts || {};
    const data = Object.assign({}, store);
    const els = {};
    const listeners = {};
    const mk = id => ({
        id, value: '', textContent: '', innerHTML: '', disabled: false, children: [], listeners: {},
        appendChild(c) { this.children.push(c); if (c.id) els[c.id] = c; return c; },
        remove() { delete els[this.id]; },
        addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
        dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
        focus() {}, setAttribute() {}, removeAttribute() {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false }
    });
    const root = { attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        removeAttribute(k) { delete this.attrs[k]; },
        hasAttribute(k) { return k in this.attrs; } };
    const body = mk('body');
    const head = mk('head');
    // العنصر المُنشأ يُسجَّل باسمه حين يُضاف، وinnerHTML يُحاكى بتسجيل ما فيه من معرّفات
    const AUTO = new Set(['svfGateForm', 'svfGateCode', 'svfGateBtn', 'svfGateMsg']);
    const ctx = {
        console, crypto: globalThis.crypto, TextEncoder,
        CustomEvent: class { constructor(t) { this.type = t; } },
        Event: class { constructor(t) { this.type = t; } },
        setTimeout: (fn) => { try { fn(); } catch (e) {} },
        location: { reload() { ctx.__reloaded = true; } },
        navigator: { onLine: !opts.offline },
        localStorage: {
            getItem: k => (k in data ? data[k] : null),
            setItem: (k, v) => { data[k] = String(v); },
            removeItem: k => { delete data[k]; },
            key: i => Object.keys(data)[i] ?? null,
            get length() { return Object.keys(data).length; }
        },
        document: {
            readyState: 'complete',
            documentElement: root, head, body,
            // innerHTML لا يُحلَّل هنا: عناصر النموذج تُنشأ عند أوّل طلبٍ لها
            getElementById: id => els[id] || (AUTO.has(id) ? (els[id] = mk(id)) : null),
            querySelector: () => null,
            createElement: () => mk(''),
            addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
            dispatchEvent() { return true; }
        }
    };
    ctx.window = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(identitySrc, ctx);

    // القاعدة المزيّفة: الرموز المحدَّثة وحدها تهمّ البوّابة
    ctx.SupervisorIdentity.loadSdk = async () => {
        if (opts.offline) throw new Error('offline');
        return {
            db: {}, collection: (db, name) => ({ name }), where: () => ({}), query: c => c,
            getDocs: async q => ({ forEach: fn => Object.entries(opts.codes || {})
                .forEach(([id, hash]) => fn({ id, data: () => ({ hash }) })) })
        };
    };
    vm.runInContext(GATE, ctx);
    return { ctx, data, els, root, body,
             submit: async () => {
                 const form = els['svfGateForm'];
                 const fn = (form.listeners.submit || [])[0];
                 if (!fn) throw new Error('لا مستمع للإرسال — لم يُبنَ النموذج');
                 await fn({ preventDefault() {} });
             } };
}

(async () => {
    /* ── ١) القفل والفتح ── */
    {
        const e = env({});
        check('gate: بلا جلسةٍ تُقفل الصفحة', e.root.hasAttribute('data-svf-locked'));
        check('gate: نموذج الرمز يُعرض', !!e.els['svfGate'] || !!e.els['svfGateForm']);

        const open = env({ svf_gate: JSON.stringify({ id: 'a', name: 'المشرف أ', hash: sha('code-a'), at: Date.now() }) });
        check('gate: بجلسةٍ صالحةٍ تُفتح بلا سؤال', !open.root.hasAttribute('data-svf-locked'));
        check('gate: وزرّ الخروج يظهر ومعه اسم صاحبها',
              !!open.els['svfLogout'] && /المشرف أ/.test(open.els['svfLogout'].textContent), open.els['svfLogout']?.textContent);

        const broken = env({ svf_gate: '{"id":"a"}' });
        check('gate: جلسةٌ ناقصةٌ أو معبوثٌ بها لا تفتح', broken.root.hasAttribute('data-svf-locked'));
    }

    /* ── ٢) رمزٌ خاطئ ── */
    {
        const e = env({});
        e.els['svfGateCode'].value = 'رمز مختلق';
        await e.submit();
        check('gate: الرمز الخاطئ يُبلَّغ', /غير صحيح/.test(e.els['svfGateMsg'].textContent), e.els['svfGateMsg'].textContent);
        check('gate: ولا يفتح الصفحة', e.root.hasAttribute('data-svf-locked'));
        check('gate: ولا يحفظ جلسة', !e.data.svf_gate);
    }

    /* ── ٣) الرمز الصحيح يفتح ويربط ── */
    {
        const e = env({});
        e.els['svfGateCode'].value = '  code-a  ';
        await e.submit();
        const s = JSON.parse(e.data.svf_gate || 'null');
        check('gate: الرمز الصحيح (بمسافاتٍ حوله) يفتح', !e.root.hasAttribute('data-svf-locked'));
        check('gate: الجلسة تحمل صاحبها وبصمته لا الرمز',
              s && s.id === 'a' && s.hash === sha('code-a') && !JSON.stringify(e.data).includes('code-a'),
              JSON.stringify(s));
        check('gate: الرمز نفسه يربطه بمعلّميه بلا رمزٍ ثانٍ',
              e.ctx.SupervisorIdentity.getIdentity()?.id === 'a', 'لم يُربط');

        const adm = env({});
        adm.els['svfGateCode'].value = 'admin-x';
        await adm.submit();
        check('gate: رمز المشرف العام يفتح ولا يُربط بمعلّمي أحد',
              !adm.root.hasAttribute('data-svf-locked') && !adm.ctx.SupervisorIdentity.getIdentity());
    }

    /* ── ٤) رمزٌ غيّره صاحبه ── */
    {
        const online = env({}, { codes: { a: sha('code-a-new') } });
        online.els['svfGateCode'].value = 'code-a-new';
        await online.submit();
        check('codes: الرمز المحدَّث يُقبل (يُجلب من القاعدة عند الحاجة)',
              !online.root.hasAttribute('data-svf-locked'), online.els['svfGateMsg'].textContent);
        check('codes: ويُحفظ محلّيّاً للمرّة القادمة', !!online.data.svf_code_overrides);

        const offline = env({ svf_code_overrides: online.data.svf_code_overrides }, { offline: true });
        offline.els['svfGateCode'].value = 'code-a-new';
        await offline.submit();
        check('codes: ويُقبل بعدها بلا إنترنت', !offline.root.hasAttribute('data-svf-locked'));

        const stale = env({}, { offline: true });
        stale.els['svfGateCode'].value = 'code-a-new';
        await stale.submit();
        check('codes: وبلا إنترنتٍ ولا نسخةٍ محفوظةٍ لا يُقبل رمزٌ مجهول', stale.root.hasAttribute('data-svf-locked'));
    }

    /* ── ٥) الخروج والتوصيل ── */
    {
        const e = env({ svf_gate: JSON.stringify({ id: 'a', hash: sha('code-a') }) });
        e.ctx.SupervisorGate.logout();
        check('gate: الخروج يمسح الجلسة ويُعيد التحميل', !e.data.svf_gate && e.ctx.__reloaded === true);

        ['index.html', 'reports.html', 'monthly.html'].forEach(f => {
            const h = read(f);
            const inHead = h.indexOf('js/gate.js') > 0 && h.indexOf('js/gate.js') < h.indexOf('</head>');
            check('wiring: ' + f + ' تحمل البوّابة قبل المحتوى', inHead, 'غير محمَّلة في <head>');
            check('wiring: ' + f + ' تحمل identity.js للتحقّق', h.includes('js/identity.js'));
        });
        check('wiring: عامل الخدمة يخزّن gate.js', read('sw.js').includes("'./js/gate.js'"));
    }


    console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
    process.exit(failures ? 1 : 0);
})();
