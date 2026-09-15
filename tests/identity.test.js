// اختبار انحدار: node tests/identity.test.js
// يشغّل js/identity.js الحقيقيّ بقائمة مشرفين تجريبيّة (رموزها معروفة) وقاعدة بيانات مزيّفة:
//   ١) الربط بالرمز: رمزٌ خاطئ لا يُحفظ، والصحيح يسحب معلّمي صاحبه وحده
//   ٢) لا تداخل: تبديل المشرف يمسح نسخة السابق، ونسخةٌ لغير صاحب الهويّة تُهمَل
//   ٣) حفظ الرمز: الهويّة تبقى بلا الرمز نصّاً، وتغيير الرمز في موقع المعلمين يُلغي الربط
//   ٤) بلا ربط: لا تُحمَّل Firebase أصلاً
//   ٥) القائمة في identity.js هي قائمة data.html نفسها (إن وُجد مستودع المعلمين بجانبه)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/identity.js'), 'utf8').replace(/\r\n/g, '\n');
const BEGIN = '/* === SUPERVISORS:BEGIN === */';
const END = '/* === SUPERVISORS:END === */';

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const TEST_BLOCK = `
    const SUPERVISORS = [
        { id: 'a', name: 'المشرف أ', hash: '${sha('code-a')}' },
        { id: 'b', name: 'المشرف ب', hash: '${sha('code-b')}' }
    ];
    const ADMIN_HASH = '${sha('admin-x')}';
    `;
const testSrc = SRC.slice(0, SRC.indexOf(BEGIN) + BEGIN.length) + TEST_BLOCK + SRC.slice(SRC.indexOf(END));

const TEACHERS = [
    { 'اسم المعلم': 'معلم أول', 'المدرسة': 'مدرسة ١', 'نوع المدرسة': 'حكومية', 'المشرف': 'المشرف أ',
      'عدد الحصص': 18, 'الرقم المدني': '11112222', 'الهاتف': '99990000', 'البريد الالكتروني': 'x@y.om' },
    { 'اسم المعلم': 'معلم ثان', 'المدرسة': 'مدرسة ٢', 'نوع المدرسة': 'خاصة', 'المشرف': 'المشرف أ' },
    { 'اسم المعلم': 'معلم ثالث', 'المدرسة': 'مدرسة ٣', 'نوع المدرسة': 'حكومية', 'المشرف': 'المشرف ب' },
    { 'اسم المعلم': 'معلم بلا مشرف', 'المدرسة': 'مدرسة ٤', 'نوع المدرسة': 'حكومية' }
];

// قاعدة مزيّفة بشكل Firestore Lite: where تُنفَّذ «في الخادم» كما في الحقيقة
function fakeSdk(opts) {
    const log = [];
    const snap = rows => ({ forEach: fn => rows.forEach(r => fn({ id: r.id, data: () => r.data })) });
    const sdk = {
        db: {},
        collection: (db, name) => ({ name }),
        where: (field, op, value) => ({ field, op, value }),
        query: (col, w) => ({ name: col.name, w }),
        getDocs: async q => {
            log.push(q);
            if (opts.offline) throw new Error('offline');
            if (q.name === 'supervisor_codes') {
                return snap(Object.entries(opts.codes || {}).map(([id, hash]) => ({ id, data: { hash } })));
            }
            if (opts.failTeachers) throw new Error('teachers failed');
            const rows = q.w ? TEACHERS.filter(t => t[q.w.field] === q.w.value) : TEACHERS;
            return snap(rows.map((r, i) => ({ id: 't' + i, data: r })));
        }
    };
    return { sdk, log };
}

function env(store) {
    const data = Object.assign({}, store);
    const localStorage = {
        getItem: k => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: k => { delete data[k]; },
        key: i => Object.keys(data)[i] ?? null,
        get length() { return Object.keys(data).length; }
    };
    const ctx = { localStorage, crypto: globalThis.crypto, TextEncoder, console };
    vm.runInNewContext(testSrc, ctx);
    const api = ctx.SupervisorIdentity;
    let loads = 0;
    const use = opts => {
        const f = fakeSdk(opts);
        api.loadSdk = async () => { loads++; if (opts.sdkFails) throw new Error('no sdk'); return f.sdk; };
        return f.log;
    };
    return { api, data, use, loads: () => loads };
}

const rejects = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

