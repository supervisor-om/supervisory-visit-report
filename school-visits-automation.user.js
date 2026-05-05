// ==UserScript==
// @name         🏫 أتمتة الزيارات المدرسية — v7.0
// @namespace    supervisor-om
// @version      8.0
// @description  تصدير بيانات الزيارة المدرسية من موقع المشرف وتعبئة استمارة الوزارة تلقائياً — مع نظام تتبع مرئي وتحويل ثنائي اللغة عند الحاجة
// @author       Abu Al-Muather
// @match        https://supervisor-om.github.io/supervisory-visit-report/*
// @match        https://moe.gov.om/SMS/SupervisionVisits/*
// @match        https://moe.gov.om/SMS/VariousRecords/SchoolVisits/*
// @match        https://moe.gov.om/Portal/Services/UserLoginnew.aspx
// @match        https://moe.gov.om/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_getResourceURL
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    //  ثوابت
    // ═══════════════════════════════════════════════════════════════
    const DATA_KEY     = 'svf_school_visit_data';
    const PANEL_ID     = 'svf-panel-v7';
    const STEP_EL_ID   = 'svf-steps';
    const LOG_EL_ID    = 'svf-log';
    const STATUS_EL_ID = 'svf-status';
    const BAR_EL_ID    = 'svf-bar';

    const MOE_VISITS_URL =
        'https://moe.gov.om/SMS/VariousRecords/SchoolVisits/SchoolVisitsMain.aspx';

    const DEFAULT_SCHOOL = 'يزيد بن حاتم الازدى للبنين الصفوف(9-12)';

    // ═══════════════════════════════════════════════════════════════
    //  دوال مساعدة
    // ═══════════════════════════════════════════════════════════════
    const $  = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const wait = ms => new Promise(r => setTimeout(r, ms));

    function b64Encode(str) {
        try {
            return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
        } catch (e) { return ''; }
    }
    function b64Decode(b64) {
        try {
            return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
        } catch (e) { return null; }
    }

    const TYPE_LABELS = { '1': 'إشرافية', '2': 'استطلاعية', '3': 'أخرى' };

    function parseVisitType(text) {
        if (!text) return '1';
        const t = text.trim();
        if (t.includes('اشرافية') || t.includes('إشرافية') || t.includes('supervisory')) return '1';
        if (t.includes('استطلاعية') || t.includes('إستطلاعية')) return '2';
        if (t.includes('اخرى') || t.includes('أخرى')) return '3';
        return '1';
    }

    // ═══════════════════════════════════════════════════════════════
    //  جزء 1: موقع المشرف — التصدير
    // ═══════════════════════════════════════════════════════════════
    if (location.hostname.includes('supervisor-om.github.io')) {

        function findExportBtn() {
            return $('#exportSchoolToMoeBtn')
                || $('#exportToMoeBtn')
                || [...$$('button, a')].find(el =>
                    el.textContent.includes('تصدير') && el.textContent.includes('وزار'));
        }

        function patchExportBtn(btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                doExport();
            });
        }

        function doExport() {
            // التحقق من وجود البيانات الأساسية
            const visitorOpinion = $('#visitorOpinion')?.value?.trim() || '';
            const recommendations = $('#recommendations')?.value?.trim() || '';

            if (!visitorOpinion && !recommendations) {
                showToastSupervisor('⚠️ يرجى ملء رأي الزائر أو التوصيات أولاً', 'error');
                return;
            }

            const rawDate = $('#schoolVisitDate')?.value?.trim() || '';
            let portalDate = rawDate;
            if (rawDate && rawDate.includes('-')) {
                const parts = rawDate.split('-');
                portalDate = parts[2] + '/' + parts[1] + '/' + parts[0];
            }

            let arrivalTime  = '08:00';
            let departureTime = '12:00';
            const rawArrival   = $('#schoolArrivalTime')?.value || '';
            const rawDeparture = $('#schoolDepartureTime')?.value || '';

            if (rawArrival) {
                // قد يكون بصيغة HH:MM أو HH:MM AM/PM
                const m = rawArrival.match(/(\d{1,2}):(\d{2})/);
                if (m) arrivalTime = m[1].padStart(2, '0') + ':' + m[2];
            }
            if (rawDeparture) {
                const m = rawDeparture.match(/(\d{1,2}):(\d{2})/);
                if (m) departureTime = m[1].padStart(2, '0') + ':' + m[2];
            }

            // نوع الزيارة
            const typeKey  = $('#visitTypeSelect')?.value || '';
            let typeName = typeKey;
            try { typeName = schoolVisitTypesData?.[typeKey]?.name || typeKey; } catch (e) {}

            // أهداف الزيارة (checkboxes داخل objectivesContainer)
            const objectives = $$('#objectivesContainer input[name="objectives"]:checked')
                .map(cb => cb.value.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim())
                .filter(Boolean);

            // المواقف الصفية
            const classroomVisits = [];
            const cvRows = $$('#classroomVisitsList > div, #classroomVisitsList > li, .cv-row');
            cvRows.forEach(row => {
                const t = row.querySelector('[id*="cvTeacher"], .cv-teacher, [data-field="teacher"]');
                const g = row.querySelector('[id*="cvGrade"], .cv-grade, [data-field="grade"]');
                const p = row.querySelector('[id*="cvPeriod"], .cv-period, [data-field="period"]');
                const s = row.querySelector('[id*="cvSubject"], .cv-subject, [data-field="subject"]');
                const r = row.querySelector('[id*="cvRating"], .cv-rating, [data-field="rating"]');
                if (t) classroomVisits.push({
                    teacher: t.textContent?.trim() || t.value || '',
                    grade:   g?.textContent?.trim() || g?.value || '',
                    period:  p?.textContent?.trim() || p?.value || '',
                    subject: s?.textContent?.trim() || s?.value || '',
                    rating:  r?.textContent?.trim() || r?.value || '',
                });
            });

            // تجميع البيانات
            const data = {
                school:         $('#schoolName')?.value?.trim() || DEFAULT_SCHOOL,
                date:           portalDate,
                arrivalTime,
                departureTime,
                visitType:      parseVisitType(typeName),
                visitTypeName:  typeName,
                objectives,
                visitorOpinion,
                recommendations,
                classroomVisits,
            };

            // عرض نافذة التأكيد
            showConfirmModal(data);
        }

        function showConfirmModal(data) {
            // إزالة أي نافذة قديمة
            $('#svf-confirm-modal')?.remove();

            const overlay = document.createElement('div');
            overlay.id = 'svf-confirm-modal';
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;' +
                'display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:system-ui,sans-serif;';

            const objPreview = data.objectives.length > 0
                ? data.objectives.slice(0, 3).map(s => s.slice(0, 60)).join(' • ')
                : 'لا توجد';

            overlay.innerHTML =
            '<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)">' +
                '<div style="background:linear-gradient(135deg,#d97706,#92400e);padding:14px 20px;color:white;display:flex;align-items:center;justify-content:space-between">' +
                    '<h3 style="margin:0;font-size:16px">🏫 تصدير للوزارة</h3>' +
                    '<button id="svf-close" style="background:none;border:none;color:white;font-size:22px;cursor:pointer;line-height:1">×</button>' +
                '</div>' +
                '<div style="padding:16px 20px">' +
                    '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#92400e;line-height:1.6">' +
                        '⚡ <b>سيتم فتح بوابة الوزارة وتعبئة استمارة الزيارة المدرسية تلقائياً.</b><br>' +
                        '⚠️ الحفظ <b>يدوي</b> — راجع البيانات قبل الضغط على "حفظ".</div>' +
                    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">' +
                        '<tr><td style="padding:5px 8px;color:#6b7280;width:35%">المدرسة</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + (esc(data.school) || '—') + '</td></tr>' +
                        '<tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">التاريخ</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + (esc(data.date) || '—') + '</td></tr>' +
                        '<tr><td style="padding:5px 8px;color:#6b7280">نوع الزيارة</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + esc(TYPE_LABELS[data.visitType] || data.visitTypeName || '—') + '</td></tr>' +
                        '<tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">وقت الوصول</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + esc(data.arrivalTime) + '</td></tr>' +
                        '<tr><td style="padding:5px 8px;color:#6b7280">وقت الانصراف</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + esc(data.departureTime) + '</td></tr>' +
                        '<tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">الأهداف</td>' +
                            '<td style="padding:5px 8px;font-size:11px">' + esc(objPreview.slice(0, 90)) + (data.objectives.length > 3 ? '...' : '') + '</td></tr>' +
                        (data.classroomVisits.length > 0
                            ? '<tr><td style="padding:5px 8px;color:#6b7280">مواقف صفية</td>' +
                              '<td style="padding:5px 8px;font-weight:600">' + data.classroomVisits.length + ' موقف</td></tr>'
                            : '') +
                    '</table>' +
                    '<div style="display:flex;gap:10px">' +
                        '<button id="svf-go" style="flex:1;background:linear-gradient(135deg,#d97706,#92400e);color:white;border:none;padding:12px;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer">' +
                            '🚀 فتح موقع الوزارة والتعبئة التلقائية</button>' +
                        '<button id="svf-cancel" style="background:#f1f5f9;border:none;padding:12px 16px;border-radius:10px;font-size:14px;cursor:pointer;color:#475569">إلغاء</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

            document.body.appendChild(overlay);

            const close = () => overlay.remove();
            $('#svf-close', overlay)?.addEventListener('click', close);
            $('#svf-cancel', overlay)?.addEventListener('click', close);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

            $('#svf-go', overlay)?.addEventListener('click', () => {
                const json = JSON.stringify(data);
                const b64  = b64Encode(json);

                // 1) تخزين في Tampermonkey
                try { GM_setValue(DATA_KEY, json); } catch (e) {}

                // 2) تخزين احتياطي في localStorage
                try { localStorage.setItem('sv_moe_school_export', json); } catch (e) {}

                // 3) فتح صفحة الوزارة مع hash احتياطي
                const url = MOE_VISITS_URL + (b64 ? '#svf=' + b64 : '');
                window.open(url, '_blank');
                close();
            });
        }

        function showToastSupervisor(msg, type) {
            if (typeof showToast === 'function') { showToast(msg, type); return; }
            const t = document.createElement('div');
            t.textContent = msg;
            t.style.cssText =
                'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:99999;' +
                'padding:12px 28px;border-radius:999px;font-size:14px;color:white;' +
                'box-shadow:0 4px 20px rgba(0,0,0,.3);' +
                'background:' + (type === 'error' ? '#dc2626' : '#d97706') + ';';
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 3500);
        }

        // التهيئة — ننتظر جاهزية الصفحة
        function initSupervisor() {
            // زر exportSchoolToMoeBtn يتأخر ظهوره — نراقب بـ MutationObserver
            const obs = new MutationObserver(() => {
                const btn = findExportBtn();
                if (btn && !btn._svfPatched) {
                    btn._svfPatched = true;
                    patchExportBtn(btn);
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });

            // محاولة أولى
            const firstBtn = findExportBtn();
            if (firstBtn) { firstBtn._svfPatched = true; patchExportBtn(firstBtn); }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initSupervisor);
        } else {
            initSupervisor();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  جزء 2: موقع الوزارة — التعبئة التلقائية مع نظام تتبع
    // ═══════════════════════════════════════════════════════════════
    if (location.hostname.includes('moe.gov.om')) {

        // لا تشتغل داخل iframe (النموذج يفتح في iframe)
        if (window.top !== window.self) return;

        // ─── استيراد البيانات من كل المصادر الممكنة ───
        let visitData = null;

        (function loadData() {
            // 1) من URL hash (#svf=BASE64)
            try {
                const m = location.hash.match(/#svf=([A-Za-z0-9+/=]+)/);
                if (m) {
                    const json = b64Decode(m[1]);
                    if (json) {
                        visitData = JSON.parse(json);
                        try { GM_setValue(DATA_KEY, json); } catch (e) {}
                        history.replaceState(null, '', location.pathname + location.search);
                    }
                }
            } catch (e) {}

            // 2) من Tampermonkey
            if (!visitData) {
                try {
                    const raw = GM_getValue(DATA_KEY, '');
                    if (raw) visitData = JSON.parse(raw);
                } catch (e) {}
            }

            // 3) من localStorage (fallback)
            if (!visitData) {
                try {
                    const ls = localStorage.getItem('sv_moe_school_export');
                    if (ls) visitData = JSON.parse(ls);
                } catch (e) {}
            }
        })();

        // ─── أنماط لوحة التحكم ───
        GM_addStyle(`
            #${PANEL_ID} {
                position:fixed; top:70px; right:12px; z-index:99999;
                width:340px; background:#0f0b05; color:#fef3c7;
                border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,.7);
                font-family:"Segoe UI",Arial,sans-serif; font-size:12px;
                direction:rtl; overflow:hidden; border:1px solid #78350f;
            }
            #svf-header-v7 {
                background:linear-gradient(135deg,#d97706,#78350f);
                padding:10px 14px; cursor:move; user-select:none;
                display:flex; align-items:center; gap:8px;
            }
            #svf-header-v7 h3 { margin:0; font-size:13px; flex:1; }
            #svf-badge-v7 { background:#fbbf24; color:#78350f; border-radius:20px; padding:1px 8px; font-size:10px; font-weight:bold; }
            #svf-toggle-v7 { cursor:pointer; }
            #svf-body-v7 { padding:12px; display:block; }
            #${PANEL_ID}.collapsed #svf-body-v7 { display:none; }
            #${STEP_EL_ID} { margin-bottom:10px; }
            #${STEP_EL_ID} .step-row {
                display:flex; align-items:center; gap:6px; padding:5px 8px;
                border-radius:6px; margin-bottom:3px; font-size:11px;
                background:#1c1408; border:1px solid #292524;
                opacity:0.45; transition:all .3s;
            }
            #${STEP_EL_ID} .step-row.active { opacity:1; border-color:#d97706; background:#271a08; }
            #${STEP_EL_ID} .step-row.done { opacity:0.9; border-color:#15803d; }
            #${STEP_EL_ID} .step-row.error { opacity:1; border-color:#dc2626; background:#2d0a0a; }
            #${STEP_EL_ID} .step-icon { width:22px; text-align:center; font-size:13px; flex-shrink:0; }
            #${STEP_EL_ID} .step-label { flex:1; }
            #${STEP_EL_ID} .step-status { font-size:10px; color:#a8a29e; }
            .step-row.done .step-status { color:#6ee7b7; }
            .step-row.error .step-status { color:#fca5a5; }
            .step-row.active .step-status { color:#fbbf24; }
            #${STATUS_EL_ID} {
                background:#0c0a04; border-radius:6px; padding:7px 10px;
                margin-bottom:8px; font-size:11px; color:#fde68a; min-height:20px;
            }
            #svf-pbar-v7 { height:5px; background:#0c0a04; border-radius:3px; margin-bottom:10px; overflow:hidden; }
            #${BAR_EL_ID} { height:100%; width:0%; border-radius:3px; background:linear-gradient(90deg,#d97706,#fbbf24); transition:width .4s; }
            #${LOG_EL_ID} {
                background:#0c0a04; border-radius:6px; padding:7px; height:170px;
                overflow-y:auto; font-size:10.5px; margin-bottom:10px; line-height:1.8;
            }
            .svf-log-info { color:#93c5fd; }
            .svf-log-warn { color:#fde68a; }
            .svf-log-error { color:#fca5a5; }
            .svf-log-success { color:#6ee7b7; font-weight:bold; }
            .svf-btn-v7 {
                width:100%; padding:9px; border:none; border-radius:8px;
                cursor:pointer; font-size:12.5px; font-weight:bold; margin-bottom:6px;
            }
            #svf-btn-auto-v7 { background:linear-gradient(135deg,#d97706,#92400e); color:white; font-size:14px; padding:11px; }
            #svf-btn-auto-v7:disabled { background:#44403c; color:#78716c; cursor:not-allowed; }
            #svf-btn-auto-v7:hover:not(:disabled) { filter:brightness(1.15); }
            #svf-btn-fill-v7 { background:#15803d; color:white; font-size:13px; }
            #svf-btn-fill-v7:disabled { background:#44403c; color:#78716c; cursor:not-allowed; }
            #svf-btn-clear-v7 { background:#292524; color:#a8a29e; font-size:11px; }
            #svf-btn-switch-v7 { background:#1e3a5f; color:#93c5fd; font-size:11px; }
            #svf-data-box-v7 { background:#1c1408; border:1px solid #78350f; border-radius:8px; padding:10px; margin-bottom:10px; font-size:11px; }
            #svf-data-box-v7 .d-row { display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px solid #292524; }
            #svf-data-box-v7 .d-row:last-child { border:none; }
            #svf-data-box-v7 .d-lbl { color:#fbbf24; }
            #svf-data-box-v7 .d-val { color:#fff; font-weight:600; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        `);

        // ─── المتغيرات الداخلية ───
        let autoRunning = false;
        let filling    = false;
        const STEPS = [
            { id: 'step1', label: 'اختيار المدرسة',            icon: '🏫' },
            { id: 'step2', label: 'ضغط عرض',                    icon: '🔍' },
            { id: 'step3', label: 'ضغط إضافة',                  icon: '➕' },
            { id: 'step4', label: 'تعبئة النموذج',              icon: '✍️' },
            { id: 'step5', label: '🛑 الحفظ يدوي — راجع ثم احفظ', icon: '💾' },
        ];

        function log(msg, type = 'info') {
            const panel = $('#' + LOG_EL_ID);
            if (panel) {
                const line = document.createElement('div');
                line.className = 'svf-log-' + type;
                const now = new Date();
                const time = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                line.textContent = time + ' │ ' + msg;
                panel.appendChild(line);
                panel.scrollTop = panel.scrollHeight;
            }
            const method = type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log';
            console[method]('[SVF v7] ' + msg);
        }

        function setProgress(pct) {
            const bar = $('#' + BAR_EL_ID);
            if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
        }

        function setStatus(msg) {
            const el = $('#' + STATUS_EL_ID);
            if (el) el.textContent = msg;
        }

        function updateStep(stepId, state /* 'active'|'done'|'error'|'idle' */, detail = '') {
            $$('#' + STEP_EL_ID + ' .step-row').forEach(row => {
                row.classList.remove('active', 'done', 'error');
                if (row.dataset.step === stepId) {
                    row.classList.add(state);
                    const statusEl = row.querySelector('.step-status');
                    if (statusEl) statusEl.textContent = detail;
                }
            });
        }

        function setAllStepsIdle() {
            $$('#' + STEP_EL_ID + ' .step-row').forEach(row => {
                row.classList.remove('active', 'done', 'error');
                row.querySelector('.step-status').textContent = '';
            });
        }

        // ─── بناء اللوحة ───
        function buildPanel(data) {
            if ($('#' + PANEL_ID)) return;

            const hasData = !!data;

            const panel = document.createElement('div');
            panel.id = PANEL_ID;

            const stepsHTML = STEPS.map((s, i) =>
                '<div class="step-row" data-step="' + s.id + '">' +
                    '<span class="step-icon">' + s.icon + '</span>' +
                    '<span class="step-label">' + (i + 1) + '. ' + s.label + '</span>' +
                    '<span class="step-status"></span>' +
                '</div>'
            ).join('');

            const dataBoxHTML = hasData ? `
                <div id="svf-data-box-v7">
                    <div style="color:#fbbf24;font-weight:bold;margin-bottom:6px;font-size:11px">📦 بيانات جاهزة</div>
                    <div class="d-row"><span class="d-lbl">المدرسة</span><span class="d-val">${esc(data.school)}</span></div>
                    <div class="d-row"><span class="d-lbl">التاريخ</span><span class="d-val">${esc(data.date)}</span></div>
                    <div class="d-row"><span class="d-lbl">النوع</span><span class="d-val">${esc(TYPE_LABELS[data.visitType] || data.visitTypeName)}</span></div>
                    <div class="d-row"><span class="d-lbl">الوصول</span><span class="d-val">${esc(data.arrivalTime)}</span></div>
                    <div class="d-row"><span class="d-lbl">الانصراف</span><span class="d-val">${esc(data.departureTime)}</span></div>
                </div>
            ` : `
                <div style="background:#1c1408;border:1px dashed #44403c;border-radius:8px;padding:12px;text-align:center;color:#78716c;font-size:11px;margin-bottom:10px">
                    لا توجد بيانات — عد لموقعك واصغط "تصدير للوزارة"
                </div>
            `;

            panel.innerHTML = `
                <div id="svf-header-v7">
                    <span>🏫</span>
                    <h3>أتمتة الزيارات v7.0</h3>
                    ${hasData ? '<span id="svf-badge-v7">جاهز</span>' : ''}
                    <span id="svf-toggle-v7" style="cursor:pointer">▼</span>
                </div>
                <div id="svf-body-v7">
                    ${dataBoxHTML}
                    <div id="${STEP_EL_ID}">${stepsHTML}</div>
                    <div id="${STATUS_EL_ID}">${hasData ? '⏳ انتظر — جاهز للتشغيل' : '⏳ في انتظار البيانات'}</div>
                    <div id="svf-pbar-v7"><div id="${BAR_EL_ID}"></div></div>
                    <div id="${LOG_EL_ID}"></div>
                    <button class="svf-btn-v7" id="svf-btn-auto-v7" ${!hasData ? 'disabled' : ''}>🚀 تشغيل تلقائي كامل</button>
                    <button class="svf-btn-v7" id="svf-btn-fill-v7" ${!hasData ? 'disabled' : ''}>⚡ تعبئة فقط (النموذج مفتوح)</button>
                    <button class="svf-btn-v7" id="svf-btn-switch-v7">🔤 التحويل لوضع ثنائي اللغة</button>
                    <button class="svf-btn-v7" id="svf-btn-clear-v7">🗑 مسح السجل</button>
                </div>
            `;

            document.body.appendChild(panel);

            // زر التشغيل التلقائي
            if (hasData) {
                $('#svf-btn-auto-v7')?.addEventListener('click', () => runAutoFull(data));
                $('#svf-btn-fill-v7')?.addEventListener('click', () => runFillOnly(data));
            }
            $('#svf-btn-clear-v7')?.addEventListener('click', () => {
                const logEl = $('#' + LOG_EL_ID);
                if (logEl) logEl.innerHTML = '';
                setProgress(0);
                setAllStepsIdle();
            });
            $('#svf-btn-switch-v7')?.addEventListener('click', switchToBilingual);
            $('#svf-toggle-v7')?.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
                $('#svf-toggle-v7').textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
            });

            // سحب اللوحة
            makeDraggable($('#svf-header-v7'), panel);
        }

        function makeDraggable(header, panel) {
            let sx, sy, il, it;
            header.addEventListener('mousedown', e => {
                if (e.target.tagName === 'BUTTON' || e.target.id === 'svf-toggle-v7') return;
                sx = e.clientX; sy = e.clientY;
                il = panel.offsetLeft; it = panel.offsetTop;
                const move = ev => {
                    panel.style.left = (il + ev.clientX - sx) + 'px';
                    panel.style.top  = (it + ev.clientY - sy) + 'px';
                    panel.style.right = 'auto';
                };
                const up = () => { document.removeEventListener('mousemove', move); };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up, { once: true });
            });
        }

        // ═══════════════════════════════════════════════════════════════
        //  التحويل بين أنظمة التعليم (أساسي / ثنائي اللغة / خاص)
        // ═══════════════════════════════════════════════════════════════
        function findEduSystemDropdown() {
            // ابحث عن قائمة نظام التعليم بأي نمط
            return $('select[id*="ddlEdu"]')
                || $('select[id*="Education"]')
                || $('select[id*="StudySystem"]')
                || $('select[id*="SchoolSystem"]')
                || $('select[id*="SystemType"]')
                || $('select[id*="ddlSystem"]')
                // بحث بالنص — أي select فيه خيارات مثل "أساسي" أو "ثنائي"
                || (() => {
                    const allSelects = $$('select');
                    return allSelects.find(s =>
                        Array.from(s.options).some(o =>
                            o.text.includes('أساسي') ||
                            o.text.includes('ثنائي') ||
                            o.text.includes('خاص'))) || null;
                })();
        }

        function getCurrentEduSystem() {
            const dd = findEduSystemDropdown();
            if (!dd || dd.selectedIndex < 0) return null;
            return { value: dd.value, text: dd.options[dd.selectedIndex]?.text?.trim() || '' };
        }

        function switchEduSystem(targetText) {
            const dd = findEduSystemDropdown();
            if (!dd) { log('⚠ لم أجد قائمة نظام التعليم', 'warn'); return false; }

            const targetLower = targetText.toLowerCase();
            const opts = Array.from(dd.options);

            // بحث: أي خيار يحتوي على الكلمة المطلوبة
            const match = opts.find(o =>
                o.text.toLowerCase().includes(targetLower) ||
                o.value.toLowerCase().includes(targetLower));

            if (match) {
                log('🔄 تحويل نظام التعليم: ' + dd.options[dd.selectedIndex]?.text + ' → ' + match.text, 'warn');
                dd.value = match.value;
                dd.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }

            log('⚠ لم أجد خيار "' + targetText + '" في قائمة نظام التعليم', 'warn');
            log('الخيارات المتاحة: ' + opts.map(o => o.text).join(' | '), 'info');
            return false;
        }

        function switchToBilingual() {
            log('🔄 جاري التحويل إلى وضع ثنائي اللغة...', 'warn');
            if (switchEduSystem('ثنائي')) return true;

            // fallback: رابط مباشر مع معامل اللغة
            const currentUrl = new URL(location.href);
            currentUrl.searchParams.set('lang', 'en');
            location.href = currentUrl.toString();
            return false;
        }

        const EDU_SYSTEMS = ['ثنائي', 'خاص'];  // الترتيب اللي نحاول فيه

        // ═══════════════════════════════════════════════════════════════
        //  البحث عن المدرسة مع محاولة تغيير نظام التعليم تلقائياً
        // ═══════════════════════════════════════════════════════════════
        async function findAndSelectSchool(data) {
            const schoolDD = findSchoolDropdown();
            if (!schoolDD) {
                log('❌ لم أجد قائمة المدارس في الصفحة!', 'error');
                return { found: false, error: 'قائمة المدارس غير موجودة' };
            }

            const schoolName = data.school || '';
            if (!schoolName) {
                log('⚠ لم يوجد اسم مدرسة في البيانات', 'warn');
                return { found: false, error: 'اسم المدرسة غير موجود في البيانات' };
            }

            // محاولة 1: البحث في النظام الحالي
            let match = findSchoolInDropdown(schoolDD, schoolName);
            if (match) {
                selectSchoolOption(schoolDD, match);
                return { found: true, text: match.text };
            }

            log('⚠ المدرسة "' + schoolName + '" غير موجودة في النظام الحالي', 'warn');
            log('🔄 سأحاول تغيير نظام التعليم...', 'info');

            // محاولة تغيير نظام التعليم لكل الأنظمة
            for (const sysName of EDU_SYSTEMS) {
                log('🔁 أجرب نظام: ' + sysName, 'info');
                updateStep('step1', 'active', 'تحويل لـ ' + sysName + '...');

                // تغيير النظام
                if (!switchEduSystem(sysName)) continue;

                // انتظر حتى تتحدث الصفحة
                await wait(2500);

                // أعد البحث عن القائمة (قد تتغير الـ DOM)
                const newDD = findSchoolDropdown();
                if (!newDD) { log('⚠ اختفت قائمة المدارس بعد تغيير النظام', 'warn'); continue; }

                match = findSchoolInDropdown(newDD, schoolName);
                if (match) {
                    selectSchoolOption(newDD, match);
                    return { found: true, text: match.text, system: sysName };
                }

                log('⚠ لم تظهر "' + schoolName + '" حتى في نظام ' + sysName, 'warn');
            }

            // آخر محاولة: عرض المدارس المتاحة
            const currentDD = findSchoolDropdown() || schoolDD;
            const opts = Array.from(currentDD.options);
            log('المدارس المتاحة حالياً (أول 10): ' + opts.slice(1, 11).map(o => o.text).join(' | '), 'info');

            return { found: false, error: 'المدرسة غير موجودة في كل أنظمة التعليم' };
        }

        function findSchoolInDropdown(dd, schoolName) {
            const opts = Array.from(dd.options);
            // تطابق تام
            let m = opts.find(o => o.text.trim() === schoolName.trim());
            // تطابق جزئي
            if (!m) m = opts.find(o => o.text.includes(schoolName.trim()) || schoolName.trim().includes(o.text.trim()));
            // تطابق بأول كلمة من اسم المدرسة
            if (!m) {
                const firstWord = schoolName.trim().split(/\s+/)[0];
                if (firstWord.length >= 3) m = opts.find(o => o.text.includes(firstWord));
            }
            return m || null;
        }

        function selectSchoolOption(dd, option) {
            dd.value = option.value;
            dd.dispatchEvent(new Event('change', { bubbles: true }));
            log('✅ تم اختيار: ' + option.text, 'success');
            updateStep('step1', 'done', option.text.slice(0, 25));
        }

        // ═══════════════════════════════════════════════════════════════
        //  البحث عن العناصر بمرونة (ASP.NET IDs تتغير أحياناً)
        // ═══════════════════════════════════════════════════════════════
        function findSchoolDropdown() {
            // جرب كل الأنماط الممكنة
            return document.getElementById('ctl00_content_SchoolFilterCtrl1_ddlSchools')
                || document.getElementById('ctl00_content_ddlSchools')
                || $('select[id*="ddlSchool"]')
                || $('select[id*="School"][id*="ddl"]')
                || $('select[id*="Schools"]')
                // بحث بالنص — أي select فيه options طويلة (أسماء مدارس)
                || (() => {
                    const allSelects = $$('select');
                    return allSelects.find(s =>
                        Array.from(s.options).some(o => o.text.length > 15)
                    ) || null;
                })();
        }

        function findShowButton() {
            return document.getElementById('ctl00_content_btnShow')
                || $('input[type="submit"][value*="عرض"]')
                || $('input[type="button"][value*="عرض"]')
                || $('button[id*="btnShow"]')
                || [...$$('input[type="submit"], button, a')].find(el =>
                    el.textContent?.trim() === 'عرض' || el.value === 'عرض');
        }

        function findAddButton() {
            return document.getElementById('ctl00_content_ImgAdd')
                || document.getElementById('ctl00_content_btnAdd')
                || document.getElementById('ctl00_content_NewVisit')
                // أنماط ID
                || $('input[id*="ImgAdd"]')
                || $('input[id*="btnAdd"]')
                || $('input[id*="AddVisit"]')
                || $('button[id*="ImgAdd"]')
                || $('button[id*="btnAdd"]')
                || $('button[id*="AddVisit"]')
                || $('a[id*="ImgAdd"]')
                || $('a[id*="AddVisit"]')
                || $('img[id*="ImgAdd"]')
                // أنماط value
                || $('input[type="submit"][value*="إضافة"]')
                || $('input[type="button"][value*="إضافة"]')
                || $('input[type="image"][id*="Add"]')
                // أنماط النص
                || [...$$('input[type="submit"], input[type="button"], input[type="image"], button, a, span[onclick]')].find(el =>
                    (el.textContent?.trim() === 'إضافة' || el.value === 'إضافة' || el.title === 'إضافة' || el.alt === 'إضافة'))
                // أي عنصر فيه كلمة "إضافة" وله onclick
                || [...$$('[onclick]')].find(el =>
                    (el.textContent?.trim().includes('إضافة') || (el.value || '').includes('إضافة')));
        }

        function findFormDocument() {
            // مباشر
            if ($('#ddlVisitTypes')) return document;

            // داخل iframe
            try {
                const iframe = document.getElementById('dialog-bodyAddEditSchoolVisits')
                             || $('iframe[id*="dialog"]')
                             || $('iframe[src*="AddEdit"]');
                if (iframe?.contentDocument) {
                    const doc = iframe.contentDocument;
                    if (doc.getElementById('ddlVisitTypes')) return doc;
                }
            } catch (e) {}

            return null;
        }

        function dumpPageElements() {
            // طباعة تشخيصية لكل العناصر التفاعلية للـ debugging
            log('═══ تشخيص الصفحة ═══', 'warn');
            const candidates = $$('input[type="submit"], input[type="button"], input[type="image"], button, a, span[onclick], img[onclick]');
            candidates.forEach((el, i) => {
                if (i >= 30) return; // أول 30 عنصر
                const info = [
                    el.tagName,
                    el.type || '',
                    'id=' + (el.id || '—'),
                    'text=' + ((el.textContent || el.value || el.alt || el.title || '').trim().slice(0, 40) || '—'),
                    'onclick=' + (el.getAttribute('onclick') ? '✓' : '✗')
                ].join(' | ');
                log('  [' + i + '] ' + info, 'info');
            });
            log('═══ نهاية التشخيص ═══', 'warn');
        }

        function findFormField(doc, ids) {
            // ids: مصفوفة من المعرفات المحتملة
            for (const id of ids) {
                const el = doc.getElementById(id);
                if (el) return el;
            }
            return null;
        }

        // ═══════════════════════════════════════════════════════════════
        //  التشغيل التلقائي الكامل
        // ═══════════════════════════════════════════════════════════════
        async function runAutoFull(data) {
            if (autoRunning) return;
            autoRunning = true;
            setAllStepsIdle();
            setProgress(0);

            const autoBtn = $('#svf-btn-auto-v7');
            const fillBtn = $('#svf-btn-fill-v7');
            if (autoBtn) { autoBtn.disabled = true; autoBtn.textContent = '⏳ جارٍ التشغيل...'; }
            if (fillBtn) fillBtn.disabled = true;

            try {
                // ── الخطوة 1: اختيار المدرسة (مع تحويل تلقائي لنظام التعليم) ──
                updateStep('step1', 'active', 'جاري البحث...');
                setStatus('🏫 الخطوة 1: اختيار المدرسة');
                log('━━━ 1/5 ـ اختيار المدرسة ━━━', 'info');
                setProgress(5);

                const result = await findAndSelectSchool(data);
                if (!result.found) {
                    log('💡 يمكنك أيضاً الضغط على "🔤 التحويل لوضع ثنائي اللغة" يدوياً', 'warn');
                    updateStep('step1', 'error', result.error || 'المدرسة غير موجودة');
                    setStatus('⚠️ اختر المدرسة يدوياً أو حوّل لوضع ثنائي اللغة');
                    throw new Error(result.error || 'المدرسة غير موجودة في القائمة');
                }

                await wait(1200);
                setProgress(20);

                // ── الخطوة 2: ضغط عرض ──
                updateStep('step2', 'active', 'جاري الضغط...');
                setStatus('🔍 الخطوة 2: ضغط عرض');
                log('━━━ 2/5 ـ ضغط عرض ━━━', 'info');

                const showBtn = findShowButton();
                if (showBtn) {
                    showBtn.click();
                    log('✅ تم ضغط عرض', 'success');
                    updateStep('step2', 'done', 'تم');
                } else {
                    log('❌ لم أجد زر عرض', 'error');
                    updateStep('step2', 'error', 'الزر غير موجود');
                    throw new Error('زر عرض غير موجود');
                }

                await wait(3000);
                setProgress(35);

                // ── الخطوة 3: ضغط إضافة ──
                updateStep('step3', 'active', 'جاري الضغط...');
                setStatus('➕ الخطوة 3: ضغط إضافة');
                log('━━━ 3/5 ـ ضغط إضافة ━━━', 'info');

                const addBtn = findAddButton();
                if (addBtn) {
                    addBtn.click();
                    log('✅ تم ضغط إضافة', 'success');
                    updateStep('step3', 'done', 'تم');
                } else {
                    log('❌ لم أجد زر إضافة', 'error');
                    dumpPageElements();
                    updateStep('step3', 'error', 'الزر غير موجود');
                    throw new Error('زر إضافة غير موجود');
                }

                // انتظار ظهور iframe / النموذج
                setStatus('⏳ انتظار نموذج الإضافة...');
                log('⏳ انتظار ظهور النموذج...', 'info');

                let formDoc = null;
                for (let i = 0; i < 18; i++) {
                    await wait(1000);
                    formDoc = findFormDocument();
                    if (formDoc) break;
                }
                setProgress(45);

                if (!formDoc) {
                    log('❌ لم يظهر نموذج الإضافة بعد 18 ثانية', 'error');
                    updateStep('step3', 'error', 'النموذج لم يظهر');
                    throw new Error('نموذج الإضافة لم يظهر');
                }

                log('✅ ظهر نموذج الإضافة!', 'success');
                await wait(1000);

                // ── الخطوة 4: تعبئة النموذج ──
                await fillAddForm(data, formDoc);

                // ── الخطوة 5: تنبيه الحفظ اليدوي ──
                updateStep('step5', 'active', '⚠️ بانتظارك');
                setStatus('🛑 الحفظ يدوي — راجع البيانات ثم اضغط "حفظ"');
                log('━━━ 5/5 ـ ⚠️ الحفظ يدوي — راجع ثم احفظ ━━━', 'warn');
                log('🔴 لا يتم الحفظ تلقائياً — تأكد من صحة البيانات', 'error');

                setProgress(100);

            } catch (err) {
                log('❌ توقف: ' + err.message, 'error');
                setStatus('❌ ' + err.message);
            } finally {
                autoRunning = false;
                if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = '🚀 تشغيل تلقائي كامل'; }
                if (fillBtn) fillBtn.disabled = false;
            }
        }

        // ═══════════════════════════════════════════════════════════════
        //  تعبئة فقط (للنموذج المفتوح مسبقاً)
        // ═══════════════════════════════════════════════════════════════
        async function runFillOnly(data) {
            if (filling) return;
            filling = true;

            const fillBtn = $('#svf-btn-fill-v7');
            const autoBtn = $('#svf-btn-auto-v7');
            if (fillBtn) { fillBtn.disabled = true; fillBtn.textContent = '⏳ جارٍ التعبئة...'; }
            if (autoBtn) autoBtn.disabled = true;

            try {
                const doc = findFormDocument();
                if (doc) {
                    await fillAddForm(data, doc);
                } else {
                    log('⚠ نموذج الإضافة غير مفتوح', 'warn');
                    log('اضغط إضافة أولاً', 'info');
                    setStatus('⚠️ افتح نموذج الإضافة أولاً');
                }
            } catch (err) {
                log('❌ ' + err.message, 'error');
                setStatus('❌ ' + err.message);
            } finally {
                filling = false;
                if (fillBtn) { fillBtn.disabled = false; fillBtn.textContent = '⚡ تعبئة فقط (النموذج مفتوح)'; }
                if (autoBtn) autoBtn.disabled = false;
            }
        }

        // ═══════════════════════════════════════════════════════════════
        //  تعبئة حقول النموذج
        // ═══════════════════════════════════════════════════════════════
        async function fillAddForm(data, doc) {
            log('━━━ 4/5 ـ تعبئة النموذج ━━━', 'info');
            updateStep('step4', 'active', 'جاري التعبئة...');
            setProgress(48);

            // 1. نوع الزيارة
            setStatus('📝 تعبئة نوع الزيارة...');
            const vtEl = doc.getElementById('ddlVisitTypes') || findFormField(doc, ['ddlVisitTypes', 'ddlVisitType']);
            if (vtEl && data.visitType) {
                vtEl.value = data.visitType;
                vtEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ نوع الزيارة: ' + (TYPE_LABELS[data.visitType] || data.visitType), 'success');
            } else if (vtEl) {
                log('ℹ️ نوع الزيارة: لم يُحدد، اختَر يدوياً', 'info');
            }
            await wait(400);
            setProgress(55);

            // 2. التاريخ
            setStatus('📅 تعبئة التاريخ...');
            const dateEl = doc.getElementById('tbDate') || findFormField(doc, ['tbDate', 'txtVisitDate', 'txtDate']);
            if (dateEl && data.date) {
                setFieldValue(dateEl, data.date);
                log('✅ التاريخ: ' + data.date, 'success');
            }
            await wait(300);
            setProgress(62);

            // 3. موضوع الزيارة (الأهداف)
            setStatus('✍️ تعبئة موضوع الزيارة...');
            const subjectEl = doc.getElementById('txtVisitSubject')
                           || findFormField(doc, ['txtVisitSubject', 'txtSubject', 'txtVisitSubject']);
            if (subjectEl && data.objectives && data.objectives.length > 0) {
                setFieldValue(subjectEl, data.objectives.join('\n'));
                log('✅ أهداف الزيارة: ' + data.objectives.length + ' أهداف', 'success');
            } else if (subjectEl) {
                log('ℹ️ لا توجد أهداف — اترك الحقل فارغاً', 'info');
            }
            await wait(300);
            setProgress(70);

            // 4. وقت الوصول
            setStatus('🕐 تعبئة وقت الوصول...');
            fillTimeDropdown(doc, 'ddlVisitArrivalTime', 'ddlArrivalTimeState', data.arrivalTime);
            await wait(200);
            setProgress(76);

            // 5. وقت الانصراف
            setStatus('🕐 تعبئة وقت الانصراف...');
            fillTimeDropdown(doc, 'ddlVisitDepartureTime', 'ddlDepartureTimeState', data.departureTime);
            await wait(200);
            setProgress(82);

            // 6. رأي الزائر
            setStatus('✍️ تعبئة رأي الزائر...');
            const opinionEl = doc.getElementById('txtVisitorOpinion')
                           || findFormField(doc, ['txtVisitorOpinion', 'txtOpinion']);
            if (opinionEl && data.visitorOpinion) {
                setFieldValue(opinionEl, data.visitorOpinion);
                log('✅ رأي الزائر (' + data.visitorOpinion.length + ' حرف)', 'success');
            } else if (opinionEl) {
                log('ℹ️ رأي الزائر فارغ', 'info');
            }
            await wait(300);
            setProgress(90);

            // 7. التوصيات
            setStatus('✍️ تعبئة التوصيات...');
            const recEl = doc.getElementById('txtVisitorRecomendation')
                       || findFormField(doc, ['txtVisitorRecomendation', 'txtVisitorRecommendation', 'txtRecommendations', 'txtRecomendation']);
            if (recEl && data.recommendations) {
                setFieldValue(recEl, data.recommendations);
                log('✅ التوصيات (' + data.recommendations.length + ' حرف)', 'success');
            } else if (recEl) {
                log('ℹ️ لا توجد توصيات', 'info');
            }
            setProgress(100);

            updateStep('step4', 'done', 'تمت التعبئة');
            setStatus('✅ تمت التعبئة — راجع ثم احفظ يدوياً');
            log('━━━ ✅ اكتملت التعبئة! ━━━', 'success');
            log('🛑 راجع البيانات ثم اضغط "حفظ" بنفسك', 'warn');

            // تنظيف التخزين
            try { GM_deleteValue(DATA_KEY); } catch (e) {}
            try { localStorage.removeItem('sv_moe_school_export'); } catch (e) {}
        }

        function setFieldValue(el, value) {
            el.value = value;
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function fillTimeDropdown(doc, timeId, ampmId, timeStr) {
            if (!timeStr) return;

            const parts  = timeStr.split(':');
            const hour24 = parseInt(parts[0], 10) || 8;
            const mins   = parts[1] || '00';
            const ampmVal = hour24 >= 12 ? '2' : '1'; // 1=ص, 2=م
            const ampmLabel = hour24 >= 12 ? 'م' : 'ص';
            const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
            const timeVal = String(hour12).padStart(2, '0') + ':' + mins;

            // وقت
            const timeEl = doc.getElementById(timeId);
            if (timeEl) {
                const opts = Array.from(timeEl.options);
                let match = opts.find(o => o.value === timeVal || o.text.trim() === timeVal);
                if (!match) {
                    const h = String(hour12).padStart(2, '0');
                    match = opts.find(o => o.text.includes(h + ':'));
                }
                if (match) {
                    timeEl.value = match.value;
                    timeEl.dispatchEvent(new Event('change', { bubbles: true }));
                    log('✅ وقت: ' + timeVal + ' ' + ampmLabel, 'success');
                } else {
                    log('⚠ لم أجد خيار الوقت: ' + timeVal, 'warn');
                }
            }

            // AM/PM
            const ampmEl = doc.getElementById(ampmId);
            if (ampmEl) {
                ampmEl.value = ampmVal;
                ampmEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // ═══════════════════════════════════════════════════════════════
        //  اختصارات لوحة المفاتيح
        // ═══════════════════════════════════════════════════════════════
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                if (visitData) runAutoFull(visitData);
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                if (visitData) runFillOnly(visitData);
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                switchToBilingual();
            }
        });

        // ═══════════════════════════════════════════════════════════════
        //  التهيئة
        // ═══════════════════════════════════════════════════════════════
        window.addEventListener('load', () => {
            setTimeout(() => {
                buildPanel(visitData);

                if (visitData) {
                    log('✅ تم استيراد البيانات', 'success');
                    log('🏫 ' + (visitData.school || '—'), 'info');
                    log('📅 ' + (visitData.date || '—'), 'info');
                    log('📋 ' + (visitData.visitTypeName || visitData.visitType || '—'), 'info');
                    log('', 'info');
                    log('🛩️ تفعيل الطيار الآلي — سيبدأ التشغيل التلقائي بعد 3 ثوانٍ...', 'success');
                    log('💡 Ctrl+Shift+A = تلقائي | Ctrl+Shift+F = تعبئة فقط | Ctrl+Shift+L = ثنائي اللغة', 'info');
                    log('⚠️ الحفظ يدوي — راجع البيانات قبل "حفظ"', 'warn');

                    // الطيار الآلي: تشغيل تلقائي بدون ضغط المستخدم
                    setTimeout(() => {
                        log('🛩️ إقلاع الطيار الآلي...', 'success');
                        runAutoFull(visitData);
                    }, 3000);
                }
            }, 1500);
        });

        // مراقب postbacks — إعادة بناء اللوحة إذا اختفت
        let watchInterval = null;
        function startWatching() {
            if (watchInterval) clearInterval(watchInterval);
            watchInterval = setInterval(() => {
                if (!$('#' + PANEL_ID) && visitData) {
                    buildPanel(visitData);
                    log('🔄 تم إعادة بناء اللوحة بعد postback', 'info');
                }
            }, 3000);
        }
        startWatching();

        // إيقاف المراقب بعد 10 دقائق (توفير موارد)
        setTimeout(() => {
            if (watchInterval) { clearInterval(watchInterval); watchInterval = null; }
        }, 10 * 60 * 1000);
    }

})();
