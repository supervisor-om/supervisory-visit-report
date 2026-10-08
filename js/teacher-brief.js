// =========================================================================
// ملخّص ما قبل الزيارة الإشرافيّة (منذ 2026-10-08)
//
// حين يُكتب اسم المعلّم في النموذج الإشرافيّ تظهر تحته بطاقةٌ تبني الزيارة على سابقتها:
// آخر زيارةٍ وتقديرها ومتى كانت، وأضعف بنودها، وتوصياتها لمتابعتها، وصفوف المعلّم ونصابه
// من قاعدة المعلّمين، ودرس اليوم من الخطة الفصليّة. **قراءةٌ فقط** — لا تكتب في النموذج.
//
// السلّم مقلوب: 1 = متميّز و5 = يحتاج إلى تدخّل، فـ«الأضعف» أعلى الدرجات.
// =========================================================================
(function (root) {
    'use strict';

    const LABELS = { 1: 'متميز', 2: 'جيد', 3: 'ملائم', 4: 'غير ملائم', 5: 'يحتاج إلى تدخل' };
    const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

    function scoresOf(report) {
        const fd = (report && report.formData) || {};
        const out = {};
        Object.keys(fd).forEach(k => {
            const m = /^score-(\d+)$/.exec(k);
            const v = m ? parseInt(fd[k], 10) : NaN;
            if (m && v >= 1 && v <= 5) out[+m[1]] = v;
        });
        return out;
    }

    function daysBetween(a, b) {
        const t1 = Date.parse(a), t2 = Date.parse(b);
        return isNaN(t1) || isNaN(t2) ? null : Math.round((t2 - t1) / 86400000);
    }

    // دالّةٌ نقيّة.
    //   reports: [{key, data}] كلّ زيارات الأرشيف الإشرافيّ
    //   items:   evaluationItems (للعناوين)
    //   today:   تاريخ الزيارة الحاليّة (YYYY-MM-DD) أو اليوم
    function svfTeacherBrief(opts) {
        const o = opts || {};
        const norm = o.normName || clean;
        const want = norm(o.name);
        if (!want) return null;
        const mine = (o.reports || [])
            .filter(r => r && r.data && r.key !== o.excludeKey && norm(r.data.teacherName) === want)
            .map(r => ({ key: r.key, date: clean(r.data.visitDate), data: r.data }))
            .filter(r => !o.today || !r.date || r.date <= o.today)
            .sort((a, b) => b.date.localeCompare(a.date));

        const brief = { count: mine.length, last: null, teacher: o.teacher || null, lesson: o.lesson || null };
        const last = mine[0];
        if (last) {
            const sc = scoresOf(last.data);
            const vals = Object.values(sc);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            const titleOf = id => ((o.items || []).find(i => i.id === id) || {}).title || ('البند ' + id);
            const worst = vals.length ? Math.max(...vals) : null;
            const weak = worst && worst >= 3
                ? Object.keys(sc).map(Number).filter(id => sc[id] === worst).sort((a, b) => a - b).slice(0, 3)
                    .map(id => ({ id, title: titleOf(id), score: sc[id], label: LABELS[sc[id]] }))
                : [];
            const fd = last.data.formData || {};
            const recs = clean(fd.recommendationsContent || '').length
                ? String(fd.recommendationsContent).split(/\r?\n/).map(clean)
                    // \b لا يعمل مع الحروف العربيّة في JS — فالحدّ مسافةٌ أو نهاية السطر
                    .filter(l => l && !/^نوصي(\s|$)/.test(l) && !/^والله(\s|$)/.test(l))
                    .map(l => l.replace(/^[•\-•]\s*/, ''))
                : [];
            brief.last = {
                date: last.date,
                visitNo: clean(fd.visitNumber),
                lesson: clean(fd.topic),
                avg: avg == null ? null : Math.round(avg * 10) / 10,
                label: avg == null ? '' : LABELS[Math.min(5, Math.max(1, Math.round(avg)))],
                days: o.today ? daysBetween(last.date, o.today) : null,
                weak, recs
            };
        }
        return brief;
    }

    if (typeof module !== 'undefined' && module.exports) { module.exports = { svfTeacherBrief }; return; }
    root.svfTeacherBrief = svfTeacherBrief;

    // ── البطاقة ──
    const el = id => document.getElementById(id);
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s) : clean(s));

    function supReports() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !(key.startsWith('supervision_v6_visit_') || key.startsWith('visit_v5_'))) continue;
            let d = null;
            try { d = JSON.parse(localStorage.getItem(key)); } catch (e) { continue; }
            if (d && typeof d === 'object') out.push({ key, data: d });
        }
        return out;
    }

    function dbTeacher(name) {
        try {
            if (!root.SupervisorIdentity || !SupervisorIdentity.getIdentity()) return null;
            const r = SupervisorIdentity.findTeacher(name);
            return (r && r.teacher) || null;
        } catch (e) { return null; }
    }

    function render() {
        const box = el('supTeacherBrief');
        if (!box) return;
        const name = clean(el('teacherName') && el('teacherName').value);
        if (!name) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        const today = clean(el('visitDate') && el('visitDate').value) || new Date().toISOString().slice(0, 10);
        const teacher = dbTeacher(name);
        let lesson = null;
        try {
            const g = document.querySelector('input[name="supervisoryTeacherGender"]:checked');
            if (root.SvfTermPlan && root.SVF_TERM_PLAN)
                lesson = SvfTermPlan.suggestTitle(SVF_TERM_PLAN, el('class') && el('class').value, today,
                                                  g ? (g.value === '1' ? 'f' : 'm') : '');
        } catch (e) {}
        const b = svfTeacherBrief({
            name, reports: supReports(), today,
            excludeKey: typeof currentEditingKey !== 'undefined' ? currentEditingKey : null,
            items: typeof evaluationItems !== 'undefined' ? evaluationItems : [],
            normName: root.SupervisorIdentity ? SupervisorIdentity.normName : null,
            teacher, lesson
        });
        if (!b) { box.classList.add('hidden'); return; }

        const parts = [];
        if (b.last) {
            const L = b.last;
            parts.push(`<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span class="font-bold text-slate-700">آخر زيارة: <bdi>${esc(L.date) || '—'}</bdi></span>
                ${L.days != null ? `<span class="text-xs text-slate-500">قبل ${L.days} يوماً</span>` : ''}
                ${L.visitNo ? `<span class="text-xs text-slate-500">الزيارة (${esc(L.visitNo)})</span>` : ''}
                ${L.label ? `<span class="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">${esc(L.label)} — متوسّط ${L.avg}</span>` : ''}
                <span class="text-xs text-slate-400">(${b.count} ${b.count === 1 ? 'زيارة' : 'زيارات'} في الأرشيف)</span>
            </div>`);
            if (L.lesson) parts.push(`<div class="text-xs text-slate-500">درسها: ${esc(L.lesson)}</div>`);
            if (L.weak.length) parts.push(`<div><div class="text-xs font-bold text-rose-700 mb-1">أضعف البنود فيها</div>
                <ul class="text-xs text-slate-700 space-y-0.5">${L.weak.map(w =>
                    `<li>• ${esc(w.title)} — <span class="font-bold">${esc(w.label)} (${w.score})</span></li>`).join('')}</ul></div>`);
            if (L.recs.length) parts.push(`<div><div class="text-xs font-bold text-amber-700 mb-1">توصياتها — للمتابعة اليوم</div>
                <ul class="text-xs text-slate-700 space-y-0.5">${L.recs.slice(0, 5).map(r => `<li>• ${esc(r)}</li>`).join('')}</ul></div>`);
        } else {
            parts.push('<div class="font-bold text-emerald-700">الزيارة الأولى لهذا المعلّم في الأرشيف.</div>');
        }
        const t = b.teacher;
        if (t) parts.push(`<div class="text-xs text-slate-600">من القاعدة: ${esc(t.school) || '—'}
            ${t.grades ? ' · الصفوف (' + esc(t.grades) + ')' : ''}${t.load ? ' · ' + esc(t.load) + ' حصة' : ''}</div>`);
        if (b.lesson && b.lesson.options && b.lesson.options.length)
            parts.push(`<div class="text-xs text-slate-600">درس اليوم في الخطة: <span class="font-bold text-indigo-700">${
                b.lesson.options.map(esc).join(' أو ')}</span></div>`);

        box.innerHTML = `<div class="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                <i class="fa-solid fa-clipboard-list text-blue-500"></i> قبل الزيارة</div>
            <div class="space-y-2 text-sm">${parts.join('')}</div>`;
        box.classList.remove('hidden');
    }

    let timer = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(render, 250); };

    root.svfTeacherBriefInit = function () {
        ['teacherName', 'visitDate', 'class'].forEach(id => {
            const x = el(id); if (!x) return;
            x.addEventListener('change', soon); x.addEventListener('input', soon);
        });
        document.querySelectorAll('input[name="supervisoryTeacherGender"]').forEach(r => r.addEventListener('change', soon));
        render();
    };
    root.svfTeacherBriefRender = render;
})(typeof window !== 'undefined' ? window : this);
