// اختبار انحدار: node tests/monthly.test.js
//   ١) القواعد: أيّام الدوام، واختصار أسماء المدارس، وبناء الصفوف من الخطة والتقارير
//   ٢) «مرفق»: الزيارة الإشرافيّة التي لم يؤكَّد حفظها في البوّابة، وعدّها في المجموع
//   ٣) المجاميع ونسبة الإنجاز والأسباب
//   ٤) ملء نموذج Word: النصوص في مواضعها، والتنسيق مستنسخٌ من النموذج حرفاً
//      (يحتاج نموذج المشرف — يُمرَّر بـ SVF_MONTHLY_TEMPLATE، وإلّا تُتخطّى)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'js/monthly-core.js'));
const D = require(path.join(ROOT, 'js/monthly-docx.js'));

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ── ١) أيّام الدوام واختصار الأسماء ── */
{
    const jun = C.workingDays(2026, 5);          // يونيو 2026: الجمعة والسبت عطلة
    check('أيّام الدوام: يونيو 2026 اثنان وعشرون يوماً', jun.length === 22, String(jun.length));
    check('أيّام الدوام: تبدأ بالاثنين 1 وتنتهي بالثلاثاء 30',
          jun[0].day === 1 && jun[0].weekday === 1 && jun[jun.length - 1].day === 30, JSON.stringify([jun[0], jun[jun.length - 1]]));
    check('أيّام الدوام: لا جمعة ولا سبت', jun.every(d => d.weekday <= 4));

    const s = (n, p) => C.shortSchool(n, p);
    check('الاسم: تُحذف «مدرسة» ونطاق الصفوف', s('مدرسة حفص بن راشد (5-10)') === 'حفص بن راشد', s('مدرسة حفص بن راشد (5-10)'));
    check('الاسم: «للتعليم الأساسي» تُحذف', s('ابو تمام للتعليم الأساسي (1-4)') === 'ابو تمام', s('ابو تمام للتعليم الأساسي (1-4)'));
    check('الاسم: الخاصّة تُعلَّم (خ)', s('الريادة الخاصة', true) === 'الريادة (خ)', s('الريادة الخاصة', true));
    check('الاسم: الخاصّة تُعرف من اسمها ولو لم يُمرَّر النوع', s('مدرسة الموالح الخاصة') === 'الموالح (خ)', s('مدرسة الموالح الخاصة'));
    check('الاسم: «للبنين» تميّز المدرسة فتبقى', s('يزيد بن حاتم للبنين (9-12)') === 'يزيد بن حاتم للبنين', s('يزيد بن حاتم للبنين (9-12)'));
    check('الاسم الأوّل للمعلّم', C.firstName('دينا اشرف حبيب') === 'دينا' && C.firstName('أ. علي بن راشد') === 'علي');
}

