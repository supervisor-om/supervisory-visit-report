// اختبار انحدار: node tests/queue-and-config.test.js
// يشغّل الشيفرة الحقيقية من الملفّات (لا نسخاً منها) على أربعة سيناريوهات:
//   ١) خريطة المعرّفات المخزّنة تُطبَّق كاملةً عند بناء اللوحة
//   ٢) تصديرٌ مفردٌ جديد لا يُستبدَل بطابورٍ عالق
//   ٣) queue-export.js يقرأ التقرير المحفوظ ولا يخمّن تقييماً
//   ٤) بوّابة الطابور تمنع تكرار السجلّ الرسميّ
// يعتمد على علاماتٍ نصّيّةٍ في السكربت؛ إن تغيّرت فشل الاختبار برسالة marker not found.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const [, , USER = path.join(ROOT, 'school-visits-automation.user.js'),
             QUEUE = path.join(ROOT, 'js/queue-export.js'),
             SEL = path.join(ROOT, 'selectors.json'),
             SITE = ROOT] = process.argv;
const src = fs.readFileSync(USER, 'utf8').replace(/\r\n/g, '\n');
const selectors = fs.readFileSync(SEL, 'utf8');
let failures = 0;
// التفصيل يُطبع عند الفشل فقط: نصّه مكتوبٌ لشرح الفشل، وطبعُه مع PASS يُقرأ خطأً
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const between = (a, b) => {
    const i = src.indexOf(a); const j = src.indexOf(b, i);
    if (i < 0 || j < 0) throw new Error('marker not found: ' + a + ' / ' + b);
    return src.slice(i, j);
};

/* ── ١) خريطة المعرّفات من النسخة المخزّنة: هل تُطبَّق كاملةً؟ ── */
(function testConfig() {
    const supBlock = src.indexOf('const SUP_KEY = \'svf_supervision_visit_data\';', src.indexOf('جزء 3'));
    const callAt = src.indexOf('document.body.appendChild(panel);\n        loadConfig();', supBlock);
    const scoreAt = src.indexOf('const SCORE_TEXT', supBlock);
    const logs = [];
    let code =
        between('const CFG_URL', '        const STAGE1_KEYMAP') +
        between('const EMP_SEARCH =', '// للتوافق مع ما يقرؤها');
    if (scoreAt > callAt) {
        code += '\nloadConfig();\n' + src.slice(scoreAt, src.indexOf('\n', scoreAt));
    } else {
        code += '\nloadConfig();\n';
    }
    code += '\nresult = { score0: SCORE_TEXT["0"], empty: SVF_EMPTY, date: STAGE1_FIELDS["التاريخ"].slice() };';
    const ctx = {
        slog: (m, t) => logs.push(t + ': ' + m),
        GM_getValue: (k, d) => k === 'svf_cfg' ? selectors : k === 'svf_cfg_ts' ? Date.now() : d,
        GM_setValue: () => {}, GM_xmlhttpRequest: () => {}, result: null
    };
    // تغليفٌ في كتلةٍ واحدة كما في السكربت (كتلة if في جزء 3)
    vm.runInNewContext('{\n' + code + '\n}', ctx);
    const sel = JSON.parse(selectors);
    check('config: scoreText من الخريطة المخزّنة مطبَّق', ctx.result.score0 === sel.scoreText['0'],
          'SCORE_TEXT["0"] = ' + JSON.stringify(ctx.result.score0));
    check('config: سجلّ «مطبَّقة» ظهر', logs.some(l => l.includes('مطبَّقة')), logs.join(' | ') || 'لا سجلّ');
    console.log('      (SCORE_TEXT مُعلَن ' + (scoreAt > callAt ? 'بعد' : 'قبل') + ' استدعاء loadConfig)');
})();

