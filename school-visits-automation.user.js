// ==UserScript==
// @name         🏫 مُصدِّر ومُعبِّئ الزيارات المدرسية
// @namespace    supervisor-om
// @version      6.1
// @description  يصدّر بيانات الزيارة المدرسية من موقع المشرف ويملأ استمارة الوزارة تلقائياً (اختيار المدرسة + عرض + إضافة + تعبئة)
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

    const VISIT_TYPE_MAP = {
        'اشرافية': '1', 'إشرافية': '1', 'supervisory': '1',
        'gov_exploratory': '2', 'استطلاعية': '2', 'إستطلاعية': '2',
        'اخرى': '3', 'أخرى': '3',
    };

    // IDs نموذج الإضافة
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
        school:     'ctl00_content_SchoolFilterCtrl1_ddlSchools',
        showBtn:    'ctl00_content_btnShow',
        addBtn:     'ctl00_content_ImgAdd',
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
            const visitorOpinion = document.querySelector('#visitorOpinion')?.value?.trim() || '';
            const recommendations = document.querySelector('#recommendations')?.value?.trim() || '';

            if (!visitorOpinion) {
                toast('يرجى توليد رأي الزائر أولاً قبل التصدير', 'error');
                return;
            }

            const rawDate = document.querySelector('#schoolVisitDate')?.value?.trim() || '';
            let portalDate = rawDate;
            if (rawDate.includes('-')) {
                var parts = rawDate.split('-');
                portalDate = parts[2] + '/' + parts[1] + '/' + parts[0];
            }

            var typeKey = document.querySelector('#visitTypeSelect')?.value || '';
            var typeName = '';
            try { typeName = schoolVisitTypesData[typeKey].name || typeKey; } catch(e) { typeName = typeKey; }

            var objectives = Array.from(document.querySelectorAll('#objectivesContainer input[name="objectives"]:checked'))
                .map(function(cb) { return cb.value.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim(); });

            var data = {
                visitType: parseVisitType(typeName || typeKey),
                visitTypeName: typeName,
                school: document.querySelector('#schoolName')?.value?.trim() || '',
                date: portalDate,
                arrivalTime: document.querySelector('#schoolArrivalTime')?.value || '08:00',
                departureTime: document.querySelector('#schoolDepartureTime')?.value || '12:00',
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
                try { GM_setValue(DATA_KEY, json); } catch(e) {}
                window.open(MOE_MAIN_URL, '_blank');
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

        // ── أنماط اللوحة ──
        GM_addStyle(
            '#svf-panel{' +
                'position:fixed;top:70px;left:10px;z-index:99999;' +
                'width:320px;background:#1a1207;color:#fef3c7;' +
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
            '#svf-data-box .val{color:#fff;font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '#svf-status{background:#0c0a04;border-radius:6px;padding:7px 10px;margin-bottom:8px;font-size:11px;color:#fde68a}' +
            '#svf-pbar{height:5px;background:#0c0a04;border-radius:3px;margin-bottom:10px;overflow:hidden}' +
            '#svf-bar{height:100%;width:0%;border-radius:3px;background:linear-gradient(90deg,#d97706,#fbbf24);transition:width .4s}' +
            '#svf-log{background:#0c0a04;border-radius:6px;padding:7px;height:160px;overflow-y:auto;font-size:10.5px;margin-bottom:10px;line-height:1.7}' +
            '.svf-log-info{color:#93c5fd}' +
            '.svf-log-warn{color:#fde68a}' +
            '.svf-log-error{color:#fca5a5}' +
            '.svf-log-success{color:#6ee7b7;font-weight:bold}' +
            '.svf-btn{width:100%;padding:9px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;margin-bottom:6px}' +
            '#svf-btn-auto{background:linear-gradient(135deg,#d97706,#92400e);color:white;font-size:14px;padding:11px}' +
            '#svf-btn-auto:disabled{background:#44403c;color:#78716c;cursor:not-allowed}' +
            '#svf-btn-fill{background:#15803d;color:white;font-size:13px;padding:9px}' +
            '#svf-btn-fill:disabled{background:#44403c;color:#78716c;cursor:not-allowed}' +
            '#svf-btn-clear{background:#292524;color:#a8a29e;font-size:11px}' +
            '#svf-panel.collapsed #svf-body{display:none}'
        );

        var visitData = null;
        var autoRunning = false;
        var filling = false;

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
                '<div id="svf-status">⏳ ' + (hasData ? 'جاهز للتشغيل التلقائي' : 'في انتظار البيانات') + '</div>' +
                '<div id="svf-pbar"><div id="svf-bar"></div></div>' +
                '<div id="svf-log"></div>' +
                '<button class="svf-btn" id="svf-btn-auto"' + (!hasData ? ' disabled' : '') + '>🚀 تشغيل تلقائي كامل</button>' +
                '<button class="svf-btn" id="svf-btn-fill"' + (!hasData ? ' disabled' : '') + '>⚡ تعبئة النموذج فقط</button>' +
                '<button class="svf-btn" id="svf-btn-clear">🗑 مسح السجل</button>' +
            '</div>';

            document.body.appendChild(panel);

            if (hasData) {
                document.getElementById('svf-btn-auto').addEventListener('click', function() { runAutoFull(data); });
                document.getElementById('svf-btn-fill').addEventListener('click', function() { runFillOnly(data); });
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
        // التشغيل التلقائي الكامل: اختيار المدرسة → عرض → إضافة → تعبئة
        // ═══════════════════════════════════════════════════════════════
        async function runAutoFull(data) {
            if (autoRunning) return;
            autoRunning = true;
            setProgress(0);

            var autoBtn = document.getElementById('svf-btn-auto');
            var fillBtn = document.getElementById('svf-btn-fill');
            if (autoBtn) { autoBtn.disabled = true; autoBtn.textContent = '⏳ جارٍ التشغيل...'; }
            if (fillBtn) fillBtn.disabled = true;

            try {
                // ── الخطوة 1: اختيار المدرسة ──
                setStatus('اختيار المدرسة...', '🏫');
                log('━━━ الخطوة 1: اختيار المدرسة ━━━', 'info');
                setProgress(5);

                var schoolDD = document.getElementById(MAIN_IDS.school);
                if (!schoolDD) {
                    log('❌ لم أجد قائمة المدارس — تأكد أنك في صفحة الزيارات المدرسية', 'error');
                    setStatus('خطأ: قائمة المدارس غير موجودة', '❌');
                    autoRunning = false;
                    if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = '🚀 تشغيل تلقائي كامل'; }
                    if (fillBtn) fillBtn.disabled = false;
                    return;
                }

                var schoolName = data.school || '';
                var schoolFound = false;

                if (schoolName) {
                    // بحث تطابقي في القائمة
                    var opts = Array.from(schoolDD.options);
                    var match = opts.find(function(o) {
                        return o.text.trim() === schoolName.trim();
                    });
                    // بحث تقريبي لو ما لقينا تطابق كامل
                    if (!match) {
                        match = opts.find(function(o) {
                            return o.text.includes(schoolName.trim()) || schoolName.trim().includes(o.text.trim());
                        });
                    }
                    if (match) {
                        schoolDD.value = match.value;
                        schoolDD.dispatchEvent(new Event('change', { bubbles: true }));
                        log('✅ تم اختيار المدرسة: ' + match.text, 'success');
                        schoolFound = true;
                    } else {
                        log('⚠ لم أجد المدرسة "' + schoolName + '" في القائمة', 'warn');
                        log('المدارس المتاحة: ' + opts.slice(1, 6).map(function(o) { return o.text; }).join(' | ') + '...', 'info');
                    }
                } else {
                    log('⚠ لم يوجد اسم مدرسة في البيانات', 'warn');
                }

                if (!schoolFound) {
                    log('⏸ اختر المدرسة يدوياً ثم اضغط 🚀 تشغيل تلقائي كامل', 'warn');
                    setStatus('اختر المدرسة يدوياً أولاً', '⏸');
                    autoRunning = false;
                    if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = '🚀 تشغيل تلقائي كامل'; }
                    if (fillBtn) fillBtn.disabled = false;
                    return;
                }

                await wait(1500);
                setProgress(15);

                // ── الخطوة 2: اضغط عرض ──
                setStatus('ضغط عرض...', '🔍');
                log('━━━ الخطوة 2: ضغط عرض ━━━', 'info');

                var showBtn = document.getElementById(MAIN_IDS.showBtn);
                if (showBtn) {
                    showBtn.click();
                    log('✅ تم ضغط عرض', 'success');
                } else {
                    log('❌ لم أجد زر عرض', 'error');
                }

                await wait(3000);
                setProgress(25);

                // ── الخطوة 3: اضغط إضافة ──
                setStatus('ضغط إضافة...', '➕');
                log('━━━ الخطوة 3: ضغط إضافة ━━━', 'info');

                var addBtn = document.getElementById(MAIN_IDS.addBtn);
                if (addBtn) {
                    addBtn.click();
                    log('✅ تم ضغط إضافة', 'success');
                } else {
                    log('❌ لم أجد زر إضافة', 'error');
                }

                // انتظر ظهور iframe النموذج
                setStatus('انتظار نموذج الإضافة...', '⏳');
                log('⏳ انتظار ظهور نموذج الإضافة...', 'info');

                var maxWait = 15000;
                var waited = 0;
                var formDoc = null;
                while (waited < maxWait) {
                    await wait(1000);
                    waited += 1000;
                    formDoc = findFormDoc();
                    if (formDoc) break;
                }
                setProgress(35);

                if (!formDoc) {
                    log('❌ لم يظهر نموذج الإضافة بعد ' + (maxWait/1000) + ' ثانية', 'error');
                    setStatus('لم يظهر نموذج الإضافة', '❌');
                    autoRunning = false;
                    if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = '🚀 تشغيل تلقائي كامل'; }
                    if (fillBtn) fillBtn.disabled = false;
                    return;
                }

                log('✅ ظهر نموذج الإضافة!', 'success');
                await wait(1000);

                // ── الخطوة 4: تعبئة النموذج ──
                await fillAddForm(data, formDoc);

            } catch (err) {
                setStatus('خطأ: ' + err.message, '❌');
                log('❌ خطأ: ' + err.message, 'error');
            } finally {
                autoRunning = false;
                if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = '🚀 تشغيل تلقائي كامل'; }
                if (fillBtn) fillBtn.disabled = false;
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // تعبئة النموذج فقط (لو النموذج مفتوح بالفعل)
        // ═══════════════════════════════════════════════════════════════
        async function runFillOnly(data) {
            if (filling) return;
            filling = true;

            var fillBtn = document.getElementById('svf-btn-fill');
            var autoBtn = document.getElementById('svf-btn-auto');
            if (fillBtn) { fillBtn.disabled = true; fillBtn.textContent = '⏳ جارٍ التعبئة...'; }
            if (autoBtn) autoBtn.disabled = true;

            try {
                var doc = findFormDoc();
                if (doc) {
                    await fillAddForm(data, doc);
                } else {
                    log('⚠ نموذج الإضافة غير موجود', 'warn');
                    log('اضغط إضافة أولاً ثم اضغط ⚡ تعبئة النموذج فقط', 'info');
                    setStatus('افتح نموذج الإضافة أولاً', '⏳');
                }
            } catch (err) {
                setStatus('خطأ: ' + err.message, '❌');
                log('❌ خطأ: ' + err.message, 'error');
            } finally {
                filling = false;
                if (fillBtn) { fillBtn.disabled = false; fillBtn.textContent = '⚡ تعبئة النموذج فقط'; }
                if (autoBtn) autoBtn.disabled = false;
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // تعبئة حقول النموذج
        // ═══════════════════════════════════════════════════════════════
        async function fillAddForm(data, doc) {
            doc = doc || document;
            log('━━━ الخطوة 4: تعبئة النموذج ━━━', 'info');
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
            } else if (recEl) {
                log('ℹ لا توجد توصيات', 'info');
            }
            setProgress(100);

            setStatus('تمت التعبئة — راجع واحفظ يدوياً ⚠️', '✅');
            log('━━━ اكتملت التعبئة! راجع واحفظ ━━━', 'success');
            log('⚠️ اضغط زر الحفظ بنفسك', 'warn');

            GM_deleteValue(DATA_KEY);
        }

        // ملء حقول الوقت
        function fillTimeDropdown(doc, timeId, ampmId, timeStr) {
            if (!timeStr) return;

            var parts = timeStr.split(':');
            var hour24 = parseInt(parts[0], 10) || 8;
            var mins = parts[1] || '00';
            // AM/PM بالعربي: ص=1 (AM), م=2 (PM)
            var ampmVal = hour24 >= 12 ? '2' : '1';
            var ampmLabel = hour24 >= 12 ? 'م' : 'ص';
            var hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
            var timeVal = String(hour12).padStart(2, '0') + ':' + mins;

            var timeEl = doc.getElementById(timeId);
            if (timeEl) {
                var opts = Array.from(timeEl.options);
                var exact = opts.find(function(o) { return o.value === timeVal || o.text.trim() === timeVal; });
                if (!exact) {
                    var hourStr = String(hour12).padStart(2, '0');
                    exact = opts.find(function(o) { return o.text.includes(hourStr + ':'); });
                }
                if (exact) {
                    timeEl.value = exact.value;
                    timeEl.dispatchEvent(new Event('change', { bubbles: true }));
                    log('✅ وقت: ' + timeVal + ' ' + ampmLabel, 'success');
                } else {
                    log('⚠ لم أجد خيار الوقت: ' + timeVal, 'warn');
                }
            }

            var ampmEl = doc.getElementById(ampmId);
            if (ampmEl) {
                ampmEl.value = ampmVal;
                ampmEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // ابحث عن نموذج الإضافة
        function findFormDoc() {
            if (document.getElementById(IDS.visitType)) return document;
            try {
                var iframe = document.getElementById(MAIN_IDS.iframe);
                if (iframe && iframe.contentDocument && iframe.contentDocument.getElementById(IDS.visitType)) {
                    return iframe.contentDocument;
                }
            } catch(e) {}
            return null;
        }

        // ── اختصار ──
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                if (visitData) runFillOnly(visitData);
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                if (visitData) runAutoFull(visitData);
            }
        });

        // ── التهيئة ──
        // نقرأ البيانات فوراً (قبل load) عشان ما نفقد البيانات بسبب postback
        (function readData() {
            // 1) من hash الرابط
            try {
                var m = location.hash.match(/#svf=([A-Za-z0-9+/=]+)/);
                if (m) {
                    var json = decodeURIComponent(escape(atob(m[1])));
                    visitData = JSON.parse(json);
                    try { GM_setValue(DATA_KEY, json); } catch(e) {}
                    history.replaceState(null, '', location.pathname + location.search);
                }
            } catch(e) {}

            // 2) من تخزين Tampermonkey (المصدر الأساسي)
            if (!visitData) {
                try {
                    var raw = GM_getValue(DATA_KEY, '');
                    if (raw) visitData = JSON.parse(raw);
                } catch(e) {}
            }

            // 3) من localStorage (fallback — نفس النطاق)
            if (!visitData) {
                try {
                    var lsRaw = localStorage.getItem('sv_moe_school_export');
                    if (lsRaw) visitData = JSON.parse(lsRaw);
                } catch(e) {}
            }
        })();

        // نبني اللوحة بعد ما الصفحة تتحمل
        window.addEventListener('load', function() {
            setTimeout(function() {
                buildPanel(visitData);

                if (visitData) {
                    log('✅ تم استيراد البيانات من موقع المشرف', 'success');
                    log('🏫 المدرسة: ' + (visitData.school || '—'), 'info');
                    log('📅 التاريخ: ' + (visitData.date || '—'), 'info');
                    log('📋 نوع الزيارة: ' + (visitData.visitTypeName || visitData.visitType), 'info');
                    log('', 'info');

                    var formDoc = findFormDoc();
                    if (formDoc) {
                        log('✅ نموذج الإضافة مفتوح بالفعل', 'success');
                        setStatus('النموذج مفتوح — اضغط تعبئة', '✅');
                    } else {
                        log('━━━ طريقتان للتشغيل ━━━', 'info');
                        log('🚀 تشغيل تلقائي كامل: اختيار المدرسة + عرض + إضافة + تعبئة', 'info');
                        log('⚡ تعبئة النموذج فقط: لو النموذج مفتوح بالفعل', 'info');
                        log('', 'info');
                        log('اختصارات: Ctrl+Shift+A = تلقائي كامل | Ctrl+Shift+F = تعبئة فقط', 'info');
                    }
                } else {
                    log('لا توجد بيانات — استخدم "تصدير للوزارة" من موقعك', 'warn');
                }
            }, 2000);
        });

        // راقب postbacks — أعد بناء اللوحة لو ضاعت
        var panelCheckInterval = setInterval(function() {
            if (!document.getElementById('svf-panel') && visitData) {
                buildPanel(visitData);
            }
        }, 3000);
    }

})();