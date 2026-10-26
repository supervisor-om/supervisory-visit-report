// =========================================================================
// دليل المعلّم في عين المشرف (منذ 2026-10-27) — المحرّك النقيّ
//
// طلب المشرف بعد أن أرسل صفحات دليل كرة القدم للصف الثامن: «كيف أستفيد منه في عين المشرف». العين كانت تقيس ما
// رأته بمعايير عامّة؛ بالدليل تقارنه بما خطّط له المنهج. البيانات في js/lesson-guide-data.js (SVF_LESSON_GUIDE)،
// وهذه الوحدة تقرؤها وحدها — بلا DOM — وتُصدَّر لـnode:
//   • find(info)          ← الدليل ومهارات اليوم من الصفّ وعنوان الدرس (والدليل نفسه إن كان العنوان فارغاً)
//   • عيّنة الطلبة بالنقاط الفنّيّة: لكلّ طالبٍ قناعٌ رقميّ بما حقّقه من نقاط المهارة (pa/pb، و-1 لم يُقيَّم)،
//     ومنه رمز الإتقان القديم (a/b) فيبقى sampleStats والبند ١ والأهداف على حالها — pointStats لكلّ نقطة
//   • speechCoverage       ← أيّ النقاط الفنّيّة ذكرها المعلّم في كلامه، وأيّ أسئلة التقويم في الدليل طرحها
//   • guideCtx             ← ما يحتاجه الاقتراح والمداولة (eye-core: suggest / debriefPrompts عبر ctx.guide)
// =========================================================================
(function (root) {
    'use strict';

    const req = p => { try { return typeof require === 'function' ? require(p) : null; } catch (e) { return null; } };
    const SX = () => root.SvfEyeSpeech || req('./eye-speech.js');
    const TP = () => root.SvfTermPlan || req('./term-plan.js');
    let DATA = null;
    const data = () => DATA || root.SVF_LESSON_GUIDE || { topics: [] };
    const setData = d => { DATA = d; };

    const MIN = 5;                                   // كـ MIN_SAMPLE في eye-core: أقلّ عيّنةٍ يُحكم منها
    const FORM = { pairs: 'ثنائيات', lines: 'صفوف وقطارات', free: 'انتشار حرّ', stations: 'محطّات', game: 'مباراة' };

    const norm = s => (SX() ? SX().norm(s) : String(s || '').trim());
    const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // لفظٌ بكلمته كاملة، ويقبل قبله «و/ف» ثمّ «ب/ل/ك» («وبالجبهة» ← الجبهة) — \b لا يعمل مع العربيّة
    const cache = new Map();
    function lexRe(words) {
        const key = words.join('|');
        if (cache.has(key)) return cache.get(key);
        const alts = Array.from(new Set(words.map(norm).filter(Boolean))).sort((a, b) => b.length - a.length).map(escRe).join('|');
        const re = alts ? new RegExp('(?:^| )(?:و|ف)?(?:ب|ل|ك)?(?:' + alts + ')(?= |$)') : null;
        cache.set(key, re);
        return re;
    }
    const has = (text, words) => { const re = lexRe(words || []); return !!(re && re.test(norm(text))); };

    const topics = () => (data().topics || []);
    const byId = id => topics().find(t => t.id === id) || null;
    const skillOf = (G, id) => (G && G.skills || []).find(s => s.id === id) || null;
    const observable = s => !!(s && s.points && s.points.length && !s.knowledge);

    // الدليل من الصفّ وعنوان الدرس: عنوانٌ يسمّي الموضوع أو مهارةً منه ← مؤكَّد ومعه مهاراتُه؛ وعنوانٌ فارغٌ والصفّ له دليلٌ
    // واحد ← يُعرض اقتراحاً (sure: false)؛ وعنوانٌ لموضوعٍ آخر ← لا دليل (ألعاب القوى ليست كرة القدم)
    function find(info) {
        info = info || {};
        const grade = TP() ? TP().parseGrade(info.cls || '') : 0;
        if (!grade) return null;
        const cands = topics().filter(t => t.grade === grade);
        if (!cands.length) return null;
        const title = String(info.topic || '').trim();
        for (const G of cands) {
            const skills = G.skills.filter(s => has(title, s.match)).map(s => s.id);
            if (skills.length || has(title, G.match)) return { guide: G, skills, sure: true };
        }
        return !title && cands.length === 1 ? { guide: cands[0], skills: [], sure: false } : null;
    }

    // التدريبات المقترحة لمهارات اليوم (وتمرينات الإحساس بالكرة معها)
    function drillsFor(G, ids) {
        const set = new Set(ids || []);
        return (G && G.drills || []).filter(d => d.skills.some(k => set.has(k)));
    }
    // أقلّ «طلبةٍ لكلّ كرة» في تدريبات المهارة (ما يحدّده الدليل) — 0 إن لم يحدّد
    function perBall(G, ids) {
        const p = drillsFor(G, ids).filter(d => d.per > 0 && d.kind === 'teach').map(d => d.per);
        return p.length ? Math.max(...p) : 0;
    }
    // تشكيلات تدريبات المهارة (kind: teach) أو أنشطتها التطبيقيّة (apply)
    const formsFor = (G, ids, kind) => Array.from(new Set(drillsFor(G, ids).filter(d => !kind || d.kind === kind).map(d => d.form)));

    // ── عيّنة الطلبة بالنقاط الفنّيّة ──
    const pop = m => { let n = 0; for (let x = m; x > 0; x >>= 1) n += x & 1; return n; };
    // كلّ النقاط ← أتقن (3)، ونصفها فأكثر ← جزئيّاً (2)، وأقلّ ← لم يتقن (1)
    const codeOf = (mask, P) => (mask == null || mask < 0 || !P ? 0 : pop(mask) >= P ? 3 : 2 * pop(mask) >= P ? 2 : 1);
    const masks = (s, r) => { const a = Array.isArray(s && s['p' + r]) ? s['p' + r] : []; const out = []; for (let i = 0; i < (s.n || 0); i++) out.push(Number.isInteger(a[i]) ? a[i] : -1); return out; };
    // رموز الإتقان (a/b) من الأقنعة — فتبقى sampleStats وما بعدها على حالها
    function syncCodes(s, P) {
        if (!s || !P) return s;
        ['a', 'b'].forEach(r => { if (Array.isArray(s['p' + r])) s[r] = masks(s, r).map(m => String(codeOf(m, P))).join('').replace(/0+$/, ''); });
        return s;
    }
    function setPoint(s, r, i, bit, on, P) {
        const arr = masks(s, r);
        let m = arr[i] < 0 ? 0 : arr[i];
        if (bit === 'all') m = (1 << P) - 1; else if (bit === 'none') m = 0; else m = on ? (m | (1 << bit)) : (m & ~(1 << bit));
        arr[i] = m;
        s['p' + r] = arr;
        return syncCodes(s, P);
    }
    function clearPupil(s, r, i, P) {
        const arr = masks(s, r);
        arr[i] = -1;
        s['p' + r] = arr;
        return syncCodes(s, P);
    }
    // لكلّ نقطة: من حقّقها ممّن قُيّموا في القراءة الأخيرة (فيها خمسةٌ فأكثر، وإلّا الأولى)، والتقدّم بين القراءتين
    function pointStats(s, G) {
        const sk = s && skillOf(G, s.sk);
        if (!observable(sk)) return null;
        const P = sk.points.length;
        const round = r => {
            const M = masks(s, r).filter(m => m >= 0);
            return { rated: M.length, pts: sk.points.map((p, i) => { const ok = M.filter(m => m & (1 << i)).length; return { i, short: p.short, ok, pct: M.length ? Math.round(100 * ok / M.length) : null }; }) };
        };
        const a = round('a'), b = round('b');
        const finalRound = b.rated >= MIN ? 'b' : a.rated >= MIN ? 'a' : null;
        const fin = finalRound === 'b' ? b : finalRound === 'a' ? a : null;
        const weakest = fin ? fin.pts.slice().sort((p, q) => p.pct - q.pct || p.i - q.i)[0] : null;
        const gain = a.rated && b.rated ? sk.points.map((p, i) => ({ i, short: p.short, from: a.pts[i].pct, to: b.pts[i].pct })) : null;
        return { skill: sk.id, name: sk.short || sk.name, P, a, b, final: fin, finalRound, weakest, gain };
    }

    // ── كلام المعلّم: النقاط الفنّيّة وأسئلة التقويم ──
    // segs: [[t, نصّ]] أو [{t, x}] — كما في data.sp.seg
    function speechCoverage(segs, G, ids) {
        const list = (segs || []).map(s => (Array.isArray(s) ? { t: s[0], x: s[1] } : s)).filter(s => s && s.x);
        if (!G || !list.length) return null;
        const sx = SX();
        const clauses = [];
        list.forEach(s => (sx ? sx.clauses(s.x) : [s.x]).forEach(cl => clauses.push({ t: Math.max(0, Math.round(Number(s.t) || 0)), x: cl, n: norm(cl) })));
        const short = x => { x = String(x || '').trim(); return x.length > 90 ? x.slice(0, 88) + '…' : x; };
        const hit = (re, c) => !!(re && re.test(c.n));
        const skills = (ids || []).map(id => skillOf(G, id)).filter(s => s && s.points && s.points.length).map(sk => ({
            id: sk.id,
            points: sk.points.map(p => {
                const re = lexRe(p.cues || []);
                const m = clauses.filter(c => hit(re, c));
                return { n: m.length, ex: m.length ? [m[0].t, short(m[0].x)] : null };
            })
        }));
        const assess = (G.assess || []).map(q => {
            const A = lexRe(q.any || []), W = q.with ? lexRe(q.with) : null;
            const m = clauses.filter(c => hit(A, c) && (!W || hit(W, c)));
            return { n: m.length, ex: m.length ? [m[0].t, short(m[0].x)] : null };
        });
        const all = skills.reduce((a, s) => a.concat(s.points), []);
        return {
            v: 1, id: G.id, ids: (ids || []).slice(), clauses: clauses.length, skills,
            said: all.filter(p => p.n > 0).length, total: all.length,
            assess, asked: assess.filter(q => q.n > 0).length
        };
    }
    // «حذف النصّ والإبقاء على الأرقام»: تبقى الأعداد وتذهب الأمثلة
    function stripExamples(C) {
        if (!C) return C;
        (C.skills || []).forEach(s => s.points.forEach(p => { p.ex = null; }));
        (C.assess || []).forEach(q => { q.ex = null; });
        return C;
    }

    // ── ما يحتاجه الاقتراح والمداولة ──
    // d = بيانات الرصد ({guide: {id, skills}, sample, M}) ← {skill, weak, best, strong, cover, assess, per, forms/formsText (تدريبات المهارة),
    //   applyText (أنشطتها التطبيقيّة), adapt, game}
    function guideCtx(d) {
        const sel = d && d.guide;
        const G = sel && byId(sel.id);
        if (!G) return null;
        const ids = (sel.skills || []).filter(id => skillOf(G, id));
        const out = { id: G.id, topic: G.topic, skills: ids.map(id => skillOf(G, id).short) };
        const PS = pointStats(d.sample, G);
        if (PS && PS.final) {
            out.skill = PS.name;
            const w = PS.weakest;
            if (w && w.pct < 75) out.weak = { short: w.short, ok: w.ok, rated: PS.final.rated, pct: w.pct };
            out.strong = PS.final.pts.every(p => p.pct >= 75);
            const best = PS.final.pts.slice().sort((p, q) => q.pct - p.pct)[0];
            if (best && best.pct >= 75) out.best = { short: best.short, ok: best.ok, rated: PS.final.rated };
        }
        const C = d.M && d.M.gspeech;
        // كلامٌ قليل (أقلّ من خمس عشرة جملة) لا يُحكم منه على ما لم يُذكر
        if (C && C.id === G.id && C.total && C.clauses >= 15) {
            const names = [];
            C.skills.forEach(s => { const sk = skillOf(G, s.id); if (sk) s.points.forEach((p, i) => names.push({ short: sk.points[i].short, n: p.n })); });
            out.cover = { said: C.said, total: C.total, missing: names.filter(p => !p.n).map(p => p.short), saidList: names.filter(p => p.n).map(p => p.short) };
            out.assess = { asked: C.asked, total: (G.assess || []).length, missing: (G.assess || []).filter((q, i) => !(C.assess[i] && C.assess[i].n)).map(q => q.short) };
        }
        out.per = perBall(G, ids);
        out.forms = formsFor(G, ids, 'teach');
        out.formsText = out.forms.map(f => FORM[f]).filter(Boolean);
        out.applyText = formsFor(G, ids, 'apply').map(f => FORM[f]).filter(Boolean);
        out.game = ids.includes('play');
        out.adapt = G.adapt || [];
        return out;
    }

    const api = { MIN, FORM, setData, norm, has, topics, byId, skillOf, observable, find, drillsFor, perBall, formsFor,
                  codeOf, syncCodes, setPoint, clearPupil, pointStats, speechCoverage, stripExamples, guideCtx };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SvfLessonGuide = api;
})(typeof window !== 'undefined' ? window : globalThis);
