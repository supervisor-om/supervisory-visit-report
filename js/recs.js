// =========================================================================
// منشئ التوصيات في الزيارة المدرسية
//
// التوصية تُسجَّل **وحدةً لها حقول** (الجهة، الموضوع، الأصناف، المدة) ويُولَّد
// منها النصّ — لا نصّاً حرّاً وحده. فيُعرف ما أُوصي به فيُتابَع ويُقترح لاحقاً.
// وحقل «التوصيات» يبقى نصّاً كما هو: البوّابة والمعاينة والتقرير الشهري
// والمتابعة السابقة لا يتغيّر فيها شيء.
//
//   ١) بنك توصياتٍ مصنَّف، منه منتقي الأدوات بأعدادها
//   ٢) المدّة بضغطة، ومنها يُحسب تاريخ الاستحقاق
//   ٣) الجهة تضبط الصياغة، وجنسُ المعلّم من طاقم المدرسة المسجَّل
//   ٤) ما لم يُنفَّذ من الزيارة السابقة يُقترح «تأكيداً» أو «استكمالاً»
// =========================================================================
(function (global) {
    'use strict';

    // أدوات الرياضة المدرسية — تُزاد من الواجهة وتُحفظ في المتصفّح
    const EQUIPMENT = [
        'جهاز الوثب العالي مع المرتبة الخاصة به', 'الصندوق المقسم', 'المقعد السويدي',
        'مرمى لكرة اليد', 'قوائم للسلة', 'شبك لكرة الطائرة', 'شبك لكرة القدم',
        'كرات قدم', 'كرات سلة', 'كرات طائرة', 'كرات يد', 'كرات تنس',
        'أقماع', 'حواجز', 'أطواق', 'حبال', 'مرتبات إسفنجية', 'أثقال خفيفة',
        'ميزان وشريط قياس', 'صافرات', 'ساعة إيقاف', 'صندوق إسعافات أولية'
    ];

    const AUDIENCES = ['إدارة المدرسة', 'المعلم', 'المعلمة', 'المعلمين', 'المعلمات'];
    const PRONOUN = { 'المعلم': 'لديه', 'المعلمة': 'لديها', 'المعلمين': 'لديهم', 'المعلمات': 'لديهن',
                      'إدارة المدرسة': 'لديها' };

    const DEADLINES = [
        { id: '', label: 'بلا مدّة', text: '', days: 0 },
        { id: 'week', label: 'أسبوع', text: 'خلال أسبوع', days: 7 },
        { id: 'twoWeeks', label: 'أسبوعان عمل', text: 'خلال أسبوعين عمل', days: 14 },
        { id: 'month', label: 'شهر', text: 'خلال شهر', days: 30 },
        { id: 'term', label: 'نهاية الفصل', text: 'قبل نهاية الفصل الدراسي', days: 0 },
        { id: 'nextVisit', label: 'الزيارة القادمة', text: 'قبل الزيارة القادمة', days: 0 }
    ];
    const deadlineOf = id => DEADLINES.find(d => d.id === (id || '')) || DEADLINES[0];

    const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const withDeadline = (s, id) => { const d = deadlineOf(id).text; return d ? `${s} ${d}` : s; };
    const dot = s => (/[.؟!]$/.test(s) ? s : s + '.');

    // ── القوالب ──
    // build(rec) تُرجع نصّ البند بلا الشرطة ولا النقطة.
    const CATEGORIES = [
        {
            id: 'equipment', label: 'الأدوات الرياضية', audience: 'إدارة المدرسة', picker: 'equipment',
            build: r => {
                const items = (r.items || []).filter(i => clean(i.name))
                    .map(i => clean(i.name) + (Number(i.count) > 1 ? ` عدد (${Number(i.count)})` : ''));
                let s = 'توفير الأدوات الرياضية';
                if (r.perList !== false) s += ' حسب الكشف المرفق';
                if (items.length) s += ` ونخص بالذكر ( ${items.join('، ')} )`;
                if (r.extra !== false && items.length) s += ' بالإضافة لباقي الأدوات في الكشف';
                if (r.playground) s += '، وتجديد تخطيط الملعب';
                return withDeadline(s, r.deadline);
            }
        },
        {
            id: 'playground', label: 'الملاعب والتخطيط', audience: 'إدارة المدرسة',
            options: [
                { id: 'repaint', label: 'تجديد تخطيط الملعب', text: 'تجديد تخطيط الملعب' },
                { id: 'safety', label: 'تأمين الملعب وصيانته', text: 'تأمين الملعب وصيانة الأجهزة الرياضية' },
                { id: 'store', label: 'مكان لحفظ الأدوات', text: 'تخصيص مكان مناسب لحفظ الأدوات الرياضية' }
            ],
            build: r => withDeadline(joinOptions('playground', r.options), r.deadline)
        },
        {
            id: 'schedule', label: 'جدول الحصص', audience: 'المعلمة', needsWho: true,
            options: [
                { id: 'daily', label: 'حصة رياضة كل يوم', text: w => `ليكون ${PRONOUN[w] || 'لديه'} حصة رياضة كل يوم` },
                { id: 'avoidLate', label: 'تجنّب الحصة السابعة والثامنة', text: 'وتوزيع الحصص بحيث يتم الابتعاد عن الحصة السابعة والثامنة' },
                { id: 'noStack', label: 'عدم تجميع الحصص في يوم', text: 'وعدم تجميع الحصص في يوم واحد' },
                { id: 'fair', label: 'توزيع النصاب بالعدل', text: 'وتوزيع النصاب بالعدل بين معلمي المادة' }
            ],
            build: r => {
                const who = r.who || 'المعلمة';
                const cat = CATEGORIES.find(c => c.id === 'schedule');
                const parts = (r.options || []).map(id => {
                    const o = cat.options.find(x => x.id === id);
                    return o ? (typeof o.text === 'function' ? o.text(who) : o.text) : '';
                }).filter(Boolean);
                const body = parts.join('، ').replace(/، و/g, '، و');
                return withDeadline(`تغيير جدول ${who} ${body}`.replace(/\s+/g, ' '), r.deadline);
            }
        },
        {
            id: 'records', label: 'السجلات والتحضير', audience: 'المعلمة', needsWho: true,
            options: [
                { id: 'nour', label: 'التحضير في منصة نور', text: 'إتمام تحضير الدروس في منصة نور أولاً بأول' },
                { id: 'follow', label: 'سجلات المتابعة', text: 'استكمال سجلات المتابعة (الزي والمشاركة والتحضير)' },
                { id: 'plan', label: 'خطة المنهاج', text: 'تنفيذ خطة المنهاج وتوثيقها' },
                { id: 'tests', label: 'درجات القياسات', text: 'استكمال درجات قياسات الأداء العملي في مواعيدها' }
            ],
            build: r => withDeadline(joinOptions('records', r.options), r.deadline)
        },
        {
            id: 'activity', label: 'النشاط والفرق', audience: 'إدارة المدرسة',
            options: [
                { id: 'internal', label: 'تفعيل النشاط الداخلي', text: 'تفعيل النشاط الرياضي الداخلي' },
                { id: 'teams', label: 'تشكيل الفرق المدرسية', text: 'تشكيل الفرق المدرسية وتدريبها' },
                { id: 'events', label: 'المشاركة في المسابقات', text: 'المشاركة في المسابقات على مستوى المحافظة' }
            ],
            build: r => withDeadline(joinOptions('activity', r.options), r.deadline)
        },
        {
            id: 'guides', label: 'الأدلة والكتب', audience: 'إدارة المدرسة',
            options: [
                { id: 'receive', label: 'استلام الأدلة وكتاب الطالب', text: 'استلام أدلة المعلم وكتاب الطالب والتأكد من طبعاتها الحديثة' },
                { id: 'circulars', label: 'متابعة النشرات', text: 'متابعة النشرات والوثائق ومناقشتها مع معلمي المادة' }
            ],
            build: r => withDeadline(joinOptions('guides', r.options), r.deadline)
        },
        { id: 'free', label: 'توصية حرة', audience: 'إدارة المدرسة',
          build: r => withDeadline(clean(r.text), r.deadline) }
    ];

    function joinOptions(catId, ids) {
        const cat = CATEGORIES.find(c => c.id === catId);
        const parts = (ids || []).map(id => {
            const o = (cat.options || []).find(x => x.id === id);
            return o ? (typeof o.text === 'function' ? o.text() : o.text) : '';
        }).filter(Boolean);
        return parts.length > 1 ? parts.slice(0, -1).join('، ') + '، و' + parts[parts.length - 1] : (parts[0] || '');
    }

    const categoryOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
    function recText(rec) {
        if (clean(rec.text) && rec.category !== 'free' && rec.manual) return clean(rec.text);
        return clean(categoryOf(rec.category).build(rec));
    }

    // ── النصّ النهائي: مقدّمةٌ وبنودٌ وخاتمة ──
    const CLOSING = 'والله الموفق.';
    function buildText(list, opts) {
        const o = opts || {};
        const items = (list || []).map(recText).filter(Boolean);
        if (!items.length) return '';
        const intro = `نوصي ${o.audience || 'إدارة المدرسة'} بالآتي:`;
        return [intro, ...items.map(t => '- ' + dot(t)), CLOSING].join('\n');
    }

    // تاريخ الاستحقاق للمتابعة — المدد بلا أيّامٍ محدّدة لا تاريخ لها
    function dueDate(rec, visitDate) {
        const d = deadlineOf(rec.deadline);
        if (!d.days || !visitDate) return '';
        const t = new Date(visitDate + 'T00:00:00Z');
        if (isNaN(t)) return '';
        t.setUTCDate(t.getUTCDate() + d.days);
        return t.toISOString().slice(0, 10);
    }

    // ── المتابعة: ما لم يُنفَّذ يعود توصيةً ──
    // «توفير الأدوات…» ← «التأكيد على توفير الأدوات…» أو «استكمال…» للمنفَّذ جزئياً.
    function carryOver(prev) {
        return (prev || []).filter(p => p.status === 'not-done' || p.status === 'partial').map(p => ({
            category: 'free', manual: true,
            text: (p.status === 'partial' ? 'استكمال ' : 'التأكيد على ') + clean(p.text).replace(/\.$/, ''),
            from: p.date || ''
        }));
    }

    // ── الاقتراح من بيانات الزيارة ──
    function suggest(ctx) {
        const out = [];
        const notes = (ctx && ctx.notedObjectives) || [];
        const has = re => notes.some(t => re.test(t));
        if (has(/أدوات|الأدوات/)) out.push({ category: 'equipment', why: 'هدفٌ عليه ملاحظة يخصّ الأدوات الرياضية' });
        if (has(/ملاعب|تخطيط/)) out.push({ category: 'playground', why: 'هدفٌ عليه ملاحظة يخصّ الملاعب' });
        if (has(/نور|تحضير|سجلات/)) out.push({ category: 'records', why: 'هدفٌ عليه ملاحظة يخصّ السجلات والتحضير' });
        if (has(/أدلة|كتاب الطالب|نشرات/)) out.push({ category: 'guides', why: 'هدفٌ عليه ملاحظة يخصّ الأدلة والنشرات' });
        if (has(/نشاط|فرق/)) out.push({ category: 'activity', why: 'هدفٌ عليه ملاحظة يخصّ النشاط الداخلي' });

        // نصابٌ مرتفعٌ أو صفوفٌ كثيرة لمعلّمٍ واحد ← الجدول
        const roster = (ctx && ctx.roster) || [];
        const heavy = roster.find(t => Number(String(t.load).replace(/\D/g, '')) >= 20);
        if (heavy) out.push({ category: 'schedule', who: heavy.gender === 'f' ? 'المعلمة' : 'المعلم',
                              why: `نصاب ${heavy.name} ${clean(heavy.load)} حصة` });
        if ((ctx && ctx.classroomVisits || []).length)
            out.push({ category: 'free', text: 'متابعة تنفيذ ما اتُّفق عليه في المداولة الإشرافية',
                       manual: true, why: 'سُجّلت زيارة صفّية في هذه الزيارة' });

        const seen = new Set();
        return out.filter(s => { const k = s.category + (s.text || ''); if (seen.has(k)) return false; seen.add(k); return true; });
    }

    // جهة الخطاب من طاقم المدرسة: معلّمةٌ واحدة ← «المعلمة»، ومعلّمتان ← «المعلمات»
    function audienceFromRoster(roster) {
        const r = (roster || []).filter(t => t && t.name);
        if (!r.length) return 'المعلمة';
        const females = r.filter(t => t.gender === 'f').length;
        if (r.length === 1) return females ? 'المعلمة' : 'المعلم';
        return females === r.length ? 'المعلمات' : 'المعلمين';
    }

    const api = { EQUIPMENT, AUDIENCES, DEADLINES, CATEGORIES, CLOSING,
                  buildText, recText, dueDate, carryOver, suggest, audienceFromRoster,
                  categoryOf, deadlineOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.SchoolRecs = api;
})(typeof window !== 'undefined' ? window : globalThis);
