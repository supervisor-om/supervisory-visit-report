// ==UserScript==
// @name         🏫 مُصدِّر ومُعبِّئ الزيارات المدرسية
// @namespace    supervisor-om
// @version      5.0
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

    const VISIT_TYPE_MAP = {
        'اشرافية': '1',
        'إشرافية': '1',
        'supervisory': '1',
        'gov_exploratory': '2',
        'استطلاعية': '2',
        'إستطلاعية': '2',
        'اخرى': '3',
        'أخرى': '3',
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
            btn.parentNode?.replaceChild(newBtn, btn);
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
                toast('يرجى توليد رأي الزائر أولاً ثم التصدير', 'error');
                return;
            }

            const rawDate = document.querySelector('#schoolVisitDate')?.value?.trim() || '';
            let portalDate = rawDate;
            if (rawDate.includes('-')) {
                const [y, mo, d] = rawDate.split('-');
                portalDate = `${d}/${mo}/${y}`;
            }

            const typeKey = document.querySelector('#visitTypeSelect')?.value || '';
            const typeName = (typeof schoolVisitTypesData !== 'undefined' && schoolVisitTypesData[typeKey]?.name) || typeKey;

            const objectives = Array.from(document.querySelectorAll('#objectivesContainer input[name="objectives"]:checked'))
                .map(cb => cb.value.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim());

            const data = {
                visitType: parseVisitType(typeName),
                visitTypeName: typeName,
                school: document.querySelector('#schoolName')?.value?.trim() || '',
                date: portalDate,
                arrivalTime: document.querySelector('#schoolArrivalTime')?.value || '08:00',
                departureTime: document.querySelector('#schoolDepartureTime')?.value || '12:00',
                objectives: objectives,
                classroomVisits: (typeof schoolClassroomVisits !== 'undefined') ? schoolClassroomVisits : [],
                visitorOpinion: visitorOpinion,
                recommendations: recommendations,
            };

            showModal(data);
        }

        function showModal(data) {
            const old = document.getElementById('svf-confirm-modal');
            if (old) old.remove();

            const typeLabels = { '1': 'إشرافية', '2': 'استطلاعية', '3': 'أخرى' };

            const overlay = document.createElement('div');
            overlay.id = 'svf-confirm-modal';
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;' +
                'display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:inherit';

            overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;width:100%;max-width:490px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)">
                <div style="background:linear-gradient(135deg,#d97706,#92400e);padding:16px 20px;color:white;display:flex;align-items:center;justify-content:space-between">
                    <h3 style="margin:0;font-size:16px">تصدير زيارة مدرسية للوزارة</h3>
                    <button id="svf-close" style="background:none;border:none;color:white;font-size:22px;cursor:pointer">×</button>
                </div>
                <div style="padding:16px 20px">
                    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px;color:#92400e">
                        سيتم نقرك لبوابة الوزارة وتعبئة استمارة الزيارة المدرسية تلقائياً بالبيانات التالية:
                    </div>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">
                        <tr><td style="padding:5px 8px;color:#6b7280;width:40%">المدرسة</td>
                            <td style="padding:5px 8px;font-weight:600">${esc(data.school) || '—'}</td></tr>
                        <tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">التاريخ</td>
                            <td style="padding:5px 8px;font-weight:600">${esc(data.date) || '—'}</td></tr>
                        <tr><td style="padding:5px 8px;color:#6b7280">نوع الزيارة</td>
                            <td style="padding:5px 8px;font-weight:600">${esc(typeLabels[data.visitType] || data.visitTypeName)}</td></tr>
                        <tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">وقت الوصول</td>
                            <td style="padding:5px 8px;font-weight:600">${esc(data.arrivalTime)}</td></tr>
                        <tr><td style="padding:5px 8px;color:#6b7280">وقت الانصراف</td>
                            <td style="padding:5px 8px;font-weight:600">${esc(data.departureTime)}</td></tr>
                        <tr style="background:#f9fafb"><td style="padding:5px 8px;color:#6b7280">الأهداف</td>
                            <td style="padding:5px 8px;font-size:11px">${data.objectives.length > 0 ? esc(data.objectives.join(' • ')).slice(0, 80) + '...' : '—'}</td></tr>
                    </table>
                    <div style="display:flex;gap:10px">
                        <button id="svf-go" style="flex:1;background:linear-gradient(135deg,#d97706,#92400e);color:white;border:none;padding:12px;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer">
                            فتح موقع الوزارة والتعبئة التلقائية
                        </button>
                        <button id="svf-close2" style="background:#f1f5f9;border:none;padding:12px 16px;border-radius:10px;font-size:14px;cursor:pointer;color:#475569">إلغاء</button>
                    </div>
                </div>
            </div>`;

            document.body.appendChild(overlay);

            document.getElementById('svf-go').addEventListener('click', () => {
                const json = JSON.stringify(data);
                const b64 = btoa(unescape(encodeURIComponent(json)));
                const url = MOE_MAIN_URL + '#svf=' + b64;
                try { GM_setValue(DATA_KEY, json); } catch (_) {}
                window.open(url, '_blank');
                overlay.remove();
            });
            document.getElementById('svf-close').addEventListener('click', () => overlay.remove());
            document.getElementById('svf-close2').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        }

        function toast(msg, type) {
            if (typeof showToast === 'function') { showToast(msg, type); return; }
            const t = document.createElement('div');
            t.textContent = msg;
            t.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);` +
                `background:${type === 'error' ? '#dc2626' : '#d97706'};color:white;` +
                `padding:12px 24px;border-radius:999px;z-index:99999;font-size:14px;` +
                `box-shadow:0 4px 20px rgba(0,0,0,.3)`;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 3000);
        }

        function initExporter() {
            const btn = findExportButton();
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
    // الجزء الثاني: موقع الوزارة (التعبئة التلقائية مع لوحة متابعة)
    // ═══════════════════════════════════════════════════════════════
    if (location.hostname.includes('moe.gov.om')) {

        const wait = ms => new Promise(r => setTimeout(r, ms));

        function aspNetPostBack(el) {
            if (!el) return false;
            const oc = el.getAttribute('onchange') || '';
            const m = oc.match(/__doPostBack\(['"]([^'"]+)['"]/);
            if (m && typeof __doPostBack === 'function') {
                __doPostBack(m[1], '');
                return true;
            }
            return false;
        }

        function waitForIframe(timeout) {
            return new Promise(resolve => {
                // تحقق فوري
                const iframe = document.getElementById('dialog-bodyAddEditSchoolVisits');
                if (iframe && iframe.contentDocument && iframe.contentDocument.getElementById('ddlVisitTypes')) {
                    resolve(iframe); return;
                }

                const obs = new MutationObserver(() => {
                    const iframe = document.getElementById('dialog-bodyAddEditSchoolVisits');
                    if (iframe && iframe.contentDocument && iframe.contentDocument.getElementById('ddlVisitTypes')) {
                        obs.disconnect(); clearTimeout(timer); resolve(iframe);
                    }
                });
                obs.observe(document.body, { childList: true, subtree: true });

                // أيضاً راقب تحميل الـ iframe نفسه
                const checkInterval = setInterval(() => {
                    const iframe = document.getElementById('dialog-bodyAddEditSchoolVisits');
                    if (iframe && iframe.contentDocument && iframe.contentDocument.getElementById('ddlVisitTypes')) {
                        clearInterval(checkInterval); obs.disconnect(); clearTimeout(timer); resolve(iframe);
                    }
                }, 500);

                const timer = setTimeout(() => {
                    obs.disconnect(); clearInterval(checkInterval);
                    // آخر محاولة
                    const iframe = document.getElementById('dialog-bodyAddEditSchoolVisits');
                    resolve((iframe && iframe.contentDocument) ? iframe : null);
                }, timeout || 15000);
            });
        }

        function setText(id, val) {
            const el = document.getElementById(id);
            if (!el) { log('⚠ عنصر غير موجود: ' + id, 'warn'); return false; }
            el.value = (val || '').slice(0, 4000);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        function setSelect(id, val) {
            const el = document.getElementById(id);
            if (!el) { log('⚠ عنصر غير موجود: ' + id, 'warn'); return false; }
            el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }

        function log(msg, type) {
            type = type || 'info';
            const panel = document.getElementById('svf-log');
            if (panel) {
                const line = document.createElement('div');
                line.className = 'svf-log-' + type;
                line.textContent = new Date().toLocaleTimeString('ar') + ' — ' + msg;
                panel.appendChild(line);
                panel.scrollTop = panel.scrollHeight;
            }
            const method = type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log';
            console[method]('[SVF] ' + msg);
        }

        function setProgress(pct) {
            const bar = document.getElementById('svf-bar');
            if (bar) bar.style.width = pct + '%';
        }

        function setStatus(msg, icon) {
            icon = icon || '⏳';
            const el = document.getElementById('svf-status');
            if (el) el.textContent = icon + ' ' + msg;
        }

        // ── CSS اللوحة ──
        GM_addStyle(`
            #svf-panel {
                position:fixed; top:70px; left:10px; z-index:99999;
                width:300px; background:#1a1207; color:#fef3c7;
                border-radius:12px; box-shadow:0 6px 30px rgba(0,0,0,.6);
                font-family:'Segoe UI',Arial,sans-serif; font-size:13px;
                direction:rtl; overflow:hidden;
            }
            #svf-header {
                background:linear-gradient(135deg,#d97706,#92400e);
                padding:10px 14px; cursor:move;
                display:flex; align-items:center; gap:8px;
            }
            #svf-header h3 { margin:0; font-size:13px; flex:1; }
            #svf-badge {
                background:#fbbf24; color:#78350f; border-radius:20px;
                padding:1px 8px; font-size:10px; font-weight:bold;
            }
            #svf-toggle { cursor:pointer; user-select:none; }
            #svf-body { padding:12px; }
            #svf-data-box {
                background:#1c1408; border:1px solid #92400e; border-radius:8px;
                padding:10px; margin-bottom:10px; font-size:11px;
            }
            #svf-data-box .row {
                display:flex; justify-content:space-between; padding:2px 0;
                border-bottom:1px solid #44403c;
            }
            #svf-data-box .row:last-child { border:none; }
            #svf-data-box .lbl { color:#fbbf24; }
            #svf-data-box .val {
                color:#fff; font-weight:600; max-width:170px;
                overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
            }
            #svf-status {
                background:#0c0a04; border-radius:6px; padding:7px 10px;
                margin-bottom:8px; font-size:11px; color:#fde68a;
            }
            #svf-pbar {
                height:5px; background:#0c0a04; border-radius:3px;
                margin-bottom:10px; overflow:hidden;
            }
            #svf-bar {
                height:100%; width:0%; border-radius:3px;
                background:linear-gradient(90deg,#d97706,#fbbf24);
                transition:width .4s;
            }
            #svf-log {
                background:#0c0a04; border-radius:6px; padding:7px;
                height:120px; overflow-y:auto; font-size:10.5px;
                margin-bottom:10px; line-height:1.7;
            }
            .svf-log-info { color:#93c5fd; }
            .svf-log-warn { color:#fde68a; }
            .svf-log-error { color:#fca5a5; }
            .svf-log-success { color:#6ee7b7; font-weight:bold; }
            .svf-btn {
                width:100%; padding:9px; border:none; border-radius:8px;
                cursor:pointer; font-size:13px; font-weight:bold;
                margin-bottom:6px; transition:all .2s;
            }
            .svf-btn:hover { filter:brightness(1.1); }
            #svf-btn-fill {
                background:linear-gradient(135deg,#d97706,#92400e);
                color:white; font-size:14px; padding:11px;
            }
            #svf-btn-fill:disabled { background:#44403c; color:#78716c; cursor:not-allowed; filter:none; }
            #svf-btn-clear { background:#292524; color:#a8a29e; font-size:11px; }
            #svf-panel.collapsed #svf-body { display:none; }
        `);

        let visitData = null;
        let filling = false;

        function buildPanel(data) {
            if (document.getElementById('svf-panel')) return;

            const hasData = !!data;
            const typeLabels = { '1': 'إشرافية', '2': 'استطلاعية', '3': 'أخرى' };

            const panel = document.createElement('div');
            panel.id = 'svf-panel';
            panel.innerHTML = `
            <div id="svf-header">
                <span>🏫</span>
                <h3>مُعبِّئ الزيارات المدرسية</h3>
                ${hasData ? '<span id="svf-badge">بيانات جاهزة</span>' : ''}
                <span id="svf-toggle">▼</span>
            </div>
            <div id="svf-body">
                ${hasData ? `
                <div id="svf-data-box">
                    <div style="color:#fbbf24;font-weight:bold;margin-bottom:6px;font-size:11px">بيانات الزيارة المدرسية</div>
                    <div class="row"><span class="lbl">المدرسة</span><span class="val">${esc(data.school) || '—'}</span></div>
                    <div class="row"><span class="lbl">التاريخ</span><span class="val">${esc(data.date) || '—'}</span></div>
                    <div class="row"><span class="lbl">نوع الزيارة</span><span class="val">${esc(typeLabels[data.visitType] || data.visitTypeName) || '—'}</span></div>
                    <div class="row"><span class="lbl">الوصول</span><span class="val">${esc(data.arrivalTime)}</span></div>
                    <div class="row"><span class="lbl">الانصراف</span><span class="val">${esc(data.departureTime)}</span></div>
                </div>
                ` : `
                <div style="background:#1c1408;border:1px dashed #44403c;border-radius:8px;padding:12px;text-align:center;color:#78716c;font-size:12px;margin-bottom:10px">
                    لا توجد بيانات — استخدم "تصدير للوزارة" من موقعك
                </div>
                `}
                <div id="svf-status">⏳ ${hasData ? 'انتظر تحميل النموذج ثم اضغط تعبئة تلقائية' : 'في انتظار البيانات'}</div>
                <div id="svf-pbar"><div id="svf-bar"></div></div>
                <div id="svf-log"></div>
                <button class="svf-btn" id="svf-btn-fill" ${!hasData ? 'disabled' : ''}>⚡ تعبئة تلقائية</button>
                <button class="svf-btn" id="svf-btn-clear">🗑 مسح السجل</button>
            </div>`;

            document.body.appendChild(panel);

            if (hasData) {
                document.getElementById('svf-btn-fill').addEventListener('click', () => startFill(data));
            }
            document.getElementById('svf-btn-clear').addEventListener('click', () => {
                const logEl = document.getElementById('svf-log');
                if (logEl) logEl.textContent = '';
            });
            document.getElementById('svf-toggle').addEventListener('click', () => {
                panel.classList.toggle('collapsed');
                document.getElementById('svf-toggle').textContent =
                    panel.classList.contains('collapsed') ? '▲' : '▼';
            });

            // سحب اللوحة
            const header = document.getElementById('svf-header');
            let sx, sy, il, it;
            header.addEventListener('mousedown', e => {
                sx = e.clientX; sy = e.clientY;
                il = panel.offsetLeft; it = panel.offsetTop;
                const move = ev => {
                    panel.style.left = (il + ev.clientX - sx) + 'px';
                    panel.style.top = (it + ev.clientY - sy) + 'px';
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', () => document.removeEventListener('mousemove', move), { once: true });
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // التعبئة التلقائية
        // ═══════════════════════════════════════════════════════════════
        async function startFill(data) {
            if (filling) return;
            filling = true;

            const btn = document.getElementById('svf-btn-fill');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ التعبئة...'; }

            try {
                // ── تحديد أين نعمل: الصفحة الرئيسية أو iframe ──
                // لو نحن في الصفحة الرئيسية (SchoolVisitsMain.aspx)
                const isMainPage = !!document.getElementById('ctl00_content_SchoolFilterCtrl1_ddlZones');

                if (isMainPage) {
                    // اختيار المدرسة من القائمة
                    await stepSelectSchool(data);
                    // ضغط زر عرض
                    await stepClickView();
                    // انتظار ثم ضغط إضافة
                    await wait(3000);
                    await stepClickAdd();
                    // انتظار تحميل iframe
                    setStatus('⏳ انتظار تحميل نموذج الإضافة...', '⏳');
                    log('انتظار تحميل iframe الإضافة...');

                    const iframe = await waitForIframe(15000);
                    if (iframe) {
                        await fillIframeForm(iframe.contentDocument, data);
                    } else {
                        log('⚠ iframe لم يتحمل — جرّب الضغط على تعبئة تلقائية مرة أخرى', 'warn');
                        setStatus('اضغط تعبئة مرة أخرى', '⏳');
                    }
                } else {
                    // نحن داخل صفحة AddEditSchoolVisits.aspx مباشرة
                    await fillFormDirect(data);
                }

            } catch (err) {
                setStatus('خطأ: ' + err.message, '❌');
                log('خطأ: ' + err.message, 'error');
            } finally {
                filling = false;
                if (btn) { btn.disabled = false; btn.textContent = '⚡ تعبئة تلقائية'; }
            }
        }

        function aspNetPostBack(el) {
            if (!el) return false;
            const oc = el.getAttribute('onchange') || '';
            const m = oc.match(/__doPostBack\(['"]([^'"]+)['"]/);
            if (m && typeof __doPostBack === 'function') {
                __doPostBack(m[1], '');
                return true;
            }
            return false;
        }

        async function stepSelectSchool(data) {
            log('خطوة 1: اختيار المدرسة...', 'info');
            setProgress(5);

            // إذا المدرسة محددة مسبقاً في القائمة
            const schoolSel = document.getElementById('ctl00_content_SchoolFilterCtrl1_ddlSchools');
            if (schoolSel && data.school) {
                const target = data.school.trim();
                const opts = Array.from(schoolSel.options);
                const match = opts.find(o => o.text.includes(target));
                if (match) {
                    schoolSel.value = match.value;
                    log('✅ المدرسة: ' + match.text, 'success');
                    setProgress(15);
                    return;
                }
            }

            // المدرسة ليست في القائمة — نحتاج نختار المحافظة أولاً
            log('المدرسة غير محملة بعد — اختيار المحافظة...', 'info');

            // 1) اختيار المحافظة (مسقط)
            const zoneSel = document.getElementById('ctl00_content_SchoolFilterCtrl1_ddlZones');
            if (zoneSel) {
                const zoneOpts = Array.from(zoneSel.options);
                const zoneMatch = zoneOpts.find(o => o.text.includes('مسقط'));
                if (zoneMatch && zoneSel.value !== zoneMatch.value) {
                    zoneSel.value = zoneMatch.value;
                    log('✅ المحافظة: ' + zoneMatch.text, 'success');
                    if (!aspNetPostBack(zoneSel)) {
                        zoneSel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    await wait(5000);
                }
            }

            // 2) اختيار نظام التعليم (أساسي)
            const sysSel = document.getElementById('ctl00_content_SchoolFilterCtrl1_ddlEducationSystems');
            if (sysSel) {
                const sysOpts = Array.from(sysSel.options);
                const sysMatch = sysOpts.find(o => o.text.includes('أساسي'));
                if (sysMatch && sysSel.value !== sysMatch.value) {
                    sysSel.value = sysMatch.value;
                    log('✅ نظام التعليم: أساسي', 'success');
                    if (!aspNetPostBack(sysSel)) {
                        sysSel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    await wait(3000);
                }
            }

            // 3) اختيار الولاية
            const stateSel = document.getElementById('ctl00_content_SchoolFilterCtrl1_ddlStates');
            if (stateSel) {
                const stateOpts = Array.from(stateSel.options);
                const stateMatch = stateOpts.find(o => o.text.includes('السيب') || o.text.includes('السـيب'));
                if (stateMatch && stateSel.value !== stateMatch.value) {
                    stateSel.value = stateMatch.value;
                    log('✅ الولاية: ' + stateMatch.text, 'success');
                    if (!aspNetPostBack(stateSel)) {
                        stateSel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    await wait(3000);
                }
            }

            // 4) الآن نختار المدرسة
            const schoolSel2 = document.getElementById('ctl00_content_SchoolFilterCtrl1_ddlSchools');
            if (schoolSel2 && data.school) {
                const target = data.school.trim();
                const opts = Array.from(schoolSel2.options);
                const match = opts.find(o => o.text.includes(target));
                if (match) {
                    schoolSel2.value = match.value;
                    if (!aspNetPostBack(schoolSel2)) {
                        schoolSel2.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    log('✅ المدرسة: ' + match.text, 'success');
                } else {
                    log('⚠ المدرسة غير موجودة: ' + target, 'warn');
                    // عرض الخيارات المتاحة
                    const avail = opts.slice(1, 6).map(o => o.text).join(' | ');
                    log('خيارات متاحة: ' + avail, 'info');
                }
            }
            await wait(2000);
            setProgress(15);
        }

        async function stepClickView() {
            log('خطوة 2: ضغط عرض...', 'info');
            // زر عرض في ASP.NET يستخدم __doPostBack
            const btns = Array.from(document.querySelectorAll('input[type=button], input[type=submit], button'));
            const viewBtnEl = btns.find(b => (b.value || b.textContent || '').trim() === 'عرض');
            if (viewBtnEl) {
                // جرب __doPostBack أولاً
                const oc = viewBtnEl.getAttribute('onclick') || '';
                const m = oc.match(/__doPostBack\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/);
                if (m && typeof __doPostBack === 'function') {
                    __doPostBack(m[1], m[2]);
                    log('✅ __doPostBack عرض: ' + m[1], 'success');
                } else {
                    viewBtnEl.click();
                    log('✅ click عرض', 'success');
                }
            } else {
                log('⚠ زر عرض غير موجود', 'warn');
            }
            await wait(4000);
            setProgress(25);
        }

        async function stepClickAdd() {
            log('خطوة 3: ضغط إضافة...', 'info');
            // انتظار حتى يظهر زر الإضافة
            let retries = 0;
            let addBtn = null;
            while (retries < 10 && !addBtn) {
                const btns = Array.from(document.querySelectorAll('input[type=button], input[type=submit], button'));
                addBtn = btns.find(b => (b.value || b.textContent || '').trim() === 'إضافة');
                if (!addBtn) {
                    await wait(2000);
                    retries++;
                }
            }
            if (addBtn) {
                const oc = addBtn.getAttribute('onclick') || '';
                const m = oc.match(/__doPostBack\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/);
                if (m && typeof __doPostBack === 'function') {
                    __doPostBack(m[1], m[2]);
                    log('✅ __doPostBack إضافة', 'success');
                } else {
                    addBtn.click();
                    log('✅ تم ضغط زر إضافة', 'success');
                }
            } else {
                log('⚠ زر إضافة لم يظهر بعد 20 ثانية', 'error');
            }
            setProgress(35);
        }

        // التعبئة داخل iframe نموذج الإضافة
        async function fillIframeForm(doc, data) {
            log('━━━ بدء التعبئة التلقائية ━━━', 'info');
            setProgress(40);

            // 1. نوع الزيارة
            setStatus('اختيار نوع الزيارة...', '📝');
            const visitTypeEl = doc.getElementById('ddlVisitTypes');
            if (visitTypeEl) {
                visitTypeEl.value = data.visitType || '1';
                visitTypeEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ نوع الزيارة: ' + (data.visitTypeName || data.visitType), 'success');
            }
            await wait(500);
            setProgress(50);

            // 2. تاريخ الزيارة
            setStatus('ملء التاريخ...', '📅');
            const dateEl = doc.getElementById('tbDate');
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
            const subjectEl = doc.getElementById('txtVisitSubject');
            if (subjectEl && data.objectives && data.objectives.length > 0) {
                const subjectText = data.objectives.join('\n');
                subjectEl.value = subjectText;
                subjectEl.dispatchEvent(new Event('input', { bubbles: true }));
                subjectEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ الموضوع: ' + data.objectives.length + ' أهداف', 'success');
            }
            await wait(300);
            setProgress(65);

            // 4. وقت الوصول
            setStatus('ملء وقت الوصول...', '🕐');
            if (data.arrivalTime) {
                const [hh, mm] = (data.arrivalTime || '08:00').split(':');
                const hour = parseInt(hh, 10);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                const timeVal = String(hour12).padStart(2, '0') + ':' + (mm || '00');

                const arrTimeEl = doc.getElementById('ddlVisitArrivalTime');
                const arrStateEl = doc.getElementById('ddlArrivalTimeState');
                if (arrTimeEl) {
                    // ابحث عن أقرب وقت
                    const opts = Array.from(arrTimeEl.options);
                    const closest = opts.find(o => o.value === timeVal || o.text.includes(timeVal)) ||
                                     opts.find(o => o.text.includes(String(hour12).padStart(2,'0')));
                    if (closest) {
                        arrTimeEl.value = closest.value;
                        arrTimeEl.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
                if (arrStateEl) {
                    arrStateEl.value = ampm;
                    arrStateEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                log('✅ وقت الوصول: ' + data.arrivalTime, 'success');
            }
            await wait(300);
            setProgress(70);

            // 5. وقت الانصراف
            setStatus('ملء وقت الانصراف...', '🕐');
            if (data.departureTime) {
                const [hh, mm] = (data.departureTime || '12:00').split(':');
                const hour = parseInt(hh, 10);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                const timeVal = String(hour12).padStart(2, '0') + ':' + (mm || '00');

                const depTimeEl = doc.getElementById('ddlVisitDepartureTime');
                const depStateEl = doc.getElementById('ddlDepartureTimeState');
                if (depTimeEl) {
                    const opts = Array.from(depTimeEl.options);
                    const closest = opts.find(o => o.value === timeVal || o.text.includes(timeVal)) ||
                                     opts.find(o => o.text.includes(String(hour12).padStart(2,'0')));
                    if (closest) {
                        depTimeEl.value = closest.value;
                        depTimeEl.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
                if (depStateEl) {
                    depStateEl.value = ampm;
                    depStateEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                log('✅ وقت الانصراف: ' + data.departureTime, 'success');
            }
            await wait(300);
            setProgress(80);

            // 6. رأي الزائر
            setStatus('ملء رأي الزائر...', '✍️');
            const opinionEl = doc.getElementById('txtVisitorOpinion');
            if (opinionEl && data.visitorOpinion) {
                opinionEl.value = data.visitorOpinion;
                opinionEl.dispatchEvent(new Event('input', { bubbles: true }));
                opinionEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ رأي الزائر: ' + data.visitorOpinion.slice(0, 40) + '...', 'success');
            }
            await wait(300);
            setProgress(90);

            // 7. التوصيات
            setStatus('ملء التوصيات...', '✍️');
            const recEl = doc.getElementById('txtVisitorRecomendation');
            if (recEl && data.recommendations) {
                recEl.value = data.recommendations;
                recEl.dispatchEvent(new Event('input', { bubbles: true }));
                recEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ التوصيات: ' + data.recommendations.slice(0, 40) + '...', 'success');
            }
            setProgress(100);

            // ── اكتمل ──
            setStatus('تمت التعبئة التلقائية — احفظ يدوياً', '✅');
            log('━━━ اكتملت التعبئة التلقائية! ━━━', 'success');
            log('راجع البيانات ثم اضغط زر الحفظ في النموذج', 'warn');

            GM_deleteValue(DATA_KEY);
        }

        // التعبئة المباشرة (لو فتحنا AddEditSchoolVisits.aspx مباشرة)
        async function fillFormDirect(data) {
            log('━━━ تعبئة مباشرة (صفحة الإضافة) ━━━', 'info');
            setProgress(40);

            // نوع الزيارة
            const visitTypeEl = document.getElementById('ddlVisitTypes');
            if (visitTypeEl) {
                visitTypeEl.value = data.visitType || '1';
                visitTypeEl.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ نوع الزيارة', 'success');
            }
            setProgress(50);

            // التاريخ
            if (data.date) {
                const dateEl = document.getElementById('tbDate');
                if (dateEl) {
                    dateEl.value = data.date;
                    dateEl.dispatchEvent(new Event('input', { bubbles: true }));
                    dateEl.dispatchEvent(new Event('change', { bubbles: true }));
                    log('✅ التاريخ: ' + data.date, 'success');
                }
            }
            setProgress(55);

            // الموضوع
            if (data.objectives && data.objectives.length > 0) {
                const subjectEl = document.getElementById('txtVisitSubject');
                if (subjectEl) {
                    subjectEl.value = data.objectives.join('\n');
                    subjectEl.dispatchEvent(new Event('input', { bubbles: true }));
                    log('✅ الموضوع', 'success');
                }
            }
            setProgress(65);

            // أوقات
            if (data.arrivalTime) {
                const [hh, mm] = data.arrivalTime.split(':');
                const hour = parseInt(hh, 10);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                const timeVal = String(hour12).padStart(2, '0') + ':' + (mm || '00');

                const arrTimeEl = document.getElementById('ddlVisitArrivalTime');
                const arrStateEl = document.getElementById('ddlArrivalTimeState');
                if (arrTimeEl) {
                    const opts = Array.from(arrTimeEl.options);
                    const closest = opts.find(o => o.value === timeVal || o.text.includes(timeVal));
                    if (closest) { arrTimeEl.value = closest.value; arrTimeEl.dispatchEvent(new Event('change', { bubbles: true })); }
                }
                if (arrStateEl) { arrStateEl.value = ampm; arrStateEl.dispatchEvent(new Event('change', { bubbles: true })); }
                log('✅ وقت الوصول', 'success');
            }

            if (data.departureTime) {
                const [hh, mm] = data.departureTime.split(':');
                const hour = parseInt(hh, 10);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                const timeVal = String(hour12).padStart(2, '0') + ':' + (mm || '00');

                const depTimeEl = document.getElementById('ddlVisitDepartureTime');
                const depStateEl = document.getElementById('ddlDepartureTimeState');
                if (depTimeEl) {
                    const opts = Array.from(depTimeEl.options);
                    const closest = opts.find(o => o.value === timeVal || o.text.includes(timeVal));
                    if (closest) { depTimeEl.value = closest.value; depTimeEl.dispatchEvent(new Event('change', { bubbles: true })); }
                }
                if (depStateEl) { depStateEl.value = ampm; depStateEl.dispatchEvent(new Event('change', { bubbles: true })); }
                log('✅ وقت الانصراف', 'success');
            }
            setProgress(80);

            // رأي الزائر
            if (data.visitorOpinion) {
                const opinionEl = document.getElementById('txtVisitorOpinion');
                if (opinionEl) {
                    opinionEl.value = data.visitorOpinion;
                    opinionEl.dispatchEvent(new Event('input', { bubbles: true }));
                    log('✅ رأي الزائر', 'success');
                }
            }
            setProgress(90);

            // التوصيات
            if (data.recommendations) {
                const recEl = document.getElementById('txtVisitorRecomendation');
                if (recEl) {
                    recEl.value = data.recommendations;
                    recEl.dispatchEvent(new Event('input', { bubbles: true }));
                    log('✅ التوصيات', 'success');
                }
            }
            setProgress(100);

            setStatus('تمت التعبئة التلقائية — احفظ يدوياً', '✅');
            log('━━━ اكتملت التعبئة! راجع واحفظ ━━━', 'success');

            GM_deleteValue(DATA_KEY);
        }

        // ── اختصار ──
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                if (visitData) startFill(visitData);
            }
        });

        // ── التهيئة ──
        window.addEventListener('load', () => {
            setTimeout(() => {
                // 1) قراءة البيانات من hash الرابط
                try {
                    const m = location.hash.match(/#svf=([A-Za-z0-9+/=]+)/);
                    if (m) {
                        const json = decodeURIComponent(escape(atob(m[1])));
                        visitData = JSON.parse(json);
                        try { GM_setValue(DATA_KEY, json); } catch (_) {}
                        history.replaceState(null, '', location.pathname + location.search);
                    }
                } catch (_) {}

                // 2) من تخزين Tampermonkey
                if (!visitData) {
                    try {
                        const raw = GM_getValue(DATA_KEY, '');
                        if (raw) visitData = JSON.parse(raw);
                    } catch (_) {}
                }

                buildPanel(visitData);

                if (visitData) {
                    log('تم استيراد البيانات من موقع المشرف', 'success');
                    log('المدرسة: ' + (visitData.school || '—'), 'info');
                    log('التاريخ: ' + (visitData.date || '—'), 'info');
                    log('نوع الزيارة: ' + (visitData.visitTypeName || visitData.visitType), 'info');
                    log('', 'info');
                    log('━━━ خطوات ━━━', 'info');
                    log('1️⃣ اختر المدرسة من القائمة (تلقائي)', 'info');
                    log('2️⃣ اضغط عرض ثم إضافة (تلقائي)', 'info');
                    log('3️⃣ تعبئة النموذج (تلقائي)', 'info');
                    log('4️⃣ احفظ يدوياً ⚠️', 'warn');
                    log('', 'info');
                    log('اضغط ⚡ تعبئة تلقائية للبدء', 'info');
                } else {
                    log('لا توجد بيانات — استخدم "تصدير للوزارة" من موقعك', 'warn');
                }
            }, 2000);
        });
    }

})();