// اختبار: node tests/recs-v2.test.js
// تطوير التوصيات والملاحظات العامّة (2026-10-10):
//   ١) الجهة لكلّ توصية، والنصّ بمجموعات «نوصي … ونوصي …»
//   ٢) ما كتبه المشرف في حقل التوصيات يبقى عند إعادة التوليد
//   ٣) الاقتراح من نصّ رأي الزائر (نموذج المشرف الحقيقيّ)
//   ٤) لوحة «توصيات تنتظر المتابعة»
//   ٥) الملاحظات العامّة في الزيارة الإشرافيّة تصل إلى البوّابة
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'js/recs.js'));
const { svfRecsBoard, recLines } = require(path.join(ROOT, 'js/recs-board.js'));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ── ١) الجهة ── */
{
    const list = [
        { category: 'equipment', items: [{ name: 'أقماع' }], perList: false, extra: false },
        { category: 'records', who: 'المعلمات', options: ['follow'] },
        { category: 'schedule', who: 'المعلمة', options: ['daily'] },
        { category: 'free', manual: true, text: 'تفعيل الإذاعة الرياضية', audience: 'المعلمات' }
    ];
    const t = R.buildText(list);
    const lines = t.split('\n');
    check('group: الإدارة أوّلاً (الأدوات والجدول معاً)', lines[0] === 'نوصي إدارة المدرسة بالآتي:'
          && lines[1].startsWith('- توفير الأدوات') && lines[2].startsWith('- تغيير جدول المعلمة'), t);
    check('group: والمعلّمات بـ«ونوصي» ومعها السجلات والحرّة',
          lines[3] === 'ونوصي المعلمات بالآتي:' && /سجلات المتابعة/.test(lines[4]) && /الإذاعة الرياضية/.test(lines[5]), t);
    check('group: خاتمةٌ واحدة', lines[lines.length - 1] === R.CLOSING && t.split(R.CLOSING).length === 2);
    check('audienceOf: الجدول للإدارة (هي من تغيّره)', R.audienceOf({ category: 'schedule', who: 'المعلمة' }) === 'إدارة المدرسة');
    check('audienceOf: السجلات لمن يُعدّها', R.audienceOf({ category: 'records', who: 'المعلم' }) === 'المعلم');
}

/* ── ٢) الدمج ── */
{
    const g1 = R.groupRecs([{ category: 'playground', options: ['repaint'] }, { category: 'records', who: 'المعلم', options: ['nour'] }]);
    let r = R.mergeRecs('', [], g1);
    check('merge: الحقل الفارغ يأخذ المولَّد', r.text === R.textFromGroups(g1) && r.kept === 0);
    const gen1 = r.gen;

    // المشرف أضاف سطراً، وعدّل بند التحضير، وحذف لا شيء
    const edited = r.text
        .replace('إتمام تحضير الدروس في منصة نور أولاً بأول.', 'إتمام تحضير دروس الصف العاشر في منصة نور.')
        .replace(R.CLOSING, '- توصيةٌ كتبتها بيدي.\n' + R.CLOSING);
    const g2 = R.groupRecs([{ category: 'playground', options: ['repaint'] }, { category: 'records', who: 'المعلم', options: ['nour'] },
                            { category: 'activity', options: ['teams'] }]);
    r = R.mergeRecs(edited, gen1, g2);
    check('merge: السطر المضاف يبقى', r.text.includes('توصيةٌ كتبتها بيدي'));
    check('merge: والمعدَّل يبقى بنصّ المشرف', r.text.includes('إتمام تحضير دروس الصف العاشر'));
    check('merge: والأصل المعدَّل لا يعود', !r.text.includes('إتمام تحضير الدروس في منصة نور أولاً بأول'), r.text);
    check('merge: والجديد يُضاف في مجموعته', /نوصي إدارة المدرسة بالآتي:\n- تجديد تخطيط الملعب\.\n- تشكيل الفرق المدرسية/.test(r.text), r.text);
    check('merge: والخاتمة آخراً مرّةً واحدة', r.text.endsWith(R.CLOSING) && r.text.split(R.CLOSING).length === 2);
    check('merge: عدد ما أُبقي', r.kept === 2, String(r.kept));

    // حذف المشرف بنداً مولَّداً ← لا يعود
    const deleted = r.text.replace('- تجديد تخطيط الملعب.\n', '');
    const r2 = R.mergeRecs(deleted, r.state, g2);
    check('merge: المحذوف لا يعود', !r2.text.includes('تجديد تخطيط الملعب'), r2.text);
    check('merge: والتوليد الثالث بلا تكرار', R.mergeRecs(r2.text, r2.state, g2).text === r2.text);

    // نصٌّ قديمٌ كُتب كلّه باليد (بلا سجلٍّ لما وُلّد)
    const legacy = 'نوصي إدارة المدرسة بالآتي:\n- صيانة المظلّة.\nوالله الموفق.';
    const r3 = R.mergeRecs(legacy, [], g1);
    check('merge: النصّ اليدويّ القديم يبقى ويُضاف المولَّد', r3.text.includes('صيانة المظلّة') && r3.text.includes('تجديد تخطيط الملعب'));
    // الزرّ القديم بلا ملاحظاتٍ ولا قائمة: لا يُفرغ الحقل
    const r4 = R.mergeRecs(legacy, [], []);
    check('merge: لا توليد ← لا يُمحى ما كتبه المشرف', r4.text.includes('صيانة المظلّة'));
}

