// اختبار: node tests/term-plan.test.js
// عنوان الدرس من الخطة الفصلية: الصفّ + التاريخ (+ الجنس) ← موضوع الأسبوع.
// يقرأ js/term-plan-data.js المولَّد من الخطة الحقيقيّة (ف1 2026/2027) وjs/term-plan.js نفسه.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/term-plan-data.js'), 'utf8'), { window: win });
const PLAN = win.SVF_TERM_PLAN;
const { parseGrade, lessonsFor, suggestTitle } = require(path.join(ROOT, 'js/term-plan.js'));

/* ── البيانات ── */
check('data: اثنا عشر صفّاً', PLAN && Object.keys(PLAN.grades).length === 12);
check('data: العام 2026/2027 الفصل الأوّل', PLAN.year === '2026/2027' && PLAN.term === 1);
check('data: كلّ صفٍّ له موضوعات بتواريخ صحيحة',
      Object.values(PLAN.grades).every(l => l.length >= 8 && l.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.from) && e.from <= e.to && e.topic)));
check('data: خطّ التطويل بين موضوعين يصير « / »',
      PLAN.grades['11'].some(e => e.topic === 'سباقات المسافات القصيرة / الاختبار العملي (1)'));

/* ── الصفّ من النصّ ── */
const g = [['12/5', 12], ['ثاني عشر/14', 12], ['حادي عشر/5', 11], ['الحادي عشر', 11], ['اول', 1],
           ['الأول', 1], ['العاشر', 10], ['١٠/٣', 10], ['الصف 9', 9], ['5', 5], ['', 0], ['أ', 0]];
g.forEach(([t, n]) => check('grade: «' + t + '» ← ' + n, parseGrade(t) === n, 'got ' + parseGrade(t)));

/* ── زيارات المشرف الحقيقيّة ── */
check('real: الثاني عشر في 7/10 ← دفع الجلة بطريقة الزحف',
      suggestTitle(PLAN, 'ثاني عشر/2', '2026-10-07', '').title === 'دفع الجلة بطريقة الزحف');
check('real: الأوّل في 7/10 (زيارة مريم) ← الممارسات الصحية…',
      suggestTitle(PLAN, 'اول', '2026-10-07', 'f').title === 'الممارسات الصحية + المهرجانات الرياضية التعليمية');
check('range: أوّل يوم الأسبوع وآخره داخلان',
      suggestTitle(PLAN, '12', '2026-10-04', '').title === 'دفع الجلة بطريقة الزحف'
      && suggestTitle(PLAN, '12', '2026-10-15', '').title === 'دفع الجلة بطريقة الزحف');

/* ── الجنس ── */
check('gender: العاشر في 13/10 للمعلّم ← كرة القدم',
      suggestTitle(PLAN, '10', '2026-10-13', 'm').title === 'المحاورة من الجانب والخلف');
check('gender: وللمعلّمة ← التمرينات الفنية',
      suggestTitle(PLAN, '10', '2026-10-13', 'f').title === 'الوثبات (الإقعاء ، الطائرة ، الحلق)');
const unknown = suggestTitle(PLAN, '10', '2026-10-13', '');
check('gender: مجهولٌ ← لا اختيار، والموضوعان اقتراحان', unknown.title === '' && unknown.options.length === 2);

/* ── أسابيع الاختيار ── */
const choice = suggestTitle(PLAN, '5', '2026-11-10', 'm');
check('choice: الخامس في 10/11 — يختار المعلّم ← أربعة اقتراحات بلا كتابة',
      choice.title === '' && choice.options.length === 4 && choice.options.includes('لعبة كرة القدم للصغار'));

/* ── خارج الخطة ── */
check('none: قبل بدء الفصل لا شيء', suggestTitle(PLAN, '12', '2026-09-01', '').options.length === 0);
check('none: الجمعة بين أسبوعين لا شيء', suggestTitle(PLAN, '1', '2026-10-09', '').options.length === 0);
check('none: صفٌّ مجهول لا شيء', suggestTitle(PLAN, 'ب', '2026-10-07', '').options.length === 0);
check('none: تاريخٌ فارغ لا شيء', lessonsFor(PLAN, 12, '', '').length === 0);

/* ── التوصيل ── */
const src = fs.readFileSync(path.join(ROOT, 'js/term-plan.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'reports.html'), 'utf8');
const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('wiring: ما كتبه المشرف لا يُمسّ', /const mine = cur && cur !== auto;[\s\S]{0,200}if \(mine\) return;/.test(src));
check('wiring: الكتابة اليدويّة تفكّ الارتباط', /addEventListener\('input', markManual\)/.test(src));
check('wiring: الموضعان مربوطان',
      /el\('cvSubject'\), 'svfPlanCv', el\('cvGrade'\)/.test(src) && /el\('topic'\), 'svfPlanSup', el\('class'\)/.test(src));
check('wiring: الملفّان في الصفحة بالترتيب',
      html.indexOf('js/term-plan-data.js') > 0 && html.indexOf('js/term-plan-data.js') < html.indexOf('js/term-plan.js')
      && html.indexOf('js/term-plan.js') < html.indexOf('js/init.js'));
check('wiring: التهيئة عند التحميل', /svfTermPlanInit\(\)/.test(init));
check('wiring: وفي ذاكرة العمل دون اتّصال', sw.includes("'./js/term-plan-data.js'") && sw.includes("'./js/term-plan.js'"));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
