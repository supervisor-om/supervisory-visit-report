// اختبار: node tests/queue-continue.test.js
// v17.5 (2026-10-31) — طلبات المشرف الستّة:
//   ١) الهمزة في بحث البوّابة: «احمد سعيد» بلا همزةٍ لا يجده البحث و«أحمد سعيد» يجده؛
//   ٢) إزالة وسم «حُفظت في البوابة» عن زيارةٍ إشرافيّة أو مدرسيّة؛
//   ٣) الطابور لا يتوقّف عند زيارةٍ لا تُدخَل، وفي آخره تقريرٌ بما حُفظ وما لم يُحفظ وسببه؛
//   ٤) «الأرشيف» ← «زياراتي الإشرافية»؛ ٥) التنقّل بين الزيارات من داخل الزيارة؛ ٦) «وزارة التعليم».
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(require('./_script-src.js'), 'utf8').replace(/\r\n/g, '\n');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const between = (a, b, from) => {
    const i = SRC.indexOf(a, from || 0), j = SRC.indexOf(b, i + 1);
    if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? a : b));
    return SRC.slice(i, j);
};

/* ── ١) الهمزة: صيغ البحث بصورها، والمطابقة كما كانت ── */
{
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(between('        function normAr(v) {', '        let sup = null;')
        + '\nthis.sv = searchVariants; this.hf = hamzaForms; this.nn = normName;', ctx);
    const sv = ctx.sv;
    const a = sv('احمد سعيد');
    check('hamza: «احمد سعيد» يُبحث أوّلاً «أحمد سعيد»', a[0] === 'أحمد سعيد', JSON.stringify(a));
    check('hamza: ثمّ كما كُتب بلا همزة', a.indexOf('احمد سعيد') > 0);
    check('hamza: «أحمد سعيد» المكتوبة بهمزتها تُجرَّب أوّلاً كما هي', sv('أحمد سعيد')[0] === 'أحمد سعيد');
    check('hamza: «ابراهيم» ← «إبراهيم» (همزة القطع المكسورة من قائمة الأسماء)', sv('ابراهيم خميس')[0] === 'إبراهيم خميس', JSON.stringify(sv('ابراهيم خميس')));
    check('hamza: «امنة» ← «آمنة»', sv('امنة سالم')[0] === 'آمنة سالم', JSON.stringify(sv('امنة سالم')));
    check('hamza: «الياس» اسمٌ معروف ← «إلياس» (ليست «ال» التعريف)', sv('الياس محمد')[0] === 'إلياس محمد');
    const b = sv('احمد البلوشي');
    check('hamza: «البلوشي» لا تُمسّ (ال التعريف)', !b.some(t => /[أإآ]لبلوشي/.test(t)) && b[0] === 'أحمد البلوشي' && b.indexOf('احمد البلوشي') > -1, JSON.stringify(b));
    const c = sv('ابتسام سعيد');
    check('hamza: اسمٌ غير معروفٍ بالألف تُجرَّب صوره كلّها (أ، كما كُتب، إ)',
          c.indexOf('أبتسام سعيد') > -1 && c.indexOf('ابتسام سعيد') > -1 && c.indexOf('إبتسام سعيد') > -1, JSON.stringify(c));
    const d = sv('احمد بن سعيد بن علي الهنائي');
    check('hamza: بلا «بن» أوّلاً، ثمّ كما كُتب، ثمّ الأوّل والأب، والأوّل والأخير، والأوّل',
          d[0] === 'أحمد سعيد علي الهنائي' && d.indexOf('أحمد بن سعيد بن علي الهنائي') > -1
          && d.indexOf('أحمد سعيد') > -1 && d.indexOf('أحمد الهنائي') > -1 && d.indexOf('أحمد') > -1, JSON.stringify(d));
    check('hamza: لا تكرار في الصيغ', new Set(d).size === d.length);
    check('hamza: التشكيل يُنزع والهمزة تبقى', sv('أَحْمَد سعيد')[0] === 'أحمد سعيد');
    check('match: المطابقة بالاسم المسوّى لا تتأثّر بالهمزة ولا «بن»',
          ctx.nn('أحمد بن سعيد') === ctx.nn('احمد سعيد') && ctx.nn('إبراهيم') === ctx.nn('ابراهيم'));
    check('match: الهمزة على الواو والياء (فؤاد/فواد، عائشة/عايشة)', ctx.nn('فؤاد') === ctx.nn('فواد') && ctx.nn('عائشة') === ctx.nn('عايشة'));
    check('wiring: البحث بـsearchVariants (لا searchTerms المسوّاة)', /const terms = searchVariants\(sup\.teacher\)/.test(SRC));
    check('wiring: اسم البوّابة المعروف يُبحث بهمزته (lightAr لا normAr)', /lightAr\(known\.portal\)/.test(SRC));
}