/* ── ٣) من رأي الزائر — نموذج المشرف (2026-10-07) ── */
{
    const opinion = 'أ. سالم البوسعيدي: سجلاته مكتملة (الزي + الأداء العملي)، والمعلم لم يفعل سجل الزي والملاحظة للصف العاشر، '
        + 'ويوجد تحضير لدرسين فقط للصف الثاني عشر ولا يتوفر تحضير للعاشر.\n'
        + 'أ. محمود: ولديه تأخر في المنهاج حيث أن المعلم لم يقم بتدريس الوحدة الثانية بعد.\n'
        + 'تم حضور الطابور المدرسي، وكان الهتاف بصوت عالي والانصراف منظماً.';
    const s = R.suggestFromOpinion(opinion, 'المعلمين');
    const rec = s.find(x => x.rec.category === 'records');
    check('opinion: السجلّ والتحضير والمنهاج في توصيةٍ واحدة للمعلّمين',
          rec && ['follow', 'nour', 'plan'].every(o => rec.rec.options.includes(o)) && rec.rec.who === 'المعلمين', JSON.stringify(s));
    check('opinion: «الهتاف بصوت عالي والانصراف منظماً» ليس مشكلة', !s.some(x => /الطابور/.test(R.recText(x.rec))));
    check('opinion: «سجلاته مكتملة» وحدها لا تقترح شيئاً', R.suggestFromOpinion('سجلاته مكتملة وتحضيراته مكتملة.', 'المعلم').length === 0);
    check('opinion: الهتاف الضعيف ← توصية الطابور للإدارة',
          R.suggestFromOpinion('وكان الهتاف ضعيفاً', '').some(x => /الطابور/.test(R.recText(x.rec)) && R.audienceOf(x.rec) === 'إدارة المدرسة'));
    check('opinion: نقص الأدوات ← الأدوات', R.suggestFromOpinion('يوجد نقص في الأدوات الرياضية', '').some(x => x.rec.category === 'equipment'));
    check('opinion: الصيغة بالتشكيل والهمزة («يفعّل»، «تأخّر») تُفهم',
          R.suggestFromOpinion('لم يفعّل سجل الزي، وتأخّر في المنهاج', 'المعلم').length === 1);
    check('opinion: نصٌّ فارغ ← لا شيء', R.suggestFromOpinion('', '').length === 0);
}

