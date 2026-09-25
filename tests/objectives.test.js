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

/* ── ٧) تعديل نصّ الهدف (منذ 2026-09-25): يُبقي المشرف الرقم الثابت، ── */
/*      ويعدّل الجسم وحده — يُختبر نفس النمط الذي يستعمله renderSchoolObjectives */
{
    // النمط مستخرَجٌ من المصدر نفسه، فتغييره هناك يُفشل هذا الاختبار لا يُخفيه
    const sch = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
    const m = sch.match(/const numMatch = resolved\.match\((\/\^\([^)]*\)\([^)]*\)\$\/[a-z]*)\);/);
    check('wiring: نمط تقسيم الرقم عن الجسم موجودٌ بالصيغة المتوقَّعة', !!m, m ? m[1] : 'لم يوجد');
    if (m) {
        const rx = eval(m[1]);   // النمط الحرفيّ من الملفّ نفسه لا نسخةٌ يدويّة عنه
        const split = full => { const mm = full.match(rx); return mm ? [mm[1], mm[2]] : ['', full]; };

        check('التقسيم: رقمٌ غربيٌّ عاديّ', JSON.stringify(split('3- نصّ الهدف')) === JSON.stringify(['3- ', 'نصّ الهدف']));
        check('التقسيم: شرطة الفصل الطويلة –', JSON.stringify(split('3– نصّ الهدف')) === JSON.stringify(['3– ', 'نصّ الهدف']));
        check('التقسيم: أرقامٌ هنديّة ١٢-', JSON.stringify(split('١٢- نصّ الهدف')) === JSON.stringify(['١٢- ', 'نصّ الهدف']));
        check('التقسيم: بلا مسافةٍ بعد الشرطة', JSON.stringify(split('3-نصّ')) === JSON.stringify(['3-', 'نصّ']));
        check('التقسيم: نصٌّ بلا رقمٍ يبقى جسماً كاملاً بلا قطع', JSON.stringify(split('نصٌّ بلا رقم')) === JSON.stringify(['', 'نصٌّ بلا رقم']));
        check('التقسيم: سطرٌ آخر داخل الجسم لا يُقطع عنده (dotall)',
              split('3- سطرٌ أوّل\nسطرٌ ثانٍ')[1] === 'سطرٌ أوّل\nسطرٌ ثانٍ', JSON.stringify(split('3- سطرٌ أوّل\nسطرٌ ثانٍ')));
    }
}

/* ── ٨) collectObjectiveEdits: يُقرأ من الحقل مباشرةً لا من الحالة، فتعديلٌ ── */
/*      لم يُغادَر حقلُه بعد لا يضيع؛ والعودة إلى النصّ الافتراضيّ لا تُسجَّل تعديلاً */
{
    const els = (arr) => ({
        querySelectorAll: sel => sel === '#objectivesContainer .objective-item' ? arr : []
    });
    const mkItem = ({ def, display, editing, body, editInput }) => ({
        dataset: { default: def },
        querySelector(sel) {
            if (sel === '.obj-editing') return { classList: { contains: c => c === 'hidden' && !editing } };
            if (sel === '.obj-display span, .obj-editing span') return { textContent: (def.match(/^([\d٠-٩]+\s*[-–]\s*)/) || [''])[0] };
            if (sel === '.obj-edit-input') return { value: editInput };
            if (sel === '.obj-text') return { textContent: body };
            return null;
        }
    });
    const runWith = items => {
        const doc = els(items);
        // نسخةٌ مباشرةٌ من منطق الدالّة الحقيقيّة عبر تشغيلها فعلاً من الملفّ
        const sch = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
        const start = sch.indexOf('function collectObjectiveEdits()');
        const end = sch.indexOf('\n        }', start) + '\n        }'.length;
        const ctx = { document: doc };
        vm.createContext(ctx);
        vm.runInContext(sch.slice(start, end) + '\nout = collectObjectiveEdits;', ctx);
        return ctx.out();
    };

    // body/editInput هنا هما ما يحمله .obj-text/.obj-edit-input فعلاً في DOM الحقيقيّ:
    // الجسم وحده بلا الرقم — الرقم في <span> منفصلة، وcollectObjectiveEdits تضمّهما
    const prefix = '2- ';
    const def = prefix + 'النصّ الافتراضيّ';
    const edits1 = runWith([mkItem({ def, editing: false, body: 'نصٌّ مُعدَّل' })]);
    check('عنصرٌ معدَّلٌ ومُغلَقٌ يُجمَع من نصّ التسمية', edits1['0'] === prefix + 'نصٌّ مُعدَّل', JSON.stringify(edits1));

    const edits2 = runWith([mkItem({ def, editing: true, editInput: 'نصٌّ لم يُغادَر حقلُه' })]);
    check('عنصرٌ لا يزال حقل تعديله مفتوحاً يُقرأ من الحقل نفسه',
          edits2['0'] === prefix + 'نصٌّ لم يُغادَر حقلُه', JSON.stringify(edits2));

    const edits3 = runWith([mkItem({ def, editing: false, body: 'النصّ الافتراضيّ' })]);
    check('نصٌّ أُعيد إلى الافتراضيّ لا يُسجَّل تعديلاً', !('0' in edits3), JSON.stringify(edits3));

    const edits4 = runWith([mkItem({ def, editing: false, body: 'أ' }), mkItem({ def: prefix + 'ب', editing: false, body: 'ب' })]);
    check('عنصرٌ ثانٍ غير معدَّلٍ لا يظهر مع الأوّل المعدَّل', edits4['0'] === prefix + 'أ' && !('1' in edits4), JSON.stringify(edits4));
}

