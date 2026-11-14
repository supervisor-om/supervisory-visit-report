// ==UserScript==
// @name         استيراد تحضير نور إلى عين المشرف
// @namespace    https://supervisor-mct.com/
// @version      2.1.0
// @description  يقرأ التحضير المفتوح في نور ويرسله إلى الاستمارة التي طلبته.
// @match        https://lms.moe.gov.om/*
// @match        https://supervisor-mct.com/reports.html
// @updateURL    https://supervisor-mct.com/tools/noor-eye.user.js
// @downloadURL  https://supervisor-mct.com/tools/noor-eye.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @noframes
// @run-at       document-start
// ==/UserScript==

(() => {
    'use strict';


    const noor = 'https://lms.moe.gov.om';
    const eye = 'https://supervisor-mct.com';
    const prefix = 'svf-noor-v2:';
    const lifetime = 5 * 60 * 1000;
    const pendingRequest = prefix + 'active-request';
    const token = /^[a-z0-9-]{36}$/i;
    const eventName = 'svf:noor-preparation';
    const cancelName = 'svf:noor-cancel';
    const detailPath = /^\/tsupv\/courses\/view_preparation\/[A-Za-z0-9_-]+(?:\/cid:[A-Za-z0-9_-]+)?\/?$/;
    const normalize = text => text.normalize('NFKC').replace(/[\u0640\u064B-\u065F\u0670]/g, '').trim();
    const read = (element, limit = 250) => (element?.innerText || '').trim().slice(0, limit);

    const labels = new Map([
        ['الهدف', 'goal'], ['المخرجات التعليمية', 'outcomes'],
        ['التهيئة / التمهيد / التعلم القبلي', 'intro'],
        ['إجراءات سير الدرس / الأنشطة التدريسية', 'activities'],
        ['الاستراتيجيات', 'strategies'], ['المصادر التعليمية', 'resources'],
        ['التقويم التكويني', 'formative'], ['التقويم الختامي', 'summative']
    ]);

    function readLesson() {
        const heading = document.querySelector('#content_wrapper .title_container');
        const title = read(heading?.querySelector('h2'));
        const teacher = Array.from(heading?.querySelectorAll('h5') || [])
            .map(node => read(node))
            .find(text => /^المعلم(?:ة)?\s*:/.test(normalize(text)));
        const school = read(document.getElementById('chat-link')).replace(/^[^\p{L}]+|[^\p{L}\p{N})]+$/gu, '');
        const fields = {};
        document.querySelectorAll('#content_wrapper .view-preparation-widget').forEach(widget => {
            const label = normalize(read(widget.querySelector('.widget-header h3')));
            const field = labels.get(label);
            if (!field) return;
            const text = read(widget.querySelector('.widget-body'), 4000);
            if (text && !/^لا (توجد|يوجد) بيانات(?: متاحة)?[.؟]?$/.test(normalize(text))) fields[field] = text;
        });

        return title && teacher && school && Object.keys(fields).length
            ? { title, teacher: teacher.split(':').slice(1).join(':').trim(), school, fields }
            : null;
    }

    function noorSession() {
        let id;
        try {
            const fromEye = new URLSearchParams(location.hash.slice(1)).get('svf-noor');
            if (token.test(fromEye || '')) {
                sessionStorage.setItem(prefix, fromEye);
                // Keep Noor's ordinary navigation and hash handling after linking the tab.
                history.replaceState(history.state, '', location.pathname + location.search);
            }
            id = sessionStorage.getItem(prefix);
        } catch { return null; }
        return id;
    }

    function noorPage(id) {
        const linked = token.test(id || '');
        if (!linked && !detailPath.test(location.pathname)) return;

        const banner = document.createElement('aside');
        const status = document.createElement('span');
        const send = document.createElement('button');
        banner.dir = 'rtl';
        banner.style.cssText = 'position:fixed;z-index:1050;bottom:12px;inset-inline:12px;margin:auto;max-width:38rem;background:#eff6ff;color:#102a43;border:1px solid #93c5fd;border-radius:12px;padding:12px;box-shadow:0 3px 16px #0002;';
        status.setAttribute('role', 'status');
        send.type = 'button';
        send.className = 'btn btn-primary';
        send.textContent = 'إرسال هذا التحضير إلى عين المشرف';
        send.hidden = true;
        banner.append(status, send);

        let lastPath = '', delivered = false, attempts = 0;
        const requestKey = request => prefix + request + ':request';
        async function valid(request) {
            return token.test(request || '') && Number(await GM_getValue(requestKey(request), 0)) > Date.now();
        }

        async function deliver(request) {
            if (!detailPath.test(location.pathname) || !(await valid(request))) return false;
            const lesson = readLesson();
            if (!lesson || !(await valid(request))) return false;
            const out = prefix + request + ':lesson';
            const sentAt = Date.now();
            await GM_setValue(out, { lesson, sentAt });
            const expires = Number(await GM_getValue(requestKey(request), 0));
            setTimeout(async () => {
                try { if ((await GM_getValue(out, null))?.sentAt === sentAt) await GM_deleteValue(out); } catch { /* ربما حُذفت بالفعل. */ }
            }, Math.max(0, expires - Date.now()));
            status.textContent = 'أُرسل التحضير. ارجع إلى تبويب عين المشرف لمراجعة المطابقة واعتماد الشواهد.';
            send.hidden = true;
            return true;
        }

        send.addEventListener('click', async event => {
            if (!event.isTrusted || delivered) return;
            send.disabled = true;
            try {
                // If Noor opened the details in a new tab, recover only on an explicit click.
                const current = await GM_getValue(pendingRequest, null);
                delivered = await deliver(current);
                if (!delivered) status.textContent = 'تعذّر إرسال التحضير. تأكّد أن طلب السحب ما زال مفتوحًا في عين المشرف.';
            } catch {
                status.textContent = 'تعذّر الاتصال بسكربت الربط.';
            } finally { send.disabled = false; }
        });

        const inspect = async () => {
            try {
                const request = linked ? id : await GM_getValue(pendingRequest, null);
                if (!(await valid(request))) {
                    if (linked && attempts++ < 5) setTimeout(inspect, 700);
                    else if (linked) {
                        sessionStorage.removeItem(prefix);
                        if (!delivered) status.textContent = 'انتهى طلب السحب. ارجع إلى عين المشرف لبدء طلب جديد.';
                    }
                    return;
                }
                if (!banner.isConnected) document.body.append(banner);
                const currentPath = location.pathname;
                if (lastPath !== currentPath) {
                    delivered = false;
                    lastPath = currentPath;
                }
                if (detailPath.test(currentPath)) {
                    if (linked && !delivered) delivered = await deliver(request);
                    if (!delivered) {
                        status.textContent = linked ? 'جارٍ قراءة التحضير المفتوح…' : 'يوجد طلب سحب مفتوح في عين المشرف. تأكد من اسم المعلم والحصة.';
                        send.hidden = linked;
                    }
                } else {
                    status.textContent = 'طلب سحب التحضير نشط. من قائمة المعلمين ابحث باسم المعلم، ثم اختر «عرض التحاضير» وافتح التحضير المطلوب.';
                    send.hidden = true;
                }
                setTimeout(inspect, 1200);
            } catch {
                status.textContent = 'تعذّر الاتصال بسكربت الربط. أعد طلب السحب من عين المشرف.';
            }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => inspect(), { once: true });
        else inspect();
    }

    function eyePage() {
        if (location.pathname !== '/reports.html' || new URLSearchParams(location.search).has('demo')) return;
        const button = document.getElementById('noorImportPrepared');
        if (!button) return;
        let active = null;
        button.dataset.noorBridge = '2.1';
        const notify = (data, accept = false) => !button.dispatchEvent(new CustomEvent(eventName, {
            detail: JSON.stringify(data), cancelable: accept
        }));

        async function cleanup() {
            const prev = active;
            active = null;
            if (!prev) return;
            clearTimeout(prev.timer);
            await GM_deleteValue(prev.req);
            await GM_deleteValue(prev.out);
            if ((await GM_getValue(pendingRequest, null)) === prev.id) await GM_deleteValue(pendingRequest);
        }

        async function poll(state) {
            if (active !== state) return;
            try {
                if (Date.now() >= state.expires) {
                    await cleanup();
                    notify({ error: 'انتهت مهلة السحب. اضغط «اسحب التحضير من نور» مجددًا.', done: true });
                    return;
                }
                const result = await GM_getValue(state.out, null);
                if (active !== state) return;
                if (result && result.sentAt >= state.started && result.sentAt < state.expires) {
                    await GM_deleteValue(state.out);
                    if (active !== state) return;
                    if (notify(result, true)) { await cleanup(); return; }
                }
                if (active === state) state.timer = setTimeout(() => poll(state), 800);
            } catch {
                if (active !== state) return;
                await cleanup().catch(() => {});
                notify({ error: 'تعذّر الاتصال بسكربت ربط نور. أعد المحاولة.', done: true });
            }
        }

        button.addEventListener(cancelName, () => { cleanup().catch(() => {}); });
        button.addEventListener('click', event => {
            if (!event.isTrusted || button.closest('#noorImportPanel')?.hidden) return;
            // Let the form validate the current visit before opening Noor.
            const ready = !button.dispatchEvent(new CustomEvent('svf:noor-request', { cancelable: true }));
            if (!ready) return;
            const id = crypto.randomUUID();
            const started = Date.now();
            const state = { id, req: prefix + id + ':request', out: prefix + id + ':lesson', started, expires: started + lifetime };
            const value = document.getElementById('noorDetailUrl')?.value.trim() || noor + '/tsupv';
            let url;
            try { url = new URL(value); } catch { return; }
            if (url.origin !== noor || url.username || url.password ||
                (url.pathname !== '/tsupv' && !detailPath.test(url.pathname))) return;
            url.search = '';
            url.hash = 'svf-noor=' + id;
            window.open(url.href, '_blank', 'noopener,noreferrer');
            const previous = cleanup();
            active = state;
            previous.then(async () => {
                await GM_setValue(state.req, state.expires);
                if (active !== state) { await GM_deleteValue(state.req); return; }
                await GM_setValue(pendingRequest, id);
                if (active === state) poll(state);
            }).catch(() => {
                if (active !== state) return;
                active = null;
                notify({ error: 'تعذّر بدء السحب. تحقق من صلاحيات سكربت الربط.', done: true });
            });
        });
    }

    if (location.origin === noor) {
        const id = noorSession();
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => noorPage(id), { once: true });
        else noorPage(id);
    }
    else if (location.origin === eye) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', eyePage, { once: true });
        else eyePage();
    }
})();
