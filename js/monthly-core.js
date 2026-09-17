// =========================================================================
// التقرير الشهري — القواعد (بلا واجهة، تُختبر في Node)
//
// تبني صفوف التقرير من أربعة مصادر، كلّها قراءةٌ فقط:
//   • الخطة الشهرية المعتمدة  ← خطة السير (plan.supervisor-mct.com): d_<اليوم>،
//     والفعاليات الإلزاميّة (إجازات…) تتقدّم عليها كما في موقع الخطة نفسه
//   • الخطة المنفذة فعلياً    ← تقارير الزيارات المدرسيّة بتاريخ اليوم
//   • ✓ الزيارة المدرسيّة     ← ما أكّد السكربت حفظه في البوّابة (svf_sent_school_visits)
//   • الزيارات الإشرافيّة     ← تقارير الزيارات الإشرافيّة بتاريخ اليوم؛
//     وما لم يؤكَّد حفظه في البوّابة (svf_sent_visits) يُكتب «(مرفق)» ويُرفق ملفّه
//
// كلّ ما تستنتجه القواعد يُعرض للمراجعة ويُعدَّل قبل الإخراج (overrides).
// =========================================================================
(function (global) {
    'use strict';

    // أسماء الأيّام والشهور كما في تقارير المشرف (يونيو 2026)
    const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
    const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو',
                         'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];

    const DASH = '-';
    const OFFICE = 'مكتب';
    const METHOD_CLASSROOM = 'الحوار والمناقشة / زيارات صفية والمداولة';
    const METHOD_SCHOOL = 'الحوار والمناقشة';

    const pad2 = n => String(n).padStart(2, '0');
    const trim = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

    // أيّام الدوام: الأحد–الخميس، كما يعدّها موقع الخطة (getWorkingDaysInMonth)
    function workingDays(year, month0) {
        const out = [];
        const d = new Date(Date.UTC(year, month0, 1));
        while (d.getUTCMonth() === month0) {
            const w = d.getUTCDay();
            if (w <= 4) out.push({ day: d.getUTCDate(), weekday: w });
            d.setUTCDate(d.getUTCDate() + 1);
        }
        return out;
    }

    const isoDate = (y, m0, d) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
    // صيغة مفاتيح التأكيد في الموقع: «الاسم|dd/mm/yyyy»
    const portalDate = (y, m0, d) => `${pad2(d)}/${pad2(m0 + 1)}/${y}`;

    // «إجازة …» يوماً لا دوام فيه: لا يُعدّ في الخطة ولا في المنفّذ
    const isOff = t => /^[اإ]جاز[ةه]/.test(trim(t));

    // اسمٌ مختصر كما يُكتب في التقرير: بلا «مدرسة» ولا نطاق صفوف ولا «للتعليم
    // الأساسي»، والخاصّة تُعلَّم «(خ)». يُراجَع ويُعدَّل قبل الإخراج.
    function shortSchool(name, isPrivate) {
        let s = trim(name).replace(/ـ/g, '');
        s = s.replace(/^مدرس[ةه]\s+/, '');
        s = s.replace(/\(?\s*(?:من\s*)?\d{1,2}\s*[-–—_/]\s*\d{1,2}\s*\)?/g, ' ');
        s = s.replace(/(^|\s)للتعليم\s+(?:ما\s*بعد\s+)?ال[اأ]ساسي[ةه]?(?=\s|$)/g, ' ');
        const priv = !!isPrivate || /(^|\s)(ال)?خاص[ةه](?=\s|$)/.test(s);
        s = s.replace(/(^|\s)(ال)?خاص[ةه](?=\s|$)/g, ' ').replace(/\s*\(\s*خ\s*\)\s*/g, ' ');
        s = trim(s);
        return priv ? s + ' (خ)' : s;
    }

    // الاسم الأوّل للمعلّم: «أ. دينا» من «دينا اشرف حبيب»
    function firstName(teacher) {
        const words = trim(teacher).replace(/^(?:أ\.|ا\.|الأستاذ[ةه]?|الاستاذ[ةه]?)\s*/, '').split(' ');
        return words[0] || '';
    }

    const PRIVATE_TYPES = /private|خاص/i;

    /**
     * @param input {
     *   year, month0,
     *   plan:   { d_1: 'مشاعل مسقط', … },
     *   events: { '2026_5_18': 'إجازة رأس السنة الهجرية', … },
     *   schoolReports: [{ key, schoolName, visitDate, visitType, classroomVisits }],
     *   supReports:    [{ key, teacherName, visitDate, school, formData }],
     *   sentSchool: Set('المدرسة|dd/mm/yyyy'), sentSup: Set('المعلّم|dd/mm/yyyy'),
     *   overrides: { <day>: { planned, executed, marks, supervisory, methods, followE, followA } }
     * }
     */
    function buildRows(input) {
        const { year, month0 } = input;
        const plan = input.plan || {}, events = input.events || {};
        const sentSchool = input.sentSchool || new Set(), sentSup = input.sentSup || new Set();
        const overrides = input.overrides || {};

        return workingDays(year, month0).map(({ day, weekday }) => {
            const iso = isoDate(year, month0, day), pd = portalDate(year, month0, day);
            const warnings = [];

            const event = trim(events[`${year}_${month0}_${day}`]);
            const planned = event || trim(plan['d_' + day]) || OFFICE;

            // الزيارات المدرسيّة: مدرسةٌ واحدةٌ مرّةً واحدة في اليوم
            const seen = new Set();
            const visits = (input.schoolReports || [])
                .filter(r => r && r.visitDate === iso && trim(r.schoolName))
                .filter(r => { const k = trim(r.schoolName); if (seen.has(k)) return false; seen.add(k); return true; })
                .map(r => ({
                    key: r.key, name: trim(r.schoolName),
                    short: shortSchool(r.schoolName, PRIVATE_TYPES.test(r.visitType || '')),
                    sent: sentSchool.has(trim(r.schoolName) + '|' + pd),
                    classroom: Array.isArray(r.classroomVisits) && r.classroomVisits.length > 0
                }));
            visits.filter(v => !v.sent).forEach(v =>
                warnings.push(`زيارة «${v.name}» محفوظة ولم يُؤكَّد حفظها في البوابة — لا ✓ لها`));

            // الزيارات الإشرافيّة: معلّمٌ واحدٌ بعدد زياراته
            const byTeacher = new Map();
            for (const r of (input.supReports || [])) {
                if (!r || r.visitDate !== iso || !trim(r.teacherName)) continue;
                const t = trim(r.teacherName);
                const g = byTeacher.get(t) || { teacher: t, count: 0, keys: [], sent: false };
                g.count++; g.keys.push(r.key);
                if (sentSup.has(t + '|' + pd)) g.sent = true;
                byTeacher.set(t, g);
            }
            const sup = [...byTeacher.values()].map(g => ({ ...g, first: firstName(g.teacher), attached: !g.sent }));

            let executed = visits.length ? visits.map(v => v.short).join(' + ')
                         : isOff(planned) ? planned : OFFICE;
            if (!visits.length && !isOff(planned) && planned !== OFFICE)
                warnings.push(`الخطة «${planned}» ولا تقرير زيارةٍ مدرسيّةٍ بهذا التاريخ`);

            const row = {
                day, weekday, iso,
                date: `${day}/${month0 + 1}`,
                dayName: DAY_NAMES[weekday],
                planned,
                executed,
                marks: visits.filter(v => v.sent).length,
                supParts: sup,
                supervisory: sup.length ? sup.map(p => `(${p.count}) أ. ${p.first}${p.attached ? ' (مرفق)' : ''}`).join(' + ') : DASH,
                methods: sup.length ? METHOD_CLASSROOM : visits.length ? METHOD_SCHOOL : DASH,
                followE: DASH,
                followA: DASH,
                visits,
                warnings,
                edited: []
            };

            // تعديلات المراجعة تغلب ما استُنتج
            const o = overrides[day] || {};
            for (const f of ['planned', 'executed', 'supervisory', 'methods', 'followE', 'followA']) {
                if (typeof o[f] === 'string') { row[f] = o[f]; row.edited.push(f); }
            }
            if (o.marks != null && o.marks !== '') { row.marks = Math.max(0, parseInt(o.marks, 10) || 0); row.edited.push('marks'); }
            return row;
        });
    }

    // «(1) أ. دينا (مرفق) + (2) أ. علي» ← عدّ ما في البوّابة وما أُرفق، ولو عُدِّل النصّ باليد
    function countSupervisory(text) {
        let portal = 0, attached = 0;
        for (const part of String(text || '').split('+')) {
            const m = part.match(/\((\d+)\)/);
            if (!m) continue;
            if (/مرفق/.test(part)) attached += +m[1]; else portal += +m[1];
        }
        return { portal, attached, total: portal + attached };
    }

    function totals(rows, reasonsOverride) {
        const planned = rows.filter(r => !isOff(r.planned)).length;
        const executed = rows.filter(r => !isOff(r.executed)).length;
        const schools = rows.reduce((a, r) => a + (r.marks || 0), 0);
        const s = rows.reduce((a, r) => { const c = countSupervisory(r.supervisory); a.portal += c.portal; a.attached += c.attached; return a; },
                              { portal: 0, attached: 0 });
        const total = s.portal + s.attached;
        const supText = !total ? DASH
            : s.attached && s.portal ? `${s.portal}+(${s.attached}) مرفق = ${total}`
            : s.attached ? `(${s.attached}) مرفق = ${total}`
            : String(total);
        const rate = planned ? Math.round(executed / planned * 100) : 0;

        // الأسباب: أيّام إجازةٍ لم تكن في الخطة («إجازة مرضية (1)»)
        const off = new Map();
        rows.filter(r => isOff(r.executed) && !isOff(r.planned))
            .forEach(r => off.set(trim(r.executed), (off.get(trim(r.executed)) || 0) + 1));
        const autoReasons = [...off.entries()].map(([t, n]) => `${t} (${n})`).join('، ');
        const reasons = typeof reasonsOverride === 'string' ? reasonsOverride : autoReasons;

        return { planned, executed, schools, supPortal: s.portal, supAttached: s.attached, supTotal: total,
                 supText, rate, reasons, autoReasons };
    }

    // الصفحة الأولى بسعة جدولها في النموذج، والباقي في الثانية
    function paginate(rows, firstCapacity) {
        const n = Math.max(0, firstCapacity | 0);
        return [rows.slice(0, n), rows.slice(n)];
    }

    // الزيارات الإشرافيّة المرفقة: ملفٌّ لكلّ تقرير، مرقّمةً بترتيب التاريخ
    function attachments(rows, supReports) {
        const byKey = new Map((supReports || []).map(r => [r.key, r]));
        const out = [];
        for (const r of rows) for (const p of r.supParts || []) {
            if (!p.attached) continue;
            for (const k of p.keys) { const rep = byKey.get(k); if (rep) out.push(rep); }
        }
        return out.map((rep, i) => ({
            report: rep,
            fileName: safeFileName(`${i + 1} - ${trim(rep.school) || 'مدرسة'} - ${trim(rep.teacherName)}.docx`)
        }));
    }

    const safeFileName = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

    const api = {
        DAY_NAMES, MONTH_NAMES, OFFICE, DASH, METHOD_CLASSROOM, METHOD_SCHOOL,
        workingDays, isoDate, portalDate, isOff, shortSchool, firstName,
        buildRows, countSupervisory, totals, paginate, attachments, safeFileName
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.MonthlyCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