(async () => {
    /* ── ١) الربط بالرمز ── */
    {
        const e = env();
        e.use({});
        const msg = await rejects(e.api.link('code-wrong'));
        check('link: رمزٌ خاطئ يُرفض', msg === 'رمز غير صحيح.', msg);
        check('link: الرمز الخاطئ لا يحفظ شيئاً', Object.keys(e.data).length === 0, Object.keys(e.data).join(','));

        const log = e.use({});
        const { identity, teachers } = await e.api.link('  code-a  ');
        check('link: الرمز الصحيح (بمسافاتٍ حوله) يعرّف صاحبه', identity.name === 'المشرف أ', identity.name);
        const q = log.find(x => x.name === 'teachers');
        check('link: الطلب مُصفّى في القاعدة بحقل «المشرف»',
              q && q.w && q.w.field === 'المشرف' && q.w.value === 'المشرف أ', JSON.stringify(q));
        check('link: يسحب معلّمي صاحبه وحدهم', teachers.length === 2 && teachers.every(t => t.supervisor === 'المشرف أ'),
              teachers.map(t => t.name).join(','));
        const all = JSON.stringify(e.data);
        check('link: الرمز لا يُخزَّن نصّاً', !all.includes('code-a'), 'وُجد الرمز في التخزين');
        check('link: الرقم المدني والهاتف والبريد لا تُنسخ إلى المتصفّح',
              !all.includes('11112222') && !all.includes('99990000') && !all.includes('x@y.om'), 'نُسخت');
        check('link: عدد الحصص يُحفظ نصّاً', e.api.getTeachers().find(t => t.name === 'معلم أول').load === '18');

        // حفظ الرمز: تحميلٌ جديدٌ للصفحة بالتخزين نفسه يعرف المشرف بلا رمز
        const reopened = env(e.data);
        reopened.use({});
        check('remember: بعد إعادة فتح الموقع يبقى الربط', reopened.api.getIdentity()?.name === 'المشرف أ');
        const r = await reopened.api.refresh(false);
        check('remember: نسخةٌ حديثةٌ لا تتّصل بالقاعدة عند الفتح', r.linked && reopened.loads() === 0,
              JSON.stringify(r) + ' loads=' + reopened.loads());
    }

    /* ── ٢) لا تداخل بين المشرفين ── */
    {
        const e = env();
        e.use({});
        await e.api.link('code-a');
        await e.api.link('code-b');
        check('overlap: تبديل المشرف يمسح نسخة السابق', !('svf_teachers_cache_a' in e.data), Object.keys(e.data).join(','));
        check('overlap: المشرف الجديد يرى معلّميه وحدهم',
              e.api.getTeachers().length === 1 && e.api.getTeachers()[0].name === 'معلم ثالث');

        // نسخةٌ باسم مشرفٍ آخر في التخزين (عبث أو بقايا) لا تُعرض لصاحب الهويّة
        e.data.svf_teachers_cache_b = JSON.stringify({ id: 'a', at: Date.now(), teachers: [{ name: 'دخيل' }] });
        check('overlap: نسخةٌ لا تحمل معرّف صاحب الهويّة تُهمَل', e.api.getTeachers().length === 0);

        const admin = env();
        const log = admin.use({});
        const res = await admin.api.link('admin-x');
        const q = log.find(x => x.name === 'teachers');
        check('admin: رمز المشرف العام يسحب الجميع بلا تصفية', res.identity.admin && q && !q.w && res.teachers.length === 4);
    }

    /* ── ٣) تغيير الرمز في موقع المعلمين ── */
    {
        const e = env();
        e.use({ codes: { a: sha('code-a-new') } });
        check('codes: الرمز القديم يُرفض بعد تغييره', await rejects(e.api.link('code-a')) === 'رمز غير صحيح.');
        await e.api.link('code-a-new');
        check('codes: الرمز الجديد يُقبل', e.api.getIdentity()?.id === 'a');

        // مشرفٌ مرتبطٌ بالرمز القديم ثمّ غيّره: التحديث التالي يُلغي الربط
        const old = env();
        old.use({});
        await old.api.link('code-b');
        old.use({ codes: { b: sha('code-b-new') } });
        const r = await old.api.refresh(true);
        check('codes: تغيير الرمز يُلغي الربط عند التحديث', r.reason === 'code-changed' && !old.api.getIdentity(),
              JSON.stringify(r));
        check('codes: وإلغاء الربط يمسح النسخة', old.api.getTeachers().length === 0 && !('svf_teachers_cache_b' in old.data));

        // بلا اتّصال: تبقى الهويّة والنسخة
        const off = env();
        off.use({});
        await off.api.link('code-a');
        off.use({ offline: true });
        const r2 = await off.api.refresh(true);
        check('offline: تعذُّر الاتّصال لا يُلغي الربط', r2.linked && r2.offline && off.api.getTeachers().length === 2,
              JSON.stringify(r2));

        const conn = env();
        conn.use({ sdkFails: true });
        const m = await rejects(conn.api.link('code-a'));
        check('offline: الربط بلا اتّصالٍ يشرح السبب ولا يحفظ', /الاتصال/.test(m || '') && !conn.data.svf_identity, m);

        const half = env();
        half.use({ failTeachers: true });
        await rejects(half.api.link('code-a'));
        check('link: فشل سحب المعلمين لا يحفظ هويّةً ناقصة', !half.data.svf_identity);

        // مشرفٌ حُذف من القائمة
        const gone = env({ svf_identity: JSON.stringify({ id: 'z', hash: sha('x'), linkedAt: 1 }),
                           svf_teachers_cache_z: JSON.stringify({ id: 'z', at: Date.now(), teachers: [] }) });
        gone.use({});
        const r3 = await gone.api.refresh(false);
        check('removed: مشرفٌ خرج من القائمة يُلغى ربطه وتُمسح نسخته',
              r3.reason === 'removed' && !gone.data.svf_identity && !gone.data.svf_teachers_cache_z, JSON.stringify(r3));
    }

    /* ── ٤) بلا ربط ── */
    {
        const e = env();
        e.use({});
        const r = await e.api.refresh(false);
        check('unlinked: الموقع يعمل بلا ربط ولا يُحمّل Firebase', !r.linked && e.loads() === 0 && e.api.getTeachers().length === 0);
        e.use({});
        await e.api.link('code-a');
        e.api.unlink();
        check('unlink: إلغاء الربط يمسح الهويّة والنسخ',
              !Object.keys(e.data).some(k => k === 'svf_identity' || k.startsWith('svf_teachers_cache_')));
    }

    /* ── ٥) التوصيل والقائمة الحقيقيّة ── */
    {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        check('wiring: identity.js يُحمَّل قبل init.js',
              html.indexOf('js/identity.js') > 0 && html.indexOf('js/identity.js') < html.indexOf('js/init.js'));
        check('wiring: بطاقة الربط في الصفحة الرئيسيّة', html.includes('id="identityCard"'));
        check('wiring: init.js يستدعي initCard',
              /SupervisorIdentity\.initCard\(\)/.test(fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8')));
        const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
        check('wiring: عامل الخدمة يخزّن identity.js ولا يخزّن طلبات القاعدة',
              sw.includes("'./js/identity.js'") && sw.includes("url.hostname === 'firestore.googleapis.com') return"));

        const block = src => {
            const s = src.slice(src.indexOf(BEGIN), src.indexOf(END));
            return {
                sups: [...s.matchAll(/id: '([^']+)', name: '([^']+)',\s*hash: '([0-9a-f]{64})'/g)].map(m => m.slice(1).join('|')),
                admin: (s.match(/ADMIN_HASH = '([0-9a-f]{64})'/) || [])[1]
            };
        };
        const mine = block(SRC);
        check('list: القائمة في identity.js ليست فارغة', mine.sups.length > 0 && !!mine.admin, mine.sups.length + ' مشرف');
        const tdc = path.join(ROOT, '..', 'teacher-data-collection', 'data.html');
        if (fs.existsSync(tdc)) {
            const theirs = block(fs.readFileSync(tdc, 'utf8').replace(/\r\n/g, '\n'));
            check('list: مطابقةٌ لقائمة موقع المعلمين (المعرّف والاسم والبصمة)',
                  JSON.stringify(mine) === JSON.stringify(theirs),
                  'شغّل «تحديث المشرفين» في teacher-data-tools');
        } else {
            console.log('      (مستودع teacher-data-collection غير موجود بجانبه — تُخطّى المطابقة)');
        }
    }

    console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
    process.exit(failures ? 1 : 0);
})().catch(err => {
    console.log('FAIL استثناء: ' + (err && err.stack || err));
    process.exit(1);
});
