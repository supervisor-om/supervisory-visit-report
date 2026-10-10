// =========================================================================
// لوحة «توصيات تنتظر المتابعة» (منذ 2026-10-10)
//
// لكلّ توصيةٍ مدّةٌ ومنها تاريخ استحقاق (recs.js)، لكن لا شيء كان يذكّر بها. اللوحة في سجلّ
// التقارير المدرسيّة تجمع **توصيات آخر زيارةٍ لكلّ مدرسة** — فالزيارة التالية هي التي تتابعها:
//   • تجاوزت موعدها · • تحين خلال سبعة أيّام · • عند الزيارة القادمة (بلا تاريخ)
// ومعها «زيارة متابعة» تفتح تقريراً جديداً باسم المدرسة، فتظهر توصياتها لتُقيَّم.
// قراءةٌ فقط من الأرشيف المحلّيّ.
// =========================================================================
(function (root) {
    'use strict';

    const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

    // سطور «- …» من نصّ التوصيات — للتقارير بلا بنيةٍ (قبل المنشئ)
    function recLines(text) {
        return String(text || '').split('\n').map(l => l.trim())
            .filter(l => /^[-–•]\s*/.test(l))
            .map(l => clean(l.replace(/^[-–•]\s*/, '')))
            .filter(Boolean);
    }

    // دالّةٌ نقيّة: reports [{key, data}] من الأرشيف، today = 'YYYY-MM-DD'
    function svfRecsBoard(reports, today, normalize) {
        const norm = normalize || clean;
        const latest = {};
        (reports || []).forEach(r => {
            const d = r && r.data;
            if (!d || !clean(d.schoolName) || !clean(d.visitDate)) return;
            const k = norm(d.schoolName);
            if (!latest[k] || d.visitDate > latest[k].data.visitDate) latest[k] = r;
        });

        const overdue = [], soon = [], next = [];
        Object.values(latest).forEach(r => {
            const d = r.data;
            const base = { school: clean(d.schoolName), visitDate: d.visitDate, key: r.key };
            const structured = Array.isArray(d.recs) ? d.recs.filter(x => x && clean(x.text)) : [];
            const items = structured.length
                ? structured.map(x => ({ text: clean(x.text), due: clean(x.due), deadline: x.deadline || '' }))
                : recLines(d.recommendations).map(t => ({ text: t, due: '', deadline: '' }));
            const later = [];
            items.forEach(it => {
                if (it.due && it.due < today) overdue.push(Object.assign({}, base, it, { late: days(it.due, today) }));
                else if (it.due && days(today, it.due) <= 7) soon.push(Object.assign({}, base, it, { left: days(today, it.due) }));
                else if (!it.due) later.push(it);
            });
            if (later.length) next.push(Object.assign({}, base, { items: later, since: days(d.visitDate, today) }));
        });
        overdue.sort((a, b) => b.late - a.late || a.school.localeCompare(b.school, 'ar'));
        soon.sort((a, b) => a.left - b.left || a.school.localeCompare(b.school, 'ar'));
        next.sort((a, b) => b.since - a.since);
        return { overdue, soon, next, total: overdue.length + soon.length + next.reduce((n, x) => n + x.items.length, 0) };
    }

    if (typeof module !== 'undefined' && module.exports) { module.exports = { svfRecsBoard, recLines }; return; }
    root.svfRecsBoard = svfRecsBoard;

    // ── الرسم ──
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s) : clean(s));

    function readReports() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !(key.startsWith('supervision_v6_school_report_') || key.startsWith('school_report_'))) continue;
            try { const d = JSON.parse(localStorage.getItem(key)); if (d && typeof d === 'object') out.push({ key, data: d }); } catch (e) {}
        }
        return out;
    }

    function localDay() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    const followBtn = school => `<button type="button" class="recs-follow text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg font-bold flex-none"
        data-school="${esc(school)}">زيارة متابعة</button>`;

    root.renderRecsBoard = function () {
        const box = document.getElementById('recsBoard');
        if (!box) return;
        const norm = root.SupervisorIdentity && SupervisorIdentity.normalize ? SupervisorIdentity.normalize : null;
        const b = svfRecsBoard(readReports(), localDay(), norm);
        if (!b.total) { box.innerHTML = ''; box.classList.add('hidden'); return; }
        box.classList.remove('hidden');

        const row = (x, badge) => `<div class="flex items-start justify-between gap-3 py-2">
            <div class="min-w-0"><div class="text-sm font-bold text-slate-700">${esc(x.school)}</div>
                <div class="text-xs text-slate-600 leading-5">${esc(x.text)}</div></div>
            <div class="flex items-center gap-2 flex-none">${badge}${followBtn(x.school)}</div></div>`;
        const section = (title, icon, color, rows) => rows.length ? `<div>
            <h5 class="text-xs font-bold ${color} mb-1 flex items-center gap-1"><i class="fa-solid ${icon}"></i> ${title} (${rows.length})</h5>
            <div class="divide-y divide-slate-100">${rows.join('')}</div></div>` : '';

        box.innerHTML = `<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-8">
            <h4 class="font-bold text-slate-700 mb-3 flex items-center gap-2">
                <i class="fa-solid fa-list-check text-amber-500"></i> توصيات تنتظر المتابعة
                <span class="text-xs font-medium text-slate-400">— من آخر زيارةٍ لكلّ مدرسة</span></h4>
            <div class="space-y-4 max-h-96 overflow-y-auto">
                ${section('تجاوزت موعدها', 'fa-circle-exclamation', 'text-rose-700', b.overdue.map(x =>
                    row(x, `<span class="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">متأخرة ${x.late} يوماً</span>`)))}
                ${section('تحين خلال أسبوع', 'fa-hourglass-half', 'text-amber-700', b.soon.map(x =>
                    row(x, `<span class="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">${x.left ? 'بعد ' + x.left + ' يوماً' : 'اليوم'}</span>`)))}
                ${section('عند الزيارة القادمة', 'fa-calendar-check', 'text-slate-600', b.next.map(x => `<div class="flex items-start justify-between gap-3 py-2">
                    <div class="min-w-0"><div class="text-sm font-bold text-slate-700">${esc(x.school)}
                        <span class="text-xs font-normal text-slate-400">— زيارة <bdi>${esc(x.visitDate)}</bdi> (قبل ${x.since} يوماً)</span></div>
                        <ul class="text-xs text-slate-600 leading-5">${x.items.slice(0, 4).map(i => '<li>• ' + esc(i.text) + '</li>').join('')}
                        ${x.items.length > 4 ? '<li class="text-slate-400">و' + (x.items.length - 4) + ' أخرى…</li>' : ''}</ul></div>
                    ${followBtn(x.school)}</div>`))}
            </div></div>`;

        box.querySelectorAll('.recs-follow').forEach(btn => btn.addEventListener('click', () => {
            const school = btn.dataset.school;
            try { document.getElementById('addNewReportBtn')?.click(); } catch (e) {}
            setTimeout(() => {
                const f = document.getElementById('schoolName');
                if (!f) return;
                f.value = school;
                f.dispatchEvent(new Event('input', { bubbles: true }));
                f.dispatchEvent(new Event('change', { bubbles: true }));
                // توصياتها السابقة تُحمَّل عند مغادرة الخانة (blur) — تُستدعى هنا مباشرةً
                try { if (typeof loadPreviousRecommendations === 'function') loadPreviousRecommendations(); } catch (e) {}
            }, 150);
        }));
    };
})(typeof window !== 'undefined' ? window : this);
