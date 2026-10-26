        // =========================================================================
        function deletePermanentReport(key) {
            showConfirmationModal('تأكيد الحذف', 'سيتم حذف التقرير نهائياً', () => {
                try {
                    const raw = localStorage.getItem(key);
                    const data = JSON.parse(raw); 
                    localStorage.removeItem(key); 
                    // علامةُ حذفٍ في السحابة، وإلّا أعاده جهازٌ آخر عند مزامنته.
                    // ويُرسَل نصّه معها فيبقى قابلاً للإرجاع إن حُذف بالخطأ.
                    try { if (window.SupervisorCloud) SupervisorCloud.remove(key, raw); } catch (e) {} 
                    if(data && data.teacherName) { 
                        const teacherArchiveKey = `supervision_v6_teacher_archive_${data.teacherName}`; 
                        const oldArchiveKey = `teacher_archive_v5_${data.teacherName}`; 
                        
                        let archive = [];
                        try { archive = JSON.parse(localStorage.getItem(teacherArchiveKey)) || JSON.parse(localStorage.getItem(oldArchiveKey)) || []; } catch(e){}
                        
                        if(Array.isArray(archive)) {
                            // قراءة هذا التقرير وحده (id) — زيارةٌ ثانيةٌ في اليوم نفسه تبقى؛ والقديمة بلا id بالتاريخ
                            archive = archive.filter(visit => visit && (visit.id ? visit.id !== key : visit.date !== data.visitDate));
                            if (archive.length > 0) {
                                localStorage.setItem(teacherArchiveKey, JSON.stringify(archive)); 
                            } else {
                                localStorage.removeItem(teacherArchiveKey); 
                                localStorage.removeItem(oldArchiveKey); 
                            }
                        }
                    } 
                    renderSavedReports(); 
                    showToast('تم الحذف بنجاح'); 
                } catch(e) {
                    const raw2 = localStorage.getItem(key);
                    localStorage.removeItem(key);
                    try { if (window.SupervisorCloud) SupervisorCloud.remove(key, raw2); } catch (e2) {}
                    renderSavedReports();
                }
            }); 
        }

        // تبويب «التحليل البياني» القديم (رادار و١٣ خطّاً للمعلّم) حلّ محلّه «ملف المعلم» في js/dash.js (2026-10-26)
