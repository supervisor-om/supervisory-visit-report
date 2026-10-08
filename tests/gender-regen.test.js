// اختبار: node tests/gender-regen.test.js
// النصوص المولَّدة في الزيارة الإشرافيّة تتبع تبديل الجنس (2026-10-08).
// تقرير مريم (2026-10-07): أوصافه «تتابع المعلمة» وتوصياته «نوصي المعلم … استخدم» —
// التبديل كان يعيد صياغة الأوصاف وحدها. يشغّل دوالّ js/supervisory.js نفسها على DOM مصغّر.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/supervisory.js'), 'utf8').replace(/\r\n/g, '\n');
const INIT = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const between = (a, b) => {
    const i = SRC.indexOf(a), j = SRC.indexOf(b, i);
    if (i < 0 || j < 0) throw new Error('marker not found: ' + a);
    return SRC.slice(i, j);
};

const fields = { '#strengthsContent': { value: '' }, '#developmentContent': { value: '' }, '#recommendationsContent': { value: '' } };
const notes = { 1: '[يخطط المعلم/تخطط المعلمة] لدروسه', 10: '[يوظف المعلم/توظف المعلمة] التقويم' };
const state = { g: 0 };
const ctx = {
    getSupervisoryGender: () => state.g,
    applyGenderFilter: (t, m) => t.replace(/\[([^\]]+)\]/g, (x, o) => { const p = o.split('/'); return p[m] !== undefined ? p[m] : p[0]; }),
    evaluationItems: [{ id: 1, standard: 'التخطيط' }, { id: 10, standard: 'التقويم' }],
    instructionalRecommendations: { '10': '[استخدم/استخدمي] قوائم الملاحظة.' },
    document: { querySelector: sel => {
        if (fields[sel]) return fields[sel];
        const m = /^#notes-(\d+)$/.exec(sel);
        return m ? { textContent: ctx.applyGenderFilter(notes[m[1]] || '', state.g) } : null;
    } },
    showToast: () => {}
};
vm.createContext(ctx);
vm.runInContext(between('let supLastGenerated = null;', 'function generateReport()')
    + '\nthis.set = g => { supLastGenerated = g; }; this.write = supWriteGeneratedTexts; this.regen = supRegenderGenerated;', ctx);

ctx.set({ strengths: [1], developments: [10], recs: [10] });
ctx.write();
check('build: مذكّراً', fields['#recommendationsContent'].value.startsWith('نوصي المعلم بالآتي:')
      && /استخدم قوائم/.test(fields['#recommendationsContent'].value) && /يخطط المعلم/.test(fields['#strengthsContent'].value));

state.g = 1;
check('regen: الثلاث تُعاد', ctx.regen() === 3);
check('regen: التوصيات مؤنّثة', fields['#recommendationsContent'].value.startsWith('نوصي المعلمة بالآتي:')
      && /استخدمي قوائم/.test(fields['#recommendationsContent'].value));
check('regen: والإجادة والتطوير من الأوصاف الجديدة',
      /تخطط المعلمة/.test(fields['#strengthsContent'].value) && /توظف المعلمة/.test(fields['#developmentContent'].value));

fields['#recommendationsContent'].value += '\n• توصيةٌ بيدي';
state.g = 0;
check('regen: المعدَّل يدوياً لا يُمسّ', ctx.regen() === 2 && /توصيةٌ بيدي/.test(fields['#recommendationsContent'].value)
      && fields['#recommendationsContent'].value.startsWith('نوصي المعلمة'));
check('regen: وغير المعدَّل يتبع الجنس', /يخطط المعلم/.test(fields['#strengthsContent'].value));

ctx.set(null);
check('regen: بلا توليدٍ سابق لا شيء', ctx.regen() === 0);

check('wiring: التبديل يستدعي الإعادة بعد الأوصاف',
      /updateScore\([\s\S]{0,200}\)\);\s*\n[^\n]*\n\s*try \{ if \(typeof supRegenderGenerated === 'function'\) supRegenderGenerated\(\); \}/.test(INIT));
check('wiring: التصفير يمحو ما وُلّد', /setEditingKey\(null\);\s*\n\s*supLastGenerated = null;/.test(SRC));
check('wiring: التوليد ينبّه على خلاف الجنس مع القاعدة', /supWarnGenderMismatch\(\);[\s\S]{0,400}supWriteGeneratedTexts\(\);/.test(SRC));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
