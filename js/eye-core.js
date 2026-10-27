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
    const PERSON_MIN_SCORE = 0.3; // أقلّ منه يكثر فيه الخطأ (لافتاتٌ ومخاريط) — قيس على مشهد مشاة
    const MATCH_GATE = 0.9;       // أبعد من ٠٫٩ طول جسمٍ بين لقطتين ← شخصٌ آخر
    const TRACK_TTL = 2.5;        // ثوانٍ بلا ظهورٍ ثمّ يُنسى
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

    // ما يسجّله المشرف بلمسة — item: البند الذي يشهد له، neg: شاهدٌ سلبيّ، qty: عددُ أشخاصٍ لا مرّات
    const TAGS = [
        { k: 'demo',      item: 8,  label: 'عرض نموذجي للمهارة' },
        { k: 'groups',    item: 8,  label: 'مجموعات أو تعلّم تعاوني' },
        { k: 'games',     item: 8,  label: 'ألعاب ومنافسات' },
        { k: 'stations',  item: 8,  label: 'محطات أو تعلّم ذاتي' },
        { k: 'levels',    item: 8,  label: 'تكليف حسب المستوى' },
        { k: 'include',   item: 2,  label: 'مراعاة الفروق والدمج' },
        { k: 'out',       item: 2,  label: 'طلبة خارج النشاط (عددهم)', neg: true, qty: true },
        { k: 'fbInd',     item: 10, label: 'تغذية راجعة فردية' },
        { k: 'fbGrp',     item: 10, label: 'تغذية راجعة جماعية' },
        { k: 'ask',       item: 10, label: 'سؤال تقويمي' },
        { k: 'peer',      item: 10, label: 'تقويم ذاتي أو أقران' },
        { k: 'fbMiss',    item: 10, label: 'خطأ في الأداء لم يُصحَّح', neg: true },
        { k: 'lead',      item: 3,  label: 'قيادة طالب' },
        { k: 'team',      item: 3,  label: 'تعاون وعمل فريق' },
        { k: 'tactic',    item: 3,  label: 'تفكير خططي' },
        { k: 'praise',    item: 4,  label: 'تعزيز الروح الرياضية' },
        { k: 'misbehave', item: 4,  label: 'سلوك سلبي لم يُعالَج', neg: true },
        { k: 'safe',      item: 5,  label: 'تهيئة آمنة للمكان والأدوات' },
        { k: 'hazard',    item: 5,  label: 'موقف خطر', neg: true },
        { k: 'dish',      item: 5,  label: 'بغير الزي الرياضي (عددهم)', neg: true, qty: true },
        { k: 'tools',     item: 9,  label: 'أدوات كافية ومتنوعة' },
        { k: 'noTools',   item: 9,  label: 'نقص أدوات وانتظار الدور', neg: true }
    ];
    const GROUPS = [
        { title: 'التدريس', keys: ['demo', 'groups', 'games', 'stations', 'levels', 'include', 'out'] },
        { title: 'التقويم', keys: ['fbInd', 'fbGrp', 'ask', 'peer', 'fbMiss'] },
        { title: 'مهارات التعلم والقيم', keys: ['lead', 'team', 'tactic', 'praise', 'misbehave'] },
        { title: 'السلامة والموارد', keys: ['safe', 'hazard', 'dish', 'tools', 'noTools'] }
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
        1: 'تحصيل الطلبة يُقدَّر من أدائهم للمهارة لا من الحركة — قيّم «عيّنة الطلبة» (خمسةٌ فأكثر) ليُقترح',
        11: 'التقويم الذاتي والتطوير المهني لا يظهران في حصةٍ واحدة — يُقترح حين تُتابَع أهداف زيارةٍ سابقة',
        12: 'الالتزام بالأخلاقيات واللوائح يُقدَّر من السجلات والمتابعة',
        13: 'المبادرات والأنشطة في المجتمع المدرسي خارج الحصة'
    };

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
    function trackStep(T, dets, t, ar, ttl) {
        ar = ar || 1;
        ttl = ttl || TRACK_TTL;
        const pts = (dets || []).filter(d => d && (d.score == null || d.score >= PERSON_MIN_SCORE)).map(d => ({
            fx: (d.x + d.w / 2) * ar, fy: d.y + d.h, cx: (d.x + d.w / 2) * ar, cy: d.y + d.h / 2, h: d.h,
            nx: d.x + d.w / 2, ny: d.y + d.h, act: d.act || 0, dish: d.dish == null ? null : !!d.dish
        }));
        T.tracks = T.tracks.filter(tr => t - tr.last <= ttl);
        const pairs = [];
        T.tracks.forEach((tr, a) => {
            const p = tr.hist[tr.hist.length - 1];
            // الحدّ يتّسع بزمن الغياب: لقطتان متباعدتان (جهازٌ بطيء) والطالب يجري — لولاه صار شخصاً جديداً بسرعة صفر
            const gate = Math.min(2.5, MATCH_GATE + RUN_GATE * Math.max(0, t - tr.last - 0.5));
            pts.forEach((d, b) => {
                const dist = Math.hypot(d.fx - p.fx, d.fy - p.fy) / Math.max(1e-6, Math.max(d.h, p.h));
                if (dist < gate) pairs.push({ a, b, dist });
            });
        });
        pairs.sort((p, q) => p.dist - q.dist);
        const usedA = new Set(), usedB = new Set();
        pairs.forEach(p => {
            if (usedA.has(p.a) || usedB.has(p.b)) return;
            usedA.add(p.a); usedB.add(p.b);
            const tr = T.tracks[p.a];
            tr.hist.push(Object.assign({ t }, pts[p.b]));
            while (tr.hist.length > 2 && t - tr.hist[0].t > 6) tr.hist.shift();
            tr.last = t;
            vote(tr, pts[p.b].dish);
        });
        pts.forEach((d, b) => {
            if (usedB.has(b)) return;
            const tr = { id: T.next++, last: t, hist: [Object.assign({ t }, d)], dv: 0, dy: 0 };
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
        const live = T.tracks.filter(tr => t - tr.last <= 1.2);
        let tr = live.find(x => x.id === tch.id);
        if (!tr && t - (tch.seen || 0) <= 8) {
            const cands = live.filter(x => x.id > tch.id || x.hist.length <= 2).map(x => {
                const p = x.hist[x.hist.length - 1];
                return { x, d: Math.hypot(p.fx - tch.fx, p.fy - tch.fy) / Math.max(1e-6, Math.max(p.h, tch.h || p.h)) };
            }).filter(c => c.d <= 1.5).sort((a, b) => a.d - b.d);
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
        const live = T.tracks.filter(tr => t - tr.last <= 1.2);
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
        return {
            n: ins.length, mv: ins.length - still.length, o: ppl.length - ins.length, q,
            r: !!(poly && poly.length >= 3),
            fm: F.dom, ln: F.maxLine, d: ins.filter(isDishTrack).length,
            vg: ins.filter(p => p.vig).length, cr, tc,
            dots: all.map(p => ({ id: p.id, x: p.x, y: p.y, mv: p.moving, in: p.inside, dish: isDishTrack(p), tch: p === teacher }))
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
            const verdict = r.sec < 30 ? 'missing' : have - want > tol ? 'long' : want - have > tol ? 'short' : 'ok';
            return Object.assign({}, r, { label: PART[r.k].label, short: PART[r.k].short, rec: Math.round(want * 10) / 10, minutes: Math.round(have * 10) / 10, verdict,
                lowAct: PART[r.k].act != null && r.sec >= 60 && (r.moving != null ? r.moving : r.activePct) != null && (r.moving != null ? r.moving : r.activePct) < PART[r.k].act });
        });
    }

    // ── التشكيلات عبر الحصة ──
    // التشكيل الغالب كلّ عشر ثوانٍ، ثمّ المقاطع المتّصلة من عشرين ثانيةً فأكثر = تشكيلٌ استُعمل.
    function formationStats(secs) {
        const win = [];
        for (let t = 0; t < secs.length; t += 10) {
            const cnt = {};
            secs.slice(t, t + 10).forEach(s => { const f = s && s.p && s.p.fm; if (f && f !== '-') cnt[f] = (cnt[f] || 0) + 1; });
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
        return { segments: used, byType, types: Object.keys(byType), count: used.length, longLineSec, maxLine, longRun, windows: win.join('') };
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
        const n = TAGS.filter(t => t.item === s.id).reduce((a, t) => a + ((counts && counts[t.k]) || 0), 0);
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
    const respOf = M => { const R = M && M.resp; return R && R.med != null && R.list.filter(x => x[2] >= 0).length >= 3 ? R : null; };
    const teacherOf = M => { const T = M && M.people && M.people.teacher; return T && T.secs >= 300 ? T : null; };
    // طلبةٌ لكلّ كرة (العدد الأكبر ÷ الكرات) — حين تُرى الكرات
    const ballRatio = M => { const P = M && M.people; return P && P.balls ? Math.max(1, Math.round((P.classSize || P.inside || 0) / P.balls)) : null; };
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
                + (GD && GD.weak ? '، وأضعف نقاطها الفنّيّة «' + GD.weak.short + '» (' + GD.weak.ok + ' من ' + GD.weak.rated + ')' : '') + '.',
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
                if (vg != null && p >= 10) e += '، منها (' + vg + '%) جرياً أو نشاطاً شديداً';
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
            add(7, Math.max(s0 - 1, Math.min(s0 + 2, s)), basis, e + '.');
        }

        // ٦ تخطيط المنهاج — من عناصر الحصة الخمسة إن لُمست (حضورها وترتيبها وزمن كلٍّ منها)، وإلّا من بنيتها المرئيّة.
        // أعلاه «جيد»: التخطيط المكتوب يقدّره المشرف.
        const det = cx ? partsDetail(m, m.rec) : null;
        if (det && cx.covered >= MIN_STRUCTURE && det.some(r => r.verdict !== 'missing')) {
            const present = det.filter(r => r.verdict !== 'missing'), missing = det.filter(r => r.verdict === 'missing');
            const long = present.filter(r => r.verdict === 'long'), short = present.filter(r => r.verdict === 'short');
            const orderOk = !m.parts || m.parts.orderOk !== false;
            const s = 2 + Math.min(2, missing.length) + (orderOk ? 0 : 1) + (long.length + short.length >= 2 ? 1 : 0);
            let e = (missing.length ? 'اشتملت الحصة على ' + partsWord(present.length) + ' من عناصرها الخمسة: ' : 'اشتملت الحصة على عناصرها الخمسة: ') + partsText(det);
            if (missing.length) e += '، وغاب عنها ' + list(missing.map(r => r.label));
            if (long.length) e += '، وطال ' + list(long.map(r => r.label)) + ' عن الزمن الموصى به';
            if (short.length) e += '، وقصر ' + list(short.map(r => r.label)) + ' عنه';
            if (!orderOk) e += '، ولم تأتِ العناصر بترتيبها';
            add(6, s, 'ctx', e + '.');
        } else if ((m.observed || 0) >= MIN_STRUCTURE && m.structure) {
            const ok = ['warm', 'main', 'close'].filter(k => m.structure[k]).length;
            const s = { 3: 2, 2: 3, 1: 4, 0: 5 }[ok];
            const parts = [
                m.structure.warm ? 'بدأت الحصة بإحماءٍ نشط (' + m.phases.warm + '%)' : 'كان الإحماء في أوّل الحصة محدوداً (' + m.phases.warm + '%)',
                m.structure.main ? 'وجاء الجزء الرئيس أكثرها نشاطاً (' + m.phases.main + '%)' : 'وقلّ النشاط في الجزء الرئيس (' + m.phases.main + '%)',
                m.structure.close ? 'وهدأ الختام للتهدئة والمراجعة' : 'ولم يظهر ختامٌ للتهدئة والمراجعة'
            ];
            add(6, s, 'camera', parts.join('، ') + '.');
        }

        // ٨ استراتيجيّات التدريس — تسجيلات المشرف، والشرح الطويل (من السياق أو الصوت) ينقصها
        const strat = ['demo', 'groups', 'games', 'stations', 'levels'].filter(k => c(k) > 0);
        if (strat.length) {
            let s = strat.length >= 4 ? 1 : strat.length === 3 ? 2 : strat.length === 2 ? 3 : 4;
            let e = '{نوّع المعلم|نوّعت المعلمة} بين: ' + list(strat.map(k => TAG[k].label));
            if (strat.length === 1) e = '{وظّف المعلم|وظّفت المعلمة}: ' + TAG[strat[0]].label;
            const longAudio = (m.observed || 0) >= MIN_OBSERVE && m.explainPct > 40;
            if (longAudio) { s++; e += '، مع شرحٍ طويل استغرق (' + m.explainPct + '%) من زمن الرصد' + rollNote(m); }
            add(8, s, longAudio ? 'both' : 'taps', e + '.');
        }

        // ١٠ أساليب التقويم — ومعها توجيه المعلّم أثناء النشاط من ميكروفونه
        const fb = ['fbInd', 'fbGrp', 'ask', 'peer'];
        const fbTotal = fb.reduce((s, k) => s + c(k), 0), kinds = fb.filter(k => c(k) > 0).length;
        const SP = speechOf(m);
        if (!fbTotal && !c('fbMiss') && SP && speechMin(SP) >= 10) {
            // من كلامه وحده: التصحيح والتحقّق من الفهم، والأسئلة بنصف وزن — وأدناه «غير ملائم» (المحوِّل قد يفوته كلام)
            const r = per10(SP, SP.corr.n + SP.check.n) + per10(SP, SP.q.n) / 2;
            const top = SP.corr.spec >= 8 && SP.check.n >= 2 && SP.q.hi >= 2;
            add(10, r >= 6 ? (top ? 1 : 2) : r >= 3 ? 3 : 4, 'speech', speechFbText(SP) + coverText(GD) + '.');
        }
        if (fbTotal || c('fbMiss')) {
            let s = !fbTotal ? 4 : fbTotal >= 8 && kinds >= 3 ? 1 : fbTotal >= 6 && kinds >= 2 ? 2 : fbTotal >= 3 ? 3 : 4;
            const bits = [];
            if (c('fbInd')) bits.push('تغذية راجعة فردية ' + times(c('fbInd')));
            if (c('fbGrp')) bits.push('جماعية ' + times(c('fbGrp')));
            if (c('ask')) bits.push('أسئلة تقويمية ' + times(c('ask')));
            if (c('peer')) bits.push('تقويماً ذاتياً أو بين الأقران ' + times(c('peer')));
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
                e += '، و' + speechFbText(SP) + coverText(GD);
                basis = 'both';
            }
            add(10, s, basis, e + '.');
        }

        // ٣ مهارات التعلّم
        // ومن كلامه: الأسئلة التي تستثير التفكير (لماذا، كيف، ما الفرق) — أو أسئلةٌ مغلقةٌ كلّها
        const sk = ['lead', 'team', 'tactic'].filter(k => c(k) > 0);
        const spQ = SP && (SP.q.hi >= 1 || SP.q.n >= 5);
        if (sk.length || spQ) {
            let s = sk.length ? { 3: 1, 2: 2, 1: 3 }[sk.length] : null, basis = sk.length ? 'taps' : 'speech';
            let e = sk.length ? 'ظهرت في الحصة مواقف: ' + list(sk.map(k => TAG[k].label)) : '';
            if (spQ) {
                const ss = SP.q.hi >= 4 ? 2 : SP.q.hi >= 1 ? 3 : 4;
                if (s == null) s = ss; else { if (SP.q.hi >= 3) s--; basis = 'both'; }
                e += (e ? '، و' : '') + (SP.q.hi ? '{طرح المعلم|طرحت المعلمة} ' + count(SP.q.hi, 'سؤالاً واحداً', 'سؤالين', 'أسئلة', 'سؤالاً') + ' تستثير التفكير (لماذا، كيف، ما الفرق)'
                                                 : 'كانت أسئلة {المعلم|المعلمة} (' + SP.q.n + ') مغلقةً لا تستثير التفكير');
            }
            add(3, s, basis, e + '.');
        }

        // ٤ القيم والروح الرياضيّة
        // ومن كلامه: التعزيز اللفظيّ (المحدّد بما أجاده الطالب أقوى)، والحثّ على القيم، والربط بالصحّة
        const spV = SP && (SP.praise.n || SP.values.n || SP.health.n || speechMin(SP) >= 15);
        if (c('praise') || c('misbehave') || spV) {
            const p = c('praise'), n = c('misbehave');
            let s = null, e = '', basis = 'taps';
            if (p || n) {
                s = n >= 2 ? (p ? 4 : 5) : n === 1 ? (p ? 3 : 4) : (p >= 3 ? 1 : 2);
                const negTxt = 'رُصد سلوكٌ سلبيّ لم يُعالَج ' + times(n);
                e = p ? '{عزّز المعلم|عزّزت المعلمة} الروح الرياضية ' + times(p) + (n ? '، و' + negTxt : '') : negTxt;
            }
            if (spV) {
                const pr = per10(SP, SP.praise.n), v = SP.values.n + SP.health.n;
                const ss = pr >= 3 && (SP.praise.spec >= 3 || v >= 2) ? 1 : pr >= 2 ? 2 : 3;
                if (s == null) { s = ss; basis = 'speech'; } else { if (ss < s) s--; basis = 'both'; }
                let t = SP.praise.n ? 'سُمع من {المعلم|المعلمة} تعزيزٌ لفظيّ ' + times(SP.praise.n) + (SP.praise.spec ? '، منه (' + SP.praise.spec + ') بما أجاده الطالب تحديداً' : '')
                                    : 'لم يُسمع في كلام {المعلم|المعلمة} تعزيزٌ لفظيّ للطلبة';
                if (SP.values.n) t += '، وحثٌّ على القيم والروح الرياضيّة ' + times(SP.values.n);
                if (SP.health.n) t += '، وربطٌ بالصحّة ' + times(SP.health.n);
                e += (e ? '، و' : '') + t;
            }
            add(4, s, basis, e + '.');
        }

        // ٢ التقدّم في الحصة والفروق الفرديّة — تقدّم «عيّنة الطلبة» بين قراءتيها، ومراعاة الفروق، والطلبة خارج النشاط
        // (عددهم من المشرف، وتقترحه الكاميرا)
        const inc = c('include') + c('levels'), outN = c('out');
        const prog = SS && SS.both >= MIN_SAMPLE ? SS : null;
        if (inc || outN || prog) {
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
            add(2, s, prog ? (inc || outN ? 'both' : 'sample') : 'taps', bits.join('، ') + '.', prog ? nConf(prog.both) : null);
        }

        // ٥ الأمن والسلامة — ومنها الزيّ الرياضيّ: «بغير الزيّ» عددٌ يقترحه كشف الطلبة ويؤكّده المشرف،
        // والتزاحم أثناء الحركة (الاستمارة: «توزيع الطلبة في مسافات آمنة» / «تزاحم الطلبة في مساحات ضيقة»)
        const crowd = people && people.crowdPct != null ? people.crowdPct : null;
        const crowdText = v => (v >= CROWD_BAD ? 'وتزاحم الطلبة أثناء الحركة: (' + v + '%) منهم كان زميلٌ ملاصقاً له'
                                               : 'وتوزّع الطلبة في مسافاتٍ آمنة أثناء الحركة (التزاحم ' + v + '%)');
        const dishN = c('dish');
        if (c('safe') || c('hazard') || dishN) {
            const p = c('safe'), n = c('hazard');
            let s = n >= 2 ? (p ? 4 : 5) : n === 1 ? (p ? 3 : 4) : 2;
            const bits = [];
            if (p) bits.push('هُيّئ المكان والأدوات تهيئةً آمنة');
            if (n) bits.push((bits.length ? 'و' : '') + 'رُصد ' + count(n, 'موقفٌ خطر', 'موقفان خطران', 'مواقف خطرة', 'موقفاً خطراً'));
            if (dishN) {
                const share = classN ? dishN / classN : 0;
                const ds = dishN >= 5 || share >= 0.2 ? 4 : dishN >= 2 || share >= 0.08 ? 3 : 2;
                s = p || n ? Math.max(s, ds) : ds;
                bits.push((bits.length ? 'و' : '') + 'شارك ' + pupilsN(dishN) + (classN ? ' من ' + pupilsN(classN) : '') + (F ? ' بغير الزيّ الرياضيّ' : ' بالدشداشة بدل الزيّ الرياضيّ'));
            }
            if (m.space && m.space.concentration >= 60 && (m.observed || 0) >= MIN_OBSERVE) bits.push('وتركّزت الحركة في جزءٍ محدود من المساحة');
            if (SP && SP.safe.n) bits.push('وذكّر {المعلم|المعلمة} الطلبة بالسلامة ' + times(SP.safe.n));
            if (crowd != null) {
                if (crowd >= CROWD_BAD) s = Math.max(s, crowd >= 40 ? 4 : 3);
                bits.push(crowdText(crowd));
            }
            add(5, s, crowd != null ? 'both' : 'taps', bits.join('، ') + '.');
        } else if (crowd != null && crowd >= CROWD_BAD) {
            add(5, crowd >= 40 ? 4 : 3, 'ai', crowdText(crowd).replace(/^و/, '') + '.');
        } else if (SP && SP.safe.n >= 2) {
            add(5, 2, 'speech', '{ذكّر المعلم|ذكّرت المعلمة} الطلبة بالسلامة ' + times(SP.safe.n) + ' أثناء الحصة.');
        }

        // ٩ المصادر والموارد — وانتظار الدور الذي تراه الكاميرا
        const queue = people && people.queuePct >= 40 ? people.queuePct : 0;
        // والكرات: النموذج نفسه يرى «الكرة» — طلبةٌ لكلّ كرة (٢ فأقلّ جيد، حتّى ٤ ملائم، وأكثر غير ملائم)
        const ratio = people ? ballRatio(m) : null;
        if (c('tools') || c('noTools') || queue || ratio) {
            const p = c('tools'), n = c('noTools');
            let s = p || n ? (n >= 2 ? 4 : n === 1 ? (p ? 3 : 4) : 2) : 0;
            const bits = [];
            if (p) bits.push('وُظّفت أدواتٌ كافية ومتنوعة');
            if (n) bits.push((p ? 'و' : '') + 'رُصد نقصٌ في الأدوات وانتظارٌ للدور ' + times(n));
            if (ratio) {
                const bs = ratio <= 2 ? 2 : ratio <= 4 ? 3 : 4;
                s = s ? Math.max(s, bs) : bs;
                bits.push((bits.length ? 'و' : '') + 'رُصدت نحو (' + people.balls + ') ' + (people.balls <= 10 ? 'كرات' : 'كرة') + ' لـ' + pupilsN(people.classSize || people.inside) + ' — كرةٌ لكلّ ' + perPupils(ratio));
            }
            if (queue) {
                s = Math.max(s, queue >= 55 ? 4 : 3);
                bits.push((bits.length ? 'و' : '') + 'وقف (' + queue + '%) من الطلبة ينتظرون دورهم أثناء التطبيق');
            }
            add(9, s, p || n ? (queue || ratio ? 'both' : 'taps') : 'ai', bits.join('، ') + '.');
        }

        return out.sort((a, b) => a.id - b.id);
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
        if (M.forms && M.forms.count) bits.push('واستُعمل ' + count(M.forms.count, 'تشكيلٌ واحد', 'تشكيلان', 'تشكيلات', 'تشكيلاً'));
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
        bits[0] = bits[0].replace(/^و(?=استُعمل|تخلّل|استغرق|استجاب|سُمع|تحرّك)/, '');
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
        if (FM && FM.count === 1 && FM.segments[0]) ask.push('استُعمل تشكيلٌ واحد («' + FORMS[FM.segments[0].type] + '») طوال الحصة. أيّ تشكيلٍ آخر يناسب المهارة؟');
        if (FM && FM.types && FM.types.length >= 3) good.push('{نوّع المعلم|نوّعت المعلمة} التشكيلات: ' + list(FM.types.map(t => FORMS[t])) + '.');
        if (c('dish')) ask.push('شارك ' + pupilsN(c('dish')) + ' بغير الزيّ الرياضيّ. ما الإجراء المتّفق عليه مع الإدارة وأولياء الأمور؟');
        if (c('out')) ask.push('ظلّ ' + pupilsN(c('out')) + ' خارج النشاط. كيف {تشركهم|تشركينهم} ولو بدورٍ مساعد؟');
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
            if (vg != null && vg >= 25) good.push('كان (' + vg + '%) من زمن الطلبة جرياً أو نشاطاً شديداً.');
            if (PP.crowdPct != null && PP.crowdPct >= CROWD_BAD) ask.push('تزاحم الطلبة أثناء الحركة (' + PP.crowdPct + '%). كيف {توزّع|توزّعين} المساحة ليعمل كلٌّ في مسافةٍ آمنة؟');
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
          read: d => (d.M && d.M.forms ? d.M.forms.count : null), goal: b => Math.max(2, b + 1),
          text: (b, t) => 'التنويع في تشكيلات الطلبة بما يناسب المهارة: ' + count(t, 'تشكيلٌ واحد', 'تشكيلان', 'تشكيلات', 'تشكيلاً') + ' على الأقلّ في الحصة — كان (' + b + ')' },
        { k: 'dish', w: 1, item: 5, label: 'المشاركون بغير الزيّ الرياضيّ', unit: 'n', dir: -1, good: 1, needs: 'tag',
          read: d => { const c = (d.counts || {}).dish; return c != null ? c : (d.M && d.M.people ? 0 : null); }, goal: () => 0,
          text: (b) => 'متابعة التزام الطلبة بالزيّ الرياضيّ مع الإدارة وأولياء الأمور حتّى يشارك الجميع به — شارك (' + b + ') بغيره' },
        { k: 'out', w: 1.5, item: 2, label: 'الطلبة خارج النشاط', unit: 'n', dir: -1, good: 0, needs: 'tag',
          read: d => { const c = (d.counts || {}).out; return c != null ? c : (d.M && d.M.people && d.M.people.roi ? 0 : null); }, goal: () => 0,
          text: (b) => 'إشراك جميع الطلبة في النشاط ولو بأدوارٍ مساعدة — ظلّ (' + b + ') خارجه' },
        { k: 'praiseSpec', w: 2, item: 4, label: 'التعزيز المحدّد بما أجاده الطالب', unit: 'n', dir: 1, good: 4, needs: 'speech',
          read: d => { const SP = spOf(d); return SP ? SP.praise.spec : null; }, goal: b => Math.max(4, b + 3),
          text: (b, t) => 'تعزيز أداء الطلبة تعزيزاً محدّداً يذكر ما أجادوه ' + times(t) + ' على الأقلّ في الحصة — كان (' + b + ')' },
        { k: 'qHi', w: 2, item: 3, label: 'الأسئلة التي تستثير التفكير', unit: 'n', dir: 1, good: 2, needs: 'speech',
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
          read: d => (d.M && d.M.people && d.M.people.detSecs >= MIN_OBSERVE / 2 && d.M.people.crowdPct != null ? d.M.people.crowdPct : null), goal: b => Math.max(10, b - 15),
          text: (b, t) => 'توزيع الطلبة في مسافاتٍ آمنة أثناء الحركة ليقلّ التزاحم من (' + b + '%) إلى (' + t + '%) على الأكثر' },
        { k: 'balls', w: 1.5, item: 9, label: 'طلبةٌ لكلّ كرة', unit: 'n', dir: -1, good: 3, needs: 'ai',
          read: d => ballRatio(d.M), goal: b => Math.max(2, Math.min(3, Math.round(b * 0.6))),
          text: (b, t) => 'زيادة الكرات أو المحطّات لتكون كرةٌ لكلّ ' + perPupils(t) + ' على الأكثر — كانت لكلّ ' + perPupils(b) },
        { k: 'tEdge', w: 2, item: 7, label: 'وقوف المعلّم على أطراف الطلبة', unit: '%', dir: 1, good: 60, needs: 'teacher',
          read: d => { const T = teacherOf(d.M); return T && T.edgePct != null ? T.edgePct : null; }, goal: b => Math.min(80, ceil5(b + 20)),
          text: (b, t) => '{وقوف المعلم|وقوف المعلمة} على أطراف الطلبة حيث {يراهم|تراهم} جميعاً (' + t + '%) من الوقت على الأقلّ — كان (' + b + '%)' },
        { k: 'mastery', w: 3, item: 1, label: 'إتقان عيّنة الطلبة للمهارة', unit: '%', dir: 1, good: 75, needs: 'sample',
          read: d => { const SS = sampleStats(d.sample); return SS && SS.final ? SS.final.pct : null; }, goal: b => Math.min(90, ceil5(b + 15)),
          text: (b, t) => 'رفع نسبة إتقان الطلبة للمهارة في آخر الحصة من (' + b + '%) إلى (' + t + '%) على الأقلّ، بالتدرّج في تعليمها وتكرار ممارستها' }
    ];
    const METRIC = {};
    METRICS.forEach(x => { METRIC[x.k] = x; });
    const NEEDS = { camera: 'الكاميرا', ai: 'الكاميرا و«كشف الطلبة»', parts: 'لمس «عناصر الحصة»', tag: 'الوسم أو كشف الطلبة', speech: '«فهم الكلام»', sample: '«عيّنة الطلبة»',
                    teacher: 'الكاميرا و«تحديد المعلّم»' };

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

    // ── أنماط الرصد عبر الحصص: ما يتكرّر عند معلّمي المشرف، وما يصلح موضوعاً لبرنامجه التدريبيّ ──
    const ISSUES = [
        { k: 'lowMove', label: 'حركة الطلبة أقلّ من (50%)', topic: 'رفع زمن الممارسة الفعليّة للطلبة', test: d => { const v = movingOf(d.M); return v != null && v < 50; } },
        { k: 'longIdle', label: 'انتظارٌ بين نشاطين (3) دقائق فأكثر', topic: 'إدارة الانتقالات وتجهيز الأدوات', test: d => d.M && d.M.observed >= MIN_OBSERVE && d.M.longestIdle >= 180 },
        { k: 'longLine', label: 'قاطراتٌ طويلة (أكثر من ستّة طلبة)', topic: 'تشكيلاتٌ تقلّل انتظار الدور', test: d => { const f = d.M && d.M.forms; return !!f && f.longLineSec >= 60 && f.maxLine > LONG_LINE; } },
        { k: 'queue', label: 'انتظار الدور (40%) فأكثر من الطلبة', topic: 'تشكيلاتٌ تقلّل انتظار الدور', test: d => { const p = d.M && d.M.people; return !!p && p.detSecs >= MIN_OBSERVE / 2 && p.queuePct >= 40; } },
        { k: 'oneForm', label: 'تشكيلٌ واحد طوال الحصة', topic: 'تنويع التشكيلات بما يناسب المهارة', test: d => !!(d.M && d.M.forms) && d.M.forms.count === 1 },
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
        { k: 'crowd', label: 'تزاحمٌ أثناء الحركة', topic: 'تنظيم المساحة والسلامة أثناء الممارسة', test: d => { const P = d.M && d.M.people; return !!P && P.detSecs >= MIN_OBSERVE / 2 && P.crowdPct != null && P.crowdPct >= CROWD_BAD; } },
        { k: 'fewBalls', label: 'كرةٌ لكلّ أكثر من أربعة طلبة', topic: 'توفير الأدوات وتعدّد المحطّات', test: d => { const r = ballRatio(d.M); return !!r && r > 4; } },
        { k: 'teacherCenter', label: 'المعلّم في وسط الطلبة أغلب الوقت', topic: 'الإشراف النشط وموقع المعلّم', test: d => { const T = teacherOf(d.M); return !!T && T.edgePct != null && T.edgePct < 35; } },
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
        if (state === 'x' && run >= 10 && !o.phone) add('shake', 'warn', 'الكاميرا تتحرّك — ثبّتها على الحامل؛ هذه الثواني لا تُحسب');
        if (rollNow && run >= ROLL_LONG) add('roll', 'info', 'تسجيل الحضور والزيّ منذ ' + dur(run));
        if (recent && recent.n >= 30 && recent.pct < ALERT_MOVE && n - since >= 60 && !(state === 'i' && run >= ALERT_IDLE)) add('move', 'warn', 'حركة الطلبة ' + recent.pct + '% في «' + PART[part].label + '» (آخر دقيقتين)');
        if (lineSec >= ALERT_LINE && !rollNow) add('line', 'warn', 'قاطرةٌ من ' + pupilsN(lineLen) + ' منذ ' + dur(lineSec) + ' — قسّمها');
        if (lastP && lastP.r && lastP.o >= 3 && !rollNow) add('out', 'warn', pupilsN(lastP.o) + ' خارج منطقة النشاط');
        if (part && PART[part].min && n - since > recMin(part) * 60 + 120) add('over', 'info', '«' + PART[part].label + '» ' + dur(n - since) + ' — الموصى به ' + recMin(part) + ' د');
        if (rollNow && rollAuto) add('rollAuto', 'hint', 'بداية الحصة تُعدّ «حضوراً وزيّاً» حتّى يبدأ النشاط أو تلمس «الإحماء» — لا تُحسب شرحاً ولا انتظاراً');
        else if (o.camera === false && !((rec && rec.ctx) || []).length && n < ROLL_LONG) add('rollTouch', 'hint', 'يسجّل المعلّم الحضور والزيّ؟ المس «حضور وزيّ» — وإلّا عُدّ ما قبل لمسة «الإحماء» كذلك');
        else if (!part && n >= 120 && !rollNow) add('parts', 'hint', 'المس عنصر الحصة الجاري ليُقاس زمنه وحركة الطلبة فيه');
        if (o.camera && o.ai && !o.roi && n >= 60) add('roi', 'hint', 'حدّد منطقة الصف ليُعدّ من هم خارجها وتدقّ الأرقام');
        const rank = { bad: 0, warn: 1, info: 2, hint: 3 };
        alerts.sort((a, b) => rank[a.level] - rank[b.level]);
        return {
            series, seconds: n, state, run, part, partSec: part ? n - since : 0, parts,
            roll: { now: rollNow, sec: st.filter(k => k === 'r').length, auto: rollAuto },
            now: now15 ? now15.pct : null, avg: all ? all.pct : null, recent: recent ? recent.pct : null,
            line: lineSec ? { n: lineLen, sec: lineSec } : null, outside: lastP && lastP.r ? lastP.o : null,
            pupilsNow: lastP ? lastP.n + (lastP.o || 0) : null, alerts: alerts.slice(0, 3)
        };
    }
    // سلسلةٌ محفوظةٌ مع النتيجة: رقمٌ لكلّ عشر ثوانٍ (٠–٩ = عُشر النسبة، و«-» بلا قياس) — لمجرى الحصة بعد الرصد
    const pack = (series, key, scale) => series.map(b => (b[key] == null ? '-' : String(Math.min(9, Math.round(b[key] * scale))))).join('');

    const api = {
        LIVE_STEP, ALERT_IDLE, ALERT_IDLE_BAD, ALERT_MOVE, ALERT_LINE, live, pack,
        LEVELS, SENS, SHAKE, GRID_W, GRID_H, MIN_OBSERVE, MIN_STRUCTURE, TAGS, GROUPS, TAG, NOT_SEEN, CONTEXTS,
        PARTS, PART, ACTIVE_PARTS, ROLL, ROLL_START, ROLL_AUTO_MAX, ROLL_MIN, ROLL_LONG, rollSpans, inSpans, lessonSecOf, FORMS, LONG_LINE, formations, formationStats, garmentScore, isDishdasha, partsOf, partsDetail, debriefPrompts,
        PERSON_MIN_SCORE, MOVE_SPEED, BOX_ACT,
        inPoly, roiMask, roiCells, polyBox,
        toGray, frameDiff, grayShift, boxMotion,
        newTracker, trackStep, trackMotion, peopleSnapshot,
        audioFrame, classify, runsOf, ctxSeries, ctxStats, summarizePeople, summarize, speechOf,
        suggest, confidence, unsupported, summaryText, heatDigits, agreement, dur, count, g, times, pupilsN,
        MIN_SAMPLE, QUANT, quantScore, sampleStats, movingOf, minuteSeries, autoMoments,
        METRICS, METRIC, NEEDS, fmtTarget, targetCandidates, targetText, targetGoalText, targetCheck,
        ISSUES, issuesOf, patterns,
        VIG_SPEED, CROWD_DIST, BALL_MIN_SCORE, MVPA_GOAL, CROWD_BAD, teacherStep, pickNearest, teacherStats, whistleResponses, ballRatio, perPupils
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfEye = api;
})(typeof window !== 'undefined' ? window : this);
