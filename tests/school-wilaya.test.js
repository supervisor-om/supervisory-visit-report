// اختبار: node tests/school-wilaya.test.js
// v17.6 — بلاغ المشرف: «مدارس لا يجدها السكربت … مدرسة حسان بن ثابت في بوشر، فيجب أن يعرف السكربت المدرسة في أيّ
// ولاية — وهذا مسجّلٌ في قاعدة بيانات المعلمين». قائمة المدارس في البوّابة مقصورةٌ على الولاية المختارة.
//   ١) الموقع: ولاية المدرسة من سجلّات معلّميها (identity.wilayaOfSchool) ← حمولة الطابور والتصدير المفرد،
//      وسكربت الموقع (doExport) يقرؤها من نسخة القاعدة نفسها.
//   ٢) البوّابة (محاكاة): قائمة الولايات تُعرف بخياراتها، والمعروفة تُختار قبل المطابقة، والبحث ولايةً × نظاماً،
//      ويُستأنف بعد إعادة تحميل الصفحة بلا رجوعٍ إلى ولايةٍ جُرّبت، ويُذكر سبب التخطّي.
//   ٣) الدليل والمسح بالولاية.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const PENDING = [];

/* ── ١) الموقع ── */
const HASH = 'a'.repeat(64);
function siteCtx(teachers) {
    const store = {
        svf_identity: JSON.stringify({ id: 'asad', hash: HASH, linkedAt: 1 }),
        svf_teachers_cache_asad: JSON.stringify({ id: 'asad', v: 2, at: Date.now(), teachers })
    };
    const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    const ctx = { localStorage, console, document: { addEventListener() {}, dispatchEvent() {}, getElementById: () => null }, CustomEvent: function () {} };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/identity.js'), ctx);
    return ctx;
}
const T = [
    { name: 'أ', school: 'حسان بن ثابت (5-10)', wilaya: 'بوشر' },
    { name: 'ب', school: 'حسان بن ثابت (5-10)', wilaya: 'بوشر' },
    { name: 'ج', school: 'حسان بن ثابت (5-10)', wilaya: 'السيب' },     // سجلٌّ خاطئ — الأغلب يغلب
    { name: 'د', school: 'الموالح الشمالية (1-4)', wilaya: 'السيب' },
    { name: 'هـ', school: 'النهضة (5-8)', wilaya: '' },
    { name: 'و', school: 'زهور الخليج الخاصة', wilaya: ' بوشر ' }
];
{
    const ctx = siteCtx(T);
    const I = ctx.SupervisorIdentity;
    check('site: wilayaOfSchool — الأغلب بين سجلّات المدرسة', I.wilayaOfSchool('حسان بن ثابت (5-10)') === 'بوشر');
    check('site: وبكلمات الاسم («مدرسة حسان بن ثابت»)', I.wilayaOfSchool('مدرسة حسان بن ثابت') === 'بوشر');
    check('site: والمسافات تُقصّ', I.wilayaOfSchool('زهور الخليج الخاصة') === 'بوشر');
    check('site: بلا ولايةٍ في السجلّ ← فارغ', I.wilayaOfSchool('النهضة (5-8)') === '');
    check('site: مدرسةٌ ليست في القاعدة ← فارغ', I.wilayaOfSchool('مدرسة لا وجود لها') === '');

    // حمولة الطابور
    const qe = read('js/queue-export.js');
    check('site: schoolToPortal يرسل الولاية', /school:\s+d\.schoolName \|\| d\.school \|\| '',\s*\n\s*wilaya:\s+svfSchoolWilaya\(d\.schoolName \|\| d\.school \|\| ''\)/.test(qe));
    check('site: svfSchoolWilaya يمرّ بـ SupervisorIdentity.wilayaOfSchool', /function svfSchoolWilaya\(school\)[\s\S]{0,300}SupervisorIdentity\.wilayaOfSchool\(school\)/.test(qe)
          && /window\.svfSchoolWilaya = svfSchoolWilaya;/.test(qe));
    check('site: التصدير المفرد يرسلها', /wilaya:\s+\(typeof window\.svfSchoolWilaya === 'function'/.test(read('js/export.js')));
}

/* ── سكربت الرفع ── */
const SCRIPT = require('./_script-src.js');
const SRC = SCRIPT && fs.existsSync(SCRIPT) ? fs.readFileSync(SCRIPT, 'utf8').replace(/\r\n/g, '\n') : null;
if (!SRC) {
    console.log('SKIP مصدر السكربت غير موجود (svf-userscript) — اختبارات البوّابة تُتخطّى');
    finish();
    return;
}
const between = (a, b) => {
    const i = SRC.indexOf(a), j = SRC.indexOf(b, i);
    if (i < 0 || j < 0) throw new Error('marker not found: ' + a + ' / ' + b);
    return SRC.slice(i, j);
};

// سكربت الموقع: svfSiteWilaya من نسخة القاعدة في localStorage
{
    const store = {
        svf_identity: JSON.stringify({ id: 'asad', hash: HASH }),
        svf_teachers_cache_asad: JSON.stringify({ id: 'asad', teachers: T })
    };
    const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null) }, JSON };
    vm.createContext(ctx);
    vm.runInContext(between('        function svfSiteWilaya(school) {', '        function doExport() {') + '\nthis.f = svfSiteWilaya;', ctx);
    check('script(site): svfSiteWilaya — الأغلب', ctx.f('حسان بن ثابت (5-10)') === 'بوشر');
    check('script(site): وبكلمات الاسم', ctx.f('مدرسة حسان بن ثابت') === 'بوشر');
    check('script(site): وبالاحتواء', ctx.f('الموالح الشمالية') === 'السيب');
    check('script(site): ليست في القاعدة ← فارغ', ctx.f('مدرسة أخرى') === '');
    store.svf_teachers_cache_asad = JSON.stringify({ id: 'hind', teachers: T });
    check('script(site): نسخة مشرفٍ آخر لا تُقرأ', ctx.f('حسان بن ثابت (5-10)') === '');
    delete store.svf_identity;
    check('script(site): بلا ربط ← فارغ', ctx.f('حسان بن ثابت (5-10)') === '');
    check('script(site): doExport يرسلها ونافذة التأكيد تعرضها',
          /wilaya:\s+svfSiteWilaya\(schoolName\),/.test(SRC) && /'<tr><td style="padding:5px 8px;color:#6b7280">الولاية<\/td>'/.test(SRC));
}

