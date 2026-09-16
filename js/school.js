        // =========================================================================
        // 5. SCHOOL APP FUNCTIONS
        // =========================================================================
        function loadSchoolVisitTypes() {
            // استخدام مفتاح جديد تماماً لتجنب تعارض الـ Local Storage في Github Pages
            const newKey = 'supervision_v6_school_visit_types';
            const oldKey = 'school_visit_types';
            
            let storedTypes = localStorage.getItem(newKey) || localStorage.getItem(oldKey);
            
            if (storedTypes) { 
                try {
                    const parsed = JSON.parse(storedTypes); 
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        schoolVisitTypesData = parsed; 
                        // تنظيف وحماية البيانات القادمة من التخزين
                        Object.keys(schoolVisitTypesData).forEach(k => {
                            if (!schoolVisitTypesData[k] || typeof schoolVisitTypesData[k] !== 'object') {
                                schoolVisitTypesData[k] = { name: 'نوع غير محدد', objectives: [] };
                            }
                            if (!Array.isArray(schoolVisitTypesData[k].objectives)) {
                                schoolVisitTypesData[k].objectives = [];
                            }
                        });
                    } else {
                        schoolVisitTypesData = JSON.parse(JSON.stringify(defaultSchoolVisitTypesData));
                    }
                } catch(e) {
                    console.warn('تمت استعادة الإعدادات الافتراضية بسبب تلف في البيانات المخزنة.');
                    schoolVisitTypesData = JSON.parse(JSON.stringify(defaultSchoolVisitTypesData));
                }
            } else {
                schoolVisitTypesData = JSON.parse(JSON.stringify(defaultSchoolVisitTypesData));
                localStorage.setItem(newKey, JSON.stringify(schoolVisitTypesData));
            }
            // حذف الأنواع القديمة غير المرغوب فيها
            // 'private_exploratory' عاد نوعاً معتمداً (استطلاعية للمدارس الخاصة)،
            // فلا يُحذف — والحلقة أدناه تكتب نسخة الشيفرة فوق أيّ نسخةٍ قديمةٍ منه.
            const removedKeys = ['exploratory', 'technical', 'admin'];
            removedKeys.forEach(k => { delete schoolVisitTypesData[k]; });
            // تحديث الأنواع الافتراضية دائماً بأحدث نسخة من الكود
            Object.keys(defaultSchoolVisitTypesData).forEach(k => {
                schoolVisitTypesData[k] = JSON.parse(JSON.stringify(defaultSchoolVisitTypesData[k]));
            });
            localStorage.setItem(newKey, JSON.stringify(schoolVisitTypesData));
            populateSchoolVisitTypeDropdown();
            renderSchoolVisitTypesList();
        }

        function populateSchoolVisitTypeDropdown() {
            const visitTypeSelect = document.getElementById('visitTypeSelect');
            if(!visitTypeSelect) return;
            
            visitTypeSelect.innerHTML = '<option value="" disabled selected>اختر نوع الزيارة</option>';
            if(!schoolVisitTypesData || typeof schoolVisitTypesData !== 'object') return;
            
            Object.keys(schoolVisitTypesData).forEach(key => {
                if(!schoolVisitTypesData[key]) return;
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = schoolVisitTypesData[key].name || 'نوع مخصص';
                visitTypeSelect.appendChild(opt);
            });
        }

        // تطبيق فلتر التذكير/التأنيث والإفراد/الجمع على نص القالب
        // الوضع: 0=ذكر_جمع، 1=ذكر_مفرد، 2=أنثى_جمع، 3=أنثى_مفرد
        function applyGenderFilter(text, mode) {
            return text.replace(/\[([^\]]+)\]/g, (match, options) => {
                const parts = options.split('/');
                return parts[mode] !== undefined ? parts[mode] : parts[0];
            });
        }

        function getGenderMode() {
            return parseInt(document.querySelector('input[name="genderMode"]:checked')?.value || '0');
        }

        function renderSchoolObjectives(typeKey) {
            const objectivesContainer = document.getElementById('objectivesContainer');
            if(!objectivesContainer) return;

            const genderSelector = document.getElementById('genderNumberSelector');

            // حفظ الملاحظات والحالة قبل إعادة الرسم
            objectivesContainer.querySelectorAll('.objective-item').forEach((item, i) => {
                const noteInput = item.querySelector('.objective-note');
                if (noteInput && noteInput.value.trim()) objectiveNotes[i] = noteInput.value.trim();
                else delete objectiveNotes[i];
            });

            objectivesContainer.innerHTML = '';
            if(!schoolVisitTypesData) return;

            const typeData = schoolVisitTypesData[typeKey];
            if (typeData && Array.isArray(typeData.objectives)) {
                if (genderSelector) genderSelector.classList.remove('hidden');
                const mode = getGenderMode();
                typeData.objectives.forEach((obj, index) => {
                    if(!obj) return;
                    const resolved = applyGenderFilter(obj, mode);
                    const safeVal = resolved.replace(/"/g, '&quot;');
                    const savedNote = objectiveNotes[index] || '';
                    const hasNote = !!savedNote;

                    const div = document.createElement('div');
                    div.className = 'objective-item rounded-lg border ' + (hasNote ? 'border-amber-200 bg-amber-50' : 'border-transparent hover:bg-slate-50');
                    div.innerHTML = `
                        <div class="flex items-start gap-2 p-2">
                            <input type="checkbox" name="objectives" value="${safeVal}" id="obj-${index}" class="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
                            <label for="obj-${index}" class="flex-1 text-sm font-medium text-gray-900 cursor-pointer select-none whitespace-pre-line">${resolved}</label>
                            <button type="button" class="note-toggle flex-shrink-0 text-xs px-2 py-1 rounded-full border transition-all ${hasNote ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300'}" data-index="${index}" title="إضافة ملاحظة">
                                <i class="fa-solid fa-flag"></i>
                            </button>
                        </div>
                        <div class="note-area ${hasNote ? '' : 'hidden'} px-3 pb-2">
                            <input type="text" class="objective-note w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400" placeholder="اكتب الملاحظة ← ستتحول تلقائياً إلى توصية..." value="${savedNote.replace(/"/g, '&quot;')}">
                        </div>
                    `;
                    objectivesContainer.appendChild(div);
                });

                // ربط أزرار الملاحظة
                objectivesContainer.querySelectorAll('.note-toggle').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const item = btn.closest('.objective-item');
                        const noteArea = item.querySelector('.note-area');
                        const noteInput = item.querySelector('.objective-note');
                        const isHidden = noteArea.classList.toggle('hidden');
                        if (!isHidden) {
                            btn.className = btn.className.replace('bg-slate-100 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300', 'bg-amber-100 text-amber-700 border-amber-300');
                            item.className = 'objective-item rounded-lg border border-amber-200 bg-amber-50';
                            noteInput.focus();
                        } else {
                            noteInput.value = '';
                            delete objectiveNotes[btn.dataset.index];
                            btn.className = btn.className.replace('bg-amber-100 text-amber-700 border-amber-300', 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300');
                            item.className = 'objective-item rounded-lg border border-transparent hover:bg-slate-50';
                        }
                    });
                });
            } else {
                if (genderSelector) genderSelector.classList.add('hidden');
            }
        }

        // الجمل الإيجابية الافتراضية لكل نوع هدف
        function getPositiveAddition(text) {
            if (text.includes("الطابور")) return "، وكان الهتاف بصوت عالٍ والانصراف منظماً ومراسم رفع العلم صحيحة.";
            if (text.includes("خطة المنهاج") || text.includes("سجلات المتابعة")) return "، ويسير التنفيذ وفق الخطة الزمنية المقررة.";
            // الهدف قد يكون «تحديث قاعدة البيانات» نفسه، فلا يُضاف «وتحديثها» بعده
            if (text.includes("قاعدة بيانات")) return text.includes("تحديث")
                ? "، واستُكملت البيانات الناقصة." : " وتحديثها بصورة منتظمة.";
            if (text.includes("موافقات التعيين") || text.includes("البوابة التعليمية"))
                return "، وتبيّن استيفاء الموافقات [وأسماء المعلمين مدرجة/واسم المعلم مدرج/وأسماء المعلمات مدرجة/واسم المعلمة مدرج] بالبوابة.";
            if (text.includes("نصاب الحصص") || text.includes("توزيع الجدول"))
                return "، وكان التوزيع مطابقاً للنصاب المقرر.";
            if (text.includes("الملاعب") || text.includes("الأدوات الرياضية")) return "، وكانت الملاعب مهيأة والأدوات في حالة جيدة.";
            if (text.includes("الأدلة") || text.includes("كتاب الطالب")) return "، وتبين أن الطبعات حديثة ومتوفرة.";
            if (text.includes("النشرات") || text.includes("الوثائق")) return " وإبداء الملاحظات اللازمة.";
            if (text.includes("منافسات") || text.includes("ألعاب جماعية")) return " وتحقيق الأهداف المرجوة.";
            if (text.includes("التحضير") || text.includes("نور")) return "، وكانت الخطط مستوفية للمعايير المطلوبة.";
            if (text.includes("الالتقاء") || text.includes("مقابلة")) return ".";
            if (text.includes("الطابور") || text.includes("موقف صفي")) return "، وتمت المداولة الإشرافية.";
            if (text.includes("درجات") || text.includes("الاختبارات القصيرة")) return " وكانت مكتملة ومطابقة للمواصفات.";
            if (text.includes("سجلات")) return "، وكانت السجلات منظمة ومستوفاة.";
            return ".";
        }

        function renderSchoolClassroomVisits() {
            const classroomVisitsList = document.getElementById('classroomVisitsList');
            if(!classroomVisitsList) return;
            
            classroomVisitsList.innerHTML = '';
            if (!Array.isArray(schoolClassroomVisits) || schoolClassroomVisits.length === 0) {
                classroomVisitsList.innerHTML = '<p class="text-xs text-slate-400 italic p-2">لم تتم إضافة أي مواقف صفية بعد.</p>';
                return;
            }
            schoolClassroomVisits.forEach((visit, index) => {
                if(!visit) return;
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center bg-indigo-50 p-2 rounded-lg text-sm';
                div.innerHTML = `
                    <div class="flex-grow">
                        <span class="font-bold text-indigo-700">${visit.teacher || '-'}</span> 
                        <span class="text-slate-500 mx-1">|</span> 
                        <span class="text-slate-600">الصف ${visit.grade || '-'}</span>
                        <span class="text-slate-500 mx-1">|</span>
                        <span class="text-slate-600">الحصة ${visit.period || '-'}</span>
                        <span class="text-slate-500 mx-1">|</span>
                        <span class="text-slate-600">${visit.subject || '-'}</span>
                        <span class="text-slate-500 mx-1">|</span>
                        <span class="font-semibold text-slate-700">${visit.rating || '-'}</span>
                    </div>
                    <button type="button" class="text-red-500 hover:text-red-700 delete-visit-btn p-1" data-index="${index}">
                        <i class="fa-solid fa-times"></i>
                    </button>
                `;
                classroomVisitsList.appendChild(div);
            });
            
            document.querySelectorAll('#classroomVisitsList .delete-visit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = e.currentTarget.dataset.index;
                    if(schoolClassroomVisits && schoolClassroomVisits.length > idx) {
                        schoolClassroomVisits.splice(idx, 1);
                        renderSchoolClassroomVisits();
                    }
                });
            });
        }

        // =========================================================================
        //  طاقم المدرسة: المدير ومعلمو الرياضة وأنصبتهم
        //  يُعرض في الزيارات الاستطلاعيّة فقط، ويُدرَج في رأي الزائر عند التوليد.
        // =========================================================================
        const ROSTER_PREFIX = 'supervision_v6_school_roster_';

        function rosterKeyForSchool() {
            const name = (document.getElementById('schoolName')?.value || '').trim();
            return name ? ROSTER_PREFIX + name : '';
        }

        function readPrincipalFromForm() {
            schoolPrincipal = {
                name: (document.getElementById('schoolPrincipal')?.value || '').trim(),
                gender: document.getElementById('schoolPrincipalGender')?.value === 'm' ? 'm' : 'f'
            };
            return schoolPrincipal;
        }

        // يُحفظ باسم المدرسة لا برقم التقرير، فتُستدعى الأسماء في الزيارة القادمة
        function saveSchoolRoster() {
            const key = rosterKeyForSchool();
            if (!key) return;
            readPrincipalFromForm();
            try {
                localStorage.setItem(key, JSON.stringify({ principal: schoolPrincipal, teachers: schoolTeachers }));
            } catch (e) {}
        }

        function applyRosterToForm() {
            const p = document.getElementById('schoolPrincipal');
            const g = document.getElementById('schoolPrincipalGender');
            if (p) p.value = schoolPrincipal.name || '';
            if (g) g.value = schoolPrincipal.gender === 'm' ? 'm' : 'f';
            renderSchoolTeachers();
        }

        // لا يُستدعى الطاقم المحفوظ إلّا والقائمة فارغة، فلا يُطمس ما أدخله المستخدم
        function loadSchoolRosterForSchool() {
            if (Array.isArray(schoolTeachers) && schoolTeachers.length) return false;
            const key = rosterKeyForSchool();
            if (!key) return false;
            let data = null;
            try { data = JSON.parse(localStorage.getItem(key)); } catch (e) {}
            if (!data || typeof data !== 'object') return false;
            schoolTeachers = Array.isArray(data.teachers) ? data.teachers : [];
            if (data.principal && typeof data.principal === 'object') schoolPrincipal = data.principal;
            applyRosterToForm();
            if (schoolTeachers.length) showToast('استُدعي طاقم المدرسة: ' + schoolTeachers.length + ' معلماً');
            return true;
        }

        // القسم للزيارات الاستطلاعيّة وحدها — هكذا طلب المستخدم
        function isExploratoryType(typeKey) {
            const name = (schoolVisitTypesData && schoolVisitTypesData[typeKey] && schoolVisitTypesData[typeKey].name) || typeKey || '';
            return /استطلاع/.test(name);
        }

        function updateRosterVisibility(typeKey) {
            const card = document.getElementById('teachersRosterCard');
            if (!card) return;
            const show = isExploratoryType(typeKey);
            card.classList.toggle('hidden', !show);
            if (show) loadSchoolRosterForSchool();
        }

        function renderSchoolTeachers() {
            const list = document.getElementById('schoolTeachersList');
            if (!list) return;
            list.innerHTML = '';
            if (!Array.isArray(schoolTeachers) || !schoolTeachers.length) {
                list.innerHTML = '<p class="text-xs text-slate-400 italic p-2">لم يُضف أي معلم بعد.</p>';
                return;
            }
            schoolTeachers.forEach((t, index) => {
                if (!t) return;
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center bg-teal-50 p-2 rounded-lg text-sm';
                const bits = [];
                if (t.load) bits.push('النصاب ' + t.load);
                if (t.grades) bits.push('الصفوف ' + t.grades);
                if (t.section) bits.push(t.section);
                div.innerHTML = `
                    <div class="flex-grow">
                        <span class="font-bold text-teal-800">${t.name || '-'}</span>
                        <span class="text-slate-400 mx-1">|</span>
                        <span class="text-slate-600">${t.gender === 'm' ? 'معلم' : 'معلمة'}</span>
                        ${bits.length ? '<span class="text-slate-400 mx-1">|</span><span class="text-slate-600">' + bits.join(' – ') + '</span>' : ''}
                    </div>
                    <button type="button" class="text-red-500 hover:text-red-700 delete-teacher-btn p-1" data-index="${index}">
                        <i class="fa-solid fa-times"></i>
                    </button>
                `;
                list.appendChild(div);
            });

            list.querySelectorAll('.delete-teacher-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    const idx = Number(e.currentTarget.dataset.index);
                    if (schoolTeachers.length > idx) {
                        schoolTeachers.splice(idx, 1);
                        renderSchoolTeachers();
                        saveSchoolRoster();
                    }
                });
            });
        }

        function addSchoolTeacher() {
            const name = document.getElementById('stName')?.value.trim();
            if (!name) { showToast('اكتب اسم المعلم أولاً', 'error'); return; }

            if (!Array.isArray(schoolTeachers)) schoolTeachers = [];
            schoolTeachers.push({
                name:    name,
                gender:  document.getElementById('stGender')?.value === 'm' ? 'm' : 'f',
                load:    (document.getElementById('stLoad')?.value || '').trim(),
                grades:  (document.getElementById('stGrades')?.value || '').trim(),
                section: document.getElementById('stSection')?.value || ''
            });
            renderSchoolTeachers();
            saveSchoolRoster();

            ['stName', 'stLoad', 'stGrades'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('stName')?.focus();
            showToast('أُضيف ' + name);
        }

        // «معلم» أو «معلمة» أو «معلمي» أو «معلمات» بحسب العدد والجنس الفعليّين،
        // فمفتاح الجنس والعدد في النموذج لا يعرف مَن في الطاقم.
        function rosterList() {
            return Array.isArray(schoolTeachers) ? schoolTeachers.filter(t => t && t.name) : [];
        }

        function teachersWord() {
            const list = rosterList();
            if (list.length === 1) return list[0].gender === 'm' ? 'معلم' : 'معلمة';
            return list.every(t => t.gender === 'f') ? 'معلمات' : 'معلمي';
        }

        function teacherNames() {
            return rosterList().map(t => t.name).join('، ');
        }

        // بند المقابلة من الطاقم: اسم المدير بعد «المدرسة»، وأسماء المعلمين بعد كلمتهم
        function buildMeetSentence(text) {
            let s = text.endsWith('.') ? text.slice(0, -1) : text;
            if (schoolPrincipal.name) {
                // جنس المدير يُعرف من بياناته لا من مفتاح النموذج: قد تكون مديرةً
                // والطاقم معلمين، وهو ما لا يستطيعه مفتاحٌ واحدٌ للنصّ كلّه.
                const male = schoolPrincipal.gender === 'm';
                s = s.replace(/الفاضلة|الفاضل/, male ? 'الفاضل' : 'الفاضلة')
                     .replace(/مديرة المدرسة|مدير المدرسة/, (male ? 'مدير' : 'مديرة') + ' المدرسة');
                if (s.includes('المدرسة')) s = s.replace('المدرسة', 'المدرسة ' + schoolPrincipal.name);
            }
            if (rosterList().length) {
                const names = ' (' + teacherNames() + ')';
                // كلمة المعلّمين تُشتقّ من الطاقم نفسه لا من مفتاح الجنس والعدد
                const m = s.match(/(معلمي|معلمات|معلمة|معلم)(\s+الرياضة[^,،.]*)/);
                s = m ? s.replace(m[0], teachersWord() + m[2] + names) : s + names;
            }
            return s;
        }

        // سطر النصاب لكلّ معلم: «ا.غسان (23) حصة ويدرس الصفوف (5-12) ذكور.»
        function teacherLoadLines() {
            return rosterList().map(t => {
                let s = t.name;
                if (t.load) s += ` (${t.load}) حصة`;
                if (t.grades) s += ` ${t.gender === 'm' ? 'ويدرس' : 'وتدرس'} الصفوف (${t.grades})`;
                if (t.section) s += ` ${t.section}`;
                return s + '.';
            });
        }

        function addSchoolClassroomVisit() {
            const teacher = document.getElementById('cvTeacher')?.value.trim();
            const grade = document.getElementById('cvGrade')?.value.trim();
            const period = document.getElementById('cvPeriod')?.value.trim();
            const subject = document.getElementById('cvSubject')?.value.trim();
            const rating = document.getElementById('cvRating')?.value;
            
            if (!teacher || !grade || !subject || !period) {
                showToast('يرجى تعبئة جميع بيانات الموقف الصفي', 'error');
                return;
            }
            
            if(!Array.isArray(schoolClassroomVisits)) schoolClassroomVisits = [];
            schoolClassroomVisits.push({ teacher, grade, period, subject, rating });
            renderSchoolClassroomVisits();
            
            if(document.getElementById('cvTeacher')) document.getElementById('cvTeacher').value = '';
            if(document.getElementById('cvGrade')) document.getElementById('cvGrade').value = '';
            if(document.getElementById('cvPeriod')) document.getElementById('cvPeriod').value = '';
            if(document.getElementById('cvSubject')) document.getElementById('cvSubject').value = '';
            
            showToast('تمت إضافة الموقف الصفي');
        }

        function renderSchoolReportsList() {
            const reportsListContainer = document.querySelector('#schoolDashboardView #reportsListContainer');
            if(!reportsListContainer) return;
            
            reportsListContainer.innerHTML = '';
            const reports = [];
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('supervision_v6_school_report_') || key.startsWith('school_report_')) {
                    try {
                        const parsedItem = JSON.parse(localStorage.getItem(key));
                        if(parsedItem && typeof parsedItem === 'object') {
                            reports.push({ key, ...parsedItem });
                        }
                    } catch(e) {
                        console.warn('Skipping invalid school report data structure for key:', key);
                    }
                }
            }
            
            reports.sort((a, b) => {
                const dateA = a.visitDate ? new Date(a.visitDate).getTime() : 0;
                const dateB = b.visitDate ? new Date(b.visitDate).getTime() : 0;
                return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
            });
            
            if (reports.length === 0) {
                reportsListContainer.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400"><i class="fa-solid fa-folder-open text-4xl mb-2"></i><p>لا توجد تقارير محفوظة.</p></div>';
                return;
            }
            
            reports.forEach(report => {
                const typeName = (schoolVisitTypesData && schoolVisitTypesData[report.visitType]) ? schoolVisitTypesData[report.visitType].name : 'غير محدد';
                const card = document.createElement('div');
                card.className = 'bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col';
                const objLen = Array.isArray(report.objectives) ? report.objectives.length : 0;

                // التحديد للرفع إلى البوّابة، ووسم حالة الزيارة
                const picked = window.svfSchoolSelected ? window.svfSchoolSelected.has(report.key) : false;
                const portalDate = (report.visitDate || '').includes('-')
                    ? report.visitDate.split('-').reverse().join('/') : (report.visitDate || '');
                let stateBadge = '';
                if (window.svfSchoolIsSent && window.svfSchoolIsSent(report.schoolName || '', portalDate)) {
                    stateBadge = `<span class="text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">حُفظت في البوابة</span>`;
                } else if (window.svfSchoolIsQueued && window.svfSchoolIsQueued(report.key)) {
                    stateBadge = `<span class="text-[11px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full" title="رُفعت إلى البوابة من هنا — تأكيد الحفظ يحدث داخل البوابة">سبق رفعها</span>`;
                }

                card.innerHTML = `
                    <label class="flex items-center gap-2 mb-3 cursor-pointer select-none">
                        <input type="checkbox" class="queue-pick-school w-4 h-4 accent-green-700" data-key="${report.key}" ${picked ? 'checked' : ''}>
                        <span class="text-xs text-slate-500">تحديد للرفع</span>
                        ${stateBadge}
                    </label>
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="font-bold text-lg text-slate-800">${report.schoolName || 'بدون اسم'}</h3>
                        <span class="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200">${typeName}</span>
                    </div>
                    <div class="text-sm text-slate-500 mb-4 space-y-1">
                        <div class="flex items-center"><i class="fa-regular fa-calendar ml-2 w-4"></i> ${report.visitDate || '-'}</div>
                        <div class="flex items-center"><i class="fa-solid fa-check-double ml-2 w-4"></i> ${objLen} أهداف محققة</div>
                    </div>
                    <div class="mt-auto flex gap-2 pt-3 border-t border-slate-100">
                        <button class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-sm font-medium transition-colors view-report-btn" data-key="${report.key}">عرض</button>
                        <button class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg text-sm font-medium transition-colors edit-report-btn" data-key="${report.key}">تعديل</button>
                        <button class="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg text-sm font-medium transition-colors delete-report-btn" data-key="${report.key}">حذف</button>
                    </div>
                `;
                reportsListContainer.appendChild(card);
            });

            if (typeof window.svfSchoolUpdateSelectionUI === 'function') window.svfSchoolUpdateSelectionUI();
        }

        function collectCheckedObjectivesWithNotes() {
            const result = [];
            const reportForm = document.getElementById('reportForm');
            if (!reportForm) return result;
            reportForm.querySelectorAll('.objective-item').forEach(item => {
                const cb = item.querySelector('input[name="objectives"]');
                if (cb && cb.checked) {
                    const noteInput = item.querySelector('.objective-note');
                    result.push({ text: cb.value, note: noteInput ? noteInput.value.trim() : '' });
                }
            });
            return result;
        }

        // «تم» للجميع باعتماد المستخدم: نموذجه المعتمد يكتب «تم متابعة» و«تم مقابلة»
        // لا «تمت»، وتوحيد الصياغة في السجلّ الرسميّ مقدَّمٌ على مطابقة تأنيث المصدر.
        function convertObjectiveToPast(text) {
            return "تم " + text;
        }

        // الأرقام تُحاط بأقواس ليستقيم عرضها في نصٍّ من اليمين إلى اليسار،
        // لكن ترقيم البنود يبقى كما هو («3- » لا «(3)- »)، وما كان بين قوسين
        // أصلاً لا يُغلَّف مرّةً ثانية («الحصة (2)» لا «الحصة ((2))»).
        function wrapNumbersInOpinion(text) {
            // ما بين قوسين يُترك كما هو كتلةً واحدة، وإلّا مُزّق «(5-12)» إلى «(5-(1)2)»
            const wrap = s => s.split(/(\([^()]*\))/g)
                .map(part => part.startsWith('(') ? part : part.replace(/\d[\d\/\-\.:]*\d|\d/g, '($&)'))
                .join('');
            return text.split('\n').map(line => {
                const m = line.match(/^(\s*(?:•\s*)?\d+-\s+)([\s\S]*)$/);
                return m ? m[1] + wrap(m[2]) : wrap(line);
            }).join('\n');
        }

        // وصل الملاحظة بجملة الهدف: بلا نقطةٍ قبل الفاصلة، و«أنّه» مع النفي
        function withNote(stem, note) {
            const s = stem.endsWith('.') ? stem.slice(0, -1) : stem;
            if (!note) return s + '.';
            const anna = /^(لا|لم|ليس|ما)\s/.test(note) ? 'أنّه' : 'أنّ';
            const out = `${s}، وقد لوحظ ${anna} ${note}`;
            return out.endsWith('.') ? out : out + '.';
        }

        function generateSchoolSmartVisitorOpinion() {
            const reportForm = document.getElementById('reportForm');
            if (!reportForm) return;
            const checkedItems = collectCheckedObjectivesWithNotes();

            if (checkedItems.length === 0 && (!Array.isArray(schoolClassroomVisits) || schoolClassroomVisits.length === 0)) {
                showToast('يرجى تحديد الأهداف أو إضافة مواقف صفية أولاً', 'error');
                return;
            }

            let opinionText = "";
            let counter = 1;
            let classroomVisitsHandled = false;

            const ratedPrevRecs = prevRecommendationsStatus.filter(r => r.status);
            const prevDate = document.getElementById('prevRecsDate')?.textContent || '-';
            const hasClassroomVisits = Array.isArray(schoolClassroomVisits) && schoolClassroomVisits.length > 0;

            checkedItems.forEach(({ text: obj, note }) => {
                let text = obj.trim().replace(/^[\d٠-٩]+\s*[-–]\s*/, '');
                text = convertObjectiveToPast(text);

                // دمج التوصيات السابقة داخل هدف "التوصيات السابقة" مباشرةً
                const isPrevRecsObj = obj.includes("التوصيات السابقة");
                if (isPrevRecsObj && ratedPrevRecs.length > 0) {
                    opinionText += `${counter}- تم متابعة التوصيات السابقة بتاريخ ${prevDate}، وتبيّن الآتي:\n`;
                    ratedPrevRecs.forEach(r => {
                        const label = r.status === 'done'    ? 'تم تنفيذها'
                                    : r.status === 'partial' ? 'تم تنفيذها جزئياً'
                                    :                          'لم يتم تنفيذها';
                        opinionText += `   • ${r.text}: ${label}.\n`;
                    });
                    counter++;
                    return;
                }

                // ── إدراج طاقم المدرسة في بنديه ──
                const roster = Array.isArray(schoolTeachers) ? schoolTeachers.filter(t => t && t.name) : [];
                const isMeetObj = obj.includes("مقابلة") || obj.includes("الالتقاء");
                const isLoadObj = obj.includes("نصاب") || obj.includes("توزيع الجدول");

                if (isMeetObj && (roster.length || schoolPrincipal.name)) {
                    opinionText += counter + "- " + withNote(buildMeetSentence(text), note) + "\n";
                    counter++;
                    return;
                }

                if (isLoadObj && roster.length) {
                    let stem = text.endsWith('.') ? text.slice(0, -1) : text;
                    if (note) stem = withNote(stem, note).replace(/\.$/, '');
                    opinionText += counter + "- " + stem + "، وكان التوزيع كالآتي:\n";
                    teacherLoadLines().forEach(l => { opinionText += '   ' + l + '\n'; });
                    counter++;
                    return;
                }

                const isClassroomObj = obj.includes("موقف صفي") || obj.includes("مداولة");

                if (isClassroomObj && hasClassroomVisits) {
                    // دمج تفاصيل المواقف الصفية داخل هذا الهدف مباشرةً
                    opinionText += counter + "- " + text + "، وذلك على النحو الآتي:\n";
                    schoolClassroomVisits.forEach(cv => {
                        // بلا اسم المعلّم: رأي الزائر سجلٌّ عن المدرسة لا عن الأشخاص
                        opinionText += `   • الحصة (${cv.period}): درس ${cv.subject} – الصف ${cv.grade}، وكان مستوى الأداء ${cv.rating}.\n`;
                    });
                    classroomVisitsHandled = true;
                } else if (note) {
                    opinionText += counter + "- " + withNote(text, note) + "\n";
                } else {
                    const base = text.endsWith('.') ? text.slice(0, -1) : text;
                    // الإضافة قد تحمل بدائل تذكيرٍ وتأنيثٍ مثل نصّ الهدف نفسه
                    text = base + applyGenderFilter(getPositiveAddition(base), getGenderMode());
                    opinionText += counter + "- " + text + "\n";
                }
                counter++;
            });

            // إضافة المواقف الصفية كبند مستقل فقط إذا لم يُعالَج ضمن هدف "موقف صفي"
            if (!classroomVisitsHandled && hasClassroomVisits) {
                opinionText += counter + "- تم حضور مواقف صفية وإجراء المداولة الإشرافية، وذلك على النحو الآتي:\n";
                schoolClassroomVisits.forEach(cv => {
                    // بلا اسم المعلّم هنا أيضاً — الحالتان تكتبان السطر نفسه
                    opinionText += `   • الحصة (${cv.period}): درس ${cv.subject} – الصف ${cv.grade}، وكان مستوى الأداء ${cv.rating}.\n`;
                });
            }

            const visOp = document.getElementById('visitorOpinion');
            if(visOp) {
                visOp.value = wrapNumbersInOpinion(opinionText.trim());
                showToast('تم توليد رأي الزائر بنجاح');
            }
        }

        function buildActionableRecommendation(objText) {
            const t = objText.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim();
            if (t.includes("خطة المنهاج") || t.includes("سجلات المتابعة") || t.includes("التحضير") || t.includes("نور"))
                return "متابعة المعلمين بالتحضير بشكل مستمر وإعداد سجلاتهم المنظمة للعمل";
            if (t.includes("الطابور"))
                return "العمل على تحسين تنظيم الطابور المدرسي ورفع مستوى الهتاف وضبط الانضباط";
            if (t.includes("الملاعب") || t.includes("الأدوات الرياضية"))
                return "متابعة صيانة الملاعب وتجهيز الأدوات الرياضية وإزالة أي مخاطر تؤثر على سلامة الطلاب";
            if (t.includes("الأدلة") || t.includes("كتاب الطالب"))
                return "متابعة استلام الأدلة وكتب الطالب والتأكد من توافرها بطبعاتها الحديثة";
            if (t.includes("النشرات") || t.includes("الوثائق"))
                return "متابعة تطبيق النشرات والتعاميم الواردة والحرص على مناقشتها مع الكادر التعليمي";
            if (t.includes("منافسات") || t.includes("ألعاب جماعية"))
                return "التأكيد على تنفيذ الحصة في شكل منافسات وألعاب جماعية تحقق الأهداف المرجوة";
            if (t.includes("قاعدة بيانات"))
                return "إتمام تحديث قاعدة بيانات المعلمين وضمان دقة المعلومات المدخلة";
            if (t.includes("موافقات التعيين") || t.includes("موافقات"))
                return "متابعة استيفاء موافقات التعيين وإنجاز الإجراءات الرسمية المتعلقة بها";
            if (t.includes("مقابلة") || t.includes("الالتقاء"))
                return "الحرص على التواصل المستمر مع الكادر التعليمي وإدارة المدرسة ومتابعة المستجدات";
            if (t.includes("موقف صفي") || t.includes("مداولة"))
                return "متابعة تطوير الأداء التدريسي وتطبيق توصيات المداولة الإشرافية";
            // عام
            return "متابعة " + t.replace(/^(متابعة|حضور|تحديث|شرح|مقابلة)\s+/i, '');
        }

        function generateSchoolRecommendations() {
            const notedItems = collectCheckedObjectivesWithNotes().filter(i => i.note);

            const recEl = document.getElementById('recommendations');
            if (!recEl) return;

            if (notedItems.length === 0) {
                recEl.value = '';
                showToast('لا توجد ملاحظات — لا توصيات مطلوبة', 'info');
                return;
            }

            let rec = 'نوصي إدارة المدرسة بالآتي:\n';
            notedItems.forEach(({ text: objText }) => {
                let recommendation = buildActionableRecommendation(objText);
                if (!recommendation.endsWith('.')) recommendation += '.';
                rec += `- ${recommendation}\n`;
            });

            recEl.value = rec.trim();
            showToast('تم توليد التوصيات بنجاح');
        }

        function startSchoolDictation(targetId, btn) {
            if (!recognition) { showToast('المتصفح لا يدعم الإملاء الصوتي', 'error'); return; }
            const target = document.getElementById(targetId);
            if(!target) return;
            btn.classList.add('recording');
            recognition.start();
            recognition.onresult = (event) => { 
                const current = target.value;
                const newText = event.results[0][0].transcript;
                target.value = current + (current.length > 0 ? ' ' : '') + newText;
            };
            recognition.onspeechend = () => recognition.stop();
            recognition.onend = () => { btn.classList.remove('recording'); };
        }

        function getPreviousReportForSchool(schoolName, excludeId) {
            const reports = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('supervision_v6_school_report_') || key.startsWith('school_report_')) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        if (data && data.schoolName === schoolName && data.recommendations && key !== excludeId) {
                            reports.push({ ...data, _key: key });
                        }
                    } catch(e) {}
                }
            }
            reports.sort((a, b) => new Date(b.visitDate || 0) - new Date(a.visitDate || 0));
            return reports[0] || null;
        }

        function parseRecommendationLines(recsText) {
            if (!recsText) return [];
            return recsText.split('\n')
                .map(l => l.trim())
                .filter(l => l.startsWith('-'))
                .map(l => l.replace(/^-\s*/, '').trim())
                .filter(Boolean);
        }

        function loadPreviousRecommendations() {
            const schoolName = document.getElementById('schoolName')?.value.trim();
            const currentId  = document.getElementById('reportId')?.value;
            const panel      = document.getElementById('prevRecsPanel');
            if (!panel) return;

            prevRecommendationsStatus = [];

            if (!schoolName) { panel.classList.add('hidden'); return; }

            const prev = getPreviousReportForSchool(schoolName, currentId);
            if (!prev) { panel.classList.add('hidden'); return; }

            const recs = parseRecommendationLines(prev.recommendations);
            if (recs.length === 0) { panel.classList.add('hidden'); return; }

            panel.classList.remove('hidden');
            const dateEl = document.getElementById('prevRecsDate');
            if (dateEl) dateEl.textContent = prev.visitDate || '-';

            prevRecommendationsStatus = recs.map(r => ({ text: r, status: null }));

            const listEl = document.getElementById('prevRecsList');
            if (!listEl) return;
            listEl.innerHTML = '';

            recs.forEach((rec, idx) => {
                const div = document.createElement('div');
                div.className = 'prev-rec-item bg-white rounded-xl border border-amber-100 p-3 space-y-2';
                div.innerHTML = `
                    <p class="text-sm text-slate-700 font-medium">${idx + 1}. ${rec}</p>
                    <div class="flex gap-2">
                        <button type="button" class="prev-rec-btn flex-1 text-xs py-2 rounded-lg border border-slate-200 text-slate-500 hover:border-green-400 hover:bg-green-50 hover:text-green-700 transition-all" data-idx="${idx}" data-status="done">✅ نُفِّذت</button>
                        <button type="button" class="prev-rec-btn flex-1 text-xs py-2 rounded-lg border border-slate-200 text-slate-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-all" data-idx="${idx}" data-status="partial">⚠️ جزئياً</button>
                        <button type="button" class="prev-rec-btn flex-1 text-xs py-2 rounded-lg border border-slate-200 text-slate-500 hover:border-red-400 hover:bg-red-50 hover:text-red-700 transition-all" data-idx="${idx}" data-status="not-done">❌ لم تُنفَّذ</button>
                    </div>
                `;
                listEl.appendChild(div);
            });

            listEl.querySelectorAll('.prev-rec-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx    = parseInt(btn.dataset.idx);
                    const status = btn.dataset.status;
                    prevRecommendationsStatus[idx].status = status;

                    const siblings = btn.closest('.prev-rec-item').querySelectorAll('.prev-rec-btn');
                    siblings.forEach(s => {
                        s.className = 'prev-rec-btn flex-1 text-xs py-2 rounded-lg border border-slate-200 text-slate-500 hover:border-green-400 hover:bg-green-50 hover:text-green-700 transition-all';
                    });
                    if (status === 'done')
                        btn.className = 'prev-rec-btn flex-1 text-xs py-2 rounded-lg border border-green-400 bg-green-50 text-green-700 font-bold transition-all';
                    else if (status === 'partial')
                        btn.className = 'prev-rec-btn flex-1 text-xs py-2 rounded-lg border border-amber-400 bg-amber-50 text-amber-700 font-bold transition-all';
                    else
                        btn.className = 'prev-rec-btn flex-1 text-xs py-2 rounded-lg border border-red-400 bg-red-50 text-red-700 font-bold transition-all';
                });
            });
        }

        function saveSchoolReport(e) {
            e.preventDefault();
            const reportForm = document.getElementById('reportForm');
            if(!reportForm) return;
            const formData = new FormData(reportForm);
            const objectives = [];
            reportForm.querySelectorAll('input[name="objectives"]:checked').forEach(cb => objectives.push(cb.value));
            
            const rId = document.getElementById('reportId')?.value;
            const reportId = rId ? rId : `supervision_v6_school_report_${Date.now()}`;
            const visitType = document.getElementById('visitTypeSelect')?.value;
            
            if (!visitType) { 
                showToast('يرجى اختيار نوع الزيارة', 'error'); 
                return; 
            }
            
            const reportData = {
                id: reportId,
                // المشرف صاحب التقرير — يُكتب من الهويّة إن رُبطت
                supervisor: svfSupervisorName(),
                updatedAt: Date.now(),
                schoolName: formData.get('schoolName') || '',
                visitDate: formData.get('visitDate') || '',
                visitType: visitType,
                objectives: objectives,
                arrivalTime: document.getElementById('schoolArrivalTime')?.value || '',
                departureTime: document.getElementById('schoolDepartureTime')?.value || '',
                classroomVisits: Array.isArray(schoolClassroomVisits) ? schoolClassroomVisits : [],
                teachers: Array.isArray(schoolTeachers) ? schoolTeachers : [],
                principal: readPrincipalFromForm(),
                visitorOpinion: document.getElementById('visitorOpinion')?.value || '',
                recommendations: document.getElementById('recommendations')?.value || ''
            };
            
            try {
                localStorage.setItem(reportId, JSON.stringify(reportData));
                saveSchoolRoster();   // ليُستدعى الطاقم في الزيارة القادمة لهذه المدرسة
                try { if (window.SupervisorCloud) SupervisorCloud.push(reportId); } catch (e) {}
                showToast('تم حفظ التقرير بنجاح');
                showSchoolDashboard();
            } catch(error) {
                showToast('خطأ: لا توجد مساحة كافية للحفظ', 'error');
            }
        }

        function editSchoolReport(key) {
            try {
                const report = JSON.parse(localStorage.getItem(key));
                if (!report || typeof report !== 'object') return;
                
                if(document.getElementById('reportId')) document.getElementById('reportId').value = key;
                if(document.getElementById('schoolName')) document.getElementById('schoolName').value = report.schoolName || '';
                if(document.getElementById('schoolVisitDate')) document.getElementById('schoolVisitDate').value = report.visitDate || '';
                if(document.getElementById('visitTypeSelect')) document.getElementById('visitTypeSelect').value = report.visitType || '';
                if(document.getElementById('visitorOpinion')) document.getElementById('visitorOpinion').value = report.visitorOpinion || '';
                if(document.getElementById('recommendations')) document.getElementById('recommendations').value = report.recommendations || '';
                if(report.arrivalTime && document.getElementById('schoolArrivalTime')) document.getElementById('schoolArrivalTime').value = report.arrivalTime;
                if(report.departureTime && document.getElementById('schoolDepartureTime')) document.getElementById('schoolDepartureTime').value = report.departureTime;

                schoolClassroomVisits = Array.isArray(report.classroomVisits) ? report.classroomVisits : [];
                schoolTeachers = Array.isArray(report.teachers) ? report.teachers : [];
                schoolPrincipal = (report.principal && typeof report.principal === 'object')
                    ? report.principal : { name: '', gender: 'f' };
                prevRecommendationsStatus = [];
                renderSchoolClassroomVisits();
                applyRosterToForm();
                updateRosterVisibility(report.visitType);
                renderSchoolObjectives(report.visitType);
                // تحميل توصيات الزيارة السابقة لهذه المدرسة (باستثناء التقرير الحالي)
                setTimeout(() => loadPreviousRecommendations(), 50);

                if (Array.isArray(report.objectives)) {
                    setTimeout(() => {
                        report.objectives.forEach(objVal => {
                            const cb = Array.from(document.querySelectorAll('input[name="objectives"]')).find(el => el.value === objVal);
                            if (cb) cb.checked = true;
                        });
                    }, 0);
                }
                showSchoolForm();
            } catch(e) {
                showToast('خطأ في استرجاع التقرير', 'error');
            }
        }

        function viewSchoolReport(key) {
            try {
                const report = JSON.parse(localStorage.getItem(key));
                if (!report || typeof report !== 'object') {
                    showToast('ملف التقرير تالف', 'error');
                    return;
                }
                
                generateSchoolPreview(report);
                document.getElementById('schoolFormView')?.classList.add('hidden');
                document.getElementById('schoolDashboardView')?.classList.add('hidden');
                document.getElementById('reportPreviewContainer')?.classList.remove('hidden');
            } catch (e) {
                 showToast('لا يمكن قراءة ملف التقرير', 'error');
            }
        }

        // `fromForm`: المعاينة جاءت من زرّ «معاينة» والنموذج معمورٌ بما كُتب
        // فيه، لا من سجلّ التقارير حيث النموذج فارغ. الفرق كلّه في زرّ الرجوع.
        function generateSchoolPreview(report, fromForm) {
            const typeName = (schoolVisitTypesData && schoolVisitTypesData[report.visitType]) ? schoolVisitTypesData[report.visitType].name : 'زيارة مدرسية';
            let objectivesHtml = '<ol class="list-decimal list-inside space-y-1 text-slate-700 mt-2">';
            
            if(Array.isArray(report.objectives) && report.objectives.length > 0) {
                report.objectives.forEach(obj => objectivesHtml += `<li>${obj.replace(/^[\d٠-٩]+\s*[-–]\s*/, '')}</li>`);
            } else {
                objectivesHtml += '<li class="text-slate-400 italic">لا توجد أهداف محددة.</li>';
            }
            objectivesHtml += '</ol>';

            // اسم المشرف يظهر في ذيل التقرير حين يكون معروفاً — من التقرير
            // المحفوظ أوّلاً (فتقاريرُ غيره تُعرض باسم كاتبها) ثمّ من الهويّة
            const visitor = (report.supervisor || svfSupervisorName() || '').trim();
            const visitorLine = visitor
                ? `<div class="mt-10 pt-4 border-t border-slate-200 text-sm font-bold text-slate-700">
                       اسم الزائر: ${visitor}
                   </div>`
                : '';

            const content = `
                <div class="text-center mb-8 border-b pb-6">
                    <h2 class="text-2xl font-bold text-slate-900 mb-2">تقرير زيارة مدرسية</h2>
                    <span class="inline-block bg-slate-100 rounded-full px-4 py-1 text-sm font-semibold text-slate-600">${typeName}</span>
                </div>
                <div class="grid grid-cols-2 gap-6 mb-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">المدرسة</p>
                        <p class="font-bold text-lg text-slate-800">${report.schoolName || '-'}</p>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">التاريخ</p>
                        <p class="font-bold text-lg text-slate-800">${report.visitDate || '-'}</p>
                    </div>
                </div>
                <div class="mb-8">
                    <h3 class="text-lg font-bold text-slate-800 mb-3 border-r-4 border-blue-500 pr-3">أولاً: أهداف الزيارة</h3>
                    <div class="bg-white border border-slate-200 rounded-xl p-5">${objectivesHtml}</div>
                </div>
                <div class="mb-8">
                    <h3 class="text-lg font-bold text-slate-800 mb-3 border-r-4 border-purple-500 pr-3">ثانياً: رأي الزائر</h3>
                    <div class="bg-white border border-slate-200 rounded-xl p-5 min-h-[100px] whitespace-pre-wrap">${report.visitorOpinion || 'لا يوجد رأي للزائر.'}</div>
                </div>
                <div class="mb-8">
                    <h3 class="text-lg font-bold text-slate-800 mb-3 border-r-4 border-green-500 pr-3">ثالثاً: التوصيات والملاحظات</h3>
                    <div class="bg-white border border-slate-200 rounded-xl p-5 min-h-[100px] whitespace-pre-wrap">${report.recommendations || 'لا توجد توصيات.'}</div>
                </div>
                ${visitorLine}
            `;
            const repContent = document.getElementById('reportContent');
            if(repContent) repContent.innerHTML = content;
            
            const btnBack = document.getElementById('backToFormBtn');
            if(btnBack) {
                btnBack.onclick = () => {
                    /* الرجوع من معاينةِ النموذج لا يُعيد تحميل شيء: النموذج لم
                       يُمَسّ، إنّما أُخفي. وإعادةُ تحميله كانت تمحو كلّ ما لم
                       يُحفظ بعد — فرأيُ الزائر المولَّد يختفي، ومعه الطاقم
                       وأوقات الوصول والانصراف، لأنّ حمولة المعاينة لا تحملها. */
                    if (fromForm) { showSchoolForm(); return; }
                    if(document.getElementById('reportId')) document.getElementById('reportId').value = report.id || '';
                    if(report.id) {
                        editSchoolReport(report.id);
                    } else {
                        if(document.getElementById('schoolName')) document.getElementById('schoolName').value = report.schoolName || '';
                        if(document.getElementById('schoolVisitDate')) document.getElementById('schoolVisitDate').value = report.visitDate || '';
                        if(document.getElementById('visitTypeSelect')) document.getElementById('visitTypeSelect').value = report.visitType || '';
                        if(document.getElementById('visitorOpinion')) document.getElementById('visitorOpinion').value = report.visitorOpinion || '';
                        if(document.getElementById('recommendations')) document.getElementById('recommendations').value = report.recommendations || '';
                        schoolClassroomVisits = Array.isArray(report.classroomVisits) ? report.classroomVisits : [];
                        schoolTeachers = Array.isArray(report.teachers) ? report.teachers : [];
                        schoolPrincipal = (report.principal && typeof report.principal === 'object')
                            ? report.principal : { name: '', gender: 'f' };
                        renderSchoolClassroomVisits();
                        applyRosterToForm();
                        updateRosterVisibility(report.visitType);
                        renderSchoolObjectives(report.visitType);
                        setTimeout(() => { 
                            if(Array.isArray(report.objectives)) {
                                report.objectives.forEach(val => { 
                                    const cb = Array.from(document.querySelectorAll('input[name="objectives"]')).find(el => el.value === val); 
                                    if(cb) cb.checked = true; 
                                });
                            }
                        }, 0);
                        showSchoolForm();
                    }
                };
            }
        }

        function deleteSchoolReport(key) {
            if(confirm('هل أنت متأكد من حذف هذا التقرير؟')) {
                const raw = localStorage.getItem(key);
                localStorage.removeItem(key);
                // نصّه يُرفع مع علامة الحذف فيبقى قابلاً للإرجاع
                try { if (window.SupervisorCloud) SupervisorCloud.remove(key, raw); } catch (e) {}
                renderSchoolReportsList();
                showToast('تم الحذف بنجاح');
            }
        }

        function renderSchoolVisitTypesList() {
            const visitTypesList = document.getElementById('visitTypesList');
            if(!visitTypesList) return;
            
            visitTypesList.innerHTML = '';
            if(!schoolVisitTypesData || typeof schoolVisitTypesData !== 'object') return;
            
            Object.keys(schoolVisitTypesData).forEach(key => {
                const type = schoolVisitTypesData[key];
                if (!type || typeof type !== 'object') return; // حماية من البيانات التالفة
                
                const div = document.createElement('div');
                div.className = 'p-3 bg-slate-50 rounded-lg border border-slate-200';
                
                const objArray = Array.isArray(type.objectives) ? type.objectives : [];
                const objectivesList = objArray.map(obj => `<li class="text-xs text-slate-600 truncate">• ${obj}</li>`).join('');
                
                div.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-slate-700">${type.name || 'بدون اسم'}</h4>
                        <div class="flex gap-2">
                            <button class="text-blue-500 hover:text-blue-700 edit-type-btn p-1" data-key="${key}">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="text-red-500 hover:text-red-700 delete-type-btn p-1" data-key="${key}">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <ul class="pl-2 space-y-1 max-h-20 overflow-y-auto custom-scrollbar">${objectivesList}</ul>
                `;
                visitTypesList.appendChild(div);
            });
        }

        function showSchoolDashboard() {
            document.getElementById('schoolDashboardView')?.classList.remove('hidden');
            document.getElementById('schoolFormView')?.classList.add('hidden');
            document.getElementById('reportPreviewContainer')?.classList.add('hidden');
            renderSchoolReportsList();
        }
        
        function showSchoolForm() {
            document.getElementById('schoolDashboardView')?.classList.add('hidden');
            document.getElementById('schoolFormView')?.classList.remove('hidden');
            document.getElementById('reportPreviewContainer')?.classList.add('hidden');
        }

