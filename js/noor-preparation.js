(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const panel = $('noorImportPanel');
    if (!panel) return;
    const status = $('noorImportStatus');
    const preview = $('noorImportPreview');
    const saved = $('noorEvidenceData');
    const importButton = $('noorImportPrepared');
    const cancelButton = $('noorCancelImport');
    const confirm = $('noorConfirmMatch');
    const visitFields = ['teacherName', 'school', 'subject', 'class', 'visitDate', 'lesson', 'topic'];
    const groups = [
        { id: 6, title: 'التخطيط لتحقيق نواتج التعلم', fields: [['goal', 'الهدف'], ['outcomes', 'المخرجات التعليمية'], ['intro', 'التهيئة'], ['activities', 'إجراءات الدرس']] },
        { id: 8, title: 'استراتيجيات التدريس', fields: [['strategies', 'الاستراتيجيات'], ['resources', 'المصادر التعليمية']] },
        { id: 10, title: 'أساليب التقويم', fields: [['formative', 'التقويم التكويني'], ['summative', 'التقويم الختامي']] }
    ];
    const limit = 500;
    let lesson = null;
    let previewKey = '';
    let pendingKey = '';
    const key = () => JSON.stringify(visitFields.map(id => ($(id)?.value || '').trim()));
    const enabled = () => !!window.SupervisorGate?.canEye() && !window.SupervisorGate.isDemo();
    const normalize = text => text.normalize('NFKC').replace(/[\u0640\u064B-\u065F\u0670]/g, '')
        .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const words = text => normalize(text).split(' ').filter(Boolean);

    function matchVisit(candidate) {
        const [teacher, school, subject, grade, date, period] = JSON.parse(key());
        if (!teacher || !school || !subject || !grade || !date || !period)
            return 'أكمل المعلّم والمدرسة والمادة والصف والتاريخ ورقم الحصة في نموذج التقييم.';
        if (!candidate) return '';
        const expected = words(teacher), actual = words(candidate.teacher);
        const sameName = actual.every(word => expected.includes(word)) || expected.every(word => actual.includes(word));
        if (expected.length < 2 || actual.length < 2 || expected[0] !== actual[0] ||
            expected[expected.length - 1] !== actual[actual.length - 1] || !sameName)
            return 'اسم المعلّم في نور لا يطابق المعلّم في الزيارة.';
        const schoolWords = words(candidate.school);
        const expectedSchool = words(school).filter(word => !['مدرسه', 'بن', 'ابن'].includes(word));
        if (!expectedSchool.length || !expectedSchool.every(word => schoolWords.includes(word)))
            return 'المدرسة في نور لا تطابق المدرسة في الزيارة.';
        return '';
    }

    function approved() {
        if (!enabled() || !saved.value) return {};
        try {
            const record = JSON.parse(saved.value);
            return record.visit === key() && record.evidence ? record.evidence : {};
        } catch {
            return {};
        }
    }

    function reportLine(id) {
        const value = approved()[id];
        return typeof value === 'string' && value ? 'شاهد من تحضير نور: ' + value : '';
    }

    function syncCards() {
        groups.forEach(({ id }) => {
            const notes = $('notes-' + id);
            if (!notes) return;
            let chip = $('noorEvidence-' + id);
            const line = reportLine(id);
            if (!chip && line) {
                chip = document.createElement('p');
                chip.id = 'noorEvidence-' + id;
                chip.className = 'mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-900 leading-6 whitespace-pre-line';
                notes.after(chip);
            }
            if (chip) {
                chip.hidden = !line;
                chip.textContent = line;
            }
        });
        $('noorClearApproved').hidden = !Object.keys(approved()).length;
    }

    function sync() {
        panel.hidden = !enabled();
        if (pendingKey && (pendingKey !== key() || !enabled())) {
            finishRequest();
            status.textContent = 'تغيّرت بيانات الزيارة. اسحب التحضير للزيارة المفتوحة.';
        }
        if (lesson && (previewKey !== key() || !enabled())) {
            lesson = null;
            preview.hidden = true;
            previewKey = '';
            status.textContent = 'تغيّرت بيانات الزيارة. استورد التحضير لهذه الزيارة من جديد.';
        }
        if (saved.value && !Object.keys(approved()).length) {
            saved.value = '';
            if (typeof supRegenderGenerated === 'function') supRegenderGenerated();
        }
        syncCards();
    }

    function labelValue(container, label, text) {
        const p = document.createElement('p');
        const heading = document.createElement('b');
        heading.textContent = label + ' ';
        p.className = 'mt-2 whitespace-pre-line leading-6';
        p.append(heading, text);
        container.append(p);
    }

    function render() {
        $('noorPreparationTitle').textContent = lesson.title;
        $('noorPreparationIdentity').textContent = [lesson.teacher, lesson.school].filter(Boolean).join(' · ');
        const mismatch = matchVisit(lesson);
        const topic = $('topic')?.value.trim();
        const titleDiffers = topic && normalize(topic) !== normalize(lesson.title);
        status.textContent = mismatch || (titleDiffers
            ? 'عنوان التحضير يختلف عن عنوان الدرس في الاستمارة. تحقّق من الصف وموضوع الحصة قبل اعتماد الشواهد.'
            : 'راجع الصف والحصة ثم اختر الشواهد التي تريد اعتمادها.');
        confirm.checked = false;
        confirm.disabled = !!mismatch;
        $('noorApproveEvidence').disabled = true;

        const container = $('noorPreparationGroups');
        container.replaceChildren();
        groups.forEach(({ id, title, fields }) => {
            const card = document.createElement('section');
            card.className = 'rounded-xl border border-slate-200 p-3';
            const heading = document.createElement('h3');
            heading.className = 'font-bold text-slate-900';
            heading.textContent = id + ' · ' + title;
            const columns = document.createElement('div');
            columns.className = 'grid gap-3 md:grid-cols-2 mt-2 text-sm';
            const plan = document.createElement('div');
            const observed = document.createElement('div');
            plan.className = observed.className = 'rounded-lg bg-slate-50 p-3';
            const sources = fields.filter(([field]) => lesson.fields[field]);
            labelValue(plan, 'ما ورد في التحضير', sources.length ? '' : 'لا توجد بيانات لهذا البند.');
            sources.forEach(([field, label]) => labelValue(plan, label, lesson.fields[field]));
            columns.append(plan, observed);
            card.append(heading, columns);
            if (sources.length) {
                const check = document.createElement('input');
                check.type = 'checkbox';
                check.dataset.noorItem = id;
                const label = document.createElement('label');
                label.className = 'flex items-center gap-2 mt-3 font-semibold text-sm';
                label.append(check, 'اختيار شاهد مكتوب للبند ' + id);
                const text = document.createElement('textarea');
                text.id = 'noorDraft-' + id;
                text.rows = 3;
                text.maxLength = limit;
                text.className = 'block w-full mt-2 rounded-lg border border-slate-300 p-2 text-sm';
                text.setAttribute('aria-label', 'نص شاهد البند ' + id);
                const draft = sources.map(([field, label]) => label + ' — ' + lesson.fields[field]).join('؛ ');
                text.value = approved()[id] || (draft.length > limit ? draft.slice(0, limit - 1) + '…' : draft);
                check.checked = !!approved()[id];
                card.append(label, text);
            }
            container.append(card);
            observed.id = 'noorObserved-' + id;
        });
        updateObservations();
        preview.hidden = false;
    }

    function updateObservations() {
        if (!lesson) return;
        groups.forEach(({ id }) => {
            const box = $('noorObserved-' + id);
            if (!box) return;
            const read = score => typeof window.svfEyeOfficial === 'function' ? window.svfEyeOfficial(id, score, true) || [] : [];
            const observations = [...new Set([...read(1), ...read(4)])].slice(0, 4);
            box.replaceChildren();
            labelValue(box, 'ما رُصد في الحصة', observations.length ? '' : 'لا يوجد شاهد ميداني متاح لهذا البند.');
            observations.forEach(text => labelValue(box, '•', text));
        });
    }

    importButton.addEventListener('click', () => {
        if (importButton.dataset.noorBridge !== '2.2')
            status.textContent = 'ثبّت أو حدّث سكربت الربط، ثم أعد تحميل عين المشرف. يمكنك أيضًا استخدام اللصق اليدوي.';
    });

    function finishRequest() {
        pendingKey = '';
        cancelButton.hidden = true;
        importButton.dispatchEvent(new CustomEvent('svf:noor-cancel'));
    }

    importButton.addEventListener('svf:noor-request', event => {
        if (!enabled() || importButton.dataset.noorBridge !== '2.2') return;
        const mismatch = matchVisit();
        if (mismatch) { status.textContent = mismatch; return; }
        const link = $('noorDetailUrl').value.trim();
        if (link) {
            let url;
            try { url = new URL(link); } catch { /* يُعرض تنبيه الرابط أدناه. */ }
            if (url?.origin !== 'https://lms.moe.gov.om' || url.username || url.password ||
                !/^\/tsupv\/courses\/view_preparation\/[A-Za-z0-9_-]+(?:\/cid:[A-Za-z0-9_-]+)?\/?$/.test(url.pathname)) {
                status.textContent = 'ألصق رابط «عرض التحضير» من نور أو اترك الحقل فارغًا للبحث تلقائيًا.';
                return;
            }
        }
        finishRequest();
        pendingKey = key();
        preview.hidden = true;
        confirm.checked = false;
        $('noorApproveEvidence').disabled = true;
        cancelButton.hidden = false;
        status.textContent = link ? 'بانتظار تحميل صفحة عرض التحضير في نور.'
            : 'جارٍ البحث عن تحضير «' + $('teacherName').value.trim() + '» في نور.';
        event.preventDefault();
    });

    cancelButton.addEventListener('click', () => {
        finishRequest();
        if (lesson && previewKey === key()) render();
        status.textContent = 'أُلغي طلب سحب التحضير.';
    });

    importButton.addEventListener('svf:noor-preparation', event => {
        if (!enabled() || !pendingKey || pendingKey !== key() || typeof event.detail !== 'string' || event.detail.length > 70000) return;
        let data;
        try { data = JSON.parse(event.detail); } catch { return; }
        const incoming = data?.lesson;
        const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
        if (typeof data?.progress === 'string') {
            status.textContent = clean(data.progress, 250);
            return;
        }
        if (!incoming) {
            status.textContent = clean(data?.error, 250) || 'لم يصل تحضير صالح.';
            if (data?.done) finishRequest();
            return;
        }
        const fields = {};
        groups.flatMap(group => group.fields).forEach(([field]) => {
            const text = clean(incoming.fields?.[field], 4000);
            if (text) fields[field] = text;
        });
        const next = { title: clean(incoming.title, 250), teacher: clean(incoming.teacher, 250),
            school: clean(incoming.school, 250), fields };
        if (!next.title || !next.teacher || !Object.keys(fields).length) {
            status.textContent = 'التحضير المستورد لا يتضمن عنواناً ومعلّماً وحقولاً قابلة للمراجعة.';
            return;
        }
        const mismatch = matchVisit(next);
        if (mismatch) {
            status.textContent = mismatch + ' افتح تحضير المعلم الصحيح في تبويب نور.';
            return;
        }
        lesson = next;
        previewKey = pendingKey;
        pendingKey = '';
        cancelButton.hidden = true;
        event.preventDefault();
        render();
    });

    confirm.addEventListener('change', () => { $('noorApproveEvidence').disabled = !confirm.checked; });
    $('noorApproveEvidence').addEventListener('click', () => {
        if (!enabled() || !lesson || previewKey !== key() || !confirm.checked || matchVisit(lesson)) return;
        const evidence = {};
        preview.querySelectorAll('input[data-noor-item]:checked').forEach(box => {
            const id = box.dataset.noorItem;
            const text = $('noorDraft-' + id)?.value.trim().slice(0, limit);
            if (text) evidence[id] = text;
        });
        if (!Object.keys(evidence).length) {
            status.textContent = 'اختر شاهداً مكتوباً واحداً على الأقل.';
            return;
        }
        saved.value = JSON.stringify({ visit: previewKey, evidence });
        syncCards();
        if (typeof supRegenderGenerated === 'function') supRegenderGenerated();
        status.textContent = 'اعتُمدت الشواهد المختارة في نموذج التقييم.';
    });
    $('noorClearApproved').addEventListener('click', () => {
        saved.value = '';
        syncCards();
        if (typeof supRegenderGenerated === 'function') supRegenderGenerated();
        if (lesson) render();
        status.textContent = 'أزيلت شواهد نور من الزيارة.';
    });
    visitFields.forEach(id => $(id)?.addEventListener('input', sync));
    document.addEventListener('svf-gate-open', sync);

    window.SvfNoorPreparation = {
        reportLine,
        sync() { sync(); updateObservations(); }
    };
    sync();
})();
