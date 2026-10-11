// اختبار: node tests/pupil-words.test.js
// «التلاميذ/التلميذ» لا «الطلبة/الطالب» للصفوف ١–٤ في الزيارات الإشرافيّة والمدرسيّة (طلب المشرف 2026-10-11).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

global.window = {};
const U = new Function(read('js/utils.js') + ';return { svfPupilText, svfIsLowerGrade };')();

/* ── التحويل ── */
const T = [
    ['يكتسب جميع الطلبة المهارات', 'يكتسب جميع التلاميذ المهارات'],
    ['وسلوك طلبته ويثير', 'وسلوك تلاميذه ويثير'],
    ['وسلوك طلبتها', 'وسلوك تلاميذها'],
    ['يستفيد منها قليل من الطلبة', 'يستفيد منها قليل من التلاميذ'],
    ['قيادة الطالب للمجموعة', 'قيادة التلميذ للمجموعة'],
    ['سلامة الطلاب', 'سلامة التلاميذ'],
    ['تحديات مناسبة للطلبة', 'تحديات مناسبة للتلاميذ'],
    ['لكل طالب دوره', 'لكل تلميذ دوره'],
    ['المعلم والطلبة', 'المعلم والتلاميذ'],
    ['استلام الأدلة وكتاب الطالب', 'استلام الأدلة وكتاب الطالب'],
    ['كتب الطالب والطلبة', 'كتب الطالب والتلاميذ'],
    ['طالبة متميزة', 'طالبة متميزة'],
    ['', '']
];
T.forEach(([from, to]) => {
    const got = U.svfPupilText(from);
    check('«' + from + '»', got === to, 'got «' + got + '»');
});

/* ── الصفّ ── */
const G = [['3/1', true], ['ثالث/2', true], ['الصف 4', true], ['اول', true], ['الأول/2', true], ['١/٢', true], ['رابع', true],
           ['5/1', false], ['خامس/3', false], ['ثاني عشر/1', false], ['حادي عشر', false], ['12/1', false], ['10', false], ['', false]];
G.forEach(([c, want]) => check('grade «' + c + '» ← ' + want, U.svfIsLowerGrade(c) === want, String(U.svfIsLowerGrade(c))));

/* ── التوصيل ── */
const sup = read('js/supervisory.js'), init = read('js/init.js'), school = read('js/school.js'), ui = read('js/recs-ui.js');
check('wiring: الأوصاف الإشرافيّة تُحوَّل للصفوف ١–٤', /return supLowerGrade\(\) \? svfPupilText\(out\) : out;/.test(sup));
check('wiring: والتوصيات المولَّدة', /if \(supLowerGrade\(\)\) recs = svfPupilText\(recs\);/.test(sup));
check('wiring: والأوصاف المولَّدة قبل كتابة الصفّ تُحوَّل عند التوليد',
      /function generateReport\(\) \{[\s\S]{0,400}if \(supLowerGrade\(\)\) evaluationItems\.forEach/.test(sup));
check('wiring: تغيير الصفّ عبر الحدّ يعيد الأوصاف والنصوص', /cls\.addEventListener\('change', recheck\);/.test(init));
check('wiring: رأي الزائر في مدرسة الصفوف ١–٤', /if \(schoolLowerGrade\(\)\) generated = svfPupilText\(generated\);/.test(school));
check('wiring: وتوصيات الزيارة المدرسيّة', /schoolLowerGrade\(\) && typeof svfPupilText === 'function'[\s\S]{0,120}g\.items\.map\(svfPupilText\)/.test(ui));
check('wiring: المدرسة للصفوف ١–٤ إن كانت كلّ صفوفها كذلك', /return cvs\.every\(svfIsLowerGrade\);/.test(school)
      && /g\.every\(n => n >= 1 && n <= 4\)/.test(school));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