/* ── ٢) طابورٌ قديمٌ عالق + تصديرٌ مفردٌ جديد ── */
(function testStaleQueue() {
    const iife = between('let sup = null;\n        (function () {', '        function queueInfo()');
    const store = {
        svf_queue: JSON.stringify([{ teacher: 'قديم أ' }, { teacher: 'قديم ب' }]),
        svf_queue_i: 1
    };
    const fresh = { kind: 'supervision', teacher: 'جديد ج', date: '13/09/2026' };
    const ctx = {
        SUP_KEY: 'svf_supervision_visit_data',
        location: { hash: '#svfs=' + Buffer.from(JSON.stringify(fresh)).toString('base64'), pathname: '/x', search: '' },
        history: { replaceState: () => {} },
        localStorage: { getItem: () => null },
        b64Decode: s => Buffer.from(s, 'base64').toString('utf8'),
        GM_getValue: (k, d) => (k in store ? store[k] : d),
        GM_setValue: (k, v) => { store[k] = v; },
        GM_deleteValue: k => { delete store[k]; },
        out: null
    };
    vm.runInNewContext('{\n' + iife + '\nout = sup;\n}', ctx);
    check('queue: التصدير المفرد الجديد لا يُستبدَل بطابورٍ عالق', ctx.out && ctx.out.teacher === 'جديد ج',
          'المعلّم المحمَّل = ' + (ctx.out && ctx.out.teacher));
    check('queue: الطابور العالق مُسح', !('svf_queue' in store), 'svf_queue ' + ('svf_queue' in store ? 'باقٍ' : 'ممسوح'));

    // وتصدير طابورٍ جديدٍ ما زال يعمل
    const store2 = {};
    const qp = { kind: 'supervision', visits: [{ teacher: 'ط١' }, { teacher: 'ط٢' }] };
    const ctx2 = Object.assign({}, ctx, {
        location: { hash: '#svfs=' + Buffer.from(JSON.stringify(qp)).toString('base64'), pathname: '/x', search: '' },
        GM_getValue: (k, d) => (k in store2 ? store2[k] : d),
        GM_setValue: (k, v) => { store2[k] = v; },
        GM_deleteValue: k => { delete store2[k]; }, out: null
    });
    vm.runInNewContext('{\n' + iife + '\nout = sup;\n}', ctx2);
    check('queue: تصدير طابورٍ يبدأ بأوّل زيارة', ctx2.out && ctx2.out.teacher === 'ط١', 'المحمَّل = ' + (ctx2.out && ctx2.out.teacher));
})();

