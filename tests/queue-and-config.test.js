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
const pending = [];   // الاختبارات غير المتزامنة — الخلاصة تُطبع بعد انتهائها كلّها
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
    check('خاصة: تسعة أهداف', t.objectives.length === 9, t.objectives.length + ' أهداف');
    check('خاصة: ترقيم الأهداف متسلسلٌ بلا فجوة',
          t.objectives.every((o, i) => o.startsWith((i + 1) + '- ')),
          t.objectives.map(o => o.slice(0, 3)).join(' '));
    check('خاصة: الطابور المدرسي بعد المقابلة مباشرةً',
          t.objectives[1].includes('حضور الطابور المدرسي'), t.objectives[1]);

    // كلّ بديلٍ بين قوسين لا بدّ أن يحمل أربع صيغ: ذكر_جمع/ذكر_مفرد/أنثى_جمع/أنثى_مفرد
    const badSlots = [];
    t.objectives.forEach((o, i) => {
        (o.match(/\[([^\]]+)\]/g) || []).forEach(m => {
            if (m.slice(1, -1).split('/').length !== 4) badSlots.push('هدف ' + (i + 1) + ': ' + m);
        });
    });
    check('خاصة: كلّ بديلٍ بأربع صيغ', !badSlots.length, badSlots.join(' | '));

    // المطابقة بالمحتوى لا بالموضع: ترتيب الأهداف قد يتغيّر بإضافةٍ لاحقة
    const pick = (list, k) => list.find(x => x.includes(k)) || '';

    // الوضع ٣ = أنثى مفرد، وهو ما كتبه المستخدم
    const f = t.objectives.map(o => ctx.filter(o, 3));
    check('خاصة: صيغة المؤنّث المفرد كما طُلبت',
          pick(f, 'مقابلة').endsWith('مقابلة الفاضلة مديرة المدرسة ومعلمة الرياضة المدرسية.') &&
          pick(f, 'قاعدة بيانات').endsWith('تحديث قاعدة بيانات المعلمة.') &&
          pick(f, 'موافقات').endsWith('متابعة موافقات التعيين واسم المعلمة وإدراجها في البوابة التعليمية.') &&
          pick(f, 'نصاب').endsWith('متابعة توزيع الجدول ونصاب الحصص للمعلمة.') &&
          pick(f, 'سجلات').endsWith('متابعة المنهاج وسجلات المعلمة.'),
          f.join(' ¦ '));
    const m = t.objectives.map(o => ctx.filter(o, 0));
    check('خاصة: الوضع الذكوريّ الجمع يعمل أيضاً',
          pick(m, 'مقابلة').endsWith('مقابلة الفاضل مدير المدرسة ومعلمي الرياضة المدرسية.') &&
          pick(m, 'قاعدة بيانات').endsWith('تحديث قاعدة بيانات المعلمين.') &&
          pick(m, 'موافقات').endsWith('متابعة موافقات التعيين واسم المعلمين وإدراجهم في البوابة التعليمية.'),
          m.slice(0, 4).join(' ¦ '));
    check('خاصة: لا بديل غير محلول بعد الترشيح', !f.concat(m).some(x => /[\[\]]/.test(x)), 'بقيت أقواس');

    // كان مفتاحاً محذوفاً في نسخةٍ سابقة — لا بدّ أن يخرج من قائمة الحذف
    const rm = sch.slice(sch.indexOf('const removedKeys'), sch.indexOf('\n', sch.indexOf('const removedKeys')));
    check('خاصة: المفتاح لم يعد ضمن المحذوفات', !rm.includes('private_exploratory'), rm.trim());

    // البوّابة: الاسم يحوي «استطلاعية» فيُطابق رقم النوع ٢
    const map = /'gov_exploratory': '2', 'استطلاعية': '2'/.test(exp);
    check('خاصة: يُصدَّر للبوّابة نوعاً استطلاعيّاً (٢)', map && t.name.includes('استطلاعية'), 'المطابقة بالاسم فشلت');
})();

