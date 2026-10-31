// اختبار انحدار: node tests/same-day-visits.test.js
// زيارتان للمعلّم نفسه في اليوم نفسه (بلاغ المشرف 2026-10-26: «يسجّلها في الزيارة الأولى»):
//   ١) supVisitChanges: ما يميّز الزيارة (المعلّم، التاريخ، الحصة، الصف) — وإكمال خانةٍ فارغةٍ ليس زيارةً أخرى
//   ٢) savePermanentReport: تغيّر الحصة في زيارةٍ محفوظة يسأل ولا يكتب فوقها؛ «جديدة» تُبقي الاثنتين و«تحديث» واحدة
//   ٣) أرشيف الرسوم قراءةٌ لكلّ تقرير لا لكلّ تاريخ
//   ٤) الموقف الصفّيّ الثاني للمعلّم (حصةٌ أخرى) له زرّ «أنشئ تقرير إشرافي»
//   ٥) التقرير الشهريّ و«حُفظت» لكلّ تقرير حين يُعرف مفتاحه
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const SUP = read('js/supervisory.js');
const between = (src, a, b) => {
    const i = src.indexOf(a), j = src.indexOf(b, i + 1);
    if (i < 0 || j < 0) throw new Error('لم يُعثر على ' + a + ' … ' + b);
    return src.slice(i, j);
};

/* ── ١) ما يميّز الزيارة ── */
const changesSrc = between(SUP, '        function supVisitChanges', '        function supAskNewOrUpdate');
const ctx1 = { window: {}, console };
vm.createContext(ctx1);
vm.runInContext(changesSrc + '\nthis.f = supVisitChanges;', ctx1);
const ch = ctx1.f;
const saved = { teacherName: 'علي سالم', visitDate: '2026-10-26', formData: { lesson: '2', 'class': '8/1' } };
const cur = o => Object.assign({ teacherName: 'علي سالم', visitDate: '2026-10-26', lesson: '2', cls: '8/1' }, o);
check('changes: النموذج كما حُفظ ← لا تغيّر', ch(saved, cur({})).length === 0);
check('changes: حصةٌ أخرى ← «الحصة»', JSON.stringify(ch(saved, cur({ lesson: '4' }))) === '["الحصة"]', JSON.stringify(ch(saved, cur({ lesson: '4' }))));
check('changes: صفٌّ آخر ← «الصف»', JSON.stringify(ch(saved, cur({ cls: '8/3' }))) === '["الصف"]');
check('changes: معلّمٌ آخر وتاريخٌ آخر', JSON.stringify(ch(saved, cur({ teacherName: 'خالد', visitDate: '2026-10-27' }))) === '["اسم المعلم","التاريخ"]');
check('changes: «(2)» و«٢» والمسافات حصةٌ واحدة', ch(saved, cur({ lesson: '(٢)', cls: ' 8/1 ' })).length === 0, JSON.stringify(ch(saved, cur({ lesson: '(٢)' }))));
check('changes: إكمال حصةٍ كانت فارغة تعديلٌ لا زيارةٌ أخرى',
      ch({ teacherName: 'علي سالم', visitDate: '2026-10-26', formData: {} }, cur({ lesson: '5', cls: '9/2' })).length === 0);

