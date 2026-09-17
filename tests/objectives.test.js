// اختبار انحدار لثبات الأهداف: node tests/objectives.test.js
//   الهدف يُحفظ بنصّه بعد تطبيق مفتاح الجنس ([معلم/معلمة/معلمين/معلمات])،
//   وكانت الاستعادة تطابق النصّ حرفاً بحرف والمفتاح لا يُحفظ — فمن حدّد أهدافه
//   بصيغةٍ ثمّ فتح التقرير بصيغةٍ أخرى وجدها بلا تحديد. يُشغَّل هنا كودُ
//   js/school.js نفسه على DOM مصغّر.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const TYPE = 'exploratory';
const OBJECTIVES = [
    'مقابلة [الفاضل/الفاضلة/الفاضل/الفاضلة] [مدير/مديرة/مدير/مديرة] المدرسة.',
    'الالتقاء بـ[معلم/معلمة/معلمي/معلمات] الرياضة المدرسية.',
    'متابعة تنفيذ خطة المنهاج والاطلاع على السجلات.'
];

function makeEnv(opts) {
    const o = opts || {};
    const mode0 = o.mode == null ? 0 : o.mode;
    const toasts = [];
    // مجموعة أزرارٍ دائريّة: اختيار واحدٍ يُلغي إخوته كما في المتصفّح
    const radios = [0, 1, 2, 3].map(v => {
        let on = (v === mode0);
        const r = { value: String(v) };
        Object.defineProperty(r, 'checked', {
            get: () => on,
            set: x => { on = !!x; if (on) radios.forEach(o => { if (o !== r) o.checked = false; }); }
        });
        return r;
    });
    let boxes = [];
    const notes = [];

    const container = {
        innerHTML: '',
        querySelectorAll: sel => (sel === '.objective-item' ? notes : [])
    };
    const document = {
        getElementById: id => (id === 'objectivesContainer' ? container : null),
        querySelectorAll: sel => {
            if (sel === 'input[name="objectives"]') return boxes;
            if (sel === '#objectivesContainer .objective-item') return notes;
            return [];
        },
        querySelector: sel => {
            if (sel === 'input[name="genderMode"]:checked') return radios.find(r => r.checked) || null;
            const m = sel.match(/name="genderMode"\]\[value="(\d)"/);
            if (m) return radios.find(r => r.value === m[1]) || null;
            return null;
        }
    };
    const ctx = {
        window: {}, document, console,
        localStorage: { length: 0, key: () => null, getItem: () => null, setItem: () => {} },
        showToast: (m, k) => toasts.push({ m, k }),
        schoolVisitTypesData: { [TYPE]: { name: 'زيارة استطلاعية', objectives: o.objectives || OBJECTIVES } },
        schoolClassroomVisits: [], schoolTeachers: [], objectiveNotes: {},
        schoolPrincipal: { name: '', gender: 'f' }, prevRecommendationsStatus: []
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8'), ctx);

    // الرسم الحقيقيّ يبني HTML؛ هنا يكفي أن تُعاد القيم بالصيغة الحاليّة
    const render = () => {
        const mode = Number((radios.find(r => r.checked) || { value: '0' }).value);
        boxes = (o.objectives || OBJECTIVES).map(t => ({
            value: ctx.applyGenderFilter(t, mode), checked: false
        }));
    };
    ctx.renderSchoolObjectives = render;
    render();
    return { ctx, radios, toasts, notes, boxes: () => boxes, render };
}

const resolve = (i, mode) => {
    const parts = OBJECTIVES[i].replace(/\[([^\]]+)\]/g, (m, s) => s.split('/')[mode]);
    return parts;
};

/* ── ١) المفتاح المحفوظ يُستعاد ومعه التحديد ── */
{
    const env = makeEnv({ mode: 0 });                       // فُتح والمفتاح «معلم»
    const saved = [resolve(1, 3), resolve(2, 3)];           // وحُفظ بصيغة «معلمات»
    env.ctx.restoreSchoolObjectives({ visitType: TYPE, genderMode: 3, objectives: saved });
    check('المفتاح يعود إلى ما حُفظ به', (env.radios.find(r => r.checked) || {}).value === '3',
          (env.radios.find(r => r.checked) || {}).value);
    const on = env.boxes().filter(b => b.checked).map(b => b.value);
    check('والهدفان يعودان محدَّدَين', on.length === 2 && saved.every(v => on.includes(v)), JSON.stringify(on));
    check('ولا تنبيه بفقدان شيء', env.toasts.length === 0, JSON.stringify(env.toasts));
}

