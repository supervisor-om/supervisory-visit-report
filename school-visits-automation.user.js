// ==UserScript==
// @name          🏫 أتمتة الزيارات المدرسية - سلطنة عمان
// @namespace     supervisor-om
// @version       2.0
// @description   تعبئة نموذج الزيارة المدرسية تلقائياً بالكامل بدون تدخل
// @match         https://supervisor-om.github.io/*
// @match         https://moe.gov.om/SMS/VariousRecords/SchoolVisits/*
// @grant         GM_setValue
// @grant         GM_getValue
// @run-at        document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'sv_moe_school_export';
    const LOG = (...a) => console.log('[🏫Auto]', ...a);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ════════════════════════════════════════════════════
    //  موقع المشرف (github.io) — نقل البيانات فقط
    // ════════════════════════════════════════════════════
    if (location.hostname.includes('github.io')) {
        // فحص دوري لـ localStorage — يُفعَّل بعد الضغط على "تصدير للوزارة"
        setInterval(() => {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            try {
                JSON.parse(raw); // تحقق من صحة JSON
                GM_setValue(STORAGE_KEY, raw);
                localStorage.removeItem(STORAGE_KEY);
                LOG('✅ بيانات نُقلت إلى GM storage — يمكن فتح موقع الوزارة الآن');
                showBanner('✅ البيانات جاهزة — افتح موقع الوزارة الآن');
            } catch (_) {
                localStorage.removeItem(STORAGE_KEY);
            }
        }, 800);

        function showBanner(msg) {
            const b = document.createElement('div');
            Object.assign(b.style, {
                position: 'fixed', top: '70px', left: '50%',
                transform: 'translateX(-50%)',
                background: '#27ae60', color: '#fff',
                padding: '12px 24px', borderRadius: '10px',
                fontFamily: 'Arial', fontSize: '14px', zIndex: '99999',
                direction: 'rtl', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            });
            b.textContent = msg;
            document.body.appendChild(b);
            setTimeout(() => b.remove(), 5000);
        }

        return; // لا شيء آخر على github.io
    }

    // ════════════════════════════════════════════════════
    //  موقع الوزارة (moe.gov.om) — التعبئة التلقائية
    // ════════════════════════════════════════════════════

    // ── مساعدات ──────────────────────────────────────────

    function normalizeArabic(s) {
        return (s || '')
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function fillField(el, value) {
        if (!el || value == null) return;
        const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
        ['input', 'change', 'blur'].forEach(evt =>
            el.dispatchEvent(new Event(evt, { bubbles: true }))
        );
    }

    function triggerAspNetChange(el) {
        const m = (el?.getAttribute('onchange') || '').match(/__doPostBack\(['"]([^'"]+)['"]/);
        if (m && typeof __doPostBack === 'function') {
            __doPostBack(m[1], ''); return true;
        }
        return false;
    }

    function clickAspNetButton(el) {
        if (!el) return false;
        const m = (el.getAttribute('onclick') || '')
            .match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]*)['"]/);
        if (m && typeof __doPostBack === 'function') {
            __doPostBack(m[1], m[2]); return true;
        }
        el.click(); return true;
    }

    function findButton(labels) {
        return [...document.querySelectorAll(
            'input[type="button"],input[type="submit"],button,a[href*="javascript"]'
        )].find(el => {
            const t = (el.value || el.textContent || '').trim();
            return labels.some(l => t.includes(l)) && isVisible(el);
        }) || null;
    }

    function findByLabel(selector, labels) {
        for (const el of document.querySelectorAll(selector)) {
            if (!isVisible(el)) continue;
            let node = el.parentElement;
            for (let i = 0; i < 6 && node; i++, node = node.parentElement)
                if (labels.some(l => node.textContent.includes(l))) return el;
        }
        return null;
    }

    const findInput    = labels => findByLabel('input[type="text"],input[type="date"],input[type="time"]', labels);
    const findTextarea = labels => findByLabel('textarea', labels);

    // ── كشف حالة الصفحة ─────────────────────────────────

    function detectPageState() {
        if (findInput(['تاريخ الزيارة', 'تاريخ', 'Date'])) return 'form';

        if (findButton(['إضافة', 'Add New', 'جديد'])) return 'has_add';

        const schoolSel = document.querySelector(
            'select[id*="School"],select[id*="school"],select[id*="Ins"],select[id*="ddl"]'
        );
        if (schoolSel && findButton(['عرض', 'بحث', 'View', 'Search'])) return 'main';

        return 'unknown';
    }

    // ── آلة الحالات ──────────────────────────────────────

    let state     = 'idle';
    let visitData = null;
    let busy      = false;

    async function engine() {
        if (state === 'idle' || state === 'done' || busy) return;
        busy = true;
        try {
            const page = detectPageState();
            LOG(`state=${state} | page=${page}`);
            setStatus(`الحالة: ${state} | الصفحة: ${page}`);

            if (page === 'main'    && state === 'selecting')   await stepSelectSchool();
            if (page === 'has_add' && state === 'waiting_add') await stepClickAdd();
            if (page === 'form'    && state === 'filling')     await stepFillForm();
        } catch (e) {
            LOG('خطأ:', e);
            setStatus('❌ ' + e.message, true);
        } finally {
            busy = false;
        }
    }

    async function stepSelectSchool() {
        const schoolSel = document.querySelector(
            'select[id*="School"],select[id*="school"],select[id*="Ins"],select[id*="ddl"]'
        );
        if (!schoolSel) { setStatus('⚠️ لم أجد قائمة المدارس'); return; }

        const target = normalizeArabic(visitData.school);
        const parts  = target.split(' ').filter(p => p.length > 1);
        LOG('البحث عن:', target);

        const opt = [...schoolSel.options].find(o =>
            parts.every(p => normalizeArabic(o.text).includes(p))
        );

        if (!opt) {
            const list = [...schoolSel.options].slice(0,8).map(o => o.text).join(' | ');
            LOG('المدارس المتاحة:', list);
            setStatus(`❌ لم تُوجد المدرسة\n${list}`, true);
            return;
        }

        LOG('✅ وُجدت:', opt.text);
        schoolSel.value = opt.value;
        fillField(schoolSel, opt.value);
        if (!triggerAspNetChange(schoolSel))
            schoolSel.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus(`✅ المدرسة: ${opt.text}\n⏳ جاري الضغط على عرض...`);

        await sleep(1200);

        const viewBtn = findButton(['عرض', 'بحث', 'View', 'Search']);
        if (!viewBtn) { setStatus('❌ لم أجد زر عرض'); return; }
        clickAspNetButton(viewBtn);
        state = 'waiting_add';
        setStatus('⏳ انتظار زر الإضافة...');
    }

    async function stepClickAdd() {
        const addBtn = findButton(['إضافة', 'Add New', 'جديد']);
        if (!addBtn) { setStatus('⏳ زر الإضافة لم يظهر بعد...'); return; }
        clickAspNetButton(addBtn);
        state = 'filling';
        setStatus('⏳ جاري فتح نموذج الإدخال...');
    }

    async function stepFillForm() {
        await sleep(900);
        LOG('تعبئة النموذج...');
        let n = 0;

        const dateEl = findInput(['تاريخ الزيارة', 'التاريخ', 'Date']);
        if (dateEl && visitData.date) {
            let d = visitData.date;
            if (d.includes('/')) { const [dd,mm,yy] = d.split('/'); d = `${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`; }
            fillField(dateEl, d); n++;
        }

        const arrEl = findInput(['وقت الوصول','الوصول','وقت الحضور','Arrival','وقت البدء']);
        if (arrEl) { fillField(arrEl, visitData.arrivalTime || '08:00'); n++; }

        const depEl = findInput(['وقت الانصراف','الانصراف','TimeTo','وقت الانتهاء']);
        if (depEl) { fillField(depEl, visitData.departureTime || '10:00'); n++; }

        const opEl = findTextarea(['رأي الزائر','رأي','ملاحظات','التقرير','Opinion','نتائج']);
        if (opEl && visitData.visitorOpinion) { fillField(opEl, visitData.visitorOpinion); n++; }

        const recEl = findTextarea(['التوصيات','توصيات','Recommendations','المقترحات']);
        if (recEl && visitData.recommendations) { fillField(recEl, visitData.recommendations); n++; }

        state = 'done';
        GM_setValue(STORAGE_KEY, ''); // امسح البيانات بعد الانتهاء
        const msg = `✅ اكتملت التعبئة (${n} حقل)\nراجع البيانات واضغط حفظ`;
        setStatus(msg);
        showToast(msg);
    }

    // ── الواجهة العائمة ──────────────────────────────────

    let statusEl, panel;

    function createUI() {
        panel = document.createElement('div');
        Object.assign(panel.style, {
            position: 'fixed', bottom: '16px', left: '16px', zIndex: '99999',
            background: '#0f2d52', color: '#fff', borderRadius: '12px',
            padding: '12px 14px', fontFamily: 'Arial', fontSize: '12px',
            direction: 'rtl', minWidth: '220px', maxWidth: '280px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        });
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <b style="font-size:13px">🏫 زيارة مدرسية — تلقائي</b>
                <button id="_sv_min" style="background:none;border:none;color:#aac;cursor:pointer;font-size:15px">−</button>
            </div>
            <div id="_sv_body">
                <div id="_sv_status" style="color:#9dc;font-size:11px;line-height:1.55;white-space:pre-line;min-height:32px;margin-bottom:8px">جارٍ التحقق من البيانات...</div>
                <div style="display:flex;flex-direction:column;gap:5px">
                    <button id="_sv_diag"  style="${bs('#546e7a')}">🔍 تشخيص Console</button>
                    <button id="_sv_reset" style="${bs('#c0392b')}">↺ إعادة ضبط</button>
                </div>
            </div>`;
        document.body.appendChild(panel);
        statusEl = panel.querySelector('#_sv_status');
        panel.querySelector('#_sv_min').onclick   = () => { const b = panel.querySelector('#_sv_body'); b.style.display = b.style.display === 'none' ? '' : 'none'; };
        panel.querySelector('#_sv_diag').onclick  = onDiag;
        panel.querySelector('#_sv_reset').onclick = onReset;
    }

    function bs(bg) {
        return `background:${bg};color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px;font-family:Arial;width:100%;text-align:right`;
    }

    function setStatus(msg, isErr = false) {
        if (statusEl) { statusEl.textContent = msg; statusEl.style.color = isErr ? '#ff7675' : '#9dc'; }
        LOG(msg);
    }

    function showToast(msg) {
        const t = document.createElement('div');
        Object.assign(t.style, {
            position:'fixed', top:'16px', right:'16px', zIndex:'999999',
            background:'#27ae60', color:'#fff', padding:'14px 22px',
            borderRadius:'10px', fontFamily:'Arial', fontSize:'14px',
            direction:'rtl', boxShadow:'0 4px 16px rgba(0,0,0,0.35)',
            whiteSpace:'pre-line', lineHeight:'1.5',
        });
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 6000);
    }

    function onDiag() {
        const page = detectPageState();
        const sels = [...document.querySelectorAll('select')].map(s=>`${s.id||'?'}(${s.options.length})`).join(', ');
        const btns = [...document.querySelectorAll('input[type=button],input[type=submit],button')]
            .map(b=>(b.value||b.textContent||'').trim()).filter(Boolean).slice(0,12).join(' | ');
        const areas = [...document.querySelectorAll('textarea')].map(t=>t.id||'?').join(', ');
        const inps  = [...document.querySelectorAll('input[type=text],input[type=date],input[type=time]')]
            .map(i=>i.id||'?').join(', ');
        LOG('── تشخيص ──');
        LOG('الصفحة:', page, '| state:', state);
        LOG('Selects:', sels);
        LOG('Buttons:', btns);
        LOG('Textareas:', areas);
        LOG('Inputs:', inps);
        setStatus(`الصفحة: ${page}\n${btns.slice(0,100)}`);
    }

    function onReset() {
        state = 'idle'; visitData = null;
        GM_setValue(STORAGE_KEY, '');
        setStatus('تم إعادة الضبط');
    }

    // ── تشغيل ─────────────────────────────────────────────

    createUI();

    // قراءة البيانات من GM storage والبدء تلقائياً
    const saved = GM_getValue(STORAGE_KEY, '');
    if (saved) {
        try {
            visitData = JSON.parse(saved);
            state = 'selecting';
            setStatus(`📌 بيانات جاهزة\n🏫 ${visitData.school || '—'}\n📅 ${visitData.date || '—'}\n⏳ جاري البدء تلقائياً...`);
        } catch (_) {
            GM_setValue(STORAGE_KEY, '');
            setStatus('⚠️ لا توجد بيانات — اضغط تصدير للوزارة أولاً', true);
        }
    } else {
        setStatus('⚠️ لا توجد بيانات\nاضغط "تصدير للوزارة" في موقعك أولاً', true);
    }

    setInterval(engine, 2500);

})();
