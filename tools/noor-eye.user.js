// ==UserScript==
// @name         استيراد تحضير نور إلى عين المشرف
// @namespace    https://supervisor-mct.com/
// @version      2.2.0
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

    const listPath = /^\/tsupv\/courses\/preparations_index(?:\/[A-Za-z0-9:_-]+)*\/?$/;
    const fold = value => normalize(value || '').toLowerCase().replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[٠-٩۰-۹]/g, ch => String(ch.charCodeAt(0) - (ch <= '٩' ? 0x660 : 0x6f0)))
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const searchLabel = /^(بحث|ابحث|search|filter)$/i;

    function sameTeacher(expected, actual) {
        const a = fold(expected).split(' '), b = fold(actual).split(' ');
        return a.length >= 2 && b.length >= 2 && a[0] === b[0] && a.at(-1) === b.at(-1) &&
            (a.every(word => b.includes(word)) || b.every(word => a.includes(word)));
    }

    function sameSchool(expected, actual) {
        const filter = value => fold(value).split(' ').filter(word => word && !['مدرسه', 'بن', 'ابن'].includes(word));
        const words = filter(expected);
        return !!words.length && words.every(word => filter(actual).includes(word));
    }

    function safeHref(anchor, allowedPath) {
        try {
            const href = anchor.getAttribute('href');
            if (!href || href.startsWith('#')) return null;
            const u = new URL(href, location.href);
            return u.origin === noor && !u.username && !u.password && allowedPath.test(u.pathname) ? u : null;
        } catch { return null; }
    }

    function onlyLinks(container, allowedPath) {
        return [...new Map([...container.querySelectorAll('a[href]')].map(a => safeHref(a, allowedPath))
            .filter(Boolean).map(url => [url.href, url])).values()];
    }

    function noorRows() {
        return [...document.querySelectorAll('table tbody tr')].map(row => ({ row, cells: [...row.cells].map(cell => read(cell, 1000)) }))
            .filter(r => r.cells.length >= 2);
    }

    function findTeacherRows(visit, rows) {
        return rows.filter(({ cells }) => cells.some(value => sameTeacher(visit.teacher, value)) &&
            cells.some(value => sameSchool(visit.school, value)));
    }

    function isoDay(value) {
        const numbers = fold(value).match(/\b\d+\b/g);
        if (!numbers || numbers.length !== 3) return '';
        const [a, b, c] = numbers;
        const parts = a.length === 4 ? [a, b, c] : c.length === 4 ? [c, b, a] : [];
        return parts.length ? [parts[0], parts[1].padStart(2, '0'), parts[2].padStart(2, '0')].join('-') : '';
    }

    const ordinals = [
        ['الاول', 'الاولي'], ['الثاني', 'الثانيه'], ['الثالث', 'الثالثه'], ['الرابع', 'الرابعه'],
        ['الخامس', 'الخامسه'], ['السادس', 'السادسه'], ['السابع', 'السابعه'], ['الثامن', 'الثامنه'],
        ['التاسع', 'التاسعه'], ['العاشر', 'العاشره'], ['الحادي عشر', 'الحاديه عشره'], ['الثاني عشر', 'الثانيه عشره']
    ];
    function ordinal(value) {
        const cleaned = fold(value).replace(/^(الصف|صف|الحصه|حصه|الفتره|فتره|class|grade|period)\s+/, '');
        const ranked = ordinals.findLastIndex(names => names.some(name => cleaned === name || cleaned.startsWith(name + ' ')));
        if (ranked !== -1) return ranked + 1;
        const n = /^\d{1,2}(?: |$)/.exec(cleaned);
        return n ? Number(n[0]) : null;
    }

    function headerFields(row) {
        const headers = [...(row.closest('table')?.tHead?.rows?.[0]?.cells || [])].map(cell => fold(read(cell)));
        const field = pattern => headers.findIndex(text => pattern.test(text));
        return {
            title: field(/العنوان|عنوان التحضير|اسم التحضير|title/),
            subject: field(/^(الماده|اسم الماده|course|subject)$/),
            grade: field(/^(الصف|المرحله|class|grade)$/),
            date: field(/تاريخ النشر|تاريخ التحضير|^التاريخ$|publication date|^date$/),
            period: field(/الفتره|رقم الحصه|period/)
        };
    }

    function preparationMatch(visit, row, cells) {
        const fields = headerFields(row);
        const header = name => cells[fields[name]] || '';
        const title = fold(visit.topic);
        const titled = !!title && (fields.title >= 0 ? fold(header('title')) === title : cells.some(v => fold(v) === title));
        const dates = fields.date >= 0 ? [isoDay(header('date'))] : cells.map(isoDay);
        if (!dates.includes(visit.date)) return false;
        const subject = fold(visit.subject);
        if (fields.subject >= 0) {
            const actual = fold(header('subject'));
            const sports = value => /^(الرياضه|الرياضه المدرسيه|التربيه الرياضيه|التربيه البدنيه)$/.test(value);
            if (actual !== subject && !(sports(actual) && sports(subject))) return false;
        } else if (!titled && !cells.some(v => fold(v) === subject)) return false;
        if (fields.grade >= 0) {
            const expected = ordinal(visit.grade), actual = ordinal(header('grade'));
            if (expected && actual ? expected !== actual : fold(header('grade')) !== fold(visit.grade)) return false;
        }
        if (fields.period >= 0) {
            const expected = ordinal(visit.period), actual = ordinal(header('period'));
            if (expected && actual ? expected !== actual : fold(header('period')) !== fold(visit.period)) return false;
        }
        // A title can distinguish a lesson when the table has no period column.
        return title ? titled : fields.grade >= 0 && fields.subject >= 0 && fields.period >= 0;
    }

    function searchTeacher(visit) {
        const inputs = [...document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])')];
        const fields = inputs.filter(input => input.getClientRects().length &&
            /اسم المعلم|اكتب الاسم|teacher name|^name$/i.test(fold([
                input.placeholder, input.getAttribute('aria-label'), ...[...(input.labels || [])].map(label => read(label))
            ].filter(Boolean).join(' '))));
        if (fields.length !== 1 || !fields[0].form) return false;
        const input = fields[0], form = input.form;
        const actions = [...form.querySelectorAll('button, input[type="submit"]')].filter(button =>
            button.getClientRects().length && !button.disabled && searchLabel.test(fold(read(button) || button.value)));
        if (actions.length !== 1) return null;
        return () => {
            input.value = visit.teacher;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            actions[0].click();
        };
    }

    function autoStep(visit, attempted) {
        const rows = noorRows();
        if (listPath.test(location.pathname)) {
            const possible = rows.filter(({ row, cells }) => preparationMatch(visit, row, cells));
            const urls = [...new Map(possible.flatMap(({ row }) => onlyLinks(row, detailPath)).map(url => [url.href, url])).values()];
            if (urls.length === 1) return { url: urls[0], status: 'عُثر على التحضير المطابق. جارٍ فتحه…' };
            if (urls.length > 1) return { status: 'نور يعرض أكثر من تحضير مطابق. أضف عنوان الدرس أو افتح التحضير المطلوب.' };
            return { status: 'لم يظهر تحضير يطابق بيانات الحصة. تحقّق من التاريخ وعنوان الدرس وأكمل من قائمة التحاضير عند الحاجة.' };
        }
        if (!/^\/tsupv\/?$/.test(location.pathname)) return {};
        const matched = findTeacherRows(visit, rows);
        if (matched.length === 1) {
            const urls = onlyLinks(matched[0].row, listPath);
            if (urls.length === 1) return { url: urls[0], status: 'عُثر على المعلم. جارٍ فتح قائمة تحاضيره…' };
            return { status: 'عُثر على المعلم، وتعذّر تحديد رابط «عرض التحاضير» من الصفحة.' };
        }
        if (matched.length > 1) return { status: 'نور يعرض أكثر من معلم مطابق. استخدم الاسم الكامل والمدرسة في الاستمارة.' };
        const search = !attempted && searchTeacher(visit);
        if (search) return { search, status: 'جارٍ البحث عن المعلم في نور…' };
        return { status: 'بانتظار قائمة المعلمين أو نتائج البحث. تأكّد من تسجيل الدخول بحساب المشرف.' };
    }

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
        const searchKey = prefix + id + ':searched';
        let progress = '';
        async function showProgress(text) {
            status.textContent = text;
            if (linked && progress !== text && await valid(id)) {
                progress = text;
                await GM_setValue(prefix + id + ':progress', text);
            }
        }
        async function valid(request) {
            if (!token.test(request || '')) return null;
            const data = await GM_getValue(requestKey(request), null);
            return data?.expires > Date.now() ? data : null;
        }

        async function deliver(request) {
            if (!detailPath.test(location.pathname) || !(await valid(request))) return false;
            const lesson = readLesson();
            if (!lesson || !(await valid(request))) return false;
            const out = prefix + request + ':lesson';
            const sentAt = Date.now();
            await GM_setValue(out, { lesson, sentAt });
            const expires = (await valid(request))?.expires || 0;
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
                const job = await valid(request);
                if (!job) {
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
                    send.hidden = true;
                    const step = linked && job.visit ? autoStep(job.visit, sessionStorage.getItem(searchKey) === '1') : {};
                    await showProgress(step.status || 'طلب سحب التحضير نشط. افتح صفحة المشرف في نور.');
                    if (step.search) {
                        sessionStorage.setItem(searchKey, '1');
                        step.search();
                    }
                    if (step.url) {
                        location.assign(step.url.href);
                        return;
                    }
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
        button.dataset.noorBridge = '2.2';
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
            await GM_deleteValue(prev.progress);
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
                } else {
                    const progress = await GM_getValue(state.progress, '');
                    if (active !== state) return;
                    if (progress && state.lastProgress !== progress) {
                        state.lastProgress = progress;
                        notify({ progress });
                    }
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
            const state = { id, req: prefix + id + ':request', out: prefix + id + ':lesson', progress: prefix + id + ':progress',
                started, expires: started + lifetime };
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
            const [teacher, school, subject, grade, date, period, topic] = ['teacherName', 'school', 'subject', 'class', 'visitDate', 'lesson', 'topic']
                .map(field => (document.getElementById(field)?.value || '').trim());
            const visit = { teacher, school, subject, grade, date, period, topic };
            previous.then(async () => {
                await GM_setValue(state.req, { expires: state.expires, visit });
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