/* ── ٨) رأي الزائر المولَّد: الصياغة كما اعتمدها المستخدم ── */
(function testVisitorOpinion() {
    const tpl = fs.readFileSync(path.join(SITE, 'js/templates.js'), 'utf8');
    const sch = fs.readFileSync(path.join(SITE, 'js/school.js'), 'utf8');
    const ctx = {};
    const s = tpl.indexOf('const defaultSchoolVisitTypesData');
    vm.runInNewContext(tpl.slice(s, tpl.indexOf('\n        };', s) + 11) + '\ntypes = defaultSchoolVisitTypesData;', ctx);
    const grab = (a, b) => sch.slice(sch.indexOf(a), sch.indexOf(b));
    vm.runInNewContext(
        grab('function applyGenderFilter', 'function getGenderMode') +
        grab('function getPositiveAddition', 'function renderSchoolClassroomVisits') +
        grab('function convertObjectiveToPast', 'function wrapNumbersInOpinion') +
        grab('function wrapNumbersInOpinion', 'function generateSchoolSmartVisitorOpinion') +
        '\napi = { f: applyGenderFilter, pos: getPositiveAddition, past: convertObjectiveToPast, wrap: wrapNumbersInOpinion };', ctx);

    // نسخةٌ من حلقة generateSchoolSmartVisitorOpinion (الجزء غير المعتمد على DOM)
    const line = (obj, mode, note) => {
        let text = ctx.api.past(ctx.api.f(obj, mode).trim().replace(/^[\d٠-٩]+\s*[-–]\s*/, ''));
        if (note) {
            const stem = text.endsWith('.') ? text.slice(0, -1) : text;
            const anna = /^(لا|لم|ليس|ما)\s/.test(note) ? 'أنّه' : 'أنّ';
            text = stem + '، وقد لوحظ ' + anna + ' ' + note;
            return text.endsWith('.') ? text : text + '.';
        }
        const base = text.endsWith('.') ? text.slice(0, -1) : text;
        return base + ctx.api.f(ctx.api.pos(base), mode);
    };

    const objs = ctx.types['private_exploratory'].objectives;
    const out = objs.map(o => line(o, 3));
    const pick = k => out.find(l => l.includes(k)) || '';
    const grounds = objs.find(o => o.includes('الملاعب'));

    check('رأي: «تم» لا «تمت» في كلّ البنود',
          out.every(l => l.startsWith('تم ')) && !out.some(l => l.startsWith('تمت')), out[0]);
    check('رأي: البند بلا ملاحظة يأخذ الإضافة الافتراضيّة لا نقطةً وحدها',
          pick('النشرات').includes('وإبداء الملاحظات اللازمة') &&
          pick('سجلات').includes('السجلات منظمة') &&
          pick('الطابور').includes('مراسم رفع العلم'),
          pick('الطابور'));
    check('رأي: «تحديث قاعدة البيانات» لا يُذيَّل بـ«وتحديثها»',
          !pick('قاعدة بيانات').includes('وتحديثها بصورة منتظمة') &&
          pick('قاعدة بيانات').includes('واستُكملت البيانات الناقصة'), pick('قاعدة بيانات'));
    check('رأي: أهداف الخاصة الجديدة لها إضافاتها',
          pick('موافقات').includes('استيفاء الموافقات') && pick('نصاب').includes('مطابقاً للنصاب'),
          pick('موافقات') + ' ¦ ' + pick('نصاب'));

    // الإضافة نفسها قد تحمل بدائل تذكيرٍ وتأنيث، فتتبع وضع النموذج
    const approvals = objs.find(o => o.includes('موافقات'));
    check('رأي: إضافة الموافقات تتبع التذكير والتأنيث',
          line(approvals, 3).endsWith('وتبيّن استيفاء الموافقات واسم المعلمة مدرج بالبوابة.') &&
          line(approvals, 0).endsWith('وتبيّن استيفاء الموافقات وأسماء المعلمين مدرجة بالبوابة.'),
          line(approvals, 3) + ' ¦ ' + line(approvals, 0));
    check('رأي: لا بديل غير محلولٍ في الإضافات',
          !objs.some(o => /[\[\]]/.test(line(o, 3))) && !objs.some(o => /[\[\]]/.test(line(o, 0))),
          'بقيت أقواس');
    check('رأي: لا نقطةَ قبل فاصلة الملاحظة',
          !line(grounds, 3, 'لا توجد أدوات').includes('.،'), line(grounds, 3, 'لا توجد أدوات'));
    check('رأي: النفي يوصل بـ«أنّه» لا «أنّ»',
          line(grounds, 3, 'لا توجد أدوات').includes('لوحظ أنّه لا توجد') &&
          line(grounds, 3, 'الأدوات متوفرة').includes('لوحظ أنّ الأدوات'), line(grounds, 3, 'لا توجد أدوات'));

    // تغليف الأرقام
    const wrapped = ctx.api.wrap('3- تم متابعة الجدول الساعة 7:20 والصف 4/1.\n   • الحصة (2): درس الرياضة – الصف (5/3).');
    check('رأي: ترقيم البنود لا يُغلَّف بأقواس', wrapped.startsWith('3- '), wrapped.split('\n')[0]);
    check('رأي: الوقت يُغلَّف كاملاً', wrapped.includes('(7:20)') && wrapped.includes('(4/1)'), wrapped);
    check('رأي: ما بين قوسين لا يُغلَّف مرّتين', !/\(\(|\)\)/.test(wrapped), wrapped);
    check('رأي: مدى الصفوف داخل القوسين لا يُمزَّق',
          ctx.api.wrap('   ا.غسان (23) حصة ويدرس الصفوف (5-12) ذكور.') ===
          '   ا.غسان (23) حصة ويدرس الصفوف (5-12) ذكور.',
          ctx.api.wrap('   ا.غسان (23) حصة ويدرس الصفوف (5-12) ذكور.'));

    // اسم المعلّم في رأي الزائر: كان محذوفاً، وطلب المشرف إظهاره (2026-09-17)
    check('رأي: سطر الموقف الصفّيّ يحمل اسم المعلّم',
          /function classroomVisitLine/.test(sch) &&
          /\$\{who\}الحصة \(\$\{cv\.period\}\): درس/.test(sch), 'السطر بلا اسم');
    check('رأي: الصفة من جنس المعلّم لا من لقبٍ ثابت',
          !/الأستاذ \$\{cv\.teacher\}/.test(sch) &&
          /g === 'f' \? 'المعلمة ' : g === 'm' \? 'المعلم ' : ''/.test(sch), 'لقبٌ مخمَّن');
})();

