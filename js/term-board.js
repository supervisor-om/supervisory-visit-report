        // =========================================================================
        //  لوحة «إشرافي هذا الفصل»
        //
        //  تحوّل الأداة من نموذج تقريرٍ إلى مخطِّط إشراف: من زُرتَ ومن بقي، ومن
        //  طال عهدك به، وكيف توزّعت زياراتك على المدارس.
        //
        //  مصدران موجودان أصلاً، ولا تكتب هذه اللوحة شيئاً:
        //    • زياراتك   — أرشيف الموقع (supervision_v6_visit_*)
        //    • معلّموك   — قائمة المشرف من قاعدة المعلمين (identity.js)
        //  وبلا ربطٍ بالقاعدة تعمل اللوحة بما في الأرشيف وحده، وتُبيّن أنّ قائمة
        //  «من لم تزره» تحتاج الربط.
        //
        //  الفصل الأوّل: سبتمبر ← يناير (يعبر رأس السنة)، والثاني: فبراير ← يونيو.
        // =========================================================================
        const TERM_STALE_DAYS = 42;        /* ستّة أسابيع: حدّ «طال العهد» */

        /* الفصل الذي يقع فيه التاريخ. ويوليو وأغسطس (بين العامين) يُعدّان مقدّمةَ
           الفصل الأوّل القادم: من يفتح اللوحة في الصيف يخطّط لسبتمبر لا يستعرض
           فصلاً انتهى. وتصنيف الزيارات نفسها بالمدى لا بهذه الدالّة. */
        function svfTermOf(date) {
            const d = date instanceof Date ? date : new Date(date);
            const y = d.getFullYear(), m = d.getMonth();           /* 0 = يناير */
            if (m >= 6) return { id: 't1', year: y };              /* يوليو ← ديسمبر */
            if (m === 0) return { id: 't1', year: y - 1 };         /* يناير: تتمّة الأوّل */
            return { id: 't2', year: y };                          /* فبراير ← يونيو */
        }

        /* العام الدراسيّ الذي يتبعه الفصل: t1 سنتُه هي أوّل العام، وt2 سنتُه آخره */
        const svfTermAcademicYear = term => term.id === 't1' ? term.year : term.year - 1;

        /* الفصل الآخر من العام الدراسيّ نفسه */
        function svfTermSibling(term, wanted) {
            const ay = svfTermAcademicYear(term);
            return wanted === 't1' ? { id: 't1', year: ay } : { id: 't2', year: ay + 1 };
        }

        function svfTermRange(term) {
            return term.id === 't1'
                ? { from: new Date(term.year, 8, 1), to: new Date(term.year + 1, 0, 31, 23, 59, 59),
                    label: 'الفصل الأول ' + term.year + '/' + (term.year + 1) }
                : { from: new Date(term.year, 1, 1), to: new Date(term.year, 5, 30, 23, 59, 59),
                    label: 'الفصل الثاني ' + (term.year - 1) + '/' + term.year };
        }

        /* تاريخٌ محلّيٌّ نصّاً — `toISOString` يُنقص الحدّ يوماً في توقيت مسقط (+4) */
        const svfTermDay = d => d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

        /* كلّ زيارات الأرشيف — الفصل يُصفّى منها بالمدى، وما خرج عن الفصل يبقى
           نافعاً: منه يُعرف متى زرت المعلّم آخر مرّةٍ قبل هذا الفصل */
        function svfTermAllVisits() {
            const out = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || (!key.startsWith('supervision_v6_visit_') && !key.startsWith('visit_v5_'))) continue;
                let d = null;
                try { d = JSON.parse(localStorage.getItem(key)); } catch (e) { continue; }
                const teacher = String((d && d.teacherName) || '').trim();
                const iso = String((d && d.visitDate) || '').trim();
                if (!teacher || !iso) continue;
                const when = new Date(iso);
                if (isNaN(when)) continue;
                out.push({ key, teacher, iso, when, school: String(d.school || '').trim() });
            }
            return out.sort((a, b) => b.iso.localeCompare(a.iso));
        }

        const svfTermVisits = range =>
            svfTermAllVisits().filter(v => v.when >= range.from && v.when <= range.to);

        /* أسماء المعلّمين تُقارن بإسقاط «بن/بنت» كما في بقيّة الموقع */
        const svfTeacherKey = n => (window.SupervisorIdentity && SupervisorIdentity.normName)
            ? SupervisorIdentity.normName(n) : String(n || '').trim();

        const svfDaysSince = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

        /* العدد بصيغته العربيّة: المثنّى والجمع ليسا «2 زيارة» و«5 زيارة» */
        function svfTermVisitWord(n) {
            if (n === 1) return 'زيارة واحدة';
            if (n === 2) return 'زيارتان';
            return n >= 3 && n <= 10 ? n + ' زيارات' : n + ' زيارة';
        }

        function svfTermEsc(s) {
            return (typeof svfEscapeHtml === 'function') ? svfEscapeHtml(s)
                 : String(s == null ? '' : s).replace(/[&<>"']/g, c =>
                     ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        }

        // ── بناء الصورة الكاملة للفصل ──
        function svfTermPicture(term) {
            const range = svfTermRange(term);
            const all = svfTermAllVisits();
            const visits = all.filter(v => v.when >= range.from && v.when <= range.to);

            /* آخر زيارةٍ لكلّ معلّمٍ في الأرشيف كلّه (أيّ فصل) */
            const lastEver = new Map();
            all.forEach(v => {
                const k = svfTeacherKey(v.teacher);
                if (!lastEver.has(k) || v.iso > lastEver.get(k)) lastEver.set(k, v.iso);
            });

            const byTeacher = new Map();
            visits.forEach(v => {
                const k = svfTeacherKey(v.teacher);
                const g = byTeacher.get(k) || { name: v.teacher, count: 0, last: '', school: v.school };
                g.count++;
                if (!g.last || v.iso > g.last) { g.last = v.iso; g.school = v.school || g.school; }
                byTeacher.set(k, g);
            });

            const roster = (window.SupervisorIdentity && SupervisorIdentity.getTeachers)
                ? SupervisorIdentity.getTeachers() : [];
            const linked = roster.length > 0;

            /* الأولويّة لا الترتيب الأبجديّ: من لم تزره قطّ أوّلاً، ثمّ الأطول عهداً.
               في أوّل الفصل تكون القائمة كلّ المعلّمين، فترتيبها هو ما يجعلها خطّة. */
            const notVisited = roster
                .filter(t => t.name && !byTeacher.has(svfTeacherKey(t.name)))
                .map(t => {
                    const last = lastEver.get(svfTeacherKey(t.name)) || '';
                    return { name: t.name, school: t.school || '', last,
                             days: last ? svfDaysSince(last) : null };
                })
                .sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0)
                             || (b.days || 0) - (a.days || 0)
                             || String(a.school).localeCompare(String(b.school), 'ar'));

            const stale = [...byTeacher.values()]
                .map(g => ({ ...g, days: svfDaysSince(g.last) }))
                .filter(g => g.days >= TERM_STALE_DAYS)
                .sort((a, b) => b.days - a.days);

            const bySchool = new Map();
            visits.forEach(v => {
                const s = v.school || 'بلا مدرسة';
                bySchool.set(s, (bySchool.get(s) || 0) + 1);
            });
            const schools = [...bySchool.entries()].sort((a, b) => b[1] - a[1]);

            return { range, visits, teachers: [...byTeacher.values()], notVisited, stale, schools, linked,
                     rosterCount: roster.length };
        }

        // ── العرض ──
        function svfTermCard(value, label, tone) {
            const tones = { blue: 'from-blue-600 to-blue-700', green: 'from-emerald-600 to-emerald-700',
                            amber: 'from-amber-500 to-amber-600', slate: 'from-slate-600 to-slate-700' };
            return `<div class="bg-gradient-to-br ${tones[tone] || tones.slate} text-white rounded-2xl p-5 shadow-sm">
                        <div class="text-3xl font-extrabold">${value}</div>
                        <div class="text-sm opacity-90 mt-1">${label}</div>
                    </div>`;
        }

        function svfTermList(items, empty) {
            if (!items.length) return `<p class="text-sm text-slate-400 italic p-2">${empty}</p>`;
            return '<div class="divide-y divide-slate-100">' + items.join('') + '</div>';
        }

        function renderTermBoard(termId) {
            const box = document.getElementById('term-view');
            if (!box) return;

            const now = svfTermOf(new Date());
            const term = (termId && termId !== now.id) ? svfTermSibling(now, termId) : now;
            const p = svfTermPicture(term);
            const visitedCount = p.teachers.length;
            const coverage = p.linked && p.rosterCount
                ? Math.round(visitedCount / p.rosterCount * 100) + '%' : '—';

            const visitRows = p.teachers
                .sort((a, b) => b.last.localeCompare(a.last))
                .map(t => `<div class="flex items-center justify-between gap-3 py-2 px-1">
                        <div class="min-w-0">
                            <div class="font-bold text-slate-700 truncate">${svfTermEsc(t.name)}</div>
                            <div class="text-xs text-slate-500 truncate">${svfTermEsc(t.school) || '—'}</div>
                        </div>
                        <div class="text-left flex-none">
                            <div class="text-xs text-slate-500"><bdi>${svfTermEsc(t.last)}</bdi></div>
                            <div class="text-[11px] font-bold ${t.count > 1 ? 'text-emerald-700' : 'text-slate-400'}">
                                ${svfTermVisitWord(t.count)}</div>
                        </div>
                    </div>`);

            const notVisitedRows = p.notVisited.map(t =>
                `<div class="flex items-center justify-between gap-3 py-2 px-1">
                     <div class="min-w-0">
                         <div class="font-bold text-slate-700 truncate">${svfTermEsc(t.name)}</div>
                         <div class="text-xs text-slate-500 truncate">${svfTermEsc(t.school) || '—'}</div>
                         <div class="text-[11px] ${t.last ? 'text-slate-400' : 'text-rose-600 font-bold'}">
                             ${t.last ? 'آخر زيارة <bdi>' + svfTermEsc(t.last) + '</bdi> — قبل ' + t.days + ' يوماً'
                                      : 'لم تزره من قبل'}</div>
                     </div>
                     <button type="button" class="term-visit-btn flex-none text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg font-bold"
                             data-teacher="${svfTermEsc(t.name)}">ابدأ زيارة</button>
                 </div>`);

            const staleRows = p.stale.map(t =>
                `<div class="flex items-center justify-between gap-3 py-2 px-1">
                     <div class="min-w-0">
                         <div class="font-bold text-slate-700 truncate">${svfTermEsc(t.name)}</div>
                         <div class="text-xs text-slate-500 truncate">${svfTermEsc(t.school) || '—'}</div>
                     </div>
                     <div class="flex items-center gap-2 flex-none">
                         <span class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                             ${t.days} يوماً</span>
                         <button type="button" class="term-visit-btn text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg font-bold"
                                 data-teacher="${svfTermEsc(t.name)}">زيارة متابعة</button>
                     </div>
                 </div>`);

            const maxSchool = p.schools.length ? p.schools[0][1] : 1;
            const schoolRows = p.schools.map(([name, n]) =>
                `<div class="py-1.5">
                     <div class="flex justify-between text-xs mb-1">
                         <span class="text-slate-600 truncate">${svfTermEsc(name)}</span>
                         <span class="font-bold text-slate-500">${n}</span>
                     </div>
                     <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                         <div class="h-full bg-indigo-500 rounded-full" style="width:${Math.round(n / maxSchool * 100)}%"></div>
                     </div>
                 </div>`);

            box.innerHTML = `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h3 class="text-lg font-bold text-slate-800">إشرافي هذا الفصل</h3>
                        <p class="text-xs text-slate-500 mt-1">${p.range.label}
                            — من <bdi>${svfTermDay(p.range.from)}</bdi> إلى <bdi>${svfTermDay(p.range.to)}</bdi></p>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" class="term-tab text-xs px-3 py-1.5 rounded-lg border font-bold transition-colors
                            ${term.id === 't1' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}"
                            data-term="t1">الفصل الأول</button>
                        <button type="button" class="term-tab text-xs px-3 py-1.5 rounded-lg border font-bold transition-colors
                            ${term.id === 't2' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}"
                            data-term="t2">الفصل الثاني</button>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${svfTermCard(p.visits.length, 'زيارة هذا الفصل', 'blue')}
                ${svfTermCard(visitedCount, 'معلماً زُرته', 'green')}
                ${svfTermCard(p.linked ? p.notVisited.length : '—', 'لم تزره بعد', 'amber')}
                ${svfTermCard(coverage, 'نسبة التغطية', 'slate')}
            </div>

            ${p.linked ? '' : `<div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
                «من لم تزره بعد» و«نسبة التغطية» تحتاجان ربط الموقع بقاعدة بيانات المعلمين —
                اربطه من الصفحة الرئيسية برمزك.</div>`}

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                    <h4 class="font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <i class="fa-solid fa-user-clock text-amber-500"></i> لم تزرهم بعد
                        <span class="text-xs font-medium text-slate-400">(${p.notVisited.length})</span></h4>
                    <div class="max-h-80 overflow-y-auto">
                        ${svfTermList(notVisitedRows, p.linked ? 'زرت كلّ معلميك هذا الفصل 👏' : 'يحتاج الربط بقاعدة المعلمين.')}
                    </div>
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                    <h4 class="font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <i class="fa-solid fa-hourglass-half text-rose-500"></i> طال العهد بهم
                        <span class="text-xs font-medium text-slate-400">(أكثر من ${TERM_STALE_DAYS} يوماً)</span></h4>
                    <div class="max-h-80 overflow-y-auto">
                        ${svfTermList(staleRows, 'لا أحد — متابعتك منتظمة.')}
                    </div>
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                    <h4 class="font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <i class="fa-solid fa-check-double text-emerald-500"></i> زياراتك هذا الفصل</h4>
                    <div class="max-h-80 overflow-y-auto">
                        ${svfTermList(visitRows, 'لا زيارات محفوظة في هذا الفصل بعد.')}
                    </div>
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                    <h4 class="font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <i class="fa-solid fa-school text-indigo-500"></i> توزيع الزيارات على المدارس</h4>
                    <div class="max-h-80 overflow-y-auto">
                        ${p.schools.length ? schoolRows.join('') : '<p class="text-sm text-slate-400 italic p-2">لا زيارات بعد.</p>'}
                    </div>
                </div>
            </div>`;

            box.querySelectorAll('.term-tab').forEach(b =>
                b.addEventListener('click', () => renderTermBoard(b.dataset.term)));

            // «ابدأ زيارة» ينقلك إلى النموذج باسم المعلّم جاهزاً — بقيّة حقوله
            // تُملأ من قاعدة المعلمين كما في الإدخال اليدويّ
            box.querySelectorAll('.term-visit-btn').forEach(b =>
                b.addEventListener('click', () => {
                    const name = b.dataset.teacher;
                    try { performReset(); } catch (e) {}
                    const field = document.getElementById('teacherName');
                    if (field) {
                        field.value = name;
                        field.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    toggleSupervisoryView('form-view');
                    showToast('زيارة جديدة: ' + name);
                }));
        }
