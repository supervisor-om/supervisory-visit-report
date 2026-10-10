// اختبار: node tests/staff-mode.test.js
// نوع الكادر التعليميّ يُستنتج من معلّمي المدرسة (طلب المشرف 2026-10-10).
// المفتاح: 0 ذكور-جماعة · 1 ذكر-مفرد · 2 إناث-جماعة · 3 أنثى-مفرد.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8').replace(/\r\n/g, '\n');
const INIT = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'reports.html'), 'utf8');

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
const ctx = {};
vm.createContext(ctx);
vm.runInContext(between('function staffGenderMode(list)', 'function staffForSchool()') + '\nthis.f = staffGenderMode;', ctx);
const T = (name, gender) => ({ name, gender });

let r = ctx.f([T('سارة', 'f')]);
check('معلّمةٌ واحدة ← أنثى-مفرد (3)', r && r.mode === 3 && r.word === 'معلمة');
r = ctx.f([T('سالم', 'm')]);
check('معلّمٌ واحد ← ذكر-مفرد (1)', r && r.mode === 1 && r.word === 'معلم');
r = ctx.f([T('سارة', 'f'), T('منى', 'f')]);
check('معلّمتان ← إناث-جماعة (2) «معلمتان»', r && r.mode === 2 && r.word === 'معلمتان');
r = ctx.f([T('سارة', 'f'), T('منى', 'f'), T('هند', 'f')]);
check('ثلاث معلّمات ← «معلمات»', r && r.mode === 2 && r.word === 'معلمات' && r.count === 3);
r = ctx.f([T('سالم', 'm'), T('منى', 'f')]);
check('مختلط ← ذكور-جماعة (0)', r && r.mode === 0 && r.word === 'معلمان');
r = ctx.f([T('سالم', 'm'), T('علي', 'm'), T('منى', 'f')]);
check('مختلط ثلاثة ← «معلمون»', r && r.mode === 0 && r.word === 'معلمون');
check('جنسٌ مجهولٌ لأحدهم ← لا استنتاج', ctx.f([T('سالم', 'm'), T('مجهول', '')]) === null);
check('بلا معلّمين ← لا استنتاج', ctx.f([]) === null && ctx.f(null) === null);
check('سجلٌّ بلا اسم لا يُعدّ', ctx.f([T('', 'm'), T('سارة', 'f')]).mode === 3);

check('wiring: نقرة المشرف تثبّت اختياره', /if \(e\.isTrusted\) staffModeManual = true;/.test(INIT));
check('wiring: اسم المدرسة يعيد الاستنتاج', /getElementById\('schoolName'\)\s*\n?\s*\?\.addEventListener\(ev, \(\) => \{ try \{ applyAutoStaffMode\(\); \}/.test(INIT));
check('wiring: «تقرير جديد» يعيد الاستنتاج', /staffModeManual = false;/.test(INIT));
check('wiring: التقرير المحفوظ يبقى على مفتاحه', /if \(mode !== null\) staffModeManual = true;/.test(SRC));
check('wiring: الطاقم المكتوب أولى من القاعدة', SRC.indexOf("source: 'طاقم المدرسة'") < SRC.indexOf("source: 'قاعدة المعلمين'"));
check('wiring: الأسماء مهروبة', /s\.names\.slice\(0, 4\)\.map\(schoolRouteEsc\)/.test(SRC));
check('wiring: السطر والأزرار في الصفحة', /id="staffModeInfo"/.test(HTML) && /id="staffModeGrid"/.test(HTML));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
