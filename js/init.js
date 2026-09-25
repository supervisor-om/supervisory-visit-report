        // =========================================================================
        // 6. INITIALIZATION & EVENT BINDINGS
        // =========================================================================
        
        function initAppEnvironment() {
            try {
                // --- Welcome View Bindings ---
                const showSupBtn = document.getElementById('showSupervisoryAppBtn');
                if(showSupBtn) showSupBtn.addEventListener('click', () => showView(document.getElementById('supervisoryVisitsApp')));
                
                const showSchBtn = document.getElementById('showSchoolAppBtn');
                if(showSchBtn) showSchBtn.addEventListener('click', () => showView(document.getElementById('schoolVisitsApp')));
                
                const backWelcomeBtn = document.getElementById('backToWelcomeFromSupervisory');
                if(backWelcomeBtn) backWelcomeBtn.addEventListener('click', () => showView(document.getElementById('welcomeView')));
                
                const backWelcomeSchBtn = document.getElementById('backToWelcomeFromSchool');
                if(backWelcomeSchBtn) backWelcomeSchBtn.addEventListener('click', () => showView(document.getElementById('welcomeView')));

                // --- Initialize Supervisory App ---
                try {
                    generateEvaluationForm();
                    const visitDateInput = document.querySelector('#visitDate');
                    if(visitDateInput) visitDateInput.value = new Date().toISOString().split('T')[0];
                    toggleSupervisoryView('form-view');
                } catch(e) { console.error('Supervisory Init Error', e); }

                document.querySelectorAll('#supervisoryVisitsApp .nav-tab').forEach(tab => {
                    tab.addEventListener('click', () => toggleSupervisoryView(tab.dataset.view));
                });
                
                const evalForm = document.querySelector('#evaluationForm');
                if(evalForm) {
                    evalForm.addEventListener('click', e => { 
                        if (e.target.matches('.rating-btn')) {
                            updateScore(e.target.closest('.item-card').id.split('-')[1], e.target.dataset.score, true); 
                        }
                        if (e.target.closest('.mic-btn')) {
                            startSupervisoryDictation(e.target.closest('.mic-btn').previousElementSibling.id, e.target.closest('.mic-btn')); 
                        }
                        if (e.target.closest('.edit-evidence-btn')) { 
                            const itemId = e.target.closest('.edit-evidence-btn').dataset.id; 
                            openEvidencePanel(itemId); 
                        } 
                        if (e.target.matches('.close-evidence-panel')) { 
                            e.target.closest('.evidence-panel').classList.add('hidden'); 
                        } 
                        if (e.target.closest('.add-evidence-btn')) { 
                            const btn = e.target.closest('.add-evidence-btn'); 
                            if(typeof addCustomEvidence === 'function') addCustomEvidence(btn.dataset.id); 
                        } 
                        if (e.target.closest('.delete-evidence-btn')) { 
                            const btn = e.target.closest('.delete-evidence-btn'); 
                            if(typeof deleteCustomEvidence === 'function') deleteCustomEvidence(btn.dataset.itemId, btn.dataset.value); 
                        } 
                    });

                    evalForm.addEventListener('change', e => { 
                        if (e.target.matches('.evidence-checkbox')) { 
                            const itemId = e.target.dataset.itemId; 
                            updateDescriptionFromPanel(itemId); 
                        } 
                    });

                    evalForm.addEventListener('keypress', e => { 
                        if (e.target.matches('.new-evidence-input') && e.key === 'Enter') { 
                            e.preventDefault(); 
                            if(typeof addCustomEvidence === 'function') addCustomEvidence(e.target.dataset.id); 
                        } 
                    });
                }

                const savePermBtn = document.getElementById('savePermanentReportBtn');
                if(savePermBtn) savePermBtn.addEventListener('click', savePermanentReport);
                
                const genReportBtn = document.getElementById('generateReportBtn');
                if(genReportBtn) genReportBtn.addEventListener('click', generateReport);
                
                const printOfficialBtn = document.getElementById('printOfficialReportBtn');
                if(printOfficialBtn) printOfficialBtn.addEventListener('click', prepareOfficialPrint);
                
                const exportWordBtn = document.getElementById('exportToWordBtn');
                if(exportWordBtn) exportWordBtn.addEventListener('click', exportToWord);
                
                const exportToMoeBtn = document.getElementById('exportToMoeBtn');
                if(exportToMoeBtn) exportToMoeBtn.addEventListener('click', exportToMoe);

                const resetConfBtn = document.getElementById('showResetConfirmationBtn');
                if(resetConfBtn) resetConfBtn.addEventListener('click', () => showConfirmationModal('إعادة تعيين', 'هل أنت متأكد؟', performReset));
                
                const updateDashBtn = document.getElementById('updateDashboardViewBtn');
                if(updateDashBtn) updateDashBtn.addEventListener('click', updateDashboardView);
                
                const reportSec = document.querySelector('#reportSection');
                if(reportSec) {
                    reportSec.addEventListener('click', e => { 
                        if(e.target.closest('.copy-btn')) {
                            copyText(document.querySelector(`#${e.target.closest('.copy-btn').dataset.target}`).value); 
                        }
                    });
                }
                
                const supSavedList = document.querySelector('#saved-reports-list');
                if(supSavedList) {
                    supSavedList.addEventListener('click', e => { 
                        if(e.target.dataset.key) { 
                            if(e.target.classList.contains('load-btn')) loadPermanentReport(e.target.dataset.key);
                            if(e.target.classList.contains('edit-btn')) loadPermanentReport(e.target.dataset.key);
                            if(e.target.classList.contains('delete-btn')) deletePermanentReport(e.target.dataset.key);
                            if(e.target.classList.contains('print-archive-btn') || e.target.closest('.print-archive-btn')) {
                                const btn = e.target.closest('.print-archive-btn') || e.target;
                                printArchivedReport(btn.dataset.key);
                            } 
                        } 
                    });
                }
                
                // Gender toggle — re-render all notes when changed
                document.querySelectorAll('input[name="supervisoryTeacherGender"]').forEach(radio => {
                    radio.addEventListener('change', () => {
                        evaluationItems.forEach(item => updateScore(
                            item.id,
                            parseInt(document.querySelector('#score-' + item.id).textContent),
                            true
                        ));
                    });
                });

                // ── تحديد زيارات الأرشيف ورفعها طابوراً إلى البوّابة ──
                if (supSavedList) {
                    supSavedList.addEventListener('change', e => {
                        if (e.target.classList.contains('queue-pick') && window.svfToggleKey)
                            window.svfToggleKey(e.target.dataset.key, e.target.checked);
                    });
                }
                const selectAllBtn = document.getElementById('selectAllReportsBtn');
                if (selectAllBtn) selectAllBtn.addEventListener('click', () => window.svfSelectAllVisible?.());

                const clearSelBtn = document.getElementById('clearSelectionBtn');
                if (clearSelBtn) clearSelBtn.addEventListener('click', () => window.svfClearSelection?.());

                const sendSelBtn = document.getElementById('sendSelectedToMoeBtn');
                if (sendSelBtn) sendSelBtn.addEventListener('click', () => window.svfSendSelected?.());

                // عودةُ التبويب بعد الحفظ في البوّابة: سكربت تامبر مانكي يضخّ
                // المحفوظ في svf_sent_visits، فنعيد الرسم ليظهر وسم «حُفظت».
                window.addEventListener('focus', () => {
                    const view = document.getElementById('saved-reports-view');
                    if (view && !view.classList.contains('hidden'))
                        setTimeout(renderSavedReports, 400);
                    const schoolView = document.getElementById('schoolDashboardView');
                    if (schoolView && !schoolView.classList.contains('hidden'))
                        setTimeout(renderSchoolReportsList, 400);
                });

                const supFilter = document.querySelector('#filter-reports-input');
                if (supFilter) supFilter.addEventListener('input', renderSavedReports);

                const monthFilter = document.querySelector('#filter-reports-month');
                if (monthFilter) monthFilter.addEventListener('input', renderSavedReports);

                // Backup / Import
                const exportBackupBtn = document.getElementById('exportBackupBtn');
                if (exportBackupBtn) exportBackupBtn.addEventListener('click', exportBackup);

                const importBackupInput = document.getElementById('importBackupInput');
                if (importBackupInput) {
                    importBackupInput.addEventListener('change', (e) => {
                        if (e.target.files[0]) {
                            importBackup(e.target.files[0]);
                            e.target.value = '';
                        }
                    });
                }

                const importBackupBtn = document.getElementById('importBackupBtn');
                if (importBackupBtn) {
                    importBackupBtn.addEventListener('click', () => {
                        document.getElementById('importBackupInput')?.click();
                    });
                }

                // الربط الاختياريّ بقاعدة بيانات المعلمين — بلا رمزٍ لا يُحمَّل شيء
                try { if (window.SupervisorIdentity) SupervisorIdentity.initCard(); }
                catch (e) { console.error('Identity Error', e); }

                // النسخة السحابيّة للتقارير — تعمل بالربط وحده كذلك
                try { if (window.SupervisorCloud) SupervisorCloud.initCard(); }
                catch (e) { console.error('Cloud Error', e); }

                // مزامنةٌ أنزلت تقارير أو حذفت: القوائم المعروضة تُعاد بناؤها
                document.addEventListener('svf-cloud-changed', () => {
                    try { renderSavedReports(); } catch (e) {}
                    try { renderSchoolReportsList(); } catch (e) {}
                });

                // الإكمال التلقائيّ — يُربط بعد مستمعات النماذج كلّها ليجري بعدها
                try { if (typeof initAutofillBindings === 'function') initAutofillBindings(); }
                catch (e) { console.error('Autofill Error', e); }

                // منشئ التوصيات في الزيارة المدرسيّة
                try { if (typeof initRecsBuilder === 'function') initRecsBuilder(); }
                catch (e) { console.error('Recs Error', e); }

                // المواقف الصفّيّة: القوائم من قاعدة المعلمين وزرّ التقرير الإشرافيّ
                try { if (typeof schoolRouteInit === 'function') schoolRouteInit(); } catch (e) { console.warn('schoolRouteInit', e); }
                try { if (typeof svfClassroomInit === 'function') svfClassroomInit(); }
                catch (e) { console.error('Classroom Error', e); }

                // بطاقة التقرير الشهري: تظهر للمشرف الذي ربط قاعدته وحده — التقرير
                // يُبنى من خطة السير وأسماء معلّميه، فلا معنى لها قبل الربط.
                const svfToggleMonthlyCard = () => {
                    const card = document.getElementById('monthlyCard');
                    if (!card) return;
                    let linked = false;
                    try { linked = !!(window.SupervisorIdentity && SupervisorIdentity.getIdentity()); } catch (e) {}
                    card.classList.toggle('hidden', !linked);
                };
                svfToggleMonthlyCard();
                document.addEventListener('svf-teachers-changed', svfToggleMonthlyCard);

                // --- Initialize School App ---
                try { loadSchoolVisitTypes(); } catch(e) { console.error('School Types Error', e); }
                try { renderSchoolReportsList(); } catch(e) { console.error('School Reports Error', e); }

                // --- إصلاح زر تقرير جديد وربط الحدث بأمان تام ---
                const addNewReportBtn = document.getElementById('addNewReportBtn');
                if (addNewReportBtn) {
                    addNewReportBtn.addEventListener('click', () => {
                        try {
                            const repForm = document.getElementById('reportForm');
                            if(repForm) repForm.reset();
                            if (typeof setSchoolRecs === 'function') setSchoolRecs([]);
                            
                            const repId = document.getElementById('reportId');
                            if(repId) repId.value = '';
                            
                            const dateInput = document.getElementById('schoolVisitDate');
                            if(dateInput) dateInput.value = new Date().toISOString().split('T')[0];
                            
                            const objCont = document.getElementById('objectivesContainer');
                            if(objCont) objCont.innerHTML = '';
                            
                            schoolClassroomVisits = [];
                            schoolTeachers = [];
                            schoolPrincipal = { name: '', gender: 'f' };
                            objectiveNotes = {};
                            objectiveEdits = {};
                            prevRecommendationsStatus = [];
                            document.getElementById('prevRecsPanel')?.classList.add('hidden');
                            renderSchoolClassroomVisits();
                            applyRosterToForm();
                            updateRosterVisibility('');

                            const visSelect = document.getElementById('visitTypeSelect');
                            if(visSelect && visSelect.options.length > 0) visSelect.selectedIndex = 0;

                            showSchoolForm();
                        } catch(err) {
                            console.error("New Report Error: ", err);
                            showToast('حدث خطأ أثناء محاولة فتح التقرير', 'error');
                        }
                    });
                }

                const genVisOpBtn = document.getElementById('generateVisitorOpinionBtn');
                if (genVisOpBtn) genVisOpBtn.addEventListener('click', generateSchoolSmartVisitorOpinion);

                const genRecsBtn = document.getElementById('generateRecommendationsBtn');
                if (genRecsBtn) genRecsBtn.addEventListener('click', generateSchoolRecommendations);
                
                const addCvBtn = document.getElementById('addClassroomVisitBtn');
                if (addCvBtn) addCvBtn.addEventListener('click', addSchoolClassroomVisit);
                
                const schFormView = document.querySelector('#schoolFormView');
                if (schFormView) {
                    schFormView.addEventListener('click', (e) => {
                         if (e.target.closest('.mic-btn')) {
                             const btn = e.target.closest('.mic-btn');
                             const targetId = btn.previousElementSibling.id;
                             startSchoolDictation(targetId, btn);
                         }
                    });
                }

                const quickRecs = document.getElementById('quickRecs');
                if (quickRecs) {
                    quickRecs.addEventListener('change', (e) => {
                        const val = e.target.value;
                        if(val) {
                            const textarea = document.getElementById('recommendations');
                            if(textarea) {
                                textarea.value += (textarea.value.length > 0 ? '\n- ' : '- ') + val;
                            }
                            e.target.value = '';
                        }
                    });
                }

                const copyObjBtn = document.getElementById('copyObjectivesBtn');
                if (copyObjBtn) {
                    copyObjBtn.addEventListener('click', () => {
                        const checked = Array.from(document.querySelectorAll('#objectivesContainer input:checked'))
                            .map((cb, index) => (index + 1) + '- ' + cb.value.replace(/^[\d٠-٩]+\s*[-–]\s*/, ''));
                        // خطّ سير اليوم بعد الأهداف، غير مرقَّم
                        const route = (typeof SchoolRoute !== 'undefined')
                            ? SchoolRoute.routeLines(document.getElementById('schoolCameFrom')?.value, document.getElementById('schoolGoingTo')?.value) : [];
                        copyText(checked.concat(route).join('\n'));
                    });
                }

                const toggleAllBtn = document.getElementById('toggleAllObjectivesBtn');
                if (toggleAllBtn) {
                    toggleAllBtn.addEventListener('click', () => {
                        const checkboxes = [...document.querySelectorAll('#objectivesContainer input[name="objectives"]')];
                        const allChecked = checkboxes.every(cb => cb.checked);
                        checkboxes.forEach(cb => { cb.checked = !allChecked; });
                        toggleAllBtn.textContent = allChecked ? 'تحديد الكل' : 'إلغاء الكل';
                    });
                }
                
                const copyVisOpBtn = document.getElementById('copyVisitorOpinionBtn');
                if (copyVisOpBtn) {
                    copyVisOpBtn.addEventListener('click', () => {
                        copyText(document.getElementById('visitorOpinion')?.value);
                    });
                }
                
                const copyRecBtn = document.getElementById('copyRecommendationsBtn');
                if (copyRecBtn) {
                    copyRecBtn.addEventListener('click', () => {
                        copyText(document.getElementById('recommendations')?.value);
                    });
                }

                const exportSchoolMoeBtn = document.getElementById('exportSchoolToMoeBtn');
                if (exportSchoolMoeBtn) exportSchoolMoeBtn.addEventListener('click', exportSchoolVisitToMoe);

                const backToDashBtn = document.getElementById('backToDashboardBtn');
                if (backToDashBtn) backToDashBtn.addEventListener('click', showSchoolDashboard);
                
                const backToFormBtn = document.getElementById('backToFormBtn');
                if (backToFormBtn) backToFormBtn.addEventListener('click', showSchoolForm);

                const visitTypeSel = document.getElementById('visitTypeSelect');
                if (visitTypeSel) {
                    visitTypeSel.addEventListener('change', (e) => {
                        renderSchoolObjectives(e.target.value);
                        updateRosterVisibility(e.target.value);   // الطاقم للاستطلاعيّة وحدها
                    });
                }

                // ── تحديد الزيارات المدرسيّة ورفعها طابوراً ──
                const schoolList = document.getElementById('reportsListContainer');
                if (schoolList) {
                    schoolList.addEventListener('change', e => {
                        if (e.target.classList.contains('queue-pick-school') && window.svfSchoolToggleKey)
                            window.svfSchoolToggleKey(e.target.dataset.key, e.target.checked);
                    });
                }
                const selectAllSchoolBtn = document.getElementById('selectAllSchoolReportsBtn');
                if (selectAllSchoolBtn) selectAllSchoolBtn.addEventListener('click', () => window.svfSchoolSelectAllVisible?.());

                const clearSchoolSelBtn = document.getElementById('clearSchoolSelectionBtn');
                if (clearSchoolSelBtn) clearSchoolSelBtn.addEventListener('click', () => window.svfSchoolClearSelection?.());

                const sendSchoolSelBtn = document.getElementById('sendSelectedSchoolToMoeBtn');
                if (sendSchoolSelBtn) sendSchoolSelBtn.addEventListener('click', () => window.svfSendSelectedSchool?.());

                const addTeacherBtn = document.getElementById('addSchoolTeacherBtn');
                if (addTeacherBtn) addTeacherBtn.addEventListener('click', addSchoolTeacher);

                const stNameInput = document.getElementById('stName');
                if (stNameInput) stNameInput.addEventListener('keydown', e => {
                    if (e.key === 'Enter') { e.preventDefault(); addSchoolTeacher(); }
                });

                ['schoolPrincipal', 'schoolPrincipalGender'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('change', saveSchoolRoster);
                });

                const schoolNameInput = document.getElementById('schoolName');
                if (schoolNameInput) {
                    schoolNameInput.addEventListener('blur', loadPreviousRecommendations);
                    // الطاقم محفوظٌ باسم المدرسة، فيُستدعى حين يكتمل الاسم
                    schoolNameInput.addEventListener('blur', loadSchoolRosterForSchool);
                    schoolNameInput.addEventListener('input', () => {
                        // إخفاء اللوحة عند تغيير الاسم
                        document.getElementById('prevRecsPanel')?.classList.add('hidden');
                        prevRecommendationsStatus = [];
                    });
                }

                document.querySelectorAll('input[name="genderMode"]').forEach(input => {
                    input.addEventListener('change', () => {
                        const visitType = document.getElementById('visitTypeSelect')?.value;
                        if (visitType) renderSchoolObjectives(visitType);
                    });
                });

                const repFormSubmit = document.getElementById('reportForm');
                if (repFormSubmit) repFormSubmit.addEventListener('submit', saveSchoolReport);

                const prevRepBtn = document.getElementById('previewReportBtn');
                if (prevRepBtn) {
                    prevRepBtn.addEventListener('click', () => {
                        const reportForm = document.getElementById('reportForm');
                        if(!reportForm) return;
                        
                        const formData = new FormData(reportForm);
                        const objectives = [];
                        reportForm.querySelectorAll('input[name="objectives"]:checked').forEach(cb => objectives.push(cb.value));
                        
                        const tempReport = {
                            id: document.getElementById('reportId')?.value || '',
                            schoolName: formData.get('schoolName') || '',
                            visitDate: formData.get('visitDate') || '',
                            visitType: document.getElementById('visitTypeSelect')?.value || '',
                            objectives: objectives,
                            cameFrom: (document.getElementById('schoolCameFrom')?.value || '').trim(),
                            goingTo: (document.getElementById('schoolGoingTo')?.value || '').trim(),
                            classroomVisits: schoolClassroomVisits || [],
                            visitorOpinion: document.getElementById('visitorOpinion')?.value || '',
                            recommendations: document.getElementById('recommendations')?.value || ''
                        };
                        
                        if(!tempReport.visitType) { 
                            showToast('اختر نوع الزيارة أولاً', 'error'); 
                            return; 
                        }
                        
                        // معاينةٌ من النموذج: الرجوع يُظهره كما هو ولا يُعيد تحميله
                        generateSchoolPreview(tempReport, true);
                        document.getElementById('schoolFormView')?.classList.add('hidden');
                        document.getElementById('reportPreviewContainer')?.classList.remove('hidden');
                    });
                }

                const repListCont = document.querySelector('#schoolDashboardView #reportsListContainer');
                if(repListCont) {
                    repListCont.addEventListener('click', (e) => {
                        if (e.target.classList.contains('delete-report-btn')) deleteSchoolReport(e.target.dataset.key);
                        if (e.target.classList.contains('edit-report-btn')) editSchoolReport(e.target.dataset.key);
                        if (e.target.classList.contains('view-report-btn')) viewSchoolReport(e.target.dataset.key);
                    });
                }

                const mgVisTypeBtn = document.getElementById('manageVisitTypesBtn');
                if (mgVisTypeBtn) {
                    mgVisTypeBtn.addEventListener('click', () => {
                        renderSchoolVisitTypesList();
                        document.getElementById('manageTypesModal')?.classList.remove('hidden');
                    });
                }
                
                const closeMgModalBtn = document.getElementById('closeManageModalBtn');
                if (closeMgModalBtn) {
                    closeMgModalBtn.addEventListener('click', () => {
                        document.getElementById('manageTypesModal')?.classList.add('hidden');
                    });
                }
                
                const visTypeList = document.getElementById('visitTypesList');
                if(visTypeList) {
                    visTypeList.addEventListener('click', (e) => {
                        const deleteBtn = e.target.closest('.delete-type-btn');
                        const editBtn = e.target.closest('.edit-type-btn');
                        
                        if (deleteBtn) {
                            const key = deleteBtn.dataset.key;
                            if (confirm('هل أنت متأكد من حذف هذا النوع؟')) {
                                delete schoolVisitTypesData[key];
                                localStorage.setItem('supervision_v6_school_visit_types', JSON.stringify(schoolVisitTypesData));
                                renderSchoolVisitTypesList();
                                populateSchoolVisitTypeDropdown();
                                showToast('تم حذف النوع بنجاح');
                            }
                        }
                        
                        if (editBtn) {
                            const key = editBtn.dataset.key;
                            const type = schoolVisitTypesData[key];
                            if(type) {
                                if(document.getElementById('typeName')) document.getElementById('typeName').value = type.name || '';
                                if(document.getElementById('typeObjectives')) document.getElementById('typeObjectives').value = (Array.isArray(type.objectives) ? type.objectives : []).join('\n');
                                if(document.getElementById('editTypeKey')) document.getElementById('editTypeKey').value = key;
                                if(document.getElementById('addEditModalTitle')) document.getElementById('addEditModalTitle').textContent = 'تعديل نوع زيارة';
                                document.getElementById('manageTypesModal')?.classList.add('hidden');
                                document.getElementById('addEditTypeModal')?.classList.remove('hidden');
                            }
                        }
                    });
                }

                const openAddTypeModalBtn = document.getElementById('openAddTypeModalBtn');
                if (openAddTypeModalBtn) {
                    openAddTypeModalBtn.addEventListener('click', () => {
                        document.getElementById('addEditTypeForm')?.reset();
                        if(document.getElementById('editTypeKey')) document.getElementById('editTypeKey').value = '';
                        if(document.getElementById('addEditModalTitle')) document.getElementById('addEditModalTitle').textContent = 'إضافة نوع زيارة';
                        document.getElementById('manageTypesModal')?.classList.add('hidden');
                        document.getElementById('addEditTypeModal')?.classList.remove('hidden');
                    });
                }
                
                const cancelEditBtn = document.getElementById('cancelEditBtn');
                if (cancelEditBtn) {
                    cancelEditBtn.addEventListener('click', () => {
                        document.getElementById('addEditTypeModal')?.classList.add('hidden');
                        document.getElementById('manageTypesModal')?.classList.remove('hidden');
                    });
                }

                const addEditTypeForm = document.getElementById('addEditTypeForm');
                if (addEditTypeForm) {
                    addEditTypeForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const name = document.getElementById('typeName')?.value || 'نوع جديد';
                        const objVal = document.getElementById('typeObjectives')?.value || '';
                        const objectives = objVal.split('\n').filter(o => o.trim() !== '');
                        let key = document.getElementById('editTypeKey')?.value;
                        
                        if (objectives.length === 0) {
                            showToast('يرجى إضافة هدف واحد على الأقل', 'error');
                            return;
                        }
                        
                        if (!key) {
                            key = 'custom_' + Date.now();
                        }
                        
                        schoolVisitTypesData[key] = { name, objectives };
                        localStorage.setItem('supervision_v6_school_visit_types', JSON.stringify(schoolVisitTypesData));
                        renderSchoolVisitTypesList();
                        populateSchoolVisitTypeDropdown();
                        document.getElementById('addEditTypeModal')?.classList.add('hidden');
                        document.getElementById('manageTypesModal')?.classList.remove('hidden');
                        showToast('تم حفظ النوع بنجاح');
                    });
                }

                // Finally show welcome view
                showView(document.getElementById('welcomeView'));

            } catch (fatalError) {
                console.error("توقف السكربت كلياً بسبب خطأ:", fatalError);
                showToast("حدث خطأ فادح في تحميل واجهة النظام.", "error");
            }
        }

        // الطريقة الأكثر موثوقية لتفعيل السكربت وتهيئة النظام في كل بيئات التشغيل
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initAppEnvironment);
        } else {
            initAppEnvironment();
        }
