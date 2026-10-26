// اختبار: node tests/debrief.test.js
// المداولة الإشرافيّة (2026-10-13): النمط من الدرجات (غليكمان)، ومحور التطوير والإجادة، والأساليب الخمسة،
// والصيغ بالجنس، والملخّص وسطر التوصية، والتوصيل (الحالة تُحفظ مع التقرير).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const D = require('../js/debrief-core.js');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const items = sc => Object.entries(sc).map(([id, score]) => ({ id: +id, standard: 'م' + id, title: 'ب' + id, score, notes: 'وصف ' + id }));
const all = v => { const o = {}; for (let i = 1; i <= 13; i++) o[i] = v; return o; };

/* ── النمط ── */
check('style: تدخّل سريع ← توجيهيّ', D.suggestStyle([2, 2, 5, 2]).id === 'directive');
check('style: ثلاثة «غير ملائم» ← توجيهيّ', D.suggestStyle([2, 4, 4, 4, 2, 2]).id === 'directive');
check('style: متوسّط مرتفع ← توجيهيّ', D.suggestStyle([4, 4, 3, 4]).id === 'directive');
check('style: متميّز بلا ضعف ← تأمّليّ', D.suggestStyle([1, 2, 2, 1, 2]).id === 'nondirective');
check('style: متميّز مع بند «غير ملائم» ← تعاونيّ', D.suggestStyle([1, 1, 1, 1, 4]).id === 'collaborative');
check('style: متوسّط ← تعاونيّ', D.suggestStyle([2, 3, 3, 2, 4]).id === 'collaborative' && D.suggestStyle([]).id === 'collaborative');
check('style ← الأسلوب', D.STYLES.directive.method === 'clinical' && D.STYLES.collaborative.method === 'grow' && D.STYLES.nondirective.method === 'reflect');

/* ── التركيز (السلّم مقلوب) ── */
const it = items({ 1: 2, 2: 3, 3: 3, 4: 2, 5: 2, 6: 3, 7: 1, 8: 4, 9: 3, 10: 4, 11: 3, 12: 2, 13: 5 });
check('focus: الأعلى درجةً أوّلاً', D.pickFocus(it).join() === '13,8', D.pickFocus(it).join());
check('focus: بلا ٤–٥ يُؤخذ من ٣', D.pickFocus(items({ 1: 2, 2: 3, 3: 1, 6: 3 })).join() === '2,6');
check('focus: لا شيء دون «جيد» ← فارغ', D.pickFocus(items(all(2))).length === 0);
check('strengths: المتميّز أوّلاً', D.pickStrengths(it).join() === '7,1');

/* ── البنك ── */
check('bank: البنود الثلاثة عشر كلّها', Object.keys(D.BANK).length === 13
    && Object.values(D.BANK).every(b => b.reflect.length >= 2 && b.options.length >= 3 && b.goal));
check('bank: صيغ الجنس متوازنة', Object.values(D.BANK).every(b => b.reflect.concat(b.options, [b.goal]).every(t => (t.match(/\{/g) || []).length === (t.match(/\}/g) || []).length)));

/* ── الأساليب ── */
const V = (female, sc) => ({ teacher: 'مريم', female, topic: 'الوثب الطويل', cls: '8/2', items: items(sc || { 1: 2, 2: 3, 7: 1, 8: 4, 10: 4, 12: 2 }), prevRecs: ['استخدام قوائم الرصد'] });
const counts = { grow: 6, hats: 7, reflect: 6, clinical: 5, www: 3 };
Object.entries(counts).forEach(([m, n]) => {
    const p = D.buildPlan(V(true), { method: m });
    check('method ' + m + ': ' + n + ' مراحل وأسئلة', p.method.id === m && p.stages.length === n && p.stages.every(s => s.questions.length >= 1),
        p.stages.length + ' / ' + p.stages.map(s => s.questions.length).join(','));
});
const pg = D.buildPlan(V(true), {});
check('plan: الأسلوب المقترح من النمط', pg.style.id === 'collaborative' && pg.method.id === 'grow');
check('plan: المؤنّث بلا رموز', pg.stages.every(s => s.questions.every(q => !/[{}|]/.test(q.text))) && /تريدين/.test(JSON.stringify(pg.stages)));
const pm = D.buildPlan(V(false), {});
check('plan: المذكّر', /تريد أن يكون/.test(JSON.stringify(pm.stages)) && !/تريدين/.test(JSON.stringify(pm.stages)) && pm.teacherWord === 'المعلم');
check('plan: الدرس في السؤال', /درس «الوثب الطويل»/.test(JSON.stringify(pg.stages)));
check('plan: متابعة توصيات الزيارة السابقة', /اتّفقنا على: استخدام قوائم الرصد/.test(JSON.stringify(pg.stages[0].questions)));
check('plan: الأدلّة من أوصاف البنود', pg.stages.find(s => s.id === 'R').evidence.some(e => /فاعلية|م8: غير ملائم — وصف 8/.test(e.text)));
check('plan: البدائل وصيغ الهدف لمحور التطوير', pg.stages.find(s => s.id === 'O').options.length === 6 && pg.stages.find(s => s.id === 'W').goals.length === 2);
check('plan: محورٌ يختاره المشرف', D.buildPlan(V(true), { focus: [2] }).focus.map(x => x.id).join() === '2');
check('plan: توجيهيّ ← عياديّ', D.buildPlan(V(true, { 1: 5, 2: 4, 3: 4 }), {}).method.id === 'clinical');

