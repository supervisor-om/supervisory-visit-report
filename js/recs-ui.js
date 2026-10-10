// =========================================================================
// واجهة منشئ التوصيات (تعتمد على js/recs.js)
//
// تكتب في حقل «التوصيات» ولا تحلّ محلّه: من كتب بيده بقي ما كتب، والتوليد
// يستأذن قبل أن يطمس نصّاً لم يخرج من المنشئ.
// =========================================================================
(function () {
    'use strict';

    const R = window.SchoolRecs;
    const el = id => document.getElementById(id);
    const EQ_KEY = 'svf_recs_equipment';     // أدواتٌ أضافها المشرف إلى القائمة
    const BANK_KEY = 'svf_recs_bank';        // بنك توصيات المشرف: [{text, audience}]
    const COUNT_KEY = 'svf_recs_free_counts'; // كم مرّةً أُدرجت كلّ توصيةٍ حرّة — للاقتراح بحفظها
    let recsGen = { gen: [], off: [] };   // آخر توليدٍ وما حذفه المشرف منه — بهما يبقى ما كتبه بيده (R.mergeRecs)

    let list = [];        // التوصيات المضافة لهذه الزيارة
    let draft = { category: 'equipment', items: {}, options: [], deadline: '', who: '', text: '' };

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const readJSON = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
    const equipmentList = () => [...R.EQUIPMENT, ...(readJSON(EQ_KEY, []) || [])];

    const roster = () => (typeof schoolTeachers !== 'undefined' && Array.isArray(schoolTeachers)) ? schoolTeachers : [];
    // جهة المعلّمين من الطاقم المكتوب أو من قاعدة المعلّمين (كنوع الكادر في school.js)
    function teacherAudience() {
        try {
            if (typeof staffForSchool === 'function' && typeof staffGenderMode === 'function') {
                const m = staffGenderMode(staffForSchool().list);
                if (m) return ['المعلمين', 'المعلم', 'المعلمات', 'المعلمة'][m.mode];
            }
        } catch (e) {}
        return R.audienceFromRoster(roster());
    }
    const opinionText = () => (el('visitorOpinion') && el('visitorOpinion').value) || '';
    const classroom = () => (typeof schoolClassroomVisits !== 'undefined' && Array.isArray(schoolClassroomVisits)) ? schoolClassroomVisits : [];
    const prevRecs = () => (typeof prevRecommendationsStatus !== 'undefined' && Array.isArray(prevRecommendationsStatus)) ? prevRecommendationsStatus : [];

    // الأهداف المؤشَّرة التي عليها ملاحظة — منها تُقترح التوصيات
    function notedObjectives() {
        try {
            return (collectCheckedObjectivesWithNotes() || []).filter(i => i.note).map(i => i.text);
        } catch (e) { return []; }
    }

    // ─────────────────────────────── الرسم
    function render() {
        const host = el('recsBuilder');
        if (!host) return;
        const cats = R.CATEGORIES.map(c =>
            `<button type="button" data-cat="${c.id}" class="rb-cat text-xs px-3 py-1.5 rounded-full border transition-all ${
                draft.category === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 hover:border-blue-400'}">${esc(c.label)}</button>`).join('');

        const deadlines = R.DEADLINES.map(d =>
            `<button type="button" data-dl="${d.id}" class="rb-dl text-xs px-3 py-1 rounded-full border ${
                draft.deadline === d.id ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-slate-200 hover:border-amber-400'}">${esc(d.label)}</button>`).join('');

        host.innerHTML = `
          <div class="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-slate-500">الموضوع:</span>${cats}
            </div>
            <div id="rbPanel"></div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-slate-500">المدّة:</span>${deadlines}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-slate-500">نوصي:</span>
              ${R.categoryOf(draft.category).id === 'free'
                ? `<select id="rbAudience" class="text-xs border border-slate-200 rounded-lg px-2 py-1.5">
                    ${R.AUDIENCES.map(a => `<option ${a === (draft.audience || 'إدارة المدرسة') ? 'selected' : ''}>${esc(a)}</option>`).join('')}
                  </select>`
                : `<span class="text-xs text-slate-600">${esc(R.audienceOf(draftRec()))}</span>`}
              <button type="button" id="rbAdd" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg mr-auto">
                <i class="fa-solid fa-plus ml-1"></i>أضف التوصية</button>
            </div>
            <div id="rbPreview" class="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-2 leading-6"></div>
            <div id="rbSuggest"></div>
            <div id="rbList"></div>
            <div class="flex flex-wrap gap-2 pt-1">
              <button type="button" id="rbInsert" class="text-xs bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-1.5 rounded-lg">
                <i class="fa-solid fa-file-pen ml-1"></i>إدراج في حقل التوصيات</button>
              <button type="button" id="rbClear" class="text-xs border border-slate-200 hover:border-red-400 px-3 py-1.5 rounded-lg">تفريغ القائمة</button>
            </div>
          </div>`;

        renderPanel(); renderPreview(); renderList(); renderSuggest();
        host.querySelectorAll('.rb-cat').forEach(b => b.addEventListener('click', () => {
            draft = { category: b.dataset.cat, items: {}, options: [], deadline: draft.deadline, who: draft.who, text: '' };
            render();
        }));
        host.querySelectorAll('.rb-dl').forEach(b => b.addEventListener('click', () => { draft.deadline = b.dataset.dl; render(); }));
        if (el('rbAudience')) el('rbAudience').addEventListener('change', e => { draft.audience = e.target.value; renderPreview(); });
        el('rbAdd').addEventListener('click', addDraft);
        el('rbInsert').addEventListener('click', insertIntoField);
        el('rbClear').addEventListener('click', () => { list = []; renderList(); renderPreview(); });
    }


    function renderPanel() {
        const cat = R.categoryOf(draft.category), p = el('rbPanel');
        if (!p) return;

        if (cat.picker === 'equipment') {
            p.innerHTML = `
              <div class="bg-white border border-slate-200 rounded-lg p-3">
                <div class="flex flex-wrap gap-2 mb-2 text-xs">
                  <label class="flex items-center gap-1"><input type="checkbox" id="rbPerList" ${draft.perList !== false ? 'checked' : ''}> حسب الكشف المرفق</label>
                  <label class="flex items-center gap-1"><input type="checkbox" id="rbExtra" ${draft.extra !== false ? 'checked' : ''}> بالإضافة لباقي الأدوات</label>
                  <label class="flex items-center gap-1"><input type="checkbox" id="rbPlayground" ${draft.playground ? 'checked' : ''}> وتجديد تخطيط الملعب</label>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 max-h-56 overflow-y-auto">
                  ${equipmentList().map((name, i) => {
                    const on = draft.items[name] != null;
                    return `<label class="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1">
                        <input type="checkbox" class="rb-eq" data-name="${esc(name)}" ${on ? 'checked' : ''}>
                        <span class="flex-1">${esc(name)}</span>
                        <input type="number" min="1" max="99" value="${on ? draft.items[name] : 1}" data-count="${esc(name)}"
                               class="rb-eqn w-12 text-center border border-slate-200 rounded ${on ? '' : 'opacity-40'}"></label>`;
                  }).join('')}
                </div>
                <div class="flex gap-2 mt-2">
                  <input id="rbEqNew" type="text" placeholder="أضف أداة غير موجودة…" class="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5">
                  <button type="button" id="rbEqAdd" class="text-xs border border-slate-200 rounded-lg px-3">إضافة</button>
                </div>
              </div>`;
            p.querySelectorAll('.rb-eq').forEach(c => c.addEventListener('change', () => {
                const n = c.dataset.name;
                if (c.checked) draft.items[n] = Number(p.querySelector(`[data-count="${CSS.escape(n)}"]`).value) || 1;
                else delete draft.items[n];
                renderPanel(); renderPreview();
            }));
            p.querySelectorAll('.rb-eqn').forEach(i => i.addEventListener('input', () => {
                const n = i.dataset.count;
                if (draft.items[n] != null) { draft.items[n] = Number(i.value) || 1; renderPreview(); }
            }));
            ['rbPerList', 'rbExtra', 'rbPlayground'].forEach(id => el(id) && el(id).addEventListener('change', e => {
                draft[id.replace('rb', '').replace(/^./, c => c.toLowerCase())] = e.target.checked; renderPreview();
            }));
            el('rbEqAdd').addEventListener('click', () => {
                const v = (el('rbEqNew').value || '').trim();
                if (!v) return;
                const custom = readJSON(EQ_KEY, []) || [];
                if (!equipmentList().includes(v)) { custom.push(v); try { localStorage.setItem(EQ_KEY, JSON.stringify(custom)); } catch (e) {} }
                draft.items[v] = 1; renderPanel(); renderPreview();
            });
            return;
        }

        if (cat.options) {
            const who = cat.needsWho ? `
                <select id="rbWho" class="text-xs border border-slate-200 rounded-lg px-2 py-1 mb-2">
                  ${['المعلمة', 'المعلم', 'المعلمين', 'المعلمات'].map(w =>
                    `<option ${w === (draft.who || teacherAudience()) ? 'selected' : ''}>${esc(w)}</option>`).join('')}
                </select>` : '';
            p.innerHTML = `<div class="bg-white border border-slate-200 rounded-lg p-3">${who}
                <div class="flex flex-wrap gap-2">${cat.options.map(o =>
                  `<label class="flex items-center gap-1 text-xs bg-slate-50 rounded px-2 py-1">
                     <input type="checkbox" class="rb-op" value="${o.id}" ${draft.options.includes(o.id) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
                </div></div>`;
            p.querySelectorAll('.rb-op').forEach(c => c.addEventListener('change', () => {
                draft.options = [...p.querySelectorAll('.rb-op')].filter(x => x.checked).map(x => x.value);
                renderPreview();
            }));
            if (el('rbWho')) el('rbWho').addEventListener('change', e => { draft.who = e.target.value; render(); });
            return;
        }

        p.innerHTML = `<div class="flex gap-2"><input id="rbFree" type="text" value="${esc(draft.text)}" placeholder="اكتب نصّ التوصية…"
                        class="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2">
                        <button type="button" id="rbBankSave" class="text-xs border border-emerald-300 text-emerald-800 rounded-lg px-3"
                                title="تظهر في «من بنكك» في كلّ زيارة">احفظ في بنكي</button></div>`;
        el('rbFree').addEventListener('input', e => { draft.text = e.target.value; renderPreview(); });
        el('rbBankSave').addEventListener('click', () => {
            if (bankAdd(draft.text, draft.audience)) { try { showToast('حُفظت في بنك توصياتك'); } catch (e) {} renderSuggest(); }
        });
    }

    function draftRec() {
        const cat = R.categoryOf(draft.category);
        const rec = { category: draft.category, deadline: draft.deadline };
        if (cat.picker === 'equipment') {
            rec.items = Object.entries(draft.items).map(([name, count]) => ({ name, count }));
            rec.perList = draft.perList !== false; rec.extra = draft.extra !== false; rec.playground = !!draft.playground;
        } else if (cat.options) {
            rec.options = draft.options.slice();
            if (cat.needsWho) rec.who = draft.who || teacherAudience();
        } else { rec.text = draft.text; rec.manual = true; rec.audience = draft.audience || 'إدارة المدرسة'; }
        return rec;
    }

    function renderPreview() {
        const box = el('rbPreview'); if (!box) return;
        const t = R.recText(draftRec());
        box.innerHTML = t ? `<span class="text-slate-400">معاينة:</span> ${esc(t)}` : '<span class="text-slate-400">اختر ما توصي به لتظهر المعاينة</span>';
    }

    function renderList() {
        const box = el('rbList'); if (!box) return;
        if (!list.length) { box.innerHTML = ''; return; }
        box.innerHTML = `<div class="space-y-1">${list.map((r, i) =>
            `<div class="flex items-start gap-2 text-xs bg-white border border-slate-200 rounded-lg p-2">
               <span class="font-bold text-slate-400">${i + 1}</span>
               <span class="flex-1 leading-6">${esc(R.recText(r))} <span class="text-slate-400">— ${esc(R.audienceOf(r))}</span></span>
               <button type="button" data-del="${i}" class="rb-del text-slate-400 hover:text-red-600"><i class="fa-solid fa-xmark"></i></button>
             </div>`).join('')}</div>`;
        box.querySelectorAll('.rb-del').forEach(b => b.addEventListener('click', () => { list.splice(+b.dataset.del, 1); renderList(); }));
    }

    function renderSuggest() {
        const box = el('rbSuggest'); if (!box) return;
        const s = R.suggest({ notedObjectives: notedObjectives(), roster: roster(), classroomVisits: classroom() });
        const carry = R.carryOver(prevRecs());
        const fromOp = R.suggestFromOpinion(opinionText(), teacherAudience())
            .filter(x => !list.some(r => R.recText(r) === R.recText(x.rec)));
        const bank = bankList();
        const repeated = repeatedFree().filter(t => !bank.some(b => b.text === t));
        if (!s.length && !carry.length && !fromOp.length && !bank.length && !repeated.length) { box.innerHTML = ''; return; }
        box.innerHTML = `<div class="text-xs space-y-2">
            ${fromOp.length ? `<div class="flex flex-wrap items-center gap-2"><span class="font-bold text-indigo-700">من رأي الزائر:</span>
              ${fromOp.map((x, i) => `<button type="button" data-op="${i}" class="rb-op-sug bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full px-3 py-1"
                  title="${esc(x.why)}">${esc(R.recText(x.rec).slice(0, 60))} — ${esc(R.audienceOf(x.rec))}</button>`).join('')}</div>` : ''}
            ${bank.length ? `<div class="flex flex-wrap items-center gap-2"><span class="font-bold text-emerald-700">من بنكك:</span>
              ${bank.map((b, i) => `<span class="inline-flex items-center bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full">
                  <button type="button" data-bank="${i}" class="rb-bank px-3 py-1">${esc(b.text.slice(0, 50))}</button>
                  <button type="button" data-bankdel="${i}" class="rb-bankdel pl-2 text-emerald-500 hover:text-red-600" title="احذفها من البنك">×</button></span>`).join('')}</div>` : ''}
            ${repeated.length ? `<div class="flex flex-wrap items-center gap-2"><span class="font-bold text-slate-500">تكرّرت عندك:</span>
              ${repeated.map((t, i) => `<button type="button" data-rep="${i}" class="rb-rep border border-dashed border-emerald-300 text-emerald-800 rounded-full px-3 py-1"
                  title="أدرجتها أكثر من مرّة — احفظها في بنكك">💾 ${esc(t.slice(0, 40))}</button>`).join('')}</div>` : ''}
            ${s.length ? `<div class="flex flex-wrap items-center gap-2"><span class="font-bold text-slate-500">اقتراحات:</span>
              ${s.map((x, i) => `<button type="button" data-sug="${i}" class="rb-sug bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-3 py-1"
                  title="${esc(x.why)}">${esc(R.categoryOf(x.category).label)}${x.text ? ' — ' + esc(x.text.slice(0, 30)) : ''}</button>`).join('')}</div>` : ''}
            ${carry.length ? `<div class="flex flex-wrap items-center gap-2"><span class="font-bold text-amber-700">لم تُنفَّذ سابقاً:</span>
              ${carry.map((x, i) => `<button type="button" data-carry="${i}" class="rb-carry bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-3 py-1">${esc(x.text.slice(0, 48))}</button>`).join('')}
              <button type="button" id="rbCarryAll" class="border border-amber-300 rounded-full px-3 py-1">أضف الكلّ</button></div>` : ''}
          </div>`;
        box.querySelectorAll('.rb-sug').forEach(b => b.addEventListener('click', () => {
            const x = s[+b.dataset.sug];
            if (x.text) { list.push({ category: 'free', text: x.text, manual: true }); renderList(); }
            else { draft = { category: x.category, items: {}, options: [], deadline: draft.deadline, who: x.who || '', text: '' }; render(); }
        }));
        box.querySelectorAll('.rb-carry').forEach(b => b.addEventListener('click', () => { list.push(carry[+b.dataset.carry]); renderList(); }));
        box.querySelectorAll('.rb-op-sug').forEach(b => b.addEventListener('click', () => {
            const rr = Object.assign({}, fromOp[+b.dataset.op].rec); list.push(rr); unsuppress(rr); renderList(); renderSuggest();
        }));
        box.querySelectorAll('.rb-bank').forEach(b => b.addEventListener('click', () => {
            const x = bank[+b.dataset.bank];
            list.push({ category: 'free', manual: true, text: x.text, audience: x.audience || 'إدارة المدرسة' }); renderList();
        }));
        box.querySelectorAll('.rb-bankdel').forEach(b => b.addEventListener('click', () => { bankRemove(+b.dataset.bankdel); renderSuggest(); }));
        box.querySelectorAll('.rb-rep').forEach(b => b.addEventListener('click', () => {
            if (bankAdd(repeated[+b.dataset.rep], 'إدارة المدرسة')) { try { showToast('حُفظت في بنك توصياتك'); } catch (e) {} }
            renderSuggest();
        }));
        if (el('rbCarryAll')) el('rbCarryAll').addEventListener('click', () => { carry.forEach(c => list.push(c)); renderList(); });
    }

    function addDraft() {
        const rec = draftRec();
        if (!R.recText(rec)) { try { showToast('اختر ما توصي به أوّلاً', 'error'); } catch (e) {} return; }
        list.push(rec); unsuppress(rec);
        draft = { category: draft.category, items: {}, options: [], deadline: '', who: draft.who, text: '' };
        render();
    }

    // ── البنك والتكرار ──
    function bankList() { const b = readJSON(BANK_KEY, []); return Array.isArray(b) ? b.filter(x => x && x.text) : []; }
    function bankAdd(text, audience) {
        const t = String(text || '').trim();
        if (!t) return false;
        const b = bankList();
        if (b.some(x => x.text === t)) return false;
        b.push({ text: t, audience: audience || 'إدارة المدرسة' });
        try { localStorage.setItem(BANK_KEY, JSON.stringify(b)); } catch (e) { return false; }
        return true;
    }
    function bankRemove(i) {
        const b = bankList(); b.splice(i, 1);
        try { localStorage.setItem(BANK_KEY, JSON.stringify(b)); } catch (e) {}
    }
    function countFree(recs) {
        const c = readJSON(COUNT_KEY, {}) || {};
        recs.filter(r => r.category === 'free' && r.manual && String(r.text || '').trim())
            .forEach(r => { const t = String(r.text).trim(); c[t] = (c[t] || 0) + 1; });
        try { localStorage.setItem(COUNT_KEY, JSON.stringify(c)); } catch (e) {}
    }
    const repeatedFree = () => Object.entries(readJSON(COUNT_KEY, {}) || {}).filter(([, n]) => n >= 2).map(([t]) => t).slice(0, 6);

    // ── التوليد: القائمة + ما يُضاف من خارجها، يُدمج مع ما في الحقل (R.mergeRecs) ──
    // «إدراج» و«توليد التوصيات» يمرّان هنا معاً: كان الثاني يستبدل الحقل كلّه، ويُفرغه بلا ملاحظات.
    function generate(extra) {
        const field = el('recommendations');
        if (!field) return null;
        const all = list.concat(extra || []);
        if (!all.length && !field.value.trim()) {
            try { showToast('لا توصيات — أضف من المنشئ أو اكتب ملاحظاتٍ على الأهداف', 'info'); } catch (e) {}
            return null;
        }
        const groups = R.groupRecs(all, 'إدارة المدرسة');
        const r = R.mergeRecs(field.value, recsGen, groups);
        field.value = r.text;
        recsGen = r.state;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        countFree(all);
        try {
            showToast('أُدرجت ' + r.gen.length + ' توصية' + (r.kept ? ' — وأُبقي ما كتبته بيدك (' + r.kept + ')' : ''));
        } catch (e) {}
        renderSuggest();
        return r;
    }
    function insertIntoField() {
        if (!list.length && !el('recommendations').value.trim()) { try { showToast('لا توصيات في القائمة', 'error'); } catch (e) {} return; }
        generate([]);
    }
    window.svfRecsGenerate = generate;

    // ── ما يحفظه التقرير ويستعيده ──
    window.getSchoolRecs = () => list.map(r => Object.assign({}, r, {
        text: R.recText(r),
        due: R.dueDate(r, (el('schoolVisitDate') && el('schoolVisitDate').value) || '')
    }));
    window.setSchoolRecs = arr => { list = Array.isArray(arr) ? arr.slice() : []; renderList(); };
    window.getSchoolRecsGen = () => ({ gen: recsGen.gen.slice(), off: recsGen.off.slice() });
    window.setSchoolRecsGen = v => {
        recsGen = Array.isArray(v) ? { gen: v.slice(), off: [] }
                : (v && typeof v === 'object') ? { gen: (v.gen || []).slice(), off: (v.off || []).slice() } : { gen: [], off: [] };
    };
    // ما يضيفه المشرف إلى القائمة صراحةً يُرفع عنه «المحذوف» — وإلّا لم يظهر وقد طلبه
    function unsuppress(rec) {
        const t = R.recText(rec).replace(/\.$/, '');
        recsGen.off = recsGen.off.filter(b => b.replace(/\.$/, '') !== t);
    }
    window.initRecsBuilder = function () {
        if (!el('recsBuilder') || !R) return;
        draft.who = '';   // تُشتقّ عند الحاجة من المدرسة (teacherAudience) — لا تُثبَّت قبل كتابتها
        render();
        // الاقتراحات تتبع ما يتغيّر في النموذج: الأهداف والطاقم والزيارات الصفّية
        document.addEventListener('svf-school-changed', renderSuggest);
        // واقتراحات رأي الزائر تتبع ما يُكتب فيه
        let t = null;
        if (el('visitorOpinion')) el('visitorOpinion').addEventListener('input', () => { clearTimeout(t); t = setTimeout(renderSuggest, 400); });
    };
})();