/* ── ٩) طاقم المدرسة يُدرَج في رأي الزائر ── */
(function testRoster() {
    const tpl = fs.readFileSync(path.join(SITE, 'js/templates.js'), 'utf8');
    const sch = fs.readFileSync(path.join(SITE, 'js/school.js'), 'utf8');
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const init = fs.readFileSync(path.join(SITE, 'js/init.js'), 'utf8');
    const grab = (a, b) => sch.slice(sch.indexOf(a), sch.indexOf(b));

    function env(teachers, principal, typeName) {
        const ctx = {
            schoolTeachers: teachers,
            schoolPrincipal: principal || { name: '', gender: 'f' },
            schoolVisitTypesData: { k: { name: typeName || 'زيارة استطلاعية (خاصة)' } },
            document: { getElementById: () => null }
        };
        vm.runInNewContext(
            grab('function applyGenderFilter', 'function getGenderMode') +
            grab('function rosterList', 'function addSchoolClassroomVisit') +
            grab('function isExploratoryType', 'function updateRosterVisibility') +
            grab('function withNote', 'function generateSchoolSmartVisitorOpinion') +
            '\napi = { meet: buildMeetSentence, lines: teacherLoadLines, word: teachersWord,' +
            ' names: teacherNames, note: withNote, expl: isExploratoryType };', ctx);
        return ctx.api;
    }

    const meetObj = 'تم مقابلة الفاضلة مديرة المدرسة ومعلمة الرياضة المدرسية.';
    const mixed = [
        { name: 'ا.غسان', gender: 'm', load: '23', grades: '5-12', section: 'ذكور' },
        { name: 'ا.ايمان', gender: 'f', load: '18', grades: '5-12', section: 'إناث' },
        { name: 'ا.شيماء', gender: 'f', load: '23', grades: '1-4', section: '' }
    ];

    let api = env(mixed, { name: 'ا.امل العبري', gender: 'f' });
    check('طاقم: اسم المدير يُدرج بعد «المدرسة»',
          api.meet(meetObj).includes('مديرة المدرسة ا.امل العبري و'), api.meet(meetObj));
    check('طاقم: أسماء المعلمين بين قوسين بعد كلمتهم',
          api.meet(meetObj).endsWith('ومعلمي الرياضة المدرسية (ا.غسان، ا.ايمان، ا.شيماء)'), api.meet(meetObj));
    check('طاقم: طاقمٌ مختلطٌ يجمع بـ«معلمي» لا «معلمة»', api.word() === 'معلمي', api.word());

    check('طاقم: أسطر النصاب بصيغة المستخدم',
          api.lines()[0] === 'ا.غسان (23) حصة ويدرس الصفوف (5-12) ذكور.' &&
          api.lines()[1] === 'ا.ايمان (18) حصة وتدرس الصفوف (5-12) إناث.' &&
          api.lines()[2] === 'ا.شيماء (23) حصة وتدرس الصفوف (1-4).',
          api.lines().join(' ¦ '));

    // مديرةٌ وطاقمٌ مختلط: مفتاحٌ واحدٌ للنصّ لا يكفي، فجنس المدير من بياناته
    const maleMode = 'تم مقابلة الفاضل مدير المدرسة ومعلمي الرياضة المدرسية.';
    check('طاقم: لقب المدير يتبع بياناته لا مفتاح النموذج',
          api.meet(maleMode).startsWith('تم مقابلة الفاضلة مديرة المدرسة ا.امل العبري و') &&
          env(mixed, { name: 'ا.سالم', gender: 'm' }).meet(meetObj)
              .startsWith('تم مقابلة الفاضل مدير المدرسة ا.سالم و'),
          api.meet(maleMode));

    api = env([{ name: 'ا.شيماء', gender: 'f', load: '20', grades: '', section: '' }], { name: '', gender: 'f' });
    check('طاقم: معلمةٌ واحدةٌ تُفرد', api.word() === 'معلمة' &&
          api.meet(meetObj).endsWith('ومعلمة الرياضة المدرسية (ا.شيماء)'), api.meet(meetObj));
    check('طاقم: بلا صفوفٍ لا يُكتب «وتدرس الصفوف ()»',
          api.lines()[0] === 'ا.شيماء (20) حصة.', api.lines()[0]);

    api = env([{ name: 'ا.هدى', gender: 'f' }, { name: 'ا.مريم', gender: 'f' }], { name: 'ا.امل', gender: 'f' });
    check('طاقم: معلمتان فأكثر يُجمعن بـ«معلمات»', api.word() === 'معلمات', api.word());

    // بلا طاقمٍ لا يتغيّر شيء، والملاحظة تُوصل بالجملة المبنيّة
    api = env([], { name: 'ا.امل', gender: 'f' });
    check('طاقم: بلا معلمين يبقى البند كما هو عدا اسم المدير',
          api.meet(meetObj) === 'تم مقابلة الفاضلة مديرة المدرسة ا.امل ومعلمة الرياضة المدرسية', api.meet(meetObj));
    check('طاقم: الملاحظة تُوصل بالجملة لا بالنقطة',
          api.note(api.meet(meetObj), 'الإدارة متعاونة') .endsWith('، وقد لوحظ أنّ الإدارة متعاونة.'),
          api.note(api.meet(meetObj), 'الإدارة متعاونة'));

    // الظهور: الاستطلاعيّة وحدها
    check('طاقم: يظهر للاستطلاعيّة فقط',
          api.expl('k') === true && env([], null, 'زيارة إشرافية').expl('k') === false, 'التمييز فشل');

    // التوصيل
    check('طاقم: القسم في الصفحة مخفيٌّ ابتداءً',
          /id="teachersRosterCard" class="hidden/.test(html), 'غير موجود أو ظاهر');
    check('طاقم: حقول الإدخال موجودة',
          ['stName', 'stGender', 'stLoad', 'stGrades', 'stSection', 'schoolPrincipal', 'addSchoolTeacherBtn']
              .every(id => html.includes('id="' + id + '"')), 'ناقصة');
    check('طاقم: تغيير نوع الزيارة يُظهره أو يُخفيه',
          /visitTypeSel[\s\S]{0,300}updateRosterVisibility/.test(init), 'غير موصول');
    check('طاقم: يُحفظ مع التقرير ويُستدعى باسم المدرسة',
          /teachers: Array\.isArray\(schoolTeachers\)/.test(sch) &&
          /schoolNameInput\.addEventListener\('blur', loadSchoolRosterForSchool\)/.test(init), 'غير موصول');
})();

/* ── ١٠) طابور الزيارات المدرسيّة: من السجل إلى البوّابة ── */
(function testSchoolQueue() {
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const sch  = fs.readFileSync(path.join(SITE, 'js/school.js'), 'utf8');
    const init = fs.readFileSync(path.join(SITE, 'js/init.js'), 'utf8');

    // ── الموقع: queue-export.js ──
    const full = {
        id: 'supervision_v6_school_report_1', schoolName: 'مدرسة النور الخاصة', visitDate: '2026-09-10',
        visitType: 'private_exploratory', arrivalTime: '07:15', departureTime: '11:30',
        objectives: ['1- مقابلة الفاضلة مديرة المدرسة.', '2- حضور الطابور المدرسي.'],
        // موقفٌ صفّيٌّ بالبنية الجديدة: فيه ما جرّته قاعدة المعلمين زيادةً على ما يُرسَل
        classroomVisits: [{ teacher: 'سارة بنت علي الهنائية', grade: '7', period: '3',
                           subject: 'المهارات الحركية', rating: 'ممتاز',
                           teacherName: 'سارة بنت علي الهنائية', teacherFile: '16203690',
                           gender: 'f', teacherSchool: 'مدرسة النور الخاصة' }],
        visitorOpinion: '1- تم مقابلة ...', recommendations: ''
    };
    const older = Object.assign({}, full, { id: 'supervision_v6_school_report_0', schoolName: 'مدرسة الفجر', visitDate: '2026-09-02', visitType: 'supervisory' });
    const empty = Object.assign({}, full, { id: 'supervision_v6_school_report_2', schoolName: 'مدرسة ناقصة', objectives: [], visitorOpinion: '' });

    const ls = new Map([full, older, empty].map(r => [r.id, JSON.stringify(r)]));
    const localStorage = {
        get length() { return ls.size; }, key: i => [...ls.keys()][i],
        getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v))
    };
    const alerts = [], opened = [];
    const ctx = {
        localStorage, console,
        schoolVisitTypesData: {
            private_exploratory: { name: 'زيارة استطلاعية (خاصة)' },
            supervisory: { name: 'زيارة إشرافية' }
        },
        document: { addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
        navigator: { clipboard: { writeText: () => {} } },
        alert: m => alerts.push(m), confirm: m => { alerts.push(m); return true; },
        btoa: s => Buffer.from(s, 'latin1').toString('base64'), unescape, encodeURIComponent
    };
    ctx.window = ctx;
    ctx.window.open = u => { opened.push(u); return {}; };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(QUEUE, 'utf8'), ctx);

    [full.id, older.id, empty.id].forEach(k => ctx.svfSchoolToggleKey(k, true));
    ctx.svfSendSelectedSchool();

    let payload = null;
    const url = opened[0] || '';
    if (url.includes('#svf=')) {
        payload = JSON.parse(decodeURIComponent(escape(Buffer.from(url.split('#svf=')[1], 'base64').toString('latin1'))));
    }
    check('مدرسيّة: تُفتح صفحة الزيارات المدرسيّة لا الإشرافيّة',
          url.startsWith('https://moe.gov.om/SMS/VariousRecords/SchoolVisits/') && !url.includes('#svfs='), url.slice(0, 80));
    check('مدرسيّة: الحمولة طابورٌ من نوع school',
          payload && payload.kind === 'school' && Array.isArray(payload.visits) && payload.visits.length === 2,
          payload ? JSON.stringify({ kind: payload.kind, n: (payload.visits || []).length }) : 'لا حمولة');
    if (payload) {
        const v = payload.visits;
        check('مدرسيّة: الأقدم أوّلاً', v[0].school === 'مدرسة الفجر' && v[1].school === 'مدرسة النور الخاصة',
              v.map(x => x.school).join(' ← '));
        check('مدرسيّة: نوع البوّابة من اسم النوع (استطلاعية ٢، إشرافية ١)',
              v[1].visitType === '2' && v[0].visitType === '1', v.map(x => x.visitType).join('، '));
        check('مدرسيّة: التاريخ بصيغة البوّابة والوقتان من التقرير',
              v[1].date === '10/09/2026' && v[1].arrivalTime === '07:15' && v[1].departureTime === '11:30',
              [v[1].date, v[1].arrivalTime, v[1].departureTime].join(' / '));
        check('مدرسيّة: الأهداف بلا ترقيم', v[1].objectives[0] === 'مقابلة الفاضلة مديرة المدرسة.', v[1].objectives[0]);
        const cv = (v[1].classroomVisits || [])[0] || {};
        check('مدرسيّة: الموقف الصفّيّ يصل بحقوله الخمسة',
              cv.teacher === 'سارة بنت علي الهنائية' && cv.grade === '7' && cv.period === '3' &&
              cv.subject === 'المهارات الحركية' && cv.rating === 'ممتاز', JSON.stringify(cv));
        check('مدرسيّة: ولا يُرسَل رقم الملف ولا الجنس إلى البوّابة',
              Object.keys(cv).length === 5 && !('teacherFile' in cv) && !('gender' in cv), Object.keys(cv).join(','));
    }
    check('مدرسيّة: الناقصة تُستبعد مع ذكر السبب',
          alerts.some(m => m.includes('مدرسة ناقصة') && m.includes('أهداف الزيارة') && m.includes('رأي الزائر')),
          alerts.join(' ¦ ').replace(/\n+/g, ' ¦ '));
    check('مدرسيّة: المرفوع يُوسم والناقص يبقى محدَّداً',
          ctx.svfSchoolIsQueued(full.id) && !ctx.svfSchoolIsQueued(empty.id) &&
          ctx.svfSchoolSelected.has(empty.id) && !ctx.svfSchoolSelected.has(full.id), 'خطأ في الوسم أو التحديد');
    check('مدرسيّة: تحديدها مستقلٌّ عن تحديد الإشرافيّة', ctx.svfSelected.size === 0, 'اختلط التحديدان');

    // ── الواجهة ──
    check('مدرسيّة: شريط التحديد في سجل التقارير المدرسيّة',
          ['selectAllSchoolReportsBtn', 'clearSchoolSelectionBtn', 'schoolSelectionCount', 'sendSelectedSchoolToMoeBtn']
              .every(id => html.includes('id="' + id + '"')), 'ناقص');
    check('مدرسيّة: مربّع اختيارٍ على كلّ بطاقة', /class="queue-pick-school[^"]*"[^>]*data-key="\$\{report\.key\}"/.test(sch), 'غير موجود');
    check('مدرسيّة: الأزرار والمربّعات موصولة',
          /queue-pick-school[\s\S]{0,150}svfSchoolToggleKey/.test(init) &&
          /sendSelectedSchoolToMoeBtn[\s\S]{0,200}svfSendSelectedSchool/.test(init), 'غير موصولة');
    check('مدرسيّة: وقتا الوصول والانصراف يُحفظان في التقرير',
          /arrivalTime: document\.getElementById\('schoolArrivalTime'\)/.test(sch), 'لا يُحفظان');

    // ── السكربت: تحميل الطابور ──
    const load = between('        let visitData = null;', '        function schoolQueueInfo()');
    function runLoad(hashObj, store) {
        const c = {
            DATA_KEY: 'svf_school_visit_data',
            location: { hash: hashObj ? '#svf=' + Buffer.from(JSON.stringify(hashObj)).toString('base64') : '', pathname: '/x', search: '' },
            history: { replaceState: () => {} },
            localStorage: { getItem: () => null },
            b64Decode: s => Buffer.from(s, 'base64').toString('utf8'),
            GM_getValue: (k, d) => (k in store ? store[k] : d),
            GM_setValue: (k, v) => { store[k] = v; },
            GM_deleteValue: k => { delete store[k]; },
            out: null
        };
        vm.runInNewContext('{\n' + load + '\nout = visitData;\n}', c);
        return c.out;
    }
    let st = {};
    let got = runLoad({ kind: 'school', visits: [{ school: 'أ' }, { school: 'ب' }] }, st);
    check('سكربت: طابورٌ مدرسيٌّ يبدأ بأوّل زيارة', got && got.school === 'أ' && Number(st.svf_school_queue_i) === 0,
          'المحمَّل ' + (got && got.school));
    st = { svf_school_queue: JSON.stringify([{ school: 'قديم' }]), svf_school_queue_i: 0 };
    got = runLoad({ school: 'جديد', date: '01/09/2026' }, st);
    check('سكربت: تصديرٌ مفردٌ جديد يمسح طابوراً عالقاً',
          got && got.school === 'جديد' && !('svf_school_queue' in st), 'المحمَّل ' + (got && got.school));

    // ── السكربت: البوّابة والتقدّم ──
    const gate = between('        function schoolQueueInfo()', '        // ─── أنماط لوحة التحكم ───');
    function runGate(opts) {
        const store = Object.assign({ svf_school_queue: JSON.stringify([{ school: 'أ' }, { school: 'ب' }, { school: 'ج' }]) }, opts.store);
        const logs = [], runs = [];
        const c = {
            SQ_KEY: 'svf_school_queue', SQ_I: 'svf_school_queue_i', SQ_HOLD: 'svf_school_hold',
            visitData: null, autoSaveOn: () => opts.autoSave,
            GM_getValue: (k, d) => (k in store ? store[k] : d),
            GM_setValue: (k, v) => { store[k] = v; }, GM_deleteValue: k => { delete store[k]; },
            log: m => logs.push(m), setStatus: () => {},
            confirm: () => opts.userSaysSaved,
            sessionStorage: { removeItem: () => {} },
            setTimeout: fn => fn(), runAutoFull: d => runs.push(d && d.school),
            DATA_KEY: 'svf_school_visit_data', refreshDataBox: () => {},
            svfRecordSavedSchool: v => { store.__recorded = (store.__recorded || []).concat(v.school); return true; },
            out: null
        };
        vm.runInNewContext(gate + '\nout = schoolQueueGate();', c);
        return { out: c.out, store, logs, runs };
    }
    let g = runGate({ autoSave: false, store: { svf_school_queue_i: 0 } });
    check('سكربت: الطابور المدرسيّ بلا حفظٍ تلقائيٍّ يمنع التعبئة',
          g.out === false && g.logs.some(l => l.includes('الحفظ التلقائي فقط')), g.logs.join(' | '));
    g = runGate({ autoSave: true, userSaysSaved: true, store: { svf_school_queue_i: 1, svf_school_hold: 1 } });
    check('سكربت: زيارةٌ حُفظت يدوياً تُتخطّى وتبدأ التالية',
          g.out === false && Number(g.store.svf_school_queue_i) === 2 && g.runs[0] === 'ج', 'المؤشّر ' + g.store.svf_school_queue_i + ' / شُغّل ' + g.runs);
    g = runGate({ autoSave: true, userSaysSaved: false, store: { svf_school_queue_i: 1, svf_school_hold: 1 } });
    check('سكربت: زيارةٌ لم تُحفظ تُعاد في مكانها',
          g.out === true && Number(g.store.svf_school_queue_i) === 1 && !('svf_school_hold' in g.store), 'المؤشّر ' + g.store.svf_school_queue_i);
    g = runGate({ autoSave: true, userSaysSaved: true, store: { svf_school_queue_i: 2, svf_school_hold: 2 } });
    check('سكربت: آخر زيارةٍ تُنهي الطابور وتمسحه',
          !('svf_school_queue' in g.store) && g.runs.length === 0 && g.logs.some(l => l.includes('اكتمل الطابور')), g.logs.join(' | '));

    // بعد التقدّم تصير الزيارة التالية هي بيانات التصدير، فتبقى إن أُعيد تحميل الصفحة
    g = runGate({ autoSave: true, userSaysSaved: true, store: { svf_school_queue_i: 0, svf_school_hold: 0 } });
    check('سكربت: الزيارة التالية تُحفظ بيانات تصديرٍ حاليّة',
          JSON.parse(g.store.svf_school_visit_data || '{}').school === 'ب', g.store.svf_school_visit_data);

    // ── العطل الذي أوقف الطابور: أزرار اللوحة كانت تحمل الزيارة الأولى ──
    check('سكربت: أزرار التشغيل تقرأ الزيارة الجارية لا بيانات بناء اللوحة',
          /svf-btn-auto-v7'\)\?\.addEventListener\('click', \(\) => runAutoFull\(visitData\)\)/.test(src) &&
          /svf-btn-fill-v7'\)\?\.addEventListener\('click', \(\) => runFillOnly\(visitData\)\)/.test(src) &&
          !/runAutoFull\(data\)\)/.test(src), 'ما زالت تحمل data');
    check('سكربت: بطاقة البيانات تُحدَّث عند الانتقال', /refreshDataBox\(\);[\s\S]{0,200}▶ الزيارة/.test(src), 'لا تُحدَّث');

    // ── تصنيف رسائل البوّابة بعد الحفظ ──
    const cls = between('        const SAVE_FAIL_RE', '        async function waitForSaveOutcome');
    const cctx = {};
    vm.runInNewContext(cls + '\nout = classifyPortalMessages;', cctx);
    const C = cctx.out;
    check('حفظ: «تم الحفظ بنجاح» نجاحٌ لا رفض',
          C(['تم الحفظ بنجاح']).ok.length === 1 && C(['تم الحفظ بنجاح']).fail.length === 0);
    check('حفظ: «تمت الإضافة بنجاح» نجاح', C(['تمت الإضافة بنجاح']).ok.length === 1);
    check('حفظ: «لم يتم الحفظ» رفضٌ رغم احتوائها «تم الحفظ»',
          C(['لم يتم الحفظ']).fail.length === 1 && C(['لم يتم الحفظ']).ok.length === 0);
    check('حفظ: «يجب ادخال ...» رفض', C(['يجب ادخال وقت الوصول']).fail.length === 1);
    check('حفظ: نصٌّ مجهولٌ لا يُفترض نجاحاً', C(['رقم 15']).fail.length === 1 && C(['رقم 15']).ok.length === 0);
    check('حفظ: نجاحٌ مع خطأٍ آخر يبقى رفضاً',
          (r => r.ok.length === 1 && r.fail.length === 1)(C(['تم الحفظ بنجاح', 'خطأ في التاريخ'])) &&
          /c\.ok\.length && !c\.fail\.length/.test(src), 'منطق الجمع');

    // ── السجلّ الحقيقيّ: «123» ظهر بعد الحفظ ثمّ أُعيدت الصفحة ──
    const saveCode = between('        const SAVE_FAIL_RE', '        async function waitForSaveOutcome');
    function saveEnv(o) {
        const ss = Object.assign({}, o.ss);
        const logs = [], calls = [];
        const labels = o.labels || [];
        const c = {
            location: { pathname: o.path || '/SMS/VariousRecords/SchoolVisits/SchoolVisitsMain.aspx' },
            sessionStorage: { getItem: k => (k in ss ? ss[k] : null), setItem: (k, v) => { ss[k] = v; }, removeItem: k => { delete ss[k]; } },
            Date: { now: () => o.now || 100000 },
            document: {},
            visitData: o.visit === undefined ? { school: 'م١', date: '14/09/2026' } : o.visit,
            portalErrors: () => labels,
            findFormDocument: () => (o.formOpen ? {} : null),
            findSchoolDropdown: () => (o.onList === false ? null : {}),
            findAddButton: () => null,
            log: (m, t) => logs.push((t || '') + ':' + m), setStatus: () => {},
            clearExportData: () => calls.push('clear'),
            svfRecordSavedSchool: v => { calls.push('record:' + v.school); return true; },
            schoolQueueInfo: () => (o.queue ? { i: 0, total: 2 } : null),
            schoolQueueAdvance: () => calls.push('advance'),
            api: null
        };
        vm.runInNewContext(saveCode + '\napi = { fresh: freshPortalMessages, resolve: resolvePendingSaveAfterReload, mark: markSavePending };', c);
        return { api: c.api, ss, logs, calls };
    }
    const pendingOf = (extra) => JSON.stringify(Object.assign(
        { ts: 90000, path: '/SMS/VariousRecords/SchoolVisits/SchoolVisitsMain.aspx', school: 'م١', date: '14/09/2026' }, extra));

    let s = saveEnv({});
    check('حفظ: رقمٌ مجرّد («123») لا يُعدّ رسالة رفض', s.api.fresh({}, []).length === 0 &&
          saveEnv({ labels: ['123'] }).api.fresh({}, []).length === 0, 'عُدّ رسالة');
    check('حفظ: رسالةٌ كانت قبل الضغط لا تُحسب نتيجة',
          saveEnv({ labels: ['يجب ادخال التاريخ'] }).api.fresh({}, ['يجب ادخال التاريخ']).length === 0 &&
          saveEnv({ labels: ['يجب ادخال التاريخ'] }).api.fresh({}, []).length === 1, 'الأساس لا يُستثنى');

    s = saveEnv({ queue: true, ss: { svf_save_pending: pendingOf(), svf_pilot_phase: 'after_show' } });
    check('حفظ: عودةٌ إلى القائمة بعد ضغط الحفظ تُحسم حفظاً',
          s.api.resolve() === true && s.calls.includes('record:م١') && s.calls.includes('clear'), s.logs.join(' | '));
    check('حفظ: وتنقل الطابور إلى التالية وتمسح العلامة والمرحلة',
          s.calls.includes('advance') && !('svf_save_pending' in s.ss) && !('svf_pilot_phase' in s.ss), JSON.stringify(s.ss));

    s = saveEnv({ ss: { svf_save_pending: pendingOf() } });
    check('حفظ: بلا طابورٍ تُعلَّم الجولة مكتملة', s.api.resolve() === true && s.ss.svf_pilot_done === '1' && !s.calls.includes('advance'));

    s = saveEnv({ queue: true, formOpen: true, ss: { svf_save_pending: pendingOf() } });
    check('حفظ: النموذج ما زال مفتوحاً ← لا حكم بالحفظ', s.api.resolve() === false && !s.calls.includes('advance'), s.logs.join(' | '));
    s = saveEnv({ queue: true, now: 90000 + 61000, ss: { svf_save_pending: pendingOf() } });
    check('حفظ: علامةٌ أقدم من دقيقة ← لا حكم', s.api.resolve() === false && !s.calls.includes('record:م١'));
    s = saveEnv({ queue: true, path: '/Portal/Services/UserLoginnew.aspx', ss: { svf_save_pending: pendingOf() } });
    check('حفظ: انتهاء الجلسة إلى صفحة الدخول ← لا حكم', s.api.resolve() === false && !s.calls.includes('advance'));
    s = saveEnv({ queue: true, visit: { school: 'م٢', date: '15/09/2026' }, ss: { svf_save_pending: pendingOf() } });
    check('حفظ: علامةٌ لزيارةٍ أخرى ← لا حكم', s.api.resolve() === false && !s.calls.includes('advance'));
    s = saveEnv({ queue: true, labels: ['لم يتم الحفظ'], ss: { svf_save_pending: pendingOf() } });
    check('حفظ: عودةٌ مع رسالة رفض ← لا حكم', s.api.resolve() === false && !s.calls.includes('advance'), s.logs.join(' | '));
    s = saveEnv({ queue: true, ss: {} });
    check('حفظ: تحميلٌ عاديٌّ بلا علامة لا يتأثّر', s.api.resolve() === false && s.calls.length === 0);

    check('حفظ: العلامة تُكتب قبل الضغط وتُمسح بعد الحكم في الصفحة نفسها',
          /markSavePending\(data\);[\s\S]{0,120}saveBtn\.click\(\);[\s\S]{0,120}waitForSaveOutcome\(25000, baseline\);\s*clearSavePending\(\);/.test(src),
          'الترتيب خاطئ');
    check('حفظ: الحسم أوّل ما يجري عند التحميل قبل استئناف الطيّار',
          /if \(resolvePendingSaveAfterReload\(\)\) return;[\s\S]{0,200}const phase = sessionStorage\.getItem\('svf_pilot_phase'\)/.test(src),
          'غير موصول');

    // ── تأكيد المستخدم يُسجّل الزيارة محفوظة ──
    g = runGate({ autoSave: true, userSaysSaved: true, store: { svf_school_queue_i: 0, svf_school_hold: 0 } });
    check('سكربت: «موافق» على «هل هي محفوظة؟» يضع وسم «حُفظت»', (g.store.__recorded || [])[0] === 'أ', JSON.stringify(g.store.__recorded));

    // ── السجلّ يبقى بعد إعادة التحميل، وله زرّ نسخ ──
    check('سكربت: السجلّ يُحفظ في الجلسة ويُستعاد', /sessionStorage\.setItem\(LOG_STORE/.test(src) && /restoreLog\(\);/.test(src), 'لا يُحفظ');
    check('سكربت: زرّ «نسخ السجل» في لوحة المدرسيّة', /id="svf-btn-copy-v7"/.test(src) && /svf-btn-copy-v7'\)\?\.addEventListener/.test(src), 'غير موجود');

    // ── التوصيل في السكربت ──
    check('سكربت: البوّابة أوّل ما في التشغيل الكامل والتعبئة',
          /async function runAutoFull\(data\) \{\s*if \(autoRunning\) return;\s*if \(!schoolQueueGate\(\)\) return;/.test(src) &&
          /async function runFillOnly\(data\) \{\s*if \(filling\) return;\s*if \(!schoolQueueGate\(\)\) return;/.test(src), 'غير موصولة');
    check('سكربت: الحفظ المؤكَّد يسجّل ويتقدّم',
          /if \(saved\) \{[\s\S]{0,250}svfRecordSavedSchool\(data\)[\s\S]{0,120}advanceAfter = true/.test(src) &&
          /finally \{[\s\S]{0,250}if \(advanceAfter\) schoolQueueAdvance\(\);/.test(src), 'غير موصول');
})();

/* ── ١١) البحث عن المدرسة عبر أنظمة التعليم ── */
pending.push((function testEduSystemSearch() {
    const code = between('        function normEdu(v)', '        // للتوافق مع ما يستدعيها في مواضع أخرى');

    // بوّابةٌ مصغّرة: تغيير نظام التعليم يُبدّل قائمة المدارس
    const SYSTEMS = ['عام', 'أساسي', 'تربية خاصة بصري', 'ثنائي اللغة', 'دولي', 'ثنائي اللغة خاص'];
    const SCHOOLS = {
        'عام':               ['مدرسة النور للتعليم الأساسي', 'المدارس الأهلية', 'مدرسة الرواد (5-12)'],
        'أساسي':             ['مدرسة الفجر للتعليم الأساسي', 'مدرسة السلام (1-4)', 'مدرسة السلام (5-10)',
                               'مدرسة 18 نوفمبر'],
        'تربية خاصة بصري':   ['معهد عمر بن الخطاب للمكفوفين'],
        'ثنائي اللغة':        ['مدرسة الإبداع ثنائية اللغة', 'الشموخ الدولية الخاصة', 'الأجيال العصرية الدولية الخاصة',
                               'الأجيال الخاصة'],
        'دولي':               ['المدارس المتحدة الدولية الخاصة - مسقط', 'مدرسة النور للبنات', 'مدرسة النور للبنين'],
        'ثنائي اللغة خاص':    ['مدرسة الريادة الخاصة']
    };
    function portal(startSystem) {
        const opt = (text, value) => ({ text, value });
        const school = { id: 'ctl00_content_SchoolFilterCtrl1_ddlSchools', options: [], value: '', selectedIndex: 0,
                         dispatchEvent: () => {} };
        const edu = { id: 'ddlX', options: [opt('', '')].concat(SYSTEMS.map((s, i) => opt(s, String(i + 1)))),
                      value: '', selectedIndex: 0, switches: [] };
        const fill = () => {
            const sys = (edu.options.find(o => o.value === edu.value) || {}).text;
            school.options = [opt('اختر المدرسة', '')].concat((SCHOOLS[sys] || []).map((t, i) => opt(t, sys + i)));
        };
        edu.dispatchEvent = () => { edu.selectedIndex = edu.options.findIndex(o => o.value === edu.value); edu.switches.push(edu.options[edu.selectedIndex].text); fill(); };
        edu.value = String(SYSTEMS.indexOf(startSystem) + 1); edu.dispatchEvent(); edu.switches.length = 0;
        return { school, edu };
    }

    function env(p, gm, ss) {
        let clock = 0;
        const logs = [], chosen = [];
        const ctx = {
            Date: { now: () => clock },
            Event: function (type) { this.type = type; },
            wait: ms => { clock += ms; return Promise.resolve(); },
            $: () => null, $$: () => [p.school, p.edu],
            findSchoolDropdown: () => p.school,
            selectSchoolOption: (dd, o) => chosen.push(o.text),
            log: m => logs.push(m), updateStep: () => {},
            GM_getValue: (k, d) => (k in gm ? gm[k] : d), GM_setValue: (k, v) => { gm[k] = v; },
            sessionStorage: { getItem: k => (k in ss ? ss[k] : null), setItem: (k, v) => { ss[k] = v; }, removeItem: k => { delete ss[k]; } },
            api: null
        };
        vm.runInNewContext(code + '\napi = { find: findAndSelectSchool, match: matchSchool, sw: switchEduSystem, eduDD: findEduSystemDropdown };', ctx);
        return { api: ctx.api, logs, chosen };
    }

    return (async () => {
        // (أ) مدرسةٌ دوليّة والبوّابة على «عام» — الحالة التي أبلغ عنها المستخدم
        let p = portal('عام'), gm = {}, ss = {};
        let e = env(p, gm, ss);
        let r = await e.api.find({ school: 'المدارس المتحدة الدولية' });
        check('نظام: تُوجد المدرسة الدوليّة بتغيير النظام إلى «دولي»',
              r.found && e.chosen[0] === 'المدارس المتحدة الدولية الخاصة - مسقط' && r.system === 'دولي',
              JSON.stringify(r) + ' | ' + e.chosen.join());
        check('نظام: اسمٌ فيه «الدولية» يجرّب «دولي» أوّلاً', p.edu.switches[0] === 'دولي', p.edu.switches.join(' ← '));
        check('نظام: لا تُختار «المدارس الأهلية» بمطابقة الكلمة الأولى',
              !e.chosen.includes('المدارس الأهلية'), e.chosen.join());
        check('نظام: يُحفظ نظام المدرسة للمرّة القادمة',
              JSON.parse(gm.svf_school_edu_map || '{}')['المدارس المتحده الدوليه'] === 'دولي', gm.svf_school_edu_map);
        check('نظام: حالة البحث تُمسح بعد الإيجاد', !('svf_edu_search' in ss), ss.svf_edu_search);

        // (ب) المرّة القادمة: الذاكرة تذهب إليه مباشرةً
        p = portal('عام'); e = env(p, gm, {});
        r = await e.api.find({ school: 'المدارس المتحدة الدولية' });
        check('نظام: الذاكرة تفتح النظام الصحيح من أوّل تحويل', r.found && p.edu.switches.length === 1, p.edu.switches.join(' ← '));

        // (ج) بلا إيحاءٍ في الاسم: يُمسح كلّ نظامٍ حتّى يُوجد
        p = portal('عام'); e = env(p, {}, {});
        r = await e.api.find({ school: 'مدرسة الريادة الخاصة' });
        check('نظام: مدرسةٌ في «ثنائي اللغة خاص» تُوجد', r.found && e.chosen[0] === 'مدرسة الريادة الخاصة', JSON.stringify(r));
        check('نظام: «خاصة» في الاسم تجرّب أنظمة الخاصّ قبل العامّة',
              p.edu.switches.indexOf('ثنائي اللغة خاص') < 2, p.edu.switches.join(' ← '));
        check('نظام: لا يُجرَّب نظامٌ مرّتين', new Set(p.edu.switches).size === p.edu.switches.length, p.edu.switches.join(' ← '));

        // (د) «خاص» لا تُطابق «تربية خاصة بصري» — العطل القديم
        p = portal('عام'); e = env(p, {}, {});
        check('نظام: المطابقة تامّة — «خاص» لا تحوّل إلى «تربية خاصة بصري»',
              e.api.sw('خاص') === false && p.edu.switches.length === 0, p.edu.switches.join());

        // (هـ) تعدّد المطابقات: لا يُختار ولا يُغيَّر النظام عبثاً
        p = portal('دولي'); e = env(p, {}, {});
        r = await e.api.find({ school: 'مدرسة النور' });
        check('نظام: اسمٌ يطابق مدرستين لا يُختار منه',
              !r.found && e.chosen.length === 0 && /أكثر من مدرسة/.test(r.error), JSON.stringify(r));
        check('نظام: وعند التعدّد لا يُغيَّر النظام', p.edu.switches.length === 0, p.edu.switches.join());

        // (و) غير موجودةٍ أبداً: يُجرِّب الكلّ ثمّ يتوقّف بلا اختيار
        p = portal('عام'); ss = {}; e = env(p, {}, ss);
        r = await e.api.find({ school: 'مدرسة لا وجود لها' });
        check('نظام: مدرسةٌ غير موجودة لا يُختار لها شيء', !r.found && e.chosen.length === 0, JSON.stringify(r));
        check('نظام: جُرِّبت كلّ الأنظمة ثمّ مُسحت الحالة',
              p.edu.switches.length === SYSTEMS.length - 1 && !('svf_edu_search' in ss), p.edu.switches.join(' ← '));

        // (ز) إعادة تحميلٍ كاملةٍ في منتصف البحث: يُكمل ولا يعيد ما جُرِّب
        p = portal('دولي');   // الصفحة أُعيدت والنظام الذي حُوِّل إليه قبلها هو «دولي»
        ss = { svf_edu_search: JSON.stringify({ school: 'مدرسه الريادة الخاصه'.replace('الريادة', 'الرياده'),
                                                 tried: ['عام', 'دولي'] }) };
        e = env(p, {}, ss);
        r = await e.api.find({ school: 'مدرسة الريادة الخاصة' });
        check('نظام: الاستئناف بعد إعادة التحميل لا يُكرّر «عام» ولا «دولي»',
              r.found && p.edu.switches.indexOf('عام') === -1 && p.edu.switches.indexOf('دولي') === -1,
              p.edu.switches.join(' ← '));

        // (ط) نطاق الصفوف في اسم الموقع والبوّابة لا تكتبه — البلاغ: «الأجيال العصرية الدولية (1-12)»
        //     وفي البوّابة «الأجيال العصرية الدولية الخاصة» تحت «ثنائي اللغة». كان «12» يُعدّ كلمةً
        //     مميِّزةً لا بدّ أن تحملها البوّابة، فلم تُطابق في أيّ نظام.
        p = portal('عام'); e = env(p, {}, {});
        r = await e.api.find({ school: 'الأجيال العصرية الدولية (1-12)' });
        check('نطاق: مدرسةٌ باسمها ونطاق صفوفها تُوجد وإن خلت منه البوّابة',
              r.found && e.chosen[0] === 'الأجيال العصرية الدولية الخاصة' && r.system === 'ثنائي اللغة',
              JSON.stringify(r) + ' | ' + e.logs.slice(-2).join(' / '));
        check('نطاق: ولا تُختار «الأجيال الخاصة» لكلمةٍ مشتركة', !e.chosen.includes('الأجيال الخاصة'), e.chosen.join());

        // النطاق لا يُشترط، لكنّه يُفرِّق: مدرستان تختلفان به وحده
        p = portal('أساسي'); e = env(p, {}, {});
        r = await e.api.find({ school: 'السلام للتعليم الأساسي (5-10)' });
        check('نطاق: يختار المدرسة التي نطاقها نطاقُ الموقع', r.found && e.chosen[0] === 'مدرسة السلام (5-10)', JSON.stringify(r));

        // ومدرسةٌ في البوّابة بنطاقٍ آخر ليست هي
        p = portal('أساسي'); e = env(p, {}, {});
        const m = e.api.match(p.school, 'السلام الأساسي (11-12)');
        check('نطاق: نطاقٌ مخالفٌ في البوّابة لا يُطابَق', !m.option && m.ambiguous.length === 0, JSON.stringify(m));

        // والأرقام التي هي جزءٌ من الاسم تبقى تُطابِق
        check('نطاق: رقمٌ من الاسم نفسه («18 نوفمبر») لا يُسقطه النطاق',
              (e.api.match(p.school, 'مدرسة 18 نوفمبر الأساسية (1-4)').option || {}).text === 'مدرسة 18 نوفمبر',
              JSON.stringify(e.api.match(p.school, 'مدرسة 18 نوفمبر الأساسية (1-4)')));

        // وبلا نطاقٍ في الموقع يبقى التعدّد تعدّداً
        const amb = e.api.match(p.school, 'السلام');
        check('نطاق: «السلام» بلا نطاق تبقى ملتبسةً بين مدرستين', !amb.option && amb.ambiguous.length === 2, JSON.stringify(amb));

        // (ح) قائمة المدارس لا تُحسب قائمة أنظمة لأنّ أسماءها فيها «الأساسي»
        p = portal('عام'); e = env(p, {}, {});
        check('نظام: قائمة الأنظمة تُعرف بخياراتها لا بكلمةٍ في أسماء المدارس', e.api.eduDD() === p.edu, 'اختلطت القائمتان');
    })();
})());

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
        vm.runInNewContext('{\n' + code + '\nout = { rec: svfRecordSaved, recSchool: svfRecordSavedSchool, sync: svfSyncSaved, list: svfSavedList };\n}', ctx);
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

    // الزيارات المدرسيّة: سجلٌّ منفصلٌ بمفتاح المدرسة والتاريخ
    e = env(undefined, undefined);
    check('loop: الزيارة المدرسيّة تُسجَّل بمفتاح المدرسة',
          e.api.recSchool({ school: 'مدرسة النور', date: '10/09/2026' }) === true &&
          e.api.recSchool({ school: '', date: '10/09/2026' }) === false);
    check('loop: الضخّ يملأ سجلّ المدرسيّة دون أن يمسّ الإشرافيّة',
          e.api.sync() === 1 && JSON.parse(e.site.svf_sent_school_visits)[0] === 'مدرسة النور|10/09/2026' &&
          !('svf_sent_visits' in e.site), JSON.stringify(e.site));

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
pending.push((function testQueueGate() {
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
            svfRecordSaved: () => true,
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
    })();
})());

/* ── ١٢) اسم المعلّم بين قاعدة المعلمين والبوّابة: «بن» لا تُفشل المطابقة ── */
(function testTeacherNameMatching() {
    const code = between('        function normAr(v) {', '        let sup = null;');
    const ctx = {};
    vm.runInNewContext(code + '\nout = { normName, searchTerms };', ctx);
    const { normName, searchTerms } = ctx.out;

    check('name: «بن» تُسقط فتتطابق الصيغتان',
          normName('هاشم بن راشد بن سيف الهاشمي') === normName('هاشم راشد سيف الهاشمي'),
          normName('هاشم بن راشد بن سيف الهاشمي'));
    check('name: «بنت» تُسقط كذلك',
          normName('مريم بنت سالم الحارثية') === normName('مريم سالم الحارثية'));
    check('name: الهمزات والتاء المربوطة تُسوّى',
          normName('آمنة أحمد') === normName('امنه احمد'), normName('آمنة أحمد'));
    check('name: اسمٌ فيه «بنان» لا يُمسّ — الإسقاط للكلمة وحدها',
          normName('بنان خالد') === 'بنان خالد', normName('بنان خالد'));

    const terms = searchTerms('هاشم بن راشد بن سيف الهاشمي');
    check('search: تبدأ الصيغ بالاسم بلا «بن»', terms[0] === 'هاشم راشد سيف الهاشمي', terms[0]);
    check('search: وفيها الاسم كما كُتب', terms.includes('هاشم بن راشد بن سيف الهاشمي'), terms.join(' | '));
    check('search: ثمّ الأوّل والأخير ثمّ الأوّل',
          terms.includes('هاشم الهاشمي') && terms[terms.length - 1] === 'هاشم', terms.join(' | '));
    check('search: بلا تكرار', new Set(terms).size === terms.length, terms.join(' | '));
    check('search: اسمٌ بلا «بن» لا يُكرَّر بصيغتين متطابقتين',
          searchTerms('سالم المعمري')[0] === 'سالم المعمري' && searchTerms('سالم المعمري').length === 2,
          JSON.stringify(searchTerms('سالم المعمري')));

    // التوصيل: البحث يُعاد بالصيغ، والمطابقة بـ normName لا normAr
    check('search: supPickTeacher يمرّ على الصيغ واحدةً بعد أخرى',
          /async function supPickTeacher\(\)[\s\S]{0,700}searchTerms\(sup\.teacher\)[\s\S]{0,400}for \(let i[\s\S]{0,300}supRunSearch\(terms\[i\]\)[\s\S]{0,200}supAwaitTeacherRow\(want/.test(src),
          'الترتيب غير موصول');
    check('search: اختيار الصفّ يطابق الاسم كاملاً لا الصيغة المختصرة',
          /async function supAwaitTeacherRow\(want, ms\)[\s\S]{0,1800}txt\.includes\(want\)/.test(src),
          'المطابقة غير كاملة');
    check('search: خانة المختار تُقارن بـ normName',
          !/normAr\(lbl\.textContent/.test(src), 'ما زالت normAr');
})();

Promise.all(pending).then(() => {
    console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
    process.exit(failures ? 1 : 0);
}, err => {
    console.log('FAIL استثناءٌ في اختبارٍ غير متزامن: ' + (err && err.stack || err));
    process.exit(1);
});