/* ── ٢) الحفظ: سؤالٌ لا كتابةٌ فوق الأولى ── */
function harness() {
    const store = {};
    const ls = {
        getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }, key: i => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; }
    };
    const mk = (id, value) => ({ id, value: value || '', textContent: value || '', dataset: {}, hidden: true,
        classList: { _h: true, add(c) { if (c === 'hidden') this._h = true; }, remove(c) { if (c === 'hidden') this._h = false; },
                     toggle(c, on) { if (c === 'hidden') this._h = !!on; }, contains: c => false },
        addEventListener(t, fn) { (this._l = this._l || []).push(fn); }, focus() {} });
    const els = {};
    ['teacherName', 'visitDate', 'school', 'visitorName', 'lesson', 'class', 'topic', 'visitNumber',
     'editingBanner', 'editingBannerLabel', 'savePermanentReportBtn', 'svfVisitChoiceModal', 'svfVisitChoiceMsg'].forEach(id => { els[id] = mk(id); });
    ['svfVisitChoiceNew', 'svfVisitChoiceUpdate', 'svfVisitChoiceCancel'].forEach(id => {
        const b = mk(id);
        b.cloneNode = () => { const c = mk(id); c.cloneNode = b.cloneNode; c.parentNode = b.parentNode; return c; };
        b.parentNode = { replaceChild: (nw) => { els[id] = nw; } };
        els[id] = b;
    });
    for (let i = 1; i <= 13; i++) { els['score-' + i] = mk('score-' + i, '2'); els['notes-' + i] = mk('notes-' + i, 'وصف ' + i); }
    const formIds = ['teacherName', 'visitDate', 'school', 'lesson', 'class', 'topic', 'visitNumber'];
    const toasts = [];
    const ctx = {
        console, localStorage: ls, JSON, Date, Event: function (t) { this.type = t; },
        evaluationItems: Array.from({ length: 13 }, (_, i) => ({ id: i + 1 })),
        currentEditingKey: null, supLastGenerated: null,
        showToast: (m, t) => toasts.push([m, t || 'ok']),
        svfSupervisorName: () => 'أسعد', renderSavedReports: () => {}, suggestVisitNumber: () => {},
        confirm: () => false,
        document: {
            querySelector: sel => els[sel.replace(/^#/, '')] || null,
            querySelectorAll: sel => sel.indexOf('#form-view') === 0 ? formIds.map(id => els[id]) : [],
            getElementById: id => els[id] || null
        },
        window: {}
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    const code = between(SUP, '        function setEditingKey', '        function performReset')
               + between(SUP, '        function savePermanentReport', '        function loadPermanentReport');
    vm.runInContext(code + '\nthis.save = savePermanentReport; this.getKey = () => currentEditingKey;', ctx);
    const reports = () => Object.keys(store).filter(k => k.startsWith('supervision_v6_visit_')).map(k => JSON.parse(store[k]));
    const set = (o) => Object.keys(o).forEach(k => { els[k].value = o[k]; });
    return { ctx, els, store, reports, set, toasts };
}
(function testSave() {
    const H = harness();
    H.set({ teacherName: 'علي سالم', visitDate: '2026-10-26', school: 'مدرسة أ', lesson: '2', 'class': '8/1', topic: 'لعبة كرة القدم', visitNumber: '1' });
    H.ctx.save();
    check('save: الزيارة الأولى تُحفظ والنموذج يبقى مربوطاً بها', H.reports().length === 1 && !!H.ctx.getKey());
    // الحصة الثانية: المشرف غيّر الحصة والصف وضغط «حفظ» — كان يُكتب فوق الأولى
    H.set({ lesson: '4', 'class': '8/3', topic: 'لعبة كرة السلة' });
    H.ctx.save();
    check('save: تغيّر الحصة والصف ← سؤال، ولا شيء يُكتب فوق الأولى',
          H.reports().length === 1 && H.reports()[0].formData.lesson === '2' && !H.els.svfVisitChoiceModal.classList._h,
          JSON.stringify(H.reports().map(r => r.formData.lesson)));
    check('save: السؤال يذكر ما تغيّر', /الحصة، الصف/.test(H.els.svfVisitChoiceMsg.textContent), H.els.svfVisitChoiceMsg.textContent);
    H.els.svfVisitChoiceNew._l[0]();
    const rs = H.reports().sort((a, b) => a.formData.lesson.localeCompare(b.formData.lesson));
    check('save: «زيارة جديدة» ← زيارتان، والأولى كما هي',
          rs.length === 2 && rs[0].formData.lesson === '2' && rs[0].formData['class'] === '8/1' && rs[1].formData.lesson === '4',
          JSON.stringify(rs.map(r => [r.formData.lesson, r.formData['class']])));
    const second = H.ctx.getKey();
    check('save: والنموذج صار مربوطاً بالثانية', second && JSON.parse(H.store[second]).formData.lesson === '4');
    const arch = JSON.parse(H.store['supervision_v6_teacher_archive_علي سالم']);
    check('save: أرشيف الرسوم قراءتان لليوم نفسه (لكلّ تقريرٍ id)', arch.length === 2 && arch.every(v => v.id && v.date === '2026-10-26'), JSON.stringify(arch.map(v => v.id)));

    // تصحيحٌ للثانية نفسها: الصفّ كُتب خطأً «8/3» وهو «8/2»
    H.set({ 'class': '8/2' });
    H.els.svfVisitChoiceModal.classList._h = true;
    H.ctx.save();
    H.els.svfVisitChoiceUpdate._l[0]();
    check('save: «تحديث» يصحّح الزيارة نفسها ولا يضيف ثالثة',
          H.reports().length === 2 && JSON.parse(H.store[second]).formData['class'] === '8/2');
    check('save: والرسم ما زال قراءتين', JSON.parse(H.store['supervision_v6_teacher_archive_علي سالم']).length === 2);

    // تعديلٌ لا يمسّ ما يميّز الزيارة (عنوان الدرس) ← يُحفظ بلا سؤال
    H.els.svfVisitChoiceModal.classList._h = true;
    H.set({ topic: 'كرة السلة: التمرير' });
    H.ctx.save();
    check('save: تعديل عنوان الدرس وحده يُحدّث بلا سؤال',
          H.els.svfVisitChoiceModal.classList._h && JSON.parse(H.store[second]).formData.topic === 'كرة السلة: التمرير' && H.reports().length === 2);
})();

/* ── ٣) القراءة القديمة بلا id تُستبدل عند تعديل تقريرها وحده ── */
(function testLegacyArchive() {
    const H = harness();
    H.store['supervision_v6_teacher_archive_علي سالم'] = JSON.stringify([{ date: '2026-10-20', scores: {} }]);
    H.set({ teacherName: 'علي سالم', visitDate: '2026-10-20', lesson: '1', 'class': '8/1' });
    H.ctx.save();   // تقريرٌ جديدٌ بالتاريخ نفسه لقراءةٍ قديمة: لا يمحوها
    const a = JSON.parse(H.store['supervision_v6_teacher_archive_علي سالم']);
    check('archive: زيارةٌ جديدةٌ لا تمحو قراءةً قديمةً بالتاريخ نفسه', a.length === 2, JSON.stringify(a));
})();

/* ── ٤) الموقف الصفّيّ الثاني للمعلّم ── */
(function testClassroom() {
    const src = read('js/classroom.js');
    const store = {
        'supervision_v6_visit_1': JSON.stringify({ teacherName: 'علي سالم', visitDate: '2026-10-26', formData: { lesson: '2', 'class': '8/1' } })
    };
    const ctx = {
        console,
        localStorage: { getItem: k => store[k] ?? null, key: i => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length; } },
        document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} },
        SupervisorIdentity: { normName: s => String(s || '').replace(/\s+/g, ' ').trim() }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const f = ctx.svfSupervisoryFor;
    check('classroom: الموقف بحصّته وصفّه له تقريره', !!f('علي سالم', '2026-10-26', { period: '2', grade: '8/1' }));
    check('classroom: حصةٌ أخرى للمعلّم نفسه بلا تقرير ← يظهر زرّها', !f('علي سالم', '2026-10-26', { period: '5', grade: '8/2' }));
    check('classroom: موقفٌ بلا حصةٍ ولا صفّ يُطابق بالمعلّم والتاريخ كما كان', !!f('علي سالم', '2026-10-26', {}));
    check('classroom: «(2)» و«٢» حصّةٌ واحدة', !!f('علي سالم', '2026-10-26', { period: '(٢)', grade: '8/1' }));
    check('classroom: والزرّ يمرّ بالموقف نفسه', /supervisoryFor\(visit && visit\.teacher, date, visit\)/.test(src));
})();

