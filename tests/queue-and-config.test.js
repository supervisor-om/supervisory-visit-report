// اختبار انحدار: node tests/queue-and-config.test.js
// يشغّل الشيفرة الحقيقية من الملفّات (لا نسخاً منها) على ثلاثة سيناريوهات:
//   ١) خريطة المعرّفات المخزّنة تُطبَّق كاملةً عند بناء اللوحة
//   ٢) تصديرٌ مفردٌ جديد لا يُستبدَل بطابورٍ عالق
//   ٣) queue-export.js يقرأ التقرير المحفوظ ولا يخمّن تقييماً
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
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
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
        document: { addEventListener: () => {} },
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
    ctx.exportQueueToMoe();

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
})();

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
