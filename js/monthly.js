// =========================================================================
// التقرير الشهري — الصفحة (monthly.html)
//
// تقرأ ولا تكتب: تقارير الموقع وتأكيدات البوّابة من تخزين المتصفّح نفسه،
// والخطة المعتمدة من موقع خطة السير. ولا تمسّ مفاتيح الموقع القائمة —
// ما تحفظه من مسوّدات تحت svf_monthly_*.
//
// نموذج Word يبقى في جهاز المشرف (IndexedDB مستقلّة) ولا يُنشر مع الموقع:
// فيه اسمه وشعارات النموذج الرسميّ.
// =========================================================================
(function () {
    'use strict';

    const C = window.MonthlyCore, D = window.MonthlyDocx;
    const el = id => document.getElementById(id);
    const DRAFT = (y, m) => `svf_monthly_${y}_${m + 1}`;
    // مفاتيح المسوّدة **لكلّ مشرفٍ على حدة**: المتصفّح قد يتناوبه أكثر من مشرف،
    // وقيمةٌ واحدةٌ مشتركةٌ كانت تُورِث الثاني رقمَ خطة الأوّل وبادئة اسم ملفّه.
    const PLAN_ID_KEY = id => 'svf_monthly_plan_id_' + id;
    const PREFIX_KEY = id => 'svf_monthly_prefix_' + id;

    // أرقام المشرفين في خطة السير — بترتيب قائمة plan.supervisor-mct.com نفسها.
    // تُراجَع إذا أُضيف مشرفٌ هناك أو حُذف. المطابقة بالاسم لا بالموضع، فترتيب
    // قائمة identity.js لا يُلزمنا شيئاً.
    const PLAN_NUMBERS = {
        'صباح المقبالي': '1', 'ماجد الأخزمي': '2', 'ناصر الرزيقي': '3', 'هشام العدواني': '4',
        'ناصر الناعبي': '5', 'أسعد الخصيبي': '6', 'هند الهنائية': '7', 'يسرى الذخرية': '8',
        'رؤى المحاربية': '9', 'أمل النعمانية': '10', 'رياء الشريقية': '11', 'عائشة البلوشية': '12',
        'مهرة اليعقوبية': '13', 'رقية العميرية': '14', 'آسية الكندية': '15'
    };
    const normName = v => (window.SupervisorIdentity ? SupervisorIdentity.normName(v) : String(v || '').trim());
    const planNumberFor = name => {
        const want = normName(name);
        const hit = Object.keys(PLAN_NUMBERS).find(n => normName(n) === want);
        return hit ? PLAN_NUMBERS[hit] : '';
    };
    // اسمٌ لمشرفٍ آخر معروف: تقريرهُ لا يدخل تقريري الشهريّ
    const isOtherSupervisor = (name, me) => {
        const want = normName(name);
        if (!want || want === normName(me)) return false;
        return Object.keys(PLAN_NUMBERS).some(n => normName(n) === want);
    };
    const PLAN_CACHE = (id, y, m) => `svf_monthly_plan_${id}_${y}_${m}`;

    const PLAN_FB = {
        apiKey: 'AIzaSyAUknGaMIWzeYLWlp-EUZtFzshNaewjwDc',
        authDomain: 'supervisor-plan.firebaseapp.com',
        projectId: 'supervisor-plan',
        appId: '1:584751936902:web:ab89e36c7f173e9a1c2807'
    };
    const PLAN_APP_ID = 'supervisor-plan-v1';
    const SDK = 'https://www.gstatic.com/firebasejs/11.6.1/';

    const state = { year: 0, month0: 0, rows: [], totals: null, overrides: {}, reasons: null,
                    schoolReports: [], supReports: [], sentSchool: new Set(), sentSup: new Set(),
                    plan: {}, events: {}, planStatus: '', template: null, templateName: '' };

    const readJSON = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
    const toast = (m, t) => { try { showToast(m, t); } catch (e) { console.log(m); } };

    // ───────────────────────────── بيانات الجهاز
    // `me`: اسم المشرف المرتبط. التقرير الذي يحمل اسم **مشرفٍ آخر معروف** يُستبعد —
    // المتصفّح قد يتناوبه اثنان، والتقرير وثيقةٌ باسم صاحبها. وما لا اسم فيه أو فيه
    // اسمٌ غير معروف (نيابةً عن زميل، أو تقريرٌ قديمٌ قبل الهويّة) يبقى لصاحب الجهاز:
    // إسقاطُه يُنقص تقريرَه الشهريّ، والخطأ هنا أفدح من زيادةٍ يراها ويحذفها.
    function loadLocal(year, month0, me) {
        const pref = `${year}-${String(month0 + 1).padStart(2, '0')}`;
        const school = [], sup = [];
        let skipped = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.indexOf('supervision_v6_school_report_') === 0) {
                const r = readJSON(k, null);
                if (r && String(r.visitDate || '').indexOf(pref) === 0) {
                    if (isOtherSupervisor(r.supervisor, me)) { skipped++; continue; }
                    school.push({ key: k, schoolName: r.schoolName, visitDate: r.visitDate, visitType: r.visitType,
                                  classroomVisits: r.classroomVisits });
                }
            } else if (k.indexOf('supervision_v6_visit_') === 0) {
                const r = readJSON(k, null);
                if (r && String(r.visitDate || '').indexOf(pref) === 0) {
                    if (isOtherSupervisor(r.supervisor, me)) { skipped++; continue; }
                    sup.push({ key: k, teacherName: r.teacherName, visitDate: r.visitDate, school: r.school, formData: r.formData || {} });
                }
            }
        }
        state.skipped = skipped;
        const sort = (a, b) => String(a.visitDate).localeCompare(String(b.visitDate));
        state.schoolReports = school.sort(sort);
        state.supReports = sup.sort(sort);
        state.sentSchool = new Set(readJSON('svf_sent_school_visits', []) || []);
        state.sentSup = new Set(readJSON('svf_sent_visits', []) || []);
    }

    // ───────────────────────────── الخطة المعتمدة (قراءة)
    let planSdk = null;
    async function planDb() {
        if (planSdk) return planSdk;
        const [app, auth, fs] = await Promise.all([
            import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore-lite.js')
        ]);
        const a = app.initializeApp(PLAN_FB, 'plan');
        const au = auth.getAuth(a);
        if (!au.currentUser) await auth.signInAnonymously(au);     // كما يفعل موقع الخطة لكلّ زائر
        planSdk = { db: fs.getFirestore(a), doc: fs.doc, getDoc: fs.getDoc };
        return planSdk;
    }
    const planPath = (...rest) => ['artifacts', PLAN_APP_ID, 'public', 'data', ...rest];

    async function fetchPlan(planId, year, month0) {
        const cacheKey = PLAN_CACHE(planId, year, month0);
        try {
            const fb = await planDb();
            const snap = await fb.getDoc(fb.doc(fb.db, ...planPath('supervisor_plans', `plan_${planId}_${year}_${month0}`)));
            const ev = await fb.getDoc(fb.doc(fb.db, ...planPath('app_config', 'mandatory_events')));
            const visits = snap.exists() ? (snap.data().visits || {}) : {};
            const events = ev.exists() ? (ev.data() || {}) : {};
            const value = { visits, events, at: Date.now() };
            try { localStorage.setItem(cacheKey, JSON.stringify(value)); } catch (e) {}
            return { visits, events, status: snap.exists() ? 'live' : 'empty' };
        } catch (e) {
            const cached = readJSON(cacheKey, null);
            if (cached) return { visits: cached.visits, events: cached.events, status: 'cache' };
            return { visits: {}, events: {}, status: 'error', error: e && e.message };
        }
    }

    // ───────────────────────────── النموذج (ملف المشرف)
    const TPL_DB = 'MonthlyTemplateDB', TPL_STORE = 'template';
    function tplStore(mode) {
        return new Promise((res, rej) => {
            const req = indexedDB.open(TPL_DB, 1);
            req.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains(TPL_STORE)) db.createObjectStore(TPL_STORE); };
            req.onsuccess = e => { const db = e.target.result; res(db.transaction(TPL_STORE, mode).objectStore(TPL_STORE)); };
            req.onerror = e => rej(e.target.error);
        });
    }
    const tplGet = () => tplStore('readonly').then(s => new Promise((res, rej) => { const r = s.get('docx'); r.onsuccess = () => res(r.result || null); r.onerror = e => rej(e.target.error); }));
    const tplPut = v => tplStore('readwrite').then(s => new Promise((res, rej) => { const r = s.put(v, 'docx'); r.onsuccess = () => res(); r.onerror = e => rej(e.target.error); }));

    // ───────────────────────────── الجدول
    const COLS = [
        { k: 'date', label: 'التاريخ', ro: true, w: 'w-16' },
        { k: 'dayName', label: 'اليوم', ro: true, w: 'w-20' },
        { k: 'planned', label: 'الخطة الشهرية المعتمدة' },
        { k: 'executed', label: 'الخطة المنفذة فعلياً' },
        { k: 'marks', label: '✓ الزيارة المدرسية', num: true, w: 'w-20' },
        { k: 'supervisory', label: 'عدد الزيارات الاشرافية', multiline: true },
        { k: 'methods', label: 'الأساليب الإشرافية المنفذة' },
        { k: 'followE', label: 'متابعة إلكترونية', w: 'w-24' },
        { k: 'followA', label: 'متابعة إدارية وفنية', w: 'w-24' }
    ];

    function recompute() {
        state.rows = C.buildRows({
            year: state.year, month0: state.month0, plan: state.plan, events: state.events,
            schoolReports: state.schoolReports, supReports: state.supReports,
            sentSchool: state.sentSchool, sentSup: state.sentSup, overrides: state.overrides
        });
        state.totals = C.totals(state.rows, state.reasons == null ? undefined : state.reasons);
        render();
        saveDraft();
    }

    function saveDraft() {
        try { localStorage.setItem(DRAFT(state.year, state.month0),
              JSON.stringify({ overrides: state.overrides, reasons: state.reasons })); } catch (e) {}
    }
    function loadDraft() {
        const d = readJSON(DRAFT(state.year, state.month0), null) || {};
        state.overrides = d.overrides || {};
        state.reasons = typeof d.reasons === 'string' ? d.reasons : null;
    }

    function setOverride(day, field, value) {
        const row = state.rows.find(r => r.day === day);
        const o = state.overrides[day] = state.overrides[day] || {};
        o[field] = value;
        // ما عاد الفرق: يُحذف التعديل ليعود الحقل تابعاً للبيانات
        if (row && String(value) === String(row[field]) && !row.edited.includes(field)) delete o[field];
        if (!Object.keys(o).length) delete state.overrides[day];
        recompute();
    }

    function render() {
        const t = state.totals;
        el('summary').innerHTML = `
            <div class="flex flex-wrap gap-4 text-sm">
              ${[['أيام الخطة', t.planned], ['المنفَّذ', t.executed], ['✓ زيارات مدرسية', t.schools],
                 ['زيارات إشرافية', t.supText], ['نسبة الإنجاز', t.rate + '%']].map(([k, v]) =>
                `<div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2"><span class="text-slate-500">${k}:</span> <b>${v}</b></div>`).join('')}
            </div>`;

        const warns = state.rows.flatMap(r => r.warnings.map(w => `<li><b>${r.date}</b> — ${w}</li>`));
        el('warnings').innerHTML = warns.length
            ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm"><div class="font-bold mb-1 text-amber-800">
                 <i class="fa-solid fa-triangle-exclamation"></i> ${warns.length} ملاحظة قبل الإخراج</div>
               <ul class="list-disc pr-5 space-y-0.5 text-amber-900">${warns.join('')}</ul></div>` : '';

        el('grid').innerHTML = `
          <table class="w-full text-xs border-collapse">
            <thead><tr class="bg-slate-100">${COLS.map(c => `<th class="border border-slate-200 p-2 font-bold ${c.w || ''}">${c.label}</th>`).join('')}</tr></thead>
            <tbody>${state.rows.map(r => `<tr class="${r.warnings.length ? 'bg-amber-50/60' : ''}">${COLS.map(c => {
                const v = r[c.k];
                const edited = r.edited.includes(c.k) ? 'ring-1 ring-blue-300' : '';
                if (c.ro) return `<td class="border border-slate-200 p-1 text-center font-bold text-slate-600">${v}</td>`;
                // متعدّد الأسطر — أكثر من مدرسةٍ في يوم الزيارات الإشرافية (انظر buildRows):
                // <input> يبتلع أسطر النصّ، فلا يظهر الفصل ولا يمكن كتابته يدويّاً
                if (c.multiline) {
                    const escText = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const lines = Math.max(1, String(v).split('\n').length);
                    return `<td class="border border-slate-200 p-1"><textarea data-day="${r.day}" data-field="${c.k}" rows="${lines}"
                              class="w-full bg-transparent px-1 py-0.5 rounded resize-none leading-tight ${edited} focus:bg-white focus:ring-2 focus:ring-blue-400 outline-none"
                              >${escText}</textarea></td>`;
                }
                return `<td class="border border-slate-200 p-1"><input data-day="${r.day}" data-field="${c.k}" value="${String(v).replace(/"/g, '&quot;')}"
                          class="w-full bg-transparent px-1 py-0.5 rounded ${edited} ${c.num ? 'text-center' : ''} focus:bg-white focus:ring-2 focus:ring-blue-400 outline-none"
                          ${c.num ? 'type="number" min="0" max="9"' : 'type="text"'}></td>`;
            }).join('')}</tr>`).join('')}</tbody>
          </table>`;

        el('reasons').value = state.reasons == null ? state.totals.autoReasons : state.reasons;

        const att = C.attachments(state.rows, state.supReports);
        el('attachments').innerHTML = att.length
            ? `<div class="text-sm"><div class="font-bold mb-1">الزيارات الإشرافية المرفقة (${att.length})</div>
               <ul class="list-disc pr-5 text-slate-600">${att.map(a => `<li>${a.fileName}</li>`).join('')}</ul></div>`
            : `<div class="text-sm text-slate-500">لا زيارات إشرافية «مرفق» هذا الشهر — الحزمة ستحوي التقرير وحده.</div>`;
    }

    // ───────────────────────────── الإخراج
    async function buildDocx() {
        if (!state.template) throw new Error('ارفع نموذج التقرير الشهري (ملف Word) أوّلاً.');
        const zip = await JSZip.loadAsync(state.template);
        const xml = await zip.file('word/document.xml').async('string');
        const res = D.fill(xml, { monthName: C.MONTH_NAMES[state.month0], year: state.year, rows: state.rows,
                                  totals: C.totals(state.rows, state.reasons == null ? undefined : state.reasons) });
        zip.file('word/document.xml', res.xml);
        const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        return { blob, pages: res.pages };
    }

    // تقرير زيارةٍ إشرافيّةٍ محفوظ ← ملف Word، بنفس مُخرَج «تصدير Word» في الموقع
    async function supervisoryDocx(report) {
        const fd = report.formData || {};
        const [imgMinistry, imgQuality, imgVision] = await Promise.all([
            getBase64Image('https://i.imgur.com/TeE90J3.png', 60),
            getBase64Image('https://i.imgur.com/tbfi4V4.png', 60),
            getBase64Image('https://i.imgur.com/AmHGqEM.jpeg', 60)
        ]);
        const scores = {};
        evaluationItems.forEach(item => { scores['item-' + item.id] = fd['score-' + item.id] || '3'; });
        const data = {
            imgMinistry, imgQuality, imgVision,
            school: report.school || fd.school || '', teacher: report.teacherName || fd.teacherName || '',
            subject: fd.subject || '', date: report.visitDate || fd.visitDate || '',
            fileNo: fd.fileNumber || '', visitNo: fd.visitNumber || '', className: fd.class || '',
            lesson: fd.lesson || '', topic: fd.topic || '',
            visitorName: fd.visitorName || '', visitorPosition: fd.visitorPosition || '',
            strengths: (fd.strengthsContent || '').replace(/\n/g, '<br>'),
            needs: (fd.developmentContent || '').replace(/\n/g, '<br>'),
            recs: (fd.recommendationsContent || '').replace(/\n/g, '<br>'),
            scores
        };
        const html = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns='http://www.w3.org/TR/REC-html40' lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير</title></head>
            <body>${getReportHTML(data, true)}</body></html>`;
        return htmlDocx.asBlob(html, { orientation: 'portrait', margins: { top: 720, bottom: 720, left: 720, right: 720 } });
    }

    const download = (blob, name) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    // اسم المجلّد من بادئة المشرف نفسه لا من قيمةٍ ثابتة
    const folderName = () => `${(el('prefix').value || '').trim() || C.firstName(state.me.name)} تقرير ${C.MONTH_NAMES[state.month0]}`;

    async function downloadReport() {
        const { blob, pages } = await buildDocx();
        download(blob, C.safeFileName(folderName() + '.docx'));
        toast(`نزل التقرير — ${pages[0]} صفّاً في الصفحة الأولى و${pages[1] || 0} في الثانية`);
    }

    async function downloadPackage() {
        const { blob } = await buildDocx();
        const root = folderName();
        const zip = new JSZip();
        const dir = zip.folder(root);
        dir.file(C.safeFileName(root + '.docx'), blob);
        const att = C.attachments(state.rows, state.supReports);
        if (att.length) {
            const sub = dir.folder('الزيارات الاشرافية المرفقة');
            for (const a of att) sub.file(a.fileName, await supervisoryDocx(a.report));
        }
        download(await zip.generateAsync({ type: 'blob' }), C.safeFileName(root + '.zip'));
        toast(`نزلت الحزمة — التقرير و${att.length} زيارة مرفقة`);
    }

    // ───────────────────────────── التحميل
    async function prepare() {
        const [y, m] = el('month').value.split('-').map(Number);
        state.year = y; state.month0 = m - 1;
        loadDraft();
        // تقارير الأجهزة الأخرى تنزل أوّلاً — أمّا تأكيدات البوّابة فمحلّيّةٌ لجهاز الرفع
        if (window.SupervisorCloud && SupervisorCloud.isOn()) {
            el('dataState').textContent = 'جارٍ مزامنة التقارير…';
            try { await SupervisorCloud.sync(); } catch (e) {}
        }
        loadLocal(state.year, state.month0, state.me && state.me.name);

        const planId = (el('planId').value || '').trim();
        try { localStorage.setItem(PLAN_ID_KEY(state.me.id), planId); } catch (e) {}
        el('planState').textContent = 'جارٍ جلب الخطة…';
        const p = await fetchPlan(planId, state.year, state.month0);
        state.plan = p.visits; state.events = p.events;
        el('planState').textContent = p.status === 'live' ? `الخطة المعتمدة: ${Object.keys(p.visits).length} يوماً`
            : p.status === 'cache' ? 'تعذّر الاتصال — استُعملت آخر نسخة محفوظة'
            : p.status === 'empty' ? 'لا خطة محفوظة لهذا الشهر في موقع الخطة' : 'تعذّر جلب الخطة: ' + (p.error || '');
        el('dataState').textContent = `${state.schoolReports.length} زيارة مدرسية · ${state.supReports.length} زيارة إشرافية من هذا الجهاز`
            + (state.skipped ? ` · استُبعدت (${state.skipped}) لمشرفٍ آخر` : '');
        el('report').hidden = false;
        recompute();
    }

    // بلا ربط: تُطوى أدوات الصفحة ويُعرض الطريق إلى الربط
    function showLinkNeeded() {
        document.querySelectorAll('main > section').forEach(s => { s.hidden = true; });
        const rep = el('report');
        if (rep) rep.hidden = true;
        const box = document.createElement('section');
        box.className = 'bg-white border border-amber-200 rounded-2xl p-6 shadow-sm text-center space-y-3';
        box.innerHTML = '<div class="text-amber-600 text-3xl"><i class="fa-solid fa-link-slash"></i></div>'
            + '<h2 class="font-bold text-slate-800">التقرير الشهري يحتاج ربط قاعدة بيانات المعلمين</h2>'
            + '<p class="text-sm text-slate-600 leading-7">يُبنى التقرير من خطة السير ومن زياراتك لمعلّميك،'
            + ' ويُكتب باسمك كما هو في القاعدة. اربط رمزك من نظام التقارير ثمّ عُد إلى هنا.</p>'
            + '<a href="reports.html" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-5 py-2.5 text-sm">نظام التقارير</a>';
        document.querySelector('main')?.appendChild(box);
        el('who').textContent = 'غير مرتبط بقاعدة المعلمين';
    }

    async function init() {
        const now = new Date();
        // الافتراض: الشهر الماضي في أوّل خمسة أيّام من الشهر، وإلّا الشهر الجاري
        const d = now.getDate() <= 5 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now;
        el('month').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        // الصفحة للمشرف الذي ربط قاعدته وحده: بلا ربطٍ لا اسم في التقرير ولا
        // معلّمين تُنسب إليهم الزيارات. ومن فتحها برابطٍ مباشر يُقال له السبب
        // بدل أن يجد صفحةً تُخرج تقريراً ناقصاً.
        let me = null;
        try { me = window.SupervisorIdentity && SupervisorIdentity.getIdentity(); } catch (e) {}
        if (!me) { showLinkNeeded(); return; }
        state.me = me;
        el('who').textContent = 'المشرف: ' + me.name;

        // رقم خطة السير من هويّة المشرف لا من قيمةٍ محفوظةٍ في المتصفّح: كان افتراضه
        // (6) للجميع، فأيّ مشرفٍ يفتح الصفحة كان يسحب خطة مشرفٍ آخر ويبني عليها تقريره.
        const num = planNumberFor(me.name);
        const savedId = localStorage.getItem(PLAN_ID_KEY(me.id));
        const savedPrefix = localStorage.getItem(PREFIX_KEY(me.id));
        el('planId').value = num || savedId || '';
        if (num) {
            el('planId').readOnly = true;
            el('planId').classList.add('bg-slate-100', 'text-slate-600');
            el('planId').title = 'رقمك في خطة السير — من هويّتك';
        }
        el('prefix').value = savedPrefix || ((num ? num + '- ' : '') + C.firstName(me.name));

        const saved = await tplGet().catch(() => null);
        if (saved && saved.data) { state.template = saved.data; state.templateName = saved.name; }
        el('tplState').textContent = state.template ? `النموذج المحفوظ: ${state.templateName}` : 'لم يُرفع نموذج بعد';

        el('tplFile').addEventListener('change', async e => {
            const f = e.target.files[0]; if (!f) return;
            const buf = await f.arrayBuffer();
            state.template = buf; state.templateName = f.name;
            await tplPut({ name: f.name, data: buf, at: Date.now() }).catch(() => {});
            el('tplState').textContent = `النموذج المحفوظ: ${f.name}`;
            toast('حُفظ النموذج في هذا المتصفّح');
        });
        el('prepare').addEventListener('click', () => prepare().catch(e => toast(e.message, 'error')));
        el('prefix').addEventListener('change', e => { try { localStorage.setItem(PREFIX_KEY(me.id), e.target.value.trim()); } catch (x) {} });
        el('reset').addEventListener('click', () => { state.overrides = {}; state.reasons = null; recompute(); toast('أُعيدت التعبئة من البيانات'); });
        el('reasons').addEventListener('input', e => { state.reasons = e.target.value; saveDraft(); });
        el('grid').addEventListener('change', e => {
            const t = e.target;
            if (t.dataset && t.dataset.day) setOverride(+t.dataset.day, t.dataset.field, t.value);
        });
        el('dlReport').addEventListener('click', () => downloadReport().catch(e => toast(e.message, 'error')));
        el('dlPackage').addEventListener('click', () => downloadPackage().catch(e => toast(e.message, 'error')));
    }

    window.MonthlyPage = { state, prepare, recompute, buildDocx, supervisoryDocx, loadLocal, fetchPlan };
    document.addEventListener('DOMContentLoaded', init);
})();
