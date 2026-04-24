        // =========================================================================
        // 3. UNIFIED HTML GENERATOR FOR PRINT & WORD
        // =========================================================================
        function getReportHTML(data, isWord = false) {
            const itemsTable1 = evaluationItems.filter(i => i.id <= 7);
            const itemsTable2 = evaluationItems.filter(i => i.id >= 8);

            const generateTableRows = (items, sideContent) => {
                let rowsHtml = '';
                const grouped = items.reduce((acc, item) => {
                    if (!acc[item.domain]) acc[item.domain] = {};
                    if (!acc[item.domain][item.standard]) acc[item.domain][item.standard] = [];
                    acc[item.domain][item.standard].push(item);
                    return acc;
                }, {});

                let isFirstItemOfTable = true;
                
                for (const domain in grouped) {
                    const standards = grouped[domain];
                    const domainItemCount = Object.values(standards).reduce((acc, curr) => acc + curr.length, 0);
                    let isFirstRowOfDomain = true;
                    
                    for (const standard in standards) {
                        const standardItems = standards[standard];
                        const standardItemCount = standardItems.length;
                        let isFirstRowOfStandard = true;
                        
                        standardItems.forEach((item) => {
                            const score = data.scores[`item-${item.id}`] || '';
                            
                            let domainCell = isFirstRowOfDomain ? `<td rowspan="${domainItemCount}" style="width:12%; border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; font-weight:bold; background-color:#f2f2f2;">${domain}</td>` : '';
                            let standardCell = isFirstRowOfStandard ? `<td rowspan="${standardItemCount}" style="width:12%; border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; background-color:#f2f2f2;">${standard}</td>` : '';
                            
                            let sideCell = '';
                            if (isFirstItemOfTable) {
                                sideCell = `<td rowspan="${items.length}" style="width:28%; border:1px solid #000; padding:4px; text-align:right; vertical-align:top;">${sideContent}</td>`;
                                isFirstItemOfTable = false;
                            }
                            
                            rowsHtml += `<tr>
                                ${domainCell}
                                ${standardCell}
                                <td style="width:4%; border:1px solid #000; padding:4px; text-align:center;">${item.id}</td>
                                <td style="width:38%; border:1px solid #000; padding:4px; text-align:right;">${item.title}</td>
                                <td style="width:6%; border:1px solid #000; padding:4px; text-align:center; font-weight:bold;">${score}</td>
                                ${sideCell}
                            </tr>`;
                            
                            isFirstRowOfDomain = false;
                            isFirstRowOfStandard = false;
                        });
                    }
                }
                return rowsHtml;
            };

            const rows1 = generateTableRows(itemsTable1, data.strengths);
            const rows2 = generateTableRows(itemsTable2, data.needs);

            const pageBreak = isWord ? '<br clear="all" style="page-break-before:always" />' : '';
            
            const imgMinistryTag = `<img src="${data.imgMinistry}" style="height: 60px; width: auto;" alt="شعار الوزارة">`;
            const imgQualityTag = `<img src="${data.imgQuality}" style="height: 60px; width: auto;" alt="شعار الجودة">`;
            const imgVisionTag = `<img src="${data.imgVision}" style="height: 60px; width: auto;" alt="رؤية عمان">`;

            return `
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000; direction: rtl; text-align: right; width: 100%;">
                    
                    <table style="width: 100%; border: none; margin-bottom: 10px;">
                        <tr>
                            <td style="width: 33%; text-align: right; border: none; vertical-align: middle;">${imgMinistryTag}</td>
                            <td style="width: 34%; text-align: center; border: none; vertical-align: middle;">${imgQualityTag}</td>
                            <td style="width: 33%; text-align: left; border: none; vertical-align: middle;">${imgVisionTag}</td>
                        </tr>
                    </table>

                    <div style="text-align: center; margin-bottom: 15px;">
                        <div style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">نموذج رئيسي رقم(5 )</div>
                        <div style="font-size: 16px; font-weight: bold; text-decoration: underline; margin-bottom: 3px;">استمارة زيارة إشرافية لمعلم مجال / مادة</div>
                        <div style="font-size: 12px;">(عملية إعداد وتنفيذ الخطة التشغيلية للإشراف الفنية)</div>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px;">
                        <tr>
                            <td style="width: 15%; border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">المدرسة:</td>
                            <td style="width: 35%; border: 1px solid #000; padding: 4px;">${data.school}</td>
                            <td style="width: 15%; border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">اسم المعلم:</td>
                            <td style="width: 35%; border: 1px solid #000; padding: 4px;">${data.teacher}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">رقم الملف:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.fileNo}</td>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">المادة/ المجال:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.subject}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">رقم الزيارة:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.visitNo}</td>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">التاريخ:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.date}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">الصف:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.className}</td>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">الحصة:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.lesson}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">الموضوع:</td>
                            <td style="border: 1px solid #000; padding: 4px;" colspan="3">${data.topic}</td>
                        </tr>
                    </table>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; table-layout: fixed;">
                        <thead>
                            <tr>
                                <th style="width: 12%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">المجال</th>
                                <th style="width: 12%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">المعيار</th>
                                <th style="width: 4%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">م</th>
                                <th style="width: 38%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">البنود/المؤشرات</th>
                                <th style="width: 6%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">التقدير</th>
                                <th style="width: 28%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">جوانب الإجادة في الأداء وأدلتها*</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows1}
                        </tbody>
                    </table>
                    
                    ${pageBreak}

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; table-layout: fixed;">
                        <thead>
                            <tr>
                                <th style="width: 12%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">المجال</th>
                                <th style="width: 12%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">المعيار</th>
                                <th style="width: 4%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">م</th>
                                <th style="width: 38%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">البنود/المؤشرات</th>
                                <th style="width: 6%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">التقدير</th>
                                <th style="width: 28%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">الجوانب التى تحتاج إلى تطوير في الأداء وأدلتها*</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows2}
                        </tbody>
                    </table>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
                        <tr>
                            <th style="border: 1px solid #000; padding: 5px; background-color: #d9d9d9; text-align: right;">الدعم المقدم / التوصيات*</th>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 10px; min-height: 80px; vertical-align: top;">${data.recs}</td>
                        </tr>
                    </table>

                    <table style="width: 100%; border: none; font-size: 12px; font-weight: bold; margin-bottom: 10px;">
                        <tr>
                            <td style="border: none; width: 50%;">اسم الزائر: ${data.visitorName}</td>
                            <td style="border: none; width: 50%; text-align: left;">الوظيفة: ${data.visitorPosition}</td>
                        </tr>
                    </table>

                    <div style="border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 10px; font-weight: bold;">
                        ● معيار التقييم: متميز (1) – جيد (2) - ملائم (3) – غير ملائم (4) – يحتاج إلى تدخل سريع (5)
                    </div>
                </div>
            `;
        }

        async function getReportData() {
            const imgMinistryUrl = "https://i.imgur.com/TeE90J3.png";
            const imgQualityUrl = "https://i.imgur.com/tbfi4V4.png";
            const imgVisionUrl = "https://i.imgur.com/AmHGqEM.jpeg";

            const [imgMinistry, imgQuality, imgVision] = await Promise.all([
                getBase64Image(imgMinistryUrl, 60),
                getBase64Image(imgQualityUrl, 60),
                getBase64Image(imgVisionUrl, 60)
            ]);

            const scores = {};
            evaluationItems.forEach(item => {
                scores[`item-${item.id}`] = document.querySelector(`#score-${item.id}`).textContent;
            });

            return {
                imgMinistry, imgQuality, imgVision,
                school: document.querySelector('#school').value || "",
                teacher: document.querySelector('#teacherName').value || "",
                subject: document.querySelector('#subject').value || "",
                date: document.querySelector('#visitDate').value || "",
                fileNo: document.querySelector('#fileNumber').value || "",
                visitNo: document.querySelector('#visitNumber').value || "",
                className: document.querySelector('#class').value || "",
                lesson: document.querySelector('#lesson').value || "",
                topic: document.querySelector('#topic').value || "",
                visitorName: document.querySelector('#visitorName').value || "",
                visitorPosition: document.querySelector('#visitorPosition').value || "",
                strengths: document.querySelector('#strengthsContent').value.replace(/\n/g, '<br>') || "",
                needs: document.querySelector('#developmentContent').value.replace(/\n/g, '<br>') || "",
                recs: document.querySelector('#recommendationsContent').value.replace(/\n/g, '<br>') || "",
                scores: scores
            };
        }

        // =========================================================================
        // BACKUP / IMPORT
        // =========================================================================
        function exportBackup() {
            const backup = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('supervision_v6_') || key.startsWith('visit_v5_')) {
                    backup[key] = localStorage.getItem(key);
                }
            }
            if (Object.keys(backup).length === 0) {
                showToast('لا توجد بيانات للتصدير', 'error');
                return;
            }
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'نسخة_احتياطية_' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            URL.revokeObjectURL(url);
            showToast('تم تصدير النسخة الاحتياطية بنجاح');
        }

        function importBackup(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    let count = 0;
                    Object.keys(data).forEach(key => {
                        if (key.startsWith('supervision_v6_') || key.startsWith('visit_v5_')) {
                            localStorage.setItem(key, data[key]);
                            count++;
                        }
                    });
                    showToast('تم استيراد ' + count + ' سجل بنجاح');
                    renderSavedReports();
                    try { renderSchoolReportsList(); } catch(e) {}
                } catch (err) {
                    showToast('خطأ في قراءة الملف', 'error');
                }
            };
            reader.readAsText(file);
        }

        // =========================================================================
        function exportToMoe() {
            const strengths = document.querySelector('#strengthsContent')?.value?.trim() || '';
            const needsDev  = document.querySelector('#developmentContent')?.value?.trim() || '';
            const recs      = document.querySelector('#recommendationsContent')?.value?.trim() || '';

            if (!strengths && !needsDev && !recs) {
                showToast('يرجى توليد التقرير أولاً قبل التصدير', 'error');
                return;
            }

            const rawDate = document.querySelector('#visitDate')?.value?.trim() || '';
            let portalDate = rawDate;
            if (rawDate.includes('-')) {
                const [y, mo, d] = rawDate.split('-');
                portalDate = d + '/' + mo + '/' + y;
            }

            // مصفوفة التقييمات بالترتيب (13 قيمة)
            const ratings = evaluationItems.map(item =>
                parseInt(document.querySelector('#score-' + item.id)?.textContent?.trim() || '3', 10)
            );

            const exportData = {
                date:            portalDate,
                teacher:         document.querySelector('#teacherName')?.value?.trim()     || '',
                lesson:          document.querySelector('#lesson')?.value?.trim()          || '',
                period:          document.querySelector('#visitNumber')?.value?.trim()     || '',
                ratings:         ratings,
                excellence:      strengths,
                development:     needsDev,
                support:         '',
                recommendations: recs
            };

            const jsonStr = JSON.stringify(exportData);
            navigator.clipboard.writeText(jsonStr);

            const ministryUrl = 'https://moe.gov.om/SMS/SupervisionVisits/SupervisionVisitsModule.aspx?VisitMode=1';

            // ====== نافذة التأكيد ======
            const existingModal = document.getElementById('moeExportModal');
            if (existingModal) existingModal.remove();

            const overlay = document.createElement('div');
            overlay.id = 'moeExportModal';
            overlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
            overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full" dir="rtl">
              <div class="flex items-center justify-between p-5 border-b border-slate-200">
                <h3 class="text-lg font-bold text-slate-800">🚀 تصدير لموقع الوزارة</h3>
                <button onclick="document.getElementById('moeExportModal').remove()" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
              </div>
              <div class="p-5 space-y-4">

                <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <div class="text-3xl mb-2">✅</div>
                  <div class="font-bold text-emerald-800 mb-1">تم نسخ البيانات للحافظة</div>
                  <p class="text-sm text-emerald-700">انتقل الآن لبوابة الوزارة والصق البيانات</p>
                </div>

                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div class="text-xs text-slate-500 mb-1 font-mono">البيانات المُصدَّرة (JSON)</div>
                  <textarea id="moe-json-preview" class="w-full font-mono text-xs bg-white border border-slate-200 rounded-lg p-2 h-28 resize-none" readonly></textarea>
                  <button onclick="navigator.clipboard.writeText(document.getElementById('moe-json-preview').value).then(()=>showToast('تم النسخ مجدداً ✅'))" class="mt-2 w-full bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs transition-colors">إعادة النسخ</button>
                </div>

                <button onclick="window.open('${ministryUrl}','_blank');document.getElementById('moeExportModal').remove()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  فتح موقع الوزارة ←
                </button>

              </div>
            </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('moe-json-preview').value = jsonStr;
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
            showToast('تم نسخ البيانات للحافظة ✅');
        }

        function exportSchoolVisitToMoe() {
            const visitorOpinion  = document.getElementById('visitorOpinion')?.value?.trim()  || '';
            const recommendations = document.getElementById('recommendations')?.value?.trim() || '';

            if (!visitorOpinion) {
                showToast('يرجى توليد رأي الزائر أولاً قبل التصدير', 'error');
                return;
            }

            const rawDate = document.getElementById('schoolVisitDate')?.value?.trim() || '';
            let portalDate = rawDate;
            if (rawDate.includes('-')) {
                const [y, mo, d] = rawDate.split('-');
                portalDate = `${d}/${mo}/${y}`;
            }

            const typeKey  = document.getElementById('visitTypeSelect')?.value || '';
            const typeName = schoolVisitTypesData?.[typeKey]?.name || typeKey;

            // تحويل نوع الزيارة لرقم البوابة
            const VISIT_TYPE_MAP = {
                'اشرافية': '1', 'إشرافية': '1', 'supervisory': '1',
                'gov_exploratory': '2', 'استطلاعية': '2', 'إستطلاعية': '2',
                'اخرى': '3', 'أخرى': '3',
            };
            let visitTypeNum = '1';
            for (const [key, val] of Object.entries(VISIT_TYPE_MAP)) {
                if ((typeName || typeKey).includes(key)) { visitTypeNum = val; break; }
            }

            const objectives = Array.from(document.querySelectorAll('#objectivesContainer input[name="objectives"]:checked'))
                .map(cb => cb.value.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim());

            const exportData = {
                visitType:       visitTypeNum,
                visitTypeName:   typeName,
                school:          document.getElementById('schoolName')?.value?.trim() || '',
                date:            portalDate,
                arrivalTime:     document.getElementById('schoolArrivalTime')?.value || '08:00',
                departureTime:   document.getElementById('schoolDepartureTime')?.value || '12:00',
                objectives,
                classroomVisits: schoolClassroomVisits || [],
                visitorOpinion,
                recommendations
            };

            const jsonStr    = JSON.stringify(exportData);
            const ministryUrl = 'https://moe.gov.om/SMS/VariousRecords/SchoolVisits/SchoolVisitsMain.aspx';

            // تخزين للسكربت التلقائي — GM_setValue + localStorage + hash URL
            try { if (typeof GM_setValue === 'function') GM_setValue('svf_school_visit_data', jsonStr); } catch(e) {}
            localStorage.setItem('sv_moe_school_export', jsonStr);
            navigator.clipboard.writeText(jsonStr);

            const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
            const typeLabels = { '1': 'إشرافية', '2': 'استطلاعية', '3': 'أخرى' };

            const existingModal = document.getElementById('schoolMoeExportModal');
            if (existingModal) existingModal.remove();

            const overlay = document.createElement('div');
            overlay.id = 'schoolMoeExportModal';
            overlay.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
            overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full" dir="rtl">
              <div class="flex items-center justify-between p-5 border-b border-slate-200">
                <h3 class="text-lg font-bold text-slate-800">🏫 تصدير زيارة مدرسية للوزارة</h3>
                <button onclick="document.getElementById('schoolMoeExportModal').remove()" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
              </div>
              <div class="p-5 space-y-4">
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                  سيتم نقلك لبوابة الوزارة وتعبئة استمارة الزيارة المدرسية تلقائياً بالبيانات التالية:
                </div>
                <table class="w-full text-sm border-collapse">
                  <tr class="bg-slate-50"><td class="px-3 py-2 text-slate-500 w-2/5">المدرسة</td><td class="px-3 py-2 font-semibold">${exportData.school || '—'}</td></tr>
                  <tr><td class="px-3 py-2 text-slate-500">التاريخ</td><td class="px-3 py-2 font-semibold">${exportData.date || '—'}</td></tr>
                  <tr class="bg-slate-50"><td class="px-3 py-2 text-slate-500">نوع الزيارة</td><td class="px-3 py-2 font-semibold">${typeLabels[visitTypeNum] || typeName || '—'}</td></tr>
                  <tr><td class="px-3 py-2 text-slate-500">وقت الوصول</td><td class="px-3 py-2 font-semibold">${exportData.arrivalTime}</td></tr>
                  <tr class="bg-slate-50"><td class="px-3 py-2 text-slate-500">وقت الانصراف</td><td class="px-3 py-2 font-semibold">${exportData.departureTime}</td></tr>
                  <tr><td class="px-3 py-2 text-slate-500">الأهداف</td><td class="px-3 py-2 text-xs">${objectives.length > 0 ? objectives.slice(0,3).join(' • ').substring(0, 80) + '...' : '—'}</td></tr>
                </table>
                <div class="flex gap-3">
                  <button id="svf-go-btn" class="flex-1 bg-gradient-to-br from-amber-600 to-amber-800 hover:from-amber-700 hover:to-amber-900 text-white py-3 rounded-xl text-sm font-bold transition-colors">
                    فتح موقع الوزارة والتعبئة التلقائية
                  </button>
                  <button onclick="document.getElementById('schoolMoeExportModal').remove()" class="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-xl text-sm transition-colors">إلغاء</button>
                </div>
              </div>
            </div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

            document.getElementById('svf-go-btn').addEventListener('click', () => {
                const url = ministryUrl + '#svf=' + b64;
                window.open(url, '_blank');
                overlay.remove();
            });

            showToast('تم نسخ البيانات للحافظة ✅');
        }

 async function printArchivedReport(reportKey) {
            try {
                const stored = JSON.parse(localStorage.getItem(reportKey));
                if (!stored || !stored.formData) {
                    showToast('لا توجد بيانات لهذا التقرير', 'error');
                    return;
                }
                const fd = stored.formData;
                showToast('جاري تجهيز الطباعة...', 'info');

                const imgMinistryUrl = "https://i.imgur.com/TeE90J3.png";
                const imgQualityUrl = "https://i.imgur.com/tbfi4V4.png";
                const imgVisionUrl = "https://i.imgur.com/AmHGqEM.jpeg";
                const [imgMinistry, imgQuality, imgVision] = await Promise.all([
                    getBase64Image(imgMinistryUrl, 60),
                    getBase64Image(imgQualityUrl, 60),
                    getBase64Image(imgVisionUrl, 60)
                ]);

                const scores = {};
                evaluationItems.forEach(item => {
                    scores[`item-${item.id}`] = fd[`score-${item.id}`] || '3';
                });

                const data = {
                    imgMinistry, imgQuality, imgVision,
                    school: fd.school || '',
                    teacher: fd.teacherName || '',
                    subject: fd.subject || '',
                    date: fd.visitDate || '',
                    fileNo: fd.fileNumber || '',
                    visitNo: fd.visitNumber || '',
                    className: fd.class || '',
                    lesson: fd.lesson || '',
                    topic: fd.topic || '',
                    visitorName: fd.visitorName || '',
                    visitorPosition: fd.visitorPosition || '',
                    strengths: (fd.strengthsContent || '').replace(/\n/g, '<br>'),
                    needs: (fd.developmentContent || '').replace(/\n/g, '<br>'),
                    recs: (fd.recommendationsContent || '').replace(/\n/g, '<br>'),
                    scores
                };

                const printView = document.getElementById('printView');
                printView.innerHTML = getReportHTML(data, false);
                setTimeout(() => window.print(), 500);
            } catch (e) {
                showToast('خطأ في تجهيز الطباعة', 'error');
            }
        }

        function renderSavedReports() {
            const listContainer = document.querySelector('#saved-reports-list');
            const noReportsMessage = document.querySelector('#no-saved-reports-message');
            const filterText = (document.querySelector('#filter-reports-input')?.value || '').toLowerCase();
            const filterMonth = document.querySelector('#filter-reports-month')?.value || '';

            if (!listContainer) return;

            listContainer.innerHTML = '';
            let reports = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('supervision_v6_visit_') || key.startsWith('visit_v5_')) {
                    try {
                        const parsedData = JSON.parse(localStorage.getItem(key));
                        if (parsedData && typeof parsedData === 'object') {
                            reports.push({ key, data: parsedData });
                        }
                    } catch(e) {}
                }
            }

            reports.sort((a, b) => {
                const dateA = a.data?.visitDate ? new Date(a.data.visitDate).getTime() : 0;
                const dateB = b.data?.visitDate ? new Date(b.data.visitDate).getTime() : 0;
                return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
            });

            let found = false;

            reports.forEach(({ key, data }) => {
                if (!data) return;
                const schoolName = data.school || '-';
                const tName = data.teacherName || '';
                const visitDate = data.visitDate || '';

                // Text filter (name or school)
                const matchText = tName.toLowerCase().includes(filterText) || schoolName.toLowerCase().includes(filterText);

                // Month filter (YYYY-MM format)
                const matchMonth = !filterMonth || visitDate.startsWith(filterMonth);

                if (matchText && matchMonth) {
                    found = true;
                    const scoreTotal = Array.isArray(data.scores) ? data.scores.reduce((s, v) => s + v, 0) : null;
                    const scoreLabel = scoreTotal !== null
                        ? `<span class="inline-block bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full mt-1">${scoreTotal} / 65</span>`
                        : '';
                    const card = document.createElement('div');
                    card.className = 'bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between';
                    card.innerHTML = `
                        <div class="mb-4">
                            <h4 class="font-bold text-slate-800 text-lg">${tName || 'غير معروف'}</h4>
                            <div class="text-sm text-slate-500 mt-1 flex flex-col gap-1">
                                <span><i class="fa-solid fa-school ml-1 text-slate-400"></i> ${schoolName}</span>
                                <span><i class="fa-regular fa-calendar ml-1 text-slate-400"></i> ${visitDate || '-'}</span>
                                ${scoreLabel}
                            </div>
                        </div>
                        <div class="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                            <button class="load-btn flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 py-2 rounded-lg text-sm font-bold transition-colors" data-key="${key}">عرض</button>
                            <button class="print-archive-btn flex-1 bg-green-50 text-green-600 hover:bg-green-100 py-2 rounded-lg text-sm font-bold transition-colors" data-key="${key}"><i class="fa-solid fa-print ml-1"></i>طباعة</button>
                            <button class="delete-btn flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-2 rounded-lg text-sm font-bold transition-colors" data-key="${key}">حذف</button>
                        </div>
                    `;
                    listContainer.appendChild(card);
                }
            });

            if (noReportsMessage) {
                if (found) noReportsMessage.classList.add('hidden');
                else noReportsMessage.classList.remove('hidden');
            }
        }