/* ── ٣) queue-export.js على تقريرٍ محفوظٍ بالبنية الحقيقيّة للموقع ── */
(function testQueueExport() {
    const tpl = fs.readFileSync(path.join(SITE, 'js/templates.js'), 'utf8');
    const itemsSrc = tpl.slice(tpl.indexOf('const evaluationItems'), tpl.indexOf('];', tpl.indexOf('const evaluationItems')) + 2);

    // بنية savePermanentReport في js/supervisory.js
    const scores = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3];
    const formData = {
        school: 'مدرسة الاختبار', teacherName: 'معلّم تجريبي', fileNumber: '77', subject: 'الرياضة المدرسية',
        visitDate: '2026-09-10', visitNumber: '2', class: '7/1', lesson: '3', topic: 'مهارة التمرير',
        strengthsContent: 'تميّز أ', developmentContent: '', recommendationsContent: 'دعم ج'
    };
    scores.forEach((s, i) => { formData['score-' + (i + 1)] = String(s); formData['notes-' + (i + 1)] = 'وصف ' + (i + 1); });
    const report = { id: 'supervision_v6_visit_1', teacherName: 'معلّم تجريبي', visitDate: '2026-09-10', school: 'مدرسة الاختبار', formData };

    // تقريرٌ ثانٍ ينقصه تقييم بندٍ — يجب أن يُستبعد لا أن يُخمَّن
    const fd2 = Object.assign({}, formData, { teacherName: 'معلّم ناقص' });
    delete fd2['score-5'];
    const report2 = { id: 'supervision_v6_visit_2', teacherName: 'معلّم ناقص', visitDate: '2026-09-11', school: 'س', formData: fd2 };

    const ls = new Map([[report.id, JSON.stringify(report)], [report2.id, JSON.stringify(report2)], ['other', 'x']]);
    const localStorage = {
        get length() { return ls.size; }, key: i => [...ls.keys()][i],
        getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v))
    };
    const alerts = [], opened = [];
    const ctx = {
        localStorage, console,
        document: { addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
        navigator: { clipboard: { writeText: () => {} } },
        alert: m => alerts.push(m), confirm: m => { alerts.push(m); return true; },
        btoa: s => Buffer.from(s, 'latin1').toString('base64'),
        unescape, encodeURIComponent,
        postMessage: () => {}
    };
    ctx.window = ctx;
    ctx.window.open = u => { opened.push(u); return {}; };
    vm.createContext(ctx);
    vm.runInContext(itemsSrc, ctx);                               // كما يُحمَّل templates.js قبله
    vm.runInContext(fs.readFileSync(QUEUE, 'utf8'), ctx);

    // المستخدم يحدّد التقريرين في الأرشيف ثمّ يضغط «رفع المحدد»
    ctx.svfToggleKey(report.id, true);
    ctx.svfToggleKey(report2.id, true);
    ctx.svfSendSelected();

    let payload = null;
    if (opened.length) {
        const b64 = opened[0].split('#svfs=')[1];
        payload = JSON.parse(decodeURIComponent(escape(Buffer.from(b64, 'base64').toString('latin1'))));
    }
    const v = payload && payload.visits.find(x => x.teacher === 'معلّم تجريبي');
    check('queue-export: التقرير الكامل يُرسَل', !!v, v ? '' : 'الرسالة: ' + (alerts[0] || '').replace(/\n+/g, ' ¦ '));
    if (v) {
        check('queue-export: التقييمات من التقرير لا افتراضيّة', JSON.stringify(v.ratings) === JSON.stringify(scores), JSON.stringify(v.ratings));
        check('queue-export: عنوان الدرس والحصّة والمادّة', v.lessonTitle === 'مهارة التمرير' && v.period === '3' && v.subject === 'الرياضة المدرسية',
              [v.lessonTitle, v.period, v.subject].join(' / '));
        check('queue-export: الإجادة/التطوير/الدعم', v.excellence === 'تميّز أ' && v.development === '' && v.recommendations === 'دعم ج',
              [v.excellence, v.development, v.recommendations].map(JSON.stringify).join(' / '));
        check('queue-export: أوصاف البنود', v.notes && v.notes['1'] === 'وصف 1' && Object.keys(v.notes).length === 13, Object.keys(v.notes || {}).length + ' وصفاً');
        check('queue-export: التاريخ بصيغة البوّابة', v.date === '10/09/2026', v.date);
    }
    const guessed = payload && payload.visits.find(x => x.teacher === 'معلّم ناقص');
    check('queue-export: تقريرٌ ينقصه تقييمٌ لا يُرسَل بتقييمٍ مخمَّن', !guessed,
          guessed ? 'أُرسل بتقييمات ' + JSON.stringify(guessed.ratings) : 'مُستبعد');
    check('queue-export: يذكر للمستخدم سببَ الاستبعاد',
          alerts.some(m => m.includes('معلّم ناقص') && m.includes('تقييم البند 5')),
          alerts.join(' ¦ ').replace(/\n+/g, ' ¦ '));
    check('queue-export: الحمولة طابورٌ لا زيارةً مفردة',
          payload && payload.kind === 'supervision' && Array.isArray(payload.visits) && payload.visits.length === 1,
          payload ? JSON.stringify(Object.keys(payload)) : 'لا حمولة');

    // «سبق رفعها» يُعلَّم للمرفوع فقط، والتحديد يُفرَّغ بعد الرفع
    check('queue-export: المرفوع يُعلَّم في الأرشيف',
          ctx.svfIsQueued(report.id) && !ctx.svfIsQueued(report2.id),
          'الكامل ' + ctx.svfIsQueued(report.id) + ' / الناقص ' + ctx.svfIsQueued(report2.id));
    check('queue-export: الناقص يبقى محدَّداً ليُصلَح', ctx.svfSelected.has(report2.id) && !ctx.svfSelected.has(report.id),
          [...ctx.svfSelected].join('، ') || 'فارغ');

    // لا رفعَ بلا تحديد
    const before = opened.length;
    ctx.svfClearSelection();
    ctx.svfSendSelected();
    check('queue-export: لا يفتح البوّابة بلا تحديد', opened.length === before, 'فُتحت ' + (opened.length - before) + ' مرّة');
})();

/* ── ٥) توصيل الواجهة: مربّع اختيارٍ لكلّ بطاقة، وزرٌّ يرفع المحدَّد ── */
(function testArchiveWiring() {
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const exp  = fs.readFileSync(path.join(SITE, 'js/export.js'), 'utf8');
    const init = fs.readFileSync(path.join(SITE, 'js/init.js'), 'utf8');

    check('واجهة: queue-export.js محمَّلٌ في الصفحة', /<script src="js\/queue-export\.js">/.test(html), 'غير محمَّل');
    check('واجهة: زرّ الرفع موجودٌ في الأرشيف', /id="sendSelectedToMoeBtn"/.test(html), 'غير موجود');
    check('واجهة: أزرار التحديد موجودة',
          /id="selectAllReportsBtn"/.test(html) && /id="clearSelectionBtn"/.test(html) && /id="selectionCount"/.test(html), 'ناقصة');
    check('واجهة: البطاقة تحمل مربّع اختيارٍ بمفتاح التقرير',
          /class="queue-pick[^"]*"[^>]*data-key="\$\{key\}"/.test(exp), 'غير موجود في renderSavedReports');
    check('واجهة: تغيّر المربّع موصولٌ بالتحديد', /queue-pick[\s\S]{0,120}svfToggleKey/.test(init), 'غير موصول');
    check('واجهة: الأزرار الثلاثة موصولة',
          /sendSelectedToMoeBtn[\s\S]{0,200}svfSendSelected/.test(init) &&
          /selectAllReportsBtn[\s\S]{0,200}svfSelectAllVisible/.test(init) &&
          /clearSelectionBtn[\s\S]{0,200}svfClearSelection/.test(init), 'ناقصة');
})();

