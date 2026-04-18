// ==UserScript==
// @name          🏫 أتمتة الزيارات المدرسية - سلطنة عمان
// @namespace     supervisor-om
// @version       1.0
// @description   تعبئة نموذج الزيارة المدرسية تلقائياً من بيانات موقع المشرف
// @match         https://moe.gov.om/SMS/VariousRecords/SchoolVisits/*
// @grant         GM_setValue
// @grant         GM_getValue
// @run-at        document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'sv_school_visit_data';
    const LOG = (...a) => console.log('[SV-School]', ...a);

    // ══════════════════════════════════════════════
    //  مساعدات DOM
    // ══════════════════════════════════════════════

    function normalizeArabic(s) {
        return (s || '')
            .replace(/[\u064B-\u065F\u0670]/g, '')   // تشكيل
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
        // React/framework-safe setter
        const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur',   { bubbles: true }));
    }

    function triggerAspNetChange(el) {
        // تشغيل AutoPostBack لـ ASP.NET
        const onchange = el?.getAttribute('onchange') || '';
        const m = onchange.match(/__doPostBack\(['"]([^'"]+)['"]/);
        if (m && typeof __doPostBack === 'function') {
            LOG('postback:', m[1]);
            __doPostBack(m[1], '');
            return true;
        }
        return false;
    }

    function clickAspNetButton(el) {
        if (!el) return false;
        const onclick = el.getAttribute('onclick') || '';
        const m = onclick.match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]*)['"]/);
        if (m && typeof __doPostBack === 'function') {
            LOG('button postback:', m[1]);
            __doPostBack(m[1], m[2]);
            return true;
        }
        el.click();
        return true;
    }

    async function waitFor(sel, timeout = 6000) {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
            const el = document.querySelector(sel);
            if (el && isVisible(el)) return el;
            await sleep(300);
        }
        return null;
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ══════════════════════════════════════════════
    //  البحث عن العناصر بواسطة نص التسمية
    // ══════════════════════════════════════════════

    /** يبحث في 5 مستويات للأعلى عن عنصر يحتوي نص التسمية */
    function findByLabel(selector, labels) {
        const els = [...document.querySelectorAll(selector)];
        for (const el of els) {
            if (!isVisible(el)) continue;
            let node = el.parentElement;
            for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
                if (labels.some(l => node.textContent.includes(l))) return el;
            }
        }
        return null;
    }

    function findInput(labels) {
        return findByLabel('input[type="text"], input[type="date"], input[type="time"], input[type="number"]', labels);
    }

    function findTextarea(labels) {
        return findByLabel('textarea', labels);
    }

    /** يبحث عن زر بنصه */
    function findButton(labels) {
        const candidates = [...document.querySelectorAll(
            'input[type="button"], input[type="submit"], button, a[href*="javascript"]'
        )];
        return candidates.find(el => {
            const t = (el.value || el.textContent || '').trim();
            return labels.some(l => t.includes(l)) && isVisible(el);
        }) || null;
    }

    // ══════════════════════════════════════════════
    //  كشف حالة الصفحة
    // ══════════════════════════════════════════════

    function detectPageState() {
        // نموذج الإضافة: يحتوي حقل تاريخ الزيارة
        const dateField = findInput(['تاريخ الزيارة', 'تاريخ', 'Date']);
        if (dateField) return 'form';

        // زر الإضافة ظاهر بعد اختيار المدرسة والضغط على عرض
        const addBtn = findButton(['إضافة', 'Add New', 'جديد']);
        if (addBtn) return 'has_add';

        // الصفحة الرئيسية: يوجد قائمة مدارس + زر عرض
        const schoolSel = document.querySelector(
            'select[id*="School"], select[id*="school"], select[id*="Ins"], select[id*="ddl"]'
        );
        const viewBtn = findButton(['عرض', 'بحث', 'View', 'Search']);
        if (schoolSel && viewBtn) return 'main';

        return 'unknown';
    }

    // ══════════════════════════════════════════════
    //  آلة الحالات (State Machine)
    // ══════════════════════════════════════════════

    let state       = 'idle';   // idle | selecting | waiting_add | filling | done
    let visitData   = null;
    let busy        = false;

    async function engine() {
        if (state === 'idle' || state === 'done' || busy) return;
        busy = true;
        try {
            const page = detectPageState();
            LOG(`engine: state=${state}, page=${page}`);

            if (page === 'main'     && state === 'selecting')    await stepSelectSchool();
            if (page === 'has_add'  && state === 'waiting_add')  await stepClickAdd();
            if (page === 'form'     && state === 'filling')      await stepFillForm();
        } catch (e) {
            LOG('engine error:', e);
            setStatus('❌ خطأ: ' + e.message, true);
        } finally {
            busy = false;
        }
    }

    // ── الخطوة 1: اختيار المدرسة والنقر على عرض ──
    async function stepSelectSchool() {
        const schoolSel = document.querySelector(
            'select[id*="School"], select[id*="school"], select[id*="Ins"], select[id*="ddl"]'
        );
        if (!schoolSel) { setStatus('لم أجد قائمة المدارس'); return; }

        const target = normalizeArabic(visitData.school);
        const parts  = target.split(' ').filter(p => p.length > 1);
        LOG('looking for school:', target, '| parts:', parts);

        const opt = [...schoolSel.options].find(o => {
            const norm = normalizeArabic(o.text);
            return parts.every(p => norm.includes(p));
        });

        if (!opt) {
            // عرض الخيارات المتاحة للتشخيص
            const available = [...schoolSel.options].slice(0, 10).map(o => o.text).join(' | ');
            LOG('available schools:', available);
            setStatus(`❌ المدرسة غير موجودة.\nالمتاح: ${available}`, true);
            return;
        }

        LOG('school found:', opt.text);
        schoolSel.value = opt.value;
        fillField(schoolSel, opt.value);
        if (!triggerAspNetChange(schoolSel)) schoolSel.dispatchEvent(new Event('change', { bubbles: true }));
        setStatus(`✅ تم اختيار: ${opt.text}`);

        await sleep(1200);

        const viewBtn = findButton(['عرض', 'بحث', 'View', 'Search']);
        if (!viewBtn) { setStatus('❌ لم أجد زر عرض'); return; }
        LOG('clicking عرض');
        clickAspNetButton(viewBtn);
        state = 'waiting_add';
        setStatus('⏳ انتظار ظهور زر الإضافة...');
    }

    // ── الخطوة 2: النقر على إضافة ──
    async function stepClickAdd() {
        const addBtn = findButton(['إضافة', 'Add New', 'جديد']);
        if (!addBtn) { setStatus('❌ لم أجد زر الإضافة'); return; }
        LOG('clicking إضافة');
        clickAspNetButton(addBtn);
        state = 'filling';
        setStatus('⏳ جاري فتح نموذج الإدخال...');
    }

    // ── الخطوة 3: تعبئة النموذج ──
    async function stepFillForm() {
        await sleep(800);
        LOG('filling form...');
        let filled = 0;

        // تاريخ الزيارة
        const dateEl = findInput(['تاريخ الزيارة', 'التاريخ', 'Date']);
        if (dateEl && visitData.date) {
            let d = visitData.date;              // يصل كـ dd/mm/yyyy
            if (d.includes('/')) {
                const [dd, mm, yy] = d.split('/');
                d = `${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
            }
            fillField(dateEl, d);
            LOG('date filled:', d); filled++;
        }

        // وقت الوصول
        const arrEl = findInput(['وقت الوصول', 'الوصول', 'وقت الحضور', 'Arrival', 'TimeFrom', 'وقت البدء']);
        if (arrEl) {
            fillField(arrEl, visitData.arrivalTime || '08:00');
            LOG('arrival filled'); filled++;
        }

        // وقت الانصراف
        const depEl = findInput(['وقت الانصراف', 'الانصراف', 'TimeTo', 'وقت الانتهاء']);
        if (depEl) {
            fillField(depEl, visitData.departureTime || '10:00');
            LOG('departure filled'); filled++;
        }

        // رأي الزائر
        const opEl = findTextarea(['رأي الزائر', 'رأي', 'ملاحظات', 'التقرير', 'Opinion', 'نتائج']);
        if (opEl && visitData.visitorOpinion) {
            fillField(opEl, visitData.visitorOpinion);
            LOG('opinion filled'); filled++;
        }

        // التوصيات
        const recEl = findTextarea(['التوصيات', 'توصيات', 'Recommendations', 'المقترحات']);
        if (recEl && visitData.recommendations) {
            fillField(recEl, visitData.recommendations);
            LOG('recommendations filled'); filled++;
        }

        state = 'done';
        const msg = `✅ تمت التعبئة (${filled} حقل) — راجع وأضغط حفظ`;
        setStatus(msg);
        showToast(msg);
        LOG('form filling done, fields filled:', filled);
    }

    // ══════════════════════════════════════════════
    //  واجهة المستخدم العائمة
    // ══════════════════════════════════════════════

    let statusEl;

    function createUI() {
        const panel = document.createElement('div');
        panel.id = 'sv-school-panel';
        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', left: '20px', zIndex: '99999',
            background: '#0f2d52', color: 'white', borderRadius: '14px',
            padding: '14px 16px', fontFamily: 'Arial, sans-serif', fontSize: '13px',
            direction: 'rtl', minWidth: '260px', maxWidth: '300px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
        });

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-weight:bold;font-size:14px">🏫 زيارة مدرسية</span>
                <button id="sv-minimize" style="background:none;border:none;color:#aac;cursor:pointer;font-size:16px;line-height:1">−</button>
            </div>
            <div id="sv-body">
                <div id="sv-status" style="font-size:11px;color:#9dc;margin-bottom:10px;min-height:30px;line-height:1.5;white-space:pre-line">جاهز — الصق البيانات وابدأ</div>
                <div style="display:flex;flex-direction:column;gap:6px">
                    <button id="sv-paste-btn"  style="${bs('#27ae60')}">📋 لصق البيانات وبدء التعبئة</button>
                    <button id="sv-resume-btn" style="${bs('#2980b9')}">▶ استئناف من الخطوة الحالية</button>
                    <button id="sv-diag-btn"   style="${bs('#7f8c8d')}">🔍 تشخيص الصفحة (Console)</button>
                    <button id="sv-reset-btn"  style="${bs('#c0392b')}">↺ إعادة ضبط</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        statusEl = panel.querySelector('#sv-status');

        // أزرار
        panel.querySelector('#sv-paste-btn').addEventListener('click', onPaste);
        panel.querySelector('#sv-resume-btn').addEventListener('click', () => { engine(); });
        panel.querySelector('#sv-diag-btn').addEventListener('click', onDiag);
        panel.querySelector('#sv-reset-btn').addEventListener('click', onReset);
        panel.querySelector('#sv-minimize').addEventListener('click', () => {
            const body = panel.querySelector('#sv-body');
            body.style.display = body.style.display === 'none' ? '' : 'none';
        });
    }

    function bs(bg) {
        return `background:${bg};color:#fff;border:none;border-radius:7px;padding:7px 10px;cursor:pointer;font-size:12px;font-family:Arial;width:100%;text-align:right`;
    }

    async function onPaste() {
        // محاولة القراءة من الحافظة أولاً
        let json = '';
        try {
            json = await navigator.clipboard.readText();
        } catch (_) {
            json = prompt('الصق بيانات JSON من موقعك (تصدير للوزارة):') || '';
        }
        if (!json.trim()) return;
        try {
            visitData = JSON.parse(json);
            GM_setValue(STORAGE_KEY, json);
            state = 'selecting';
            setStatus(`📌 بيانات محملة\n🏫 ${visitData.school || '—'}\n📅 ${visitData.date || '—'}`);
            await engine();
        } catch (e) {
            setStatus('❌ JSON غير صحيح:\n' + e.message, true);
        }
    }

    function onDiag() {
        const page = detectPageState();
        const selects = [...document.querySelectorAll('select')]
            .map(s => `${s.id||'?'}(${s.options.length})`).join(', ');
        const btns = [...document.querySelectorAll('input[type="button"],input[type="submit"],button')]
            .map(b => (b.value || b.textContent || '').trim()).filter(Boolean).slice(0,10).join(' | ');
        const areas = [...document.querySelectorAll('textarea')]
            .map(t => t.id || '?').join(', ');
        const inputs = [...document.querySelectorAll('input[type="text"],input[type="date"],input[type="time"]')]
            .map(i => i.id || '?').join(', ');

        LOG('── تشخيص ──');
        LOG('حالة الصفحة:', page);
        LOG('قوائم منسدلة:', selects);
        LOG('أزرار:', btns);
        LOG('مناطق نص:', areas);
        LOG('حقول إدخال:', inputs);

        setStatus(`الصفحة: ${page}\nالأزرار: ${btns.slice(0,80)}`);
    }

    function onReset() {
        state = 'idle';
        visitData = null;
        GM_setValue(STORAGE_KEY, '');
        setStatus('تم إعادة الضبط');
    }

    function setStatus(msg, isErr = false) {
        if (statusEl) {
            statusEl.textContent = msg;
            statusEl.style.color = isErr ? '#ff7675' : '#9dc';
        }
        LOG(msg);
    }

    function showToast(msg) {
        const t = document.createElement('div');
        Object.assign(t.style, {
            position: 'fixed', top: '20px', right: '20px', zIndex: '999999',
            background: '#27ae60', color: '#fff', padding: '12px 20px',
            borderRadius: '10px', fontFamily: 'Arial', fontSize: '14px',
            direction: 'rtl', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        });
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 5000);
    }

    // ══════════════════════════════════════════════
    //  تهيئة
    // ══════════════════════════════════════════════

    createUI();

    // استعادة البيانات المحفوظة
    const saved = GM_getValue(STORAGE_KEY, '');
    if (saved) {
        try {
            visitData = JSON.parse(saved);
            setStatus(`📌 بيانات محفوظة:\n🏫 ${visitData.school || '—'}\n📅 ${visitData.date || '—'}\nاضغط ▶ للاستئناف`);
        } catch (_) { GM_setValue(STORAGE_KEY, ''); }
    }

    setInterval(engine, 2500);

})();