/* ── ٩) التوصيل: الحفظ والاستعادة والرسم والنقر لا يخلّ بتحديد المربّع ── */
{
    const sch = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
    check('wiring: الحفظ يجمع تعديلات الأهداف', /objectiveEdits: collectObjectiveEdits\(\)/.test(sch));
    check('wiring: تعديلٌ مفتوحٌ يُغادَر قسراً قبل الحفظ فلا يضيع',
          /obj-editing[\s\S]{0,200}obj-edit-input'\)\?\.blur\(\)/.test(sch));
    check('wiring: الاستعادة تضبط تعديلات الأهداف قبل الرسم (المساران معاً)',
          (sch.match(/objectiveEdits = \(report\.objectiveEdits && typeof report\.objectiveEdits === 'object'\)/g) || []).length === 2);
    check('wiring: الرسم يستعمل التعديل المحفوظ إن وُجد بدل النصّ الافتراضيّ',
          /const edited = objectiveEdits\[index\];[\s\S]{0,60}const resolved = edited !== undefined \? edited : defaultResolved;/.test(sch));
    // الحقل النصّي لم يعد ملفوفاً بأكمله داخل <label for> — وإلّا كانت أيّ نقرةٍ على
    // النصّ تُبدّل تحديد المربّع، وهو عين ما طلب المستخدم تفاديه
    check('wiring: النصّ خارج <label>، فالنقر عليه لا يُبدّل التحديد',
          !/<label for="obj-\$\{index\}"[^>]*>\$\{schoolRouteEsc\(prefix\)\}/.test(sch)
          && /<label for="obj-\$\{index\}" class="sr-only">/.test(sch));
    check('wiring: زرّ النصّ من نوعٍ لا يُقدِّم نموذجاً عرضاً (type="button")',
          /class="obj-text[^"]*"[^>]*title="اضغط لتعديل نصّ الهدف"/.test(sch) && /<button type="button" class="obj-text/.test(sch));
    check('wiring: Enter وEscape كلاهما يُغادر الحقل عبر blur() — لا يُخفيان الصفّ مباشرةً',
          /if \(e\.key === 'Enter'\)[\s\S]{0,40}editInput\.blur\(\);/.test(sch)
          && /else if \(e\.key === 'Escape'\)[\s\S]{0,60}editInput\.blur\(\);/.test(sch));
    // .hidden على Tailwind تعني display:none، وإخفاء عنصرٍ مركَّزٍ يُفقده التركيز
    // فيُطلق blur تلقائيّاً — فلو أخفى Escape الصفّ مباشرةً بلا هذا العلَم لأُطلق
    // commit() بنصٍّ لم يُغادَر بعد، فيُحفظ ما ضغط المستخدم Escape ليتراجع عنه بالذات
    check('wiring: Escape يمنع الحفظ عبر علَمٍ يتجاوزه blur التلقائيّ الناتج عن إخفاء الحقل',
          /let cancelling = false;/.test(sch)
          && /else if \(e\.key === 'Escape'\)[\s\S]{0,50}cancelling = true;/.test(sch)
          && /const commit = \(\) => \{[\s\S]{0,300}if \(cancelling\) \{ cancelling = false; return; \}/.test(sch));
    check('wiring: نصٌّ فارغٌ عند المغادرة يُلغى صامتاً ولا يُفرَّغ قيمة المربّع',
          /const commit = \(\) => \{[\s\S]{0,320}if \(!newBody\) return;/.test(sch));
    check('wiring: شارة «معدَّل» تُرجع النصّ الافتراضيّ عند النقر',
          /badge\.addEventListener\('click', \(\) => \{[\s\S]{0,220}cb\.value = item\.dataset\.default;/.test(sch));
    // كلّ نصٍّ يُدرَج في DOM يُهرَّب — لا يكفي تشذيب علامة الاقتباس وحدها كما كان سابقاً
    check('wiring: النصّ المُدرَج (الافتراضيّ والمعدَّل) مهروبٌ بدالّة الهروب العامّة',
          /schoolRouteEsc\(prefix\)/.test(sch) && /schoolRouteEsc\(body\)/.test(sch));
    check('wiring: قيمة صندوق الاختيار تبقى النصّ الكامل — الحفظ يقرأها كما هي بلا تغيير',
          /reportForm\.querySelectorAll\('input\[name="objectives"\]:checked'\)\.forEach\(cb => objectives\.push\(cb\.value\)\)/.test(sch));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
