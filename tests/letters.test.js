// اختبار: node tests/letters.test.js
// المراسلات (2026-10-12): القوالب الخمسة على نصوص المشرف نفسها (تبادل الزيارات، ومدرسة مخالفة)، والتصريف،
// والتاريخ واليوم بالأرقام العربيّة، والكشف المرفق، و«نسخة لـ»، وهروب HTML، والتوصيل في الصفحة.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const L = require('../js/letters-core.js');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ── التاريخ والوقت ── */
check('arDate: 2026-05-11 الاثنين', JSON.stringify(L.arDate('2026-05-11')) === JSON.stringify({ day: 'الاثنين', date: '١١/ ٥/ ٢٠٢٦م' }), JSON.stringify(L.arDate('2026-05-11')));
check('arDate: 2026-10-08 الخميس', L.arDate('2026-10-08').day === 'الخميس');
check('arDate: فارغ', L.arDate('').day === '' && L.arDate('x').date === '');
check('arTime', L.arTime('07:30') === '٧:٣٠ ص' && L.arTime('13:05') === '١:٠٥ م' && L.arTime('12:00') === '١٢:٠٠ م');

/* ── المخاطَب والتصريف ── */
check('addressee: واحدة', L.addressee(['مدرسة الخوض']) === 'الفاضل/ مدير مدرسة الخوض       المحترم');
check('addressee: مديرة', L.addressee(['الخوض'], true).startsWith('الفاضلة/ مديرة مدرسة الخوض'));
check('addressee: أكثر ولا شيء', L.addressee(['أ', 'ب']).startsWith('الأفاضل/ مديرو المدارس المعنية') && L.addressee([]).startsWith('الأفاضل/'));
check('mentioned', L.mentionedTeachers([{ name: 'أ' }]) === 'للمعلم المذكور'
    && L.mentionedTeachers([{ name: 'أ', gender: 'f' }]) === 'للمعلمة المذكورة'
    && L.mentionedTeachers([{ name: 'أ', gender: 'f' }, { name: 'ب', gender: 'f' }]) === 'للمعلمات المذكورات'
    && L.mentionedTeachers([{ name: 'أ', gender: 'f' }, { name: 'ب', gender: 'm' }]) === 'للمعلمين المذكورين');
check('withTitle', L.withTitle('الفاضل/ مدير الدائرة').endsWith('المحترم') && L.withTitle('الفاضلة/ مديرة').endsWith('المحترمة')
    && L.withTitle('الفاضل/ س المحترم') === 'الفاضل/ س المحترم');

/* ── تبادل الزيارات: مثال المشرف ── */
const ex = L.buildLetter('exchange', { date: '2026-05-11', host: 'مدرسة أحمد بن النعمان (٥-١٠)', time: '07:30' },
    { schools: ['أ', 'ب'], teachers: [{ name: 'سالم', school: 'أ', fileNumber: '123' }, { name: 'خالد', school: 'ب' }], signer: 'أسعد' });
const exT = L.letterText(ex);
check('exchange: الموضوع', ex.subject === 'برنامج تبادل الزيارات (المهرجان الرياضي التعليمي)');
check('exchange: اليوم والتاريخ', exT.includes('يوم الاثنين الموافق (١١/ ٥/ ٢٠٢٦م)'));
check('exchange: المستضيفة بلا «مدرسة» مكرّرة', exT.includes('الحضور إلى مدرسة أحمد بن النعمان (٥-١٠) الساعة ٧:٣٠ ص، والالتزام بالزي الرياضي.'));
check('exchange: الجمع والإلزام', exT.includes('للمعلمين المذكورين') && exT.includes('إفادات الغياب'));
check('exchange: الكشف', ex.teachers.length === 2 && exT.includes('١- سالم — أ — ١٢٣'));
const ex2 = L.buildLetter('exchange', { mandatory: false, uniform: false }, {});
check('exchange: بلا إلزامٍ ولا زيّ', !L.letterText(ex2).includes('إفادات الغياب') && !L.letterText(ex2).includes('بالزي'));

