// ==UserScript==
// @name         استيراد تحضير نور إلى عين المشرف
// @namespace    https://supervisor-mct.com/
// @version      2.0.0
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
    const freshness = 30 * 1000;
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

    function noorPage() {
        let id;
        try {
            const fromEye = new URLSearchParams(location.hash.slice(1)).get('svf-noor');
            if (token.test(fromEye || '')) {
                sessionStorage.setItem(prefix, fromEye);
                // Keep Noor's ordinary navigation and hash handling after linking the tab.
                history.replaceState(history.state, '', location.pathname + location.search);
            }
            id = sessionStorage.getItem(prefix);
        } catch { return; }
        if (!token.test(id || '') || !detailPath.test(location.pathname)) return;

        const req = prefix + id + ':request', out = prefix + id + ':lesson';
        const inspect = async (attempt = 0) => {
            try {
                const expires = Number(await GM_getValue(req, 0));
                if (Date.now() >= expires) {
                    if (!expires && attempt < 4) setTimeout(() => inspect(attempt + 1), 700);
                    else sessionStorage.removeItem(prefix);
                    return;
                }
                const lesson = readLesson();
                if (!lesson && attempt < 5) { setTimeout(() => inspect(attempt + 1), 700); return; }
                const sentAt = Date.now();
                const result = lesson ? { lesson, sentAt } : {
                    error: 'تعذّرت قراءة التحضير. افتح صفحة عرض التحضير داخل التبويب نفسه.', sentAt
                };
                // The visit may have been cancelled while Noor was loading.
                if (Number(await GM_getValue(req, 0)) <= Date.now()) return;
                await GM_setValue(out, result);
                setTimeout(async () => {
                    try { if ((await GM_getValue(out, null))?.sentAt === sentAt) await GM_deleteValue(out); } catch { /* قد يكون المستقبِل حذف الردّ. */ }
                }, freshness);
            } catch { /* يمكن إعادة السحب من العين. */ }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => inspect(), { once: true });
        else inspect();
    }

    function eyePage() {
        if (location.pathname !== '/reports.html' || new URLSearchParams(location.search).has('demo')) return;
        const button = document.getElementById('noorImportPrepared');
        if (!button) return;
        let active = null;
        button.dataset.noorBridge = '2';
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
                if (result && result.sentAt >= state.started && Date.now() - result.sentAt <= freshness) {
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
            const state = { req: prefix + id + ':request', out: prefix + id + ':lesson', started, expires: started + lifetime };
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
            previous.then(() => GM_setValue(state.req, state.expires)).then(() => {
                if (active === state) poll(state);
                else return GM_deleteValue(state.req);
            }).catch(() => {
                if (active !== state) return;
                active = null;
                notify({ error: 'تعذّر بدء السحب. تحقق من صلاحيات سكربت الربط.', done: true });
            });
        });
    }

    if (location.origin === noor) noorPage();
    else if (location.origin === eye) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', eyePage, { once: true });
        else eyePage();
    }
})();
