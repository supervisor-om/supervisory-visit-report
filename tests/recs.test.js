// اختبار انحدار: node tests/recs.test.js
//   ١) النصّ المولَّد يطابق ما يكتبه المشرف بيده (مثال الزيارة الحقيقيّ)
//   ٢) الأعداد والمدّة والجهة وجنس المعلّم
//   ٣) المتابعة: ما لم يُنفَّذ يعود «تأكيداً»، والمنفَّذ جزئياً «استكمالاً»
//   ٤) الاقتراح من بيانات الزيارة، وتاريخ الاستحقاق
//   ٥) التوصيل: الملفّات مربوطةٌ بالصفحة والحفظ
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'js/recs.js'));

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ── ١) مثال المشرف ── */
{
    const list = [
        { category: 'equipment', perList: true, extra: true, playground: true, deadline: 'twoWeeks',
          items: [{ name: 'جهاز الوثب العالي مع المرتبة الخاصة به' }, { name: 'الصندوق المقسم' },
                  { name: 'المقعد السويدي' }, { name: 'مرمى لكرة اليد', count: 2 },
                  { name: 'قوائم للسلة', count: 2 }, { name: 'شبك لكرة الطائرة' }] },
        { category: 'schedule', who: 'المعلمة', options: ['daily', 'avoidLate'] }
    ];
    const text = R.buildText(list, { audience: 'إدارة المدرسة' });
    const expected = [
        'نوصي إدارة المدرسة بالآتي:',
        '- توفير الأدوات الرياضية حسب الكشف المرفق ونخص بالذكر ( جهاز الوثب العالي مع المرتبة الخاصة به، الصندوق المقسم، المقعد السويدي، مرمى لكرة اليد عدد (2)، قوائم للسلة عدد (2)، شبك لكرة الطائرة ) بالإضافة لباقي الأدوات في الكشف، وتجديد تخطيط الملعب خلال أسبوعين عمل.',
        '- تغيير جدول المعلمة ليكون لديها حصة رياضة كل يوم، وتوزيع الحصص بحيث يتم الابتعاد عن الحصة السابعة والثامنة.',
        'والله الموفق.'
    ].join('\n');
    check('المثال الحقيقيّ يُولَّد حرفاً بحرف', text === expected, JSON.stringify(text));
    check('المقدّمة والخاتمة', text.startsWith('نوصي إدارة المدرسة بالآتي:') && text.endsWith(R.CLOSING));
    check('العدد يظهر لما زاد على واحد فقط',
          /مرمى لكرة اليد عدد \(2\)/.test(text) && /المقعد السويدي، مرمى/.test(text) && !/المقعد السويدي عدد/.test(text));
}

/* ── ٢) الخيارات والمدد والجهة ── */
{
    const eq = it => R.recText({ category: 'equipment', items: [{ name: 'أقماع' }], ...it });
    check('بلا «الكشف المرفق» ولا «باقي الأدوات»', eq({ perList: false, extra: false }) === 'توفير الأدوات الرياضية ونخص بالذكر ( أقماع )', eq({ perList: false, extra: false }));
    check('المدّة تُلحق بآخر البند', /خلال شهر$/.test(eq({ deadline: 'month' })), eq({ deadline: 'month' }));
    check('«بلا مدّة» لا تُضيف شيئاً', !/خلال/.test(eq({ deadline: '' })));
    check('بلا أدوات: البند يبقى مفهوماً', R.recText({ category: 'equipment', items: [] }) === 'توفير الأدوات الرياضية حسب الكشف المرفق');

    const sch = who => R.recText({ category: 'schedule', who, options: ['daily'] });
    check('الضمير يتبع الجهة', sch('المعلم') === 'تغيير جدول المعلم ليكون لديه حصة رياضة كل يوم' &&
          sch('المعلمات') === 'تغيير جدول المعلمات ليكون لديهن حصة رياضة كل يوم', sch('المعلمات'));
    check('الجهة من الطاقم: معلّمةٌ واحدة ← «المعلمة»', R.audienceFromRoster([{ name: 'أ', gender: 'f' }]) === 'المعلمة');
    check('الجهة من الطاقم: معلّمتان ← «المعلمات»', R.audienceFromRoster([{ name: 'أ', gender: 'f' }, { name: 'ب', gender: 'f' }]) === 'المعلمات');
    check('الجهة من الطاقم: مختلطون ← «المعلمين»', R.audienceFromRoster([{ name: 'أ', gender: 'f' }, { name: 'ب', gender: 'm' }]) === 'المعلمين');
    check('الجهة بلا طاقم لا تكسر', R.audienceFromRoster([]) === 'المعلمة');

    const multi = R.recText({ category: 'records', options: ['nour', 'follow', 'plan'] });
    check('بنودٌ متعدّدةٌ في جملةٍ واحدة بواو العطف قبل الأخير',
          multi === 'إتمام تحضير الدروس في منصة نور أولاً بأول، استكمال سجلات المتابعة (الزي والمشاركة والتحضير)، وتنفيذ خطة المنهاج وتوثيقها', multi);
    check('التوصية الحرّة كما كُتبت', R.recText({ category: 'free', text: 'توصيةٌ خاصة', manual: true }) === 'توصيةٌ خاصة');
    check('قائمةٌ فارغةٌ لا تُنتج نصّاً', R.buildText([]) === '');
}