/* ── مدرسة مخالفة: نموذج المشرف (غرس الدولية) ── */
const v = L.buildLetter('violation', {
    school: 'غرس (1-12) الدولية', visitDate: '2026-10-08',
    items: '١. عدم تنفيذ الطابور المدرسي في يوم الزيارة\n2- عدم تعديل مسمى الوزارة في اللوحة الخارجية.\n35 دقيقة فاقد'
}, { schools: ['يُتجاهل'], signer: 'أسعد' });
const vT = L.letterText(v);
check('violation: المخاطَب الدائرة لا المدرسة', v.to === 'الفاضل/ مدير دائرة المؤسسات التعليمية الخاصة       المحترم', v.to);
check('violation: التحيّة والافتتاح', v.greeting === 'السلام عليكم ورحمة الله وبركاته، وبعد،،'
    && v.body[0].startsWith('طيب الله أوقاتكم بالمسرات، وحول الموضوع المشار إليه أعلاه، نفيدكم علمًا بأنه تمّت زيارة مدرسة غرس (1-12) الدولية يوم الخميس الموافق (٨/ ١٠/ ٢٠٢٦م)، لمتابعة مدى التزام المدرسة بتلافي الملاحظات المرصودة، ولوحظ'));
check('violation: البنود يُعاد ترقيمها، والرقم بلا فاصلٍ نصّ', v.body[1] === '١. عدم تنفيذ الطابور المدرسي في يوم الزيارة.'
    && v.body[2] === '٢. عدم تعديل مسمى الوزارة في اللوحة الخارجية.' && v.body[3] === '٣. 35 دقيقة فاقد.', JSON.stringify(v.body.slice(1)));
check('violation: الخاتمة ثلاثة أسطر', v.closing.join('|') === 'تكرمكم بالعلم واتخاذ اللازم.|شاكرين لكم حسن تعاونكم|وتفضلوا بقبول فائق الاحترام والتقدير');
check('violation: نسخة لـ', v.cc.join('|') === 'مكتب د. المدير العام.|قسم إشراف الإدارة المدرسية.' && /نسخة لـ:\n\* مكتب د\. المدير العام\./.test(vT));
check('violation: بلا كشف', v.teachers.length === 0);

/* ── مدرسة مخالفة، الصيغة الثانية: «تكرار رصد الملاحظات» (بوابة الطموح) بلا نسخ ── */
const VP = L.templateOf('violation').presets;
check('violation: ثلاث صيغ، والأولى = الافتراض', VP.length === 3
    && L.templateOf('violation').fields.every(f => !(f.id in VP[0].values) || f.value === VP[0].values[f.id]));
const v2 = L.buildLetter('violation', Object.assign({ school: 'بوابة الطموح الدولية(1-4)', visitDate: '2026-10-06',
    items: '1. إدراج مادة الرياضة المدرسية في الحصتين السابعة والثامنة\n2-تلف تخطيط الملعب الثلاثي' }, VP[1].values), {});
check('violation2: النصّ', v2.body[0].endsWith('يوم الثلاثاء الموافق (٦/ ١٠/ ٢٠٢٦م)، لمتابعة مدى التزام المدرسة بتلافي الملاحظات المرصودة خلال '
    + 'الزيارة السابقة، ولوحظ أثناء الزيارة تكرار رصد الملاحظات المتمثلة في الآتي:') && v2.body[2] === '٢. تلف تخطيط الملعب الثلاثي.', v2.body[0]);
check('violation2: بلا «نسخة لـ»', v2.cc.length === 0 && !L.letterText(v2).includes('نسخة لـ') && !L.letterHTML(v2).includes('نسخة لـ'));

/* ── الصيغة الثالثة: ملاحظات مستمرّة منذ سنوات (النفائس) ── */
const v3 = L.buildLetter('violation', Object.assign({ school: 'النفائس (1–5) الخاصة بولاية السيب', visitDate: '2026-09-28',
    items: '1. خلو سارية علم المبنى المدرسي من علم سلطنة عُمان\n2. سارية علم الطابور المدرسي غير مطابقة للمواصفات القانونية.' }, VP[2].values), {});
check('violation3: بلا افتتاحيّة و«؛ وذلك»', v3.body[0] === 'وحول الموضوع المشار إليه أعلاه، نفيدكم علمًا بأنه تمّت زيارة مدرسة النفائس (1–5) الخاصة '
    + 'بولاية السيب يوم الاثنين الموافق (٢٨/ ٩/ ٢٠٢٦م)؛ وذلك لمتابعة مدى التزام المدرسة بتلافي الملاحظات المرصودة خلال الزيارات الإشرافية السابقة.', v3.body[0]);