/* ── ٢) بناء الصفوف ── */
const iso = (d) => `2026-06-${String(d).padStart(2, '0')}`;
const portal = (d) => `${String(d).padStart(2, '0')}/06/2026`;
const base = {
    year: 2026, month0: 5,
    plan: { d_1: 'مشاعل مسقط', d_2: 'الريادة', d_3: 'حفص بن راشد', d_4: 'مكتب', d_7: 'ابو تمام' },
    events: { '2026_5_18': 'إجازة رأس السنة الهجرية' },
    schoolReports: [
        { key: 's1', schoolName: 'مدرسة مشاعل مسقط الخاصة', visitDate: iso(1), visitType: 'private_exploratory' },
        { key: 's2', schoolName: 'الريادة الخاصة', visitDate: iso(2), visitType: 'private_exploratory' },
        { key: 's3', schoolName: 'مدرسة النور (1-4)', visitDate: iso(2), visitType: 'gov_exploratory' },
        { key: 's4', schoolName: 'حفص بن راشد (5-10)', visitDate: iso(3), visitType: 'gov_exploratory' }
    ],
    supReports: [
        { key: 'v1', teacherName: 'دينا اشرف حبيب', visitDate: iso(1), school: 'مشاعل مسقط' },
        { key: 'v2', teacherName: 'علي بن راشد الشبلي', visitDate: iso(2), school: 'الريادة' },
        { key: 'v3', teacherName: 'علي بن راشد الشبلي', visitDate: iso(2), school: 'الريادة' }
    ],
    sentSchool: new Set(['مدرسة مشاعل مسقط الخاصة|' + portal(1), 'الريادة الخاصة|' + portal(2), 'مدرسة النور (1-4)|' + portal(2)]),
    sentSup: new Set(['علي بن راشد الشبلي|' + portal(2)]),
    overrides: {}
};
{
    const rows = C.buildRows(base);
    const by = d => rows.find(r => r.day === d);
    check('الخطة: من خطة السير', by(1).planned === 'مشاعل مسقط' && by(7).planned === 'ابو تمام');
    check('الخطة: الفعاليّة الإلزاميّة تتقدّم', by(18).planned === 'إجازة رأس السنة الهجرية');
    check('الخطة: يومٌ بلا خطة = مكتب', by(8).planned === 'مكتب');
    check('المنفَّذ: من تقارير الزيارات، ومدرستان بعلامة +',
          by(1).executed === 'مشاعل مسقط (خ)' && by(2).executed === 'الريادة (خ) + النور', by(2).executed);
    check('المنفَّذ: بلا تقرير = مكتب', by(4).executed === 'مكتب');
    check('المنفَّذ: يوم الإجازة الرسميّة يبقى إجازة', by(18).executed === 'إجازة رأس السنة الهجرية');
    check('✓: بعدد الزيارات المؤكَّد حفظها', by(1).marks === 1 && by(2).marks === 2 && by(3).marks === 0,
          JSON.stringify([by(1).marks, by(2).marks, by(3).marks]));
    check('✓: زيارةٌ لم تُرفع تُنبَّه ولا تُعدّ', by(3).marks === 0 && /لم يُؤكَّد/.test(by(3).warnings.join()), by(3).warnings.join());
    check('تنبيه: خطةُ زيارةٍ بلا تقرير', /ولا تقرير زيارة/.test(by(7).warnings.join()), by(7).warnings.join());
    check('الإشرافيّة: «(مرفق)» لمن لم يؤكَّد حفظه في البوّابة',
          by(1).supervisory === '(1) أ. دينا (مرفق)', by(1).supervisory);
    check('الإشرافيّة: زيارتان لمعلّمٍ واحدٍ تُعدّان (2) وبلا «مرفق» إن حُفظتا',
          by(2).supervisory === '(2) أ. علي', by(2).supervisory);
    check('الأساليب: مع زيارةٍ صفّيّة', by(1).methods === C.METHOD_CLASSROOM, by(1).methods);
    check('الأساليب: زيارةٌ مدرسيّةٌ بلا صفّيّة', by(3).methods === C.METHOD_SCHOOL, by(3).methods);
    check('الأساليب: يومُ مكتبٍ بلا شيء', by(4).methods === '-', by(4).methods);

    const t = C.totals(rows);
    check('المجموع: أيّام الخطة بلا الإجازة الرسميّة', t.planned === 21, String(t.planned));
    check('المجموع: المنفَّذ', t.executed === 21, String(t.executed));
    check('المجموع: ✓ ثلاث زيارات', t.schools === 3, String(t.schools));
    check('المجموع: الإشرافيّة «2+(1) مرفق = 3»', t.supText === '2+(1) مرفق = 3', t.supText);
    check('نسبة الإنجاز', t.rate === 100, String(t.rate));

    // إجازةٌ لم تكن في الخطة: تُنقص المنفَّذ وتظهر في الأسباب
    const sick = C.buildRows(Object.assign({}, base, { overrides: { 4: { executed: 'إجازة مرضية' } } }));
    const t2 = C.totals(sick);
    check('الإجازة الطارئة: تُنقص المنفَّذ', t2.executed === 20 && t2.planned === 21, JSON.stringify([t2.executed, t2.planned]));
    check('الإجازة الطارئة: نسبة 95%', t2.rate === 95, String(t2.rate));
    check('الإجازة الطارئة: تظهر في الأسباب', t2.autoReasons === 'إجازة مرضية (1)', t2.autoReasons);
    check('التعديل اليدويّ يغلب ما استُنتج', sick.find(r => r.day === 4).executed === 'إجازة مرضية');

    // «مرفق» يُحدّد ملفّات الحزمة وترتيبها
    const att = C.attachments(rows, base.supReports);
    check('المرفقات: ملفٌّ واحدٌ لزيارة «مرفق» وحدها', att.length === 1, String(att.length));
    check('المرفقات: الاسم كما يصدّره الموقع', att[0].fileName === '1 - مشاعل مسقط - دينا اشرف حبيب.docx', att[0].fileName);

    check('عدّ الإشرافيّة من نصٍّ مكتوبٍ باليد',
          JSON.stringify(C.countSupervisory('(1) أ. دينا (مرفق) + (2) أ. علي')) === JSON.stringify({ portal: 2, attached: 1, total: 3 }),
          JSON.stringify(C.countSupervisory('(1) أ. دينا (مرفق) + (2) أ. علي')));
}

