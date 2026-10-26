// اختبار: node tests/eye.test.js
// عين المشرف (2026-10-25): فرق الإطارات وطرح الإضاءة واستبعاد اهتزاز الكاميرا، وحالة كلّ ثانية،
// وملخّص الحصة (النشاط، الانتظار، الانتقالات، البنية، المساحة)، والصوت (كلام وصفّارة)،
// والتقييم المقترح بشواهده — وبنودٌ لا تُقترح — والتوصيل في الصفحة.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const E = require('../js/eye-core.js');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ── ١) الصورة ── */
{
    const w = 24, h = 18, n = w * h;
    const base = new Uint8Array(n).fill(100);
    check('frame: إطاران متطابقان ← لا حركة', E.frameDiff(base, base, w, h, 20).m === 0);
    const brighter = new Uint8Array(n).fill(140);
    const lit = E.frameDiff(base, brighter, w, h, 20);
    check('frame: تغيّر الإضاءة العامّ يُطرح ولا يُعدّ حركة', lit.m === 0 && !lit.shake, JSON.stringify(lit));

    const moved = base.slice();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) moved[y * w + x] = 220;   // جسمٌ في الزاوية
    const grid = new Uint32Array(E.GRID_W * E.GRID_H);
    const r = E.frameDiff(base, moved, w, h, 20, grid);
    check('frame: جسمٌ يتحرّك ← نسبةٌ صغيرة', r.m > 0.02 && r.m < 0.06 && !r.shake, r.m);
    check('frame: والخريطة تجمع حركته في خليّة الزاوية', grid[0] > 0 && grid[E.GRID_W * E.GRID_H - 1] === 0);

    const noisy = new Uint8Array(n);
    for (let i = 0; i < n; i++) noisy[i] = i % 2 ? 0 : 255;
    const grid2 = new Uint32Array(E.GRID_W * E.GRID_H);
    const s = E.frameDiff(base, noisy, w, h, 20, grid2);
    check('frame: الصورة كلّها تتغيّر ← اهتزاز الكاميرا، والخريطة لا تُمسّ', s.shake && grid2.every(v => v === 0));

    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = E.toGray(rgba, 2);
    check('frame: الرماديّ من RGBA', gray[0] >= 254 && gray[1] === 0, Array.from(gray).join());
}

/* ── ٢) حالة كلّ ثانية ── */
const A = 0.05, I = 0.002, act = E.SENS.medium.active;
const rep = (v, n) => Array(n).fill(v);
{
    const st = E.classify([...rep(A, 60), ...rep(I, 40), ...rep(A, 60)], act);
    const runs = E.runsOf(st);
    check('classify: نشاط ← انتظار ← نشاط', runs.map(r => r.k).join('') === 'aia', runs.map(r => r.k + r.len).join(' '));
    const blip = E.classify([...rep(I, 60), ...rep(A, 5), ...rep(I, 60)], act);
    check('classify: ارتجافة خمس ثوانٍ لا تُعدّ نشاطاً', blip.every(k => k === 'i'));
    const gap = E.classify([...rep(A, 30), ...rep(null, 10), ...rep(A, 30)], act);
    check('classify: ثوانٍ بلا إطارٍ صالح ← غير محسوبة', gap.filter(k => k === 'x').length === 10 && gap.filter(k => k === 'i').length === 0);
}

/* ── ٣) ملخّص حصةٍ من أربعين دقيقة ── */
// إحماء ٨ د نشط، شرحٌ دقيقتان (كلام)، جزءٌ رئيس ٢٢ د فيه انتظاران (دقيقة ودقيقتان) بصفّارة، ختام ٨ د هادئ
const lesson = [];
const push = (m, n, extra) => { for (let i = 0; i < n; i++) lesson.push(Object.assign({ m, v: false, w: false }, extra && extra(i))); };
push(A, 480);
push(I, 120, () => ({ v: true }));
push(A, 360);
push(I, 60, i => ({ w: i === 0, v: true }));
push(A, 420);
push(I, 120, i => ({ w: i === 0 }));
push(A, 360);
push(I, 480, i => ({ v: i % 2 === 0 }));
const grid = Array(E.GRID_W * E.GRID_H).fill(0).map((v, i) => (i % 3 ? 40 : 5));
const M = E.summarize({ secs: lesson, grid, sens: 'medium' });
{
    check('summary: الزمن المرصود', M.observed === 2400 && M.excludedSec === 0, M.observed);
    check('summary: زمن النشاط الحركي (٦٧٫٥٪ مع تأخّر التنعيم ثوانيَ)', M.activePct >= 67 && M.activePct <= 69, M.activePct);
    check('summary: الانتظار في الوسط ثلاث فترات (الشرح والانتظاران)، أطولها دقيقتان', M.waits === 3 && M.longestIdle >= 114 && M.longestIdle <= 120, M.waits + ' / ' + M.longestIdle);
    check('summary: الانتقالات التي صحبتها صفّارة', M.cued === 2 && M.whistles === 2, M.cued + ' / ' + M.whistles);
    check('summary: الشرح = كلامٌ في انتظار', Math.abs(M.explainSec - (120 + 60 + 240)) <= 15, M.explainSec);
    check('summary: بنية الحصة (إحماء، رئيس، ختام هادئ)', M.structure.warm && M.structure.main && M.structure.close, JSON.stringify(M.phases));
    check('summary: المساحة', M.space.coverage > 50 && M.space.concentration < 40, JSON.stringify(M.space));
    check('summary: الخطّ الزمنيّ عشر ثوانٍ', M.timeline.length === 240 && M.timeline[0].k === 'a' && M.timeline[239].k === 'i');
    const empty = E.summarize({ secs: [], grid: [] });
    check('summary: بلا رصدٍ لا قسمة على صفر', empty.observed === 0 && empty.activePct === 0);
}

/* ── ٤) التقييم المقترح ── */
{
    const sug = E.suggest(M, {}, { female: false });
    const by = id => sug.find(s => s.id === id);
    check('suggest: الإدارة الصفّيّة من الكاميرا (٦٨٪ ← متميز)', by(7) && by(7).score === 1 && by(7).basis === 'camera', JSON.stringify(by(7)));
    check('suggest: شاهدها بالأرقام', /\(68%\)/.test(by(7).evidence) && /دقيقتان/.test(by(7).evidence) && /بالصفّارة/.test(by(7).evidence), by(7).evidence);
    check('suggest: بنية الحصة ← «جيد» لا «متميز» من الكاميرا وحدها', by(6) && by(6).score === 2, JSON.stringify(by(6)));
    check('suggest: بلا تسجيلاتٍ لا اقتراح لبنود التدريس والتقويم', !by(8) && !by(10) && !by(3) && !by(4));
    check('suggest: البنود ١ و١١–١٣ لا تُقترح أبداً', [1, 11, 12, 13].every(id => !by(id)));

    const lazy = E.summarize({ secs: [...rep({ m: A }, 300), ...rep({ m: I }, 400), ...rep({ m: A }, 300)], grid: [] });
    const s7 = E.suggest(lazy, {}, {}).find(s => s.id === 7);
    check('suggest: انتظارٌ طويل (أكثر من خمس دقائق) ينزل بالدرجة', s7 && lazy.activePct === 60 && s7.score === 2, lazy.activePct + ' / ' + (s7 && s7.score));
    const short = E.summarize({ secs: rep({ m: A }, 300), grid: [] });
    check('suggest: أقلّ من عشر دقائق ← لا اقتراح للإدارة الصفّيّة', !E.suggest(short, {}, {}).some(s => s.id === 7));

    const counts = { demo: 1, groups: 2, games: 1, fbInd: 5, fbGrp: 2, ask: 1, lead: 1, team: 1, praise: 3, include: 1, safe: 1, hazard: 1, tools: 1 };
    const fem = E.suggest(M, counts, { female: true, pupil: s => s.replace(/للطلبة/g, 'للتلاميذ').replace(/الطلبة/g, 'التلاميذ') });
    const f = id => fem.find(s => s.id === id);
    check('suggest: ثلاث استراتيجيّات ← جيد، بصيغة المؤنّث', f(8).score === 2 && /نوّعت المعلمة بين: عرض نموذجي للمهارة، ومجموعات/.test(f(8).evidence), f(8).evidence);
    check('suggest: تقويمٌ متنوّع (٨ مرّات، ٣ أنواع) ← متميز', f(10).score === 1 && /فردية \(5\) مرّات/.test(f(10).evidence), f(10).evidence);
    check('suggest: مهارتا تعلّم ← جيد', f(3).score === 2);
    check('suggest: تعزيزٌ بلا سلوكٍ سلبيّ ← متميز', f(4).score === 1);
    check('suggest: موقفٌ خطر مع تهيئةٍ آمنة ← ملائم', f(5).score === 3 && /موقفٌ خطر/.test(f(5).evidence), f(5).evidence);
    check('suggest: الدمج مرّةً واحدة ← جيد', f(2).score === 2);
    check('suggest: أدواتٌ كافية ← جيد، والفعل كاملٌ', f(9).score === 2 && /^وُظّفت أدواتٌ/.test(f(9).evidence), f(9).evidence);
    const tn = E.suggest(M, { tools: 1, noTools: 1, misbehave: 1 }, {});
    check('suggest: شاهدٌ سلبيّ وحده يبدأ بفعله، ومع الإيجابيّ يُعطف', /^رُصد سلوكٌ/.test(tn.find(s => s.id === 4).evidence) && /، ورُصد نقصٌ/.test(tn.find(s => s.id === 9).evidence));
    check('suggest: الاستراتيجيّات من اللمسات ما لم يطل الشرح', f(8).basis === 'taps');
    check('suggest: «التلاميذ» للصفوف ١–٤', /للتلاميذ/.test(f(7).evidence) && !/طلبة/.test(f(7).evidence));
    check('suggest: الدرجات بين ١ و٥ ومرتّبةٌ بالبند', fem.every(s => s.score >= 1 && s.score <= 5) && fem.map(s => s.id).join() === fem.map(s => s.id).sort((a, b) => a - b).join());

    const neg = E.suggest(M, { misbehave: 2, noTools: 2 }, {});
    check('suggest: شواهد سلبيّة ← «تدخل سريع»/«غير ملائم»', neg.find(s => s.id === 4).score === 5 && neg.find(s => s.id === 9).score === 4);

    const un = E.unsupported(sug, M);
    check('unsupported: البنود بلا اقتراحٍ مع سببها', un.some(u => u.id === 1 && /تحصيل/.test(u.why)) && un.some(u => u.id === 8 && /يقدّرها المشرف/.test(u.why)));
}

/* ── ٥) الملخّص والصياغة ── */
{
    const txt = E.summaryText(M, {});
    check('summaryText: سطرٌ قصيرٌ بالأرقام', /^رُصدت الحصة بعين المشرف \(40\) دقيقة/.test(txt) && /\(68%\)/.test(txt) && txt.length < 300, txt);
    check('dur/count: التمييز', E.dur(1) === 'ثانية واحدة' && E.dur(120) === 'دقيقتان' && E.dur(300) === '(5) دقائق' && E.dur(900) === '(15) دقيقة');
    check('summaryText: بلا رصدٍ ← فارغ', E.summaryText({ observed: 0 }) === '');
}

/* ── ٦) الصوت ── */
{
    const len = 1024, binHz = 48000 / 2048;
    const spec = f => { const a = new Float32Array(len); for (let i = 0; i < len; i++) a[i] = f(i * binHz); return a; };
    const st = { t: 0 };
    const quiet = spec(() => -90);
    for (let k = 0; k < 10; k++) { st.t = k / 10; E.audioFrame(quiet, binHz, st); }
    const talk = spec(hz => (hz > 300 && hz < 3400 ? -60 : -90));
    st.t = 1.1;
    check('audio: كلامٌ فوق أرضيّة الضجيج', E.audioFrame(talk, binHz, st).voice === true);
    st.t = 1.2;
    check('audio: الهدوء ليس كلاماً', E.audioFrame(quiet, binHz, st).voice === false);
    const whistle = spec(hz => (Math.abs(hz - 3000) < 40 ? -30 : -85));
    st.t = 2.0; const w1 = E.audioFrame(whistle, binHz, st).whistle;
    st.t = 2.1; const w2 = E.audioFrame(whistle, binHz, st).whistle;
    st.t = 2.2; const w3 = E.audioFrame(whistle, binHz, st).whistle;
    check('audio: الصفّارة تُعدّ مرّةً واحدة بعد إطارين', !w1 && w2 && !w3);
    st.t = 2.3; E.audioFrame(quiet, binHz, st);
    st.t = 2.4; E.audioFrame(whistle, binHz, st);
    st.t = 2.5;
    check('audio: صفّارةٌ ثانية خلال ثانيةٍ لا تُكرَّر', E.audioFrame(whistle, binHz, st).whistle === false);
    const speech = spec(hz => (hz > 300 && hz < 3000 ? -45 : -90));        // كلامٌ ينتهي عند ٣ كيلوهرتز: حافّةٌ لا نغمة
    const st3 = { t: 9 };
    E.audioFrame(speech, binHz, st3); st3.t = 9.1;
    check('audio: حافّة طيف الكلام ليست صفّارة', E.audioFrame(speech, binHz, st3).whistle === false);
    const broad = spec(hz => (hz > 1000 && hz < 6000 ? -40 : -90));
    const st2 = { t: 5 };
    E.audioFrame(broad, binHz, st2); st2.t = 5.1;
    check('audio: ضجيجٌ عريض (هتاف) ليس صفّارة', E.audioFrame(broad, binHz, st2).whistle === false);
}

