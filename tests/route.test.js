// اختبار انحدار: node tests/route.test.js
// خطّ سير اليوم: «#قادم من مدرسة …» و«#متجه إلى مدرسة …» أسفل الأهداف.
//   ١) الصياغة: البادئة، نطاق الصفوف، الجهات التي ليست مدارس، الفراغ
//   ٢) الحفاظ على الأهداف الحقيقيّة: السطر ليس هدفاً ولا يتكرّر
//   ٣) تطابق نسخة السكربت مع نسخة الموقع على المدخلات نفسها
//   ٤) الطابور: الأسطر تصل بعد الأهداف، ولا تُعوِّض غيابها
//   ٥) التوصيل: الحفظ والاستعادة والمعاينة والتصدير والنسخ وعامل الخدمة
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'js/route.js'));

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const J = JSON.stringify;

/* ── ١) الصياغة ── */
{
    const cases = [
        ['الشيخ زايد',                         'مدرسة الشيخ زايد'],
        ['مدرسة الأمل',                        'مدرسة الأمل'],                 // لا «مدرسة مدرسة»
        ['  مدرسة    الأمل  ',                 'مدرسة الأمل'],                 // المسافات
        ['الأجيال العصرية الدولية (1-12)',      'مدرسة الأجيال العصرية الدولية'], // نطاق الصفوف ليس من الاسم
        ['الأجيال العصرية الدولية (١-١٢)',      'مدرسة الأجيال العصرية الدولية'], // بأرقامٍ هنديّة
        ['مدرسة الأجيال (5 – 12)',              'مدرسة الأجيال'],
        ['إدارة التربية والتعليم',              'إدارة التربية والتعليم'],       // مقصدٌ ليس مدرسة
        ['مركز مصادر التعلم',                   'مركز مصادر التعلم'],
        ['مدرسة',                              'مدرسة'],
        ['',                                   ''],
        [undefined,                            ''],
        [null,                                 ''],
        ['   ',                                ''],
    ];
    cases.forEach(([inp, want]) => check('routeName: ' + J(inp) + ' ← ' + J(want), R.routeName(inp) === want, J(R.routeName(inp))));

    check('bareName: يُبقي الاسم بلا البادئة ولا نطاق الصفوف',
          R.bareName('الأجيال العصرية (1-12)') === 'الأجيال العصرية' && R.bareName('مدرسة الأمل') === 'مدرسة الأمل');

    check('routeLines: الاثنان — قادم من ثمّ متجه إلى',
          J(R.routeLines('أ', 'ب')) === J(['#قادم من مدرسة أ', '#متجه إلى مدرسة ب']), J(R.routeLines('أ', 'ب')));
    check('routeLines: «قادم من» وحده', J(R.routeLines('أ', '')) === J(['#قادم من مدرسة أ']));
    check('routeLines: «متجه إلى» وحده', J(R.routeLines('', 'ب')) === J(['#متجه إلى مدرسة ب']));
    check('routeLines: لا شيء ← لا أسطر', R.routeLines('', '').length === 0 && R.routeLines(undefined, null).length === 0);
    check('routeLines: الصياغة حرفيّاً كما يكتبها المشرف',
          R.routeLines('كذا', 'كذا وكذا')[0] === '#قادم من مدرسة كذا' && R.routeLines('كذا', 'كذا وكذا')[1] === '#متجه إلى مدرسة كذا وكذا');
}

/* ── ٢) الأهداف الحقيقيّة لا تُمسّ ── */
{
    const objs = ['1- تفعيل حصة التربية البدنية', 'متابعة الخطة الفصلية'];
    const withR = R.withRoute(objs, 'أ', 'ب');
    check('withRoute: الأهداف أوّلاً وخطّ السير بعدها', withR.length === 4 && withR[0] === objs[0] && withR[1] === objs[1]
          && withR[2].startsWith('#قادم') && withR[3].startsWith('#متجه'), J(withR));
    check('withRoute: لا يتكرّر لو كان في المصفوفة سلفاً', J(R.withRoute(withR, 'أ', 'ب')) === J(withR), J(R.withRoute(withR, 'أ', 'ب')));
    check('withRoute: بلا خطّ سير ← الأهداف كما هي', J(R.withRoute(objs, '', '')) === J(objs));
    check('withRoute: مصفوفةٌ فاسدة لا تُسقط', R.withRoute(undefined, 'أ', '').length === 1);
    check('isRouteLine / realObjectives', R.isRouteLine('#قادم من مدرسة أ') && !R.isRouteLine('هدفٌ عاديّ')
          && J(R.realObjectives(withR)) === J(objs));
}