/* ── ٢ب) زيارتان إشرافيّتان في يومٍ واحدٍ لمعلّمين في مدرستين مختلفتين ── */
const multiSchool = Object.assign({}, base, {
    supReports: base.supReports.concat([
        { key: 'v4', teacherName: 'عدنان سالم الحارثي', visitDate: iso(9), school: 'مشاعل مسقط' },
        { key: 'v5', teacherName: 'خالصة راشد المعمري', visitDate: iso(9), school: 'مدرسة الريادة الخاصة' }
    ])
});
{
    const rows = C.buildRows(multiSchool);
    const day9 = rows.find(r => r.day === 9);
    check('مدرستان: سطرٌ لكلّ معلّمٍ لا «+» بينهما',
          day9.supervisory.split('\n').length === 2, day9.supervisory);
    check('مدرستان: كلّ سطرٍ يحمل اسم مدرسته مختصراً بعد اسم المعلّم',
          day9.supervisory === '(1) أ. عدنان- مشاعل مسقط (مرفق)\n(1) أ. خالصة- الريادة (خ) (مرفق)',
          day9.supervisory);
    check('مدرستان: عدّ الإشرافيّة يُقسَّم على السطر أيضاً لا «+» وحدها',
          JSON.stringify(C.countSupervisory(day9.supervisory)) === JSON.stringify({ portal: 0, attached: 2, total: 2 }),
          JSON.stringify(C.countSupervisory(day9.supervisory)));

    // مدرسةٌ واحدةٌ بين معلّمي اليوم (كما في base) تبقى بصيغتها القديمة — لا رجعةً في هذا
    const by = d => rows.find(r => r.day === d);
    check('مدرسةٌ واحدة: الصيغة القديمة (+) بلا اسم مدرسةٍ تبقى كما هي',
          by(2).supervisory === '(2) أ. علي', by(2).supervisory);
}

/* ── ٣) ملء نموذج Word ── */
const TPL = process.env.SVF_MONTHLY_TEMPLATE ||
    'C:\\Users\\PC10\\OneDrive - Ministry Of Education - Oman\\التقارير الشهرية\\‏‏‏‏‏‏‏‏‏6- اسعد تقرير يونيو\\‏6- اسعد تقرير يونيو.docx';