/* ── ٧) الوسوم ── */
{
    check('tags: كلّ وسمٍ في مجموعةٍ واحدة', E.TAGS.every(t => E.GROUPS.filter(gp => gp.keys.includes(t.k)).length === 1));
    check('tags: كلّ وسمٍ يشهد لبندٍ يُقترح', E.TAGS.every(t => [2, 3, 4, 5, 8, 9, 10].includes(t.item)));
}

/* ── ٨) التوصيل ── */
{
    const H = read('reports.html'), S = read('js/supervisory.js'), UI = read('js/eye.js'), SW = read('sw.js'), G = read('js/gate.js');
    const fv = H.indexOf('<div id="form-view"'), ev = H.indexOf('<div id="eye-view"'), dv = H.indexOf('<div id="debrief-view"');
    check('wiring: الحالة حقلٌ مخفيّ داخل #form-view (يُحفظ مع التقرير ويُصفَّر معه)', fv > 0 && H.indexOf('id="eyeData"') > fv && H.indexOf('id="eyeData"') < dv);
    check('wiring: التبويب والشاشة', H.includes('data-view="eye-view"') && ev > 0 && H.includes('id="eyeBody"'));
    check('wiring: التبديل يُخفيها ويبنيها ولا يفتحها لغير أصحابها',
          S.includes(", #eye-view').forEach") && /viewId === 'eye-view' && typeof svfEyeOpen === 'function'/.test(S)
          && /viewId === 'eye-view' && !\(window\.SupervisorGate && SupervisorGate\.canEye && SupervisorGate\.canEye\(\)\)\) viewId = 'form-view';/.test(S));
    check('wiring: لأسعد وحده (gate.js)', /const EYE_OWNERS = \['asad'\];/.test(G)
          && /html:not\(\[\$\{EYE\}\]\) \.nav-tab\[data-view="eye-view"\],\s*html:not\(\[\$\{EYE\}\]\) #eye-view \{ display: none !important; \}/.test(G));
    check('wiring: السكربتان قبل init.js وفي عامل الخدمة', /eye-core\.js[\s\S]*eye\.js[\s\S]*init\.js/.test(H.slice(H.indexOf('js/debrief.js'))) && SW.includes("'./js/eye-core.js'") && SW.includes("'./js/eye.js'"));
    check('wiring: لا تُحفظ صورٌ ولا صوت', !/toDataURL|MediaRecorder|toBlob/.test(UI));
    check('wiring: الكاميرا والصوت يُغلقان عند الإيقاف', /getTracks\(\)\.forEach\(t => t\.stop\(\)\)/.test(UI) && /\.close\(\)/.test(UI));
    check('wiring: النصوص مهروبة', ['${esc(s.evidence)}', '${esc(title(s.id))}', '${esc(u.why)}'].every(x => UI.includes(x)));
    check('wiring: التطبيق يمرّ بأزرار التقييم نفسها', /\.rating-btn\[data-score="/.test(UI) && /\.click\(\)/.test(UI));
}

/* ══ المرحلة الأولى (2026-10-26) ══ */

/* ── ٩) منطقة الصفّ ── */
{
    const sq = [[0.5, 0], [1, 0], [1, 1], [0.5, 1]];                  // النصف الأيسر من الصورة (x ≥ ٠٫٥)
    check('roi: نقطةٌ داخلها وخارجها', E.inPoly(0.75, 0.5, sq) && !E.inPoly(0.25, 0.5, sq));
    check('roi: بلا منطقةٍ كلّ شيءٍ داخل', E.inPoly(0.1, 0.1, null) && E.roiMask(null, 10, 10) === null);
    const w = 24, h = 18, n = w * h;
    const mask = E.roiMask(sq, w, h);
    check('roi: القناع نصف الصورة', mask.reduce((a, v) => a + v, 0) === n / 2);
    const base = new Uint8Array(n).fill(100);
    const moved = base.slice();
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) moved[y * w + x] = 220;       // حركةٌ في الربع الأيمن العلويّ (خارج المنطقة)
    check('roi: الحركة خارج المنطقة لا تُحسب', E.frameDiff(base, moved, w, h, 20, null, mask).m === 0 && E.frameDiff(base, moved, w, h, 20).m > 0);
    const inside = base.slice();
    for (let y = 0; y < 6; y++) for (let x = 18; x < 24; x++) inside[y * w + x] = 220;
    const r = E.frameDiff(base, inside, w, h, 20, null, mask);
    check('roi: والحركة داخلها نسبتُها من مساحة المنطقة لا من الصورة', Math.abs(r.m - 36 / (n / 2)) < 1e-9, r.m);
    const cells = E.roiCells(sq);
    check('roi: خلايا الشبكة داخل المنطقة', cells.length === E.GRID_W * E.GRID_H && cells[0] === 0 && cells[E.GRID_W - 1] === 1);
    const pb = E.polyBox([[0.2, 0.3], [0.6, 0.3], [0.6, 0.9], [0.2, 0.9]], 0.05);
    check('roi: صندوق القصّ بهامش', Math.abs(pb.x - 0.15) < 1e-9 && Math.abs(pb.w - 0.5) < 1e-9 && Math.abs(pb.y + pb.h - 0.95) < 1e-9, JSON.stringify(pb));
    const grid = Array(E.GRID_W * E.GRID_H).fill(0).map((v, i) => (i % E.GRID_W >= E.GRID_W / 2 ? 50 : 0));
    const Mr = E.summarize({ secs: [{ m: 0.05 }], grid, cells, sens: 'medium' });
    check('roi: استثمار المساحة من منطقة الصفّ وحدها', Mr.space.coverage === 100, JSON.stringify(Mr.space));
}

/* ── ١٠) حركة الطالب في مكانه ── */
{
    const w = 40, h = 30, n = w * h;
    const a = new Uint8Array(n).fill(90), b = a.slice();
    for (let y = 10; y < 20; y++) for (let x = 10; x < 15; x++) b[y * w + x] = 200;
    const box = { x: 10 / w, y: 10 / h, w: 10 / w, h: 10 / h };
    check('boxMotion: نصف الصندوق تغيّر', Math.abs(E.boxMotion(a, b, w, h, box, 20, 0) - 0.5) < 0.01);
    check('boxMotion: صندوقٌ ساكن', E.boxMotion(a, b, w, h, { x: 0.8, y: 0.1, w: 0.1, h: 0.2 }, 20, 0) === 0);
    check('boxMotion: بلا إطارٍ سابقٍ صفر', E.boxMotion(null, b, w, h, box, 20, 0) === 0);
}

/* ── ١١) تتبّع الطلبة ── */
const H = 0.2;                                              // طول الجسم خُمس الإطار
const person = (x, y, extra) => Object.assign({ x, y, w: 0.06, h: H, score: 0.8 }, extra);
{
    const T = E.newTracker();
    // طالبٌ يجري يميناً، وطالبٌ ساكن، وثالثٌ خارج المنطقة
    for (let k = 0; k <= 6; k++) {
        const t = k * 0.5;
        E.trackStep(T, [person(0.1 + 0.06 * k, 0.5), person(0.6, 0.4), person(0.9, 0.05, { score: 0.9 })], t, 16 / 9);
    }
    const roi = [[0, 0.3], [0.8, 0.3], [0.8, 1], [0, 1]];
    const snap = E.peopleSnapshot(T, 3, roi);
    check('track: ثلاثة أشخاصٍ بثلاثة معرّفاتٍ ثابتة', T.tracks.length === 3 && T.next === 4, T.tracks.length + ' / ' + T.next);
    check('track: داخل المنطقة اثنان، وخارجها واحد', snap.n === 2 && snap.o === 1 && snap.r, JSON.stringify(snap));
    check('track: الجاري يتحرّك والساكن لا', snap.mv === 1 && snap.dots.filter(d => d.mv).length === 1);
    const weak = E.newTracker();
    E.trackStep(weak, [person(0.3, 0.3, { score: 0.2 })], 0, 1);
    check('track: الكشف الضعيف (أقلّ من ٠٫٣) يُهمل', weak.tracks.length === 0);
    E.trackStep(T, [], 10, 16 / 9);
    check('track: من غاب أكثر من ثانيتين ونصف يُنسى', T.tracks.length === 0);

    const Q = E.newTracker();
    const still = [person(0.3, 0.5), person(0.33, 0.5), person(0.36, 0.5), person(0.8, 0.5, { act: 0.3 })];
    for (let k = 0; k <= 4; k++) E.trackStep(Q, still, k * 0.5, 16 / 9);
    const q = E.peopleSnapshot(Q, 2, null);
    check('track: ثلاثةٌ واقفون متقاربون ← انتظار دور', q.q === 3 && q.n === 4, JSON.stringify({ n: q.n, mv: q.mv, q: q.q }));
    check('track: الحركة في المكان (تمرين) تُعدّ حركة', q.mv === 1);
}

/* ── ١٢) عناصر الحصة الخمسة، وعدد الطلبة، والتشكيلات عبر الحصة ── */
// ٣٠ دقيقة: إحماء ٥ د (انتشار حرّ)، إعداد بدني ٥ د (قاطرة من ٨)، تعليميّة ١٠ د (مجموعات، ٦ د نشاط ثمّ ٤ د شرح)،
// تطبيقيّة ٧٫٥ د (قاطرات من ٥)، ختام ٢٫٥ د (دائرة، هدوء) — ٢٠ طالباً واثنان خارج المنطقة، وثلاثةٌ بغير الزيّ
const partEv = [{ t: 0, k: 'warm' }, { t: 300, k: 'fit' }, { t: 600, k: 'teach' }, { t: 1200, k: 'apply' }, { t: 1650, k: 'close' }];
const PLAN = t => t < 300 ? ['warm', 14, 'S', 0] : t < 600 ? ['fit', 12, 'L', 8] : t < 1200 ? ['teach', 8, 'G', 0] : t < 1650 ? ['apply', 14, 'L', 5] : ['close', 2, 'C', 0];
const lesson2 = [];
for (let t = 0; t < 1800; t++) {
    const [k, mv, fm, ln] = PLAN(t);
    const idle = k === 'close' || (k === 'teach' && t >= 960);
    lesson2.push({ m: idle ? 0.004 : 0.05, v: (k === 'teach' && idle) || ((k === 'warm' || k === 'apply') && t % 4 === 0), w: false,
                   p: { n: t === 1300 ? 28 : 20, mv, o: 2, q: k === 'teach' ? 6 : 0, r: true, fm, ln, d: 3 } });
}
const M2 = E.summarize({ secs: lesson2, grid: [], sens: 'medium', ctx: partEv, mic: 'teacher' });
{
    const s = E.ctxSeries(partEv, 1800);
    check('parts: قبل أوّل لمسةٍ لا عنصر، وبعدها يمتدّ، والمفاتيح القديمة تُهمل',
          E.ctxSeries([{ t: 5, k: 'apply' }, { t: 6, k: 'practice' }], 8).join() === ',,,,,apply,apply,apply' && s[599] === 'fit' && s[600] === 'teach');
    check('parts: توزيع الزمن', M2.ctx.covered === 1800 && M2.ctx.pct.warm === 17 && M2.ctx.pct.teach === 33 && M2.ctx.pct.apply === 25 && M2.ctx.pct.close === 8, JSON.stringify(M2.ctx.pct));
    const T = M2.parts.list.find(r => r.k === 'teach');
    check('parts: في كلّ عنصرٍ زمن الحركة والشرح والانتظار وحركة الطلبة', T.sec === 600 && T.activePct >= 59 && T.activePct <= 62 && T.explainSec >= 230 && T.explainSec <= 240 && T.waitSec === 0 && T.moving === 40, JSON.stringify(T));
    check('parts: الترتيب صحيح', M2.parts.orderOk && M2.parts.order.join() === 'warm,fit,teach,apply,close');
    const D = E.partsDetail(M2);
    check('parts: الموصى به بنسبة زمن الحصة (٣٠ د من ٤٠)', D.find(r => r.k === 'warm').rec === 3.8 && D.find(r => r.k === 'teach').rec === 9 && D.every(r => r.verdict === 'ok'), JSON.stringify(D.map(r => r.k + ':' + r.rec + ':' + r.verdict)));
    const D2 = E.partsDetail(M2, { warm: 2, fit: 7, teach: 15, apply: 12, close: 4 });
    check('parts: الموصى به من اختيار المشرف', D2.find(r => r.k === 'warm').verdict === 'long', JSON.stringify(D2.find(r => r.k === 'warm')));
    const P = M2.people;
    check('people: عدد الطلبة = أكبر عددٍ رُصد ولو في لقطةٍ واحدة (طلب المشرف)', P.classSize === 30 && P.inside === 20, JSON.stringify(P));
    check('people: حركة الطلبة في العناصر النشطة (بلا الختام)', P.movingPlay === Math.round(100 * (300 * 14 + 300 * 12 + 600 * 8 + 450 * 14) / (1650 * 20 + 8)) && P.movingAll < P.movingPlay, P.movingPlay + ' / ' + P.movingAll);
    check('people: انتظار الدور في العناصر النشطة', P.queuePct === Math.round(100 * 600 * 6 / (1650 * 20 + 8)), P.queuePct);
    check('people: بغير الزيّ ما ثبت في اللقطات', P.dishEst === 3 && P.outsideMed === 2);
    const F = M2.forms;
    check('forms: خمسة تشكيلاتٍ من أربعة أنواع بترتيبها', F.count === 5 && F.segments.map(x => x.type).join('') === 'SLGLC' && F.types.length === 4, JSON.stringify(F.segments));
    check('forms: القاطرة الطويلة (> ٦) وزمنها', F.maxLine === 8 && F.longLineSec === 300 && F.byType.L.count === 2 && F.byType.L.sec === 750, JSON.stringify(F.byType));
    check('mic: كلام المعلّم في العناصر النشطة', M2.mic === 'teacher' && M2.coachPct >= 20 && M2.coachPct <= 30, M2.coachPct);
    check('timeline: عنصر كلّ عشر ثوانٍ', M2.timeline[0].c === 'w' && M2.timeline[30].c === 'f' && M2.timeline[60].c === 't' && M2.timeline[120].c === 'a' && M2.timeline[170].c === 'c');
    check('people: بلا كشفٍ لا أرقام ولا تشكيلات', E.summarize({ secs: lesson }).people === null && E.summarize({ secs: lesson }).forms === null);
}

/* ── ١٣) الاقتراح من عناصر الحصة والتشكيلات والزيّ ── */
{
    const sg = E.suggest(M2, { out: 2, dish: 3 }, { female: false });
    const by = id => sg.find(s => s.id === id);
    check('suggest ٧: من حركة الطلبة وعددهم الأكبر', by(7) && by(7).basis === 'ai' && /تحرّك الطلبة \(57%\) من زمن الإحماء والإعداد البدني والأنشطة/.test(by(7).evidence) && /وعددهم \(30\) طالباً/.test(by(7).evidence), JSON.stringify(by(7)));
    check('suggest ٧: ٥٧٪ ← جيد، والقاطرة الطويلة (٨ طلبة، ٥ دقائق) تنزلها إلى ملائم', by(7).score === 3 && /ووقفت قاطراتٌ طويلةٌ \(حتّى \(8\) طلبة\) مدّة \(5\) دقائق/.test(by(7).evidence), by(7).evidence);
    check('suggest ٦: من عناصر الحصة الخمسة', by(6) && by(6).basis === 'ctx' && by(6).score === 2
          && /^اشتملت الحصة على عناصرها الخمسة: الإحماء \(5\) دقائق، والإعداد البدني \(5\) دقائق، والأنشطة التعليمية \(10\) دقائق/.test(by(6).evidence), JSON.stringify(by(6)));
    check('suggest ٥: ثلاثةٌ بالدشداشة من ثلاثين ← ملائم', by(5) && by(5).score === 3 && /شارك \(3\) طلبة من \(30\) طالباً بالدشداشة بدل الزيّ الرياضيّ/.test(by(5).evidence), JSON.stringify(by(5)));
    const fem5 = E.suggest(M2, { dish: 6 }, { female: true }).find(s => s.id === 5);
    check('suggest ٥: معلّمة ← «بغير الزيّ الرياضيّ»، وستّةٌ ← غير ملائم', fem5.score === 4 && /بغير الزيّ الرياضيّ/.test(fem5.evidence) && !/دشداشة/.test(fem5.evidence), JSON.stringify(fem5));
    check('suggest ٢: طالبان خارج النشاط ← ملائم', by(2) && by(2).score === 3 && /ظلّ طالبان خارج النشاط/.test(by(2).evidence), JSON.stringify(by(2)));
    check('suggest ٩: انتظار الدور تحت ٤٠٪ لا يكفي', !by(9));

    const longWarm = E.summarize({ secs: lesson2, grid: [], ctx: [{ t: 0, k: 'warm' }, { t: 900, k: 'teach' }, { t: 1200, k: 'apply' }, { t: 1650, k: 'close' }] });
    const s6 = E.suggest(longWarm, {}, {}).find(s => s.id === 6);
    check('suggest ٦: إحماءٌ طويل وغياب الإعداد البدني ← غير ملائم', s6.score === 4 && /من عناصرها الخمسة/.test(s6.evidence) && /وغاب عنها الإعداد البدني/.test(s6.evidence) && /وطال الإحماء/.test(s6.evidence), JSON.stringify(s6));
    const swapped = E.summarize({ secs: lesson2, grid: [], ctx: [{ t: 0, k: 'fit' }, { t: 300, k: 'warm' }, { t: 600, k: 'teach' }, { t: 1200, k: 'apply' }, { t: 1650, k: 'close' }] });
    const s6b = E.suggest(swapped, {}, {}).find(s => s.id === 6);
    check('suggest ٦: عناصرُ بغير ترتيبها ← ملائم', !swapped.parts.orderOk && s6b.score === 3 && /ولم تأتِ العناصر بترتيبها/.test(s6b.evidence), JSON.stringify(s6b));

    const one = E.suggest(M2, { demo: 1 }, {}).find(s => s.id === 8);
    check('suggest ٨: استراتيجيّةٌ واحدة تُصاغ «وظّف» لا «نوّع بين»', /^وظّف المعلم: عرض نموذجي/.test(one.evidence), one.evidence);
    const qM = Object.assign({}, M2, { people: Object.assign({}, M2.people, { queuePct: 60 }) });
    const s9 = E.suggest(qM, {}, {}).find(s => s.id === 9);
    check('suggest ٩: انتظار الدور ٦٠٪ ← غير ملائم من كشف الطلبة', s9 && s9.score === 4 && s9.basis === 'ai' && /\(60%\) من الطلبة ينتظرون دورهم/.test(s9.evidence), JSON.stringify(s9));
    const s9b = E.suggest(Object.assign({}, qM, { people: Object.assign({}, qM.people, { queuePct: 45 }) }), { tools: 1 }, {}).find(s => s.id === 9);
    check('suggest ٩: ومع لمسة «أدوات كافية» يُعطف ولا ينزل عن «ملائم»', s9b.score === 3 && s9b.basis === 'both' && /^وُظّفت أدواتٌ كافية ومتنوعة، ووقف/.test(s9b.evidence), JSON.stringify(s9b));
    const out3 = E.suggest(M2, { out: 3, include: 1 }, {}).find(s => s.id === 2);
    check('suggest ٢: ثلاثةٌ خارج النشاط ← غير ملائم ولو رُوعيت الفروق', out3.score === 4 && /، وظلّ \(3\) طلبة خارج النشاط/.test(out3.evidence), JSON.stringify(out3));
    const miss = E.suggest(M2, { fbMiss: 2 }, {}).find(s => s.id === 10);
    check('suggest ١٠: أخطاءٌ لم تُصحَّح وحدها ← غير ملائم', miss.score === 4 && /^رُصد خطأٌ في الأداء لم يُصحَّح مرّتين/.test(miss.evidence), JSON.stringify(miss));
    const fbM = E.suggest(M2, { fbInd: 3, ask: 1 }, { female: true }).find(s => s.id === 10);
    check('suggest ١٠: ميكروفون المعلّمة — توجيهٌ أثناء النشاط فوق ٢٠٪ يرفع درجة', fbM.score === 2 && fbM.basis === 'both' && /وتحدّثت إلى الطلبة أثناء النشاط \(\d+%\)/.test(fbM.evidence), JSON.stringify(fbM));
    const silent = E.suggest(Object.assign({}, M2, { coachPct: 2 }), { fbInd: 3, ask: 1 }, {}).find(s => s.id === 10);
    check('suggest ١٠: وصمته أثناء النشاط ينزل درجة', silent.score === 4, silent.score);
    const devMic = E.suggest(Object.assign({}, M2, { mic: 'device' }), { fbInd: 3, ask: 1 }, {}).find(s => s.id === 10);
    check('suggest ١٠: ميكروفون الجهاز لا يُنسب كلامه إلى المعلّم', devMic.score === 3 && devMic.basis === 'taps');

    check('confidence: كلّ اقتراحٍ بدرجة ثقة', sg.every(s => ['high', 'medium', 'low'].includes(s.conf)));
    check('confidence: كشف الطلبة ثلاثين دقيقة ← عالية، والعناصر كاملة ← عالية', by(7).conf === 'high' && by(6).conf === 'high');
    check('confidence: لمسةٌ واحدة ← منخفضة، وأربعٌ ← عالية',
          E.confidence({ id: 3, basis: 'taps' }, M, { lead: 1 }) === 'low' && E.confidence({ id: 10, basis: 'taps' }, M, { fbInd: 3, ask: 1 }) === 'high');
    check('confidence: كاميرا عشر دقائق ← منخفضة', E.confidence({ id: 7, basis: 'camera' }, { observed: 600, excludedSec: 0 }, {}) === 'low');

    const st = E.summaryText(M2, {});
    check('summaryText: العدد والحركة والعناصر والتشكيلات', /شارك فيها \(30\) طالباً، وتحرّكوا \(57%\)/.test(st) && /وتوزّع زمنها: الإحماء \(5\) دقائق/.test(st) && /واستُعمل \(5\) تشكيلات/.test(st) && st.length < 400, st.length + ' ' + st);
    const noCam = E.summarize({ secs: Array(1500).fill(0).map(() => ({ m: null, v: false })), ctx: [{ t: 0, k: 'apply' }], mic: 'teacher' });
    check('بلا كاميرا: العناصر وحدها تكفي للملخّص وبنية الحصة', noCam.observed === 0 && noCam.ctx.covered === 1500 && /^رُصدت الحصة بعين المشرف \(25\) دقيقة/.test(E.summaryText(noCam, {}))
          && E.suggest(noCam, {}, {}).some(s => s.id === 6 && s.basis === 'ctx') && !E.suggest(noCam, {}, {}).some(s => s.id === 7));

    const dp = E.debriefPrompts(M2, { dish: 3, out: 2 }, { female: true });
    check('debrief: الإجادة من الرصد', dp.good.some(t => /اشتملت الحصة على عناصرها الخمسة بترتيبها/.test(t)) && dp.good.some(t => /نوّعت المعلمة التشكيلات/.test(t)) && dp.good.some(t => /بلغت حركة الطلبة \(70%\)/.test(t)), JSON.stringify(dp.good));
    check('debrief: أسئلةٌ من القاطرة الطويلة والزيّ ومن هم خارج النشاط، بصيغة المخاطَبة', dp.ask.some(t => /قاطرةٌ من \(8\) طلبة مدّة \(5\) دقائق\. كيف تعيدين/.test(t))
          && dp.ask.some(t => /بغير الزيّ الرياضيّ/.test(t)) && dp.ask.some(t => /تشركينهم/.test(t)), JSON.stringify(dp.ask));
    const dpW = E.debriefPrompts(longWarm, {}, {});
    check('debrief: عنصرٌ طويل وآخر غائب', dpW.ask.some(t => /^استغرق الإحماء \(15\) دقيقة، والموصى به نحو/.test(t) && /تختصره/.test(t)) && dpW.ask.some(t => /لم يظهر «الإعداد البدني»/.test(t)), JSON.stringify(dpW.ask));
}

/* ── ١٣ب) التشكيلات والزيّ في لقطةٍ واحدة ── */
{
    const pts = arr => arr.map(([x, y]) => ({ fx: x * 0.2, fy: y * 0.2, h: 0.2 }));    // الوحدة = طول الجسم
    const line = E.formations(pts([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, 0])));
    check('formations: ثمانيةٌ على خطٍّ ← قاطرة من ٨', line.dom === 'L' && line.maxLine === 8, JSON.stringify(line));
    const ring = [];
    for (let i = 0; i < 10; i++) { const a = 2 * Math.PI * i / 10; ring.push([5 + 2 * Math.cos(a), 5 + 1 * Math.sin(a)]); }   // دائرةٌ مائلةٌ بالمنظور
    const circ = E.formations(pts(ring));
    check('formations: عشرةٌ على حلقةٍ مائلة ← دائرة', circ.dom === 'C' && circ.circles === 1, JSON.stringify(circ));
    const spread = E.formations(pts([[0, 0], [3, 0], [6, 0], [0, 3], [3, 3], [6, 3], [0, 6], [3, 6], [6, 6]]));
    check('formations: متباعدون ← انتشار حرّ', spread.dom === 'S' && spread.maxLine === 0, JSON.stringify(spread));
    const groups = E.formations(pts([[0, 0], [0.6, 0], [0, 0.6], [0.6, 0.6], [5, 0], [5.6, 0], [5, 0.6], [5.6, 0.6], [10, 0], [10.6, 0], [10, 0.6], [10.6, 0.6]]));
    check('formations: ثلاث مجموعاتٍ صغيرة ← مجموعات', groups.dom === 'G' && groups.groups === 3, JSON.stringify(groups));
    const blob = E.formations(pts([[0, 0], [0.8, 0], [1.6, 0], [0, 0.8], [0.8, 0.8], [1.6, 0.8], [0, 1.6], [0.8, 1.6], [1.6, 1.6]]));
    check('formations: تجمّعٌ ممتلئ ليس دائرة', blob.dom === 'G' && blob.circles === 0, JSON.stringify(blob));
    check('formations: لا أحد ← لا تشكيل', E.formations([]).dom === '-');

    // الزيّ: صورةٌ ٤٠×٦٠ أرضيّتها خضراء، وطالبٌ صندوقه ١٠×٥٠
    const W = 40, Hh = 60, box = { x: 15 / W, y: 5 / Hh, w: 10 / W, h: 50 / Hh };
    const img = (bg, body) => {
        const a = new Uint8ClampedArray(W * Hh * 4);
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
            const inBox = x >= 15 && x < 25 && y >= 5 && y < 55;
            const c = inBox ? body(x - 15, y - 5) : bg;
            const i = (y * W + x) * 4; a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; a[i + 3] = 255;
        }
        return a;
    };
    const green = [60, 140, 60], white = [240, 240, 236], navy = [20, 40, 90], skin = [190, 140, 100];
    const robe = img(green, (x, y) => (y > 10 ? white : navy));
    const shorts = img(green, (x, y) => (y < 25 ? white : y < 35 ? navy : (x === 3 || x === 6) ? skin : green));
    const onWhite = img([235, 235, 230], () => white);
    check('garment: ثوبٌ أبيض طويل على أرضٍ خضراء ← دشداشة', E.isDishdasha(E.garmentScore(robe, W, Hh, box)), JSON.stringify(E.garmentScore(robe, W, Hh, box)));
    check('garment: قميصٌ أبيض وسروالٌ قصير وساقان ← زيٌّ رياضيّ', !E.isDishdasha(E.garmentScore(shorts, W, Hh, box)), JSON.stringify(E.garmentScore(shorts, W, Hh, box)));
    check('garment: أبيضُ على أرضٍ بيضاء ← لا يُحكم بالدشداشة', !E.isDishdasha(E.garmentScore(onWhite, W, Hh, box)));
    check('garment: الصندوق الصغير لا يُحكم عليه', E.garmentScore(robe, W, Hh, { x: 0.4, y: 0.1, w: 0.1, h: 0.3 }) === null);

    const T = E.newTracker();
    for (let k = 0; k <= 3; k++) E.trackStep(T, [person(0.3, 0.5, { dish: true }), person(0.6, 0.5, { dish: false }), person(0.8, 0.5, { dish: k === 0 })], k * 0.5, 16 / 9);
    const sn = E.peopleSnapshot(T, 1.5, null);
    check('garment: الحكم بأغلبيّة اللقطات لكلّ طالب', sn.d === 1 && sn.dots.filter(d => d.dish).length === 1, JSON.stringify({ d: sn.d }));
    check('snapshot: التشكيل وأطول قاطرةٍ في اللقطة', typeof sn.fm === 'string' && sn.ln >= 0);
}

