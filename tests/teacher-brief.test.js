// اختبار: node tests/teacher-brief.test.js
// ملخّص ما قبل الزيارة: آخر زيارةٍ وتقديرها وأضعف بنودها وتوصياتها.
// السلّم مقلوب (1 متميّز … 5 يحتاج إلى تدخّل) فـ«الأضعف» أعلى الدرجات.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { svfTeacherBrief } = require(path.join(ROOT, 'js/teacher-brief.js'));

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const items = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, title: 'بند ' + (i + 1) }));
const visit = (key, teacher, date, scores, extra) => ({
    key, data: {
        teacherName: teacher, visitDate: date,
        formData: Object.assign({ visitNumber: '1', topic: 'دفع الجلة',
            recommendationsContent: 'نوصي المعلم بالآتي:\n• استخدم قوائم الملاحظة.\n• بادر بتنظيم فعاليات.\n\nوالله ولي التوفيق.' },
            Object.fromEntries(scores.map((v, i) => ['score-' + (i + 1), String(v)])), extra || {})
    }
});
const S1 = [1, 2, 2, 2, 2, 1, 2, 1, 1, 3, 2, 1, 3];       // زيارة مريم الحقيقيّة
const reports = [
    visit('a', 'مريم مصطفى موسى', '2026-10-07', S1, { visitNumber: '1' }),
    visit('b', 'مريم مصطفى موسى', '2026-09-20', S1.map(() => 4), { visitNumber: '0' }),
    visit('c', 'سالم البوسعيدي', '2026-10-01', S1)
];

const b = svfTeacherBrief({ name: 'مريم مصطفى موسى', reports, items, today: '2026-10-20' });
check('last: الأحدث هو آخر زيارة', b.last && b.last.date === '2026-10-07');
check('count: زيارتاها وحدهما', b.count === 2);
check('days: قبل ١٣ يوماً', b.last.days === 13);
check('avg: متوسّط درجاتها مقرّباً', b.last.avg === Math.round(S1.reduce((x, y) => x + y) / 13 * 10) / 10);
check('label: التقدير من المتوسّط (≈1.8 ← جيد)', b.last.label === 'جيد');
check('weak: أعلى الدرجات (3) هي الأضعف — البندان 10 و13',
      b.last.weak.length === 2 && b.last.weak[0].id === 10 && b.last.weak[1].id === 13 && b.last.weak[0].label === 'ملائم',
      JSON.stringify(b.last.weak));
check('recs: التوصيات بلا «نوصي…» ولا «والله…» ولا النقاط',
      b.last.recs.length === 2 && b.last.recs[0] === 'استخدم قوائم الملاحظة.', JSON.stringify(b.last.recs));
check('lesson: درس الزيارة السابقة', b.last.lesson === 'دفع الجلة');

const editing = svfTeacherBrief({ name: 'مريم مصطفى موسى', reports, items, today: '2026-10-20', excludeKey: 'a' });
check('edit: التقرير المفتوح للتعديل لا يُعدّ سابقاً', editing.last.date === '2026-09-20' && editing.count === 1);

const before = svfTeacherBrief({ name: 'مريم مصطفى موسى', reports, items, today: '2026-10-01' });
check('today: زيارةٌ بعد تاريخ هذه لا تُعدّ سابقة', before.last.date === '2026-09-20');

const good = svfTeacherBrief({ name: 'سالم', reports: [visit('x', 'سالم', '2026-10-01', S1.map(() => 1))], items, today: '2026-10-02' });
check('weak: كلّها متميّزة ← لا ضعف', good.last.weak.length === 0 && good.last.label === 'متميز');

const first = svfTeacherBrief({ name: 'معلّمٌ جديد', reports, items, today: '2026-10-20' });
check('first: بلا زيارات ← last فارغ', first.count === 0 && first.last === null);
check('empty: بلا اسم ← null', svfTeacherBrief({ name: '', reports }) === null);

const norm = v => String(v || '').replace(/ى/g, 'ي').trim();
check('norm: «موسى/موسي» معلّمٌ واحد',
      svfTeacherBrief({ name: 'مريم مصطفي موسي', reports, items, today: '2026-10-20', normName: norm }).count === 2);

const src = fs.readFileSync(path.join(ROOT, 'js/teacher-brief.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'reports.html'), 'utf8');
const sup = fs.readFileSync(path.join(ROOT, 'js/supervisory.js'), 'utf8');
check('wiring: البطاقة تحت اسم المعلّم', /id="supTeacherBrief"/.test(html) && html.indexOf('id="teacherName"') < html.indexOf('id="supTeacherBrief"'));
check('wiring: تتحدّث مع الاسم والتاريخ والصفّ', /\['teacherName', 'visitDate', 'class'\]\.forEach/.test(src));
check('wiring: وبعد التصفير وفتح تقريرٍ محفوظ', (sup.match(/svfTeacherBriefRender\(\)/g) || []).length >= 2);
check('wiring: النصوص مهروبة', (src.match(/\$\{esc\(/g) || []).length >= 5);

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
