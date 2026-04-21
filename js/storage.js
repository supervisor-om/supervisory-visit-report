        // =========================================================================
        function deletePermanentReport(key) {
            showConfirmationModal('تأكيد الحذف', 'سيتم حذف التقرير نهائياً', () => {
                try {
                    const data = JSON.parse(localStorage.getItem(key)); 
                    localStorage.removeItem(key); 
                    if(data && data.teacherName) { 
                        const teacherArchiveKey = `supervision_v6_teacher_archive_${data.teacherName}`; 
                        const oldArchiveKey = `teacher_archive_v5_${data.teacherName}`; 
                        
                        let archive = [];
                        try { archive = JSON.parse(localStorage.getItem(teacherArchiveKey)) || JSON.parse(localStorage.getItem(oldArchiveKey)) || []; } catch(e){}
                        
                        if(Array.isArray(archive)) {
                            archive = archive.filter(visit => visit.date !== data.visitDate); 
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
                    localStorage.removeItem(key);
                    renderSavedReports();
                }
            }); 
        }

        function populateTeacherDashboardDropdown() { 
            const teacherSelect = document.querySelector('#teacher-dashboard-select'); 
            if(!teacherSelect) return;
            
            const teacherNames = new Set(); 
            
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k.startsWith('supervision_v6_teacher_archive_')) {
                    teacherNames.add(k.replace('supervision_v6_teacher_archive_', '')); 
                } else if (k.startsWith('teacher_archive_v5_')) {
                    teacherNames.add(k.replace('teacher_archive_v5_', '')); 
                }
            }
            
            teacherSelect.innerHTML = '<option value="">اختر معلمًا...</option>'; 
            teacherNames.forEach(name => teacherSelect.innerHTML += `<option value="${name}">${name}</option>`); 
        }

        function updateDashboardView() { 
            if (performanceChartInstance) performanceChartInstance.destroy(); 
            
            const teacherSelect = document.querySelector('#teacher-dashboard-select');
            if(!teacherSelect) return;
            
            const teacherName = teacherSelect.value; 
            const chartContainer = document.querySelector('#chart-container'); 
            const noDataMessage = document.querySelector('#no-data-message'); 
            const chartType = document.querySelector('#chartTypeSelect').value; 
            const dateGroup = document.querySelector('#visitDateGroup'); 
            
            dateGroup.classList.toggle('hidden', chartType !== 'radar'); 
            
            if (!teacherName) { 
                chartContainer.classList.add('hidden'); 
                noDataMessage.classList.remove('hidden'); 
                return; 
            } 
            
            let archive = [];
            try {
                archive = JSON.parse(localStorage.getItem(`supervision_v6_teacher_archive_${teacherName}`)) || 
                          JSON.parse(localStorage.getItem(`teacher_archive_v5_${teacherName}`)) || []; 
                if(!Array.isArray(archive)) archive = [];
            } catch(e) { archive = []; }
            
            if (archive.length === 0) { 
                chartContainer.classList.add('hidden'); 
                noDataMessage.classList.remove('hidden'); 
                return; 
            } 
            
            chartContainer.classList.remove('hidden'); 
            noDataMessage.classList.add('hidden'); 
            
            const visitDateSelect = document.querySelector('#visitDateSelect'); 
            
            if(chartType === 'radar') { 
                if(visitDateSelect.children.length === 0 || visitDateSelect.children.length !== archive.length) { 
                    visitDateSelect.innerHTML = ''; 
                    archive.forEach(visit => {
                        if(visit && visit.date) visitDateSelect.innerHTML += `<option value="${visit.date}">${visit.date}</option>`;
                    }); 
                    if(archive[archive.length - 1]?.date) {
                        visitDateSelect.value = archive[archive.length - 1].date; 
                    }
                } 
            } 
            
            const ctx = document.querySelector('#performanceChart').getContext('2d'); 
            const labels = evaluationItems.map(item => `${item.id}. ${item.standard}`); 
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']; 
            
            let chartConfig = { 
                type: chartType, 
                data: { labels: (chartType === 'line' ? archive.map(v=>v.date||'') : labels), datasets: [] }, 
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { legend: { position: 'bottom' } }, 
                    scales: { 
                        r: { min: 0, max: 5, ticks: { stepSize: 1 } }, 
                        y: { min: 0, max: 5 } 
                    } 
                } 
            }; 
            
            if (chartType === 'line') { 
                chartConfig.data.datasets = evaluationItems.map((item, i) => ({ 
                    label: item.title.substring(0, 20) + '...', 
                    data: archive.map(v => v.scores && v.scores[`item-${item.id}`] ? v.scores[`item-${item.id}`] : 0), 
                    borderColor: colors[i % colors.length], 
                    tension: 0.2 
                })); 
            } else if (chartType === 'radar') { 
                const visitData = archive.find(v => v.date === visitDateSelect.value); 
                const data = visitData && visitData.scores ? evaluationItems.map(item => visitData.scores[`item-${item.id}`] || 0) : []; 
                chartConfig.data.datasets = [{ 
                    label: `أداء ${visitDateSelect.value}`, 
                    data: data, 
                    backgroundColor: 'rgba(59, 130, 246, 0.2)', 
                    borderColor: '#3b82f6', 
                    pointBackgroundColor: '#fff' 
                }]; 
            } else { 
                const avgScores = evaluationItems.map(item => { 
                    const s = archive.map(v => v.scores && v.scores[`item-${item.id}`] ? v.scores[`item-${item.id}`] : 0); 
                    return s.length > 0 ? (s.reduce((a,b)=>a+b,0)/s.length) : 0; 
                }); 
                chartConfig.data.datasets = [{ 
                    label: 'المتوسط العام', 
                    data: avgScores, 
                    backgroundColor: '#3b82f6' 
                }]; 
            } 
            
            performanceChartInstance = new Chart(ctx, chartConfig); 
        }