/* ── ١٤) اتّفاق العين مع المشرف ── */
{
    const A = E.agreement([
        { sugg: [{ id: 7, score: 2 }, { id: 8, score: 3 }], final: { 7: 2, 8: 4 } },
        { sugg: [{ id: 7, score: 1 }], final: { 7: 3 } },
        { sugg: [{ id: 7, score: 2 }], final: {} },                    // لم يُعتمد شيء
        { sugg: [{ id: 9, score: 2 }] },                                // لم يُحفظ بعد
        null
    ]);
    check('agreement: الحصص والاقتراحات', A.lessons === 2 && A.n === 3, JSON.stringify(A));
    check('agreement: التطابق التامّ وفي حدود درجة', A.exact === 33 && A.near === 67, A.exact + ' / ' + A.near);
    const i7 = A.items.find(i => i.id === 7);
    check('agreement: الميل لكلّ بند (موجبٌ = العين أكرم)', i7.n === 2 && i7.exact === 50 && i7.bias === 1 && A.items.find(i => i.id === 8).bias === 1, JSON.stringify(A.items));
    check('agreement: بلا بياناتٍ أصفار', E.agreement([]).n === 0 && E.agreement(null).exact === 0);
}

/* ── ١٥) التوصيل — المرحلة الأولى ── */
{
    const UI = read('js/eye.js'), S = read('js/supervisory.js'), SW = read('sw.js');
    check('wiring: «أُبلغ المعلّم» يُسأل عنه مباشرةً إن لم يُعلَّم', /root\.confirm\('هل أبلغت المعلّم بالرصد؟/.test(UI) && /if \(ok\) \{ \$\('eyeConsent'\)\.checked = true;/.test(UI));
    check('wiring: «أُبلغ المعلّم» شرطٌ قبل الكاميرا والمقطع والميكروفون',
          /async function startCamera\(\) \{[\s\S]{0,120}if \(!needConsent\(true\)\) return;/.test(UI)
          && /function startFile\(file\) \{[\s\S]{0,120}if \(!needConsent\(true\)\) return;/.test(UI)
          && /if \(!needConsent\(wantMic \|\| checked\('eyeSpeech'\)\)\) return;/.test(UI) && UI.includes('id="eyeConsent"'));
    check('wiring: الصورة طبيعيّةٌ افتراضاً (طلب المشرف)، وإخفاؤها اختيارٌ يُذكر', /<input type="checkbox" id="eyeShowVideo" checked>/.test(UI)
          && /localStorage\.getItem\('svf_eye_show'\) === '0'/.test(UI) && /v\.style\.opacity = S\.running && checked\('eyeShowVideo'\)/.test(UI));
    check('wiring: المسرح يأخذ شكل الصورة العموديّة', /function fitStage\(\)/.test(UI) && /v\.videoHeight > v\.videoWidth/.test(UI));
    check('wiring: خلفيّة الخصوصيّة أربعون بكسلاً رماديّة', /const pw = 40/.test(UI) && /imageSmoothingEnabled = false/.test(UI));
    check('wiring: النموذج محلّيٌّ ويُحمَّل عند الحاجة', /new URL\('vendor\/human\/', document\.baseURI\)/.test(UI) && /await import\(base \+ 'human\.esm\.js'\)/.test(UI)
          && ['human.esm.js', 'centernet.json', 'centernet.bin', 'LICENSE'].every(f => fs.existsSync(path.join(ROOT, 'vendor/human', f))));
    check('wiring: الكشف على منطقة الصفّ مقصوصةً، وبالعتبة نفسها', /E\(\)\.polyBox\(S\.roi, 0\.04\)/.test(UI) && /o\.score >= E\(\)\.PERSON_MIN_SCORE/.test(UI));
    check('wiring: عامل الخدمة — vendor بالذاكرة أوّلاً ولا يُخزَّن مسبقاً', /url\.pathname\.indexOf\('\/vendor\/'\) !== -1/.test(SW) && !/'\.\/vendor\//.test(SW) && /const VERSION = 'v(3[5-9]|[4-9]\d)'/.test(SW));
    const hook = S.indexOf('svfEyeBeforeSave()'), rd = S.indexOf('const reportData = {', S.indexOf('function savePermanentReport'));
    check('wiring: الدرجات المعتمدة تُكتب قبل جمع حقول التقرير', hook > 0 && hook < rd && /typeof svfEyeBeforeSave === 'function'/.test(S));
    check('wiring: الميكروفون يُختار، و«على المعلّم»', /deviceId = \{ exact: id \}/.test(UI) && UI.includes('id="eyeTeacherMic"') && /enumerateDevices/.test(UI));
    check('wiring: أزرار عناصر الحصة الخمسة والعدّادات تُنقص', /E\(\)\.PARTS\.map/.test(UI) && /data-dec="\$\{k\}"/.test(UI) && /function resuggest\(\)/.test(UI));
    check('wiring: لا تُحفظ صورٌ ولا صوت (بعد المرحلة الأولى)', !/toDataURL|MediaRecorder|toBlob/.test(UI)
          && (UI.match(/localStorage\.setItem\(/g) || []).length === 2 && /localStorage\.setItem\('svf_eye_show'/.test(UI) && /localStorage\.setItem\(REC_KEY/.test(UI));
}

/* ── ١٦) التوصيل — العناصر والبطاقة والمداولة والنموذج ── */
{
    const UI = read('js/eye.js'), RP = read('js/eye-report.js'), H = read('reports.html'), SW = read('sw.js'), S = read('js/supervisory.js'), DB = read('js/debrief.js');
    check('wiring: البطاقة بعد eye.js وفي عامل الخدمة', /js\/eye\.js[\s\S]*js\/eye-report\.js[\s\S]*init\.js/.test(H.slice(H.indexOf('js/debrief.js'))) && SW.includes("'./js/eye-report.js'") && /const VERSION = 'v(3[6-9]|[4-9]\d)'/.test(SW));
    check('wiring: البطاقة لا تقرأ الكاميرا (أرقامٌ لا صور)', !/video|getUserMedia|eyeVideo|eyeView/i.test(RP) && /canvas\.toBlob|cv\.toBlob/.test(RP));
    check('wiring: البطاقة تُشارَك أو تُنزَّل أو تُطبع', /navigator\.canShare/.test(RP) && /navigator\.share\(/.test(RP) && /window\.print\(\)/.test(RP) && /root\.open\('', '_blank'\)/.test(RP));
    check('wiring: عدد الطلبة الأكبر حيّاً، وكشف الزيّ لكلّ طالب', /S\.classMax = Math\.max\(S\.classMax \|\| 0, S\.pSnap\.n \+ S\.pSnap\.o\)/.test(UI) && /E\(\)\.garmentScore\(rgba, cw, ch,/.test(UI));
    check('wiring: الثانية المهتزّة لا تُحسب فيها حركة الطلبة', /const shaky = a\.bad > 0 && a\.bad >= a\.n;/.test(UI) && /const p = !shaky && S\.pSnap/.test(UI));
    check('wiring: عدد الطلبة والزمن الموصى به يُعدَّلان فيُعاد الاقتراح', /id="eyeClassSize"/.test(UI) && /S\.result\.M\.people\.classSize = v;\s*resuggest\(\)/.test(UI) && /data-rec="\$\{x\.k\}"/.test(UI));
    check('wiring: الشاهد تحت البنود في النموذج (عند ظهوره وبعد التصفير)', /viewId === 'form-view' && typeof svfEyeDecorate === 'function'/.test(S)
          && (S.match(/svfEyeDecorate\(\)/g) || []).length >= 2 && /b\.textContent = ''/.test(UI) && /document\.createTextNode\(ev/.test(UI));
    check('wiring: المداولة تعرض لوحة العين وبطاقتها وتضيف سطورها لرسالة المعلّم', /root\.svfEyeDebriefHtml\(\)/.test(DB) && /debriefEyeCard/.test(DB) && /svfEyeTeacherLines/.test(DB));
    check('wiring: نصوص لوحة المداولة مهروبة', /\$\{esc\(t\)\}/.test(UI.slice(UI.indexOf('root.svfEyeDebriefHtml'))) && /\$\{esc\(r\.short\)\}/.test(UI));
}


/* ── ١٧) فهم كلام المعلّم (2026-10-26، بإذن المعلّم) ── */
{
    const SX = require('../js/eye-speech.js');
    const ctx = [{ t: 0, k: 'warm' }, { t: 180, k: 'teach' }, { t: 580, k: 'apply' }];
    const A = SX.analyze([
        { t: 30, x: 'يلا يا شباب اصطفوا في قاطرتين' },
        { t: 60, x: 'السلام عليكم كيف حالكم' },
        { t: 200, x: 'أحسنت يا محمد ركبتك مثنية زين' },
        { t: 230, x: 'لا لا ارفع الذراع أكثر عند الدفع' },
        { t: 260, x: 'ليش نثني الركبة قبل الدفع؟' },
        { t: 300, x: 'فهمتم' },
        { t: 320, x: 'انتبهوا المسافة بينكم' },
        { t: 400, x: 'تعاونوا مع زملائكم في الفريق' },
        { t: 420, x: 'خلوا الكرات تحت' },
        { t: 430, x: 'حطوا الجلة على الأرض' },
        { t: 450, x: 'ممتاز' },
        { t: 470, x: 'يا غبي اسكت' },
        { t: 500, x: 'من يعرف ما الفرق بين التمريرة القصيرة والطويلة' },
        { t: 520, x: 'عيدها مرة ثانية' },
        { t: 640, x: 'برافو عليك الدفع كان قوي' },
        { t: 700, x: 'اشربوا ماء' }
    ], { topic: 'دفع الجلة بطريقة الزحف', ctx, seconds: 720 });
    check('speech: التعزيز ٣ منها اثنان محدّدان بالأداء (الركبة، الدفع)', A.praise.n === 3 && A.praise.spec === 2, JSON.stringify([A.praise.n, A.praise.spec]));
    check('speech: التصحيح ٢ — «خلّوا الكرات تحت» و«حطّوا الجلة على الأرض» تعليمٌ لا تصحيح', A.corr.n === 2 && A.corr.spec === 1 && !A.corr.ex.some(e => /الكرات|الارض|الأرض/.test(e[1])), JSON.stringify(A.corr.ex));
    check('speech: سؤالان كلاهما يستثير التفكير، والتحيّة «كيف حالكم» ليست سؤالاً', A.q.n === 2 && A.q.hi === 2, JSON.stringify(A.q));
    check('speech: التحقّق من الفهم والسلامة (والماء) والقيم', A.check.n === 1 && A.safe.n === 2 && A.values.n === 1);
    check('speech: «يا غبي اسكت» للمراجعة وحدها — لا تُحسب تعزيزاً ولا تصحيحاً', A.harsh.n === 1 && !A.praise.ex.some(e => /غبي/.test(e[1])));
    check('speech: مصطلحات الدرس من عنوانه بلا «طريقة»', JSON.stringify(A.topic.terms) === '["دفع","جله","زحف"]' && A.topic.n === 4, JSON.stringify(A.topic));
    check('speech: كلّ عبارةٍ في عنصرها', A.parts.warm.org === 1 && A.parts.teach.q === 2 && A.parts.apply.praise === 1, JSON.stringify(A.parts));
    check('speech: التسوية — التشكيل والهمزات والتاء المربوطة', SX.norm('أَحْسَنْتَ يا بطلة') === 'احسنت يا بطله');
    const B = SX.stripExamples(A);
    check('speech: حذف النصّ يُبقي الأرقام ويمحو الأمثلة', B.praise.n === 3 && !B.praise.ex.length && !B.harsh.ex.length && !B.q.hiEx.length && A.praise.ex.length === 3);

    // الاقتراح من الكلام وحده (حصةٌ بلا كاميرا ولا لمسات)
    const lines = ['أحسنت يا محمد ركبتك مثنية', 'لا لا ارفع الذراع عند الدفع', 'ليش نثني الركبة قبل الدفع؟', 'فهمتم', 'انتبهوا المسافة بينكم',
        'اصطفوا في قاطرتين بسرعة', 'ممتاز', 'عيدها مرة ثانية', 'كيف نحسن الدفع؟', 'برافو الدفع كان قوي', 'تعاونوا مع زملائكم', 'اشربوا ماء'];
    const segs = Array.from({ length: 60 }, (_, i) => ({ t: i * 35, x: lines[i % lines.length] + ' يا شباب خلونا نكمل التمرين' }));
    const SP = SX.analyze(segs, { topic: 'دفع الجلة بطريقة الزحف', ctx: [{ t: 0, k: 'warm' }, { t: 700, k: 'teach' }, { t: 1400, k: 'apply' }], seconds: 2100 });
    const M = { seconds: 2100, observed: 0, speech: SP, mic: 'teacher', ctx: { covered: 0 } };
    const sg = E.suggest(M, {}, { female: true });
    const by = id => sg.find(x => x.id === id);
    check('speech→suggest: البند ١٠ من كلامها (تصحيح وتحقّق وأسئلة) وأساسه «الكلام»', by(10) && by(10).basis === 'speech' && /سُمع في كلام المعلمة/.test(by(10).evidence), by(10) && by(10).evidence);
    check('speech→suggest: البند ٣ من الأسئلة التي تستثير التفكير', by(3) && by(3).score === 2 && /طرحت المعلمة \(10\) أسئلة تستثير التفكير/.test(by(3).evidence), by(3) && by(3).evidence);
    check('speech→suggest: البند ٤ من التعزيز المحدّد والقيم', by(4) && by(4).score === 1 && /بما أجاده الطالب تحديداً/.test(by(4).evidence));
    check('speech→suggest: البند ٥ من التذكير بالسلامة', by(5) && by(5).score === 2 && by(5).basis === 'speech');
    check('speech→suggest: الثقة من عدد الكلمات وميكروفون المعلّم', by(10).conf === 'medium' && E.confidence({ basis: 'speech' }, Object.assign({}, M, { mic: 'device' })) === 'low');
    check('speech→suggest: كلامٌ قليل (أقلّ من ١٢٠ كلمة) لا يُقترح منه', !E.suggest({ seconds: 600, speech: SX.analyze(segs.slice(0, 5), {}) }, {}, {}).length);
    // مع اللمسات: كلامه يقرّب الدرجة درجةً واحدة
    const withTaps = E.suggest(M, { fbInd: 1 }, {}).find(x => x.id === 10);
    check('speech→suggest: مع لمسةٍ واحدة (غير ملائم) يرفعها الكلام درجةً، وأساسها «اللمسات والرصد»', withTaps.score === 3 && withTaps.basis === 'both', JSON.stringify(withTaps));
    const dp = E.debriefPrompts(Object.assign({}, M, { speech: Object.assign({}, SP, { harsh: { n: 2, ex: [[1, 'يا غبي']] } }) }), {}, { female: false });
    check('speech→debrief: الإجادة بأمثلةٍ من نصّه', dp.good.some(t => /عزّزت الطلبة بما أجادوه تحديداً .*مثل: «أحسنت/.test(t)) && dp.good.some(t => /طرحت أسئلةً تستثير التفكير/.test(t)), JSON.stringify(dp.good));
    check('speech→debrief: العبارات التي تحتاج مراجعةً لا تدخل المداولة', !JSON.stringify(dp).includes('غبي'));
    const closed = E.debriefPrompts({ speech: SX.analyze(Array.from({ length: 30 }, (_, i) => ({ t: i * 20, x: 'هل جاهزين يا شباب نبدأ الحين أحسنت' })), {}) }, {}, {});
    check('speech→debrief: أسئلةٌ مغلقة وتعزيزٌ عامّ ← سؤالان للتأمّل', closed.ask.some(t => /مغلقة/.test(t)) && closed.ask.some(t => /أغلب تعزيزك عامّ/.test(t)), JSON.stringify(closed.ask));
    check('speech→summary: سطر الأرقام في الملخّص', /وسُمع في كلام المعلم: تعزيزٌ \(\d+\)، وتصحيحٌ \(\d+\)، وأسئلةٌ \(\d+\)/.test(E.summaryText(Object.assign({}, M, { observed: 2100, activePct: 50, activeSec: 1000 }), {})));
    check('speech→summary: وللمعلّمة «كلام المعلمة» (كان «المعلّم» للجميع)', /وسُمع في كلام المعلمة:/.test(E.summaryText(Object.assign({}, M, { observed: 2100, activePct: 50, activeSec: 1000 }), { female: true })));

    // التوصيل
    const UI = read('js/eye.js'), RP = read('js/eye-report.js'), H = read('reports.html'), SW = read('sw.js');
    check('wiring: «فهم الكلام» يُسأل عنه سؤالاً مستقلّاً قبل تشغيله، ورفضه يطفئه', /function speechConsent\(\)[\s\S]{0,700}root\.confirm\([\s\S]{0,400}هل وافق المعلّم على ذلك؟[\s\S]{0,200}\$\('eyeSpeech'\)\.checked = false/.test(UI)
          && /const wantSpeech = speechConsent\(\);[\s\S]{0,1600}begin\('camera', v\);\s*\n\s*if \(wantSpeech\) speechStart\(/.test(UI)
          && /const wantSpeech = speechConsent\(\);[\s\S]{0,900}begin\('none', null\);\s*\n\s*if \(wantSpeech\) speechStart\(/.test(UI));
    check('wiring: داخل الجهاز إن أتاحه المتصفّح (processLocally)، وإلّا خدمته — ويُذكر ذلك', /Ctor\.available\(\{ langs: \[sp\.lang\], processLocally: true \}\)/.test(UI) && /rec\.processLocally = true/.test(UI)
          && /حُوِّل إلى نصٍّ داخل الجهاز/.test(UI) && /عبر خدمة Google/.test(UI));
    check('wiring: مسار ميكروفون المعلّم نفسه إلى التعرّف حيث يقبله المتصفّح', /rec\.start\(sp\.track\)/.test(UI));
    check('wiring: يُعاد التشغيل بعد الصمت ويتوقّف مع الرصد', /rec\.onend = \(\) => \{\s*\n\s*if \(!sp\.on \|\| !S\.running/.test(UI) && /function release\(\) \{\s*\n\s*speechStop\(\);/.test(UI));
    check('wiring: لا يُحفظ صوت — النصّ وحده مع التقرير، ويُحذف بزرّ', !/MediaRecorder|toDataURL/.test(UI) && /sp: sp \? \{ mode: sp\.mode, lang: sp\.lang, consent: !!S\.speechConsent, seg:/.test(UI)
          && /id="eyeSpeechPurge"/.test(UI) && /stripExamples\(S\.result\.M\.speech\)/.test(UI));
    check('wiring: النصّ مهروبٌ في النتيجة والبثّ الحيّ نصٌّ لا HTML', /«\$\{esc\(x\)\}»/.test(UI) && /tx\.appendChild\(document\.createTextNode\('«' \+ last\.x \+ '»'\)\)/.test(UI));
    check('wiring: البطاقة أرقام الكلام وأمثلة «ما يُعزَّز» وحدها — لا النصّ ولا عبارات المراجعة', /كلام المعلّم/.test(RP) && !/harsh|\.ex\b|specEx|hiEx|\.sp\b|\.seg\b/.test(RP));
    check('wiring: الوحدة محمّلةٌ قبل الشاشة وفي عامل الخدمة', /eye-core\.js[\s\S]{0,80}eye-speech\.js[\s\S]*eye\.js/.test(H) && SW.includes("'./js/eye-speech.js'"));
}

/* ── ١٨) أدوات المشرف (2026-10-26): عيّنة الطلبة، لحظات الحصة، أهدافٌ تُقاس وتُتابَع، أنماط الرصد ── */
{
    // حصّةٌ اصطناعيّة: ٣٢ دقيقة بعناصرها، وانتظارٌ طويلٌ في الأنشطة التعليميّة، وقاطرةٌ من تسعةٍ في التطبيق
    const secs = [];
    const PLAN = t => t < 360 ? ['warm', 15, 'S', 0] : t < 600 ? ['fit', 13, 'L', 0] : t < 1260 ? ['teach', 9, 'G', 0] : t < 1740 ? ['apply', 10, 'L', 9] : ['close', 2, 'C', 0];
    for (let t = 0; t < 1920; t++) {
        const [k, mv, fm, ln] = PLAN(t), idle = k === 'close' || (k === 'teach' && t >= 1020 && t < 1240);
        secs.push({ m: idle ? 0.004 : 0.05, v: t % 5 === 0, w: false, p: t % 3 ? null : { n: 22, mv: idle ? 2 : mv, o: 1, q: k === 'apply' ? 10 : 0, r: true, fm, ln: t > 1300 && t < 1500 ? ln : 0, d: 2 } });
    }
    const ev = [[0, 'warm'], [360, 'fit'], [600, 'teach'], [1260, 'apply'], [1740, 'close']].map(([t, k]) => ({ t, k }));
    const M = E.summarize({ secs, grid: [], sens: 'medium', ctx: ev, mic: 'device' });

    // عيّنة الطلبة
    const sample = { n: 8, a: '11213211', b: '33223312' };
    const SS = E.sampleStats(sample);
    check('sample: القراءتان (إتقان = أتقن + نصف الجزئيّ)', SS.a.pct === 25 && SS.b.pct === 69 && SS.b.ok === 4 && SS.b.part === 3 && SS.b.no === 1, JSON.stringify(SS));
    check('sample: التقدّم = من تحسّن أو حافظ على إتقانه بين القراءتين', SS.both === 8 && SS.improved === 5 && SS.kept === 1 && SS.regressed === 0 && SS.progress === 75);
    check('sample: آخر قراءةٍ فيها خمسةٌ فأكثر هي المعتمدة، وإلّا الأولى', SS.finalRound === 'b' && E.sampleStats({ n: 8, a: '33321', b: '33' }).finalRound === 'a' && E.sampleStats({ n: 8, a: '332', b: '' }).final === null);
    check('sample: رموزٌ غريبة وعددٌ أكبر من العيّنة تُهمل', E.sampleStats({ n: 3, a: '39x3333' }).a.rated === 1 && E.sampleStats(null) === null);
    check('sample: كمّيّات الاستمارة (جميع/معظم/أغلب/قليل/نادر)', [95, 90, 80, 75, 60, 50, 30, 25, 10].map(E.quantScore).join('') === '112233445');

    // البند ١ والبند ٢ من العيّنة، والبند ١١ من متابعة الأهداف
    const s0 = E.suggest(M, {}, { female: true });
    check('sample→suggest: بلا عيّنةٍ لا يُقترح البند ١، وسببه يدلّ على العيّنة', !s0.some(s => s.id === 1) && /عيّنة الطلبة/.test(E.unsupported(s0, M).find(u => u.id === 1).why));
    const s1 = E.suggest(M, {}, { female: true, sample });
    const i1 = s1.find(s => s.id === 1), i2 = s1.find(s => s.id === 2);
    check('sample→suggest: البند ١ من إتقان آخر قراءة (٦٩٪ ← أغلب = ملائم) بشاهده', i1 && i1.score === 3 && i1.basis === 'sample' && i1.conf === 'high'
          && /في عيّنةٍ من \(8\) طلبة في آخر الحصة: أتقن المهارة \(4\)، وأدّاها جزئيّاً \(3\)، ولم يتقنها \(1\) — نسبة الإتقان \(69%\)/.test(i1.evidence), JSON.stringify(i1));
    check('sample→suggest: البند ٢ من التقدّم (٧٥٪ ← معظم = جيد)، والإتقان «من … إلى …»', i2 && i2.score === 2 && i2.basis === 'sample' && /تقدّم \(5\) من \(8\) طلبة في العيّنة/.test(i2.evidence) && /وارتفع الإتقان من \(25%\) إلى \(69%\)/.test(i2.evidence), JSON.stringify(i2));
    check('sample→suggest: وطلبةٌ خارج النشاط يُنزلانه كما كان', E.suggest(M, { out: 3 }, { sample }).find(s => s.id === 2).score === 4);
    check('suggest: البند ٢ بلا عيّنةٍ كما كان (مراعاة الفروق، ومن هم خارج النشاط)', E.suggest({}, { include: 2 }, {}).find(s => s.id === 2).score === 1 && E.suggest({}, { out: 1 }, {}).find(s => s.id === 2).score === 3
          && E.suggest({}, { include: 1, out: 1 }, {}).find(s => s.id === 2).evidence === 'راعى المعلم الفروق الفردية بين الطلبة مرّة واحدة (تكليفٌ حسب المستوى أو دمجٌ لذوي الإعاقة والاحتياجات)، وظلّ طالبٌ واحد خارج النشاط.');
    check('sample→suggest: الصفوف ١–٤ «التلاميذ»', /تلاميذ/.test(E.suggest(M, {}, { sample, pupil: s => s.replace(/طلبة/g, 'تلاميذ') }).find(s => s.id === 1).evidence));

    // الأهداف القابلة للقياس
    const d = { M, counts: { dish: 3, out: 1 }, sample };
    const C = E.targetCandidates(d);
    check('targets: المقترحة ما لم يبلغ حدّه، والتعلّم أوّلاً (حركة الطلبة ثمّ الإتقان)', C[0].k === 'move' && C[1].k === 'mastery' && C.every(t => E.METRIC[t.k].dir > 0 ? t.base < E.METRIC[t.k].good : t.base > E.METRIC[t.k].good), C.map(t => t.k).join(','));
    check('targets: الهدف متدرّجٌ من القيمة لا قفزٌ إلى المثاليّ', C.find(t => t.k === 'move').goal === 60 && E.METRIC.move.goal(30) === 40 && E.METRIC.mastery.goal(69) === 85 && E.METRIC.idle.goal(480) === 240);
    const tMove = C.find(t => t.k === 'move'), tIdle = C.find(t => t.k === 'idle');
    check('targets: جملة التوصية بالأرقام', E.targetText(tMove, {}) === 'رفع زمن حركة الطلبة في عناصر الحصة النشطة من (' + tMove.base + '%) إلى (60%) على الأقلّ'
          && /من \(4\) دقائق إلى دقيقتين على الأكثر/.test(E.targetText(tIdle, {})), E.targetText(tIdle, {}));
    check('targets: بصيغة الجنس، و«التلاميذ» للصفوف ١–٤', /كلام المعلمة/.test(E.targetText({ k: 'org', base: 55, goal: 40 }, { female: true })) && /التلاميذ/.test(E.targetText(tMove, { pupil: s => s.replace('الطلبة', 'التلاميذ') })));
    check('targets: ومؤشّر الاتّفاق «… على الأقلّ / على الأكثر»', E.targetGoalText(tMove) === 'حركة الطلبة في عناصر الحصة النشطة 60% على الأقلّ' && E.targetGoalText({ k: 'dish', goal: 0 }) === 'المشاركون بغير الزيّ الرياضيّ 0');
    check('targets: ما لا يُقاس في هذا الرصد لا يُقترح (لا كلام ← لا أهداف كلام)', !C.some(t => ['praiseSpec', 'qHi', 'check', 'org'].includes(t.k)) && !E.targetCandidates({ M: {}, counts: {} }).length);
    const now = { M: Object.assign({}, M, { people: Object.assign({}, M.people, { movingPlay: 54 }) }), counts: { dish: 0, out: 2 }, sample: { n: 8, b: '33333332' } };
    const V = t => E.targetCheck(t, now).verdict;
    check('targets→follow: بلغه / تحسّن / بقي / تراجع / لم يُقس', V(tMove) === 'better' && V({ k: 'mastery', base: 69, goal: 85 }) === 'met' && V(tIdle) === 'same'
          && V({ k: 'out', base: 1, goal: 0 }) === 'worse' && V({ k: 'qHi', base: 0, goal: 2 }) === 'na' && E.targetCheck({ k: 'nope' }, now) === null);

    const follow = [E.targetCheck(tMove, now), E.targetCheck({ k: 'mastery', base: 69, goal: 85 }, now), E.targetCheck(tIdle, now), E.targetCheck({ k: 'qHi', base: 0, goal: 2 }, now)];
    const i11 = E.suggest(M, {}, { follow, followDate: '2026-10-01' }).find(s => s.id === 11);
    check('follow→suggest: البند ١١ من متابعة الأهداف (العمل بتوجيهات المشرف) — وما لم يُقس لا يُحسب', i11 && i11.score === 3 && i11.basis === 'follow' && i11.conf === 'high'
          && /^من أهداف الزيارة السابقة \(2026-10-01\): تحقّق \(1\) من \(3\)، وتحسّن \(1\) دون أن يبلغ هدفه — /.test(i11.evidence), JSON.stringify(i11));
    const allMet = [{ verdict: 'met', label: 'أ', unit: '%', base: 40, now: 60 }, { verdict: 'met', label: 'ب', unit: 'n', base: 3, now: 0 }];
    check('follow→suggest: تحقّقت كلّها ← جيد (المتميّز يقدّره المشرف)، ولا شيء ← غير ملائم، ولا قياس ← لا اقتراح',
          E.suggest({}, {}, { follow: allMet }).find(s => s.id === 11).score === 2 && E.suggest({}, {}, { follow: [{ verdict: 'same', label: 'أ', unit: '%', base: 1, now: 1 }] }).find(s => s.id === 11).score === 4
          && !E.suggest({}, {}, { follow: [{ verdict: 'na' }] }).some(s => s.id === 11));
    const dpF = E.debriefPrompts(M, {}, { female: true, follow, sample });
    check('follow→debrief: ما تحقّق يُعزَّز، وما لم يتحقّق سؤال', dpF.good.some(t => /^تحقّق هدف الزيارة السابقة: إتقان عيّنة الطلبة للمهارة \(69% ← 94%\)/.test(t)) && dpF.ask.some(t => /هدف «أطول انتظارٍ بين نشاطين» من الزيارة السابقة لم يتحقّق/.test(t))
          && dpF.ask.some(t => /^تحسّن «حركة الطلبة في عناصر الحصة النشطة» \(\d+% ← 54%\) ولم يبلغ المتّفق عليه \(60%\)\. ما الذي يوصلكِ إليه/.test(t)), JSON.stringify(dpF));
    check('formations: زمن القاطرة الطويلة حقيقيٌّ وإن تباعدت اللقطات (كان يُعدّ بالثواني التي فيها لقطة)', M.forms.longLineSec === M.forms.longRun.sec && M.forms.longLineSec > 150, M.forms.longLineSec);
    check('sample→debrief: إتقانٌ قليلٌ سؤال، وتقدّم أغلب العيّنة إجادة', E.debriefPrompts({}, {}, { sample: { n: 6, a: '111111', b: '111123' } }).ask.some(t => /أتقن المهارة \(1\) من \(6\) طلبة في العيّنة/.test(t)) && dpF.good.some(t => /تقدّم \(5\) من \(8\) طلبة في العيّنة/.test(t)));
    check('summary: العيّنة ومتابعة الأهداف في سطر الملاحظات', /وأتقن المهارة \(4\) من \(8\) طلبة في عيّنة الطلبة، وتحقّق \(1\) من \(3\) من أهداف الزيارة السابقة\.$/.test(E.summaryText(M, { sample, follow })));
    check('summary: لمساتٌ وعيّنةٌ بلا رصدٍ ← سطرٌ بلا مدّة', E.summaryText({}, { sample }) === 'رُصدت الحصة بعين المشرف: أتقن المهارة (4) من (8) طلبة في عيّنة الطلبة.');

    // لحظات الحصة
    check('moments: متى بدأ أطول انتظار، وأطول قاطرةٍ طويلة، والحصة دقيقةً دقيقة', M.longestIdleAt >= 1015 && M.longestIdleAt <= 1030 && M.forms.longRun.at === 1302 && M.forms.longRun.size === 9 && M.forms.longRun.sec > 150 && M.mins.length === 32, JSON.stringify([M.longestIdleAt, M.forms.longRun]));
    const AM = E.autoMoments(M, {});
    check('moments: أطول انتظار والقاطرة وأعلى حركة — بأوقاتها وعناصرها', AM.map(x => x.k).join(',') === 'peak,idle,line' && AM.find(x => x.k === 'idle').part === 'teach' && AM.find(x => x.k === 'line').part === 'apply'
          && /واستمرّ \(4\) دقائق/.test(AM.find(x => x.k === 'idle').text) && /قاطرةٌ من \(9\) طلبة/.test(AM.find(x => x.k === 'line').text), JSON.stringify(AM));
    check('moments: أدنى دقيقةٍ عند بدء أطول انتظارٍ لا تُذكر مرّتين', !AM.some(x => x.k === 'low'));
    check('moments: بلا رصدٍ لا لحظات', !E.autoMoments({}, {}).length && !E.autoMoments(null).length);

    // أنماط الرصد
    const P = E.patterns([{ teacher: 'سالم الهنائي', d }, { teacher: 'سالم  الهنائي', d }, { teacher: 'مريم', d: now }, { teacher: 'خالد', d: { counts: {} } }]);
    check('patterns: الحصص المرصودة والمعلّمون (المسافات لا تفرّق الاسم)', P.lessons === 3 && P.teachers === 2, JSON.stringify([P.lessons, P.teachers]));
    const li = P.issues.find(x => x.k === 'longIdle');
    check('patterns: ما يتكرّر بعدد حصصه ونسبتها ومعلّميه', li && li.n === 3 && li.pct === 100 && li.teachers.length === 2 && P.issues.find(x => x.k === 'dish').teachers.length === 1);
    check('patterns: موضوعات البرنامج التدريبيّ مرتّبةٌ بعدد المعلّمين', P.topics[0].teachers.length === 2 && P.topics.every((t, i, a) => !i || a[i - 1].teachers.length >= t.teachers.length));
    check('patterns: نسبة الأهداف المتحقّقة من المتابعات المحفوظة', E.patterns([{ teacher: 'أ', d: { M: {}, follow: { list: follow } } }]).follow.met === 1 && E.patterns([{ teacher: 'أ', d: { M: {}, follow: { list: follow } } }]).follow.measured === 3);
    check('patterns: issuesOf لا يرمي على بياناتٍ ناقصة', Array.isArray(E.issuesOf({})) && Array.isArray(E.issuesOf(null)));

    // التوصيل
    const UI = read('js/eye.js'), RP = read('js/eye-report.js'), DB = read('js/debrief.js');
    check('wiring: العلامة أثناء الرصد وحده، بوقتها، وملاحظتها مهروبة', /function addMark\(\) \{\s*\n\s*if \(!S\.running\)/.test(UI) && /S\.marks\.push\(\{ t: Math\.round\(now\(\)\), note: '' \}\)/.test(UI)
          && /value="\$\{esc\(m\.note \|\| ''\)\}"/.test(UI) && /\$\{esc\(x\.text \|\| 'بلا ملاحظة'\)\}/.test(UI));
    check('wiring: العيّنة والعلامات تُحفظ مع الرصد وتُستعاد، وتُصفَّر مع رصدٍ جديد', /sample: hasSample\(S\.sample\) \? Object\.assign\(\{\}, S\.sample\) : null,\s*\n\s*marks: S\.marks\.map\(m => \[m\.t, m\.note \|\| ''\]\)/.test(UI)
          && /S\.sample = data\.sample \? Object\.assign\(\{\}, data\.sample\) : null;\s*\n\s*S\.marks = \(data\.marks \|\| \[\]\)/.test(UI) && (UI.match(/S\.sample = null; S\.sampleRound = 'a'; S\.marks = \[\];/g) || []).length === 2);
    check('wiring: أهداف الزيارة السابقة (الرصد السابق للمعلّم نفسه) تُقاس على رصد اليوم، ثمّ يُقترح بها', /const prev = prevEye\(\);\s*\n\s*if \(prev && Array\.isArray\(prev\.d\.targets\)[\s\S]{0,200}targetCheck\(t, data\)[\s\S]{0,120}data\.sugg = E\(\)\.suggest\(keep, data\.counts, ctxOf\(data\)\);\s*\n\s*data\.summary = E\(\)\.summaryText\(keep, ctxOf\(data\)\)/.test(UI)
          && /if \(d\.follow && Array\.isArray\(d\.follow\.targets\)\) d\.follow\.list = d\.follow\.targets\.map\(t => E\(\)\.targetCheck\(t, d\)\)/.test(UI));
    check('wiring: «تركيز هذه الحصة» قبل الرصد وأثناءه، ويختفي حين تظهر المتابعة', /function renderFocus\(\) \{[\s\S]{0,200}const prev = S\.result \? null : prevEye\(\);/.test(UI) && /renderFocus\(\);\s*\n\s*\}\s*\n\s*\n\s*\/\/ علامات المشرف/.test(UI));
    check('wiring: الأهداف إلى «التوصيات» بلا تكرار، وإلى «مؤشّر النجاح» في المداولة', /const add = lines\.filter\(l => !ta\.value\.includes\(l\.slice\(2\)\)\);/.test(UI) && /'، ويُقاس في الزيارة القادمة\.'/.test(UI)
          && /b\.id === 'debriefEyeIndicator'[\s\S]{0,300}root\.svfEyeIndicatorText\(\)[\s\S]{0,300}cur\.includes\(t\) \? cur/.test(DB) && /root\.svfEyeIndicatorText = function/.test(UI));
    check('wiring: أنماط الرصد من تقارير العام الدراسيّ الحاليّ وأسماؤها مهروبة', /academicYearOf\(r\.visitDate\) !== ay/.test(UI) && /const names = arr => arr\.slice\(0, 4\)\.map\(esc\)/.test(UI));
    check('wiring: البطاقة فيها العيّنة والأهداف — لا ملاحظات المشرف (العلامات)', /عيّنة الطلبة/.test(RP) && /أهدافنا للزيارة القادمة/.test(RP) && !/marks|momentsOf|autoMoments/.test(RP));
}

/* ── ١٩) تحليلاتٌ أخرى من الكاميرا (2026-10-26): الاستجابة للصفّارة، شدّة النشاط، التزاحم، الكرات، موقع المعلّم ── */
{
    // التتبّع لا يفقد الجاري بين لقطتين متباعدتين (ثانيةٌ بينهما، ١٫٥ طول جسم)، وجريُه نشاطٌ شديد
    const T = E.newTracker();
    for (let k = 0; k <= 4; k++) E.trackStep(T, [person(0.1 + 0.17 * k, 0.6), person(0.9, 0.6)], k, 16 / 9);
    const sn = E.peopleSnapshot(T, 4, null);
    check('track: الجاري يبقى متتبَّعاً واحداً رغم تباعد اللقطات', T.tracks.length === 2 && T.next === 3, T.tracks.length + '/' + T.next);
    check('intensity: الجري (أكثر من ' + E.VIG_SPEED + ' طول جسمٍ في الثانية) نشاطٌ شديد، والساكن لا', sn.vg === 1 && sn.mv === 1, JSON.stringify({ vg: sn.vg, mv: sn.mv }));

    const J = E.newTracker();
    E.trackStep(J, [person(0.2, 0.6, { act: 0.5 })], 0, 16 / 9);
    const j0 = E.peopleSnapshot(J, 0, null);
    for (let k = 1; k <= 3; k++) E.trackStep(J, [person(0.2, 0.6, { act: 0.5 })], k * 0.5, 16 / 9);
    const j1 = E.peopleSnapshot(J, 1.5, null);
    check('intensity: تغيّر صندوق من لم تُعرف سرعته (أو ينتقل) ليس شدّة — والتمرين القويّ في المكان شديد', j0.mv === 1 && j0.vg === 0 && j1.vg === 1, JSON.stringify([j0.vg, j1.vg]));

    // التزاحم: متحرّكان ملاصقان، وثالثٌ متحرّكٌ بعيد، ورابعٌ ساكنٌ قريبٌ لا يُعدّ (الانتظار ليس تزاحماً)
    const C = E.newTracker();
    for (let k = 0; k <= 4; k++) {
        const t = k * 0.5;
        E.trackStep(C, [person(0.3, 0.6, { act: 0.3 }), person(0.32, 0.6, { act: 0.3 }), person(0.7, 0.6, { act: 0.3 }), person(0.72, 0.3)], t, 16 / 9);
    }
    const cs = E.peopleSnapshot(C, 2, null);
    check('crowd: متحرّكان ملاصقان يُعدّان، والبعيد والساكن لا', cs.cr === 2 && cs.mv === 3, JSON.stringify({ cr: cs.cr, mv: cs.mv }));

    // المعلّم: يُختار بلمسةٍ قريبة، ويُستثنى من الطلبة، وعلى الطرف أو في الوسط، ويُتبنّى متتبَّعٌ جديدٌ قربه إن انقطع
    const R = E.newTracker();
    const kids = [0.3, 0.4, 0.5, 0.6, 0.7].map(x => person(x, 0.5));
    for (let k = 0; k <= 2; k++) E.trackStep(R, kids.concat([person(0.95, 0.5)]), k * 0.5, 16 / 9);
    const s0 = E.peopleSnapshot(R, 1, null);
    const tid = E.pickNearest(s0, 0.98, 0.7);
    check('teacher: اللمسة تختار أقرب شخصٍ إليها، والبعيدة لا تختار أحداً', tid === 6 && E.pickNearest(s0, 0.5, 0.05) === null, tid);
    let tch = E.teacherStep(R, { id: tid }, 1);
    const sT = E.peopleSnapshot(R, 1, null, tch);
    check('teacher: يُستثنى من الطلبة، وعلى طرفهم', sT.n === 5 && sT.tc && sT.tc.edge === true && sT.dots.filter(d => d.tch).length === 1, JSON.stringify({ n: sT.n, tc: sT.tc }));
    const M2 = E.newTracker();
    for (let k = 0; k <= 2; k++) E.trackStep(M2, kids.concat([person(0.5, 0.52)]), k * 0.5, 16 / 9);
    const mid = E.teacherStep(M2, { id: 6 }, 1);
    check('teacher: في وسط الطلبة ليس على الطرف', E.peopleSnapshot(M2, 1, null, mid).tc.edge === false);
    E.trackStep(R, kids, 3.5, 16 / 9);                               // انقطع المعلّم
    E.trackStep(R, kids.concat([person(0.94, 0.5)]), 4, 16 / 9);     // وظهر متتبَّعٌ جديدٌ قرب موضعه
    tch = E.teacherStep(R, tch, 4);
    check('teacher: يُتبنّى أقرب متتبَّعٍ جديدٍ من آخر موضعه', tch.id !== tid && tch.id > 6 && E.peopleSnapshot(R, 4, null, tch).n === 5, JSON.stringify(tch));

    // حصّة: نشاطٌ ثمّ صفّارة توقّف (يتوقّفون بعد ٤ ث)، ثمّ صفّارة بدء (يبدؤون بعد ٣ ث)، والمعلّم على الطرف ثلثي الوقت
    const secs = [];
    const ev = [[0, 'warm'], [360, 'fit'], [600, 'teach'], [1260, 'apply'], [1740, 'close']].map(([t, k]) => ({ t, k }));
    for (let t = 0; t < 1920; t++) {
        const cyc = t % 180, act = !(cyc >= 144 && cyc < 173);
        secs.push({ m: act ? 0.05 : 0.004, v: false, w: cyc === 140 || cyc === 170,
            p: { n: 22, mv: act ? 15 : 1, o: 1, q: 0, r: true, fm: 'S', ln: 0, d: 0, vg: act ? 5 : 0, cr: act ? 6 : 0, b: t > 1260 && t < 1740 ? 4 : 0, t: [0.1 + 0.8 * ((t % 600) / 600), 0.6, 1, t % 300 < 200 ? 1 : 0] } });
    }
    const M = E.summarize({ secs, grid: Array(108).fill(10), sens: 'medium', ctx: ev, mic: 'device' });
    check('whistle: التوقّف بعد ٤ ثوانٍ والبدء بعد ٣ — بثانيتين متتاليتين', M.resp.n === 20 && M.resp.stopMed === 4 && M.resp.startMed === 3 && M.resp.slow === 0, JSON.stringify(M.resp).slice(0, 200));
    const noResp = E.whistleResponses(Array.from({ length: 60 }, (_, t) => ({ m: 0.05, w: t === 20, p: { n: 10, mv: 8 } })), 0.018);
    check('whistle: لا توقّف خلال عشرين ثانية ← «لم يُستجب» ويُعدّ بطيئاً', noResp.list[0][2] === -1 && noResp.slow === 1 && noResp.med === null);
    check('whistle: بلا كشفٍ تُقاس بحركة الصورة', E.whistleResponses(secs.map(s => ({ m: s.m, w: s.w })), 0.018).stopMed === 4);
    const P = M.people;
    check('intensity: الجري نسبةً من الطلبة', P.vigAll === 19 && P.vigPlay === 19, JSON.stringify([P.vigAll, P.vigPlay]));
    check('crowd: من المتحرّكين أثناء النشاط', P.crowdPct === 40, P.crowdPct);
    check('balls: المئين ٩٠ في زمن النشاط، وطالبٌ لكلّ كرةٍ مقرّب', P.balls === 4 && E.ballRatio(M) === 6);
    check('balls: حصّةٌ لا تُرى فيها كرةٌ عشرين لقطةً ليست حصّة كرة', E.summarize({ secs: secs.map((s, t) => Object.assign({}, s, { p: Object.assign({}, s.p, { b: t < 15 ? 1 : 0 }) })), sens: 'medium' }).people.balls === null);
    check('teacher: على الطرف وتنقّله وتغطيته من شبكة ٤×٣', P.teacher && P.teacher.edgePct === 69 && P.teacher.movePct === 100 && P.teacher.cover === 33 && P.teacher.cells === '000011110000', JSON.stringify(P.teacher));

    const sg = E.suggest(M, {}, {}), by = id => sg.find(x => x.id === id);
    check('suggest ٧: الاستجابة للصفّارة وشدّة النشاط وموقع المعلّم في الشاهد', /منها \(19%\) جرياً أو نشاطاً شديداً/.test(by(7).evidence) && /واستجاب الطلبة لإشارة الصفّارة خلال \(4\) ثوانٍ في المتوسّط \(20 إشارة\)/.test(by(7).evidence)
          && /ووقف المعلم على أطراف الطلبة \(69%\) من الوقت وتنقّل في \(33%\) من مساحة النشاط/.test(by(7).evidence), by(7).evidence);
    check('suggest ٧: المعدِّلات ترفع درجةً واحدةً على الأكثر', by(7).score === 1);
    const slowM = Object.assign({}, M, { waits: 0, longestIdle: 400, resp: Object.assign({}, M.resp, { med: 14 }), people: Object.assign({}, P, { teacher: Object.assign({}, P.teacher, { edgePct: 20 }) }) });
    check('suggest ٧: انتظارٌ طويلٌ واستجابةٌ بطيئة ومعلّمٌ في الوسط ← تنزل درجتين على الأكثر (جيد ← غير ملائم)', E.suggest(slowM, {}, {}).find(x => x.id === 7).score === 4, E.suggest(slowM, {}, {}).find(x => x.id === 7).score);
    check('suggest ٥: التزاحم وحده يقترح البند (٤٠٪ ← غير ملائم)', by(5).score === 4 && by(5).basis === 'ai' && /تزاحم الطلبة أثناء الحركة: \(40%\)/.test(by(5).evidence));
    check('suggest ٥: ومع اللمسات يُضاف، والتزاحم القليل شاهدٌ إيجابيّ', /وتوزّع الطلبة في مسافاتٍ آمنة/.test(E.suggest(Object.assign({}, M, { people: Object.assign({}, P, { crowdPct: 8 }) }), { safe: 1 }, {}).find(x => x.id === 5).evidence));
    check('suggest ٩: الكرات ← كرةٌ لكلّ (6) طلبة = غير ملائم', by(9).score === 4 && /رُصدت نحو \(4\) كرات لـ\(23\) طالباً — كرةٌ لكلّ \(6\) طلبة/.test(by(9).evidence), by(9).evidence);
    check('suggest ٩: كرةٌ لكلّ طالبين = جيد (بالجرّ)', /كرةٌ لكلّ طالبين/.test(E.suggest(Object.assign({}, M, { people: Object.assign({}, P, { balls: 12 }) }), {}, {}).find(x => x.id === 9).evidence));
    check('summary: الاستجابة للصفّارة في سطر الملاحظات', /واستجاب الطلبة لها خلال \(4\) ثوانٍ في المتوسّط/.test(E.summaryText(M, {})));
    const dp = E.debriefPrompts(M, {}, { female: true });
    check('debrief: الاستجابة السريعة إجادة، والتزاحم وقلّة الكرات أسئلة', dp.good.some(t => /استجاب الطلبة لإشارة الصفّارة سريعاً/.test(t)) && dp.ask.some(t => /كيف توزّعين المساحة/.test(t)) && dp.ask.some(t => /كرةٌ لكلّ \(6\) طلبة/.test(t)), JSON.stringify(dp));
    check('debrief: المعلّم في الوسط سؤالٌ بصيغة المخاطَب', E.debriefPrompts(slowM, {}, { female: true }).ask.some(t => /^وقفتِ في وسط الطلبة أغلب الوقت \(على أطرافهم 20% فقط\)/.test(t)));
    const C2 = E.targetCandidates({ M: slowM, counts: {} }, 20).map(t => t.k);
    check('targets: الاستجابة والتزاحم والكرات وموقع المعلّم أهدافٌ تُقاس', ['resp', 'crowd', 'balls', 'tEdge'].every(k => C2.includes(k)), C2.join(','));
    check('targets: أهدافها متدرّجة', E.METRIC.resp.goal(14) === 7 && E.METRIC.balls.goal(6) === 3 && E.METRIC.tEdge.goal(20) === 40 && E.METRIC.crowd.goal(40) === 25);
    check('patterns: أنماطها', ['slowResp', 'crowd', 'fewBalls', 'teacherCenter'].every(k => E.issuesOf({ M: slowM }).includes(k)), E.issuesOf({ M: slowM }).join(','));
    const AM = E.autoMoments(Object.assign({}, M, { resp: { list: [[300, 's', 3], [700, 's', 14], [900, 'g', -1]] } }), {});
    // التوصيل
    const UI = read('js/eye.js'), RP = read('js/eye-report.js');
    check('wiring: الكرات من النموذج نفسه داخل منطقة الصفّ، والمعلّم يُتابَع ويُستثنى في كلّ لقطة', /o\.label === 'sports ball' && o\.score >= E\(\)\.BALL_MIN_SCORE/.test(UI) && /!S\.roi \|\| E\(\)\.inPoly\(cx, cy, S\.roi\)/.test(UI)
          && /S\.teacher = E\(\)\.teacherStep\(AI\.T, S\.teacher, t\);\s*\n\s*S\.pSnap = E\(\)\.peopleSnapshot\(AI\.T, t, S\.roi, S\.teacher\);\s*\n\s*S\.pSnap\.b = balls;/.test(UI));
    check('wiring: كلّ ثانيةٍ تحفظ الشدّة والتزاحم والكرات وموضع المعلّم', /vg: p\.vg, cr: p\.cr, b: p\.b \}/.test(UI) && /p\.tc \? \{ t: \[p\.tc\.x, p\.tc\.y, p\.tc\.mv \? 1 : 0, p\.tc\.edge == null \? -1 : p\.tc\.edge \? 1 : 0\] \}/.test(UI));
    check('wiring: المعلّم بلمسةٍ أثناء الرصد بالكشف وحده، ويُصفَّر مع رصدٍ جديد', /if \(!S\.running \|\| !S\.video \|\| !AI\.ok\)/.test(UI) && /const id = E\(\)\.pickNearest\(S\.pSnap, x, y\);/.test(UI) && /S\.teacher = null; S\.pickTeacher = false;\s*\n\s*setRoi\(null\);/.test(UI));
    check('wiring: عدد الكرات يُصحَّح فيُعاد الاقتراح', /\$\('eyeBalls'\)[\s\S]{0,400}S\.result\.M\.people\.balls = raw && v > 0 \? v : null;\s*\n\s*resuggest\(\);/.test(UI));
    check('wiring: البطاقة فيها «الحركة والتنظيم»', /heading\(g, 'الحركة والتنظيم'/.test(RP) && /Y\.ballRatio/.test(RP));
    check('moments: أبطأ استجابةٍ للصفّارة لحظةٌ بوقتها', AM.some(x => x.k === 'resp' && x.t === 900 && /لم يستجب الطلبة لإشارة الصفّارة/.test(x.text)), JSON.stringify(AM));
}

/* ── ٢٠) كاميرا الهاتف (2026-10-26): الـiPhone على الحامل يرسل صورته إلى الـiPad، والتحليل والصوت هنا ── */
{
    const L = require('../js/eye-link.js');
    const codes = Array.from({ length: 200 }, () => L.newCode());
    check('link: الرمز عشرة أحرفٍ بلا ملتبسٍ (l/1/o/0) ولا يتكرّر', codes.every(c => /^[a-km-np-z2-9]{10}$/.test(c)) && new Set(codes).size === 200, codes[0]);
    check('link: الرابط إلى cam.html بجانب الصفحة، بالمشرف والرمز في الـhash', L.linkUrl('https://supervisor-mct.com/reports.html?x=1#form', 'asad', 'abcdefghjk') === 'https://supervisor-mct.com/cam.html#asad.abcdefghjk');
    check('link: الـhash يُقرأ، والمسار بقاعدة firestore.rules', JSON.stringify(L.parseHash('#asad.abcdefghjk')) === '{"sup":"asad","code":"abcdefghjk"}'
          && L.parseHash('#A.abcdefghjk') === null && L.parseHash('#asad.short') === null && L.parseHash('#../x.abcdefghjk') === null && L.parseHash('') === null);
    // الوثيقة بشكل التقرير الذي تقبله القواعد المنشورة (reports/<sup>/items) — بلا تعديلٍ فيها
    const RULES = (() => { try { return fs.readFileSync(path.join(ROOT, '..', 'teacher-data-collection', 'firestore.rules'), 'utf8'); } catch (e) { return ''; } })();
    const doc = L.signalDoc('abcdefghjk', { offer: 'v=0\r\n'.repeat(400), at: 1 });
    const allowed = ['key', 'kind', 'supervisor', 'updatedAt', 'json', 'deleted'];
    check('link: وثيقة الربط بمفاتيح التقرير وأنواعه وحدها', Object.keys(doc).every(k => allowed.includes(k)) && doc.kind === 'supervision' && typeof doc.updatedAt === 'number'
          && doc.key === 'svf_eyelink_abcdefghjk' && doc.json.length < 300000);
    if (RULES) check('link: والقواعد تقبل هذا الشكل نفسه (hasOnly)', /hasOnly\(\['key', 'kind', 'supervisor', 'updatedAt', 'json', 'deleted'\]\)/.test(RULES) && /d\(\)\.kind in \['supervision', 'school'\]/.test(RULES));
    const tomb = L.tombstone('abcdefghjk');
    check('link: بعد الاتّصال تُفرَّغ وتُعلَّم محذوفة (القواعد تمنع الحذف)', tomb.deleted === true && tomb.json === '' && Object.keys(tomb).every(k => allowed.includes(k)) && L.readSignal(tomb) === null);
    check('link: قراءة الوصف، والتالف لا يُقرأ', L.readSignal(doc).offer.length === 2000 && L.readSignal({ json: '{x' }) === null && L.readSignal(null) === null);
    // المزامنة السحابيّة لا ترى وثيقة الربط تقريراً (لا تنزل إلى الأرشيف ولا تُرفع)
    const CL = read('js/cloud.js');
    const prefixes = (CL.match(/KIND_PREFIX\s*=\s*\{([^}]+)\}/) || [])[1] || '';
    check('link: مفتاحها خارج بادئتي التقارير فتتجاهله المزامنة', /supervision_v6_visit_/.test(prefixes) && !/svf_eyelink_/.test(prefixes) && !prefixes.split(/['"]/).some(p => p && 'svf_eyelink_x'.indexOf(p) === 0));

    // العدسة العريضة جدّاً تُختار — بأسماء iOS الإنجليزيّة والعربيّة
    const dev = (deviceId, label) => ({ kind: 'videoinput', deviceId, label });
    const iosEn = [dev('f', 'Front Camera'), dev('b', 'Back Camera'), dev('d', 'Back Dual Wide Camera'), dev('t', 'Back Triple Camera'), dev('u', 'Back Ultra Wide Camera'), dev('z', 'Back Telephoto Camera')];
    check('lens: العريضة جدّاً أوّلاً (iOS بالإنجليزيّة)', L.pickLens(iosEn).id === 'u' && L.rankCams(iosEn)[0].id === 'u' && L.rankCams(iosEn).pop().id === 'f');
    check('lens: «Dual Wide» ليست العريضة جدّاً', L.rankCams(iosEn).filter(c => c.ultra).map(c => c.id).join() === 'u');
    check('lens: وبالعربيّة', L.pickLens([dev('f', 'الكاميرا الأمامية'), dev('b', 'الكاميرا الخلفية'), dev('u', 'الكاميرا الخلفية فائقة الاتساع')]).id === 'u'
          && L.pickLens([dev('b', 'الكاميرا الخلفية'), dev('u', 'كاميرا خلفية واسعة جدًا')]).id === 'u');
    check('lens: بلا عريضةٍ ← الخلفيّة لا الأماميّة، وبلا أسماءٍ ← الأولى', L.pickLens([dev('f', 'Front Camera'), dev('b', 'Back Camera')]).id === 'b' && L.pickLens([dev('a', ''), dev('c', '')]).id === 'a' && L.pickLens([]) === null);
    check('lens: أسماءٌ قصيرة للأزرار', L.lensLabel('Back Ultra Wide Camera') === 'العريضة جدّاً' && L.lensLabel('Back Telephoto Camera') === 'المقرّبة'
          && L.lensLabel('Back Camera') === 'العاديّة (×1)' && L.lensLabel('Back Triple Camera') === 'الثلاثيّة (تلقائيّ)' && L.lensLabel('x', true) === 'العريضة جدّاً');

    // التوصيل
    const UI = read('js/eye.js'), CAM = read('cam.html').replace(/<!--[\s\S]*?-->/g, ''), LK = read('js/eye-link.js'), ID = read('js/identity.js'), RH = read('reports.html'), SW = read('sw.js');
    check('wiring: getDoc في وحدة Firebase (لقراءة وثيقة الربط)', /getDoc: fs\.getDoc/.test(ID));
    check('wiring: eye-link.js قبل eye.js في التقارير، وفي ذاكرة عامل الخدمة مع cam.html (والـQR في vendor لا يُخزَّن مسبقاً)',
          RH.indexOf('<script src="js/eye-link.js"') > 0 && RH.indexOf('<script src="js/eye-link.js"') < RH.indexOf('<script src="js/eye.js"') && /'\.\/js\/eye-link\.js'/.test(SW) && /'\.\/cam\.html'/.test(SW) && !/vendor\/qrcode/.test(SW));
    check('wiring: الهاتف لا يسجّل ولا يرسل صوتاً', !/MediaRecorder|toDataURL|getImageData|<canvas/.test(CAM) && /audio: false/.test(CAM) && !/MediaRecorder|toDataURL/.test(LK));
    check('wiring: الهاتف يقرأ الرابط وحده بلا دخول — لا تقارير ولا هويّة', !/gate\.js/.test(CAM) && !/localStorage/.test(CAM) && /L\.parseHash\(location\.hash\)/.test(CAM));
    check('wiring: الربط بالمسار نفسه للمشرف، والتحليل يبدأ بوصول الصورة', /begin\('camera', v, 'phone'\)/.test(UI) && /LK\(\)\.host\(\{/.test(UI) && /SupervisorCloud\.bucket\(\)/.test(UI));
    check('wiring: الميكروفون يُفتح داخل ضغطة «كاميرا الهاتف» (iOS) لا عند وصول الصورة',
          /async function startPhone\(\)[\s\S]{0,1600}getUserMedia\(\{ audio: audioConstraints\(\) \}\)[\s\S]{0,300}startAudio\([\s\S]{0,400}await openLink\(sup\);/.test(UI));
    check('wiring: صورةٌ لا تصل ← الثانية غير محسوبة لا انتظار، ولا كشف عليها',
          /if \(S\.via === 'phone' && \(phoneFrozen\(\) \|\| v\.readyState < 2 \|\| !v\.videoWidth\)\) \{[\s\S]{0,120}S\.acc\.bad\+\+; S\.acc\.lost = true;/.test(UI)
          && /v\.readyState < 2 \|\| !v\.videoWidth \|\| phoneFrozen\(\)\) return;/.test(UI) && /if \(a\.lost && a\.bad >= a\.n\) S\.lostSec\+\+;/.test(UI));
    check('wiring: وصول الإطارات بعدّادٍ متزامن ونداء الإطار، والنبضة المتأخّرة لا تُعدّ انقطاعاً',
          /getVideoPlaybackQuality\(\)\.totalVideoFrames/.test(UI) && /requestVideoFrameCallback\(cb\)/.test(UI) && /t - S\.lastTickAt > 1500/.test(UI));
    check('wiring: تبديل العدسة أو التقريب يمسح المنطقة والمعلّم والمتتبَّعين', /function lensChanged\(\)[\s\S]{0,200}setRoi\(null\);[\s\S]{0,80}S\.teacher = null;[\s\S]{0,80}E\(\)\.newTracker\(\)/.test(UI));
    check('wiring: أسماء العدسات من الهاتف تُهرَّب', /data-lens="\$\{esc\(x\.id\)\}"[\s\S]{0,140}\$\{esc\(LK\(\)\.lensLabel\(x\.label, x\.ultra\)\)\}/.test(UI));
    check('wiring: الإيقاف يودّع الهاتف ويُغلق الاتّصال، والنتيجة تُعلَّم بمصدرها وثواني الانقطاع',
          /l\.send\(\{ type: 'bye' \}\)/.test(UI) && /data\.via = 'phone'; data\.lost = S\.lostSec \|\| 0;/.test(UI) && /' — من كاميرا الهاتف'/.test(UI));
    check('wiring: الهاتف يغلق كاميرته بوداع المشرف، ويُبدَّل مساره دون إعادة الربط', /m\.type === 'bye'\) finish\(/.test(CAM) && /replaceTrack\(s\.getVideoTracks\(\)\[0\]\)/.test(CAM) && /contentHint = 'detail'/.test(CAM));
    check('wiring: رمز QR محلّيّ (vendor) بلا خدمةٍ خارجيّة', /vendor\/qrcode\/qrcode\.js/.test(UI) && fs.existsSync(path.join(ROOT, 'vendor/qrcode/qrcode.js')) && /Licensed under the MIT license/.test(read('vendor/qrcode/qrcode.js')) && !/api\.qrserver|chart\.googleapis/.test(UI));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