/* ── ٣) نسخة السكربت = نسخة الموقع ── */
{
    const us = fs.readFileSync(path.join(ROOT, 'tools/daf51553aa5f5d6215/school-visits-automation.user.js'), 'utf8').replace(/\r\n/g, '\n');
    const a = us.indexOf('function svfRouteName'), b = us.indexOf("const TYPE_LABELS");
    check('السكربت: يحمل نسخته من الصياغة', a > 0 && b > a);
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(us.slice(a, b) + '\nthis.n = svfRouteName; this.l = svfRouteLines;', ctx);
    const samples = ['الشيخ زايد', 'مدرسة الأمل', '  مدرسة    الأمل  ', 'الأجيال العصرية الدولية (1-12)', 'الأجيال (١-١٢)',
                     'إدارة التربية', 'مركز مصادر', 'مدرسة', '', undefined, null, '   ', 'كذا وكذا', 'روضة النور', 'معهد العلوم'];
    const mism = [];
    samples.forEach(x => { if (ctx.n(x) !== R.routeName(x)) mism.push(J(x) + ': ' + J(ctx.n(x)) + ' ≠ ' + J(R.routeName(x))); });
    samples.forEach(x => samples.forEach(y => { if (J(ctx.l(x, y)) !== J(R.routeLines(x, y))) mism.push('lines ' + J(x) + ',' + J(y)); }));
    check('السكربت: routeName/routeLines تطابق الموقع على ' + samples.length + '×' + samples.length + ' مدخلاً', mism.length === 0, mism.slice(0, 3).join(' | '));
    check('السكربت: الإصدار 15.2 فأعلى', /@version\s+15\.(?:[2-9]|\d{2,})/.test(us) || /@version\s+1[6-9]\./.test(us), (us.match(/@version\s+(\S+)/) || [])[1]);
    check('السكربت: يقرأ الخانتين ويُلحق الأسطر بالأهداف',
          us.includes("svfRouteLines($('#schoolCameFrom')?.value, $('#schoolGoingTo')?.value)") && us.includes('realObjectives.concat(routeLines)'));
}

/* ── ٤) الطابور المدرسيّ ── */
{
    const school = (extra) => Object.assign({
        id: 'supervision_v6_school_report_1', schoolName: 'الأجيال العصرية الدولية (1-12)', visitDate: '2026-09-10',
        visitType: 'supervisory', objectives: ['1- الهدف الأوّل', '2- الهدف الثاني'],
        visitorOpinion: 'رأي', recommendations: 'توصية', arrivalTime: '08:00', departureTime: '12:00'
    }, extra || {});
    const rep = {
        a: school({ cameFrom: 'الشيخ زايد', goingTo: 'الأمل' }),
        b: school({ id: 'supervision_v6_school_report_2' }),                                        // بلا خطّ سير
        c: school({ id: 'supervision_v6_school_report_3', objectives: [], cameFrom: 'الشيخ زايد' }), // خطّ سيرٍ بلا أهداف
        d: school({ id: 'supervision_v6_school_report_4', cameFrom: 'الشيخ زايد', goingTo: '' }),
    };
    const ls = new Map(Object.values(rep).map(r => [r.id, J(r)]));
    const localStorage = { get length() { return ls.size; }, key: i => [...ls.keys()][i],
        getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) };
    const ctx = { localStorage, console, document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
        navigator: { clipboard: { writeText() {} } }, alert() {}, confirm: () => true, unescape, encodeURIComponent,
        btoa: s => Buffer.from(s, 'latin1').toString('base64'), postMessage() {} };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/route.js'), 'utf8'), ctx);         // كما يُحمَّل قبل queue-export
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/queue-export.js'), 'utf8'), ctx);

    const built = ctx.svfBuildSchoolFromKeys(Object.values(rep).map(r => r.id));
    const byKey = k => (built.ready.find(x => x.key === k) || {}).visit;
    const va = byKey(rep.a.id);
    // الأهداف تُرقَّم تسلسليّاً ١، ٢، … (كترقيم رأي الزائر) قبل إلحاق خطّ السير غير المرقَّم
    check('الطابور: الأهداف مرقَّمةٌ تسلسليّاً ثمّ خطّ السير في المصفوفة المرسَلة',
          va && J(va.objectives) === J(['1- الهدف الأوّل', '2- الهدف الثاني', '#قادم من مدرسة الشيخ زايد', '#متجه إلى مدرسة الأمل']), va && J(va.objectives));
    check('الطابور: بلا خطّ سير ← الأهداف مرقَّمةً وحدها', J((byKey(rep.b.id) || {}).objectives) === J(['1- الهدف الأوّل', '2- الهدف الثاني']), J((byKey(rep.b.id) || {}).objectives));
    check('الطابور: «قادم من» وحده', J((byKey(rep.d.id) || {}).objectives) === J(['1- الهدف الأوّل', '2- الهدف الثاني', '#قادم من مدرسة الشيخ زايد']));
    const cBroken = built.broken.find(x => x.key === rep.c.id);
    check('الطابور: خطّ السير لا يُعوِّض غياب الأهداف (يبقى ناقصاً)', !byKey(rep.c.id) && cBroken && cBroken.gaps.includes('أهداف الزيارة'),
          cBroken ? J(cBroken.gaps) : 'أُرسل رغم غياب الأهداف');
    check('الطابور: المدرسة نفسها لا تتأثّر (نطاق الصفوف يبقى في اسمها)', va && va.school === 'الأجيال العصرية الدولية (1-12)', va && va.school);
    // السكربت يدمج المصفوفة بسطرٍ لكلّ عنصر → آخر سطرين في «موضوع الزيارة» هما خطّ السير
    const text = va.objectives.join('\n').split('\n');
    check('الطابور: ما يُكتب في «موضوع الزيارة» ينتهي بخطّ السير', text[text.length - 2].startsWith('#قادم') && text[text.length - 1].startsWith('#متجه'), J(text));
}

