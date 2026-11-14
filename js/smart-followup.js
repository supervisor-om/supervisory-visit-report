(function (root) {
    'use strict';

    const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    const norm = value => clean(value).normalize('NFKC').replace(/[\u0640\u064B-\u065F\u0670]/g, '')
        .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
    const parse = value => { try { return JSON.parse(value) || {}; } catch { return {}; } };
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    const status = { observed: 'رُصد تطبيق الممارسة', notSeen: 'لم تظهر الممارسة رغم توفر الفرصة', deferred: 'لم تتح فرصة للرصد' };
    const visitKey = visit => JSON.stringify([visit.teacher, visit.school, visit.file, visit.date, visit.cls, visit.period, visit.topic].map(clean));

    function sameTeacher(a, b) {
        if (clean(a.file) && clean(b.file)) return clean(a.file) === clean(b.file);
        return !!(norm(a.teacher) && norm(a.school) && norm(a.teacher) === norm(b.teacher) && norm(a.school) === norm(b.school));
    }

    function savedVisit(row) {
        const report = row.data;
        const fields = report.formData || {};
        return { key: row.key, teacher: report.teacherName || fields.teacherName, school: report.school || fields.school,
            file: fields.fileNumber, subject: fields.subject, date: date(report.visitDate || fields.visitDate), cls: fields.class,
            period: fields.lesson, topic: fields.topic, agreement: parse(fields.debriefData).agree || {},
            state: parse(fields.smartFollowupData) };
    }

    function agreements(rows, current) {
        const earlier = visit => !current || (visit.key !== current.key && (visit.date < current.date ||
            (visit.date === current.date && (!current.key || visit.key < current.key))));
        const visits = rows.filter(row => row?.key && row.data && !row.data.deleted).map(savedVisit).filter(visit => visit.date && earlier(visit))
            .sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
        const reviews = new Map();
        for (const visit of visits) {
            if (visit.state.visit !== visitKey(visit)) continue;
            for (const [key, review] of Object.entries(visit.state.reviews || {})) {
                if (!Object.hasOwn(status, review?.outcome)) continue;
                if (!reviews.has(key)) reviews.set(key, []);
                reviews.get(key).push({ review, visit });
            }
        }
        return visits.filter(visit => (!current || sameTeacher(visit, current)) && (clean(visit.agreement.goal) || clean(visit.agreement.action)))
            .map(origin => {
                const results = (reviews.get(origin.key) || []).filter(({ visit }) => sameTeacher(visit, origin) &&
                    (visit.date > origin.date || (visit.date === origin.date && visit.key > origin.key)));
                const final = results.find(({ review }) => review.outcome === 'observed') || results[0];
                const latest = final ? { ...final.review, date: final.visit.date, topic: final.visit.topic } : null;
                return { ...origin, latest, open: latest?.outcome !== 'observed' };
            });
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { agreements, sameTeacher, visitKey };
        return;
    }

    const $ = id => document.getElementById(id);
    const value = id => clean($(id)?.value);
    const allowed = () => !!root.SupervisorGate?.canEye() && !root.SupervisorGate.isDemo();
    const current = () => ({ key: typeof currentEditingKey === 'undefined' ? null : currentEditingKey,
        teacher: value('teacherName'), school: value('school'), file: value('fileNumber'), date: date(value('visitDate')),
        cls: value('class'), period: value('lesson'), topic: value('topic') });
    const stateFor = visit => {
        const state = parse($('smartFollowupData')?.value);
        const visitId = visitKey(visit);
        return state.visit === visitId ? state : { visit: visitId, reviews: {} };
    };
    const saveState = state => { $('smartFollowupData').value = JSON.stringify(state); };
    const esc = root.svfEscapeHtml;
    let focusedAgreement = '';
    const rows = () => {
        const result = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (/^(supervision_v6_visit_|visit_v5_)/.test(key)) result.push({ key, data: parse(localStorage.getItem(key)) });
        }
        return result;
    };
    const guide = () => root.SvfLessonGuide;
    const noorTitle = () => clean(root.SvfNoorPreparation?.matchedTitle());

    function startFollowup(key) {
        if (!allowed()) return;
        if (root.svfEyeVisitBusy?.()) {
            root.showToast('أوقف الرصد أو ربط الكاميرا قبل بدء زيارة متابعة.', 'error');
            return;
        }
        const target = agreements(rows()).find(item => item.key === key && item.open);
        if (!target) {
            root.showToast('الاتفاق لم يعد مفتوحًا. حدّث لوحة المتابعة.', 'error');
            return;
        }
        const visit = current();
        if (focusedAgreement === key && !visit.key && sameTeacher(target, visit)) {
            root.toggleSupervisoryView('form-view');
            return;
        }
        if (root.svfVisitNavDirty?.('sup') &&
            !root.confirm('في الزيارة المفتوحة تعديلات لم تُحفظ. هل تبدأ زيارة متابعة جديدة؟')) return;
        root.svfStartFollowupVisit(target);
        focusedAgreement = target.key;
        renderVisit();
    }

    function guideSelection(info = current()) {
        if (!allowed() || !guide()) return null;
        const cls = info.cls;
        const parts = (stateFor(current()).reference || '').split(':');
        const selected = guide().byId(parts[0]);
        const grade = root.SvfTermPlan?.parseGrade(cls);
        if (selected && selected.grade === grade) {
            const skill = guide().skillOf(selected, parts[1]);
            if (!parts[1] || skill) return { guide: selected, skills: skill ? [skill.id] : [], sure: true };
        }
        return guide().find({ cls, topic: info.topic || noorTitle() });
    }

    function referenceCard(visit) {
        const engine = guide();
        const grade = root.SvfTermPlan?.parseGrade(visit.cls);
        const choices = engine ? engine.topics().filter(topic => topic.grade === grade) : [];
        const match = guideSelection(visit);
        const reference = stateFor(visit).reference;
        const topic = match?.sure ? match.guide : null;
        const skills = topic ? match.skills.map(id => engine.skillOf(topic, id)).filter(Boolean) : [];
        const points = skills.flatMap(skill => skill.points || []);
        const outcomes = skills.some(skill => skill.outcomes?.length) ? skills.flatMap(skill => skill.outcomes || []) : topic?.outcomes || [];
        const drills = topic ? engine.drillsFor(topic, match.skills) : [];
        const questions = topic ? engine.questionsFor(topic, match.skills) : [];
        const line = (label, items) => items.length ? '<dt class="font-semibold mt-2">' + label + '</dt><dd>' + items.map(esc).join(' · ') + '</dd>' : '';
        const option = (id, title) => '<option value="' + esc(id) + '"' + (reference === id ? ' selected' : '') + '>' + esc(title) + '</option>';
        return '<section class="rounded-xl border border-slate-200 p-4 space-y-2"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-bold">مرجع الدرس</h3>' +
            '<button type="button" data-smart-import class="svf-btn svf-btn-ghost svf-btn-sm">استيراد من دليل PDF</button></div>' +
            (choices.length ? '<label class="block text-sm">اختيار الدرس من الفهرس<select data-smart-reference class="block w-full rounded-lg border border-slate-300 p-2">' +
                '<option value="">مطابقة تلقائية</option>' + choices.map(item => option(item.id, item.topic) +
                    item.skills.map(skill => option(item.id + ':' + skill.id, skill.name)).join('')).join('') + '</select></label>' : '') +
            (topic ? '<p class="font-semibold">' + esc(skills.map(skill => skill.name).join('، ') || topic.topic) + '</p>' +
                '<p class="text-xs text-slate-600">' + esc([topic.unit, ...skills.map(skill => skill.source), topic.source].filter(Boolean).join(' · ')) + '</p>' +
                (points.length || outcomes.length || drills.length || questions.length ? '<details class="text-sm"><summary class="cursor-pointer">نواتج التعلم والأنشطة والتقويم</summary><dl>' +
                line('نواتج للتخطيط مستخلصة من الدليل', outcomes) + line('أمثلة لنقاط الأداء', points.map(point => point.text)) +
                line('أمثلة لأنشطة يمكن تكييفها', drills.map(drill => drill.desc + (drill.source ? ' (' + drill.source + ')' : ''))) +
                line('نماذج للتقويم', questions.map(question => question.text)) + '</dl></details>' : '')
                : '<p class="text-sm text-slate-600">' + (!grade ? 'أدخل صف الزيارة ليظهر فهرس الدروس.' : choices.length ?
                    'اختر الدرس إذا لم تظهر مطابقة مؤكدة لعنوان الزيارة.' : 'لا توجد بطاقة معتمدة لهذا الصف في الفهرس بعد.') + '</p>') + '</section>';
    }

    function agreementCard(item, mode) {
        const goal = clean(item.agreement.goal);
        const action = clean(item.agreement.action);
        const indicator = clean(item.agreement.indicator);
        const previous = [clean(item.topic), clean(item.school)].filter(Boolean).map(esc).join(' · ');
        const latest = item.latest;
        const review = item.review || {};
        const controls = mode === 'edit' ? '<div class="grid gap-2 sm:grid-cols-2 mt-3"><label class="text-sm">نتيجة المتابعة' +
            '<select data-smart-outcome class="block w-full rounded-lg border border-slate-300 p-2"><option value="">اختر نتيجة</option>' +
            Object.entries(status).map(([key, label]) => '<option value="' + key + '"' + (review.outcome === key ? ' selected' : '') + '>' + label + '</option>').join('') +
            '</select></label><label class="text-sm">الدليل والأثر في الدرس الحالي<textarea data-smart-note rows="2" maxlength="500" class="block w-full rounded-lg border border-slate-300 p-2">' +
            esc(review.note || '') + '</textarea></label></div><p data-smart-status class="text-sm text-slate-600" role="status">' +
            (review.outcome ? 'أُدرجت النتيجة في الزيارة المفتوحة.' : '') + '</p>' : '';
        const start = mode !== 'edit' && item.open
            ? '<button type="button" data-smart-start="' + esc(item.key) + '" class="svf-btn svf-btn-secondary svf-btn-sm mt-3">' +
                (focusedAgreement === item.key && !current().key && sameTeacher(item, current()) ? 'متابعة الزيارة المفتوحة' : 'بدء زيارة متابعة') + '</button>' : '';
        return '<article data-smart-origin="' + esc(item.key) + '" class="rounded-xl border border-slate-200 p-4 min-w-0 break-words">' +
            (mode === 'board' ? '<button type="button" data-smart-teacher="' + esc(item.teacher) + '" class="font-bold text-blue-800 underline">' + esc(item.teacher) + '</button>' : '') +
            '<h4 class="font-bold text-slate-900">' + esc(goal || action) + '</h4><p class="text-xs text-slate-600">' +
            'اتفاق زيارة <bdi>' + esc(item.date) + '</bdi>' + (previous ? ' · ' + previous : '') + '</p>' +
            (goal && action ? '<p class="text-sm mt-2">' + esc(action) + '</p>' : '') +
            (indicator ? '<p class="text-sm mt-2"><b>مؤشر النجاح</b> · ' + esc(indicator) + '</p>' : '') +
            (latest ? '<p class="text-sm mt-2">' + status[latest.outcome] + ' · <bdi>' + esc(latest.date) + '</bdi>' +
                (latest.topic ? ' · ' + esc(latest.topic) : '') + (latest.note ? ' · ' + esc(latest.note) : '') + '</p>' : '') +
            controls + start + '</article>';
    }

    function renderVisit() {
        const visit = current();
        const enabled = allowed() && !root.svfEyeLabActive?.();
        const prior = enabled && visit.teacher && visit.date ? agreements(rows(), visit).filter(item => item.open) : [];
        const target = prior.find(item => item.key === focusedAgreement);
        const ordered = target ? [target, ...prior.filter(item => item !== target)] : prior;
        const state = stateFor(visit);
        const targets = ordered.map(item => agreementCard({ ...item, review: state.reviews?.[item.key] }, 'edit')).join('');
        const preview = $('formSmartFollowup');
        if (preview) {
            preview.hidden = !target;
            preview.innerHTML = target ? '<section class="bg-white rounded-2xl border border-blue-200 p-4 space-y-2">' +
                '<h2 class="font-bold">الممارسة المستهدفة في زيارة المتابعة</h2><p>' + esc(clean(target.agreement.goal) || clean(target.agreement.action)) + '</p>' +
                (clean(target.agreement.indicator) ? '<p class="text-sm text-slate-600">' + esc(target.agreement.indicator) + '</p>' : '') +
                '<p class="text-sm text-slate-600">حدّد الصف والحصة وموضوع الدرس الحالي.</p>' +
                '<button type="button" data-smart-view="eye-view" class="svf-btn svf-btn-primary svf-btn-sm">افتح عين المشرف</button></section>' : '';
        }
        for (const id of ['eyeSmartFollowup', 'debriefSmartFollowup']) {
            const box = $(id);
            if (!box) continue;
            const expanded = box.querySelector('details')?.open;
            box.hidden = !enabled;
            if (box.hidden) continue;
            box.innerHTML = id === 'eyeSmartFollowup'
                ? '<details class="bg-white rounded-2xl border border-slate-200 p-4"' + (expanded ? ' open' : '') + '><summary class="cursor-pointer font-bold">مرجع الدرس ومتابعة الزيارة' +
                    (target ? '<span class="block font-normal text-sm text-slate-700 mt-1">' + esc(clean(target.agreement.goal) || clean(target.agreement.action)) + '</span>' : '') + '</summary><div class="space-y-3 mt-3">' +
                    referenceCard(visit) + (prior.length ? '<button type="button" data-smart-view="debrief-view" class="svf-btn svf-btn-secondary svf-btn-sm">متابعة اتفاقات المعلم (' + prior.length + ')</button>' : '') + '</div></details>'
                : '<details class="bg-white rounded-2xl border border-slate-200 p-4"' + (prior.length ? ' open' : '') + '><summary class="cursor-pointer font-bold">متابعة اتفاقات الزيارات السابقة</summary><div class="space-y-3 mt-3">' +
                    (targets ? targets + '<button type="button" data-smart-view="form-view" class="svf-btn svf-btn-secondary svf-btn-sm">انتقل إلى نموذج التقييم للحفظ</button>'
                        : '<p class="text-sm text-slate-600">تظهر الاتفاقات المفتوحة لهذا المعلم بعد حفظها في زيارة سابقة.</p>') + '</div></details>';
        }
    }

    function historyHtml(list, mode) {
        const visit = current();
        const currentVisit = mode === 'board' && visit.teacher
            ? '<div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3"><div><h3 class="font-semibold">الزيارة المفتوحة</h3><p class="text-sm text-slate-600">' +
                [visit.teacher, visit.topic].filter(Boolean).map(esc).join(' · ') + '</p></div><div class="flex flex-wrap gap-2">' +
                '<button type="button" data-smart-view="form-view" class="svf-btn svf-btn-ghost svf-btn-sm">نموذج التقييم</button>' +
                '<button type="button" data-smart-view="eye-view" class="svf-btn svf-btn-secondary svf-btn-sm">عين المشرف</button>' +
                '<button type="button" data-smart-view="debrief-view" class="svf-btn svf-btn-secondary svf-btn-sm">المداولة</button></div></div>' : '';
        return '<section class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">' + currentVisit + '<h2 class="font-bold text-slate-900">' +
            (mode === 'board' ? 'اتفاقات المداولة المفتوحة' : 'متابعة الممارسات المتفق عليها') + '</h2>' +
            (mode === 'board' && list.length ? '<p class="text-sm text-slate-600">تشمل الاتفاقات التي بقيت مفتوحة من الفترات السابقة.</p>' : '') +
            (list.length ? list.map(item => agreementCard(item, mode)).join('') : '<p class="text-sm text-slate-600">لا اتفاقات للعرض.</p>') + '</section>';
    }

    function beforeSave() {
        if (!allowed()) return;
        const note = $('debriefSmartFollowup')?.querySelector('textarea:focus');
        if (note) note.dispatchEvent(new Event('change', { bubbles: true }));
        const field = $('smartFollowupData');
        if (field.value && parse(field.value).visit !== visitKey(current())) field.value = '';
    }

    document.addEventListener('click', event => {
        if (!allowed()) return;
        const button = event.target.closest('[data-smart-view]');
        if (button) root.toggleSupervisoryView(button.dataset.smartView);
        const start = event.target.closest('[data-smart-start]');
        if (start) startFollowup(start.dataset.smartStart);
        if (event.target.closest('[data-smart-import]')) root.SvfGuideImport?.open();
    });
    document.addEventListener('change', event => {
        const control = event.target;
        if (!allowed() || root.svfEyeLabActive?.()) return;
        if (focusedAgreement && ['teacherName', 'school', 'fileNumber', 'visitDate'].includes(control.id)) {
            renderVisit();
            return;
        }
        const visit = current();
        const state = stateFor(visit);
        if (control.matches('[data-smart-reference]')) {
            state.reference = control.value;
            saveState(state);
            document.dispatchEvent(new Event('svf-curriculum-changed'));
            renderVisit();
            const details = $('eyeSmartFollowup')?.querySelector('details');
            if (details) details.open = true;
            $('eyeSmartFollowup')?.querySelector('[data-smart-reference]')?.focus();
            return;
        }
        const card = control.closest('[data-smart-origin]');
        if (!card || !control.matches('[data-smart-note], [data-smart-outcome]')) return;
        const key = card.dataset.smartOrigin;
        if (!agreements(rows(), visit).some(item => item.key === key && item.open)) return;
        const outcome = card.querySelector('[data-smart-outcome]').value;
        const note = clean(card.querySelector('[data-smart-note]').value).slice(0, 500);
        const reviews = state.reviews || (state.reviews = {});
        const valid = Object.hasOwn(status, outcome) && (outcome === 'deferred' || !!note);
        if (valid) reviews[key] = { outcome, note };
        else delete reviews[key];
        saveState(state);
        card.querySelector('[data-smart-status]').textContent = valid ? 'أُدرجت النتيجة في الزيارة المفتوحة. احفظ التقرير لتظهر في ملف المعلم.'
            : outcome ? 'أضف الدليل والأثر أو ما رصدته قبل اعتماد النتيجة.' : '';
    });

    document.addEventListener('svf-guides-changed', renderVisit);
    document.addEventListener('svf-noor-matched', () => {
        if (!value('topic') && !stateFor(current()).reference) document.dispatchEvent(new Event('svf-curriculum-changed'));
        renderVisit();
    });
    root.SvfSmartFollowup = { renderVisit, guideSelection, historyHtml, agreements, allowed, beforeSave, sameTeacher, savedVisit,
        clearFocus() { focusedAgreement = ''; } };
})(typeof window !== 'undefined' ? window : globalThis);
