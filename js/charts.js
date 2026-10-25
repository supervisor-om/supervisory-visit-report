        // =========================================================================
        // STATISTICS
        // =========================================================================
        let statsPieChart = null;
        let statsLineChart = null;
        let statsBarChart = null;

        // ألوان الرسوم من لوحة المنظومة (js/svf-theme.js)، وخطّ الواجهة نفسه
        const SVF_C = (typeof window !== 'undefined' && window.SVF_COLORS) || null;
        const SVF_RATING = (SVF_C && SVF_C.rating) || { 1: '#1d6b45', 2: '#0f4c81', 3: '#9a6f24', 4: '#b5452f', 5: '#7a2320' };
        const SVF_NAVY = (SVF_C && SVF_C.blue[600]) || '#0f4c81';
        const SVF_SERIES = SVF_C ? [SVF_C.blue[600], SVF_C.green[600], SVF_C.gold[500], SVF_C.red[500], SVF_C.slate[500], SVF_C.blue[300], SVF_C.green[300]]
                                 : ['#0f4c81', '#246445', '#b98a32', '#bb463b', '#64748b', '#85acd1', '#86ba9b'];
        if (typeof Chart !== 'undefined' && Chart.defaults) {
            Chart.defaults.font.family = "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif";
            Chart.defaults.color = '#475569';
            Chart.defaults.borderColor = 'rgba(15, 23, 42, .08)';
        }

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
            // المفتاح محلّيّ لا بـtoISOString: توقيت مسقط (+4) يُنقص اليوم الأوّل من الشهر إلى الشهر السابق
            const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            const thisMonth = ym(now);
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
                // الدرجات من formData أو من جذر التقرير القديم — قراءة الجذر
                // وحده كانت تُفرغ هذا القسم من كلّ تقريرٍ حديث
                svfReportScores(r).forEach(v => { scoreLevels[v]++; totalScoreEntries++; });
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
                const key = ym(d);
                monthlyData[key] = 0;
            }
            reports.forEach(r => {
                const mo = (r.visitDate || '').slice(0, 7);
                if (mo in monthlyData) monthlyData[mo]++;
            });

            // Average performance per visit (chronological)
            const avgPerVisit = reports
                .map(r => ({ r, sc: svfReportScores(r) }))
                .filter(x => x.r.visitDate && x.sc.length > 0)
                .sort((a, b) => (a.r.visitDate || '').localeCompare(b.r.visitDate || ''))
                .map(({ r, sc }) => {
                    const avg = sc.reduce((s, v) => s + v, 0) / sc.length;
                    return { date: r.visitDate, avg: Math.round(avg * 100) / 100, teacher: r.teacherName };
                });

            // أسماء المستويات كما في الاستمارة نفسها (أزرار التقييم)
            const scoreLabels = { 1: 'متميز', 2: 'جيد', 3: 'ملائم', 4: 'غير ملائم', 5: 'تدخل سريع' };
            const esc = (s) => (typeof svfEscapeHtml === 'function' ? svfEscapeHtml(s) : String(s));
            const scoreColorsMap = SVF_RATING;
            const monthNames = { '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو','07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر' };
            const getMonthName = (key) => {
                const [, mo] = key.split('-');
                return monthNames[mo] || key;
            };

            const kpi = (n, label) => `<div class="px-5 py-4">
                    <div class="text-3xl font-bold text-slate-900 tabular-nums">${n}</div>
                    <div class="text-sm text-slate-600 mt-1">${label}</div>
                </div>`;
            const panel = (title, body) => `<div class="bg-white rounded-2xl border border-slate-200 p-6">
                    <h3 class="text-base font-bold text-slate-900 mb-4">${title}</h3>${body}</div>`;
            const empty = (msg) => `<p class="text-slate-500 text-sm text-center py-6">${msg}</p>`;

            container.innerHTML = `
                <div class="space-y-6">
                    <div class="bg-white rounded-2xl border border-slate-200 grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-x-reverse divide-slate-200">
                        ${kpi(totalVisits, 'إجمالي الزيارات')}
                        ${kpi(thisMonthVisits, 'زيارات هذا الشهر')}
                        ${kpi(thisYearVisits, 'زيارات هذا العام')}
                        ${kpi(uniqueTeachers, 'معلماً تمّت زيارته')}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        ${panel('توزيع درجات التقييم', totalScoreEntries === 0
                            ? empty('لا درجات محفوظة بعد')
                            : '<div style="max-height:300px;position:relative;"><canvas id="statsPieChart"></canvas></div>')}
                        ${panel('متوسط الأداء عبر الزيارات', avgPerVisit.length < 2
                            ? empty('يظهر بعد زيارتين على الأقل')
                            : '<div style="max-height:300px;position:relative;"><canvas id="statsLineChart"></canvas></div>')}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        ${panel('الزيارات الشهرية (آخر ستة أشهر)', '<div style="max-height:250px;position:relative;"><canvas id="statsBarChart"></canvas></div>')}
                        ${panel('أكثر المدارس زيارةً', topSchools.length === 0 ? empty('لا زيارات بعد')
                            : `<ol class="space-y-3">${topSchools.map(([school, cnt], idx) => {
                                const pct = Math.round(cnt / topSchools[0][1] * 100);
                                return `<li class="flex items-center gap-3">
                                    <span class="w-5 text-sm font-bold text-slate-500 tabular-nums text-center">${idx + 1}</span>
                                    <div class="flex-grow min-w-0">
                                        <div class="flex justify-between gap-3 text-sm mb-1">
                                            <span class="font-medium text-slate-800 truncate">${esc(school)}</span>
                                            <span class="text-slate-500 whitespace-nowrap">${cnt} زيارة</span>
                                        </div>
                                        <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div class="h-full bg-blue-600 rounded-full" style="width:${pct}%"></div>
                                        </div>
                                    </div>
                                </li>`;
                            }).join('')}</ol>`)}
                    </div>

                    ${panel('أكثر المعلمين زيارةً', topTeachers.length === 0 ? empty('لا زيارات بعد')
                        : `<ol class="grid grid-cols-1 md:grid-cols-5 gap-3">${topTeachers.map(([teacher, cnt], idx) => `
                            <li class="border border-slate-200 rounded-xl p-4 bg-white">
                                <div class="text-xs font-bold text-slate-500 tabular-nums mb-1">${idx + 1}</div>
                                <div class="font-bold text-slate-800 text-sm truncate" title="${esc(teacher)}">${esc(teacher)}</div>
                                <div class="text-sm text-slate-600 mt-1"><b class="text-blue-700 text-lg tabular-nums">${cnt}</b> زيارة</div>
                            </li>`).join('')}</ol>`)}
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
                                legend: { position: 'bottom', rtl: true, labels: { font: { family: 'IBM Plex Sans Arabic' } } }
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
                                borderColor: SVF_NAVY,
                                backgroundColor: 'rgba(15,76,129,0.08)',
                                fill: true,
                                tension: 0.3,
                                pointRadius: 4,
                                pointBackgroundColor: SVF_NAVY
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            scales: {
                                y: { reverse: true, min: 1, max: 5, title: { display: true, text: 'المعدل (1 = أفضل)' } },
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
                if (statsBarChart) statsBarChart.destroy();
                statsBarChart = new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: Object.keys(monthlyData).map(k => getMonthName(k)),
                        datasets: [{
                            label: 'عدد الزيارات',
                            data: Object.values(monthlyData),
                            backgroundColor: SVF_NAVY,
                            borderWidth: 0,
                            borderRadius: 4,
                            maxBarThickness: 36
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
