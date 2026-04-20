// ==UserScript==
// @name         🏫 مُصدِّر ومُعبِّئ الزيارات المدرسية
// @namespace    supervisor-om
// @version      5.1
// @description  يصدّر بيانات الزيارة المدرسية من موقع المشرف ويملأ استمارة الوزارة تلقائياً
// @author       Abu Al-Muather
// @match        https://supervisor-om.github.io/supervisory-visit-report/*
// @match        https://moe.gov.om/SMS/VariousRecords/SchoolVisits/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // ثوابت مشتركة
    // ═══════════════════════════════════════════════════════════════
    const DATA_KEY = 'svf_school_visit_data';

    const MOE_MAIN_URL =
        'https://moe.gov.om/SMS/VariousRecords/SchoolVisits/SchoolVisitsMain.aspx';

    const MOE_ADD_URL =
        'https://moe.gov.om/SMS/VariousRecords/SchoolVisits/AddEditSchoolVisits.aspx' +
        '?SchoolVisitID=-1&SchoolID=113&SchYearID=19&MyVisits=0&AttachmentFileID=-1';

    const VISIT_TYPE_MAP = {
        'اشرافية': '1', 'إشرافية': '1', 'supervisory': '1',
        'gov_exploratory': '2', 'استطلاعية': '2', 'إستطلاعية': '2',
        'اخرى': '3', 'أخرى': '3',
    };

    // IDs نموذج الإضافة (داخل iframe أو صفحة AddEditSchoolVisits.aspx)
    const IDS = {
        visitType:       'ddlVisitTypes',
        visitDate:       'tbDate',
        visitSubject:    'txtVisitSubject',
        arrivalTime:     'ddlVisitArrivalTime',
        arrivalAMPM:     'ddlArrivalTimeState',
        departureTime:   'ddlVisitDepartureTime',
        departureAMPM:   'ddlDepartureTimeState',
        visitorOpinion:  'txtVisitorOpinion',
        recommendations: 'txtVisitorRecomendation',
    };

    // IDs صفحة العرض الرئيسية
    const MAIN_IDS = {
        zone:       'ctl00_content_SchoolFilterCtrl1_ddlZones',
        eduSystem:  'ctl00_content_SchoolFilterCtrl1_ddlEducationSystems',
        year:       'ctl00_content_SchoolFilterCtrl1_ddlScholasticYears',
        state:      'ctl00_content_SchoolFilterCtrl1_ddlStates',
        school:     'ctl00_content_SchoolFilterCtrl1_ddlSchools',
        dept:       'ctl00_content_ddlDepartment',
        job:        'ctl00_content_ddlJobs',
        visitor:    'ctl00_content_ddlVisitors',
        visitType:  'ctl00_content_ddlSchoolVisitTypes',
        dateFrom:   'ctl00_content_dtpDateFrom_dateTextBox',
        dateTo:     'ctl00_content_dtpDateTo_dateTextBox',
        iframe:     'dialog-bodyAddEditSchoolVisits',
    };

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function parseVisitType(text) {
        if (!text) return '1';
        const t = text.trim();
        for (const [key, val] of Object.entries(VISIT_TYPE_MAP)) {
            if (t.includes(key)) return val;
        }
        return '1';
    }

    // ═══════════════════════════════════════════════════════════════
    // الجزء الأول: موقع المشرف (التصدير)
    // ═══════════════════════════════════════════════════════════════
    if (location.hostname.includes('supervisor-om.github.io')) {

        let patchedBtn = null;
        const observer = new MutationObserver(() => {
            const btn = findExportButton();
            if (btn && btn !== patchedBtn) {
                patchedBtn = btn;
                patchButton(btn);
            }
        });

        function findExportButton() {
            return (
                document.querySelector('#exportSchoolToMoeBtn') ||
                [...document.querySelectorAll('button, a')].find(el =>
                    el.textContent.includes('تصدير') && el.textContent.includes('وزار') && el.closest('#schoolVisitsApp')
                ) ||
                null
            );
        }

        function patchButton(btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode && btn.parentNode.replaceChild(newBtn, btn);
            patchedBtn = newBtn;
            newBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                doExport();
            });
        }

        function doExport() {
            const visitorOpinion = document.querySelector('#visitorOpinion') && document.querySelector('#visitorOpinion').value.trim() || '';
            const recommendations = document.querySelector('#recommendations') && document.querySelector('#recommendations').value.trim() || '';

            if (!visitorOpinion) {
                toast('يرجى توليد رأي الزائر أولاً قبل التصدير', 'error');
                return;
            }

            const rawDate = (document.querySelector('#schoolVisitDate') || {}).value && document.querySelector('#schoolVisitDate').value.trim() || '';
            let portalDate = rawDate;
            if (rawDate.includes('-')) {
                var parts = rawDate.split('-');
                portalDate = parts[2] + '/' + parts[1] + '/' + parts[0];
            }

            var typeKey = (document.querySelector('#visitTypeSelect') || {}).value || '';
            var typeName = '';
            try { typeName = schoolVisitTypesData[typeKey].name || typeKey; } catch(e) { typeName = typeKey; }

            var objectives = Array.from(document.querySelectorAll('#objectivesContainer input[name="objectives"]:checked'))
                .map(function(cb) { return cb.value.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim(); });

            var data = {
                visitType: parseVisitType(typeName || typeKey),
                visitTypeName: typeName,
                school: (document.querySelector('#schoolName') || {}).value && document.querySelector('#schoolName').value.trim() || '',
                date: portalDate,
                arrivalTime: (document.querySelector('#schoolArrivalTime') || {}).value || '08:00',
                departureTime: (document.querySelector('#schoolDepartureTime') || {}).value || '12:00',
                objectives: objectives,
                visitorOpinion: visitorOpinion,
                recommendations: recommendations,
            };

            showModal(data);
        }

        function showModal(data) {
            var old = document.getElementById('svf-confirm-modal');
            if (old) old.remove();

            var typeLabels = { '1': 'إشرافية', '2': 'استطلاعية', '3': 'أخرى' };

            var overlay = document.createElement('div');
            overlay.id = 'svf-confirm-modal';
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;' +
                'display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:inherit';

            overlay.innerHTML =
            '<div style="background:#fff;border-radius:16px;width:100%;max-width:490px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
                '<div style="background:linear-gradient(135deg,#d97706,#92400e);padding:16px 20px;color:white;display:flex;align-items:center;justify-content:space-between">' +
                    '<h3 style="margin:0;font-size:16px">🏫 تصدير زيارة مدرسية للوزارة</h3>' +
                    '<button id="svf-close" style="background:none;border:none;color:white;font-size:22px;cursor:pointer">×</button>' +
                '</div>' +
                '<div style="padding:16px 20px">' +
                    '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px;color:#92400e">' +
                        'سيتم نقلك لبوابة الوزارة وتعبئة استمارة الزيارة المدرسية تلقائياً بالبيانات التالية:' +
                    '</div>' +
                    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">' +
                        '<tr><td style="padding:5px 8px;color:#6b7280;width:40%">المدرسة</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + (esc(data.school) || '—') + '</td></tr>' +
                        '<tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">التاريخ</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + (esc(data.date) || '—') + '</td></tr>' +
                        '<tr><td style="padding:5px 8px;color:#6b7280">نوع الزيارة</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + esc(typeLabels[data.visitType] || data.visitTypeName || '—') + '</td></tr>' +
                        '<tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">وقت الوصول</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + esc(data.arrivalTime) + '</td></tr>' +
                        '<tr><td style="padding:5px 8px;color:#6b7280">وقت الانصراف</td>' +
                            '<td style="padding:5px 8px;font-weight:600">' + esc(data.departureTime) + '</td></tr>' +
                        '<tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">الأهداف</td>' +
                            '<td style="padding:5px 8px;font-size:11px">' + (data.objectives.length > 0 ? esc(data.objectives.slice(0,3).join(' • ')).slice(0, 80) + '...' : '—') + '</td></tr>' +
                    '</table>' +
                    '<div style="display:flex;gap:10px">' +
                        '<button id="svf-go" style="flex:1;background:linear-gradient(135deg,#d97706,#92400e);color:white;border:none;padding:12px;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer">' +
                            'فتح موقع الوزارة والتعبئة التلقائية' +
                        '</button>' +
                        '<button id="svf-close2" style="background:#f1f5f9;border:none;padding:12px 16px;border-radius:10px;font-size:14px;cursor:pointer;color:#475569">إلغاء</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

            document.body.appendChild(overlay);

            document.getElementById('svf-go').addEventListener('click', function() {
                var json = JSON.stringify(data);
                var b64 = btoa(unescape(encodeURIComponent(json)));
                var url = MOE_MAIN_URL + '#svf=' + b64;
                try { GM_setValue(DATA_KEY, json); } catch(e) {}
                window.open(url, '_blank');
                overlay.remove();
            });
            document.getElementById('svf-close').addEventListener('click', function() { overlay.remove(); });
            document.getElementById('svf-close2').addEventListener('click', function() { overlay.remove(); });
            overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        }

        function toast(msg, type) {
            if (typeof showToast === 'function') { showToast(msg, type); return; }
            var t = document.createElement('div');
            t.textContent = msg;
            t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);' +
                'background:' + (type === 'error' ? '#dc2626' : '#d97706') + ';color:white;' +
                'padding:12px 24px;border-radius:999px;z-index:99999;font-size:14px;' +
                'box-shadow:0 4px 20px rgba(0,0,0,.3)';
            document.body.appendChild(t);
            setTimeout(function() { t.remove(); }, 3000);
        }

        function initExporter() {
            var btn = findExportButton();
            if (btn) { patchedBtn = btn; patchButton(btn); }
            observer.observe(document.body, { childList: true, subtree: true });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initExporter);
        } else {
            initExporter();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // الجزء الثاني: موقع الوزارة (التعبئة التلقائية)
    // ═══════════════════════════════════════════════════════════════
    if (location.hostname.includes('moe.gov.om')) {

        var wait = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

        // ── لوحة متابعة ──
        GM_addStyle(
            '#svf-panel{' +
                'position:fixed;top:70px;left:10px;z-index:99999;' +
                'width:300px;background:#1a1207;color:#fef3c7;' +
                'border-radius:12px;box-shadow:0 6px 30px rgba(0,0,0,.6);' +
                'font-family:"Segoe UI",Arial,sans-serif;font-size:13px;' +
                'direction:rtl;overflow:hidden}' +
            '#svf-header{' +
                'background:linear-gradient(135deg,#d97706,#92400e);' +
                'padding:10px 14px;cursor:move;' +
                'display:flex;align-items:center;gap:8px}' +
            '#svf-header h3{margin:0;font-size:13px;flex:1}' +
            '#svf-badge{background:#fbbf24;color:#78350f;border-radius:20px;padding:1px 8px;font-size:10px;font-weight:bold}' +
            '#svf-toggle{cursor:pointer;user-select:none}' +
            '#svf-body{padding:12px}' +
            '#svf-data-box{background:#1c1408;border:1px solid #92400e;border-radius:8px;padding:10px;margin-bottom:10px;font-size:11px}' +
            '#svf-data-box .row{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #44403c}' +
            '#svf-data-box .row:last-child{border:none}' +
            '#svf-data-box .lbl{color:#fbbf24}' +
            '#svf-data-box .val{color:#fff;font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '#svf-status{background:#0c0a04;border-radius:6px;padding:7px 10px;margin-bottom:8px;font-size:11px;color:#fde68a}' +
            '#svf-pbar{height:5px;background:#0c0a04;border-radius:3px;margin-bottom:10px;overflow:hidden}' +
            '#svf-bar{height:100%;width:0%;border-radius:3px;background:linear-gradient(90deg,#d97706,#fbbf24);transition:width .4s}' +
            '#svf-log{background:#0c0a04;border-radius:6px;padding:7px;height:140px;overflow-y:auto;font-size:10.5px;margin-bottom:10px;line-height:1.7}' +
            '.svf-log-info{color:#93c5fd}' +
            '.svf-log-warn{color:#fde68a}' +
            '.svf-log-error{color:#fca5a5}' +
            '.svf-log-success{color:#6ee7b7;font-weight:bold}' +
            '.svf-btn{width:100%;padding:9px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;margin-bottom:6px}' +
            '#svf-btn-fill{background:linear-gradient(135deg,#d97706,#92400e);color:white;font-size:14px;padding:11px}' +
            '#svf-btn-fill:disabled{background:#44403c;color:#78716c;cursor:not-allowed}' +
            '#svf-btn-clear{background:#292524;color:#a8a29e;font-size:11px}' +
            '#svf-panel.collapsed #svf-body{display:none}'
        );

        var visitData = null;
        var filling = false;
        var statusEl = null;

        function log(msg, type) {
            type = type || 'info';
            var panel = document.getElementById('svf-log');
            if (panel) {
                var line = document.createElement('div');
                line.className = 'svf-log-' + type;
                line.textContent = new Date().toLocaleTimeString('ar') + ' — ' + msg;
                panel.appendChild(line);
                panel.scrollTop = panel.scrollHeight;
            }
            var method = type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log';
            console[method]('[SVF] ' + msg);
        }

        function setProgress(pct) {
            var bar = document.getElementById('svf-bar');
            if (bar) bar.style.width = pct + '%';
        }

        function setStatus(msg, icon) {
            icon = icon || '⏳';
            var el = document.getElementById('svf-status');
            if (el) el.textContent = icon + ' ' + msg;
        }

        function buildPanel(data) {
            if (document.getElementById('svf-panel')) return;

            var hasData = !!data;
            var typeLabels = { '1': 'إشرافية', '2': 'استطلاعية', '3': 'أخرى' };

            var panel = document.createElement('div');
            panel.id = 'svf-panel';

            var dataBoxHTML = '';
            if (hasData) {
                dataBoxHTML =
                    '<div id="svf-data-box">' +
                        '<div style="color:#fbbf24;font-weight:bold;margin-bottom:6px;font-size:11px">بيانات الزيارة المدرسية</div>' +
                        '<div class="row"><span class="lbl">المدرسة</span><span class="val">' + (esc(data.school) || '—') + '</span></div>' +
                        '<div class="row"><span class="lbl">التاريخ</span><span class="val">' + (esc(data.date) || '—') + '</span></div>' +
                        '<div class="row"><span class="lbl">نوع الزيارة</span><span class="val">' + esc(typeLabels[data.visitType] || data.visitTypeName || '—') + '</span></div>' +
                        '<div class="row"><span class="lbl">الوصول</span><span class="val">' + esc(data.arrivalTime) + '</span></div>' +
                        '<div class="row"><span class="lbl">الانصراف</span><span class="val">' + esc(data.departureTime) + '</span></div>' +
                    '</div>';
            } else {
                dataBoxHTML =
                    '<div style="background:#1c1408;border:1px dashed #44403c;border-radius:8px;padding:12px;text-align:center;color:#78716c;font-size:12px;margin-bottom:10px">' +
                        'لا توجد بيانات — استخدم "تصدير للوزارة" من موقعك' +
                    '</div>';
            }

            panel.innerHTML =
            '<div id="svf-header">' +
                '<span>🏫</span>' +
                '<h3>مُعبِّئ الزيارات المدرسية</h3>' +
                (hasData ? '<span id="svf-badge">بيانات جاهزة</span>' : '') +
                '<span id="svf-toggle">▼</span>' +
            '</div>' +
            '<div id="svf-body">' +
                dataBoxHTML +
                '<div id="svf-status">⏳ ' + (hasData ? 'انتظر الصفحة ثم اضغط تعبئة تلقائية' : 'في انتظار البيانات') + '</div>' +
                '<div id="svf-pbar"><div id="svf-bar"></div></div>' +
                '<div id="svf-log"></div>' +
                '<button class="svf-btn" id="svf-btn-fill"' + (!hasData ? ' disabled' : '') + '>⚡ تعبئة تلقائية</button>' +
                '<button class="svf-btn" id="svf-btn-clear">🗑 مسح السجل</button>' +
            '</div>';

            document.body.appendChild(panel);

            if (hasData) {
                document.getElementById('svf-btn-fill').addEventListener('click', function() { startFill(data); });
            }
            document.getElementById('svf-btn-clear').addEventListener('click', function() {
                var logEl = document.getElementById('svf-log');
                if (logEl) logEl.textContent = '';
            });
            document.getElementById('svf-toggle').addEventListener('click', function() {
                panel.classList.toggle('collapsed');
                document.getElementById('svf-toggle').textContent =
                    panel.classList.contains('collapsed') ? '▲' : '▼';
            });

            // سحب اللوحة
            var header = document.getElementById('svf-header');
            var sx, sy, il, it;
            header.addEventListener('mousedown', function(e) {
                sx = e.clientX; sy = e.clientY;
                il = panel.offsetLeft; it = panel.offsetTop;
                var move = function(ev) {
                    panel.style.left = (il + ev.clientX - sx) + 'px';
                    panel.style.top = (it + ev.clientY - sy) + 'px';
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', function() { document.removeEventListener('mousemove', move); }, { once: true });
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // كشف حالة الصفحة
        // ═══════════════════════════════════════════════════════════════
        function getPageState() {
            // صفحة AddEditSchoolVisits مباشرة
            if (document.getElementById(IDS.visitType)) return 'addForm';
            // صفحة العرض الرئيسية
            if (document.getElementById(MAIN_IDS.school)) return 'mainPage';
            return 'unknown';
        }

        // ═══════════════════════════════════════════════════════════════
        // التعبئة التلقائية — صفحة AddEditSchoolVisits.aspx
        // ═══════════════════════════════════════════════════════════════
        async function fillAddForm(data, doc) {
            doc = doc || document;
            log('━━━ بدء التعبئة التلقائية ━━━', 'info');
            setProgress(40);

            // 1. نوع الزيارة
            setStatus('اختيار نوع الزيارة...', '📝');
            var vtEl = doc.getElementById(IDS.visitType);
            if (vtEl && data.visitType) {
                vtEl.value = data.visitType;
                vtEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ نوع الزيارة: ' + ({ '1': 'إشرافية', '2': 'استطلاعية', '3': 'أخرى' }[data.visitType] || data.visitType), 'success');
            }
            await wait(500);
            setProgress(50);

            // 2. التاريخ
            setStatus('ملء التاريخ...', '📅');
            var dateEl = doc.getElementById(IDS.visitDate);
            if (dateEl && data.date) {
                dateEl.value = data.date;
                dateEl.dispatchEvent(new Event('input', { bubbles: true }));
                dateEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ التاريخ: ' + data.date, 'success');
            }
            await wait(300);
            setProgress(55);

            // 3. موضوع الزيارة (الأهداف)
            setStatus('ملء موضوع الزيارة...', '✍️');
            var subjectEl = doc.getElementById(IDS.visitSubject);
            if (subjectEl && data.objectives && data.objectives.length > 0) {
                subjectEl.value = data.objectives.join('\n');
                subjectEl.dispatchEvent(new Event('input', { bubbles: true }));
                subjectEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ الموضوع: ' + data.objectives.length + ' أهداف', 'success');
            }
            await wait(300);
            setProgress(65);

            // 4. وقت الوصول
            setStatus('ملء وقت الوصول...', '🕐');
            fillTimeDropdown(doc, IDS.arrivalTime, IDS.arrivalAMPM, data.arrivalTime);
            await wait(300);
            setProgress(70);

            // 5. وقت الانصراف
            setStatus('ملء وقت الانصراف...', '🕐');
            fillTimeDropdown(doc, IDS.departureTime, IDS.departureAMPM, data.departureTime);
            await wait(300);
            setProgress(80);

            // 6. رأي الزائر
            setStatus('ملء رأي الزائر...', '✍️');
            var opinionEl = doc.getElementById(IDS.visitorOpinion);
            if (opinionEl && data.visitorOpinion) {
                opinionEl.value = data.visitorOpinion;
                opinionEl.dispatchEvent(new Event('input', { bubbles: true }));
                opinionEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ رأي الزائر', 'success');
            }
            await wait(300);
            setProgress(90);

            // 7. التوصيات
            setStatus('ملء التوصيات...', '✍️');
            var recEl = doc.getElementById(IDS.recommendations);
            if (recEl && data.recommendations) {
                recEl.value = data.recommendations;
                recEl.dispatchEvent(new Event('input', { bubbles: true }));
                recEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ التوصيات', 'success');
            }
            setProgress(100);

            setStatus('تمت التعبئة التلقائية — احفظ يدوياً', '✅');
            log('━━━ اكتملت التعبئة! راجع واحفظ ━━━', 'success');
            log('⚠ اضغط زر الحفظ بنفسك', 'warn');

            GM_deleteValue(DATA_KEY);
        }

        // ملء حقول الوقت (ساعة:دقيقة + AM/PM)
        function fillTimeDropdown(doc, timeId, ampmId, timeStr) {
            if (!timeStr) return;

            var parts = timeStr.split(':');
            var hour24 = parseInt(parts[0], 10) || 8;
            var mins = parts[1] || '00';
            var ampm = hour24 >= 12 ? 'PM' : 'AM';
            var hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
            var timeVal = String(hour12).padStart(2, '0') + ':' + mins;

            var timeEl = doc.getElementById(timeId);
            if (timeEl) {
                // ابحث عن أقرب خيار
                var opts = Array.from(timeEl.options);
                var exact = opts.find(function(o) { return o.value === timeVal || o.text.trim() === timeVal; });
                if (!exact) {
                    // مطابقة تقريبية بالساعة فقط
                    var hourStr = String(hour12).padStart(2, '0');
                    exact = opts.find(function(o) { return o.text.includes(hourStr + ':'); });
                }
                if (exact) {
                    timeEl.value = exact.value;
                    timeEl.dispatchEvent(new Event('change', { bubbles: true }));
                    log('✅ وقت: ' + timeVal + ' ' + ampm, 'success');
                } else {
                    log('⚠ لم أجد خيار الوقت: ' + timeVal, 'warn');
                }
            }

            var ampmEl = doc.getElementById(ampmId);
            if (ampmEl) {
                ampmEl.value = ampm;
                ampmEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // التعبئة التلقائية — صفحة العرض الرئيسية
        // ═══════════════════════════════════════════════════════════════
        async function startFill(data) {
            if (filling) return;
            filling = true;

            var btn = document.getElementById('svf-btn-fill');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ التعبئة...'; }

            try {
                var state = getPageState();
                log('حالة الصفحة: ' + state, 'info');

                if (state === 'addForm') {
                    // نحن في صفحة الإضافة مباشرة
                    await fillAddForm(data);

                } else if (state === 'mainPage') {
                    // نحن في الصفحة الرئيسية — نحتاج نفتح نموذج الإضافة
                    log('الصفحة الرئيسية — جارٍ فتح نموذج الإضافة...', 'info');

                    // 1) اختيار المدرسة
                    await selectSchool(data);
                    await wait(2000);

                    // 2) ضغط عرض
                    await clickViewButton();
                    await wait(4000);

                    // 3) ضغط إضافة
                    await clickAddButton();
                    await wait(3000);

                    // 4) انتظار iframe
                    setStatus('⏳ انتظار نموذج الإضافة...', '⏳');
                    log('انتظار تحميل iframe...');

                    var iframe = await waitForIframe(20000);
                    if (iframe && iframe.contentDocument) {
                        log('✅ iframe تحمل — بدء التعبئة', 'success');
                        await wait(1000);
                        await fillAddForm(data, iframe.contentDocument);
                    } else {
                        log('⚠ iframe لم يتحمل — جرب التعبئة اليدوية', 'warn');
                        log('نصيحة: افتح نموذج الإضافة يدوياً ثم اضغط ⚡ تعبئة', 'info');
                        setStatus('افتح نموذج الإضافة ثم اضغط ⚡', '⏳');
                    }

                } else {
                    // صفحة غير معروفة — جرب iframe أو نموذج مباشر
                    log('صفحة غير معروفة — بحث عن iframe أو نموذج...', 'info');
                    var iframe2 = document.getElementById(MAIN_IDS.iframe);
                    if (iframe2 && iframe2.contentDocument && iframe2.contentDocument.getElementById(IDS.visitType)) {
                        await fillAddForm(data, iframe2.contentDocument);
                    } else {
                        log('❌ لم أجد نموذج الإضافة', 'error');
                        setStatus('لم أجد النموذج', '❌');
                    }
                }
            } catch (err) {
                setStatus('خطأ: ' + err.message, '❌');
                log('خطأ: ' + err.message, 'error');
            } finally {
                filling = false;
                if (btn) { btn.disabled = false; btn.textContent = '⚡ تعبئة تلقائية'; }
            }
        }

        // ── اختيار المدرسة في الصفحة الرئيسية ──
        async function selectSchool(data) {
            log('خطوة 1: اختيار المدرسة...', 'info');
            setProgress(5);

            if (!data.school) {
                log('⚠ اسم المدرسة غير محدد', 'warn');
                return;
            }

            var target = data.school.trim();

            // جرب القائمة مباشرة
            var schoolSel = document.getElementById(MAIN_IDS.school);
            if (schoolSel && schoolSel.options.length > 1) {
                var opts = Array.from(schoolSel.options);
                var match = opts.find(function(o) { return o.text.includes(target); });
                if (match) {
                    schoolSel.value = match.value;
                    doPostBack(schoolSel);
                    log('✅ المدرسة: ' + match.text, 'success');
                    setProgress(15);
                    return;
                }
            }

            // القائمة فاضية — نحتار المحافظة أولاً
            log('القائمة تحتاج تحميل — اختيار المحافظة...', 'info');

            // محافظة مسقط
            var zoneSel = document.getElementById(MAIN_IDS.zone);
            if (zoneSel) {
                var zoneOpts = Array.from(zoneSel.options);
                var zoneMatch = zoneOpts.find(function(o) { return o.text.includes('مسقط'); });
                if (zoneMatch && zoneSel.value !== zoneMatch.value) {
                    zoneSel.value = zoneMatch.value;
                    doPostBack(zoneSel);
                    log('✅ المحافظة: مسقط', 'success');
                    await wait(5000);
                }
            }

            // نظام أساسي
            var sysSel = document.getElementById(MAIN_IDS.eduSystem);
            if (sysSel) {
                var sysOpts = Array.from(sysSel.options);
                var sysMatch = sysOpts.find(function(o) { return o.text.includes('أساسي'); });
                if (sysMatch && sysSel.value !== sysMatch.value) {
                    sysSel.value = sysMatch.value;
                    doPostBack(sysSel);
                    log('✅ النظام: أساسي', 'success');
                    await wait(3000);
                }
            }

            // الولاية
            var stateSel = document.getElementById(MAIN_IDS.state);
            if (stateSel) {
                var stateOpts = Array.from(stateSel.options);
                var stateMatch = stateOpts.find(function(o) { return o.text.includes('سيب'); });
                if (stateMatch && stateSel.value !== stateMatch.value) {
                    stateSel.value = stateMatch.value;
                    doPostBack(stateSel);
                    log('✅ الولاية: السيب', 'success');
                    await wait(3000);
                }
            }

            // الآن المدرسة
            var schoolSel2 = document.getElementById(MAIN_IDS.school);
            if (schoolSel2) {
                var opts2 = Array.from(schoolSel2.options);
                var match2 = opts2.find(function(o) { return o.text.includes(target); });
                if (match2) {
                    schoolSel2.value = match2.value;
                    doPostBack(schoolSel2);
                    log('✅ المدرسة: ' + match2.text, 'success');
                } else {
                    log('⚠ المدرسة غير موجودة: ' + target, 'warn');
                    var avail = opts2.slice(1, 6).map(function(o) { return o.text; }).join(' | ');
                    log('خيارات: ' + avail, 'info');
                }
            }
            await wait(2000);
            setProgress(15);
        }

        // ── ضغط زر عرض ──
        async function clickViewButton() {
            log('خطوة 2: ضغط عرض...', 'info');
            var btns = Array.from(document.querySelectorAll('input[type=button], input[type=submit], button'));
            var viewBtn = btns.find(function(b) { return (b.value || b.textContent || '').trim() === 'عرض'; });
            if (viewBtn) {
                doPostBack(viewBtn);
                log('✅ تم ضغط عرض', 'success');
            } else {
                log('⚠ زر عرض غير موجود', 'warn');
            }
            await wait(4000);
            setProgress(25);
        }

        // ── ضغط زر إضافة ──
        async function clickAddButton() {
            log('خطوة 3: ضغط إضافة...', 'info');

            // انتظار حتى يظهر زر الإضافة (حتى 15 ثانية)
            for (var i = 0; i < 8; i++) {
                var btns = Array.from(document.querySelectorAll('input[type=button], input[type=submit], button'));
                var addBtn = btns.find(function(b) { return (b.value || b.textContent || '').trim() === 'إضافة'; });
                if (addBtn) {
                    doPostBack(addBtn);
                    log('✅ تم ضغط إضافة', 'success');
                    setProgress(35);
                    return;
                }
                await wait(2000);
            }
            log('⚠ زر إضافة لم يظهر بعد 16 ثانية', 'warn');
            setProgress(35);
        }

        // ── انتظار iframe ──
        function waitForIframe(timeout) {
            return new Promise(function(resolve) {
                // تحقق فوري
                var iframe = document.getElementById(MAIN_IDS.iframe);
                if (iframe && iframe.contentDocument && iframe.contentDocument.getElementById(IDS.visitType)) {
                    resolve(iframe); return;
                }

                var resolved = false;

                var obs = new MutationObserver(function() {
                    if (resolved) return;
                    var iframe = document.getElementById(MAIN_IDS.iframe);
                    if (iframe && iframe.contentDocument && iframe.contentDocument.getElementById(IDS.visitType)) {
                        resolved = true;
                        obs.disconnect();
                        clearTimeout(timer);
                        clearInterval(checkInterval);
                        resolve(iframe);
                    }
                });
                obs.observe(document.body, { childList: true, subtree: true });

                var checkInterval = setInterval(function() {
                    if (resolved) return;
                    try {
                        var iframe = document.getElementById(MAIN_IDS.iframe);
                        if (iframe && iframe.contentDocument && iframe.contentDocument.getElementById(IDS.visitType)) {
                            resolved = true;
                            obs.disconnect();
                            clearTimeout(timer);
                            clearInterval(checkInterval);
                            resolve(iframe);
                        }
                    } catch(e) {}
                }, 500);

                var timer = setTimeout(function() {
                    if (resolved) return;
                    resolved = true;
                    obs.disconnect();
                    clearInterval(checkInterval);
                    try {
                        var iframe = document.getElementById(MAIN_IDS.iframe);
                        resolve((iframe && iframe.contentDocument) ? iframe : null);
                    } catch(e) { resolve(null); }
                }, timeout || 20000);
            });
        }

        // ─ـ doPostBack helper ──
        function doPostBack(el) {
            if (!el) return false;

            // جرب onclick attribute
            var oc = el.getAttribute('onclick') || '';
            var m = oc.match(/__doPostBack\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\)/);
            if (m && typeof __doPostBack === 'function') {
                __doPostBack(m[1], m[2]);
                return true;
            }

            // جرب onchange attribute (للـ selects)
            oc = el.getAttribute('onchange') || '';
            m = oc.match(/__doPostBack\(['"]([^'"]+)['"]/);
            if (m && typeof __doPostBack === 'function') {
                __doPostBack(m[1], '');
                return true;
            }

            // fallback: click عادي
            el.click();
            return false;
        }

        // ── اختصار ──
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                if (visitData) startFill(visitData);
            }
        });

        // ── التهيئة ──
        window.addEventListener('load', function() {
            setTimeout(function() {
                // 1) قراءة البيانات من hash الرابط
                try {
                    var m = location.hash.match(/#svf=([A-Za-z0-9+/=]+)/);
                    if (m) {
                        var json = decodeURIComponent(escape(atob(m[1])));
                        visitData = JSON.parse(json);
                        try { GM_setValue(DATA_KEY, json); } catch(e) {}
                        history.replaceState(null, '', location.pathname + location.search);
                    }
                } catch(e) {}

                // 2) من تخزين Tampermonkey
                if (!visitData) {
                    try {
                        var raw = GM_getValue(DATA_KEY, '');
                        if (raw) visitData = JSON.parse(raw);
                    } catch(e) {}
                }

                buildPanel(visitData);

                if (visitData) {
                    log('تم استيراد البيانات من موقع المشرف', 'success');
                    log('المدرسة: ' + (visitData.school || '—'), 'info');
                    log('التاريخ: ' + (visitData.date || '—'), 'info');
                    log('نوع الزيارة: ' + (visitData.visitTypeName || visitData.visitType), 'info');
                    log('', 'info');
                    log('━━━ طريقة الاستخدام ━━━', 'info');
                    log('1️⃣ اختر المدرسة في البوابة (تلقائي)', 'info');
                    log('2️⃣ اضغط عرض ثم إضافة (تلقائي)', 'info');
                    log('3️⃣ تعبئة النموذج (تلقائي)', 'info');
                    log('4️⃣ احفظ يدوياً ⚠️', 'warn');
                    log('', 'info');
                    log('اضغط ⚡ تعبئة تلقائية للبدء', 'info');

                    // لو نحن في صفحة AddEditSchoolVisits مباشرة — تعبئة تلقائية فورية
                    if (getPageState() === 'addForm') {
                        log('صفحة الإضافة محملة — تعبئة تلقائية...', 'success');
                        setTimeout(function() { startFill(visitData); }, 1500);
                    }
                } else {
                    log('لا توجد بيانات — استخدم "تصدير للوزارة" من موقعك', 'warn');
                }
            }, 2000);
        });
    }

})();