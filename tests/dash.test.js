// اختبار: node tests/dash.test.js
// لوحة المتابعة وملف المعلم (2026-10-26): قراءة الدرجات بصيغها، والتغطية والوتيرة، وتوزيع المستويات من آخر زيارةٍ لكلّ معلّم،
// والخريطة بالأحوج أوّلاً، والنموّ (السلّم مقلوب)، وملفّ المعلّم، ومتابعة التوصيات، وأهداف عين المشرف — ثمّ التوصيل في الصفحة.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const D = require('../js/dash-core.js');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const fd = (scores, extra) => {
    const o = Object.assign({ topic: 'التمرير' }, extra || {});
    scores.forEach((v, i) => { if (v != null) o['score-' + (i + 1)] = String(v); });
    return o;
};
const rep = (key, teacher, date, scores, school, extra) => ({ key, data: { teacherName: teacher, visitDate: date, school: school || 'مدرسة الرواد (5-10)', formData: fd(scores, extra) } });
const all13 = v => Array(13).fill(v);

/* ── ١) قراءة الدرجات ── */
{
    check('scores: formData الحديث', JSON.stringify(D.scoreMap({ formData: fd([1, 2, 3]) })) === '{"1":1,"2":2,"3":3}');
    check('scores: الصيغة الأقدم مصفوفةً في الجذر', JSON.stringify(D.scoreMap({ scores: [2, '3', 9, 0] })) === '{"1":2,"2":3}');
    check('scores: والكائن {item-N}', JSON.stringify(D.scoreMap({ scores: { 'item-4': 5, 'item-13': '1' } })) === '{"4":5,"13":1}');
    check('scores: formData يغلب الجذر', D.scoreMap({ scores: [5], formData: fd([1]) })[1] === 1);
    check('scores: البند بلا درجةٍ يغيب ولا يُحسب صفراً', !('2' in D.scoreMap({ formData: { 'score-1': '2', 'score-2': '' } })));
    const V = D.visitsFrom([rep('a', ' أحمد  سالم ', '2026-10-05', [1, 3, 5]), { key: 'b', data: { teacherName: '', visitDate: '2026-10-05' } },
                            { key: 'c', data: { teacherName: 'س', visitDate: 'غير تاريخ' } }]);
    check('visits: المعلّم والتاريخ شرطان، والاسم يُنظَّف، والمتوسّط بلا الغائب', V.length === 1 && V[0].teacher === 'أحمد سالم' && V[0].mean === 3 && V[0].weak === 1 && V[0].n === 3);
}

