// ==UserScript==
// @name         🏫 أتمتة الزيارات المدرسية — v7.0
// @namespace    supervisor-om
// @version      15.5
// @description  تصدير بيانات الزيارة المدرسية من موقع المشرف وتعبئة استمارة الوزارة تلقائياً — مع نظام تتبع مرئي وتحويل ثنائي اللغة عند الحاجة
// @author       Abu Al-Muather
// @homepageURL  https://supervisor-mct.com/
// @updateURL    https://supervisor-mct.com/tools/daf51553aa5f5d6215/school-visits-automation.user.js
// @downloadURL  https://supervisor-mct.com/tools/daf51553aa5f5d6215/school-visits-automation.user.js
// @match        https://supervisor-om.github.io/supervisory-visit-report/*
// @match        https://supervisor-mct.com/*
// @match        https://www.supervisor-mct.com/*
// @match        https://moe.gov.om/SMS/SupervisionVisits/*
// @match        https://supervisor-mct.com/sim-moe/*
// @match        https://moe.gov.om/SMS/VariousRecords/SchoolVisits/*
// @match        https://moe.gov.om/Portal/Services/UserLoginnew.aspx
// @match        https://moe.gov.om/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_getResourceURL
// @grant        GM_xmlhttpRequest
// @connect      supervisor-mct.com
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

    // رقم النسخة من ترويسة السكربت نفسه — يُعرض في اللوحتين.
    // «التجربة على نسخةٍ قديمة» أضاعت دوراتٍ كاملةً ثلاث مرّات، والسبب أنّ
    // النسخة لم تكن ظاهرةً إلّا في تامبر مانكي.
    const SVF_VER = (() => {
        try { return (GM_info && GM_info.script && GM_info.script.version) || '؟'; }
        catch (e) { return '؟'; }
    })();

    function autoSaveOn() {
        try { return GM_getValue(AUTOSAVE_KEY, true) !== false; } catch (e) { return true; }
    }
    function setAutoSave(v) {
        try { GM_setValue(AUTOSAVE_KEY, !!v); } catch (e) {}
    }

    // ═══ سجلّ ما تأكّد حفظه في البوّابة ═══
    // تأكيد الحفظ يقع في نطاق moe.gov.om، والأرشيف يقرأ في نطاق الموقع،
    // فتخزين تامبر مانكي هو الجسر الوحيد بينهما: يُكتب هنا ويُضخّ هناك.
    const SAVED_KEY = 'svf_saved_visits';     // "المعلّم|التاريخ" بصيغة البوّابة
    const SITE_SENT_KEY = 'svf_sent_visits';  // نظيره في localStorage الموقع

    function svfSavedList() {
        try { const a = JSON.parse(GM_getValue(SAVED_KEY, '[]')); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function svfRecordSaved(v) {
        if (!v || !v.teacher || !v.date) return false;
        const id = v.teacher + '|' + v.date;
        const list = svfSavedList();
        if (list.indexOf(id) !== -1) return false;
        list.push(id);
        // سقفٌ يمنع تضخّم التخزين — الأقدم يسقط
        try { GM_setValue(SAVED_KEY, JSON.stringify(list.slice(-500))); } catch (e) { return false; }
        return true;
    }
    // ونظيرهما للزيارات المدرسيّة: "المدرسة|التاريخ"
    const SAVED_SCHOOL_KEY = 'svf_saved_school_visits';
    const SITE_SENT_SCHOOL_KEY = 'svf_sent_school_visits';

    function svfSavedSchoolList() {
        try { const a = JSON.parse(GM_getValue(SAVED_SCHOOL_KEY, '[]')); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function svfRecordSavedSchool(v) {
        if (!v || !v.school || !v.date) return false;
        const id = v.school + '|' + v.date;
        const list = svfSavedSchoolList();
        if (list.indexOf(id) !== -1) return false;
        list.push(id);
        try { GM_setValue(SAVED_SCHOOL_KEY, JSON.stringify(list.slice(-500))); } catch (e) { return false; }
        return true;
    }

    // يُستدعى في نطاق الموقع: يدمج المحفوظ في سجلّه ويعيد عدد الجديد
    function svfMergeInto(siteKey, list) {
        if (!list.length) return 0;
        let cur = [];
        try { cur = JSON.parse(localStorage.getItem(siteKey) || '[]'); } catch (e) {}
        if (!Array.isArray(cur)) cur = [];
        const merged = [...new Set(cur.concat(list))];
        if (merged.length === cur.length) return 0;
        try { localStorage.setItem(siteKey, JSON.stringify(merged)); }
        catch (e) { return 0; }
        return merged.length - cur.length;
    }
    function svfSyncSaved() {
        return svfMergeInto(SITE_SENT_KEY, svfSavedList())
             + svfMergeInto(SITE_SENT_SCHOOL_KEY, svfSavedSchoolList());
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

    // ═══ سلامة النصّ قبل الكتابة في حقول البوّابة ═══
    // ASP.NET القديم (Framework 4.0) يرفض الحفظ كلّه — بلا تمييز حقلٍ عن آخر —
    // إن وجد في أيّ حقلٍ نصّيّ "&#" أو "<" متبوعةً بحرف/!/؟// (CrossSiteScriptingValidation)،
    // فرأي زائرٍ أو توصيةٌ منسوخةٌ من وورد أو صفحة ويب قد تحمل ترميز HTML حرفيّاً
    // (&#1644; مثلاً) فيسقط حفظ الزيارة كاملةً برسالة خطأٍ من خادم الوزارة لا من هذا
    // السكربت. تُفكّ الترميزات إلى حروفها الحقيقيّة (فلا يضيع المعنى)، وتُحيَّد
    // "<" الخطرة وحدها ببديلٍ آمنٍ بصريّاً — نادرةٌ أصلاً في نصٍّ عربيّ.
    function sanitizeForPortal(value) {
        if (!value) return value;
        let s = String(value);
        s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            try { return String.fromCodePoint(parseInt(hex, 16)); } catch (e) { return ''; }
        });
        s = s.replace(/&#(\d+);/g, (_, dec) => {
            try { return String.fromCodePoint(parseInt(dec, 10)); } catch (e) { return ''; }
        });
        s = s.replace(/<(?=[a-zA-Z!/?])/g, '‹');
        return s;
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

    // خطّ سير اليوم: حين تكون للمشرف أكثر من زيارةٍ في اليوم يُكتب أسفل الأهداف
    // «#قادم من مدرسة …» و«#متجه إلى مدرسة …». هذه نسخةٌ من js/route.js في الموقع —
    // السكربت مستقلٌّ عنه — و tests/route.test.js يقارن النسختين على المدخلات نفسها. عدّلهما معاً.
    function svfRouteName(name) {
        let n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim()
                    .replace(/\s*\(\s*[\d٠-٩]+\s*[-–]\s*[\d٠-٩]+\s*\)\s*$/, '').trim();
        if (!n) return '';
        return /^(مدرسة|مدارس|معهد|مركز|كلية|روضة|إدارة|دائرة|مديرية)(\s|$)/.test(n) ? n : 'مدرسة ' + n;
    }
    function svfRouteLines(cameFrom, goingTo) {
        const a = svfRouteName(cameFrom), b = svfRouteName(goingTo), out = [];
        if (a) out.push('#قادم من ' + a);
        if (b) out.push('#متجه إلى ' + b);
        return out;
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
    if (/supervisor-om\.github\.io|supervisor-mct\.com/.test(location.hostname)
        && !/sim-moe/i.test(location.pathname)) {

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
            // تُرقَّم تسلسليّاً ١، ٢، … كترقيم رأي الزائر — نسخةٌ من الترقيم نفسه في js/export.js
            const realObjectives = $$('#objectivesContainer input[name="objectives"]:checked')
                .map(cb => cb.value.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim())
                .filter(Boolean)
                .map((o, i) => (i + 1) + '- ' + o);
            // خطّ سير اليوم بعد الأهداف: تدمج التعبئةُ المصفوفةَ بسطرٍ لكلّ عنصر
            const routeLines = svfRouteLines($('#schoolCameFrom')?.value, $('#schoolGoingTo')?.value);
            const objectives = realObjectives.concat(routeLines);

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

            const realObjs = data.objectives.filter(s => String(s).charAt(0) !== '#');
            const routeObjs = data.objectives.filter(s => String(s).charAt(0) === '#');
            const objPreview = realObjs.length > 0
                ? realObjs.slice(0, 3).map(s => s.slice(0, 60)).join(' • ')
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
                            '<td style="padding:5px 8px;font-size:11px">' + esc(objPreview.slice(0, 90)) + (realObjs.length > 3 ? '...' : '') + '</td></tr>' +
                        (routeObjs.length > 0
                            ? '<tr><td style="padding:5px 8px;color:#6b7280">خطّ السير</td>' +
                              '<td style="padding:5px 8px;font-size:11px">' + routeObjs.map(esc).join(' • ') + '</td></tr>'
                            : '') +
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

        // ═══ إغلاق الحلقة ═══
        // ما تأكّد حفظه في البوّابة يعود إلى سجلّ الموقع فيضع الأرشيف وسم
        // «حُفظت في البوابة». يُعاد الضخّ عند العودة إلى التبويب لأنّ الحفظ
        // يقع بينما المستخدم في تبويب البوّابة.
        function syncSavedIntoSite() {
            const n = svfSyncSaved();
            if (n > 0) showToastSupervisor('✅ حُدِّث سجلّ المحفوظ: ' + n + ' زيارة', 'success');
            return n;
        }
        window.addEventListener('focus', () => setTimeout(syncSavedIntoSite, 150));

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { syncSavedIntoSite(); initSupervisor(); });
        } else {
            syncSavedIntoSite();
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
        const SQ_KEY = 'svf_school_queue', SQ_I = 'svf_school_queue_i', SQ_HOLD = 'svf_school_hold';

        (function loadData() {
            let fresh = false;   // وصل تصديرٌ جديدٌ في الرابط الآن
            // 1) من URL hash (#svf=BASE64)
            try {
                const m = location.hash.match(/#svf=([A-Za-z0-9+/=]+)/);
                if (m) {
                    const json = b64Decode(m[1]);
                    if (json) {
                        visitData = JSON.parse(json);
                        fresh = true;
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

            // ═══ طابور الزيارات المدرسيّة ═══
            // التصدير قد يحمل زيارةً واحدةً أو قائمةً منها؛ تُعالَج واحدةً في
            // كلّ دورة، والمؤشّر محفوظٌ فيُستأنف بعد كلّ حفظٍ مؤكَّد.
            if (visitData && Array.isArray(visitData.visits) && visitData.visits.length) {
                try {
                    GM_setValue(SQ_KEY, JSON.stringify(visitData.visits));
                    GM_setValue(SQ_I, 0);
                    GM_deleteValue(SQ_HOLD);
                } catch (e) {}
            } else if (fresh) {
                // تصديرٌ مفردٌ جديد يُلغي طابوراً لم يكتمل، وإلّا عُبّئت زيارةٌ قديمةٌ مكانه
                try { GM_deleteValue(SQ_KEY); GM_deleteValue(SQ_I); GM_deleteValue(SQ_HOLD); } catch (e) {}
            }
            try {
                const q = JSON.parse(GM_getValue(SQ_KEY, '[]'));
                const i = Number(GM_getValue(SQ_I, 0) || 0);
                if (q.length && i < q.length) visitData = q[i];
            } catch (e) {}
        })();

        function schoolQueueInfo() {
            try {
                const q = JSON.parse(GM_getValue(SQ_KEY, '[]'));
                const i = Number(GM_getValue(SQ_I, 0) || 0);
                return q.length ? { q: q, i: i, total: q.length } : null;
            } catch (e) { return null; }
        }

        // الطابور لا يتقدّم إلّا بحفظٍ تلقائيٍّ مؤكَّد — الحفظ اليدويّ لا يُعلِم
        // السكربت، فتُعبَّأ الزيارة نفسها مرّةً ثانية ← سجلٌّ رسميٌّ مكرّر.
        function schoolQueueGate() {
            const info = schoolQueueInfo();
            if (!info) return true;
            if (!autoSaveOn()) {
                setStatus('الطابور يتطلّب تشغيل الحفظ التلقائي');
                log('🛑 وضع الطابور يعمل بالحفظ التلقائي فقط — شغّله من زرّ «الحفظ التلقائي»', 'error');
                log('السبب: الحفظ اليدويّ لا يُعلِم السكربت، فتُعبَّأ الزيارة نفسها مرّةً ثانية', 'warn');
                return false;
            }
            const hold = Number(GM_getValue(SQ_HOLD, -1));
            if (hold !== info.i) return true;

            const cur = info.q[info.i] || {};
            const saved = confirm(
                'الزيارة ' + (info.i + 1) + ' من ' + info.total + ': ' + (cur.school || '—') + ' — ' + (cur.date || '—') + '\n' +
                'بلغت نموذج الإضافة ولم يتأكّد حفظها.\n\n' +
                'هل هي محفوظةٌ في البوّابة الآن؟ (تحقّق من السجل)\n\n' +
                'موافق: نعم محفوظة — انتقل إلى التالية\n' +
                'إلغاء: لم تُحفظ — أعد تعبئتها');
            if (!saved) {
                GM_deleteValue(SQ_HOLD);
                log('إعادة تعبئة الزيارة ' + (info.i + 1) + ' — لم تُحفظ بعد', 'info');
                return true;
            }
            log('✔ الزيارة ' + (info.i + 1) + ' محفوظة بتأكيدك — الانتقال للتالية', 'success');
            svfRecordSavedSchool(cur);   // بتأكيد المستخدم: يظهر وسمها «حُفظت» في الموقع
            schoolQueueAdvance();
            return false;
        }

        // بعد حفظٍ مؤكَّد: المؤشّر يتقدّم وتبدأ دورةٌ جديدةٌ من صفحة القائمة
        function schoolQueueAdvance() {
            const info = schoolQueueInfo();
            if (!info) return false;
            GM_deleteValue(SQ_HOLD);
            const next = info.i + 1;
            GM_setValue(SQ_I, next);
            if (next >= info.total) {
                setStatus('اكتمل الطابور: ' + info.total + ' زيارة');
                log('━━━ ✅ اكتمل الطابور: حُفظت ' + info.total + ' زيارة ━━━', 'success');
                GM_deleteValue(SQ_KEY); GM_deleteValue(SQ_I);
                return false;
            }
            visitData = info.q[next];
            // مراحل الطيّار تُصفَّر لتبدأ الزيارة التالية من أوّلها
            sessionStorage.removeItem('svf_pilot_phase');
            sessionStorage.removeItem('svf_pilot_data');
            sessionStorage.removeItem('svf_pilot_done');
            // البيانات الحاليّة تُحفظ أيضاً في مفتاح التصدير، فتبقى إن أُعيد تحميل الصفحة
            try { GM_setValue(DATA_KEY, JSON.stringify(visitData)); } catch (e) {}
            refreshDataBox();
            setStatus('الزيارة ' + (next + 1) + ' من ' + info.total + ': ' + (visitData.school || ''));
            log('▶ الزيارة ' + (next + 1) + ' من ' + info.total + ' — ' + (visitData.school || ''), 'warn');
            setTimeout(() => runAutoFull(visitData), 3000);
            return true;
        }

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
            #${PANEL_ID}.collapsed { width:auto; }
            #svf-header-v7 { cursor:pointer; }
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

        // السجلّ يُحفظ في الجلسة: كلّ postback يُعيد تحميل الصفحة ويمسح اللوحة، فكان
        // ما جرى قبل التوقّف يضيع — وهو بالضبط ما يُحتاج لمعرفة سبب التوقّف
        const LOG_STORE = 'svf_school_log';
        function logLine(text, type) {
            const panel = $('#' + LOG_EL_ID);
            if (!panel) return;
            const line = document.createElement('div');
            line.className = 'svf-log-' + type;
            line.textContent = text;
            panel.appendChild(line);
            panel.scrollTop = panel.scrollHeight;
        }
        function restoreLog() {
            let saved = [];
            try { saved = JSON.parse(sessionStorage.getItem(LOG_STORE) || '[]'); } catch (e) {}
            if (!saved.length) return;
            saved.forEach(l => logLine(l.t, l.k));
            logLine('──────── أُعيد تحميل الصفحة ────────', 'warn');
        }

        function log(msg, type = 'info') {
            const now = new Date();
            const time = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const text = time + ' │ ' + msg;
            logLine(text, type);
            try {
                const saved = JSON.parse(sessionStorage.getItem(LOG_STORE) || '[]');
                saved.push({ t: text, k: type });
                sessionStorage.setItem(LOG_STORE, JSON.stringify(saved.slice(-400)));
            } catch (e) {}
            const method = type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log';
            console[method]('[SVF v7] ' + msg);
            if (type === 'error' && $('#' + PANEL_ID)) setPanelFolded(false);
        }

        // ── الطيّ: تبدأ اللوحة مطويّةً فلا تحجب الاستمارة ──
        // الاختيار يبقى ما دام التبويب مفتوحاً (البوّابة تُعيد تحميل الصفحة
        // مراراً)، وتُبسط وحدها عند خطأٍ أو مهلة حفظ — لأنّها وقتها تهمّ.
        const FOLD_KEY = 'svf_v7_folded';
        function panelFoldedPref() {
            try { return sessionStorage.getItem(FOLD_KEY) !== '0'; } catch (e) { return true; }
        }
        function setPanelFolded(folded) {
            try { sessionStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch (e) {}
            const panel = $('#' + PANEL_ID);
            if (!panel) return;
            panel.classList.toggle('collapsed', folded);
            const t = $('#svf-toggle-v7');
            if (t) t.textContent = folded ? '▲' : '▼';
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
        function dataBoxInner(data) {
            const qi = schoolQueueInfo();
            return `
                    <div style="color:#fbbf24;font-weight:bold;margin-bottom:6px;font-size:11px">📦 ${qi
                        ? 'الطابور: الزيارة ' + Math.min(qi.i + 1, qi.total) + ' من ' + qi.total : 'بيانات جاهزة'}</div>
                    <div class="d-row"><span class="d-lbl">المدرسة</span><span class="d-val">${esc(data.school)}</span></div>
                    <div class="d-row"><span class="d-lbl">التاريخ</span><span class="d-val">${esc(data.date)}</span></div>
                    <div class="d-row"><span class="d-lbl">النوع</span><span class="d-val">${esc(TYPE_LABELS[data.visitType] || data.visitTypeName)}</span></div>
                    <div class="d-row"><span class="d-lbl">الوصول</span><span class="d-val">${esc(data.arrivalTime)}</span></div>
                    <div class="d-row"><span class="d-lbl">الانصراف</span><span class="d-val">${esc(data.departureTime)}</span></div>`;
        }

        // بعد الانتقال في الطابور تُحدَّث البطاقة لتعرض الزيارة الجارية لا الأولى
        function refreshDataBox() {
            const box = $('#svf-data-box-v7');
            if (box && visitData) box.innerHTML = dataBoxInner(visitData);
        }

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
                <div id="svf-data-box-v7">${dataBoxInner(data)}</div>
            ` : `
                <div style="background:#1c1408;border:1px dashed #44403c;border-radius:8px;padding:12px;text-align:center;color:#78716c;font-size:11px;margin-bottom:10px">
                    لا توجد بيانات — عد لموقعك واصغط "تصدير للوزارة"
                </div>
            `;

            panel.innerHTML = `
                <div id="svf-header-v7">
                    <span>🏫</span>
                    <h3>أتمتة الزيارات v${SVF_VER}</h3>
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
                    <button class="svf-btn-v7" id="svf-btn-copy-v7">📋 نسخ السجل</button>
                    <button class="svf-btn-v7" id="svf-btn-diag-v7">🔎 تشخيص الصفحة</button>
                    <button class="svf-btn-v7" id="svf-btn-clear-v7">🗑 مسح السجل</button>
                </div>
            `;

            document.body.appendChild(panel);
            setPanelFolded(panelFoldedPref());
            restoreLog();

            // الأزرار تقرأ visitData لحظة الضغط لا وقت بناء اللوحة: بعد الانتقال في
            // الطابور كانت تحمل الزيارة الأولى، فيُعيد «تشغيل» إدخالها ← سجلٌّ مكرّر
            if (hasData) {
                $('#svf-btn-auto-v7')?.addEventListener('click', () => runAutoFull(visitData));
                $('#svf-btn-fill-v7')?.addEventListener('click', () => runFillOnly(visitData));
            }
            $('#svf-btn-copy-v7')?.addEventListener('click', e => {
                const logEl = $('#' + LOG_EL_ID);
                const text = logEl ? Array.from(logEl.children).map(n => n.textContent).join('\n') : '';
                const done = () => { e.target.textContent = '✅ نُسخ'; setTimeout(() => { e.target.textContent = '📋 نسخ السجل'; }, 2000); };
                const fallback = () => {
                    // الحافظة محجوبةٌ أحياناً في البوّابة — يُعرض النصّ ليُنسخ باليد
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'width:100%;height:160px;margin-top:6px;font-size:10px;direction:rtl';
                    e.target.after(ta);
                    ta.select();
                    e.target.textContent = 'حدّد النصّ وانسخه (Ctrl+C)';
                };
                try { navigator.clipboard.writeText(text).then(done, fallback); } catch (err) { fallback(); }
            });
            $('#svf-btn-clear-v7')?.addEventListener('click', () => {
                const logEl = $('#' + LOG_EL_ID);
                if (logEl) logEl.innerHTML = '';
                try { sessionStorage.removeItem(LOG_STORE); } catch (e) {}
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
            // الشريط كلّه يطوي ويبسط — إلّا إن كانت الضغطة نهايةَ سحب
            $('#svf-header-v7')?.addEventListener('click', () => {
                if (panel.dataset.dragged === '1') { panel.dataset.dragged = ''; return; }
                setPanelFolded(!panel.classList.contains('collapsed'));
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
                panel.dataset.dragged = '';
                const move = ev => {
                    if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) panel.dataset.dragged = '1';
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
        //  التحويل بين أنظمة التعليم
        //  المدارس الخاصّة موزّعةٌ على أنظمةٍ في البوّابة (دولي، ثنائي اللغة
        //  خاص، …) ولا تظهر في قائمة المدارس إلّا تحت نظامها.
        // ═══════════════════════════════════════════════════════════════

        // تسوية الاسم العربيّ قبل المقارنة: الهمزات والتاء المربوطة والتشكيل والرموز
        function normEdu(v) {
            return String(v || '')
                .replace(/[ـً-ْ]/g, '')
                .replace(/[أإآ]/g, 'ا')
                .replace(/ة/g, 'ه')
                .replace(/ى/g, 'ي')
                .replace(/[()\-–_.,،:/\\]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        // أسماء أنظمة التعليم كما تظهر في البوّابة — للتعرّف على القائمة ولترتيب البحث
        const KNOWN_EDU = ['عام', 'أساسي', 'دولي', 'ثنائي اللغة', 'ثنائي اللغة خاص', 'حرس سلطاني خاص',
                           'معاهد إسلامية', 'تعليم مستمر', 'الحرس السلطاني'];

        function looksLikeEduDropdown(s) {
            const texts = Array.from(s.options || []).map(o => normEdu(o.text));
            return KNOWN_EDU.filter(k => texts.indexOf(normEdu(k)) !== -1).length >= 2;
        }

        function findEduSystemDropdown() {
            const school = findSchoolDropdown();
            // بالمعرّف أوّلاً، بشرط أن تحمل خيارات أنظمةٍ فعلاً — أسماء المدارس
            // نفسها فيها «للتعليم الأساسي» فالمطابقة بكلمةٍ واحدةٍ تخلط القائمتين
            const byId = ['select[id*="ddlEdu"]', 'select[id*="Education"]', 'select[id*="StudySystem"]',
                          'select[id*="SchoolSystem"]', 'select[id*="SystemType"]', 'select[id*="ddlSystem"]'];
            for (const q of byId) {
                const el = $(q);
                if (el && el !== school && looksLikeEduDropdown(el)) return el;
            }
            return $$('select').find(s => s !== school && looksLikeEduDropdown(s)) || null;
        }

        function getCurrentEduSystem() {
            const dd = findEduSystemDropdown();
            if (!dd || dd.selectedIndex < 0) return null;
            return { value: dd.value, text: dd.options[dd.selectedIndex]?.text?.trim() || '' };
        }

        // مطابقةٌ تامّةٌ بعد التسوية — «خاص» لا تُطابق «تربية خاصة بصري»
        function switchEduSystem(targetText) {
            const dd = findEduSystemDropdown();
            if (!dd) { log('⚠ لم أجد قائمة نظام التعليم', 'warn'); return false; }

            const want = normEdu(targetText);
            const match = Array.from(dd.options).find(o => normEdu(o.text) === want);
            if (!match) {
                log('⚠ لا يوجد نظام «' + targetText + '» في القائمة', 'warn');
                return false;
            }
            if (dd.value === match.value) return true;

            log('🔄 تحويل نظام التعليم: ' + (dd.options[dd.selectedIndex]?.text || '—') + ' → ' + match.text, 'warn');
            dd.value = match.value;
            dd.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        function switchToBilingual() {
            log('🔄 جاري التحويل إلى وضع ثنائي اللغة...', 'warn');
            return switchEduSystem('ثنائي اللغة');
        }

        // ─── ذاكرة: في أيّ نظامٍ وُجدت كلّ مدرسة ───
        const EDU_MAP_KEY = 'svf_school_edu_map';
        function eduMapGet(school) {
            try { return (JSON.parse(GM_getValue(EDU_MAP_KEY, '{}')) || {})[normEdu(school)] || ''; }
            catch (e) { return ''; }
        }
        function eduMapSet(school, system) {
            if (!school || !system) return;
            try {
                const m = JSON.parse(GM_getValue(EDU_MAP_KEY, '{}')) || {};
                m[normEdu(school)] = system;
                GM_setValue(EDU_MAP_KEY, JSON.stringify(m));
            } catch (e) {}
        }

        // ترتيب الأنظمة المجرَّبة: المحفوظ لهذه المدرسة، ثمّ ما يوحي به اسمها،
        // ثمّ الشائع، ثمّ كلّ ما بقي في القائمة — فلا تُترك مدرسةٌ في نظامٍ لم يُجرَّب
        function eduCandidates(data, dd) {
            const name = normEdu(data.school);
            const list = [];
            if (data.eduSystem) list.push(data.eduSystem);
            const remembered = eduMapGet(data.school);
            if (remembered) list.push(remembered);
            if (name.includes('دولي')) list.push('دولي');
            if (name.includes('ثنائي')) list.push('ثنائي اللغة خاص', 'ثنائي اللغة');
            if (name.includes('خاص')) list.push('دولي', 'ثنائي اللغة خاص', 'حرس سلطاني خاص');
            list.push('عام', 'أساسي', 'ثنائي اللغة', 'دولي', 'ثنائي اللغة خاص');
            Array.from(dd ? dd.options : []).forEach(o => {
                const t = o.text.trim();
                if (t && o.value && !/اختر/.test(t)) list.push(t);
            });
            const seen = new Set(), out = [];
            list.forEach(t => { const k = normEdu(t); if (k && !seen.has(k)) { seen.add(k); out.push(t); } });
            return out;
        }

        // ─── حالة البحث تبقى في الجلسة ───
        // تغيير النظام قد يُعيد تحميل الصفحة كاملةً فيموت السكربت في منتصف الحلقة؛
        // الحالة المحفوظة تُكمل من حيث توقّف ولا تُكرّر نظاماً جُرِّب.
        const EDU_SEARCH_KEY = 'svf_edu_search';
        function eduSearchState(school) {
            try {
                const s = JSON.parse(sessionStorage.getItem(EDU_SEARCH_KEY) || 'null');
                if (s && s.school === normEdu(school) && Array.isArray(s.tried)) return s;
            } catch (e) {}
            return { school: normEdu(school), tried: [] };
        }
        function eduSearchSave(s) { try { sessionStorage.setItem(EDU_SEARCH_KEY, JSON.stringify(s)); } catch (e) {} }
        function eduSearchClear() { try { sessionStorage.removeItem(EDU_SEARCH_KEY); } catch (e) {} }

        function optionsSig(dd) {
            return dd ? Array.from(dd.options).map(o => o.value).join('|') : '';
        }

        // بعد تغيير النظام: ننتظر أن تتبدّل قائمة المدارس فعلاً لا مدّةً ثابتة
        async function waitSchoolListChange(prevSig, ms) {
            const t0 = Date.now();
            while (Date.now() - t0 < ms) {
                await wait(500);
                const dd = findSchoolDropdown();
                if (dd && optionsSig(dd) !== prevSig) { await wait(700); return findSchoolDropdown(); }
            }
            return findSchoolDropdown();
        }

        // ═══════════════════════════════════════════════════════════════
        //  البحث عن المدرسة مع تغيير نظام التعليم تلقائياً
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

            // (١) النظام الحالي
            let r = matchSchool(schoolDD, schoolName);
            if (r.option) return chooseSchool(schoolDD, r.option, data);
            if (r.ambiguous.length) return ambiguousResult(r.ambiguous);

            const eduDD = findEduSystemDropdown();
            if (!eduDD) {
                log('⚠ المدرسة غير موجودة، ولم أجد قائمة نظام التعليم لتغييره', 'error');
                return { found: false, error: 'المدرسة غير موجودة في النظام الحالي' };
            }

            const state = eduSearchState(schoolName);
            const cur = getCurrentEduSystem();
            if (cur && state.tried.indexOf(normEdu(cur.text)) === -1) state.tried.push(normEdu(cur.text));

            log('⚠ «' + schoolName + '» غير موجودة في نظام «' + (cur ? cur.text : '—') + '»', 'warn');
            log('🔄 سأبحث عنها في أنظمة التعليم الأخرى...', 'info');

            // (٢) بقيّة الأنظمة بالترتيب
            for (const sys of eduCandidates(data, eduDD)) {
                if (state.tried.indexOf(normEdu(sys)) !== -1) continue;
                state.tried.push(normEdu(sys));
                eduSearchSave(state);   // قبل التغيير: قد تُعاد الصفحة كاملةً

                const before = optionsSig(findSchoolDropdown());
                updateStep('step1', 'active', 'نظام ' + sys + '...');
                if (!switchEduSystem(sys)) continue;

                const dd = await waitSchoolListChange(before, 12000);
                if (!dd) { log('⚠ اختفت قائمة المدارس بعد تغيير النظام', 'warn'); continue; }

                r = matchSchool(dd, schoolName);
                if (r.option) {
                    eduMapSet(schoolName, sys);
                    log('💡 حُفظ: «' + schoolName + '» في نظام «' + sys + '» — تُفتح فيه مباشرةً في المرّة القادمة', 'info');
                    return chooseSchool(dd, r.option, data, sys);
                }
                if (r.ambiguous.length) return ambiguousResult(r.ambiguous);
                log('   ليست في «' + sys + '»', 'info');
            }

            eduSearchClear();
            log('❌ لم أجد «' + schoolName + '» في أيّ نظام تعليم', 'error');
            log('👉 اختر النظام والمدرسة بنفسك ثمّ اضغط التشغيل — أو صحّح اسم المدرسة في موقعك', 'warn');
            return { found: false, error: 'المدرسة غير موجودة في كل أنظمة التعليم' };
        }

        function chooseSchool(dd, option, data, sys) {
            eduSearchClear();
            const cur = sys || (getCurrentEduSystem() || {}).text;
            if (cur) eduMapSet(data.school, cur);
            selectSchoolOption(dd, option);
            return { found: true, text: option.text, system: cur };
        }

        function ambiguousResult(list) {
            eduSearchClear();
            log('🛑 أكثر من مدرسةٍ تطابق الاسم — لن أختار عنك:', 'error');
            list.slice(0, 6).forEach(t => log('   • ' + t, 'error'));
            log('👉 اكتب اسم المدرسة في موقعك كما يظهر في البوّابة، أو اخترها بنفسك', 'warn');
            return { found: false, error: 'اسم المدرسة يطابق أكثر من مدرسة' };
        }

        // كلماتٌ عامّةٌ لا تميّز مدرسةً عن أخرى
        const SCHOOL_STOP = ['مدرسه', 'المدرسه', 'مدارس', 'المدارس', 'الخاصه', 'خاصه', 'الدوليه', 'دوليه',
                             'للتعليم', 'التعليم', 'الاساسي', 'الاساسيه', 'العام', 'ما', 'بعد',
                             'ثنائيه', 'اللغه', 'ثنائي', 'في', 'من'];

        // لا تخمين: تطابقٌ تامّ، أو احتواءٌ لا يشترك فيه غير مدرسةٍ واحدة، أو كلّ
        // الكلمات المميِّزة في مدرسةٍ واحدة. التعدّد يُعاد للمستخدم ولا يُختار منه.
        // (المطابقة القديمة بأوّل كلمةٍ كانت تختار أيّ «مدرسة …» — سجلٌّ رسميٌّ على مدرسةٍ خاطئة)
        function matchSchool(dd, schoolName) {
            const n = normEdu(schoolName);
            const opts = Array.from(dd.options).filter(o =>
                o.value && o.value !== '0' && o.value !== '-1' && normEdu(o.text).length >= 3 && !/اختر/.test(o.text));
            const nt = o => normEdu(o.text);
            const head = o => normEdu(o.text.split(/\s+-\s+/)[0]);

            const exact = opts.filter(o => nt(o) === n || head(o) === n);
            if (exact.length === 1) return { option: exact[0], ambiguous: [] };
            if (exact.length > 1) return { option: null, ambiguous: exact.map(o => o.text) };
            if (n.length < 4) return { option: null, ambiguous: [] };

            const contains = opts.filter(o => nt(o).includes(n) || (head(o).length >= 6 && n.includes(head(o))));
            if (contains.length === 1) return { option: contains[0], ambiguous: [] };
            if (contains.length > 1) return { option: null, ambiguous: contains.map(o => o.text) };

            // الأرقام تُعامَل وحدها: نطاق الصفوف «(1-12)» يكتبه الموقع وكثيراً ما تُسقطه
            // البوّابة، فكان «12» يُعدّ كلمةً مميِّزةً لا بدّ منها — فلا تُطابَق «الأجيال
            // العصرية الدولية (1-12)» في أيّ نظام. الكلمات تُشترط، والأرقام لا تُشترط
            // لكنّها تُقصي: مدرسةٌ في البوّابة تحمل أرقاماً ليست في اسم الموقع — نطاقاً
            // آخر أو فرعاً آخر — ليست هي.
            const isNum = t => /^\d+$/.test(t);
            const nums = n.split(' ').filter(isNum);
            const tokens = n.split(' ').filter(t => !isNum(t) && t.length >= 2 && SCHOOL_STOP.indexOf(t) === -1);
            if (!tokens.length) return { option: null, ambiguous: [] };
            const all = opts.filter(o => {
                const words = nt(o).split(' ');
                if (!tokens.every(t => words.indexOf(t) !== -1)) return false;
                return !nums.length || words.filter(isNum).every(d => nums.indexOf(d) !== -1);
            });
            if (all.length === 1) return { option: all[0], ambiguous: [] };
            if (all.length > 1) return { option: null, ambiguous: all.map(o => o.text) };
            return { option: null, ambiguous: [] };
        }

        // للتوافق مع ما يستدعيها في مواضع أخرى
        function findSchoolInDropdown(dd, schoolName) {
            return matchSchool(dd, schoolName).option;
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
            if (!schoolQueueGate()) return;
            autoRunning = true;
            let advanceAfter = false;

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

                    // من هنا قد تُحفظ الزيارة، فتُعلَّم حتّى يتأكّد حفظها أو يُسأل عنها
                    const qi = schoolQueueInfo();
                    if (qi) GM_setValue(SQ_HOLD, qi.i);

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
                    if (saved) {
                        clearExportData();
                        // تُسجَّل هنا لا في الموقع: النطاقان لا يتشاركان تخزيناً
                        if (svfRecordSavedSchool(data)) log('سُجِّلت في سجلّ المحفوظ — سيظهر وسمها في السجل', 'info');
                        advanceAfter = true;
                    } else if (schoolQueueInfo()) {
                        const qi = schoolQueueInfo();
                        log('⏸ الطابور متوقّفٌ عند الزيارة ' + (qi.i + 1) + ' من ' + qi.total + ' — لم يتأكّد حفظها', 'error');
                        log('👉 إن كانت محفوظةً في البوّابة اضغط «تشغيل تلقائي كامل» وأجب «موافق» — ينتقل للتالية', 'warn');
                    }

                } else {
                    // مرحلة غير معروفة — تنظيف
                    log('⚠️ مرحلة غير معروفة: ' + phase + ' — جاري التنظيف', 'warn');
                    sessionStorage.removeItem('svf_pilot_phase');
                }

            } catch (err) {
                log('❌ توقف: ' + err.message, 'error');
                setStatus('❌ ' + err.message);
                const qi = schoolQueueInfo();
                if (qi) {
                    log('⏸ الطابور متوقّفٌ عند الزيارة ' + (qi.i + 1) + ' من ' + qi.total + ' — ' + ((qi.q[qi.i] || {}).school || ''), 'error');
                    log('👉 أصلح السبب ثمّ اضغط «تشغيل تلقائي كامل» — يُكمل من هذه الزيارة. للمساعدة: «نسخ السجل»', 'warn');
                }
                // تنظيف عند الخطأ
                sessionStorage.removeItem('svf_pilot_phase');
                sessionStorage.removeItem('svf_pilot_data');
            } finally {
                autoRunning = false;
                if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = '🚀 تشغيل تلقائي كامل'; }
                if (fillBtn) fillBtn.disabled = false;
                if (advanceAfter) schoolQueueAdvance();
            }
        }

        // ═══════════════════════════════════════════════════════════════
        //  تعبئة فقط (للنموذج المفتوح مسبقاً)
        // ═══════════════════════════════════════════════════════════════
        async function runFillOnly(data) {
            if (filling) return;
            if (!schoolQueueGate()) return;
            filling = true;
            let advanceAfter = false;

            const fillBtn = $('#svf-btn-fill-v7');
            const autoBtn = $('#svf-btn-auto-v7');
            if (fillBtn) { fillBtn.disabled = true; fillBtn.textContent = '⏳ جارٍ التعبئة...'; }
            if (autoBtn) autoBtn.disabled = true;

            try {
                const doc = findFormDocument();
                if (doc) {
                    const qi = schoolQueueInfo();
                    if (qi) GM_setValue(SQ_HOLD, qi.i);
                    const res = await fillAddForm(data, doc);
                    if (res && res.ok) {
                        const saveRes = await autoSaveForm(data, doc, res.written);
                        if (saveRes && saveRes.ok) {
                            clearExportData();
                            svfRecordSavedSchool(data);
                            advanceAfter = true;
                        }
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
                if (advanceAfter) schoolQueueAdvance();
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
                // زرّ الإلغاء داخل اللوحة: مطويّةً لا يُرى، فيمضي الحفظ بلا فرصة إلغاء
                setPanelFolded(false);
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
        // رسائل البوّابة تُصنَّف بنصّها: عناصر lblMsg وأمثالها تحمل «تم الحفظ بنجاح»
        // كما تحمل الأخطاء، فكان نجاح الحفظ يُقرأ رفضاً ويتوقّف الطابور بعد أوّل زيارة.
        // النفي يُفحص أوّلاً: «لم يتم الحفظ» تحوي «تم الحفظ».
        const SAVE_FAIL_RE = /لم\s*يتم|لم\s*تتم|تعذر|تعذّر|فشل|خطأ|خطا|يجب|من\s*فضلك|الرجاء|مطلوب|غير\s*صحيح|غير\s*صالح/;
        const SAVE_OK_RE   = /تم\s*(ال)?حفظ|تمت?\s*(ال)?(إضافة|اضافة|تسجيل)|بنجاح|نجاح\s*(ال)?(حفظ|عملية)/;
        function classifyPortalMessages(msgs) {
            const fail = [], ok = [];
            (msgs || []).forEach(m => {
                if (SAVE_FAIL_RE.test(m)) fail.push(m);
                else if (SAVE_OK_RE.test(m)) ok.push(m);
                else fail.push(m);   // نصٌّ مجهول يُعامَل رفضاً — لا يُفترض النجاح
            });
            return { fail, ok };
        }

        // ═══ الحفظ عبر إعادة تحميل الصفحة ═══
        // البوّابة تُعيد تحميل الصفحة بعد ضغط الحفظ بثوانٍ، فيموت السكربت وهو ينتظر
        // النتيجة. العلامة تُكتب قبل الضغط، والتحميل التالي يحكم بها:
        //   • عودةٌ إلى صفحة القائمة نفسها، والنموذج مغلق، خلال دقيقة ← حُفظت
        //   • النموذج ما زال مفتوحاً (رفض تحقّق يُعيد الصفحة) أو صفحةٌ أخرى ← لا حكم
        const SAVE_PENDING_KEY = 'svf_save_pending';
        const SAVE_PENDING_MS  = 60000;

        function markSavePending(data) {
            try {
                sessionStorage.setItem(SAVE_PENDING_KEY, JSON.stringify({
                    ts: Date.now(), path: location.pathname,
                    school: data && data.school, date: data && data.date
                }));
            } catch (e) {}
        }
        function clearSavePending() { try { sessionStorage.removeItem(SAVE_PENDING_KEY); } catch (e) {} }

        // يُستدعى عند كلّ تحميل؛ يُعيد true إن حُسمت زيارةٌ وتولّى ما بعدها
        function resolvePendingSaveAfterReload() {
            let p = null;
            try { p = JSON.parse(sessionStorage.getItem(SAVE_PENDING_KEY) || 'null'); } catch (e) {}
            if (!p) return false;
            clearSavePending();

            const age = Date.now() - Number(p.ts || 0);
            const sameVisit = visitData && p.school === visitData.school && p.date === visitData.date;
            const samePage  = p.path === location.pathname;
            const formOpen  = !!findFormDocument();
            const onList    = !!(findSchoolDropdown() || findAddButton());

            if (!(age >= 0 && age < SAVE_PENDING_MS && sameVisit && samePage && !formOpen && onList)) {
                log('ℹ️ أُعيدت الصفحة بعد ضغط الحفظ، ولا يكفي ذلك للحكم بالحفظ' +
                    (formOpen ? ' (النموذج ما زال مفتوحاً)' : !samePage ? ' (صفحةٌ مختلفة)' : ''), 'warn');
                return false;
            }

            const errs = freshPortalMessages(document, []).filter(m => SAVE_FAIL_RE.test(m));
            if (errs.length) {
                log('⚠️ أُعيدت الصفحة وفيها رسالة رفض:', 'error');
                errs.forEach(e => log('   • ' + e, 'error'));
                return false;
            }

            log('━━━ ✅ حُفظت الزيارة: أُعيدت البوّابة إلى القائمة بعد الحفظ بلا رسالة رفض ━━━', 'success');
            setStatus('✅ حُفظت الزيارة في البوّابة');
            clearExportData();
            if (svfRecordSavedSchool(visitData)) log('سُجِّلت في سجلّ المحفوظ — سيظهر وسمها في السجل', 'info');
            sessionStorage.removeItem('svf_pilot_phase');
            sessionStorage.removeItem('svf_pilot_data');

            if (schoolQueueInfo()) {
                schoolQueueAdvance();
            } else {
                sessionStorage.setItem('svf_pilot_done', '1');
            }
            return true;
        }

        // رسالةٌ تُعدّ بعد الحفظ: جديدةٌ لم تكن قبل الضغط، وفيها كلمات. في التجربة
        // الحقيقيّة ظهر «123» فعُدّ رفضاً وتوقّف الطابور، والبوّابة كانت قد حفظت.
        function freshPortalMessages(doc, baseline) {
            return portalErrors(doc).filter(m =>
                (baseline || []).indexOf(m) === -1 && /[؀-ۿA-Za-z]{2,}/.test(m));
        }

        async function waitForSaveOutcome(timeoutMs, baseline) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                await wait(1000);

                const formDoc = findFormDocument();
                const c = classifyPortalMessages(freshPortalMessages(formDoc || document, baseline));
                if (c.ok.length && !c.fail.length) {
                    log('📨 البوّابة: ' + c.ok.join(' | '), 'success');
                    return { ok: true, errors: [] };
                }
                if (c.fail.length) return { ok: false, why: 'رفضت البوّابة الحفظ', errors: c.fail };

                const formGone   = !formDoc;
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

            // ما في الصفحة من رسائل قبل الضغط لا يُحسب نتيجةً للحفظ
            const baseline = portalErrors(doc);
            // الحفظ يُعيد تحميل الصفحة فيموت السكربت قبل أن يرى النتيجة؛
            // العلامة تُخبر التحميل التالي أنّ الحفظ ضُغط ومتى
            markSavePending(data);
            log('💾 ضغط زر الحفظ...', 'info');
            saveBtn.click();

            const res = await waitForSaveOutcome(25000, baseline);
            clearSavePending();
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
            el.value = sanitizeForPortal(value);
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

                    // تحميلٌ ناتجٌ عن ضغط الحفظ: يُحسم أوّلاً، وهو يتولّى الانتقال للتالية
                    if (resolvePendingSaveAfterReload()) return;

                    // الطيار الآلي: يشتغل تلقائياً ويكمل عبر postbacks
                    const phase = sessionStorage.getItem('svf_pilot_phase');

                    if (phase === 'after_show') {
                        // الصفحة حملت بعد postback "عرض" — أكمل تلقائياً
                        log('🔄 تم الكشف عن جلسة طيار آلي معلقة — جاري الاستكمال...', 'success');
                        setTimeout(() => {
                            log('🛩️ استكمال الطيار الآلي...', 'success');
                            runAutoFull(visitData);
                        }, 3000);
                    } else if (!phase && sessionStorage.getItem('svf_edu_search')) {
                        // أُعيدت الصفحة كاملةً بعد تغيير نظام التعليم — يُستأنف البحث عن المدرسة
                        log('🔄 استئناف البحث عن المدرسة في أنظمة التعليم...', 'success');
                        setTimeout(() => runAutoFull(visitData), 2500);
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
    // المحاكاة (/sim-moe/) تُعامَل معاملة البوّابة لاختبار المسار كاملاً بلا سجلٍّ رسميّ
    if ((location.hostname.includes('moe.gov.om') || /sim-moe/i.test(location.pathname))
        && /supervisionvisits/i.test(location.pathname)) {
        if (window.top !== window.self) return;

        const SUP_KEY = 'svf_supervision_visit_data';
        const P = 'svfs-panel', L = 'svfs-log', S = 'svfs-status';
        let svfsUnfold = null;

        // ─── خريطة حقول البوابة ───
        // مبدئية: البوابة لم تُفحص بعد وهي مفتوحة على نموذج الإضافة.
        // البحث المرن يجرّب كل مرشّح، وزر «تشخيص» يكشف المعرّفات الحقيقية.
        // ─── المرحلة ١: رأس الزيارة ───
        // معرّفات مثبَّتة من تشخيص البوّابة، ومعها مرادفات احتياطية
        // ═══ خريطة المعرّفات الخارجيّة ═══
        // البوّابة تتغيّر، وإصدار نسخةٍ جديدةٍ من السكربت لكلّ تغييرٍ مكلف.
        // فتُقرأ المعرّفات من ملفٍ على خادمك، وتُخزَّن نسخةٌ محلّيّةٌ للطوارئ،
        // والقيم المدمجة أدناه هي شبكة الأمان الأخيرة.
        const CFG_URL = 'https://supervisor-mct.com/selectors.json';
        const CFG_TTL = 6 * 60 * 60 * 1000;   // إعادة الجلب كلّ ٦ ساعات

        function applyConfig(j) {
            if (!j || typeof j !== 'object') return false;
            const put = (target, src) => {
                if (!src) return;
                if (Array.isArray(target) && Array.isArray(src)) { target.length = 0; src.forEach(x => target.push(x)); }
                else if (target && typeof target === 'object') Object.assign(target, src);
            };
            put(STAGE1_FIELDS, j.stage1);
            put(EMP_SEARCH,    j.empSearch);
            put(EMP_SEARCH_BTN, j.empSearchBtn);
            put(FORMS_DDL,     j.formsDdl);
            put(STAGE1_NEXT,   j.stage1Next);
            put(SCORE_TEXT,    j.scoreText);
            if (j.emptyText) SVF_EMPTY = j.emptyText;
            slog('خريطة المعرّفات ' + (j.version ? 'v' + j.version : '') + ' مطبَّقة', 'success');
            return true;
        }

        function loadConfig() {
            try {
                const raw = GM_getValue('svf_cfg', '');
                if (raw) applyConfig(JSON.parse(raw));
            } catch (e) {}

            const age = Date.now() - Number(GM_getValue('svf_cfg_ts', 0) || 0);
            if (age < CFG_TTL) return;
            if (typeof GM_xmlhttpRequest !== 'function') return;

            GM_xmlhttpRequest({
                method: 'GET', url: CFG_URL + '?t=' + Date.now(), timeout: 8000,
                onload: function (r) {
                    try {
                        const j = JSON.parse(r.responseText);
                        if (applyConfig(j)) {
                            GM_setValue('svf_cfg', r.responseText);
                            GM_setValue('svf_cfg_ts', Date.now());
                        }
                    } catch (e) { slog('ملف الخريطة غير صالح — أُبقيت الخريطة المدمجة', 'warn'); }
                },
                onerror:   function () { slog('تعذّر جلب الخريطة — أُبقيت المدمجة', 'warn'); },
                ontimeout: function () { slog('انتهت مهلة جلب الخريطة — أُبقيت المدمجة', 'warn'); }
            });
        }

        let SVF_EMPTY = 'لا يوجد';

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
        // مُعلَنٌ هنا لا قرب مستخدمه: loadConfig() يُستدعى عند بناء اللوحة
        // ويكتب فيه من الخريطة المخزّنة، وإعلانه بعد ذلك يُسقط الكتابة بصمت.
        const SCORE_TEXT = { '1': 'متميز', '2': 'جيد', '3': 'ملائم', '4': 'غير ملائم', '5': 'يحتاج' };

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

        // \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u0648\u062D\u062F\u0647\u0627: \u0642\u0627\u0639\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646 \u062A\u064F\u062F\u0631\u062C \u00AB\u0628\u0646\u00BB \u0628\u064A\u0646 \u0627\u0644\u0623\u0633\u0645\u0627\u0621
        // \u0644\u0644\u0639\u0645\u0627\u0646\u064A\u0651\u064A\u0646 (\u0663\u0660\u0666 \u0633\u062C\u0644\u0651\u0627\u064B \u0645\u0646 \u0665\u0660\u0662) \u0648\u0628\u0648\u0651\u0627\u0628\u0629 \u0627\u0644\u0648\u0632\u0627\u0631\u0629 \u0642\u062F \u0644\u0627 \u062A\u062D\u0645\u0644\u0647\u0627 \u2014 \u0648\u0627\u0644\u0639\u0643\u0633.
        // \u0625\u0633\u0642\u0627\u0637\u0647\u0627 \u0645\u0646 \u0627\u0644\u0637\u0631\u0641\u064A\u0646 \u064A\u064F\u0637\u0627\u0628\u0642 \u0627\u0644\u0627\u0633\u0645 \u0646\u0641\u0633\u0647 \u0645\u0643\u062A\u0648\u0628\u0627\u064B \u0628\u0627\u0644\u0635\u064A\u063A\u062A\u064A\u0646.
        function normName(v) {
            return normAr(v).split(' ').filter(w => w !== '\u0628\u0646' && w !== '\u0628\u0646\u062A').join(' ');
        }

        // \u0635\u064A\u063A \u0627\u0644\u0628\u062D\u062B \u0628\u0627\u0644\u062A\u062A\u0627\u0628\u0639: \u0628\u0644\u0627 \u00AB\u0628\u0646\u00BB \u062B\u0645\u0651 \u0643\u0645\u0627 \u0643\u064F\u062A\u0628 \u062B\u0645\u0651 \u0627\u0644\u0623\u0648\u0651\u0644 \u0648\u0627\u0644\u0623\u062E\u064A\u0631 \u062B\u0645\u0651 \u0627\u0644\u0623\u0648\u0651\u0644.
        // \u0627\u0644\u0628\u0648\u0651\u0627\u0628\u0629 \u062A\u0628\u062D\u062B \u0628\u0627\u0644\u0646\u0635\u0651 \u0643\u0645\u0627 \u0647\u0648\u060C \u0641\u0635\u064A\u063A\u0629\u064C \u0648\u0627\u062D\u062F\u0629\u064C \u0642\u062F \u0644\u0627 \u062A\u064F\u0631\u062C\u0639 \u0634\u064A\u0626\u0627\u064B \u0623\u0635\u0644\u0627\u064B.
        // \u0627\u0644\u062A\u0648\u0633\u064A\u0639 \u0644\u0627 \u064A\u064F\u0648\u0633\u0651\u0639 \u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631: \u0627\u0644\u0635\u0641\u0651 \u0644\u0627 \u064A\u064F\u062E\u062A\u0627\u0631 \u0625\u0644\u0651\u0627 \u0628\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u0627\u0633\u0645 \u0643\u0627\u0645\u0644\u0627\u064B.
        function searchTerms(name) {
            const plain = normName(name);
            const raw = normAr(name);
            const words = plain.split(' ').filter(Boolean);
            const terms = [plain, raw];
            if (words.length > 2) terms.push(words[0] + ' ' + words[words.length - 1]);
            if (words.length > 1) terms.push(words[0]);
            return terms.filter((t, i) => t && terms.indexOf(t) === i);
        }

        let sup = null;
        (function () {
            let fresh = false;   // وصل تصديرٌ جديدٌ في الرابط الآن
            try {
                const m = location.hash.match(/#svfs=([A-Za-z0-9+/=]+)/);
                if (m) {
                    const json = b64Decode(m[1]);
                    if (json) {
                        sup = JSON.parse(json);
                        fresh = true;
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

            // ═══ طابور الزيارات ═══
            // التصدير قد يحمل زيارةً واحدةً أو قائمةً منها. في حالة القائمة
            // نعالج واحدةً في كلّ دورة، والمؤشّر محفوظٌ فيُستأنف بعد كلّ حفظ.
            if (sup && Array.isArray(sup.visits) && sup.visits.length) {
                try {
                    GM_setValue('svf_queue', JSON.stringify(sup.visits));
                    GM_setValue('svf_queue_i', 0);
                    GM_deleteValue('svf_queue_hold');
                } catch (e) {}
            } else if (fresh) {
                // تصديرٌ مفردٌ جديد يُلغي أيّ طابورٍ لم يكتمل، وإلّا حُمِّلت
                // زيارةٌ قديمةٌ من الطابور مكان التي صدّرها المستخدم للتوّ.
                try {
                    GM_deleteValue('svf_queue'); GM_deleteValue('svf_queue_i'); GM_deleteValue('svf_queue_hold');
                } catch (e) {}
            }
            try {
                const q = JSON.parse(GM_getValue('svf_queue', '[]'));
                const i = Number(GM_getValue('svf_queue_i', 0) || 0);
                if (q.length && i < q.length) sup = q[i];
            } catch (e) {}
        })();

        function queueInfo() {
            try {
                const q = JSON.parse(GM_getValue('svf_queue', '[]'));
                const i = Number(GM_getValue('svf_queue_i', 0) || 0);
                return q.length ? { q: q, i: i, total: q.length } : null;
            } catch (e) { return null; }
        }

        // الانتقال للزيارة التالية بعد حفظٍ ناجح
        async function queueAdvance() {
            const info = queueInfo();
            if (!info) return false;
            GM_deleteValue('svf_queue_hold');
            const next = info.i + 1;
            GM_setValue('svf_queue_i', next);
            if (next >= info.total) {
                sstat('اكتمل الطابور: ' + info.total + ' زيارة');
                slog('━━━ ✅ اكتمل الطابور: حُفظت ' + info.total + ' زيارة ━━━', 'success');
                GM_deleteValue('svf_queue'); GM_deleteValue('svf_queue_i');
                return false;
            }
            sup = info.q[next];
            sstat('الزيارة ' + (next + 1) + ' من ' + info.total + ': ' + (sup.teacher || ''));
            slog('▶ الزيارة ' + (next + 1) + ' من ' + info.total + ' — ' + (sup.teacher || ''), 'warn');
            await wait(2500);

            const btn = supAddBtn();
            if (!btn) { slog('لم أجد زر «إضافة» للزيارة التالية', 'error'); return false; }
            btn.click();
            if (!await waitForSupForm(25000)) { slog('تأخّر تحميل النموذج', 'error'); return false; }
            await wait(1200);
            await supStage1();
            return true;
        }

        // ═══ بوّابة الطابور: تُستدعى قبل كلّ تعبئة ═══
        // الطابور لا يتقدّم إلّا بحفظٍ تلقائيٍّ مؤكَّد؛ الحفظ اليدويّ لا يُعلِم السكربت
        // فيبقى المؤشّر على زيارةٍ حُفظت ويعيد تعبئتها ← سجلٌّ رسميٌّ مكرّر. لذا:
        //  • لا تعبئة في وضع الطابور والحفظ التلقائيّ مُطفأ.
        //  • زيارةٌ بلغت صفحة التقييم ولم يتأكّد حفظها (svf_queue_hold) يُسأل
        //    المستخدم عنها قبل إعادة تعبئتها: فشلٌ أو إلغاءٌ أو مهلةٌ قد يعقبها حفظٌ يدويّ.
        async function queueGate() {
            const info = queueInfo();
            if (!info) return true;
            if (!autoSaveOn()) {
                sstat('الطابور يتطلّب تشغيل الحفظ التلقائي');
                slog('🛑 وضع الطابور يعمل بالحفظ التلقائي فقط — شغّله من زرّ «الحفظ التلقائي» ثمّ اضغط «تعبئة النموذج»', 'error');
                slog('السبب: الحفظ اليدويّ لا يُعلِم السكربت، فتُعبَّأ الزيارة نفسها مرّةً ثانية', 'warn');
                return false;
            }
            const hold = Number(GM_getValue('svf_queue_hold', -1));
            if (hold !== info.i) return true;

            const cur = info.q[info.i] || {};
            const saved = confirm(
                'الزيارة ' + (info.i + 1) + ' من ' + info.total + ': ' + (cur.teacher || '—') + ' — ' + (cur.date || '—') + '\n' +
                'بلغت صفحة التقييم ولم يتأكّد حفظها.\n\n' +
                'هل هي محفوظةٌ في البوّابة الآن؟ (تحقّق من القائمة)\n\n' +
                'موافق: نعم محفوظة — انتقل إلى التالية\n' +
                'إلغاء: لم تُحفظ — أعد تعبئتها');
            if (!saved) {
                GM_deleteValue('svf_queue_hold');
                slog('إعادة تعبئة الزيارة ' + (info.i + 1) + ' — لم تُحفظ بعد', 'info');
                return true;
            }
            slog('✔ الزيارة ' + (info.i + 1) + ' محفوظة بتأكيدك — الانتقال للتالية', 'success');
            svfRecordSaved(cur);   // بتأكيد المستخدم: يظهر وسمها «حُفظت» في الموقع
            await queueAdvance();
            return false;
        }

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
            if (type === 'error' && typeof svfsUnfold === 'function') svfsUnfold();
            const line = document.createElement('div');
            line.className = 'svfs-l-' + (type || 'info');
            line.textContent = new Date().toLocaleTimeString('ar-OM') + ' | ' + msg;
            box.appendChild(line);
            box.scrollTop = box.scrollHeight;
        }
        function sstat(t) { const e = document.getElementById(S); if (e) e.textContent = t; }
        function setVal(el, v) {
            el.value = sanitizeForPortal(v);
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
            if (findAnywhere(['rptrFormItems_ctl01_ddlItemEvals'])) return 2;
            if (findAnywhere(STAGE1_FIELDS['التاريخ']) || findAnywhere(FORMS_DDL)) return 1;
            for (const names of Object.values(STAGE2_FIELDS)) if (findAnywhere(names)) return 2;
            if (findAnywhere(ratingCandidates(1))) return 2;
            return 0;
        }

        async function supFill() {
            if (!await queueGate()) return;
            const stage = supStage();
            if (stage === 0) {
                sstat('لا نموذج في هذه الصفحة');
                slog('لم أتعرّف على مرحلةٍ من مراحل النموذج هنا', 'error');
                supDiag();
                slog('اضغط «نسخ السجل» وأرسله للمطوّر', 'warn');
                return;
            }

            if (stage === 1) return await supStage1();
            if (stage === 2) return await supStage2();

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
                    // تُسجَّل هنا لا في الموقع: النطاقان لا يتشاركان تخزيناً
                    if (svfRecordSaved(sup)) slog('سُجِّلت في سجلّ المحفوظ — سيظهر وسمها في الأرشيف', 'info');
                    await queueAdvance();
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
                // زرّ الإلغاء داخل اللوحة: مطويّةً لا يُرى، فيمضي الحفظ بلا فرصة إلغاء
                svfsUnfold && svfsUnfold();
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
            supDeepDiag();
            slog('انسخ السجل كاملاً وأرسله للمطوّر', 'success');
        }

        GM_addStyle(
            '#svfs-panel{position:fixed;top:70px;right:12px;z-index:99999;width:340px;' +
            'background:#0b0f14;color:#dbeafe;border:1px solid #1e3a5f;border-radius:12px;' +
            'font-family:Tahoma,sans-serif;font-size:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);direction:rtl}' +
            '#svfs-panel .h{padding:10px 12px;background:linear-gradient(135deg,#1d4ed8,#1e3a8a);' +
            'display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;' +
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
            '<div class="h"><span>أتمتة الزيارات الإشرافية v' + SVF_VER + '</span>' +
              '<span id="svfs-toggle" title="طيّ / بسط">▾</span></div>' +
            '<div class="b">' +
              (sup
                ? '<div id="svfs-data">المعلم: ' + esc(sup.teacher || '—') +
                  '<br>المدرسة: ' + esc(sup.school || '—') +
                  '<br>التاريخ: ' + esc(sup.date || '—') +
                  ' | تقييمات: ' + (sup.ratings || []).length +
                  (queueInfo() ? '<br>الطابور: ' + (queueInfo().i + 1) + ' من ' + queueInfo().total : '') + '</div>'
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
        loadConfig();

        // ── الطيّ: تبدأ اللوحة مطويّةً فلا تحجب الاستمارة ──
        const body = panel.querySelector('.b');
        const tgl  = document.getElementById('svfs-toggle');
        function setFolded(folded) {
            body.style.display = folded ? 'none' : '';
            tgl.textContent = folded ? '▸' : '▾';
            panel.style.width = folded ? 'auto' : '340px';
            try { sessionStorage.setItem('svfs_folded', folded ? '1' : '0'); } catch (e) {}
        }
        let folded = true;
        try { folded = sessionStorage.getItem('svfs_folded') !== '0'; } catch (e) {}
        setFolded(folded);
        panel.querySelector('.h').addEventListener('click', () => {
            // نهايةُ سحبٍ ليست ضغطة: كانت تبسط اللوحة المطويّة كلّما نُقلت
            if (panel.dataset.dragged === '1') { panel.dataset.dragged = ''; return; }
            setFolded(body.style.display !== 'none');
        });

        // تُبسط تلقائيّاً عند خطأٍ أو انتهاء العمل، لأنّ الرسالة وقتها تهمّ
        svfsUnfold = () => setFolded(false);

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
            if (!next && queueInfo()) slog('⏸ الطابور موقوف حتّى تُعيد تشغيل الحفظ التلقائي', 'error');
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

        // انتظار ظهور حقول النموذج (النموذج يُحمّل داخل iframe فيتأخّر)
        async function waitForSupForm(ms) {
            const t0 = Date.now();
            while (Date.now() - t0 < (ms || 25000)) {
                if (formFieldsPresent()) return true;
                await wait(600);
            }
            return false;
        }

        // ═══ مرحلة التقييم: مطابقةٌ بالنصّ لا بالمعرّفات ═══
        // معرّفات صفحة التقييم غير معلومة، لكنّ نصوص البنود ثابتة في
        // الاستمارة. فنجد صفَّ كلِّ بندٍ بكلمةٍ مميّزةٍ منه ثمّ نأخذ
        // قائمته المنسدلة وحقل وصفه من الصفِّ نفسه.
        const ITEM_KEYS = [
            'تحصيل الطلبة', 'التقدم الدراسي', 'مهارات التعلم', 'الهوية العمانية',
            'الامن والسلامه', 'تخطيط المنهاج', 'الاداره الصفيه', 'استراتيجيات التدريس',
            'المصادر والموارد', 'اساليب تقويم', 'التقويم الذاتي', 'السياسات والانظمه',
            'مبادرات وانشطه'
        ];

        function supFindItemRow(n) {
            const key = normAr(ITEM_KEYS[n - 1] || '');
            if (!key) return null;
            for (const d of docs()) {
                let rows = [];
                try { rows = Array.from(d.querySelectorAll('tr')); } catch (e) { continue; }
                for (const tr of rows) {
                    const t = normAr(tr.textContent || '');
                    if (!t.includes(key)) continue;
                    if (!tr.querySelector('select, textarea, input[type="text"]')) continue;
                    return tr;
                }
            }
            return null;
        }

        function supClickTab(label) {
            const want = normAr(label);
            for (const d of docs()) {
                let els = [];
                try { els = Array.from(d.querySelectorAll('a, span, td, div, li')); } catch (e) { continue; }
                for (const el of els) {
                    const t = normAr(el.textContent || '');
                    if (t && t.length < 40 && t.includes(want)) {
                        try { el.click(); slog('فُتح تبويب: ' + label, 'info'); return true; } catch (e) {}
                    }
                }
            }
            return false;
        }

        // جمع كلّ العناصر المطابقة عبر المستند وإطاراته، بترتيب ظهورها
        function findAllAnywhere(selector) {
            const out = [];
            for (const d of docs()) {
                try { Array.prototype.push.apply(out, Array.from(d.querySelectorAll(selector))); }
                catch (e) {}
            }
            return out;
        }

        async function supStage2() {
            slog('المرحلة ٢: التقييم', 'warn');
            const written = [];

            // زيارةٌ من الطابور بلغت التقييم: من هنا قد تُحفظ، فتُعلَّم حتّى يتأكّد
            // حفظها (queueAdvance يمسح العلامة) أو يُسأل عنها قبل إعادة تعبئتها.
            const qi = queueInfo();
            if (qi) GM_setValue('svf_queue_hold', qi.i);

            // ── بنود التقييم: rptrFormItems_ctl01..ctl13_ddlItemEvals ──
            supClickTab('بنود الاستمارة');
            await wait(1500);

            let ok = 0; const miss = [];
            const notes = sup.notes || {};

            // ترقيم المكرّر قد يزيح (ctl01 أو ctl02 بحسب وجود صفّ رأس)،
            // فنأخذ القوائم بترتيب ظهورها لا بأرقامها.
            let evals = [];
            for (let a = 0; a < 10 && !evals.length; a++) {
                evals = findAllAnywhere('select[id*="ddlItemEvals"]');
                if (!evals.length) evals = findAllAnywhere('#ItemsTable select');
                // توقيعٌ لا يعتمد على المعرّفات: قائمةٌ فيها خيار «غير مقيم»
                if (!evals.length) evals = findAllAnywhere('select').filter(x =>
                    Array.from(x.options).some(o => normAr(o.text).includes(normAr('غير مقيم'))));
                if (!evals.length) await wait(800);
            }
            slog('قوائم البنود الموجودة: ' + evals.length, evals.length === 13 ? 'info' : 'warn');
            // استمارةٌ قيد التحديث: القوائم موجودةٌ لكن بلا خياراتٍ سوى «غير مقيم»
            const usable = evals.filter(sel =>
                Array.from(sel.options).filter(o => o.value && !normAr(o.text).includes(normAr('غير مقيم'))).length > 0);
            if (evals.length && !usable.length) {
                sstat('الاستمارة في البوّابة بلا خيارات تقييم');
                slog('قوائم البنود لا تحتوي إلا «غير مقيم» — الاستمارة محدَّثةٌ أو غير مكتملةٍ في البوّابة.', 'error');
                slog('هذا عطلٌ في البوّابة لا في السكربت. انتظر اكتمال التحديث أو راجع القسم المختصّ.', 'error');
                slog('لن أحفظ شيئاً — الحفظ الآن يسجّل زيارةً بلا تقييم.', 'warn');
                return;
            }

            if (evals[0]) {
                slog('خيارات السلّم: ' + Array.from(evals[0].options)
                        .map(o => '[' + o.value + '] ' + o.text.trim()).join('  |  '), 'info');
            }
            if (!evals.length) {
                sstat('لم تظهر بنود التقييم');
                slog('لا توجد قوائم ddlItemEvals — افتح تبويب «بنود الاستمارة» يدوياً ثمّ أعد التعبئة', 'error');
                supDiag();
                return;
            }

            (sup.ratings || []).forEach((score, i) => {
                const n   = i + 1;
                const sel = evals[i];
                if (!sel) { miss.push(n); return; }

                const v = String(score);
                const opts = Array.from(sel.options);
                const o = opts.find(x => String(x.value) === v)                       // القيمة
                       || opts.find(x => x.text.trim().startsWith(v))                 // «2 - جيد»
                       || opts.find(x => /\d/.test(x.text) && x.text.replace(/\D/g, '') === v)
                       || opts.find(x => SCORE_TEXT[v] && normAr(x.text).includes(normAr(SCORE_TEXT[v])))
                       || opts[Number(v)];                                            // بالترتيب
                if (!o || !o.value) {
                    if (n === 1) slog('تعذّرت مطابقة الدرجة ' + v + ' — راجع «خيارات السلّم» أعلاه', 'error');
                    miss.push(n); return;
                }

                sel.value = o.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                written.push({ label: 'بند ' + n, el: sel, expected: sel.value });
                ok++;

                // وصف البند إن وُجد حقلٌ له في صفّ البند نفسه
                const note = notes[n] || notes[String(n)];
                const tr = sel.closest && sel.closest('tr');
                const box = tr && (tr.querySelector('textarea') || tr.querySelector('input[type="text"]'));
                if (note && box) {
                    setVal(box, note);
                    written.push({ label: 'وصف ' + n, el: box, expected: box.value });
                }
            });
            slog('البنود: ' + ok + ' من 13' + (miss.length ? ' | تعذّر: ' + miss.join('،') : ''),
                 miss.length ? 'warn' : 'success');

            // ── الحقول النصّيّة: rptrFormFields_ctl01..ctl04_txtFieldValue ──
            supClickTab('حقول الاستمارة');
            await wait(1500);

            // أسماء الحقول كما هي في البوّابة (جدول FieldsTable)
            // «التوصيات» في الموقع هي «الدعم المقدم» في البوّابة — حقلٌ واحدٌ باسمين
            const TEXTS = [
                { name: 'جوانب الإجادة',   keys: ['اجاده', 'اجاد', 'تميز'],           val: sup.excellence },
                { name: 'تحتاج إلى تطوير', keys: ['تحتاج', 'تطوير'],                  val: sup.development },
                { name: 'الدعم المقدم',    keys: ['دعم', 'مساند', 'توصي', 'مقترح'],   val: sup.recommendations || sup.support },
                { name: 'الملاحظات',       keys: ['ملاحظات'],                          val: sup.notesGeneral }
            ];
            const EMPTY_TEXT = SVF_EMPTY;   // البوّابة لا تقبل خانةً بيضاء
            const boxes = findAllAnywhere('textarea[id*="txtFieldValue"], input[id*="txtFieldValue"]');
            slog('حقول نصّيّة موجودة: ' + boxes.length, 'info');

            const used = new Set();
            const unplaced = [];
            TEXTS.forEach(t => {
                if (!t.val) return;
                // نطابق باسم الحقل الظاهر في صفّه، فترتيب الحقول قد يتغيّر
                let target = boxes.find(b => {
                    if (used.has(b)) return false;
                    const tr = b.closest && b.closest('tr');
                    const lbl = normAr((tr && tr.textContent) || '');
                    return t.keys.some(k => lbl.includes(normAr(k)));
                });
                if (!target) { unplaced.push(t.name); return; }
                used.add(target);
                setVal(target, t.val);
                written.push({ label: t.name, el: target, expected: target.value });
                slog('عُبّئ حقل «' + t.name + '»', 'success');
            });
            if (unplaced.length)
                slog('لم أجد حقلاً مطابقاً لـ: ' + unplaced.join('، ') + ' — اكتبها بيدك', 'warn');

            // كلّ خانةٍ بقيت فارغةً تُكتب «لا يوجد» بدل تركها بيضاء
            let blanks = 0;
            boxes.forEach(b => {
                if (used.has(b) || (b.value || '').trim()) return;
                setVal(b, EMPTY_TEXT);
                written.push({ label: 'خانة فارغة', el: b, expected: b.value });
                blanks++;
            });
            if (blanks) slog('كُتب «' + EMPTY_TEXT + '» في ' + blanks + ' خانةٍ فارغة', 'info');

            if (miss.length > 6) {
                sstat('تعذّر التعرّف على أغلب البنود — لم أحفظ');
                slog('شغّل التشخيص وأرسل السجل', 'error');
                supDiag();
                return;
            }
            if (miss.length) {
                sstat('عُبّئ ' + ok + ' بنداً — أكمل الباقي يدوياً ثمّ احفظ');
                slog('بنود لم تُعبَّأ: ' + miss.join('، '), 'warn');
                return;
            }
            await supSave(written);
        }

        // اختيار صفٍّ في شبكة نتائج ASP.NET
        // الصفوف تُختار عادةً عبر __doPostBack في onclick لا عبر رابطٍ عادي،
        // فالنقر المجرّد لا يفعل شيئاً. نجرّب الاستدعاء المباشر ثمّ النقر.
        // ═══ المسجّل: يلتقط الآليّة الحقيقيّة بدل افتراضها ═══
        // يعترض __doPostBack داخل الإطار ويطبع وسائطه لحظة إطلاقها،
        // ويسجّل كلّ نقرةٍ ووجهتها. فحين تختار المعلّم بيدك مرّةً واحدةً
        // يظهر في السجلّ النداء الذي تحتاجه البوّابة بالحرف.
        function supInstallRecorder() {
            for (const d of docs()) {
                let w = null;
                try { w = d.defaultView; } catch (e) { continue; }
                if (!w || w.__svfHooked) continue;
                try {
                    if (typeof w.__doPostBack === 'function') {
                        const orig = w.__doPostBack;
                        w.__doPostBack = function (t, a) {
                            slog('📼 __doPostBack("' + t + '", "' + a + '")', 'warn');
                            return orig.apply(this, arguments);
                        };
                    }
                    d.addEventListener('click', function (e) {
                        const el = e.target;
                        if (!el || !el.tagName) return;
                        const tr = el.closest ? el.closest('tr') : null;
                        const row = tr ? (tr.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45) : '—';
                        const oc = (el.getAttribute && el.getAttribute('onclick')) || '';
                        slog('📼 نقر <' + el.tagName + '> id=' + (el.id || '—')
                             + (oc ? ' onclick=' + oc.slice(0, 120) : '') + ' | صفّ: ' + row, 'info');
                    }, true);
                    w.__svfHooked = true;
                    slog('📼 المسجّل مفعَّل — اختر المعلّم بيدك الآن', 'success');
                } catch (e) {}
            }
        }
        setInterval(supInstallRecorder, 2000);   // الإطار يُعاد تحميله بعد كلّ postback

        // ═══ تشخيصٌ عميقٌ لشبكة نتائج الموظّفين ═══
        // لا يفترض آليّةً بل يطبع ما في الصفحة فعلاً: شيفرة الصفّ،
        // خصائصه، ومعالجاته، ودوال الإطار، وما في وسومه من نصوص أوامر.
        function supDeepDiag() {
            slog('', 'info');
            slog('═══ تشخيص عميق: شبكة الموظّفين ═══', 'warn');

            let grid = null, gdoc = null;
            for (const d of docs()) {
                let g = null;
                try { g = d.querySelector('table[id*="Gridview"], table[id*="GridView"]'); } catch (e) {}
                if (g) { grid = g; gdoc = d; break; }
            }
            if (!grid) { slog('لا توجد شبكة نتائج في الصفحة', 'error'); return; }

            slog('معرّف الشبكة: ' + grid.id, 'info');
            const rows = Array.from(grid.querySelectorAll('tr'));
            slog('عدد الصفوف: ' + rows.length, 'info');

            rows.forEach((tr, i) => {
                const attrs = Array.from(tr.attributes || [])
                    .map(a => a.name + '="' + String(a.value).slice(0, 160) + '"').join(' ');
                slog('صف[' + i + '] خصائص: ' + (attrs || 'لا شيء'), 'info');

                Array.from(tr.cells || []).forEach((td, j) => {
                    const ta = Array.from(td.attributes || [])
                        .map(a => a.name + '="' + String(a.value).slice(0, 160) + '"').join(' ');
                    if (ta) slog('   خلية[' + j + ']: ' + ta, 'info');
                    const inner = (td.innerHTML || '').trim();
                    if (inner && inner.length < 300 && /<|javascript:|__doPostBack/i.test(inner))
                        slog('   خلية[' + j + '] شيفرة: ' + inner, 'info');
                });
            });

            // هل يحمل الصفّ معالجاً مربوطاً برمجيّاً؟
            const dataRow = rows[1];
            if (dataRow) {
                ['onclick', 'ondblclick', 'onmousedown'].forEach(k => {
                    slog('صف البيانات ' + k + ': ' + (typeof dataRow[k] === 'function'
                        ? String(dataRow[k]).slice(0, 300) : 'غير مربوط'), 'info');
                });
            }

            // بيئة الإطار: هل __doPostBack موجود؟ وما الدوال ذات الصلة؟
            try {
                const w = gdoc.defaultView;
                slog('__doPostBack: ' + typeof w.__doPostBack, 'info');
                const fns = Object.keys(w).filter(k => {
                    try { return typeof w[k] === 'function' && /select|employee|emp|grid|row|search/i.test(k); }
                    catch (e) { return false; }
                }).slice(0, 40);
                slog('دوال ذات صلة: ' + (fns.join('، ') || 'لا شيء'), 'info');
            } catch (e) { slog('تعذّر فحص بيئة الإطار', 'error'); }

            // نصوص الوسوم التي تذكر الشبكة أو أمر الاختيار
            try {
                Array.from(gdoc.querySelectorAll('script')).forEach((sc, i) => {
                    const t = sc.textContent || '';
                    if (!/Select\$|GridviewEmployee|lblEmployeeName/i.test(t)) return;
                    const idx = t.search(/Select\$|GridviewEmployee|lblEmployeeName/i);
                    slog('وسم[' + i + ']: ...' + t.slice(Math.max(0, idx - 120), idx + 240) + '...', 'info');
                });
            } catch (e) {}

            // ── سلّم التقييم: القيم الحقيقيّة التي تنتظرها البوّابة ──
            slog('', 'info');
            slog('═══ سلّم بنود التقييم ═══', 'warn');
            let ev = findAllAnywhere('select[id*="ddlItemEvals"]');
            if (!ev.length) ev = findAllAnywhere('select').filter(x =>
                Array.from(x.options).some(o => normAr(o.text).includes(normAr('غير مقيم'))));
            slog('عدد قوائم التقييم: ' + ev.length, ev.length ? 'success' : 'error');
            if (ev[0]) {
                slog('المعرّف: ' + (ev[0].id || '—'), 'info');
                slog('معطّلة؟ ' + (ev[0].disabled ? 'نعم' : 'لا')
                     + ' | ظاهرة؟ ' + (ev[0].offsetParent !== null ? 'نعم' : 'لا')
                     + ' | القيمة الحاليّة: ' + ev[0].value, 'info');
                Array.from(ev[0].options).forEach((o, i) => {
                    slog('  خيار[' + i + '] value="' + o.value + '" ← ' + o.text.trim(), 'info');
                });
            }
            slog('═══ نهاية السلّم ═══', 'warn');

            slog('═══ نهاية التشخيص العميق ═══', 'warn');
            slog('انسخ السجل من هنا وأرسله', 'warn');
        }

        async function supSelectRow(d, tr) {
            const before = formsOptionCount();

            // البوّابة تختار الموظّف بنداء DisplayInfo(...) موضوعٍ في
            // خاصيّة onclick لعنصر <div> داخل الخليّة — لا عبر __doPostBack.
            const holders = Array.from(tr.querySelectorAll('*')).filter(el => {
                const oc = (el.getAttribute && el.getAttribute('onclick')) || '';
                return oc.indexOf('DisplayInfo') !== -1;
            });

            for (const el of holders) {
                slog('نقر عنصر DisplayInfo لاختيار المعلّم', 'info');
                try { el.click(); } catch (e) { continue; }
                if (await supRowConfirmed(before)) { slog('تُبِّت اختيار المعلّم', 'success'); return true; }

                // وإن لم يستجب النقر، استدعِ الدالة من بيئة الإطار مباشرةً
                const oc = el.getAttribute('onclick');
                try { d.defaultView.eval(oc); } catch (e) {}
                if (await supRowConfirmed(before)) { slog('تُبِّت اختيار المعلّم (استدعاء مباشر)', 'success'); return true; }
            }

            // احتياطٌ أخير: أحداث فأرةٍ على الصفّ وخلاياه وأحفاده
            for (const c of [tr, ...Array.from(tr.cells || []), ...Array.from(tr.querySelectorAll('*'))]) {
                for (const type of ['mousedown', 'mouseup', 'click']) {
                    try { c.dispatchEvent(new d.defaultView.MouseEvent(type, { bubbles: true, cancelable: true, view: d.defaultView })); }
                    catch (e) {}
                }
                if (await supRowConfirmed(before)) { slog('اختير المعلّم بأحداث الفأرة', 'success'); return true; }
            }

            slog('عُثر على صفّ المعلّم لكن تعذّر تثبيت الاختيار', 'error');
            supDeepDiag();
            return false;
        }

        function formsOptionCount() {
            const f = findAnywhere(FORMS_DDL);
            return f ? (f.options || []).length : 0;
        }

        // التثبيت يُعرف بأمرين: امتلاء قائمة الاستمارات، أو ظهور اسم الموظّف
        async function supRowConfirmed(before) {
            const want = normName((sup && sup.teacher) || '');
            const key  = want.split(' ').slice(0, 2).join(' ');   // أوّل اسمين تكفيان
            const t0 = Date.now();
            while (Date.now() - t0 < 7000) {
                await wait(500);
                if (formsOptionCount() > Math.max(1, before)) return true;
                const lbl = findAnywhere(['EmployeeAdministrativeScaleSearchCtrl1_lblEmployeeName']);
                if (lbl && key && normName(lbl.textContent || '').includes(key)) return true;
            }
            return false;
        }

        // كتابة صيغة البحث والضغط على زرّها
        async function supRunSearch(term) {
            const se = findAnywhere(EMP_SEARCH);
            if (!se) { slog('حقل بحث الموظّف غير موجود', 'error'); return false; }
            const btn = findAnywhere(EMP_SEARCH_BTN);
            if (!btn) { slog('زر البحث عن الموظفين غير موجود', 'error'); return false; }
            setVal(se, term);
            slog('البحث عن المعلّم بصيغة: ' + term, 'info');
            btn.click();
            return true;
        }

        // انتظار صفّ المعلّم في النتائج واختياره — المطابقة بالاسم كاملاً
        async function supAwaitTeacherRow(want, ms) {
            const t0 = Date.now();
            while (Date.now() - t0 < ms) {
                await wait(700);

                // هل ثُبّت الاسم في خانة الموظّف المختار؟
                const lbl = findAnywhere(['EmployeeAdministrativeScaleSearchCtrl1_lblEmployeeName']);
                if (lbl && want && normName(lbl.textContent || '').includes(want)) {
                    slog('اختير المعلّم: ' + lbl.textContent.trim(), 'success');
                    return true;
                }

                // وإلا فابحث عن صفّه في شبكة النتائج واخترْه
                for (const d of docs()) {
                    let rows = [];
                    try { rows = Array.from(d.querySelectorAll('tr')); } catch (e) { continue; }
                    for (const tr of rows) {
                        const txt = normName(tr.textContent || '');
                        if (!txt || txt.length > 220) continue;
                        if (!txt.includes(want)) continue;

                        if (await supSelectRow(d, tr)) return true;
                    }
                }
            }
            return false;
        }

        // بحث المعلّم واختياره من شبكة النتائج — بصيغةٍ بعد صيغة
        async function supPickTeacher() {
            if (!sup || !sup.teacher) return false;
            const want = normName(sup.teacher);
            const terms = searchTerms(sup.teacher);
            for (let i = 0; i < terms.length; i++) {
                if (!await supRunSearch(terms[i])) return false;
                if (await supAwaitTeacherRow(want, i === 0 ? 12000 : 7000)) return true;
                if (i < terms.length - 1)
                    slog('لم يظهر بهذه الصيغة — إعادة البحث بصيغةٍ أخرى', 'warn');
            }
            slog('لم يظهر المعلّم في النتائج خلال المهلة', 'error');
            return false;
        }

        // ═══ المرحلة ١ بالتسلسل الذي تفرضه البوّابة ═══
        // فتح النموذج ← البحث ← اختيار المعلّم ← التاريخ ← الاستمارة ←
        // فتح بيانات المعلّم ← عنوان الدرس والحصّة ← «إضافة».
        // كلُّ خطوةٍ تعتمد على ما قبلها: قائمة الاستمارات لا تمتلئ قبل
        // تثبيت المعلّم، وحقول الدرس لا تظهر قبل فتح بياناته.

        // فتح قسم «بيانات زيارة المعلم» — صفٌّ له مفتاح توسيعٍ لا تبويب.
        // حقل عنوان الدرس مخفيٌّ تحته، والبوّابة ترفض الحفظ بدونه.
        async function supOpenTeacherData() {
            const shown = () => {
                const lt = findAnywhere(STAGE1_FIELDS['عنوان الدرس']);
                return lt && lt.offsetParent !== null ? lt : null;
            };
            if (shown()) { slog('بيانات المعلّم مفتوحةٌ أصلاً', 'info'); return true; }

            const want = normAr('بيانات زيارة المعلم');
            for (const d of docs()) {
                let rows = [];
                try { rows = Array.from(d.querySelectorAll('tr, td, div')); } catch (e) { continue; }
                for (const r of rows) {
                    const t = normAr(r.textContent || '');
                    if (!t.includes(want) || t.length > 80) continue;

                    // المفتاح قد يكون مربّع اختيارٍ أو صورةً أو رابطاً داخل الصفّ
                    const keys = Array.from(r.querySelectorAll(
                        'input[type="checkbox"], img, a, input[type="image"], span'));
                    for (const k of [...keys, r]) {
                        try { k.click(); } catch (e) { continue; }
                        await wait(1200);
                        if (shown()) { slog('فُتحت بيانات زيارة المعلّم', 'success'); return true; }
                    }
                }
            }
            slog('تعذّر فتح «بيانات زيارة المعلم» — افتحه بيدك ثمّ اضغط «تعبئة النموذج»', 'error');
            return false;
        }

        function supPut(names, val, label) {
            if (!val) return;
            const el = findAnywhere(names);
            if (!el) { slog('مفقود: ' + label, 'error'); return; }
            if (el.tagName === 'SELECT') {
                const w = normAr(val);
                const words = w.split(' ').filter(x => x.length > 2);
                const o = Array.from(el.options).find(x => String(x.value) === String(val))
                       || Array.from(el.options).find(x => normAr(x.text) === w)
                       || Array.from(el.options).find(x => normAr(x.text).includes(w))
                       || Array.from(el.options).find(x => words.some(k => normAr(x.text).includes(k)))
                       // «الرياضة المدرسية» ↔ «التربية الرياضية»: قارن جذور الكلمات
                       || Array.from(el.options).find(x => {
                              const stem = t => t.replace(/^ال/, '').slice(0, 4);
                              const optW = normAr(x.text).split(' ').map(stem);
                              return words.map(stem).some(k => k.length > 2 && optW.indexOf(k) !== -1);
                          });
                if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true }));
                         slog('اختير ' + label + ': ' + o.text.trim(), 'success'); }
                else slog(label + ': «' + val + '» ليس في الخيارات', 'error');
            } else { setVal(el, val); slog('عُبّئ ' + label, 'success'); }
        }

        async function supStage1() {
            slog('المرحلة ١: رأس الزيارة', 'warn');

            // فحصٌ قبليّ: البوّابة تشترط هذه الحقول ولن تقبل بدونها
            const gaps = [];
            if (!sup.teacher)      gaps.push('اسم المعلّم');
            if (!sup.date)         gaps.push('تاريخ الزيارة');
            if (!sup.lessonTitle)  gaps.push('عنوان الدرس (حقل «الموضوع» في موقعك)');
            if (gaps.length) {
                sstat('بياناتٌ ناقصةٌ في التقرير');
                slog('ناقصٌ في التقرير المُصدَّر: ' + gaps.join('، '), 'error');
                slog('أكمله في موقعك ثمّ صدِّر من جديد — البوّابة سترفض بدونه', 'error');
                return;
            }

            // (١) البحث عن المعلّم و(٢) اختياره
            if (!await supPickTeacher()) {
                sstat('تعذّر اختيار المعلّم — أكمل يدوياً');
                slog('اختر المعلّم بنفسك ثمّ اضغط «تعبئة النموذج»', 'error');
                return;
            }

            // (٣) تاريخ الزيارة
            supPut(STAGE1_FIELDS['التاريخ'], sup.date, 'التاريخ');
            await wait(400);

            // (٤) الاستمارة — شرطُ ظهور بنود التقييم
            const forms = findAnywhere(FORMS_DDL);
            if (forms && !forms.value) {
                const opts = Array.from(forms.options || [])
                    .filter(o => o.value && o.value !== '0' && o.value !== '-1' && o.text.trim());
                const opt = opts.find(o => normAr(o.text).includes(normAr('مجال')))
                         || opts.find(o => normAr(o.text).includes(normAr('مادة')))
                         || opts[0];
                if (!opt) {
                    slog('قائمة الاستمارات فارغة — لم يُثبَّت المعلّم', 'error');
                    sstat('اختر المعلّم والاستمارة يدوياً');
                    return;
                }
                forms.value = opt.value;
                forms.dispatchEvent(new Event('change', { bubbles: true }));
                slog('اختيرت الاستمارة: ' + opt.text.trim(), 'success');
                await wait(2500);
            }

            // (٥) فتح بيانات المعلّم ثمّ عنوان الدرس والحصّة
            await supOpenTeacherData();
            supPut(STAGE1_FIELDS['عنوان الدرس'], sup.lessonTitle, 'عنوان الدرس');
            supPut(STAGE1_FIELDS['الحصة'],       sup.period,      'الحصة');
            supPut(STAGE1_FIELDS['المادة'],      sup.subject,     'المادة');
            await wait(400);

            // (٦) تحقّقٌ قبل «إضافة»: البوّابة ترفض بلا عنوان درس
            const lt = findAnywhere(STAGE1_FIELDS['عنوان الدرس']);
            if (sup.lessonTitle && (!lt || !lt.value.trim())) {
                sstat('عنوان الدرس لم يُكتب — أكمله يدوياً');
                slog('عنوان الدرس فارغٌ والبوّابة ترفض بدونه. افتح «بيانات زيارة المعلم»'
                     + ' واكتب العنوان ثمّ اضغط «تعبئة النموذج»', 'error');
                return;
            }

            const next = findAnywhere(STAGE1_NEXT);
            if (!next) { sstat('اكتمل الرأس — اضغط «إضافة» في البوّابة'); return; }
            slog('الانتقال إلى مرحلة التقييم...', 'warn');
            next.click();

            const t0 = Date.now();
            while (Date.now() - t0 < 25000) {
                await wait(800);
                if (supStage() === 2) { slog('ظهرت صفحة التقييم', 'success'); return await supStage2(); }
            }
            sstat('لم تظهر صفحة التقييم');
            slog('تحقّق من رسالة البوّابة أعلى النموذج ثمّ اضغط «تشخيص الصفحة»', 'warn');
            supDiag();
        }

        async function supPilot() {
            if (!sup) return;

            if (!formFieldsPresent() && onListPage()) {
                slog('🛩️ الطيّار الآلي: فتح نموذج الإضافة...', 'success');
                sstat('فتح نموذج الإضافة...');
                sessionStorage.setItem(SUP_PILOT, 'opened');
                const btn = supAddBtn();
                if (!btn) { slog('لا يوجد زر «إضافة»', 'error'); return; }
                btn.click();
                slog('بانتظار تحميل النموذج داخل الإطار...', 'info');
                if (!await waitForSupForm(25000)) {
                    slog('لم يظهر النموذج خلال المهلة — اضغط «تشخيص الصفحة»', 'error');
                    sstat('تأخّر تحميل النموذج');
                    return;
                }
                await wait(1200);
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
                panel.dataset.dragged = '';
                const mv = ev => {
                    if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) panel.dataset.dragged = '1';
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

        slog('وحدة الزيارات الإشرافية جاهزة — النسخة ' + SVF_VER, 'success');
        if (!sup) slog('صدّر زيارة إشرافية من الموقع أولاً', 'warn');
        if (queueInfo() && !autoSaveOn()) {
            slog('⏸ طابور زيارات بانتظارك والحفظ التلقائي مُطفأ — شغّله ليبدأ الطابور', 'error');
            svfsUnfold && svfsUnfold();
        }

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
