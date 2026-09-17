// اختبار انحدار للمواقف الصفّيّة: node tests/classroom.test.js
//   ١) اشتقاق الصفوف المقترحة من صيغة القاعدة («5-12»، «9،10»، الخطأ)
//   ٢) اختيار المعلّم: تهجئة القاعدة تغلب المكتوب، والملتبس لا يُختار عنه
//   ٣) بيانات المعلّم تُحفظ مع الموقف الصفّيّ ليُبنى منها التقرير الإشرافيّ
//   ٤) وسم «له تقرير إشرافي» يقرأ الأرشيف الحقيقيّ بالاسم والتاريخ
//   ٥) بناء التقرير الإشرافيّ: الحقول، والجنس، وحماية ما لم يُحفظ
//   ٦) التوصيل: الملف مربوطٌ بالصفحة والتهيئة وعامل الخدمة، وschool.js ينادي
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ── بيئة متصفّحٍ مصغّرة تكفي لتشغيل الشيفرة الحقيقيّة ── */
function makeEl(id, tag) {
    const node = {
        id, tagName: tag || 'INPUT', value: '', checked: false, textContent: '',
        attrs: {}, listeners: {}, children: [], classes: new Set(),
        setAttribute(k, v) { this.attrs[k] = v; },
        removeAttribute(k) { delete this.attrs[k]; },
        getAttribute(k) { return this.attrs[k]; },
        addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
        dispatchEvent(e) { (this.listeners[e.type] || []).forEach(fn => fn(e)); return true; },
        appendChild(c) { this.children.push(c); if (this.adopt) this.adopt(c); return c; },
        insertBefore(c) { this.children.unshift(c); if (this.adopt) this.adopt(c); return c; },
        classList: { add() {}, remove() {}, toggle() {} },
        reset() { this.didReset = true; },
        get firstChild() { return this.children[0] || null; }
    };
    // innerHTML = '' يُفرّغ الأبناء كما في المتصفّح — وعليه تعتمد إعادة بناء القوائم
    Object.defineProperty(node, 'innerHTML', {
        get() { return this._html || ''; },
        set(v) { this._html = v; if (!v) this.children.length = 0; }
    });
    return node;
}

