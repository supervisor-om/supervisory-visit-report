// اختبار انحدار: node tests/school-escape.test.js
// نصوص المستخدم (وما يصل من أجهزةٍ أخرى بالمزامنة) لا تدخل HTML خاماً في
// الزيارة المدرسيّة: بطاقة الأرشيف، وطاقم المدرسة، والمواقف الصفّيّة،
// وتوصيات الزيارة السابقة، وأنواع الزيارات.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const SCHOOL = read('js/school.js');
const UTILS = read('js/utils.js');
const EVIL = 'مدرسة <img src=x onerror="alert(1)"> "أ"';

function mkEl() {
    return {
        className: '', innerHTML: '', value: '', children: [],
        appendChild(c) { this.children.push(c); return c; },
        querySelectorAll: () => [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {}
    };
}

// بيئةٌ صغيرةٌ تكفي دوالّ الرسم في school.js
function env(store) {
    const made = [];
    const containers = {};
    const get = id => (containers[id] = containers[id] || mkEl());
    const ctx = {
        console,
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem(k, v) { store[k] = String(v); },
            removeItem(k) { delete store[k]; },
            key: i => Object.keys(store)[i] ?? null,
            get length() { return Object.keys(store).length; }
        },
        document: {
            querySelector: sel => {
                if (sel === '#schoolDashboardView #reportsListContainer') return get('reportsList');
                if (sel.startsWith('#')) return get(sel.slice(1));
                return null;
            },
            getElementById: id => get(id),
            querySelectorAll: () => [],
            createElement: () => { const e = mkEl(); made.push(e); return e; },
            addEventListener() {}
        },
        window: {},
        showToast() {},
        schoolVisitTypesData: { t1: { name: 'استطلاعية <b>خاصة</b>', objectives: ['هدف <i>أوّل</i>'] } },
        schoolClassroomVisits: [],
        schoolTeachers: [],
        evaluationItems: []
    };
    ctx.self = ctx;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(UTILS, ctx);
    vm.runInContext(SCHOOL, ctx);
    return { ctx, made, get, html: () => made.map(e => e.innerHTML).join('') };
}

/* ── ١) بطاقة الزيارة المدرسيّة في الأرشيف ── */
{
    const e = env({
        'supervision_v6_school_report_1': JSON.stringify({
            schoolName: EVIL, visitDate: '2026-09-22', visitType: 't1', objectives: ['أ']
        })
    });
    vm.runInContext('renderSchoolReportsList();', e.ctx);
    const html = e.html();
    check('card: اسم المدرسة يدخل مُهرَّباً',
          html.includes('&lt;img src=x') && !html.includes('<img src=x'), 'دخل خاماً');
    check('card: الاقتباس في الاسم مُهرَّب', html.includes('&quot;أ&quot;'), 'لم يُهرَّب');
    check('card: اسم نوع الزيارة مُهرَّب',
          html.includes('استطلاعية &lt;b&gt;خاصة&lt;/b&gt;') && !html.includes('<b>خاصة</b>'));
    check('card: الاسم ما زال ظاهراً للمستخدم', html.includes('مدرسة'), 'اختفى');
}

/* ── ٢) طاقم المدرسة ── */
{
    const e = env({});
    e.ctx.schoolTeachers = [{ name: 'معلم <script>x</script>', gender: 'm', load: '18<b>', grades: '5-12', section: 'ذكور<i>' }];
    vm.runInContext('renderSchoolTeachers();', e.ctx);
    const html = e.get('schoolTeachersList').innerHTML + e.html();
    check('roster: اسم المعلّم مُهرَّب',
          html.includes('&lt;script&gt;') && !html.includes('<script>x'), 'دخل خاماً');
    check('roster: النصاب والفئة مُهرَّبان',
          html.includes('18&lt;b&gt;') && html.includes('ذكور&lt;i&gt;'), 'لم تُهرَّب');
}

/* ── ٣) المواقف الصفّيّة ── */
{
    const e = env({});
    e.ctx.schoolClassroomVisits = [{ teacher: 'معلم <script>y</script>', grade: '7<b>', period: '3', subject: 'رياضة', rating: 'جيد' }];
    vm.runInContext('renderSchoolClassroomVisits();', e.ctx);
    const html = e.get('classroomVisitsList').innerHTML + e.html();
    check('classroom: اسم المعلّم والصفّ مُهرَّبان',
          html.includes('&lt;script&gt;') && html.includes('7&lt;b&gt;') && !html.includes('<script>y'), 'دخل خاماً');
}

/* ── ٤) المصدر: موضعٌ واحدٌ للتهريب، ولا نصَّ خامٌّ باقٍ ── */
{
    check('esc: schoolRouteEsc يفوّض إلى svfEscapeHtml في utils.js',
          /function schoolRouteEsc[\s\S]{0,260}svfEscapeHtml\(s\)/.test(SCHOOL));
    check('esc: بطاقة الأرشيف لا تُدرج الاسم خاماً',
          !/\$\{report\.schoolName \|\| 'بدون اسم'\}/.test(SCHOOL));
    check('esc: صفّ الطاقم لا يُدرج الاسم خاماً', !/\$\{t\.name \|\| '-'\}/.test(SCHOOL));
    check('esc: صفّ الموقف الصفّيّ لا يُدرج المعلّم خاماً', !/\$\{visit\.teacher \|\| '-'\}/.test(SCHOOL));
    check('esc: توصيات الزيارة السابقة مُهرَّبة', /\$\{idx \+ 1\}\. \$\{schoolRouteEsc\(rec\)\}/.test(SCHOOL));
    check('esc: أسماء أنواع الزيارات وأهدافها مُهرَّبة',
          /schoolRouteEsc\(type\.name\)/.test(SCHOOL) && /schoolRouteEsc\(obj\)/.test(SCHOOL));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
