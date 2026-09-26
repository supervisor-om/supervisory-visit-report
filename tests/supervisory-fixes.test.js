// اختبار انحدار: node tests/supervisory-fixes.test.js
// يحرس أعطال مسار الزيارة الإشرافية التي كُشفت في 2026-09-26:
//   ١) «تعديل» يُحدّث التقرير ولا يُنشئ نسخةً ثانية (ويحسبها الشهريّ زيارتين)
//   ٢) التصفير محصورٌ في النموذج الإشرافيّ ولا يمسح زيارةً مدرسيّةً قيد الكتابة
//   ٣) الدرجات تُقرأ من formData لا من جذر التقرير وحده (الشارة والإحصائيات)
//   ٤) رسوم «التحليل البياني» مقلوبة المحور (1 = أفضل)
//   ٥) التصدير المفرد يتحقّق كالطابور ولا يخمّن درجةً
//   ٦) أسماء المعلمين والمدارس مُهرَّبةٌ قبل دخول HTML
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const SUP = read('js/supervisory.js');
const EXPORT = read('js/export.js');
const CHARTS = read('js/charts.js');
const STORAGE = read('js/storage.js');
const QUEUE = read('js/queue-export.js');
const INIT = read('js/init.js');
const HTML = read('reports.html');
const UTILS = read('js/utils.js');

/* ── ١) قراءة الدرجات: الدالّة الحقيقيّة من utils.js ── */
(function testScores() {
    const ctx = { window: {}, document: { getElementById: () => null }, console };
    ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(UTILS + '\nthis.svfReportScores = svfReportScores; this.svfEscapeHtml = svfEscapeHtml;', ctx);
    const scores = ctx.svfReportScores, esc = ctx.svfEscapeHtml;

    const modern = { formData: { 'score-2': '4', 'score-10': '5', 'score-1': '1', teacherName: 'س' } };
    check('scores: تُقرأ من formData مرتّبةً بترقيم البنود',
          JSON.stringify(scores(modern)) === '[1,4,5]', JSON.stringify(scores(modern)));
    check('scores: تُقرأ من جذر التقرير القديم',
          JSON.stringify(scores({ scores: [3, 3, 2] })) === '[3,3,2]');
    check('scores: القيم خارج ١-٥ تُستبعد ولا تُخمَّن',
          JSON.stringify(scores({ formData: { 'score-1': '0', 'score-2': '9', 'score-3': 'x', 'score-4': '2' } })) === '[2]');
    check('scores: تقريرٌ بلا درجاتٍ يُعطي مصفوفةً فارغة',
          scores({ formData: { teacherName: 'س' } }).length === 0 && scores(null).length === 0);

    check('escape: الأقواس والاقتباس تُهرَّب',
          esc('<img src=x onerror=1> "أ" \'ب\' & ج') === '&lt;img src=x onerror=1&gt; &quot;أ&quot; &#39;ب&#39; &amp; ج', esc('<a>'));
})();

/* ── ٢) بطاقة الأرشيف: الشارة تظهر، والاسم مُهرَّب ── */
(function testArchiveCard() {
    const cards = [];
    const mkEl = () => ({
        className: '', innerHTML: '', children: [],
        appendChild(c) { this.children.push(c); return c; },
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {}
    });
    const list = mkEl();
    const store = {
        'supervision_v6_visit_1': JSON.stringify({
            teacherName: 'معلم <script>alert(1)</script>', visitDate: '2026-09-20',
            school: 'مدرسة "الاختبار"',
            formData: Object.fromEntries(Array.from({ length: 13 }, (_, i) => ['score-' + (i + 1), i < 6 ? '1' : '2']))
        })
    };
    const ctx = {
        console,
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            key: i => Object.keys(store)[i] ?? null,
            get length() { return Object.keys(store).length; }
        },
        document: {
            querySelector: sel => sel === '#saved-reports-list' ? list
                : (sel === '#filter-reports-input' || sel === '#filter-reports-month') ? { value: '' }
                : sel === '#no-saved-reports-message' ? mkEl() : null,
            createElement: () => { const e = mkEl(); cards.push(e); return e; }
        },
        window: { svfIsSent: () => false, svfIsQueued: () => false }
    };
    ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(UTILS, ctx);
    vm.runInContext(EXPORT, ctx);
    vm.runInContext('renderSavedReports();', ctx);

    const html = cards.map(c => c.innerHTML).join('');
    check('card: شارة المجموع تظهر لتقريرٍ محفوظٍ حديثاً',
          /\b20 \/ 65\b/.test(html), (html.match(/\d+ \/ \d+/) || ['لا شارة'])[0]);
    check('card: اسم المعلّم يدخل مُهرَّباً لا وسماً',
          html.includes('&lt;script&gt;') && !html.includes('<script>alert'), 'دخل خاماً');
    check('card: اقتباس اسم المدرسة مُهرَّب', html.includes('&quot;الاختبار&quot;'));
})();

