// =========================================================================
// لوحة المتابعة وملفّ المعلّم — المحرّك (منذ 2026-10-26)
//
// طلب المشرف: «رسوم بيانيّة احترافيّة تسهّل المتابعة والتحليل». الرسوم القديمة كانت دائرةً لكلّ الدرجات (لا تقول أيّ بندٍ
// ضعيف)، وخطّ «متوسّط الأداء» يخلط معلّمين مختلفين (صعوده يعني من زرت لا من تحسّن)، و١٣ خطّاً متشابكاً للمعلّم الواحد.
// اللوحة تُبنى على أسئلة المشرف لا على ما يسهل رسمه:
//   ١. التغطية — هل أسير على خطّتي؟ (الوتيرة التراكميّة مقابل المطلوب، ومن زرت في كلّ مدرسة)
//   ٢. الضعف   — أين وعند من؟ (توزيع المستويات لكلّ بند، وخريطة المعلّم × البند من آخر زيارة)
//   ٣. النموّ   — هل تحسّن بعد الدعم؟ (أوّل زيارة ← آخرها لكلّ معلّم، ولكلّ بندٍ في ملفّه)
//   ٤. المتابعة — هل نُفّذ ما اتّفقنا عليه؟ (توصيات الزيارات المدرسيّة، وأهداف عين المشرف)
//
// نقيٌّ بلا DOM (يُصدَّر لـnode ويُختبر في tests/dash.test.js). السلّم مقلوب: ١ = متميّز و٥ = تدخّل سريع، والبند بلا درجةٍ
// لا يُحسب (لا صفر). التواريخ نصوصٌ محلّيّة YYYY-MM-DD (toISOString يُنقص اليوم في توقيت مسقط).
// =========================================================================
(function (root) {
    'use strict';

    const ITEMS = 13;
    // أسماءٌ قصيرةٌ للرسوم — «المعيار» يتكرّر (٨ و٩ «فاعلية التدريس»، ١٢ و١٣ «الحوكمة») فلا يصلح عنواناً
    const SHORT = {
        1: 'التحصيل الدراسي', 2: 'التقدم الدراسي', 3: 'مهارات التعلم', 4: 'القيم والسلوك', 5: 'الأمن والسلامة',
        6: 'تخطيط المنهاج', 7: 'الإدارة الصفية', 8: 'استراتيجيات التدريس', 9: 'المصادر والموارد', 10: 'التقويم',
        11: 'التقويم الذاتي والتطوير', 12: 'أخلاقيات المهنة', 13: 'المبادرات المجتمعية'
    };
    const LEVELS = { 1: 'متميز', 2: 'جيد', 3: 'ملائم', 4: 'غير ملائم', 5: 'تدخل سريع' };
    const WEAK = 4;                       // «غير ملائم» فأدنى = يحتاج
    const PER_TEACHER = 2;                // الزيارات المطلوبة لكلّ معلّمٍ في الفصل — افتراضٌ يغيّره المشرف

    const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
    const day = s => { const d = parse(s); return d ? iso(d) : ''; };
    const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
    const between = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
    const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
    const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

    // درجات التقرير بند ← درجة: formData (الحديث) يغلب الجذر (الصيغ الأقدم: مصفوفةٌ أو {item-N})
    function scoreMap(r) {
        const out = {};
        const put = (id, v) => { const n = parseInt(v, 10); if (id >= 1 && id <= ITEMS && n >= 1 && n <= 5) out[id] = n; };
        if (r && Array.isArray(r.scores)) r.scores.forEach((v, i) => put(i + 1, v));
        else if (r && r.scores && typeof r.scores === 'object') Object.keys(r.scores).forEach(k => { const m = /(\d+)$/.exec(k); if (m) put(+m[1], r.scores[k]); });
        const fd = r && r.formData;
        if (fd && typeof fd === 'object') Object.keys(fd).forEach(k => { const m = /^score-(\d+)$/.exec(k); if (m) put(+m[1], fd[k]); });
        return out;
    }

    // حركة الطلبة من رصد عين المشرف (كما في eye.js: الكشف إن كفت لقطاته، وإلّا حركة الصورة)
    function eyeMoving(M) {
        if (!M) return null;
        const P = M.people;
        if (P && P.movingAll != null && P.detSecs >= 60) return P.movingPlay != null ? P.movingPlay : P.movingAll;
        return M.observed ? (M.activePct != null ? M.activePct : null) : null;
    }
    function eyeOf(fd) {
        if (!fd || !fd.eyeData) return null;
        let d = null;
        try { d = JSON.parse(fd.eyeData); } catch (e) { return null; }
        if (!d || typeof d !== 'object') return null;
        return { moving: eyeMoving(d.M), follow: d.follow && Array.isArray(d.follow.list) ? d.follow.list.filter(x => x && x.verdict) : [] };
    }

    // تقارير الأرشيف [{key, data}] ← زياراتٌ موحّدة (المعلّم والتاريخ شرطان)
    function visitsFrom(rows, norm) {
        const nk = norm || clean;
        const out = [];
        (rows || []).forEach(r => {
            const d = r && r.data;
            if (!d || typeof d !== 'object') return;
            const teacher = clean(d.teacherName);
            const date = day(d.visitDate);
            if (!teacher || !date) return;
            const fd = d.formData && typeof d.formData === 'object' ? d.formData : {};
            const scores = scoreMap(d);
            const vals = Object.values(scores);
            out.push({
                key: r.key || '', teacher, tk: nk(teacher), school: clean(d.school || fd.school), date,
                scores, n: vals.length, mean: mean(vals), weak: vals.filter(v => v >= WEAK).length, eye: eyeOf(fd)
            });
        });
        return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    }

    const inRange = (v, range) => !range || (v.date >= range.from && v.date <= range.to);

    // آخر زيارةٍ لكلّ معلّم
    function latestByTeacher(visits) {
        const m = new Map();
        (visits || []).forEach(v => { const p = m.get(v.tk); if (!p || v.date > p.date || (v.date === p.date && v.key > p.key)) m.set(v.tk, v); });
        return [...m.values()];
    }

    // ── ١) التغطية ──
    // roster: معلّمو المشرف من قاعدة المعلّمين [{name, school}] — بدونها تُبنى من زيارات الفترة وحدها
    function coverage(visits, roster, range, perTeacher, norm) {
        const nk = norm || clean;
        const need = Math.max(1, perTeacher || PER_TEACHER);
        const inR = (visits || []).filter(v => inRange(v, range));
        const count = new Map(), last = new Map(), lastSchool = new Map();
        inR.forEach(v => {
            count.set(v.tk, (count.get(v.tk) || 0) + 1);
            if (!last.has(v.tk) || v.date > last.get(v.tk)) { last.set(v.tk, v.date); if (v.school) lastSchool.set(v.tk, v.school); }
        });
        const linked = Array.isArray(roster) && roster.length > 0;
        const seen = new Set();
        const people = [];
        if (linked) {
            roster.forEach(t => {
                const name = clean(t && t.name), k = nk(name);
                if (!name || seen.has(k)) return;
                seen.add(k);
                people.push({ name, tk: k, school: clean(t.school) || 'بلا مدرسة', count: count.get(k) || 0, last: last.get(k) || '' });
            });
        } else {
            inR.forEach(v => {
                if (seen.has(v.tk)) return;
                seen.add(v.tk);
                people.push({ name: v.teacher, tk: v.tk, school: lastSchool.get(v.tk) || v.school || 'بلا مدرسة', count: count.get(v.tk) || 0, last: last.get(v.tk) || '' });
            });
        }
        const bySchool = new Map();
        people.forEach(p => { const s = bySchool.get(p.school) || []; s.push(p); bySchool.set(p.school, s); });
        const schools = [...bySchool.entries()].map(([school, list]) => ({
            school,
            teachers: list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar')),
            total: list.length, visited: list.filter(p => p.count > 0).length, done: list.filter(p => p.count >= need).length
        })).sort((a, b) => a.visited / a.total - b.visited / b.total || b.total - a.total || a.school.localeCompare(b.school, 'ar'));
        // زياراتٌ لمعلّمين خارج القائمة (نيابةً، أو معلّمٌ لمشرفٍ آخر) — تُعدّ في الوتيرة ولا تدخل التغطية
        const outside = linked ? inR.filter(v => !seen.has(v.tk)).length : 0;
        return {
            linked, need, schools, outside,
            total: people.length, visited: people.filter(p => p.count > 0).length, done: people.filter(p => p.count >= need).length,
            notVisited: people.filter(p => !p.count).sort((a, b) => a.school.localeCompare(b.school, 'ar') || a.name.localeCompare(b.name, 'ar'))
        };
    }

    // الوتيرة: الزيارات التراكميّة أسبوعاً بأسبوع مقابل خطٍّ منتظمٍ إلى المطلوب (المعلّمون × الزيارات المطلوبة)
    function pace(visits, range, target, today) {
        const t = day(today) || range.to;
        const span = Math.max(1, between(range.from, range.to));
        const inR = (visits || []).filter(v => inRange(v, range)).map(v => v.date).sort();
        const weeks = [];
        for (let s = range.from; s <= range.to; s = addDays(s, 7)) {
            const e = addDays(s, 6) > range.to ? range.to : addDays(s, 6);
            weeks.push({
                from: s, to: e,
                actual: s <= t ? inR.filter(d => d <= (e < t ? e : t)).length : null,
                plan: Math.round(10 * target * Math.min(1, (between(range.from, e) + 1) / (span + 1))) / 10
            });
        }
        const now = t < range.from ? 0 : t > range.to ? 1 : (between(range.from, t) + 1) / (span + 1);
        const done = inR.filter(d => d <= t).length;
        const expected = Math.round(target * now);
        const leftWeeks = t >= range.to ? 0 : Math.max(1, Math.ceil(between(t, range.to) / 7));
        const left = Math.max(0, target - done);
        return { weeks, target, done, expected, gap: done - expected, left, leftWeeks, perWeek: leftWeeks ? Math.ceil(left / leftWeeks) : left, started: t >= range.from, ended: t > range.to };
    }

    // ── ٢) الضعف ──
    // توزيع المستويات لكلّ بند — من آخر زيارةٍ لكلّ معلّم (فالمعلّم المزور مرّتين لا يُعدّ مرّتين)، مرتّبٌ من الأضعف
    function distribution(visits) {
        const latest = latestByTeacher(visits);
        const items = [];
        for (let id = 1; id <= ITEMS; id++) {
            const c = [0, 0, 0, 0, 0];
            latest.forEach(v => { const s = v.scores[id]; if (s) c[s - 1]++; });
            const n = c.reduce((a, b) => a + b, 0);
            const vals = [];
            c.forEach((k, i) => { for (let j = 0; j < k; j++) vals.push(i + 1); });
            items.push({
                id, label: SHORT[id], counts: c, n,
                pct: c.map(k => (n ? 100 * k / n : 0)),
                weakPct: n ? Math.round(100 * (c[3] + c[4]) / n) : 0,
                goodPct: n ? Math.round(100 * (c[0] + c[1]) / n) : 0,
                mean: r1(mean(vals))
            });
        }
        const rated = items.filter(x => x.n > 0);
        rated.sort((a, b) => b.weakPct - a.weakPct || b.mean - a.mean || a.id - b.id);
        return { items: rated, teachers: latest.length, weakest: rated.length && rated[0].weakPct > 0 ? rated[0] : null };
    }

    // خريطة المعلّم × البند — آخر زيارة، الأحوج أوّلاً (بنودٌ «غير ملائم» فأدنى، ثمّ المتوسّط)
    function heatmap(visits) {
        return latestByTeacher(visits).filter(v => v.n > 0).map(v => ({
            teacher: v.teacher, tk: v.tk, school: v.school, date: v.date, key: v.key,
            scores: Array.from({ length: ITEMS }, (_, i) => v.scores[i + 1] || null),
            weak: v.weak, mean: r1(v.mean)
        })).sort((a, b) => b.weak - a.weak || b.mean - a.mean || a.teacher.localeCompare(b.teacher, 'ar'));
    }

    // ── ٣) النموّ ──
    // لكلّ معلّمٍ زير مرّتين فأكثر: أوّل زيارةٍ وآخرها في الفترة — الفرق موجبٌ = تحسّن (السلّم مقلوب)
    function growth(visits) {
        const by = new Map();
        (visits || []).filter(v => v.n > 0).forEach(v => { const l = by.get(v.tk) || []; l.push(v); by.set(v.tk, l); });
        const out = [];
        by.forEach(list => {
            if (list.length < 2) return;
            list.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
            const f = list[0], l = list[list.length - 1];
            let up = 0, down = 0;
            for (let id = 1; id <= ITEMS; id++) {
                if (!f.scores[id] || !l.scores[id]) continue;
                if (l.scores[id] < f.scores[id]) up++; else if (l.scores[id] > f.scores[id]) down++;
            }
            out.push({ teacher: l.teacher, tk: l.tk, school: l.school, visits: list.length, first: { date: f.date, mean: r1(f.mean) }, last: { date: l.date, mean: r1(l.mean) },
                       delta: r1(f.mean - l.mean), up, down });
        });
        return out.sort((a, b) => b.delta - a.delta || a.teacher.localeCompare(b.teacher, 'ar'));
    }

    // ملفّ المعلّم: زياراته بترتيبها، ولكلّ بندٍ أوّل درجةٍ وآخرها وتاريخه كلّه، ورصد عين المشرف
    function profile(visits, tk) {
        const list = (visits || []).filter(v => v.tk === tk).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
        const items = [];
        for (let id = 1; id <= ITEMS; id++) {
            const hist = list.map(v => v.scores[id] || null);
            const known = hist.filter(Boolean);
            items.push({ id, label: SHORT[id], hist, first: known.length ? known[0] : null, last: known.length ? known[known.length - 1] : null });
        }
        const last = list[list.length - 1] || null;
        return {
            teacher: last ? last.teacher : '', school: last ? last.school : '', visits: list, items,
            last, first: list[0] || null,
            eye: list.filter(v => v.eye && v.eye.moving != null).map(v => ({ date: v.date, moving: v.eye.moving }))
        };
    }

    // ── ٤) المتابعة ──
    // توصيات الزيارات المدرسيّة لكلّ مدرسة: ما قُيِّم في زيارات الفترة (نُفّذت/جزئيّاً/لم تُنفّذ — prevRecsReview)،
    // وما بقي مفتوحاً من آخر زيارةٍ للمدرسة (متأخّرة: تجاوزت موعدها، وفي موعدها: لم يحن أو بلا موعد)
    const recLines = text => String(text || '').split('\n').map(l => l.trim()).filter(l => /^[-–•]\s*/.test(l)).map(l => clean(l.replace(/^[-–•]\s*/, ''))).filter(Boolean);
    function recsFollow(rows, range, today, norm) {
        const nk = norm || clean;
        const t = day(today) || range.to;
        const S = new Map();
        const get = name => { const k = nk(name); if (!S.has(k)) S.set(k, { school: clean(name), done: 0, partial: 0, notDone: 0, overdue: 0, pending: 0, last: '' }); return S.get(k); };
        const latest = new Map();
        (rows || []).forEach(r => {
            const d = r && r.data;
            if (!d || !clean(d.schoolName)) return;
            const date = day(d.visitDate);
            if (!date) return;
            const k = nk(d.schoolName);
            if (!latest.has(k) || date > latest.get(k).date) latest.set(k, { date, d });
            if (inRange({ date }, range) && d.prevRecsReview && Array.isArray(d.prevRecsReview.items)) {
                const s = get(d.schoolName);
                d.prevRecsReview.items.forEach(x => {
                    if (!x) return;
                    if (x.status === 'done') s.done++; else if (x.status === 'partial') s.partial++; else if (x.status === 'not-done') s.notDone++;
                });
            }
        });
        latest.forEach(({ date, d }) => {
            if (date > t) return;
            const structured = Array.isArray(d.recs) ? d.recs.filter(x => x && clean(x.text)) : [];
            const items = structured.length ? structured.map(x => ({ due: day(x.due) })) : recLines(d.recommendations).map(() => ({ due: '' }));
            if (!items.length) return;
            const s = get(d.schoolName);
            s.last = date;
            items.forEach(x => { if (x.due && x.due < t) s.overdue++; else s.pending++; });
        });
        const list = [...S.values()].map(s => Object.assign(s, { total: s.done + s.partial + s.notDone + s.overdue + s.pending }))
            .filter(s => s.total > 0)
            .sort((a, b) => (b.overdue + b.notDone) - (a.overdue + a.notDone) || b.total - a.total || a.school.localeCompare(b.school, 'ar'));
        const sum = k => list.reduce((a, s) => a + s[k], 0);
        return { schools: list, done: sum('done'), partial: sum('partial'), notDone: sum('notDone'), overdue: sum('overdue'), pending: sum('pending'),
                 overdueSchools: list.filter(s => s.overdue > 0).length };
    }

    // أهداف عين المشرف التي قيست في زيارات الفترة (المتابعة في الرصد التالي للمعلّم نفسه)
    function eyeTargets(visits) {
        const c = { met: 0, better: 0, same: 0, worse: 0, na: 0 };
        let obs = 0;
        const mv = [];
        (visits || []).forEach(v => {
            if (!v.eye) return;
            obs++;
            if (v.eye.moving != null) mv.push(v.eye.moving);
            v.eye.follow.forEach(f => { if (c[f.verdict] != null) c[f.verdict]++; });
        });
        const measured = c.met + c.better + c.same + c.worse;
        return Object.assign(c, { observations: obs, measured, moving: mv.length ? Math.round(mean(mv)) : null });
    }

    // اسم المدرسة مختصراً للمحاور: بلا «مدرسة» ولا نطاق الصفوف ولا «للتعليم الأساسي» (كـshortSchool في التقرير الشهريّ)
    function shortSchool(name) {
        let s = clean(name).replace(/ـ/g, '');
        s = s.replace(/^مدرس[ةه]\s+/, '');
        s = s.replace(/\(?\s*(?:من\s*)?\d{1,2}\s*[-–—_/]\s*\d{1,2}\s*\)?/g, ' ');
        s = s.replace(/(^|\s)للتعليم\s+(?:ما\s*بعد\s+)?ال[اأ]ساسي[ةه]?(?=\s|$)/g, ' ');
        return clean(s) || clean(name);
    }

    // العدد بصيغته: زيارة واحدة، زيارتان، ٣–١٠ زيارات، ١١+ زيارة
    function countWord(n, one, two, few, many) {
        if (n === 1) return one;
        if (n === 2) return two;
        return n >= 3 && n <= 10 ? n + ' ' + few : n + ' ' + many;
    }

    const api = { ITEMS, SHORT, LEVELS, WEAK, PER_TEACHER, day, addDays, between, scoreMap, eyeMoving, visitsFrom, inRange, latestByTeacher,
                  coverage, pace, distribution, heatmap, growth, profile, recsFollow, eyeTargets, shortSchool, countWord };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfDash = api;
})(typeof window !== 'undefined' ? window : this);
