        // =========================================================================
        // 3. UNIFIED HTML GENERATOR FOR PRINT & WORD
        // =========================================================================
        function getReportHTML(data, isWord = false) {
            // استمارة الزيارة الإشرافية الرسميّة (العام الدراسي 2026/2027) — انظر officialFormItems في templates.js.
            // رأسٌ نصّيّ بلا شعارات، وكتلة معلوماتٍ رماديّة بعمودين بلا حدود، وجدولٌ واحدٌ متّصلٌ من ستّة
            // أعمدة (المجال/المعيار مدموجان رأسيّاً)، عمود «الإجادة» على البنود 1–7 و«التطوير» على 8–13،
            // وآخر صفٍّ «التوصيات» في الجدول نفسه.
            const FORM = officialFormItems;
            const SPLIT_AT = 8;
            const HEAD = "'Adobe Arabic','Traditional Arabic','Times New Roman',serif";
            const TITLE = "'Tajawal Black','Tajawal',Arial,sans-serif";
            const BODY = "Arial,'Helvetica Neue',sans-serif";
            const CELL = 'border:0.75pt solid #000; padding:2pt 4pt; vertical-align:middle;';
            const nbsp = n => '&nbsp;'.repeat(n);

            // كلّ نصّ خليّةٍ في فقرةٍ بلا هوامش: Word يستورد نصّ الخليّة المجرَّد بمسافةٍ قبل وبعد
            // («Normal (Web)») فتتضخّم الصفوف ويفيض الجدول عن صفحةٍ واحدة، والقالب الرسميّ بلا هذه المسافات
            const p = (text, style) => `<p style="margin:0; mso-margin-top-alt:0pt; mso-margin-bottom-alt:0pt; ${style || ''}">${text}</p>`;

            // العام الدراسي من تاريخ الزيارة (يبدأ في أغسطس)؛ بلا تاريخٍ صحيحٍ يبقى كما في الاستمارة
            const academicYear = (d) => {
                const m = String(d || '').match(/^(\d{4})-(\d{2})/);
                if (!m) return '2026/2027';
                const start = +m[2] >= 8 ? +m[1] : +m[1] - 1;
                return `${start}/${start + 1}`;
            };

            const spanFrom = (i, same) => { let n = 1; while (FORM[i + n] && same(FORM[i], FORM[i + n])) n++; return n; };
            const firstBlock = FORM.filter(x => x.id < SPLIT_AT).length;
            const secondBlock = FORM.length - firstBlock;

            const bodyRows = FORM.map((item, i) => {
                const prev = FORM[i - 1];
                const newDomain = !prev || prev.domain !== item.domain;
                const newStandard = newDomain || prev.standard !== item.standard;
                const score = data.scores[`item-${item.id}`] || '';

                let side = '';
                if (i === 0) {
                    side = `<td rowspan="${firstBlock}" style="${CELL} vertical-align:top;">${p(data.strengths, 'text-align:right; font-size:10pt;')}</td>`;
                } else if (item.id === SPLIT_AT) {
                    side = `<td rowspan="${secondBlock}" style="${CELL} vertical-align:top;">${p('الجوانب التي تحتاج إلى تطوير في الأداء وأدلتها', 'text-align:center; font-weight:bold; font-size:12pt;')}${p(data.needs, 'text-align:right; font-size:10pt;')}</td>`;
                }

                return `<tr>
                    ${newDomain ? `<td rowspan="${spanFrom(i, (a, b) => a.domain === b.domain)}" style="${CELL}">${p(item.domain, 'text-align:center;')}</td>` : ''}
                    ${newStandard ? `<td rowspan="${spanFrom(i, (a, b) => a.domain === b.domain && a.standard === b.standard)}" style="${CELL}">${p(item.standard, 'text-align:center;')}</td>` : ''}
                    <td style="${CELL}">${p(item.id, 'text-align:center;')}</td>
                    <td style="${CELL}">${p(item.title, 'text-align:right;')}</td>
                    <td style="${CELL}">${p(score, 'text-align:center;')}</td>
                    ${side}
                </tr>`;
            }).join('');

            const infoCell = (w, text) => `<td style="width:${w}%; background-color:#F2F2F2; border:none; padding:3pt 5pt;">${p(text, `font-family:${HEAD}; font-size:12pt; font-weight:bold; text-align:justify;`)}</td>`;
            const infoRow = (a, b) => `<tr>${infoCell(58, a)}${infoCell(42, b)}</tr>`;

            const th = (w, text, shaded) => `<th style="width:${w}%; ${CELL} height:32px;${shaded ? ' background-color:#F2F2F2;' : ''}">${p(text, 'text-align:center; font-weight:bold; font-size:12pt;')}</th>`;

            return `
                <div style="font-family:${BODY}; font-size:12pt; color:#000; direction:rtl; text-align:right; width:100%;">

                    ${p(`المديرية العامة للتعليم بمحافظة مسقط${nbsp(32)}العام الدراسي: (${academicYear(data.date)}م)`, `font-family:${HEAD}; font-size:12pt; font-weight:bold;`)}
                    ${p(`${nbsp(14)}دائرة تطوير الأداء المدرسي`, `font-family:${HEAD}; font-size:12pt; font-weight:bold;`)}
                    ${p('&nbsp;', 'text-align:center; font-size:12pt;')}
                    <p style="margin:0 0 6pt; mso-margin-top-alt:0pt; text-align:center; font-family:${TITLE}; font-size:14pt; font-weight:bold;">استمارة زيارة إشرافية لمعلم مجال/ مادة</p>

                    <table style="width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:8pt;">
                        ${infoRow('المدرسة: ' + data.school, 'اسم المعلم: ' + data.teacher)}
                        ${infoRow('رقم الملف: ' + data.fileNo, 'المادة/ المجال: ' + (data.subject || 'رياضة مدرسية'))}
                        ${infoRow('رقم الزيارة: ' + data.visitNo, 'التاريخ: ' + data.date)}
                        ${infoRow('الصف: ' + data.className, 'الحصة: ' + data.lesson)}
                        ${infoRow('الموضوع: ' + data.topic, '')}
                    </table>

                    <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-family:${BODY}; font-size:12pt;">
                        <thead>
                            <tr>
                                ${th(13, 'المجال', true)}
                                ${th(14, 'المعيار', true)}
                                ${th(6, 'البنود', true)}
                                ${th(35, 'المؤشرات', true)}
                                ${th(7, 'التقدير', true)}
                                ${th(25, 'جوانب الإجادة في الأداء وأدلتها', false)}
                            </tr>
                        </thead>
                        <tbody>
                            ${bodyRows}
                            <tr>
                                <td colspan="6" style="${CELL} height:68px; vertical-align:top; padding:4pt 6pt;">
                                    ${p('التوصيات:', "text-align:right; font-family:'Times New Roman',serif; font-size:14pt;")}
                                    ${p(data.recs, 'text-align:right; font-size:12pt;')}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    ${p('معيار التقييم: متميز (1) - جيد (2) - ملائم (3) - غير ملائم (4) - يحتاج إلى تدخل (5)', `margin-top:6pt; text-align:center; font-family:${BODY}; font-size:12pt;`)}
                </div>
            `;
        }

        async function getReportData() {
            const scores = {};
            evaluationItems.forEach(item => {
                scores[`item-${item.id}`] = document.querySelector(`#score-${item.id}`).textContent;
            });

            return {
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

            // الوصف الإشرافي لكل بند — يُعبَّأ في خانة بنده بالبوّابة
            const notes = {};
            evaluationItems.forEach(item => {
                const v = document.querySelector('#notes-' + item.id)?.textContent?.trim() || '';
                if (v) notes[item.id] = v;
            });

            const q = (sel) => document.querySelector(sel)?.value?.trim() || '';
            const exportData = {
                kind:            'supervision',
                date:            portalDate,
                teacher:         q('#teacherName'),
                school:          q('#school') || q('#schoolName'),
                subject:         q('#subject'),      // المادة
                period:          q('#lesson'),       // الحصة
                lessonTitle:     q('#topic'),        // الموضوع
                className:       q('#class'),
                fileNumber:      q('#fileNumber'),
                visitNumber:     q('#visitNumber'),
                ratings:         ratings,
                notes:           notes,
                excellence:      strengths,
                development:     needsDev,
                recommendations: recs
            };

            const jsonStr = JSON.stringify(exportData);

            // قنوات الوصول إلى سكربت الأتمتة: الثلاث معاً لأن أيّها قد ينقطع
            try { if (typeof GM_setValue === 'function') GM_setValue('svf_supervision_visit_data', jsonStr); } catch (e) {}
            try { localStorage.setItem('sv_moe_supervision_export', jsonStr); } catch (e) {}
            try { navigator.clipboard.writeText(jsonStr); } catch (e) {}

            const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
            const ministryUrl = 'https://moe.gov.om/SMS/SupervisionVisits/SupervisionVisitsModule.aspx?VisitMode=1';

            // الفتح داخل ضغطة المستخدم نفسها — التأجيل يُفقِده تصريح
            // النافذة فيحجبه المتصفّح.
            const portalWin = window.open(ministryUrl + '#svfs=' + b64, '_blank');
            const blocked = !portalWin;

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

                ${blocked ? `
                <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <div class="text-3xl mb-2">⚠️</div>
                  <div class="font-bold text-amber-800 mb-1">حجب المتصفّح فتح البوّابة</div>
                  <p class="text-sm text-amber-700">اسمح بالنوافذ المنبثقة لهذا الموقع، أو افتحها بالزرّ أدناه</p>
                </div>` : `
                <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <div class="text-3xl mb-2">🚀</div>
                  <div class="font-bold text-emerald-800 mb-1">فُتحت بوّابة الوزارة في تبويب جديد</div>
                  <p class="text-sm text-emerald-700">يتولّى سكربت الأتمتة التعبئة والحفظ — تابِع اللوحة هناك</p>
                </div>`}

                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div class="text-xs text-slate-500 mb-1 font-mono">البيانات المُصدَّرة (JSON)</div>
                  <textarea id="moe-json-preview" class="w-full font-mono text-xs bg-white border border-slate-200 rounded-lg p-2 h-28 resize-none" readonly></textarea>
                  <button onclick="navigator.clipboard.writeText(document.getElementById('moe-json-preview').value).then(()=>showToast('تم النسخ مجدداً ✅'))" class="mt-2 w-full bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs transition-colors">إعادة النسخ</button>
                </div>

                <button onclick="window.open('${ministryUrl}#svfs=${b64}','_blank');document.getElementById('moeExportModal').remove()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  ${blocked ? 'فتح بوّابة الوزارة ←' : 'فتحها مرّة أخرى ←'}
                </button>

              </div>
            </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('moe-json-preview').value = jsonStr;
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
            showToast(blocked ? 'حجب المتصفّح فتح البوّابة' : 'فُتحت بوّابة الوزارة 🚀',
                      blocked ? 'error' : 'success');
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

            // البوّابة كانت تتلقّى الأهداف بلا ترقيمٍ (رقم القائمة الكاملة يُنزَع لأنّه لا يطابق
            // المحدَّد)، فيخرج «موضوع الزيارة» كتلة نصٍّ متلاصقة. تُرقَّم هنا تسلسليّاً ١، ٢، …
            // بنفس ترقيم رأي الزائر (كلاهما من الأهداف المحدَّدة بالترتيب نفسه).
            const objectives = Array.from(document.querySelectorAll('#objectivesContainer input[name="objectives"]:checked'))
                .map(cb => cb.value.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim())
                .map((o, i) => (i + 1) + '- ' + o);

            const routeLines = (typeof SchoolRoute !== 'undefined')
                ? SchoolRoute.routeLines(document.getElementById('schoolCameFrom')?.value, document.getElementById('schoolGoingTo')?.value) : [];

            const exportData = {
                visitType:       visitTypeNum,
                visitTypeName:   typeName,
                school:          document.getElementById('schoolName')?.value?.trim() || '',
                date:            portalDate,
                arrivalTime:     document.getElementById('schoolArrivalTime')?.value || '08:00',
                departureTime:   document.getElementById('schoolDepartureTime')?.value || '12:00',
                // الأهداف ثمّ خطّ سير اليوم: السكربت يدمج المصفوفة بسطرٍ لكلّ عنصر (js/route.js)
                objectives: objectives.concat(routeLines),
                // البوّابة تقرأ خمسة حقولٍ فقط: ما أضافته قاعدة المعلمين (رقم الملف
                // والجنس) يبقى في التقرير ولا يُثقل حمولة الرابط ولا يُرسَل بلا حاجة
                classroomVisits: (schoolClassroomVisits || []).map(cv =>
                    ({ teacher: cv.teacher, grade: cv.grade, period: cv.period, subject: cv.subject, rating: cv.rating })),
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

            // الفتح داخل ضغطة المستخدم نفسها — التأجيل يُفقِده تصريح
            // النافذة فيحجبه المتصفّح.
            const schoolPortalWin = window.open(ministryUrl + '#svf=' + b64, '_blank');
            const schoolBlocked = !schoolPortalWin;

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
                  ${routeLines.length ? '<tr class="bg-slate-50"><td class="px-3 py-2 text-slate-500">خطّ السير</td><td class="px-3 py-2 text-xs">' + routeLines.map(l => l.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))).join(' • ') + '</td></tr>' : ''}
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

            const goBtn = document.getElementById('svf-go-btn');
            if (goBtn) {
                if (!schoolBlocked) goBtn.textContent = 'فتحها مرّة أخرى ←';
                goBtn.addEventListener('click', () => {
                    window.open(ministryUrl + '#svf=' + b64, '_blank');
                    overlay.remove();
                });
            }

            showToast(schoolBlocked ? 'حجب المتصفّح فتح البوّابة — افتحها بالزرّ'
                                    : 'فُتحت بوّابة الوزارة 🚀',
                      schoolBlocked ? 'error' : 'success');
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

                const scores = {};
                evaluationItems.forEach(item => {
                    scores[`item-${item.id}`] = fd[`score-${item.id}`] || '3';
                });

                const data = {
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
                    // مربّع الاختيار للرفع إلى البوّابة، والتحديد يبقى بعد إعادة الرسم
                    const picked = window.svfSelected ? window.svfSelected.has(key) : false;
                    const portalDate = visitDate.includes('-')
                        ? visitDate.split('-').reverse().join('/') : visitDate;
                    let stateBadge = '';
                    let confirmSentBtn = '';
                    if (window.svfIsSent && window.svfIsSent(tName, portalDate)) {
                        stateBadge = `<span class="text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">حُفظت في البوابة</span>`;
                    } else {
                        if (window.svfIsQueued && window.svfIsQueued(key)) {
                            stateBadge = `<span class="text-[11px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full" title="رُفعت إلى البوابة من هنا — تأكيد الحفظ يحدث داخل البوابة">سبق رفعها</span>`;
                        }
                        // تأكيدٌ يدويّ — الكشف التلقائيّ (سكربت تامبر مانكي) قد لا يصل أحياناً
                        // (جهازٌ آخر، أو سكربتٌ غير مثبَّت)؛ يكتب المفتاح نفسه الذي يكتبه الكشف التلقائيّ
                        const attrTeacher = String(tName).replace(/"/g, '&quot;');
                        const attrDate = String(portalDate).replace(/"/g, '&quot;');
                        confirmSentBtn = `<button type="button" class="confirm-sent-btn text-[11px] font-bold text-slate-400 hover:text-emerald-700 hover:underline" data-teacher="${attrTeacher}" data-date="${attrDate}" title="اضغط إن كنت متأكّداً أنّ هذه الزيارة حُفظت فعلاً في البوابة">✓ تأكيد الحفظ يدويّاً</button>`;
                    }

                    const card = document.createElement('div');
                    card.className = 'bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between';
                    card.innerHTML = `
                        <label class="flex items-center gap-2 mb-3 cursor-pointer select-none">
                            <input type="checkbox" class="queue-pick w-4 h-4 accent-indigo-600" data-key="${key}" ${picked ? 'checked' : ''}>
                            <span class="text-xs text-slate-500">تحديد للرفع</span>
                            ${stateBadge}${confirmSentBtn}
                        </label>
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
                            <button class="edit-btn flex-1 bg-amber-50 text-amber-600 hover:bg-amber-100 py-2 rounded-lg text-sm font-bold transition-colors" data-key="${key}">تعديل</button>
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

            if (typeof window.svfUpdateSelectionUI === 'function') window.svfUpdateSelectionUI();
        }

