// =========================================================================
// عين المشرف — المحرّك (منذ 2026-10-25، والمرحلة الأولى 2026-10-26)
//
// دالّاتٌ نقيّةٌ بلا DOM (تُصدَّر لـnode أيضاً). الواجهة (js/eye.js) تلتقط من الكاميرا
// إطاراً كلّ ربع ثانيةٍ بحجم ٩٦ بكسلاً، ومن الميكروفون طيفاً كلّ عُشر ثانية، وتمرّرهما هنا:
//
//  • الحركة: فرق الإطار عن سابقه بعد طرح تغيّر الإضاءة العامّ — **داخل منطقة الصفّ** إن رسمها
//    المشرف (`roiMask`)، فلا يُحسب صفٌّ آخر ولا شجرٌ ولا مارّون. أكثر من ٤٥٪ يتغيّر معاً = الكاميرا تحرّكت.
//  • الطلبة (المرحلة الأولى): نموذج كشف أشخاصٍ داخل الجهاز (vendor/human) يعطي صناديق، و`trackStep`
//    يتابعها بين اللقطات، و`peopleSnapshot` يعدّ في كلّ لحظة: داخل المنطقة، ومن يتحرّك منهم (انتقالٌ
//    أو حركةٌ في مكانه)، ومن خارجها، ومن يقف متقارباً ينتظر دوره. «زمن حركة الطالب» منها لا من البكسلات.
//  • الحالة كلّ ثانية: «نشاط» أو «انتظار» بعتبةٍ مع تخلّفٍ وتنعيمٍ خمس ثوانٍ، والمقطع الأقصر من ١٢ ثانية
//    يُضمّ إلى ما حوله.
//  • عناصر الحصة الخمسة بلمسة المشرف (`PARTS`: الإحماء، الإعداد البدني، الأنشطة التعليمية، الأنشطة التطبيقية،
//    ختام الدرس — 2026-10-26 بطلبه): زمن كلّ عنصرٍ وزمن الحركة والشرح والانتظار فيه، ومقارنته بالزمن الموصى به.
//  • الحضور والزيّ (`ROLL`، 2026-10-27): تسجيل الغياب والزيّ في بداية الحصة حالةٌ مستقلّة 'r' — بلمسة أو تلقائيّاً (`rollSpans`) —
//    لا تُحسب شرحاً ولا انتظاراً ولا من حركة الطلبة ولا التشكيلات ولا الكلام.
//  • عدد طلبة الحصة = **أكبر عددٍ رُصد** (طلب المشرف: الكشف ينقص أثناء الحركة فلا يُعتدّ باللحظة).
//  • التشكيلات (`formations`): قاطرات/صفوف، دوائر، مجموعات، انتشار حرّ — وكم تشكيلاً استُعمل، والقاطرة الطويلة (> ٦).
//  • الزيّ الرياضيّ (`garmentScore`): الدشداشة البيضاء = ثوبٌ أبيض طويلٌ يغطّي الساقين — تقديرٌ يصحّحه المشرف.
//  • الصوت: كلامٌ فوق أرضيّة الضجيج، وصفّارةٌ = نغمةٌ صافية. و«ميكروفون المعلّم» (يُعلَّق على ياقته) يجعل
//    الكلام كلامه: أثناء النشاط توجيهٌ حيّ، وفي التوقّف شرح.
//  • ما لا تراه الكاميرا يسجّله المشرف بلمسة (TAGS).
//
// suggest() يقترح درجةً **لبندٍ عليه شاهدٌ فقط** (السلّم مقلوب: ١ متميّز … ٥ تدخّل سريع)، ومع كلّ اقتراحٍ
// جملة شاهدٍ بالأرقام ودرجة ثقة. البنود ١٢–١٣ لا تُقترح، و١ و٢ من «عيّنة الطلبة»، و١١ من متابعة أهداف الزيارة السابقة.
// و`agreement` يقيس اتّفاق العين مع المشرف عبر التقارير المحفوظة — منه تُضبط العتبات.
// ومن الكاميرا نفسها (2026-10-26): الاستجابة للصفّارة (whistleResponses)، وشدّة النشاط (الجري vg)، والتزاحم (cr)، والكرات
// (sports ball في النموذج نفسه)، والمعلّم بلمسة (teacherStep/pickNearest/teacherStats: على أطراف الطلبة وتنقّله).
// أدوات المشرف (2026-10-26): sampleStats (العيّنة)، autoMoments (لحظات الحصة)، METRICS/targetCandidates/targetCheck
// (أهدافٌ تُقاس وتُتابَع)، ISSUES/patterns (ما يتكرّر عبر الحصص). لا يُحفظ إطارٌ ولا صوت: أرقامٌ في الذاكرة ثمّ في #eyeData.
// =========================================================================
(function (root) {
    'use strict';

    const LEVELS = { 1: 'متميز', 2: 'جيد', 3: 'ملائم', 4: 'غير ملائم', 5: 'تدخل سريع' };

    // thr: فرق البكسل الذي يُعدّ حركة (من ٢٥٥)، active: نسبة الصورة المتحرّكة التي تُعدّ «نشاطاً»
    const SENS = {
        high:   { thr: 14, active: 0.010, label: 'عالية' },
        medium: { thr: 20, active: 0.018, label: 'متوسطة' },
        low:    { thr: 28, active: 0.030, label: 'منخفضة' }
    };
    const SHAKE = 0.45;          // أكثر من هذا من الصورة تغيّر معاً ← الكاميرا تحرّكت أو تبدّل الضوء
    const GRID_W = 12, GRID_H = 9;
    const SMOOTH = 5;            // ثوانٍ
    const MIN_RUN = 12;          // أقصر مقطعٍ يُعتدّ به
    const STOP_MIN = 20;         // انتظارٌ أطول من هذا يُعدّ توقّفاً
    const MIN_OBSERVE = 600;     // عشر دقائق رصدٍ صالح لاقتراح الإدارة الصفّيّة
    const MIN_STRUCTURE = 1200;  // عشرون دقيقة لاقتراح بنية الحصة

    // الطلبة — وحدة المسافة «طول الجسم» فلا تتأثّر ببعد الكاميرا
    const PERSON_MIN_SCORE = 0.22; // أقلّ منه يكثر فيه الخطأ (لافتاتٌ ومخاريط) — قيس على مشهد مشاة
    const MATCH_GATE = 0.9;       // أبعد من ٠٫٩ طول جسمٍ بين لقطتين ← شخصٌ آخر
    const TRACK_TTL = 4.5;        // ثوانٍ بلا ظهورٍ ثمّ يُنسى
    const TEACHER_H = [0.8, 1.25]; // طول من يُتبنّى معلّماً نسبةً إلى طول المعلّم الأخير — حارس الحجب
    const EDGE = 0.03;            // ٣٪ من عرض الصورة يميناً أو يساراً: على الحافّة
    const ALERT_EDGE = 2;         // طالبان فأكثر على الحافّة في أغلب لقطات آخر نصف دقيقة ← «وسّع الزاوية»
    const MOVE_SPEED = 0.25;      // ربع طول الجسم في الثانية ← يتحرّك (مشيٌ بطيء فما فوق)
    const BOX_ACT = 0.12;         // نسبة ما تغيّر داخل صندوقه ← يتحرّك في مكانه (تمرين، تمرير)
    const QUEUE_DIST = 1.6;       // واقفون متقاربون (طول جسمٍ ونصف) ثلاثةٌ فأكثر ← انتظار دور
    const LINK = 1.6;             // التشكيل: طالبان أقرب من طول جسمٍ ونصف في مجموعةٍ واحدة
    const LINE_ELONG = 0.35;      // مجموعةٌ عرضها أقلّ من ثلث طولها = قاطرة أو صفّ
    const LONG_LINE = 6;          // قاطرةٌ فيها أكثر من ستّة طلبة = طويلة (طلب المشرف)
    // تحليلاتٌ من الكاميرا نفسها (2026-10-26) — كلّها **أوّليّة** تُضبط من أوّل حصص:
    const RUN_GATE = 1.5;         // التتبّع: كلّ ثانية غيابٍ تُوسّع حدّ المطابقة بطول جسمٍ ونصف (الجاري لا يُفقد بين لقطتين متباعدتين)
    const VIG_SPEED = 1.2;        // أطوال جسمٍ في الثانية فما فوق = جريٌ (نشاطٌ شديد)؛ المشي نحو ٠٫٨
    const VIG_ACT = 0.35;         // أو تغيّرٌ كبيرٌ داخل صندوقه (قفزٌ وتمرينٌ قويّ في المكان)
    const CROWD_DIST = 0.6;       // التزاحم: متحرّكٌ أقرب إليه زميلٌ من ٠٫٦ طول جسم (العمق مضروبٌ في DEPTH)
    const DEPTH = 2;              // المسافة في عمق الصورة تنضغط بالمنظور فتُضاعف
    const BALL_MIN_SCORE = 0.35;  // كرةٌ (sports ball في النموذج نفسه) — أقلّ منه رؤوسٌ ومخاريط
    const MVPA_GOAL = 50;         // إرشادات التربية البدنية: نصف زمن الحصة على الأقلّ نشاطاً معتدلاً فأشدّ
    const CROWD_BAD = 25;         // تزاحمٌ ربع المتحرّكين فأكثر ← ينزل البند ٥

    // ما يسجّله المشرف بلمسة — item: البند الذي يشهد له (ودرجته منه)، neg: شاهدٌ سلبيّ، qty: عددُ أشخاصٍ لا مرّات،
    // also: بنودٌ أخرى يشهد لها الوسم في الاستمارة نفسها — يدخل سجلّ أدلّتها بعبارتها (EV_TAG[k].on) ولا يغيّر درجتها.
    // مطابقة الأدلّة (2026-10-31، مراجعة المشرف «طابق ما يمكن أن تقترحه العين وما لا يمكن»): الدرجة تتبع بند الدليل في الاستمارة —
    // الزيّ للبند ٤ (القيم: «الالتزام بالزي الرياضي») لا ٥، وتوزيع الأدوات للبند ٧ («هدر وقت الحصة في تنظيم وتوزيع الأدوات») لا ٩.
    const TAGS = [
        { k: 'demo',      item: 8,  label: 'عرض نموذجي للمهارة' },
        { k: 'groups',    item: 8,  label: 'مجموعات أو تعلّم تعاوني' },
        { k: 'games',     item: 8,  label: 'ألعاب ومنافسات' },
        { k: 'stations',  item: 8,  label: 'محطات أو تعلّم ذاتي' },
        { k: 'levels',    item: 8,  label: 'تكليف حسب المستوى' },
        { k: 'discover',  item: 8,  label: 'تعلّم بالاكتشاف (مهمّةٌ مفتوحة)' },
        { k: 'elim',      item: 8,  label: 'لعبة إقصاء (يخرج من يخطئ)', neg: true },
        { k: 'include',   item: 2,  label: 'مراعاة الفروق والدمج' },
        { k: 'out',       item: 2,  label: 'طلبة خارج النشاط (عددهم)', neg: true, qty: true },
        { k: 'fbInd',     item: 10, label: 'تغذية راجعة فردية' },
        { k: 'fbGrp',     item: 10, label: 'تغذية راجعة جماعية', also: [2] },
        { k: 'ask',       item: 10, label: 'سؤال تقويمي' },
        { k: 'peer',      item: 10, label: 'تقويم ذاتي أو أقران', also: [3] },
        { k: 'obsCard',   item: 10, label: 'بطاقة ملاحظة لتقييم المهارة' },
        { k: 'record',    item: 10, label: 'رصد الأداء في سجل المتابعة' },
        { k: 'fbMiss',    item: 10, label: 'خطأ في الأداء لم يُصحَّح', neg: true, also: [2] },
        { k: 'rules',     item: 1,  label: 'تطبيق قانون المهارة أثناء اللعب' },
        { k: 'answers',   item: 1,  label: 'إجابةٌ صحيحة عن سؤالٍ معرفي' },
        { k: 'lead',      item: 3,  label: 'قيادة طالب' },
        { k: 'team',      item: 3,  label: 'تعاون وعمل فريق' },
        { k: 'tactic',    item: 3,  label: 'تفكير خططي' },
        { k: 'roles',     item: 3,  label: 'التزام الطلبة بأدوارهم في الفريق' },
        { k: 'praise',    item: 4,  label: 'روح رياضية واحترام بين الطلبة' },
        { k: 'fairplay',  item: 4,  label: 'مصافحة وتقبّل الفوز والخسارة' },
        { k: 'respectRef',item: 4,  label: 'احترام قرار الحكم' },
        { k: 'clean',     item: 4,  label: 'المحافظة على نظافة المكان' },
        { k: 'misbehave', item: 4,  label: 'سلوك سلبي لم يُعالَج', neg: true, also: [7] },
        { k: 'dish',      item: 4,  label: 'بغير الزي الرياضي (عددهم)', neg: true, qty: true },
        { k: 'safe',      item: 5,  label: 'تهيئة آمنة للمكان والأدوات' },
        { k: 'checkTools',item: 5,  label: 'فحص الأدوات قبل استخدامها' },
        { k: 'firstAid',  item: 5,  label: 'حقيبة إسعافات أولية جاهزة' },
        { k: 'hazard',    item: 5,  label: 'موقف خطر', neg: true },
        { k: 'water',     item: 5,  label: 'استراحة ماء' },
        { k: 'shade',     item: 5,  label: 'الشرح أو الانتظار في الظلّ' },
        { k: 'heatHit',   item: 5,  label: 'علامات إجهادٍ حراريّ على طالب', neg: true },
        { k: 'tools',     item: 9,  label: 'أدوات كافية ومتنوعة' },
        { k: 'altTools',  item: 9,  label: 'أدوات بديلة عند نقص الإمكانات' },
        { k: 'tech',      item: 9,  label: 'توظيف التقانة (فيديو أو صور)' },
        { k: 'noTools',   item: 9,  label: 'نقص أدوات وانتظار الدور', neg: true },
        { k: 'equip',     item: 7,  label: 'توقّف النشاط لتوزيع الأدوات أو جمعها', neg: true },
        // البند ١٢ (الحوكمة): أدلّةٌ للوصف وحده — لا يُقترح له مستوى
        { k: 'tOnTime',   item: 12, label: 'بدء الحصة في موعدها' },
        { k: 'tLate',     item: 12, label: 'تأخّر بدء الحصة', neg: true },
        { k: 'tKit',      item: 12, label: 'الزيّ الرياضيّ المناسب' }
    ];
    const GROUPS = [
        { title: 'التدريس', keys: ['demo', 'groups', 'games', 'stations', 'levels', 'discover', 'elim', 'include', 'out'] },
        { title: 'التقويم', keys: ['fbInd', 'fbGrp', 'ask', 'peer', 'obsCard', 'record', 'fbMiss'] },
        { title: 'تعلّم الطلبة', keys: ['rules', 'answers', 'lead', 'team', 'tactic', 'roles'] },
        { title: 'القيم والسلوك', keys: ['praise', 'fairplay', 'respectRef', 'clean', 'misbehave', 'dish'] },
        { title: 'السلامة والموارد', keys: ['safe', 'checkTools', 'firstAid', 'hazard', 'water', 'shade', 'heatHit', 'tools', 'altTools', 'tech', 'noTools', 'equip'] },
        { title: 'التزام المعلّم', keys: ['tOnTime', 'tLate', 'tKit'] }
    ];
    const TAG = {};
    TAGS.forEach(t => { TAG[t.k] = t; });

    // عناصر الحصة الخمسة — يلمسها المشرف حين يبدأ كلٌّ منها (حرفٌ واحدٌ للحفظ المضغوط).
    // min: الزمن الموصى به بالدقائق لحصّة ٤٠ دقيقة — **تقديرٌ أوّليّ** يعدّله المشرف من الشاشة (وفق دليل المعلّم)،
    // ويُقاس بنسبته إلى زمن الحصة المرصود. act: أدنى نشاطٍ متوقَّع للطلبة فيه (٪)، والختام بلا حدّ (تهدئة).
    const PARTS = [
        { k: 'warm',  c: 'w', label: 'الإحماء',            short: 'إحماء',       min: 5,  act: 60 },
        { k: 'fit',   c: 'f', label: 'الإعداد البدني',      short: 'إعداد بدني',  min: 7,  act: 60 },
        { k: 'teach', c: 't', label: 'الأنشطة التعليمية',   short: 'تعليمية',     min: 12, act: 40 },
        { k: 'apply', c: 'a', label: 'الأنشطة التطبيقية',   short: 'تطبيقية',     min: 12, act: 60 },
        { k: 'close', c: 'c', label: 'ختام الدرس',          short: 'ختام',        min: 4,  act: null }
    ];
    const PART = {};
    PARTS.forEach(x => { PART[x.k] = x; });
    const TINY_PART = 10;        // عنصرٌ أقلّ من عشر ثوانٍ لمسةٌ خاطئة = غائب؛ ومن عشرٍ إلى ثلاثين «قصير جدّاً» (partsDetail)
    // الحضور والزيّ (2026-10-27، طلب المشرف): «يسجّل المعلّم في بداية الحصة غياب الطلبة والزيّ — لا يُحسب ذلك من شرحه».
    // ليس عنصراً من الخمسة (لا زمن موصى به ولا «غائب»)، وثوانيه حالةٌ مستقلّة 'r': لا شرح ولا انتظار ولا نشاط، ولا تدخل حركة الطلبة
    // ولا التشكيلات (طابور الحضور ليس قاطرة) ولا تحليل الكلام — ويبقى منها عدد الطلبة والزيّ (يُرون فيها واقفين).
    // يُلمس زرّه، وإلّا عُدّت بداية الحصة حضوراً وزيّاً تلقائيّاً (rollSpans).
    const ROLL = { k: 'roll', c: 'r', label: 'الحضور والزيّ', short: 'حضور وزيّ', min: null, act: null, admin: true };
    PART.roll = ROLL;
    const ROLL_START = 120;      // التلقائيّ: أوّل توقّفٍ يبدأ في أوّل دقيقتين من الرصد…
    const ROLL_AUTO_MAX = 600;   // …ولا يتجاوز عشر دقائق
    const ROLL_MIN = 20;         // وما دون عشرين ثانيةً لا يُعدّ
    const ROLL_LONG = 300;       // خمس دقائق فأكثر ← سؤالٌ في المداولة وتنبيهٌ حيّ (أوّليّة)
    const CONTEXTS = PARTS;                                   // الاسم القديم (الواجهة والتقارير المحفوظة)
    const ACTIVE_PARTS = ['warm', 'fit', 'teach', 'apply'];   // عناصرُ يُنتظر فيها نشاطٌ حركيّ
    const FORMS = { L: 'قاطرات وصفوف', C: 'دائرة', G: 'مجموعات', S: 'انتشار حرّ' };

    // البنود التي لا تُقترح، وسببها
    const NOT_SEEN = {
        1: 'تحصيل الطلبة يُقدَّر من أدائهم للمهارة لا من الحركة — قيّم «عيّنة الطلبة» (خمسةٌ فأكثر) ليُقترح، ولمستا «تطبيق القانون» و«الإجابة المعرفية» أدلّةٌ للوصف',
        11: 'التقويم الذاتي والتطوير المهني لا يظهران في حصةٍ واحدة — يُقترح حين تُتابَع أهداف زيارةٍ سابقة',
        12: 'الالتزام بالأخلاقيات واللوائح يُقدَّر من السجلات والمتابعة — ولمسات «التزام المعلّم» أدلّةٌ للوصف لا تقترح مستوى',
        13: 'المبادرات والأنشطة في المجتمع المدرسي خارج الحصة'
    };

    // ── الأدوات المتقدّمة (2026-10-30، قرار المشرف بعد مراجعته العين «كمشرفٍ خبير») ──
    // ما ثقته ضعيفةٌ من كاميرا واحدةٍ بلا عمق: الزيّ من لون الملابس، وأنواع التشكيلات وعددها، وعدّ الكرات بالكاميرا، والتزاحم وشدّة
    // النشاط، وموقع المعلّم، وSOFIT+ — يُخفى افتراضاً: **لا يُعرض ولا يدخل الاقتراح ولا الأدلّة ولا المداولة ولا الأهداف ولا الأنماط ولا
    // البطاقة**، ويُحسب كما كان (فيظهر كلّه حين يُفعَّل). يبقى: القاطرة الطويلة وانتظار الدور، وما يكتبه المشرف بيده (عدد الكرات، وسم الزيّ).
    // الافتراض هنا مفعَّل (الاختبارات القديمة)، وeye.js يضبطه من إعداد «الأدوات المتقدّمة» (مطفأٌ افتراضاً).
    let ADV = true;
    const setAdv = v => { ADV = v !== false; return ADV; };
    const isAdv = () => ADV;

    // ── الحرارة والسلامة في الملعب، والطلبة غير المشاركين بعذر (2026-10-30) ──
    // الحرارة المحسوسة من الحرارة والرطوبة (معادلة Rothfusz لخدمة الأرصاد الأمريكيّة NWS)، وفئاتها عندها (°ف 80/91/104/125 ← °م):
    // حذر ٢٧ · حذرٌ شديد ٣٣ · خطر ٤٠ · خطرٌ شديد ٥٢. وفي الحرّ يُنتظر استراحة ماءٍ كلّ عشرين دقيقةً على الأقلّ — إرشادات رياضة
    // اليافعين تقول كلّ ١٠–٣٠ دقيقة بحسب الحرارة — **أوّليّ** حتّى تُعرف تعليمات الوزارة. الصالة المغطّاة لا تُقاس حرارتها.
    const HEAT_CATS = [{ min: 52, k: 4, label: 'خطرٌ شديد' }, { min: 40, k: 3, label: 'خطر' }, { min: 33, k: 2, label: 'حذرٌ شديد' }, { min: 27, k: 1, label: 'حذر' }];
    const WATER_EVERY = 20;       // دقائق
    const PLACES = { open: 'ملعبٌ مكشوف', shade: 'ملعبٌ مظلّل', indoor: 'صالةٌ مغطّاة' };
    const PLACE_IN = { open: 'ملعبٍ مكشوف', shade: 'ملعبٍ مظلّل', indoor: 'صالةٍ مغطّاة' };   // بعد «في»
    // أدوار الطلبة غير المشاركين بعذر (البند ٢: مراعاة الفروق والاحتياجات) — يختارها المشرف
    const EXC_ROLES = { ref: 'التحكيم', score: 'التسجيل والتوقيت', equip: 'تنظيم الأدوات', peer: 'ملاحظة أداء الزملاء', cheer: 'التشجيع' };
    function heatIndex(t, rh) {
        t = Number(t);
        if (!(t > -30 && t < 65)) return null;
        if (rh == null || rh === '' || !(Number(rh) >= 0 && Number(rh) <= 100) || t < 27) return Math.round(t);   // بلا رطوبة أو دون ٢٧° فالحرارة نفسها
        const T = t * 9 / 5 + 32, R = Number(rh);
        let H = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T - 0.05481717 * R * R
            + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
        if (R < 13 && T >= 80 && T <= 112) H -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
        else if (R > 85 && T >= 80 && T <= 87) H += ((R - 85) / 10) * ((87 - T) / 5);
        return Math.round(Math.max(t, (H - 32) * 5 / 9));
    }
    // field: {place, temp, rh, exc, excRole, roles} من بطاقة «الحرارة والمشاركة»؛ counts: الوسوم (water/shade/heatHit)
    function fieldOf(field, M, counts) {
        const f = field || {}, c = counts || {};
        const num = v => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
        const temp = num(f.temp), rh = num(f.rh);
        const indoor = f.place === 'indoor';
        const hi = temp == null ? null : heatIndex(temp, rh);
        const cat = hi == null || indoor ? null : HEAT_CATS.find(x => hi >= x.min) || null;
        const lessonMin = Math.floor(lessonSecOf(M || {}) / 60);
        const water = c.water || 0;
        const expect = cat && lessonMin >= WATER_EVERY ? Math.floor(lessonMin / WATER_EVERY) : 0;
        const exc = Math.max(0, Math.round(num(f.exc) || 0));
        const role = Math.min(exc, Math.max(0, Math.round(num(f.excRole) || 0)));
        return { place: PLACES[f.place] ? f.place : '', temp, rh, hi, indoor, cat: cat ? cat.k : 0, catLabel: cat ? cat.label : '', lessonMin,
                 water, expect, shade: c.shade || 0, hit: c.heatHit || 0, exc, role, roles: (f.roles || []).filter(k => EXC_ROLES[k]) };
    }
    const heatOnOf = F => F.cat >= 1 && F.lessonMin >= WATER_EVERY;      // حصةٌ في الحرّ طالت عشرين دقيقة

    // ── منطقة الصفّ ──
    // poly: نقاطٌ [x, y] نسبةً إلى الإطار (٠–١)
    function inPoly(x, y, poly) {
        if (!poly || poly.length < 3) return true;
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) inside = !inside;
        }
        return inside;
    }
    function roiMask(poly, w, h) {
        if (!poly || poly.length < 3) return null;
        const m = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inPoly((x + 0.5) / w, (y + 0.5) / h, poly) ? 1 : 0;
        return m;
    }
    function roiCells(poly) {
        const out = [];
        for (let gy = 0; gy < GRID_H; gy++) for (let gx = 0; gx < GRID_W; gx++) out.push(inPoly((gx + 0.5) / GRID_W, (gy + 0.5) / GRID_H, poly) ? 1 : 0);
        return out;
    }
    function polyBox(poly, pad) {
        if (!poly || poly.length < 3) return { x: 0, y: 0, w: 1, h: 1 };
        pad = pad || 0;
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        poly.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(1, x1 + pad); y1 = Math.min(1, y1 + pad);
        return { x: x0, y: y0, w: Math.max(0.01, x1 - x0), h: Math.max(0.01, y1 - y0) };
    }

    // ── الصورة ──
    function toGray(rgba, n, out) {
        const g = out || new Uint8Array(n);
        for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
        return g;
    }

    // فرق إطارين: m نسبة البكسلات المتغيّرة، وshake إن تغيّرت الصورة كلّها تقريباً.
    // grid (Uint32Array بطول GRID_W×GRID_H) يجمع الحركة لخريطة المساحة — للإطار الصالح وحده.
    // mask (من roiMask): يُحسب داخل منطقة الصفّ وحدها، والنسبة من مساحتها.
    function frameDiff(prev, cur, w, h, thr, grid, mask) {
        const n = w * h;
        let sp = 0, sc = 0, cnt = 0;
        for (let i = 0; i < n; i++) { if (mask && !mask[i]) continue; sp += prev[i]; sc += cur[i]; cnt++; }
        if (!cnt) return { m: 0, shake: false };
        const shift = (sc - sp) / cnt;        // تغيّر الإضاءة العامّ يُطرح قبل المقارنة
        const cells = new Uint32Array(GRID_W * GRID_H);
        let changed = 0;
        for (let y = 0; y < h; y++) {
            const gy = Math.min(GRID_H - 1, Math.floor(y * GRID_H / h));
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (mask && !mask[i]) continue;
                if (Math.abs(cur[i] - prev[i] - shift) > thr) {
                    changed++;
                    cells[gy * GRID_W + Math.min(GRID_W - 1, Math.floor(x * GRID_W / w))]++;
                }
            }
        }
        const m = changed / cnt;
        const shake = m > SHAKE;
        if (grid && !shake) for (let i = 0; i < cells.length; i++) grid[i] += cells[i];
        return { m, shake };
    }

    // تغيّر الإضاءة العامّ بين صورتين رماديّتين بالحجم نفسه
    function grayShift(prev, cur) {
        let s = 0;
        for (let i = 0; i < cur.length; i++) s += cur[i] - prev[i];
        return cur.length ? s / cur.length : 0;
    }
    // نسبة ما تغيّر داخل صندوقٍ (نسبيّ ٠–١) — حركة الطالب في مكانه
    function boxMotion(prev, cur, w, h, box, thr, shift) {
        if (!prev || !cur || prev.length !== cur.length) return 0;
        const x0 = Math.max(0, Math.floor(box.x * w)), y0 = Math.max(0, Math.floor(box.y * h));
        const x1 = Math.min(w, Math.ceil((box.x + box.w) * w)), y1 = Math.min(h, Math.ceil((box.y + box.h) * h));
        let n = 0, c = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = y * w + x;
            n++;
            if (Math.abs(cur[i] - prev[i] - (shift || 0)) > thr) c++;
        }
        return n ? c / n : 0;
    }

    // ── تتبّع الطلبة ──
    // det: {x, y, w, h, score, act} نسبةً إلى الإطار (x,y الزاوية العليا). ar = عرض الإطار ÷ ارتفاعه.
    // الموضع بوحدة «ارتفاع الإطار» في المحورين (x×ar) فتصحّ المسافات، والقدم (أسفل الصندوق) هي موضعه في الملعب.
    function newTracker() { return { next: 1, tracks: [] }; }
    // التتبّع على طريقة ByteTrack (2026-10-29): (١) يُتوقَّع موضع كلّ متتبَّعٍ بسرعته الأخيرة، (٢) يُطابَق الكشف الواثق أوّلاً،
    // (٣) ثمّ الكشف الضعيف بمن بقي من المتتبَّعين — فطالبٌ يخفت كشفه وهو يجري أو خلف زميله لا يضيع ولا يصير شخصاً جديداً،
    // (٤) والكشف الضعيف الذي لا متتبَّع له يبدأ متتبَّعاً **مبدئيّاً** لا يُعدّ حتّى يُرى مرّةً ثانية — فلافتةٌ أو مخروطٌ في لقطةٍ واحدة لا يُحسب طالباً.
    const HIGH_SCORE = 0.45;      // كشفٌ واثق: يُطابَق أوّلاً ويبدأ متتبَّعاً مؤكَّداً
    const MAX_PRED = 2;           // سقف السرعة في التوقّع (طول جسمٍ في الثانية) — قفزةٌ خاطئةٌ لا تقذف المتتبَّع بعيداً
    function predict(tr, t) {
        const h = tr.hist, p = h[h.length - 1];
        let vx = 0, vy = 0;
        for (let i = h.length - 2; i >= 0; i--) {
            const dt = p.t - h[i].t;
            if (dt >= 0.3) {
                vx = (p.fx - h[i].fx) / dt; vy = (p.fy - h[i].fy) / dt;
                const sp = Math.hypot(vx, vy), cap = MAX_PRED * p.h;
                if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
                break;
            }
        }
        const gap = Math.min(2, Math.max(0, t - p.t));
        return { fx: p.fx + vx * gap, fy: p.fy + vy * gap, h: p.h, p };
    }
    function trackStep(T, dets, t, ar, ttl) {
        ar = ar || 1;
        ttl = ttl || TRACK_TTL;
        const pts = (dets || []).filter(d => d && (d.score == null || d.score >= PERSON_MIN_SCORE)).map(d => ({
            fx: (d.x + d.w / 2) * ar, fy: d.y + d.h, cx: (d.x + d.w / 2) * ar, cy: d.y + d.h / 2, h: d.h,
            nx: d.x + d.w / 2, ny: d.y + d.h, act: d.act || 0, dish: d.dish == null ? null : !!d.dish,
            hi: d.score == null || d.score >= HIGH_SCORE
        }));
        T.tracks = T.tracks.filter(tr => t - tr.last <= ttl);
        const pred = T.tracks.map(tr => predict(tr, t));
        const usedA = new Set(), usedB = new Set();
        // مطابقةٌ جشعة بأقرب مسافة: إلى الموضع المتوقَّع أو الأخير (أيّهما أقرب)، بحدٍّ يتّسع بزمن الغياب
        const associate = wantHi => {
            const pairs = [];
            T.tracks.forEach((tr, a) => {
                if (usedA.has(a)) return;
                const P = pred[a], p = P.p;
                const gate = Math.min(2.5, MATCH_GATE + RUN_GATE * Math.max(0, t - tr.last - 0.5));
                pts.forEach((d, b) => {
                    if (usedB.has(b) || d.hi !== wantHi) return;
                    const hh = Math.max(1e-6, Math.max(d.h, p.h));
                    const dist = Math.min(Math.hypot(d.fx - P.fx, d.fy - P.fy), Math.hypot(d.fx - p.fx, d.fy - p.fy)) / hh;
                    if (dist < gate) pairs.push({ a, b, dist });
                });
            });
            pairs.sort((p, q) => p.dist - q.dist);
            pairs.forEach(p => {
                if (usedA.has(p.a) || usedB.has(p.b)) return;
                usedA.add(p.a); usedB.add(p.b);
                const tr = T.tracks[p.a];
                tr.hist.push(Object.assign({ t }, pts[p.b]));
                while (tr.hist.length > 2 && t - tr.hist[0].t > 6) tr.hist.shift();
                tr.last = t;
                tr.hits = (tr.hits || 1) + 1;
                if (tr.ok === false && tr.hits >= 2) tr.ok = true;
                vote(tr, pts[p.b].dish);
            });
        };
        associate(true);
        associate(false);
        pts.forEach((d, b) => {
            if (usedB.has(b)) return;
            const tr = { id: T.next++, last: t, hist: [Object.assign({ t }, d)], dv: 0, dy: 0, hits: 1, ok: d.hi };
            vote(tr, d.dish);
            T.tracks.push(tr);
        });
        return T;
    }
    // صوت الزيّ لكلّ متتبَّع: الحكم بالأغلبيّة عبر لقطاتٍ عدّة لا بلقطةٍ واحدة
    function vote(tr, dish) {
        if (dish == null) return;
        tr.dv = (tr.dv || 0) + 1;
        if (dish) tr.dy = (tr.dy || 0) + 1;
    }
    const isDishTrack = p => (p.dv || 0) >= 2 && (p.dy || 0) / p.dv >= 0.6;
    // سرعة الطالب (أطوال جسمٍ في الثانية) على آخر ثانيتين، وحركته في مكانه
    function trackMotion(tr) {
        const h = tr.hist, last = h[h.length - 1];
        let ref = null;
        for (let i = h.length - 2; i >= 0; i--) { if (last.t - h[i].t >= 0.8) { ref = h[i]; if (last.t - h[i].t >= 2) break; } }
        const speed = ref ? Math.hypot(last.cx - ref.cx, last.cy - ref.cy) / Math.max(1e-6, last.h) / Math.max(0.5, last.t - ref.t) : 0;
        // الشديد: جريٌ، أو تمرينٌ قويٌّ **في المكان** — تغيّر صندوق من ينتقل (أو من لم تُعرف سرعته بعد) أثرُ انتقاله لا شدّته
        const inPlace = !!ref && speed < MOVE_SPEED;
        return { speed, act: last.act || 0, moving: speed >= MOVE_SPEED || (last.act || 0) >= BOX_ACT, vig: speed >= VIG_SPEED || (inPlace && (last.act || 0) >= VIG_ACT) };
    }

    // ── المعلّم: يُحدَّد بلمسة، ويُتابَع ولو انقطع متتبَّعه (يُتبنّى أقرب شخصٍ جديدٍ من آخر موضعه) ──
    // tch = {id, fx, fy, h, seen} أو null. يُستثنى من الطلبة في اللقطة.
    function teacherStep(T, tch, t) {
        if (!tch) return null;
        const live = T.tracks.filter(tr => t - tr.last <= 1.2 && tr.ok !== false);   // المبدئيّ (كشفٌ ضعيفٌ مرّةً واحدة) لا يُعدّ
        let tr = live.find(x => x.id === tch.id);
        if (!tr && t - (tch.seen || 0) <= 8) {
            // حارس الحجب (2026-10-27): حين يمرّ المعلّم خلف طالب، يظهر الطالب وحده قرب موضعه — فلا يُتبنّى من يقصر عنه كثيراً أو يطوله
            // (في الموضع نفسه من الصورة يتقارب الطولان بالمنظور: ٠٫٨–١٫٢٥ من طوله الأخير)، ويبقى المعلّم «منقطعاً» حتّى يظهر هو
            const cands = live.filter(x => x.id > tch.id || x.hist.length <= 2).map(x => {
                const p = x.hist[x.hist.length - 1];
                return { x, r: tch.h ? p.h / tch.h : 1, d: Math.hypot(p.fx - tch.fx, p.fy - tch.fy) / Math.max(1e-6, Math.max(p.h, tch.h || p.h)) };
            }).filter(c => c.d <= 1.5 && c.r >= TEACHER_H[0] && c.r <= TEACHER_H[1]).sort((a, b) => a.d - b.d);
            if (cands[0]) tr = cands[0].x;
        }
        if (!tr) return tch;
        const p = tr.hist[tr.hist.length - 1];
        return { id: tr.id, fx: p.fx, fy: p.fy, h: p.h, nx: p.nx, ny: p.ny, seen: tr.last };
    }
    // من لمسةٍ على الشاشة (x,y نسبةً إلى الإطار) ← أقرب شخصٍ في اللقطة
    function pickNearest(snap, x, y) {
        const dots = (snap && snap.dots) || [];
        let best = null;
        dots.forEach(d => { const dist = Math.hypot(d.x - x, d.y - y); if (!best || dist < best.dist) best = { id: d.id, dist }; });
        return best && best.dist <= 0.12 ? best.id : null;
    }
    // لقطة اللحظة: n داخل المنطقة، mv يتحرّك منهم، o خارجها، q واقفون متقاربون (انتظار دور)
    // tch: المعلّم (teacherStep) — يُستثنى من الطلبة ويُرصد موضعه: أعلى الطرف (يرى الطلبة كلّهم) أم وسطهم
    function peopleSnapshot(T, t, poly, tch) {
        const live = T.tracks.filter(tr => t - tr.last <= 1.2 && tr.ok !== false);   // المبدئيّ (كشفٌ ضعيفٌ مرّةً واحدة) لا يُعدّ
        const all = live.map(tr => {
            const last = tr.hist[tr.hist.length - 1];
            return Object.assign({ id: tr.id, x: last.nx, y: last.ny, fx: last.fx, fy: last.fy, h: last.h, dv: tr.dv || 0, dy: tr.dy || 0,
                inside: inPoly(last.nx, last.ny, poly) }, trackMotion(tr));
        });
        const teacher = tch ? all.find(p => p.id === tch.id) || null : null;
        const ppl = teacher ? all.filter(p => p !== teacher) : all;
        const ins = ppl.filter(p => p.inside);
        const still = ins.filter(p => !p.moving);
        // التزاحم: متحرّكٌ أقرب إليه زميلٌ من CROWD_DIST طول جسم (والعمق مضاعفٌ لانضغاطه بالمنظور)
        let cr = 0;
        ins.forEach(p => {
            if (!p.moving) return;
            const close = ins.some(o => o !== p && Math.hypot((o.fx - p.fx), (o.fy - p.fy) * DEPTH) / Math.max(p.h, o.h) < CROWD_DIST);
            if (close) cr++;
        });
        let tc = null;
        if (teacher) {
            let edge = null;
            if (ins.length >= 4) {
                const xs = ins.map(p => p.fx).sort((a, b) => a - b), ys = ins.map(p => p.fy).sort((a, b) => a - b);
                const qa = arr => arr[Math.floor(0.1 * (arr.length - 1))], qb = arr => arr[Math.ceil(0.9 * (arr.length - 1))];
                const m = 0.3 * teacher.h;
                edge = teacher.fx < qa(xs) - m || teacher.fx > qb(xs) + m || teacher.fy < qa(ys) - m || teacher.fy > qb(ys) + m;
            }
            tc = { x: Math.round(teacher.x * 100) / 100, y: Math.round(teacher.y * 100) / 100, mv: teacher.moving, edge };
        }
        let q = 0;
        still.forEach(p => {
            const near = still.filter(o => o !== p && Math.hypot(o.fx - p.fx, o.fy - p.fy) <= QUEUE_DIST * Math.max(p.h, o.h)).length;
            if (near >= 2) q++;
        });
        const F = formations(ins);
        // على حافّة الصورة يميناً أو يساراً: مقصوصٌ أو على وشك الخروج منها ← الكاميرا لا تغطّي الملعب كلّه (يُستثنى من هو خارج المنطقة المحدَّدة)
        const e = ppl.filter(p => (p.inside || !(poly && poly.length >= 3)) && (p.x < EDGE || p.x > 1 - EDGE)).length;
        return {
            n: ins.length, mv: ins.length - still.length, o: ppl.length - ins.length, q,
            r: !!(poly && poly.length >= 3),
            fm: F.dom, ln: F.maxLine, d: ins.filter(isDishTrack).length,
            vg: ins.filter(p => p.vig).length, cr, tc, e,
            // pl: يتحرّك **في مكانه** (تمرينٌ، تمرير) — لونٌ غير لون من ينتقل في الملعب
            dots: all.map(p => ({ id: p.id, x: p.x, y: p.y, mv: p.moving, pl: p.moving && p.speed < MOVE_SPEED, in: p.inside, dish: isDishTrack(p), tch: p === teacher }))
        };
    }

    // ── التشكيلات ──
    // ppl: [{fx, fy, h}] بوحدة ارتفاع الإطار. يُجمع الطلبة المتقاربون (أقلّ من طول جسمٍ ونصف) مجموعاتٍ، ثمّ لكلّ
    // مجموعةٍ من ثلاثةٍ فأكثر شكلُها من تحليل المكوّنات الرئيسة: ممدودةٌ = قاطرة/صفّ، وحلقةٌ مجوّفةٌ = دائرة
    // (بعد تسوية المحورين، فالدائرة المائلة بالمنظور تبقى دائرة)، وغيرها مجموعة. ومن لا يجاور أحداً منتشرٌ حرّ.
    function formations(ppl) {
        const n = (ppl || []).length;
        const out = { dom: '-', lines: [], maxLine: 0, groups: 0, circles: 0, n };
        if (!n) return out;
        const par = ppl.map((_, i) => i);
        const find = i => (par[i] === i ? i : (par[i] = find(par[i])));
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const a = ppl[i], b = ppl[j];
            if (Math.hypot(a.fx - b.fx, a.fy - b.fy) / Math.max(1e-6, Math.max(a.h, b.h)) <= LINK) par[find(i)] = find(j);
        }
        const cl = {};
        ppl.forEach((p, i) => { (cl[find(i)] = cl[find(i)] || []).push(p); });
        let inL = 0, inC = 0, inG = 0, loose = 0;
        Object.values(cl).forEach(c => {
            if (c.length < 3) { loose += c.length; return; }
            const sh = shapeOf(c);
            if (sh === 'L') { out.lines.push(c.length); inL += c.length; }
            else if (sh === 'C') { out.circles++; inC += c.length; }
            else { out.groups++; inG += c.length; }
        });
        out.maxLine = out.lines.reduce((m, v) => Math.max(m, v), 0);
        if (inC >= n / 2) out.dom = 'C';
        else if (inL >= n / 2) out.dom = 'L';
        else if (loose >= n / 2) out.dom = 'S';
        else if (inG >= n / 2) out.dom = 'G';
        else out.dom = [['L', inL], ['C', inC], ['G', inG], ['S', loose]].sort((p, q) => q[1] - p[1])[0][0];
        return out;
    }
    function shapeOf(c) {
        const k = c.length;
        const mx = c.reduce((s, p) => s + p.fx, 0) / k, my = c.reduce((s, p) => s + p.fy, 0) / k;
        let sxx = 0, syy = 0, sxy = 0;
        c.forEach(p => { const dx = p.fx - mx, dy = p.fy - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
        sxx /= k; syy /= k; sxy /= k;
        const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
        const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
        if (l1 <= 1e-12) return 'G';
        if (Math.sqrt(l2 / l1) < LINE_ELONG) return 'L';
        if (k < 6) return 'G';
        // تسوية المحورين ثمّ بُعد كلّ طالبٍ عن المركز: حلقةٌ = أبعادٌ متقاربة والمركز خالٍ
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), cs = Math.cos(ang), sn = Math.sin(ang);
        const r = c.map(p => {
            const dx = p.fx - mx, dy = p.fy - my;
            const u = (dx * cs + dy * sn) / Math.sqrt(l1), v = (-dx * sn + dy * cs) / Math.sqrt(Math.max(l2, 1e-12));
            return Math.hypot(u, v);
        });
        const mr = r.reduce((s, v) => s + v, 0) / k;
        const sd = Math.sqrt(r.reduce((s, v) => s + (v - mr) * (v - mr), 0) / k);
        return sd / mr < 0.3 && Math.min.apply(null, r) >= 0.45 * mr ? 'C' : 'G';
    }

    // ── الزيّ الرياضيّ ──
    // rgba بعرض w وارتفاع h، والصندوق نسبيّ. الدشداشة ثوبٌ أبيض طويل: الشريط الأوسط من أسفل الجسم (٥٥–٩٢٪ من
    // ارتفاع الصندوق، والوسط ٤٠٪ من عرضه) أبيضُ في أغلبه، وأفتح من الأرض على جانبيه بفارقٍ واضح — فلا يُعدّ
    // ملعبٌ فاتحٌ بين الساقين ثوباً. الصندوق الأصغر من ٢٨ بكسلاً لا يُحكم عليه.
    function garmentScore(rgba, w, h, box) {
        const bx = box.x * w, by = box.y * h, bw = box.w * w, bh = box.h * h;
        if (bh < 28 || bw < 6) return null;
        const y0 = Math.max(0, Math.floor(by + bh * 0.55)), y1 = Math.min(h, Math.ceil(by + bh * 0.92));
        const x0 = Math.max(0, Math.floor(bx + bw * 0.3)), x1 = Math.min(w, Math.ceil(bx + bw * 0.7));
        const sw = Math.max(2, Math.round(bw * 0.3));
        let n = 0, white = 0, sum = 0, sideN = 0, sideSum = 0;
        const lum = i => (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const i = (y * w + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = lum(i);
                n++; sum += L;
                if (L >= 165 && mx - mn <= 0.2 * mx) white++;
            }
            for (const [a, z] of [[Math.floor(bx - sw), Math.floor(bx)], [Math.ceil(bx + bw), Math.ceil(bx + bw + sw)]]) {
                for (let x = Math.max(0, a); x < Math.min(w, z); x++) { sideN++; sideSum += lum((y * w + x) * 4); }
            }
        }
        if (!n) return null;
        return { white: white / n, contrast: sideN ? sum / n - sideSum / sideN : null };
    }
    const isDishdasha = sc => !!sc && sc.white >= 0.55 && (sc.contrast == null || sc.contrast >= 20);

    // ── الصوت ──
    // db: طيف ديسيبل (getFloatFrequencyData)، binHz: عرض الخانة. st يحمل أرضيّة الضجيج وتتبّع الصفّارة،
    // والواجهة تضع st.t (الزمن بالثواني) قبل كلّ نداء.
    function audioFrame(db, binHz, st) {
        const len = db.length;
        const at = hz => Math.max(1, Math.min(len - 1, Math.round(hz / binHz)));
        const lo = at(300), hi = at(3400);
        let sum = 0;
        for (let i = lo; i <= hi; i++) sum += Math.pow(10, db[i] / 10);
        const voiceDb = 10 * Math.log10(sum / (hi - lo + 1) + 1e-12);
        st.floor = (st.floor == null || voiceDb < st.floor) ? voiceDb : st.floor + 0.02;
        const voice = voiceDb > st.floor + 12;

        // الصفّارة نغمةٌ صافية: قمّةٌ تعلو جارتيها على بُعد ١٥٠–٤٠٠ هرتز بفارقٍ كبير.
        // الكلام والهتاف طيفٌ عريض — يعلو نطاقاً كاملاً لا خانةً واحدة، فلا يُعدّ صفّارة.
        const wl = at(2000), wh = at(4500);
        let pk = -Infinity, pi = wl;
        for (let i = wl; i <= wh; i++) if (db[i] > pk) { pk = db[i]; pi = i; }
        const k1 = Math.max(2, Math.round(150 / binHz)), k2 = Math.max(k1 + 1, Math.round(400 / binHz));
        let side = -Infinity;
        for (let d = k1; d <= k2; d++) {
            if (pi - d >= 0) side = Math.max(side, db[pi - d]);
            if (pi + d < len) side = Math.max(side, db[pi + d]);
        }
        const hit = pk > -60 && pk - side > 18;
        st.wRun = hit ? (st.wRun || 0) + 1 : 0;
        let whistle = false;
        if (st.wRun === 2 && (st.t || 0) - (st.lastW == null ? -1e9 : st.lastW) > 1.2) { whistle = true; st.lastW = st.t || 0; }
        return { voice, whistle };
    }

    // ── الحالة كلّ ثانية ──
    function runsOf(st) {
        const out = [];
        for (let i = 0; i < st.length; i++) {
            const last = out[out.length - 1];
            if (last && last.k === st[i]) last.len++;
            else out.push({ k: st[i], s: i, len: 1 });
        }
        return out;
    }

    // ms: شدّة الحركة لكلّ ثانية (null = لا إطار صالح) ← 'a' نشاط، 'i' انتظار، 'x' غير محسوب
    function classify(ms, active) {
        const n = ms.length, st = new Array(n);
        let prev = 'i';
        for (let i = 0; i < n; i++) {
            if (ms[i] == null) { st[i] = 'x'; continue; }
            let s = 0, c = 0;
            for (let j = Math.max(0, i - SMOOTH + 1); j <= i; j++) if (ms[j] != null) { s += ms[j]; c++; }
            const v = s / c;
            st[i] = (prev === 'a' ? v >= active * 0.6 : v >= active) ? 'a' : 'i';
            prev = st[i];
        }
        // مقطعٌ قصيرٌ بين مقطعين من حالةٍ أخرى يُضمّ إليهما (ارتجافة لا تغيّرٌ حقيقيّ)
        for (let pass = 0; pass < 2; pass++) {
            const r = runsOf(st).filter(x => x.k !== 'x');
            for (let k = 0; k < r.length; k++) {
                const cur = r[k];
                if (cur.len >= MIN_RUN) continue;
                const a = r[k - 1], b = r[k + 1];
                const to = a && b ? (a.k === b.k ? a.k : null) : (a || b ? (a || b).k : null);
                if (to && to !== cur.k) for (let i = cur.s; i < cur.s + cur.len; i++) if (st[i] !== 'x') st[i] = to;
            }
        }
        return st;
    }

    // ── عناصر الحصة ──
    // events: [{t, k}] ← عنصر كلّ ثانية (null قبل أوّل لمسة). لمساتٌ بمفاتيح قديمة (شرح/تنظيم…) تُهمل.
    function ctxSeries(events, n) {
        const out = new Array(n).fill(null);
        const ev = (events || []).filter(e => e && e.t != null && PART[e.k]).slice().sort((a, b) => a.t - b.t);
        let j = 0, cur = null;
        for (let t = 0; t < n; t++) {
            while (j < ev.length && ev[j].t <= t) { cur = ev[j].k; j++; }
            out[t] = cur;
        }
        return out;
    }
    // ثواني الحضور والزيّ: [[من، إلى)] — بلمسة «حضور وزيّ» (حيث لُمس، ولو تكرّر)، وإلّا تلقائيّاً بداية الحصة:
    //   • لمسة «الإحماء» أو «الإعداد البدني» أوّلاً ← ما قبلها كلّه (إلّا إن رأته الكاميرا نشاطاً في أغلبه: لُمست متأخّرة)؛
    //   • وإلّا أوّل توقّفٍ يبدأ في أوّل دقيقتين حتّى أوّل نشاط (والثواني غير المحسوبة — ضبط الكاميرا — لا تقطعه)، ولا يتجاوز أوّل لمسة.
    // التلقائيّ عشر دقائق على الأكثر، وأقصر من عشرين ثانيةً لا يُعدّ.
    function rollSpans(events, st) {
        const n = (st || []).length;
        const ev = (events || []).filter(e => e && e.t != null && PART[e.k]).slice().sort((a, b) => a.t - b.t);
        if (ev.some(e => e.k === 'roll')) {
            const ser = ctxSeries(ev, n), spans = [];
            for (let t = 0; t < n; t++) if (ser[t] === 'roll') { const l = spans[spans.length - 1]; if (l && l[1] === t) l[1] = t + 1; else spans.push([t, t + 1]); }
            return { spans, auto: false };
        }
        const first = ev[0];
        let from = null, to = null;
        // ما قبل لمسة الإحماء — إلّا إن رأت الكاميرا الطلبة نشطين أغلبه (لُمس الإحماء متأخّراً): فالقاعدة التالية
        let busy = false;
        if (first && (first.k === 'warm' || first.k === 'fit')) {
            let a = 0, i = 0;
            for (let t = 0; t < Math.min(n, first.t); t++) { if (st[t] === 'a') a++; else if (st[t] === 'i') i++; }
            busy = a + i >= 30 && a >= 0.6 * (a + i);
        }
        if (first && (first.k === 'warm' || first.k === 'fit') && !busy) { from = 0; to = Math.min(n, first.t); }
        else {
            let t0 = -1;
            for (let t = 0; t <= Math.min(n - 1, ROLL_START); t++) if (st[t] === 'i') { t0 = t; break; }
            if (t0 >= 0) {
                let t = t0, idle = 0;
                while (t < n && st[t] !== 'a') { if (st[t] === 'i') idle++; t++; }
                if (idle >= ROLL_MIN) { from = t0; to = t; }
            }
            if (from != null && first) to = Math.min(to, first.t);
        }
        if (from == null || to - from < ROLL_MIN) return { spans: [], auto: true };
        return { spans: [[from, Math.min(to, from + ROLL_AUTO_MAX)]], auto: true };
    }
    const inSpans = (spans, t) => (spans || []).some(s => t >= s[0] && t < s[1]);
    function ctxStats(series) {
        const sec = {};
        PARTS.forEach(x => { sec[x.k] = 0; });
        let covered = 0;
        series.forEach(k => { if (k && sec[k] != null) { sec[k]++; covered++; } });
        const pct = {};
        Object.keys(sec).forEach(k => { pct[k] = covered ? Math.round(100 * sec[k] / covered) : 0; });
        return { covered, sec, pct };
    }
    // لكلّ عنصر: مدّته، وزمن الحركة فيه (الكاميرا)، والشرح (كلامٌ في توقّف) والانتظار (توقّفٌ بلا كلام)، وحركة الطلبة
    // (كشف الطلبة)، والصفّارة — وترتيب ظهوره.
    function partsOf(series, st, secs) {
        const R = {};
        PARTS.forEach(x => { R[x.k] = { k: x.k, sec: 0, act: 0, idle: 0, explain: 0, wait: 0, n: 0, mv: 0, whistles: 0, first: -1 }; });
        series.forEach((k, t) => {
            const r = k && R[k];
            if (!r) return;
            if (r.first < 0) r.first = t;
            r.sec++;
            const s = secs[t] || {};
            if (st[t] === 'a') r.act++;
            else if (st[t] === 'i') { r.idle++; if (s.v) r.explain++; else r.wait++; }
            if (s.p && s.p.n) { r.n += s.p.n; r.mv += s.p.mv; }
            if (s.w) r.whistles++;
        });
        const order = PARTS.map(x => R[x.k]).filter(r => r.sec >= 30).sort((p, q) => p.first - q.first).map(r => r.k);
        const canon = PARTS.map(x => x.k).filter(k => order.includes(k));
        return {
            list: PARTS.map(x => {
                const r = R[x.k], cam = r.act + r.idle;
                return { k: x.k, sec: r.sec, activePct: cam ? Math.round(100 * r.act / cam) : null, explainSec: r.explain, waitSec: r.wait,
                         moving: r.n ? Math.round(100 * r.mv / r.n) : null, whistles: r.whistles };
            }),
            order, orderOk: order.join() === canon.join()
        };
    }
    // مقارنة كلّ عنصرٍ بالزمن الموصى به — بنسبته إلى زمن الحصة المرصود (حصةٌ من ٤٥ دقيقة يكبر فيها كلّ عنصر).
    // rec: {warm: دقائق, …} (اختيار المشرف) وإلّا PARTS.min. الفرق المقبول: الأكبر من دقيقتين و٤٠٪ من الموصى به.
    function partsDetail(M, rec) {
        const P = M && M.parts;
        if (!P || !P.list) return null;
        const recMin = {};
        PARTS.forEach(x => { recMin[x.k] = rec && rec[x.k] > 0 ? Number(rec[x.k]) : x.min; });
        const sumRec = PARTS.reduce((s, x) => s + recMin[x.k], 0);
        const total = P.list.reduce((s, r) => s + r.sec, 0);
        const scale = total && sumRec ? total / 60 / sumRec : 1;
        return P.list.map(r => {
            const want = recMin[r.k] * scale, have = r.sec / 60, tol = Math.max(2, 0.4 * want);
            // «غائب» لما لم يُلمس أو لُمس خطأً (أقلّ من ١٠ ث)، و«قصير جدّاً» لما حضر أقلّ من نصف دقيقة — كان كلاهما «غائباً» فسُئل المعلّم
            // في المداولة «لم يظهر الإحماء» عن إحماءٍ رآه المشرف (2026-10-29)
            const tiny = r.sec >= TINY_PART && r.sec < 30;
            const verdict = r.sec < TINY_PART ? 'missing' : tiny ? 'short' : have - want > tol ? 'long' : want - have > tol ? 'short' : 'ok';
            return Object.assign({}, r, { label: PART[r.k].label, short: PART[r.k].short, rec: Math.round(want * 10) / 10, minutes: Math.round(have * 10) / 10, verdict, tiny,
                lowAct: PART[r.k].act != null && r.sec >= 60 && (r.moving != null ? r.moving : r.activePct) != null && (r.moving != null ? r.moving : r.activePct) < PART[r.k].act });
        });
    }

    // ── التشكيلات عبر الحصة ──
    // التشكيل الغالب كلّ عشر ثوانٍ، ثمّ المقاطع المتّصلة من عشرين ثانيةً فأكثر = تشكيلٌ استُعمل.
    function formationStats(secs) {
        const win = [], qw = [];
        for (let t = 0; t < secs.length; t += 10) {
            const cnt = {};
            let qn = 0, qs = 0;
            secs.slice(t, t + 10).forEach(s => {
                const p = s && s.p, f = p && p.fm;
                if (f && f !== '-') cnt[f] = (cnt[f] || 0) + 1;
                if (p && p.n) { qn++; qs += (p.q || 0) / p.n; }
            });
            qw.push(qn ? String(Math.min(9, Math.round(9 * qs / qn))) : '-');     // SOFIT+: نصيب المنتظرين دورهم ٠–٩
            const top = Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p])[0];
            win.push(top && cnt[top] >= 2 ? top : '-');
        }
        const segs = [];
        win.forEach((c, i) => {
            const last = segs[segs.length - 1];
            if (last && last.type === c) last.len++;
            else segs.push({ type: c, start: i * 10, len: 1 });
        });
        const used = segs.filter(x => x.type !== '-' && x.len >= 2).map(x => ({ type: x.type, start: x.start, dur: x.len * 10 }));
        const byType = {};
        used.forEach(x => { const b = byType[x.type] || (byType[x.type] = { count: 0, sec: 0 }); b.count++; b.sec += x.dur; });
        let maxLine = 0;
        secs.forEach(s => { const l = s && s.p && s.p.ln || 0; maxLine = Math.max(maxLine, l); });
        // مقاطع القاطرة الطويلة بزمنها الحقيقيّ — اللقطات متباعدة (ثانيتان إلى خمس)، فغيابها حتّى ثماني ثوانٍ لا يقطع المقطع
        // (كان الزمن عدَّ الثواني التي فيها لقطة، فيقلّ عن الحقيقيّ حين تتباعد اللقطات). longRun أطولها، ومنه «لحظةٌ» للمداولة.
        let run = null, longRun = null, longLineSec = 0;
        const close = () => { if (run) { longLineSec += run.sec; if (!longRun || run.sec > longRun.sec) longRun = run; } run = null; };
        secs.forEach((s, t) => {
            const p = s && s.p;
            if (!p) { if (run && t - run.last > 8) close(); return; }
            if ((p.ln || 0) > LONG_LINE) {
                if (!run) run = { at: t, last: t, sec: 1, size: p.ln };
                else { run.last = t; run.sec = t - run.at + 1; run.size = Math.max(run.size, p.ln); }
            } else close();
        });
        close();
        if (longRun) delete longRun.last;
        return { segments: used, byType, types: Object.keys(byType), count: used.length, longLineSec, maxLine, longRun, windows: win.join(''), queue: qw.join('') };
    }

    // ── الحصة دقيقةً دقيقة: [حركة الطلبة٪ أو null، نشاط الصورة٪ أو null، العنصر الغالب أو null] ──
    // منها «لحظات الحصة» (أعلى حركةٍ وأدناها) بعد الرصد، ولا تحتاج حفظ الثواني نفسها
    function minuteSeries(secs, st, ctx) {
        const out = [];
        for (let t = 0; t < st.length; t += 60) {
            let pn = 0, pm = 0, pr = 0, a = 0, o = 0;
            const cc = {};
            for (let u = t; u < Math.min(st.length, t + 60); u++) {
                if (st[u] === 'r') continue;               // الحضور والزيّ ليس من الحصة دقيقةً دقيقة
                const s = secs[u], p = s && s.p;
                if (p && p.n) { pn += p.n; pm += p.mv; pr++; }
                if (st[u] === 'a') a++;
                if (st[u] !== 'x') o++;
                if (ctx && ctx[u]) cc[ctx[u]] = (cc[ctx[u]] || 0) + 1;
            }
            const top = Object.keys(cc).sort((p, q) => cc[q] - cc[p])[0] || null;
            out.push([pr >= 5 && pn ? Math.round(100 * pm / pn) : null, o >= 20 ? Math.round(100 * a / o) : null, top]);
        }
        return out;
    }

    // ── الطلبة عبر الحصة ──
    const median = arr => {
        if (!arr.length) return 0;
        const a = arr.slice().sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)];
    };
    const quantile = (arr, q) => {
        if (!arr.length) return 0;
        const a = arr.slice().sort((x, y) => x - y);
        return a[Math.min(a.length - 1, Math.floor(q * a.length))];
    };
    function summarizePeople(secs, st, ctx, grid) {
        const all = [];
        secs.forEach((s, t) => { if (s && s.p) all.push({ t, p: s.p }); });
        if (!all.length) return null;
        // الحضور والزيّ لا يدخل حركة الطلبة ولا انتظار الدور ولا موقع المعلّم — ويبقى منه العدد الأكبر والزيّ (يُرون فيه واقفين)
        const rows = all.filter(r => st[r.t] !== 'r');
        const share = (rs, k) => {
            const tot = rs.reduce((a, r) => a + r.p.n, 0);
            return tot ? Math.round(100 * rs.reduce((a, r) => a + (r.p[k || 'mv'] || 0), 0) / tot) : null;
        };
        const isCore = t => ctx && ACTIVE_PARTS.includes(ctx[t]);
        const coreRows = rows.filter(r => isCore(r.t));
        const useCore = coreRows.length >= 60;
        const activeRows = useCore ? coreRows : rows.filter(r => st[r.t] === 'a');
        const qTot = activeRows.reduce((a, r) => a + r.p.n, 0);
        const roi = rows.some(r => r.p.r);
        // شدّة النشاط: الجري (vg) نسبةً من الطلبة — بقيّة المتحرّكين معتدل (مشيٌ أو تمرينٌ في المكان)، والباقي ساكن
        const hasVig = rows.some(r => r.p.vg != null);
        // التزاحم: من المتحرّكين في زمن النشاط، كم كان أحدٌ ملاصقاً له
        const mvTot = activeRows.reduce((a, r) => a + (r.p.cr != null ? r.p.mv : 0), 0);
        const crTot = activeRows.reduce((a, r) => a + (r.p.cr || 0), 0);
        // الكرات: ما يثبت في عُشر اللقطات (المئين ٩٠) من زمن النشاط — وحصّةٌ لا تُرى فيها كرةٌ في عشرين لقطةً ليست حصّة كرة
        const bRows = (useCore ? coreRows : rows).filter(r => r.p.b != null);
        const ballSeen = bRows.filter(r => r.p.b >= 1).length;
        return {
            detSecs: rows.length,
            // عدد طلبة الحصة = أكبر عددٍ رُصد (الكشف ينقص أثناء الحركة والتداخل، ولا يزيد إلّا بخطأٍ نادر)
            classSize: all.reduce((m, r) => Math.max(m, r.p.n + r.p.o), 0),
            vigAll: hasVig ? share(rows, 'vg') : null,
            vigPlay: hasVig && useCore ? share(coreRows, 'vg') : null,
            crowdPct: mvTot >= 50 ? Math.round(100 * crTot / mvTot) : null,
            balls: ballSeen >= 20 ? quantile(bRows.map(r => r.p.b), 0.9) : null,
            teacher: teacherStats(rows, grid),
            pupils: median(rows.map(r => r.p.n + r.p.o)),
            inside: median(rows.map(r => r.p.n)),
            movingAll: share(rows),
            movingPlay: useCore ? share(coreRows) : null,
            queuePct: qTot ? Math.round(100 * activeRows.reduce((a, r) => a + r.p.q, 0) / qTot) : 0,
            outsideMed: roi ? median(rows.map(r => r.p.o)) : 0,
            // بغير الزيّ: ما يثبت في عُشر اللقطات على الأقلّ (لا قمّة لحظةٍ واحدة)
            dishEst: quantile(all.map(r => r.p.d || 0), 0.9),
            roi
        };
    }

    // ── المعلّم: أين وقف وكيف تنقّل ── p.t = [x, y, يتحرّك 1/0, على الطرف 1/0/-1 (لا يُعرف)]
    // التغطية: الملعب بشبكةٍ ٤×٣ — ما فيه حركةٌ للطلبة (من خريطة الحركة) وكم منه زاره المعلّم (ثلاث لقطاتٍ فأكثر)
    function teacherStats(rows, grid) {
        const tr = rows.filter(r => Array.isArray(r.p.t));
        if (tr.length < 30) return null;
        const known = tr.filter(r => r.p.t[3] !== -1);
        const CW = 4, CH = 3;
        const cellOf = (x, y) => Math.min(CH - 1, Math.max(0, Math.floor(y * CH))) * CW + Math.min(CW - 1, Math.max(0, Math.floor(x * CW)));
        const visits = new Array(CW * CH).fill(0);
        tr.forEach(r => { visits[cellOf(r.p.t[0], r.p.t[1])]++; });
        let active = null;
        const g = Array.from(grid || []);
        if (g.length === GRID_W * GRID_H && g.some(v => v > 0)) {
            const coarse = new Array(CW * CH).fill(0);
            g.forEach((v, i) => { const gx = i % GRID_W, gy = Math.floor(i / GRID_W); coarse[cellOf((gx + 0.5) / GRID_W, (gy + 0.5) / GRID_H)] += v; });
            const mx = Math.max(...coarse);
            active = coarse.map(v => v >= mx * 0.1);
        }
        const visited = visits.map(v => v >= 3);
        const pool = active || visited.map(() => true);
        const poolN = pool.filter(Boolean).length;
        return {
            secs: tr.length,
            edgePct: known.length >= 20 ? Math.round(100 * known.filter(r => r.p.t[3] === 1).length / known.length) : null,
            movePct: Math.round(100 * tr.filter(r => r.p.t[2]).length / tr.length),
            cover: poolN ? Math.round(100 * visited.filter((v, i) => v && pool[i]).length / poolN) : null,
            cells: visits.map(v => (v >= 3 ? 1 : 0)).join('')
        };
    }

    // ── الاستجابة لإشارة الصفّارة: ثوانٍ حتّى يتوقّف أغلب الطلبة (إن كانوا يتحرّكون) أو يبدؤوا (إن كانوا ساكنين) ──
    // مستوى النشاط كلّ ثانية: نسبة المتحرّكين من كشف الطلبة، وإلّا حركة الصورة نسبةً إلى عتبة النشاط.
    // «التوقّف» = هبوط المستوى دون ٤٥٪ ممّا كان قبلها، و«البدء» = بلوغه ٠٫٣٥ فأكثر وزيادته ربعاً — خلال عشرين ثانية، وإلّا «لم يُستجب».
    function whistleResponses(secs, activeThr) {
        const n = secs.length, hasP = secs.some(s => s && s.p && s.p.n);
        const L = secs.map(s => (hasP ? (s && s.p && s.p.n ? s.p.mv / s.p.n : null) : (s && s.m != null ? Math.min(1, s.m / (activeThr * 2)) : null)));
        const lv = t => { for (const d of [0, -1, 1, -2, 2]) { const v = L[t + d]; if (t + d >= 0 && t + d < n && v != null) return v; } return null; };
        const out = [];
        let lastW = -99;
        secs.forEach((s, w) => {
            if (!s || !s.w || w - lastW < 6) return;
            lastW = w;
            const pre = [];
            for (let k = 6; k >= 1; k--) { const v = L[w - k]; if (v != null) pre.push(v); }
            if (pre.length < 2) return;
            const before = pre.reduce((a, v) => a + v, 0) / pre.length;
            const kind = before >= 0.35 ? 'stop' : before <= 0.2 ? 'start' : null;
            if (!kind) return;
            let sec = null;
            for (let k = 1; k <= 20 && w + k < n; k++) {
                const a = lv(w + k), b = lv(w + k + 1);
                if (a == null) continue;
                // ثانيتان متتاليتان تحقّقان الشرط (لا ثانيةٌ عابرة)
                const v = b == null ? a : (kind === 'stop' ? Math.max(a, b) : Math.min(a, b));
                if (kind === 'stop' ? v <= before * 0.45 : v >= Math.max(0.35, before + 0.25)) { sec = k; break; }
            }
            out.push({ t: w, kind, sec });
        });
        const got = out.filter(r => r.sec != null).map(r => r.sec);
        const med = arr => (arr.length ? median(arr) : null);
        return {
            list: out.map(r => [r.t, r.kind === 'stop' ? 's' : 'g', r.sec == null ? -1 : r.sec]),
            n: out.length, med: med(got),
            stopMed: med(out.filter(r => r.kind === 'stop' && r.sec != null).map(r => r.sec)),
            startMed: med(out.filter(r => r.kind === 'start' && r.sec != null).map(r => r.sec)),
            slow: out.filter(r => r.sec == null || r.sec > 10).length
        };
    }

    // ── الملخّص ──
    // rec = { secs: [{m, v, w, p}], grid, sens, cells (منطقة الصفّ في الشبكة), ctx: [{t,k}] (عناصر الحصة), mic: 'teacher'|'device' }
    function summarize(rec) {
        const sens = SENS[rec && rec.sens] || SENS.medium;
        const secs = (rec && rec.secs) || [];
        const st = classify(secs.map(s => (s && s.m != null ? s.m : null)), sens.active);
        const ctx = ctxSeries(rec && rec.ctx, st.length);
        // الحضور والزيّ: حالةٌ مستقلّة 'r' — لا شرح ولا انتظار ولا نشاط (طلب المشرف 2026-10-27)
        const RS = rollSpans(rec && rec.ctx, st);
        RS.spans.forEach(([p, q]) => { for (let t = p; t < q && t < st.length; t++) st[t] = 'r'; });
        let a = 0, i = 0, x = 0, r = 0, rTalk = 0, talk = 0, explain = 0, heard = 0;
        st.forEach((k, t) => {
            if (k === 'r') { r++; if (secs[t] && secs[t].v) rTalk++; return; }
            if (k === 'a') a++; else if (k === 'i') i++; else x++;
            if (secs[t] && secs[t].v != null) heard++;
            if (secs[t] && secs[t].v) { talk++; if (k === 'i') explain++; }
        });
        const observed = a + i;
        const lessonSecs = r ? secs.map((s, t) => (st[t] === 'r' ? null : s)) : secs;

        // المقاطع بلا «غير المحسوب» ولا الحضور والزيّ: الانتظار بين نشاطين انتقالٌ، وأطوله يُذكر
        const compact = st.filter(k => k !== 'x' && k !== 'r');
        const runs = runsOf(compact);
        const internal = runs.filter((r, k) => r.k === 'i' && k > 0 && k < runs.length - 1 && r.len >= STOP_MIN);
        const longestIdle = internal.reduce((m, r) => Math.max(m, r.len), 0);
        const avgTransition = internal.length ? Math.round(internal.reduce((s, r) => s + r.len, 0) / internal.length) : 0;

        // الصفّارة وانتقالاتٌ تصحبها (±٨ ثوانٍ من بدء الانتظار أو نهايته)
        const whistleAt = [];
        secs.forEach((s, t) => { if (s && s.w) whistleAt.push(t); });
        const realIndex = [];                    // موضع كلّ ثانيةٍ مضغوطةٍ في الزمن الحقيقيّ
        st.forEach((k, t) => { if (k !== 'x' && k !== 'r') realIndex.push(t); });
        // متى بدأ أطول انتظار — «لحظةٌ» تُطرح في المداولة بوقتها
        const idleRun = internal.reduce((b, r) => (!b || r.len > b.len ? r : b), null);
        const longestIdleAt = idleRun ? realIndex[idleRun.s] : null;
        const near = t => whistleAt.some(w => Math.abs(w - t) <= 8);
        const cued = internal.filter(r => near(realIndex[r.s]) || near(realIndex[r.s + r.len - 1])).length;

        // بنية الحصة بلا عناصر ملموسة: أوّل ٢٠٪ إحماء، وآخر ١٥٪ ختام
        const n = compact.length;
        const pct = arr => (arr.length ? Math.round(100 * arr.filter(k => k === 'a').length / arr.length) : 0);
        const wN = Math.round(n * 0.2), cN = Math.round(n * 0.15);
        const phases = { warm: pct(compact.slice(0, wN)), main: pct(compact.slice(wN, n - cN)), close: pct(compact.slice(n - cN)) };

        // استثمار المساحة: داخل منطقة الصفّ وحدها إن رُسمت
        const grid = Array.from((rec && rec.grid) || []);
        const cells = rec && rec.cells && rec.cells.length === grid.length ? rec.cells : null;
        const gr = cells ? grid.filter((v, k) => cells[k]) : grid;
        const max = gr.reduce((m, v) => Math.max(m, v), 0);
        const total = gr.reduce((s, v) => s + v, 0);
        const sorted = gr.slice().sort((p, q) => q - p);
        const top = sorted.slice(0, Math.max(1, Math.round(gr.length * 0.2))).reduce((s, v) => s + v, 0);
        const space = {
            coverage: max && gr.length ? Math.round(100 * gr.filter(v => v >= max * 0.15).length / gr.length) : 0,
            concentration: total ? Math.round(100 * top / total) : 0
        };

        // عناصر الحصة، وكلام المعلّم أثناء النشاط (العناصر النشطة إن لُمست، وإلّا حالة الكاميرا)
        const C = ctxStats(ctx);
        const useCtx = C.covered >= Math.max(60, (st.length - r) * 0.5);
        let coachBase = 0, coachSec = 0;
        st.forEach((k, t) => {
            const on = useCtx ? ACTIVE_PARTS.includes(ctx[t]) : k === 'a';
            if (!on || !secs[t] || secs[t].v == null) return;
            coachBase++;
            if (secs[t].v) coachSec++;
        });

        // الخطّ الزمنيّ: مقاطع عشر ثوانٍ بالحالة الغالبة وشدّةٍ نسبيّة، وعنصرها الغالب
        const timeline = [];
        for (let t = 0; t < st.length; t += 10) {
            const part = st.slice(t, t + 10), ms = lessonSecs.slice(t, t + 10).map(s => (s && s.m != null ? s.m : null)).filter(v => v != null);
            const cnt = { a: 0, i: 0, x: 0, r: 0 };
            part.forEach(k => { cnt[k]++; });
            const k = 2 * cnt.r >= part.length ? 'r' : cnt.x > cnt.a + cnt.i ? 'x' : (cnt.a >= cnt.i ? 'a' : 'i');
            const m = ms.length ? ms.reduce((s, v) => s + v, 0) / ms.length : 0;
            const cc = {};
            ctx.slice(t, t + 10).forEach(c => { if (c) cc[c] = (cc[c] || 0) + 1; });
            const top1 = Object.keys(cc).sort((p, q) => cc[q] - cc[p])[0];
            timeline.push({ k, v: k === 'r' ? 0 : Math.min(1, m / (sens.active * 3)), c: k === 'r' ? ROLL.c : top1 ? PART[top1].c : '-' });
        }
        // طابور الحضور ليس قاطرة: التشكيلات من زمن الحصة وحده
        const forms = formationStats(lessonSecs);
        const mins = minuteSeries(secs, st, ctx);

        return {
            seconds: st.length, lessonSec: st.length - r, observed, activeSec: a, idleSec: i, excludedSec: x,
            admin: r ? { sec: r, auto: RS.auto, spans: RS.spans.map(s => [s[0], Math.min(s[1], st.length)]), talkSec: rTalk } : null,
            activePct: observed ? Math.round(100 * a / observed) : 0,
            waits: internal.length, longestIdle, longestIdleAt, avgTransition, mins,
            talkSec: talk, explainSec: explain, explainPct: observed ? Math.round(100 * explain / observed) : 0,
            talkPct: heard ? Math.round(100 * talk / heard) : 0,
            coachSec, coachPct: coachBase ? Math.round(100 * coachSec / coachBase) : 0, coachBase,
            mic: rec && rec.mic === 'teacher' ? 'teacher' : 'device',
            whistles: whistleAt.length, cued,
            phases, structure: {
                warm: phases.warm >= 40,
                main: phases.main >= 50,
                close: phases.close <= phases.main - 15
            },
            ctx: { covered: C.covered, pct: C.pct, sec: C.sec },
            parts: partsOf(ctx, st, secs),
            people: summarizePeople(secs, st, useCtx ? ctx : null, rec && rec.grid),
            resp: whistleAt.length ? whistleResponses(secs, sens.active) : null,
            forms: forms.windows.replace(/-/g, '').length ? forms : null,
            space, timeline, states: st
        };
    }

    // ── الصياغة ──
    const g = (t, female) => String(t || '').replace(/\{([^|{}]*)\|([^|{}]*)\}/g, (m, a, b) => (female ? b : a));
    // العدد بين قوسين (يستقيم في النصّ العربيّ) بتمييزه الصحيح
    function count(n, one, two, few, many) {
        if (n === 1) return one;
        if (n === 2) return two;
        return '(' + n + ') ' + (n >= 3 && n <= 10 ? few : many);
    }
    function dur(sec) {
        sec = Math.max(0, Math.round(sec || 0));
        if (sec < 60) return count(sec, 'ثانية واحدة', 'ثانيتان', 'ثوانٍ', 'ثانية');
        const m = Math.round(sec / 60);
        return count(m, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة');
    }
    const times = n => count(n, 'مرّة واحدة', 'مرّتين', 'مرّات', 'مرّة');
    // المدّة بعد حرف جرٍّ أو مفعولاً به: المثنّى بالياء («في دقيقتين»، «استغرق ثانيتين»)
    const durG = sec => dur(sec).replace(/^دقيقتان$/, 'دقيقتين').replace(/^ثانيتان$/, 'ثانيتين');
    const pupilsN = n => count(n, 'طالبٌ واحد', 'طالبان', 'طلبة', 'طالباً');
    const list = arr => (arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join('، و') + '، و' + arr[arr.length - 1]);
    const clamp = s => Math.max(1, Math.min(5, s));
    // «الإحماء (5) دقائق، والإعداد البدني (7) دقائق…» للعناصر الحاضرة
    const partsText = det => list(det.filter(r => r.verdict !== 'missing').map(r => r.label + ' ' + dur(r.sec)));
    const partsWord = n => count(n, 'عنصراً واحداً', 'عنصرين', 'عناصر', 'عنصراً');

    // زمن الحصة بلا الحضور والزيّ (والمحفوظ قبله بلا admin)
    const lessonSecOf = m => Math.max(0, ((m && m.seconds) || 0) - ((m && m.admin && m.admin.sec) || 0));
    // «، بعد استثناء (4) دقائق لتسجيل الحضور والزيّ» — دقيقةٌ فأكثر
    const rollNote = m => (m && m.admin && m.admin.sec >= 60 ? '، بعد استثناء ' + durG(m.admin.sec) + ' لتسجيل الحضور والزيّ' : '');

    // درجة الثقة: من زمن الرصد ونسبة المستبعد، أو من تغطية السياق، أو من عدد اللمسات على البند
    function confidence(s, M, counts) {
        const m = M || {};
        if (s.basis === 'camera') {
            const o = m.observed || 0, bad = (m.excludedSec || 0) / Math.max(1, o + (m.excludedSec || 0));
            return o >= 1800 && bad < 0.1 ? 'high' : o >= 900 && bad < 0.25 ? 'medium' : 'low';
        }
        if (s.basis === 'ai') {
            const d = (m.people && m.people.detSecs) || 0;
            return d >= 1500 ? 'high' : d >= 900 ? 'medium' : 'low';
        }
        if (s.basis === 'ctx') {
            const cov = ((m.ctx && m.ctx.covered) || 0) / Math.max(1, lessonSecOf(m));
            return cov >= 0.85 ? 'high' : cov >= 0.6 ? 'medium' : 'low';
        }
        if (s.basis === 'speech') {
            // كلامٌ مسموعٌ كثيرٌ أوثق، وميكروفون الهاتف يلتقط غير المعلّم فتنزل الثقة درجة
            const w = (m.speech && m.speech.words) || 0;
            const lv = w >= 800 ? 2 : w >= 300 ? 1 : 0;
            return ['low', 'medium', 'high'][Math.max(0, lv - (m.mic === 'teacher' ? 0 : 1))];
        }
        const n = TAGS.filter(t => t.item === s.id || (t.also || []).includes(s.id)).reduce((a, t) => a + ((counts && counts[t.k]) || 0), 0);
        return n >= 4 ? 'high' : n >= 2 ? 'medium' : 'low';
    }

    // ── كلام المعلّم (js/eye-speech.js) ──
    // يُعتدّ به حين يُسمع ما يكفي: ١٢٠ كلمةً وخمس عشرة عبارة، والمعدّلات لكلّ عشر دقائق من الحصة
    const speechOf = M => (M && M.speech && M.speech.words >= 120 && M.speech.clauses >= 15 ? M.speech : null);
    const speechMin = SP => Math.max(5, (SP.lesson || 0) / 60);
    const per10 = (SP, x) => Math.round(100 * x / speechMin(SP)) / 10;
    function speechFbText(SP) {
        const parts = [];
        if (SP.corr.n) parts.push(count(SP.corr.n, 'تصحيحٌ واحد', 'تصحيحان', 'تصحيحات', 'تصحيحاً') + ' لأداء الطلبة' + (SP.corr.spec ? ' منها (' + SP.corr.spec + ') بالمهارة نفسها' : ''));
        if (SP.check.n) parts.push('تحقّقٌ من فهمهم ' + times(SP.check.n));
        if (SP.q.n) parts.push(count(SP.q.n, 'سؤالٌ واحد', 'سؤالان', 'أسئلة', 'سؤالاً') + (SP.q.hi ? ' منها (' + SP.q.hi + ') تستثير التفكير' : ''));
        return parts.length ? 'سُمع في كلام {المعلم|المعلمة}: ' + parts.join('، و') : 'لم يُسمع في كلام {المعلم|المعلمة} تصحيحٌ لأداء الطلبة ولا أسئلة';
    }

    // من دليل المعلّم: كم نقطةً فنّيّةً للمهارة سُمعت في كلامه (lesson-guide.js: speechCoverage)
    const coverText = GD => (GD && GD.cover && GD.cover.total ? '، و{ذكر|ذكرت} من النقاط الفنّيّة لمهارة الدرس (' + GD.cover.said + ') من (' + GD.cover.total + ')' : '');

    // الاستجابة للصفّارة حين تكفي (ثلاث إشاراتٍ قيست)، والمعلّم حين رُصد خمس دقائق
    // استثمار المساحة (البند ٩) من خريطة الحركة: «narrow» أكثر من ٦٠٪ من الحركة في خُمس الخلايا، و«wide» تغطيةٌ ٧٠٪ فأكثر بلا تركّز — أوّليّة
    const spaceOf = M => {
        const sp = M && M.space;
        if (!sp || (M.observed || 0) < MIN_OBSERVE || !sp.coverage) return null;
        return sp.concentration >= 60 ? 'narrow' : sp.coverage >= 70 && sp.concentration <= 40 ? 'wide' : null;
    };
    const respOf = M => { const R = M && M.resp; return R && R.med != null && R.list.filter(x => x[2] >= 0).length >= 3 ? R : null; };
    const teacherOf = M => { const T = ADV && M && M.people && M.people.teacher; return T && T.secs >= 300 ? T : null; };   // متقدّم
    // طلبةٌ لكلّ كرة (العدد الأكبر ÷ الكرات) — حين تُرى الكرات
    // بالكاميرا متقدّم؛ وما كتبه المشرف بيده (ballsSet) يُعتدّ به دائماً
    const ballRatio = M => { const P = M && M.people; return P && P.balls && (ADV || P.ballsSet) ? Math.max(1, Math.round((P.classSize || P.inside || 0) / P.balls)) : null; };
    // «كرةٌ لكلّ طالبين / (٤) طلبة» — بالجرّ بعد «لكلّ»
    const perPupils = r => (r === 1 ? 'طالب' : r === 2 ? 'طالبين' : '(' + r + ') ' + (r <= 10 ? 'طلبة' : 'طالباً'));

    // M من summarize (أو المحفوظ منه)، counts {وسم: عدد}،
    // ctx {female, pupil(text), sample (عيّنة الطلبة), follow (متابعة أهداف الزيارة السابقة — targetCheck), followDate}
    function suggest(M, counts, ctx) {
        ctx = ctx || {};
        const F = !!ctx.female, P = typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        const c = k => (counts && counts[k]) || 0;
        const out = [];
        const m = M || {};
        const add = (id, score, basis, evidence, conf) => {
            const s = { id, score: clamp(score), basis, evidence: P(g(evidence, F)) };
            s.conf = conf || confidence(s, m, counts);
            out.push(s);
        };
        const nConf = n => (n >= 8 ? 'high' : n >= 6 ? 'medium' : 'low');

        // ١ التحصيل — من «عيّنة الطلبة»: إتقانهم للمهارة في آخر قراءة (السلّم بكمّيّات الاستمارة: جميع/معظم/أغلب/قليل/نادر)
        const SS = sampleStats(ctx.sample);
        const GD = ctx.guide || null;                   // دليل المعلّم (lesson-guide.js: guideCtx) — المهارة ونقاطها الفنّيّة
        if (SS && SS.final) {
            const f = SS.final, late = SS.finalRound === 'b' && SS.a.rated > 0;
            const sk = GD && GD.skill ? 'مهارة «' + GD.skill + '»' : 'المهارة';
            add(1, quantScore(f.pct), 'sample',
                'في عيّنةٍ من ' + pupilsN(f.rated) + (late ? ' في آخر الحصة' : '') + ': أتقن ' + sk + ' (' + f.ok + ')، وأدّاها جزئيّاً (' + f.part + ')، ولم يتقنها (' + f.no + ') — نسبة الإتقان (' + f.pct + '%)'
                + (GD && GD.weak ? '، وأضعف نقاطها الفنّيّة «' + GD.weak.short + '» (' + GD.weak.ok + ' من ' + GD.weak.rated + ')' : '')
                + (c('rules') ? '، وطبّق الطلبة القانون المرتبط بالمهارة أثناء اللعب ' + times(c('rules')) : '')
                + (c('answers') ? '، وأجابوا عن الأسئلة المعرفية المرتبطة بالدرس ' + times(c('answers')) : '') + '.',
                nConf(f.rated));
        }

        // ١١ التقويم الذاتي والتطوير المهنيّ — من متابعة أهداف الزيارة السابقة (العمل بتوجيهات المشرف). أعلاه «جيد».
        const FL = (ctx.follow || []).filter(f => f && f.verdict && f.verdict !== 'na');
        if (FL.length) {
            const met = FL.filter(f => f.verdict === 'met').length, better = FL.filter(f => f.verdict === 'better').length, worse = FL.filter(f => f.verdict === 'worse').length;
            const s = met === FL.length ? 2 : met >= 1 || 2 * better >= FL.length ? 3 : 4;
            let e = 'من أهداف الزيارة السابقة' + (ctx.followDate ? ' (' + ctx.followDate + ')' : '') + ': تحقّق (' + met + ') من (' + FL.length + ')';
            if (better) e += '، وتحسّن (' + better + ') دون أن يبلغ هدفه';
            if (worse) e += '، وتراجع (' + worse + ')';
            e += ' — ' + list(FL.map(f => f.label + ' (' + fmtTarget(f.unit, f.base) + ' ← ' + fmtTarget(f.unit, f.now) + ')'));
            add(11, s, 'follow', e + '.', FL.length >= 3 ? 'high' : FL.length === 2 ? 'medium' : 'low');
        }
        const people = m.people && m.people.detSecs >= MIN_OBSERVE / 2 && m.people.movingAll != null ? m.people : null;
        const cx = m.ctx && m.ctx.covered >= Math.max(60, lessonSecOf(m) * 0.5) ? m.ctx : null;
        const teacherMic = m.mic === 'teacher' && (m.coachBase || 0) >= 300;

        // ٧ فاعلية الإدارة الصفّيّة — حركة الطلبة أنفسهم إن كُشفوا، وإلّا حركة الصورة؛ والقاطرات الطويلة تنقصها
        const classN = people ? (people.classSize || people.inside) : 0;
        if ((m.observed || 0) >= MIN_OBSERVE) {
            let s, e, basis, s0;
            if (people) {
                const core = people.movingPlay != null;
                const p = core ? people.movingPlay : people.movingAll;
                const T = core ? [65, 50, 38, 25] : [55, 45, 35, 25];
                s = p >= T[0] ? 1 : p >= T[1] ? 2 : p >= T[2] ? 3 : p >= T[3] ? 4 : 5;
                e = 'تحرّك الطلبة (' + p + '%) من ' + (core ? 'زمن الإحماء والإعداد البدني والأنشطة' : 'زمن الرصد' + rollNote(m)) + ' في المتوسّط، وعددهم ' + pupilsN(classN);
                const vg = core ? people.vigPlay : people.vigAll;
                if (ADV && vg != null && p >= 10) e += '، منها (' + vg + '%) جرياً أو نشاطاً شديداً';
                basis = 'ai';
            } else {
                const p = m.activePct;
                s = p >= 60 ? 1 : p >= 50 ? 2 : p >= 40 ? 3 : p >= 30 ? 4 : 5;
                e = 'بلغ زمن النشاط الحركي للطلبة (' + p + '%) من زمن الرصد، أي ' + dur(m.activeSec) + ' من ' + dur(m.observed) + rollNote(m);
                basis = 'camera';
            }
            s0 = s;                          // المعدِّلات (الانتظار، القاطرات، الصفّارة، موقع المعلّم) ترفع درجةً واحدةً وتنزل درجتين على الأكثر
            if (m.longestIdle >= 300) s++;
            else if (m.waits >= 2 && m.avgTransition <= 45 && m.longestIdle < 180) s--;
            const FM = m.forms;
            if (FM && FM.longLineSec >= 120 && FM.maxLine > LONG_LINE) s++;
            e += m.waits ? '، وتخلّلته ' + count(m.waits, 'فترة انتظار واحدة', 'فترتا انتظار', 'فترات انتظار', 'فترة انتظار') + ' أطولها ' + dur(m.longestIdle)
                         : '، بلا فترات انتظار طويلة بين الأنشطة';
            if (FM && FM.longLineSec >= 60 && FM.maxLine > LONG_LINE) e += '، ووقفت قاطراتٌ طويلةٌ (حتّى ' + pupilsN(FM.maxLine) + ') مدّة ' + dur(FM.longLineSec);
            if (m.cued) e += '، ونُظّم ' + count(m.cued, 'انتقالٌ واحد', 'انتقالان', 'انتقالات', 'انتقالاً') + ' بالصفّارة';
            // الاستجابة لإشارات البدء والتوقّف (شاهدٌ في البند نفسه): سريعةٌ ترفع، وبطيئةٌ تنزل
            const R = respOf(m);
            if (R) {
                if (R.med <= 5) s--; else if (R.med >= 12) s++;
                e += '، واستجاب الطلبة لإشارة الصفّارة خلال ' + dur(R.med) + ' في المتوسّط (' + R.n + ' ' + (R.n >= 3 && R.n <= 10 ? 'إشارات' : 'إشارة') + ')';
                if (R.slow) e += '، منها ' + count(R.slow, 'إشارةٌ واحدة', 'إشارتان', 'إشارات', 'إشارة') + ' تأخّرت الاستجابة لها';
            }
            // موقع المعلّم: على أطراف الطلبة يراهم جميعاً (الإشراف النشط)، أم في وسطهم وبعضهم خلفه
            const TS = teacherOf(m);
            if (TS && TS.edgePct != null) {
                if (TS.edgePct < 35) s++;
                e += '، ووقف {المعلم|المعلمة} على أطراف الطلبة (' + TS.edgePct + '%) من الوقت' + (TS.cover != null ? ' {وتنقّل|وتنقّلت} في (' + TS.cover + '%) من مساحة النشاط' : '');
            }
            const SP7 = speechOf(m);
            if (SP7 && SP7.clauses >= 20 && SP7.orgShare >= 40) e += '، وكان (' + SP7.orgShare + '%) من كلام {المعلم|المعلمة} تعليماتٍ تنظيميّة';
            // توزيع الأدوات وجمعها (الاستمارة: «هدر وقت الحصة في تنظيم وتوزيع الأدوات») — لمستان فأكثر تنزل درجة
            if (c('equip')) { if (c('equip') >= 2) s++; e += '، وتوقّف النشاط لتوزيع الأدوات أو جمعها ' + times(c('equip')); }
            if (c('misbehave')) e += '، ورُصد سلوكٌ غير منضبط لم يُعالَج ' + times(c('misbehave'));
            add(7, Math.max(s0 - 1, Math.min(s0 + 2, s)), basis, e + '.');
        } else if (c('equip')) {
            // بلا كاميرا: من لمسة التوقّف لتوزيع الأدوات وحدها — دليلٌ سالبٌ واحدٌ لا يحكم على الحصة كلّها
            add(7, c('equip') >= 2 ? 4 : 3, 'taps', 'توقّف النشاط لتوزيع الأدوات أو جمعها ' + times(c('equip'))
                + (c('misbehave') ? '، ورُصد سلوكٌ غير منضبط لم يُعالَج ' + times(c('misbehave')) : '') + '.');
        }

        // ٦ تخطيط المنهاج — من عناصر الحصة الخمسة إن لُمست (حضورها وترتيبها وزمن كلٍّ منها)، وإلّا من بنيتها المرئيّة.
        // أعلاه «جيد»: التخطيط المكتوب يقدّره المشرف.
        const det = cx ? partsDetail(m, m.rec) : null;
        // والخطّة الفصليّة (الاستمارة: «التوافق مع الخطة الفصلية وتوزيع الوحدات»): عنوان الدرس مقابل موضوع الأسبوع — مطابقةٌ واضحة تلقائيّاً،
        // وما سواها يؤكّده المشرف (planMatch + اختياره في النتيجة). عدم التوافق المؤكَّد ينزل درجة؛ ولا يُقترح البند من الخطّة وحدها.
        const PL = ctx.plan && ctx.plan.match != null && Array.isArray(ctx.plan.planned) && ctx.plan.planned.length ? ctx.plan : null;
        const planTxt = () => (!PL ? '' : PL.match ? '، ووافق عنوان الدرس موضوع الأسبوع في الخطة الفصليّة («' + PL.planned.join('» أو «') + '»)'
            : '، ولم يوافق عنوان الدرس «' + PL.topic + '» موضوع الأسبوع في الخطة الفصليّة («' + PL.planned.join('» أو «') + '»)');
        if (det && cx.covered >= MIN_STRUCTURE && det.some(r => r.verdict !== 'missing')) {
            const present = det.filter(r => r.verdict !== 'missing'), missing = det.filter(r => r.verdict === 'missing');
            const long = present.filter(r => r.verdict === 'long'), short = present.filter(r => r.verdict === 'short');
            const orderOk = !m.parts || m.parts.orderOk !== false;
            let s = 2 + Math.min(2, missing.length) + (orderOk ? 0 : 1) + (long.length + short.length >= 2 ? 1 : 0);
            let e = (missing.length ? 'اشتملت الحصة على ' + partsWord(present.length) + ' من عناصرها الخمسة: ' : 'اشتملت الحصة على عناصرها الخمسة: ') + partsText(det);
            if (missing.length) e += '، وغاب عنها ' + list(missing.map(r => r.label));
            if (long.length) e += '، وطال ' + list(long.map(r => r.label)) + ' عن الزمن الموصى به';
            if (short.length) e += '، وقصر ' + list(short.map(r => r.label)) + ' عنه';
            if (!orderOk) e += '، ولم تأتِ العناصر بترتيبها';
            if (PL && !PL.match) s++;
            add(6, s, 'ctx', e + planTxt() + '.');
        } else if ((m.observed || 0) >= MIN_STRUCTURE && m.structure) {
            const ok = ['warm', 'main', 'close'].filter(k => m.structure[k]).length;
            let s = { 3: 2, 2: 3, 1: 4, 0: 5 }[ok];
            const parts = [
                m.structure.warm ? 'بدأت الحصة بإحماءٍ نشط (' + m.phases.warm + '%)' : 'كان الإحماء في أوّل الحصة محدوداً (' + m.phases.warm + '%)',
                m.structure.main ? 'وجاء الجزء الرئيس أكثرها نشاطاً (' + m.phases.main + '%)' : 'وقلّ النشاط في الجزء الرئيس (' + m.phases.main + '%)',
                m.structure.close ? 'وهدأ الختام للتهدئة والمراجعة' : 'ولم يظهر ختامٌ للتهدئة والمراجعة'
            ];
            if (PL && !PL.match) s++;
            add(6, s, 'camera', parts.join('، ') + planTxt() + '.');
        }

        // ٨ استراتيجيّات التدريس — تسجيلات المشرف، والشرح الطويل (من السياق أو الصوت) ينقصها
        // والتعلّم بالاكتشاف من الاستراتيجيّات (الاستمارة: «توظيف التعلم بالاكتشاف الموجه»)، ولعبة الإقصاء تنقصها («قلة فرص الممارسة العملية»)
        const strat = ['demo', 'groups', 'games', 'stations', 'levels', 'discover'].filter(k => c(k) > 0);
        const elimN = c('elim');
        if (strat.length || elimN) {
            // دليلٌ موجبٌ لا يُنتج «غير ملائم» (2026-10-29): لمسةٌ واحدة تعني أنّ المشرف رأى الاستراتيجيّة، لا أنّها وحدها في الحصة —
            // فأدنى ما تقترحه اللمسات «ملائم»، وما دونه من الشرح الطويل (أدناه) أو من لمساتٍ سالبة على البند
            const s0 = strat.length ? (strat.length >= 4 ? 1 : strat.length === 3 ? 2 : 3) : (elimN >= 2 ? 4 : 3);
            let s = s0, basis = 'taps';
            const elimTxt = 'وُظّفت لعبة إقصاءٍ تُخرج الطلبة من الممارسة ' + times(elimN);
            let e = !strat.length ? elimTxt : strat.length === 1 ? '{وظّف المعلم|وظّفت المعلمة}: ' + TAG[strat[0]].label
                  : '{نوّع المعلم|نوّعت المعلمة} بين: ' + list(strat.map(k => TAG[k].label));
            if (strat.length && elimN) { s++; e += '، و' + elimTxt; }
            const longAudio = (m.observed || 0) >= MIN_OBSERVE && m.explainPct > 40;
            if (longAudio) { s++; e += '، مع شرحٍ طويل استغرق (' + m.explainPct + '%) من زمن الرصد' + rollNote(m); basis = 'both'; }
            // فرص الممارسة الفعليّة: حركةٌ قليلة في زمن الأنشطة (الاستمارة: «قلة فرص الممارسة العملية للطلبة»)
            const mv8 = (m.observed || 0) >= MIN_OBSERVE ? movingOf(m) : null;
            if (mv8 != null && mv8 < 35) { s++; e += '، وقلّت فرص الممارسة الفعليّة: (' + mv8 + '%) من زمن الأنشطة'; basis = 'both'; }
            add(8, Math.min(s0 + 2, s), basis, e + '.');
        }

        // ١٠ أساليب التقويم — ومعها توجيه المعلّم أثناء النشاط من ميكروفونه
        const fb = ['fbInd', 'fbGrp', 'ask', 'peer', 'obsCard', 'record'];
        const fbTotal = fb.reduce((s, k) => s + c(k), 0), kinds = fb.filter(k => c(k) > 0).length;
        const SP = speechOf(m);
        // التعزيز اللفظيّ من المعلّم تغذيةٌ راجعة (البند ١٠) — لا شاهدٌ على قيم الطلبة (البند ٤): يُذكر هنا ولا يغيّر الدرجة
        const praiseTxt = SP && SP.praise.n ? '، وسُمع تعزيزٌ لفظيّ ' + times(SP.praise.n) + (SP.praise.spec ? ' منه (' + SP.praise.spec + ') بما أجاده الطالب تحديداً' : '') : '';
        if (!fbTotal && !c('fbMiss') && SP && speechMin(SP) >= 10) {
            // من كلامه وحده: التصحيح والتحقّق من الفهم، والأسئلة بنصف وزن — وأدناه «غير ملائم» (المحوِّل قد يفوته كلام)
            const r = per10(SP, SP.corr.n + SP.check.n) + per10(SP, SP.q.n) / 2;
            const top = SP.corr.spec >= 8 && SP.check.n >= 2 && SP.q.hi >= 2;
            add(10, r >= 6 ? (top ? 1 : 2) : r >= 3 ? 3 : 4, 'speech', speechFbText(SP) + praiseTxt + coverText(GD) + '.');
        }
        if (fbTotal || c('fbMiss')) {
            // خطأٌ واحدٌ لم يُصحَّح لا يحكم على الحصة كلّها، والتغذية الراجعة القليلة دليلٌ موجبٌ لا يُنزل دون «ملائم» (2026-10-29)
            let s = !fbTotal ? (c('fbMiss') >= 2 ? 4 : 3) : fbTotal >= 8 && kinds >= 3 ? 1 : fbTotal >= 6 && kinds >= 2 ? 2 : 3;
            const bits = [];
            if (c('fbInd')) bits.push('تغذية راجعة فردية ' + times(c('fbInd')));
            if (c('fbGrp')) bits.push('جماعية ' + times(c('fbGrp')));
            if (c('ask')) bits.push('أسئلة تقويمية ' + times(c('ask')));
            if (c('peer')) bits.push('تقويماً ذاتياً أو بين الأقران ' + times(c('peer')));
            if (c('obsCard')) bits.push('بطاقة ملاحظةٍ لتقييم المهارة ' + times(c('obsCard')));
            if (c('record')) bits.push('رصداً للأداء في سجل المتابعة ' + times(c('record')));
            let e = fbTotal ? '{وظّف المعلم|وظّفت المعلمة}: ' + list(bits) : '';
            if (c('fbMiss')) {
                if (fbTotal && c('fbMiss') >= 2) s++;
                e += (e ? '، و' : '') + 'رُصد خطأٌ في الأداء لم يُصحَّح ' + times(c('fbMiss'));
            }
            let basis = 'taps';
            if (teacherMic && fbTotal) {
                if (m.coachPct >= 20 && fbTotal >= 3) s--;
                else if (m.coachPct < 5) s++;
                e += '، و{تحدّث|تحدّثت} إلى الطلبة أثناء النشاط (' + m.coachPct + '%) من زمنه';
                basis = 'both';
            }
            if (SP) {
                // كلامه يقرّب درجة اللمسات درجةً واحدةً نحو شاهده
                const r = per10(SP, SP.corr.n + SP.check.n) + per10(SP, SP.q.n) / 2;
                const ss = r >= 6 ? 2 : r >= 3 ? 3 : 4;
                if (ss < s) s--; else if (ss > s + 1) s++;
                e += '، و' + speechFbText(SP) + praiseTxt + coverText(GD);
                basis = 'both';
            }
            add(10, s, basis, e + '.');
        }

        // ٣ مهارات التعلّم — ما يفعله **الطلبة**: القيادة، والتعاون، والتفكير الخططيّ، والالتزام بالأدوار، وتقويم الزميل
        // (الاستمارة: «تقييم الطالب لأداء زميله باستخدام البطاقة»). أسئلة المعلّم التي تستثير التفكير تُذكر هنا ولا تقترح البند وحدها
        // ولا تغيّر درجته (2026-10-31): هي فعل المعلّم، وشاهدها في البند ١٠.
        const SK = ['lead', 'team', 'tactic', 'roles', 'peer'], SK_TXT = { peer: 'تقويم الطلبة أداءهم وأداء زملائهم' };
        const sk = SK.filter(k => c(k) > 0);
        if (sk.length) {
            const s = sk.length >= 3 ? 1 : sk.length === 2 ? 2 : 3;
            let e = 'ظهرت في الحصة مواقف: ' + list(sk.map(k => SK_TXT[k] || TAG[k].label));
            if (SP && (SP.q.hi >= 1 || SP.q.n >= 5))
                e += '، و' + (SP.q.hi ? '{طرح المعلم|طرحت المعلمة} ' + count(SP.q.hi, 'سؤالاً واحداً', 'سؤالين', 'أسئلة', 'سؤالاً') + ' تستثير التفكير (لماذا، كيف، ما الفرق)'
                                     : 'كانت أسئلة {المعلم|المعلمة} (' + SP.q.n + ') مغلقةً لا تستثير التفكير');
            add(3, s, 'taps', e + '.');
        }

        // ٤ القيم والسلوك — سلوك **الطلبة** كما رآه المشرف: الروح الرياضيّة والمصافحة واحترام الحكم والنظافة، والسلوك السلبيّ، والزيّ الرياضيّ
        // (الاستمارة: «الالتزام بالزي الرياضي المحتشم والكامل» / «مخالفة الزي الرياضي المقرر»). تعزيز المعلّم اللفظيّ وحثّه على القيم
        // يُذكران ولا يقترحان البند ولا يغيّران درجته (2026-10-31) — التعزيز تغذيةٌ راجعة يشهد لها البند ١٠.
        const VP = ['praise', 'fairplay', 'respectRef', 'clean'];
        const vp = VP.reduce((a, k) => a + c(k), 0), vn = c('misbehave'), dishN = c('dish');
        if (vp || vn || dishN) {
            let s = vn >= 2 ? (vp ? 4 : 5) : vn === 1 ? (vp ? 3 : 4) : (vp >= 3 ? 1 : 2);
            const bits = [];
            if (vp) bits.push('ظهرت في الحصة مواقف: ' + list(VP.filter(k => c(k) > 0).map(k => TAG[k].label + ' ' + times(c(k)))));
            if (vn) bits.push((bits.length ? 'و' : '') + 'رُصد سلوكٌ سلبيّ لم يُعالَج ' + times(vn));
            if (dishN) {
                const share = classN ? dishN / classN : 0;
                const ds = dishN >= 5 || share >= 0.2 ? 4 : dishN >= 2 || share >= 0.08 ? 3 : 2;
                s = vp || vn ? Math.max(s, ds) : ds;
                bits.push((bits.length ? 'و' : '') + 'شارك ' + pupilsN(dishN) + (classN ? ' من ' + pupilsN(classN) : '') + (F ? ' بغير الزيّ الرياضيّ' : ' بالدشداشة بدل الزيّ الرياضيّ'));
            }
            if (SP && SP.values.n) bits.push('و{حثّ المعلم|حثّت المعلمة} على القيم والروح الرياضيّة ' + times(SP.values.n));
            if (SP && SP.health.n) bits.push('و{ربط المعلم|ربطت المعلمة} النشاط بالصحّة ' + times(SP.health.n));
            add(4, s, 'taps', bits.join('، ') + '.');
        }

        // ٢ التقدّم في الحصة والفروق الفرديّة — تقدّم «عيّنة الطلبة» بين قراءتيها، ومراعاة الفروق، والطلبة خارج النشاط
        // (عددهم من المشرف، وتقترحه الكاميرا)
        const inc = c('include') + c('levels'), outN = c('out');
        const prog = SS && SS.both >= MIN_SAMPLE ? SS : null;
        const FD = fieldOf(ctx.field, m, counts);
        if (inc || outN || prog || FD.exc) {
            let s = prog ? quantScore(prog.progress) : inc ? (inc >= 2 ? 1 : 2) : 0;
            const bits = [];
            if (prog) {
                const dir = prog.b.pct > prog.a.pct ? 'وارتفع' : prog.b.pct < prog.a.pct ? 'وانخفض' : 'وبقي';
                bits.push('تقدّم (' + prog.improved + ') من ' + pupilsN(prog.both) + ' في العيّنة بين أوّل التطبيق وآخره'
                    + (prog.kept ? '، وحافظ (' + prog.kept + ') على مستوى الإتقان' : '') + (prog.regressed ? '، وتراجع أداء (' + prog.regressed + ')' : '')
                    + '، ' + dir + ' الإتقان ' + (dir === 'وبقي' ? 'عند (' + prog.b.pct + '%)' : 'من (' + prog.a.pct + '%) إلى (' + prog.b.pct + '%)'));
            }
            if (inc) bits.push((bits.length ? 'و' : '') + '{راعى المعلم|راعت المعلمة} الفروق الفردية بين الطلبة ' + times(inc) + ' (تكليفٌ حسب المستوى أو دمجٌ لذوي الإعاقة والاحتياجات)');
            if (outN) {
                s = Math.max(s, outN >= 3 ? 4 : 3);
                bits.push((bits.length ? 'و' : '') + 'ظلّ ' + pupilsN(outN) + ' خارج النشاط');
            }
            // غير المشاركين بعذر: بأدوارٍ كلّهم يشهد للبند، وبلا دورٍ ينزل به إلى «ملائم»
            if (FD.exc) {
                const full = FD.role >= FD.exc, none = !FD.role;
                s = none ? Math.max(s, 3) : full ? (s || 2) : Math.max(s, 2);
                const rl = FD.roles.length ? ': ' + list(FD.roles.map(k => EXC_ROLES[k])) : '';
                bits.push((bits.length ? 'و' : '') + (none ? 'بقي غير المشاركين بعذر (' + FD.exc + ') بلا دورٍ في الحصة'
                    : '{أشرك المعلم|أشركت المعلمة} ' + (full ? 'غير المشاركين بعذر (' + FD.exc + ')' : '(' + FD.role + ') من غير المشاركين بعذر (' + FD.exc + ')') + ' بأدوارٍ في الحصة' + rl));
            }
            const only = !prog && !inc && !outN;
            add(2, s, prog ? (inc || outN || FD.exc ? 'both' : 'sample') : only ? 'field' : 'taps', bits.join('، ') + '.', prog ? nConf(prog.both) : only ? 'medium' : null);
        }

        // ٥ الأمن والسلامة — التهيئة الآمنة وفحص الأدوات وحقيبة الإسعافات، والمواقف الخطرة، والحرارة والماء،
        // والتزاحم أثناء الحركة (الاستمارة: «توزيع الطلبة في مسافات آمنة» / «تزاحم الطلبة في مساحات ضيقة»).
        // الزيّ الرياضيّ صار للبند ٤ (2026-10-31): هو في أدلّة القيم لا السلامة في الاستمارة.
        const crowd = ADV && people && people.crowdPct != null ? people.crowdPct : null;        // متقدّم
        const crowdText = v => (v >= CROWD_BAD ? 'وتزاحم الطلبة أثناء الحركة: (' + v + '%) منهم كان زميلٌ ملاصقاً له'
                                               : 'وتوزّع الطلبة في مسافاتٍ آمنة أثناء الحركة (التزاحم ' + v + '%)');
        // الحرارة: حصةٌ في الحرّ بلا ماءٍ «غير ملائم» (حذرٌ شديد فأعلى) أو «ملائم» (حذر)، وماءٌ أقلّ من المتوقّع «ملائم»،
        // وعلامات إجهادٍ حراريّ «غير ملائم» إلّا إن أُتيح ماءٌ أو ظلّ — والدرجة اقتراحٌ يعتمده المشرف
        const heatOn = heatOnOf(FD), hb = [];
        let hs = 0;
        if (heatOn || c('water') || c('shade') || c('heatHit')) {
            if (FD.hi != null && !FD.indoor && FD.cat) hb.push('كانت الحرارة المحسوسة (' + FD.hi + '°) — ' + FD.catLabel + (FD.place ? ' — في ' + PLACE_IN[FD.place] : ''));
            if (c('water')) hb.push('{أتاح المعلم|أتاحت المعلمة} ' + count(c('water'), 'استراحة ماءٍ واحدة', 'استراحتي ماء', 'استراحات ماء', 'استراحة ماء') + (FD.lessonMin >= 5 ? ' في ' + durG(FD.lessonMin * 60) : ''));
            else if (heatOn) hb.push('لم تُتح استراحة ماءٍ في ' + durG(FD.lessonMin * 60));
            if (c('shade')) hb.push('وُظّف الظلّ أثناء الشرح والانتظار');
            if (c('heatHit')) hb.push('ظهرت علامات إجهادٍ حراريّ على ' + (c('heatHit') === 1 ? 'طالب' : pupilsN(c('heatHit'))));
            if (heatOn && FD.cat >= 2) hs = !c('water') ? 4 : c('water') < FD.expect ? 3 : 0;
            else if (heatOn && !c('water')) hs = 3;
            if (c('heatHit')) hs = Math.max(hs, c('water') || c('shade') ? 3 : 4);
        }
        const SF = ['safe', 'checkTools', 'firstAid'], sfN = SF.reduce((a, k) => a + c(k), 0), sfKinds = SF.filter(k => c(k) > 0).length;
        if (sfN || c('hazard') || hb.length) {
            const n = c('hazard');
            // التهيئة وفحص الأدوات والإسعافات معاً بلا موقفٍ خطر ← «متميز»
            let s = n >= 2 ? (sfN ? 4 : 5) : n === 1 ? (sfN ? 3 : 4) : sfKinds >= 3 ? 1 : 2;
            const bits = [];
            if (c('safe')) bits.push('هُيّئ المكان والأدوات تهيئةً آمنة');
            if (c('checkTools')) bits.push((bits.length ? 'و' : '') + 'فُحصت الأدوات قبل استخدامها');
            if (c('firstAid')) bits.push((bits.length ? 'و' : '') + 'توفّرت حقيبة إسعافاتٍ أوّليّة جاهزة');
            if (n) bits.push((bits.length ? 'و' : '') + 'رُصد ' + count(n, 'موقفٌ خطر', 'موقفان خطران', 'مواقف خطرة', 'موقفاً خطراً'));
            if (SP && SP.safe.n) bits.push('وذكّر {المعلم|المعلمة} الطلبة بالسلامة ' + times(SP.safe.n));
            if (crowd != null) {
                if (crowd >= CROWD_BAD) s = Math.max(s, crowd >= 40 ? 4 : 3);
                bits.push(crowdText(crowd));
            }
            hb.forEach(t => bits.push((bits.length ? 'و' : '') + t));
            s = Math.max(s, hs);
            const tapped = sfN || c('hazard') || c('water') || c('shade') || c('heatHit');
            add(5, s, crowd != null ? 'both' : tapped ? 'taps' : 'field', bits.join('، ') + '.', tapped ? null : 'medium');
        } else if (crowd != null && crowd >= CROWD_BAD) {
            add(5, crowd >= 40 ? 4 : 3, 'ai', crowdText(crowd).replace(/^و/, '') + '.');
        } else if (SP && SP.safe.n >= 2) {
            add(5, 2, 'speech', '{ذكّر المعلم|ذكّرت المعلمة} الطلبة بالسلامة ' + times(SP.safe.n) + ' أثناء الحصة.');
        }

        // ٩ المصادر والموارد — وانتظار الدور الذي تراه الكاميرا
        const queue = people && people.queuePct >= 40 ? people.queuePct : 0;
        // والكرات: النموذج نفسه يرى «الكرة» — طلبةٌ لكلّ كرة (٢ فأقلّ جيد، حتّى ٤ ملائم، وأكثر غير ملائم)
        const ratio = people ? ballRatio(m) : null;
        // والأدوات البديلة والتقانة (الاستمارة: «استخدام الأدوات البديلة عند نقص الإمكانيات»، «توظيف التقانة لتوضيح المهارة» —
        // والتقنيات الرقميّة في وصف المستوى «متميز»): التقانة مع أدواتٍ كافية أو بديلة ← «متميز»
        const altN = c('altTools'), techN = c('tech');
        if (c('tools') || c('noTools') || altN || techN || queue || ratio) {
            const p = c('tools') + altN + techN, n = c('noTools');
            let s = p || n ? (n >= 2 ? 4 : n === 1 ? (p ? 3 : 4) : techN && (c('tools') || altN) ? 1 : 2) : 0;
            const bits = [];
            if (c('tools')) bits.push('وُظّفت أدواتٌ كافية ومتنوعة');
            if (altN) bits.push((bits.length ? 'و' : '') + 'استُخدمت أدواتٌ بديلة عند نقص الإمكانات');
            if (techN) bits.push((bits.length ? 'و' : '') + '{وظّف المعلم|وظّفت المعلمة} التقانة (فيديو أو صور) لتوضيح المهارة');
            if (n) bits.push((bits.length ? 'و' : '') + 'رُصد نقصٌ في الأدوات وانتظارٌ للدور ' + times(n));
            if (ratio) {
                const bs = ratio <= 2 ? 2 : ratio <= 4 ? 3 : 4;
                s = s ? Math.max(s, bs) : bs;
                bits.push((bits.length ? 'و' : '') + 'رُصدت نحو (' + people.balls + ') ' + (people.balls <= 10 ? 'كرات' : 'كرة') + ' لـ' + pupilsN(people.classSize || people.inside) + ' — كرةٌ لكلّ ' + perPupils(ratio));
            }
            if (queue) {
                s = Math.max(s, queue >= 55 ? 4 : 3);
                bits.push((bits.length ? 'و' : '') + 'وقف (' + queue + '%) من الطلبة ينتظرون دورهم أثناء التطبيق');
            }
            // المساحة والصفّارة شاهدان في البند نفسه («الاستخدام الأمثل للمساحات»، «استخدام صافرة … بفاعلية») — يُذكران ولا يغيّران الدرجة
            if (spaceOf(m) === 'narrow') bits.push('وتركّزت الحركة في جزءٍ محدود من المساحة (' + m.space.concentration + '% منها في خُمسها)');
            if (m.cued >= 2) bits.push('ونُظّم ' + count(m.cued, 'انتقالٌ واحد', 'انتقالان', 'انتقالات', 'انتقالاً') + ' بالصفّارة');
            add(9, s, p || n ? (queue || ratio ? 'both' : 'taps') : 'ai', bits.join('، ') + '.');
        }

        return out.sort((a, b) => a.id - b.id);
    }

    // ── الخطّة الفصليّة (2026-10-31) — البند ٦: «التوافق مع الخطة الفصلية وتوزيع الوحدات» ──
    // عنوان الدرس الذي كتبه المشرف مقابل موضوعات الأسبوع في الخطّة (term-plan.js). موضوع الخطّة عامٌّ كثيراً («لعبة كرة السلة») والعنوان
    // مهارةٌ منه («التمريرة الصدرية») — فلا يُحكم بعدم التوافق آليّاً: 'match' = أحدهما في الآخر أو كلماتُ الموضوع المميِّزة كلّها في العنوان
    // أو كلمتان منها؛ 'differ' = لا كلمة مشتركة؛ وغيرهما 'unclear'. وما ليس 'match' يؤكّده المشرف في النتيجة.
    const PLAN_STOP = new Set(['لعبه', 'مهاره', 'مهارات', 'كره', 'في', 'من', 'علي', 'الي', 'مع', 'عن', 'بطريقه', 'طريقه', 'درس', 'اختبار', 'عملي', 'قصير',
        'تطبيقات', 'منافسات', 'مراجعه', 'صغار', 'اناث', 'ذكور', 'جم', 'كجم', 'بين', 'ثم', 'او']);
    const planNorm = x => String(x || '').replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
        .replace(/[^ء-ي\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const planWords = x => planNorm(x).split(' ').map(w => w.replace(/^(?:و|ف)?(?:ب|ل|ك)?ال(?=..)/, '').replace(/^لل(?=..)/, '')).filter(w => w.length >= 2 && !PLAN_STOP.has(w));
    // لكلّ موضوعٍ في الخطّة حكمه، فيُذكر في الأدلّة ما وافقه العنوان وحده لا موضوعات الأسبوع كلّها
    function planVerdicts(topic, planned) {
        const T = planNorm(topic), tw = new Set(planWords(topic));
        if (!T || !Array.isArray(planned) || !planned.length) return null;
        return planned.map(p => {
            let v = 'differ';
            String(p || '').split(/\s*[\/+]\s*/).forEach(part => {
                const P = planNorm(part), pw = [...new Set(planWords(part))];
                if (!P || v === 'match') return;
                const hit = pw.filter(w => tw.has(w)).length;
                if ((pw.length && tw.size && (T.includes(P) || P.includes(T))) || (pw.length && hit === pw.length) || hit >= 2) v = 'match';
                else if (hit) v = 'unclear';
            });
            return { topic: p, v };
        });
    }
    function planMatch(topic, planned) {
        const V = planVerdicts(topic, planned);
        if (!V) return null;
        return V.some(x => x.v === 'match') ? 'match' : V.some(x => x.v === 'unclear') ? 'unclear' : 'differ';
    }

    // ما لم يُقترح وسببه — للعرض تحت الاقتراحات
    function unsupported(sugg, M) {
        const have = new Set((sugg || []).map(s => s.id));
        const out = [];
        for (let id = 1; id <= 13; id++) {
            if (have.has(id)) continue;
            let why = NOT_SEEN[id];
            if (!why && id === 7) why = 'تحتاج عشر دقائق رصدٍ بالكاميرا على الأقلّ';
            if (!why && id === 6) why = 'تحتاج عشرين دقيقة رصدٍ على الأقلّ، ولمس «عناصر الحصة» حين يبدأ كلٌّ منها';
            if (!why && id === 2) why = 'قيّم «عيّنة الطلبة» في أوّل التطبيق وآخره، أو المس «مراعاة الفروق» و«طلبة خارج النشاط»';
            if (!why && id === 3) why = 'المس مواقف الطلبة في «تعلّم الطلبة» (القيادة، التعاون، الأدوار، تقويم الزميل) — أسئلة المعلّم وحدها لا تقترحه';
            if (!why && id === 4) why = 'المس مواقف الطلبة في «القيم والسلوك» — تعزيز المعلّم اللفظيّ وحده لا يقترحه';
            if (!why) why = 'لا شاهد مسجَّل — يقدّرها المشرف';
            out.push({ id, why });
        }
        return out;
    }

    // سطرٌ واحدٌ لـ«الملاحظات العامة» (يُرفع إلى البوّابة، فيبقى قصيراً)
    function summaryText(M, ctx) {
        const P = ctx && typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        const F = !!(ctx && ctx.female);
        const SS = sampleStats(ctx && ctx.sample);
        if (!M || !(M.observed || (M.ctx && M.ctx.covered) || (SS && SS.final))) return '';
        const span = M.observed || M.seconds || (M.ctx && M.ctx.covered) || 0;
        const people = M.people && M.people.movingAll != null && M.people.detSecs >= 60 ? M.people : null;
        const bits = [];
        if (people) {
            bits.push('شارك فيها ' + pupilsN(people.classSize || people.inside));
            bits.push('وتحرّكوا (' + (people.movingPlay != null ? people.movingPlay : people.movingAll) + '%) من ' + (people.movingPlay != null ? 'زمن العناصر النشطة' : 'زمن الرصد'));
        } else if (M.observed) bits.push('بلغ زمن النشاط الحركي للطلبة (' + M.activePct + '%)');
        const det = M.ctx && M.ctx.covered >= 60 ? partsDetail(M, M.rec) : null;
        if (det) bits.push((bits.length ? 'و' : '') + 'توزّع زمنها: ' + partsText(det));
        if (ADV && M.forms && M.forms.count) bits.push('واستُعمل ' + count(M.forms.count, 'تشكيلٌ واحد', 'تشكيلان', 'تشكيلات', 'تشكيلاً'));
        const FD = fieldOf(ctx && ctx.field, M, ctx && ctx.counts);
        if (FD.cat && heatOnOf(FD)) bits.push('وكانت الحرارة المحسوسة (' + FD.hi + '°)' + (FD.water ? ' مع ' + count(FD.water, 'استراحة ماءٍ واحدة', 'استراحتي ماء', 'استراحات ماء', 'استراحة ماء') : ' بلا استراحة ماء'));
        if (FD.exc) bits.push('وكان غير المشاركين بعذر (' + FD.exc + ')' + (FD.role ? '، منهم (' + FD.role + ') بأدوارٍ في الحصة' : ' بلا دور'));
        if (M.waits) bits.push('وتخلّلتها ' + count(M.waits, 'فترة انتظار واحدة', 'فترتا انتظار', 'فترات انتظار', 'فترة انتظار') + ' أطولها ' + dur(M.longestIdle));
        if (M.explainSec >= 60 && !det) bits.push('واستغرق الشرح والتوجيه ' + dur(M.explainSec));
        if (M.admin && M.admin.sec >= ROLL_LONG) bits.push('واستغرق تسجيل الحضور والزيّ ' + durG(M.admin.sec));
        if (M.whistles) bits.push('واستُعملت الصفّارة ' + times(M.whistles));
        const R = respOf(M);
        if (R) bits.push('واستجاب الطلبة لها خلال ' + dur(R.med) + ' في المتوسّط');
        const SP = speechOf(M);
        if (SP) bits.push('وسُمع في كلام {المعلم|المعلمة}: تعزيزٌ (' + SP.praise.n + ')، وتصحيحٌ (' + SP.corr.n + ')، وأسئلةٌ (' + SP.q.n + ')');
        if (SS && SS.final) bits.push((bits.length ? 'و' : '') + 'أتقن المهارة (' + SS.final.ok + ') من ' + pupilsN(SS.final.rated) + ' في عيّنة الطلبة');
        const FL = ((ctx && ctx.follow) || []).filter(f => f && f.verdict && f.verdict !== 'na');
        if (FL.length) bits.push((bits.length ? 'و' : '') + 'تحقّق (' + FL.filter(f => f.verdict === 'met').length + ') من (' + FL.length + ') من أهداف الزيارة السابقة');
        if (!bits.length) return '';
        // أوّل الجمل بلا واو العطف (بلا كاميرا قد يكون أوّلها «واستُعملت الصفّارة» أو «واستغرق تسجيل الحضور»)
        bits[0] = bits[0].replace(/^و(?=استُعمل|تخلّل|استغرق|استجاب|سُمع|تحرّك|كان)/, '');
        return P(g('رُصدت الحصة بعين المشرف' + (span >= 60 ? ' ' + dur(span) : '') + ': ' + bits.join('، ') + '.', F));
    }

    // ما يُطرح في المداولة من أرقام الرصد: إجادةٌ تُعزَّز، وأسئلةٌ تأمّليّةٌ مبنيّةٌ على ما حدث (بصيغة المخاطَب)
    function debriefPrompts(M, counts, ctx) {
        ctx = ctx || {};
        const F = !!ctx.female, P = typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        const m = M || {}, c = k => (counts && counts[k]) || 0;
        const good = [], ask = [];
        const det = m.ctx && m.ctx.covered >= 60 ? partsDetail(m, m.rec) : null;
        if (det) {
            det.filter(r => r.verdict === 'long').forEach(r => ask.push('استغرق ' + r.label + ' ' + dur(r.sec) + '، والموصى به نحو ' + dur(r.rec * 60) + '. ما الذي أطاله، وكيف {تختصره|تختصرينه}؟'));
            det.filter(r => r.verdict === 'missing').forEach(r => ask.push('لم يظهر «' + r.label + '» في الحصة. أين موقعه في {خطّتك|خطّتكِ} للدرس؟'));
            det.filter(r => r.lowAct).forEach(r => ask.push('تحرّك الطلبة (' + (r.moving != null ? r.moving : r.activePct) + '%) من زمن ' + r.label + '. ما الذي يرفع زمن الممارسة فيه؟'));
            const best = det.filter(r => r.verdict !== 'missing' && PART[r.k].act != null && (r.moving != null ? r.moving : r.activePct) >= PART[r.k].act)
                .sort((p, q) => (q.moving != null ? q.moving : q.activePct) - (p.moving != null ? p.moving : p.activePct))[0];
            if (best) good.push('بلغت حركة الطلبة (' + (best.moving != null ? best.moving : best.activePct) + '%) في ' + best.label + '.');
            if (!det.some(r => r.verdict === 'missing') && m.parts && m.parts.orderOk !== false) good.push('اشتملت الحصة على عناصرها الخمسة بترتيبها.');
        }
        const FM = m.forms;
        const GD = ctx.guide || null;
        if (FM && FM.longLineSec >= 60 && FM.maxLine > LONG_LINE)
            ask.push('وقفت قاطرةٌ من ' + pupilsN(FM.maxLine) + ' مدّة ' + dur(FM.longLineSec) + '.'
                + (GD && GD.formsText && GD.formsText.length && !(GD.forms || []).includes('lines') ? ' وتدريبات المهارة في دليل المعلّم: ' + list(GD.formsText) + '.' : '')
                + ' كيف {تعيد|تعيدين} تنظيمها ليقلّ زمن الانتظار؟');
        if (ADV && FM && FM.count === 1 && FM.segments[0]) ask.push('استُعمل تشكيلٌ واحد («' + FORMS[FM.segments[0].type] + '») طوال الحصة. أيّ تشكيلٍ آخر يناسب المهارة؟');
        if (ADV && FM && FM.types && FM.types.length >= 3) good.push('{نوّع المعلم|نوّعت المعلمة} التشكيلات: ' + list(FM.types.map(t => FORMS[t])) + '.');
        if (c('dish')) ask.push('شارك ' + pupilsN(c('dish')) + ' بغير الزيّ الرياضيّ. ما الإجراء المتّفق عليه مع الإدارة وأولياء الأمور؟');
        if (c('out')) ask.push('ظلّ ' + pupilsN(c('out')) + ' خارج النشاط. كيف {تشركهم|تشركينهم} ولو بدورٍ مساعد؟');
        // الحرارة والماء، وغير المشاركين بعذر
        const FD = fieldOf(ctx.field, m, counts);
        if (heatOnOf(FD) && FD.cat >= 2 && !FD.water) ask.push('كانت الحرارة المحسوسة (' + FD.hi + '°) ولم تُتح استراحة ماءٍ في ' + durG(FD.lessonMin * 60) + '. ما {خطّتك|خطّتكِ} للماء والظلّ وشدّة النشاط في حصص الحرّ؟');
        else if (heatOnOf(FD) && FD.water && FD.water < FD.expect) ask.push('كانت ' + count(FD.water, 'استراحة ماءٍ واحدة', 'استراحتا ماء', 'استراحات ماء', 'استراحة ماء') + ' في ' + durG(FD.lessonMin * 60) + ' والحرارة المحسوسة (' + FD.hi + '°). كم مرّةً {تتيحها|تتيحينها} في الحرّ؟');
        else if (heatOnOf(FD) && FD.water >= FD.expect) good.push('{أتحت|أتحتِ} استراحات ماءٍ منتظمة (' + FD.water + ') والحرارة المحسوسة (' + FD.hi + '°).');
        if (FD.hit) ask.push('ظهرت علامات إجهادٍ حراريّ على ' + (FD.hit === 1 ? 'طالب' : pupilsN(FD.hit)) + '. ما الذي {تفعله|تفعلينه} فوراً، وما الذي يمنع تكراره؟');
        if (FD.exc && !FD.role) ask.push('كان غير المشاركين بعذر (' + FD.exc + ') بلا دور. أيّ دورٍ (التحكيم، أو التسجيل والتوقيت، أو تنظيم الأدوات) {تسنده|تسندينه} إليهم في الحصة القادمة؟');
        else if (FD.exc && FD.role < FD.exc) ask.push('{أشركت|أشركتِ} (' + FD.role + ') من غير المشاركين بعذر (' + FD.exc + ') بأدوار. ما دور الباقين؟');
        else if (FD.exc) good.push('{أشركت|أشركتِ} غير المشاركين بعذر (' + FD.exc + ') بأدوارٍ في الحصة' + (FD.roles.length ? ': ' + list(FD.roles.map(k => EXC_ROLES[k])) : '') + '.');
        if (m.waits && m.longestIdle >= 180) ask.push('أطول فترة انتظارٍ بين نشاطين بلغت ' + dur(m.longestIdle) + '. ما الذي كان يحدث فيها؟');
        // الحضور والزيّ: إجراءٌ لازمٌ لا يُحسب شرحاً — ويُسأل عنه حين يطول
        const AD = m.admin;
        if (AD && AD.sec >= ROLL_LONG) ask.push('استغرق تسجيل الحضور والزيّ ' + durG(AD.sec) + ' من أوّل الحصة. كيف {تختصره|تختصرينه} ليبدأ الإحماء أسرع (كشفٌ جاهز، أو التسجيل أثناء الإحماء)؟');
        else if (AD && AD.sec >= 30 && AD.sec <= 150 && (m.observed || 0) >= MIN_OBSERVE) good.push('{أنجزت|أنجزتِ} تسجيل الحضور والزيّ في ' + durG(AD.sec) + ' فبدأ النشاط سريعاً.');
        if (m.cued >= 2) good.push('نُظّمت الانتقالات بالصفّارة (' + m.cued + ' مرّات).');
        // من كلام المعلّم: أمثلةٌ بنصّه حين تُحفظ، والعبارات التي تحتاج مراجعةً **لا تدخل هنا** (للمشرف وحده)
        const SP = m.speech && m.speech.clauses >= 10 ? m.speech : null;
        if (SP) {
            const ex = arr => (arr && arr[0] ? '، مثل: «' + arr[0][1] + '»' : '');
            if (SP.praise.spec >= 2) good.push('{عزّزت|عزّزتِ} الطلبة بما أجادوه تحديداً ' + times(SP.praise.spec) + ex(SP.praise.specEx) + '.');
            if (SP.q.hi >= 2) good.push('{طرحت|طرحتِ} أسئلةً تستثير التفكير' + ex(SP.q.hiEx) + '.');
            if (SP.corr.spec >= 4) good.push('{صحّحت|صحّحتِ} الأداء بالمهارة نفسها ' + times(SP.corr.spec) + ex(SP.corr.specEx) + '.');
            if (SP.check.n >= 2) good.push('{تحقّقت|تحقّقتِ} من فهم الطلبة ' + times(SP.check.n) + '.');
            if (SP.praise.n >= 3 && SP.praise.spec / SP.praise.n < 0.3)
                ask.push('أغلب تعزيزك عامّ («أحسنت»، «ممتاز»). كيف {تجعله|تجعلينه} يذكر ما أجاده الطالب بالضبط؟');
            if (!SP.praise.n && SP.words >= 300) ask.push('لم يُسمع تعزيزٌ لفظيّ في الحصة. متى {تعزّز|تعزّزين} أداء الطلبة أثناء الممارسة؟');
            if (SP.q.n >= 3 && !SP.q.hi) ask.push('{طرحت|طرحتِ} ' + count(SP.q.n, 'سؤالاً', 'سؤالين', 'أسئلة', 'سؤالاً') + ' مغلقة. ما سؤالٌ مفتوح («لماذا؟»، «كيف؟») كان سيجعل الطلبة يفكّرون في المهارة؟');
            if (!SP.q.n && !SP.check.n && SP.words >= 300) ask.push('لم يُسمع سؤالٌ للطلبة ولا تحقّقٌ من فهمهم. كيف {تتأكّد|تتأكّدين} أنّهم فهموا قبل الانتقال إلى التطبيق؟');
            if (SP.clauses >= 20 && SP.orgShare >= 50) ask.push('كان (' + SP.orgShare + '%) من كلامك تعليماتٍ تنظيميّة. كيف {تقلّل|تقلّلين} التعليمات لتزيد زمن الممارسة؟');
            if (SP.corr.n >= 6 && SP.praise.n < SP.corr.n / 2) ask.push('غلب التصحيح (' + SP.corr.n + ') على التعزيز (' + SP.praise.n + '). ما أثر ذلك على دافعيّة الطلبة؟');
            if (SP.topic && SP.topic.terms && SP.topic.terms.length && !SP.topic.n && SP.words >= 300)
                ask.push('لم يُسمع مصطلح الدرس («' + SP.topic.terms[0] + '») في كلامك. كيف {توظّف|توظّفين} المصطلح الفنّي ليتعلّمه الطلبة؟');
        }
        // من الكاميرا: الاستجابة للصفّارة، وشدّة النشاط، والتزاحم، والكرات، وموقع المعلّم
        const R = respOf(m);
        if (R && R.med >= 8) ask.push('احتاج الطلبة ' + dur(R.med) + ' في المتوسّط للاستجابة لإشارة الصفّارة. ما الإشارة المتّفق عليها معهم، وكيف {تدرّبهم|تدرّبينهم} عليها؟');
        else if (R && R.med <= 4) good.push('استجاب الطلبة لإشارة الصفّارة سريعاً: ' + dur(R.med) + ' في المتوسّط.');
        const PP = m.people && m.people.detSecs >= MIN_OBSERVE / 2 ? m.people : null;
        if (PP) {
            const mv = movingOf(m), vg = PP.vigPlay != null ? PP.vigPlay : PP.vigAll;
            if (mv != null && mv < MVPA_GOAL && !(det && det.some(r => r.lowAct)))
                ask.push('كان الطلبة في نشاطٍ معتدلٍ فأشدّ (' + mv + '%) من الزمن، والمعيار المتداول نصفه على الأقلّ. أيّ جزءٍ من الحصة يتحوّل إلى ممارسة؟');
            if (ADV && vg != null && vg >= 25) good.push('كان (' + vg + '%) من زمن الطلبة جرياً أو نشاطاً شديداً.');
            if (ADV && PP.crowdPct != null && PP.crowdPct >= CROWD_BAD) ask.push('تزاحم الطلبة أثناء الحركة (' + PP.crowdPct + '%). كيف {توزّع|توزّعين} المساحة ليعمل كلٌّ في مسافةٍ آمنة؟');
            const ratio = ballRatio(m);
            const want = GD && GD.per ? GD.per : 0;   // الدليل يبني تدريبات المهارة على كرةٍ لكلّ (want)
            if (ratio && want && ratio > 2 * want) ask.push('تدريبات المهارة في دليل المعلّم بكرةٍ لكلّ ' + perPupils(want) + '، وكانت كرةٌ لكلّ ' + perPupils(ratio) + '. كيف {تزيد|تزيدين} الكرات أو المحطّات ليقترب منه؟');
            else if (ratio && !want && ratio > 4) ask.push('كانت كرةٌ لكلّ ' + perPupils(ratio) + '. كيف {تزيد|تزيدين} الكرات أو المحطّات ليلمس كلّ طالبٍ الكرة أكثر؟');
            else if (ratio && ratio <= Math.max(2, want)) good.push('كانت كرةٌ لكلّ ' + perPupils(ratio) + ' — فرص ممارسةٍ وافرة' + (want ? ' كما يقترح دليل المعلّم' : '') + '.');
            const TS = teacherOf(m);
            if (TS && TS.edgePct != null && TS.edgePct < 35) ask.push('{وقفت|وقفتِ} في وسط الطلبة أغلب الوقت (على أطرافهم ' + TS.edgePct + '% فقط). من كان خلفك؟ وأين {تقف|تقفين} لترى الجميع؟');
            else if (TS && TS.edgePct >= 60 && (TS.cover == null || TS.cover >= 50)) good.push('{وقفت|وقفتِ} على أطراف الطلبة و{تنقّلت|تنقّلتِ} بينهم — إشرافٌ نشط يرى الجميع.');
        }
        // عيّنة الطلبة: الإتقان والتقدّم
        const SS = sampleStats(ctx.sample);
        if (SS && SS.final) {
            const f = SS.final;
            if (f.pct < 50) ask.push('أتقن المهارة (' + f.ok + ') من ' + pupilsN(f.rated) + ' في العيّنة. ما الخطوة التعليميّة التي احتاجها الطلبة قبل التطبيق؟');
            else if (f.pct >= 75) good.push('أتقن المهارة (' + f.ok + ') من ' + pupilsN(f.rated) + ' في عيّنة الطلبة.');
        }
        if (SS && SS.both >= MIN_SAMPLE) {
            if (SS.improved >= Math.ceil(SS.both / 2)) good.push('تقدّم (' + SS.improved + ') من ' + pupilsN(SS.both) + ' في العيّنة بين أوّل التطبيق وآخره.');
            else if (!SS.improved) ask.push('لم يتقدّم أحدٌ من العيّنة بين أوّل التطبيق وآخره. ما الذي {تغيّره|تغيّرينه} في الممارسة أو التغذية الراجعة؟');
        }
        // دليل المعلّم: نقاط المهارة الفنّيّة في العيّنة وفي كلام المعلّم، وأسئلة التقويم، وتعديل قواعد المباراة لقدرات المرحلة
        if (GD) {
            const miss = GD.cover ? GD.cover.missing : [];
            if (GD.weak) ask.push('أقلّ النقاط الفنّيّة تحقّقاً في العيّنة: «' + GD.weak.short + '» (' + GD.weak.ok + ' من ' + GD.weak.rated + ')'
                + (miss.includes(GD.weak.short) ? '، ولم تُسمع في كلامك' : '') + '. أيّ تدريبٍ أو تلميحٍ يركّز عليها؟');
            if (GD.best && !(GD.weak && GD.weak.short === GD.best.short)) good.push('حقّق (' + GD.best.ok + ') من ' + pupilsN(GD.best.rated) + ' في العيّنة نقطة «' + GD.best.short + '».');
            if (GD.cover && GD.cover.total) {
                if (GD.cover.said >= GD.cover.total) good.push('{ذكرت|ذكرتِ} في شرحك وتغذيتك الراجعة النقاط الفنّيّة للمهارة كلّها (' + GD.cover.total + ').');
                else {
                    const rest = miss.filter(x => !(GD.weak && x === GD.weak.short));
                    if (rest.length) ask.push('لم ' + (rest.length === 1 ? 'تُسمع في كلامك نقطة' : 'تُسمع في كلامك نقاط') + ' «' + rest.join('»، «') + '» من دليل المعلّم. كيف {توصلها|توصلينها} للطلبة في الشرح والتغذية الراجعة؟');
                }
            }
            if (GD.assess && GD.assess.total) {
                if (GD.assess.asked) good.push('{طرحت|طرحتِ} من أسئلة التقويم في الدليل (' + GD.assess.asked + ') من (' + GD.assess.total + ').');
                else if (GD.cover) ask.push('لم يُسمع سؤالٌ من أسئلة التقويم في الدليل (' + GD.assess.missing[0] + '…). متى {تطرحها|تطرحينها} في الحصة؟');
            }
            const mvg = movingOf(m), Q = m.people && m.people.detSecs >= MIN_OBSERVE / 2 ? m.people.queuePct : null;
            if (GD.game && GD.adapt && GD.adapt.length && ((mvg != null && mvg < MVPA_GOAL) || (Q != null && Q >= 40)))
                ask.push('في المباريات يقترح دليل المعلّم تعديل القواعد لقدرات المرحلة، مثل: ' + list(GD.adapt.slice(0, 2)) + '. أيّها يرفع زمن ممارسة صفّك؟');
        }
        // أهداف الزيارة السابقة
        (ctx.follow || []).forEach(f => {
            if (!f || !f.verdict || f.verdict === 'na') return;
            const v = '(' + fmtTarget(f.unit, f.base) + ' ← ' + fmtTarget(f.unit, f.now) + ')';
            if (f.verdict === 'met') good.push('تحقّق هدف الزيارة السابقة: ' + f.label + ' ' + v + '.');
            else if (f.verdict === 'better') ask.push('تحسّن «' + f.label + '» ' + v + ' ولم يبلغ المتّفق عليه (' + fmtTarget(f.unit, f.goal) + '). ما الذي {يوصلك|يوصلكِ} إليه في الزيارة القادمة؟');
            else ask.push('هدف «' + f.label + '» من الزيارة السابقة لم يتحقّق ' + v + '، والمتّفق عليه ' + fmtTarget(f.unit, f.goal) + '. ما الذي حال دونه؟');
        });
        return { good: good.map(t => P(g(t, F))), ask: ask.map(t => P(g(t, F))) };
    }

    // خريطة المساحة رقماً (٠–٩) لكلّ خلية — تُحفظ مع التقرير بلا صورة
    function heatDigits(grid) {
        const arr = Array.from(grid || []);
        const max = arr.reduce((m, v) => Math.max(m, v), 0);
        return arr.map(v => (max ? Math.round(9 * v / max) : 0));
    }

    // ── عيّنة الطلبة (أداة المشرف للتحصيل والتقدّم) ──
    // sample = {n, a: 'رموز القراءة الأولى', b: 'رموز القراءة الأخيرة'} — لكلّ طالبٍ رمز: 0 لم يُقيَّم، 1 لم يتقن، 2 جزئيّاً، 3 أتقن.
    // الإتقان = (أتقن + نصف الجزئيّ) ÷ من قُيّموا. التقدّم = من تحسّن أو حافظ على إتقانه بين القراءتين.
    const MIN_SAMPLE = 5;
    // كمّيّات الاستمارة (جميع/معظم/أغلب/قليل/عدد نادر) بالنسبة — **أوّليّة**: لم يُعثر على تعريفها الرسميّ بالنسب
    const QUANT = [[90, 1], [75, 2], [50, 3], [25, 4]];
    const quantScore = pct => { for (const [min, s] of QUANT) if (pct >= min) return s; return 5; };
    function sampleStats(s) {
        if (!s || !(s.n > 0)) return null;
        const n = Math.min(30, Math.round(s.n));
        const rd = str => { const out = []; for (let i = 0; i < n; i++) { const v = Number(String(str || '')[i] || 0); out.push(v >= 1 && v <= 3 ? v : 0); } return out; };
        const A = rd(s.a), B = rd(s.b);
        const round = arr => {
            const rated = arr.filter(v => v > 0).length, ok = arr.filter(v => v === 3).length, part = arr.filter(v => v === 2).length, no = arr.filter(v => v === 1).length;
            return { rated, ok, part, no, pct: rated ? Math.round(100 * (ok + part / 2) / rated) : null };
        };
        const a = round(A), b = round(B);
        let both = 0, improved = 0, kept = 0, regressed = 0;
        for (let i = 0; i < n; i++) {
            if (!A[i] || !B[i]) continue;
            both++;
            if (B[i] > A[i]) improved++; else if (B[i] < A[i]) regressed++; else if (A[i] === 3) kept++;
        }
        const finalRound = b.rated >= MIN_SAMPLE ? 'b' : a.rated >= MIN_SAMPLE ? 'a' : null;
        return {
            n, a, b, both, improved, kept, regressed,
            progress: both ? Math.round(100 * (improved + kept) / both) : null,
            final: finalRound ? (finalRound === 'b' ? b : a) : null, finalRound
        };
    }

    // حركة الطلبة كما تُعرض: في العناصر النشطة إن لُمست، وإلّا من زمن الرصد — أو نشاط الصورة بلا كشف
    const movingOf = M => {
        const p = M && M.people;
        if (p && p.movingAll != null && p.detSecs >= 60) return p.movingPlay != null ? p.movingPlay : p.movingAll;
        return M && M.observed >= MIN_OBSERVE / 2 ? M.activePct : null;
    };

    // ── أهدافٌ قابلة للقياس تُتابَع في الزيارة القادمة ──
    // d = بيانات الرصد ({M, counts, sample}). كلّ مؤشّرٍ: قراءته، والحدّ الذي دونه يُقترح هدفاً، وهدفٌ متدرّجٌ من قيمته
    // (لا قفزٌ إلى المثاليّ)، وجملة توصيةٍ بالأرقام، وما يلزم لقياسه. dir: ١ = الأعلى أفضل، −١ = الأقلّ أفضل.
    const ceil5 = v => Math.ceil(v / 5) * 5;
    const spOf = d => speechOf(d && d.M);
    const METRICS = [
        { k: 'move', w: 3, item: 7, label: 'حركة الطلبة في عناصر الحصة النشطة', unit: '%', dir: 1, good: 60, needs: 'camera',
          read: d => movingOf(d.M), goal: b => Math.min(80, ceil5(b + 10)),
          text: (b, t) => 'رفع زمن حركة الطلبة في عناصر الحصة النشطة من (' + b + '%) إلى (' + t + '%) على الأقلّ' },
        { k: 'idle', w: 2, item: 7, label: 'أطول انتظارٍ بين نشاطين', unit: 'sec', dir: -1, good: 120, needs: 'camera',
          read: d => (d.M && d.M.observed >= MIN_OBSERVE ? d.M.longestIdle || 0 : null), goal: b => (b >= 360 ? 60 * Math.round(b / 120) : 120),
          text: (b, t) => 'تقليص أطول فترة انتظارٍ بين الأنشطة من ' + dur(b) + ' إلى ' + dur(t).replace('دقيقتان', 'دقيقتين').replace('ثانيتان', 'ثانيتين') + ' على الأكثر، بتجهيز الأدوات والتشكيل قبل الانتقال' },
        { k: 'line', w: 2, item: 7, label: 'أطول قاطرة', unit: 'n', dir: -1, good: LONG_LINE, needs: 'ai',
          read: d => { const f = d.M && d.M.forms; return f ? (f.longLineSec >= 60 ? f.maxLine : Math.min(f.maxLine, LONG_LINE)) : null; },
          goal: () => LONG_LINE,
          text: (b, t) => 'توزيع الطلبة في قاطراتٍ لا يزيد عدد كلٍّ منها على (' + t + ') — بلغت (' + b + ') — ليقلّ زمن انتظار الدور' },
        { k: 'queue', w: 2, item: 9, label: 'انتظار الدور أثناء النشاط', unit: '%', dir: -1, good: 25, needs: 'ai',
          read: d => { const p = d.M && d.M.people; return p && p.detSecs >= MIN_OBSERVE / 2 ? p.queuePct : null; },
          goal: b => Math.max(20, Math.min(25, b - 15)),
          text: (b, t) => 'تقليل انتظار الدور أثناء النشاط من (' + b + '%) من الطلبة إلى (' + t + '%) على الأكثر، بزيادة الأدوات أو المحطّات' },
        { k: 'parts', w: 2, item: 6, label: 'عناصر الحصة في زمنها الموصى به', unit: 'of5', dir: 1, good: 4, needs: 'parts',
          read: d => { const M = d.M; if (!M || !M.ctx || M.ctx.covered < MIN_STRUCTURE) return null; const det = partsDetail(M, M.rec); return det ? det.filter(r => r.verdict === 'ok').length : null; },
          goal: b => Math.min(5, Math.max(4, b + 1)),
          text: (b, t) => 'الالتزام بالزمن الموصى به لعناصر الحصة: (' + t + ') عناصر من خمسة على الأقلّ — كانت (' + b + ')' },
        { k: 'forms', w: 1, item: 8, label: 'التشكيلات المستعملة', unit: 'n', dir: 1, good: 2, needs: 'ai',
          // لا يُقاس من رصدٍ قصير: «كان (0)» بعد دقيقةٍ رصدٍ حكمٌ بلا شاهد (2026-10-29)
          read: d => (ADV && d.M && d.M.forms && (d.M.people && d.M.people.detSecs) >= MIN_OBSERVE / 2 ? d.M.forms.count : null), goal: b => Math.max(2, b + 1),
          text: (b, t) => 'التنويع في تشكيلات الطلبة بما يناسب المهارة: ' + count(t, 'تشكيلٌ واحد', 'تشكيلان', 'تشكيلات', 'تشكيلاً') + ' على الأقلّ في الحصة — كان (' + b + ')' },
        { k: 'dish', w: 1, item: 4, label: 'المشاركون بغير الزيّ الرياضيّ', unit: 'n', dir: -1, good: 1, needs: 'tag',
          read: d => { const c = (d.counts || {}).dish; return c != null ? c : (ADV && d.M && d.M.people ? 0 : null); }, goal: () => 0,
          text: (b) => 'متابعة التزام الطلبة بالزيّ الرياضيّ مع الإدارة وأولياء الأمور حتّى يشارك الجميع به — شارك (' + b + ') بغيره' },
        { k: 'out', w: 1.5, item: 2, label: 'الطلبة خارج النشاط', unit: 'n', dir: -1, good: 0, needs: 'tag',
          read: d => { const c = (d.counts || {}).out; return c != null ? c : (d.M && d.M.people && d.M.people.roi ? 0 : null); }, goal: () => 0,
          text: (b) => 'إشراك جميع الطلبة في النشاط ولو بأدوارٍ مساعدة — ظلّ (' + b + ') خارجه' },
        { k: 'praiseSpec', w: 2, item: 10, label: 'التعزيز المحدّد بما أجاده الطالب', unit: 'n', dir: 1, good: 4, needs: 'speech',
          read: d => { const SP = spOf(d); return SP ? SP.praise.spec : null; }, goal: b => Math.max(4, b + 3),
          text: (b, t) => 'تعزيز أداء الطلبة تعزيزاً محدّداً يذكر ما أجادوه ' + times(t) + ' على الأقلّ في الحصة — كان (' + b + ')' },
        { k: 'qHi', w: 2, item: 10, label: 'الأسئلة التي تستثير التفكير', unit: 'n', dir: 1, good: 2, needs: 'speech',
          read: d => { const SP = spOf(d); return SP ? SP.q.hi : null; }, goal: b => Math.max(2, b + 2),
          text: (b, t) => 'طرح ' + count(t, 'سؤالٍ واحد', 'سؤالين', 'أسئلة', 'سؤالاً') + ' على الأقلّ من الأسئلة التي تستثير تفكير الطلبة في المهارة («لماذا؟»، «كيف؟») — كانت (' + b + ')' },
        { k: 'check', w: 2, item: 10, label: 'التحقّق من فهم الطلبة', unit: 'n', dir: 1, good: 2, needs: 'speech',
          read: d => { const SP = spOf(d); return SP && SP.words >= 300 ? SP.check.n : null; }, goal: b => Math.max(2, b + 2),
          text: (b, t) => 'التحقّق من فهم الطلبة قبل الانتقال إلى التطبيق ' + times(t) + ' على الأقلّ في الحصة — كان (' + b + ')' },
        { k: 'org', w: 1.5, item: 7, label: 'نصيب التعليمات التنظيميّة من الكلام', unit: '%', dir: -1, good: 40, needs: 'speech',
          read: d => { const SP = spOf(d); return SP && SP.clauses >= 20 ? SP.orgShare : null; }, goal: b => Math.max(30, b - 15),
          text: (b, t) => 'تقليل نصيب التعليمات التنظيميّة من كلام {المعلم|المعلمة} من (' + b + '%) إلى (' + t + '%) على الأكثر، لزيادة زمن الممارسة' },
        { k: 'resp', w: 2, item: 7, label: 'الاستجابة لإشارة الصفّارة', unit: 'sec', dir: -1, good: 6, needs: 'camera',
          read: d => { const R = respOf(d.M); return R ? R.med : null; }, goal: b => Math.max(4, Math.round(b / 2)),
          text: (b, t) => 'تدريب الطلبة على الاستجابة لإشارة الصفّارة لتكون خلال ' + dur(t) + ' على الأكثر — كانت ' + dur(b) },
        { k: 'crowd', w: 2, item: 5, label: 'التزاحم أثناء الحركة', unit: '%', dir: -1, good: 15, needs: 'ai',
          read: d => (ADV && d.M && d.M.people && d.M.people.detSecs >= MIN_OBSERVE / 2 && d.M.people.crowdPct != null ? d.M.people.crowdPct : null), goal: b => Math.max(10, b - 15),
          text: (b, t) => 'توزيع الطلبة في مسافاتٍ آمنة أثناء الحركة ليقلّ التزاحم من (' + b + '%) إلى (' + t + '%) على الأكثر' },
        { k: 'balls', w: 1.5, item: 9, label: 'طلبةٌ لكلّ كرة', unit: 'n', dir: -1, good: 3, needs: 'ai',
          read: d => ballRatio(d.M), goal: b => Math.max(2, Math.min(3, Math.round(b * 0.6))),
          text: (b, t) => 'زيادة الكرات أو المحطّات لتكون كرةٌ لكلّ ' + perPupils(t) + ' على الأكثر — كانت لكلّ ' + perPupils(b) },
        { k: 'tEdge', w: 2, item: 7, label: 'وقوف المعلّم على أطراف الطلبة', unit: '%', dir: 1, good: 60, needs: 'teacher',
          read: d => { const T = teacherOf(d.M); return T && T.edgePct != null ? T.edgePct : null; }, goal: b => Math.min(80, ceil5(b + 20)),
          text: (b, t) => '{وقوف المعلم|وقوف المعلمة} على أطراف الطلبة حيث {يراهم|تراهم} جميعاً (' + t + '%) من الوقت على الأقلّ — كان (' + b + '%)' },
        { k: 'water', w: 2, item: 5, label: 'استراحات الماء في الحرّ (من المتوقّع)', unit: '%', dir: 1, good: 100, needs: 'field',
          read: d => { const F = fieldOf(d.field, d.M, d.counts); return F.expect ? Math.min(100, Math.round(100 * F.water / F.expect)) : null; }, goal: () => 100,
          text: b => 'إتاحة استراحة ماءٍ كلّ (' + WATER_EVERY + ') دقيقةً على الأقلّ في حصص الحرّ، والشرح والانتظار في الظلّ — كانت (' + b + '%) من المتوقّع' },
        { k: 'excRole', w: 1.5, item: 2, label: 'غير المشاركين بعذر بأدوارٍ في الحصة', unit: '%', dir: 1, good: 100, needs: 'field',
          read: d => { const F = fieldOf(d.field, d.M, d.counts); return F.exc ? Math.round(100 * F.role / F.exc) : null; }, goal: () => 100,
          text: b => 'إسناد أدوارٍ في الحصة (التحكيم، التسجيل والتوقيت، تنظيم الأدوات) إلى جميع الطلبة غير المشاركين بعذر — كانوا (' + b + '%)' },
        { k: 'mastery', w: 3, item: 1, label: 'إتقان عيّنة الطلبة للمهارة', unit: '%', dir: 1, good: 75, needs: 'sample',
          read: d => { const SS = sampleStats(d.sample); return SS && SS.final ? SS.final.pct : null; }, goal: b => Math.min(90, ceil5(b + 15)),
          text: (b, t) => 'رفع نسبة إتقان الطلبة للمهارة في آخر الحصة من (' + b + '%) إلى (' + t + '%) على الأقلّ، بالتدرّج في تعليمها وتكرار ممارستها' }
    ];
    const METRIC = {};
    METRICS.forEach(x => { METRIC[x.k] = x; });
    const NEEDS = { camera: 'الكاميرا', ai: 'الكاميرا و«كشف الطلبة»', parts: 'لمس «عناصر الحصة»', tag: 'الوسم أو كشف الطلبة', speech: '«فهم الكلام»', sample: '«عيّنة الطلبة»',
                    teacher: 'الكاميرا و«تحديد المعلّم»', field: 'بطاقة «الحرارة والمشاركة»' };

    function fmtTarget(unit, v) {
        if (v == null) return '—';
        if (unit === '%') return v + '%';
        if (unit === 'sec') return v >= 60 ? Math.round(v / 6) / 10 + ' د' : v + ' ث';
        if (unit === 'of5') return v + ' من 5';
        return String(v);
    }
    const fails = (x, b) => (x.dir > 0 ? b < x.good : b > x.good);

    // المؤشّرات التي لم تبلغ حدّها في هذه الحصة ← أهدافٌ مقترحة
    function targetCandidates(d, max) {
        const out = [];
        METRICS.forEach(x => {
            let b;
            try { b = x.read(d || {}); } catch (e) { b = null; }
            if (b == null || !isFinite(b) || !fails(x, b)) return;
            const gap = x.dir > 0 ? (x.good - b) / Math.max(1, x.good) : (b - x.good) / Math.max(1, x.good);
            out.push({ k: x.k, item: x.item, label: x.label, unit: x.unit, dir: x.dir, base: b, goal: x.goal(b), gap });
        });
        // الأولويّة للتعلّم (حركة الطلبة وإتقانهم) ثمّ التنظيم والكلام، ثمّ الزيّ — وفي الأولويّة نفسها الأبعد عن حدّه
        return out.sort((p, q) => METRIC[q.k].w - METRIC[p.k].w || q.gap - p.gap).slice(0, max || 5).map(t => { delete t.gap; return t; });
    }
    // جملة التوصية بالأرقام (بلا نقطة) — ctx {female, pupil}
    function targetText(t, ctx) {
        const x = METRIC[t && t.k];
        if (!x) return '';
        const P = ctx && typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        return P(g(x.text(t.base, t.goal), !!(ctx && ctx.female)));
    }
    // «حركة الطلبة … ≥ 60%» — للمؤشّر في اتّفاق المداولة
    function targetGoalText(t) {
        const x = METRIC[t && t.k];
        if (!x) return '';
        return x.label + ' ' + fmtTarget(x.unit, t.goal) + (t.goal === 0 ? '' : x.dir > 0 ? ' على الأقلّ' : ' على الأكثر');
    }
    // قياس هدفٍ سابقٍ على رصد اليوم: met (بلغه) / better / same / worse / na (لم يُقس)
    function targetCheck(t, d) {
        const x = METRIC[t && t.k];
        if (!x) return null;
        let now;
        try { now = x.read(d || {}); } catch (e) { now = null; }
        const r = { k: x.k, item: x.item, label: x.label, unit: x.unit, dir: x.dir, base: t.base, goal: t.goal, now: now == null || !isFinite(now) ? null : now, needs: x.needs };
        if (r.now == null) { r.verdict = 'na'; return r; }
        if (x.dir > 0 ? r.now >= t.goal : r.now <= t.goal) { r.verdict = 'met'; return r; }
        const eps = x.unit === '%' ? 3 : x.unit === 'sec' ? 30 : 1;
        const delta = (r.now - t.base) * x.dir;
        r.verdict = delta >= eps ? 'better' : delta <= -eps ? 'worse' : 'same';
        return r;
    }

    // ── لحظات الحصة: ما تكشفه أرقام الرصد بوقته — يُطرح في المداولة «في الدقيقة …» ──
    function autoMoments(M, ctx) {
        const P = ctx && typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        const m = M || {}, out = [];
        const partAt = t => { const r = (m.mins || [])[Math.floor(t / 60)]; return r && r[2] ? r[2] : null; };
        if (m.longestIdle >= 60 && m.longestIdleAt != null)
            out.push({ t: m.longestIdleAt, k: 'idle', text: 'بدأ أطول انتظارٍ بين نشاطين، واستمرّ ' + dur(m.longestIdle) });
        const RL = (m.resp && m.resp.list) || [];
        const slow = RL.filter(r => r[2] === -1 || r[2] >= 10).sort((a, b) => (b[2] === -1 ? 99 : b[2]) - (a[2] === -1 ? 99 : a[2]))[0];
        if (slow) out.push({ t: slow[0], k: 'resp', text: slow[2] === -1 ? 'لم يستجب الطلبة لإشارة الصفّارة خلال عشرين ثانية' : 'تأخّرت الاستجابة لإشارة الصفّارة: ' + dur(slow[2]) });
        const LR = m.forms && m.forms.longRun;
        if (LR && LR.sec >= 30) out.push({ t: LR.at, k: 'line', text: 'وقفت قاطرةٌ من ' + pupilsN(LR.size) + ' مدّة ' + dur(LR.sec) });
        // أعلى حركةٍ وأدناها في دقيقة — داخل العناصر النشطة إن لُمست، وإلّا بلا أوّل دقيقةٍ وآخرها
        const mins = (m.mins || []).map((r, i) => ({ i, v: r[0] != null ? r[0] : r[1], c: r[2], who: r[0] != null }));
        const touched = mins.some(r => r.c);
        const pool = mins.filter((r, i) => r.v != null && (touched ? ACTIVE_PARTS.includes(r.c) : i > 0 && i < mins.length - 1));
        if (pool.length >= 4) {
            const hi = pool.reduce((b, r) => (r.v > b.v ? r : b)), lo = pool.reduce((b, r) => (r.v < b.v ? r : b));
            const what = r => (r.who ? 'حركةٍ للطلبة' : 'نشاطٍ حركيّ');
            if (hi.v >= 50) out.push({ t: hi.i * 60, k: 'peak', text: 'أعلى ' + what(hi) + ' في دقيقة (' + hi.v + '%)' });
            // الدقيقة الأدنى التي يبدأ فيها أطول انتظارٍ لحظةٌ واحدة — تُذكر مرّة
            const nearIdle = m.longestIdle >= 60 && m.longestIdleAt != null && Math.abs(lo.i * 60 - m.longestIdleAt) <= 90;
            if (lo !== hi && !nearIdle && lo.v <= 30 && hi.v - lo.v >= 25) out.push({ t: lo.i * 60, k: 'low', text: 'أدنى ' + what(lo) + ' أثناء الأنشطة (' + lo.v + '%)' });
        }
        return out.sort((a, b) => a.t - b.t).map(x => Object.assign(x, { text: P(x.text), part: partAt(x.t) }));
    }

    // ── سجلّ الأدلّة (2026-10-28) — «مساعد الأدلّة» ──
    // طلب المشرف: «العين مساعدٌ شخصيّ يضع الأدلّة من واقع الحصة … كأنّ معه مشرفاً محترفاً يتابع كلّ لحظة». كلّ ما رُصد يصير دليلاً
    // **بوقته تحت بنده** (text: ما حدث، للمشرف)، ومعه **عبارة دليلٍ رسميّة الصياغة** للتقرير (pos للمستويات ١–٣، neg لـ٤–٥) تحلّ محلّ
    // العبارة العشوائيّة في «ويتضح ذلك من خلال …» (svfEyeOfficial في eye.js ← generateDescriptionText في supervisory.js).
    // قائمة الاستمارة عيّنةٌ لا حصر (توجيه المشرف 2026-10-28): العبارات هنا مكتوبةٌ لحصة الرياضة المدرسيّة على معايير البنود، **بلا تشكيلٍ
    // وبلا ذكرٍ للمعلّم/المعلّمة** (تمرّ بتصريف الجنس والتلاميذ في الاستمارة)، والأرقام بين قوسين. الدليل ما حدث، والحكم للمشرف.
    const EV_TAG = {
        demo:     { pos: 'تقديم نموذج عملي للمهارة قبل الممارسة' },
        groups:   { pos: 'تنظيم الطلبة في مجموعات تعاونية لممارسة المهارة' },
        games:    { pos: 'توظيف الألعاب الصغيرة والمنافسات لخدمة الهدف المهاري' },
        stations: { pos: 'تنفيذ التعلم بالمحطات بما يتيح ممارسة متزامنة لجميع الطلبة' },
        levels:   { pos: 'تكليف الطلبة بمهام متدرجة وفق مستوياتهم' },
        discover: { pos: 'إتاحة مهام مفتوحة يكتشف فيها الطلبة حلولا حركية' },
        elim:     { neg: 'توظيف ألعاب إقصاء تخرج الطلبة من الممارسة' },
        include:  { pos: 'إشراك الطلبة ذوي المستويات المختلفة بمهام تناسب قدراتهم' },
        out:      { neg: 'بقاء عدد من الطلبة خارج النشاط دون إشراك' },
        fbInd:    { pos: 'تقديم تغذية راجعة فردية فورية لتصحيح الأداء' },
        fbGrp:    { pos: 'تقديم تغذية راجعة جماعية عن الأخطاء الشائعة في المهارة', on: { 2: { pos: 'تصحيح الأخطاء الشائعة أثناء الممارسة' } } },
        ask:      { pos: 'طرح أسئلة شفهية للتحقق من فهم الطلبة للمهارة' },
        peer:     { pos: 'إشراك الطلبة في تقويم أدائهم وأداء زملائهم', on: { 3: { pos: 'تقييم الطلبة أداءهم وأداء زملائهم' } } },
        obsCard:  { pos: 'استخدام بطاقات الملاحظة لتقييم أداء المهارة' },
        record:   { pos: 'رصد مستوى الأداء المهاري في سجل المتابعة' },
        fbMiss:   { neg: 'تكرار أخطاء في الأداء دون تصحيح', on: { 2: { neg: 'تكرار الأخطاء الفنية دون تصحيح' } } },
        rules:    { pos: 'تطبيق الطلبة القانون المرتبط بالمهارة أثناء اللعب' },
        answers:  { pos: 'إجابة الطلبة عن الأسئلة المعرفية المرتبطة بالدرس' },
        lead:     { pos: 'قيادة الطلبة لزملائهم أثناء الإحماء أو التطبيق' },
        team:     { pos: 'تعاون الطلبة لإنجاز المهام الحركية داخل الفريق' },
        tactic:   { pos: 'اقتراح الطلبة حلولا خططية أثناء اللعب' },
        roles:    { pos: 'التزام الطلبة بالأدوار الموكلة إليهم داخل الفريق' },
        praise:   { pos: 'التعامل بروح رياضية واحترام بين الطلبة' },
        fairplay: { pos: 'مصافحة الطلبة زملاءهم وتقبلهم الفوز والخسارة' },
        respectRef: { pos: 'احترام الطلبة قرارات الحكم أثناء المنافسة' },
        clean:    { pos: 'محافظة الطلبة على نظافة المكان بعد انتهاء الدرس' },
        misbehave:{ neg: 'ظهور سلوك غير رياضي دون معالجة', on: { 7: { neg: 'عدم انضباط سلوك بعض الطلبة دون معالجة' } } },
        safe:     { pos: 'تهيئة الملعب والأدوات بصورة آمنة قبل الممارسة' },
        checkTools: { pos: 'فحص الأدوات الرياضية قبل استخدامها' },
        firstAid: { pos: 'وجود حقيبة إسعافات أولية جاهزة للاستخدام' },
        hazard:   { neg: 'حدوث موقف يهدد سلامة الطلبة أثناء الممارسة' },
        tools:    { pos: 'توفير أدوات كافية ومتنوعة تزيد فرص الممارسة' },
        altTools: { pos: 'استخدام الأدوات البديلة عند نقص الإمكانات' },
        tech:     { pos: 'توظيف التقانة (فيديو أو صور) لتوضيح المهارة' },
        noTools:  { neg: 'نقص الأدوات بما يطيل انتظار الطلبة لأدوارهم' },
        equip:    { neg: 'هدر وقت الحصة في توزيع الأدوات وجمعها' },
        water:    { pos: 'إتاحة استراحات لشرب الماء أثناء الممارسة' },
        shade:    { pos: 'توظيف الظل أثناء الشرح والانتظار تجنبا لأشعة الشمس المباشرة' },
        heatHit:  { neg: 'ظهور علامات إجهاد حراري على بعض الطلبة أثناء الممارسة' },
        tOnTime:  { pos: 'الالتزام بموعد بدء الحصة' },
        tLate:    { neg: 'التأخر عن موعد بدء الحصة' },
        tKit:     { pos: 'ارتداء الزي الرياضي المناسب واللائق' }
    };
    const n_ = x => '(' + x + ')';
    // in: {ev: [{t, k}] اللمسات, counts, M: الملخّص, sample, follow: [{verdict}], marks: [{t, note, item}], ctx: {pupil}}
    // ← {بند: [{t|null, src, text, pos?, neg?}]} مرتّبةً بالوقت (وما لا وقت له آخراً)
    function evidenceLog(input) {
        const I = input || {}, M = I.M || {}, P = I.ctx && typeof I.ctx.pupil === 'function' ? I.ctx.pupil : (x => x);
        const log = {};
        const add = (item, e) => { if (!item) return; (log[item] = log[item] || []).push(Object.assign({ t: null }, e, { text: P(e.text) })); };
        const ev = I.ev || [], c = I.counts || {};
        // ١) لمسات المشرف بأوقاتها — كلّ لمسةٍ دليل
        ev.forEach(e => {
            const T = TAG[e.k];
            if (!T || e.k === 'dish') return;              // الزيّ أدناه بعدده
            const r = EV_TAG[e.k] || {}, text = T.label.replace(/ \(عددهم\)$/, '');
            add(T.item, { t: e.t, src: 'tap', text, pos: r.pos, neg: r.neg });
            // وفي البنود الأخرى التي يشهد لها الوسم في الاستمارة — بعبارتها هناك (تقويم الزميل للبند ٣، والأخطاء الشائعة للبند ٢، والسلوك للبند ٧)
            (T.also || []).forEach(id => { const o = (r.on && r.on[id]) || {}; add(id, { t: e.t, src: 'tap', text, pos: o.pos, neg: o.neg }); });
        });
        if (c.dish > 0) {                            // الزيّ: دليل البند ٤ (القيم) بعددهم، وذكرٌ بلا عبارة تقريرٍ تحت البند ٥ (الممارسة بغير الزيّ)
            const t0 = (ev.find(e => e.k === 'dish') || {}).t, src = ev.some(e => e.k === 'dish') ? 'tap' : 'ai';
            add(4, { t: t0, src, text: pupilsN(c.dish) + ' بغير الزيّ الرياضيّ', neg: 'مشاركة ' + n_(c.dish) + ' من الطلبة بغير الزي الرياضي' });
            add(5, { t: t0, src, text: pupilsN(c.dish) + ' بغير الزيّ الرياضيّ أثناء الممارسة' });
        }
        if (c.out > 0 && !ev.some(e => e.k === 'out')) add(2, { src: 'ai', text: pupilsN(c.out) + ' خارج منطقة النشاط (تقديرٌ من الكاميرا)', neg: 'بقاء ' + n_(c.out) + ' من الطلبة خارج النشاط دون إشراك' });
        // ٢) الكاميرا: الزمن والانتظار والصفّارة وموقع المعلّم والتزاحم والأدوات
        if (M.observed >= MIN_OBSERVE / 2) {
            const who = M.people && M.people.detSecs >= 60;
            if (M.longestIdle >= 60 && M.longestIdleAt != null)
                add(7, { t: M.longestIdleAt, src: 'cam', text: 'أطول انتظارٍ بين نشاطين: ' + dur(M.longestIdle) + (M.waits > 1 ? ' (من ' + M.waits + ' انتظارات)' : ''),
                         neg: 'انتظار الطلبة بين نشاطين دون ممارسة مدة بلغت ' + durG(M.longestIdle) });
            else if (M.observed >= MIN_OBSERVE && !M.waits) add(7, { src: 'cam', text: 'لا انتظار بين الأنشطة دقيقةً فأكثر طوال ' + dur(M.observed) + ' من الرصد', pos: 'الانتقال السلس بين أجزاء الدرس دون هدر للوقت' });
            const mv = movingOf(M);
            if (mv != null && mv >= 55) add(7, { src: who ? 'ai' : 'cam', text: (who ? 'حركة الطلبة ' : 'النشاط الحركيّ ') + mv + '% من زمن الأنشطة', pos: 'استثمار ' + n_(mv + '%') + ' من زمن الأنشطة في الممارسة الحركية الفعلية' });
            if (mv != null && mv < 35) add(8, { src: who ? 'ai' : 'cam', text: (who ? 'حركة الطلبة ' : 'النشاط الحركيّ ') + mv + '% فقط من زمن الأنشطة', neg: 'قلة زمن الممارسة الفعلية إذ لم تتجاوز ' + n_(mv + '%') + ' من زمن الأنشطة' });
            if (M.explainPct >= 40) add(8, { src: 'cam', text: 'كلامٌ والطلبة متوقّفون ' + M.explainPct + '% من زمن الرصد', neg: 'طول زمن الشرح اللفظي والطلبة متوقفون ' + n_(M.explainPct + '%') + ' من زمن الحصة' });
            const R = M.resp, RL = (R && R.list) || [];
            if (R && R.n >= 3 && R.med != null && R.med <= 5) add(7, { t: RL[0] && RL[0][0], src: 'cam', text: 'الاستجابة لإشارة الصفّارة في ' + dur(R.med) + ' (الوسيط من ' + R.n + ' إشارات)', pos: 'استجابة الطلبة السريعة لإشارات البدء والتوقف' });
            const slow = RL.filter(r => r[2] === -1 || r[2] >= 12);
            slow.slice(0, 2).forEach((r, i) => add(7, { t: r[0], src: 'cam', text: r[2] === -1 ? 'لم يستجب الطلبة لإشارة الصفّارة خلال عشرين ثانية' : 'تأخّرت الاستجابة لإشارة الصفّارة ' + dur(r[2]),
                neg: i === 0 ? 'بطء استجابة الطلبة لإشارات البدء والتوقف' : undefined }));
            const LR = M.forms && M.forms.longRun;
            if (LR && LR.sec >= 30) add(7, { t: LR.at, src: 'ai', text: 'قاطرةٌ من ' + pupilsN(LR.size) + ' مدّة ' + dur(LR.sec), neg: 'وقوف الطلبة في قاطرات طويلة ' + n_(LR.size + ' طلبة') + ' تطيل انتظار الدور' });
            const pp = M.people || {}, T = ADV ? pp.teacher : null;          // موقع المعلّم والتزاحم متقدّمان
            if (T && T.edgePct != null) {
                if (T.edgePct >= 60) add(7, { src: 'ai', text: 'على أطراف الطلبة ' + T.edgePct + '% من الوقت', pos: 'اختيار موقع يكشف جميع الطلبة أثناء النشاط' });
                else if (T.edgePct < 35) add(7, { src: 'ai', text: 'وسط الطلبة ' + (100 - T.edgePct) + '% من الوقت', neg: 'الوقوف وسط الطلبة في موقع لا يكشفهم جميعا' });
            }
            if (ADV && pp.crowdPct != null) {
                if (pp.crowdPct >= 25) add(5, { src: 'ai', text: 'متحرّكون متلاصقون ' + pp.crowdPct + '% أثناء النشاط', neg: 'تزاحم الطلبة في مساحات ضيقة أثناء التطبيق' });
                else if (pp.crowdPct <= 10) add(5, { src: 'ai', text: 'التلاصق أثناء الحركة ' + pp.crowdPct + '% فقط', pos: 'توزيع الطلبة في مسافات آمنة أثناء التطبيق' });
            }
            const br = ballRatio(M);
            if (br) add(9, { src: 'ai', text: 'كرةٌ لكلّ ' + perPupils(br) + ' (' + pp.balls + ' كرات)',
                pos: br <= 2 ? 'توفير كرة لكل ' + perPupils(br) + ' بما يزيد عدد التكرارات' : undefined,
                neg: br > 4 ? 'عدم كفاية الكرات لعدد الطلبة إذ بلغت كرة لكل ' + perPupils(br) : undefined });
            // المساحة والصفّارة — البند ٩ (المصادر): «الاستخدام الأمثل للمساحات المتاحة»، «استخدام صافرة وأدوات توضيحية بفاعلية»
            const spc = spaceOf(M);
            if (spc === 'narrow') add(9, { src: 'cam', text: 'تركّزت الحركة في جزءٍ محدود: ' + M.space.concentration + '% منها في خُمس المساحة', neg: 'عدم استثمار المساحة المتاحة إذ تركزت الممارسة في جزء محدود منها' });
            else if (spc === 'wide') add(9, { src: 'cam', text: 'امتدّت الحركة على ' + M.space.coverage + '% من المساحة', pos: 'الاستخدام الأمثل للمساحة المتاحة للنشاط' });
            if (M.cued >= 2) add(9, { src: 'cam', text: 'نُظّم ' + M.cued + ' من الانتقالات بالصفّارة', pos: 'استخدام الصافرة بفاعلية في تنظيم بدء الأنشطة وإيقافها' });
        }
        // ٣) عناصر الحصة
        if (M.ctx && M.ctx.covered >= MIN_STRUCTURE && M.parts) {
            if (M.parts.orderOk === false) add(6, { src: 'ctx', text: 'ترتيب العناصر: ' + M.parts.order.map(k => (PART[k] ? PART[k].short : k)).join(' ← '), neg: 'عدم الالتزام بتسلسل عناصر الدرس' });
            const det = partsDetail(M, M.rec);
            if (det && M.parts.orderOk !== false && det.every(r => r.verdict === 'ok')) add(6, { src: 'ctx', text: 'العناصر الخمسة بترتيبها وفي زمنها الموصى به', pos: 'تنفيذ عناصر الدرس الخمسة بتسلسلها وتوزيع مناسب لزمنها' });
            else if (det) det.filter(r => r.verdict === 'missing').slice(0, 1).forEach(r => add(6, { src: 'ctx', text: '«' + r.label + '» لم يُنفَّذ', neg: 'غياب ' + r.label + ' من عناصر الدرس' }));
        }
        // والخطّة الفصليّة: عنوان الدرس مقابل موضوع الأسبوع (مطابقةٌ واضحة، أو ما أكّده المشرف) — البند ٦
        const PL = I.ctx && I.ctx.plan;
        if (PL && PL.match != null && Array.isArray(PL.planned) && PL.planned.length) {
            const pt = '«' + PL.planned.join('» أو «') + '»';
            add(6, PL.match ? { src: 'plan', text: 'عنوان الدرس «' + PL.topic + '» يوافق موضوع الأسبوع في الخطة الفصليّة: ' + pt, pos: 'التوافق مع الخطة الفصلية وتوزيع الوحدات' }
                            : { src: 'plan', text: 'عنوان الدرس «' + PL.topic + '» لا يوافق موضوع الأسبوع في الخطة الفصليّة: ' + pt, neg: 'عدم توافق الدرس مع الخطة الفصلية' });
        }
        // ٤) كلام المعلّم — العبارة نفسها بوقتها
        const SP = M.speech;
        if (SP && SP.clauses) {
            (SP.corr.specEx || []).slice(0, 3).forEach(([t, x]) => add(10, { t, src: 'speech', text: 'صحّح: «' + x + '»', pos: 'تصحيح أخطاء الأداء فورا بالإشارة إلى أجزاء المهارة' }));
            (SP.check.ex || []).slice(0, 2).forEach(([t, x]) => add(10, { t, src: 'speech', text: 'تحقّق من الفهم: «' + x + '»', pos: 'التحقق من فهم الطلبة بأسئلة شفهية أثناء الممارسة' }));
            // أسئلة المعلّم وتعزيزه فعلُه هو: شاهدهما في البند ١٠ (التقويم ومساندة التقدّم) لا في مهارات الطلبة (٣) ولا قيمهم (٤) — 2026-10-31
            (SP.q.hiEx || []).slice(0, 2).forEach(([t, x]) => add(10, { t, src: 'speech', text: 'سؤالٌ يستثير التفكير: «' + x + '»', pos: 'طرح أسئلة شفهية تستثير تفكير الطلبة في أداء المهارة' }));
            if (SP.q.n >= 3 && !SP.q.hi) add(10, { src: 'speech', text: 'أسئلةٌ مغلقةٌ كلّها (' + SP.q.n + ')', neg: 'اقتصار الأسئلة الشفهية على أسئلة مغلقة لا تستثير التفكير' });
            (SP.praise.specEx || []).slice(0, 2).forEach(([t, x]) => add(10, { t, src: 'speech', text: 'تعزيزٌ محدّد: «' + x + '»', pos: 'تعزيز الطلبة بعبارات محددة تبين ما أجادوه' }));
            (SP.safe.ex || []).slice(0, 2).forEach(([t, x]) => add(5, { t, src: 'speech', text: 'تذكيرٌ بالسلامة: «' + x + '»', pos: 'تذكير الطلبة بقواعد السلامة أثناء الممارسة' }));
            if (SP.words >= 300 && !SP.corr.n) add(10, { src: 'speech', text: 'لم يُسمع تصحيحٌ للأداء في (' + SP.words + ') كلمة', neg: 'قلة التغذية الراجعة المصححة للأداء' });
        }
        // ٥) عيّنة الطلبة — البندان ١ و٢
        const S = sampleStats(I.sample);
        if (S && S.final) {
            const f = S.final, nn = pupilsN(f.rated);
            add(1, { src: 'sample', text: 'أتقن المهارة ' + f.pct + '% من عيّنةٍ من ' + nn,
                pos: f.pct >= 50 ? 'إتقان ' + n_(f.pct + '%') + ' من عينة الطلبة للمهارة وفق خطواتها الفنية' : undefined,
                neg: f.pct < 50 ? 'ضعف إتقان المهارة إذ لم يتقنها إلا ' + n_(f.pct + '%') + ' من عينة الطلبة' : undefined });
        }
        if (S && S.both >= MIN_SAMPLE) {
            if (S.improved >= Math.ceil(S.both / 2)) add(2, { src: 'sample', text: 'تحسّن ' + S.improved + ' من ' + S.both + ' في العيّنة بين أوّل التطبيق وآخر الحصة',
                pos: 'تحسن أداء ' + n_(S.improved) + ' من ' + n_(S.both) + ' طلبة في العينة بين بداية التطبيق ونهاية الحصة' });
            else if (!S.improved) add(2, { src: 'sample', text: 'لم يتحسّن أحدٌ من العيّنة (' + S.both + ') بين القراءتين', neg: 'ثبات مستوى أداء الطلبة دون تحسن ملحوظ خلال الحصة' });
        }
        // ٦) أهداف الزيارة السابقة — البند ١١
        const F = (I.follow || []).filter(f => f && f.verdict && f.verdict !== 'na');
        const met = F.filter(f => f.verdict === 'met').length;
        if (F.length && met) add(11, { src: 'follow', text: 'تحقّق ' + met + ' من ' + F.length + ' من أهداف الزيارة السابقة', pos: 'العمل بتوجيهات الزيارة السابقة وتحقق ' + n_(met) + ' من أهدافها' });
        else if (F.length) add(11, { src: 'follow', text: 'لم يتحقّق هدفٌ من أهداف الزيارة السابقة (' + F.length + ')', neg: 'عدم تحقق أهداف الزيارة السابقة' });
        // ٧) بطاقة «الحرارة والمشاركة»: الحرارة المحسوسة والماء (البند ٥)، وغير المشاركين بعذر (البند ٢)
        const FD = fieldOf(I.field, M, c);
        if (FD.hi != null && FD.cat && !FD.indoor) {
            add(5, { src: 'field', text: 'الحرارة ' + FD.temp + '°' + (FD.rh != null ? ' والرطوبة ' + FD.rh + '%' : '') + ' — المحسوسة ' + FD.hi + '° (' + FD.catLabel + ')' + (FD.place ? '، ' + PLACES[FD.place] : '') });
            if (heatOnOf(FD) && FD.water >= FD.expect) add(5, { src: 'field', text: 'استراحات ماء (' + FD.water + ') في ' + dur(FD.lessonMin * 60), pos: 'تنظيم استراحات منتظمة لشرب الماء تناسب حرارة الجو' });
            else if (heatOnOf(FD) && FD.cat >= 2 && !FD.water) add(5, { src: 'field', text: 'لا استراحة ماء في ' + dur(FD.lessonMin * 60), neg: 'عدم إتاحة استراحة لشرب الماء في حرارة محسوسة بلغت ' + n_(FD.hi + '°') });
            if (FD.cat >= 3 && FD.place === 'open' && !FD.shade) add(5, { src: 'field', text: 'ملعبٌ مكشوف بلا ظلٍّ للشرح والانتظار', neg: 'ممارسة النشاط تحت أشعة الشمس المباشرة دون توظيف الظل في حرارة مرتفعة' });
        }
        if (FD.exc) add(2, { src: 'field', text: 'غير مشاركين بعذر (' + FD.exc + ')، منهم بأدوار (' + FD.role + ')' + (FD.roles.length ? ': ' + FD.roles.map(k => EXC_ROLES[k]).join('، ') : ''),
            pos: FD.role >= FD.exc ? 'إشراك الطلبة غير المشاركين في الممارسة بأدوار مساندة كالتحكيم والتسجيل' : undefined,
            neg: !FD.role ? 'ترك الطلبة غير المشاركين في الممارسة دون دور في الحصة' : undefined });
        // ٨) علامات المشرف التي نسبها إلى بند — ملاحظته نصّاً، بلا عبارة تقرير
        (I.marks || []).forEach(m => { if (m && m.item >= 1 && m.item <= 13) add(m.item, { t: m.t, src: 'mark', text: m.note ? String(m.note).slice(0, 160) : 'علامةٌ للمداولة' }); });
        Object.keys(log).forEach(k => log[k].sort((a, b) => (a.t == null ? 1e9 : a.t) - (b.t == null ? 1e9 : b.t)));
        return log;
    }
    // عبارات الدليل التي يشهد لها السجلّ لمستوى البند: «متميز/جيد/ملائم» ← الموجبة، و«غير ملائم/تدخل سريع» ← السالبة؛ الأكثر شواهد أوّلاً،
    // واثنتان على الأكثر (all: كلّها — للوحة «تعديل الأدلة»)
    function officialFor(log, id, score, all) {
        const key = Number(score) >= 4 ? 'neg' : 'pos', n = {};
        ((log && log[id]) || []).forEach(e => { if (e[key]) n[e[key]] = (n[e[key]] || 0) + 1; });
        const out = Object.keys(n).sort((a, b) => n[b] - n[a]);
        return all ? out : out.slice(0, 2);
    }

    // ── أنماط الرصد عبر الحصص: ما يتكرّر عند معلّمي المشرف، وما يصلح موضوعاً لبرنامجه التدريبيّ ──
    const ISSUES = [
        { k: 'lowMove', label: 'حركة الطلبة أقلّ من (50%)', topic: 'رفع زمن الممارسة الفعليّة للطلبة', test: d => { const v = movingOf(d.M); return v != null && v < 50; } },
        { k: 'longIdle', label: 'انتظارٌ بين نشاطين (3) دقائق فأكثر', topic: 'إدارة الانتقالات وتجهيز الأدوات', test: d => d.M && d.M.observed >= MIN_OBSERVE && d.M.longestIdle >= 180 },
        { k: 'longLine', label: 'قاطراتٌ طويلة (أكثر من ستّة طلبة)', topic: 'تشكيلاتٌ تقلّل انتظار الدور', test: d => { const f = d.M && d.M.forms; return !!f && f.longLineSec >= 60 && f.maxLine > LONG_LINE; } },
        { k: 'queue', label: 'انتظار الدور (40%) فأكثر من الطلبة', topic: 'تشكيلاتٌ تقلّل انتظار الدور', test: d => { const p = d.M && d.M.people; return !!p && p.detSecs >= MIN_OBSERVE / 2 && p.queuePct >= 40; } },
        { k: 'oneForm', label: 'تشكيلٌ واحد طوال الحصة', topic: 'تنويع التشكيلات بما يناسب المهارة', test: d => ADV && !!(d.M && d.M.forms) && d.M.forms.count === 1 },
        { k: 'partMissing', label: 'عنصرٌ من عناصر الحصة غائب', topic: 'بناء الدرس بعناصره الخمسة وتوزيع زمنه', test: d => { const M = d.M; if (!M || !M.ctx || M.ctx.covered < MIN_STRUCTURE) return false; const det = partsDetail(M, M.rec); return !!det && det.some(r => r.verdict === 'missing'); } },
        { k: 'partTime', label: 'عنصران فأكثر خارج زمنهما الموصى به', topic: 'بناء الدرس بعناصره الخمسة وتوزيع زمنه', test: d => { const M = d.M; if (!M || !M.ctx || M.ctx.covered < MIN_STRUCTURE) return false; const det = partsDetail(M, M.rec); return !!det && det.filter(r => r.verdict === 'long' || r.verdict === 'short').length >= 2; } },
        { k: 'dish', label: 'مشاركةٌ بغير الزيّ الرياضيّ', topic: 'متابعة الزيّ الرياضيّ مع الإدارة وأولياء الأمور', test: d => ((d.counts || {}).dish || 0) >= 2 },
        { k: 'out', label: 'طلبةٌ خارج النشاط', topic: 'إشراك جميع الطلبة ومراعاة الفروق', test: d => ((d.counts || {}).out || 0) >= 1 },
        { k: 'fbMiss', label: 'أخطاءٌ في الأداء لم تُصحَّح', topic: 'التغذية الراجعة المصحِّحة أثناء الممارسة', test: d => ((d.counts || {}).fbMiss || 0) >= 1 },
        { k: 'genericPraise', label: 'تعزيزٌ عامّ لا يذكر ما أجاده الطالب', topic: 'التعزيز المحدّد', test: d => { const SP = spOf(d); return !!SP && SP.praise.n >= 3 && SP.praise.spec / SP.praise.n < 0.3; } },
        { k: 'noPraise', label: 'لا تعزيز لفظيّ مسموع', topic: 'التعزيز المحدّد', test: d => { const SP = spOf(d); return !!SP && SP.words >= 300 && !SP.praise.n; } },
        { k: 'closedQ', label: 'أسئلةٌ مغلقةٌ كلّها', topic: 'الأسئلة التي تستثير التفكير', test: d => { const SP = spOf(d); return !!SP && SP.q.n >= 3 && !SP.q.hi; } },
        { k: 'noCheck', label: 'لا تحقّق من فهم الطلبة', topic: 'التحقّق من الفهم قبل التطبيق', test: d => { const SP = spOf(d); return !!SP && SP.words >= 300 && !SP.check.n && !SP.q.n; } },
        { k: 'orgHeavy', label: 'غلبة التعليمات التنظيميّة على الكلام', topic: 'تقليل التعليمات وزيادة زمن الممارسة', test: d => { const SP = spOf(d); return !!SP && SP.clauses >= 20 && SP.orgShare >= 50; } },
        { k: 'slowResp', label: 'استجابةٌ بطيئة لإشارة الصفّارة (10 ثوانٍ فأكثر)', topic: 'إشارات البدء والتوقّف وروتين الانتقال', test: d => { const R = respOf(d.M); return !!R && R.med >= 10; } },
        { k: 'crowd', label: 'تزاحمٌ أثناء الحركة', topic: 'تنظيم المساحة والسلامة أثناء الممارسة', test: d => { const P = d.M && d.M.people; return ADV && !!P && P.detSecs >= MIN_OBSERVE / 2 && P.crowdPct != null && P.crowdPct >= CROWD_BAD; } },
        { k: 'fewBalls', label: 'كرةٌ لكلّ أكثر من أربعة طلبة', topic: 'توفير الأدوات وتعدّد المحطّات', test: d => { const r = ballRatio(d.M); return !!r && r > 4; } },
        { k: 'teacherCenter', label: 'المعلّم في وسط الطلبة أغلب الوقت', topic: 'الإشراف النشط وموقع المعلّم', test: d => { const T = teacherOf(d.M); return !!T && T.edgePct != null && T.edgePct < 35; } },
        { k: 'noWater', label: 'حصةٌ في الحرّ بلا استراحة ماء', topic: 'السلامة في الحرّ: الماء والظلّ وتخفيف الشدّة', test: d => { const F = fieldOf(d.field, d.M, d.counts); return heatOnOf(F) && F.cat >= 2 && !F.water; } },
        { k: 'heatHit', label: 'علامات إجهادٍ حراريّ على طلبة', topic: 'السلامة في الحرّ: الماء والظلّ وتخفيف الشدّة', test: d => ((d.counts || {}).heatHit || 0) >= 1 },
        { k: 'excIdle', label: 'غير مشاركين بعذر بلا دور', topic: 'إشراك جميع الطلبة ومراعاة الفروق', test: d => { const F = fieldOf(d.field, d.M, d.counts); return F.exc > 0 && !F.role; } },
        { k: 'longRoll', label: 'تسجيل الحضور والزيّ (5) دقائق فأكثر', topic: 'بداية الحصة: تسجيل الحضور والزيّ دون هدر زمن التعلّم', test: d => !!(d.M && d.M.admin && d.M.admin.sec >= ROLL_LONG) },
        { k: 'lowMastery', label: 'إتقان العيّنة أقلّ من (50%)', topic: 'التدرّج في تعليم المهارة', test: d => { const SS = sampleStats(d.sample); return !!(SS && SS.final) && SS.final.pct < 50; } },
        { k: 'noProgress', label: 'تقدّمٌ محدود في عيّنة الطلبة', topic: 'التدرّج في تعليم المهارة', test: d => { const SS = sampleStats(d.sample); return !!SS && SS.both >= MIN_SAMPLE && SS.progress < 50; } }
    ];
    function issuesOf(d) {
        return ISSUES.filter(x => { try { return !!x.test(d || {}); } catch (e) { return false; } }).map(x => x.k);
    }
    // rows: [{teacher, date, d}] — d بيانات الرصد المحفوظة مع كلّ تقرير
    function patterns(rows) {
        const R = (rows || []).filter(r => r && r.d && r.d.M);
        const names = new Map();
        const key = n => String(n || '').replace(/\s+/g, ' ').trim();
        R.forEach(r => { const k = key(r.teacher); if (k && !names.has(k)) names.set(k, r.teacher); });
        const mv = R.map(r => movingOf(r.d.M)).filter(v => v != null);
        const by = {};
        R.forEach(r => issuesOf(r.d).forEach(k => {
            const b = by[k] || (by[k] = { n: 0, t: new Set() });
            b.n++; if (key(r.teacher)) b.t.add(key(r.teacher));
        }));
        const issues = ISSUES.filter(x => by[x.k]).map(x => ({ k: x.k, label: x.label, topic: x.topic, n: by[x.k].n, pct: Math.round(100 * by[x.k].n / R.length), teachers: Array.from(by[x.k].t).map(k => names.get(k)) }))
            .sort((a, b) => b.n - a.n || b.teachers.length - a.teachers.length);
        const topics = {};
        issues.forEach(x => {
            const tp = topics[x.topic] || (topics[x.topic] = { topic: x.topic, n: 0, t: new Set() });
            tp.n += x.n; x.teachers.forEach(n => tp.t.add(key(n)));
        });
        let measured = 0, met = 0;
        R.forEach(r => ((r.d.follow && r.d.follow.list) || []).forEach(f => { if (f && f.verdict && f.verdict !== 'na') { measured++; if (f.verdict === 'met') met++; } }));
        return {
            lessons: R.length, teachers: names.size,
            avgMove: mv.length ? Math.round(mv.reduce((s, v) => s + v, 0) / mv.length) : null, moveN: mv.length,
            issues,
            topics: Object.values(topics).map(tp => ({ topic: tp.topic, n: tp.n, teachers: Array.from(tp.t).map(k => names.get(k)) }))
                .sort((a, b) => b.teachers.length - a.teachers.length || b.n - a.n),
            follow: { measured, met }
        };
    }

    // اتّفاق العين مع المشرف — rows: [{sugg: [{id, score}], final: {id: score}}] من التقارير المحفوظة.
    // bias موجبٌ = المشرف اعتمد درجةً أضعف ممّا اقترحت العين (العين أكرم)، وسالبٌ = العين أشدّ.
    function agreement(rows) {
        const items = {};
        let n = 0, ex = 0, nr = 0, lessons = 0;
        (rows || []).forEach(r => {
            if (!r || !r.final || !Array.isArray(r.sugg)) return;
            let used = false;
            r.sugg.forEach(s => {
                const f = Number(r.final[s.id]);
                if (!(f >= 1 && f <= 5) || !(s.score >= 1 && s.score <= 5)) return;
                used = true;
                const it = items[s.id] || (items[s.id] = { id: s.id, n: 0, exact: 0, near: 0, diff: 0 });
                const d = f - s.score;
                it.n++; n++; it.diff += d;
                if (d === 0) { it.exact++; ex++; }
                if (Math.abs(d) <= 1) { it.near++; nr++; }
            });
            if (used) lessons++;
        });
        const pc = (a, b) => (b ? Math.round(100 * a / b) : 0);
        return {
            lessons, n, exact: pc(ex, n), near: pc(nr, n),
            items: Object.keys(items).map(Number).sort((a, b) => a - b).map(id => {
                const it = items[id];
                return { id, n: it.n, exact: pc(it.exact, it.n), near: pc(it.near, it.n), bias: it.n ? Math.round(10 * it.diff / it.n) / 10 : 0 };
            })
        };
    }

    // ── شاشة المتابعة الحيّة (2026-10-26) ──
    // طلب المشرف: «التحليل في الوقت الفعليّ برسومٍ دقيقةٍ تُقرأ بسهولة». من سجلّ الثواني والحالات (summarize) يُبنى:
    //   • سلسلةٌ لكلّ عشر ثوانٍ: الحالة الغالبة، وحركة الطلبة٪ (من الكشف) أو مستوى حركة الصورة، وكلام المعلّم، والصفّارة، والعنصر
    //   • «الآن»: الحالة ومدّتها، وحركة الطلبة في آخر ١٥ ث وفي آخر دقيقتين، والعنصر الجاري وزمنه مقابل الموصى به (بدقائق حصّة ٤٠)
    //   • تنبيهاتٌ قليلةٌ مرتّبة بالأهمّيّة — ما يحتاج تدخّلاً الآن، لا كلّ رقم
    const LIVE_STEP = 10;
    const ALERT_IDLE = 60, ALERT_IDLE_BAD = 120;  // انتظارٌ جارٍ: تنبيهٌ بعد دقيقة، وأحمر بعد دقيقتين
    const ALERT_MOVE = 40;                        // حركة الطلبة في عنصرٍ نشطٍ دون ٤٠٪ آخر دقيقتين
    const ALERT_LINE = 30;                        // قاطرةٌ طويلةٌ مستمرّةٌ ٣٠ ث
    function live(rec, M, opts) {
        const o = opts || {};
        const secs = (rec && rec.secs) || [], st = (M && M.states) || [], n = st.length;
        const sens = SENS[rec && rec.sens] || SENS.medium;
        const ctx = ctxSeries(rec && rec.ctx, n);
        const recMin = k => (o.rec && o.rec[k] > 0 ? Number(o.rec[k]) : PART[k].min);
        const mode = arr => { const c = {}; arr.forEach(x => { if (x) c[x] = (c[x] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null; };
        const series = [];
        for (let t = 0; t < n; t += LIVE_STEP) {
            let mvN = 0, mvD = 0, tY = 0, tN = 0, w = 0, a = 0, i = 0, x = 0, r = 0;
            const act = [];
            for (let j = t; j < Math.min(n, t + LIVE_STEP); j++) {
                const s = secs[j], k = st[j];
                if (k === 'a') a++; else if (k === 'i') i++; else if (k === 'r') r++; else x++;
                if (!s) continue;
                if (s.v != null) { tN++; if (s.v) tY++; }
                if (s.w) w++;
                if (k === 'r') continue;                  // الحضور والزيّ: لا حركة طلبةٍ ولا نشاط
                if (s.p && s.p.n) { mvN += s.p.mv; mvD += s.p.n; }
                if (s.m != null) act.push(s.m);
            }
            const kk = 2 * r >= a + i + x + r ? 'r' : x > a + i ? 'x' : a >= i ? 'a' : 'i';
            series.push({
                t, k: kk,
                mv: mvD ? Math.round(100 * mvN / mvD) : null,
                act: act.length ? Math.min(1, act.reduce((s, v) => s + v, 0) / act.length / (sens.active * 3)) : null,
                talk: tN ? Math.round(100 * tY / tN) / 100 : null, w, c: kk === 'r' ? 'roll' : mode(ctx.slice(t, t + LIVE_STEP))
            });
        }
        // الحالة الآن ومدّتها
        const state = n ? st[n - 1] : null;
        let run = 0;
        for (let j = n - 1; j >= 0 && st[j] === state; j--) run++;
        // حركة الطلبة في نافذةٍ أخيرة (من لقطات الكشف)
        const mvIn = (from, keep) => {
            let a = 0, b = 0;
            for (let j = Math.max(0, from); j < n; j++) { const s = secs[j]; if (s && s.p && s.p.n && st[j] !== 'r' && (!keep || keep(j))) { a += s.p.mv; b += s.p.n; } }
            return b ? { pct: Math.round(100 * a / b), n: b } : null;
        };
        const now15 = mvIn(n - 15), all = mvIn(0);
        // العنصر الجاري وزمنه، وزمن كلّ عنصرٍ مقابل الموصى به
        const part = n && ctx[n - 1] ? ctx[n - 1] : null;
        let since = n;
        if (part) { since = n - 1; while (since > 0 && ctx[since - 1] === part) since--; }
        const parts = PARTS.map(x => ({ k: x.k, label: x.label, short: x.short, sec: ctx.filter(c => c === x.k).length, rec: recMin(x.k) * 60, cur: x.k === part }));
        const recent = part && ACTIVE_PARTS.includes(part) ? mvIn(n - 120, j => ctx[j] === part) : null;
        // قاطرةٌ طويلةٌ مستمرّة: من آخر اللقطات رجوعاً، والفجوة بين لقطتين حتّى ٨ ث لا تقطعها
        let lineFrom = null, lineLen = 0, last = n;
        for (let j = n - 1; j >= 0 && last - j <= 8; j--) {
            const p = secs[j] && secs[j].p;
            if (!p) continue;
            if (p.ln > LONG_LINE) { lineFrom = j; lineLen = Math.max(lineLen, p.ln); last = j; } else break;
        }
        const lineSec = lineFrom == null ? 0 : n - lineFrom;
        let lastP = null;
        for (let j = n - 1; j >= Math.max(0, n - 6); j--) if (secs[j] && secs[j].p) { lastP = secs[j].p; break; }

        // الحضور والزيّ: الجاري الآن، ومجموعه، وهل حُدّد تلقائيّاً (لم تُلمس «حضور وزيّ»)
        const rollNow = state === 'r';
        const rollAuto = !((rec && rec.ctx) || []).some(e => e && e.k === 'roll');
        const alerts = [];
        const add = (k, level, text) => alerts.push({ k, level, text });
        if (state === 'i' && run >= ALERT_IDLE) add('idle', run >= ALERT_IDLE_BAD ? 'bad' : 'warn', 'انتظارٌ منذ ' + dur(run) + ' — الطلبة بلا نشاط');
        // بلا كاميرا كلّ الثواني «غير محسوبة» — ليس اهتزازاً
        if (state === 'x' && run >= 10 && !o.phone && !o.frozen && o.camera !== false) add('shake', 'warn', 'الكاميرا تتحرّك — ثبّتها على الحامل؛ هذه الثواني لا تُحسب');
        if (rollNow && run >= ROLL_LONG) add('roll', 'info', 'تسجيل الحضور والزيّ منذ ' + dur(run));
        if (recent && recent.n >= 30 && recent.pct < ALERT_MOVE && n - since >= 60 && !(state === 'i' && run >= ALERT_IDLE)) add('move', 'warn', 'حركة الطلبة ' + recent.pct + '% في «' + PART[part].label + '» (آخر دقيقتين)');
        if (lineSec >= ALERT_LINE && !rollNow) add('line', 'warn', 'قاطرةٌ من ' + pupilsN(lineLen) + ' منذ ' + dur(lineSec) + ' — قسّمها');
        if (lastP && lastP.r && lastP.o >= 3 && !rollNow) add('out', 'warn', pupilsN(lastP.o) + ' خارج منطقة النشاط');
        // حافّة الصورة: في أغلب لقطات آخر ٣٠ ثانية (ستٌّ فأكثر) طالبان فأكثر عند الحافّة
        let eN = 0, eY = 0;
        for (let j = Math.max(0, n - 30); j < n; j++) { const p = secs[j] && secs[j].p; if (p && p.e != null) { eN++; if (p.e >= ALERT_EDGE) eY++; } }
        const edge = eN >= 6 && 2 * eY > eN;
        if (edge && !rollNow) add('edge', 'warn', 'طلبةٌ على حافّة الصورة — قد يخرج بعضهم منها؛ وسّع زاوية الكاميرا' + (o.phone ? ' («أوسع زاوية» تحت الصورة)' : ' أو أبعدها'));
        if (part && PART[part].min && n - since > recMin(part) * 60 + 120) add('over', 'info', '«' + PART[part].label + '» ' + dur(n - since) + ' — الموصى به ' + recMin(part) + ' د');
        if (rollNow && rollAuto) add('rollAuto', 'hint', 'بداية الحصة تُعدّ «حضوراً وزيّاً» حتّى يبدأ النشاط أو تلمس «الإحماء» — لا تُحسب شرحاً ولا انتظاراً');
        else if (o.camera === false && !((rec && rec.ctx) || []).length && n < ROLL_LONG) add('rollTouch', 'hint', 'يسجّل المعلّم الحضور والزيّ؟ المس «حضور وزيّ» — وإلّا عُدّ ما قبل لمسة «الإحماء» كذلك');
        else if (!part && n >= 120 && !rollNow) add('parts', 'hint', 'المس عنصر الحصة الجاري ليُقاس زمنه وحركة الطلبة فيه');
        if (o.camera && o.ai && !o.roi && n >= 60) add('roi', 'hint', 'حدّد منطقة الصف ليُعدّ من هم خارجها وتدقّ الأرقام');
        // الحرّ (o.wx: {cat, hi, last} من بطاقة «الحرارة والمشاركة»): عشرون دقيقةً بلا استراحة ماء
        if (o.wx && o.wx.cat >= 1) {
            const since = n - Math.max(0, o.wx.last != null ? o.wx.last : 0);
            if (since >= WATER_EVERY * 60) add('water', o.wx.cat >= 3 ? 'bad' : 'warn', 'مضت ' + dur(since) + ' بلا استراحة ماء — الحرارة المحسوسة (' + o.wx.hi + '°)');
        }
        const rank = { bad: 0, warn: 1, info: 2, hint: 3 };
        alerts.sort((a, b) => rank[a.level] - rank[b.level]);
        return {
            series, seconds: n, state, run, part, partSec: part ? n - since : 0, parts,
            roll: { now: rollNow, sec: st.filter(k => k === 'r').length, auto: rollAuto },
            now: now15 ? now15.pct : null, avg: all ? all.pct : null, recent: recent ? recent.pct : null,
            line: lineSec ? { n: lineLen, sec: lineSec } : null, outside: lastP && lastP.r ? lastP.o : null,
            pupilsNow: lastP ? lastP.n + (lastP.o || 0) : null, edge, alerts: alerts.slice(0, 3)
        };
    }
    // سلسلةٌ محفوظةٌ مع النتيجة: رقمٌ لكلّ عشر ثوانٍ (٠–٩ = عُشر النسبة، و«-» بلا قياس) — لمجرى الحصة بعد الرصد
    const pack = (series, key, scale) => series.map(b => (b[key] == null ? '-' : String(Math.min(9, Math.round(b[key] * scale))))).join('');


    // ── منهجية SOFIT (McKenzie وآخرون) — تكييفٌ آليٌّ من أرقام الرصد المحفوظة (2026-10-29) ──
    // SOFIT ترصد كلّ عشرين ثانية: سياق الحصة، ونشاط الطلبة، وسلوك المعلّم. هنا: عيّنةٌ من كلّ مقطعين من مقاطع العشر ثوانٍ المحفوظة
    // (tl الحالة، tc العنصر، tm حركة الطلبة، tt كلام المعلّم) — تُقرأ من التقارير المحفوظة قبلها أيضاً. **ليست ملاحظةً مدرَّبة**:
    // نشاط الطلبة من الكشف لا يفرّق الجالس من الواقف (فهما «ساكن» معاً)، وسلوك المعلّم من وجود كلامه لا من مضمونه.
    const SOFIT_STEP = 20;
    const SOFIT_CTX = { M: 'إدارة وتنظيم', K: 'شرح ومعرفة', F: 'لياقة بدنية', S: 'تدريب مهاري', G: 'لعب وتطبيق' };
    const SOFIT_TCH = { teach: 'يعلّم ويوجّه', manage: 'ينظّم', observe: 'يراقب' };
    function sofit(d) {
        const D = d || {}, tl = String(D.tl || ''), tc = String(D.tc || ''), tm = String(D.tm || ''), tt = String(D.tt || '');
        if (!tl.length) return null;
        const dig = (str, i) => { const ch = str[i]; return ch && /[0-9]/.test(ch) ? Number(ch) : null; };
        const camera = D.src !== 'none' && D.src !== 'taps' && /[ai]/.test(tl);
        const ctxN = { M: 0, K: 0, F: 0, S: 0, G: 0 }, tch = { teach: 0, manage: 0, observe: 0 };
        let n = 0, nCtx = 0, mvSum = 0, mvN = 0, tN = 0;
        for (let i = 0; i < tl.length; i += SOFIT_STEP / 10) {
            const k = tl[i], c = tc[i] || '-', talk = dig(tt, i), mv = dig(tm, i);
            if (camera && k === 'x') continue;                    // الكاميرا تتحرّك أو متوقّفة: لا عيّنة
            n++;
            let cx = null;
            if (k === 'r' || c === 'r') cx = 'M';                 // الحضور والزيّ: إدارة
            else if (camera && k === 'i') cx = talk != null && talk >= 3 ? 'K' : 'M';   // توقّفٌ بكلامٍ شرح، وبلا كلامٍ انتقالٌ وانتظار
            else if (c === 'w' || c === 'f') cx = 'F';
            else if (c === 't') cx = 'S';
            else if (c === 'a') cx = 'G';
            else if (c === 'c') cx = 'K';
            if (cx) { ctxN[cx]++; nCtx++; }
            if (camera && mv != null && k !== 'r') { mvSum += mv * 10; mvN++; }
            if (talk != null) {
                tN++;
                if (talk < 3) tch.observe++;
                else if (cx === 'M') tch.manage++;
                else tch.teach++;
            }
        }
        if (!n) return null;
        const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
        const ctx = nCtx >= 3 ? Object.keys(ctxN).map(x => ({ k: x, label: SOFIT_CTX[x], pct: pct(ctxN[x], nCtx) })) : null;
        let act = null;
        if (mvN >= 6) {
            const P = (D.M && D.M.people) || {}, mvpa = Math.min(100, Math.round(mvSum / mvN));
            const vg = P.vigPlay != null ? P.vigPlay : P.vigAll;
            const vig = vg != null ? Math.min(mvpa, Math.round(vg)) : null;
            act = { mvpa, vig, walk: vig != null ? mvpa - vig : null, still: 100 - mvpa, goal: MVPA_GOAL, ok: mvpa >= MVPA_GOAL };
        }
        const teacher = tN >= 6 ? Object.keys(tch).map(x => ({ k: x, label: SOFIT_TCH[x], pct: pct(tch[x], tN) })) : null;
        if (!ctx && !act && !teacher) return null;
        return { step: SOFIT_STEP, n, min: Math.round(n * SOFIT_STEP / 60), ctx, act, teacher };
    }

    // ── SOFIT+ (Weaver وFairclough وآخرون 2016–2018؛ التحقّق Crotti 2021) — تكييفٌ آليٌّ من أرقام الرصد المحفوظة (2026-10-29) ──
    // يرصد ممارسات المعلّم التي ترفع نشاط الطلبة أو تحدّ منه، كلّ عشرين ثانية، بأبعادٍ أربعة: سياق الحصة، وسياق النشاط، وسلوك المعلّم،
    // وإدارة النشاط — ومعها قائمة نهاية الحصة. ومن الأبعاد «مؤشّر الممارسات المجتمعة» (٠–٤) لكلّ عيّنة: سياقٌ نشط، وتشكيلٌ يُشرك الجميع
    // (مجموعات أو انتشار — لا طابور)، ومعلّمٌ يشجّع أو يعلّم أثناء النشاط، ولا ممارسة تحدّ منه — والبحث وجد أنّ اجتماعها يرفع النشاط.
    // المصادر: tl/tc/tm/tt، وM.forms.windows/queue (التشكيل والانتظار لكلّ عشر ثوانٍ)، وM.speech.tb/to (نوع كلام المعلّم ومخاطَبه)،
    // ولمسات ev (الإقصاء والأدوات والاكتشاف) وcx (العناصر). ما لم يُحفظ في تقريرٍ قديمٍ يُترك بُعده ناقصاً لا يُخمَّن.
    const SOFITP_LESSON = { M: 'إدارة وتنظيم', K: 'شرح ومعرفة', F: 'لياقة بدنية', S: 'تدريب مهاري', G: 'لعب وتطبيق', D: 'تعلّم بالاكتشاف' };
    const SOFITP_ACT = { whole: 'الصف كلّه (دائرة)', groups: 'مجموعات', free: 'انتشارٌ حرّ / فرديّ', line: 'طوابير وقاطرات' };
    const SOFITP_TCH = { promote: 'يشجّع ويحفّز', one: 'يعلّم طالباً', group: 'يعلّم مجموعة', class: 'يعلّم الصف', manage: 'ينظّم', observe: 'يراقب' };
    const SOFITP_LIM = { queue: 'انتظار الدور في طابور', elim: 'لعبة إقصاء', equip: 'توقّفٌ لتوزيع الأدوات', wait: 'انتظارٌ بلا نشاط ولا شرح' };
    const SOFITP_GAP = 15;       // أدنى فرقٍ في حركة الطلبة (نقاطاً) بين لحظتي المداولة
    const SOFITP_SPAN = 180;      // اللعبة أو المهمّة المفتوحة تمتدّ من لمستها حتّى تغيّر العنصر أو ثلاث دقائق
    function sofitPlus(d) {
        const D = d || {}, M = D.M || {}, tl = String(D.tl || '');
        if (!tl.length) return null;
        const tc = String(D.tc || ''), tm = String(D.tm || ''), tt = String(D.tt || '');
        const F = M.forms || {}, fw = String(F.windows || ''), qw = String(F.queue || '');
        const SP = M.speech || {}, tb = String(SP.tb || ''), to = String(SP.to || '');
        const dig = (str, i) => { const ch = str[i]; return ch && /[0-9]/.test(ch) ? Number(ch) : null; };
        const camera = D.src !== 'none' && D.src !== 'taps' && /[ai]/.test(tl);
        const ev = (D.ev || []).map(e => ({ t: Number(e[0]), k: e[1] })), cx = (D.cx || []).map(e => Number(e[0])).sort((a, b) => a - b);
        const spanOf = k => ev.filter(e => e.k === k).map(e => { const nx = cx.find(c => c > e.t); return [e.t, Math.min(e.t + SOFITP_SPAN, nx == null ? Infinity : nx)]; });
        const elimS = spanOf('elim'), discS = spanOf('discover'), equipT = ev.filter(e => e.k === 'equip').map(e => e.t);
        const inS = (S, a, b) => S.some(x => x[0] < b && x[1] > a);
        const rows = [];
        const cnt = { lesson: {}, act: {}, tch: {}, lim: {} };
        let nL = 0, nA = 0, nT = 0, nS = 0;
        const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
        for (let i = 0; i < tl.length; i += 2) {
            const k = tl[i], c = tc[i] || '-', a = i * 10, b = a + 20;
            if (camera && k === 'x') continue;
            nS++;
            // أوّل نصف دقيقةٍ من الرصد: كلّ طالبٍ متتبَّعٌ جديدٌ بلا سرعةٍ بعد فيُعدّ ساكناً — لا تُقارَن حركته ولا تكون منه «لحظة»
            const talk = dig(tt, i), mv = camera && a >= 30 ? dig(tm, i) : null, roll = k === 'r' || c === 'r';
            const active = camera ? k === 'a' : 'wfta'.includes(c);
            // سياق الحصة
            let L = null;
            if (roll) L = 'M';
            else if (inS(discS, a, b) && active && (c === 't' || c === 'a')) L = 'D';
            else if (camera && k === 'i') L = talk != null && talk >= 3 ? 'K' : 'M';
            else if (c === 'w' || c === 'f') L = 'F';
            else if (c === 't') L = 'S';
            else if (c === 'a') L = 'G';
            else if (c === 'c') L = 'K';
            if (L) { inc(cnt.lesson, L); nL++; }
            // سياق النشاط (التشكيل الغالب من الكاميرا)
            const f = fw[i] && fw[i] !== '-' ? fw[i] : fw[i + 1] && fw[i + 1] !== '-' ? fw[i + 1] : null;
            const A = !roll && f ? ({ C: 'whole', G: 'groups', S: 'free', L: 'line' })[f] : null;
            if (A) { inc(cnt.act, A); nA++; }
            // سلوك المعلّم: نوع كلامه إن فُهم، وإلّا وجود كلامه
            const kind = tb[i] && tb[i] !== '-' ? tb[i] : tb[i + 1] && tb[i + 1] !== '-' ? tb[i + 1] : null;
            const who = to[i] && to[i] !== '-' ? to[i] : to[i + 1] && to[i + 1] !== '-' ? to[i + 1] : null;
            let T = null;
            if (kind === 'p') T = 'promote';
            else if (kind === 'i') T = who === 's' ? 'one' : who === 'g' ? 'group' : 'class';
            else if (kind === 'o' || (roll && talk != null && talk >= 3)) T = 'manage';
            else if (talk != null) T = talk >= 3 ? (L === 'M' ? 'manage' : 'class') : 'observe';
            if (T) { inc(cnt.tch, T); nT++; }
            // ما يحدّ من النشاط
            const lim = [];
            const q = dig(qw, i);
            if (!roll && ((q != null && q >= 4) || (f === 'L' && k === 'i'))) lim.push('queue');
            if (inS(elimS, a, b)) lim.push('elim');
            if (equipT.some(t => t >= a - 10 && t < b + 10)) lim.push('equip');
            if (camera && !roll && k === 'i' && !(talk != null && talk >= 3)) lim.push('wait');
            lim.forEach(x => inc(cnt.lim, x));
            // مؤشّر الممارسات المجتمعة
            if (roll) continue;
            const pr = [];
            if (active && L !== 'M' && L !== 'K') pr.push('ctx');
            if (A === 'groups' || A === 'free') pr.push('form');
            if (active && (T === 'promote' || T === 'one' || T === 'group' || T === 'class')) pr.push('teach');
            if (!lim.length) pr.push('free');
            rows.push({ t: a, mv: mv != null ? mv * 10 : null, idx: pr.length, pr, lim, L, A, T });
        }
        if (!rows.length && !nL) return null;
        const pct = (o, n) => Object.keys(o).map(k => ({ k, pct: n ? Math.round(100 * o[k] / n) : 0 })).sort((x, y) => y.pct - x.pct);
        const withLbl = (arr, L) => arr.map(r => Object.assign(r, { label: L[r.k] }));
        const total = rows.length || 1;
        // نشاط الطلبة بالمؤشّر: متوسّط حركتهم حين اجتمعت ثلاث ممارساتٍ فأكثر، وحين قلّت عن اثنتين
        const mvRows = rows.filter(r => r.mv != null), avg = a => (a.length ? Math.round(a.reduce((s, r) => s + r.mv, 0) / a.length) : null);
        const hi = mvRows.filter(r => r.idx >= 3), lo = mvRows.filter(r => r.idx <= 1);
        const rel = hi.length >= 3 && lo.length >= 3 ? { hi: { n: hi.length, mv: avg(hi) }, lo: { n: lo.length, mv: avg(lo) } } : null;
        // لحظتان للمداولة: أعلى المؤشّر بأعلى حركة، وأدناه بأدنى حركة
        const best = mvRows.slice().sort((x, y) => y.idx - x.idx || y.mv - x.mv)[0] || null;
        const worst = mvRows.slice().sort((x, y) => x.idx - y.idx || x.mv - y.mv)[0] || null;
        const pairOk = !!(best && worst && best !== worst && best.idx > worst.idx && best.mv - worst.mv >= SOFITP_GAP);
        const meanIdx = rows.length ? Math.round(10 * rows.reduce((s, r) => s + r.idx, 0) / rows.length) / 10 : null;
        return {
            step: 20, n: nS, camera,
            lesson: nL >= 3 ? withLbl(pct(cnt.lesson, nL), SOFITP_LESSON) : null,
            act: nA >= 6 ? withLbl(pct(cnt.act, nA), SOFITP_ACT) : null,
            teacher: nT >= 6 ? withLbl(pct(cnt.tch, nT), SOFITP_TCH) : null,
            teacherBy: tb.length ? 'speech' : 'talk',
            limits: withLbl(Object.keys(cnt.lim).map(k => ({ k, n: cnt.lim[k], sec: cnt.lim[k] * 20, pct: Math.round(100 * cnt.lim[k] / total) })).sort((x, y) => y.n - x.n), SOFITP_LIM),
            index: meanIdx, rel,
            // اللحظتان حين يكون بينهما فرقٌ حقيقيّ في حركة الطلبة (١٥ نقطةً فأكثر) — وإلّا فسؤال «ما الذي كان يمكن تغييره» بلا معنى
            best: pairOk ? best : null,
            worst: pairOk ? worst : null,
            mvpa: mvRows.length >= 6 ? avg(mvRows) : null,
            exit: D.exit || null,
            rows
        };
    }
    // ما في اللحظة من الممارسات وما يحدّ منها — بكلماتٍ للمداولة
    const SOFITP_PR = { ctx: 'نشاطٌ حركيّ', form: 'مجموعاتٌ أو انتشارٌ يُشرك الجميع', teach: 'تعليمٌ أو تشجيعٌ أثناء النشاط', free: 'لا ما يحدّ من النشاط' };
    function sofitPlusWhy(r) {
        if (!r) return '';
        const yes = r.pr.filter(x => x !== 'free').map(x => SOFITP_PR[x]);
        const no = r.lim.map(x => SOFITP_LIM[x]);
        return [yes.length ? yes.join('، ') : '', no.length ? no.join('، ') : ''].filter(Boolean).join(' — ');
    }

    // ── التجربة الميدانيّة (2026-10-31) — المرحلة الأولى من خارطة Eye v2 ──
    // قبل أيّ ميزةٍ جديدة: هل تقيس العين ما تقول إنّها تقيسه، في ملعبٍ حقيقيٍّ وعلى جهاز المشرف؟ لكلّ حصةٍ في وضع التجربة يُحفظ
    // (data.trial): زمن الكشف على الجهاز، وعدد الطلبة الذي رصدته العين مقابل العدد الفعليّ الذي يكتبه المشرف، والصفّارات التي التقطتها
    // مقابل ما لمسه المشرف حين سمعها؛ و(data.blind): ما قيّمه المشرف **قبل** أن يرى اقتراح العين. ومن الحصص المحفوظة تُحسب «البوابة
    // الأولى» ومرحلة كلّ بند (M1 اقتراحٌ أعمى ← M2 ظاهر ← M3 محدَّدٌ للتطبيق). العتبات من وثيقة «عين المشرف v2».
    const TRIAL = {
        LESSONS: 5,            // حصصٌ يُقاس فيها المعيار قبل الحكم عليه
        COUNT_ERR: 15,         // متوسّط خطأ عدّ الطلبة٪ على الأكثر
        WHISTLE: 90,           // التقاط الصفّارة وصحّته٪ على الأقلّ
        MIN_TAPS: 15,          // صفّاراتٌ لمسها المشرف في الحصص كلّها قبل الحكم
        FRAME_MS: 400,         // وسيط زمن الكشف للّقطة (م.ث) على الأكثر
        TOL: 3,                // ثوانٍ بين لمسة المشرف والصفّارة التي التقطتها العين
        M2_N: 30, M2_K: 0.6,   // اقتراحٌ ظاهر: ٣٠ حصّةً للبند، وكابا الموزون ≥ ٠٫٦
        M3_N: 100, M3_K: 0.75, // محدَّدٌ للتطبيق: ١٠٠ حصّة، وكابا ≥ ٠٫٧٥
        BIAS: 0.3,             // والميل (المشرف − العين) لا يتجاوز ٠٫٣ درجة
        BIN: 20, BINS: 250     // مدرّج زمن الكشف: خاناتٌ من ٢٠ م.ث حتّى ٥ ثوانٍ
    };
    // الصفّارة حدثٌ واحد وإن امتدّت ثانيتين (ثوانٍ متتالية أو بينها ثانيةٌ واحدة)
    function whistleEvents(secs) {
        const out = [];
        let last = -9;
        (secs || []).forEach((s, t) => { if (s && s.w) { if (t - last > 2) out.push(t); last = t; } });
        return out;
    }
    // كم حدثاً في a يقابله حدثٌ في b خلال tol ثانية — مطابقةٌ واحدٌ لواحد بالأقرب زمناً
    function matchTimes(a, b, tol) {
        const T = tol == null ? TRIAL.TOL : tol;
        const A = (a || []).slice().sort((p, q) => p - q), B = (b || []).slice().sort((p, q) => p - q), used = new Array(B.length).fill(false);
        let tp = 0;
        A.forEach(t => {
            let best = -1, d = Infinity;
            B.forEach((u, j) => { const x = Math.abs(u - t); if (!used[j] && x <= T && x < d) { d = x; best = j; } });
            if (best >= 0) { used[best] = true; tp++; }
        });
        return tp;
    }
    const histNew = () => new Array(TRIAL.BINS + 1).fill(0);
    function histAdd(h, ms) { if (h && isFinite(ms) && ms >= 0) h[Math.min(TRIAL.BINS, Math.floor(ms / TRIAL.BIN))]++; return h; }
    // المئين q من المدرّج (منتصف الخانة)، و[الوسيط، المئين ٩٠، العدد]
    function histQ(h, q) {
        const n = (h || []).reduce((s, v) => s + v, 0);
        if (!n) return null;
        let c = 0;
        for (let i = 0; i < h.length; i++) { c += h[i]; if (c >= q * n) return Math.round((i + 0.5) * TRIAL.BIN); }
        return Math.round((h.length - 0.5) * TRIAL.BIN);
    }
    const histSum = h => { const n = (h || []).reduce((s, v) => s + v, 0); return n ? [histQ(h, 0.5), histQ(h, 0.9), n] : null; };
    // كابا كوهين الموزون (أوزانٌ تربيعيّة — السلّم مرتّب) على المستويات ١–٥؛ null حين لا تباين
    function wkappa(pairs) {
        const P = (pairs || []).filter(p => p && p[0] >= 1 && p[0] <= 5 && p[1] >= 1 && p[1] <= 5);
        const N = P.length;
        if (!N) return null;
        const O = Array.from({ length: 5 }, () => new Array(5).fill(0)), r = new Array(5).fill(0), c = new Array(5).fill(0);
        P.forEach(p => { O[p[0] - 1][p[1] - 1]++; r[p[0] - 1]++; c[p[1] - 1]++; });
        let num = 0, den = 0;
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
            const w = (i - j) * (i - j) / 16;
            num += w * O[i][j];
            den += w * r[i] * c[j] / N;
        }
        return den ? Math.round(100 * (1 - num / den)) / 100 : null;
    }
    function maturity(st) {
        if (!st || !st.n) return 'M1';
        const ok = (n, k) => st.n >= n && st.kappa != null && st.kappa >= k && Math.abs(st.bias || 0) <= TRIAL.BIAS;
        return ok(TRIAL.M3_N, TRIAL.M3_K) ? 'M3' : ok(TRIAL.M2_N, TRIAL.M2_K) ? 'M2' : 'M1';
    }
    // ما قِيس في حصّةٍ واحدة (من #eyeData)
    function trialLesson(d) {
        const T = d && d.trial;
        if (!T) return null;
        const cnt = T.eyeN > 0 && T.supN > 0 ? { eye: T.eyeN, sup: T.supN, err: Math.round(1000 * Math.abs(T.eyeN - T.supN) / T.supN) / 10 } : null;
        const taps = Array.isArray(T.wTap) ? T.wTap : [], eyeW = Array.isArray(T.wEye) ? T.wEye : [];
        // الصفّارة تُقاس حين حُلّل الصوت، ولمس المشرف كلّ ما سمعه (أو قال إنّها لم تُستعمل)
        const wh = T.audio && T.wOk !== false && (taps.length || T.wNone) ? { tap: taps.length, eye: eyeW.length, tp: matchTimes(taps, eyeW) } : null;
        const ms = Array.isArray(T.ms) && T.ms[2] >= 10 ? { med: T.ms[0], p90: T.ms[1], n: T.ms[2] } : null;
        const BP = d.blind && d.blind.pairs ? d.blind.pairs : {};
        const pairs = Object.keys(BP).map(k => ({ id: Number(k), sup: Number(BP[k][0]), eye: Number(BP[k][1]) }))
            .filter(p => p.sup >= 1 && p.sup <= 5 && p.eye >= 1 && p.eye <= 5);
        return { dev: T.dev || '', det: T.det || null, src: d.via === 'phone' ? 'phone' : d.src || '', cnt, wh, ms, pairs, slow: !!T.slow };
    }
    const medOf = arr => { const a = arr.slice().sort((p, q) => p - q), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
    // rows: [{date, d}] من التقارير المحفوظة ← البوابة الأولى ومرحلة كلّ بند
    function trialReport(rows) {
        const L = (rows || []).map(r => { const x = trialLesson(r && r.d); return x ? Object.assign({ date: (r && r.date) || '' }, x) : null; }).filter(Boolean)
            .sort((p, q) => String(p.date).localeCompare(String(q.date)));
        const st = (n, ok) => (n < TRIAL.LESSONS ? 'wait' : ok ? 'pass' : 'fail');
        const fr = L.filter(x => x.ms), frMed = medOf(fr.map(x => x.ms.med));
        const frame = { lessons: fr.length, value: frMed, status: st(fr.length, frMed != null && frMed <= TRIAL.FRAME_MS) };
        const ct = L.filter(x => x.cnt), err = ct.length ? Math.round(10 * ct.reduce((s, x) => s + x.cnt.err, 0) / ct.length) / 10 : null;
        const count = { lessons: ct.length, value: err, status: st(ct.length, err != null && err <= TRIAL.COUNT_ERR) };
        const wl = L.filter(x => x.wh), tap = wl.reduce((s, x) => s + x.wh.tap, 0), ey = wl.reduce((s, x) => s + x.wh.eye, 0), tp = wl.reduce((s, x) => s + x.wh.tp, 0);
        const recall = tap ? Math.round(100 * tp / tap) : null, precision = ey ? Math.round(100 * tp / ey) : null;
        const whistle = { lessons: wl.length, tap, eye: ey, tp, recall, precision,
            status: wl.length < TRIAL.LESSONS || tap < TRIAL.MIN_TAPS ? 'wait' : recall >= TRIAL.WHISTLE && precision != null && precision >= TRIAL.WHISTLE ? 'pass' : 'fail' };
        const S3 = [frame.status, count.status, whistle.status];
        const gate = S3.every(s => s === 'pass') ? 'pass' : S3.includes('fail') ? 'fail' : 'wait';
        // الاتّفاق لكلّ بندٍ من التقييم الأعمى وحده (ما قيّمه المشرف قبل أن يرى الاقتراح)
        const by = {};
        L.forEach(x => x.pairs.forEach(p => { (by[p.id] = by[p.id] || []).push([p.sup, p.eye]); }));
        const pc = (a, b) => (b ? Math.round(100 * a / b) : 0);
        const items = Object.keys(by).map(Number).sort((a, b) => a - b).map(id => {
            const P = by[id], n = P.length;
            const it = { id, n, exact: pc(P.filter(p => p[0] === p[1]).length, n), near: pc(P.filter(p => Math.abs(p[0] - p[1]) <= 1).length, n),
                         kappa: wkappa(P), bias: Math.round(10 * P.reduce((s, p) => s + (p[0] - p[1]), 0) / n) / 10 };
            it.level = maturity(it);
            return it;
        });
        const all = [].concat(...Object.keys(by).map(k => by[k]));
        return { lessons: L, n: L.length, frame, count, whistle, gate, items,
                 blind: { n: all.length, lessons: L.filter(x => x.pairs.length).length, exact: pc(all.filter(p => p[0] === p[1]).length, all.length), kappa: wkappa(all) } };
    }
    // الأرقام وحدها لملفٍّ يُرسَل أو يُحلَّل — بلا اسم معلّمٍ ولا مدرسةٍ ولا نصّ
    function trialCsv(R) {
        const head = ['date', 'source', 'device', 'model', 'det_median_ms', 'det_p90_ms', 'det_frames', 'det_slow', 'count_eye', 'count_actual', 'count_err_pct', 'whistle_taps', 'whistle_eye', 'whistle_matched', 'blind_pairs'];
        const q = v => (v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
        const rows = ((R && R.lessons) || []).map(x => [x.date, x.src, x.dev, x.det, x.ms && x.ms.med, x.ms && x.ms.p90, x.ms && x.ms.n, x.slow ? 1 : 0,
            x.cnt && x.cnt.eye, x.cnt && x.cnt.sup, x.cnt && x.cnt.err, x.wh && x.wh.tap, x.wh && x.wh.eye, x.wh && x.wh.tp,
            x.pairs.map(p => p.id + ':' + p.sup + '/' + p.eye).join(' ')].map(q).join(','));
        return [head.join(',')].concat(rows).join('\n');
    }

    const api = {
        TRIAL, whistleEvents, matchTimes, histNew, histAdd, histQ, histSum, wkappa, maturity, trialLesson, trialReport, trialCsv,
        LIVE_STEP, ALERT_IDLE, ALERT_IDLE_BAD, ALERT_MOVE, ALERT_LINE, live, pack,
        LEVELS, SENS, SHAKE, GRID_W, GRID_H, MIN_OBSERVE, MIN_STRUCTURE, TAGS, GROUPS, TAG, NOT_SEEN, CONTEXTS,
        PARTS, PART, ACTIVE_PARTS, ROLL, ROLL_START, ROLL_AUTO_MAX, ROLL_MIN, ROLL_LONG, rollSpans, inSpans, lessonSecOf, FORMS, LONG_LINE, formations, formationStats, garmentScore, isDishdasha, partsOf, partsDetail, debriefPrompts,
        PERSON_MIN_SCORE, HIGH_SCORE, MAX_PRED, TRACK_TTL, MOVE_SPEED, BOX_ACT, TEACHER_H, EDGE, ALERT_EDGE,
        inPoly, roiMask, roiCells, polyBox,
        toGray, frameDiff, grayShift, boxMotion,
        newTracker, trackStep, trackMotion, peopleSnapshot,
        audioFrame, classify, runsOf, ctxSeries, ctxStats, summarizePeople, summarize, speechOf,
        suggest, confidence, unsupported, summaryText, heatDigits, agreement, dur, count, g, times, pupilsN,
        MIN_SAMPLE, QUANT, quantScore, sampleStats, movingOf, minuteSeries, autoMoments,
        METRICS, METRIC, NEEDS, fmtTarget, targetCandidates, targetText, targetGoalText, targetCheck,
        ISSUES, issuesOf, patterns, EV_TAG, evidenceLog, officialFor, planMatch, planVerdicts, planWords, spaceOf,
        SOFIT_STEP, SOFIT_CTX, SOFIT_TCH, sofit, SOFITP_LESSON, SOFITP_ACT, SOFITP_TCH, SOFITP_LIM, SOFITP_PR, SOFITP_GAP, sofitPlus, sofitPlusWhy,
        VIG_SPEED, CROWD_DIST, BALL_MIN_SCORE, MVPA_GOAL, CROWD_BAD, teacherStep, pickNearest, teacherStats, whistleResponses, ballRatio, perPupils,
        setAdv, isAdv, HEAT_CATS, WATER_EVERY, PLACES, EXC_ROLES, heatIndex, fieldOf
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfEye = api;
})(typeof window !== 'undefined' ? window : this);