check('violation3: فقرة الاستمرار ثمّ الرصد', v3.body[1].startsWith('ونود الإشارة إلى أن عددًا من هذه الملاحظات مستمر ومتكرر منذ ما يقارب ست سنوات')
    && v3.body[1].endsWith('وتلافيها. إلا أنه لوحظ أثناء الزيارة الحالية استمرار الملاحظات وعدم تنفيذ التوصيات السابقة بالصورة المطلوبة، والمتمثلة في الآتي:'));
check('violation3: البنود والنسخ', v3.body[2] === '١. خلو سارية علم المبنى المدرسي من علم سلطنة عُمان.' && v3.body.length === 4 && v3.cc.length === 2);
check('violation: الصيغة الأولى لم تتغيّر بإضافة الحقول', v.body[0].startsWith('طيب الله أوقاتكم بالمسرات، وحول الموضوع'));

/* ── طلب شهادات شكر: نموذج المشرف ── */
const th = L.buildLetter('thanks', { date: '2026-05-11', host: 'مدرسة أحمد بن النعمان' },
    { schools: ['يُتجاهل'], teachers: [{ name: 'سالم', school: 'أ' }, { name: 'خالد', school: 'ب' }] });
check('thanks: المخاطَب الدائرة', th.to === 'الفاضل/ د.مدير دائرة تطوير الأداء المدرسي       المحترم', th.to);
check('thanks: النصّ', th.body.length === 1 && th.body[0] === 'طيب الله أوقاتكم بكل خير وسرور، وبالإشارة إلى الموضوع أعلاه، أرفق لكم كشفًا '
    + 'بأسماء المعلمين المنفذين لبرنامج تبادل الزيارات (المهرجان التعليمي الرياضي) المقرر تنفيذه في مدرسة أحمد بن النعمان وذلك يوم الاثنين '
    + 'الموافق (١١/ ٥/ ٢٠٢٦م)، وعليه أرجو التكرم باستلامها منكم في فترة تسبق اليوم المحدد للتنفيذ.', th.body[0]);
check('thanks: التحيّة والخاتمة', th.greeting === 'السلام عليكم ورحمة الله وبركاته، وبعد'
    && th.closing.join('|') === 'شاكرين لكم حسن تعاونكم|وتفضلوا بقبول وافر الاحترام والتقدير');
check('thanks: الموضوع والكشف', th.subject === 'طلب شهادات شكر للمنفذين لبرنامج تبادل الزيارات (المهرجان التعليمي الرياضي)' && th.teachers.length === 2);
check('thanks: المفرد والمؤنّث', L.buildLetter('thanks', {}, { teachers: [{ name: 'م', gender: 'f' }] }).body[0].includes('كشفًا باسم المعلمة المنفذة لبرنامج')
    && L.buildLetter('thanks', {}, { teachers: [{ name: 'م', gender: 'f' }, { name: 'ن', gender: 'f' }] }).body[0].includes('بأسماء المعلمات المنفذات ل'));
check('thanks: الحقول المشتركة تُؤخذ من خطاب التبادل', L.templateOf('thanks').fields.filter(f => f.from === 'exchange').map(f => f.id).join() === 'program,host,date');

/* ── غياب عن برنامج تدريبي: نموذج المشرف (دارسيت) ── */
const ab = L.buildLetter('absence', { teacher: 'فاطمة بنت عبدالله بن محمد البلوشية', fileNumber: '16209186', female: true,
    date: '2026-10-05', ref: '2826388208' }, { schools: ['دارسيت (٥- ٨)'], femalePrincipal: true });
