// ==UserScript==
// @name          🏫 أتمتة الزيارات المدرسية - سلطنة عمان
// @namespace     supervisor-om
// @version       4.0
// @description   تعبئة نموذج الزيارة المدرسية تلقائياً بالكامل
// @match         https://supervisor-om.github.io/*
// @match         https://moe.gov.om/SMS/*
// @grant         GM_setValue
// @grant         GM_getValue
// @run-at        document-idle
// ==/UserScript==

(function () {
    'use strict';

    const KEY_DATA = 'sv_school_data';
    const KEY_DONE = 'sv_school_done';
    const ts = () => new Date().toLocaleTimeString('ar');
    const LOG = (...a) => console.log(`[🏫 ${ts()}]`, ...a);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ════════════════════════════════════════════════════════
    //  موقع github.io — نقل البيانات إلى GM storage
    // ════════════════════════════════════════════════════════
    if (location.hostname.includes('github.io')) {
        setInterval(() => {
            const raw = localStorage.getItem('sv_moe_school_export');
            if (!raw) return;
            try {
                JSON.parse(raw);
                GM_setValue(KEY_DATA, raw);
                GM_setValue(KEY_DONE, '');
                localStorage.removeItem('sv_moe_school_export');
                showBanner('✅ البيانات جاهزة — افتح موقع الوزارة الآن');
                LOG('بيانات نُقلت لـ GM storage');
            } catch (_) { localStorage.removeItem('sv_moe_school_export'); }
        }, 600);

        function showBanner(msg) {
            const b = document.createElement('div');
            Object.assign(b.style, {
                position: 'fixed', top: '70px', left: '50%', transform: 'translateX(-50%)',
                background: '#27ae60', color: '#fff', padding: '12px 28px',
                borderRadius: '10px', fontFamily: 'Arial', fontSize: '14px',
                zIndex: '99999', direction: 'rtl', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            });
            b.textContent = msg;
            document.body.appendChild(b);
            setTimeout(() => b.remove(), 5000);
        }
        return;
    }

    // ════════════════════════════════════════════════════════
    //  موقع الوزارة — التعبئة التلقائية
    // ════════════════════════════════════════════════════════

    // ── مساعدات ──────────────────────────────────────────────

    function normalizeAr(s) {
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
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function fillField(el, value) {
        if (!el || value == null) return false;
        const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
        ['input', 'change', 'blur'].forEach(ev =>
            el.dispatchEvent(new Event(ev, { bubbles: true })));
        return true;
    }

    function aspNetChange(el) {
        const oc = el?.getAttribute('onchange') || '';
        const m = oc.match(/__doPostBack\(['"]([^'"]+)['"]/);
        if (m && typeof __doPostBack === 'function') {
            LOG('__doPostBack change:', m[1]);
            __doPostBack(m[1], '');
            return true;
        }
        return false;
    }

    function aspNetClick(el) {
        if (!el) return;
        const oc = el.getAttribute('onclick') || el.href || '';
        const m = oc.match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]*)['"]/);
        if (m && typeof __doPostBack === 'function') {
            LOG('__doPostBack click:', m[1], m[2]);
            __doPostBack(m[1], m[2]);
        } else {
            LOG('el.click():', el.value || el.textContent?.trim().slice(0, 20));
            el.click();
        }
    }

    // إيجاد زر بنص مطابق (أحد labels)
    function findBtn(labels) {
        const candidates = document.querySelectorAll(
            'input[type=button],input[type=submit],button,a[href*="javascript"],a[onclick]'
        );
        for (const el of candidates) {
            if (!isVisible(el)) continue;
            const t = normalizeAr(el.value || el.textContent || '');
            if (labels.some(l => t.includes(normalizeAr(l)))) return el;
        }
        return null;
    }

    // إيجاد input/textarea بالتسمية من أي عنصر أب أو label مرتبط
    function findFieldByLabel(tagSel, labels) {
        // طريقة 1: label[for] → input
        for (const lbl of document.querySelectorAll('label')) {
            if (!isVisible(lbl)) continue;
            const lt = normalizeAr(lbl.textContent);
            if (!labels.some(l => lt.includes(normalizeAr(l)))) continue;
            const forId = lbl.getAttribute('for');
            if (forId) {
                const el = document.getElementById(forId);
                if (el && el.matches(tagSel) && isVisible(el)) return el;
            }
            // label يحتوي على input مباشرة
            const inner = lbl.querySelector(tagSel);
            if (inner && isVisible(inner)) return inner;
        }
        // طريقة 2: فحص عناصر الأب (td, div, span)
        for (const el of document.querySelectorAll(tagSel)) {
            if (!isVisible(el)) continue;
            let p = el.parentElement;
            for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
                const pt = normalizeAr(p.textContent);
                if (labels.some(l => pt.includes(normalizeAr(l)))) return el;
            }
        }
        return null;
    }

    const findInput = labels => findFieldByLabel(
        'input[type=text],input[type=date],input[type=time],input[type=number]', labels
    );
    const findArea = labels => findFieldByLabel('textarea', labels);

    // ── كشف حالة الصفحة ──────────────────────────────────────

    function getPageState() {
        // حالة النموذج: يوجد textarea مرئي + (حقل تاريخ أو حقل نص عام)
        const visibleAreas = [...document.querySelectorAll('textarea')].filter(isVisible);
        const visibleInputs = [...document.querySelectorAll('input[type=text],input[type=date]')].filter(isVisible);
        if (visibleAreas.length >= 1 && visibleInputs.length >= 1) {
            LOG('getPageState → form | areas:', visibleAreas.length, 'inputs:', visibleInputs.length);
            return 'form';
        }

        // حالة وجود زر إضافة
        const addBtn = findBtn(['إضافة', 'Add', 'New', 'جديد', 'إضافة زيارة', 'إضافة سجل']);
        if (addBtn) {
            LOG('getPageState → has_add | btn:', addBtn.value || addBtn.textContent?.trim().slice(0, 20));
            return 'has_add';
        }

        // الصفحة الرئيسية: قائمة مدارس + زر عرض
        const allSelects = [...document.querySelectorAll('select')].filter(isVisible);
        const viewBtn = findBtn(['عرض', 'بحث', 'View', 'Search', 'Show', 'عرض السجلات']);
        if (allSelects.length > 0 && viewBtn) {
            LOG('getPageState → main | selects:', allSelects.map(s => s.id).join(','));
            return 'main';
        }

        LOG('getPageState → unknown | selects:', allSelects.length, 'viewBtn:', !!viewBtn, 'addBtn:', !!addBtn);
        return 'unknown';
    }

    // ── الخطوات ──────────────────────────────────────────────

    async function stepMain(data) {
        LOG('=== stepMain ===');

        // إيجاد قائمة المدارس — جرب كل Select المرئية
        const allSelects = [...document.querySelectorAll('select')].filter(isVisible);
        LOG('كل الـ selects:', allSelects.map(s => `${s.id}(${s.options.length})`).join(' | '));

        // اختر الـ select الأكبر (أكثر خيارات = قائمة المدارس)
        let schoolSel = allSelects.sort((a, b) => b.options.length - a.options.length)[0];
        if (!schoolSel || schoolSel.options.length < 2) {
            setStatus('⚠️ لم أجد قائمة المدارس\nاضغط تشخيص للمزيد', true);
            return;
        }

        LOG('قائمة المدارس المُختارة:', schoolSel.id, '|', schoolSel.options.length, 'خيار');

        const target = normalizeAr(data.school || '');
        const parts = target.split(' ').filter(p => p.length > 1);
        LOG('البحث عن:', target, '| أجزاء:', parts);

        // جرب المطابقة الكاملة أولاً، ثم المطابقة الجزئية
        let opt = [...schoolSel.options].find(o =>
            parts.every(p => normalizeAr(o.text).includes(p))
        );

        if (!opt && parts.length > 1) {
            // مطابقة بأكثر جزء (أكثر من نصف الأجزاء)
            const half = Math.ceil(parts.length / 2);
            opt = [...schoolSel.options].find(o => {
                const norm = normalizeAr(o.text);
                return parts.filter(p => norm.includes(p)).length >= half;
            });
            if (opt) LOG('مطابقة جزئية:', opt.text);
        }

        if (!opt) {
            const avail = [...schoolSel.options].slice(0, 10).map(o => o.text).join('\n');
            setStatus(`❌ المدرسة غير موجودة:\n"${data.school}"\n\nأول 10 خيارات:\n${avail}`, true);
            LOG('كل خيارات المدرسة:', [...schoolSel.options].map(o => o.text).join(' | '));
            return;
        }

        LOG('✅ المدرسة وُجدت:', opt.text, '| value:', opt.value);
        setStatus(`✅ المدرسة:\n${opt.text}\n⏳ ضغط عرض...`);

        schoolSel.value = opt.value;
        fillField(schoolSel, opt.value);
        await sleep(400);
        if (!aspNetChange(schoolSel)) {
            schoolSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await sleep(1500);

        const viewBtn = findBtn(['عرض', 'بحث', 'View', 'Search', 'Show', 'عرض السجلات']);
        if (!viewBtn) {
            setStatus('❌ لم أجد زر عرض\nاضغط تشخيص', true);
            return;
        }
        LOG('زر عرض:', viewBtn.value || viewBtn.textContent?.trim().slice(0, 30));
        aspNetClick(viewBtn);
        setStatus('⏳ جارٍ التحميل...');
    }

    async function stepHasAdd() {
        LOG('=== stepHasAdd ===');
        await sleep(600);
        const btn = findBtn(['إضافة', 'Add', 'New', 'جديد', 'إضافة زيارة', 'إضافة سجل']);
        if (!btn) {
            setStatus('⏳ انتظار زر الإضافة...'); return;
        }
        LOG('زر الإضافة:', btn.value || btn.textContent?.trim().slice(0, 30));
        setStatus('✅ زر إضافة → ضغط...');
        aspNetClick(btn);
        setStatus('⏳ جارٍ فتح النموذج...');
    }

    async function stepForm(data) {
        LOG('=== stepForm ===');
        await sleep(1000);

        // تشخيص كل الحقول المتاحة
        const allInputs = [...document.querySelectorAll('input,textarea,select')].filter(isVisible);
        LOG('كل الحقول:', allInputs.map(e => `${e.tagName}[${e.id||e.name||'—'}]`).join(', '));

        let filled = 0;

        // تاريخ الزيارة
        const dateEl = findInput(['تاريخ الزيارة', 'تاريخ', 'Date', 'VisitDate', 'التاريخ']);
        if (dateEl && data.date) {
            let d = data.date;
            // تحويل dd/mm/yyyy → yyyy-mm-dd إن لزم
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) {
                const [dd, mm, yy] = d.split('/');
                d = `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            }
            LOG('تاريخ:', d, '← el:', dateEl.id);
            fillField(dateEl, d);
            filled++;
        } else {
            LOG('⚠️ لم يُجد حقل التاريخ | data.date:', data.date);
        }

        // وقت الوصول
        const arrEl = findInput(['وقت الوصول', 'الوصول', 'وقت الحضور', 'وقت البدء', 'Arrival', 'ArrivalTime']);
        if (arrEl) {
            fillField(arrEl, data.arrivalTime || '08:00');
            LOG('وقت وصول:', data.arrivalTime || '08:00', '← el:', arrEl.id);
            filled++;
        }

        // وقت الانصراف
        const depEl = findInput(['وقت الانصراف', 'الانصراف', 'وقت الانتهاء', 'Departure', 'DepartureTime']);
        if (depEl) {
            fillField(depEl, data.departureTime || '12:00');
            LOG('وقت انصراف:', data.departureTime || '12:00', '← el:', depEl.id);
            filled++;
        }

        // رأي الزائر / ملاحظات
        const opEl = findArea(['رأي الزائر', 'رأي', 'ملاحظات', 'التقرير', 'نتائج', 'Opinion', 'Notes', 'Remarks']);
        if (opEl && data.visitorOpinion) {
            fillField(opEl, data.visitorOpinion);
            LOG('رأي الزائر ← el:', opEl.id, '| أول 40 حرف:', data.visitorOpinion.slice(0, 40));
            filled++;
        } else {
            LOG('⚠️ لم يُجد حقل رأي الزائر');
        }

        // التوصيات
        const recEl = findArea(['التوصيات', 'توصيات', 'مقترحات', 'Recommendations', 'Suggestions']);
        if (recEl && data.recommendations) {
            fillField(recEl, data.recommendations);
            LOG('توصيات ← el:', recEl.id);
            filled++;
        }

        // علامة الانتهاء
        GM_setValue(KEY_DONE, Date.now().toString());
        GM_setValue(KEY_DATA, '');

        const msg = filled > 0
            ? `✅ اكتملت التعبئة\n${filled} حقل — راجع وأضغط حفظ`
            : `⚠️ لم يُعبَّأ أي حقل\nتحقق Console للتفاصيل`;
        setStatus(msg, filled === 0);
        showToast(msg);
        LOG('انتهى | حقول معبأة:', filled);
    }

    // ── المحرك ────────────────────────────────────────────────

    let busy = false;

    async function engine() {
        if (busy) return;

        const raw = GM_getValue(KEY_DATA, '');
        if (!raw) return;

        const done = GM_getValue(KEY_DONE, '');
        if (done) return;

        let data;
        try { data = JSON.parse(raw); }
        catch (_) { GM_setValue(KEY_DATA, ''); return; }

        busy = true;
        try {
            const pg = getPageState();
            setStatus(`الصفحة: ${pg === 'main' ? 'رئيسية' : pg === 'has_add' ? 'إضافة' : pg === 'form' ? 'نموذج' : 'غير معروفة'}\n⏳ جارٍ المعالجة...`);
            if (pg === 'main')    await stepMain(data);
            if (pg === 'has_add') await stepHasAdd();
            if (pg === 'form')    await stepForm(data);
            if (pg === 'unknown') {
                LOG('الصفحة غير معروفة — ننتظر');
                setStatus('⏳ انتظار تحميل الصفحة...');
            }
        } catch (e) {
            LOG('خطأ في المحرك:', e);
            setStatus('❌ خطأ: ' + e.message, true);
        } finally {
            busy = false;
        }
    }

    // ── واجهة المستخدم ────────────────────────────────────────

    let statusEl;

    function createUI() {
        const panel = document.createElement('div');
        panel.id = '_sv_panel';
        Object.assign(panel.style, {
            position: 'fixed', bottom: '16px', left: '16px', zIndex: '2147483647',
            background: '#0f2d52', color: '#fff', borderRadius: '12px',
            padding: '12px 14px', fontFamily: 'Arial,sans-serif', fontSize: '12px',
            direction: 'rtl', minWidth: '240px', maxWidth: '300px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.6)', lineHeight: '1.4',
        });

        panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b style="font-size:13px">🏫 زيارة مدرسية — تلقائي v4</b>
            <button id="_sv_min" style="background:none;border:none;color:#aac;cursor:pointer;font-size:18px;line-height:1;padding:0 4px">−</button>
        </div>
        <div id="_sv_body">
            <div id="_sv_st" style="color:#9dc;font-size:11px;line-height:1.6;white-space:pre-line;min-height:40px;margin-bottom:8px;padding:6px;background:rgba(255,255,255,0.07);border-radius:6px">جارٍ التحقق...</div>
            <div style="display:flex;flex-direction:column;gap:5px">
                <button id="_sv_run" style="${bs('#2ecc71')}">▶ تشغيل الآن</button>
                <button id="_sv_dg"  style="${bs('#546e7a')}">🔍 تشخيص (Console)</button>
                <button id="_sv_rs"  style="${bs('#c0392b')}">↺ إعادة ضبط</button>
            </div>
        </div>`;

        document.body.appendChild(panel);
        statusEl = panel.querySelector('#_sv_st');

        panel.querySelector('#_sv_min').onclick = () => {
            const b = panel.querySelector('#_sv_body');
            b.style.display = b.style.display === 'none' ? '' : 'none';
        };
        panel.querySelector('#_sv_run').onclick = () => {
            if (!busy) engine();
            else setStatus('⏳ جارٍ التنفيذ...');
        };
        panel.querySelector('#_sv_dg').onclick = diagConsole;
        panel.querySelector('#_sv_rs').onclick = () => {
            GM_setValue(KEY_DATA, '');
            GM_setValue(KEY_DONE, '');
            busy = false;
            setStatus('✅ تم الإعادة\nاضغط "تصدير للوزارة" في موقعك');
        };
    }

    function bs(bg) {
        return `background:${bg};color:#fff;border:none;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:11px;font-family:Arial;width:100%;text-align:right;margin:0`;
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
            position: 'fixed', top: '16px', right: '16px', zIndex: '2147483647',
            background: '#27ae60', color: '#fff', padding: '14px 22px',
            borderRadius: '10px', fontFamily: 'Arial', fontSize: '14px',
            direction: 'rtl', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            whiteSpace: 'pre-line', lineHeight: '1.5', maxWidth: '320px',
        });
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 8000);
    }

    function diagConsole() {
        const pg = getPageState();
        const data = GM_getValue(KEY_DATA, '');
        const done = GM_getValue(KEY_DONE, '');

        const allSels = [...document.querySelectorAll('select')]
            .map(s => `${s.id||s.name||'?'}(${s.options.length}opts)`).join(' | ');

        const allBtns = [...document.querySelectorAll('input[type=button],input[type=submit],button')]
            .filter(isVisible)
            .map(e => `"${(e.value || e.textContent || '').trim().slice(0, 20)}"`).join(' | ');

        const allAreas = [...document.querySelectorAll('textarea')]
            .map(t => `${t.id||t.name||'?'}[${t.placeholder?.slice(0,15)||''}]`).join(', ');

        const allInps = [...document.querySelectorAll('input')]
            .filter(isVisible)
            .map(i => `${i.type}[${i.id||i.name||'?'}]`).join(', ');

        const allLabels = [...document.querySelectorAll('label')]
            .filter(isVisible)
            .map(l => `"${l.textContent.trim().slice(0, 20)}"`).join(' | ');

        console.group('══ تشخيص الزيارة المدرسية v4 ══');
        console.log('URL:', location.href);
        console.log('حالة الصفحة:', pg);
        console.log('بيانات GM:', !!data, '| تمت:', !!done);
        if (data) {
            try { const d = JSON.parse(data); console.log('مدرسة:', d.school, '| تاريخ:', d.date); } catch (_) {}
        }
        console.log('Selects:', allSels);
        console.log('Buttons:', allBtns);
        console.log('Labels:', allLabels);
        console.log('Inputs:', allInps);
        console.log('Textareas:', allAreas);
        console.groupEnd();

        setStatus(
            `الصفحة: ${pg}\nبيانات: ${data ? '✅' : '❌'} | تمت: ${done ? '✅' : '❌'}\n` +
            `Selects: ${allSels.slice(0, 60)}\nBtns: ${allBtns.slice(0, 60)}`
        );
    }

    // ── تشغيل ─────────────────────────────────────────────────

    createUI();

    // عرض الحالة عند التحميل
    const raw  = GM_getValue(KEY_DATA, '');
    const done = GM_getValue(KEY_DONE, '');
    if (done) {
        setStatus('✅ تمت التعبئة مسبقاً\nاضغط ↺ للبدء من جديد');
    } else if (raw) {
        try {
            const d = JSON.parse(raw);
            setStatus(`📌 بيانات جاهزة\n🏫 ${d.school || '—'}\n📅 ${d.date || '—'}\n⏳ يبدأ تلقائياً...`);
        } catch (_) {
            GM_setValue(KEY_DATA, '');
            setStatus('⚠️ بيانات تالفة — تم المسح', true);
        }
    } else {
        setStatus('⚠️ لا توجد بيانات\nاضغط "تصدير للوزارة" في موقعك', true);
    }

    // المحرك يعمل كل 2.5 ثانية
    setInterval(engine, 2500);

})();