/* ── ٥) التقرير الشهريّ لكلّ تقرير ── */
(function testMonthly() {
    const C = require(path.join(ROOT, 'js/monthly-core.js'));
    const sup = [
        { key: 'k1', teacherName: 'علي سالم', visitDate: '2026-10-26', school: 'أ', formData: {} },
        { key: 'k2', teacherName: 'علي سالم', visitDate: '2026-10-26', school: 'أ', formData: {} }
    ];
    const base = { year: 2026, month0: 9, plan: {}, events: {}, schoolReports: [], supReports: sup,
                   sentSchool: new Set(), sentSup: new Set(['علي سالم|26/10/2026']) };
    const row = rs => rs.find(r => r.day === 26);
    const known = row(C.buildRows(Object.assign({}, base, { sentReports: new Set(['k1']) })));
    check('monthly: حُفظت إحداهما بمفتاحها ← «(1) أ. علي + (1) أ. علي (مرفق)»',
          known.supervisory === '(1) أ. علي + (1) أ. علي (مرفق)', known.supervisory);
    const att = C.attachments(C.buildRows(Object.assign({}, base, { sentReports: new Set(['k1']) })), sup);
    check('monthly: ويُرفق ملفّ الأخرى وحدها', att.length === 1 && att[0].report.key === 'k2', JSON.stringify(att.map(a => a.report.key)));
    const legacy = row(C.buildRows(base));
    check('monthly: سجلٌّ قديمٌ بلا مفاتيح ← كما كان، مع تنبيهٍ يقول إنّه لا يُعرف أيّها',
          legacy.supervisory === '(2) أ. علي' && legacy.warnings.some(w => /لا يُعرف أيّها/.test(w)), legacy.supervisory + ' | ' + legacy.warnings.join(' / '));
    const c = C.countSupervisory(known.supervisory);
    check('monthly: المجموع يعدّ واحدةً في البوّابة وواحدةً مرفقة', c.portal === 1 && c.attached === 1 && c.total === 2, JSON.stringify(c));
})();