/* ── ٧) أنواع الزيارات المدرسية: الاستطلاعية للمدارس الخاصة ── */
(function testPrivateExploratory() {
    const tpl = fs.readFileSync(path.join(SITE, 'js/templates.js'), 'utf8');
    const sch = fs.readFileSync(path.join(SITE, 'js/school.js'), 'utf8');
    const exp = fs.readFileSync(path.join(SITE, 'js/export.js'), 'utf8');

    const start = tpl.indexOf('const defaultSchoolVisitTypesData');
    const end   = tpl.indexOf('\n        };', start);
    const ctx = {};
    vm.runInNewContext(tpl.slice(start, end + 11) + '\nout = defaultSchoolVisitTypesData;', ctx);
    const gf = sch.slice(sch.indexOf('function applyGenderFilter'), sch.indexOf('function getGenderMode'));
    vm.runInNewContext(gf + '\nfilter = applyGenderFilter;', ctx);

    const t = ctx.out['private_exploratory'];
    check('خاصة: النوع موجودٌ بين الافتراضيّات', !!t, 'غير موجود');
    if (!t) return;
    check('خاصة: الاسم يميّزه عن الحكوميّة', t.name === 'زيارة استطلاعية (خاصة)', t.name);
    check('خاصة: ثمانية أهداف', t.objectives.length === 8, t.objectives.length + ' أهداف');

    // كلّ بديلٍ بين قوسين لا بدّ أن يحمل أربع صيغ: ذكر_جمع/ذكر_مفرد/أنثى_جمع/أنثى_مفرد
    const badSlots = [];
    t.objectives.forEach((o, i) => {
        (o.match(/\[([^\]]+)\]/g) || []).forEach(m => {
            if (m.slice(1, -1).split('/').length !== 4) badSlots.push('هدف ' + (i + 1) + ': ' + m);
        });
    });
    check('خاصة: كلّ بديلٍ بأربع صيغ', !badSlots.length, badSlots.join(' | '));

    // الوضع ٣ = أنثى مفرد، وهو ما كتبه المستخدم
    const f = t.objectives.map(o => ctx.filter(o, 3));
    check('خاصة: صيغة المؤنّث المفرد كما طُلبت',
          f[0] === '1- مقابلة الفاضلة مديرة المدرسة ومعلمة الرياضة المدرسية.' &&
          f[1] === '2- تحديث قاعدة بيانات المعلمة.' &&
          f[2] === '3- متابعة موافقات التعيين واسم المعلمة وإدراجها في البوابة التعليمية.' &&
          f[4] === '5- متابعة توزيع الجدول ونصاب الحصص للمعلمة.' &&
          f[7] === '8- متابعة المنهاج وسجلات المعلمة.',
          f.join(' ¦ '));
    const m = t.objectives.map(o => ctx.filter(o, 0));
    check('خاصة: الوضع الذكوريّ الجمع يعمل أيضاً',
          m[0] === '1- مقابلة الفاضل مدير المدرسة ومعلمي الرياضة المدرسية.' &&
          m[1] === '2- تحديث قاعدة بيانات المعلمين.' &&
          m[2] === '3- متابعة موافقات التعيين واسم المعلمين وإدراجهم في البوابة التعليمية.',
          m.slice(0, 3).join(' ¦ '));
    check('خاصة: لا بديل غير محلول بعد الترشيح', !f.concat(m).some(x => /[\[\]]/.test(x)), 'بقيت أقواس');

    // كان مفتاحاً محذوفاً في نسخةٍ سابقة — لا بدّ أن يخرج من قائمة الحذف
    const rm = sch.slice(sch.indexOf('const removedKeys'), sch.indexOf('\n', sch.indexOf('const removedKeys')));
    check('خاصة: المفتاح لم يعد ضمن المحذوفات', !rm.includes('private_exploratory'), rm.trim());

    // البوّابة: الاسم يحوي «استطلاعية» فيُطابق رقم النوع ٢
    const map = /'gov_exploratory': '2', 'استطلاعية': '2'/.test(exp);
    check('خاصة: يُصدَّر للبوّابة نوعاً استطلاعيّاً (٢)', map && t.name.includes('استطلاعية'), 'المطابقة بالاسم فشلت');
})();

