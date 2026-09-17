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

// تحاكي القاعدة الحقيقيّة: الجنس من الحالة الاجتماعيّة، والصفوف بمفتاحين
// مختلفين بين الحكوميّ والخاصّ، و«بن» في أسماء العمانيّين، ومديرٌ يختلف اسمه
// بين سجلّات المدرسة الواحدة.
const TEACHERS = [
    { 'اسم المعلم': 'هاشم بن راشد بن سيف الهاشمي', 'المدرسة': 'مدرسة الإمام', 'نوع المدرسة': 'حكومية',
      'المشرف': 'المشرف أ', 'عدد الحصص': 18, 'الفصول التي تدرسها': '9،10،11،12', 'رقم الملف': '7788',
      'الحالة الاجتماعية': 'متزوج +3', 'اسم مدير المدرسة': 'سعيد المعمري', 'التخصص': 'تربية رياضية',
      'الرقم المدني': '11112222', 'الهاتف': '99990000', 'البريد الالكتروني': 'x@y.om' },
    { 'اسم المعلم': 'مريم بنت سالم الحارثية', 'المدرسة': 'مدرسة الامام', 'نوع المدرسة': 'حكومية',
      'المشرف': 'المشرف أ', 'عدد الحصص': 20, 'الفصول التي تدرسها': '1،2،3',
      'الحالة الاجتماعية': 'عزباء', 'اسم مدير المدرسة': 'سعيد المعمري' },
    { 'اسم المعلم': 'ناصر الكندي', 'المدرسة': 'مدرسة الوادي الخاصة', 'نوع المدرسة': 'خاصة',
      'المشرف': 'المشرف أ', 'الصفوف التي يدرسها': '5،7،9', 'الحالة الاجتماعية': 'اعزب',
      'اسم مدير المدرسة': 'جون سميث' },
    { 'اسم المعلم': 'سالمة الرواحية', 'المدرسة': 'مدرسة الوادي الخاصة', 'نوع المدرسة': 'خاصة',
      'المشرف': 'المشرف أ', 'عدد الحصص': 12, 'الحالة الاجتماعية': 'متزوجة',
      'اسم مدير المدرسة': 'جون سميث الثاني' },
    { 'اسم المعلم': 'معلم ثالث', 'المدرسة': 'مدرسة ٣', 'نوع المدرسة': 'حكومية', 'المشرف': 'المشرف ب',
      'الحالة الاجتماعية': 'متزوج' },
    { 'اسم المعلم': 'معلم بلا مشرف', 'المدرسة': 'مدرسة ٤', 'نوع المدرسة': 'حكومية' },
    // «منفصل/منفصلة» أُضيفتا إلى الاستمارة (2026-09-17) — ومعهما عدد الأبناء
    { 'اسم المعلم': 'معلّمة منفصلة', 'المدرسة': 'مدرسة ٥', 'نوع المدرسة': 'حكومية', 'الحالة الاجتماعية': 'منفصلة +2' },
    { 'اسم المعلم': 'معلّم منفصل', 'المدرسة': 'مدرسة ٥', 'نوع المدرسة': 'حكومية', 'الحالة الاجتماعية': 'منفصل' }
];
const SUP_A_COUNT = TEACHERS.filter(t => t['المشرف'] === 'المشرف أ').length;

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
        check('link: يسحب معلّمي صاحبه وحدهم', teachers.length === SUP_A_COUNT && teachers.every(t => t.supervisor === 'المشرف أ'),
              teachers.map(t => t.name).join(','));
        const all = JSON.stringify(e.data);
        check('link: الرمز لا يُخزَّن نصّاً', !all.includes('code-a'), 'وُجد الرمز في التخزين');
        check('link: الرقم المدني والهاتف والبريد لا تُنسخ إلى المتصفّح',
              !all.includes('11112222') && !all.includes('99990000') && !all.includes('x@y.om'), 'نُسخت');
        const hashim = e.api.getTeachers().find(t => /الهاشمي/.test(t.name));
        check('link: عدد الحصص يُحفظ نصّاً', hashim.load === '18', hashim.load);
        check('link: الحالة الاجتماعيّة نفسها لا تُنسخ', !all.includes('متزوج'), 'نُسخت');
        check('fields: الجنس يُشتقّ من الحالة الاجتماعيّة',
              hashim.gender === 'm'
              && e.api.getTeachers().find(t => /الحارثية/.test(t.name)).gender === 'f'
              && e.api.getTeachers().find(t => /الكندي/.test(t.name)).gender === 'm'
              && e.api.getTeachers().find(t => /الرواحية/.test(t.name)).gender === 'f',
              JSON.stringify(e.api.getTeachers().map(t => t.gender)));
        check('fields: الصفوف تُقرأ من مفتاحَي الحكوميّ والخاصّ معاً',
              hashim.grades === '9-12' && e.api.getTeachers().find(t => /الكندي/.test(t.name)).grades === '5، 7، 9',
              JSON.stringify(e.api.getTeachers().map(t => t.grades)));
        check('fields: رقم الملف واسم المدير يُنقلان',
              hashim.fileNumber === '7788' && hashim.principal === 'سعيد المعمري',
              hashim.fileNumber + ' | ' + hashim.principal);
        check('grades: «1،2،3» تصير نطاقاً و«5» تبقى مفردة',
              e.api.tidyGrades('1،2،3') === '1-3' && e.api.tidyGrades('5') === '5'
              && e.api.tidyGrades('5-12') === '5-12' && e.api.tidyGrades('') === '',
              e.api.tidyGrades('1،2،3'));

        // حفظ الرمز: تحميلٌ جديدٌ للصفحة بالتخزين نفسه يعرف المشرف بلا رمز
        const reopened = env(e.data);
        reopened.use({});
        check('remember: بعد إعادة فتح الموقع يبقى الربط', reopened.api.getIdentity()?.name === 'المشرف أ');
        const r = await reopened.api.refresh(false);
        check('remember: نسخةٌ حديثةٌ لا تتّصل بالقاعدة عند الفتح', r.linked && reopened.loads() === 0,
              JSON.stringify(r) + ' loads=' + reopened.loads());

        // نسخةٌ سُحبت ببنيةٍ أقدم (حقولٌ أُضيفت بعدها) تُحدَّث ولو كانت حديثةَ الوقت —
        // وإلّا عُبِّئت النماذج ناقصةً بلا خطأ، كما غاب رقم الملف بعد إضافته
        const stale = env(e.data);
        stale.use({});
        const key = 'svf_teachers_cache_a';
        const old = JSON.parse(stale.data[key]);
        delete old.v;
        old.at = Date.now();
        old.teachers = old.teachers.map(t => ({ name: t.name, school: t.school }));   // بلا رقم ملفٍ ولا جنس
        stale.data[key] = JSON.stringify(old);
        const r2 = await stale.api.refresh(false);
        check('schema: نسخةٌ ببنيةٍ أقدم تُسحب من جديد ولو كانت حديثة',
              r2.refreshed === true && stale.loads() > 0, JSON.stringify(r2) + ' loads=' + stale.loads());
        check('schema: الحقول الناقصة عادت بعد التحديث',
              !!stale.api.getTeachers().find(t => /الهاشمي/.test(t.name))?.fileNumber,
              JSON.stringify(stale.api.getTeachers()[0]));
        check('schema: النسخة الجديدة تحمل رقم البنية',
              JSON.parse(stale.data[key]).v > 0, stale.data[key].slice(0, 60));
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
        check('admin: رمز المشرف العام يسحب الجميع بلا تصفية', res.identity.admin && q && !q.w && res.teachers.length === TEACHERS.length);
        const g = n => (res.teachers.find(t => t.name === n) || {}).gender;
        check('fields: «منفصلة» أنثى و«منفصل» ذكر — ولو حمل عدد الأبناء',
              g('معلّمة منفصلة') === 'f' && g('معلّم منفصل') === 'm', g('معلّمة منفصلة') + ' / ' + g('معلّم منفصل'));
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
        check('offline: تعذُّر الاتّصال لا يُلغي الربط', r2.linked && r2.offline && off.api.getTeachers().length === SUP_A_COUNT,
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

    /* ── ٥) البحث في القائمة: مطابقةٌ بلا تخمين ── */
    {
        const e = env();
        e.use({});
        await e.api.link('code-a');
        const api = e.api;

        check('find: الاسم بلا «بن» يطابق المكتوب بها',
              api.findTeacher('هاشم راشد سيف الهاشمي').teacher?.fileNumber === '7788',
              JSON.stringify(api.findTeacher('هاشم راشد سيف الهاشمي').matches.map(t => t.name)));
        check('find: الاسم كما في القاعدة يطابق أيضاً',
              api.findTeacher('هاشم بن راشد بن سيف الهاشمي').teacher?.fileNumber === '7788');
        check('find: جزءٌ فريدٌ من الاسم يكفي', api.findTeacher('الهاشمي').teacher?.fileNumber === '7788');
        const amb = api.findTeacher('سالم');
        check('find: الملتبس لا يُختار عنه بل يُعرض', !amb.teacher && amb.matches.length > 1,
              JSON.stringify(amb.matches.map(t => t.name)));
        check('find: ما ليس في القائمة لا يُطابَق', api.findTeacher('زائر غريب').matches.length === 0);

        check('school: المدرسة تُطابَق باختلاف الهمزة',
              api.teachersOfSchool('مدرسة الامام').length === 2 && api.teachersOfSchool('مدرسة الإمام').length === 2,
              api.teachersOfSchool('مدرسة الامام').length + '');
        check('school: أسماء المدارس بلا تكرارٍ بعد التسوية', api.schoolNames().length === 2,
              api.schoolNames().join(' | '));
        check('school: أسماء المعلمين كلّها معروضة', api.teacherNames().length === SUP_A_COUNT);

        const agree = api.principalOfSchool('مدرسة الإمام');
        check('principal: يُقبل حين تتّفق سجلّات المدرسة',
              agree.name === 'سعيد المعمري' && !agree.conflict, JSON.stringify(agree));
        const clash = api.principalOfSchool('مدرسة الوادي الخاصة');
        check('principal: يُترك حين تختلف، ويُبلَّغ الاختلاف',
              clash.name === '' && clash.conflict === true, JSON.stringify(clash));
    }

    /* ── ٦) الإكمال التلقائيّ في النماذج ── */
    {
        const AUTOFILL = fs.readFileSync(path.join(ROOT, 'js/autofill.js'), 'utf8').replace(/\r\n/g, '\n');

        // DOM مصغّر: ما تمسّه autofill.js وحده
        function makeDom() {
            const els = {};
            const mk = (id, cls) => (els[id] = {
                id, value: '', checked: false, innerHTML: '', children: [], attrs: {}, listeners: {},
                _cls: new Set((cls || '').split(' ').filter(Boolean)),
                setAttribute(k, v) { this.attrs[k] = v; },
                removeAttribute(k) { delete this.attrs[k]; },
                getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
                appendChild(c) { this.children.push(c); return c; },
                addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
                dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
                classList: {
                    _o: null,
                    contains(c) { return this._o._cls.has(c); },
                    toggle(c, on) { on ? this._o._cls.add(c) : this._o._cls.delete(c); },
                    add(c) { this._o._cls.add(c); },
                    remove(c) { this._o._cls.delete(c); }
                }
            });
            ['teacherName', 'school', 'fileNumber', 'genderMale', 'genderFemale', 'schoolName',
             'schoolPrincipal', 'stName', 'stLoad', 'stGrades', 'stGender', 'cvTeacher',
             'visitTypeSelect'].forEach(id => mk(id));
            mk('teachersRosterCard', 'hidden');
            mk('pullRosterBtn', 'hidden');
            Object.values(els).forEach(el => { el.classList._o = el; });
            const docListeners = {};
            const document = {
                getElementById: id => els[id] || null,
                createElement: tag => { const o = mk('__' + tag + Math.random()); o.tag = tag; return o; },
                body: { appendChild(c) { els[c.id] = c; return c; } },
                addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
                dispatchEvent(ev) { (docListeners[ev.type] || []).forEach(fn => fn(ev)); return true; }
            };
            return { els, document, mk };
        }

        function autofillEnv() {
            const dom = makeDom();
            const toasts = [];
            const store = {};
            const ctx = {
                document: dom.document,
                crypto: globalThis.crypto, TextEncoder, console,
                Event: class { constructor(t) { this.type = t; } },
                CustomEvent: class { constructor(t) { this.type = t; } },
                setTimeout: () => {},          // الرسائل المؤجَّلة لا تُنتظر في الاختبار
                localStorage: {
                    getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); },
                    removeItem: k => { delete store[k]; },
                    key: i => Object.keys(store)[i] ?? null,
                    get length() { return Object.keys(store).length; }
                },
                schoolTeachers: [],
                showToast: (m, t) => toasts.push((t === 'error' ? '! ' : '') + m),
                renderSchoolTeachers: () => {},
                saveSchoolRoster: () => { ctx.saved = (ctx.saved || 0) + 1; }
            };
            ctx.window = ctx;
            vm.createContext(ctx);
            vm.runInContext(testSrc, ctx);
            vm.runInContext(AUTOFILL, ctx);
            const api = ctx.SupervisorIdentity;
            api.loadSdk = async () => fakeSdk({}).sdk;
            return { ctx, dom, toasts, api, run: fn => vm.runInContext(fn, ctx) };
        }

        // بلا ربط: لا اقتراحات ولا زرّ استدعاء
        {
            const t = autofillEnv();
            t.run('initAutofillBindings()');
            check('autofill: بلا ربطٍ لا تُربط قوائم الاقتراح',
                  !t.dom.els.teacherName.getAttribute('list') && !t.dom.els.schoolName.getAttribute('list'));
            check('autofill: بلا ربطٍ يبقى زرّ الاستدعاء مخفيّاً',
                  t.dom.els.pullRosterBtn.classList.contains('hidden'));
        }

        // بالربط: القوائم تُبنى، والحدث يُعيد بناءها
        {
            const t = autofillEnv();
            t.run('initAutofillBindings()');
            await t.api.link('code-a');
            check('autofill: الربط يُنشئ قوائم الاقتراح فوراً (بحدث التغيّر)',
                  t.dom.els.teacherName.getAttribute('list') === 'svfTeacherNames'
                  && t.dom.els.schoolName.getAttribute('list') === 'svfSchoolNames',
                  JSON.stringify(t.dom.els.teacherName.attrs));
            const dl = t.dom.els.svfTeacherNames;
            check('autofill: القائمة تحمل أسماء معلّمي المشرف',
                  dl && dl.children.length === SUP_A_COUNT, dl ? dl.children.length : 'لا قائمة');
            check('autofill: زرّ الاستدعاء يظهر بالربط', !t.dom.els.pullRosterBtn.classList.contains('hidden'));

            // اسم المعلّم يجرّ مدرسته ورقم ملفّه وجنسه
            t.dom.els.teacherName.value = 'هاشم راشد سيف الهاشمي';
            t.run('svfApplyTeacherFromDb()');
            check('autofill: الاسم يُوحَّد على تهجئة القاعدة',
                  t.dom.els.teacherName.value === 'هاشم بن راشد بن سيف الهاشمي', t.dom.els.teacherName.value);
            check('autofill: المدرسة ورقم الملف يُعبَّآن',
                  t.dom.els.school.value === 'مدرسة الإمام' && t.dom.els.fileNumber.value === '7788',
                  t.dom.els.school.value + ' | ' + t.dom.els.fileNumber.value);
            check('autofill: الجنس يُضبط من القاعدة', t.dom.els.genderMale.checked === true);

            // ما كتبه المستخدم لا يُطمس
            const t2 = autofillEnv();
            t2.run('initAutofillBindings()');
            await t2.api.link('code-a');
            t2.dom.els.school.value = 'مدرسة كتبتها بيدي';
            t2.dom.els.teacherName.value = 'الهاشمي';
            t2.run('svfApplyTeacherFromDb()');
            check('autofill: لا يُطمس ما كتبه المستخدم', t2.dom.els.school.value === 'مدرسة كتبتها بيدي');

            // الملتبس يُبلَّغ ولا يُعبَّأ
            const t3 = autofillEnv();
            t3.run('initAutofillBindings()');
            await t3.api.link('code-a');
            t3.dom.els.teacherName.value = 'سالم';
            t3.run('svfApplyTeacherFromDb()');
            check('autofill: الاسم الملتبس يُبلَّغ ولا يُعبَّأ',
                  t3.dom.els.school.value === '' && t3.toasts.some(m => m.startsWith('!')),
                  t3.toasts.join(' / '));
        }

        // الطاقم: معلّمو المدرسة وأنصبتهم، والمدير حين تتّفق سجلّاته
        {
            const t = autofillEnv();
            t.run('initAutofillBindings()');
            await t.api.link('code-a');
            t.dom.els.schoolName.value = 'مدرسة الامام';
            const added = t.run('svfPullRoster(false)');
            check('roster: معلّمو المدرسة يُدرجون', added === 2 && t.ctx.schoolTeachers.length === 2,
                  JSON.stringify(t.ctx.schoolTeachers.map(x => x.name)));
            const m = t.ctx.schoolTeachers.find(x => /الهاشمي/.test(x.name));
            check('roster: النصاب والصفوف والجنس تُنقل',
                  m.load === '18' && m.grades === '9-12' && m.gender === 'm', JSON.stringify(m));
            check('roster: اسم المدير يُعبَّأ عند اتّفاق السجلّات',
                  t.dom.els.schoolPrincipal.value === 'سعيد المعمري', t.dom.els.schoolPrincipal.value);
            check('roster: الطاقم يُحفظ بعد الاستدعاء', t.ctx.saved > 0);

            const again = t.run('svfPullRoster(false)');
            check('roster: الاستدعاء مرّتين لا يُكرّر المعلّمين',
                  again === 0 && t.ctx.schoolTeachers.length === 2, t.ctx.schoolTeachers.length + '');

            const t2 = autofillEnv();
            t2.run('initAutofillBindings()');
            await t2.api.link('code-a');
            t2.dom.els.schoolName.value = 'مدرسة الوادي الخاصة';
            t2.run('svfPullRoster(false)');
            check('roster: اسم المدير المختلف بين السجلّات لا يُخمَّن',
                  t2.dom.els.schoolPrincipal.value === '', t2.dom.els.schoolPrincipal.value);

            const t3 = autofillEnv();
            t3.run('initAutofillBindings()');
            await t3.api.link('code-a');
            t3.dom.els.schoolName.value = 'مدرسة لا وجود لها';
            t3.run('svfPullRoster(false)');
            check('roster: مدرسةٌ بلا سجلّات تُبلَّغ ولا تُضيف شيئاً',
                  t3.ctx.schoolTeachers.length === 0 && t3.toasts.some(m => m.startsWith('!')), t3.toasts.join(' / '));

            // الاستدعاء التلقائيّ: بطاقةٌ مخفيّة أو طاقمٌ قائم ← لا شيء
            const t4 = autofillEnv();
            t4.run('initAutofillBindings()');
            await t4.api.link('code-a');
            t4.dom.els.schoolName.value = 'مدرسة الامام';
            t4.run('svfAutoPullRoster()');
            check('roster: لا استدعاء تلقائيّ والبطاقة مخفيّة', t4.ctx.schoolTeachers.length === 0);
            t4.dom.els.teachersRosterCard.classList.remove('hidden');
            t4.run('svfAutoPullRoster()');
            check('roster: يُستدعى تلقائياً بإظهار البطاقة', t4.ctx.schoolTeachers.length === 2);
            t4.run('schoolTeachers = [{ name: "مكتوبٌ بيدي" }]; svfAutoPullRoster()');
            check('roster: لا يُضاف فوق طاقمٍ قائم',
                  t4.ctx.schoolTeachers.length === 1, JSON.stringify(t4.ctx.schoolTeachers.map(x => x.name)));

            // صفّ الإضافة: اختيار الاسم يجرّ نصابه وصفوفه
            const t5 = autofillEnv();
            t5.run('initAutofillBindings()');
            await t5.api.link('code-a');
            t5.dom.els.schoolName.value = 'مدرسة الامام';
            t5.dom.els.stName.value = 'مريم سالم الحارثية';
            t5.run('svfApplyRosterTeacher()');
            check('roster: صفّ الإضافة يُعبَّأ من القاعدة',
                  t5.dom.els.stLoad.value === '20' && t5.dom.els.stGrades.value === '1-3'
                  && t5.dom.els.stGender.value === 'f',
                  t5.dom.els.stLoad.value + ' | ' + t5.dom.els.stGrades.value + ' | ' + t5.dom.els.stGender.value);
        }
    }

    /* ── ٧) التوصيل والقائمة الحقيقيّة ── */
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
        check('wiring: عامل الخدمة يخزّن autofill.js', sw.includes("'./js/autofill.js'"));
        check('wiring: autofill.js بعد school.js وقبل init.js',
              html.indexOf('js/autofill.js') > html.indexOf('js/school.js')
              && html.indexOf('js/autofill.js') < html.indexOf('js/init.js'));
        check('wiring: زرّ استدعاء الطاقم في بطاقة الطاقم', html.includes('id="pullRosterBtn"'));
        check('wiring: init.js يستدعي initAutofillBindings',
              /initAutofillBindings\(\)/.test(fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8')));

        // النسخة السحابيّة
        check('wiring: cloud.js بعد identity.js وقبل init.js',
              html.indexOf('js/cloud.js') > html.indexOf('js/identity.js')
              && html.indexOf('js/cloud.js') < html.indexOf('js/init.js'));
        check('wiring: بطاقة السحابة في الصفحة الرئيسيّة', html.includes('id="cloudCard"'));
        check('wiring: init.js يستدعي SupervisorCloud.initCard',
              /SupervisorCloud\.initCard\(\)/.test(fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8')));
        check('wiring: عامل الخدمة يخزّن cloud.js', sw.includes("'./js/cloud.js'"));

        // معاينةُ النموذج ترجع إليه كما هو: إعادةُ تحميله تمحو ما لم يُحفظ —
        // رأيَ الزائر المولَّد والطاقمَ وأوقات الوصول (حمولة المعاينة لا تحملها)
        const initSrc = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
        const schoolSrc = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
        check('preview: زرّ المعاينة يُعلم أنّ المصدر هو النموذج',
              /generateSchoolPreview\(tempReport,\s*true\)/.test(initSrc));
        check('preview: الرجوع من معاينة النموذج لا يُعيد تحميله',
              /function generateSchoolPreview\(report, fromForm\)/.test(schoolSrc)
              && /if \(fromForm\) \{ showSchoolForm\(\); return; \}/.test(schoolSrc));
        check('preview: الرجوع من معاينة السجلّ ما زال يُحمّل التقرير',
              /editSchoolReport\(report\.id\)/.test(schoolSrc));

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
