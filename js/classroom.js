// =========================================================================
// المواقف الصفّيّة — الربط بقاعدة المعلمين وبالزيارة الإشرافيّة
//
// (١) اختيار المعلّم لا كتابته: الاسم يُوحَّد على تهجئة القاعدة — ووسمُ
//     «حُفظت في البوّابة» يطابق بالاسم حرفاً، فاختلافُ رسمه يُسقط الوسم —
//     والصفوف المقترحة صفوفُه هو، والحصص من (1) إلى (8) كما في البوّابة.
//
// (٢) «أنشئ تقرير إشرافي» من الموقف الصفّيّ: كان يُعاد كتابةُ كلّ شيءٍ في
//     النموذج الإشرافيّ. وأثرُه يمتدّ إلى التقرير الشهريّ: الموقف الذي لا
//     تقريرَ إشرافيَّ له لا يُحتسب في «عدد الزيارات الإشرافية».
//
// بلا ربطٍ بقاعدة المعلمين يبقى كلّ شيءٍ كما كان: حقولٌ نصّيّةٌ تُكتب باليد،
// والزرّ يعمل بما في الموقف الصفّيّ وحده.
// =========================================================================
(function () {
    'use strict';

    const el = id => document.getElementById(id);
    const GRADE_LIST = 'svfCvGrades', PERIOD_LIST = 'svfCvPeriods';
    const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const linked = () => !!(window.SupervisorIdentity && SupervisorIdentity.getIdentity());
    const normName = v => (window.SupervisorIdentity ? SupervisorIdentity.normName(v) : clean(v));
    const toast = (m, k) => { try { showToast(m, k); } catch (e) {} };

    function setOptions(id, values) {
        let dl = el(id);
        if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
        dl.innerHTML = '';
        values.forEach(v => { const o = document.createElement('option'); o.value = v; dl.appendChild(o); });
    }

    // «5-12» ← الصفوف من ٥ إلى ١٢، و«9، 10» ← ما ذُكر وحده
    function gradesOf(text) {
        const s = clean(text);
        if (!s) return [];
        const range = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
        if (range) {
            const a = Math.min(+range[1], +range[2]), b = Math.max(+range[1], +range[2]);
            return Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
        }
        return [...new Set((s.match(/\d{1,2}/g) || []).filter(n => +n >= 1 && +n <= 12))];
    }

    // معلّمو المدرسة المكتوبة أولى: الاسم الواحد قد يتكرّر في مدرستين
    function findTeacher(name) {
        if (!linked() || !clean(name)) return null;
        const school = clean(el('schoolName') && el('schoolName').value);
        const want = normName(name);
        if (school) {
            const inSchool = SupervisorIdentity.teachersOfSchool(school).filter(t => normName(t.name) === want);
            if (inSchool.length === 1) return inSchool[0];
            if (inSchool.length > 1) return null;
        }
        return SupervisorIdentity.findTeacher(name).teacher || null;
    }

    // ── (١) اختيار المعلّم: توحيد الاسم واقتراح صفوفه ──
    function onTeacherPicked() {
        const input = el('cvTeacher');
        if (!input) return;
        const typed = clean(input.value);
        const t = typed ? findTeacher(typed) : null;
        if (!t) { setOptions(GRADE_LIST, []); if (el('cvGrade')) el('cvGrade').removeAttribute('list'); return; }
        // «بن» قد تسقط من الكتابة: المطابقة تُسقطها، والمكتوب يُردّ إلى تهجئة القاعدة
        if (t.name && t.name !== typed) input.value = t.name;
        const grades = gradesOf(t.grades);
        setOptions(GRADE_LIST, grades);
        if (el('cvGrade')) {
            if (grades.length) el('cvGrade').setAttribute('list', GRADE_LIST);
            else el('cvGrade').removeAttribute('list');
        }
    }

    // الصفّ خارج صفوف المعلّم: تنبيهٌ لا منع — قد ينوب عن زميلٍ أو يتغيّر الجدول
    function warnGradeMismatch() {
        const t = findTeacher(el('cvTeacher') && el('cvTeacher').value);
        const g = clean(el('cvGrade') && el('cvGrade').value).replace(/\D/g, '');
        if (!t || !g) return;
        const grades = gradesOf(t.grades);
        if (grades.length && !grades.includes(g)) toast('الصف (' + g + ') ليس من صفوف ' + t.name + ' في القاعدة — تأكّد', 'info');
    }

    // ما يُحفظ مع الموقف الصفّيّ زيادةً على ما كتبه المشرف
    window.svfCvMeta = function (name) {
        const t = findTeacher(name);
        if (!t) return {};
        return {
            teacherName: t.name,
            teacherFile: t.fileNumber || '',
            gender: t.gender || '',
            teacherSchool: t.school || ''
        };
    };

    // ── (٢) الموقف الصفّيّ ← تقرير زيارةٍ إشرافيّة ──
    function supervisoryFor(teacher, date) {
        const want = normName(teacher), d = clean(date);
        if (!want || !d) return null;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || k.indexOf('supervision_v6_visit_') !== 0) continue;
            try {
                const r = JSON.parse(localStorage.getItem(k));
                if (r && clean(r.visitDate) === d && normName(r.teacherName) === want) return r;
            } catch (e) {}
        }
        return null;
    }

    window.svfCvActions = function (visit, index) {
        const date = clean(el('schoolVisitDate') && el('schoolVisitDate').value);
        if (supervisoryFor(visit && visit.teacher, date))
            return '<span class="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full whitespace-nowrap">له تقرير إشرافي</span>';
        return '<button type="button" class="cv-sup-btn text-[11px] font-bold bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-100 px-2 py-0.5 rounded-full whitespace-nowrap"'
             + ' data-cv="' + index + '" title="يفتح نموذج الزيارة الإشرافية معبّأً بهذا الموقف">أنشئ تقرير إشرافي</button>';
    };

    window.svfBindCvActions = function () {
        document.querySelectorAll('#classroomVisitsList .cv-sup-btn').forEach(b =>
            b.addEventListener('click', () => createSupervisory(+b.dataset.cv)));
    };

    // تصفيرٌ مقصورٌ على النموذج الإشرافيّ: performReset تمسح حقول الصفحة كلّها
    // — ومنها نموذج الزيارة المدرسيّة المفتوح خلفنا — فلا تصلح هنا.
    function resetSupervisoryOnly() {
        const form = el('evaluationForm');
        if (form) form.reset();
        document.querySelectorAll('#form-view input:not([type="button"]):not([type="radio"]):not([type="checkbox"]), #form-view textarea')
            .forEach(i => { i.value = ''; });
        currentEditingKey = null;
        try {
            evaluationItems.forEach(item => {
                updateScore(item.id, 3, true);
                const n = el('notes-' + item.id);
                if (n) n.textContent = generateDescriptionText(item.id, 3);
            });
        } catch (e) {}
        const rs = el('reportSection');
        if (rs) rs.classList.add('hidden');
        try { if (typeof svfFillVisitor === 'function') svfFillVisitor(); } catch (e) {}
    }

    // شريطٌ يقول من أين جاء التقرير، وفيه رجوعٌ إلى الزيارة المدرسيّة بحالها.
    // يُبنى مرّةً بعناصره: الاسم وحده يتغيّر، فلا يتكرّر ربط الزرّ.
    let originBar = null, originText = null;
    function showOrigin(school) {
        if (!originBar) {
            const view = el('form-view');
            if (!view) return;
            originBar = document.createElement('div');
            originBar.id = 'cvOriginBar';
            originBar.className = 'flex justify-between items-center bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 text-sm';
            originText = document.createElement('span');
            originText.id = 'cvOriginText';
            const back = document.createElement('button');
            back.type = 'button';
            back.id = 'cvBackToSchool';
            back.className = 'font-bold text-amber-800 hover:text-amber-950 underline';
            back.textContent = 'رجوع للزيارة المدرسية';
            back.addEventListener('click', () => {
                originBar.classList.add('hidden');
                showView(el('schoolVisitsApp'));
            });
            originBar.appendChild(originText);
            originBar.appendChild(back);
            view.insertBefore(originBar, view.firstChild);
        }
        originText.textContent = 'هذا التقرير من موقفٍ صفّيٍّ في زيارة ' + (school || 'المدرسة');
        originBar.classList.remove('hidden');
    }

    function createSupervisory(index) {
        const cv = (Array.isArray(schoolClassroomVisits) ? schoolClassroomVisits : [])[index];
        if (!cv) return;
        const date = clean(el('schoolVisitDate') && el('schoolVisitDate').value);
        if (!date) { toast('اكتب تاريخ الزيارة المدرسية أوّلاً', 'error'); return; }
        const school = clean(el('schoolName') && el('schoolName').value) || cv.teacherSchool || '';
        const teacher = cv.teacherName || cv.teacher || '';

        // تقريرٌ إشرافيٌّ مفتوحٌ لم يُحفظ لا يُطمس بلا إذن
        const open = clean(el('teacherName') && el('teacherName').value);
        if (open && normName(open) !== normName(teacher) &&
            !confirm('في النموذج الإشرافي تقرير «' + open + '» لم يُحفظ بعد.\nهل أستبدله بتقرير ' + teacher + '؟')) return;

        showView(el('supervisoryVisitsApp'));
        toggleSupervisoryView('form-view');
        resetSupervisoryOnly();
        showOrigin(school);

        // الاسم أوّلاً ثمّ change: الإكمال التلقائيّ يجرّ المدرسة ورقم الملف والجنس
        const name = el('teacherName');
        if (name) { name.value = teacher; name.dispatchEvent(new Event('change', { bubbles: true })); }
        const put = (id, v) => { const e = el(id); if (e && clean(v)) e.value = clean(v); };
        put('school', school);
        put('fileNumber', cv.teacherFile);
        put('visitDate', date);
        put('lesson', cv.period);
        put('class', cv.grade);
        put('topic', cv.subject);
        put('subject', 'الرياضة المدرسية');
        if (cv.gender) {
            const radio = document.querySelector('input[name="supervisoryTeacherGender"][value="' + (cv.gender === 'f' ? '1' : '0') + '"]');
            if (radio && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        toast('فُتح النموذج الإشرافي معبّأً — أكمل التقييم واحفظه');
    }

    // الحصص (1)–(8) كما في البوّابة، والصفوف تُربط عند اختيار المعلّم.
    // واسمُ المعلّم قائمتُه من autofill.js فلا تُمسّ هنا.
    window.svfClassroomInit = function () {
        if (!el('cvTeacher')) return;
        setOptions(PERIOD_LIST, ['1', '2', '3', '4', '5', '6', '7', '8']);
        if (el('cvPeriod')) el('cvPeriod').setAttribute('list', PERIOD_LIST);
        el('cvTeacher').addEventListener('change', onTeacherPicked);
        el('cvTeacher').addEventListener('blur', onTeacherPicked);
        if (el('cvGrade')) el('cvGrade').addEventListener('change', warnGradeMismatch);
    };
})();