/* ── ٢) التغطية والوتيرة ── */
const range = { from: '2026-09-01', to: '2026-12-31' };
const rows = [
    rep('k1', 'أحمد', '2026-09-10', all13(4)), rep('k2', 'أحمد', '2026-11-02', all13(2)),
    rep('k3', 'بدر', '2026-09-20', [5, 4, 4, 3, 3, 3, 3, 3, 2, 4, 2, 2, 1]),
    rep('k4', 'جميلة', '2026-10-01', all13(2), 'مدرسة النور (1-4)'),
    rep('k5', 'دانة', '2026-08-15', all13(3), 'مدرسة النور (1-4)'),      // خارج الفترة
    rep('k6', 'زائر', '2026-10-10', all13(1), 'مدرسة أخرى')              // ليس في القائمة
];
const V = D.visitsFrom(rows);
const roster = [{ name: 'أحمد', school: 'مدرسة الرواد (5-10)' }, { name: 'بدر', school: 'مدرسة الرواد (5-10)' }, { name: 'جميلة', school: 'مدرسة النور (1-4)' },
                { name: 'دانة', school: 'مدرسة النور (1-4)' }, { name: 'هند', school: 'مدرسة النور (1-4)' }];
{
    const c = D.coverage(V, roster, range, 2);
    check('coverage: من القائمة — زرت ٣ من ٥، وبلغ المطلوب (٢) واحد', c.linked && c.total === 5 && c.visited === 3 && c.done === 1, JSON.stringify([c.total, c.visited, c.done]));
    check('coverage: الأقلّ تغطيةً أوّلاً، والزيارة خارج القائمة تُذكر ولا تدخل', c.schools[0].school === 'مدرسة النور (1-4)' && c.schools[0].visited === 1 && c.outside === 1
          && c.notVisited.map(p => p.name).join() === 'دانة,هند', JSON.stringify(c.schools.map(s => [s.school, s.visited, s.total])));
    const c2 = D.coverage(V, [], range, 2);
    check('coverage: بلا قائمةٍ تُبنى من زيارات الفترة', !c2.linked && c2.total === 4 && c2.visited === 4);
    const p = D.pace(V, range, 10, '2026-10-31');
    const last = p.weeks.filter(w => w.actual != null).pop();
    check('pace: أسابيع الفترة كلّها، والفعليّ حتّى اليوم ثمّ يتوقّف', p.weeks.length === 18 && p.weeks[0].from === '2026-09-01' && last.to >= '2026-10-27' && p.weeks[p.weeks.length - 1].actual === null,
          JSON.stringify([p.weeks.length, last]));
    check('pace: المطلوب يتصاعد إلى الهدف في آخر الفترة', p.weeks[p.weeks.length - 1].plan === 10 && p.weeks[0].plan > 0 && p.weeks[0].plan < 1);
    check('pace: المنجز (زيارة ٢/١١ بعد اليوم لا تُعدّ) والمتوقّع والفرق والمطلوب أسبوعيّاً', p.done === 4 && p.expected === 5 && p.gap === -1 && p.left === 6 && p.leftWeeks === 9 && p.perWeek === 1,
          JSON.stringify([p.done, p.expected, p.gap, p.left, p.leftWeeks, p.perWeek]));
    const p0 = D.pace(V, range, 10, '2026-08-20'), p1 = D.pace(V, range, 10, '2027-02-01');
    check('pace: قبل الفترة لم تبدأ، وبعدها انتهت', !p0.started && p0.done === 0 && p1.ended && p1.done === 5 && p1.perWeek === 5);
}

/* ── ٣) الضعف ── */
{
    const inR = V.filter(v => D.inRange(v, range));
    const d = D.distribution(inR);
    check('distribution: من آخر زيارةٍ لكلّ معلّم (أحمد مرّةً بدرجته الأخيرة)', d.teachers === 4 && d.items.find(x => x.id === 2).counts.join() === '1,2,0,1,0',
          JSON.stringify(d.items.find(x => x.id === 2)));
    check('distribution: الأضعف أوّلاً (البند ١: بدرجة ٥)، والنِّسب', d.items[0].id === 1 && d.items[0].weakPct === 25 && Math.round(d.items[0].pct.reduce((a, b) => a + b, 0)) === 100 && d.weakest.id === 1,
          d.items.slice(0, 3).map(x => x.id + ':' + x.weakPct).join(' '));
    check('distribution: بلا بندٍ «غير ملائم» فلا أضعف', D.distribution(D.visitsFrom([rep('x', 'س', '2026-10-01', all13(2))])).weakest === null);
    const h = D.heatmap(inR);
    check('heatmap: الأحوج أوّلاً (بدر: ٤ بنود)، ثلاثة عشر عموداً، والغائب null', h[0].teacher === 'بدر' && h[0].weak === 4 && h[0].scores.length === 13
          && D.heatmap(D.visitsFrom([rep('y', 'ص', '2026-10-01', [2, null, 3])]))[0].scores[1] === null, h.map(r => r.teacher + r.weak).join());
}

/* ── ٤) النموّ وملفّ المعلّم ── */
{
    const g = D.growth(V);
    check('growth: لمن زير مرّتين — أحمد من ٤ إلى ٢ = تحسّن ٢ في البنود كلّها', g.length === 1 && g[0].teacher === 'أحمد' && g[0].delta === 2 && g[0].up === 13 && g[0].down === 0
          && g[0].first.date === '2026-09-10' && g[0].last.date === '2026-11-02', JSON.stringify(g));
    const back = D.growth(D.visitsFrom([rep('a', 'م', '2026-09-01', all13(2)), rep('b', 'م', '2026-10-01', all13(3))]));
    check('growth: التراجع سالب (السلّم مقلوب)', back[0].delta === -1 && back[0].down === 13);
    const P = D.profile(V, 'أحمد');
    check('profile: الزيارات بترتيبها، ولكلّ بندٍ أوّل درجةٍ وآخرها وتاريخه', P.visits.length === 2 && P.items.length === 13 && P.items[0].first === 4 && P.items[0].last === 2
          && P.items[0].hist.join() === '4,2' && P.last.key === 'k2');
}

