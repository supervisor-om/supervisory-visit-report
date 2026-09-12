// ==UserScript==
// @name         🏫 أتمتة الزيارات المدرسية — v7.0
// @namespace    supervisor-om
// @version      12.0
// @description  تصدير بيانات الزيارة المدرسية من موقع المشرف وتعبئة استمارة الوزارة تلقائياً — مع نظام تتبع مرئي وتحويل ثنائي اللغة عند الحاجة
// @author       Abu Al-Muather
// @homepageURL  https://supervisor-mct.com/
// @updateURL    https://supervisor-mct.com/school-visits-automation.user.js
// @downloadURL  https://supervisor-mct.com/school-visits-automation.user.js
// @match        https://supervisor-om.github.io/supervisory-visit-report/*
// @match        https://supervisor-mct.com/*
// @match        https://www.supervisor-mct.com/*
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
    const AUTOSAVE_KEY = 'svf_autosave_enabled';
    const SAVE_GRACE_MS = 6000;  // مهلة الإلغاء قبل الحفظ

    function autoSaveOn() {
        try { return GM_getValue(AUTOSAVE_KEY, true) !== false; } catch (e) { return true; }
    }
    function setAutoSave(v) {
        try { GM_setValue(AUTOSAVE_KEY, !!v); } catch (e) {}
    }
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
    if (/supervisor-om\.github\.io|supervisor-mct\.com/.test(location.hostname)) {

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
        // ═══════════════════════════════════════════════════════════════
        //  تصدير الزيارة الإشرافية (وحدة SupervisionVisits)
        //  تختلف عن الزيارة المدرسية: ١٣ درجة تقييم + ثلاثة نصوص
        // ═══════════════════════════════════════════════════════════════
        const SUP_KEY = 'svf_supervision_visit_data';

        function doExportSupervisory() {
            const excellence      = $('#strengthsContent')?.value?.trim()       || '';
            const development     = $('#developmentContent')?.value?.trim()     || '';
            const recommendations = $('#recommendationsContent')?.value?.trim() || '';

            if (!excellence && !development && !recommendations) {
                showToastSupervisor('⚠️ ولّد التقرير أولاً قبل التصدير', 'error');
                return;
            }

            const rawDate = $('#visitDate')?.value?.trim() || '';
            let portalDate = rawDate;
            if (rawDate && rawDate.includes('-')) {
                const [y, mo, d] = rawDate.split('-');
                portalDate = d + '/' + mo + '/' + y;
            }

            // ١٣ درجة تُقرأ من الواجهة مباشرة (لا من متغيّرات الصفحة،
            // لأن السكربت يعمل في صندوق معزول لا يرى متغيّرات الصفحة)
            const ratings = [];
            for (let i = 1; i <= 13; i++) {
                const el = document.querySelector('#score-' + i);
                ratings.push(parseInt(el?.textContent?.trim() || '3', 10) || 3);
            }

            const notes = {};
            for (let i = 1; i <= 13; i++) {
                const el = document.querySelector('#notes-' + i);
                const v = el?.textContent?.trim() || '';
                if (v) notes[i] = v;
            }

            const data = {
                kind:        'supervision',
                teacher:     $('#teacherName')?.value?.trim() || '',
                school:      $('#school')?.value?.trim() || $('#schoolName')?.value?.trim() || '',
                subject:     $('#subject')?.value?.trim() || '',      // المادة
                period:      $('#lesson')?.value?.trim() || '',       // الحصة
                lessonTitle: $('#topic')?.value?.trim() || '',        // الموضوع
                className:   $('#class')?.value?.trim() || '',
                fileNumber:  $('#fileNumber')?.value?.trim() || '',
                visitNumber: $('#visitNumber')?.value?.trim() || '',
                date:    portalDate,
                ratings,
                notes,
                excellence,
                development,
                recommendations
            };

            const json = JSON.stringify(data);
            try { GM_setValue(SUP_KEY, json); } catch (e) {}
            try { navigator.clipboard.writeText(json); } catch (e) {}

            const b64 = b64Encode(json);
            const url = 'https://moe.gov.om/SMS/SupervisionVisits/SupervisionVisitsModule.aspx?VisitMode=1'
                      + (b64 ? '#svfs=' + b64 : '');
            window.open(url, '_blank');
            showToastSupervisor('✅ صُدّرت الزيارة الإشرافية — افتح اللوحة في البوابة', 'success');
        }

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

            // زر الزيارة الإشرافية — مسار مستقل تماماً
            const obsSup = new MutationObserver(() => {
                const b = $('#exportToMoeBtn');
                if (b && !b._svfSupPatched) {
                    b._svfSupPatched = true;
                    b.addEventListener('click', e => {
                        e.preventDefault(); e.stopPropagation();
                        doExportSupervisory();
                    }, true);
                }
            });
            obsSup.observe(document.body, { childList: true, subtree: true });

            // محاولة أولى
            const firstBtn = findExportBtn();
            if (firstBtn) { firstBtn._svfPatched = true; patchExportBtn(firstBtn); }

            const firstSup = $('#exportToMoeBtn');
            if (firstSup) {
                firstSup._svfSupPatched = true;
                firstSup.addEventListener('click', e => {
                    e.preventDefault(); e.stopPropagation();
                    doExportSupervisory();
                }, true);
            }
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
    if (location.hostname.includes('moe.gov.om') && !/supervisionvisits/i.test(location.pathname)) {

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
            #svf-btn-diag-v7 { background:#4c1d95; color:#ddd6fe; font-size:11px; }
            #svf-btn-save-v7 { background:#0c4a6e; color:#bae6fd; font-size:11.5px; }
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
            { id: 'step5', label: 'الحفظ في البوابة',              icon: '💾' },
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
                    <button class="svf-btn-v7" id="svf-btn-save-v7">${autoSaveOn() ? '💾 الحفظ التلقائي: مُشغَّل' : '✋ الحفظ التلقائي: مُطفأ'}</button>
                    <button class="svf-btn-v7" id="svf-btn-diag-v7">🔎 تشخيص الصفحة</button>
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
                sessionStorage.removeItem('svf_pilot_done');
            });
            $('#svf-btn-switch-v7')?.addEventListener('click', switchToBilingual);
            $('#svf-btn-save-v7')?.addEventListener('click', (e) => {
                const next = !autoSaveOn();
                setAutoSave(next);
                e.target.textContent = next ? '💾 الحفظ التلقائي: مُشغَّل' : '✋ الحفظ التلقائي: مُطفأ';
                log(next ? '💾 الحفظ التلقائي مُشغَّل — ستُحفظ الزيارة بعد التعبئة'
                         : '✋ الحفظ التلقائي مُطفأ — ستُعبَّأ الحقول وتحفظ بنفسك', 'warn');
            });

            $('#svf-btn-diag-v7')?.addEventListener('click', dumpPageElements);
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
            // المعرّف الفعلي في البوابة هو showImageButton من نوع input[type=image]،
            // وهو بلا نص ولا value — لذلك تفشل المطابقة بالنص أو بالقيمة.
            return document.getElementById('ctl00_content_showImageButton')
                || document.getElementById('ctl00_content_btnShow')
                || $('input[type="image"][id*="showImage"]')
                || $('[id*="showImageButton"]')
                || $('input[type="image"][alt*="عرض"], input[type="image"][title*="عرض"]')
                || $('input[type="submit"][value*="عرض"]')
                || $('input[type="button"][value*="عرض"]')
                || $('button[id*="btnShow"]')
                || [...$$('input[type="submit"], input[type="button"], input[type="image"], button, a')].find(el =>
                    el.textContent?.trim() === 'عرض' || el.value === 'عرض'
                    || el.alt === 'عرض' || el.title === 'عرض');
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

        // علامة وجود نموذج الإضافة: أيٌّ من هذه الحقول يكفي.
        // لا نعتمد على ddlVisitTypes وحده كي لا يفشل الكشف لو تغيّر معرّفه.
        const FORM_MARKERS = ['ddlVisitTypes', 'tbDate', 'txtVisitSubject', 'txtVisitorOpinion'];

        function docHasForm(doc) {
            return !!findFieldFlexible(doc, FORM_MARKERS);
        }

        function findFormDocument() {
            // مباشر
            if (docHasForm(document)) return document;

            // داخل أي إطار يمكن الوصول إليه — لا نقتصر على معرّفات بعينها
            for (const iframe of $$('iframe')) {
                try {
                    const doc = iframe.contentDocument;
                    if (doc && docHasForm(doc)) return doc;
                } catch (e) { /* إطار من أصل مختلف */ }
            }

            return null;
        }

        function dumpPageElements() {
            log('═══ تشخيص الصفحة ═══', 'warn');

            // ٠) أي صفحة نحن فيها؟ الخلط بين وحدتي الزيارات سبب شائع للفشل
            log('العنوان: ' + location.pathname, 'info');
            const path = location.pathname.toLowerCase();
            if (path.includes('schoolvisits')) {
                log('✅ وحدة الزيارات المدرسية — الصفحة الصحيحة لهذا السكربت', 'success');
            } else if (path.includes('supervisionvisits')) {
                log('❌ هذه وحدة الزيارات الإشرافية على الموظفين، لا الزيارات المدرسية', 'error');
                log('👉 هذا السكربت يعمل على: VariousRecords/SchoolVisits/SchoolVisitsMain.aspx', 'warn');
            } else {
                log('⚠ صفحة غير معروفة — قد لا يعمل السكربت هنا', 'warn');
            }

            // ١) أين النموذج؟
            const doc = findFormDocument();
            if (!doc) {
                log('❌ لم يُعثر على نموذج الإضافة في الصفحة ولا في أي إطار', 'error');
            } else {
                log('✅ النموذج في: ' + (doc === document ? 'الصفحة الرئيسية' : 'إطار iframe'), 'success');
            }

            // ٢) الإطارات الموجودة
            const frames = $$('iframe');
            log('عدد الإطارات: ' + frames.length, 'info');
            frames.forEach((f, i) => {
                let access = 'محجوب';
                try { access = f.contentDocument ? 'متاح' : 'محجوب'; } catch (e) {}
                log('  [إطار ' + i + '] id=' + (f.id || '—') + ' | الوصول: ' + access, 'info');
            });

            // ٣) الحقول المتوقعة: هل وُجدت؟ وبأي معرّف فعلي؟
            const target = doc || document;
            const expected = [
                ['نوع الزيارة',    ['ddlVisitTypes', 'ddlVisitType']],
                ['التاريخ',        ['tbDate', 'txtVisitDate', 'txtDate']],
                ['موضوع الزيارة',  ['txtVisitSubject', 'txtSubject']],
                ['وقت الوصول',     ['ddlVisitArrivalTime']],
                ['وقت الانصراف',   ['ddlVisitDepartureTime']],
                ['رأي الزائر',     ['txtVisitorOpinion', 'txtOpinion']],
                ['التوصيات',       ['txtVisitorRecomendation', 'txtVisitorRecommendation', 'txtRecommendations']]
            ];
            log('─── الحقول المتوقعة ───', 'warn');
            expected.forEach(([label, names]) => {
                const el = findFieldFlexible(target, names);
                if (el) log('  ✅ ' + label + ' → #' + (el.id || '(بلا معرّف)') + ' [' + el.tagName + ']', 'success');
                else    log('  ❌ ' + label + ' — غير موجود', 'error');
            });

            // ٤) كل حقول الإدخال — في المستند الرئيسي وفي كل إطار يمكن الوصول إليه.
            //    نموذج الإضافة قد يُفتح داخل إطار، فلا يكفي مسح المستند الرئيسي.
            function dumpFields(where, d) {
                let fields = [];
                try { fields = $$('input:not([type="hidden"]), select, textarea', d); } catch (e) { return; }
                log('─── حقول: ' + where + ' (' + fields.length + ') ───', 'warn');
                fields.forEach((el, i) => {
                    if (i >= 60) return;
                    log('  [' + i + '] ' + el.tagName + ' type=' + (el.type || '—') +
                        ' id=' + (el.id || '—') + ' name=' + (el.name || '—'), 'info');
                });
                if (fields.length > 60) log('  ... و ' + (fields.length - 60) + ' حقلاً آخر', 'info');
            }

            dumpFields('المستند الرئيسي', document);
            frames.forEach((f, i) => {
                try {
                    if (f.contentDocument) dumpFields('إطار ' + i + ' (' + (f.id || '—') + ')', f.contentDocument);
                } catch (e) {}
            });

            log('═══ نهاية التشخيص ═══', 'warn');
            log('📋 انسخ هذا السجل كاملاً وأرسله للمطوّر', 'success');
        }

        function findFormField(doc, ids) {
            // ids: مصفوفة من المعرفات المحتملة
            for (const id of ids) {
                const el = doc.getElementById(id);
                if (el) return el;
            }
            return null;
        }

        // بحث مرن: معرّف حرفي ← لاحقة ← تضمين.
        // ASP.NET يسبق معرّفات عناصر التحكم بلواحق مثل ctl00_ContentPlaceHolder1_
        // فالمطابقة الحرفية وحدها تفشل بصمت على صفحات القوالب الرئيسية.
        function findFieldFlexible(doc, names) {
            for (const n of names) {
                const el = doc.getElementById(n);
                if (el) return el;
            }
            for (const n of names) {
                try { const el = doc.querySelector('[id$="' + n + '"]'); if (el) return el; } catch (e) {}
            }
            for (const n of names) {
                try { const el = doc.querySelector('[id*="' + n + '"]'); if (el) return el; } catch (e) {}
            }
            return null;
        }

        // ═══════════════════════════════════════════════════════════════
        //  التشغيل التلقائي الكامل (مقاوم لـ postback)
        //  البوابة تسوي postback عند ضغط "عرض" → نستخدم sessionStorage
        //  لتتبع الخطوة ونكمل بعد كل إعادة تحميل
        // ═══════════════════════════════════════════════════════════════
        async function runAutoFull(data) {
            if (autoRunning) return;
            autoRunning = true;

            // حفظ البيانات مؤقتاً لاستخدامها بعد postback
            try { sessionStorage.setItem('svf_pilot_data', JSON.stringify(data)); } catch(e) {}

            const autoBtn = $('#svf-btn-auto-v7');
            const fillBtn = $('#svf-btn-fill-v7');
            if (autoBtn) { autoBtn.disabled = true; autoBtn.textContent = '⏳ جارٍ التشغيل...'; }
            if (fillBtn) fillBtn.disabled = true;

            try {
                // تحديد المرحلة الحالية
                const phase = sessionStorage.getItem('svf_pilot_phase') || 'select_school';

                if (phase === 'select_school') {
                    // ── المرحلة 1: اختيار المدرسة → ضغط عرض ──
                    updateStep('step1', 'active', 'جاري البحث...');
                    setStatus('🏫 الخطوة 1: اختيار المدرسة');
                    log('━━━ 1/3 ـ اختيار المدرسة ━━━', 'info');
                    setProgress(10);

                    const result = await findAndSelectSchool(data);
                    if (!result.found) throw new Error(result.error || 'المدرسة غير موجودة في القائمة');

                    await wait(800);
                    updateStep('step1', 'done', 'تم');

                    // ضغط عرض (سيسبب postback)
                    updateStep('step2', 'active', 'جاري الضغط...');
                    setStatus('🔍 الخطوة 2: ضغط عرض');
                    log('━━━ 2/3 ـ ضغط عرض ━━━', 'info');
                    setProgress(25);

                    const showBtn = findShowButton();
                    if (!showBtn) throw new Error('زر عرض غير موجود');

                    // ⚠️ حدد المرحلة التالية قبل الضغط
                    sessionStorage.setItem('svf_pilot_phase', 'after_show');
                    // احفظ تاريخ اليوم عشان نعرف إن هذي جلسة جديدة
                    sessionStorage.setItem('svf_pilot_ts', Date.now().toString());

                    showBtn.click();
                    // الكود بعد هذا السطر لن ينفذ بسبب postback
                    return;

                } else if (phase === 'after_show') {
                    // ── المرحلة 2: الصفحة حملت بعد عرض → أعد اختيار المدرسة ثم اضغط إضافة ──
                    updateStep('step1', 'active', 'إعادة الاختيار...');
                    updateStep('step2', 'done', 'تم');

                    // نعيد اختيار المدرسة لأن البوابة تفقدها بعد postback
                    const reResult = await findAndSelectSchool(data);
                    if (!reResult.found) throw new Error('فقدت المدرسة بعد عرض — ' + (reResult.error || 'غير موجودة'));

                    updateStep('step1', 'done', 'تم');
                    await wait(1500);

                    updateStep('step3', 'active', 'جاري الضغط...');
                    setStatus('➕ الخطوة 3: ضغط إضافة');
                    log('━━━ 3/3 ـ ضغط إضافة وتعبئة ━━━', 'info');
                    setProgress(40);

                    // انتظر شوي عشان الصفحة تستقر بعد postback
                    await wait(2500);

                    const addBtn = findAddButton();
                    if (!addBtn) {
                        dumpPageElements();
                        throw new Error('زر إضافة غير موجود');
                    }

                    addBtn.click();
                    updateStep('step3', 'active', 'انتظار النموذج...');
                    log('✅ تم ضغط إضافة', 'success');

                    // انتظار ظهور iframe
                    setStatus('⏳ انتظار نموذج الإضافة...');
                    log('⏳ انتظار ظهور النموذج...', 'info');

                    let formDoc = null;
                    for (let i = 0; i < 20; i++) {
                        await wait(1000);
                        formDoc = findFormDocument();
                        if (formDoc) break;
                    }

                    if (!formDoc) throw new Error('نموذج الإضافة لم يظهر');

                    log('✅ ظهر نموذج الإضافة!', 'success');
                    setProgress(55);

                    // ── تعبئة النموذج ──
                    updateStep('step4', 'active', 'جاري التعبئة...');
                    const fillRes = await fillAddForm(data, formDoc);
                    setProgress(100);

                    // ── الحفظ ──
                    let saved = false;
                    if (fillRes && fillRes.ok) {
                        const saveRes = await autoSaveForm(data, formDoc, fillRes.written);
                        saved = !!(saveRes && saveRes.ok);
                    } else {
                        updateStep('step5', 'error', 'لم يُحفظ');
                        log('🛑 لم أحفظ: التعبئة لم تكتمل', 'error');
                    }

                    // مراحل الطيار تُنظَّف في الحالين — انتهت الجولة
                    sessionStorage.removeItem('svf_pilot_phase');
                    sessionStorage.removeItem('svf_pilot_data');
                    sessionStorage.removeItem('svf_pilot_ts');
                    sessionStorage.setItem('svf_pilot_done', '1');

                    // بيانات التصدير تبقى ما لم يتأكّد الحفظ
                    if (saved) clearExportData();

                } else {
                    // مرحلة غير معروفة — تنظيف
                    log('⚠️ مرحلة غير معروفة: ' + phase + ' — جاري التنظيف', 'warn');
                    sessionStorage.removeItem('svf_pilot_phase');
                }

            } catch (err) {
                log('❌ توقف: ' + err.message, 'error');
                setStatus('❌ ' + err.message);
                // تنظيف عند الخطأ
                sessionStorage.removeItem('svf_pilot_phase');
                sessionStorage.removeItem('svf_pilot_data');
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
                    const res = await fillAddForm(data, doc);
                    if (res && res.ok) {
                        const saveRes = await autoSaveForm(data, doc, res.written);
                        if (saveRes && saveRes.ok) clearExportData();
                    }
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
        //  الحفظ التلقائي
        //  حفظُ سجلٍّ في بوّابة الوزارة فعلٌ لا رجعة فيه، فلا يُقدَم عليه
        //  إلا بعد قراءة كلّ حقل من الصفحة والتأكّد أنّه يحمل ما كُتب فيه.
        //  والمهلة القصيرة قبله متنفَّسٌ للإلغاء لا خطوةٌ مطلوبة: تمرّ
        //  وحدها إن لم يتدخّل أحد.
        // ═══════════════════════════════════════════════════════════════
        function findSaveButton(doc) {
            const d = doc || document;
            const byId = d.getElementById('ctl00_content_ImgSave')
                      || d.getElementById('ctl00_content_btnSave')
                      || d.getElementById('ctl00_content_ImgUpdate');
            if (byId) return byId;

            const sels = [
                'input[id*="ImgSave"]', 'input[id*="btnSave"]', 'input[id*="ImgUpdate"]',
                'button[id*="ImgSave"]', 'button[id*="btnSave"]',
                'a[id*="ImgSave"]',     'a[id*="btnSave"]',      'img[id*="ImgSave"]',
                'input[type="submit"][value*="حفظ"]', 'input[type="button"][value*="حفظ"]',
                'input[type="image"][alt*="حفظ"]',    'input[type="image"][title*="حفظ"]'
            ];
            for (const sel of sels) {
                try { const el = d.querySelector(sel); if (el) return el; } catch (e) {}
            }

            const texty = Array.from(d.querySelectorAll(
                'input[type="submit"], input[type="button"], input[type="image"], button, a, span[onclick]'));
            return texty.find(el => {
                const t = (el.textContent || '').trim();
                const v = el.value || '', ttl = el.title || '', alt = el.alt || '';
                return t === 'حفظ' || v === 'حفظ' || ttl === 'حفظ' || alt === 'حفظ'
                    || t.includes('حفظ') || v.includes('حفظ');
            }) || null;
        }

        // كلّ ما كُتب يُقرأ من الصفحة مرّة أخرى. لا نعيد البحث بالمعرّفات
        // بل نحتفظ بالعنصر نفسه، فلا تتفرّق قائمةُ التعبئة عن قائمة التحقّق.
        function verifyWritten(written) {
            const bad = [];
            for (const w of written) {
                let actual;
                try { actual = String(w.el.value == null ? '' : w.el.value); }
                catch (e) { bad.push(w.label + ' (تعذّرت قراءته)'); continue; }
                if (actual.trim() !== String(w.expected).trim()) {
                    bad.push(w.label + ' (لا يحمل ما كُتب فيه)');
                }
            }
            return bad;
        }

        function portalErrors(doc) {
            const d = doc || document;
            const out = [];
            const sels = ['[id*="ValidationSummary"]', '[id*="lblMsg"]', '[id*="lblError"]',
                          '[id*="MessageLabel"]', '.error', 'span[style*="color:Red"]',
                          'span[style*="color: red"]'];
            for (const sel of sels) {
                let els = [];
                try { els = Array.from(d.querySelectorAll(sel)); } catch (e) { continue; }
                for (const el of els) {
                    const t = (el.textContent || '').trim();
                    if (t && t.length < 400 && out.indexOf(t) === -1) out.push(t);
                }
            }
            return out;
        }

        // مهلة الإلغاء: تُرسم في اللوحة وتمرّ وحدها.
        // تُرجِع true إن مضت، وfalse إن ألغاها المستخدم.
        function saveCountdown(ms) {
            return new Promise(resolve => {
                let left = Math.ceil(ms / 1000);
                let cancelled = false;

                const bar = document.createElement('div');
                bar.id = 'svf-save-grace';
                bar.style.cssText = 'margin:8px 0;padding:9px;border-radius:9px;background:#78350f;'
                                  + 'color:#fef3c7;font-size:12px;text-align:center;line-height:1.7';
                bar.innerHTML = '<div id="svf-grace-t">الحفظ بعد ' + left + ' ثوانٍ…</div>'
                              + '<button id="svf-grace-x" style="margin-top:6px;width:100%;padding:7px;'
                              + 'border:none;border-radius:7px;background:#fecaca;color:#7f1d1d;'
                              + 'font-weight:bold;cursor:pointer;font-size:12px">إلغاء الحفظ</button>';
                const body = $('#svf-body-v7');
                if (body) body.insertBefore(bar, body.firstChild);

                const finish = (ok) => { clearInterval(iv); bar.remove(); resolve(ok); };

                document.getElementById('svf-grace-x')?.addEventListener('click', () => {
                    cancelled = true;
                    log('🛑 ألغيتَ الحفظ — البيانات باقية في النموذج', 'warn');
                    setStatus('أُلغي الحفظ — احفظ يدوياً إن شئت');
                    finish(false);
                });

                const iv = setInterval(() => {
                    if (cancelled) return;
                    left--;
                    const t = document.getElementById('svf-grace-t');
                    if (t) t.textContent = 'الحفظ بعد ' + left + ' ثوانٍ…';
                    if (left <= 0) finish(true);
                }, 1000);
            });
        }

        // بعد الضغط: البوّابة إمّا تعود إلى القائمة (نجاح)، أو تبقى على
        // النموذج وتعرض أخطاء تحقّق (فشل)، أو لا تفعل شيئاً (مجهول).
        async function waitForSaveOutcome(timeoutMs) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                await wait(1000);

                const errs = portalErrors(findFormDocument() || document);
                if (errs.length) return { ok: false, why: 'رفضت البوّابة الحفظ', errors: errs };

                const formGone   = !findFormDocument();
                const backOnList = !!findAddButton();
                if (formGone && backOnList) return { ok: true, errors: [] };
            }
            return { ok: false, why: 'لم تتأكّد نتيجة الحفظ خلال المهلة', errors: [] };
        }

        async function autoSaveForm(data, doc, written) {
            updateStep('step5', 'active', 'تحقّق قبل الحفظ...');
            setStatus('🔎 مراجعة ما كُتب في النموذج...');
            log('━━━ 5/5 ـ الحفظ ━━━', 'info');

            const bad = verifyWritten(written);
            if (bad.length) {
                updateStep('step5', 'error', 'لم يُحفظ');
                setStatus('🛑 لم أحفظ — راجع النموذج واحفظ يدوياً');
                log('🛑 لم أحفظ: حقول لا تحمل ما كُتب فيها', 'error');
                bad.forEach(b => log('   • ' + b, 'error'));
                log('👉 راجع النموذج بنفسك ثمّ اضغط «حفظ»', 'warn');
                return { ok: false };
            }
            log('✅ كل الحقول تحمل ما كُتب فيها (' + written.length + ')', 'success');

            const saveBtn = findSaveButton(doc) || findSaveButton(document);
            if (!saveBtn) {
                updateStep('step5', 'error', 'زر الحفظ مفقود');
                setStatus('🛑 لم أجد زر الحفظ — احفظ يدوياً');
                log('🛑 لم يُعثر على زر الحفظ في النموذج', 'error');
                log('👉 اضغط «🔎 تشخيص الصفحة» وأرسل السجل للمطوّر', 'warn');
                return { ok: false };
            }
            log('✅ زر الحفظ: #' + (saveBtn.id || saveBtn.value || '?'), 'success');

            if (!autoSaveOn()) {
                updateStep('step5', 'idle', 'الحفظ التلقائي مُطفأ');
                setStatus('✅ تمت التعبئة — الحفظ التلقائي مُطفأ');
                log('ℹ️ الحفظ التلقائي مُطفأ — اضغط «حفظ» بنفسك', 'warn');
                return { ok: false, skipped: true };
            }

            updateStep('step5', 'active', 'مهلة الإلغاء...');
            setStatus('⏳ الحفظ بعد لحظات — يمكنك الإلغاء');
            log('⏳ مهلة ' + (SAVE_GRACE_MS / 1000) + ' ثوانٍ قبل الحفظ — للإلغاء إن أردت', 'warn');
            const go = await saveCountdown(SAVE_GRACE_MS);
            if (!go) {
                updateStep('step5', 'idle', 'أُلغي');
                return { ok: false, cancelled: true };
            }

            updateStep('step5', 'active', 'جارٍ الحفظ...');
            setStatus('💾 جارٍ الحفظ في البوّابة...');
            log('💾 ضغط زر الحفظ...', 'info');
            saveBtn.click();

            const res = await waitForSaveOutcome(25000);
            if (res.ok) {
                updateStep('step5', 'done', 'حُفظت');
                setStatus('✅ حُفظت الزيارة في البوّابة');
                log('━━━ ✅ حُفظت الزيارة في بوّابة الوزارة ━━━', 'success');
                return { ok: true };
            }

            updateStep('step5', 'error', 'لم يتأكّد الحفظ');
            setStatus('⚠️ ' + res.why + ' — راجع البوّابة');
            log('⚠️ ' + res.why, 'error');
            (res.errors || []).forEach(e => log('   • ' + e, 'error'));
            log('👉 راجع الصفحة بنفسك: قد تكون حُفظت وقد لا تكون', 'warn');
            log('💾 بياناتك باقية — لن تحتاج إعادة التصدير', 'success');
            return { ok: false };
        }

        // ═══════════════════════════════════════════════════════════════
        //  تعبئة حقول النموذج
        // ═══════════════════════════════════════════════════════════════
        async function fillAddForm(data, doc) {
            log('━━━ 4/5 ـ تعبئة النموذج ━━━', 'info');
            updateStep('step4', 'active', 'جاري التعبئة...');
            setProgress(48);

            const filled  = [];
            const missing = [];
            const skipped = [];
            // سجلّ ما كُتب فعلاً: يُقرأ منه قبل الحفظ للتأكّد أنّ الصفحة
            // ما زالت تحمله — postback البوّابة يمسح الحقول أحياناً.
            const written = [];

            // معالج موحّد لكل حقل نصّي: يبحث بمرونة ويبلّغ عن النتيجة صراحةً
            function fillText(label, names, value, progress) {
                const el = findFieldFlexible(doc, names);
                if (!el) {
                    missing.push(label);
                    log('❌ لم يُعثر على حقل: ' + label, 'error');
                } else if (!value) {
                    skipped.push(label);
                    log('ℹ️ ' + label + ': لا توجد بيانات لتعبئته', 'info');
                } else {
                    setFieldValue(el, value);
                    filled.push(label);
                    written.push({ label: label, el: el, expected: el.value });
                    log('✅ ' + label + ' (' + String(value).length + ' حرف) → #' + (el.id || '?'), 'success');
                }
                setProgress(progress);
            }

            // 1. نوع الزيارة
            setStatus('📝 تعبئة نوع الزيارة...');
            const vtEl = findFieldFlexible(doc, ['ddlVisitTypes', 'ddlVisitType']);
            if (!vtEl) {
                missing.push('نوع الزيارة');
                log('❌ لم يُعثر على حقل: نوع الزيارة', 'error');
            } else if (!data.visitType) {
                skipped.push('نوع الزيارة');
                log('ℹ️ نوع الزيارة: لم يُحدد، اختَر يدوياً', 'info');
            } else {
                vtEl.value = data.visitType;
                vtEl.dispatchEvent(new Event('change', { bubbles: true }));
                filled.push('نوع الزيارة');
                written.push({ label: 'نوع الزيارة', el: vtEl, expected: vtEl.value });
                log('✅ نوع الزيارة: ' + (TYPE_LABELS[data.visitType] || data.visitType), 'success');
            }
            await wait(400);
            setProgress(55);

            // 2. التاريخ
            setStatus('📅 تعبئة التاريخ...');
            fillText('التاريخ', ['tbDate', 'txtVisitDate', 'txtDate'], data.date, 62);
            await wait(300);

            // 3. موضوع الزيارة (الأهداف)
            setStatus('✍️ تعبئة موضوع الزيارة...');
            const objText = (data.objectives && data.objectives.length) ? data.objectives.join('\n') : '';
            fillText('موضوع الزيارة', ['txtVisitSubject', 'txtSubject'], objText, 70);
            await wait(300);

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
            fillText('رأي الزائر', ['txtVisitorOpinion', 'txtOpinion'], data.visitorOpinion, 90);
            await wait(300);

            // 7. التوصيات
            setStatus('✍️ تعبئة التوصيات...');
            fillText('التوصيات',
                     ['txtVisitorRecomendation', 'txtVisitorRecommendation', 'txtRecommendations', 'txtRecomendation'],
                     data.recommendations, 100);

            // ─── تقرير صادق عن النتيجة ───
            log('─────────────────────────', 'info');
            log('عُبّئ: ' + filled.length + ' | غير موجود: ' + missing.length + ' | بلا بيانات: ' + skipped.length,
                missing.length ? 'warn' : 'info');

            if (missing.length) {
                updateStep('step4', 'error', 'فشل جزئي');
                setStatus('❌ تعذّرت تعبئة ' + missing.length + ' حقل — راجع السجل');
                log('❌ حقول لم يُعثر عليها: ' + missing.join('، '), 'error');
                log('👉 اضغط «🔎 تشخيص الصفحة» وأرسل النتيجة للمطوّر', 'warn');
                log('💾 بياناتك محفوظة — لن تحتاج إعادة التصدير', 'success');
                return { ok: false, written: written, missing: missing, skipped: skipped };
            }

            updateStep('step4', 'done', 'تمت التعبئة');
            log('━━━ ✅ اكتملت التعبئة! ━━━', 'success');

            // البيانات تبقى حتى يتأكّد الحفظ — تُحذف في clearExportData()
            return { ok: true, written: written, missing: missing, skipped: skipped };
        }

        // لا تُحذف بيانات التصدير إلا بعد تأكّد وصول الزيارة إلى البوّابة،
        // كي لا يضطرّ المستخدم إلى إعادة التصدير إذا تعثّر الحفظ.
        function clearExportData() {
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
            const timeEl = findFieldFlexible(doc, [timeId]);
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
            const ampmEl = findFieldFlexible(doc, [ampmId]);
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
                    log(autoSaveOn() ? '💾 الحفظ التلقائي مُشغَّل — تُحفظ الزيارة بعد التعبئة'
                                     : '✋ الحفظ التلقائي مُطفأ — ستحفظ بنفسك', 'warn');

                    // الطيار الآلي: يشتغل تلقائياً ويكمل عبر postbacks
                    const phase = sessionStorage.getItem('svf_pilot_phase');

                    if (phase === 'after_show') {
                        // الصفحة حملت بعد postback "عرض" — أكمل تلقائياً
                        log('🔄 تم الكشف عن جلسة طيار آلي معلقة — جاري الاستكمال...', 'success');
                        setTimeout(() => {
                            log('🛩️ استكمال الطيار الآلي...', 'success');
                            runAutoFull(visitData);
                        }, 3000);
                    } else if (!phase && !sessionStorage.getItem('svf_pilot_done')) {
                        // بداية جديدة — إقلاع تلقائي
                        log('🛩️ تفعيل الطيار الآلي — سيبدأ التشغيل التلقائي بعد 3 ثوانٍ...', 'success');
                        log('💡 Ctrl+Shift+A = تلقائي | Ctrl+Shift+F = تعبئة فقط | Ctrl+Shift+L = ثنائي اللغة', 'info');
                        setTimeout(() => {
                            if (sessionStorage.getItem('svf_pilot_done') || sessionStorage.getItem('svf_pilot_phase')) return;
                            log('🛩️ إقلاع الطيار الآلي...', 'success');
                            runAutoFull(visitData);
                        }, 3000);
                    } else {
                        log('ℹ️ الطيار الآلي اكتمل مسبقاً — استخدم الأزرار أدناه للتكرار', 'info');
                        log('💡 Ctrl+Shift+A = تلقائي | Ctrl+Shift+F = تعبئة فقط | Ctrl+Shift+L = ثنائي اللغة', 'info');
                    }
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


    // ═══════════════════════════════════════════════════════════════
    //  جزء 3: وحدة الزيارات الإشرافية على الموظفين
    //  SMS/SupervisionVisits/SupervisionVisitsModule.aspx
    // ═══════════════════════════════════════════════════════════════
    if (location.hostname.includes('moe.gov.om') && /supervisionvisits/i.test(location.pathname)) {
        if (window.top !== window.self) return;

        const SUP_KEY = 'svf_supervision_visit_data';
        const P = 'svfs-panel', L = 'svfs-log', S = 'svfs-status';

        // ─── خريطة حقول البوابة ───
        // مبدئية: البوابة لم تُفحص بعد وهي مفتوحة على نموذج الإضافة.
        // البحث المرن يجرّب كل مرشّح، وزر «تشخيص» يكشف المعرّفات الحقيقية.
        // ─── المرحلة ١: رأس الزيارة ───
        // معرّفات مثبَّتة من تشخيص البوّابة، ومعها مرادفات احتياطية
        const STAGE1_FIELDS = {
            'التاريخ':      ['visitDataPicker_dateTextBox', 'dtpVisitDate_dateTextBox', 'tbDate', 'txtVisitDate'],
            'الحصة':        ['TeacherManualSchedule1_ddlSessionIndex', 'ddlSessionIndex', 'ddlPeriod'],
            'المادة':       ['applicationPageContentPlaceHolder_ddlSubjects', 'ddlSubjects', 'ddlSubject'],
            'عنوان الدرس':  ['TeacherManualSchedule1_txtLessonTitle', 'txtLessonTitle']
        };
        const STAGE1_KEYMAP = {
            'التاريخ': 'date', 'الحصة': 'period', 'المادة': 'subject', 'عنوان الدرس': 'lessonTitle'
        };

        // ─── المرحلة ٢: التقييم — لم تُرَ بعد، فالمعرّفات مرشّحات ───
        const STAGE2_FIELDS = {
            'أوجه التميز':   ['txtExcellence', 'txtStrengths', 'txtVisitorOpinion', 'txtOpinion'],
            'أوجه التطوير':  ['txtDevelopment', 'txtNeedsDevelopment', 'txtDevelopmentAspects'],
            'التوصيات':      ['txtVisitorRecomendation', 'txtVisitorRecommendation', 'txtRecommendations']
        };
        const STAGE2_KEYMAP = {
            'أوجه التميز': 'excellence', 'أوجه التطوير': 'development', 'التوصيات': 'recommendations'
        };

        // بحث الموظّف: حقل إكمالٍ تلقائيّ مع زرّ بحثٍ وشبكة نتائج،
        // فاختيار المعلّم نقرُ صفٍّ لا كتابةُ اسم.
        const EMP_SEARCH = ['EmployeeAdministrativeScaleSearchCtrl1_txtSearchText_AutoCompletTextBox',
                            'txtSearchText_AutoCompletTextBox'];
        const EMP_SEARCH_BTN = ['EmployeeAdministrativeScaleSearchCtrl1_btnSearch'];
        const FORMS_DDL = ['applicationPageContentPlaceHolder_ddlForms', 'ddlForms'];
        const STAGE1_NEXT = ['applicationPageContentPlaceHolder_btnAdd'];

        // للتوافق مع ما يقرؤها من الشفرة القديمة
        const SUP_FIELDS = Object.assign({}, STAGE1_FIELDS, STAGE2_FIELDS);
        const SUP_KEYMAP = Object.assign({}, STAGE1_KEYMAP, STAGE2_KEYMAP);
        const ratingCandidates = i => ['ddlRating' + i, 'ddlItem' + i, 'ddlEvaluation' + i,
                                       'ddlStandard' + i, 'ddlDegree' + i, 'ddlScore' + i];

        // المعلّم قد يكون قائمةً منسدلة أو حقلاً نصّياً أو مُختاراً في صفحة
        // القائمة قبل «إضافة» — والثلاثة تُعالَج على حدة أدناه.
        const TEACHER_FIELDS = ['ddlEmployee', 'ddlTeacher', 'ddlStaff', 'ddlEmp',
                                'txtTeacherName', 'txtEmployeeName', 'txtTeacher',
                                'lblTeacherName', 'lblEmployeeName'];

        // وصفٌ لكل بند من الثلاثة عشر، إن كان للبوّابة حقلٌ له
        const noteCandidates = i => ['txtNote' + i, 'txtNotes' + i, 'txtRemark' + i,
                                     'txtRemarks' + i, 'txtDesc' + i, 'txtDescription' + i,
                                     'txtComment' + i, 'txtItem' + i, 'txtEvidence' + i,
                                     'txtItemNote' + i, 'txtStandardNote' + i];

        // تسوية الاسم العربي قبل المقارنة: الألف والتاء المربوطة والياء
        // تُكتب بأشكال مختلفة، والمسافات تتكرّر.
        function normAr(v) {
            return String(v || '')
                .replace(/[\u0640\u064B-\u0652]/g, '')
                .replace(/[\u0623\u0625\u0622]/g, '\u0627')
                .replace(/\u0629/g, '\u0647')
                .replace(/\u0649/g, '\u064A')
                .replace(/\s+/g, ' ')
                .trim();
        }

        let sup = null;
        (function () {
            try {
                const m = location.hash.match(/#svfs=([A-Za-z0-9+/=]+)/);
                if (m) {
                    const json = b64Decode(m[1]);
                    if (json) {
                        sup = JSON.parse(json);
                        try { GM_setValue(SUP_KEY, json); } catch (e) {}
                        history.replaceState(null, '', location.pathname + location.search);
                    }
                }
            } catch (e) {}
            if (!sup) {
                try { const raw = GM_getValue(SUP_KEY, ''); if (raw) sup = JSON.parse(raw); } catch (e) {}
            }
            if (!sup) {
                try {
                    const raw = localStorage.getItem('sv_moe_supervision_export');
                    if (raw) sup = JSON.parse(raw);
                } catch (e) {}
            }
        })();

        function findFlex(doc, names) {
            for (const n of names) { const el = doc.getElementById(n); if (el) return el; }
            for (const n of names) { try { const el = doc.querySelector('[id$="' + n + '"]'); if (el) return el; } catch (e) {} }
            for (const n of names) { try { const el = doc.querySelector('[id*="' + n + '"]'); if (el) return el; } catch (e) {} }
            return null;
        }
        function docs() {
            const out = [document];
            for (const f of $$('iframe')) { try { if (f.contentDocument) out.push(f.contentDocument); } catch (e) {} }
            return out;
        }
        function findAnywhere(names) {
            for (const d of docs()) { const el = findFlex(d, names); if (el) return el; }
            return null;
        }
        function slog(msg, type) {
            const box = document.getElementById(L);
            if (!box) return;
            const line = document.createElement('div');
            line.className = 'svfs-l-' + (type || 'info');
            line.textContent = new Date().toLocaleTimeString('ar-OM') + ' | ' + msg;
            box.appendChild(line);
            box.scrollTop = box.scrollHeight;
        }
        function sstat(t) { const e = document.getElementById(S); if (e) e.textContent = t; }
        function setVal(el, v) {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // نموذج الإضافة في هذه الوحدة صفحة مستقلة لا نافذة منبثقة،
        // فوجود زر «إضافة» يعني أننا ما زلنا على صفحة القائمة.
        function supAddBtn() {
            return document.getElementById('ctl00_content_ImgAdd')
                || document.querySelector('[id$="ImgAdd"]')
                || document.querySelector('input[type="image"][id*="Add"]');
        }
        function onListPage() { return !!supAddBtn(); }
        function formFieldsPresent() {
            for (const names of Object.values(SUP_FIELDS)) { if (findAnywhere(names)) return true; }
            return false;
        }

        // ─── أيّ مرحلةٍ نحن فيها؟ ───
        // البوّابة معالجٌ على مرحلتين: رأس الزيارة ثمّ التقييم. ولكلٍّ
        // حقولها، فمحاولةُ تعبئة حقول مرحلةٍ في الأخرى تبلغ عن فقدٍ كاذب.
        function supStage() {
            if (findAnywhere(STAGE1_FIELDS['التاريخ']) || findAnywhere(FORMS_DDL)) return 1;
            for (const names of Object.values(STAGE2_FIELDS)) if (findAnywhere(names)) return 2;
            if (findAnywhere(ratingCandidates(1))) return 2;
            return 0;
        }

        async function supFill() {
            const stage = supStage();
            if (stage === 0) {
                sstat('لا نموذج في هذه الصفحة');
                slog('لم أتعرّف على مرحلةٍ من مراحل النموذج هنا', 'error');
                supDiag();
                slog('اضغط «نسخ السجل» وأرسله للمطوّر', 'warn');
                return;
            }

            slog('المرحلة ' + stage + ': ' + (stage === 1 ? 'رأس الزيارة' : 'التقييم'), 'warn');
            const FIELDS = stage === 1 ? STAGE1_FIELDS : STAGE2_FIELDS;
            const KEYMAP = stage === 1 ? STAGE1_KEYMAP : STAGE2_KEYMAP;

            const filled = [], missing = [], empty = [], written = [];

            for (const [label, names] of Object.entries(FIELDS)) {
                const el = findAnywhere(names);
                const val = sup[KEYMAP[label]];
                if (!el) { missing.push(label); slog('لم يُعثر على: ' + label, 'error'); continue; }
                if (!val) { empty.push(label); slog(label + ': لا بيانات', 'info'); continue; }

                if (el.tagName === 'SELECT') {
                    const want = normAr(val);
                    const opts = Array.from(el.options || []);
                    const opt = opts.find(o => String(o.value) === String(val))
                             || opts.find(o => normAr(o.text) === want)
                             || opts.find(o => normAr(o.text).includes(want));
                    if (opt) {
                        el.value = opt.value;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        written.push({ label: label, el: el, expected: el.value });
                        filled.push(label);
                        slog('اختير ' + label + ': ' + opt.text.trim() + ' → #' + (el.id || '?'), 'success');
                    } else {
                        missing.push(label);
                        slog(label + ': «' + val + '» ليس في خيارات القائمة', 'error');
                    }
                } else {
                    setVal(el, val);
                    written.push({ label: label, el: el, expected: el.value });
                    filled.push(label);
                    slog('عُبّئ ' + label + ' → #' + (el.id || '?'), 'success');
                }
            }

            let teacherBlocked = false, rMiss = 0, notesPartial = false, nFound = 0, nMiss = 0;

            if (stage === 1) {
                // ─── المعلّم: حقل بحثٍ لا حقل اسم ───
                // كتابةُ الاسم لا تختاره؛ الاختيار نقرُ صفٍّ في شبكة النتائج،
                // وشكلُ الشبكة لم يُعرَف بعد. فيُكتب الاسم ويُترك النقر لك.
                const se = findAnywhere(EMP_SEARCH);
                if (se && sup.teacher) {
                    setVal(se, sup.teacher);
                    slog('كُتب اسم المعلّم في حقل البحث → #' + (se.id || '?'), 'success');
                    slog('اضغط «بحث» في البوّابة ثمّ اختر المعلّم من النتائج', 'warn');
                } else if (!se) {
                    slog('حقل بحث الموظّف غير موجود في هذه الصفحة', 'warn');
                }
                const forms = findAnywhere(FORMS_DDL);
                if (forms) {
                    const n = (forms.options || []).length;
                    slog('قائمة الاستمارات موجودة (' + n + ' خياراً) — اخترها بنفسك', 'warn');
                }
            } else {
                // ─── المرحلة ٢: الدرجات والأوصاف ───
                let rOk = 0;
                (sup.ratings || []).forEach((score, idx) => {
                    const el = findAnywhere(ratingCandidates(idx + 1));
                    if (!el) { rMiss++; return; }
                    const v = String(score);
                    if (el.tagName === 'SELECT') {
                        const opt = Array.from(el.options).find(o => o.value === v || o.text.trim() === v);
                        if (opt) {
                            el.value = opt.value;
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            written.push({ label: 'درجة ' + (idx + 1), el: el, expected: el.value });
                            rOk++;
                        } else rMiss++;
                    } else {
                        setVal(el, v);
                        written.push({ label: 'درجة ' + (idx + 1), el: el, expected: el.value });
                        rOk++;
                    }
                });
                slog('الدرجات: ' + rOk + ' من ' + (sup.ratings || []).length + (rMiss ? ' | تعذّر ' + rMiss : ''),
                     rMiss ? 'warn' : 'success');

                const notes = sup.notes || {};
                const noteKeys = Object.keys(notes);
                let nOk = 0;
                if (noteKeys.length) {
                    for (let i = 1; i <= 13; i++) {
                        const el = findAnywhere(noteCandidates(i));
                        if (el) nFound++;
                        const v = notes[i] || notes[String(i)] || '';
                        if (!el) { if (v) nMiss++; continue; }
                        if (!v) continue;
                        setVal(el, v);
                        written.push({ label: 'وصف البند ' + i, el: el, expected: el.value });
                        nOk++;
                    }
                    if (nFound === 0) slog('لا حقول أوصافٍ للبنود في هذا النموذج — الأوصاف لن تُرسَل', 'warn');
                    else slog('الأوصاف: ' + nOk + ' من ' + noteKeys.length + (nMiss ? ' | تعذّر ' + nMiss : ''),
                              nMiss ? 'warn' : 'success');
                }
                notesPartial = nFound > 0 && nMiss > 0;

                // المعلّم في مرحلة التقييم: إن وُجد حقلٌ له وفشلت مطابقته فلا حفظ
                const tEl = findAnywhere(TEACHER_FIELDS);
                if (tEl && sup.teacher && tEl.tagName === 'SELECT') {
                    const want = normAr(sup.teacher);
                    const opts = Array.from(tEl.options || []);
                    const opt = opts.find(o => normAr(o.text) === want)
                             || opts.find(o => normAr(o.text).includes(want));
                    if (opt) {
                        tEl.value = opt.value;
                        tEl.dispatchEvent(new Event('change', { bubbles: true }));
                        written.push({ label: 'المعلّم', el: tEl, expected: tEl.value });
                        slog('اختير المعلّم: ' + opt.text.trim(), 'success');
                    } else {
                        teacherBlocked = true;
                        slog('اسم المعلّم «' + sup.teacher + '» ليس في قائمة البوّابة', 'error');
                        slog('اختره بنفسك — لن أحفظ سجلّاً قد يُنسب لغيره', 'error');
                    }
                } else if (tEl && sup.teacher) {
                    setVal(tEl, sup.teacher);
                    written.push({ label: 'المعلّم', el: tEl, expected: tEl.value });
                    slog('عُبّئ المعلّم → #' + (tEl.id || '?'), 'success');
                }
            }

            slog('---------------------', 'info');
            slog('عُبّئ ' + filled.length + ' | مفقود ' + missing.length + ' | بلا بيانات ' + empty.length,
                 missing.length ? 'warn' : 'success');

            if (missing.length || rMiss || teacherBlocked || notesPartial) {
                sstat('تعذّرت تعبئة بعض الحقول — لم أحفظ');
                if (missing.length) slog('مفقود: ' + missing.join('، '), 'error');
                if (rMiss) slog('درجات تعذّرت: ' + rMiss, 'error');
                if (teacherBlocked) slog('المعلّم: لم يُطابَق اسمه في القائمة', 'error');
                if (notesPartial) slog('الأوصاف: وُجد ' + nFound + ' حقلاً وغاب ' + nMiss
                                     + ' — خريطة مشكوك فيها', 'error');
                slog('بياناتك محفوظة — لن تحتاج إعادة التصدير', 'success');
                slog('', 'info');
                supDiag();
                slog('', 'info');
                slog('اضغط «نسخ السجل» وأرسله للمطوّر', 'warn');
                return;
            }

            if (stage === 1) {
                // رأسُ الزيارة ليس موضع حفظ: بعده مرحلةُ التقييم
                sstat('اكتمل رأس الزيارة — أكمل الاختيار ثمّ انتقل للتقييم');
                slog('المرحلة ١ تمّت. اختر المعلّم والاستمارة ثمّ اضغط «إضافة» في البوّابة', 'warn');
                slog('وحين تظهر صفحة التقييم اضغط «تعبئة النموذج» مرّة أخرى', 'warn');
                return;
            }

            await supSave(written);
        }

        // ─── الحفظ في وحدة الزيارات الإشرافية ───
        function supFindSave() {
            for (const d of docs()) {
                const el = d.getElementById('ctl00_content_ImgSave')
                        || d.getElementById('ctl00_content_btnSave')
                        || d.querySelector('[id$="ImgSave"]')
                        || d.querySelector('[id*="btnSave"]')
                        || d.querySelector('input[type="submit"][value*="حفظ"]')
                        || d.querySelector('input[type="image"][id*="Save"]');
                if (el) return el;
            }
            return null;
        }

        function supPortalErrors() {
            const out = [];
            for (const d of docs()) {
                let els = [];
                try {
                    els = Array.from(d.querySelectorAll(
                        '[id*="ValidationSummary"], [id*="lblMsg"], [id*="lblError"], span[style*="color:Red"]'));
                } catch (e) { continue; }
                for (const el of els) {
                    const t = (el.textContent || '').trim();
                    if (t && t.length < 400 && out.indexOf(t) === -1) out.push(t);
                }
            }
            return out;
        }

        async function supSave(written) {
            const bad = [];
            for (const w of written) {
                let actual;
                try { actual = String(w.el.value == null ? '' : w.el.value); }
                catch (e) { bad.push(w.label); continue; }
                if (actual.trim() !== String(w.expected).trim()) bad.push(w.label);
            }
            if (bad.length) {
                sstat('لم أحفظ — حقول لا تحمل ما كُتب فيها');
                slog('🛑 لم أحفظ: ' + bad.join('، '), 'error');
                slog('راجع النموذج بنفسك ثمّ اضغط «حفظ»', 'warn');
                return;
            }

            const btn = supFindSave();
            if (!btn) {
                sstat('لم أجد زر الحفظ — احفظ يدوياً');
                slog('🛑 لم يُعثر على زر الحفظ', 'error');
                slog('اضغط «تشخيص» وأرسل السجل للمطوّر', 'warn');
                return;
            }

            if (!autoSaveOn()) {
                sstat('تمت التعبئة — الحفظ التلقائي مُطفأ');
                slog('الحفظ التلقائي مُطفأ — اضغط «حفظ» بنفسك', 'warn');
                return;
            }

            sstat('الحفظ بعد ' + (SAVE_GRACE_MS / 1000) + ' ثوانٍ — اضغط «إلغاء الحفظ»');
            slog('⏳ مهلة ' + (SAVE_GRACE_MS / 1000) + ' ثوانٍ قبل الحفظ', 'warn');
            const go = await supCountdown(SAVE_GRACE_MS);
            if (!go) { sstat('أُلغي الحفظ — احفظ يدوياً إن شئت'); return; }

            sstat('جارٍ الحفظ...');
            slog('💾 ضغط زر الحفظ...', 'info');
            btn.click();

            const deadline = Date.now() + 25000;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 1000));
                const errs = supPortalErrors();
                if (errs.length) {
                    sstat('رفضت البوّابة الحفظ');
                    slog('⚠️ رفضت البوّابة الحفظ:', 'error');
                    errs.forEach(e => slog('   • ' + e, 'error'));
                    slog('بياناتك باقية — لن تحتاج إعادة التصدير', 'success');
                    return;
                }
                if (onListPage() && !formFieldsPresent()) {
                    sstat('✅ حُفظت الزيارة في البوّابة');
                    slog('━━━ ✅ حُفظت الزيارة في بوّابة الوزارة ━━━', 'success');
                    try { GM_deleteValue(SUP_KEY); } catch (e) {}
                    return;
                }
            }
            sstat('لم تتأكّد نتيجة الحفظ — راجع البوّابة');
            slog('⚠️ لم تتأكّد نتيجة الحفظ خلال المهلة', 'error');
            slog('راجع الصفحة بنفسك: قد تكون حُفظت وقد لا تكون', 'warn');
        }

        function supCountdown(ms) {
            return new Promise(resolve => {
                let left = Math.ceil(ms / 1000), cancelled = false;
                const bar = document.createElement('div');
                bar.style.cssText = 'margin:6px 0;padding:8px;border-radius:8px;background:#78350f;'
                                  + 'color:#fef3c7;font-size:11.5px;text-align:center;line-height:1.7';
                bar.innerHTML = '<div id="svfs-grace-t">الحفظ بعد ' + left + ' ثوانٍ…</div>'
                              + '<button id="svfs-grace-x" style="margin-top:5px;width:100%;padding:6px;'
                              + 'border:none;border-radius:6px;background:#fecaca;color:#7f1d1d;'
                              + 'font-weight:bold;cursor:pointer;font-size:11.5px">إلغاء الحفظ</button>';
                const status = document.getElementById(S);
                if (status && status.parentNode) status.parentNode.insertBefore(bar, status.nextSibling);

                const finish = (ok) => { clearInterval(iv); bar.remove(); resolve(ok); };
                document.getElementById('svfs-grace-x')?.addEventListener('click', () => {
                    cancelled = true;
                    slog('🛑 ألغيتَ الحفظ — البيانات باقية في النموذج', 'warn');
                    finish(false);
                });
                const iv = setInterval(() => {
                    if (cancelled) return;
                    left--;
                    const t = document.getElementById('svfs-grace-t');
                    if (t) t.textContent = 'الحفظ بعد ' + left + ' ثوانٍ…';
                    if (left <= 0) finish(true);
                }, 1000);
            });
        }

        function supDiag() {
            slog('=== تشخيص وحدة الزيارات الإشرافية ===', 'warn');
            slog('العنوان: ' + location.pathname, 'info');
            const ds = docs();
            slog('المستندات: ' + ds.length + ' (رئيسي + ' + (ds.length - 1) + ' إطار)', 'info');
            slog('--- الحقول المتوقعة ---', 'warn');
            for (const [label, names] of Object.entries(SUP_FIELDS)) {
                const el = findAnywhere(names);
                slog(el ? '  [موجود] ' + label + ' → #' + (el.id || '?') + ' [' + el.tagName + ']'
                        : '  [مفقود] ' + label, el ? 'success' : 'error');
            }
            const tEl2 = findAnywhere(TEACHER_FIELDS);
            slog(tEl2 ? '  [موجود] المعلّم → #' + (tEl2.id || '?') + ' [' + tEl2.tagName + ']'
                        + (tEl2.tagName === 'SELECT' ? ' خيارات=' + (tEl2.options || []).length : '')
                      : '  [مفقود] المعلّم', tEl2 ? 'success' : 'error');

            let found = 0;
            for (let i = 1; i <= 13; i++) { if (findAnywhere(ratingCandidates(i))) found++; }
            slog('--- حقول الدرجات: وُجد ' + found + ' من 13 ---', found ? 'success' : 'error');

            let nf = 0;
            for (let i = 1; i <= 13; i++) { if (findAnywhere(noteCandidates(i))) nf++; }
            slog('--- حقول أوصاف البنود: وُجد ' + nf + ' من 13 ---', nf ? 'success' : 'warn');
            ds.forEach((d, di) => {
                let fs = [];
                try { fs = $$('input:not([type="hidden"]), select, textarea', d); } catch (e) { return; }
                slog('--- حقول ' + (di === 0 ? 'المستند الرئيسي' : 'إطار ' + di) + ' (' + fs.length + ') ---', 'warn');
                fs.forEach((el, i) => {
                    if (i >= 60) return;
                    slog('  [' + i + '] ' + el.tagName + ' type=' + (el.type || '—') +
                         ' id=' + (el.id || '—') + ' name=' + (el.name || '—'), 'info');
                });
                if (fs.length > 60) slog('  ... و ' + (fs.length - 60) + ' آخر', 'info');
            });
            // ─── الشبكات: أين الصفوف وكيف يُنقر عليها ───
            ds.forEach((d, di) => {
                let tables = [];
                try { tables = Array.from(d.querySelectorAll('table')); } catch (e) { return; }
                const grids = tables.filter(tb => {
                    const rows = tb.rows ? tb.rows.length : 0;
                    return rows >= 2 && (tb.id || (tb.className || '').length);
                }).slice(0, 5);
                if (!grids.length) return;
                slog('--- شبكات ' + (di === 0 ? 'المستند الرئيسي' : 'إطار ' + di)
                   + ' (' + grids.length + ') ---', 'warn');
                grids.forEach((tb, gi) => {
                    const rows = tb.rows ? tb.rows.length : 0;
                    slog('  [شبكة ' + gi + '] id=' + (tb.id || '—')
                       + ' class=' + ((tb.className || '—').slice(0, 40)) + ' صفوف=' + rows, 'info');
                    for (let r = 0; r < Math.min(rows, 3); r++) {
                        const tr = tb.rows[r];
                        const cells = Array.from(tr.cells || []).slice(0, 6)
                            .map(c => (c.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22));
                        const click = tr.getAttribute('onclick') || '';
                        const inner = Array.from(tr.querySelectorAll('a, input[type="image"], input[type="radio"], input[type="checkbox"]'))
                            .slice(0, 3)
                            .map(e => e.tagName + (e.id ? '#' + e.id : '')
                                    + (e.type ? '[' + e.type + ']' : ''));
                        slog('     صف' + r + ': ' + cells.join(' | '), 'info');
                        if (click) slog('        onclick=' + click.slice(0, 110), 'info');
                        if (inner.length) slog('        فيه: ' + inner.join('  '), 'info');
                    }
                });
            });

            slog('=== نهاية التشخيص ===', 'warn');
            slog('انسخ السجل كاملاً وأرسله للمطوّر', 'success');
        }

        GM_addStyle(
            '#svfs-panel{position:fixed;top:70px;right:12px;z-index:99999;width:340px;' +
            'background:#0b0f14;color:#dbeafe;border:1px solid #1e3a5f;border-radius:12px;' +
            'font-family:Tahoma,sans-serif;font-size:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);direction:rtl}' +
            '#svfs-panel .h{padding:10px 12px;background:linear-gradient(135deg,#1d4ed8,#1e3a8a);' +
            'border-radius:11px 11px 0 0;font-weight:bold;cursor:move}' +
            '#svfs-panel .b{padding:12px}' +
            '#svfs-panel button{width:100%;padding:9px;border:none;border-radius:8px;cursor:pointer;' +
            'font-size:12.5px;font-weight:bold;margin-bottom:6px}' +
            '#svfs-fill{background:#15803d;color:#fff}' +
            '#svfs-add{background:#b45309;color:#fff}' +
            '#svfs-diag{background:#4c1d95;color:#ddd6fe;font-size:11px}' +
            '#svfs-autosave{background:#0c4a6e;color:#bae6fd;font-size:11px}' +
            '#svfs-copy{background:#065f46;color:#a7f3d0;font-size:11.5px}' +
            '#svfs-clear{background:#1f2937;color:#9ca3af;font-size:11px}' +
            '#svfs-status{padding:7px;background:#0f172a;border-radius:7px;margin-bottom:8px;' +
            'text-align:center;font-size:11.5px}' +
            '#svfs-log{background:#020617;border:1px solid #1e293b;border-radius:7px;padding:8px;' +
            'height:190px;overflow-y:auto;font-family:monospace;font-size:10.5px;line-height:1.6}' +
            '.svfs-l-error{color:#fca5a5}.svfs-l-success{color:#6ee7b7;font-weight:bold}' +
            '.svfs-l-warn{color:#fcd34d}.svfs-l-info{color:#93c5fd}' +
            '#svfs-data{background:#0f172a;border:1px solid #1e3a5f;border-radius:7px;' +
            'padding:8px;margin-bottom:8px;font-size:11px}'
        );

        const panel = document.createElement('div');
        panel.id = P;
        panel.innerHTML =
            '<div class="h">أتمتة الزيارات الإشرافية</div>' +
            '<div class="b">' +
              (sup
                ? '<div id="svfs-data">المعلم: ' + esc(sup.teacher || '—') +
                  '<br>المدرسة: ' + esc(sup.school || '—') +
                  '<br>التاريخ: ' + esc(sup.date || '—') +
                  ' | تقييمات: ' + (sup.ratings || []).length + '</div>'
                : '<div id="svfs-data">لا توجد بيانات — صدّر زيارة من الموقع أولاً</div>') +
              '<div id="' + S + '">' + (sup ? 'جاهز — افتح نموذج الإضافة ثم اضغط تعبئة' : 'بانتظار البيانات') + '</div>' +
              '<button id="svfs-add">فتح نموذج الإضافة</button>' +
              (sup ? '<button id="svfs-fill">تعبئة النموذج</button>' : '') +
              '<button id="svfs-autosave">' +
                (autoSaveOn() ? 'الحفظ التلقائي: مُشغَّل' : 'الحفظ التلقائي: مُطفأ') + '</button>' +
              '<button id="svfs-copy">نسخ السجل</button>' +
              '<button id="svfs-diag">تشخيص الصفحة</button>' +
              '<button id="svfs-clear">مسح السجل</button>' +
              '<div id="' + L + '"></div>' +
            '</div>';
        document.body.appendChild(panel);

        document.getElementById('svfs-add')?.addEventListener('click', () => {
            const btn = supAddBtn();
            if (!btn) { slog('لا يوجد زر «إضافة» في هذه الصفحة', 'warn'); return; }
            slog('فتح نموذج الإضافة... ستُعاد اللوحة بعد تحميل الصفحة', 'info');
            btn.click();
        });
        document.getElementById('svfs-fill')?.addEventListener('click', supFill);
        document.getElementById('svfs-autosave')?.addEventListener('click', (e) => {
            const next = !autoSaveOn();
            setAutoSave(next);
            e.target.textContent = next ? 'الحفظ التلقائي: مُشغَّل' : 'الحفظ التلقائي: مُطفأ';
            slog(next ? 'الحفظ التلقائي مُشغَّل' : 'الحفظ التلقائي مُطفأ', 'warn');
        });
        document.getElementById('svfs-copy')?.addEventListener('click', (e) => {
            const box = document.getElementById(L);
            const text = box ? Array.from(box.children).map(n => n.textContent).join('\n') : '';
            const done = () => { e.target.textContent = 'نُسخ ✓';
                                 setTimeout(() => { e.target.textContent = 'نسخ السجل'; }, 2000); };
            try {
                navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
            } catch (err) { fallback(text, done); }

            // الحافظة محجوبة أحياناً في إطارات البوّابة — يُعرض النصّ ليُنسخ يدوياً
            function fallback(t2, cb) {
                const ta = document.createElement('textarea');
                ta.value = t2;
                ta.style.cssText = 'position:fixed;top:10%;right:10%;width:80%;height:70%;z-index:999999';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e2) {}
                setTimeout(() => ta.remove(), 15000);
                cb();
            }
        });

        document.getElementById('svfs-diag')?.addEventListener('click', supDiag);
        document.getElementById('svfs-clear')?.addEventListener('click', () => {
            const b = document.getElementById(L); if (b) b.innerHTML = '';
        });

        // ─── الطيّار الآلي ───
        // نموذج الإضافة هنا صفحة مستقلّة، فالجولة تنقطع بانتقال الصفحة
        // وتُستأنف على الصفحة التالية: العلامة في sessionStorage تقول
        // أيّ الشوطين نحن فيه.
        const SUP_PILOT = 'svfs_pilot_phase';
        const SUP_DONE  = 'svfs_pilot_done';

        async function supPilot() {
            if (!sup) return;

            if (onListPage() && !formFieldsPresent()) {
                slog('🛩️ الطيّار الآلي: فتح نموذج الإضافة...', 'success');
                sstat('فتح نموذج الإضافة...');
                sessionStorage.setItem(SUP_PILOT, 'opened');
                const btn = supAddBtn();
                if (!btn) { slog('لا يوجد زر «إضافة»', 'error'); return; }
                btn.click();
                return;  // تُستأنف الجولة بعد تحميل الصفحة الجديدة
            }

            if (formFieldsPresent()) {
                slog('🛩️ الطيّار الآلي: تعبئة النموذج...', 'success');
                sessionStorage.removeItem(SUP_PILOT);
                sessionStorage.setItem(SUP_DONE, '1');
                await supFill();
                return;
            }

            slog('⚠️ لا صفحة قائمة ولا نموذج — اضغط «تشخيص»', 'warn');
            sstat('صفحة غير معروفة — اضغط تشخيص');
        }

        if (sup && !sessionStorage.getItem(SUP_DONE)) {
            const resuming = sessionStorage.getItem(SUP_PILOT) === 'opened';
            slog(resuming ? '🔄 استئناف الطيّار الآلي بعد فتح النموذج...'
                          : '🛩️ إقلاع الطيّار الآلي بعد ٣ ثوانٍ...', 'success');
            setTimeout(supPilot, 3000);
        } else if (sup) {
            slog('ℹ️ اكتملت جولة الطيّار — استخدم الأزرار للتكرار', 'info');
        }

        (function (h) {
            h.addEventListener('mousedown', e => {
                const sx = e.clientX, sy = e.clientY;
                const r = panel.getBoundingClientRect(), il = r.left, it = r.top;
                const mv = ev => {
                    panel.style.left = (il + ev.clientX - sx) + 'px';
                    panel.style.top = (it + ev.clientY - sy) + 'px';
                    panel.style.right = 'auto';
                };
                const up = () => {
                    document.removeEventListener('mousemove', mv);
                    document.removeEventListener('mouseup', up);
                };
                document.addEventListener('mousemove', mv);
                document.addEventListener('mouseup', up);
            });
        })(panel.querySelector('.h'));

        slog('وحدة الزيارات الإشرافية جاهزة', 'success');
        if (!sup) slog('صدّر زيارة إشرافية من الموقع أولاً', 'warn');

        if (formFieldsPresent()) {
            sstat('نموذج الإضافة مفتوح — اضغط «تعبئة»');
            slog('تم التعرّف على نموذج الإضافة', 'success');
        } else if (onListPage()) {
            sstat('أنت على صفحة القائمة — اضغط «فتح نموذج الإضافة»');
            slog('هذه صفحة القائمة، لا نموذج الإضافة', 'warn');
            slog('نموذج الإضافة صفحة مستقلة — اضغط الزر البرتقالي', 'info');
        } else {
            sstat('صفحة غير معروفة — شغّل التشخيص');
        }
    }

})();
