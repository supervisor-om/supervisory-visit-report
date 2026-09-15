        // =========================================================================
        //  الإكمال التلقائيّ من قاعدة بيانات المعلمين
        //
        //  يعمل حين يكون الموقع مرتبطاً برمز المشرف (js/identity.js). بلا ربطٍ
        //  تبقى الحقول كما هي: لا قوائم اقتراح ولا تعبئة، والنماذج تُكتب يدوياً.
        //
        //  قاعدةُ العمل: البيانات تُقترح ولا تُفرض. لا يُطمس شيءٌ كتبه المستخدم،
        //  والاسم الملتبس (أكثر من معلّم) يُعرض ولا يُختار عنه — التقرير رسميّ.
        // =========================================================================
        const SVF_TEACHER_LIST = 'svfTeacherNames';
        const SVF_SCHOOL_LIST  = 'svfSchoolNames';
        const SVF_ROSTER_LIST  = 'svfRosterNames';

        function svfLinked() {
            return !!(window.SupervisorIdentity && SupervisorIdentity.getIdentity()
                      && SupervisorIdentity.getTeachers().length);
        }

        function svfDatalist(id) {
            let dl = document.getElementById(id);
            if (!dl) {
                dl = document.createElement('datalist');
                dl.id = id;
                document.body.appendChild(dl);
            }
            return dl;
        }

        function svfSetOptions(id, values) {
            const dl = svfDatalist(id);
            dl.innerHTML = '';
            values.forEach(v => {
                const o = document.createElement('option');
                o.value = v;
                dl.appendChild(o);
            });
        }

        // القائمة تُربط بالحقل عند الربط وتُفكّ عند إلغائه، فلا يبقى سهمٌ فارغ
        function svfBindList(inputId, listId, on) {
            const el = document.getElementById(inputId);
            if (!el) return;
            if (on) el.setAttribute('list', listId);
            else el.removeAttribute('list');
        }

        // اسم المعلّم كما في القاعدة قد يحمل «بن»، والمقارنة تُسقطها
        function svfSameName(a, b) {
            return window.SupervisorIdentity
                && SupervisorIdentity.normName(a) === SupervisorIdentity.normName(b);
        }

        function svfValue(id) {
            return (document.getElementById(id)?.value || '').trim();
        }

        // لا يُكتب في حقلٍ فيه شيء: ما كتبه المستخدم أولى بالبقاء
        function svfFillIfEmpty(id, value) {
            const el = document.getElementById(id);
            if (!el || !value || el.value.trim()) return false;
            el.value = value;
            return true;
        }

        function svfRefreshSuggestions() {
            const on = svfLinked();
            if (on) {
                svfSetOptions(SVF_TEACHER_LIST, SupervisorIdentity.teacherNames());
                svfSetOptions(SVF_SCHOOL_LIST,  SupervisorIdentity.schoolNames());
            }
            svfBindList('teacherName', SVF_TEACHER_LIST, on);   // الزيارة الإشرافيّة
            svfBindList('school',      SVF_SCHOOL_LIST,  on);
            svfBindList('schoolName',  SVF_SCHOOL_LIST,  on);   // الزيارة المدرسيّة
            svfRefreshRosterSuggestions();

            const btn = document.getElementById('pullRosterBtn');
            if (btn) btn.classList.toggle('hidden', !on);
        }

        // اقتراحات اسم المعلّم داخل المدرسة الحاليّة: معلّموها أوّلاً، فإن لم
        // تُعرف المدرسة بعدُ فكلّ معلّمي المشرف
        function svfSchoolTeachers() {
            if (!svfLinked()) return [];
            const school = svfValue('schoolName');
            const rows = school ? SupervisorIdentity.teachersOfSchool(school) : [];
            return rows.length ? rows : SupervisorIdentity.getTeachers();
        }

        function svfRefreshRosterSuggestions() {
            const on = svfLinked();
            if (on) svfSetOptions(SVF_ROSTER_LIST, svfSchoolTeachers().map(t => t.name));
            svfBindList('stName',    SVF_ROSTER_LIST, on);   // إضافة معلّم للطاقم
            svfBindList('cvTeacher', SVF_ROSTER_LIST, on);   // المواقف الصفّيّة
        }

        // ── الزيارة الإشرافيّة: اسم المعلّم يجرّ مدرسته ورقم ملفّه وجنسه ──
        function svfApplyTeacherFromDb() {
            if (!svfLinked()) return;
            const input = document.getElementById('teacherName');
            const typed = (input?.value || '').trim();
            if (!typed) return;

            const { matches, teacher } = SupervisorIdentity.findTeacher(typed);
            if (!teacher) {
                if (matches.length > 1)
                    showToast('أكثر من معلّم بهذا الاسم — أكمل الاسم لتحديده', 'error');
                return;
            }
            input.value = teacher.name;      // التهجئة المعتمدة في قاعدة المعلمين

            const filled = [];
            if (svfFillIfEmpty('school', teacher.school)) filled.push('المدرسة');
            if (svfFillIfEmpty('fileNumber', teacher.fileNumber)) filled.push('رقم الملف');
            if (teacher.gender) {
                const radio = document.getElementById(teacher.gender === 'm' ? 'genderMale' : 'genderFemale');
                if (radio && !radio.checked) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change', { bubbles: true }));   // الأوصاف تُعاد صياغتها
                    filled.push('الجنس');
                }
            }
            if (filled.length) showToast('من قاعدة المعلمين: ' + filled.join(' و'));
        }

        // ── الطاقم: معلمو المدرسة وأنصبتهم وصفوفهم، واسم المدير حين تتّفق سجلّاته ──
        function svfPullRoster(silent) {
            if (!svfLinked()) return 0;
            const school = svfValue('schoolName');
            if (!school) {
                if (!silent) showToast('اكتب اسم المدرسة أولاً', 'error');
                return 0;
            }
            const rows = SupervisorIdentity.teachersOfSchool(school);
            if (!rows.length) {
                if (!silent) showToast('لا توجد سجلات لهذه المدرسة في قاعدة المعلمين', 'error');
                return 0;
            }

            if (!Array.isArray(schoolTeachers)) schoolTeachers = [];
            const already = name => schoolTeachers.some(t => t && t.name && svfSameName(t.name, name));
            const added = [];
            rows.forEach(t => {
                if (!t.name || already(t.name)) return;
                added.push({
                    name:    t.name,
                    gender:  t.gender === 'm' ? 'm' : 'f',   // مجهولُ الجنس يبقى على افتراض النموذج
                    load:    t.load || '',
                    grades:  t.grades || '',
                    section: ''                              // الفئة ليست في القاعدة
                });
            });
            schoolTeachers = schoolTeachers.concat(added);

            const p = SupervisorIdentity.principalOfSchool(school);
            const gotPrincipal = svfFillIfEmpty('schoolPrincipal', p.name);

            renderSchoolTeachers();
            saveSchoolRoster();
            svfRefreshRosterSuggestions();

            if (!added.length && !gotPrincipal) {
                if (!silent) showToast('الطاقم مُدرجٌ أصلاً — لا جديد', 'error');
                return 0;
            }
            const bits = [];
            if (added.length) bits.push(added.length === 1 ? 'معلم واحد' : added.length + ' معلمين');
            if (gotPrincipal) bits.push('واسم المدير');
            showToast('من قاعدة المعلمين: ' + bits.join(' '));
            // أسماء المدير المختلفة بين السجلّات لا تُرجَّح — تُترك للمستخدم
            if (p.conflict && !svfValue('schoolPrincipal'))
                setTimeout(() => showToast('اسم المدير مختلفٌ بين سجلّات المدرسة — اكتبه بنفسك', 'error'), 2600);
            if (added.some(t => !t.load))
                setTimeout(() => showToast('بعض الأنصبة غير مسجّلة في القاعدة — راجعها', 'error'), 5200);
            return added.length;
        }

        // الاستدعاء التلقائيّ لا يجري إلّا والطاقم فارغ، فلا يُضاف شيءٌ فوق إدخالٍ قائم
        function svfAutoPullRoster() {
            const card = document.getElementById('teachersRosterCard');
            if (!card || card.classList.contains('hidden')) return;
            if (Array.isArray(schoolTeachers) && schoolTeachers.length) return;
            svfPullRoster(true);
        }

        // ── بيانات المعلّم في صفّ الإضافة: نصابه وصفوفه وجنسه ──
        function svfApplyRosterTeacher() {
            if (!svfLinked()) return;
            const typed = svfValue('stName');
            if (!typed) return;
            const hits = svfSchoolTeachers().filter(t => svfSameName(t.name, typed));
            if (hits.length !== 1) return;
            const t = hits[0];
            const nameEl = document.getElementById('stName');
            if (nameEl) nameEl.value = t.name;
            svfFillIfEmpty('stLoad', t.load);
            svfFillIfEmpty('stGrades', t.grades);
            const g = document.getElementById('stGender');
            if (g && t.gender) g.value = t.gender;
        }

        function initAutofillBindings() {
            svfRefreshSuggestions();
            document.addEventListener('svf-teachers-changed', svfRefreshSuggestions);

            const teacher = document.getElementById('teacherName');
            if (teacher) {
                teacher.addEventListener('change', svfApplyTeacherFromDb);
                teacher.addEventListener('blur', svfApplyTeacherFromDb);
            }

            const schoolName = document.getElementById('schoolName');
            if (schoolName) {
                // بعد مستمع school.js نفسه: الطاقم المحفوظ محلّياً أولى بالاستدعاء
                schoolName.addEventListener('blur', svfAutoPullRoster);
                schoolName.addEventListener('change', svfRefreshRosterSuggestions);
            }

            // الطاقم يظهر باختيار الزيارة الاستطلاعيّة — والاستدعاء بعد إظهاره
            const visitType = document.getElementById('visitTypeSelect');
            if (visitType) visitType.addEventListener('change', () => setTimeout(svfAutoPullRoster, 0));

            const stName = document.getElementById('stName');
            if (stName) stName.addEventListener('change', svfApplyRosterTeacher);

            const pull = document.getElementById('pullRosterBtn');
            if (pull) pull.addEventListener('click', () => svfPullRoster(false));
        }