/* ── ٤) لوحة المتابعة ── */
{
    const rep = (key, school, date, recs, recommendations) => ({ key, data: { schoolName: school, visitDate: date, recs, recommendations } });
    const reports = [
        rep('a1', 'مدرسة الأمل', '2026-09-01', [{ text: 'قديمةٌ تابعتها زيارةٌ لاحقة', due: '2026-09-10' }]),
        rep('a2', 'مدرسة الأمل', '2026-09-28', [{ text: 'توفير الأدوات خلال أسبوع', due: '2026-10-05' },
                                                { text: 'تشكيل الفرق قبل الزيارة القادمة', due: '' }]),
        rep('b1', 'نور الإسلام', '2026-10-06', [{ text: 'تجديد التخطيط خلال أسبوع', due: '2026-10-13' }]),
        rep('c1', 'يزيد بن حاتم', '2026-10-01', [], 'نوصي إدارة المدرسة بالآتي:\n- صيانة المظلّة.\nوالله الموفق.')
    ];
    const b = svfRecsBoard(reports, '2026-10-10');
    check('board: آخر زيارةٍ لكلّ مدرسة وحدها', !JSON.stringify(b).includes('قديمةٌ تابعتها'));
    check('board: المتأخّرة بعدد أيّامها', b.overdue.length === 1 && b.overdue[0].late === 5 && b.overdue[0].school === 'مدرسة الأمل');
    check('board: التي تحين خلال أسبوع', b.soon.length === 1 && b.soon[0].left === 3 && b.soon[0].school === 'نور الإسلام');
    check('board: بلا تاريخ ← عند الزيارة القادمة، ومنها نصٌّ قديمٌ بلا بنية',
          b.next.length === 2 && b.next.some(x => x.school === 'يزيد بن حاتم' && x.items[0].text === 'صيانة المظلّة.'));
    check('board: الأقدم زيارةً أوّلاً', b.next[0].school === 'مدرسة الأمل');
    check('recLines: سطور «- » وحدها', recLines('نوصي…:\n- أ.\n- ب.\nوالله الموفق.').join('|') === 'أ.|ب.');
    check('board: لا شيء ← total صفر', svfRecsBoard([], '2026-10-10').total === 0);
}

/* ── التوصيل ── */
{
    const ui = read('js/recs-ui.js'), school = read('js/school.js'), init = read('js/init.js');
    const html = read('reports.html'), sw = read('sw.js'), sup = read('js/supervisory.js');
    const exp = read('js/export.js'), q = read('js/queue-export.js');
    const script = read('tools/daf51553aa5f5d6215/school-visits-automation.user.js');
    check('wiring: «إدراج» و«توليد» يمرّان بالدمج', /const r = R\.mergeRecs\(field\.value, recsGen, groups\);/.test(ui)
          && /window\.svfRecsGenerate\(extra\)/.test(school));
    check('wiring: الزرّ القديم لم يعد يُفرغ الحقل', !/recEl\.value = '';/.test(school));
    check('wiring: سجلّ التوليد يُحفظ ويُستعاد ويُصفَّر', /recsGen: \(typeof getSchoolRecsGen/.test(school)
          && /setSchoolRecsGen\(report\.recsGen/.test(school) && /setSchoolRecsGen\(\[\]\)/.test(init));
    check('wiring: تقييم التوصيات السابقة يُحفظ', /prevRecsReview:/.test(school));
    check('wiring: اقتراحات رأي الزائر تتبع الكتابة فيه', /getElementById\('visitorOpinion'\)[\s\S]{0,60}addEventListener\('input'/.test(ui) || /el\('visitorOpinion'\)\.addEventListener\('input'/.test(ui));
    check('wiring: البنك', /BANK_KEY = 'svf_recs_bank'/.test(ui) && /احفظ في بنكي/.test(ui));
    check('wiring: اللوحة في سجلّ التقارير المدرسيّة', /id="recsBoard"/.test(html) && /renderRecsBoard\(\)/.test(school)
          && html.includes('js/recs-board.js') && sw.includes("'./js/recs-board.js'"));
    check('wiring: الملاحظات العامّة في النموذج الإشرافيّ', /id="generalNotesContent"/.test(html) && /supNotesChipsInit\(\)/.test(init));
    check('wiring: وتصل البوّابة بالمسارات الثلاثة',
          /notesGeneral:\s+q\('#generalNotesContent'\)/.test(exp) && /notesGeneral:\s+f\('generalNotesContent', 'notesGeneral'\)/.test(q)
          && /notesGeneral: \$\('#generalNotesContent'\)/.test(script));
    check('wiring: عبارات الملاحظات بصيغة الجنس', /applyGenderFilter\(String\(text\), getSupervisoryGender\(\)\)/.test(sup)
          && !/\[\/[^\]]+\]/.test((sup.match(/const SUP_NOTE_CHIPS = \[[\s\S]*?\];/) || [''])[0]));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