// ─── بوّابةٌ محاكاة: قوائم الولاية والنظام والمدارس، و«change» يُعيد ملء المدارس كما يفعل postback ───
const CODE = between('function normEdu(v)', '// ═══ دليل مدارس البوّابة الموحّد (v16.7) ═══')
    + between('// ═══ دليل مدارس البوّابة الموحّد (v16.7) ═══', '// ═══ مسح مدارس البوّابة (v16.7) ═══')
    + between('// ═══ مسح مدارس البوّابة (v16.7) ═══', '// للتوافق مع ما يستدعيها')
    + between('        function selectSchoolOption', '        function findShowButton')
    + between('        function schoolSkipReason', '        // ─── أنماط لوحة التحكم ───');

function makeSelect(id, texts, onChange) {
    const s = {
        tagName: 'SELECT', id, options: [], selectedIndex: 0,
        get value() { const o = this.options[this.selectedIndex]; return o ? o.value : ''; },
        set value(v) { const i = this.options.findIndex(o => o.value === v); if (i >= 0) this.selectedIndex = i; },
        dispatchEvent(e) { if (e && e.type === 'change' && onChange) onChange(this); return true; }
    };
    s.setTexts = list => {
        s.options = [{ text: '-- اختر --', value: '-1' }].concat(list.map((t, i) => ({ text: t, value: id.slice(-3) + i })));
        s.selectedIndex = 0;
    };
    s.setTexts(texts);
    s.pick = t => { const i = s.options.findIndex(o => o.text === t); if (i >= 0) s.selectedIndex = i; };
    return s;
}