/* ── ٢) السجلّ المشترك: إزالة الوسم، وقت الحفظ، تقرير الطابور ── */
function shared() {
    const gm = {}, ls = {};
    const ctx = {
        GM_getValue: (k, d) => (k in gm ? gm[k] : d),
        GM_setValue: (k, v) => { gm[k] = v; },
        GM_deleteValue: k => { delete gm[k]; },
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
        Date, console
    };
    vm.createContext(ctx);
    vm.runInContext(between('    // ═══ سجلّ ما تأكّد حفظه في البوّابة ═══', '    const PANEL_ID     =')
        + '\nthis.rec = svfRecordSaved; this.recS = svfRecordSavedSchool; this.apply = svfApplyUnmarks; this.sync = svfSyncSaved;'
        + ' this.qs = svfQlogStart; this.qa = svfQlogAdd; this.qf = svfQlogFinish; this.qt = svfQlogText; this.mu = svfMergeUploadReports;', ctx);
    return { ctx, gm, ls };
}
{
    const { ctx, gm, ls } = shared();
    ctx.rec({ teacher: 'أحمد سعيد', date: '01/10/2026', key: 'supervision_v6_visit_1' });
    ctx.recS({ school: 'مدرسة الأمل', date: '02/10/2026' });
    ctx.sync();
    check('unmark: الحفظ يُضخّ إلى الموقع', JSON.parse(ls.svf_sent_visits).indexOf('أحمد سعيد|01/10/2026') > -1
          && JSON.parse(ls.svf_sent_reports).indexOf('supervision_v6_visit_1') > -1);
    // الموقع أزال الوسم: يحذفه من قوائمه ويكتب العلامة
    ls.svf_sent_visits = '[]'; ls.svf_sent_reports = '[]'; ls.svf_sent_school_visits = '[]';
    ls.svf_sent_unmarked = JSON.stringify([{ k: 'أحمد سعيد|01/10/2026', l: 'v', at: Date.now() + 5 },
        { k: 'supervision_v6_visit_1', l: 'r', at: Date.now() + 5 }, { k: 'مدرسة الأمل|02/10/2026', l: 's', at: Date.now() + 5 }]);
    ctx.sync();
    check('unmark: العلامة تحذف المعرّف من سجلّ السكربت فلا يعيده الدمج',
          JSON.parse(gm.svf_saved_visits).length === 0 && JSON.parse(gm.svf_saved_reports).length === 0
          && JSON.parse(gm.svf_saved_school_visits).length === 0 && JSON.parse(ls.svf_sent_visits).length === 0, JSON.stringify(gm));
    check('unmark: العلامة تُمحى بعد تطبيقها', !('svf_sent_unmarked' in ls));
    // حُفظت ثانيةً بعد الإزالة: علامةٌ أقدم لا تمحوها
    ls.svf_sent_unmarked = JSON.stringify([{ k: 'أحمد سعيد|01/10/2026', l: 'v', at: Date.now() - 60000 }]);
    ctx.rec({ teacher: 'أحمد سعيد', date: '01/10/2026', key: 'supervision_v6_visit_1' });
    ctx.sync();
    check('unmark: حفظٌ بعد الإزالة يبقى (العلامة أقدم منه)', JSON.parse(gm.svf_saved_visits).indexOf('أحمد سعيد|01/10/2026') > -1
          && JSON.parse(ls.svf_sent_visits).indexOf('أحمد سعيد|01/10/2026') > -1);
    check('unmark: لكلّ حفظٍ وقته', JSON.parse(gm.svf_saved_at)['supervision_v6_visit_1'] > 0);
}
{
    const { ctx, gm, ls } = shared();
    ctx.qs('sup', [{}, {}, {}, {}]);
    ctx.qa('sup', { i: 0, name: 'أحمد سعيد', date: '01/10/2026', key: 'k1', status: 'saved', reason: '' });
    ctx.qa('sup', { i: 2, name: 'سالم علي', date: '03/10/2026', status: 'failed', reason: 'لم أجد المعلّم في البوّابة' });
    ctx.qa('sup', { i: 1, name: 'مريم', date: '02/10/2026', status: 'dup', reason: 'حُفظت من قبل' });
    ctx.qa('sup', { i: 2, name: 'سالم علي', date: '03/10/2026', status: 'failed', reason: 'السبب الأخير' });
    const rep = ctx.qf('sup', 4);
    check('report: سطرٌ لكلّ زيارة (الأحدث يغلب) مرتّبةً', rep.rows.length === 3 && rep.rows.map(r => r.i).join() === '0,1,2' && rep.rows[2].reason === 'السبب الأخير');
    check('report: العدّ لكلّ حالة والإجماليّ من الطابور', rep.count.saved === 1 && rep.count.dup === 1 && rep.count.failed === 1 && rep.total === 4);
    const t = ctx.qt(rep);
    check('report: النصّ يذكر العدد والسبب لكلّ زيارة', /حُفظت 1 من 4/.test(t) && /3\. سالم علي — 03\/10\/2026: لم تُحفظ — السبب الأخير/.test(t), t);
    check('report: يُحفظ للموقع', JSON.parse(gm.svf_upload_report).sup.count.saved === 1);
    check('report: يُضخّ إلى الموقع', ctx.mu() === 1 && JSON.parse(ls.svf_upload_report).sup.total === 4);
    check('report: لا يُضخّ ثانيةً ما لم يتغيّر', ctx.mu() === 0);
    ls.svf_upload_report = JSON.stringify({ sup: { at: Date.now() + 99999, rows: [], total: 0 } });
    check('report: الأحدث في الموقع لا يُستبدل بأقدم', ctx.mu() === 0 && JSON.parse(ls.svf_upload_report).sup.total === 0);
}

