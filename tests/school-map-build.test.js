// اختبار: node tests/school-map-build.test.js
// «تلقائيّ» في مراجعة الدليل يعني: يجدها السكربت بقواعده نفسها. فنسخة matchSchool/normEdu
// في scripts/build_school_map.py يجب أن تحكم كما يحكم السكربت على المدخلات نفسها حرفاً بحرف.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(require('./_script-src.js'), 'utf8')
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

const PORTAL = [
    'الاجيال العصريه الدوليه الخاصه', 'نور الاسلام الخاصه', 'الحسن بن هاشم للبنين الصفوف (11-12)',
    'يزيد بن حاتم الازدى للبنين الصفوف(9-12)', 'الاوائل الخاصه فرع الحيل', 'الاوائل الخاصه فرع الخوض',
    'افاق مسقط الخاصه', 'ابن خلدون الخاصه', '18 نوفمبر للتعليم الاساسي', 'مدرسة الامل - الحيل'
];
const NAMES = [
    'الأجيال العصرية الدولية (1-12)', 'نور الإسلام الخاصة', 'ابن خلدون الخاصه (1-12)', 'الاوائل الخاصه',
    'آفاق مسقط الخصة', 'الحسن بن هاشم', 'يزيد بن حاتم الأزدي', '18 نوفمبر', 'مدرسة الامل', 'Al Sahwa Schools',
    'الاوائل الخاصه فرع الخوض', 'الحسن بن هاشم للبنين الصفوف (9-10)'
];

// حكم السكربت
const ctx = {};
vm.createContext(ctx);
vm.runInContext(between('function normEdu(v)', '// أسماء أنظمة التعليم')
    + between('// كلماتٌ عامّةٌ لا تميّز', '// للتوافق مع ما يستدعيها')
    + '\nthis.matchSchool = matchSchool; this.normEdu = normEdu;', ctx);
const dd = { options: PORTAL.map((t, i) => ({ value: String(i + 1), text: t })) };
const js = NAMES.map(n => {
    const r = ctx.matchSchool(dd, n);
    return { hit: r.option ? r.option.text : null, amb: r.ambiguous.length, norm: ctx.normEdu(n) };
});

// حكم الأداة
const py = spawnSync('python', ['-c', `
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location('b', sys.argv[1]); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
portal = json.loads(sys.argv[2]); names = json.loads(sys.argv[3])
opts = [{'portal': p} for p in portal]
out = []
for n in names:
    hit, amb = b.match_school(opts, n)
    out.append({'hit': hit['portal'] if hit else None, 'amb': len(amb), 'norm': b.norm_edu(n)})
sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode('utf8'))
`, path.join(ROOT, 'scripts/build_school_map.py'), JSON.stringify(PORTAL), JSON.stringify(NAMES)],
    { encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });

if (py.error || py.status !== 0) {
    console.log('SKIP python غير متاح: ' + ((py.error && py.error.message) || py.stderr).slice(0, 200));
} else {
    const res = JSON.parse(py.stdout);
    NAMES.forEach((n, i) => {
        check('parity: «' + n + '»', JSON.stringify(res[i]) === JSON.stringify(js[i]),
              'js=' + JSON.stringify(js[i]) + ' py=' + JSON.stringify(res[i]));
    });
    check('sanity: الأجيال تُعرف تلقائياً', js[0].hit === 'الاجيال العصريه الدوليه الخاصه');
    check('sanity: فرعا الأوائل ملتبسان', js[3].hit === null && js[3].amb === 2);
    check('sanity: نطاقٌ آخر لا يُطابق («9-10» ليست «11-12»)', js[11].hit === null);
}

// v17.6: الولاية — الاسم المكرَّر في ولايتين يُحسم بولاية القاعدة، والدليل يحمل ولاية كلّ مدرسةٍ في القاعدة
const pyW = spawnSync('python', ['-c', `
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location('b', sys.argv[1]); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
scan = {'schools': [{'portal': 'النهضة للتعليم الأساسي', 'system': 'عام', 'wilaya': 'السيب'},
                    {'portal': 'النهضة للتعليم الأساسي', 'system': 'عام', 'wilaya': 'بوشر'},
                    {'portal': 'حسان بن ثابت للتعليم الأساسي (5-10)', 'system': 'أساسي', 'wilaya': 'بوشر'}]}
db = {'النهضة للتعليم الأساسي': {'n': 2, 'wilaya': 'بوشر'}, 'حسان بن ثابت (5-10)': {'n': 3, 'wilaya': 'بوشر'},
      'مدرسة بلا ولاية': {'n': 1}}
out, auto, amb, unm, ali, prop = b.build(scan, db, {})
sys.stdout.buffer.write(json.dumps({'out': out, 'auto': [[n, h] for n, h in auto], 'amb': len(amb),
    'nw': [b.norm_wil(x) for x in ['ولاية السيب', 'السيب', 'العامرات', 'مسقط']]}, ensure_ascii=False).encode('utf8'))
`, path.join(ROOT, 'scripts/build_school_map.py')], { encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
if (pyW.error || pyW.status !== 0) {
    console.log('SKIP python (الولاية): ' + ((pyW.error && pyW.error.message) || pyW.stderr).slice(0, 300));
} else {
    const w = JSON.parse(pyW.stdout);
    check('wilaya: «النهضة» المكرَّرة تُحسم بولاية القاعدة (بوشر)', w.amb === 0
          && w.auto.some(([n, h]) => n === 'النهضة للتعليم الأساسي' && h.wilaya === 'بوشر'), JSON.stringify(w.auto));
    check('wilaya: الدليل يحمل ولاية المدارس من القاعدة', w.out.version === 2 && Object.keys(w.out.wilayat).length === 2
          && Object.values(w.out.wilayat).every(x => x === 'بوشر'));
    check('wilaya: ومدارس البوّابة بولاياتها', w.out.schools.every(s => s.wilaya));
    // normWil: الأداة والسكربت سواء
    const c2 = {};
    vm.createContext(c2);
    vm.runInContext(between('function normEdu(v)', '// أسماء أنظمة التعليم') + between('        function normWil(v) {', '        function sameWil(') + '\nthis.nw = normWil;', c2);
    const js2 = ['ولاية السيب', 'السيب', 'العامرات', 'مسقط'].map(c2.nw);
    check('parity: normWil', JSON.stringify(js2) === JSON.stringify(w.nw), JSON.stringify(js2) + ' / ' + JSON.stringify(w.nw));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
