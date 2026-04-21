        // =========================================================================
        // 4. SUPERVISORY APP FUNCTIONS
        // =========================================================================
        function getSupervisoryGender() {
            return parseInt(document.querySelector('input[name="supervisoryTeacherGender"]:checked')?.value ?? '0');
        }

        function generateEvaluationForm() {
            const formContainer = document.querySelector('#evaluationForm');
            if(!formContainer) return;
            formContainer.innerHTML = '';
            let currentDomain = '';
            let sectionDiv;
            
            evaluationItems.forEach(item => {
                if (item.domain !== currentDomain) {
                    currentDomain = item.domain;
                    sectionDiv = document.createElement('div');
                    sectionDiv.className = 'bg-white rounded-2xl shadow-sm border border-slate-200 mb-6';
                    sectionDiv.innerHTML = `
                        <div class="bg-slate-100 p-4 border-b border-slate-200 rounded-t-2xl">
                            <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                <span class="w-2 h-6 bg-blue-600 rounded-full"></span>${currentDomain}
                            </h3>
                        </div>`;
                    formContainer.appendChild(sectionDiv);
                }
                
                const itemCard = document.createElement('div');
                itemCard.className = 'p-5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors item-card relative';
                itemCard.id = `item-${item.id}`;
                itemCard.innerHTML = `
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <div class="flex-grow">
                            <h4 class="font-bold text-slate-800 text-lg mb-1">${item.id}. ${item.title}</h4>
                            <p class="text-slate-500 text-sm">${item.desc}</p>
                        </div>
                        <div class="score w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xl text-slate-700 shadow-inner" id="score-${item.id}">3</div>
                    </div>
                    <div class="grid grid-cols-5 gap-2 mb-4 rating-selector">
                        <button type="button" class="rating-btn score-1 py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="1">متميز</button>
                        <button type="button" class="rating-btn score-2 py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="2">جيد</button>
                        <button type="button" class="rating-btn score-3 active py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="3">ملائم</button>
                        <button type="button" class="rating-btn score-4 py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="4">غير ملائم</button>
                        <button type="button" class="rating-btn score-5 py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="5">تدخل سريع</button>
                    </div>
                    <div class="relative">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-bold text-slate-500">الوصف الإشرافي والأدلة:</label>
                            <button type="button" class="edit-evidence-btn" id="edit-evidence-${item.id}" data-id="${item.id}">✏️ تعديل الأدلة (اختياري)</button>
                        </div>
                        <div id="notes-${item.id}" class="item-notes w-full min-h-[80px] p-3 pl-10 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" contenteditable="true"></div>
                        <div id="evidence-panel-${item.id}" class="evidence-panel hidden absolute z-50 bg-white border border-slate-200 shadow-xl rounded-lg p-4 w-full max-w-md mt-1 left-0">
                            <h5 class="font-bold text-sm mb-2 text-slate-700">اختر الشواهد المناسبة:</h5>
                            <div id="evidence-list-${item.id}" class="space-y-2 max-h-48 overflow-y-auto mb-3 p-1"></div>
                            <div class="border-t border-slate-100 pt-2 mb-2">
                                <div class="flex gap-2 items-center">
                                    <input type="text" class="new-evidence-input w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="إضافة دليل آخر..." data-id="${item.id}">
                                    <button type="button" class="add-evidence-btn bg-blue-100 text-blue-700 hover:bg-blue-200 p-1.5 rounded-md transition-colors" data-id="${item.id}" title="إضافة"><i class="fa-solid fa-plus text-sm"></i></button>
                                </div>
                            </div>
                            <div class="flex justify-end"><button type="button" class="close-evidence-panel text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded font-medium" data-id="${item.id}">إغلاق</button></div>
                        </div>
                        ${recognition ? `<button type="button" class="mic-btn absolute bottom-2 left-2 text-slate-400 hover:text-blue-600 transition-colors p-1 rounded-full"><i class="fa-solid fa-microphone"></i></button>` : ''}
                    </div>
                `;
                sectionDiv.appendChild(itemCard);
            });
            // Template bar
            const templateBar = document.querySelector('#template-bar');
            if (templateBar) {
                const btnContainer = templateBar.querySelector('#template-buttons');
                btnContainer.innerHTML = '';
                supervisoryTemplates.forEach(tpl => {
                    const c = colorMap[tpl.color] || {};
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.dataset.tpl = tpl.id;
                    btn.className = `tpl-btn border text-xs font-medium px-3 py-1.5 rounded-full transition-all ${c.btn || ''}`;
                    btn.innerHTML = `${tpl.icon} ${tpl.label}`;
                    btn.addEventListener('click', () => applyTemplate(tpl.id));
                    btnContainer.appendChild(btn);
                });
            }

            evaluationItems.forEach(item => updateScore(item.id, 3, true));
        }

        function generateDescriptionText(itemId, rating, customEvidences = null) {
            const content = evidenceBasedContent[itemId];
            if (!content) return "";
            
            const positiveEvidences = content.evidences || [];
            const negativeEvidences = content.neg_evidences || [];
            let text = "";
            let selectedEvidences = [];
            
            if (customEvidences) {
                selectedEvidences = customEvidences;
            } else {
                if (rating == 1) selectedEvidences = getRandomEvidences(positiveEvidences, 2);
                else if (rating == 2) selectedEvidences = getRandomEvidences(positiveEvidences, 1);
                else if (rating == 3) selectedEvidences = getRandomEvidences(positiveEvidences, 1);
                else if (rating == 4) selectedEvidences = getRandomEvidences(negativeEvidences, 1);
                else if (rating == 5) selectedEvidences = getRandomEvidences(negativeEvidences, 2);
            }
            
            const joinEvidences = (list) => { 
                if (list.length === 0) return ""; 
                if (list.length === 1) return list[0]; 
                return list.join("، و"); 
            };
            
            const joinedEvidencesText = joinEvidences(selectedEvidences);
            
            if (content.levels && content.levels[rating]) {
                if (joinedEvidencesText) {
                    text = `${content.levels[rating]}، ويتضح ذلك من خلال ${joinedEvidencesText}.`;
                } else {
                    text = `${content.levels[rating]}.`;
                }
            } else {
                text = `مستوى ${rating}، ويتضح ذلك من خلال ${joinedEvidencesText}.`;
            }

            return applyGenderFilter(text, getSupervisoryGender());
        }

        function getRandomEvidences(arr, count) {
            if (!arr || arr.length === 0) return [];
            const shuffled = [...arr].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count);
        }

        function openEvidencePanel(itemId) {
            const panel = document.querySelector(`#evidence-panel-${itemId}`);
            const listContainer = document.querySelector(`#evidence-list-${itemId}`);
            const currentText = document.querySelector(`#notes-${itemId}`).textContent;
            const content = evidenceBasedContent[itemId];
            const rating = document.querySelector(`#score-${itemId}`).textContent;
            
            if (!content) return;
            
            document.querySelectorAll('.evidence-panel').forEach(p => p.classList.add('hidden'));
            
            const sourceList = (rating >= 4) ? (content.neg_evidences || []) : content.evidences;
            listContainer.innerHTML = '';
            
            if(sourceList.length === 0) {
                listContainer.innerHTML = '<p class="text-xs text-gray-400 p-2">لا توجد شواهد مقترحة لهذا التقدير.</p>';
            } else {
                sourceList.forEach((ev, index) => {
                    const isChecked = currentText.includes(ev);
                    const div = document.createElement('div');
                    div.className = 'evidence-item flex items-center gap-2 group hover:bg-slate-50 p-1 rounded';
                    div.innerHTML = `
                        <input type="checkbox" id="ev-${itemId}-${index}" class="evidence-checkbox w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" value="${ev}" ${isChecked ? 'checked' : ''} data-item-id="${itemId}">
                        <label for="ev-${itemId}-${index}" class="text-sm text-slate-700 leading-tight cursor-pointer select-none flex-grow">${ev}</label>
                        <button type="button" class="delete-evidence-btn text-slate-300 hover:text-red-500 transition-opacity p-1" data-item-id="${itemId}" data-value="${ev}" title="حذف"><i class="fa-solid fa-trash-can text-xs"></i></button>
                    `;
                    listContainer.appendChild(div);
                });
            }
            panel.classList.remove('hidden');
        }

        function updateDescriptionFromPanel(itemId) {
            const checkboxes = document.querySelectorAll(`#evidence-list-${itemId} .evidence-checkbox:checked`);
            const selectedEvidences = Array.from(checkboxes).map(cb => cb.value);
            const rating = document.querySelector(`#score-${itemId}`).textContent;
            const newText = generateDescriptionText(itemId, rating, selectedEvidences);
            document.querySelector(`#notes-${itemId}`).textContent = newText;
        }

        function updateScore(itemId, score, forceUpdate = false) {
            const mainScoreDisplay = document.querySelector(`#score-${itemId}`);
            mainScoreDisplay.textContent = score;
            updateScoreColor(mainScoreDisplay, score);
            
            const ratingContainer = document.querySelector(`#item-${itemId} .rating-selector`);
            ratingContainer.querySelectorAll('.rating-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.score == score);
            });
            
            document.querySelector(`#edit-evidence-${itemId}`).classList.remove('hidden');
            
            const notesDiv = document.querySelector(`#notes-${itemId}`);
            if (forceUpdate || notesDiv.textContent.trim() === '') {
                notesDiv.textContent = generateDescriptionText(itemId, score);
            }
        }
        
        function updateScoreColor(element, score) {
            element.className = 'score w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shadow-inner transition-colors';
            if (score == 1) element.classList.add('bg-green-100', 'text-green-800'); 
            else if (score == 2) element.classList.add('bg-blue-100', 'text-blue-800'); 
            else if (score == 3) element.classList.add('bg-amber-100', 'text-amber-800'); 
            else if (score == 4) element.classList.add('bg-red-50', 'text-red-800'); 
            else if (score == 5) element.classList.add('bg-red-600', 'text-white');
        }

        function toggleSupervisoryView(viewId) {
            document.querySelectorAll('#form-view, #dashboard-view, #saved-reports-view, #stats-view').forEach(view => {
                view.classList.add('hidden');
            });

            document.querySelector(`#${viewId}`)?.classList.remove('hidden');

            document.querySelectorAll('.nav-tab').forEach(tab => {
                tab.classList.remove('active', 'bg-white', 'shadow-sm', 'text-blue-700');
                tab.classList.add('text-slate-500');
                if(tab.dataset.view === viewId) {
                    tab.classList.add('active', 'bg-white', 'shadow-sm', 'text-blue-700');
                    tab.classList.remove('text-slate-500');
                }
            });

            if (viewId === 'saved-reports-view') {
                renderSavedReports();
            } else if (viewId === 'dashboard-view') {
                populateTeacherDashboardDropdown();
                updateDashboardView();
            } else if (viewId === 'stats-view') {
                renderStatistics();
            }
        }

        function getSupervisorySchoolName() { 
            return document.querySelector('#school').value.trim(); 
        }
        
        function getSupervisoryTeacherName() { 
            return document.querySelector('#teacherName').value.trim(); 
        }

        async function prepareOfficialPrint() {
            const data = await getReportData();
            const html = getReportHTML(data, false);
            const printView = document.getElementById('printView');
            printView.innerHTML = html;
            
            setTimeout(() => {
                window.print();
            }, 500);
        }
        
        async function exportToWord() { 
            showToast('جاري تجهيز الصور للتقرير... (يرجى الانتظار)', 'info');
            const data = await getReportData();
            const wordHTML = `
                <!DOCTYPE html>
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40' lang="ar" dir="rtl">
                <head><meta charset="utf-8"><title>Export</title></head>
                <body>
                    ${getReportHTML(data, true)}
                </body>
                </html>
            `;
            
            const fileName = `${data.visitNo || 'زيارة'} - ${data.school} - ${data.teacher}.docx`;
            const converted = htmlDocx.asBlob(wordHTML, { orientation: 'portrait', margins: { top: 720, bottom: 720, left: 720, right: 720 } });
            const finalBlob = new Blob([converted], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            
            const url = window.URL.createObjectURL(finalBlob);
            const link = document.createElement('a'); 
            link.href = url; 
            link.download = fileName; 
            link.target = '_blank';
            document.body.appendChild(link); 
            
            const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
            link.dispatchEvent(clickEvent);
            
            document.body.removeChild(link); 
            setTimeout(() => window.URL.revokeObjectURL(url), 1000); 
            showToast('تم تصدير ملف Word');
        }

        function generateReport() {
            let itemsByScore = { 1: [], 2: [], 3: [], 4: [], 5: [] }; 
            
            evaluationItems.forEach(item => { 
                const score = parseInt(document.querySelector(`#score-${item.id}`).textContent); 
                itemsByScore[score].push({ id: item.id, title: item.title, standard: item.standard, notes: document.querySelector(`#notes-${item.id}`).textContent }); 
            });
            
            const strengths = [...itemsByScore[1], ...itemsByScore[2]].slice(0, 4); 
            const developments = [...itemsByScore[5], ...itemsByScore[4]].slice(0, 4);
            let recommendationsList = [...developments]; 
            const extraRecs = itemsByScore[3].sort(() => 0.5 - Math.random()).slice(0, 2); 
            
            extraRecs.forEach(rec => { 
                if (!recommendationsList.find(item => item.id === rec.id)) {
                    recommendationsList.push(rec); 
                }
            });
            
            document.querySelector('#strengthsContent').value = strengths.map(s => `• ${s.standard}: ${s.notes}`).join('\n'); 
            document.querySelector('#developmentContent').value = developments.map(d => `• ${d.standard}: ${d.notes}`).join('\n'); 
            
            const gMode = getSupervisoryGender();
            let recommendationsText = applyGenderFilter("نوصي [المعلم/المعلمة] بالآتي:\n", gMode);
            recommendationsList.forEach(rec => {
                if (instructionalRecommendations[rec.id]) {
                    const recText = applyGenderFilter(instructionalRecommendations[rec.id], gMode);
                    recommendationsText += `• ${rec.standard}: ${recText}\n`;
                }
            });

            document.querySelector('#recommendationsContent').value = recommendationsText + "\nوالله ولي التوفيق.";
            document.querySelector('#reportSection').classList.remove('hidden'); 
            document.querySelector('#reportSection').scrollIntoView({ behavior: 'smooth' }); 
            showToast('تم توليد التقرير بنجاح');
        }

        function startSupervisoryDictation(divId, button) {
            if (!recognition) { 
                showToast('المتصفح لا يدعم الإملاء الصوتي', 'error'); 
                return; 
            }
            button.classList.add('recording'); 
            recognition.start();
            
            recognition.onresult = (event) => { 
                const target = document.querySelector(`#${divId}`);
                target.textContent += (target.textContent.length > 0 ? ' ' : '') + event.results[0][0].transcript; 
            };
            recognition.onspeechend = () => recognition.stop(); 
            recognition.onend = () => { button.classList.remove('recording'); };
        }

        function showConfirmationModal(title, message, onConfirm) {
            document.querySelector('#supervisory-modal-title').textContent = title; 
            document.querySelector('#supervisory-modal-message').textContent = message;
            
            const modal = document.querySelector('#supervisoryConfirmationModal'); 
            modal.classList.remove('hidden');
            
            const confirmBtn = document.querySelector('#supervisory-modal-confirm-btn'); 
            const cancelBtn = document.querySelector('#supervisory-modal-cancel-btn');
            
            const newConfirm = confirmBtn.cloneNode(true); 
            const newCancel = cancelBtn.cloneNode(true); 
            
            confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn); 
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            
            newConfirm.addEventListener('click', () => { 
                onConfirm(); 
                modal.classList.add('hidden'); 
            }); 
            
            newCancel.addEventListener('click', () => { 
                modal.classList.add('hidden'); 
            });
        }

        function performReset() {
            document.querySelector('#evaluationForm').reset(); 
            document.querySelectorAll('input:not([type="button"]), textarea').forEach(input => input.value = ''); 
            document.querySelector('#visitDate').value = new Date().toISOString().split('T')[0];
            
            evaluationItems.forEach(item => { 
                updateScore(item.id, 3, true); 
                document.querySelector(`#notes-${item.id}`).textContent = generateDescriptionText(item.id, 3); 
            });
            
            document.querySelector('#reportSection').classList.add('hidden'); 
            showToast('تم إعادة تعيين النموذج');
        }

        function savePermanentReport() {
            const teacherName = document.querySelector('#teacherName').value.trim(); 
            const visitDate = document.querySelector('#visitDate').value; 
            
            if (!teacherName || !visitDate) { 
                showToast('يرجى إدخال اسم المعلم والتاريخ', 'error'); 
                return; 
            }
            
            const reportId = `supervision_v6_visit_${Date.now()}`; 
            const reportData = { 
                id: reportId, 
                teacherName, 
                visitDate, 
                school: document.querySelector('#school').value.trim(), 
                formData: {} 
            };
            
            document.querySelectorAll('#form-view input, #form-view select, #form-view textarea').forEach(el => { 
                if (el.id) reportData.formData[el.id] = el.value; 
            });
            
            evaluationItems.forEach(item => { 
                reportData.formData[`score-${item.id}`] = document.querySelector(`#score-${item.id}`).textContent; 
                reportData.formData[`notes-${item.id}`] = document.querySelector(`#notes-${item.id}`).textContent; 
            });
            
            localStorage.setItem(reportId, JSON.stringify(reportData));
            
            const visitDataForDashboard = { date: visitDate, scores: {} }; 
            
            evaluationItems.forEach(item => {
                visitDataForDashboard.scores[`item-${item.id}`] = parseInt(document.querySelector(`#score-${item.id}`).textContent) || 3;
            });
            
            const teacherArchiveKey = `supervision_v6_teacher_archive_${teacherName}`; 
            let archive = [];
            try {
                archive = JSON.parse(localStorage.getItem(teacherArchiveKey)) || [];
                if(!Array.isArray(archive)) archive = [];
            } catch(e) { archive = []; }
            
            const existingVisitIndex = archive.findIndex(v => v.date === visitDate); 
            if (existingVisitIndex > -1) {
                archive[existingVisitIndex] = visitDataForDashboard; 
            } else {
                archive.push(visitDataForDashboard); 
            }
            
            archive.sort((a, b) => new Date(a.date) - new Date(b.date)); 
            localStorage.setItem(teacherArchiveKey, JSON.stringify(archive)); 
            
            showToast('تم حفظ التقرير بنجاح');
            renderSavedReports();
        }

        function loadPermanentReport(reportKey) {
            try {
                const data = JSON.parse(localStorage.getItem(reportKey));
                if (data && data.formData) { 
                    performReset(); 
                    Object.keys(data.formData).forEach(key => { 
                        const el = document.querySelector(`#${key}`); 
                        if (el) { 
                            if (el.classList.contains('item-notes')) el.textContent = data.formData[key]; 
                            else if (el.classList.contains('score')) el.textContent = data.formData[key]; 
                            else el.value = data.formData[key]; 
                        } 
                    }); 
                    if(data.formData['school']) document.querySelector('#school').value = data.formData['school']; 
                    if(data.formData['teacherName']) document.querySelector('#teacherName').value = data.formData['teacherName']; 
                    evaluationItems.forEach(item => updateScore(item.id, parseInt(data.formData[`score-${item.id}`] || 3))); 
                    toggleSupervisoryView('form-view'); 
                    showToast('تم تحميل التقرير'); 
                }
            } catch (e) {
                showToast('خطأ في استرجاع التقرير', 'error');
            }
        }