/* ── ٦) «حُفظت» لكلّ تقرير، والمفتاح يصحب الزيارة إلى البوّابة ── */
(function testSentPerReport() {
    const Q = read('js/queue-export.js'), EXP = read('js/export.js'), HTML = read('reports.html'), INIT = read('js/init.js');
    const store = {};
    const ctx = { console, window: {}, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
                  document: { getElementById: () => null, querySelectorAll: () => [] } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(Q, ctx);
    ctx.svfMarkSent([{ teacher: 'علي سالم', date: '26/10/2026', key: 'k2' }]);
    check('sent: التأكيد اليدويّ يكتب مفتاح التقرير مع «المعلّم|التاريخ»',
          ctx.svfIsSentReport('k2') && !ctx.svfIsSentReport('k1') && ctx.svfIsSent('علي سالم', '26/10/2026'));
    check('sent: الطابور يحمل مفتاح كلّ تقرير', /ready\.push\(\{ key, visit: Object\.assign\(v, \{ key, sent: isSentVisit\(key, v, counts\) \}\) \}\)/.test(Q));
    check('sent: التصدير المفرد يحمل المفتاح إن كان النموذج زيارته المحفوظة نفسها',
          /function svfFormReportKey\(\)[\s\S]{0,700}supVisitChanges\(saved/.test(EXP) && /if \(formKey\) exportData\.key = formKey;/.test(EXP)
          && /closest\('#exportToMoeBtn'\);\s*\n\s*if \(b\) b\.dataset\.svfKey = svfFormReportKey\(\);/.test(EXP));
    check('sent: بطاقتا زيارتين في يومٍ واحد لا تُوسمان «حُفظت» بحفظ إحداهما',
          /if \(byReport\(key\) \|\| \(byTD && twin\.n === 1\)\)/.test(EXP) && /حُفظت إحدى زيارات اليوم/.test(EXP));
    check('card: البطاقة تعرض الصف والحصة ورقم الزيارة (مهروبة)',
          /الصف <bdi>\$\{esc\(fv\('class'\)\)\}<\/bdi>/.test(EXP) && /الحصة <bdi>\$\{esc\(fv\('lesson'\)\)\}<\/bdi>/.test(EXP) && /\$\{visitLine\}/.test(EXP));
    check('ui: زرّ «زيارة أخرى للمعلم نفسه» ونافذة السؤال في الصفحة وموصولان',
          HTML.includes('id="anotherVisitBtn"') && HTML.includes('id="svfVisitChoiceModal"') && HTML.includes('id="svfVisitChoiceNew"')
          && /anotherVisitBtn[\s\S]{0,200}supStartAnotherVisit\(\)/.test(INIT));
    check('ui: «زيارة أخرى» تُبقي المعلّم والمدرسة والتاريخ ثمّ تُصفّر',
          /function supStartAnotherVisit\(\)[\s\S]{0,400}teacherName: v\('teacherName'\), school: v\('school'\)[\s\S]{0,300}visitDate: v\('visitDate'\)[\s\S]{0,400}performReset\(\);/.test(SUP));
})();

/* ── ٧) السكربت (v17.4): يسجّل مفتاح التقرير ويضخّه إلى الموقع ── */
(function testScript() {
    let p;
    try { p = require('./_script-src.js'); } catch (e) { p = null; }
    if (!p || typeof p !== 'string') { console.log('SKIP script: المصدر المقروء غير موجود'); return; }
    const S = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const gm = {};
    const ctx = { console, JSON, GM_getValue: (k, d) => (k in gm ? gm[k] : d), GM_setValue: (k, v) => { gm[k] = v; } };
    vm.createContext(ctx);
    vm.runInContext(between(S, "    const SAVED_KEY = 'svf_saved_visits';", '    // ونظيرهما للزيارات المدرسيّة')
                    + '\nthis.rec = svfRecordSaved; this.keys = svfSavedReportsList; this.td = svfSavedList;', ctx);
    check('script: الزيارة الأولى تُسجَّل بمفتاحها', ctx.rec({ teacher: 'علي', date: '26/10/2026', key: 'k1' }) === true);
    check('script: الثانية في اليوم نفسه تُسجَّل أيضاً (مفتاحٌ جديد) — كانت تُهمل',
          ctx.rec({ teacher: 'علي', date: '26/10/2026', key: 'k2' }) === true
          && JSON.stringify(ctx.keys()) === '["k1","k2"]' && ctx.td().length === 1, JSON.stringify([ctx.keys(), ctx.td()]));
    check('script: تكرار الأولى لا يُسجَّل', ctx.rec({ teacher: 'علي', date: '26/10/2026', key: 'k1' }) === false);
    check('script: زيارةٌ بلا مفتاح (تصديرٌ قديم) تبقى بـ«المعلّم|التاريخ»', ctx.rec({ teacher: 'خالد', date: '1/11/2026' }) === true && ctx.td().length === 2);
    check('script: الضخّ إلى الموقع يشمل svf_sent_reports', /svfMergeInto\(SITE_SENT_REPORTS_KEY, svfSavedReportsList\(\)\)/.test(S)
          && /const SITE_SENT_REPORTS_KEY = 'svf_sent_reports';/.test(S));
    check('script: التصدير من النموذج يقرأ المفتاح من سمة الزرّ', /key: \(\$\('#exportToMoeBtn'\)\?\.dataset\?\.svfKey \|\| ''\)\.trim\(\)/.test(S));
    check('script: الإصدار 17.4 فأحدث', /@version\s+17\.([4-9]|\d\d)\b/.test(S));
})();

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
