        // =========================================================================
        // STATISTICS
        // =========================================================================
        let statsPieChart = null;
        let statsLineChart = null;

        function renderStatistics() {
            const container = document.getElementById('stats-view');
            if (!container) return;

            // Collect all supervisory visit reports
            const reports = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('supervision_v6_visit_') || key.startsWith('visit_v5_')) {
                    try {
                        const d = JSON.parse(localStorage.getItem(key));
                        if (d && typeof d === 'object') reports.push(d);
                    } catch(e) {}
                }
            }

            // --- General counts ---
            const totalVisits = reports.length;

            // This month (YYYY-MM)
            const now = new Date();
            const thisMonth = now.toISOString().slice(0, 7);
            const thisMonthVisits = reports.filter(r => (r.visitDate || '').startsWith(thisMonth)).length;

            // This year
            const thisYear = now.getFullYear().toString();
            const thisYearVisits = reports.filter(r => (r.visitDate || '').startsWith(thisYear)).length;

            // Unique teachers
            const uniqueTeachers = new Set(reports.map(r => r.teacherName).filter(Boolean)).size;

            // Score distribution across all reports
            const scoreLevels = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            let totalScoreEntries = 0;
            reports.forEach(r => {
                if (Array.isArray(r.scores)) {
                    r.scores.forEach(s => {
                        const v = parseInt(s);
                        if (v >= 1 && v <= 5) { scoreLevels[v]++; totalScoreEntries++; }
                    });
                }
            });

            // Most visited schools (top 5)
            const schoolCounts = {};
            reports.forEach(r => {
                const s = r.school || r.schoolName || 'غير محدد';
                schoolCounts[s] = (schoolCounts[s] || 0) + 1;
            });
            const topSchools = Object.entries(schoolCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            // Most visited teachers (top 5)
            const teacherCounts = {};
            reports.forEach(r => {
                const t = r.teacherName || 'غير محدد';
                teacherCounts[t] = (teacherCounts[t] || 0) + 1;
            });
            const topTeachers = Object.entries(teacherCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            // Monthly visits breakdown (last 6 months)
            const monthlyData = {};
            for (let m = 5; m >= 0; m--) {
                const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
                const key = d.toISOString().slice(0, 7);
                monthlyData[key] = 0;
            }
            reports.forEach(r => {
                const mo = (r.visitDate || '').slice(0, 7);
                if (mo in monthlyData) monthlyData[mo]++;
            });

            // Average performance per visit (chronological)
            const avgPerVisit = reports
                .filter(r => r.visitDate && Array.isArray(r.scores) && r.scores.length > 0)
                .sort((a, b) => (a.visitDate || '').localeCompare(b.visitDate || ''))
                .map(r => {
                    const avg = r.scores.reduce((s, v) => s + parseInt(v), 0) / r.scores.length;
                    return { date: r.visitDate, avg: Math.round(avg * 100) / 100, teacher: r.teacherName };
                });

            const scoreLabels = { 1: 'ممتاز', 2: 'جيد جداً', 3: 'جيد', 4: 'مقبول', 5: 'يحتاج تطوير' };
            const scoreColorsMap = { 1: '#22c55e', 2: '#3b82f6', 3: '#f59e0b', 4: '#f97316', 5: '#ef4444' };
            const monthNames = { '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو','07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر' };
            const getMonthName = (key) => {
                const [, mo] = key.split('-');
                return monthNames[mo] || key;
            };

            container.innerHTML = `
                <div class="space-y-6">
                    <!-- Summary cards -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-5 text-center shadow-lg text-white">
                            <div class="text-3xl font-extrabold">${totalVisits}</div>
                            <div class="text-sm text-blue-100 mt-1">إجمالي الزيارات</div>
                        </div>
                        <div class="bg-gradient-to-br from-green-500 to-green-700 rounded-2xl p-5 text-center shadow-lg text-white">
                            <div class="text-3xl font-extrabold">${thisMonthVisits}</div>
                            <div class="text-sm text-green-100 mt-1">زيارات هذا الشهر</div>
                        </div>
                        <div class="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-5 text-center shadow-lg text-white">
                            <div class="text-3xl font-extrabold">${thisYearVisits}</div>
                            <div class="text-sm text-indigo-100 mt-1">زيارات هذا العام</div>
                        </div>
                        <div class="bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl p-5 text-center shadow-lg text-white">
                            <div class="text-3xl font-extrabold">${uniqueTeachers}</div>
                            <div class="text-sm text-amber-100 mt-1">معلم تمت زيارته</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Pie chart: Score distribution -->
                        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <h3 class="text-base font-bold text-slate-700 mb-4 flex items-center"><i class="fa-solid fa-chart-pie ml-2 text-blue-500"></i>توزيع درجات التقييم</h3>
                            ${totalScoreEntries === 0
                                ? '<p class="text-slate-400 text-sm text-center py-6">لا توجد بيانات كافية</p>'
                                : '<div style="max-height:300px;position:relative;"><canvas id="statsPieChart"></canvas></div>'
                            }
                        </div>

                        <!-- Line chart: Average performance over visits -->
                        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <h3 class="text-base font-bold text-slate-700 mb-4 flex items-center"><i class="fa-solid fa-chart-line ml-2 text-green-500"></i>متوسط الأداء عبر الزيارات</h3>
                            ${avgPerVisit.length < 2
                                ? '<p class="text-slate-400 text-sm text-center py-6">تحتاج زيارتين على الأقل</p>'
                                : '<div style="max-height:300px;position:relative;"><canvas id="statsLineChart"></canvas></div>'
                            }
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Monthly visits bar chart -->
                        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <h3 class="text-base font-bold text-slate-700 mb-4 flex items-center"><i class="fa-solid fa-calendar-days ml-2 text-indigo-500"></i>الزيارات الشهرية (آخر 6 أشهر)</h3>
                            <div style="max-height:250px;position:relative;"><canvas id="statsBarChart"></canvas></div>
                        </div>

                        <!-- Top schools -->
                        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <h3 class="text-base font-bold text-slate-700 mb-4 flex items-center"><i class="fa-solid fa-school ml-2 text-amber-500"></i>أكثر المدارس زيارةً</h3>
                            ${topSchools.length === 0
                                ? '<p class="text-slate-400 text-sm text-center py-4">لا توجد بيانات</p>'
                                : `<div class="space-y-3">${topSchools.map(([school, cnt], idx) => {
                                    const maxC = topSchools[0][1];
                                    const pct = Math.round(cnt / maxC * 100);
                                    const colors = ['from-amber-400 to-amber-600','from-amber-300 to-amber-500','from-amber-200 to-amber-400','from-slate-300 to-slate-400','from-slate-200 to-slate-300'];
                                    return `<div class="flex items-center gap-3">
                                        <span class="text-xs font-bold text-white bg-gradient-to-r ${colors[idx] || colors[4]} w-6 h-6 rounded-full flex items-center justify-center">${idx + 1}</span>
                                        <div class="flex-grow">
                                            <div class="flex justify-between text-sm mb-1">
                                                <span class="font-medium text-slate-700">${school}</span>
                                                <span class="text-slate-400">${cnt} زيارة</span>
                                            </div>
                                            <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div class="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full" style="width:${pct}%"></div>
                                            </div>
                                        </div>
                                    </div>`;
                                }).join('')}</div>`
                            }
                        </div>
                    </div>

                    <!-- Top teachers visited -->
                    <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h3 class="text-base font-bold text-slate-700 mb-4 flex items-center"><i class="fa-solid fa-chalkboard-user ml-2 text-purple-500"></i>أكثر المعلمين زيارةً (أعلى 5)</h3>
                        ${topTeachers.length === 0
                            ? '<p class="text-slate-400 text-sm text-center py-4">لا توجد بيانات</p>'
                            : `<div class="grid grid-cols-1 md:grid-cols-5 gap-3">${topTeachers.map(([teacher, cnt], idx) => {
                                const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
                                return `<div class="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-4 text-center">
                                    <div class="text-2xl mb-1">${medals[idx] || ''}</div>
                                    <div class="font-bold text-slate-700 text-sm truncate">${teacher}</div>
                                    <div class="text-purple-600 font-extrabold text-lg mt-1">${cnt}</div>
                                    <div class="text-xs text-slate-400">زيارة</div>
                                </div>`;
                            }).join('')}</div>`
                        }
                    </div>
                </div>
            `;

            // Render Chart.js charts
            if (totalScoreEntries > 0) {
                const pieCtx = document.getElementById('statsPieChart');
                if (pieCtx) {
                    if (statsPieChart) statsPieChart.destroy();
                    statsPieChart = new Chart(pieCtx, {
                        type: 'pie',
                        data: {
                            labels: Object.keys(scoreLevels).map(k => scoreLabels[k]),
                            datasets: [{
                                data: Object.values(scoreLevels),
                                backgroundColor: Object.keys(scoreLevels).map(k => scoreColorsMap[k]),
                                borderWidth: 2,
                                borderColor: '#fff'
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            plugins: {
                                legend: { position: 'bottom', rtl: true, labels: { font: { family: 'Tajawal' } } }
                            }
                        }
                    });
                }
            }

            if (avgPerVisit.length >= 2) {
                const lineCtx = document.getElementById('statsLineChart');
                if (lineCtx) {
                    if (statsLineChart) statsLineChart.destroy();
                    statsLineChart = new Chart(lineCtx, {
                        type: 'line',
                        data: {
                            labels: avgPerVisit.map(v => v.date),
                            datasets: [{
                                label: 'متوسط الأداء',
                                data: avgPerVisit.map(v => v.avg),
                                borderColor: '#3b82f6',
                                backgroundColor: 'rgba(59,130,246,0.1)',
                                fill: true,
                                tension: 0.3,
                                pointRadius: 4,
                                pointBackgroundColor: '#3b82f6'
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            scales: {
                                y: { reverse: true, min: 1, max: 5, title: { display: true, text: 'المعدل (1=أفضل)', font: { family: 'Tajawal' } } },
                                x: { title: { display: false } }
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        label: (ctx) => `المعدل: ${ctx.parsed.y} - ${avgPerVisit[ctx.dataIndex]?.teacher || ''}`
                                    }
                                }
                            }
                        }
                    });
                }
            }

            // Monthly bar chart
            const barCtx = document.getElementById('statsBarChart');
            if (barCtx) {
                new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: Object.keys(monthlyData).map(k => getMonthName(k)),
                        datasets: [{
                            label: 'عدد الزيارات',
                            data: Object.values(monthlyData),
                            backgroundColor: 'rgba(99,102,241,0.7)',
                            borderColor: 'rgba(99,102,241,1)',
                            borderWidth: 1,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, ticks: { stepSize: 1 } }
                        }
                    }
                });
            }
        }