/* ── ٦) إغلاق الحلقة: ما حُفظ في البوّابة يعود إلى سجلّ الموقع ── */
(function testSavedLoop() {
    const code = between('    const SAVED_KEY =', '    // ═══════════════════════════════════════════════════════════════\n    //  جزء 1');
    const init = fs.readFileSync(path.join(SITE, 'js/init.js'), 'utf8');

    function env(gmRaw, siteRaw) {
        const gm = { svf_saved_visits: gmRaw };
        const site = siteRaw === undefined ? {} : { svf_sent_visits: siteRaw };
        const ctx = {
            GM_getValue: (k, d) => (k in gm ? gm[k] : d),
            GM_setValue: (k, v) => { gm[k] = v; },
            localStorage: {
                getItem: k => (k in site ? site[k] : null),
                setItem: (k, v) => { site[k] = String(v); }
            },
            out: null, added: null
        };
        vm.runInNewContext('{\n' + code + '\nout = { rec: svfRecordSaved, sync: svfSyncSaved, list: svfSavedList };\n}', ctx);
        return { gm, site, api: ctx.out };
    }

    // البوّابة تحفظ زيارةً: تُسجَّل في تخزين تامبر مانكي
    let e = env(undefined, undefined);
    check('loop: الحفظ المؤكَّد يُسجَّل', e.api.rec({ teacher: 'سالم', date: '10/09/2026' }) === true);
    check('loop: لا تكرار للزيارة نفسها', e.api.rec({ teacher: 'سالم', date: '10/09/2026' }) === false);
    check('loop: زيارةٌ بلا اسمٍ أو تاريخٍ لا تُسجَّل', e.api.rec({ teacher: '', date: '10/09/2026' }) === false);

    // وعند فتح الموقع تُضخّ في سجلّه
    check('loop: الضخّ يضيف الجديد إلى سجلّ الموقع', e.api.sync() === 1, 'أعادت ' + e.api.sync());
    check('loop: السجلّ في الموقع يحمل المفتاح الصحيح',
          JSON.parse(e.site.svf_sent_visits)[0] === 'سالم|10/09/2026', e.site.svf_sent_visits);
    check('loop: الضخّ مرّةً ثانيةً لا يضيف شيئاً', e.api.sync() === 0);

    // الدمج لا يمسح ما في الموقع أصلاً ولا يكرّره
    e = env(JSON.stringify(['أ|01/09/2026', 'ب|02/09/2026']), JSON.stringify(['ب|02/09/2026', 'ج|03/09/2026']));
    check('loop: الدمج يضيف الناقص فقط', e.api.sync() === 1);
    const merged = JSON.parse(e.site.svf_sent_visits);
    check('loop: لا فقدانَ ولا تكرارَ بعد الدمج',
          merged.length === 3 && new Set(merged).size === 3 && merged.includes('ج|03/09/2026'),
          e.site.svf_sent_visits);

    // سجلٌّ تالفٌ في أيّ طرفٍ لا يُسقط العمليّة
    e = env('{ليس مصفوفة}', 'تالف');
    check('loop: سجلٌّ تالفٌ لا يرمي استثناءً', e.api.sync() === 0);

    // التوصيل في الطرفين
    check('loop: الحفظ المؤكَّد يستدعي التسجيل',
          /حُفظت الزيارة في بوّابة الوزارة[\s\S]{0,300}svfRecordSaved\(sup\)/.test(src), 'غير موصول');
    check('loop: الموقع يضخّ عند الفتح وعند العودة للتبويب',
          /addEventListener\('focus'[\s\S]{0,80}syncSavedIntoSite/.test(src) &&
          /readyState === 'loading'[\s\S]{0,200}syncSavedIntoSite\(\)/.test(src), 'غير موصول');
    check('loop: الأرشيف يُعاد رسمه عند العودة للتبويب',
          /addEventListener\('focus'[\s\S]{0,300}renderSavedReports/.test(init), 'غير موصول');
})();

/* ── ٤) بوّابة الطابور: لا تعبئةَ بلا حفظٍ تلقائيّ، ولا تكرارَ سجلٍّ رسميّ ── */
(function testQueueGate() {
    const code = between('        function queueInfo()', '        function findFlex');

    // بيئةٌ واحدةٌ لكلّ سيناريو: طابورٌ من ثلاث زيارات
    function env(opts) {
        const store = Object.assign({
            svf_queue: JSON.stringify([{ teacher: 'أ' }, { teacher: 'ب' }, { teacher: 'ج' }])
        }, opts.store);
        const logs = [];
        const ctx = {
            sup: null, autoSaveOn: () => opts.autoSave,
            GM_getValue: (k, d) => (k in store ? store[k] : d),
            GM_setValue: (k, v) => { store[k] = v; },
            GM_deleteValue: k => { delete store[k]; },
            slog: (m, t) => logs.push((t || '') + ': ' + m),
            sstat: () => {},
            confirm: () => opts.userSaysSaved,
            wait: () => Promise.resolve(),
            supAddBtn: () => ({ click: () => {} }),
            waitForSupForm: () => Promise.resolve(true),
            supStage1: () => Promise.resolve(),
            out: null
        };
        vm.runInNewContext(code + '\nqueueGate().then(r => { out = r; });', ctx);
        return { store, logs, ctx, done: new Promise(r => setImmediate(() => setImmediate(() => r())))};
    }

    return (async () => {
        // أ) الحفظ التلقائيّ مُطفأ — تُمنع التعبئة
        let e = env({ autoSave: false, store: { svf_queue_i: 0 } });
        await e.done;
        check('gate: الطابور بلا حفظٍ تلقائيّ يمنع التعبئة', e.ctx.out === false, 'أعادت ' + e.ctx.out);
        check('gate: يشرح السبب للمستخدم', e.logs.some(l => l.includes('الحفظ التلقائي فقط')), e.logs.join(' | ') || 'لا سجلّ');
        check('gate: لا يتقدّم المؤشّر عند المنع', Number(e.store.svf_queue_i) === 0, 'المؤشّر ' + e.store.svf_queue_i);

        // ب) الحفظ مُشغَّل وزيارةٌ لم تبلغ التقييم — تمرّ
        e = env({ autoSave: true, store: { svf_queue_i: 0 } });
        await e.done;
        check('gate: المسار الطبيعيّ يمرّ', e.ctx.out === true, 'أعادت ' + e.ctx.out);

        // ج) زيارةٌ معلّقةٌ والمستخدم يؤكّد حفظها يدوياً — تُتخطّى ولا تُعبَّأ ثانيةً
        e = env({ autoSave: true, userSaysSaved: true, store: { svf_queue_i: 1, svf_queue_hold: 1 } });
        await e.done;
        check('gate: زيارةٌ حُفظت يدوياً لا تُعبَّأ مرّةً ثانية', e.ctx.out === false, 'أعادت ' + e.ctx.out);
        check('gate: المؤشّر تقدّم إلى التالية', Number(e.store.svf_queue_i) === 2, 'المؤشّر ' + e.store.svf_queue_i);
        check('gate: العلامة مُسحت بعد التقدّم', !('svf_queue_hold' in e.store), 'باقية');

        // د) زيارةٌ معلّقةٌ والمستخدم يقول لم تُحفظ — تُعاد تعبئتها في مكانها
        e = env({ autoSave: true, userSaysSaved: false, store: { svf_queue_i: 1, svf_queue_hold: 1 } });
        await e.done;
        check('gate: زيارةٌ لم تُحفظ تُعاد تعبئتها', e.ctx.out === true, 'أعادت ' + e.ctx.out);
        check('gate: المؤشّر لم يتقدّم', Number(e.store.svf_queue_i) === 1, 'المؤشّر ' + e.store.svf_queue_i);
        check('gate: العلامة مُسحت قبل الإعادة', !('svf_queue_hold' in e.store), 'باقية');

        // هـ) التوصيل: البوّابة أوّل ما في supFill، والعلامة تُوضع ببلوغ التقييم
        check('gate: queueGate أوّل ما يُنفَّذ في supFill',
              /async function supFill\(\)\s*\{\s*if \(!await queueGate\(\)\) return;/.test(src), 'غير موصولة');
        check('gate: العلامة تُوضع عند بلوغ صفحة التقييم',
              /async function supStage2\(\)[\s\S]{0,600}GM_setValue\('svf_queue_hold'/.test(src), 'لا تُوضع');

        console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
        process.exit(failures ? 1 : 0);
    })();
})();
