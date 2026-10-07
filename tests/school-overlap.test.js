// اختبار: node tests/school-overlap.test.js
// تداخل أوقات الزيارات المدرسيّة في اليوم نفسه (طلب المشرف 2026-10-07):
// «زيارة من 7 إلى 10 وزيارةٌ ثانيةٌ بالتاريخ نفسه من 7 إلى 12 ← تنبيه».
// يشغّل schoolTimeMin/schoolTimeOverlaps من js/school.js نفسه.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/school.js'), 'utf8').replace(/\r\n/g, '\n');

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
vm.runInContext(between('function schoolTimeMin(t)', 'function schoolSavedReports()')
    + '\nthis.min = schoolTimeMin; this.overlaps = schoolTimeOverlaps;', ctx);

const v = (id, date, a, d, school) => ({ id, visitDate: date, arrivalTime: a, departureTime: d, schoolName: school || id });
const D = '2026-10-07';

check('time: «07:00» = 420 دقيقة', ctx.min('07:00') === 420);
check('time: «7:05» تُقبل', ctx.min('7:05') === 425);
check('time: الفارغ لا وقت', ctx.min('') === null && ctx.min(undefined) === null);

// مثال المشرف بعينه
const ex = ctx.overlaps(v('new', D, '07:00', '12:00'), [v('a', D, '07:00', '10:00', 'مدرسة الأولى')]);
check('overlap: 07–10 و07–12 في اليوم نفسه تتداخلان', ex.length === 1 && ex[0].schoolName === 'مدرسة الأولى');

check('overlap: تاريخٌ آخر لا يُحسب', ctx.overlaps(v('new', D, '07:00', '12:00'), [v('a', '2026-10-08', '07:00', '10:00')]).length === 0);
check('overlap: المتتاليتان (تنتهي 10:00 وتبدأ 10:00) لا تتداخلان',
      ctx.overlaps(v('new', D, '10:00', '12:00'), [v('a', D, '07:00', '10:00')]).length === 0);
check('overlap: تقاطعٌ جزئيّ (09:30 داخل 07–10) يُحسب',
      ctx.overlaps(v('new', D, '09:30', '11:00'), [v('a', D, '07:00', '10:00')]).length === 1);
check('overlap: زيارةٌ داخل أخرى تُحسب',
      ctx.overlaps(v('new', D, '08:00', '09:00'), [v('a', D, '07:00', '12:00')]).length === 1);
check('overlap: التقرير نفسه (تعديله) لا يُقارَن بنفسه',
      ctx.overlaps(v('a', D, '07:00', '10:00'), [v('a', D, '07:00', '10:00')]).length === 0);
check('overlap: تقريرٌ قديمٌ بلا أوقات لا يُحكم عليه',
      ctx.overlaps(v('new', D, '07:00', '12:00'), [v('a', D, '', '')]).length === 0);
check('overlap: المحذوف لا يُحسب',
      ctx.overlaps(v('new', D, '07:00', '12:00'), [Object.assign(v('a', D, '07:00', '10:00'), { deleted: true })]).length === 0);
check('overlap: انصرافٌ قبل الوصول لا يُقارَن (له تنبيهه الخاصّ)',
      ctx.overlaps(v('new', D, '12:00', '07:00'), [v('a', D, '07:00', '10:00')]).length === 0);
const many = ctx.overlaps(v('new', D, '07:00', '13:00'), [v('b', D, '11:00', '12:00'), v('a', D, '07:30', '09:00'), v('c', D, '13:00', '14:00')]);
check('overlap: عدّة تداخلاتٍ مرتّبةٌ بوقت الوصول، والملاصقة مستبعدة',
      many.length === 2 && many[0].id === 'a' && many[1].id === 'b');

// التوصيل
check('wiring: الحفظ يستأذن عند التداخل ويُلغى بالرفض',
      /const timeIssues = schoolTimeIssues\(\);\s*\n\s*if \(timeIssues\.length && !confirm\(/.test(SRC)
      && SRC.indexOf('const timeIssues = schoolTimeIssues();') < SRC.indexOf('localStorage.setItem(reportId, JSON.stringify(reportData));'));
check('wiring: التنبيه يُحدَّث مع التاريخ والوقتين',
      /\['schoolVisitDate', 'schoolArrivalTime', 'schoolDepartureTime'\]\.forEach/.test(SRC));
check('wiring: وعند فتح النموذج', /renderSchoolRoute\(\);\s*\n\s*renderSchoolTimeOverlap\(\);/.test(SRC));
check('wiring: اسم المدرسة يُهرَّب قبل HTML', /issues\.map\(t => '<p>' \+ schoolRouteEsc\(t\) \+ '<\/p>'\)/.test(SRC));
const html = fs.readFileSync(path.join(__dirname, '..', 'reports.html'), 'utf8');
const init = fs.readFileSync(path.join(__dirname, '..', 'js/init.js'), 'utf8');
check('wiring: لوحة التنبيه في الصفحة', /id="schoolTimeOverlap"/.test(html));
check('wiring: والمستمعون يُركَّبون عند التحميل', /schoolTimeOverlapInit\(\)/.test(init));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