function portal({ wilayat, systems, data, curWil, curSys, resetEduOnWil, noWil, extra, preState, gm }) {
    const logs = [], ss = {}, G = Object.assign({}, gm || {});
    if (preState) ss.svf_edu_search = JSON.stringify(preState);
    const switches = [];
    let wil = null;
    const edu = makeSelect('ctl00_content_SchoolFilterCtrl1_ddlEduSystem', systems, () => { switches.push('sys:' + selText(edu)); fill(); });
    const school = makeSelect('ctl00_content_SchoolFilterCtrl1_ddlSchools', []);
    const selText = s => (s.options[s.selectedIndex] || {}).text || '';
    function fill() {
        const w = wil ? selText(wil) : '*', sy = selText(edu);
        school.setTexts(((data[w] || {})[sy]) || []);
    }
    if (!noWil) {
        wil = makeSelect('ctl00_content_SchoolFilterCtrl1_ddlArea', wilayat, () => {
            switches.push('wil:' + selText(wil));
            if (resetEduOnWil) edu.selectedIndex = 0;
            fill();
        });
        wil.pick(curWil);
    }
    edu.pick(curSys);
    fill();
    const selects = [wil, edu, school].concat(extra || []).filter(Boolean);
    const matches = (el, sel) => {
        const m = sel.match(/^(\w+)?((?:\[id\*="[^"]+"\])*)$/);
        if (!m) return false;
        if (m[1] && el.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
        return (m[2].match(/\[id\*="([^"]+)"\]/g) || []).every(c => el.id.includes(c.slice(7, -2)));
    };
    const document = {
        getElementById: id => selects.find(s => s.id === id) || null,
        querySelector: sel => selects.find(s => matches(s, sel)) || null,
        querySelectorAll: sel => selects.filter(s => matches(s, sel))
    };
    let clock = 1e9;
    class FakeDate extends Date { static now() { return clock; } }
    const ctx = {
        document, Date: FakeDate, JSON, Array, Set, Object, String, Number, Math, RegExp, Promise,
        $: sel => document.querySelector(sel), $$: sel => document.querySelectorAll(sel),
        Event: function (type) { this.type = type; },
        wait: async ms => { clock += ms; },
        log: (m, t) => logs.push(m), updateStep() {},
        sessionStorage: { getItem: k => (k in ss ? ss[k] : null), setItem: (k, v) => { ss[k] = v; }, removeItem: k => { delete ss[k]; } },
        GM_getValue: (k, d) => (k in G ? G[k] : d), GM_setValue: (k, v) => { G[k] = v; }
    };
    vm.createContext(ctx);
    vm.runInContext(CODE + '\nthis.find = findAndSelectSchool; this.lookup = schoolDirLookup; this.reason = schoolSkipReason;'
        + ' this.looks = looksLikeWilayaDropdown; this.findWil = findWilayaDropdown; this.setMap = m => { schoolMap = m; };'
        + ' this.scan = runSchoolScan;', ctx);
    return { ctx, logs, ss, G, switches, wil, edu, school, selText, downloads: [] };
}

const WIL = ['مسقط', 'مطرح', 'بوشر', 'السيب', 'العامرات', 'قريات'];
const SYS = ['عام', 'أساسي', 'دولي', 'ثنائي اللغة', 'ثنائي اللغة خاص'];
const DATA = {
    'السيب':   { 'عام': ['الموالح الشمالية للتعليم الأساسي (1-4)', 'النهضة للتعليم الأساسي'], 'أساسي': ['الخوض (5-10)'] },
    'بوشر':    { 'عام': ['النهضة للتعليم الأساسي', 'العذيبة (1-4)'], 'أساسي': ['حسان بن ثابت للتعليم الأساسي (5-10)'] },
    'العامرات': { 'دولي': ['الأفق الدولية الخاصة'] },
    'مطرح':    { 'عام': ['السلام (1-4)'] }
};

(async () => {
    // (أ) الولاية المعروفة من قاعدة المعلّمين: من السيب إلى بوشر ثمّ النظام
    let P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام' });
    let r = await P.ctx.find({ school: 'مدرسة حسان بن ثابت للتعليم الأساسي (5-10)', wilaya: 'بوشر' });
    check('portal: «حسان بن ثابت» في بوشر تُوجد والولاية المختارة السيب', r.found && P.selText(P.school) === 'حسان بن ثابت للتعليم الأساسي (5-10)', JSON.stringify(r) + ' ' + P.logs.join(' | '));
    check('portal: الولاية تُحوَّل أوّلاً (ثمّ النظام)', P.switches[0] === 'wil:بوشر' && P.selText(P.wil) === 'بوشر' && P.selText(P.edu) === 'أساسي', P.switches.join(','));
    check('portal: والسجلّ يذكر الولاية ومصدرها', P.logs.some(m => /ولاية «.*»: بوشر — من قاعدة بيانات المعلمين/.test(m)));
    check('portal: والولاية والنظام يُحفظان للمرّة القادمة',
          JSON.parse(P.G.svf_school_wil_map || '{}')[P.ctx.normEdu('مدرسة حسان بن ثابت للتعليم الأساسي (5-10)')] === 'بوشر'
          && /أساسي/.test(P.G.svf_school_edu_map || ''));
    check('portal: والنتيجة تحمل ولايتها', r.wilaya === 'بوشر' && r.system === 'أساسي');

    // (ب) الاسم نفسه في ولايتين: لا يُطابَق في القائمة الحاليّة (السيب) والولاية المعروفة بوشر
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام' });
    r = await P.ctx.find({ school: 'النهضة للتعليم الأساسي', wilaya: 'بوشر' });
    check('portal: «النهضة» في السيب وبوشر — تُختار مدرسة بوشر لا الحاليّة', r.found && P.selText(P.wil) === 'بوشر' && P.selText(P.school) === 'النهضة للتعليم الأساسي' && P.switches[0] === 'wil:بوشر', P.switches.join(','));

    // (ج) ولايةٌ مجهولة: من الحاليّة ثمّ بقيّة الولايات والأنظمة؛ ثمّ تُذكر فتُفتح مباشرةً
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام' });
    r = await P.ctx.find({ school: 'الأفق الدولية الخاصة' });
    check('portal: ولايةٌ مجهولة — يجدها في العامرات · دولي', r.found && P.selText(P.wil) === 'العامرات' && P.selText(P.edu) === 'دولي', P.logs.slice(-6).join(' | '));
    check('portal: ويقول إنّه لا يعرف ولايتها', P.logs.some(m => /لا أعرف ولاية/.test(m)));
    check('portal: والحاليّة (السيب) قبل غيرها', P.switches.indexOf('wil:مسقط') > P.switches.findIndex(x => x.startsWith('sys:')));
    const G2 = P.G;
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام', gm: G2 });
    r = await P.ctx.find({ school: 'الأفق الدولية الخاصة' });
    check('portal: المرّة الثانية من الذاكرة — ولايةٌ واحدةٌ ونظامٌ واحد', r.found && P.switches.join(',') === 'wil:العامرات,sys:دولي', P.switches.join(','));
    check('portal: ومصدرها «وُجدت فيها من قبل» ولو خالفت القاعدة', (await (async () => {
        const Q = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام', gm: G2 });
        const x = await Q.ctx.find({ school: 'الأفق الدولية الخاصة', wilaya: 'بوشر' });
        return x.found && Q.switches[0] === 'wil:العامرات' && Q.logs.some(m => /من وُجدت فيها من قبل/.test(m));
    })()));

    // (د) ليست في أيّ ولاية: سببٌ يذكر الولاية
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام' });
    r = await P.ctx.find({ school: 'مدرسة غير موجودة', wilaya: 'بوشر' });
    check('portal: ليست في أيّ ولاية ← خطأ «كل الولايات»', !r.found && /كل الولايات وأنظمة التعليم/.test(r.error) && r.wilaya === 'بوشر');
    check('portal: جُرّبت الولايات الستّ', WIL.every(w => P.switches.includes('wil:' + w) || w === 'السيب'), P.switches.filter(x => x.startsWith('wil:')).join(','));
    check('portal: وحالة البحث تُمحى', !('svf_edu_search' in P.ss));
    const reason = P.ctx.reason(r.error, { school: 'مدرسة غير موجودة', wilaya: 'بوشر' });
    check('portal: سبب التخطّي يذكر ولاية القاعدة', /بدأتُ بولاية «بوشر» \(من قاعدة المعلمين\) ثمّ بقيّة الولايات/.test(reason), reason);
    check('portal: وبلا ولايةٍ معروفة', /بحثتُ في كلّ الولايات/.test(P.ctx.reason(r.error, { school: 'س' })));
    check('portal: والسبب القديم (بلا قائمة ولايات) كما كان', /في أيّ نظام تعليم/.test(P.ctx.reason('المدرسة غير موجودة في كل أنظمة التعليم', { school: 'س' })));

    // (هـ) إعادة تحميل الصفحة بعد تبديل الولاية: لا رجوع إلى ولايةٍ انتهت
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'مطرح', curSys: 'عام',
                 preState: { school: 'الافق الدوليه الخاصه', tried: SYS.map(s => 'بوشر|' + s.replace('أ', 'ا')), doneWil: ['بوشر'] } });
    r = await P.ctx.find({ school: 'الأفق الدولية الخاصة', wilaya: 'بوشر' });
    check('portal: الاستئناف لا يعود إلى بوشر (انتهت) ويكمل حتّى العامرات', r.found && !P.switches.includes('wil:بوشر') && P.selText(P.wil) === 'العامرات', P.switches.join(','));
    check('portal: ويبدأ بالحاليّة (مطرح) بلا تبديل', P.switches[0] !== 'wil:مطرح' && P.switches[0].startsWith('sys:'));

    // (و) تبديل الولاية يعيد النظام إلى «اختر»
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام', resetEduOnWil: true });
    r = await P.ctx.find({ school: 'العذيبة (1-4)', wilaya: 'بوشر' });
    check('portal: والنظام يُعاد إلى «اختر» بعد الولاية — يجدها في بوشر · عام', r.found && P.selText(P.wil) === 'بوشر' && P.selText(P.edu) === 'عام', P.switches.join(','));

    // (ز) «ولاية بوشر» في خيارات البوّابة
    const WIL2 = WIL.map(w => 'ولاية ' + w);
    const DATA2 = {}; Object.keys(DATA).forEach(k => { DATA2['ولاية ' + k] = DATA[k]; });
    P = portal({ wilayat: WIL2, systems: SYS, data: DATA2, curWil: 'ولاية السيب', curSys: 'عام' });
    r = await P.ctx.find({ school: 'حسان بن ثابت (5-10)', wilaya: 'بوشر' });
    check('portal: «ولاية بوشر» = «بوشر»', r.found && P.selText(P.wil) === 'ولاية بوشر');

    // (ح) بلا قائمة ولايات: كما كان (الأنظمة وحدها) وتُسرد القوائم إن لم تُوجد
    const DATA3 = { '*': { 'عام': ['السلام (1-4)'], 'دولي': ['الأفق الدولية الخاصة'] } };
    P = portal({ noWil: true, systems: SYS, data: DATA3, curSys: 'عام' });
    r = await P.ctx.find({ school: 'الأفق الدولية الخاصة', wilaya: 'بوشر' });
    check('portal: بلا قائمة ولايات — بالأنظمة كما كان', r.found && P.selText(P.edu) === 'دولي' && !P.logs.some(m => /📍/.test(m)));
    P = portal({ noWil: true, systems: SYS, data: DATA3, curSys: 'عام' });
    r = await P.ctx.find({ school: 'مدرسة غير موجودة' });
    check('portal: والخطأ القديم «كل أنظمة التعليم»', !r.found && r.error === 'المدرسة غير موجودة في كل أنظمة التعليم' && r.noWilDD === true);
    check('portal: وتُسرد قوائم الصفحة بمعرّفاتها (ليُعرف أين الولاية)', P.logs.some(m => /قوائم الصفحة \(لم أجد قائمة الولايات\)/.test(m))
          && P.logs.some(m => /#ctl00_content_SchoolFilterCtrl1_ddlEduSystem — 6 خياراً/.test(m)));

    // (ط) قائمة المحافظات ليست قائمة ولايات
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام' });
    const gov = makeSelect('ctl00_content_ddlGov', ['محافظة مسقط', 'محافظة ظفار', 'محافظة مسندم']);
    const one = makeSelect('ctl00_content_x', ['مسقط', 'صحار']);
    check('portal: المحافظات ← لا', !P.ctx.looks(gov));
    check('portal: «مسقط» وحدها ← لا', !P.ctx.looks(one));
    check('portal: ولايات مسقط ← نعم', P.ctx.looks(P.wil) && P.ctx.findWil() === P.wil);
    check('portal: قائمة المدارس لا تُعدّ قائمة ولايات ولو حملت أسماءها', (() => {
        const Q = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام' });
        Q.school.setTexts(['بوشر', 'السيب', 'مطرح']);
        return Q.ctx.findWil() === Q.wil;
    })());

    // (ي) الدليل بالولاية
    const MAP = { schools: [
        { portal: 'النهضة للتعليم الأساسي', system: 'عام', wilaya: 'السيب' },
        { portal: 'النهضة للتعليم الأساسي', system: 'عام', wilaya: 'بوشر' },
        { portal: 'حسان بن ثابت للتعليم الأساسي (5-10)', system: 'أساسي', wilaya: 'بوشر' }
    ], aliases: {} };
    check('dir: الاسم المكرَّر يُحسم بولاية القاعدة', (P.ctx.lookup('النهضة للتعليم الأساسي', MAP, 'بوشر') || {}).wilaya === 'بوشر');
    check('dir: وبلا ولاية ← لا اختيار', P.ctx.lookup('النهضة للتعليم الأساسي', MAP) === null);
    const d1 = P.ctx.lookup('حسان بن ثابت', MAP, 'السيب');
    check('dir: ولاية القاعدة خاطئة — يجدها في الدليل كلّه وبولايتها', d1 && d1.wilaya === 'بوشر' && d1.system === 'أساسي');
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام' });
    P.ctx.setMap(MAP);
    r = await P.ctx.find({ school: 'حسان بن ثابت' });
    check('dir: الولاية من الدليل حين لا تحملها الزيارة', r.found && P.logs.some(m => /بوشر — من دليل مدارس البوّابة/.test(m)) && P.switches[0] === 'wil:بوشر');
    P = portal({ wilayat: WIL, systems: SYS, data: DATA, curWil: 'السيب', curSys: 'عام' });
    P.ctx.setMap({ schools: [], aliases: {}, wilayat: { [P.ctx.normEdu('العذيبة (1-4)').toLowerCase()]: 'بوشر' } });
    r = await P.ctx.find({ school: 'العذيبة (1-4)' });
    check('dir: وولاية القاعدة في الدليل (wilayat) لمدارس الزملاء', r.found && P.switches[0] === 'wil:بوشر');

    // (ك) المسح ولايةً × نظاماً
    P = portal({ wilayat: WIL.slice(2, 5), systems: ['عام', 'أساسي', 'دولي'], data: DATA, curWil: 'بوشر', curSys: 'عام' });
    const dl = [];
    Object.assign(P.ctx, {
        URL: { createObjectURL: () => 'blob:x' }, Blob: function (parts) { this.text = parts.join(''); },
        document: Object.assign(P.ctx.document, { createElement: () => ({ click() { dl.push(this.download); }, remove() {} }), body: { appendChild() {} } })
    });
    await P.ctx.scan(false);
    const res = JSON.parse(P.G.svf_school_scan_result || '{}');
    check('scan: كلّ ولايةٍ × كلّ نظام', res.version === 2 && (res.wilayat || []).join(',') === 'بوشر,السيب,العامرات', JSON.stringify(res.wilayat));
    check('scan: والمدارس بولاياتها', (res.schools || []).length === 7
          && res.schools.some(s => s.portal === 'حسان بن ثابت للتعليم الأساسي (5-10)' && s.wilaya === 'بوشر' && s.system === 'أساسي')
          && res.schools.filter(s => s.portal === 'النهضة للتعليم الأساسي').map(s => s.wilaya).sort().join(',') === 'السيب,بوشر', JSON.stringify(res.schools));
    check('scan: يُنزَّل الملفّ', dl[0] === 'school-scan.json');

    // التوصيل
    check('wiring: البحث يمرّ بالولاية قبل المطابقة',
          SRC.indexOf('const wilDD = findWilayaDropdown();') > SRC.indexOf('const dir = schoolDirLookup(schoolName, null, data.wilaya);')
          && SRC.indexOf('const wilDD = findWilayaDropdown();') < SRC.indexOf('let hit = here(w, cs && cs.text);'));
    check('wiring: الإصدار 17.6', /@version\s+17\.6/.test(SRC));

    finish();
})().catch(e => { console.log('FAIL exception: ' + (e && e.stack || e)); failures++; finish(); });

function finish() {
    Promise.all(PENDING).then(() => {
        console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
        process.exit(failures ? 1 : 0);
    });
}
