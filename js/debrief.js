// =========================================================================
// المداولة الإشرافيّة — الشاشة (منذ 2026-10-13)
//
// تبويب «المداولة» في الزيارات الإشرافيّة: يقرأ الزيارة المفتوحة في النموذج (الدرجات والأوصاف والمعلّم والدرس
// والجنس، وتوصيات زيارته السابقة)، ويبني دليل حوارٍ بأسلوبٍ يختاره المشرف (المحرّك في debrief-core.js).
// ما يدور يُكتب في الدليل نفسه، وحالته في #debriefData — حقلٌ مخفيٌّ داخل #form-view فيُحفظ مع التقرير
// ويُستعاد بفتحه ويُصفَّر بتصفير النموذج، ويمرّ بالمزامنة السحابيّة كبقيّة الحقول.
// =========================================================================
(function (root) {
    'use strict';

    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s) : String(s == null ? '' : s));
    const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const $ = id => document.getElementById(id);
    const D = () => root.SvfDebrief;

    function readState() {
        try { const v = JSON.parse(($('debriefData') || {}).value || 'null'); if (v && typeof v === 'object') return v; } catch (e) {}
        return { method: '', focus: [], strengths: [], answers: {}, asked: {}, agree: {} };
    }
    function writeState(st) { const el = $('debriefData'); if (el) el.value = JSON.stringify(st); }

    // الزيارة من النموذج المفتوح
    function visit() {
        // evaluationItems وcurrentEditingKey تصريحاتٌ عامّة (const/let) لا خصائص window — كما في teacher-brief.js
        const items = (typeof evaluationItems !== 'undefined' ? evaluationItems : []).map(it => ({
            id: it.id, title: it.title, standard: it.standard,
            score: parseInt((($('score-' + it.id) || {}).textContent || ''), 10),
            notes: clean((($('notes-' + it.id) || {}).textContent || ''))
        }));
        const teacher = clean(($('teacherName') || {}).value);
        let prevRecs = [];
        try {
            const prev = typeof root.supPreviousVisits === 'function' ? root.supPreviousVisits(teacher, typeof currentEditingKey !== 'undefined' ? currentEditingKey : null)[0] : null;
            const r = prev && prev.data && prev.data.formData ? prev.data.formData.recommendationsContent : '';
            prevRecs = String(r || '').split('\n').map(l => clean(l).replace(/^[•\-–]\s*/, ''))
                .filter(l => l && !/^و?نوصي/.test(l) && !/^والله الموفق/.test(l));
        } catch (e) {}
        return {
            teacher, date: clean(($('visitDate') || {}).value), topic: clean(($('topic') || {}).value), cls: clean(($('class') || {}).value),
            female: typeof root.getSupervisoryGender === 'function' && root.getSupervisoryGender() === 1, items, prevRecs
        };
    }
    const pupil = t => (typeof root.supLowerGrade === 'function' && root.supLowerGrade() && typeof root.svfPupilText === 'function') ? root.svfPupilText(t) : t;

    function render() {
        const box = $('debriefBody');
        if (!box || !D()) return;
        const v = visit(), st = readState();
        if (!v.teacher) { box.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">اكتب اسم المعلّم وقيّم البنود في «نموذج التقييم»، أو افتح زيارةً محفوظةً من الأرشيف، ثمّ عد إلى هنا.</div>'; return; }
        const plan = D().buildPlan(v, { method: st.method, focus: st.focus, strengths: st.strengths });
        const allThree = v.items.length && v.items.every(x => x.score === 3);
        const chip = (x, on, kind) => `<button type="button" data-${kind}="${x.id}" class="text-xs rounded-full px-3 py-1 border font-bold ${on ? (kind === 'focus' ? 'bg-amber-500 text-white border-amber-500' : 'bg-emerald-600 text-white border-emerald-600') : 'bg-white text-slate-600 border-slate-200'}">${esc(x.standard)} <span class="opacity-70 font-normal">${esc(D().LEVELS[x.score] || '')}</span></button>`;
        const sugg = D().STYLES[plan.style.id].method;

        let h = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div><div class="text-lg font-bold text-slate-800">${esc(v.teacher)}</div>
                <div class="text-sm text-slate-500">${esc([v.topic && 'درس: ' + v.topic, v.cls && 'الصف: ' + v.cls, v.date].filter(Boolean).join(' · '))}</div></div>
              <div class="text-left"><span class="inline-block text-xs font-bold rounded-full px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200">النمط المقترح: ${esc(plan.style.label)}</span></div>
            </div>
            <p class="text-xs text-slate-500 mt-2 leading-6"><i class="fa-solid fa-circle-info ml-1 text-indigo-400"></i>${esc(D().g(plan.style.why, v.female))}</p>
            ${allThree ? '<p class="mt-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">كلّ البنود «ملائم» — قيّم الزيارة أوّلاً ليُبنى الدليل على أدلّتها.</p>' : ''}
            <div class="mt-4 text-xs font-bold text-slate-600 mb-2">أسلوب المداولة</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">${D().METHODS.map(m => `<button type="button" data-method="${m.id}"
                class="text-right rounded-xl border p-3 ${m.id === plan.method.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300'}">
                <div class="text-sm font-bold text-slate-800">${esc(m.label)}${m.id === sugg ? ' <span class="text-[10px] text-indigo-600">(مقترح)</span>' : ''}</div>
                <div class="text-[11px] text-slate-500 leading-5 mt-1">${esc(m.short)}</div><div class="text-[10px] text-slate-400 mt-1">~${m.minutes} دقيقة</div></button>`).join('')}</div>
            <div class="mt-4 grid md:grid-cols-2 gap-3">
              <div><div class="text-xs font-bold text-amber-700 mb-1">محور التطوير (بندٌ أو بندان)</div><div class="flex flex-wrap gap-1.5">${v.items.filter(x => x.score >= 3).sort((a, b) => b.score - a.score).map(x => chip(x, plan.focus.some(f => f.id === x.id), 'focus')).join('') || '<span class="text-xs text-slate-400">لا بنود دون «جيد»</span>'}</div></div>
              <div><div class="text-xs font-bold text-emerald-700 mb-1">جوانب الإجادة للتعزيز</div><div class="flex flex-wrap gap-1.5">${v.items.filter(x => x.score <= 2).sort((a, b) => a.score - b.score).map(x => chip(x, plan.strengths.some(f => f.id === x.id), 'strength')).join('') || '<span class="text-xs text-slate-400">لا بنود «متميز» أو «جيد»</span>'}</div></div>
            </div></div>`;

        plan.stages.forEach((s, i) => {
            h += `<div class="bg-white rounded-2xl border border-slate-200 p-5 debrief-stage">
              <div class="flex items-center gap-3 mb-2"><span class="w-7 h-7 rounded-full bg-slate-800 text-white text-sm font-bold flex items-center justify-center flex-none">${i + 1}</span>
                <h3 class="font-bold text-slate-800">${esc(s.title)}</h3></div>
              ${s.hint ? `<p class="text-xs text-slate-500 mb-3 leading-6"><i class="fa-solid fa-user-tie ml-1 text-slate-400"></i>${esc(D().g(s.hint, v.female))}</p>` : ''}
              ${(s.evidence || []).length ? `<div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3"><div class="text-[11px] font-bold text-slate-500 mb-1">ما رصدتُه في الحصة</div>${s.evidence.map(e => `<div class="text-sm text-slate-700 leading-7">• ${esc(pupil(e.text))}</div>`).join('')}</div>` : ''}
              <div class="space-y-2">${s.questions.map(q => `<label class="flex items-start gap-2 debrief-q"><input type="checkbox" class="mt-1.5" data-ask="${esc(q.id)}" ${st.asked && st.asked[q.id] ? 'checked' : ''}>
                <span class="text-[15px] leading-7 text-slate-800 ${st.asked && st.asked[q.id] ? 'line-through opacity-50' : ''}">${esc(pupil(q.text))}</span></label>`).join('')}</div>
              ${(s.options || []).length ? `<details class="mt-3"><summary class="text-xs font-bold text-indigo-700 cursor-pointer">مقترحاتٌ إن احتاجها ${esc(plan.teacherWord)}</summary>
                <ul class="mt-2 space-y-1">${s.options.map(o => `<li class="text-sm text-slate-700">◦ ${esc(pupil(o.text))}</li>`).join('')}</ul></details>` : ''}
              ${(s.goals || []).length ? `<div class="mt-3 flex flex-wrap gap-1.5"><span class="text-[11px] text-slate-500">صيغة هدف:</span>${s.goals.map(t => `<button type="button" data-goal="${esc(t)}" class="text-[11px] rounded-lg px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200">${esc(pupil(t))}</button>`).join('')}</div>` : ''}
              <textarea data-ans="${esc(s.id)}" rows="2" placeholder="ما قاله ${esc(plan.teacherWord)} / ملاحظاتك" class="mt-3 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">${esc((st.answers || {})[s.id] || '')}</textarea>
            </div>`;
        });

        const a = st.agree || {};
        const fld = (k, label, ph) => `<div><label class="block text-xs font-bold text-slate-500 mb-1">${label}</label><input data-agree="${k}" value="${esc(a[k] || '')}" placeholder="${ph}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"></div>`;
        h += `<div class="bg-white rounded-2xl border-2 border-amber-200 p-5">
            <h3 class="font-bold text-slate-800 mb-3"><i class="fa-solid fa-handshake ml-2 text-amber-500"></i>الاتّفاق</h3>
            <div class="grid md:grid-cols-2 gap-3">${fld('goal', 'الهدف', 'ما الذي سيتغيّر؟')}${fld('action', 'الإجراء', 'كيف؟')}${fld('indicator', 'مؤشّر النجاح', 'كيف سنعرف أنّه تحقّق؟')}${fld('date', 'موعد المتابعة', 'مثلاً: الزيارة القادمة / بعد أسبوعين')}${fld('support', 'الدعم من المشرف', 'درسٌ تطبيقيّ، مرجع، زيارة تبادليّة…')}</div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-2 items-center sticky bottom-3 shadow-sm">
            <button type="button" id="debriefCopy" class="text-sm bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-2 font-bold"><i class="fa-regular fa-copy ml-1"></i>نسخ الملخّص</button>
            <button type="button" id="debriefWord" class="text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-2 font-bold"><i class="fa-solid fa-file-word ml-1"></i>حفظ Word</button>
            <button type="button" id="debriefToRecs" class="text-sm bg-amber-500 text-white rounded-lg px-3 py-2 font-bold"><i class="fa-solid fa-arrow-down-short-wide ml-1"></i>إدراج الاتّفاق في التوصيات</button>
            <button type="button" id="debriefBig" class="text-sm bg-slate-100 rounded-lg px-3 py-2 font-bold">${box.classList.contains('debrief-big') ? 'خطٌّ عاديّ' : 'خطٌّ كبير (أثناء الحوار)'}</button>
            <span class="text-[11px] text-slate-400 mr-auto">يُحفظ الدليل مع الزيارة عند «حفظ التقرير»</span>
          </div>`;
        box.innerHTML = h;
        root.__svfDebriefPlan = { plan, v };
    }

    function update(fn, rerender) {
        const st = readState(); fn(st); writeState(st);
        if (rerender) render();
    }

    function summaryText() {
        const P = root.__svfDebriefPlan;
        if (!P) return '';
        return D().summaryLines(P.plan, readState(), P.v).map(pupil).join('\n');
    }

    function bind() {
        const box = $('debriefBody');
        if (!box || box.dataset.bound) return;
        box.dataset.bound = '1';
        box.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.method) update(st => { st.method = b.dataset.method; }, true);
            else if (b.dataset.focus) update(st => {
                const P = root.__svfDebriefPlan, id = +b.dataset.focus;
                let f = (st.focus && st.focus.length ? st.focus : P.plan.focus.map(x => x.id)).slice();
                f = f.includes(id) ? f.filter(x => x !== id) : f.concat(id).slice(-3);
                st.focus = f.length ? f : [];
            }, true);
            else if (b.dataset.strength) update(st => {
                const P = root.__svfDebriefPlan, id = +b.dataset.strength;
                let f = (st.strengths && st.strengths.length ? st.strengths : P.plan.strengths.map(x => x.id)).slice();
                f = f.includes(id) ? f.filter(x => x !== id) : f.concat(id).slice(-3);
                st.strengths = f;
            }, true);
            else if (b.dataset.goal) { update(st => { st.agree = Object.assign({}, st.agree, { goal: pupil(b.dataset.goal) }); }, true); }
            else if (b.id === 'debriefCopy') {
                const t = summaryText();
                (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => root.showToast && showToast('نُسخ ملخّص المداولة'),
                    () => root.showToast && showToast('تعذّر النسخ', 'error'));
            }
            else if (b.id === 'debriefWord') exportWord();
            else if (b.id === 'debriefToRecs') toRecs();
            else if (b.id === 'debriefBig') { box.classList.toggle('debrief-big'); render(); }
        });
        box.addEventListener('change', e => {
            const el = e.target;
            if (el.dataset.ask) update(st => { st.asked = Object.assign({}, st.asked, { [el.dataset.ask]: el.checked }); }, true);
        });
        box.addEventListener('input', e => {
            const el = e.target;
            if (el.dataset.ans) update(st => { st.answers = Object.assign({}, st.answers, { [el.dataset.ans]: el.value }); });
            else if (el.dataset.agree) update(st => { st.agree = Object.assign({}, st.agree, { [el.dataset.agree]: el.value }); });
        });
    }

    function toRecs() {
        const line = pupil(D().agreementRec(readState()));
        if (!line) { root.showToast && showToast('اكتب الهدف أو الإجراء في «الاتّفاق» أوّلاً', 'error'); return; }
        const ta = $('recommendationsContent');
        if (!ta) return;
        if (ta.value.includes(line)) { root.showToast && showToast('الاتّفاق في التوصيات أصلاً'); return; }
        ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + line : line;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        root.showToast && showToast('أُدرج الاتّفاق في «التوصيات» — راجعه في نموذج التقييم');
    }

    function exportWord() {
        if (typeof htmlDocx === 'undefined') { root.showToast && showToast('تعذّر تحميل مكتبة Word — تحقّق من الاتصال', 'error'); return; }
        const P = root.__svfDebriefPlan; if (!P) return;
        const st = readState(), p = (t, x) => `<p dir="rtl" style="margin:0 0 6pt;font-family:Arial;font-size:13pt;${x || ''}">${esc(t)}</p>`;
        let h = p('دليل المداولة الإشرافيّة', 'font-size:16pt;font-weight:bold;text-align:center;')
            + p([P.v.teacher, P.v.topic && 'درس: ' + P.v.topic, P.v.cls && 'الصف: ' + P.v.cls, P.v.date].filter(Boolean).join(' — '), 'text-align:center;')
            + p('الأسلوب: ' + P.plan.method.label + ' · النمط: ' + P.plan.style.label, 'text-align:center;color:#555;');
        P.plan.stages.forEach((s, i) => {
            h += p((i + 1) + '. ' + s.title, 'font-weight:bold;margin-top:10pt;');
            (s.evidence || []).forEach(e => { h += p('◦ ' + pupil(e.text), 'font-size:11pt;color:#444;'); });
            s.questions.forEach(q => { h += p('□ ' + pupil(q.text)); });
            const ans = clean((st.answers || {})[s.id]);
            h += p('ما دار: ' + (ans || '……………………………………………………'), 'color:#333;');
        });
        const a = st.agree || {};
        h += p('الاتّفاق', 'font-weight:bold;margin-top:12pt;');
        [['الهدف', a.goal], ['الإجراء', a.action], ['مؤشّر النجاح', a.indicator], ['موعد المتابعة', a.date], ['الدعم من المشرف', a.support]]
            .forEach(([k, x]) => { h += p(k + ': ' + (clean(x) || '……………………………………')); });
        const blob = htmlDocx.asBlob(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body dir="rtl">${h}</body></html>`,
            { orientation: 'portrait', margins: { top: 900, bottom: 900, left: 900, right: 900 } });
        const url = URL.createObjectURL(blob), el = document.createElement('a');
        el.href = url; el.download = ('مداولة - ' + P.v.teacher + (P.v.date ? ' - ' + P.v.date : '')).replace(/[\\/:*?"<>|]/g, '-') + '.docx';
        document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        root.showToast && showToast('حُفظ دليل المداولة بصيغة Word');
    }

    root.svfDebriefOpen = function () { bind(); render(); };
})(typeof window !== 'undefined' ? window : this);