function makeEnv(opts) {
    const o = opts || {};
    const ids = ['cvTeacher', 'cvGrade', 'cvPeriod', 'cvSubject', 'schoolName', 'schoolVisitDate',
                 'teacherName', 'school', 'fileNumber', 'visitDate', 'lesson', 'class', 'topic',
                 'subject', 'visitorName', 'evaluationForm', 'reportSection', 'form-view',
                 'supervisoryVisitsApp', 'schoolVisitsApp'];
    const els = {};
    ids.forEach(i => { els[i] = makeEl(i); });
    const adopt = c => { if (c && c.id) els[c.id] = c; return c; };
    els['form-view'].adopt = adopt;
    const radios = { '0': makeEl('genderMale'), '1': makeEl('genderFemale') };
    ['0', '1'].forEach(v => {
        let on = (v === '0');
        Object.defineProperty(radios[v], 'checked', {
            get: () => on,
            set: x => { on = !!x; if (on) { const other = v === '0' ? '1' : '0'; radios[other].checked = false; } }
        });
    });
    const store = Object.assign({}, o.storage || {});
    const toasts = [], views = [];

    const document = {
        getElementById: id => els[id] || null,
        createElement: tag => { const e = makeEl('', tag.toUpperCase()); e.adopt = adopt; return e; },
        body: (function () { const b = makeEl('body', 'BODY'); b.adopt = adopt; return b; })(),
        querySelectorAll: sel => {
            if (sel.indexOf('#classroomVisitsList') === 0) return o.rowButtons || [];
            if (sel.indexOf('#form-view') === 0) return o.formFields || [];
            return [];
        },
        querySelector: sel => {
            const m = sel.match(/value="(\d)"/);
            if (m) return radios[m[1]];
            return null;
        }
    };
    const localStorage = {
        get length() { return Object.keys(store).length; },
        key: i => Object.keys(store)[i],
        getItem: k => (k in store ? store[k] : null)
    };
    const ctx = {
        window: {}, document, localStorage, console,
        Event: function (type) { this.type = type; },
        confirm: o.confirm || (() => true),
        showToast: (m, k) => toasts.push({ m, k }),
        showView: v => views.push(v && v.id),
        toggleSupervisoryView: v => views.push('view:' + v),
        schoolClassroomVisits: o.visits || [],
        currentEditingKey: 'stale-key',
        evaluationItems: [],
        updateScore: () => {},
        generateDescriptionText: () => '',
        SupervisorIdentity: o.identity || null
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    if (o.identity) ctx.window.SupervisorIdentity = o.identity;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/classroom.js'), 'utf8'), ctx);
    return { ctx, els, radios, toasts, views, store };
}

// قاعدةٌ صغيرةٌ بسلوك identity.js نفسه: «بن» تسقط في المطابقة
const norm = s => String(s || '').split(/\s+/).filter(w => w && w !== 'بن' && w !== 'بنت').join(' ').trim();
function fakeDb(rows) {
    return {
        getIdentity: () => ({ id: 'asad' }),
        normName: norm,
        getTeachers: () => rows,
        teachersOfSchool: s => rows.filter(r => norm(r.school) === norm(s)),
        findTeacher: n => { const hits = rows.filter(r => norm(r.name) === norm(n)); return { matches: hits, teacher: hits.length === 1 ? hits[0] : null }; }
    };
}

const SARAH = { name: 'سارة بنت علي الهنائية', school: 'مدرسة الوفاء (5-12)', grades: '5-12', fileNumber: '16203690', gender: 'f', load: '22' };
const KHALED = { name: 'خالد بن سعيد البلوشي', school: 'مدرسة النهضة (1-4)', grades: '9، 11', fileNumber: '9988776', gender: 'm', load: '18' };
const TWIN = { name: 'سارة بنت علي الهنائية', school: 'مدرسة النهضة (1-4)', grades: '1-4', fileNumber: '1111111', gender: 'f' };

/* ── ١) الصفوف المقترحة ── */
{
    const { ctx, els } = makeEnv({ identity: fakeDb([SARAH, KHALED]) });
    ctx.svfClassroomInit();
    els.schoolName.value = 'مدرسة الوفاء (5-12)';
    els.cvTeacher.value = 'سارة بنت علي الهنائية';
    els.cvTeacher.dispatchEvent(new ctx.Event('change'));
    const list = () => ctx.document.getElementById('svfCvGrades');
    check('النطاق «5-12» يُفتح إلى ثمانية صفوف', !!list() && list().children.length === 8, list() && String(list().children.length));
    check('وأوّلها ٥ وآخرها ١٢', list().children[0].value === '5' && list().children[7].value === '12');
    check('وحقل الصف يُربط بالقائمة', els.cvGrade.getAttribute('list') === 'svfCvGrades');

    els.schoolName.value = 'مدرسة النهضة (1-4)';
    els.cvTeacher.value = 'خالد بن سعيد البلوشي';
    els.cvTeacher.dispatchEvent(new ctx.Event('change'));
    check('المتقطّع «9، 11» يبقى صفّين', list().children.map(c => c.value).join(',') === '9,11', list().children.map(c => c.value).join(','));

    els.cvTeacher.value = 'معلّمٌ ليس في القاعدة';
    els.cvTeacher.dispatchEvent(new ctx.Event('change'));
    check('غير المعروف: لا قائمة صفوفٍ ولا ربط', list().children.length === 0 && !els.cvGrade.getAttribute('list'));

    const p = ctx.document.getElementById('svfCvPeriods');
    check('الحصص ثمانٍ (1)–(8)', p && p.children.length === 8 && p.children[7].value === '8');
    check('وحقل الحصة مربوطٌ بها', els.cvPeriod.getAttribute('list') === 'svfCvPeriods');
}

/* ── ٢) اختيار المعلّم ── */
{
    const { ctx, els } = makeEnv({ identity: fakeDb([SARAH, KHALED]) });
    ctx.svfClassroomInit();
    els.cvTeacher.value = 'سارة علي الهنائية';           // بلا «بنت»
    els.cvTeacher.dispatchEvent(new ctx.Event('change'));
    check('الاسم يُردّ إلى تهجئة القاعدة', els.cvTeacher.value === SARAH.name, els.cvTeacher.value);

    const twin = makeEnv({ identity: fakeDb([SARAH, TWIN]) });
    twin.ctx.svfClassroomInit();
    twin.els.schoolName.value = 'مدرسة الوفاء (5-12)';
    twin.els.cvTeacher.value = 'سارة بنت علي الهنائية';
    twin.els.cvTeacher.dispatchEvent(new twin.ctx.Event('change'));
    check('الاسم المكرَّر يُحسم بمدرسة الزيارة', twin.ctx.svfCvMeta('سارة بنت علي الهنائية').teacherFile === '16203690',
          JSON.stringify(twin.ctx.svfCvMeta('سارة بنت علي الهنائية')));

    twin.els.schoolName.value = '';
    check('وبلا مدرسةٍ لا يُختار عن الملتبس', Object.keys(twin.ctx.svfCvMeta('سارة بنت علي الهنائية')).length === 0);

    const off = makeEnv({});                              // بلا ربط
    off.ctx.svfClassroomInit();
    off.els.cvTeacher.value = 'أيّ اسم';
    off.els.cvTeacher.dispatchEvent(new off.ctx.Event('change'));
    check('بلا ربطٍ: الاسم كما كُتب ولا بيانات', off.els.cvTeacher.value === 'أيّ اسم' && Object.keys(off.ctx.svfCvMeta('أيّ اسم')).length === 0);
}

/* ── ٣) ما يُحفظ مع الموقف الصفّيّ ── */
{
    const { ctx, els } = makeEnv({ identity: fakeDb([SARAH, KHALED]) });
    els.schoolName.value = 'مدرسة الوفاء (5-12)';
    const meta = ctx.svfCvMeta('سارة علي الهنائية');
    check('رقم الملف يُحفظ مع الموقف', meta.teacherFile === '16203690', JSON.stringify(meta));
    check('والجنس واسم المدرسة', meta.gender === 'f' && meta.teacherSchool === SARAH.school, JSON.stringify(meta));
    check('والاسم بتهجئة القاعدة', meta.teacherName === SARAH.name);
}

/* ── ٤) وسم «له تقرير إشرافي» ── */
{
    const storage = {
        'supervision_v6_visit_1': JSON.stringify({ teacherName: 'سارة بنت علي الهنائية', visitDate: '2026-09-17' }),
        'supervision_v6_school_report_1': JSON.stringify({ schoolName: 'مدرسة الوفاء' })
    };
    const { ctx, els } = makeEnv({ identity: fakeDb([SARAH]), storage });
    els.schoolVisitDate.value = '2026-09-17';
    check('الوسم يظهر لمن له تقريرٌ في اليوم نفسه',
          /له تقرير إشرافي/.test(ctx.svfCvActions({ teacher: 'سارة بنت علي الهنائية' }, 0)));
    check('و«بن» لا تُسقط الوسم', /له تقرير إشرافي/.test(ctx.svfCvActions({ teacher: 'سارة علي الهنائية' }, 0)));
    check('ومن لا تقرير له يُعرض له الزرّ', /cv-sup-btn/.test(ctx.svfCvActions({ teacher: 'خالد بن سعيد البلوشي' }, 1)));
    els.schoolVisitDate.value = '2026-09-18';
    check('واليوم الآخر زرٌّ لا وسم', /cv-sup-btn/.test(ctx.svfCvActions({ teacher: 'سارة بنت علي الهنائية' }, 0)));
    check('ورقم الصفّ يُنقل إلى الزرّ', /data-cv="3"/.test(ctx.svfCvActions({ teacher: 'خالد' }, 3)));
}

/* ── ٥) بناء التقرير الإشرافيّ ── */
function buildEnv(extra) {
    const visits = [{ teacher: 'سارة بنت علي الهنائية', teacherName: 'سارة بنت علي الهنائية', teacherFile: '16203690',
                      gender: 'f', teacherSchool: 'مدرسة الوفاء (5-12)', grade: '7', period: '3',
                      subject: 'المهارات الحركية', rating: 'ممتاز' }];
    const env = makeEnv(Object.assign({ identity: fakeDb([SARAH]), visits }, extra || {}));
    env.ctx.svfClassroomInit();
    env.els.schoolName.value = 'مدرسة الوفاء (5-12)';
    env.els.schoolVisitDate.value = '2026-09-17';
    env.buttons = [];
    return env;
}
{
    const env = buildEnv();
    // الزرّ يُربط كما يفعل school.js بعد الرسم
    const btn = makeEl('b', 'BUTTON'); btn.dataset = { cv: '0' };
    env.ctx.document.querySelectorAll = sel => (sel.indexOf('#classroomVisitsList') === 0 ? [btn] : []);
    env.ctx.svfBindCvActions();
    btn.dispatchEvent(new env.ctx.Event('click'));

    check('يُفتح تطبيق الزيارات الإشرافيّة على النموذج',
          env.views.includes('supervisoryVisitsApp') && env.views.includes('view:form-view'), env.views.join(','));
    check('اسم المعلّم', env.els.teacherName.value === 'سارة بنت علي الهنائية', env.els.teacherName.value);
    check('المدرسة', env.els.school.value === 'مدرسة الوفاء (5-12)', env.els.school.value);
    check('رقم الملف من القاعدة', env.els.fileNumber.value === '16203690', env.els.fileNumber.value);
    check('تاريخ الزيارة هو تاريخ الزيارة المدرسيّة', env.els.visitDate.value === '2026-09-17', env.els.visitDate.value);
    check('الحصّة والصفّ', env.els.lesson.value === '3' && env.els['class'].value === '7');
    check('عنوان الدرس من المهارة', env.els.topic.value === 'المهارات الحركية', env.els.topic.value);
    check('والمادّة «الرياضة المدرسية»', env.els.subject.value === 'الرياضة المدرسية', env.els.subject.value);
    check('الجنس أنثى من القاعدة', env.radios['1'].checked === true && env.radios['0'].checked === false);
    check('مفتاح التعديل يُصفَّر فلا يُكتب فوق تقريرٍ آخر', env.ctx.currentEditingKey === null, String(env.ctx.currentEditingKey));
    check('ونموذج التقييم يُصفَّر', env.els.evaluationForm.didReset === true);
    const bar = env.ctx.document.getElementById('cvOriginBar');
    check('وشريط «من زيارة مدرسية» يتصدّر النموذج',
          !!bar && env.els['form-view'].children[0] === bar &&
          /مدرسة الوفاء/.test(env.ctx.document.getElementById('cvOriginText').textContent), bar && bar.id);
    env.ctx.document.getElementById('cvBackToSchool').dispatchEvent(new env.ctx.Event('click'));
    check('وزرّه يرجع إلى الزيارة المدرسيّة', env.views[env.views.length - 1] === 'schoolVisitsApp', env.views.join(','));
}
{
    const env = buildEnv({ confirm: () => false });
    env.els.teacherName.value = 'معلّمٌ آخر لم يُحفظ';
    env.ctx.document.querySelectorAll = () => [];
    const before = env.els.visitDate.value;
    const btn = makeEl('b', 'BUTTON'); btn.dataset = { cv: '0' };
    env.ctx.document.querySelectorAll = sel => (sel.indexOf('#classroomVisitsList') === 0 ? [btn] : []);
    env.ctx.svfBindCvActions();
    btn.dispatchEvent(new env.ctx.Event('click'));
    check('رفضُ الاستبدال يُبقي التقرير المفتوح كما هو',
          env.els.teacherName.value === 'معلّمٌ آخر لم يُحفظ' && env.els.visitDate.value === before);
}
{
    const env = buildEnv();
    env.els.schoolVisitDate.value = '';
    const btn = makeEl('b', 'BUTTON'); btn.dataset = { cv: '0' };
    env.ctx.document.querySelectorAll = sel => (sel.indexOf('#classroomVisitsList') === 0 ? [btn] : []);
    env.ctx.svfBindCvActions();
    btn.dispatchEvent(new env.ctx.Event('click'));
    check('بلا تاريخ زيارةٍ: لا يُفتح النموذج ويُبلَّغ',
          env.views.length === 0 && env.toasts.some(t => t.k === 'error'), JSON.stringify(env.toasts));
}
{
    const env = makeEnv({ visits: [{ teacher: 'معلّمٌ يدويّ', grade: '6', period: '2', subject: 'الوثب' }] });
    env.ctx.svfClassroomInit();
    env.els.schoolName.value = 'مدرسة بلا ربط';
    env.els.schoolVisitDate.value = '2026-09-17';
    const btn = makeEl('b', 'BUTTON'); btn.dataset = { cv: '0' };
    env.ctx.document.querySelectorAll = sel => (sel.indexOf('#classroomVisitsList') === 0 ? [btn] : []);
    env.ctx.svfBindCvActions();
    btn.dispatchEvent(new env.ctx.Event('click'));
    check('بلا ربطٍ بالقاعدة: الزرّ يعمل بما كُتب يدوياً',
          env.els.teacherName.value === 'معلّمٌ يدويّ' && env.els['class'].value === '6' && env.els.lesson.value === '2');
    check('وبلا رقم ملفٍّ ولا تغيير جنس', env.els.fileNumber.value === '' && env.radios['0'].checked === true);
}

/* ── ٦) التوصيل ── */
{
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const school = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
    check('wiring: classroom.js يُحمَّل بعد identity/autofill',
          html.indexOf('js/classroom.js') > html.indexOf('js/autofill.js') &&
          html.indexOf('js/classroom.js') < html.indexOf('js/init.js'));
    check('wiring: init.js يستدعي svfClassroomInit', /svfClassroomInit\(\)/.test(init));
    check('wiring: عامل الخدمة يخزّن الملف', sw.includes("'./js/classroom.js'"));
    check('wiring: صفّ الموقف الصفّيّ يعرض الزرّ', /svfCvActions === 'function'/.test(school));
    check('wiring: الأزرار تُربط بعد الرسم', /svfBindCvActions === 'function'/.test(school));
    check('wiring: الإضافة تحفظ بيانات القاعدة', /svfCvMeta === 'function'/.test(school));
    check('wiring: ولا تُستدعى performReset من هنا', !/performReset/.test(fs.readFileSync(path.join(ROOT, 'js/classroom.js'), 'utf8').replace(/\/\/.*/g, '')));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
