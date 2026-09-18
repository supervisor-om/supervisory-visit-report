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

