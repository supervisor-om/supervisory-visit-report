// ============================================================================
//  visit-nav.js — التنقّل بين الزيارات من داخل الزيارة المفتوحة (2026-10-31)
//
//  طلب المشرف: «أدخل زيارة معلّم، ومن داخلها أذهب إلى زيارةٍ أخرى بلا خروجٍ ثمّ
//  دخول» — في الزيارات الإشرافيّة والمدرسيّة. شريطٌ أعلى النموذج فيه:
//    • «الأحدث» و«الأقدم» بترتيب الأرشيف نفسه (الأحدث أوّلاً) وموضع الزيارة فيه؛
//    • بحثٌ باسم المعلّم أو المدرسة أو التاريخ يفتح ما يُختار مباشرةً.
//  وقبل الانتقال: إن تغيّر في النموذج شيءٌ منذ فُتح أو حُفظ يُستأذن (لا يُحفظ عنه).
//
//  المحرّك نقيٌّ (list/search/neighbors) ويُصدَّر لـnode؛ الواجهة تُبنى في المتصفّح.
// ============================================================================

(function (root) {
    'use strict';

    const KINDS = {
        sup: {
            re: /^(supervision_v6_visit_|visit_v5_)/,
            name: d => d.teacherName || (d.formData && d.formData.teacherName) || '',
            sub: d => {
                const fd = (d.formData && typeof d.formData === 'object') ? d.formData : {};
                const bits = [d.school || fd.school || ''];
                if (fd.class) bits.push('الصف ' + fd.class);
                if (fd.lesson) bits.push('الحصة ' + fd.lesson);
                return bits.filter(Boolean).join(' · ');
            }
        },
        school: {
            re: /^(supervision_v6_school_report_|school_report_)/,
            name: d => d.schoolName || d.school || '',
            sub: d => {
                const T = (typeof schoolVisitTypesData !== 'undefined' && schoolVisitTypesData) || {};
                return (T[d.visitType] && T[d.visitType].name) || '';
            }
        }
    };

    function norm(s) {
        if (root.SupervisorIdentity && typeof root.SupervisorIdentity.normalize === 'function') {
            try { return root.SupervisorIdentity.normalize(String(s || '')).toLowerCase(); } catch (e) {}
        }
        return String(s || '')
            .replace(/[ـً-ْ]/g, '')
            .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
            .replace(/\s+/g, ' ').trim().toLowerCase();
    }
    const pdOf = iso => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso).split('-').reverse().join('/') : String(iso || '');

    // الزيارات بترتيب الأرشيف: التاريخ الأحدث أوّلاً، ثمّ الأحدث حفظاً (المفتاح يحمل وقته)
    function list(kind, storage) {
        const K = KINDS[kind];
        const st = storage || root.localStorage;
        const out = [];
        if (!K || !st) return out;
        for (let i = 0; i < st.length; i++) {
            const key = st.key(i);
            if (!K.re.test(key || '')) continue;
            let d = null;
            try { d = JSON.parse(st.getItem(key)); } catch (e) {}
            if (!d || typeof d !== 'object' || d.deleted) continue;
            const date = String(d.visitDate || '');
            out.push({ key, name: String(K.name(d) || '').trim(), sub: String(K.sub(d) || '').trim(), date, pd: pdOf(date) });
        }
        const t = s => { const v = new Date(s).getTime(); return isNaN(v) ? 0 : v; };
        const n = k => Number((String(k).match(/(\d+)$/) || [0, 0])[1]) || 0;
        out.sort((a, b) => (t(b.date) - t(a.date)) || (n(b.key) - n(a.key)) || (a.key < b.key ? 1 : -1));
        return out;
    }

    // كلّ كلمات البحث في الاسم أو ما تحته أو التاريخ (بأيّ صيغتيه)
    function search(items, q, max) {
        const words = norm(q).split(' ').filter(Boolean);
        if (!words.length) return [];
        const hits = items.filter(it => {
            const hay = norm([it.name, it.sub, it.date, it.pd].join(' '));
            return words.every(w => hay.includes(w));
        });
        return hits.slice(0, max || 8);
    }

    // موضع الزيارة المفتوحة: الأحدث منها (قبلها في الترتيب) والأقدم (بعدها)
    function neighbors(items, key) {
        const i = items.findIndex(it => it.key === key);
        return {
            i, n: items.length,
            newer: i > 0 ? items[i - 1] : null,
            older: i > -1 && i < items.length - 1 ? items[i + 1] : null
        };
    }

    const api = { list, search, neighbors, norm, KINDS };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfVisitNav = api;

    /* ─────────────────────────── الواجهة ─────────────────────────── */
    const doc = root.document;
    if (!doc) return;
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'));
    const UI = {
        sup:    { box: 'supVisitNav', form: '#form-view', current: () => (typeof currentEditingKey !== 'undefined' ? currentEditingKey : null) || null },
        school: { box: 'schoolVisitNav', form: '#reportForm', current: () => ((doc.getElementById('reportId') || {}).value || '').trim() || null }
    };
    const base = { sup: null, school: null };
    const timers = {};

    // لقطة النموذج: كلّ حقلٍ بمعرّفه (والمختار)، ودرجات البنود وأوصافها، والمواقف الصفّيّة والطاقم
    function snap(kind) {
        const f = doc.querySelector(UI[kind].form);
        if (!f) return '';
        const parts = [];
        f.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.closest('.svf-vnav')) return;
            const id = el.id || el.name || '';
            if (!id) return;
            parts.push(id + '=' + ((el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') + ':' + el.value : el.value));
        });
        if (kind === 'sup') f.querySelectorAll('[id^="score-"], [id^="notes-"]').forEach(el => parts.push(el.id + '=' + el.textContent));
        if (kind === 'school') {
            try { parts.push('cv=' + JSON.stringify(typeof schoolClassroomVisits !== 'undefined' ? schoolClassroomVisits : [])); } catch (e) {}
            try { parts.push('tc=' + JSON.stringify(typeof schoolTeachers !== 'undefined' ? schoolTeachers : [])); } catch (e) {}
        }
        return parts.join('\u0001');
    }
    // خطّ الأساس بعد أن تهدأ الكتابة الآليّة (الإكمال، رقم الزيارة، الأوصاف المولَّدة)
    function rebase(kind, ms) {
        clearTimeout(timers[kind]);
        timers[kind] = setTimeout(() => { base[kind] = snap(kind); }, ms == null ? 700 : ms);
    }
    function dirty(kind) {
        if (base[kind] == null) return false;
        return snap(kind) !== base[kind];
    }

    function go(kind, key) {
        if (!key || key === UI[kind].current()) return;
        if (dirty(kind) && !root.confirm('في هذه الزيارة تعديلاتٌ لم تُحفظ.\n\nأتنتقل إلى الزيارة الأخرى وتتركها؟ (اضغط «إلغاء» لتبقى وتحفظها أوّلاً)')) return;
        if (kind === 'sup') { if (typeof root.loadPermanentReport === 'function') root.loadPermanentReport(key); }
        else if (typeof root.editSchoolReport === 'function') root.editSchoolReport(key);
        refresh(kind);
        try { root.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { try { root.scrollTo(0, 0); } catch (er) {} }
    }

    function ensure(kind) {
        let box = doc.getElementById(UI[kind].box);
        if (box) return box;
        const host = kind === 'sup' ? doc.querySelector('#form-view > .svf-head') : doc.querySelector('#schoolFormView > header.svf-head');
        if (!host) return null;
        box = doc.createElement('div');
        box.id = UI[kind].box;
        box.className = 'svf-vnav hidden';
        box.innerHTML = `
            <button type="button" class="svf-btn svf-btn-ghost svf-btn-sm vnav-newer" data-vnav="newer" title="الزيارة الأحدث في الأرشيف"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>الأحدث</button>
            <div class="vnav-find">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" autocomplete="off" class="vnav-q" aria-label="انتقل إلى زيارة">
                <div class="vnav-res hidden" role="listbox"></div>
            </div>
            <span class="vnav-pos text-xs text-slate-500"></span>
            <button type="button" class="svf-btn svf-btn-ghost svf-btn-sm vnav-older" data-vnav="older" title="الزيارة الأقدم في الأرشيف">الأقدم<i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>`;
        host.insertAdjacentElement('afterend', box);
        const q = box.querySelector('.vnav-q'), res = box.querySelector('.vnav-res');
        let hits = [], sel = -1;
        const close = () => { res.classList.add('hidden'); res.innerHTML = ''; hits = []; sel = -1; };
        const draw = () => {
            const items = list(kind);
            hits = search(items, q.value, 8);
            const cur = UI[kind].current();
            if (!q.value.trim()) { close(); return; }
            res.innerHTML = hits.length ? hits.map((h, i) => `<button type="button" role="option" class="vnav-hit${i === sel ? ' is-sel' : ''}" data-key="${esc(h.key)}">
                    <span class="vnav-hit-name">${esc(h.name || 'بلا اسم')}${h.key === cur ? ' <em>مفتوحة</em>' : ''}</span>
                    <span class="vnav-hit-sub">${h.sub ? esc(h.sub) + ' · ' : ''}<bdi>${esc(h.date || '')}</bdi></span></button>`).join('')
                : '<div class="vnav-none">لا زيارة تطابق ما كتبت</div>';
            res.classList.remove('hidden');
        };
        q.addEventListener('input', () => { sel = -1; draw(); });
        q.addEventListener('focus', () => { if (q.value.trim()) draw(); });
        q.addEventListener('keydown', e => {
            if (e.key === 'Escape') { q.value = ''; close(); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!hits.length) return;
                e.preventDefault();
                sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
                draw();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const h = hits[sel > -1 ? sel : 0];
                if (h) { q.value = ''; close(); q.blur(); go(kind, h.key); }
            }
        });
        res.addEventListener('mousedown', e => e.preventDefault());   // يبقى التركيز فلا يُغلق قبل النقر
        res.addEventListener('click', e => {
            const b = e.target.closest('.vnav-hit');
            if (!b) return;
            q.value = ''; close(); q.blur();
            go(kind, b.dataset.key);
        });
        q.addEventListener('blur', () => setTimeout(close, 120));
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-vnav]');
            if (!b || b.disabled) return;
            const nb = neighbors(list(kind), UI[kind].current());
            const t = b.dataset.vnav === 'newer' ? nb.newer : nb.older;
            if (t) go(kind, t.key);
        });
        return box;
    }

    // opts.rebase: فُتحت زيارةٌ أو حُفظت أو بدأ نموذجٌ جديد ← ما في النموذج الآن هو «المحفوظ». وتنقّلٌ بين التبويبات
    // أو رجوعٌ من المعاينة لا يمسّ خطّ الأساس، وإلّا عُدّ ما لم يُحفظ محفوظاً.
    function refresh(kind, opts) {
        const box = ensure(kind);
        if (opts && opts.rebase) rebase(kind);
        if (!box) return;
        const items = list(kind);
        if (!items.length) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        const cur = UI[kind].current();
        const nb = neighbors(items, cur);
        const open = nb.i > -1;
        box.classList.toggle('is-open', open);
        const q = box.querySelector('.vnav-q');
        q.placeholder = kind === 'sup'
            ? (open ? 'انتقل إلى زيارة: اسم المعلم أو المدرسة أو التاريخ' : 'افتح زيارة محفوظة: اسم المعلم أو المدرسة أو التاريخ')
            : (open ? 'انتقل إلى زيارة: اسم المدرسة أو التاريخ' : 'افتح زيارة محفوظة: اسم المدرسة أو التاريخ');
        const newer = box.querySelector('.vnav-newer'), older = box.querySelector('.vnav-older');
        newer.disabled = !nb.newer; older.disabled = !nb.older;
        newer.title = nb.newer ? 'الأحدث: ' + nb.newer.name + ' — ' + nb.newer.date : 'هذه أحدث زيارة';
        older.title = nb.older ? 'الأقدم: ' + nb.older.name + ' — ' + nb.older.date : 'هذه أقدم زيارة';
        box.querySelector('.vnav-pos').textContent = open ? (nb.i + 1) + ' من ' + nb.n : '';
    }

    root.svfVisitNavRefresh = refresh;
    root.svfVisitNavDirty = dirty;
    root.svfVisitNavGo = go;
})(typeof window !== 'undefined' ? window : globalThis);
