// اختبار: node tests/evidence.test.js
// أدلّة البنود المطوّرة (js/evidence.js — مراجعة 2026-11-01): البيانات، والاختيار، والوصف، والتوصيات المرتبطة بالأدلّة،
// والتوصيل في js/supervisory.js — لأصحابها وحدهم (gate.js: EVIDENCE_OWNERS)، وغيرهم على قوائم templates.js كما كانت.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const V = require(path.join(ROOT, 'js/evidence.js'));
const SUP = fs.readFileSync(path.join(ROOT, 'js/supervisory.js'), 'utf8').replace(/\r\n/g, '\n');
const TPL = fs.readFileSync(path.join(ROOT, 'js/templates.js'), 'utf8');
const GATE = fs.readFileSync(path.join(ROOT, 'js/gate.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
// مولّدٌ عشوائيٌّ ثابت البذرة: الاختيار يُجرَّب مئات المرّات بلا اعتمادٍ على الحظّ
const seeded = seed => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const IDS = Array.from({ length: 13 }, (_, i) => i + 1);
const all = id => V.entries(id, 'pos').concat(V.entries(id, 'neg'));

/* ── ١) البيانات ── */
{
    check('data: البنود الثلاثة عشر كلّها، ولكلٍّ مجموعاتٌ وتوصيات', IDS.every(id => V.DATA[id] && V.DATA[id].groups.length >= 2 && Object.keys(V.DATA[id].recs).length >= 3));
    check('data: لكلّ بندٍ ستّة أدلّةٍ موجبة فأكثر وأربعةٌ سالبة فأكثر (القديمة خمسةٌ وخمسة)',
          IDS.every(id => V.entries(id, 'pos').length >= 6 && V.entries(id, 'neg').length >= 4),
          IDS.map(id => id + ':' + V.entries(id, 'pos').length + '/' + V.entries(id, 'neg').length).join(' '));
    const texts = IDS.map(id => all(id).map(e => e.t)).flat();
    const recs = IDS.map(id => Object.values(V.DATA[id].recs).map(r => r.r + ' ' + r.m)).flat();
    check('data: بلا تشكيل (كقوائم templates.js)', texts.concat(recs).every(t => !/[ً-ْ]/.test(t)),
          texts.concat(recs).filter(t => /[ً-ْ]/.test(t)).slice(0, 3).join(' | '));
    check('data: «المعلم» ببديل الجنس دائماً', texts.concat(recs).every(t => !/(^|[^[/])المعلم(?![^[]*\])/.test(t)),
          texts.concat(recs).filter(t => /(^|[^[/])المعلم(?![^[]*\])/.test(t)).join(' | '));
    check('data: بدائل الجنس بخيارين في كلّ قوسٍ', texts.concat(recs).every(t => (t.match(/\[[^\]]*\]/g) || []).every(b => b.split('/').length === 2)));
    check('data: لا «<» ولا ترميز HTML (البوّابة ترفض الحفظ كلّه بهما)', texts.concat(recs).every(t => !/[<>]|&#?\w+;/.test(t)));
    check('data: لا تكرار للدليل داخل البند', IDS.every(id => { const t = all(id).map(e => e.t); return new Set(t).size === t.length; }));
    check('data: {كم} في أدلّة البنود ١–٤ و٧ و٨ وحدها (حيث يبلغ الطلبة)', IDS.every(id => [1, 2, 3, 4, 7, 8].includes(id) || all(id).every(e => !/\{كم\}/.test(e.t))));
    check('data: الألفاظ المفتاحيّة بلا «الطلبة/المعلم/طالب» (تتغيّر بالجنس والصفوف ١–٤)',
          IDS.every(id => Object.values(V.DATA[id].recs).every(r => r.k.every(k => !/الطلبة|المعلم|طالب|التلاميذ/.test(k)))));
    check('data: البند ٣ (العليا والرقمية) والبند ٩ (الرقمية) لهما مجموعة «متميز»',
          V.DATA[3].groups.filter(g => g.top).map(g => g.name).join() === 'العليا,الرقمية' && V.DATA[9].groups.filter(g => g.top).length === 1);
    check('data: أجزاء العنوان الغائبة صار لها أدلّة — غير الصفية، الرقمية، الهوية العمانية، النظافة، الدافعية، التمايز',
          V.DATA[1].groups.some(g => g.name === 'الأعمال غير الصفية') && V.DATA[3].groups.some(g => g.name === 'الرقمية')
          && V.DATA[4].groups.some(g => g.name === 'الهوية العمانية') && V.DATA[5].groups.some(g => g.name === 'النظافة')
          && V.DATA[7].groups.some(g => g.name === 'الدافعية') && V.DATA[10].groups.some(g => g.name === 'التمايز'));
    check('data: أدلّة البند ١٢ السالبة كلّها حسّاسة (اتّهامٌ بمخالفة لائحة)', V.entries(12, 'neg').every(e => e.x));
    check('data: المصدر — السجلات والتحضير والمداولة موسومة', V.entries(13, 'pos').every(e => e.s === 'rec')
          && V.entries(11, 'pos').some(e => e.s === 'talk') && V.entries(1, 'pos').some(e => e.s === 'rec') && V.entries(1, 'pos').some(e => e.s === 'lesson'));
}

/* ── ٢) لكلّ دليلٍ سالب توصيةٌ مرتبطة، ولعبارات عين المشرف السالبة كذلك ── */
{
    const miss = [];
    IDS.forEach(id => V.entries(id, 'neg').forEach(e => {
        [3, 4, 5].forEach(sc => { if (!V.recFor(id, V.compose('م', { pos: ['ما تحقق'], neg: [V.resolve(e.t, 'neg', sc)] }, sc), sc)) miss.push(id + '@' + sc + ': ' + e.t); });
    }));
    check('recs: كلّ دليلٍ سالبٍ في القوائم له توصيته في ٣ و٤ و٥', !miss.length, miss.slice(0, 4).join(' | '));
    const EYE = { 1: ['ضعف إتقان المهارة إذ لم يتقنها إلا (40%) من عينة الطلبة'],
        2: ['ثبات مستوى أداء الطلبة دون تحسن ملحوظ خلال الحصة', 'تكرار الأخطاء الفنية دون تصحيح', 'بقاء (2) من الطلبة خارج النشاط دون إشراك', 'ترك الطلبة غير المشاركين في الممارسة دون دور في الحصة'],
        4: ['مشاركة (3) من الطلبة بغير الزي الرياضي', 'ظهور سلوك غير رياضي دون معالجة'],
        5: ['تزاحم الطلبة في مساحات ضيقة أثناء التطبيق', 'عدم إتاحة استراحة لشرب الماء في حرارة محسوسة بلغت (41°)', 'ممارسة النشاط تحت أشعة الشمس المباشرة دون توظيف الظل في حرارة مرتفعة', 'حدوث موقف يهدد سلامة الطلبة أثناء الممارسة', 'ظهور علامات إجهاد حراري على بعض الطلبة أثناء الممارسة'],
        6: ['عدم الالتزام بتسلسل عناصر الدرس', 'غياب الإحماء من عناصر الدرس', 'عدم توافق الدرس مع الخطة الفصلية'],
        7: ['الوقوف وسط الطلبة في موقع لا يكشفهم جميعا', 'انتظار الطلبة بين نشاطين دون ممارسة مدة بلغت (4) دقائق', 'وقوف الطلبة في قاطرات طويلة (9 طلبة) تطيل انتظار الدور', 'بطء استجابة الطلبة لإشارات البدء والتوقف', 'هدر وقت الحصة في توزيع الأدوات وجمعها', 'عدم انضباط سلوك بعض الطلبة دون معالجة'],
        8: ['طول زمن الشرح اللفظي والطلبة متوقفون (40%) من زمن الحصة', 'قلة زمن الممارسة الفعلية إذ لم تتجاوز (30%) من زمن الأنشطة', 'توظيف ألعاب إقصاء تخرج الطلبة من الممارسة'],
        9: ['عدم استثمار المساحة المتاحة إذ تركزت الممارسة في جزء محدود منها', 'عدم كفاية الكرات لعدد الطلبة إذ بلغت كرة لكل (6) طلبة', 'نقص الأدوات بما يطيل انتظار الطلبة لأدوارهم'],
        10: ['قلة التغذية الراجعة المصححة للأداء', 'اقتصار الأسئلة الشفهية على أسئلة مغلقة لا تستثير التفكير', 'تكرار أخطاء في الأداء دون تصحيح'],
        11: ['عدم تحقق أهداف الزيارة السابقة'], 12: ['التأخر عن موعد بدء الحصة'] };
    const eyeMiss = [];
    Object.keys(EYE).forEach(id => EYE[id].forEach(t => { if (!V.recFor(id, V.compose('م', { neg: [t] }, 4), 4)) eyeMiss.push(id + ': ' + t); }));
    check('recs: عبارات عين المشرف السالبة لها توصياتها', !eyeMiss.length, eyeMiss.join(' | '));
    // التوصية تتبع جزء الوصف السالب وحده: في «ملائم» الموجب «تطبيق … القانون» لا يجلب توصية القانون
    const t3 = V.compose('يكتسب أغلب الطلبة', { pos: ['تطبيق أغلب الطلبة القانون المرتبط بالمهارة أثناء اللعب'], neg: ['تكرر الخطأ نفسه في نقطة فنية أساسية لدى بعض الطلبة'] }, 3);
    check('recs: في «ملائم» تُقرأ التوصية مما بعد «مع» وحده', V.recFor(1, t3, 3).key === 'fb', V.recFor(1, t3, 3) && V.recFor(1, t3, 3).key);
    check('recs: «متميز» و«جيد» بلا توصيةٍ مرتبطة', V.recFor(1, V.compose('م', { pos: ['أداء جميع الطلبة'] }, 1), 1) === null);
    const two = V.compose('م', { neg: ['انتظار الطلبة مدة طويلة دون نشاط', 'طول انتظار الطلبة لأدوارهم في قاطرات يزيد كل منها على (6)'] }, 5);
    check('recs: أوّل دليلٍ مذكورٍ يقرّر التوصية', V.recFor(7, two, 5).key === 'trans');
    check('recs: نصّ التوصية إجراءٌ وما يُقاس في الزيارة القادمة', /^\[قدم\/قدمي\] تغذية راجعة.*، ويقاس أثر ذلك في الزيارة القادمة من خلال عدد من أتقن/.test(V.recText(V.recFor(1, t3, 3))));
    check('recs: وصفٌ كتبه المشرف بيده بلا «من خلال» ← لا توصية مرتبطة (تُكتب توصية البند العامّة)', V.recFor(7, 'المعلم ينتظر كثيراً', 4) === null);
}

/* ── ٣) الاختيار التلقائيّ ── */
{
    const rng = seeded(7);
    let sens = 0, rec = 0, n3 = 0, top = 0, lvl12 = 0;
    for (let i = 0; i < 300; i++) {
        IDS.forEach(id => [3, 4, 5].forEach(sc => {
            const p = V.pick(id, sc, rng);
            p.neg.forEach(t => { const e = V.entries(id, 'neg').find(x => V.resolve(x.t, 'neg', sc) === t); if (e && e.x) sens++; if (e && e.s !== 'lesson' && V.entries(id, 'neg').some(x => x.s === 'lesson' && !x.x)) rec++; });
        }));
        const p3 = V.pick(1, 3, rng);
        if (p3.pos.length === 1 && p3.neg.length === 1 && /أغلب|^(?!.*\{كم\})/.test(p3.pos[0]) && !/\{كم\}/.test(p3.neg[0])) n3++;
        const p1 = V.pick(3, 1, rng);
        if (p1.pos.length === 2 && p1.pos.some(t => V.entries(3, 'pos').some(e => e.top && V.resolve(e.t, 'pos', 1) === t))) top++;
        if (!V.pick(12, 4, rng).neg.length && !V.pick(12, 5, rng).neg.length) lvl12++;
    }
    check('pick: الحسّاس لا يُختار تلقائياً أبداً (٣٠٠ × ١٣ بنداً × ٣ مستويات)', sens === 0, sens);
    check('pick: أدلّة السجلات لا تُختار ما وُجد في البند دليلٌ من الحصة', rec === 0, rec);
    check('pick: «ملائم» دليلان — موجبٌ بـ«أغلب» وسالبٌ مخفّف', n3 === 300, n3);
    check('pick: «متميز» في البند ٣ يأخذ دليلاً من العليا أو الرقمية', top === 300, top);
    check('pick: البند ١٢ في ٤–٥ بلا دليلٍ تلقائيّ (أدلّته السالبة كلّها حسّاسة)', lvl12 === 300, lvl12);
    check('pick: البند ١٣ (كلّه من السجلات) يختار منها حين لا دليل من الحصة', V.pick(13, 2, rng).pos.length === 1 && V.pick(13, 4, rng).neg.length === 1);
    check('pick: الكمّ يتبع المستوى', V.resolve('أداء {كم} الطلبة', 'pos', 1) === 'أداء جميع الطلبة' && V.resolve('أداء {كم} الطلبة', 'pos', 2) === 'أداء معظم الطلبة'
          && V.resolve('عجز {كم} الطلبة', 'neg', 3) === 'عجز بعض الطلبة' && V.resolve('عجز {كم} الطلبة', 'neg', 4) === 'عجز أغلب الطلبة' && V.resolve('عجز {كم} الطلبة', 'neg', 5) === 'عجز معظم الطلبة');
}

/* ── ٤) الوصف ── */
{
    check('compose: «ملائم» = ما تحقّق «مع» ما ينقص', V.compose('يكتسب أغلب الطلبة المهارات بصورة ملائمة.', { pos: ['أ'], neg: ['ب'] }, 3) === 'يكتسب أغلب الطلبة المهارات بصورة ملائمة، ويتضح ذلك من خلال أ، مع ب.');
    check('compose: «متميز» دليلان بالواو', V.compose('م.', { pos: ['أ', 'ب'] }, 1) === 'م، ويتضح ذلك من خلال أ، وب.');
    check('compose: ٤–٥ من السالب وحده', V.compose('م', { pos: ['أ'], neg: ['ب'] }, 4) === 'م، ويتضح ذلك من خلال ب.');
    check('compose: بلا دليلٍ جملة المستوى وحدها', V.compose('م.', { pos: [], neg: [] }, 4) === 'م.');
    check('compose: «ملائم» بسالبٍ وحده (اختيار المشرف) يُكتب ولا يضيع', V.compose('م', { pos: [], neg: ['ب'] }, 3) === 'م، ويتضح ذلك من خلال ب.');
}

/* ── ٥) ترتيب التوصيات: أربعٌ على الأكثر ── */
{
    const o = V.orderRecs([{ id: 13, score: 4 }, { id: 2, score: 3 }, { id: 7, score: 4 }, { id: 1, score: 5 }, { id: 5, score: 4 }, { id: 8, score: 3 }]);
    check('order: ٥ ثمّ ٤ بأولويّة تعلّم الطلبة ثمّ السلامة، وأربعٌ على الأكثر', o.join() === '1,7,5,13', o.join());
    check('order: «ملائم» حين يبقى مكان', V.orderRecs([{ id: 9, score: 4 }, { id: 8, score: 3 }, { id: 2, score: 3 }, { id: 13, score: 3 }, { id: 11, score: 3 }]).join() === '9,2,8,11');
}

/* ── ٦) اللوحة: الأقسام والمجموعات، وأدلّة الحصة أوّلاً بلا تكرار، وما يضيفه المشرف ويحذفه ── */
{
    V.reset();
    const p3 = V.panel(7, 3, { pos: ['الانتقال السلس بين أجزاء الدرس دون هدر للوقت'], neg: ['بطء استجابة الطلبة لإشارات البدء والتوقف'] });
    check('panel: «ملائم» قسمان — ما تحقّق وما ينقص', p3.length === 2 && p3[0].kind === 'pos' && p3[1].kind === 'neg' && /بعد «مع»/.test(p3[1].title));
    check('panel: أدلّة الحصة أوّلاً ولا تتكرّر في القائمة', p3[0].groups[0].name === 'من الحصة'
          && !p3[0].groups.slice(1).some(g => g.items.some(i => i.value === 'الانتقال السلس بين أجزاء الدرس دون هدر للوقت'))
          && p3[1].groups[0].items[0].eye === true);
    check('panel: «متميز» و«جيد» قسمٌ موجب، و٤–٥ قسمٌ سالب', V.panel(1, 1).map(s => s.kind).join() === 'pos' && V.panel(1, 5).map(s => s.kind).join() === 'neg');
    check('panel: الحسّاس والمصدر موسومان', V.panel(12, 4)[0].groups[0].items.every(i => i.x) && V.panel(13, 2)[0].groups[0].items.every(i => i.s === 'rec'));
    check('panel: الكمّ محلولٌ بمستوى اللوحة', V.panel(1, 2)[0].groups[0].items[0].value === 'أداء معظم الطلبة للمهارة وفق نقاطها الفنية');
    V.addCustom(1, 'pos', 'دليلٌ أضفته');
    check('custom: ما يضيفه المشرف في «أدلّتك»', V.panel(1, 2)[0].groups.some(g => g.name === 'أدلّتك' && g.items[0].value === 'دليلٌ أضفته') && V.addCustom(1, 'pos', 'دليلٌ أضفته') === false);
    V.remove(1, 'أداء {كم} الطلبة للمهارة وفق نقاطها الفنية'); V.remove(1, 'دليلٌ أضفته');
    check('custom: الحذف يُخرجه من اللوحة ومن الاختيار', !V.entries(1, 'pos').some(e => /نقاطها الفنية|أضفته/.test(e.t)));
    V.reset();
    check('custom: reset يُعيد القوائم', V.entries(1, 'pos').some(e => /نقاطها الفنية/.test(e.t)));
}

/* ── ٧) التوصيل في supervisory.js — يعمل لأصحابه وحدهم ── */
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker: ' + a); return src.slice(i, j); };
{
    const state = { on: false, g: 0, lower: false, eye: null };
    const scores = {}, notes = {}, fields = { '#strengthsContent': { value: '' }, '#developmentContent': { value: '' }, '#recommendationsContent': { value: '' } };
    const ctx = {
        console, SvfEvidence: V,
        window: {}, Math,
        getSupervisoryGender: () => state.g,
        supLowerGrade: () => state.lower,
        svfPupilText: s => s.replace(/الطلبة/g, 'التلاميذ'),
        applyGenderFilter: (t, m) => String(t).replace(/\[([^\]]+)\]/g, (x, o) => { const p = o.split('/'); return p[m] !== undefined ? p[m] : p[0]; }),
        svfEscapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
        svfEyeOfficial: (id, sc, allOf) => state.eye ? state.eye(id, sc, allOf) : null,
        supWarnGenderMismatch: () => {}, showToast: () => {},
        document: { querySelector: sel => {
            if (fields[sel]) return fields[sel];
            let m = /^#score-(\d+)$/.exec(sel); if (m) return { textContent: String(scores[m[1]] || 3) };
            m = /^#notes-(\d+)$/.exec(sel); if (m) return { get textContent() { return notes[m[1]] || ''; }, set textContent(v) { notes[m[1]] = v; } };
            if (sel === '#reportSection') return { classList: { remove() {} }, scrollIntoView() {} };
            return null;
        } }
    };
    ctx.window.SupervisorGate = ctx.SupervisorGate = { canEvidence: () => state.on };
    vm.createContext(ctx);
    vm.runInContext(TPL + '\nthis.evidenceBasedContent = evidenceBasedContent; this.evaluationItems = evaluationItems;', ctx);
    vm.runInContext(between(SUP, '// أدلّة البنود المطوّرة (js/evidence.js', 'function closeEvidencePanels()')
        + between(SUP, '// لوحة الأدلّة المطوّرة:', 'function updateScore(')
        + between(SUP, 'let supLastGenerated = null;', 'function startSupervisoryDictation(')
        + '\nthis.gen = generateDescriptionText; this.render = svfRenderEvidencePanel; this.report = generateReport; this.last = () => supLastGenerated; this.on = svfEvidenceOn;', ctx);

    // غير صاحبها: القوائم السابقة كما هي (بتصحيحات المرحلة الأولى)
    state.on = false; state.g = 1;
    const legacy = new Set(ctx.evidenceBasedContent['7'].neg_evidences.map(e => ctx.applyGenderFilter(e, 1)));
    let leg = true;
    for (let i = 0; i < 60; i++) { const t = ctx.gen('7', 4); const ev = t.split('من خلال ')[1].replace(/\.$/, ''); if (!legacy.has(ev)) leg = false; if (/وقوف المعلم\s/.test(t)) leg = false; }
    check('wiring: غير صاحبها — الوصف من قوائم templates.js، و«وقوف المعلمة» للمعلّمة', leg && ctx.on() === false);
    check('wiring: غير صاحبها — «ملائم» دليلٌ واحد بلا «مع» كما كان', !/، مع /.test(ctx.gen('1', 3)));

    // صاحبها: الأدلّة المطوّرة
    state.on = true; state.g = 0;
    const d3 = ctx.gen('1', 3);
    check('wiring: صاحبها — «ملائم» موجبٌ «مع» سالب، بالكمّ', /^يكتسب أغلب الطلبة .*، ويتضح ذلك من خلال .*، مع .*\.$/.test(d3) && !/\{كم\}/.test(d3), d3);
    check('wiring: صاحبها — المعلّمة والتلاميذ', (() => { state.g = 1; state.lower = true;
        const t = ctx.gen('7', 1, { pos: ['وقوف [المعلم/المعلمة] في مكان يكشف جميع الطلبة'], neg: [] }); state.g = 0; state.lower = false;
        return /وقوف المعلمة في مكان يكشف جميع التلاميذ/.test(t) && /تقوم المعلمة/.test(t); })());
    check('wiring: صاحبها — البند ١٢ «غير ملائم» بلا دليلٍ تلقائيّ', ctx.gen('12', 4) === ctx.applyGenderFilter(ctx.evidenceBasedContent['12'].levels[4], 0));
    state.eye = (id, sc) => (String(id) === '7' ? (sc >= 4 ? ['بطء استجابة الطلبة لإشارات البدء والتوقف'] : ['الانتقال السلس بين أجزاء الدرس دون هدر للوقت']) : null);
    check('wiring: صاحبها — «ملائم» من الحصة: ما تحقّق وما ينقص كلاهما من العين', /من خلال الانتقال السلس بين أجزاء الدرس دون هدر للوقت، مع بطء استجابة الطلبة لإشارات البدء والتوقف\.$/.test(ctx.gen('7', 3)), ctx.gen('7', 3));
    state.eye = null;
    check('wiring: صاحبها — اختيار اللوحة {pos, neg} يُكتب كما اختير', /من خلال أ، مع ب\.$/.test(ctx.gen('2', 3, { pos: ['أ'], neg: ['ب'] })));

    // اللوحة: نصوصٌ مهروبة، ووسم المصدر والحسّاس، والمربّع يُعلَّم بالدليل كما ظهر في الوصف
    V.reset(); V.addCustom(12, 'neg', '<img src=x onerror=alert(1)>');
    const box = { innerHTML: '', style: {} };
    ctx.render('12', '4', 'يلتزم بأخلاقيات المهنة… ويتضح ذلك من خلال التأخر عن موعد الحصة الدراسية.', box);
    check('panel(html): الحسّاس موسوم، والمربّع المكتوب في الوصف معلَّم', /حسّاس — لا يُختار تلقائياً/.test(box.innerHTML) && /value="التأخر عن موعد الحصة الدراسية" data-kind="neg" data-item-id="12" checked/.test(box.innerHTML));
    check('panel(html): ما يضيفه المشرف مهروب', !/<img/.test(box.innerHTML) && /&lt;img/.test(box.innerHTML) && box.style.maxHeight === '18rem');
    ctx.render('13', '2', '', box);
    check('panel(html): وسم «السجلات والتحضير»', /السجلات والتحضير/.test(box.innerHTML));
    V.reset();

    // التقرير: أربع توصياتٍ بالأولويّة، والمرتبطة بالدليل السالب المكتوب
    Object.assign(scores, { 1: 5, 2: 3, 3: 2, 4: 2, 5: 4, 6: 2, 7: 4, 8: 3, 9: 2, 10: 2, 11: 2, 12: 2, 13: 4 });
    for (const k in notes) delete notes[k];
    notes[1] = ctx.gen('1', 5, { pos: [], neg: ['تكرر الخطأ نفسه في نقطة فنية أساسية لدى معظم الطلبة'] });
    notes[7] = ctx.gen('7', 4, { pos: [], neg: ['طول انتظار الطلبة لأدوارهم في قاطرات يزيد كل منها على (6)'] });
    notes[5] = 'وصفٌ كتبه المشرف بيده';
    notes[13] = ctx.gen('13', 4, { pos: [], neg: ['غياب توثيق الأنشطة والمبادرات وأثرها'] });
    ctx.report();
    const L = ctx.last(), R = fields['#recommendationsContent'].value;
    check('report: صاحبها — أربع توصياتٍ بالترتيب (١، ٧، ٥، ١٣) ولا «ملائم» عشوائيّ', L.recs.join() === '1,7,5,13', L.recs.join());
    check('report: التوصية المرتبطة بالدليل المكتوب — إجراءٌ وما يُقاس', /• التحصيل الدراسي: قدم تغذية راجعة فردية .*، ويقاس أثر ذلك في الزيارة القادمة من خلال عدد من أتقن النقطة/.test(R)
          && /• إدارة الصف: قسم الطلبة في مجموعات لا تزيد على \(4\)/.test(R) && /• الحوكمة: وثق كل نشاط بعدد المشاركين/.test(R), R);
    check('report: وصفٌ بلا دليلٍ معروف ← توصية البند العامّة', /• جودة بيئة التعلم: افحص الملعب والأدوات دورياً/.test(R));
    check('report: لا توصية تبدأ بـ«استمر»', !/استمر/.test(R));
    state.on = false;
    ctx.report();
    check('report: غير صاحبها — التوصيات العامّة كما كانت (لا «ويقاس أثر ذلك»)', !/ويقاس أثر ذلك/.test(fields['#recommendationsContent'].value) && ctx.last().recs.length >= 4);
}

/* ── ٨) البوّابة والتحميل ── */
{
    check('gate: EVIDENCE_OWNERS لأسعد، وcanEvidence مُصدَّرة', /const EVIDENCE_OWNERS = \['asad'\];/.test(GATE) && /canEvidence,/.test(GATE) && /function canEvidence\(\)/.test(GATE));
    const html = fs.readFileSync(path.join(ROOT, 'reports.html'), 'utf8');
    check('load: evidence.js بعد templates.js وقبل utils.js وsupervisory.js', html.indexOf('js/evidence.js') > html.indexOf('js/templates.js') && html.indexOf('js/evidence.js') < html.indexOf('js/utils.js'));
    check('load: عامل الخدمة يحفظ evidence.js', /'\.\/js\/evidence\.js'/.test(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')));
    check('wiring: إضافة دليلٍ وحذفه في لوحة صاحبها يمرّان بـSvfEvidence', /svfEvidenceOn\(\)\) \{\s*\n\s*if \(!SvfEvidence\.addCustom/.test(UTILS) && /SvfEvidence\.remove\(itemId, value\)/.test(UTILS));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