check('absence: لمديرة المدرسة', ab.to === 'الفاضلة/ مديرة مدرسة دارسيت (٥- ٨)       المحترمة', ab.to);
check('absence: النصّ', ab.body[0] === 'لكم منا خالص التحية والتقدير، وحول الموضوع المشار إليه أعلاه، نرفق لكم استمارة غياب المعلمة/ '
    + 'فاطمة بنت عبدالله بن محمد البلوشية رقم الملف (١٦٢٠٩١٨٦) معلمة رياضة مدرسية، وذلك يوم الاثنين الموافق (٥/ ١٠/ ٢٠٢٦م)، '
    + 'علمًا بأنه قد تم مخاطبة المدرسة بالفئة المستهدفة برقم قيد (٢٨٢٦٣٨٨٢٠٨)، عليه نرفق لكم استمارة غياب مستهدف عن برنامج تدريبي، '
    + 'للتكرم بطباعة الاستمارة المرفقة وتسليمها للمعنية للإفادة ومن ثم الإفادة برأيكم في المكان المخصص لكم في الاستمارة، وإعادة إرسالها '
    + 'في نفس الخطاب وليس بمراسلة جديدة إلى دائرة تطوير الأداء المدرسي قسم إشراف المهارات الفردية في موعد أقصاه (٣) أيام عمل من تاريخه.', ab.body[0]);
check('absence: الخاتمة والموضوع', ab.closing.join() === 'وتفضلوا بقبول فائق الاحترام،،،'
    && ab.subject === 'غياب المعلمة فاطمة بنت عبدالله بن محمد البلوشية عن برنامج تدريبي');
const abM = L.buildLetter('absence', { teacher: 'سالم' }, { schools: ['الخوض'] }).body[0];
check('absence: المذكّر', abM.includes('استمارة غياب المعلم/ سالم') && abM.includes('معلم رياضة مدرسية') && abM.includes('وتسليمها للمعني '));
check('absence: الواجهة تملأ من القاعدة', /else if \(el\.dataset\.f === 'teacher'\) fillTeacher\(el\.value\);/.test(read('js/letters.js'))
    && /if \(clean\(t\.school\)\) S\.schools = \[t\.school\];/.test(read('js/letters.js')));

/* ── الملاحظات والمتابعة والورشة ── */
const n = L.buildLetter('notes', { visitDate: '2026-10-08', items: '- تخطيط الملعب\n- توفير الأدوات' }, { schools: ['الخوض'] });
check('notes: مدير المدرسة والبنود', n.to.startsWith('الفاضل/ مدير مدرسة الخوض') && n.body[1] === '١- تخطيط الملعب.' && n.body.length === 4);
const w = L.buildLetter('workshop', { topic: 'ورشة تدريبية بعنوان: التقويم', date: '2026-10-15', venue: 'الخوض', time: '08:00' }, { teachers: [{ name: 'ع', gender: 'f' }] });
check('workshop', w.subject === 'دعوة لحضور ورشة تدريبية بعنوان: التقويم' && w.body[0].includes('في مدرسة الخوض.') && w.body[1].includes('للمعلمة المذكورة'));
check('followup', L.buildLetter('followup', { items: 'أ' }, { schools: ['س'] }).body[1] === '١- أ.');

/* ── HTML ── */
const h = L.letterHTML(L.buildLetter('violation', { school: '<b>x</b>', items: 'a & b' }, {}));
check('html: مهروب', !h.includes('<b>x</b>') && h.includes('&lt;b&gt;') && h.includes('a &amp; b'));
check('html: الكشف جدول', L.letterHTML(ex).includes('<table') && L.letterHTML(ex).includes('١٢٣'));
check('html: بلا <br>', !/<br/i.test(L.letterHTML(v)));

/* ── التوصيل ── */
const html = read('reports.html'), utils = read('js/utils.js'), init = read('js/init.js'), sw = read('sw.js'), ui = read('js/letters.js');
check('wiring: البطاقة والشاشة', html.includes('id="showLettersAppBtn"') && html.includes('id="lettersApp"'));
check('wiring: السكربتان قبل init.js', /letters-core\.js[\s\S]*letters\.js[\s\S]*init\.js/.test(html.slice(html.indexOf('js/teacher-brief.js'))));
check('wiring: showView يُخفي المراسلات', utils.includes("getElementById('lettersApp')?.classList.add('hidden')"));
check('wiring: init يفتحها', /showLettersAppBtn[\s\S]{0,400}svfLettersOpen\(\)/.test(init));
check('wiring: عامل الخدمة', sw.includes("'./js/letters-core.js'") && sw.includes("'./js/letters.js'"));
check('wiring: نظام المراسلات', ui.includes("'https://dms.moe.gov.om'") && /window\.open\(DMS_URL[\s\S]{0,40}\);\s*\n\s*copy\(/.test(ui));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
