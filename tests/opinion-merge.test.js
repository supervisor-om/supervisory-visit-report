// اختبار: node tests/opinion-merge.test.js
// ما كتبه المشرف في رأي الزائر أولى من إعادة التوليد (طلب المشرف 2026-10-08):
// «إذا عدّل رأي الزائر أو أضاف شيئاً ثمّ ولّد مرّةً ثانية تبقى إضافته ولا تُستبدل».
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8').replace(/\r\n/g, '\n');
const INIT = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');

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
vm.runInContext(between('let schoolOpinionGen = null;', 'function generateSchoolSmartVisitorOpinion()')
    + '\nthis.merge = mergeVisitorOpinion; this.split = splitOpinionBlocks;', ctx);

const F = (key, text) => ({ key, text });
const gen1 = [
    F('obj:0', '1- تم الالتقاء بالفاضل مدير المدرسة.'),
    F('obj:1', '2- تم حضور الطابور المدرسي، وكان الهتاف بصوت عالٍ والانصراف منظماً.'),
    F('obj:2', '3- تم متابعة تنفيذ خطة المنهاج، ويسير التنفيذ وفق الخطة الزمنية المقررة.')
];

// أوّل توليد: الخانة فارغة
let r = ctx.merge('', null, gen1);
check('first: الخانة الفارغة تأخذ المولَّد كما هو', r.text === gen1.map(f => f.text).join('\n') && r.kept === 0);
let map = r.map;

// المشرف عدّل البند ٢ وأضاف سطراً تحت البند ٣ وبنداً رابعاً من عنده
let edited = r.text
    .replace('وكان الهتاف بصوت عالٍ والانصراف منظماً.', 'وكان الهتاف بصوت عالٍ، ويحتاج الانصراف إلى تنظيم.')
    .replace('وفق الخطة الزمنية المقررة.', 'وفق الخطة الزمنية المقررة.\n   أ. سالم: لا يتوفّر تحضير للعاشر.')
    + '\n4- تم شرح آلية تنفيذ الحصة كتطبيقات تنافسية.';

// إعادة التوليد بنصٍّ جديدٍ للبند ١ (أُضيف اسم المدير)
const gen2 = [
    F('obj:0', '1- تم الالتقاء بالفاضل مدير المدرسة خالد ومعلمي الرياضة المدرسية (سالم).'),
    gen1[1], gen1[2]
];
r = ctx.merge(edited, map, gen2);
check('regen: البند الذي لم يُمسّ يُستبدل بالجديد', r.text.includes('مدير المدرسة خالد'));
check('regen: البند المعدَّل يبقى بنصّ المشرف', r.text.includes('ويحتاج الانصراف إلى تنظيم') && !r.text.includes('والانصراف منظماً'));
check('regen: والسطر المضاف تحت بندٍ يبقى معه', r.text.includes('أ. سالم: لا يتوفّر تحضير للعاشر'));
check('regen: وبند المشرف الرابع يبقى', r.text.includes('آلية تنفيذ الحصة كتطبيقات تنافسية'));
check('regen: الترقيم متسلسل', /^1- /m.test(r.text) && /^2- /m.test(r.text) && /^3- /m.test(r.text) && /^4- /m.test(r.text) && !/^5- /m.test(r.text), r.text);
check('regen: عدد ما أُبقي (معدَّلان + مضاف)', r.kept === 3, String(r.kept));
map = r.map;

// توليدٌ ثالث بلا تغييرٍ من المشرف: يبقى ما كتبه، ولا يتكرّر
const again = ctx.merge(r.text, map, gen2);
check('third: لا تكرار ولا فقد', again.text === r.text, again.text);

// ألغى تحديد هدف البند ٣ (المعدَّل) وهدف البند ١ (غير المعدَّل)، وحدّد هدفاً جديداً
const gen3 = [gen1[1], F('obj:5', '2- تم متابعة الملاعب، وكانت الملاعب مهيأة.')];
r = ctx.merge(again.text, again.map, gen3);
check('uncheck: غير المعدَّل لهدفٍ أُلغي يُحذف', !r.text.includes('مدير المدرسة خالد'));
check('uncheck: والمعدَّل لهدفٍ أُلغي يبقى (الأولويّة للمشرف)', r.text.includes('أ. سالم: لا يتوفّر تحضير للعاشر'));
check('uncheck: والهدف الجديد يُضاف', r.text.includes('وكانت الملاعب مهيأة'));
check('uncheck: والمعدَّل الباقي في موضعه الجديد', r.text.split('\n')[0].includes('ويحتاج الانصراف'), r.text.split('\n')[0]);

// تقريرٌ قديمٌ بلا خريطة: نصّه كلّه يبقى، ويُضاف ما ليس فيه
const legacy = '1- نصٌّ قديمٌ كتبه المشرف.\n2- تم حضور الطابور المدرسي، وكان الهتاف بصوت عالٍ والانصراف منظماً.';
r = ctx.merge(legacy, null, gen1);
check('legacy: النصّ القديم كلّه يبقى', r.text.includes('نصٌّ قديمٌ كتبه المشرف'));
check('legacy: ولا يتكرّر الموجود', (r.text.match(/حضور الطابور/g) || []).length === 1);
check('legacy: ويُضاف الناقص', r.text.includes('تم الالتقاء') && r.text.includes('خطة المنهاج'));

// نصٌّ قبل أوّل بندٍ مرقّم (مقدّمة كتبها المشرف) يبقى في الرأس
r = ctx.merge('مقدّمة بيدي\n' + gen1.map(f => f.text).join('\n'), ctx.merge('', null, gen1).map, gen2);
check('preamble: المقدّمة تبقى أوّلاً', r.text.startsWith('مقدّمة بيدي') && r.text.includes('مدير المدرسة خالد'));

// التوصيل
check('wiring: التوليد يمرّ بالدمج', /const r = mergeVisitorOpinion\(visOp\.value, schoolOpinionGen, fresh\);/.test(SRC));
check('wiring: مفتاح الهدف موضعه', /keys\.push\('obj:' \+ \(index != null \? index : obj\)\)/.test(SRC)
      && /index: item\.dataset\.index/.test(SRC));
check('wiring: الخريطة تُحفظ مع التقرير', /opinionGen: Array\.isArray\(schoolOpinionGen\)/.test(SRC));
check('wiring: وتُستعاد في المسارين', (SRC.match(/schoolOpinionGen = Array\.isArray\(report\.opinionGen\)/g) || []).length === 2);
check('wiring: وتُصفَّر في «تقرير جديد»', /schoolOpinionGen = null;/.test(INIT));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