/* ── الملخّص وسطر التوصية ── */
const st = { answers: { G: 'رفع زمن الممارسة' }, agree: { goal: 'قوائم رصد', action: 'بطاقة لكل مجموعة', date: 'الزيارة القادمة' } };
const sm = D.summaryLines(pg, st, { teacher: 'مريم', date: '2026-10-13' });
check('summary', sm[0] === 'المداولة الإشرافيّة — مريم — 2026-10-13' && sm.includes('G — الهدف: رفع زمن الممارسة') && sm.includes('• الإجراء: بطاقة لكل مجموعة'));
check('agreementRec', D.agreementRec(st) === '• (اتّفاق المداولة) قوائم رصد، من خلال بطاقة لكل مجموعة، ويُتابَع في الزيارة القادمة.' && D.agreementRec({}) === '');

/* ── التطورات الجديدة: المجال والمرحلة ومتابعة الاتفاق السابق وWhatsApp ── */
check('domain: كشف المجال الرياضي', D.detectDomain('الوثب العالي') === 'athletics' && D.detectDomain('كرة السلة') === 'games' && D.detectDomain('الدحرجة الأمامية') === 'gymnastics' && D.detectDomain('اللياقة القلبية') === 'fitness');
check('grade: كشف المرحلة التعليمية', D.detectGradeLevel('3/2') === 'cycle1' && D.detectGradeLevel('8/1') === 'cycle2' && D.detectGradeLevel('11/3') === 'postBasic');
check('grade: الشعبة بعد «/» لا تُقرأ صفّاً، و«ثاني عشر» ليست الحلقة الأولى',
      D.detectGradeLevel('ثامن/3') === 'cycle2' && D.detectGradeLevel('ثاني عشر/1') === 'postBasic'
      && D.detectGradeLevel('الحادي عشر') === 'postBasic' && D.detectGradeLevel('الصف الثاني') === 'cycle1'
      && D.detectGradeLevel('اول/4') === 'cycle1' && D.detectGradeLevel('١٢/٢') === 'postBasic',
      [D.detectGradeLevel('ثامن/3'), D.detectGradeLevel('ثاني عشر/1'), D.detectGradeLevel('الصف الثاني')].join(','));
const pDeb = D.buildPlan({ teacher: 'علي', topic: 'كرة اليد', prevDebrief: { agree: { goal: 'تنويع التشكيلات', date: 'الزيارة القادمة' } } });
check('continuity: متابعة اتفاق المداولة السابقة', /مداولة الزيارة السابقة اتّفقنا على: «تنويع التشكيلات»/.test(JSON.stringify(pDeb.stages[0].questions)));
const prog = D.calcProgression([1, 2, 2, 2], [{ data: { formData: { 'score-1': 4, 'score-2': 4, 'score-3': 4, 'score-4': 4 }, visitDate: '2026-09-15' } }]);
check('progression: حساب التحسن وتغير النمط', prog.hasPrev && prog.improved && prog.styleShifted && prog.currStyle.id === 'nondirective' && prog.prevStyle.id === 'directive');
const wa = D.formatWhatsAppMessage(pg, st, { teacher: 'مريم', topic: 'الوثب الطويل', cls: '8/2', female: true });
check('whatsapp: الرسالة منسقة وفيها جوانب الإجادة والاتفاق', wa.includes('الأستاذة الفاضلة / مريم') && wa.includes('درس «الوثب الطويل»') && wa.includes('قوائم رصد') && wa.includes('بطاقة لكل مجموعة'));

/* ── التوصيل ── */
const H = read('reports.html'), S = read('js/supervisory.js'), UI = read('js/debrief.js'), SW = read('sw.js');
const fv = H.indexOf('<div id="form-view"'), dv = H.indexOf('<div id="debrief-view"');
check('wiring: الحالة حقلٌ مخفيّ داخل #form-view (يُحفظ ويُستعاد ويُصفَّر مع التقرير)', fv > 0 && H.indexOf('id="debriefData"') > fv && H.indexOf('id="debriefData"') < dv);
check('wiring: التبويب والشاشة', H.includes('data-view="debrief-view"') && dv > 0 && H.includes('id="debriefBody"'));
check('wiring: التبديل يُخفيها ويبنيها', S.includes("'#form-view, #debrief-view, #dashboard-view") && /viewId === 'debrief-view' && typeof svfDebriefOpen === 'function'/.test(S));
check('wiring: السكربتان وعامل الخدمة', /debrief-core\.js[\s\S]*debrief\.js[\s\S]*init\.js/.test(H.slice(H.indexOf('js/teacher-brief.js'))) && SW.includes("'./js/debrief-core.js'") && SW.includes("'./js/debrief.js'"));
check('wiring: النصوص مهروبة، والتصريحات العامّة بـtypeof', /typeof evaluationItems !== 'undefined'/.test(UI) && /typeof currentEditingKey !== 'undefined'/.test(UI) && ['${esc(pupil(q.text))}', '${esc(pupil(e.text))}', '${esc(pupil(o.text))}', '${esc(v.teacher)}', "${esc((st.answers || {})[s.id] || '')}"].every(x => UI.includes(x)));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