/* ── ٥) متابعة التوصيات ── */
{
    const S = [
        { key: 's1', data: { schoolName: 'مدرسة الرواد', visitDate: '2026-09-15', recs: [{ text: 'توفير كرات', due: '2026-09-30' }] } },
        { key: 's2', data: { schoolName: 'مدرسة الرواد', visitDate: '2026-10-20', recs: [{ text: 'مرمى', due: '2026-10-25' }, { text: 'سجل', due: '' }, { text: 'لاحق', due: '2026-11-30' }],
                              prevRecsReview: { items: [{ text: 'توفير كرات', status: 'partial' }] } } },
        { key: 's3', data: { schoolName: 'مدرسة النور', visitDate: '2026-10-01', recommendations: 'نوصي الإدارة بالآتي:\n- تظليل الملعب\n- توفير ماء\nوالله الموفق.',
                              prevRecsReview: { items: [{ status: 'done' }, { status: 'done' }, { status: 'not-done' }] } } },
        { key: 's4', data: { schoolName: 'مدرسة قديمة', visitDate: '2026-05-01', recs: [{ text: 'قديم', due: '2026-05-20' }] } }
    ];
    const f = D.recsFollow(S, range, '2026-10-31');
    const by = n => f.schools.find(s => s.school === n);
    check('recs: المقيَّم في الفترة، والمفتوح من آخر زيارة (متأخّر/في موعده)', by('مدرسة الرواد').partial === 1 && by('مدرسة الرواد').overdue === 1 && by('مدرسة الرواد').pending === 2,
          JSON.stringify(by('مدرسة الرواد')));
    check('recs: التقارير بلا بنيةٍ تُقرأ سطورها «- …» في موعدها', by('مدرسة النور').done === 2 && by('مدرسة النور').notDone === 1 && by('مدرسة النور').pending === 2);
    check('recs: المدرسة التي زيرت قبل الفترة تبقى توصياتها المفتوحة متأخّرة', by('مدرسة قديمة').overdue === 1 && f.overdue === 2 && f.overdueSchools === 2);
}

/* ── ٦) عين المشرف ── */
{
    const eye = JSON.stringify({ M: { observed: 1800, activePct: 40, people: { movingAll: 46, movingPlay: 58, detSecs: 900 } }, follow: { list: [{ k: 'move', verdict: 'met' }, { k: 'idle', verdict: 'same' }, { k: 'x', verdict: 'na' }] } });
    const E = D.visitsFrom([rep('e1', 'ع', '2026-10-05', all13(2), '', { eyeData: eye }), rep('e2', 'غ', '2026-10-06', all13(2), '', { eyeData: JSON.stringify({ M: { observed: 600, activePct: 30 } }) }),
                            rep('e3', 'ف', '2026-10-07', all13(2), '', { eyeData: '{تالف' })]);
    check('eye: حركة الطلبة من الكشف في الأنشطة، وإلّا حركة الصورة', E[0].eye.moving === 58 && E[1].eye.moving === 30 && E[2].eye === null);
    const t = D.eyeTargets(E);
    check('eye: الأهداف المقيسة (لم يُقس لا يُعدّ) ومتوسّط الحركة', t.observations === 2 && t.met === 1 && t.same === 1 && t.na === 1 && t.measured === 2 && t.moving === 44, JSON.stringify(t));
    check('profile: نقاط الحركة لملفّ المعلّم', D.profile(E, 'ع').eye.length === 1 && D.profile(E, 'ع').eye[0].moving === 58);
}

