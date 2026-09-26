// اختبار انحدار: node tests/supervisory-form.test.js
// استمارة الزيارة الإشرافيّة المُصدَّرة (Word/PDF) مطابقةٌ للقالب الرسميّ 2026/2027:
//   ١) كلّ نصٍّ ثابتٍ في القالب (tests/fixtures/supervisory-form-2026.docx) موجودٌ في المُصدَّر بترتيبه
//   ٢) البنية: جدول معلوماتٍ + جدول تقييمٍ متّصلٌ بدمجٍ رأسيٍّ صحيح (والتوصيات صفٌّ فيه) + صفّ الزائر
//   ٣) بلا شعاراتٍ ولا صفٍّ للزائر (لا وجود لهما في القالب)، والعام الدراسي من تاريخ الزيارة
//   ٤) ارتباط الأرقام: officialFormItems بترتيب evaluationItems نفسه (البوّابة تلتقط بالترتيب لا بالأسماء)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const ctx = { console, document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, window: {} };
vm.createContext(ctx);
['js/templates.js', 'js/export.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n', ctx, { filename: f }));
vm.runInContext('this.getReportHTML = getReportHTML; this.officialFormItems = officialFormItems; this.evaluationItems = evaluationItems;', ctx);

const scores = {};
for (let i = 1; i <= 13; i++) scores['item-' + i] = String(((i * 7) % 5) + 1);
const base = {
    school: 'مدرسة النور (5-12)', teacher: 'عدنان سالم الحارثي', subject: '', date: '2026-09-25',
    fileNo: '16203690', visitNo: '2', className: '10/3', lesson: 'الثالثة', topic: 'التمرير الصدري',
    visitorName: 'أسعد الخصيبي', visitorPosition: 'مشرف', strengths: 'نص-الإجادة-الفريد', needs: 'نص-التطوير-الفريد',
    recs: 'نص-التوصيات-الفريد', scores
};
const html = ctx.getReportHTML(base, false);

const plain = h => String(h)
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[‎‏]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const text = plain(html);

