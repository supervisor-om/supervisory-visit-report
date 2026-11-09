// ==UserScript==
// @name         استيراد تحضير نور إلى عين المشرف
// @namespace    https://supervisor-mct.com/
// @version      1.0.0
// @description  يجهّز التحضير المفتوح في نور وينقله إلى الزيارة عند طلب المشرف.
// @match        https://lms.moe.gov.om/tsupv/courses/view_preparation/*
// @match        https://supervisor-mct.com/reports.html
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @noframes
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const key = 'svf-noor-preparation-v1';
    const lifetime = 5 * 60 * 1000;
    const eventName = 'svf:noor-preparation';
    const normalize = text => text.normalize('NFKC').replace(/[\u0640\u064B-\u065F\u0670]/g, '').trim();
    const read = (element, limit = 250) => (element?.innerText || '').trim().slice(0, limit);

    if (location.origin === 'https://lms.moe.gov.om') {
        const heading = document.querySelector('#content_wrapper .title_container');
        if (!heading || document.getElementById('svfStageNoor')) return;

        const labels = new Map([
            ['الهدف', 'goal'], ['المخرجات التعليمية', 'outcomes'],
            ['التهيئة / التمهيد / التعلم القبلي', 'intro'],
            ['إجراءات سير الدرس / الأنشطة التدريسية', 'activities'],
            ['الاستراتيجيات', 'strategies'], ['المصادر التعليمية', 'resources'],
            ['التقويم التكويني', 'formative'], ['التقويم الختامي', 'summative']
        ]);
        const button = document.createElement('button');
        button.id = 'svfStageNoor';
        button.type = 'button';
        button.className = 'btn btn-primary';
        button.textContent = 'جهّز هذا التحضير لعين المشرف';
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        button.addEventListener('click', async event => {
            if (!event.isTrusted) return;
            const title = read(heading.querySelector('h2'));
            const teacher = Array.from(heading.querySelectorAll('h5'))
                .map(node => read(node))
                .find(text => /^المعلم\s*:/.test(normalize(text)));
            const school = read(document.getElementById('chat-link')).replace(/^[^\p{L}]+|[^\p{L}\p{N})]+$/gu, '');
            const fields = {};
            document.querySelectorAll('#content_wrapper .view-preparation-widget').forEach(widget => {
                const label = normalize(read(widget.querySelector('.widget-header h3')));
                const field = labels.get(label);
                if (!field) return;
                const text = read(widget.querySelector('.widget-body'), 4000);
                if (text && !/^لا (توجد|يوجد) بيانات(?: متاحة)?[.؟]?$/.test(normalize(text))) fields[field] = text;
            });
            if (!title || !teacher || !Object.keys(fields).length) {
                status.textContent = 'تعذّرت قراءة التحضير. افتح صفحة «عرض التحضير» مرة أخرى.';
                return;
            }
            button.disabled = true;
            try {
                const preparedAt = Date.now();
                await GM_setValue(key, { preparedAt, lesson: { title, teacher: teacher.split(':').slice(1).join(':').trim(), school, fields } });
                status.textContent = 'التحضير جاهز لمدة خمس دقائق. ارجع إلى عين المشرف واضغط «استيراد التحضير المجهّز».';
                setTimeout(async () => {
                    try {
                        if ((await GM_getValue(key, null))?.preparedAt === preparedAt) await GM_deleteValue(key);
                    } catch { /* يتحقق زر الاستيراد من الصلاحية أيضاً. */ }
                }, lifetime);
            } catch {
                status.textContent = 'تعذّر تجهيز التحضير. حاول مرة أخرى.';
            } finally {
                button.disabled = false;
            }
        });
        heading.append(button, status);
        return;
    }

    if (location.origin !== 'https://supervisor-mct.com' || location.pathname !== '/reports.html' || location.search) return;
    const button = document.getElementById('noorImportPrepared');
    if (!button) return;
    button.dataset.noorBridge = 'ready';
    button.addEventListener('click', async event => {
        if (!event.isTrusted || button.closest('#noorImportPanel')?.hidden) return;
        const respond = data => button.dispatchEvent(new CustomEvent(eventName, { detail: JSON.stringify(data) }));
        button.disabled = true;
        try {
            const staged = await GM_getValue(key, null);
            if (!staged || !Number.isFinite(staged.preparedAt) || Date.now() - staged.preparedAt > lifetime) {
                if (staged) await GM_deleteValue(key);
                respond({ error: 'افتح التحضير في نور واضغط «جهّز هذا التحضير لعين المشرف» أولاً.' });
                return;
            }
            await GM_deleteValue(key);
            respond({ lesson: staged.lesson });
        } catch {
            respond({ error: 'تعذّر استيراد التحضير. جهّزه مرة أخرى في نور.' });
        } finally {
            button.disabled = false;
        }
    });
})();
