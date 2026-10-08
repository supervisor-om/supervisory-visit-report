// اختبار: node tests/portal-names.test.js
// v16.6: اسم المعلّم ورقمه في البوّابة يُحفظان عند اختياره، فتُبحث الزيارة التالية به
// وتُطابَق بالرقم، ويُضخّ السجلّ إلى الموقع لـ«جودة البيانات».
// الحالة الحقيقيّة (2026-10-07): الموقع «مريم مصطفي موسى»، البوّابة «مريم مصطفى محمد السيد» 32315171.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'tools/daf51553aa5f5d6215/school-visits-automation.user.js'), 'utf8')
    .replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const between = (a, b) => {
    const i = SRC.indexOf(a), j = SRC.indexOf(b, i);
    if (i < 0 || j < 0) throw new Error('marker not found: ' + a);
    return SRC.slice(i, j);
};

function env() {
    const gm = {}, ls = {};
    const ctx = {
        GM_getValue: (k, d) => (k in gm ? gm[k] : d),
        GM_setValue: (k, v) => { gm[k] = v; },
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
        Date
    };
    vm.createContext(ctx);
    vm.runInContext(between('// ═══ أسماء المعلّمين كما في البوّابة (v16.6) ═══', 'function svfSyncSaved()')
        + '\nthis.key = svfNameKey; this.parse = svfParseDisplayInfo; this.rec = svfRecordPortalName;'
        + ' this.get = svfPortalNameFor; this.merge = svfMergePortalNames;', ctx);
    return { ctx, gm, ls };
}

const ONCLICK = "DisplayInfo('مريم مصطفى محمد السيد','معلم مادة رياضة مدرسية','نور الاسلام الخاصه','32315171','3109020','5381758','13','2900');";

{
    const { ctx } = env();
    const info = ctx.parse(ONCLICK);
    check('parse: الاسم من DisplayInfo', info && info.portal === 'مريم مصطفى محمد السيد');
    check('parse: والمدرسة والرقم الوظيفيّ', info.school === 'نور الاسلام الخاصه' && info.emp === '32315171');
    check('parse: ما ليس DisplayInfo ← null', ctx.parse('getEmployees();') === null && ctx.parse('') === null);
    check('key: «مصطفي/مصطفى» و«موسي/موسى» مفتاحٌ واحد', ctx.key('مريم مصطفي موسى') === ctx.key('مريم مصطفى موسي'));
    check('key: «بن» تسقط', ctx.key('سالم بن علي') === ctx.key('سالم علي'));
}

{
    const { ctx, gm } = env();
    const info = ctx.parse(ONCLICK);
    check('record: يُحفظ أوّل مرّة', ctx.rec('مريم مصطفي موسى', info) === true);
    check('record: ولا يُعاد حفظ المطابق', ctx.rec('مريم مصطفي موسى', info) === false);
    const got = ctx.get('مريم مصطفى موسى');
    check('lookup: يُعثر عليه بتهجئةٍ أخرى لاسم الموقع', got && got.portal === 'مريم مصطفى محمد السيد' && got.emp === '32315171');
    check('lookup: ويحفظ تهجئة الموقع كما كُتبت', got.site === 'مريم مصطفي موسى');
    check('lookup: معلّمٌ آخر ← null', ctx.get('هند الحارثي') === null);
    check('record: بلا اسمٍ في البوّابة لا يُحفظ', ctx.rec('س', { portal: '' }) === false);
    check('record: التخزين في GM', /32315171/.test(gm.svf_portal_names || ''));
}

{
    const { ctx, ls } = env();
    ctx.rec('مريم مصطفي موسى', ctx.parse(ONCLICK));
    check('merge: يُضخّ إلى الموقع', ctx.merge() === 1 && /32315171/.test(ls.svf_portal_names || ''));
    check('merge: والثاني بلا جديد ← 0', ctx.merge() === 0);
}

check('wiring: يُحفظ عند تثبيت الاختيار في الفرعين',
      (SRC.match(/slog\('تُبِّت اختيار المعلّم[^']*', 'success'\); remember\(el\); return true;/g) || []).length === 2);
check('wiring: البحث يبدأ باسم البوّابة إن عُرف', /terms\.unshift\(knownName\)/.test(SRC));
check('wiring: والمطابقة البديلة تأخذ الرقم المحفوظ',
      /supAltTeacherRow\(want, \(sup && sup\.fileNumber\) \|\| \(known && known\.emp\)\)/.test(SRC));
check('wiring: الضخّ إلى الموقع مع سجلّ المحفوظ', /function svfSyncSaved\(\) \{\s*\n\s*try \{ svfMergePortalNames\(\); \}/.test(SRC));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