/* ── ٣) المتابعة ── */
{
    const carry = R.carryOver([
        { text: 'توفير الأدوات الرياضية حسب الكشف المرفق.', status: 'not-done' },
        { text: 'تجديد تخطيط الملعب.', status: 'partial' },
        { text: 'استكمال السجلات.', status: 'done' },
        { text: 'بلا حكم.', status: null }
    ]);
    check('المتابعة: تُؤخذ غير المنفَّذة والجزئيّة وحدها', carry.length === 2, String(carry.length));
    check('المتابعة: «التأكيد على …» لما لم يُنفَّذ', carry[0].text === 'التأكيد على توفير الأدوات الرياضية حسب الكشف المرفق', carry[0].text);
    check('المتابعة: «استكمال …» للمنفَّذ جزئياً', carry[1].text === 'استكمال تجديد تخطيط الملعب', carry[1].text);
    check('المتابعة: تدخل النصّ كبقيّة البنود',
          R.buildText(carry).includes('- التأكيد على توفير الأدوات الرياضية حسب الكشف المرفق.'));
}

/* ── ٤) الاقتراح وتاريخ الاستحقاق ── */
{
    const s = R.suggest({ notedObjectives: ['متابعة تخطيط الملاعب والأدوات الرياضية', 'متابعة التحضير في منصة نور'],
                          roster: [{ name: 'سارة', gender: 'f', load: '22' }], classroomVisits: [{ teacher: 'سارة' }] });
    const ids = s.map(x => x.category);
    check('الاقتراح: الأدوات والملاعب من الأهداف المؤشَّرة', ids.includes('equipment') && ids.includes('playground'), ids.join(','));
    check('الاقتراح: السجلات من «منصة نور»', ids.includes('records'), ids.join(','));
    check('الاقتراح: الجدول من نصابٍ مرتفع', s.some(x => x.category === 'schedule' && x.who === 'المعلمة'), JSON.stringify(s.find(x => x.category === 'schedule')));
    check('الاقتراح: المداولة من زيارةٍ صفّيّة', s.some(x => /المداولة/.test(x.text || '')));
    check('الاقتراح: بلا بياناتٍ لا اقتراح', R.suggest({}).length === 0);

    check('الاستحقاق: أسبوعان من تاريخ الزيارة', R.dueDate({ deadline: 'twoWeeks' }, '2026-09-17') === '2026-10-01',
          R.dueDate({ deadline: 'twoWeeks' }, '2026-09-17'));
    check('الاستحقاق: مدّةٌ بلا أيّامٍ لا تاريخ لها', R.dueDate({ deadline: 'term' }, '2026-09-17') === '');
    check('الاستحقاق: بلا تاريخ زيارةٍ لا تاريخ', R.dueDate({ deadline: 'week' }, '') === '');
}

/* ── ٥) التوصيل ── */
{
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const school = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
    const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    check('wiring: مكان المنشئ فوق حقل التوصيات',
          html.indexOf('id="recsBuilder"') > 0 && html.indexOf('id="recsBuilder"') < html.indexOf('id="recommendations"'));
    check('wiring: الملفّان محمّلان بعد school.js',
          html.indexOf('js/recs.js') > html.indexOf('js/school.js') && html.indexOf('js/recs-ui.js') > html.indexOf('js/recs.js'));
    check('wiring: init.js يستدعي initRecsBuilder', /initRecsBuilder\(\)/.test(init));
    check('wiring: «تقرير جديد» يفرّغ القائمة', /repForm\.reset\(\);\s*\n\s*if \(typeof setSchoolRecs/.test(init));
    check('wiring: التقرير يحفظ البنية ويستعيدها',
          /recs: \(typeof getSchoolRecs === 'function'/.test(school) && /setSchoolRecs\(report\.recs \|\| \[\]\)/.test(school));
    check('wiring: عامل الخدمة يخزّن الملفّين', sw.includes("'./js/recs.js'") && sw.includes("'./js/recs-ui.js'"));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