/* ── ٢) تقريرٌ قديمٌ بلا مفتاح: يُستنتج من أهدافه ── */
{
    const env = makeEnv({ mode: 0 });
    const saved = [resolve(1, 2)];                          // صيغة «معلمي»
    env.ctx.restoreSchoolObjectives({ visitType: TYPE, objectives: saved });
    check('القديم: المفتاح يُستنتج', (env.radios.find(r => r.checked) || {}).value === '2',
          (env.radios.find(r => r.checked) || {}).value);
    check('القديم: وهدفه يعود محدَّداً', env.boxes().filter(b => b.checked).map(b => b.value)[0] === saved[0]);
}

/* ── ٣) هدفٌ بلا صيغ جنسٍ يُطابَق كما هو، ولا يُغيَّر المفتاح بلا داعٍ ── */
{
    const env = makeEnv({ mode: 1 });
    env.ctx.restoreSchoolObjectives({ visitType: TYPE, genderMode: 1, objectives: [resolve(2, 1)] });
    check('المفتاح نفسه لا يُعاد رسمه بلا سبب', (env.radios.find(r => r.checked) || {}).value === '1');
    check('والهدف الثابت يُطابَق', env.boxes().filter(b => b.checked).length === 1);
}

/* ── ٤) هدفٌ حُذف من الإعدادات بعد الحفظ: يُقال ولا يُسكت عنه ── */
{
    const env = makeEnv({ mode: 0, objectives: [OBJECTIVES[0]] });
    env.ctx.restoreSchoolObjectives({ visitType: TYPE, genderMode: 0, objectives: [resolve(0, 0), 'هدفٌ حُذف من القائمة'] });
    check('المفقود يُنبَّه عليه', env.toasts.some(t => /لم تعد في قائمة هذا النوع/.test(t.m)), JSON.stringify(env.toasts));
    check('والباقي يُحدَّد', env.boxes().filter(b => b.checked).length === 1);
}

/* ── ٥) ملاحظات الأهداف تُقرأ من النموذج لحظة الحفظ ── */
{
    const env = makeEnv({});
    env.notes.push({ querySelector: () => ({ value: ' ملاحظة الأول ' }) },
                   { querySelector: () => ({ value: '   ' }) });
    const notes = env.ctx.collectObjectiveNotes();
    check('الملاحظة تُقرأ ويُشذَّب فراغها', notes['0'] === 'ملاحظة الأول', JSON.stringify(notes));
    check('والفارغة لا تُحفظ', !('1' in notes), JSON.stringify(notes));
}

/* ── ٦) التوصيل: الحفظ يكتب المفتاح والملاحظات، والفتح يستعيدهما ── */
{
    const sch = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
    check('wiring: التقرير يحفظ مفتاح الجنس', /genderMode: getGenderMode\(\)/.test(sch));
    check('wiring: ويحفظ ملاحظات الأهداف', /objectiveNotes: collectObjectiveNotes\(\)/.test(sch));
    check('wiring: الفتح يستعيد الملاحظات ولا يرثها من تقريرٍ آخر',
          /objectiveNotes = \(report\.objectiveNotes && typeof report\.objectiveNotes === 'object'\)/.test(sch));
    check('wiring: المفتاح يُضبط قبل رسم الأهداف',
          /genderMode"\]\[value="\$\{report\.genderMode\}"[\s\S]{0,300}?renderSchoolObjectives\(report\.visitType\)/.test(sch));
    check('wiring: المسارَان يستعيدان بالدالّة نفسها',
          (sch.match(/restoreSchoolObjectives\(report\);/g) || []).length === 2,
          String((sch.match(/restoreSchoolObjectives\(report\);/g) || []).length));
    check('wiring: لم تبقَ استعادةٌ تطابق النصّ حرفاً بحرف وحده',
          !/Array\.from\(document\.querySelectorAll\('input\[name="objectives"\]'\)\)\.find/.test(sch));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
