        // =========================================================================
        // 2. SHARED UTILITIES
        // =========================================================================
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            if(!container) return;
            const toastMsg = document.getElementById('toast-message');
            const icon = document.getElementById('toast-icon');
            const text = document.getElementById('toast-text');
            
            container.classList.remove('opacity-0', 'translate-y-4');
            
            if (type === 'success') {
                toastMsg.className = 'bg-emerald-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 font-medium';
                icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            } else if (type === 'error') {
                toastMsg.className = 'bg-red-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 font-medium';
                icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
            } else {
                toastMsg.className = 'bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 font-medium';
                icon.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
            }
            
            text.textContent = message;
            setTimeout(() => { container.classList.add('opacity-0', 'translate-y-4'); }, 3000);
        }

        function copyText(text) {
            if (!text) { showToast('لا يوجد نص لنسخه', 'error'); return; }
            navigator.clipboard.writeText(text).then(() => showToast('تم نسخ النص')).catch(() => showToast('فشل النسخ', 'error'));
        }

        function showView(viewElement) {
            if(!viewElement) return;
            document.getElementById('welcomeView')?.classList.add('hidden');
            document.getElementById('supervisoryVisitsApp')?.classList.add('hidden');
            document.getElementById('schoolVisitsApp')?.classList.add('hidden');
            document.getElementById('lettersApp')?.classList.add('hidden');
            viewElement.classList.remove('hidden');
            window.scrollTo(0, 0);
        }

        window.addCustomEvidence = function(itemId) {
            const input = document.querySelector(`.new-evidence-input[data-id="${itemId}"]`);
            const value = input?.value?.trim();
            if (!value) return;
            const content = evidenceBasedContent[itemId];
            if (!content) return;
            const rating = parseInt(document.querySelector(`#score-${itemId}`)?.textContent || '0');
            const targetList = (rating >= 4) ? content.neg_evidences : content.evidences;
            if (targetList.includes(value)) {
                showToast('هذا الشاهد موجود مسبقاً.', 'info');
                return;
            }
            targetList.push(value);
            input.value = '';
            openEvidencePanel(itemId);
            const newCheckbox = document.querySelector(`#evidence-list-${itemId} input[value="${CSS.escape(value)}"]`);
            if (newCheckbox) { newCheckbox.checked = true; }
            updateDescriptionFromPanel(itemId);
            showToast('تمت إضافة الشاهد.', 'success');
        };
        window.deleteCustomEvidence = function(itemId, value) {
            const content = evidenceBasedContent[itemId];
            if (!content) return;
            content.evidences = content.evidences.filter(e => e !== value);
            content.neg_evidences = content.neg_evidences.filter(e => e !== value);
            openEvidencePanel(itemId);
            updateDescriptionFromPanel(itemId);
            showToast('تم حذف الشاهد.', 'success');
        };

        const getBase64Image = (url, targetHeight = 100) => {
            return new Promise((resolve) => {
                let isResolved = false;
                const img = new Image();
                img.crossOrigin = 'Anonymous'; 
                const timeoutId = setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        resolve(url);
                    }
                }, 5000);
                img.src = url;
                img.onload = () => {
                    if (isResolved) return;
                    clearTimeout(timeoutId);
                    const ratio = img.width / img.height;
                    const newHeight = targetHeight;
                    const newWidth = newHeight * ratio;
                    const canvas = document.createElement('canvas');
                    canvas.width = newWidth;
                    canvas.height = newHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, newWidth, newHeight);
                    try {
                        const dataURL = canvas.toDataURL(url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg', 0.9);
                        isResolved = true;
                        resolve(dataURL);
                    } catch (e) {
                        isResolved = true;
                        resolve(url);
                    }
                };
                img.onerror = () => {
                    if (isResolved) return;
                    clearTimeout(timeoutId);
                    isResolved = true;
                    resolve(url);
                };
            });
        };


        // =========================================================================
        //  درجات تقريرٍ إشرافيّ محفوظ
        //
        //  savePermanentReport يحفظها داخل formData بمعرّفات عناصر النموذج
        //  (score-1 … score-13)، بينما كانت نسخةٌ أقدم تحفظها مصفوفةً في جذر
        //  التقرير. قرّاء الدرجات (شارة المجموع، توزيع التقييمات، متوسط الأداء)
        //  كانوا يقرأون الجذر وحده، فلم تظهر لهم درجةُ أيّ تقريرٍ حديث.
        //  تُقرأ الصيغتان هنا في موضعٍ واحد.
        // =========================================================================
        function svfReportScores(report) {
            if (!report || typeof report !== 'object') return [];

            const clean = n => {
                const v = parseInt(n, 10);
                return (v >= 1 && v <= 5) ? v : null;
            };

            if (Array.isArray(report.scores)) {
                return report.scores.map(clean).filter(v => v !== null);
            }

            const fd = report.formData;
            if (!fd || typeof fd !== 'object') return [];

            return Object.keys(fd)
                .map(k => {
                    const m = /^score-(\d+)$/.exec(k);
                    return m ? { id: parseInt(m[1], 10), v: clean(fd[k]) } : null;
                })
                .filter(x => x && x.v !== null)
                .sort((a, b) => a.id - b.id)
                .map(x => x.v);
        }

        // نصٌّ يدخل HTML: أسماء المعلمين والمدارس تصل من أجهزةٍ أخرى بالمزامنة
        function svfEscapeHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
                ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        }

        // ─── «التلاميذ» لا «الطلبة» في الصفوف ١–٤ (منذ 2026-10-11، طلب المشرف) ───
        // تحويل ألفاظ الطلبة في النصوص المولَّدة؛ «كتاب الطالب/كتب الطالب» اسم كتابٍ رسميّ فيبقى.
        // المطابقة بكلمةٍ كاملة (الحرف قبلها وبعدها ليس عربيّاً) — «طالبة/طلباتهم» لا تُمسّ.
        const SVF_PUPIL_WORDS = [
            ['للطلبة', 'للتلاميذ'], ['والطلبة', 'والتلاميذ'], ['بالطلبة', 'بالتلاميذ'], ['الطلبة', 'التلاميذ'],
            ['طلبتهم', 'تلاميذهم'], ['طلبتها', 'تلاميذها'], ['طلبته', 'تلاميذه'], ['طلبة', 'تلاميذ'],
            ['للطلاب', 'للتلاميذ'], ['الطلاب', 'التلاميذ'], ['طلاب', 'تلاميذ'],
            ['للطالب', 'للتلميذ'], ['والطالب', 'والتلميذ'], ['الطالب', 'التلميذ'], ['طالب', 'تلميذ']
        ];
        function svfPupilText(text) {
            const AR = '\u0600-\u06FF';
            let s = String(text == null ? '' : text);
            const kept = [];
            s = s.replace(/(?:كتاب|كتب) الطالب/g, m => { kept.push(m); return '\u0001' + (kept.length - 1) + '\u0001'; });
            SVF_PUPIL_WORDS.forEach(([from, to]) => {
                s = s.replace(new RegExp('(^|[^' + AR + '])' + from + '(?=$|[^' + AR + '])', 'g'), (m, pre) => pre + to);
            });
            return s.replace(/\u0001(\d+)\u0001/g, (m, i) => kept[+i]);
        }

        // الصفّ من النصّ («3/1»، «ثالث/2»، «الصف 4») ← هل هو من ١ إلى ٤؟
        // الصفّ من **أوّل** النصّ وحده — رقمُ الشعبة بعد «/» ليس صفّاً («خامس/3» خامسٌ لا ثالث)
        function svfIsLowerGrade(cls) {
            const s = String(cls || '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
                .replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').trim().replace(/^(الصف|صف) ?/, '');
            const num = s.match(/^(\d{1,2})(?!\d)/);
            if (num) return +num[1] >= 1 && +num[1] <= 4;
            const head = s.split(/\s*[\/\\-]\s*/)[0].replace(/^ال/, '');
            if (/عشر/.test(head)) return false;       // «حادي عشر/ثاني عشر» ليست الأوّل ولا الثاني
            return ['اول', 'ثاني', 'ثالث', 'رابع'].includes(head);
        }