/* ── ٥) التوصيل ── */
{
    const html = fs.readFileSync(path.join(ROOT, 'reports.html'), 'utf8');
    const school = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
    const exp = fs.readFileSync(path.join(ROOT, 'js/export.js'), 'utf8');
    const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
    const auto = fs.readFileSync(path.join(ROOT, 'js/autofill.js'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

    const iRoute = html.indexOf('js/route.js');
    check('wiring: route.js مربوطٌ قبل export.js وqueue-export.js وschool.js',
          iRoute > 0 && iRoute < html.indexOf('js/export.js') && iRoute < html.indexOf('js/queue-export.js') && iRoute < html.indexOf('js/school.js'));
    check('wiring: عامل الخدمة يخزّن الملفّ', sw.includes("'./js/route.js'"));

    // الخانتان داخل النموذج (فيُفرَّغان بـ reset) وأسفل قائمة الأهداف
    const form = html.indexOf('id="reportForm"'), objs = html.indexOf('id="objectivesContainer"');
    const ci = html.indexOf('id="schoolCameFrom"'), gi = html.indexOf('id="schoolGoingTo"');
    check('wiring: الخانتان بعد قائمة الأهداف داخل النموذج', form > 0 && objs > form && ci > objs && gi > ci);
    check('wiring: الخانتان تُحفظان باسميهما (cameFrom / goingTo)', /id="schoolCameFrom" name="cameFrom"/.test(html) && /id="schoolGoingTo" name="goingTo"/.test(html));

    check('wiring: الحفظ يخزّن الحقلين ولا يضعهما في objectives',
          /cameFrom: \(document\.getElementById\('schoolCameFrom'\)/.test(school) && /goingTo: \(document\.getElementById\('schoolGoingTo'\)/.test(school)
          && !/objectives\.push\([^)]*[cC]ameFrom/.test(school));
    check('wiring: الاستعادة في الموضعين',
          (school.match(/getElementById\('schoolCameFrom'\)\.value = report\.cameFrom/g) || []).length === 2
          && (school.match(/getElementById\('schoolGoingTo'\)\.value = report\.goingTo/g) || []).length === 2);
    check('wiring: المعاينة تعرض الأسطر بعد القائمة المرقَّمة وتهرب النصّ',
          /objectivesHtml \+= '<\/ol>';[\s\S]{0,400}SchoolRoute\.routeLines\(report\.cameFrom, report\.goingTo\)[\s\S]{0,300}schoolRouteEsc/.test(school));
    check('wiring: المعاينة من النموذج تحمل الحقلين', /cameFrom: \(document\.getElementById\('schoolCameFrom'\)[\s\S]{0,200}classroomVisits: schoolClassroomVisits/.test(init));
    check('wiring: «نسخ الأهداف» تنسخ خطّ السير بعد المرقَّمة', /SchoolRoute\.routeLines\([^)]*schoolCameFrom[\s\S]{0,160}checked\.concat\(route\)/.test(init));
    check('wiring: التصدير المفرد يُلحق الأسطر بالأهداف ويعرضها', /objectives: objectives\.concat\(routeLines\)/.test(exp) && exp.includes('خطّ السير'));
    // الأهداف تُرقَّم تسلسليّاً ١، ٢، … كترقيم رأي الزائر — في الموقعين والسكربت الثلاثة معاً
    const usr = fs.readFileSync(path.join(ROOT, 'tools/daf51553aa5f5d6215/school-visits-automation.user.js'), 'utf8');
    const que = fs.readFileSync(path.join(ROOT, 'js/queue-export.js'), 'utf8');
    check('wiring: الأهداف مرقَّمةٌ عند التصدير في المواضع الثلاثة (كترقيم رأي الزائر)',
          /\.map\(\(o, i\) => \(i \+ 1\) \+ '- ' \+ o\);/.test(exp)
          && /\.map\(\(o, i\) => \(i \+ 1\) \+ '- ' \+ o\)\s*\r?\n\s*\.concat/.test(que)
          && /\.map\(\(o, i\) => \(i \+ 1\) \+ '- ' \+ o\);/.test(usr));
    check('wiring: التهيئة تُستدعى، و«تقرير جديد» تصفّر النموذج كلّه',
          /schoolRouteInit\(\)/.test(init) && /repForm\.reset\(\)/.test(init));
    check('wiring: showSchoolForm تحدّث الاقتراح', /function showSchoolForm\(\) \{[\s\S]{0,400}renderSchoolRoute\(\);/.test(school));
    check('wiring: قائمة المدارس تُربط بالخانتين وتُفكّ معهما', /svfBindList\('schoolCameFrom', SVF_SCHOOL_LIST, on\)/.test(auto) && /svfBindList\('schoolGoingTo',\s+SVF_SCHOOL_LIST, on\)/.test(auto));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