/* ── ٣) «تعديل» يُحدّث في مكانه ── */
(function testEditing() {
    check('edit: loadPermanentReport يضبط مفتاح التعديل',
          /function loadPermanentReport[\s\S]{0,1400}setEditingKey\(reportKey, data\)/.test(SUP), 'لا يُضبط');
    check('edit: الحفظ يستعمل المفتاح المفتوح بدل إنشاء مفتاحٍ جديد',
          /const reportId = editing \? currentEditingKey : `supervision_v6_visit_\$\{Date\.now\(\)\}`/.test(SUP));
    check('edit: لا حذف للتقرير قبل الكتابة عليه',
          !/localStorage\.removeItem\(currentEditingKey\)/.test(SUP), 'ما زال يُحذف أولاً');
    check('edit: تغيير الاسم أو التاريخ ينظّف أرشيف الرسوم القديم',
          /oldName !== teacherName \|\| oldDate !== visitDate/.test(SUP));
    check('edit: لافتة التعديل وزرّ «تقرير جديد» في الصفحة',
          HTML.includes('id="editingBanner"') && HTML.includes('id="newReportBtn"'));
    check('edit: زرّ «تقرير جديد» موصولٌ في init.js', /newReportBtn/.test(INIT));
    check('edit: تصفير النموذج يفكّ الارتباط بالتقرير',
          /function performReset[\s\S]{0,900}setEditingKey\(null\)/.test(SUP));
})();

/* ── ٤) التصفير محصورٌ في النموذج الإشرافيّ ── */
(function testReset() {
    const body = SUP.slice(SUP.indexOf('function performReset'), SUP.indexOf('function savePermanentReport'));
    check('reset: النطاق #form-view لا المستند كلّه',
          /#form-view/.test(body) && !/document\.querySelectorAll\('input:not\(\[type="button"\]\), textarea'\)/.test(body),
          'ما زال يمسح الصفحة كلّها');
    check('reset: أزرار الاختيار مستثناة من التفريغ',
          /:not\(\[type="radio"\]\):not\(\[type="checkbox"\]\)/.test(body), 'تُفرَّغ قيمتها');
    check('gender: قراءة الجنس تردّ القيمة غير الصالحة إلى صفر',
          /Number\.isFinite\(v\) \? v : 0/.test(SUP));
})();

/* ── ٥) الإحصائيات والرسوم ── */
(function testCharts() {
    check('stats: توزيع التقييمات يقرأ الدرجات بالدالّة المشتركة',
          /svfReportScores\(r\)\.forEach/.test(CHARTS));
    check('stats: متوسط الأداء يقرؤها كذلك',
          /\.map\(r => \(\{ r, sc: svfReportScores\(r\) \}\)\)/.test(CHARTS));
    check('stats: لم يبقَ اعتمادٌ على مصفوفة الجذر وحدها',
          !/Array\.isArray\(r\.scores\)/.test(CHARTS), 'ما زال يقرأ الجذر وحده');
    check('dashboard: محورا الرادار والأعمدة مقلوبان (1 = أفضل)',
          (STORAGE.match(/reverse: true/g) || []).length >= 2, 'غير مقلوبين');
    check('dashboard: البند بلا درجةٍ لا يُحسب صفراً',
          /function svfScoreOf/.test(STORAGE) && /\.filter\(n => n !== null\)/.test(STORAGE));
})();

/* ── ٦) التصدير المفرد يتحقّق كالطابور ── */
(function testExportValidation() {
    check('export: الطابور يُصدّر دالّة التحقّق', /window\.svfValidateVisit = validate;/.test(QUEUE));
    check('export: التصدير المفرد يستدعيها قبل فتح البوّابة',
          /svfValidateVisit\(exportData\)[\s\S]{0,260}return;[\s\S]{0,120}JSON\.stringify\(exportData\)/.test(EXPORT),
          'لا يتحقّق أو يتحقّق بعد الفتح');
    check('export: البند بلا درجةٍ يبقى null ولا يُخمَّن «3»',
          /\(n >= 1 && n <= 5\) \? n : null/.test(EXPORT) && !/textContent\?\.trim\(\) \|\| '3'/.test(EXPORT));

    // التحقّق نفسه: الدالّة الحقيقيّة من queue-export.js
    const ctx = { window: {}, document: { getElementById: () => null, querySelector: () => null, addEventListener() {} },
                  localStorage: { getItem: () => null, setItem() {} }, console };
    ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(QUEUE, ctx);
    const validate = ctx.window.svfValidateVisit;
    const full = { teacher: 'أ', date: '20/09/2026', lessonTitle: 'درس', ratings: Array(13).fill(3) };
    check('validate: زيارةٌ مكتملةٌ تمرّ', validate(full).length === 0, JSON.stringify(validate(full)));
    check('validate: بلا عنوان درسٍ تُردّ (وهو ما ترفضه البوّابة)',
          validate({ ...full, lessonTitle: '' }).some(g => /عنوان الدرس/.test(g)));
    check('validate: بندٌ بلا تقييمٍ يُردّ باسم رقمه',
          validate({ ...full, ratings: [null, ...Array(12).fill(3)] }).some(g => /تقييم البند 1/.test(g)));
})();

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