/* ── ١) نصوص القالب الرسميّ بترتيبها ── */
{
    const tpl = path.join(ROOT, 'tests/fixtures/supervisory-form-2026.docx');
    const xml = execFileSync('unzip', ['-p', tpl, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
    const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const tokens = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
        .map(p => plain(dec((p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))))
        .filter(t => t && !/^\d+$/.test(t));                       // أرقام البنود تُفحص بنيوياً أدناه
    check('القالب: النصوص الثابتة مستخرجةٌ (٥٠ فأكثر)', tokens.length >= 50, String(tokens.length));

    let at = 0; const missing = [];
    tokens.forEach(t => { const i = text.indexOf(t, at); if (i < 0) missing.push(t); else at = i + t.length; });
    check('القالب: كلّ نصٍّ ثابتٍ فيه موجودٌ في المُصدَّر وبالترتيب نفسه', missing.length === 0, missing.slice(0, 3).join(' | '));
}

/* ── ٢) البنية ── */
{
    check('جدول تقييمٍ واحدٌ متّصل (لا جدولان بفاصل صفحة)، وجدول معلوماتٍ، وصفّ الزائر جدولٌ ثالثٌ منفصل',
          (html.match(/<table/g) || []).length === 3 && !/page-break/.test(html), String((html.match(/<table/g) || []).length));
    check('رأس جدول التقييم: الأعمدة الستّة بترتيبها', (() => {
        const head = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
        const cols = (head.match(/<th[\s\S]*?<\/th>/g) || []).map(plain);
        return JSON.stringify(cols) === JSON.stringify(['المجال', 'المعيار', 'البنود', 'المؤشرات', 'التقدير', 'جوانب الإجادة في الأداء وأدلتها']);
    })());

    const cellsWith = (label) => [...html.matchAll(/<td rowspan="(\d+)"[^>]*>([\s\S]*?)<\/td>/g)]
        .filter(m => plain(m[2]) === label).map(m => +m[1]);
    const dom = { 'الإنجاز الدراسي': 2, 'النمو الشخصي': 2, 'مناخ المدرسة وبيئة التعلم': 3, 'التدريس والتقويم': 3, 'القيادة والإدارة والحوكمة': 3 };
    check('المجال: دمجٌ رأسيٌّ 2+2+3+3+3', Object.entries(dom).every(([k, n]) => JSON.stringify(cellsWith(k)) === JSON.stringify([n])),
          JSON.stringify(Object.keys(dom).map(cellsWith)));
    check('المعيار: «فاعلية التدريس» و«القيادة» تشملان بندين، والباقي بندٌ واحد',
          JSON.stringify(cellsWith('فاعلية التدريس')) === '[2]' && JSON.stringify(cellsWith('القيادة')) === '[2]'
          && cellsWith('الحوكمة')[0] === 1 && cellsWith('مهارات التعلم')[0] === 1 && cellsWith('إدارة الصف')[0] === 1);
    check('مهارات التعلم تحت «النمو الشخصي» وتخطيط المنهاج وإدارة الصف تحت «مناخ المدرسة» (تصنيف القالب الجديد)', (() => {
        const rows = html.match(/<tr>[\s\S]*?<\/tr>/g).map(plain);
        const idx = t => rows.findIndex(r => r.includes(t));
        const dRow = d => rows.findIndex(r => r.startsWith(d));
        return dRow('النمو الشخصي') === idx('مهارات التعلم') && dRow('مناخ المدرسة وبيئة التعلم') === idx('جودة بيئة التعلم')
            && idx('تخطيط المنهاج الدراسي') > idx('جودة بيئة التعلم') && idx('إدارة الصف') > idx('تخطيط المنهاج الدراسي');
    })());

    const side = [...html.matchAll(/<td rowspan="(\d+)"[^>]*vertical-align:top;">([\s\S]*?)<\/td>/g)].map(m => [+m[1], plain(m[2])]);
    check('عمود الإجادة يشمل البنود 1–7 ويحمل نصّه', side[0] && side[0][0] === 7 && side[0][1] === 'نص-الإجادة-الفريد', JSON.stringify(side[0]));
    check('عمود التطوير يشمل 8–13 وعنوانه داخل الخليّة قبل نصّه',
          side[1] && side[1][0] === 6 && side[1][1] === 'الجوانب التي تحتاج إلى تطوير في الأداء وأدلتها نص-التطوير-الفريد', JSON.stringify(side[1]));

    // آخر صفٍّ في جدول التقييم تحديداً — لا في صفّ الزائر الذي يليه في جدولٍ ثالث
    const evalTableEnd = html.indexOf('</table>', html.indexOf('<thead>'));
    const lastRow = html.slice(html.lastIndexOf('<tr>', evalTableEnd), evalTableEnd);
    check('التوصيات: آخر صفٍّ في جدول التقييم نفسه بخليّةٍ تشمل الأعمدة الستّة',
          /<td colspan="6"/.test(lastRow) && plain(lastRow) === 'التوصيات: نص-التوصيات-الفريد', plain(lastRow));

    check('التقدير: درجة كلّ بندٍ في صفّه بترتيب البنود', (() => {
        const rows = html.match(/<tr>[\s\S]*?<\/tr>/g).filter(r => /<td[^>]*>\s*<p[^>]*>\s*\d+\s*<\/p>\s*<\/td>\s*<td[^>]*>\s*<p[^>]*>[^<]+\.\s*<\/p>/.test(r));
        return rows.length === 13 && rows.every((r, i) => {
            const tds = r.match(/<td[\s\S]*?<\/td>/g).map(plain);
            const k = tds.findIndex(t => /\.$/.test(t));
            return tds[k - 1] === String(i + 1) && tds[k + 1] === scores['item-' + (i + 1)];
        });
    })());
}

/* ── ٣) ما ليس في القالب وما يُشتقّ ── */
{
    check('بلا شعاراتٍ ولا صور', !/<img/.test(html) && !/imgur/.test(html));
    check('بلا «نموذج رئيسي» ولا عنوانٍ فرعيّ (غير موجودين في القالب)',
          !/نموذج رئيسي/.test(text) && !/عملية إعداد/.test(text));
    check('صفّ اسم الزائر ووظيفته: أعاده المشرف بعد القالب الجديد — بعد جدول التقييم (بعد التوصيات) لا داخله',
          html.indexOf('التوصيات:') < html.indexOf('اسم الزائر') && /اسم الزائر: أسعد الخصيبي/.test(text) && /الوظيفة: مشرف/.test(text));
    check('المادة/المجال: «رياضة مدرسية» حين تكون فارغة، وما كُتب يغلبها',
          /المادة\/ المجال: رياضة مدرسية/.test(text) && /المادة\/ المجال: تربية بدنية/.test(plain(ctx.getReportHTML(Object.assign({}, base, { subject: 'تربية بدنية' })))));

    const year = d => (plain(ctx.getReportHTML(Object.assign({}, base, { date: d }))).match(/العام الدراسي: \((\S+)م\)/) || [])[1];
    check('العام الدراسي: سبتمبر 2026 ← 2026/2027', year('2026-09-25') === '2026/2027', year('2026-09-25'));
    check('العام الدراسي: مارس 2027 ← 2026/2027 (الفصل الثاني)', year('2027-03-10') === '2026/2027', year('2027-03-10'));
    check('العام الدراسي: سبتمبر 2027 ← 2027/2028', year('2027-09-01') === '2027/2028', year('2027-09-01'));
    check('العام الدراسي: بلا تاريخٍ ← كما في القالب 2026/2027', year('') === '2026/2027', year(''));
}

/* ── ٤) الترتيب والأرقام واحدةٌ مع evaluationItems ── */
{
    const a = ctx.officialFormItems, b = ctx.evaluationItems;
    check('١٣ بنداً بالأرقام والترتيب نفسيهما (الالتقاط في البوّابة بالترتيب)',
          a.length === 13 && b.length === 13 && a.every((x, i) => x.id === b[i].id && x.id === i + 1));
    check('عناوين البنود بنقطةٍ في آخرها كما في القالب', a.every(x => /\.$/.test(x.title)));
}

/* ── ٥) التوصيل: لا جلب شعاراتٍ، وهامش الصفحة العلويّ كالقالب ── */
{
    const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    check('لا جلب شعاراتٍ من الشبكة في export.js ولا monthly.js', !/imgur|getBase64Image|imgMinistry/.test(rd('js/export.js') + rd('js/monthly.js')));
    check('تصدير Word (المفرد والمرفقات): الهامش العلويّ 360 كالقالب',
          /margins: \{ top: 360, bottom: 720, left: 720, right: 720 \}/.test(rd('js/supervisory.js'))
          && /margins: \{ top: 360, bottom: 720, left: 720, right: 720 \}/.test(rd('js/monthly.js')));
    check('كلّ نصّ خليّةٍ في فقرةٍ بلا هوامش (وإلّا فاض الجدول عن صفحةٍ في Word)',
          /const p = \(text, style\) => `<p style="margin:0; mso-margin-top-alt:0pt; mso-margin-bottom-alt:0pt;/.test(rd('js/export.js')));
}

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
