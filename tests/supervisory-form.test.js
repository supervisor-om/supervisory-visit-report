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
    recs: 'نص-التوصيات-الفريد', notes: 'نص-الملاحظات-الفريد', scores
};
const html = ctx.getReportHTML(base, false);

const plain = h => String(h)
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[‎‏]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const text = plain(html);

/* ── ١) نصوص الاستمارة الجديدة بترتيبها (2026-10-11) ──
   منقولةٌ من صفحتها الثالثة (استمارة_الزيارة_الإشرافية_لمعلم_مادة_مجال2026_2027.pdf) بترتيب ظهورها في
   صفوف الجدول: المجال، المعيار، البند… وعنوان «الجوانب التي تحتاج إلى تطوير» يقع في صفّ البند ٦. */
const NEW_FORM = [
    'استمارة زيارة إشرافية لمعلم مادة/ مجال',
    'المجال', 'المعيار', 'البنود', 'المؤشرات', 'التقدير', 'جوانب الإجادة في الأداء وأدلتها',
    'الإنجاز الدراسي', 'التحصيل الدراسي', 'تحصيل الطلبة في الأعمال الصفية وغير الصفية.',
    'التقدم الدراسي', 'التقدم الدراسي للطلبة بما فيهم الطلبة ذوي الإعاقة/ الاحتياجات التعليمية.',
    'مهارات التعلم', 'تطبيق مهارات التعلم (الأساسية – الرقمية - العليا) وربطها بالواقع.',
    'النمو الشخصي', 'القيم والسلوك', 'تمسك الطلبة بالهوية العمانية والقيم الإنسانية.',
    'مناخ المدرسة وبيئة التعلم', 'جودة بيئة التعلم', 'متابعة جوانب الأمن والسلامة والنظافة في بيئة التعلم.',
    'التدريس والتقويم', 'تخطيط المنهاج الدراسي', 'تخطيط المنهاج الدراسي لتحقيق نواتج التعلم.',
    'الجوانب التي تحتاج إلى تطوير في الأداء وأدلتها',
    'إدارة الصف', 'فاعلية الإدارة الصفية.',
    'فاعلية التدريس', 'توظيف استراتيجيات التدريس الفعالة.', 'تفعيل المصادر والموارد التعليمية.',
    'التقويم، ومساندة التقدم', 'توظيف أساليب تقويم متنوعة.',
    'القيادة والإدارة والحوكمة', 'قيادة التغيير', 'توظيف التقويم الذاتي والتطوير المهني في تحسين الأداء.',
    'الحوكمة', 'الالتزام بأخلاقيات المهنة والقوانين واللوائح والقرارات المنظمة للعمل.',
    'تنفيذ مبادرات وأنشطة تربوية في المجتمع المدرسي/ المحلي.',
    'الملاحظات:', 'الدعم المقدم:', 'التوصيات:',
    'معيار التقييم: متميز (1) - جيد (2) - ملائم (3) - غير ملائم (4) - يحتاج إلى تدخل (5)'
];
{
    let at = 0; const missing = [];
    NEW_FORM.forEach(t => { const i = text.indexOf(t, at); if (i < 0) missing.push(t); else at = i + t.length; });
    check('الاستمارة الجديدة: كلّ نصٍّ ثابتٍ فيها موجودٌ في المُصدَّر وبالترتيب نفسه', missing.length === 0, missing.slice(0, 3).join(' | '));
    check('لا بقايا من الاستمارة السابقة',
          !/الذاتي - التعاوني|تطبيق السياسات والأنظمة|لمعلم مجال\/ مادة/.test(text));
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
    // تصنيف الاستمارة الجديدة (2026-10-11): الإنجاز ١–٣، النمو ٤، المناخ ٥، التدريس والتقويم ٦–١٠، القيادة ١١–١٣
    const dom = { 'الإنجاز الدراسي': 3, 'النمو الشخصي': 1, 'مناخ المدرسة وبيئة التعلم': 1, 'التدريس والتقويم': 5, 'القيادة والإدارة والحوكمة': 3 };
    check('المجال: دمجٌ رأسيٌّ 3+1+1+5+3', Object.entries(dom).every(([k, n]) => {
        const c = cellsWith(k);
        return n === 1 ? (c.length === 0 || JSON.stringify(c) === '[1]') && text.includes(k) : JSON.stringify(c) === JSON.stringify([n]);
    }), JSON.stringify(Object.keys(dom).map(cellsWith)));
    check('المعيار: «فاعلية التدريس» و«الحوكمة» تشملان بندين، و«قيادة التغيير» بندٌ واحد',
          JSON.stringify(cellsWith('فاعلية التدريس')) === '[2]' && JSON.stringify(cellsWith('الحوكمة')) === '[2]'
          && (cellsWith('قيادة التغيير')[0] || 1) === 1);
    check('مهارات التعلم تحت «الإنجاز الدراسي»، وتخطيط المنهاج وإدارة الصف تحت «التدريس والتقويم»', (() => {
        const rows = html.match(/<tr>[\s\S]*?<\/tr>/g).map(plain);
        const idx = t => rows.findIndex(r => r.includes(t));
        const dRow = d => rows.findIndex(r => r.startsWith(d));
        return dRow('الإنجاز الدراسي') < idx('مهارات التعلم') && idx('مهارات التعلم') < dRow('النمو الشخصي')
            && dRow('التدريس والتقويم') === idx('تخطيط المنهاج الدراسي') && idx('إدارة الصف') > idx('تخطيط المنهاج الدراسي');
    })());

    const side = [...html.matchAll(/<td rowspan="(\d+)"[^>]*vertical-align:top;">([\s\S]*?)<\/td>/g)].map(m => [+m[1], plain(m[2])]);
    check('عمود الإجادة يشمل البنود 1–5 ويحمل نصّه', side[0] && side[0][0] === 5 && side[0][1] === 'نص-الإجادة-الفريد', JSON.stringify(side[0]));
    check('عمود التطوير يشمل 6–13 وعنوانه داخل الخليّة قبل نصّه',
          side[1] && side[1][0] === 8 && side[1][1] === 'الجوانب التي تحتاج إلى تطوير في الأداء وأدلتها نص-التطوير-الفريد', JSON.stringify(side[1]));

    // آخر صفٍّ في جدول التقييم تحديداً — لا في صفّ الزائر الذي يليه في جدولٍ ثالث
    const evalTableEnd = html.indexOf('</table>', html.indexOf('<thead>'));
    const lastRow = html.slice(html.lastIndexOf('<tr>', evalTableEnd), evalTableEnd);
    check('الملاحظات والدعم المقدم والتوصيات: آخر صفٍّ في جدول التقييم نفسه بخليّةٍ تشمل الأعمدة الستّة',
          /<td colspan="6"/.test(lastRow) && plain(lastRow) === 'الملاحظات: نص-الملاحظات-الفريد الدعم المقدم: لا يوجد التوصيات: نص-التوصيات-الفريد', plain(lastRow));

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

/* ── ٣ب) جمل المستويات من «قواعد تقييم بنود الاستمارة» الجديدة، وأدلّة الموائمة كما هي ── */
{
    vm.runInContext('this.evidenceBasedContent = evidenceBasedContent;', ctx);
    const L = ctx.evidenceBasedContent;
    const lv = (id, n) => L[String(id)].levels[n];
    check('المستوى ٢ «جيد/جيدة» لا «فاعل» (البنود ١–٤ و٨ و١٠ و١١)',
          [1, 2, 3, 4, 8, 10, 11].every(id => /جيد/.test(lv(id, 2)) && !/فاعل/.test(lv(id, 2))),
          [1, 2, 3, 4, 8, 10, 11].filter(id => !/جيد/.test(lv(id, 2))).join(','));
    check('«قليل من» و«عدد نادر من» كما في القواعد', /قليل من الطلبة/.test(lv(1, 4)) && /عدد نادر من الطلبة/.test(lv(1, 5)));
    check('البند ٣: مهارات التعلم (الأساسية – الرقمية - العليا)', [1, 2, 3, 4, 5].every(n => lv(3, n).includes('(الأساسية – الرقمية - العليا)')));
    check('البند ٨: «استراتيجيات تدريس فعالة»', [1, 2, 3, 4, 5].every(n => lv(8, n).includes('استراتيجيات تدريس فعالة')));
    check('البند ٩: المستوى ١ بالمختبرات والمصادر، والباقي بدونهما كما في القواعد',
          /والمختبرات، والمصادر/.test(lv(9, 1)) && [2, 3, 4, 5].every(n => !/المختبرات/.test(lv(9, n))));
    check('البند ١٠: «بما ينعكس على تعلمهم»', [1, 2, 3, 4, 5].every(n => lv(10, n).includes('بما ينعكس على تعلمهم')));
    check('البند ١٢: الالتزام بأخلاقيات المهنة', [1, 2, 3, 4, 5].every(n => lv(12, n).includes('بأخلاقيات المهنة والقوانين واللوائح والقرارات المنظمة للعمل')));
    check('البند ١٣: المجتمع المدرسي/ المحلي، و«نادراً ما» في الخامس',
          [1, 2, 3, 4, 5].every(n => lv(13, n).includes('المجتمع المدرسي/ المحلي')) && /^نادرا ما/.test(lv(13, 5)));
    check('بدائل الجنس باقيةٌ في جمل المعلّم', /\[يوظف المعلم\/توظف المعلمة\]/.test(lv(8, 1)) && /\[يلتزم\/تلتزم\]/.test(lv(12, 1)));
    check('أدلّة الموائمة (الرياضة المدرسية) لم تُمسّ',
          Object.values(L).every(c => c.evidences.length === 5 && c.neg_evidences.length === 5)
          && L['1'].evidences.includes('أداء المهارة وفق الخطوات الفنية الصحيحة')
          && L['12'].evidences.includes('المحافظة على عهدة التربية الرياضية وسجلاتها'));
    check('شاشة التقييم: المعايير والعناوين كالاستمارة، والوصف الموائم باقٍ', (() => {
        const e = ctx.evaluationItems;
        return e[10].standard === 'قيادة التغيير' && e[11].standard === 'الحوكمة' && e[12].standard === 'الحوكمة'
            && /الأساسية – الرقمية - العليا/.test(e[2].title) && /بأخلاقيات المهنة/.test(e[11].title)
            && e[3].desc === '(الروح الرياضية وأخلاقيات اللعب)';
    })());
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
