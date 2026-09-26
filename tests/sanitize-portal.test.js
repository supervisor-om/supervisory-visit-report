// اختبار انحدار: node tests/sanitize-portal.test.js
// سلامة النصّ قبل الكتابة في حقول البوّابة (sanitizeForPortal في السكربت).
// خلفيّته: ASP.NET القديم (Framework 4.0) يرفض حفظ الزيارة كاملةً — بلا تمييز
// حقلٍ عن آخر — إن وجد في أيّ حقلٍ نصّيّ "&#" أو "<" متبوعةً بحرف/!/؟//
// (CrossSiteScriptingValidation)؛ حدث هذا فعلاً حين حمل «رأي الزائر» ترميز
// HTML حرفيّاً (&#1644;) فسقط الحفظ برسالة HttpRequestValidationException.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const us = fs.readFileSync(path.join(ROOT, 'tools/daf51553aa5f5d6215/school-visits-automation.user.js'), 'utf8').replace(/\r\n/g, '\n');

/* ── ١) استخراج الدالّة من السكربت (كما تُحمَّل فعلاً) ── */
const a = us.indexOf('function sanitizeForPortal');
const b = us.indexOf('const wait = ms =>');
check('السكربت: يحمل دالّة sanitizeForPortal', a > 0 && b > a);

const ctx = {};
vm.createContext(ctx);
vm.runInContext(us.slice(a, b) + '\nthis.f = sanitizeForPortal;', ctx);
const f = ctx.f;

/* ── ٢) الحالة الواقعيّة التي أسقطت الحفظ ── */
{
    const broken = 'ر المدرسة &#1644; وقت تم توجيه المعلمين بضرورة إعداد سجلات وتفعيلها';
    const out = f(broken);
    check('الحالة الواقعيّة: لا يبقى "&#" في الناتج', !out.includes('&#'), out);
    check('الحالة الواقعيّة: الحرف العربيّ الحقيقيّ حلّ محلّ الترميز', out.includes('ر المدرسة ' + String.fromCodePoint(1644) + ' وقت'), out);
}

/* ── ٣) ترميزاتٌ رقميّة: عشريّة وست عشريّة ── */
{
    check('عشريّ: &#38; ← &', f('a&#38;b') === 'a&b');
    check('ست عشريّ: &#x26; ← &', f('a&#x26;b') === 'a&b');
    check('عشريّ بحرفٍ عربيّ: &#1633; ← ١', f('رقم &#1633; هنا') === 'رقم ١ هنا');
    check('لا يبقى نمط "&#" بعد فكّ أيّ ترميزٍ رقميّ', !f('x&#100;y&#x41;z').includes('&#'));
}

/* ── ٤) ترميزاتٌ مسمّاة شائعة (نصٌّ منسوخٌ من HTML) ── */
{
    check('&amp; ← &', f('توم &amp; جيري') === 'توم & جيري');
    // فكّ الترميز يُعيد "<div" فعلياً — فتُحيَّد "<" في المرحلة التالية أيضاً؛
    // هذا مقصود: بلا هذه المرحلة الثانية يُعاد إنتاج النمط الخطر نفسه من ترميزه
    check('&lt;div&gt; ← فكٌّ ثمّ تحييد "<" الناتجة، و">" وحدها لا تُمسّ', f('&lt;div&gt;') === '‹div>', JSON.stringify(f('&lt;div&gt;')));
    check('&gt; المجرّدة ← >', f('a &gt; b') === 'a > b');
    check('&quot; ← "', f('قال &quot;كذا&quot;') === 'قال "كذا"');
    check('&apos; ← \'', f('هذا &apos;كذا&apos;') === "هذا 'كذا'");
}

/* ── ٥) "<" الخطرة تُحيَّد، والباقي لا يُمسّ ── */
{
    check('"<" متبوعةً بحرفٍ تُستبدل ببديلٍ آمن', !f('نصٌّ <script>خطر</script>').includes('<s'));
    check('"<" وحدها (بلا حرفٍ بعدها) لا تُمسّ — ليست الحالة الخطرة', f('5 < 10') === '5 < 10');
    check('"<" متبوعةً برقمٍ لا تُمسّ', f('5 <3 10') === '5 <3 10');
}

/* ── ٦) نصٌّ عربيٌّ عاديّ يمرّ بلا تغيير ── */
{
    const normal = 'تفعيل حصة التربية البدنية ومتابعة الخطة الفصلية للمعلمين والمعلمات';
    check('نصٌّ عاديٌّ بلا رموزٍ خطرة يبقى كما هو تماماً', f(normal) === normal);
    check('قيمٌ فارغة/عدميّة لا تُسقط', f('') === '' && f(null) == null && f(undefined) == null);
}

/* ── ٧) الاستدعاء موصولٌ فعلاً بالحقلين اللذين يكتبان في البوّابة ── */
{
    check('wiring: setFieldValue (الزيارات المدرسيّة) يُمرِّر القيمة عبر sanitizeForPortal',
          /function setFieldValue\(el, value\) \{\s*el\.value = sanitizeForPortal\(value\);/.test(us));
    check('wiring: setVal (الزيارات الإشرافية) يُمرِّر القيمة عبر sanitizeForPortal',
          /function setVal\(el, v\) \{\s*el\.value = sanitizeForPortal\(v\);/.test(us));
}

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
