// ==UserScript==
// @name          🏫 أتمتة الزيارات المدرسية - سلطنة عمان
// @namespace     supervisor-om
// @version       3.0
// @description   تعبئة نموذج الزيارة المدرسية تلقائياً بالكامل
// @match         https://supervisor-om.github.io/*
// @match         https://moe.gov.om/SMS/VariousRecords/SchoolVisits/*
// @grant         GM_setValue
// @grant         GM_getValue
// @run-at        document-idle
// ==/UserScript==

(function () {
    'use strict';

    const KEY_DATA = 'sv_school_data';
    const KEY_DONE = 'sv_school_done';
    const LOG = (...a) => console.log('[🏫]', ...a);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ════════════════════════════════════════════════════
    //  موقع github.io — نقل البيانات إلى GM storage
    // ════════════════════════════════════════════════════
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
                position:'fixed', top:'70px', left:'50%', transform:'translateX(-50%)',
                background:'#27ae60', color:'#fff', padding:'12px 28px',
                borderRadius:'10px', fontFamily:'Arial', fontSize:'14px',
                zIndex:'99999', direction:'rtl', boxShadow:'0 4px 16px rgba(0,0,0,0.3)',
            });
            b.textContent = msg;
            document.body.appendChild(b);
            setTimeout(() => b.remove(), 5000);
        }
        return;
    }

    // ════════════════════════════════════════════════════
    //  موقع الوزارة — التعبئة التلقائية (DOM-driven)
    //  لا يعتمد على متغيرات JS بين إعادات تحميل الصفحة
    // ════════════════════════════════════════════════════

    // ── مساعدات ──────────────────────────────────────────

    function normalizeAr(s) {
        return (s || '')
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ').trim();
    }

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function fillField(el, value) {
        if (!el || value == null) return;
        const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
        ['input','change','blur'].forEach(e => el.dispatchEvent(new Event(e, {bubbles:true})));
    }

    function aspNetChange(el) {
        const m = (el?.getAttribute('onchange') || '').match(/__doPostBack\(['"]([^'"]+)['"]/);
        if (m && typeof __doPostBack === 'function') { __doPostBack(m[1], ''); return true; }
        return false;
    }

    function aspNetClick(el) {
        if (!el) return;
        const m = (el.getAttribute('onclick') || '').match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]*)['"]/);
        if (m && typeof __doPostBack === 'function') { __doPostBack(m[1], m[2]); return; }
        el.click();
    }

    function findBtn(labels) {
        return [...document.querySelectorAll(
            'input[type=button],input[type=submit],button,a'
        )].find(el => {
            const t = (el.value || el.textContent || '').trim();
            return labels.some(l => t.includes(l)) && isVisible(el);
        }) || null;
    }

    function findByLabel(sel, labels) {
        for (const el of document.querySelectorAll(sel)) {
            if (!isVisible(el)) continue;
            let p = el.parentElement;
            for (let i = 0; i < 7 && p; i++, p = p.parentElement)
                if (labels.some(l => p.textContent.includes(l))) return el;
        }
        return null;
    }

    const findInput = l => findByLabel(
        'input[type=text],input[type=date],input[type=time],input[type=number]', l);
    const findArea  = l => findByLabel('textarea', l);

    // ── كشف حالة الصفحة من DOM مباشرةً ──────────────────
    // هذا يعمل حتى بعد إعادة تحميل الصفحة (لا يعتمد على متغيرات JS)

    function getPageState() {
        // حالة النموذج: يوجد حقل تاريخ الزيارة + أي textarea
        const hasDateField  = findInput(['تاريخ الزيارة']);
        const hasAnyArea    = document.querySelector('textarea');
        if (hasDateField && hasAnyArea) return 'form';

        // حالة وجود زر إضافة (بعد الضغط على عرض)
        const addBtn = findBtn(['إضافة']);
        if (addBtn) return 'has_add';

        // الصفحة الرئيسية: قائمة مدارس + زر عرض
        const schoolSel = document.querySelector(
            'select[id*=School],select[id*=school],select[id*=Ins],select[id*=ddl],select[id*=Inst]'
        );
        const viewBtn = findBtn(['عرض','بحث','View','Search']);
        if (schoolSel && viewBtn) return 'main';

        return 'unknown';
    }

    // ── الخطوات ──────────────────────────────────────────

    async function stepMain(data) {
        // إيجاد قائمة المدارس
        const sel = document.querySelector(
            'select[id*=School],select[id*=school],select[id*=Ins],select[id*=ddl],select[id*=Inst]'
        );
        if (!sel) { setStatus('⚠️ لم أجد قائمة المدارس — تشخيص Console', true); return; }

        const target = normalizeAr(data.school);
        const parts  = target.split(' ').filter(p => p.length > 1);
        LOG('البحث عن المدرسة:', target);

        // اختيار المدرسة
        const opt = [...sel.options].find(o => parts.every(p => normalizeAr(o.text).includes(p)));
        if (!opt) {
            const avail = [...sel.options].slice(1, 9).map(o => o.text).join('\n');
            setStatus(`❌ المدرسة غير موجودة\nتحقق التسمية.\nالمتاح:\n${avail}`, true);
            LOG('الخيارات المتاحة:', [...sel.options].map(o=>o.text).join(' | '));
            return;
        }

        LOG('✅ المدرسة:', opt.text);
        sel.value = opt.value;
        fillField(sel, opt.value);
        if (!aspNetChange(sel)) sel.dispatchEvent(new Event('change', {bubbles:true}));
        setStatus(`✅ تم اختيار:\n${opt.text}\n⏳ الضغط على عرض...`);

        await sleep(1500);

        const viewBtn = findBtn(['عرض','بحث','View','Search']);
        if (!viewBtn) { setStatus('❌ لم أجد زر عرض'); return; }
        LOG('الضغط على عرض');
        aspNetClick(viewBtn);
        setStatus('⏳ انتظار نتائج البحث...');
    }

    async function stepHasAdd() {
        const btn = findBtn(['إضافة']);
        if (!btn) { setStatus('⏳ زر الإضافة غير ظاهر بعد...'); return; }
        LOG('الضغط على إضافة');
        aspNetClick(btn);
        setStatus('⏳ فتح نموذج الإدخال...');
    }

    async function stepForm(data) {
        await sleep(800);
        LOG('تعبئة النموذج...');
        let n = 0;

        // تاريخ الزيارة
        const dateEl = findInput(['تاريخ الزيارة','التاريخ','Date']);
        if (dateEl && data.date) {
            let d = data.date;
            if (d.includes('/')) {
                const [dd, mm, yy] = d.split('/');
                d = `${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
            }
            fillField(dateEl, d); n++;
            LOG('تاريخ:', d);
        }

        // وقت الوصول
        const arrEl = findInput(['وقت الوصول','الوصول','وقت الحضور','وقت البدء','Arrival']);
        if (arrEl) { fillField(arrEl, data.arrivalTime || '08:00'); n++; }

        // وقت الانصراف
        const depEl = findInput(['وقت الانصراف','الانصراف','وقت الانتهاء','Departure']);
        if (depEl) { fillField(depEl, data.departureTime || '10:00'); n++; }

        // رأي الزائر
        const opEl = findArea(['رأي الزائر','رأي','ملاحظات','التقرير','Opinion','نتائج']);
        if (opEl && data.visitorOpinion) { fillField(opEl, data.visitorOpinion); n++; }

        // التوصيات
        const recEl = findArea(['التوصيات','توصيات','Recommendations','المقترحات']);
        if (recEl && data.recommendations) { fillField(recEl, data.recommendations); n++; }

        // وضع علامة انتهاء وحذف البيانات
        GM_setValue(KEY_DONE, Date.now().toString());
        GM_setValue(KEY_DATA, '');

        const msg = `✅ اكتملت التعبئة\n${n} حقل — راجع وأضغط حفظ`;
        setStatus(msg);
        showToast(msg);
        LOG('انتهت التعبئة، حقول:', n);
    }

    // ── المحرك الرئيسي (DOM-driven بدون state) ──────────

    let busy = false;

    async function engine() {
        if (busy) return;

        const raw = GM_getValue(KEY_DATA, '');
        if (!raw) return; // لا توجد بيانات

        const done = GM_getValue(KEY_DONE, '');
        if (done) return; // تمت التعبئة مسبقاً

        let data;
        try { data = JSON.parse(raw); }
        catch (_) { GM_setValue(KEY_DATA, ''); return; }

        busy = true;
        try {
            const pg = getPageState();
            LOG(`الصفحة=${pg}`);
            setStatus(`الصفحة: ${pg}`);

            if (pg === 'main')    await stepMain(data);
            if (pg === 'has_add') await stepHasAdd();
            if (pg === 'form')    await stepForm(data);
            // 'unknown': ننتظر الدورة القادمة
        } catch (e) {
            LOG('خطأ:', e);
            setStatus('❌ ' + e.message, true);
        } finally {
            busy = false;
        }
    }

    // ── واجهة المستخدم ────────────────────────────────────

    let statusEl;

    function createUI() {
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            position:'fixed', bottom:'16px', left:'16px', zIndex:'99999',
            background:'#0f2d52', color:'#fff', borderRadius:'12px',
            padding:'12px 14px', fontFamily:'Arial', fontSize:'12px',
            direction:'rtl', minWidth:'230px', maxWidth:'290px',
            boxShadow:'0 6px 20px rgba(0,0,0,0.55)',
        });
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <b style="font-size:13px">🏫 زيارة مدرسية — تلقائي</b>
                <button id="_sv_min" style="background:none;border:none;color:#aac;cursor:pointer;font-size:16px;line-height:1">−</button>
            </div>
            <div id="_sv_body">
                <div id="_sv_st" style="color:#9dc;font-size:11px;line-height:1.6;white-space:pre-line;min-height:36px;margin-bottom:8px">جارٍ التحقق...</div>
                <div style="display:flex;flex-direction:column;gap:5px">
                    <button id="_sv_dg" style="${bs('#546e7a')}">🔍 تشخيص (Console)</button>
                    <button id="_sv_rs" style="${bs('#c0392b')}">↺ إعادة ضبط</button>
                </div>
            </div>`;
        document.body.appendChild(panel);
        statusEl = panel.querySelector('#_sv_st');

        panel.querySelector('#_sv_min').onclick = () => {
            const b = panel.querySelector('#_sv_body');
            b.style.display = b.style.display === 'none' ? '' : 'none';
        };
        panel.querySelector('#_sv_dg').onclick = diagConsole;
        panel.querySelector('#_sv_rs').onclick  = () => {
            GM_setValue(KEY_DATA, '');
            GM_setValue(KEY_DONE, '');
            setStatus('تم إعادة الضبط — اضغط تصدير للوزارة من موقعك');
        };
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
        setTimeout(() => t.remove(), 7000);
    }

    function diagConsole() {
        const pg    = getPageState();
        const sels  = [...document.querySelectorAll('select')]
                        .map(s => `${s.id||'—'}(${s.options.length})`).join(', ');
        const btns  = [...document.querySelectorAll('input[type=button],input[type=submit],button,a')]
                        .filter(e => isVisible(e))
                        .map(e => (e.value||e.textContent||'').trim().slice(0,20))
                        .filter(Boolean).slice(0,15).join(' | ');
        const areas = [...document.querySelectorAll('textarea')]
                        .map(t => t.id||'—').join(', ');
        const inps  = [...document.querySelectorAll('input[type=text],input[type=date],input[type=time]')]
                        .map(i => `${i.id||'—'}[${i.placeholder||''}]`).join(', ');
        const hasData = !!GM_getValue(KEY_DATA, '');
        const isDone  = !!GM_getValue(KEY_DONE, '');

        console.log('══ تشخيص الزيارة المدرسية ══');
        console.log('حالة الصفحة:', pg);
        console.log('بيانات محفوظة:', hasData);
        console.log('تمت التعبئة:', isDone);
        console.log('Selects:', sels);
        console.log('Buttons:', btns);
        console.log('Textareas:', areas);
        console.log('Inputs:', inps);

        setStatus(`الصفحة: ${pg}\nبيانات: ${hasData?'✅':'❌'} | تمت: ${isDone?'✅':'❌'}\n${btns.slice(0,80)}`);
    }

    // ── تشغيل ─────────────────────────────────────────────

    createUI();

    // عرض حالة البيانات عند التحميل
    const raw  = GM_getValue(KEY_DATA, '');
    const done = GM_getValue(KEY_DONE, '');
    if (done) {
        setStatus('✅ تمت التعبئة مسبقاً\nاضغط ↺ للبدء من جديد');
    } else if (raw) {
        try {
            const d = JSON.parse(raw);
            setStatus(`📌 بيانات جاهزة\n🏫 ${d.school||'—'}\n📅 ${d.date||'—'}\n⏳ يبدأ تلقائياً...`);
        } catch(_) { GM_setValue(KEY_DATA,''); }
    } else {
        setStatus('⚠️ لا توجد بيانات\nاضغط "تصدير للوزارة" في موقعك', true);
    }

    // المحرك — يعمل كل 2.5 ثانية بناءً على DOM فقط
    setInterval(engine, 2500);

})();
