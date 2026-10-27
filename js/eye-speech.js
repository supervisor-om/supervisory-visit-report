// =========================================================================
// عين المشرف — فهم كلام المعلّم (منذ 2026-10-26)
//
// طلب المشرف: «أريد إضافة فهم الكلمات لأنّي أخذت إذن المعلّم». الصوت يصير نصّاً في js/eye.js (التعرّف على الكلام في
// المتصفّح: داخل الجهاز إن أتاحه، وإلّا عبر خدمة المتصفّح)، وهذه الوحدة **نقيّة** تقرأ النصّ وحده: مقاطع {t ثانية, x نصّ}
// ← ماذا قال المعلّم ومتى، بقاموسٍ لكلام معلّم الرياضة المدرسيّة بالفصحى واللهجة العُمانيّة:
//   • التعزيز (عامّ / محدّدٌ بالأداء)          • التصحيح والتغذية الراجعة (عامّ / محدّدٌ بالمهارة)
//   • الأسئلة (ومنها ما يستثير التفكير)         • التحقّق من الفهم
//   • التذكير بالسلامة                          • التعليمات التنظيميّة
//   • القيم والروح الرياضيّة، والربط بالصحّة    • مصطلحات درس اليوم (من عنوانه)
//   • عباراتٌ تحتاج مراجعة المشرف — **لا تدخل التقييم ولا بطاقة المعلّم**
// وكلّ عبارةٍ تُنسب إلى عنصر الحصة الذي قيلت فيه. القاموس لا يفهم السياق: يعدّ ما يُسمع، والمشرف يراجع الأمثلة.
// وما قيل أثناء الحضور والزيّ (opts.admin) يُعدّ وحده ولا يدخل الفئات (2026-10-27).
// =========================================================================
(function (root) {
    'use strict';

    // تسويةٌ للمقارنة: بلا تشكيل ولا تطويل، والهمزات ألفاً، والتاء المربوطة هاءً، والألف المقصورة ياءً، والأرقام لاتينيّة
    const norm = s => String(s || '')
        .replace(/[ً-ٰٟـ]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
        .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[^ء-ي0-9a-zA-Z]+/g, ' ')
        .replace(/\s+/g, ' ').trim();
    const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b لا يعمل مع العربيّة في JS — الحدود مسافاتٌ في نصٍّ مسوّى، وتُقبل «و/ف» قبل الكلمة (وبعدها حرف جرٍّ للأسماء)
    function lex(words, nouns) {
        const alts = Array.from(new Set(words.map(norm).filter(Boolean))).sort((a, b) => b.length - a.length).map(escRe).join('|');
        return new RegExp('(?:^| )(?:و|ف)?' + (nouns ? '(?:ب|ل|ك)?' : '') + '(?:' + alts + ')(?= |$)');
    }

    // ── القاموس ──
    const L = {
        praise: lex(['أحسنت', 'أحسنتم', 'أحسنتي', 'أحسنتو', 'أحسنتوا', 'ممتاز', 'ممتازة', 'ممتازين', 'رائع', 'رائعة', 'روعة', 'جميل جدا',
            'عمل جميل', 'عمل رائع', 'حلو', 'مبدع', 'مبدعة', 'مبدعين', 'إبداع', 'شاطر', 'شاطرة', 'شاطرين', 'برافو',
            'كفو', 'كفوه', 'يا بطل', 'يا بطلة', 'يا أبطال', 'عفية', 'عفية عليك', 'يعطيك العافية', 'الله يعطيك العافية', 'ما شاء الله', 'ماشاء الله', 'ماشالله', 'تبارك الله',
            'بارك الله فيك', 'بارك الله فيكم', 'صح عليك', 'صح لسانك', 'جيد جدا', 'زين عليك', 'وايد زين', 'زين جدا', 'استمر', 'استمروا', 'استمري',
            'واصل', 'واصلوا', 'يا سلام', 'ياسلام', 'الله عليك', 'بالضبط', 'هذا هو المطلوب', 'هكذا الصح', 'كذا الصح', 'جذي الصح', 'تمام كذا', 'رهيب']),
        // التصحيح: عبارةٌ صريحة («غلط»، «عيد»، «الصح»)، أو أمرٌ حركيٌّ («ارفع»، «اثنِ») **مع** جزءٍ من الجسم أو مصطلحٍ فنّيّ —
        // الأمر وحده، أو مع أداة الدرس وحدها، تعليمٌ تنظيميٌّ في الغالب («خلّوا الجلة على الأرض»)
        corr: lex(['لا لا', 'غلط', 'خطأ', 'خطا', 'مو كذا', 'مب كذا', 'مش كذا', 'مو جذي', 'مب جذي', 'ليس هكذا', 'مو هكذا', 'صحح', 'صححوا', 'الصح',
            'الصحيح', 'الطريقة الصحيحة', 'حاول مرة', 'حاول مرة ثانية', 'حاولوا', 'مرة ثانية', 'مرة أخرى', 'عيد', 'عيدها', 'أعد', 'أعيدوا', 'كرر',
            'كرروا', 'بدل ما', 'بدال ما']),
        move: lex(['ارفع', 'ارفعي', 'ارفعوا', 'انزل', 'نزل', 'اثن', 'اثني', 'اثنوا', 'افرد', 'افردوا', 'مد', 'مدوا', 'ثبت', 'ثبتوا', 'ركز', 'ركزوا',
            'ركزي', 'بقوة', 'أقوى', 'ببطء', 'لاحظ', 'لاحظوا', 'لازم', 'يجب', 'افتح', 'اقفل', 'ضم', 'ادفع', 'اسحب', 'ارتق',
            'اهبط', 'انظر', 'شوف', 'شوفوا', 'قرب', 'وسع', 'ضيق', 'أعلى', 'أوطى', 'تحت', 'فوق', 'مستقيم', 'مثني', 'ممدود']),
        tech: lex(['الركبة', 'الركبتين', 'ركبتك', 'ركبتيك', 'الذراع', 'الذراعين', 'ذراعك', 'ذراعيك', 'اليد', 'اليدين', 'إيدك', 'يدك', 'يديك', 'ايديك',
            'الرجل', 'الرجلين', 'رجلك', 'رجليك', 'القدم', 'القدمين', 'قدمك', 'قدميك', 'الجذع', 'جذعك', 'الظهر', 'ظهرك', 'الرأس', 'راسك', 'رأسك',
            'النظر', 'نظرك', 'الكتف', 'الكتفين', 'كتفك', 'المرفق', 'الكوع', 'الورك', 'الحوض', 'الأصابع', 'أصابعك', 'الكف', 'كفك', 'الرسغ', 'الجسم',
            'جسمك', 'وزن الجسم', 'مركز الثقل', 'التوازن', 'الارتكاز', 'الاقتراب', 'الارتقاء', 'الهبوط', 'الدفع', 'المتابعة', 'الزاوية', 'الخطوة',
            'الخطوات', 'المشط', 'باطن القدم', 'وجه القدم', 'خارج القدم', 'التمريرة', 'التمرير', 'الاستلام', 'التصويب', 'التنطيط', 'المحاورة',
            'الاستقبال', 'الإرسال', 'الضربة', 'الرمي', 'الوثب', 'الجري', 'العدو', 'البدء', 'الوقفة', 'وضع الاستعداد', 'الكرة', 'الإحماء'], true),
        q: lex(['لماذا', 'ليش', 'ليه', 'لمه', 'كيف', 'شلون', 'ماذا', 'إيش', 'ايش', 'وش', 'شو', 'متى', 'أين', 'وين', 'هل', 'من يعرف', 'مين يعرف',
            'منو يعرف', 'من يقدر', 'من يستطيع', 'من يقول', 'من يخبرني', 'ما هو', 'ما هي', 'ما الفرق', 'ما معنى', 'أيهما', 'أي واحد',
            'عندكم سؤال', 'في سؤال', 'كم مرة', 'كم عدد', 'فيه أحد']),
        qhi: lex(['لماذا', 'ليش', 'ليه', 'لمه', 'كيف', 'شلون', 'ما الفرق', 'وش الفرق', 'ماذا يحدث', 'ماذا لو', 'وش يصير', 'ايش يصير', 'شو يصير',
            'ما رأيك', 'ما رأيكم', 'برأيك', 'برأيكم', 'أيهما أفضل', 'ايش الأفضل', 'ما السبب', 'وش السبب', 'كيف نحسن', 'كيف نقدر', 'علل', 'فسر',
            'اقترح', 'اقترحوا', 'فكروا', 'فكر', 'توقعوا', 'ماذا تلاحظ', 'وش لاحظتوا', 'ايش لاحظتوا']),
        greet: lex(['كيف حالكم', 'كيف حالك', 'كيف الحال', 'شلونكم', 'شلونك', 'كيفكم', 'كيفك']),
        check: lex(['فهمتم', 'فهمتوا', 'فاهمين', 'فاهم', 'فهمت', 'واضح', 'واضحة', 'مفهوم', 'من يعيد', 'مين يعيد', 'منو يعيد', 'من يشرح', 'من يوضح',
            'من يجرب', 'من يطبق', 'وريني', 'ورني', 'أرني', 'أريني', 'وروني', 'من يعطيني', 'عيدوا علي', 'قل لي', 'قولوا لي', 'من يلخص', 'لخصوا']),
        safe: lex(['انتبه', 'انتبهوا', 'انتبهي', 'حاذر', 'احذر', 'احذروا', 'حذاري', 'خطر', 'خطير', 'بهدوء', 'على مهلك', 'على مهل', 'لا تدفع',
            'لا تدفعوا', 'لا تتدافعوا', 'التدافع', 'مسافة', 'المسافة', 'ابتعد', 'ابتعدوا', 'ابعد', 'ابعدوا', 'اربط', 'اربطوا', 'الرباط', 'الحذاء',
            'الجوتي', 'السلامة', 'سلامتك', 'سلامتكم', 'الأمان', 'آمن', 'تنصاب', 'تتعور', 'إصابة', 'الإصابة', 'الماء', 'اشرب', 'اشربوا', 'الإسعاف']),
        org: lex(['قف', 'قفوا', 'قوموا', 'صف', 'صفوا', 'اصطف', 'اصطفوا', 'طابور', 'الطابور', 'قاطرة', 'قاطرتين', 'قاطرات', 'ارجع', 'ارجعوا', 'تعال',
            'تعالوا', 'اجلس', 'اجلسوا', 'اقعدوا', 'اسمع', 'اسمعوا', 'اسمعوني', 'اسمعني', 'هدوء', 'انتباه', 'بسرعة', 'يلا', 'يالله', 'ابدأ',
            'ابدؤوا', 'ابدوا', 'توقف', 'توقفوا', 'وقفوا', 'استعد', 'استعدوا', 'جاهزين', 'مجموعات', 'كل مجموعة', 'كل واحد', 'واحد واحد', 'بالدور',
            'دورك', 'خلف', 'وراء', 'قدام', 'جنب', 'دائرة', 'انتشروا', 'مكانك', 'مكانكم', 'على الخط', 'رتبوا', 'وزعوا', 'جيبوا', 'رجعوا الأدوات']),
        values: lex(['تعاون', 'تعاونوا', 'التعاون', 'احترم', 'احترموا', 'الاحترام', 'زميلك', 'زملائك', 'زميلتك', 'زميلاتك', 'الروح الرياضية',
            'روح رياضية', 'اللعب النظيف', 'العدل', 'الفريق', 'فريقك', 'فريقكم', 'ساعد', 'ساعدوا', 'ساعده', 'شجع', 'شجعوا', 'صفقوا', 'شكرا', 'اعتذر',
            'سامح', 'الصبر', 'الأمانة', 'لا تغش', 'بدون غش', 'تقبل الخسارة', 'الفوز والخسارة']),
        health: lex(['صحة', 'صحتك', 'الصحة', 'القلب', 'النبض', 'نبضك', 'العضلات', 'العضلة', 'التنفس', 'تنفس', 'الغذاء', 'الأكل الصحي', 'السمنة',
            'اللياقة', 'لياقتك', 'التمدد', 'الإطالة']),
        harsh: lex(['غبي', 'غبية', 'أغبياء', 'حمار', 'حمارة', 'بقرة', 'ثور', 'كلب', 'كسلان', 'كسلانة', 'كسول', 'فاشل', 'فاشلة', 'فاشلين', 'ما تفهم',
            'ما تفهمون', 'ما تفهمين', 'ما تستحي', 'وقح', 'قليل أدب', 'اسكت', 'اسكتوا', 'انطم', 'انطموا', 'اخرس', 'انقلع', 'اطلع برا', 'اطلع بره',
            'تافه', 'سخيف', 'حيوان', 'بضربك', 'أضربك', 'ما منك فايدة', 'مالك فايدة'])
    };

    // كلمات عنوان الدرس المميِّزة («دفع الجلة بطريقة الزحف» ← دفع، جله، زحف)
    const STOP = new Set(['لعبه', 'مهاره', 'مهارات', 'الدرس', 'درس', 'في', 'من', 'الي', 'علي', 'عن', 'مع', 'طريقه', 'بطريقه', 'تدريبات', 'تطبيقات',
        'منافسات', 'عمليه', 'اختبار', 'العملي', 'قياس', 'الاداء', 'تنظيم', 'وادارة', 'اداره', 'مسابقات', 'للصغار', 'الصغار', 'ذكور', 'اناث']);
    function topicTerms(topic) {
        const out = [];
        norm(topic).split(' ').forEach(w => {
            const b = w.replace(/^(و|ف)?(ب|ل)?ال/, '');
            if (b.length >= 3 && !STOP.has(w) && !STOP.has(b) && !/^\d+$/.test(b) && !out.includes(b)) out.push(b);
        });
        return out;
    }

    // المقطع جملٌ: علامات الترقيم إن وُجدت، وإلّا قطعٌ من أربع عشرة كلمة (المحوِّل لا يرقّم العربيّة غالباً)
    function clauses(text) {
        const out = [];
        String(text || '').split(/[.!؟?،,؛;]+/).forEach(part => {
            const w = part.trim().split(/\s+/).filter(Boolean);
            for (let i = 0; i < w.length; i += 14) out.push(w.slice(i, i + 14).join(' '));
        });
        return out.filter(Boolean);
    }

    const partAt = (events, t) => {
        let k = null;
        (events || []).forEach(e => { if (e && e.t <= t) k = e.k; });
        return k;
    };
    const short = s => { s = String(s || '').trim(); return s.length > 90 ? s.slice(0, 88) + '…' : s; };

    // الحضور والزيّ (2026-10-27): ما قيل فيه («حاضر»، «وين الزيّ؟»، «ليش ما لبست الحذاء؟») ليس شرحاً ولا أسئلةً ولا تعليماتٍ للدرس —
    // يُعدّ وحده ولا يدخل الفئات (إلّا «ما يحتاج مراجعة»: يبقى للمشرف أينما قيل). spans: [[من، إلى)] من eye-core (summarize → admin.spans)
    const tOf = s => Math.max(0, Math.round(Number(Array.isArray(s) ? s[0] : s && s.t) || 0));
    const inSpans = (spans, t) => (spans || []).some(p => t >= p[0] && t < p[1]);
    function lessonSegs(segs, spans) {
        if (!spans || !spans.length) return segs || [];
        return (segs || []).filter(s => !inSpans(spans, tOf(s)));
    }

    // segs: [{t, x}] بزمن الحصة، opts: {topic, ctx: [{t, k}] عناصر الحصة, seconds, admin: [[من، إلى)] الحضور والزيّ}
    function analyze(segs, opts) {
        opts = opts || {};
        const adm = opts.admin || [];
        const admSec = adm.reduce((s, p) => s + Math.max(0, p[1] - p[0]), 0);
        const admin = { clauses: 0, words: 0 };
        const terms = topicTerms(opts.topic);
        const termRe = terms.length ? new RegExp('(?:^| )(?:و|ف)?(?:ب|ل|ك)?(?:ال)?(?:' + terms.map(escRe).join('|') + ')(?= |$)') : null;
        const cats = {};
        ['praise', 'corr', 'q', 'check', 'safe', 'org', 'values', 'health', 'harsh'].forEach(k => { cats[k] = { n: 0, ex: [] }; });
        cats.praise.spec = 0; cats.corr.spec = 0; cats.q.hi = 0; cats.q.hiEx = []; cats.praise.specEx = []; cats.corr.specEx = [];
        const parts = {};
        let words = 0, n = 0, first = null, last = null, topicN = 0;
        const add = (k, t, x, sub) => {
            const c = cats[k];
            c.n++;
            const arr = sub ? c[sub] : c.ex;
            if (arr.length < 4) arr.push([t, short(x)]);
        };
        (segs || []).forEach(seg => {
            if (!seg || !seg.x) return;
            const t = Math.max(0, Math.round(Number(seg.t) || 0));
            if (inSpans(adm, t)) {
                clauses(seg.x).forEach(cl => {
                    const s = norm(cl);
                    if (!s) return;
                    admin.clauses++; admin.words += s.split(' ').length;
                    if (L.harsh.test(s)) add('harsh', t, cl);
                });
                return;
            }
            if (first == null) first = t;
            last = t;
            const pk = partAt(opts.ctx, t);
            const P = pk ? (parts[pk] || (parts[pk] = { words: 0, praise: 0, corr: 0, q: 0, org: 0 })) : null;
            clauses(seg.x).forEach(cl => {
                const s = norm(cl);
                if (!s) return;
                const wc = s.split(' ').length;
                words += wc; n++;
                if (P) P.words += wc;
                const isTech = L.tech.test(s), isTopic = !!(termRe && termRe.test(s));
                if (isTopic) topicN++;
                const q = !L.greet.test(s) && (/[؟?]/.test(cl) || L.q.test(s));
                if (L.harsh.test(s)) add('harsh', t, cl);        // للمراجعة وحدها — ولا تُحسب تعزيزاً ولا تصحيحاً
                else {
                    if (L.praise.test(s)) {
                        add('praise', t, cl);
                        if (isTech || isTopic) { cats.praise.spec++; if (cats.praise.specEx.length < 3) cats.praise.specEx.push([t, short(cl)]); }
                        if (P) P.praise++;
                    }
                    const strong = L.corr.test(s), moveCue = L.move.test(s);
                    if (!q && (strong || (moveCue && isTech))) {
                        add('corr', t, cl);
                        if (isTech || isTopic) { cats.corr.spec++; if (cats.corr.specEx.length < 3) cats.corr.specEx.push([t, short(cl)]); }
                        if (P) P.corr++;
                    }
                }
                if (q) {
                    add('q', t, cl);
                    if (P) P.q++;
                    if (L.qhi.test(s)) { cats.q.hi++; if (cats.q.hiEx.length < 4) cats.q.hiEx.push([t, short(cl)]); }
                }
                if (L.check.test(s)) add('check', t, cl);
                if (L.safe.test(s)) add('safe', t, cl);
                if (L.org.test(s)) { add('org', t, cl); if (P) P.org++; }
                if (L.values.test(s)) add('values', t, cl);
                if (L.health.test(s)) add('health', t, cl);
            });
        });
        const span = first == null ? 0 : Math.max(0, last - first);
        const lesson = Math.max((opts.seconds || 0) - admSec, span);
        return Object.assign({
            v: 1, segs: (segs || []).length, clauses: n, words, span, lesson,
            wpm: lesson >= 60 ? Math.round(words / (lesson / 60)) : null,
            orgShare: n ? Math.round(100 * cats.org.n / n) : 0,
            topic: { terms, n: topicN },
            parts, admin
        }, cats);
    }

    // نصٌّ مختصرٌ للأرقام (البطاقة والملخّص)
    function line(A) {
        if (!A || !A.clauses) return '';
        const bits = ['تعزيز ' + A.praise.n + (A.praise.spec ? ' (محدّد ' + A.praise.spec + ')' : ''),
            'تصحيح ' + A.corr.n + (A.corr.spec ? ' (بالمهارة ' + A.corr.spec + ')' : ''),
            'أسئلة ' + A.q.n + (A.q.hi ? ' (للتفكير ' + A.q.hi + ')' : ''),
            'تحقّق من الفهم ' + A.check.n];
        if (A.safe.n) bits.push('تذكير بالسلامة ' + A.safe.n);
        return bits.join(' · ');(function(root) {
  'use strict';

  const DIALECT_LANGS = ['ar-OM', 'ar-AE', 'ar-SA', 'ar-KW', 'ar'];

  function selectBestAlternative(alternatives) {
    if (!alternatives || !alternatives.length) return '';
    if (typeof alternatives === 'string') return alternatives;
    let best = alternatives[0];
    let maxScore = -1;
    for (let i = 0; i < alternatives.length; i++) {
      const alt = alternatives[i];
      const transcript = typeof alt === 'string' ? alt : (alt.transcript || '');
      const confidence = typeof alt === 'object' && alt.confidence !== undefined ? alt.confidence : 1.0;
      const score = transcript.length * (confidence || 0.5);
      if (score > maxScore) {
        maxScore = score;
        best = transcript;
      }
    }
    return typeof best === 'string' ? best : (best.transcript || '');
  }

  const PHONETIC_CORRECTIONS = [
    [/\bمربع\s+ناقص\s+(طلع|ضلاع|أضلاع)\b/g, 'مربع ناقص ضلع'],
    [/\b(قطارات|فاطرات)\b/g, 'قاطرات'],
    [/\bجدام\b/g, 'قدام'],
    [/\bوجف\b/g, 'وقف'],
    [/\bريولكم\b/g, 'ارجلكم'],
    [/\bسبرنت\b/g, 'عدو سريع'],
    [/\b(أحسنتم|ممتازين|بارك\s+الله\s+فيكم|عشتوا|كفو)\b/g, 'ممتاز'],
    [/\b(أنتبه|ركز معي|شوف هنا)\b/g, 'انتبه']
  ];

  function phoneticSkeleton(s) {
    if (!s) return '';
    return s
      .replace(/[ًٌٍَُِّْ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/گ|ڤ|چ/g, function(c) {
        if (c === 'گ') return 'ك';
        if (c === 'ڤ') return 'ف';
        if (c === 'چ') return 'ج';
        return c;
      })
      .replace(/ذ|ظ/g, 'ض')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function editDistance(a, b) {
    if (!a) return b ? b.length : 0;
    if (!b) return a.length;
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function norm(s) {
    if (!s) return '';
    let res = String(s).toLowerCase();
    res = res.replace(/[ًٌٍَُِّْ]/g, '');
    res = res.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    PHONETIC_CORRECTIONS.forEach(function(pair) {
      res = res.replace(pair[0], pair[1]);
    });
    return res.trim();
  }

  const L = {
    praise: ['ممتاز', 'احسنت', 'بارك الله فيك', 'رائع', 'بطل', 'كفو', 'عشتوا', 'مبدع', 'اجابة صحيحة', 'احسنتم'],
    corr: ['خطأ', 'حاول مرة أخرى', 'انتبه', 'ركز', 'اعد المحاولة', 'تصحيح', 'ليس كذلك', 'راجع نفسك'],
    move: ['مربع ناقص ضلع', 'دائرة', 'قاطرات', 'صفوف', 'انتشار', 'انتقال', 'تحرك', 'جري', 'عدو سريع', 'دوران', 'خطوة'],
    stationary: ['وقف', 'ثبات', 'مكانك', 'جلوس', 'استعداد', 'انتباه', 'هدوء', 'استراحة'],
    org: ['مجموعة', 'فريق', 'ثنائي', 'فردي', 'قاطرة', 'صف', 'حلقة', 'دائرة', 'محطة'],
    q: ['ماذا', 'كيف', 'لماذا', 'من', 'متى', 'أين', 'كم', 'هل', 'علل', 'اذكر'],
    qhi: ['ما الفرق', 'كيف تستنتج', 'علل ذلك', 'ما التحليل', 'قارن بين', 'ما النتيجة'],
    check: ['هل فهمتم', 'واضح', 'جاهزين', 'معي', 'تمام', 'أليس كذلك', 'مفهوم'],
    safe: ['احذر', 'انتبه', 'سلامة', 'مسافة', 'حذر', 'رويدكم', 'تأكد من الملعب', 'خطورة']
  };

  function detectVoiceFormations(text) {
    const t = norm(text);
    const result = [];
    if (/مربع\s+ناقص\s+ضلع/.test(t)) result.push('مربع ناقص ضلع');
    if (/دائره|دائرة/.test(t)) result.push('دائرة');
    if (/قاطرات|قاطره|قاطرة/.test(t)) result.push('قاطرات');
    if (/صفوف|صف/.test(t)) result.push('صفوف');
    return result;
  }

  function detectMovementCommand(text) {
    const t = norm(text);
    const moves = [...L.move, 'تحركوا', 'امشوا', 'ركض', 'عدو'];
    for (let m of moves) {
      if (t.includes(norm(m))) return true;
    }
    return false;
  }

  function detectLessonElements(text) {
    const t = norm(text);
    const elements = [];
    if (/تهيئة|احماء|إحماء/.test(t)) elements.push('الإحماء والتهيئة');
    if (/شرح|توضيح|عرض/.test(t)) elements.push('الشرح والتوضيح');
    if (/تطبيق|نشاط|تمرين|تدريب/.test(t)) elements.push('التطبيق العملي');
    if (/تقويم|ختام|انهاء|إنهاء/.test(t)) elements.push('الختام والتقويم');
    return elements;
  }

  function extractLessonTitle(text) {
    if (!text) return '';
    const t = norm(text);
    const match = t.match(/(?:درس اليوم|موضوع اليوم|عنوان الدرس|درسنا اليوم|عنواننا)\s*(?:هو|عن)?\s*([^.،,\n]+)/);
    return match ? match[1].trim() : '';
  }

  let micAudioCtx = null;
  let micAnalyser = null;
  let micTimer = null;
  let micCallback = null;

  function notifyMicStopped(onStopCb) {
    micCallback = onStopCb;
    if (micTimer) clearTimeout(micTimer);
    
    micTimer = setTimeout(function() {
      if (typeof micCallback === 'function') {
        micCallback({ silent: true, duration: 8 });
      }
    }, 8000);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !micAudioCtx) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
          micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          micAnalyser = micAudioCtx.createAnalyser();
          const source = micAudioCtx.createMediaStreamSource(stream);
          source.connect(micAnalyser);
          micAnalyser.fftSize = 256;
          const bufferLength = micAnalyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          function checkVolume() {
            if (!micAnalyser) return;
            micAnalyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
            const avg = sum / bufferLength;
            if (avg > 10) {
              if (micTimer) clearTimeout(micTimer);
              micTimer = setTimeout(function() {
                if (typeof micCallback === 'function') {
                  micCallback({ silent: true, duration: 8 });
                }
              }, 8000);
            }
            requestAnimationFrame(checkVolume);
          }
          checkVolume();
        }).catch(function(e) {
          console.warn('Mic audio monitor error:', e);
        });
      }
    } catch(e) {
      console.warn('AudioContext monitor not supported:', e);
    }
  }

  function notifyPhaseTransition(currentPhase, nextPhase) {
    const event = new CustomEvent('svfPhaseTransition', {
      detail: { currentPhase, nextPhase, timestamp: Date.now() }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(event);
    }
    return { currentPhase, nextPhase };
  }

  function clauses(text) {
    if (!text) return [];
    return text.split(/[.،,!\?\n]+/).map(s => s.trim()).filter(Boolean);
  }

  function topicTerms(text) {
    if (!text) return [];
    return clauses(text).filter(c => c.length > 3);
  }

  function lessonSegs(text) {
    if (!text) return [];
    return clauses(text);
  }

  function analyze(text, opts) {
    opts = opts || {};
    const nText = norm(text || '');
    const clList = clauses(nText);
    const words = nText.split(/\s+/).filter(Boolean);
    const span = opts.seconds || 0;
    const lesson = Math.max(span, 60);

    const counts = {
      praise: 0, corr: 0, move: 0, stationary: 0,
      org: 0, q: 0, qhi: 0, check: 0, safe: 0
    };

    words.forEach(w => {
      Object.keys(L).forEach(k => {
        if (L[k].some(item => norm(item) === w)) {
          counts[k]++;
        }
      });
    });

    return Object.assign({
      v: 1,
      segs: clList,
      clauses: clList.length,
      words: words.length,
      span: span,
      lesson: lesson,
      wpm: lesson >= 60 ? Math.round(words.length / (lesson / 60)) : null,
      orgShare: clList.length ? Math.round((100 * counts.org) / clList.length) : 0,
      topic: { terms: topicTerms(nText), n: topicTerms(nText).length },
      parts: counts,
      admin: 0
    }, counts);
  }

  function line(A) {
    if (!A || !A.clauses) return '';
    const bits = ['ثناء ' + (A.praise || 0), 'تصحيح ' + (A.corr || 0), 'أسئلة ' + (A.q || 0)];
    return bits.join(' • ');
  }

  function stripExamples(A) {
    if (!A) return A;
    const B = JSON.parse(JSON.stringify(A));
    ['praise', 'corr', 'q', 'check', 'safe', 'org'].forEach(k => {
      if (B[k] && typeof B[k] === 'object') B[k].spec = [];
    });
    return B;
  }

  const api = {
    DIALECT_LANGS,
    maxAlternatives: 5,
    selectBestAlternative,
    norm,
    phoneticSkeleton,
    editDistance,
    PHONETIC_CORRECTIONS,
    LEX: L,
    detectVoiceFormations,
    detectMovementCommand,
    detectLessonElements,
    extractLessonTitle,
    notifyMicStopped,
    notifyPhaseTransition,
    analyze,
    clauses,
    topicTerms,
    line,
    stripExamples,
    lessonSegs
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SvfEyeSpeech = api;
})(typeof window !== 'undefined' ? window : this);
    }

    // يُفرَّغ النصّ ويبقى العدد — حين يطلب المشرف حذف النصّ بعد التحليل
    function stripExamples(A) {
        if (!A) return A;
        const B = JSON.parse(JSON.stringify(A));
        ['praise', 'corr', 'q', 'check', 'safe', 'org', 'values', 'health', 'harsh'].forEach(k => { if (B[k]) B[k].ex = []; });
        if (B.q) B.q.hiEx = [];
        if (B.praise) B.praise.specEx = [];
        if (B.corr) B.corr.specEx = [];
        return B;
    }

    const api = { norm, analyze, clauses, topicTerms, line, stripExamples, lessonSegs, LEX: L };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfEyeSpeech = api;
})(typeof window !== 'undefined' ? window : this);