/* ── ٣) الطابور يكمل: التخطّي موصولٌ في كلّ نقطة فشل، والمُدخل سابقاً يُعرف ── */
{
    const supSec = SRC.slice(SRC.indexOf('SupervisionVisits'));
    const n = (supSec.match(/await supSkip\(/g) || []).length;
    check('continue: الوحدة الإشرافيّة تتخطّى في نقاط الفشل (١٥ فأكثر)', n >= 15, String(n));
    check('continue: «لم يُعثر على المعلّم» يتخطّى ولا يوقف', /await supSkip\('لم يُعثر على المعلّم «'/.test(SRC));
    check('continue: الاستمارة ونقص البيانات وزرّ الحفظ ورفض البوّابة كلّها تتخطّى',
          /await supSkip\('بياناتٌ ناقصة في التقرير: '/.test(SRC) && /await supSkip\('لم أجد زرّ الحفظ في البوّابة'\)/.test(SRC)
          && /await supSkip\('رفضت البوّابة الحفظ: ' \+ fm, supDupStatus\(fm\)\)/.test(SRC));
    check('continue: المهلة «لم يتأكّد حفظها» لا تُعاد ولا تُوسم', /'unsure'/.test(SRC) && /queueGate[\s\S]{0,1500}supSkip\([^)]*'unsure'\)/.test(SRC));
    check('continue: إلغاء المشرف للحفظ يُوقف الطابور (قراره) ويمسح علامة «لم يتأكّد»',
          /const go = await supCountdown\(SAVE_GRACE_MS\);\s*if \(!go\) \{[\s\S]{0,300}GM_deleteValue\('svf_queue_hold'\)[\s\S]{0,40}return;/.test(SRC));
    check('continue: الزيارة المدرسيّة: المدرسة غير الموجودة سببٌ مفهوم', /function schoolSkipReason/.test(SRC) && /skipAfter = schoolSkipReason\(/.test(SRC));
    check('continue: المدرسيّة تتخطّى بعد رفض البوّابة بعد إعادة التحميل', /resolvePendingSaveAfterReload[\s\S]{0,4000}schoolSkip\(/.test(SRC));
    check('continue: نهاية الطابور تعرض التقرير في الوحدتين', /function supQueueDone[\s\S]{0,900}svfQlogShow\(rep\)/.test(SRC) && /function schoolQueueDone[\s\S]{0,900}svfQlogShow\(rep\)/.test(SRC));
    check('continue: سطر «الزيارة» يحمل مفتاحها في الوحدتين', (SRC.match(/svfQlogAdd\('(sup|school)', \{ i: info\.i, name: [^}]*key: cur\.key/g) || []).length === 4);

    // المُدخل سابقاً: سجلّ السكربت أو وسم الأرشيف (sent)
    const gm = {};
    const ctx = { GM_getValue: (k, d) => (k in gm ? gm[k] : d), svfSavedReportsList: () => JSON.parse(gm.r || '[]'),
                  svfSavedList: () => JSON.parse(gm.v || '[]'), svfSavedSchoolList: () => JSON.parse(gm.s || '[]'),
                  svfNameKey: v => String(v || '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').trim(),
                  normEdu: v => String(v || '').replace(/\s+/g, ' ').trim() };
    vm.createContext(ctx);
    vm.runInContext(between('        function supAlreadySaved(v) {', '        async function supDupSkip()')
        + between('        function schoolSavedBefore(v) {', '        function schoolQueueDone(')
        + between('        function schoolSkipReason(msg, data) {', '        // ─── أنماط لوحة التحكم ───')
        + '\nthis.sup = supAlreadySaved; this.sch = schoolSavedBefore; this.why = schoolSkipReason;', ctx);
    gm.r = JSON.stringify(['k1']); gm.v = JSON.stringify(['احمد سعيد|01/10/2026']); gm.s = JSON.stringify(['مدرسة الأمل|02/10/2026']);
    check('dup: بمفتاح التقرير', ctx.sup({ key: 'k1', teacher: 'x', date: '1' }) && !ctx.sup({ key: 'k2', teacher: 'احمد سعيد', date: '01/10/2026' }));
    check('dup: بلا مفتاحٍ بالمعلّم والتاريخ (والهمزة لا تفرّق)', ctx.sup({ teacher: 'أحمد سعيد', date: '01/10/2026' }));
    check('dup: وسم الأرشيف (ومنه التأكيد اليدويّ) يكفي', ctx.sup({ key: 'k9', teacher: 'غيره', date: '1', sent: true }) && ctx.sch({ school: 'أخرى', date: '1', sent: true }));
    check('dup: المدرسيّة بالمدرسة والتاريخ', ctx.sch({ school: 'مدرسة  الأمل', date: '02/10/2026' }) && !ctx.sch({ school: 'مدرسة الأمل', date: '03/10/2026' }));
    check('dup: الزيارة بلا وسمٍ ولا سجلٍّ تُرفع', !ctx.sup({ key: 'k3', teacher: 'سالم', date: '1', sent: false }));
    check('reason: المدرسة غير الموجودة', /لم أجد المدرسة «مدرسة النور»/.test(ctx.why('لم يُعثر على المدرسة في كل أنظمة التعليم', { school: 'مدرسة النور' })));
    check('reason: المدرسة الملتبسة', /يطابق أكثر من مدرسةٍ/.test(ctx.why('أكثر من مدرسة تطابق', { school: 'النور' })));
    check('reason: غير ذلك كما هو', ctx.why('رسالة أخرى', {}) === 'رسالة أخرى');
    check('sync: الموقع يطلق «svf-sent-changed» فيطبّق السكربت الإزالة فوراً', /addEventListener\('svf-sent-changed', \(\) => \{ try \{ svfSyncSaved\(\); \} catch \(e\) \{\} \}\)/.test(SRC));
}

/* ── ٤) الموقع: إزالة الوسم، وسم الطابور، تقرير آخر رفع ── */
function site() {
    const store = {};
    const events = [];
    const ctx = {
        console, Date, JSON,
        localStorage: {
            getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
            key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; }
        },
        document: { getElementById: () => null, querySelectorAll: () => [] },
        dispatchEvent: e => events.push(e.type), Event: function (t) { this.type = t; },
        SupervisorIdentity: { normalize: s => String(s || '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').trim(),
                              normName: s => String(s || '').replace(/[أإآ]/g, 'ا').split(' ').filter(w => w && w !== 'بن').join(' ') },
        evaluationItems: Array.from({ length: 13 }, (_, i) => ({ id: i + 1 }))
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/queue-export.js'), ctx);
    return { ctx, store, events };
}
{
    const { ctx, store, events } = site();
    const visit = (key, t, d, extra) => { store[key] = JSON.stringify(Object.assign({ teacherName: t, visitDate: d, school: 'مدرسة الأمل', formData: {} }, extra || {})); };
    visit('supervision_v6_visit_1', 'أحمد سعيد', '2026-10-01');
    ctx.svfMarkSent([{ teacher: 'أحمد سعيد', date: '01/10/2026', key: 'supervision_v6_visit_1' }]);
    check('site: التأكيد يُطلق svf-sent-changed', events.indexOf('svf-sent-changed') > -1);
    check('site: موسومة', ctx.svfIsSentReport('supervision_v6_visit_1') && ctx.svfIsSent('احمد سعيد', '01/10/2026'));
    const n = ctx.svfUnmarkSent('أحمد سعيد', '01/10/2026', 'supervision_v6_visit_1');
    check('site: الإزالة تحذف الوسمين', n === 1 && !ctx.svfIsSentReport('supervision_v6_visit_1') && !ctx.svfIsSent('أحمد سعيد', '01/10/2026'));
    const marks = JSON.parse(store.svf_sent_unmarked);
    check('site: علامةٌ للسكربت بالقائمتين', marks.some(m => m.l === 'v' && m.k === 'أحمد سعيد|01/10/2026') && marks.some(m => m.l === 'r' && m.k === 'supervision_v6_visit_1'));
    // سكربتٌ أقدم يعيد المعرّف بالدمج: العلامة تستثنيه
    store.svf_sent_visits = JSON.stringify(['أحمد سعيد|01/10/2026']); store.svf_sent_reports = JSON.stringify(['supervision_v6_visit_1']);
    check('site: ما أعاده الدمج قبل تطبيق العلامة لا يُوسم', !ctx.svfIsSentReport('supervision_v6_visit_1') && !ctx.svfIsSent('أحمد سعيد', '01/10/2026'));
    ctx.svfMarkSent([{ teacher: 'أحمد سعيد', date: '01/10/2026', key: 'supervision_v6_visit_1' }]);
    check('site: التأكيد اليدويّ بعد الإزالة يعيد الوسم', ctx.svfIsSentReport('supervision_v6_visit_1') && ctx.svfIsSent('أحمد سعيد', '01/10/2026'));

    // الطابور: sent لكلّ زيارة كما يعرضها الأرشيف
    visit('supervision_v6_visit_2', 'سالم علي', '2026-10-02', { formData: { topic: 'درس', lesson: '1', class: '5/1', subject: 'رياضة', 'score-1': '2' } });
    store.svf_sent_visits = JSON.stringify(['سالم علي|02/10/2026']);
    const fd = { topic: 'درس', lesson: '1', class: '5/1', subject: 'رياضة', strengthsContent: 'x' };
    for (let i = 1; i <= 13; i++) fd['score-' + i] = '2';
    visit('supervision_v6_visit_2', 'سالم علي', '2026-10-02', { formData: fd });
    visit('supervision_v6_visit_3', 'مريم', '2026-10-03', { formData: fd });
    const b = ctx.svfBuildFromKeys(['supervision_v6_visit_2', 'supervision_v6_visit_3']);
    const by = k => (b.ready.find(r => r.key === k) || {}).visit || {};
    check('queue: الموسومة تحمل sent=true وغيرها false', by('supervision_v6_visit_2').sent === true && by('supervision_v6_visit_3').sent === false, JSON.stringify(b.broken));
    visit('supervision_v6_visit_4', 'سالم علي', '2026-10-02', { formData: fd });
    const b2 = ctx.svfBuildFromKeys(['supervision_v6_visit_2', 'supervision_v6_visit_4']);
    check('queue: زيارتان في اليوم و«المعلّم|التاريخ» وحده لا يُوسمان (لا يُعرف أيّهما)', b2.ready.every(r => r.visit.sent === false));

    // المدرسيّة
    store.supervision_v6_school_report_1 = JSON.stringify({ schoolName: 'مدرسة الأمل', visitDate: '2026-10-02', visitType: 'x', objectives: ['1- هدف'], visitorOpinion: 'رأي' });
    ctx.svfSchoolMarkSent([{ school: 'مدرسة الأمل', date: '02/10/2026' }]);
    const sb = ctx.svfBuildSchoolFromKeys(['supervision_v6_school_report_1']);
    check('queue: المدرسيّة تحمل مفتاحها ووسمها', sb.ready[0] && sb.ready[0].visit.key === 'supervision_v6_school_report_1' && sb.ready[0].visit.sent === true);
    ctx.svfSchoolUnmarkSent('مدرسة الأمل', '02/10/2026', 'supervision_v6_school_report_1');
    check('site: إزالة وسم المدرسيّة', !ctx.svfSchoolIsSent('مدرسة الأمل', '02/10/2026')
          && JSON.parse(store.svf_sent_unmarked).some(m => m.l === 's' && m.k === 'مدرسة الأمل|02/10/2026'));

    // تقرير آخر رفع
    store.svf_upload_report = JSON.stringify({ sup: { kind: 'sup', at: 5, total: 2, count: { saved: 1, failed: 1 },
        rows: [{ i: 0, name: 'أحمد سعيد', date: '01/10/2026', status: 'saved' }, { i: 1, name: 'سالم علي', date: '02/10/2026', status: 'failed', reason: 'لم أجد المعلّم' }] } });
    const rep = ctx.svfUploadReport('sup');
    check('report-site: يُقرأ', rep && rep.rows.length === 2 && ctx.svfUploadReport('school') === null);
    check('report-site: نصّه للنسخ', /حُفظت 1 من 2/.test(ctx.svfUploadReportText(rep)) && /2\. سالم علي — 02\/10\/2026: لم تُحفظ — لم أجد المعلّم/.test(ctx.svfUploadReportText(rep)));
}

/* ── ٥) الواجهة: الأزرار والتقرير والتسمية والتنقّل والوزارة ── */
{
    const html = read('reports.html'), exp = read('js/export.js'), sch = read('js/school.js'), init = read('js/init.js'), q = read('js/queue-export.js');
    check('ui: «إزالة الوسم» في بطاقة الإشرافيّة (الموسومة والملتبسة)', /class="unmark-sent-btn/.test(exp) && (exp.match(/\+ unmarkBtn;/g) || []).length === 2);
    check('ui: «إزالة الوسم» في بطاقة المدرسيّة', /class="unmark-sent-school-btn/.test(sch));
    check('ui: الأزرار تُهرَّب', /data-teacher="\$\{esc\(tName\)\}" data-date="\$\{esc\(portalDate\)\}" data-key="\$\{esc\(key\)\}" title="أزل/.test(exp)
          && /data-school="\$\{schoolRouteEsc\(report\.schoolName \|\| ''\)\}"/.test(sch));
    check('ui: الإزالة بعد تأكيد', /closest\('\.unmark-sent-btn'\)[\s\S]{0,200}confirm\([\s\S]{0,400}svfUnmarkSent\(/.test(init)
          && /closest\('\.unmark-sent-school-btn'\)[\s\S]{0,200}confirm\([\s\S]{0,400}svfSchoolUnmarkSent\(/.test(init));
    check('ui: لوحة «نتيجة آخر رفع» في القائمتين', /id="supUploadReport"/.test(html) && /id="schoolUploadReport"/.test(html)
          && /svfRenderUploadReport\('sup'\)/.test(exp) && /svfRenderUploadReport\('school'\)/.test(sch));
    check('ui: اللوحة تُهرّب الأسماء والأسباب', /\$\{upEsc\(r\.name \|\| '—'\)\}/.test(q) && /\$\{upEsc\(r\.reason\)\}/.test(q));
    check('ui: تحذير الموسومة قبل الرفع', (q.match(/msg \+= sentNote\(ready\);/g) || []).length === 2);
    check('rename: التبويب «زياراتي الإشرافية»', /fa-box-archive ml-2"><\/i>زياراتي الإشرافية/.test(html) && !/>الأرشيف\s*</.test(html));
    check('rename: زرّ الحفظ «حفظ في زياراتي»', /حفظ في زياراتي<\/button>/.test(html) && /'حفظ في زياراتي'/.test(read('js/supervisory.js')));
    check('nav: الشريط مربوطٌ ومخزَّن', /<script src="js\/visit-nav\.js"><\/script>/.test(html) && read('sw.js').includes("'./js/visit-nav.js'"));
    check('nav: يتحدّث مع فتح الزيارة وحفظها (setEditingKey) ومع الزيارة المدرسيّة',
          /function setEditingKey[\s\S]{0,900}svfVisitNavRefresh\('sup', \{ rebase: true \}\)/.test(read('js/supervisory.js'))
          && /showSchoolForm\(\);\s*\n\s*try \{ if \(typeof svfVisitNavRefresh === 'function'\) svfVisitNavRefresh\('school', \{ rebase: true \}\)/.test(sch));
    const sites = ['reports.html', 'letters.html', 'index.html', 'monthly.html', 'js/eye-draft.js'];
    const plan = path.join(ROOT, '..', 'plan-mct', 'index.html');
    const left = sites.filter(f => read(f).includes('وزارة التربية')).concat(fs.existsSync(plan) && fs.readFileSync(plan, 'utf8').includes('وزارة التربية') ? ['plan-mct'] : []);
    check('ministry: «وزارة التعليم» لا «وزارة التربية والتعليم»', !left.length, left.join('، '));
}

/* ── ٦) محرّك التنقّل بين الزيارات ── */
{
    const N = require(path.join(ROOT, 'js/visit-nav.js'));
    const store = {};
    const st = { key: i => Object.keys(store)[i], getItem: k => store[k] ?? null, get length() { return Object.keys(store).length; } };
    const put = (k, o) => { store[k] = JSON.stringify(o); };
    put('supervision_v6_visit_100', { teacherName: 'أحمد سعيد', visitDate: '2026-10-01', school: 'مدرسة الأمل', formData: { class: '5/1' } });
    put('supervision_v6_visit_200', { teacherName: 'مريم علي', visitDate: '2026-10-05', school: 'مدرسة النور', formData: {} });
    put('supervision_v6_visit_300', { teacherName: 'سالم خميس', visitDate: '2026-10-05', school: 'مدرسة الأمل', formData: {} });
    put('supervision_v6_visit_400', { teacherName: 'حذف', visitDate: '2026-10-09', deleted: true });
    put('supervision_v6_school_report_1', { schoolName: 'مدرسة النور', visitDate: '2026-10-03' });
    put('svf_sent_visits', ['x']);
    const L = N.list('sup', st);
    check('nav: الزيارات الإشرافيّة وحدها، الأحدث أوّلاً، والتعادل بالأحدث حفظاً', L.map(x => x.key.slice(-3)).join() === '300,200,100', L.map(x => x.key).join());
    check('nav: المحذوف لا يُعدّ', !L.some(x => x.name === 'حذف'));
    const nb = N.neighbors(L, 'supervision_v6_visit_200');
    check('nav: الأحدث والأقدم والموضع', nb.i === 1 && nb.n === 3 && nb.newer.key.endsWith('300') && nb.older.key.endsWith('100'));
    check('nav: الأوّل بلا أحدث والأخير بلا أقدم', !N.neighbors(L, L[0].key).newer && !N.neighbors(L, L[2].key).older);
    check('nav: زيارةٌ غير مفتوحة بلا موضع', N.neighbors(L, null).i === -1 && !N.neighbors(L, null).older);
    check('nav: البحث بالاسم بلا همزة', N.search(L, 'احمد')[0].key.endsWith('100'));
    check('nav: البحث بالمدرسة وكلمتين', N.search(L, 'الامل سالم').map(x => x.key.slice(-3)).join() === '300');
    check('nav: البحث بالتاريخ بصيغتيه', N.search(L, '05/10').length === 2 && N.search(L, '2026-10-01').length === 1);
    check('nav: البحث بالصف', N.search(L, 'الصف 5/1').length === 1);
    check('nav: بحثٌ فارغ لا شيء', N.search(L, '  ').length === 0);
    const S = N.list('school', st);
    check('nav: الزيارات المدرسيّة باسم المدرسة', S.length === 1 && S[0].name === 'مدرسة النور');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS');
process.exit(failures ? 1 : 0);