if (!fs.existsSync(TPL)) {
    console.log('SKIP نموذج Word غير موجود — مرّره بـ SVF_MONTHLY_TEMPLATE للاختبار الكامل');
} else {
    const xml = execFileSync('unzip', ['-p', TPL, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
    const rows = C.buildRows(base);
    const totals = C.totals(rows, 'إجازة مرضية (1)(123)');
    const res = D.fill(xml, { monthName: 'يونيو', year: 2026, rows, totals });

    const tags = ['w:tbl', 'w:tr', 'w:tc', 'w:p', 'w:r'];
    const balanced = tags.every(t => (res.xml.match(new RegExp('<' + t + '[ >]', 'g')) || []).length ===
                                     (res.xml.match(new RegExp('</' + t + '>', 'g')) || []).length);
    check('docx: الوسوم متوازنة بعد الملء', balanced);
    check('docx: صفوف الشهر موزّعةٌ على صفحتَي النموذج',
          res.pages[0] + (res.pages[1] || 0) === rows.length && res.pages[0] === res.capacity, JSON.stringify(res.pages));

    const dataTables = D.tables(res.xml).map(([a, b]) => res.xml.slice(a, b))
        .filter(t => /الخطة الشهرية المعتمدة/.test(D.textOf(t)));
    const outRows = dataTables.flatMap(t => D.analyseTable(t).data);
    check('docx: عدد صفوف البيانات = أيّام الدوام', outRows.length === rows.length, String(outRows.length));

    const cellsOfRow = r => D.cellsOf(r).map(c => D.textOf(c));
    const first = cellsOfRow(outRows[0]);
    check('docx: الصفّ الأوّل بنصوصه في مواضعها',
          first[0] === '1/6' && first[1] === 'الاثنين' && first[2] === 'مشاعل مسقط' &&
          first[3] === 'مشاعل مسقط (خ)' && first[4] === '✓' && first[5] === '(1) أ. دينا (مرفق)',
          JSON.stringify(first));
    check('docx: يومٌ بزيارتين يحمل علامتَي ✓', cellsOfRow(outRows[1])[4] === '✓ ✓', cellsOfRow(outRows[1])[4]);
    check('docx: يومٌ بلا زيارةٍ مؤكَّدة يحمل «-»', cellsOfRow(outRows[2])[4] === '-', cellsOfRow(outRows[2])[4]);

    // التنسيق مستنسخ: الخليّة الجديدة تطابق خليّة النموذج في كلّ شيءٍ عدا النصّ والتظليل
    const tplRows = D.analyseTable(D.tables(xml).map(([a, b]) => xml.slice(a, b))
        .filter(t => /الخطة الشهرية المعتمدة/.test(D.textOf(t)))[0]).data;
    const shape = c => c.replace(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g, '<T/>')
                        .replace(/<w:shd [^>]*\/>/g, '<S/>')
                        .replace(/\s+w14:(?:paraId|textId)="[^"]*"/g, '')
                        .replace(/<w:color w:val="[0-9A-Fa-f]{6}"\/>/g, '<C/>');
    const tplCell = D.cellsOf(tplRows[0])[2], outCell = D.cellsOf(outRows[0])[2];
    check('docx: خليّة «الخطة المعتمدة» بخصائص النموذج نفسها', shape(tplCell) === shape(outCell),
          shape(outCell).slice(0, 120) + ' ⟷ ' + shape(tplCell).slice(0, 120));

    // مدرستان في يومٍ واحد: <w:br/> يفصل السطرين داخل الخليّة نفسها (لا فقرةٌ جديدة)
    const msRows = C.buildRows(multiSchool);
    const msRes = D.fill(xml, { monthName: 'يونيو', year: 2026, rows: msRows, totals: C.totals(msRows) });
    const msOutRows = D.tables(msRes.xml).map(([a, b]) => msRes.xml.slice(a, b))
        .filter(t => /الخطة الشهرية المعتمدة/.test(D.textOf(t)))
        .flatMap(t => D.analyseTable(t).data);
    const day9Cell = D.cellsOf(msOutRows.find(r => D.textOf(r).startsWith('9/6')))[5];
    check('docx: خليّة الإشرافيّة ليومٍ بمدرستين تحمل <w:br/>', /<w:br\s*\/>/.test(day9Cell), day9Cell.slice(0, 200));
    check('docx: نصّ السطرين كلاهما موجودٌ في الخليّة',
          D.textOf(day9Cell).includes('عدنان') && D.textOf(day9Cell).includes('خالصة'), D.textOf(day9Cell));
    const balanced2 = tags.every(t => (msRes.xml.match(new RegExp('<' + t + '[ >]', 'g')) || []).length ===
                                      (msRes.xml.match(new RegExp('</' + t + '>', 'g')) || []).length);
    check('docx: الوسوم متوازنةٌ أيضاً مع خليّة السطرين', balanced2);

    const marks = D.cellsOf(outRows[0])[4];
    check('docx: خليّة ✓ بخطّ الرمز من النموذج', /Segoe UI Symbol|Wingdings/.test(marks), marks.slice(0, 80));
    check('docx: «-» في عمود ✓ ليس بخطّ الرمز', !/Segoe UI Symbol|Wingdings/.test(D.cellsOf(outRows[2])[4]));

    // تظليل الصفوف كتلاً من خمسة
    const fillOf = r => (D.cellsOf(r)[0].match(/w:fill="([^"]+)"/) || [])[1];
    check('docx: التظليل كتلاً من خمسة صفوف',
          fillOf(outRows[0]) === fillOf(outRows[4]) && fillOf(outRows[0]) !== fillOf(outRows[5]) &&
          fillOf(outRows[5]) === fillOf(outRows[9]),
          [0, 4, 5, 9].map(i => fillOf(outRows[i])).join(','));

    // العنوان والمجاميع
    const titles = (res.xml.match(/يونيو/g) || []).length;
    check('docx: الشهر مكتوبٌ في مربّعات العنوان كلّها', titles >= 4, String(titles));
    check('docx: السنة', /2026/.test(res.xml));
    const summary = dataTables.flatMap(t => D.analyseTable(t).summary);
    const totalCells = D.cellsOf(summary.find(r => /المجموع/.test(D.textOf(r)))).map(c => D.textOf(c));
    check('docx: صفّ المجموع', totalCells[1] === '21' && totalCells[2] === '21' && totalCells[3] === '3' && totalCells[4] === '2+(1) مرفق = 3',
          JSON.stringify(totalCells));
    const rateRow = D.textOf(summary.find(r => /نسبة الإنجاز/.test(D.textOf(r))));
    check('docx: صفّ نسبة الإنجاز يحمل الأرقام والأسباب',
          /\(\s*21\s*÷\s*21\s*\)/.test(rateRow) && /نتيجة القياس:\s*100/.test(rateRow) && /الأسباب: -إجازة مرضية \(1\)\(123\)/.test(rateRow.replace(/\s+/g, ' ')),
          rateRow.replace(/\s+/g, ' ').slice(0, 200));
}

/* ── التوصيل: الصفحة للمرتبط بقاعدة المعلمين وحده ── */
{
    const html = fs.readFileSync(path.join(ROOT, 'reports.html'), 'utf8');
    const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
    const page = fs.readFileSync(path.join(ROOT, 'js/monthly.js'), 'utf8');
    const card = (html.match(/<a id="monthlyCard"[^>]*>/) || [''])[0];
    check('الربط: البطاقة مخفيّةٌ في الصفحة نفسها', /class="[^"]*\bhidden\b/.test(card), card);
    check('الربط: تُكشف عند الربط وتُخفى عند فكّه',
          /monthlyCard[\s\S]{0,400}?classList\.toggle\('hidden', !linked\)/.test(init) &&
          /addEventListener\('svf-teachers-changed', svfToggleMonthlyCard\)/.test(init));
    check('الربط: الصفحة نفسها محروسةٌ لمن يفتحها برابطٍ مباشر',
          /if \(!me\) \{ showLinkNeeded\(\); return; \}/.test(page) && /function showLinkNeeded/.test(page));
    check('الربط: الحراسة تطوي أدوات الصفحة',
          /main > section'\)\.forEach\(s => \{ s\.hidden = true; \}\)/.test(page));

    // كلٌّ يرى تقريره هو: رقم خطته، وبادئة ملفّه، وزياراته
    check('الملكيّة: رقم خطة السير من هويّة المشرف',
          /planNumberFor\(me\.name\)/.test(page) && /el\('planId'\)\.value = num \|\| savedId/.test(page));
    check('الملكيّة: ولا يبقى الرقم (6) افتراضاً للجميع',
          !/localStorage\.getItem\(PLAN_ID_KEY\) \|\| '6'/.test(page) && !/PREFIX_KEY\) \|\| '6- اسعد'/.test(page));
    check('الملكيّة: مفاتيح المسوّدة لكلّ مشرفٍ على حدة',
          /const PLAN_ID_KEY = id =>/.test(page) && /const PREFIX_KEY = id =>/.test(page));
    check('الملكيّة: أرقام المشرفين خمسة عشر كما في موقع الخطة',
          (page.match(/'\d+'/g) || []).length >= 15 && /'أسعد الخصيبي': '6'/.test(page) && /'هند الهنائية': '7'/.test(page));
    check('الملكيّة: تقرير مشرفٍ آخر لا يدخل الحساب',
          /isOtherSupervisor\(r\.supervisor, me\)/.test(page) &&
          (page.match(/isOtherSupervisor\(r\.supervisor, me\)/g) || []).length === 2);
    check('الملكيّة: وما لا اسم فيه يبقى لصاحب الجهاز',
          /if \(!want \|\| want === normName\(me\)\) return false;/.test(page));
    check('الملكيّة: ويُقال كم استُبعد', /استُبعدت \(\$\{state\.skipped\}\)/.test(page));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
