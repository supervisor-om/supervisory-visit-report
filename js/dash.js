// =========================================================================
// لوحة المتابعة (#stats-view) وملف المعلم (#dashboard-view) — الواجهة (منذ 2026-10-26)
//
// الأرقام كلّها من js/dash-core.js (نقيّ ومختبَر)، وهنا الرسم: Chart.js للخطوط والأشرطة، وSVG للخريطة وأشرطة النموّ
// (تُحفظ صوراً وتُطبع متّجهةً)، وHTML لصفوف المدارس. لا تكتب شيئاً — قراءةٌ من الأرشيف وقائمة المعلّمين.
// الاتّجاه من اليمين: «متميز» في أوّل كلّ شريطٍ وأقصى يمين كلّ محور، والبند ١ أوّل الخريطة من اليمين.
// =========================================================================
(function (root) {
    'use strict';

    const D = () => root.SvfDash;
    const X = () => root.SvfChart;
    const $ = id => document.getElementById(id);
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s)
        : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]));
    const RATING = () => X().RATING;
    const LEVELS = () => D().LEVELS;
    const PER_KEY = 'svf_dash_per';
    const STATUS = { done: ['نُفّذت', '#1d6b45'], partial: ['جزئيّاً', '#9a6f24'], notDone: ['لم تُنفّذ', '#b5452f'], overdue: ['متأخّرة', '#7a2320'], pending: ['في موعدها', '#94a3b8'] };
    const charts = {};
    const S = { period: 'term', school: '', profile: '' };

    const normName = n => (root.SupervisorIdentity && SupervisorIdentity.normName ? SupervisorIdentity.normName(n) : String(n || '').replace(/\s+/g, ' ').trim());
    const normSchool = n => (root.SupervisorIdentity && SupervisorIdentity.normalize ? SupervisorIdentity.normalize(n) : String(n || '').replace(/\s+/g, ' ').trim());
    const roster = () => { try { return root.SupervisorIdentity && SupervisorIdentity.getTeachers ? SupervisorIdentity.getTeachers() || [] : []; } catch (e) { return []; } };
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const today = () => iso(new Date());
    const perTeacher = () => { try { const v = parseInt(localStorage.getItem(PER_KEY), 10); return v >= 1 && v <= 6 ? v : D().PER_TEACHER; } catch (e) { return D().PER_TEACHER; } };
    const fmtDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1] : ''; };
    const visitWord = n => D().countWord(n, 'زيارة واحدة', 'زيارتان', 'زيارات', 'زيارة');
    const teacherWord = n => D().countWord(n, 'معلّم واحد', 'معلّمان', 'معلّمين', 'معلّماً');

    function readRows(prefixes) {
        const out = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !prefixes.some(p => key.indexOf(p) === 0)) continue;
                try { const d = JSON.parse(localStorage.getItem(key)); if (d && typeof d === 'object') out.push({ key, data: d }); } catch (e) { /* تالف */ }
            }
        } catch (e) { /* التخزين غير متاح */ }
        return out;
    }
    const supRows = () => readRows(['supervision_v6_visit_', 'visit_v5_']);
    const schoolRows = () => readRows(['supervision_v6_school_report_', 'school_report_']);

    // ── الفترة: الفصل الحاليّ، أو الآخر من العام نفسه، أو العام الدراسيّ (فصلا المشرف في term-board.js) ──
    function termOf(d) {
        if (typeof root.svfTermOf === 'function') return root.svfTermOf(d);
        const y = d.getFullYear(), m = d.getMonth();
        return m >= 6 ? { id: 't1', year: y } : m === 0 ? { id: 't1', year: y - 1 } : { id: 't2', year: y };
    }
    function termRange(t) {
        if (typeof root.svfTermRange === 'function') { const r = root.svfTermRange(t); return { from: iso(r.from), to: iso(r.to), label: r.label }; }
        return t.id === 't1' ? { from: t.year + '-09-01', to: (t.year + 1) + '-01-31', label: 'الفصل الأول ' + t.year + '/' + (t.year + 1) }
                             : { from: t.year + '-02-01', to: t.year + '-06-30', label: 'الفصل الثاني ' + (t.year - 1) + '/' + t.year };
    }
    function ranges() {
        const cur = termOf(new Date());
        const ay = cur.id === 't1' ? cur.year : cur.year - 1;
        const t1 = termRange({ id: 't1', year: ay }), t2 = termRange({ id: 't2', year: ay + 1 });
        const term = cur.id === 't1' ? t1 : t2, other = cur.id === 't1' ? t2 : t1;
        return {
            term: Object.assign({ terms: 1 }, term, { label: term.label + ' (الحاليّ)' }),
            other: Object.assign({ terms: 1 }, other),
            year: { from: t1.from, to: t2.to, terms: 2, label: 'العام الدراسيّ ' + ay + '/' + (ay + 1) }
        };
    }

    // ── أجزاء الواجهة ──
    const panel = (id, title, sub, body, exportable) => `
        <section class="bg-white rounded-2xl border border-slate-200 p-5 min-w-0" id="${id}">
            <div class="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div class="min-w-0"><h3 class="text-base font-bold text-slate-900">${title}</h3>${sub ? `<p class="text-xs text-slate-500 mt-0.5 leading-5">${sub}</p>` : ''}</div>
                ${exportable ? `<button type="button" class="dash-export svf-btn svf-btn-ghost svf-btn-sm" data-export="${id}" title="حفظ الرسم صورةً PNG"><i class="fa-solid fa-image" aria-hidden="true"></i>حفظ صورة</button>` : ''}
            </div>${body}</section>`;
    const tile = (value, label, sub, tone) => `<div class="px-5 py-4 min-w-0">
            <div class="text-sm text-slate-600">${label}</div>
            <div class="text-2xl font-bold tabular-nums mt-1 ${tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-green-700' : 'text-slate-900'} truncate">${value}</div>
            ${sub ? `<div class="text-xs text-slate-500 mt-1 leading-5">${sub}</div>` : ''}</div>`;
    const legend = list => `<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mb-2">${list.map(([label, color, kind]) =>
        `<span class="flex items-center gap-1.5">${kind === 'dash' ? `<i class="inline-block w-4 border-t-2 border-dashed" style="border-color:${color}"></i>`
            : kind === 'line' ? `<i class="inline-block w-4 h-0.5" style="background:${color}"></i>`
            : kind === 'ring' ? `<i class="inline-block w-2.5 h-2.5 rounded-full border-2 bg-white" style="border-color:${color}"></i>`
            : kind === 'dot' ? `<i class="inline-block w-2.5 h-2.5 rounded-full" style="background:${color}"></i>`
            : `<i class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${color}"></i>`}${esc(label)}</span>`).join('')}</div>`;
    const empty = text => `<p class="text-sm text-slate-500 text-center py-8 leading-6">${text}</p>`;

    // قبل إعادة بناء أيّ شاشة: تُهدم رسومها القديمة (لوحٌ أُزيل من الصفحة ورسمه حيّ يرمي خطأً عند تغيّر المقاس)
    function dropCharts(prefix) {
        Object.keys(charts).forEach(id => { if (id.indexOf(prefix) === 0) { try { charts[id].destroy(); } catch (e) { /* أُزيل */ } delete charts[id]; } });
    }
    function chart(id, cfg) {
        if (charts[id]) { charts[id].destroy(); delete charts[id]; }
        const el = $(id);
        if (!el || typeof root.Chart === 'undefined') return null;
        charts[id] = new root.Chart(el, cfg);
        return charts[id];
    }
    const rtlTip = extra => Object.assign({ rtl: true, textDirection: 'rtl', bodyFont: { family: X().FONT }, titleFont: { family: X().FONT } }, extra || {});

    // ── لوحة المتابعة ──
    function renderDash() {
        const box = $('stats-view');
        if (!box || !D() || !X()) return;
        dropCharts('dash');
        const R = ranges();
        if (!R[S.period]) S.period = 'term';
        const range = R[S.period];
        const per = perTeacher();
        const need = per * range.terms;
        const all = D().visitsFrom(supRows(), normName);
        const sKey = S.school;
        const schoolOk = s => !sKey || normSchool(s) === sKey;
        const vis = all.filter(v => schoolOk(v.school));
        const inR = vis.filter(v => D().inRange(v, range));
        const team = roster().filter(t => schoolOk(t.school));
        const cov = D().coverage(vis, team, range, need, normName);
        const target = cov.total * need;
        const pc = D().pace(vis, range, target, today());
        const dist = D().distribution(inR);
        const hm = D().heatmap(inR);
        const gr = D().growth(vis.filter(v => D().inRange(v, R.year)));
        const rf = D().recsFollow(schoolRows().filter(r => schoolOk(r.data && r.data.schoolName)), range, today(), normSchool);
        const et = D().eyeTargets(inR);

        // المدارس للمرشّح: من القائمة ومن الأرشيف
        const schools = new Map();
        roster().forEach(t => { if (t.school) schools.set(normSchool(t.school), t.school); });
        all.forEach(v => { if (v.school && !schools.has(normSchool(v.school))) schools.set(normSchool(v.school), v.school); });
        const schoolOpts = [...schools.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
        if (sKey && !schools.has(sKey)) S.school = '';

        // البطاقات
        const covTile = cov.linked
            ? tile(`${cov.visited} من ${cov.total}`, 'زرتهم في الفترة', cov.total - cov.visited ? `${teacherWord(cov.total - cov.visited)} لم تزرهم بعد` : 'زرتهم جميعاً', cov.visited === cov.total && cov.total ? 'good' : '')
            : tile(String(cov.visited), 'معلّمون زرتهم', 'اربط حسابك بقاعدة المعلّمين لتظهر نسبة التغطية');
        const paceTile = !target ? tile('—', 'الوتيرة مقابل المطلوب', 'تظهر بعد ربط قائمة معلّميك')
            : !pc.started ? tile('لم تبدأ', 'الوتيرة مقابل المطلوب', 'الفترة لم تبدأ بعد')
            : pc.ended ? tile(`${pc.done} من ${target}`, 'ما أُنجز من المطلوب', 'انتهت الفترة', pc.done >= target ? 'good' : 'bad')
            : tile('<bdi dir="ltr">' + (pc.gap >= 0 ? '+' : '−') + Math.abs(pc.gap) + '</bdi> ' + (Math.abs(pc.gap) === 1 ? 'زيارة' : 'زيارات'), pc.gap >= 0 ? 'فوق الوتيرة المطلوبة' : 'عن الوتيرة المطلوبة',
                   pc.left ? `تحتاج ${pc.perWeek} أسبوعيّاً لتبلغ ${target}` : 'بلغت المطلوب', pc.gap >= 0 ? 'good' : 'bad');
        const weakTile = dist.weakest ? tile(esc(dist.weakest.label), 'أضعف بند', `${dist.weakest.weakPct}% «غير ملائم» فأدنى (آخر زيارات ${teacherWord(dist.weakest.n)})`, 'bad')
            : tile('—', 'أضعف بند', dist.items.length ? 'لا بند «غير ملائم» في آخر الزيارات' : 'لا درجات في الفترة');
        const recTile = rf.schools.length ? tile(String(rf.overdue), 'توصيات متأخّرة', rf.overdue ? `في ${rf.overdueSchools === 1 ? 'مدرسة واحدة' : rf.overdueSchools === 2 ? 'مدرستين' : rf.overdueSchools + ' مدارس'}` : 'لا توصيات تجاوزت موعدها', rf.overdue ? 'bad' : 'good')
            : tile('—', 'توصيات متأخّرة', 'لا توصيات مدرسيّة في الفترة');

        box.innerHTML = `
            <div class="svf-head" style="margin-bottom:0">
                <div>
                    <h1>لوحة المتابعة</h1>
                    <p>تغطية زياراتك ووتيرتها، وأين الضعف وعند من، ومن تحسّن بعد الدعم، وما نُفّذ من التوصيات — من أرشيفك وقائمة معلّميك.</p>
                </div>
                <div class="flex flex-wrap gap-2"><button type="button" id="dashPrint" class="svf-btn svf-btn-secondary"><i class="fa-solid fa-print" aria-hidden="true"></i>طباعة / PDF</button></div>
            </div>
            <section class="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label class="flex items-center gap-1.5 text-sm text-slate-600">الفترة
                    <select id="dashPeriod" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                        ${['term', 'other', 'year'].map(k => `<option value="${k}"${k === S.period ? ' selected' : ''}>${esc(R[k].label)}</option>`).join('')}</select></label>
                <label class="flex items-center gap-1.5 text-sm text-slate-600 min-w-0">المدرسة
                    <select id="dashSchool" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-0 max-w-[16rem]">
                        <option value="">كلّ المدارس</option>${schoolOpts.map(([k, n]) => `<option value="${esc(k)}"${k === S.school ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
                <label class="flex items-center gap-1.5 text-sm text-slate-600" title="عدد الزيارات الإشرافيّة المطلوبة لكلّ معلّمٍ في الفصل الواحد — منه خطّ الوتيرة">المطلوب لكلّ معلّم في الفصل
                    <input type="number" id="dashPer" min="1" max="6" value="${per}" class="w-14 text-center bg-white border border-slate-300 rounded-lg py-1 text-sm"></label>
                <span class="text-xs text-slate-500 mr-auto"><bdi>${fmtDate(range.from)}</bdi> ← <bdi>${fmtDate(range.to)}</bdi> · ${visitWord(inR.length)}</span>
            </section>
            <section class="bg-white rounded-2xl border border-slate-200 grid grid-cols-2 lg:grid-cols-4 divide-slate-200 lg:divide-x lg:divide-x-reverse">
                ${covTile}${paceTile}${weakTile}${recTile}
            </section>

            <h2 class="text-lg font-bold text-slate-900 pt-2">١. هل أسير على خطّتي؟</h2>
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <div class="lg:col-span-3 min-w-0">${panel('dashPacePanel', 'الزيارات التراكميّة مقابل الوتيرة المطلوبة',
                    target ? `المطلوب ${target} ${target <= 10 ? 'زيارات' : 'زيارة'}: ${teacherWord(cov.total)} × ${need} — بوتيرةٍ منتظمةٍ عبر الفترة` : 'اربط حسابك بقاعدة المعلّمين ليُحسب المطلوب',
                    target || inR.length ? legend([['الفعليّ', X().NAVY, 'line'], ['المطلوب', '#94a3b8', 'dash']]) + '<div class="relative h-64"><canvas id="dashPace" role="img" aria-label="خطّ الزيارات التراكميّة مقابل الوتيرة المطلوبة"></canvas></div>'
                        : empty('لا زيارات في هذه الفترة بعد.'), true)}</div>
                <div class="lg:col-span-2 min-w-0">${panel('dashSchoolsPanel', 'من زرت في كلّ مدرسة', 'نقطةٌ لكلّ معلّم — الأقلّ تغطيةً أوّلاً',
                    cov.schools.length ? legend([['بلغ المطلوب', X().NAVY, 'dot'], ['دون المطلوب', '#85acd1', 'dot'], ['لم تزره', '#94a3b8', 'ring']]) + schoolStrips(cov)
                        : empty('لا معلّمين ولا زيارات في الفترة.'), false)}</div>
            </div>

            <h2 class="text-lg font-bold text-slate-900 pt-2">٢. أين الضعف؟ وعند من؟</h2>
            ${panel('dashDistPanel', 'توزيع المستويات في كلّ بند', `من آخر زيارةٍ لكلّ معلّم في الفترة (${teacherWord(dist.teachers)}) — الأضعف أوّلاً، ومنه موضوع برنامجك التدريبيّ`,
                dist.items.length ? legend([1, 2, 3, 4, 5].map(k => [LEVELS()[k], RATING()[k], 'sq'])) + `<div class="relative" style="height:${dist.items.length * 30 + 50}px"><canvas id="dashDist" role="img" aria-label="أشرطة توزيع المستويات لكلّ بند"></canvas></div>`
                    : empty('لا درجات محفوظة في هذه الفترة.'), true)}
            ${panel('dashHeatPanel', 'آخر درجةٍ لكلّ معلّم في كلّ بند', 'الأحوج أوّلاً — اضغط اسم المعلّم لفتح ملفّه',
                hm.length ? legend([1, 2, 3, 4, 5].map(k => [LEVELS()[k], RATING()[k], 'sq'])) + `<div class="overflow-x-auto"><div style="min-width:560px">${heatSvg(hm)}</div></div>`
                    : empty('لا زيارات في هذه الفترة.'), true)}

            <h2 class="text-lg font-bold text-slate-900 pt-2">٣. هل يتحسّن المعلّمون بعد الدعم؟</h2>
            ${panel('dashGrowthPanel', 'من أوّل زيارةٍ إلى آخرها', `متوسّط مستوى المعلّم في أوّل زيارةٍ وآخرها منذ بداية ${esc(R.year.label)} — لمن زرته مرّتين فأكثر`,
                gr.length ? legend([['أوّل زيارة', '#64748b', 'ring'], ['آخر زيارة: تحسّن', '#1d6b45', 'dot'], ['تراجع', '#b5452f', 'dot'], ['ثابت', '#64748b', 'dot']]) + `<div class="overflow-x-auto"><div style="min-width:520px">${growthSvg(gr)}</div></div>`
                    : empty('يظهر حين تزور معلّماً مرّتين في هذا العام الدراسيّ.'), true)}

            <h2 class="text-lg font-bold text-slate-900 pt-2">٤. هل نُفّذ ما اتّفقنا عليه؟</h2>
            ${panel('dashRecsPanel', 'توصيات الزيارات المدرسيّة في كلّ مدرسة',
                'المقيَّمة في زيارات الفترة (نُفّذت/جزئيّاً/لم تُنفّذ)، والمفتوحة من آخر زيارةٍ للمدرسة (متأخّرة أو في موعدها)',
                rf.schools.length ? legend(['done', 'partial', 'notDone', 'overdue', 'pending'].map(k => [STATUS[k][0], STATUS[k][1], 'sq'])) + `<div class="relative" style="height:${Math.min(rf.schools.length, 14) * 32 + 50}px"><canvas id="dashRecs" role="img" aria-label="أشرطة توصيات كلّ مدرسة بحسب حالتها"></canvas></div>`
                    : empty('لا توصيات مدرسيّة في هذه الفترة.'), true)}
            ${et.observations ? panel('dashEyePanel', 'من عين المشرف', `${et.observations === 1 ? 'حصّةٌ واحدة رُصدت' : et.observations + ' حصص رُصدت'} في الفترة`, eyeBlock(et), false) : ''}`;

        bindDash(R);
        drawPace(pc, cov);
        drawDist(dist);
        drawRecs(rf);
    }

    function schoolStrips(cov) {
        return `<div class="space-y-2.5 max-h-80 overflow-y-auto pl-1">${cov.schools.map(s => `
            <div>
                <div class="flex justify-between gap-2 text-sm"><span class="font-medium text-slate-800 truncate" title="${esc(s.school)}">${esc(D().shortSchool(s.school))}</span>
                    <span class="text-xs text-slate-500 whitespace-nowrap tabular-nums">${s.visited} من ${s.total}</span></div>
                <div class="flex flex-wrap gap-1.5 mt-1">${s.teachers.map(p => {
                    const st = p.count >= cov.need ? `background:${X().NAVY}` : p.count ? 'background:#85acd1' : 'background:#fff;border:2px solid #94a3b8';
                    const tip = p.name + ' — ' + (p.count ? visitWord(p.count) + ' (آخرها ' + fmtDate(p.last) + ')' : 'لم تزره في الفترة');
                    return `<button type="button" class="dash-dot w-3.5 h-3.5 rounded-full flex-none" style="${st}" title="${esc(tip)}" aria-label="${esc(tip)}"${p.count ? ` data-tk="${esc(p.tk)}"` : ''}></button>`;
                }).join('')}</div>
            </div>`).join('')}</div>`;
    }

    // الخريطة: صفٌّ لكلّ معلّم، وعمودٌ لكلّ بند (١ من اليمين)، والخليّة بلون مستواها ورقمه
    function heatSvg(rows) {
        const N = D().ITEMS, cw = 30, ch = 24, gap = 2, nameW = 168, weakW = 54, head = 26;
        const W = nameW + N * (cw + gap) + weakW, H = head + rows.length * (ch + gap) + 4;
        const xCell = i => W - nameW - (i + 1) * (cw + gap) + gap;          // i = 0 للبند ١
        const t = s => esc(s);
        let out = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${Math.round(W * 1.6)}px;margin-inline-end:auto;display:block" direction="rtl" role="img" aria-label="خريطة آخر درجة لكلّ معلّم في كلّ بند" font-family="${t(X().FONT)}">`;
        for (let i = 0; i < N; i++) {
            out += `<text x="${xCell(i) + cw / 2}" y="${head - 9}" text-anchor="middle" font-size="11" fill="#64748b"><title>${t((i + 1) + '. ' + D().SHORT[i + 1])}</title>${i + 1}</text>`;
        }
        out += `<text x="${weakW / 2}" y="${head - 9}" text-anchor="middle" font-size="11" fill="#64748b">يحتاج</text>`;
        rows.forEach((r, k) => {
            const y = head + k * (ch + gap);
            const nm = r.teacher.length > 22 ? r.teacher.slice(0, 21) + '…' : r.teacher;
            out += `<g class="dash-row" data-tk="${t(r.tk)}" style="cursor:pointer"><title>${t(r.teacher + ' — ' + (r.school || '') + ' — آخر زيارة ' + fmtDate(r.date))}</title>
                <rect x="0" y="${y}" width="${W}" height="${ch}" fill="transparent"/>
                <text x="${W - 4}" y="${y + ch / 2 + 4}" text-anchor="start" font-size="12" fill="#0f172a">${t(nm)}</text>`;
            r.scores.forEach((s, i) => {
                const fill = s ? RATING()[s] : '#e2e8f0';
                out += `<rect x="${xCell(i)}" y="${y}" width="${cw}" height="${ch}" rx="3" fill="${fill}"><title>${t(r.teacher + ' — ' + (i + 1) + '. ' + D().SHORT[i + 1] + ': ' + (s ? LEVELS()[s] : 'بلا درجة'))}</title></rect>`
                    + `<text x="${xCell(i) + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" font-size="11" fill="${s ? '#ffffff' : '#64748b'}" pointer-events="none">${s || '–'}</text>`;
            });
            out += `<text x="${weakW / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${r.weak ? '#7a2320' : '#94a3b8'}">${r.weak || '—'}</text></g>`;
        });
        return out + '</svg>';
    }

    // أشرطة النموّ: متميز أقصى اليمين، وخطٌّ من أوّل زيارة (حلقة) إلى آخرها (نقطة) بلون الاتّجاه
    function scaleX(x0, x1) { return v => x1 - (v - 1) / 4 * (x1 - x0); }
    function axisSvg(x, y, W) {
        let a = '';
        for (let v = 1; v <= 5; v++) {
            a += `<line x1="${x(v)}" y1="${y}" x2="${x(v)}" y2="${W}" stroke="rgba(15,23,42,.08)"/>`
               + `<text x="${x(v)}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#64748b">${esc(LEVELS()[v])}</text>`;
        }
        return a;
    }
    const trendColor = d => (d >= 0.2 ? '#1d6b45' : d <= -0.2 ? '#b5452f' : '#64748b');
    function growthSvg(list) {
        const rows = list.slice(0, 30);
        const nameW = 170, noteW = 104, rh = 26, head = 26, W = 640;
        const x = scaleX(noteW + 14, W - nameW - 14);
        const H = head + rows.length * rh + 6;
        let out = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${Math.round(W * 1.6)}px;margin-inline-end:auto;display:block" direction="rtl" role="img" aria-label="أشرطة نموّ المعلّمين من أوّل زيارةٍ إلى آخرها" font-family="${esc(X().FONT)}">` + axisSvg(x, head, H);
        rows.forEach((g, k) => {
            const y = head + k * rh + rh / 2, c = trendColor(g.delta);
            const nm = g.teacher.length > 22 ? g.teacher.slice(0, 21) + '…' : g.teacher;
            const note = g.delta >= 0.2 ? 'تحسّن ' + g.delta + ' درجة' : g.delta <= -0.2 ? 'تراجع ' + Math.abs(g.delta) + ' درجة' : 'ثابت';
            out += `<g class="dash-row" data-tk="${esc(g.tk)}" style="cursor:pointer"><title>${esc(g.teacher + ' — ' + visitWord(g.visits) + ': ' + fmtDate(g.first.date) + ' (' + g.first.mean + ') ← ' + fmtDate(g.last.date) + ' (' + g.last.mean + ')' + ' — بنودٌ تحسّنت ' + g.up + '، وتراجعت ' + g.down)}</title>
                <rect x="0" y="${y - rh / 2}" width="${W}" height="${rh}" fill="transparent"/>
                <text x="${W - 4}" y="${y + 4}" text-anchor="start" font-size="12" fill="#0f172a">${esc(nm)}</text>
                <line x1="${x(g.first.mean)}" y1="${y}" x2="${x(g.last.mean)}" y2="${y}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
                <circle cx="${x(g.first.mean)}" cy="${y}" r="5" fill="#ffffff" stroke="#64748b" stroke-width="2"/>
                <circle cx="${x(g.last.mean)}" cy="${y}" r="6" fill="${c}" stroke="#ffffff" stroke-width="2"/>
                <text x="4" y="${y + 4}" text-anchor="end" font-size="11" fill="${c}">${esc(note)}</text></g>`;
        });
        return out + '</svg>';
    }

    function eyeBlock(et) {
        const parts = [['met', 'تحقّق', '#1d6b45'], ['better', 'تحسّن', '#9a6f24'], ['same', 'لم يتغيّر', '#64748b'], ['worse', 'تراجع', '#b5452f']];
        const bar = et.measured ? `<div class="flex h-3 rounded-full overflow-hidden mt-2" role="img" aria-label="نتائج أهداف الزيارات السابقة">${parts.filter(p => et[p[0]]).map(p =>
                `<i class="block h-full" style="width:${100 * et[p[0]] / et.measured}%;background:${p[2]}" title="${p[1]}: ${et[p[0]]}"></i>`).join('<i class="block h-full w-0.5 bg-white"></i>')}</div>`
            + legend(parts.filter(p => et[p[0]]).map(p => [p[1] + ' ' + et[p[0]], p[2], 'sq'])).replace('mb-2', 'mt-2') : '';
        return `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
            <div><div class="text-xs text-slate-500">متوسّط حركة الطلبة في الحصص المرصودة</div>
                <div class="text-2xl font-bold tabular-nums ${et.moving != null && et.moving >= 50 ? 'text-green-700' : 'text-slate-900'}">${et.moving != null ? et.moving + '%' : '—'}</div>
                <div class="text-xs text-slate-500">المعيار المتداول: نصف زمن الحصة نشاطاً معتدلاً فأشدّ (٥٠٪)</div></div>
            <div><div class="text-xs text-slate-500">أهداف الزيارات السابقة التي قيست في حصص الفترة</div>
                <div class="text-2xl font-bold tabular-nums text-slate-900">${et.measured ? et.met + ' من ' + et.measured : '—'}</div>
                ${et.measured ? bar : '<div class="text-xs text-slate-500">تُقاس في الرصد التالي للمعلّم نفسه.</div>'}</div>
        </div>`;
    }

    function drawPace(pc, cov) {
        if (!$('dashPace')) return;
        const labels = pc.weeks.map((w, i) => String(i + 1));
        const datasets = [{ label: 'الفعليّ', data: pc.weeks.map(w => w.actual), borderColor: X().NAVY, backgroundColor: X().NAVY, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, tension: 0.2, spanGaps: false }];
        if (pc.target) datasets.push({ label: 'المطلوب', data: pc.weeks.map(w => w.plan), borderColor: '#94a3b8', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 3 });
        chart('dashPace', {
            type: 'line', data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, layout: { padding: { left: 12 } },
                plugins: { legend: { display: false }, tooltip: rtlTip({ callbacks: {
                    title: items => { const w = pc.weeks[items[0].dataIndex]; return 'الأسبوع ' + (items[0].dataIndex + 1) + ': ' + fmtDate(w.from) + ' – ' + fmtDate(w.to); },
                    label: c => c.dataset.label + ': ' + Math.round(c.parsed.y) } }) },
                scales: { x: { reverse: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 8 }, title: { display: true, text: 'الأسبوع' } },
                          y: { position: 'right', beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }
    function drawDist(dist) {
        if (!$('dashDist')) return;
        chart('dashDist', {
            type: 'bar',
            data: { labels: dist.items.map(x => x.id + '. ' + x.label),
                    datasets: [1, 2, 3, 4, 5].map(k => ({ label: LEVELS()[k], data: dist.items.map(x => x.pct[k - 1]), backgroundColor: RATING()[k],
                        borderColor: '#ffffff', borderWidth: { left: 1, right: 1 }, borderSkipped: false, barThickness: 18 })) },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: rtlTip({ callbacks: {
                    label: c => { const it = dist.items[c.dataIndex], k = c.datasetIndex; return c.dataset.label + ': ' + it.counts[k] + ' (' + Math.round(it.pct[k]) + '%)'; },
                    footer: items => { const it = dist.items[items[0].dataIndex]; return '«غير ملائم» فأدنى: ' + it.weakPct + '% من ' + teacherWord(it.n); } } }) },
                scales: { x: { stacked: true, max: 100, reverse: true, ticks: { callback: v => v + '%' } },
                          y: { stacked: true, position: 'right', grid: { display: false }, ticks: { color: X().INK, font: { size: 12 } } } }
            }
        });
    }
    function drawRecs(rf) {
        if (!$('dashRecs')) return;
        const list = rf.schools.slice(0, 14);
        const keys = ['done', 'partial', 'notDone', 'overdue', 'pending'];
        chart('dashRecs', {
            type: 'bar',
            data: { labels: list.map(s => D().shortSchool(s.school)),
                    datasets: keys.map(k => ({ label: STATUS[k][0], data: list.map(s => s[k]), backgroundColor: STATUS[k][1],
                        borderColor: '#ffffff', borderWidth: { left: 1, right: 1 }, borderSkipped: false, barThickness: 18 })) },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: rtlTip({ filter: c => c.parsed.x > 0, callbacks: {
                    title: items => list[items[0].dataIndex].school,
                    label: c => c.dataset.label + ': ' + c.parsed.x } }) },
                scales: { x: { stacked: true, reverse: true, ticks: { precision: 0 } },
                          y: { stacked: true, position: 'right', grid: { display: false }, ticks: { color: X().INK, font: { size: 12 } } } }
            }
        });
    }

    function bindDash(R) {
        $('dashPeriod').addEventListener('change', e => { S.period = e.target.value; renderDash(); });
        $('dashSchool').addEventListener('change', e => { S.school = e.target.value; renderDash(); });
        $('dashPer').addEventListener('change', e => {
            const v = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || D().PER_TEACHER));
            try { localStorage.setItem(PER_KEY, String(v)); } catch (x) { /* يبقى لهذه المرّة */ }
            renderDash();
        });
        $('dashPrint').addEventListener('click', () => printDash(R));
        const box = $('stats-view');
        box.querySelectorAll('.dash-export').forEach(b => b.addEventListener('click', () => exportPanel(b.dataset.export)));
        box.querySelectorAll('.dash-row, .dash-dot[data-tk]').forEach(el => el.addEventListener('click', () => openProfile(el.getAttribute('data-tk'))));
    }

    const FILES = { dashPacePanel: 'الوتيرة', dashDistPanel: 'توزيع-المستويات', dashHeatPanel: 'خريطة-المعلمين', dashGrowthPanel: 'نمو-المعلمين',
                    dashRecsPanel: 'متابعة-التوصيات', profDumbPanel: 'ملف-المعلم-البنود', profHistPanel: 'ملف-المعلم-السجل', profEyePanel: 'ملف-المعلم-الحركة' };
    function exportPanel(id) {
        const p = $(id);
        if (!p) return;
        const name = (FILES[id] || 'رسم') + '-' + today();
        const cv = p.querySelector('canvas'), svg = p.querySelector('svg');
        if (cv) X().canvasPng(cv, name); else if (svg) X().svgPng(svg, name);
    }

    // طباعة اللوحة (PDF من نافذة الطباعة): الرسوم صوراً، والخريطة وأشرطة النموّ متّجهة — تُفتح النافذة داخل الضغطة
    function printDash(R) {
        const w = root.open('', '_blank');
        if (!w) { if (typeof root.showToast === 'function') root.showToast('اسمح بالنوافذ المنبثقة لهذا الموقع ثمّ أعد المحاولة', 'error'); return; }
        const box = $('stats-view');
        const who = (() => { try { const s = root.SupervisorGate && SupervisorGate.session(); return s && s.name && !s.admin ? s.name : ''; } catch (e) { return ''; } })();
        const range = R[S.period];
        const school = S.school ? ($('dashSchool').selectedOptions[0] || {}).textContent : 'كلّ المدارس';
        const tiles = [...box.querySelectorAll('section.grid > div')].map(d => `<div class="t">${d.innerHTML}</div>`).join('');
        const sec = id => {
            const p = $(id);
            if (!p) return '';
            const h = p.querySelector('h3'), sub = p.querySelector('h3 + p');
            const leg = p.querySelector('.flex.flex-wrap.gap-x-4');
            const cv = p.querySelector('canvas'), svg = p.querySelector('svg');
            const body = cv ? `<img src="${X().imageUrl(cv)}" alt="">` : svg ? svg.outerHTML : '';
            return body ? `<div class="p"><h3>${h ? esc(h.textContent) : ''}</h3>${sub ? `<p class="s">${esc(sub.textContent)}</p>` : ''}${leg ? `<div class="l">${leg.innerHTML}</div>` : ''}${body}</div>` : '';
        };
        const schools = D().coverage(D().visitsFrom(supRows(), normName).filter(v => !S.school || normSchool(v.school) === S.school),
            roster().filter(t => !S.school || normSchool(t.school) === S.school), range, perTeacher() * range.terms, normName).schools;
        const table = schools.length ? `<div class="p"><h3>التغطية في كلّ مدرسة</h3><table><tr><th>المدرسة</th><th>زرتهم</th><th>المعلّمون</th><th>لم تزرهم</th></tr>${schools.map(s =>
            `<tr><td>${esc(s.school)}</td><td>${s.visited}</td><td>${s.total}</td><td>${esc(s.teachers.filter(p => !p.count).map(p => p.name).join('، ') || '—')}</td></tr>`).join('')}</table></div>` : '';
        w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>لوحة المتابعة — ${esc(range.label)}</title>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
            <style>body{font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;color:#0f172a;margin:24px}h1{font-size:20px;margin:0}h3{font-size:14px;margin:0 0 4px}
            .m{color:#475569;font-size:12px;margin:4px 0 14px}.g{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #cbd5e1;border-radius:10px;margin-bottom:14px}
            .t{padding:10px 12px;border-inline-start:1px solid #e2e8f0;font-size:12px}.t:first-child{border:0}.t .text-2xl{font-size:18px;font-weight:700}
            .p{border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin-bottom:12px;break-inside:avoid}.s{color:#64748b;font-size:11px;margin:0 0 6px}
            .l{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11px;color:#475569;margin-bottom:6px}.l span{display:flex;align-items:center;gap:5px}.l i{display:inline-block;width:10px;height:10px;border-radius:2px}
            .l i.border-dashed{height:0;border-top:2px dashed;width:16px;border-radius:0}.l i.rounded-full{border-radius:50%}.l i.h-0\\.5{height:2px;width:16px}
            img,svg{width:100%;height:auto;display:block}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #e2e8f0;padding:4px 6px;text-align:right;vertical-align:top}th{background:#f1f5f9}
            @page{size:A4;margin:12mm}</style></head><body>
            <h1>لوحة المتابعة</h1><div class="m">${esc(range.label)} · ${esc(school)}${who ? ' · ' + esc(who) : ''} · أُعدّت في ${esc(fmtDate(today()))}</div>
            <div class="g">${tiles}</div>
            ${sec('dashPacePanel')}${table}${sec('dashDistPanel')}${sec('dashHeatPanel')}${sec('dashGrowthPanel')}${sec('dashRecsPanel')}
            <script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script></body></html>`);
        w.document.close();
    }

    // ── ملف المعلم ──
    function openProfile(tk) {
        if (!tk) return;
        S.profile = tk;
        if (typeof root.toggleSupervisoryView === 'function') root.toggleSupervisoryView('dashboard-view');
        else renderProfile();
    }

    function renderProfile() {
        const box = $('dashboard-view');
        if (!box || !D() || !X()) return;
        dropCharts('prof');
        const all = D().visitsFrom(supRows(), normName);
        const names = new Map();
        all.forEach(v => names.set(v.tk, v.teacher));
        const opts = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
        if (S.profile && !names.has(S.profile)) S.profile = '';
        // بلا اختيار: المعلّم المفتوح في النموذج إن كانت له زيارات
        if (!S.profile) { const cur = normName((($('teacherName') || {}).value) || ''); if (cur && names.has(cur)) S.profile = cur; }
        const P = S.profile ? D().profile(all, S.profile) : null;
        const R = ranges();

        let body = '';
        if (!opts.length) body = `<section class="bg-white rounded-2xl border border-slate-200">${empty('احفظ زيارةً إشرافيّةً من «نموذج التقييم» ليظهر ملفّ معلّمها هنا.')}</section>`;
        else if (!P || !P.visits.length) body = `<section class="bg-white rounded-2xl border border-slate-200">${empty('اختر معلّماً لعرض ملفّه.')}</section>`;
        else {
            const n = P.visits.length, lv = P.last;
            const yearN = P.visits.filter(v => D().inRange(v, R.year)).length;
            const since = D().between(lv.date, today());
            const r1 = v => Math.round(v * 10) / 10;
            const delta = n > 1 && P.first.mean != null && lv.mean != null ? r1(P.first.mean - lv.mean) : null;
            body = `
                <section class="bg-white rounded-2xl border border-slate-200 grid grid-cols-2 lg:grid-cols-4 divide-slate-200 lg:divide-x lg:divide-x-reverse">
                    ${tile(String(n), 'زياراته المحفوظة', `${visitWord(yearN)} في ${esc(R.year.label)}`)}
                    ${tile(`<bdi>${fmtDate(lv.date)}</bdi>`, 'آخر زيارة', since >= 0 ? (since === 0 ? 'اليوم' : 'قبل ' + since + ' يوماً') : '', since > 42 ? 'bad' : '')}
                    ${tile(String(lv.weak), 'بنودٌ تحتاج في آخر زيارة', '«غير ملائم» فأدنى', lv.weak ? 'bad' : 'good')}
                    ${tile(delta == null ? '—' : delta >= 0.2 ? 'تحسّن ' + delta : delta <= -0.2 ? 'تراجع ' + Math.abs(delta) : 'ثابت', 'منذ أوّل زيارة', delta == null ? 'يظهر من الزيارة الثانية' : 'في متوسّط المستوى (' + r1(P.first.mean) + ' ← ' + r1(lv.mean) + ')', delta == null ? '' : delta >= 0.2 ? 'good' : delta <= -0.2 ? 'bad' : '')}
                </section>
                ${panel('profDumbPanel', n > 1 ? 'من أوّل زيارةٍ إلى آخرها في كلّ بند' : 'مستواه في كلّ بند', n > 1 ? `${fmtDate(P.first.date)} ← ${fmtDate(lv.date)}` : 'زيارةٌ واحدة — يظهر التغيّر من الزيارة الثانية',
                    (n > 1 ? legend([['أوّل زيارة', '#64748b', 'ring'], ['آخر زيارة: تحسّن', '#1d6b45', 'dot'], ['تراجع', '#b5452f', 'dot'], ['ثابت', '#64748b', 'dot']]) : '')
                    + `<div class="overflow-x-auto"><div style="min-width:520px">${itemsSvg(P, n > 1)}</div></div>`, true)}
                ${panel('profHistPanel', 'سجلّ زياراته بندًا بندًا', 'عمودٌ لكلّ زيارة — الأحدث يساراً', legend([1, 2, 3, 4, 5].map(k => [LEVELS()[k], RATING()[k], 'sq']))
                    + `<div class="overflow-x-auto"><div style="min-width:${Math.min(12, n) * 46 + 200}px">${histSvg(P)}</div></div>`, true)}
                ${P.eye.length ? panel('profEyePanel', 'حركة الطلبة في حصصه — عين المشرف', 'نسبة الطلبة المتحرّكين في الأنشطة، والخطّ المتقطّع معيار ٥٠٪',
                    legend([['حركة الطلبة', X().NAVY, 'line'], ['المعيار ٥٠٪', '#94a3b8', 'dash']]) + '<div class="relative h-56"><canvas id="profEye" role="img" aria-label="حركة الطلبة في حصص المعلّم المرصودة"></canvas></div>', true) : ''}`;
        }

        box.innerHTML = `
            <div class="svf-head" style="margin-bottom:0">
                <div><h1>ملف المعلم</h1><p>مستوى المعلّم في كلّ بندٍ من أوّل زيارةٍ إلى آخرها، وسجلّ زياراته، وحركة الطلبة في حصصه.</p></div>
                ${P && P.last ? '<div class="flex flex-wrap gap-2"><button type="button" id="profOpenLast" class="svf-btn svf-btn-secondary"><i class="fa-solid fa-file-pen" aria-hidden="true"></i>فتح آخر زيارة</button></div>' : ''}
            </div>
            <section class="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label class="flex items-center gap-1.5 text-sm text-slate-600 min-w-0">المعلّم
                    <select id="profTeacher" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-0 max-w-[18rem]">
                        <option value="">اختر معلّماً…</option>${opts.map(([k, nm]) => `<option value="${esc(k)}"${k === S.profile ? ' selected' : ''}>${esc(nm)}</option>`).join('')}</select></label>
                ${P && P.school ? `<span class="text-sm text-slate-600 truncate">${esc(P.school)}</span>` : ''}
            </section>
            ${body}`;

        $('profTeacher').addEventListener('change', e => { S.profile = e.target.value; renderProfile(); });
        const ol = $('profOpenLast');
        if (ol) ol.addEventListener('click', () => { if (typeof root.loadPermanentReport === 'function') root.loadPermanentReport(P.last.key); });
        box.querySelectorAll('.dash-export').forEach(b => b.addEventListener('click', () => exportPanel(b.dataset.export)));
        if (P && P.eye.length) drawProfileEye(P);
    }

    // بنود المعلّم: أوّل درجةٍ (حلقة) وآخرها (نقطة) — أو نقطةٌ واحدة لزيارةٍ واحدة
    function itemsSvg(P, two) {
        const nameW = 190, noteW = 70, rh = 26, head = 26, W = 640;
        const x = scaleX(noteW + 14, W - nameW - 14);
        const H = head + P.items.length * rh + 6;
        let out = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${Math.round(W * 1.6)}px;margin-inline-end:auto;display:block" direction="rtl" role="img" aria-label="مستوى المعلّم في كلّ بند" font-family="${esc(X().FONT)}">` + axisSvg(x, head, H);
        P.items.forEach((it, k) => {
            const y = head + k * rh + rh / 2;
            out += `<text x="${W - 4}" y="${y + 4}" text-anchor="start" font-size="12" fill="#0f172a">${esc(it.id + '. ' + it.label)}</text>`;
            if (!it.last) { out += `<text x="${x(3)}" y="${y + 4}" text-anchor="middle" font-size="11" fill="#94a3b8">بلا درجة</text>`; return; }
            const tip = esc(it.id + '. ' + it.label + ': ' + (two && it.first ? LEVELS()[it.first] + ' ← ' : '') + LEVELS()[it.last]);
            if (two && it.first) {
                const d = it.first - it.last, c = d > 0 ? '#1d6b45' : d < 0 ? '#b5452f' : '#64748b';
                out += `<g><title>${tip}</title><line x1="${x(it.first)}" y1="${y}" x2="${x(it.last)}" y2="${y}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
                    <circle cx="${x(it.first)}" cy="${y}" r="5" fill="#ffffff" stroke="#64748b" stroke-width="2"/>
                    <circle cx="${x(it.last)}" cy="${y}" r="6" fill="${c}" stroke="#ffffff" stroke-width="2"/></g>
                    <text x="4" y="${y + 4}" text-anchor="end" font-size="11" fill="${c}">${d > 0 ? 'تحسّن' : d < 0 ? 'تراجع' : 'ثابت'}</text>`;
            } else {
                out += `<circle cx="${x(it.last)}" cy="${y}" r="6" fill="${RATING()[it.last]}" stroke="#ffffff" stroke-width="2"><title>${tip}</title></circle>`;
            }
        });
        return out + '</svg>';
    }

    // سجلّ الزيارات: صفٌّ لكلّ بند وعمودٌ لكلّ زيارة (آخر ١٢)، الأقدم يميناً
    function histSvg(P) {
        const vs = P.visits.slice(-12), cw = 40, ch = 22, gap = 3, nameW = 190, head = 30;
        const W = nameW + vs.length * (cw + gap) + 6, H = head + P.items.length * (ch + gap) + 4;
        const xc = j => W - nameW - (j + 1) * (cw + gap) + gap;
        const off = P.visits.length - vs.length;
        let out = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${Math.round(W * 1.6)}px;margin-inline-end:auto;display:block" direction="rtl" role="img" aria-label="سجلّ زيارات المعلّم بنداً بنداً" font-family="${esc(X().FONT)}">`;
        vs.forEach((v, j) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.date);
            out += `<text x="${xc(j) + cw / 2}" y="${head - 10}" text-anchor="middle" font-size="10.5" fill="#64748b"><title>${esc(fmtDate(v.date))}</title>${m ? (+m[3]) + '/' + (+m[2]) : ''}</text>`;
        });
        P.items.forEach((it, k) => {
            const y = head + k * (ch + gap);
            out += `<text x="${W - 4}" y="${y + ch / 2 + 4}" text-anchor="start" font-size="12" fill="#0f172a">${esc(it.id + '. ' + it.label)}</text>`;
            vs.forEach((v, j) => {
                const s = it.hist[off + j];
                out += `<rect x="${xc(j)}" y="${y}" width="${cw}" height="${ch}" rx="3" fill="${s ? RATING()[s] : '#e2e8f0'}"><title>${esc(fmtDate(v.date) + ' — ' + it.label + ': ' + (s ? LEVELS()[s] : 'بلا درجة'))}</title></rect>`
                    + `<text x="${xc(j) + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" font-size="11" fill="${s ? '#ffffff' : '#64748b'}" pointer-events="none">${s || '–'}</text>`;
            });
        });
        return out + '</svg>';
    }

    function drawProfileEye(P) {
        const pts = P.eye;
        chart('profEye', {
            type: 'line',
            data: { labels: pts.map(p => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.date); return m ? (+m[3]) + '/' + (+m[2]) : p.date; }), datasets: [
                { label: 'حركة الطلبة', data: pts.map(p => p.moving), borderColor: X().NAVY, backgroundColor: X().NAVY, borderWidth: 2.5, pointRadius: 5, pointBorderColor: '#fff', pointBorderWidth: 2, tension: 0.2 },
                { label: 'المعيار', data: pts.map(() => 50), borderColor: '#94a3b8', borderDash: [6, 4], borderWidth: 2, pointRadius: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false, layout: { padding: { left: 16, right: 4 } },
                plugins: { legend: { display: false }, tooltip: rtlTip({ filter: c => c.datasetIndex === 0, callbacks: {
                    title: items => fmtDate(pts[items[0].dataIndex].date), label: c => 'حركة الطلبة: ' + c.parsed.y + '%' } }) },
                scales: { x: { reverse: true, grid: { display: false } }, y: { position: 'right', min: 0, max: 100, ticks: { callback: v => v + '%' } } }
            }
        });
    }

    root.svfDashRender = function () { try { renderDash(); } catch (e) { console.warn(e); } };
    root.svfProfileRender = function () { try { renderProfile(); } catch (e) { console.warn(e); } };
    root.svfDashOpenProfile = openProfile;
})(typeof window !== 'undefined' ? window : this);
