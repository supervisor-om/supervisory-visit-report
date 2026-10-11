// اختبار: node tests/lesson-title.test.js
// v17.2: عنوان الدرس في استمارة البوّابة بصيغة المشرف — «عنوان الدرس صف خامس/1 الحصة (2)» (2026-10-11).
// يُكتب في السكربت عند تعبئة الخانة، فيشمل المسارات الثلاثة (التصدير المفرد، الطابور، زرّ السكربت).
const fs = require('fs');
const SRC = fs.readFileSync(require('./_script-src.js'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const a = SRC.indexOf('const SVF_GRADE_WORDS'), b = SRC.indexOf('// ═══ التفعيل برمز المشرف');
const f = new Function(SRC.slice(a, b) + '; return svfLessonTitle;')();

const cases = [
    [['عنوان الدرس', '5/1', '2'], 'عنوان الدرس صف خامس/1 الحصة (2)', 'مثال المشرف بعينه'],
    [['دفع الجلة بطريقة الزحف', 'ثاني عشر/14', '1'], 'دفع الجلة بطريقة الزحف صف ثاني عشر/14 الحصة (1)', 'الصفّ كلمةً بشعبته'],
    [['الممارسات الصحية', 'اول', '3'], 'الممارسات الصحية صف أول الحصة (3)', '«اول» ← «أول» وبلا شعبة'],
    [['التمرير', 'الصف 10/3', 'الحصة 4'], 'التمرير صف عاشر/3 الحصة (4)', '«الصف» و«الحصة» لا تتكرّران'],
    [['تدريبات', '١١/٥', '٢'], 'تدريبات صف حادي عشر/5 الحصة (2)', 'الأرقام العربيّة'],
    [['المحاورة', 'الحادي عشر/3', '(5)'], 'المحاورة صف حادي عشر/3 الحصة (5)', '«الحادي عشر» والحصّة بين قوسين أصلاً'],
    [['عنوان الحصة (1)', '5/1', '2'], 'عنوان الحصة (1)', 'ما فيه «الحصة (» لا يُضاف إليه'],
    [['بلا صف', '', ''], 'بلا صف', 'بلا صفٍّ ولا حصّة يبقى العنوان'],
    [['عنوان', '5/1', ''], 'عنوان صف خامس/1', 'بلا حصّة'],
    [['', '5/1', '2'], '', 'بلا عنوانٍ لا شيء (التحقّق يطلبه)']
];
cases.forEach(([args, want, label]) => {
    const got = f(...args);
    check(label, got === want, 'got «' + got + '»');
});

check('wiring: يُكتب بالصيغة في خانة عنوان الدرس',
      /let title = svfLessonTitle\(sup\.lessonTitle, sup\.className, sup\.period\);[\s\S]{0,900}supPut\(STAGE1_FIELDS\['عنوان الدرس'\], title, 'عنوان الدرس'\);/.test(SRC));
check('wiring: وإن تجاوز حدّ الخانة يُكتب العنوان وحده', /if \(max && title\.length > max\) \{[\s\S]{0,200}title = sup\.lessonTitle;/.test(SRC));
check('wiring: في المستوى المشترك', SRC.indexOf('function svfLessonTitle') < SRC.indexOf("if (location.hostname.includes('moe.gov.om') && !/supervisionvisits/"));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