/* ── ٧) صياغة ── */
{
    check('shortSchool: بلا «مدرسة» ولا نطاق الصفوف ولا «للتعليم الأساسي»', D.shortSchool('مدرسة الخوض للتعليم الأساسي (5-10)') === 'الخوض' && D.shortSchool('مدرسة') === 'مدرسة');
    check('countWord: المفرد والمثنّى والجمع', D.countWord(1, 'زيارة واحدة', 'زيارتان', 'زيارات', 'زيارة') === 'زيارة واحدة'
          && D.countWord(2, 'a', 'زيارتان', 'b', 'c') === 'زيارتان' && D.countWord(7, 'a', 'b', 'زيارات', 'زيارة') === '7 زيارات' && D.countWord(14, 'a', 'b', 'زيارات', 'زيارة') === '14 زيارة');
    check('labels: ثلاثة عشر اسماً قصيراً بلا تكرار، وأسماء المستويات كالاستمارة', Object.keys(D.SHORT).length === 13 && new Set(Object.values(D.SHORT)).size === 13
          && Object.values(D.LEVELS).join('/') === 'متميز/جيد/ملائم/غير ملائم/تدخل سريع');
}

/* ── ٨) التوصيل ── */
{
    const H = read('reports.html'), UI = read('js/dash.js'), CH = read('js/charts.js'), SUP = read('js/supervisory.js'), SW = read('sw.js'), ST = read('js/storage.js');
    check('wiring: المحرّك والواجهة بعد term-board.js (فصلا المشرف)', H.indexOf('<script src="js/term-board.js"') < H.indexOf('<script src="js/dash-core.js"') && H.indexOf('<script src="js/dash-core.js"') < H.indexOf('<script src="js/dash.js"')
          && SW.includes("'./js/dash-core.js'") && SW.includes("'./js/dash.js'"));
    check('wiring: التبويبان «لوحة المتابعة» و«ملف المعلم» يُبنيان عند الفتح', /data-view="stats-view">[\s\S]{0,120}لوحة المتابعة/.test(H) && /data-view="dashboard-view">[\s\S]{0,120}ملف المعلم/.test(H)
          && /svfDashRender\(\)/.test(SUP) && /svfProfileRender\(\)/.test(SUP));
    check('wiring: لا دائرة ولا رادار ولا ثلاثة عشر خطّاً', !/type: 'pie'|type: 'radar'|chartTypeSelect/.test(UI + CH + H) && !/updateDashboardView|renderStatistics/.test(SUP + ST + CH));
    check('wiring: المحاور مقلوبةٌ للاتّجاه من اليمين، و«متميز» أقصى اليمين في أشرطة النموّ', (UI.match(/reverse: true/g) || []).length >= 4 && /x1 - \(v - 1\) \/ 4 \* \(x1 - x0\)/.test(UI));
    check('wiring: كلّ SVG باتّجاهٍ صريح (rtl) والأسماء بمرساة start — بلا اتّجاهٍ تُقصّ الأسماء العربيّة خارج الرسم ولا يبقى منها إلّا آخر حرف (وقع في أوّل نسخة)، وتنقلب حين يُحفظ الرسم صورةً',
          (UI.match(/direction="rtl" role="img"/g) || []).length === 4 && !/text-anchor="end" font-size="12" fill="#0f172a"/.test(UI));
    check('wiring: ألوان المستويات من SVF_COLORS.rating (ألوان أزرار الاستمارة)', /C && C\.rating/.test(CH) && /RATING\(\)\[s\]/.test(UI));
    check('wiring: الأسماء تُهرَّب في الخريطة والقوائم والتلميحات', /\$\{t\(nm\)\}/.test(UI) && /\$\{esc\(nm\)\}/.test(UI) && /title="\$\{esc\(tip\)\}"/.test(UI) && /<option value="\$\{esc\(k\)\}"/.test(UI));
    check('wiring: حفظ صورة لكلّ رسم (لوحٌ وSVG بخلفيّةٍ بيضاء)، والطباعة تُفتح داخل الضغطة', /function canvasPng/.test(CH) && /function svgPng/.test(CH) && /fillStyle = '#ffffff'/.test(CH)
          && /function printDash\(R\) \{\s*\n\s*const w = root\.open\(''/.test(UI));
    check('wiring: الضغط على المعلّم في الخريطة والنموّ والمدارس يفتح ملفّه', /querySelectorAll\('\.dash-row, \.dash-dot\[data-tk\]'\)[\s\S]{0,120}openProfile/.test(UI));
    check('wiring: المطلوب لكلّ معلّم يُعدَّل ويُذكر في المتصفّح', /PER_KEY = 'svf_dash_per'/.test(UI) && /localStorage\.setItem\(PER_KEY/.test(UI));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
