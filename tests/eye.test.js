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
const PENDING = [];                                  // فحوصٌ غير متزامنة (الوسيط) — يُنتظر بها قبل الخروج
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
    check('tags: كلّ وسمٍ يشهد لبندٍ يُقترح أو لوصفه (١ و١٢ أدلّةٌ للوصف)', E.TAGS.every(t => [1, 2, 3, 4, 5, 7, 8, 9, 10, 12].includes(t.item)));
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
    // الزيّ للبند ٤ (القيم: «الالتزام بالزي الرياضي») لا للبند ٥ — 2026-10-31
    check('suggest ٤: ثلاثةٌ بالدشداشة من ثلاثين ← ملائم (والبند ٥ لا يُقترح منه)', by(4) && by(4).score === 3 && /شارك \(3\) طلبة من \(30\) طالباً بالدشداشة بدل الزيّ الرياضيّ/.test(by(4).evidence) && !by(5), JSON.stringify(by(4)));
    const fem5 = E.suggest(M2, { dish: 6 }, { female: true }).find(s => s.id === 4);
    check('suggest ٤: معلّمة ← «بغير الزيّ الرياضيّ»، وستّةٌ ← غير ملائم', fem5.score === 4 && /بغير الزيّ الرياضيّ/.test(fem5.evidence) && !/دشداشة/.test(fem5.evidence), JSON.stringify(fem5));
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
    check('wiring: الصورة طبيعيّةٌ افتراضاً (طلب المشرف)، وإخفاؤها اختيارٌ يُذكر', /<input type="checkbox" id="eyeShowVideo"[^>]*checked>/.test(UI)
          && /localStorage\.getItem\('svf_eye_show'\) === '0'/.test(UI) && /v\.style\.opacity = S\.running && checked\('eyeShowVideo'\)/.test(UI));
    check('wiring: المسرح يأخذ شكل الصورة العموديّة', /function fitStage\(\)/.test(UI) && /v\.videoHeight > v\.videoWidth/.test(UI));
    check('wiring: خلفيّة الخصوصيّة أربعون بكسلاً رماديّة', /const pw = 40/.test(UI) && /imageSmoothingEnabled = false/.test(UI));
    check('wiring: النموذج محلّيٌّ ويُحمَّل عند الحاجة', /new URL\('vendor\/human\/', document\.baseURI\)/.test(UI) && /await import\(base \+ 'human\.esm\.js'\)/.test(UI)
          && ['human.esm.js', 'centernet.json', 'centernet.bin', 'LICENSE'].every(f => fs.existsSync(path.join(ROOT, 'vendor/human', f))));
    check('wiring: الكشف على منطقة الصفّ مقصوصةً، وبالعتبة نفسها', /E\(\)\.polyBox\(S\.roi, 0\.04\)/.test(UI) && /o\.score >= E\(\)\.PERSON_MIN_SCORE/.test(UI));
    check('wiring: عامل الخدمة — vendor بالذاكرة أوّلاً ولا يُخزَّن مسبقاً', /url\.pathname\.indexOf\('\/vendor\/'\) !== -1/.test(SW) && !/'\.\/vendor\//.test(SW) && /const VERSION = 'v(3[5-9]|[4-9]\d)'/.test(SW));
    const hook = S.indexOf('svfEyeBeforeSave()'), rd = S.indexOf('const reportData = {', S.indexOf('function savePermanentReport'));
    check('wiring: الدرجات المعتمدة تُكتب قبل جمع حقول التقرير', hook > 0 && hook < rd && /typeof svfEyeBeforeSave === 'function'/.test(S));
    check('wiring: الميكروفون يُختار، و«على المعلّم»', /deviceId = \{ exact: id \}/.test(UI) && /chk\('eyeTeacherMic'/.test(UI) && /enumerateDevices/.test(UI));
    check('wiring: أزرار عناصر الحصة الخمسة والعدّادات تُنقص', /E\(\)\.PARTS\.map/.test(UI) && /data-dec="\$\{k\}"/.test(UI) && /function resuggest\(\)/.test(UI));
    check('wiring: لا تُحفظ صورٌ ولا صوت (بعد المرحلة الأولى)', !/toDataURL|MediaRecorder|toBlob/.test(UI)
          && (UI.match(/localStorage\.setItem\(/g) || []).length === 5 && /localStorage\.setItem\('svf_eye_show'/.test(UI)
          && /localStorage\.setItem\(CK_KEY, JSON\.stringify\(ck\)\)/.test(UI) && /localStorage\.setItem\(LAST_KEY, JSON\.stringify\(\{ at: Date\.now\(\), form: formSig\(\), data \}\)\)/.test(UI) && /localStorage\.setItem\(REC_KEY/.test(UI)
          && /localStorage\.setItem\(PREF_KEY, JSON\.stringify\(p\)\)/.test(UI) && /const PREF_IDS = \['eyeFacing', 'eyeSens', 'eyeRate', 'eyeAI', 'eyeMic', 'eyeMicDev', 'eyeTeacherMic', 'eyeSpeech', 'eyeDraftUrl', 'eyeDraftKey', 'eyeAdv'\];/.test(UI));
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
    // أسئلة المعلّم وتعزيزه فعلُه هو — لا يقترحان البند ٣ (مهارات الطلبة) ولا ٤ (قيمهم) وحدهما (2026-10-31)، والتعزيز يُذكر في البند ١٠
    check('speech→suggest: البند ٣ لا يُقترح من أسئلة المعلّم وحدها', !by(3), by(3) && by(3).evidence);
    check('speech→suggest: البند ٤ لا يُقترح من تعزيز المعلّم وحده، والتعزيز في البند ١٠', !by(4) && /وسُمع تعزيزٌ لفظيّ .* بما أجاده الطالب تحديداً/.test(by(10).evidence), by(10).evidence);
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
    check('wiring: «فهم الكلام» يُسأل عنه سؤالاً مستقلّاً قبل تشغيله، ورفضه يطفئه', /function speechConsent\(\)[\s\S]{0,900}root\.confirm\([\s\S]{0,400}هل وافق المعلّم على ذلك؟[\s\S]{0,200}\$\('eyeSpeech'\)\.checked = false/.test(UI)
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
    // نسخةٌ عميقة: العيّنة بنقاط المهارة فيها مصفوفات (pa/pb) — نسخةٌ سطحيّة كانت ستشارك الحالة الحيّة
    check('wiring: العيّنة والعلامات تُحفظ مع الرصد وتُستعاد، وتُصفَّر مع رصدٍ جديد', /sample: hasSample\(S\.sample\) \? JSON\.parse\(JSON\.stringify\(S\.sample\)\) : null,\s*\n\s*guide: GD \? \{ id: GD\.id, skills: S\.guide\.skills\.slice\(\) \} : null,\s*\n\s*marks: S\.marks\.map\(markRow\)/.test(UI) && /const markRow = m => \(m\.item \? \[m\.t, m\.note \|\| '', m\.item\] : \[m\.t, m\.note \|\| ''\]\);/.test(UI)
          && /S\.sample = data\.sample \? JSON\.parse\(JSON\.stringify\(data\.sample\)\) : null;\s*\n\s*S\.marks = \(data\.marks \|\| \[\]\)/.test(UI) && (UI.match(/S\.sample = null; S\.sampleRound = 'a'; S\.marks = \[\]; S\.samplePick = -1;/g) || []).length === 2);
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
    // الأزمنة نسبةً إلى TRACK_TTL: يُنسى متتبَّع المعلّم بعد آخر ظهورٍ له (ث١) بمدّة TTL، فتُضبط على أيّ قيمة
    const lost = 1 + E.TRACK_TTL;
    E.trackStep(R, kids, lost, 16 / 9);                              // انقطع المعلّم
    E.trackStep(R, kids.concat([person(0.94, 0.5)]), lost + 0.5, 16 / 9); // وظهر متتبَّعٌ جديدٌ قرب موضعه
    tch = E.teacherStep(R, tch, lost + 0.5);
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
    check('wiring: كلّ ثانيةٍ تحفظ الشدّة والتزاحم والكرات وموضع المعلّم', /vg: p\.vg, cr: p\.cr, b: p\.b(, e: p\.e)? \}/.test(UI) && /p\.tc \? \{ t: \[p\.tc\.x, p\.tc\.y, p\.tc\.mv \? 1 : 0, p\.tc\.edge == null \? -1 : p\.tc\.edge \? 1 : 0\] \}/.test(UI));
    check('wiring: المعلّم بلمسةٍ أثناء الرصد بالكشف وحده، ويُصفَّر مع رصدٍ جديد', /if \(!S\.running \|\| !S\.video \|\| !AI\.ok\)/.test(UI) && /const id = E\(\)\.pickNearest\(S\.pSnap, x, y\);/.test(UI) && /S\.teacher = null; S\.pickTeacher = false;\s*\n\s*setRoi\(null\);/.test(UI));
    check('wiring: عدد الكرات يُصحَّح فيُعاد الاقتراح', /\$\('eyeBalls'\)[\s\S]{0,400}S\.result\.M\.people\.balls = raw && v > 0 \? v : null;\s*\n\s*S\.result\.M\.people\.ballsSet = !!\(raw && v > 0\);\s*\n\s*resuggest\(\);/.test(UI));
    check('wiring: البطاقة فيها «الحركة والتنظيم»', /heading\(g, [^\n]*'الحركة والتنظيم'/.test(RP) && /Y\.ballRatio/.test(RP));
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
          /if \(\(S\.via === 'phone' && \(phoneFrozen\(\) \|\| v\.readyState < 2 \|\| !v\.videoWidth\)\) \|\| camFrozen\(\)\) \{[\s\S]{0,120}S\.acc\.bad\+\+; S\.acc\.lost = true;/.test(UI)
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

/* ── ٢١) المتابعة الحيّة (2026-10-26): سلسلةٌ لكلّ عشر ثوانٍ، و«الآن»، والتنبيهات ── */
{
    const mk = (n, f) => Array.from({ length: n }, (_, t) => f(t));
    // ٢٠٠ ث نشاط (١٢ من ٢٠ يتحرّكون) ثمّ ٢٠٠ ث انتظار؛ والقاطرة من ٣٣٠، وأربعةٌ خارج المنطقة في الأخير
    const secs = mk(400, t => ({ m: t < 200 ? 0.05 : 0.003, v: t % 3 === 0, w: t === 150, p: t % 3 ? null : { n: 20, mv: t < 200 ? 12 : 2, o: t > 380 ? 4 : 0, r: true, ln: t > 330 ? 9 : 0 } }));
    const rec = { secs, sens: 'medium', ctx: [{ t: 0, k: 'warm' }, { t: 60, k: 'apply' }] };
    const M = E.summarize(rec), L = E.live(rec, M, { camera: true, ai: true, roi: true });
    check('live: مقطعٌ لكلّ عشر ثوانٍ بحالته وحركة الطلبة وكلام المعلّم والصفّارة والعنصر', L.series.length === 40 && L.series[0].k === 'a' && L.series[0].mv === 60 && L.series[39].mv === 10
          && L.series[15].w === 1 && L.series[0].c === 'warm' && L.series[10].c === 'apply' && Math.abs(L.series[0].talk - 0.4) < 0.01, JSON.stringify(L.series[0]));
    check('live: الآن — انتظارٌ ومدّته، والعنصر الجاري وزمنه، وحركة آخر ١٥ ث', L.state === 'i' && L.run >= 180 && L.part === 'apply' && L.partSec === 340 && L.now === 10, JSON.stringify([L.state, L.run, L.part, L.partSec, L.now]));
    check('live: زمن كلّ عنصرٍ مقابل الموصى به بالثواني (دقائق حصّة ٤٠)', L.parts.find(x => x.k === 'warm').sec === 60 && L.parts.find(x => x.k === 'warm').rec === 300
          && L.parts.find(x => x.k === 'apply').cur && E.live(rec, M, { rec: { warm: 8 } }).parts[0].rec === 480);
    check('live: التنبيهات بالأهمّيّة — الانتظار أحمر بعد دقيقتين، والقاطرة، ولا يتكرّر «الحركة ضعيفة» مع الانتظار',
          L.alerts[0].k === 'idle' && L.alerts[0].level === 'bad' && L.alerts.some(a => a.k === 'line' && /\(9\) طلبة/.test(a.text)) && !L.alerts.some(a => a.k === 'move') && L.alerts.length <= 3,
          JSON.stringify(L.alerts));
    check('live: قاطرةٌ مستمرّة بزمنها وطولها، وخارج المنطقة الآن', L.line && L.line.n === 9 && L.line.sec >= 60 && L.outside === 4 && L.pupilsNow === 24);
    // حركةٌ ضعيفةٌ في عنصرٍ نشطٍ (بلا انتظار) ← تنبيه؛ وبلا عنصرٍ بعد دقيقتين ← تلميح؛ وبلا منطقةٍ ← تلميح
    const low = { secs: mk(200, t => ({ m: 0.05, v: false, w: false, p: t % 2 ? null : { n: 20, mv: 6, o: 0, r: false, ln: 0 } })), sens: 'medium', ctx: [{ t: 0, k: 'apply' }] };
    const L2 = E.live(low, E.summarize(low), {});
    check('live: «حركة الطلبة ٣٠٪ في الأنشطة التطبيقيّة» حين يقلّ النشاط في عنصرٍ نشط', L2.alerts.some(a => a.k === 'move' && /حركة الطلبة 30% في «الأنشطة التطبيقية»/.test(a.text)), JSON.stringify(L2.alerts));
    const bare = { secs: mk(130, () => ({ m: 0.05, v: null, w: false, p: null })), sens: 'medium', ctx: [] };
    const L3 = E.live(bare, E.summarize(bare), { camera: true, ai: true, roi: false });
    check('live: تلميحا «المس العنصر الجاري» و«حدّد منطقة الصف»، والثقيل قبلهما', L3.alerts.map(a => a.k).join() === 'parts,roi' && L3.now === null && L3.part === null);
    const shake = { secs: mk(60, t => ({ m: t < 40 ? 0.05 : null, v: null, w: false })), sens: 'medium' };
    check('live: الكاميرا تتحرّك (إلّا كاميرا الهاتف: انقطاعها غير محسوبٍ لا اهتزاز)', E.live(shake, E.summarize(shake), {}).alerts.some(a => a.k === 'shake')
          && !E.live(shake, E.summarize(shake), { phone: true }).alerts.some(a => a.k === 'shake'));
    check('live: السلسلة تُحفظ رقماً لكلّ مقطع (٠–٩ و«-»)', E.pack([{ mv: 63 }, { mv: null }, { mv: 100 }], 'mv', 0.1) === '6-9' && E.pack([{ talk: 0.42 }], 'talk', 10) === '4');
    const UI = read('js/eye.js');
    check('wiring: الإعداد قبل الرصد (أربعة مصادر وإعداداتٌ مطويّة تُذكر)، ومساحة الرصد أثناءه وبعده', /id="eyeSetup"/.test(UI) && /<details id="eyeSettings"/.test(UI)
          && /\$\('eyeSetup'\)\.classList\.toggle\('hidden', S\.running \|\| pairing\)/.test(UI) && /\$\('eyeWork'\)\.classList\.toggle\('hidden', !\(S\.running \|\| S\.result\)\)/.test(UI)
          && ['eyeStartCam', 'eyeStartPhone', 'eyeFileBtn', 'eyeStartNoCam'].every(id => UI.includes("card('" + id + "'")));
    check('wiring: شريط الرصد اللاصق فيه الساعة والعنصر و«علامة» و«إيقاف»', /id="eyeLiveBar" class="hidden sticky/.test(UI) && /id="eyeLiveClock"/.test(UI) && /id="eyeMark"/.test(UI) && /id="eyeStop"/.test(UI));
    check('wiring: كلّ ثانيةٍ تُحسب المتابعة الحيّة وتُرسم (الرقم الكبير، الخطّ، العناصر، التنبيهات، المجرى)', /const L = S\.live = E\(\)\.live\(recNow\(\), M,/.test(UI)
          && /drawTimeline\(L\.series\.map\(liveItem\)\);\s*\n\s*renderMonitor\(L, M\);\s*\n\s*drawSpark\(\);/.test(UI));
    check('wiring: التنبيهات والتلميح نصٌّ مهروب', /\$\{esc\(a\.text\)\}/.test(UI) && /d\.textContent = t;/.test(UI));
    check('wiring: مجرى الحصة بعد الرصد من السلسلة المحفوظة (tm/tt)', /tm: packed\(LS, 'mv', 0\.1\), tt: packed\(LS, 'talk', 10\)/.test(UI) && /mv: dig\(data\.tm, i, 10\), talk: dig\(data\.tt, i, 0\.1\)/.test(UI));
    check('wiring: الوسوم تبويباتٌ بمجموعاتها', /class="eye-gtab/.test(UI) && /data-gpanel="\$\{i\}"/.test(UI));
    // بعد الرصد: اللوحة «ملخّص الرصد» بأرقام الحصة كلّها، ويبدأ الرصد التالي من لوحةٍ فارغة
    check('wiring: ملخّص الرصد بعد الإيقاف وعند فتح تقريرٍ محفوظ', /renderKpis\(Object\.assign\(\{ states: \[\] \}, M\), M\.seconds\);\s*\n\s*renderMonitorDone\(data\);/.test(UI)
          && /'ملخّص الرصد'/.test(UI) && /E\(\)\.partsDetail\(M, M\.rec\)/.test(UI.slice(UI.indexOf('function renderMonitorDone'))));
    check('wiring: الرصد الجديد يصفّر اللوحة', /renderFocus\(\);\s*\n\s*resetMonitor\(\);/.test(UI) && /renderKpis\(null\);\s*\n\s*resetMonitor\(\);/.test(UI));
    check('wiring: لوحة النقاط مخفيّةٌ بعد الإيقاف (لا نقاط لقطةٍ أخيرة فوق الشاشة الفارغة)', /\$\('eyeView'\)\.style\.visibility = S\.running \? '' : 'hidden';/.test(UI.slice(UI.indexOf('function layout'), UI.indexOf('function placeBar'))));
    check('wiring: شريط الرصد معتمٌ لا زجاج (القشرة تجعل bg-white شفّافاً)', /id="eyeLiveBar" class="(?![^"]*bg-white)[^"]*" style="[^"]*background-color:#fff/.test(UI));
}

/* ── ٢٢) دليل المعلّم (2026-10-27): الدليل ومهارة الحصة، والعيّنة بالنقاط الفنّيّة، والنقاط وأسئلة التقويم في الكلام ── */
{
    const LG = require('../js/lesson-guide.js'), SX = require('../js/eye-speech.js');
    const w = {}; new Function('window', read('js/lesson-guide-data.js'))(w); LG.setData(w.SVF_LESSON_GUIDE);
    const G = LG.byId('g8-football');
    const okData = G && G.grade === 8 && G.skills.every(sk => (sk.points || []).every(p => p.short && p.text && p.cues && p.cues.length))
        && G.assess.every(q => q.any.length && q.with.length) && G.drills.every(d => LG.FORM[d.form] && d.skills.every(k => LG.skillOf(G, k)));
    check('guide: بيانات كرة القدم للصف الثامن — لكلّ نقطةٍ ألفاظها، ولكلّ تدريبٍ تشكيله ومهاراتٌ موجودة', okData);
    const f = (cls, topic) => { const r = LG.find({ cls, topic }); return r ? r.guide.id + ':' + r.skills.join(',') + ':' + r.sure : null; };
    check('guide: من الصفّ وعنوان الدرس — المهارة تُعرف من العنوان، والموضوع وحده بلا مهارة',
          f('8/3', 'التصويب بوجه القدم الخارجي') === 'g8-football:shoot:true' && f('ثامن/2', 'لعبة كرة القدم') === 'g8-football::true'
          && f('8/1', 'ضرب الكرة بالرأس من الثبات') === 'g8-football:head:true' && f('8/1', 'المحاورة') === 'g8-football:dribbleSide,dribbleBack:true'
          && f('8', 'مباراة تطبيقية') === 'g8-football:play:true', [f('8/3', 'التصويب بوجه القدم الخارجي'), f('8/1', 'المحاورة')].join(' | '));
    check('guide: عنوانٌ فارغ ← اقتراحٌ لا تأكيد، وموضوعٌ آخر أو صفٌّ بلا دليل ← لا شيء (ألعاب القوى ليست كرة القدم)',
          f('8', '') === 'g8-football::false' && f('ثامن/9', '') === 'g8-football::false' && f('8', 'ألعاب القوى') === null && f('9/1', 'كتم الكرة بأسفل القدم') === null && f('', 'التصويب') === null);

    // العيّنة بالنقاط: القناع ← رمز الإتقان القديم، فيبقى sampleStats والبند ١ على حالهما
    check('guide: رمز الإتقان من النقاط — كلّها أتقن، ونصفها فأكثر جزئيّاً، وأقلّ لم يتقن، و-1 لم يُقيَّم',
          LG.codeOf(15, 4) === 3 && LG.codeOf(3, 4) === 2 && LG.codeOf(1, 4) === 1 && LG.codeOf(0, 4) === 1 && LG.codeOf(-1, 4) === 0 && LG.codeOf(3, 3) === 2 && LG.codeOf(1, 3) === 1);
    const sm = { n: 8, sk: 'shoot', a: '', b: '' };
    for (let i = 0; i < 6; i++) { LG.setPoint(sm, 'a', i, 0, true, 4); }
    for (let i = 0; i < 6; i++) { LG.setPoint(sm, 'b', i, 0, true, 4); LG.setPoint(sm, 'b', i, 1, i % 2 === 0, 4); if (i < 2) LG.setPoint(sm, 'b', i, 'all', true, 4); }
    LG.setPoint(sm, 'b', 7, 'none', true, 4); LG.clearPupil(sm, 'b', 7, 4);
    const SS = E.sampleStats(sm), PS = LG.pointStats(sm, G);
    check('guide: الأقنعة تكتب الرموز (a/b) فتُحسب العيّنة كما كانت', sm.b === '332121' && sm.a === '111111' && SS.final.rated === 6 && SS.final.ok === 2 && SS.final.part === 2 && SS.improved === 4, JSON.stringify([sm.a, sm.b, SS.final]));
    check('guide: لكلّ نقطةٍ من حقّقها في القراءة الأخيرة، وأضعفها، والتقدّم من الأولى',
          PS.finalRound === 'b' && PS.final.pts.map(p => p.ok).join() === '6,4,2,2' && PS.weakest.short === 'ميل الجذع والتوازن' && PS.gain[0].from === 100 && PS.gain[1].from === 0 && PS.gain[1].to === 67,
          JSON.stringify(PS.final.pts));
    check('guide: مهارةٌ معرفيّة (مراكز اللاعبين) أو بلا نقاط لا تصير استمارة ملاحظة', !LG.observable(LG.skillOf(G, 'positions')) && !LG.observable(LG.skillOf(G, 'play')) && LG.observable(LG.skillOf(G, 'head')));

    // الكلام: النقطة بألفاظها لا باسم المهارة، والسؤال بلفظه ومعه موضوعه
    const segs = [[10, 'اليوم بنتعلم التصويب بوجه القدم الخارجي'], [40, 'خل قدم الارتكاز جنب الكرة وخلفها'], [80, 'اثن الركبة وارجح رجلك للخلف'],
                  [120, 'أحسنت يا محمد، ركبتك ممتازة'], [200, 'من يشرح لي كيف نركل الكرة بوجه القدم؟'], [230, 'اشرح لي ليش تأخرت'], [260, 'ما الفرق بين المدافع والمهاجم؟']];
    const C = LG.speechCoverage(segs, G, ['shoot']);
    check('guide: النقاط في كلام المعلّم — «نتعلّم التصويب بوجه القدم الخارجي» اسم المهارة لا نقطة المتابعة',
          C.skills[0].points.map(p => p.n).join() === '1,2,0,0' && C.said === 2 && C.total === 4 && C.skills[0].points[0].ex[0] === 40, JSON.stringify(C.skills[0].points.map(p => p.n)));
    check('guide: أسئلة التقويم — «اشرح» وحدها لا تكفي، ومعها المهارة تكفي؛ والمقارنة بين المراكز', C.assess.map(q => q.n).join() === '1,1,0' && C.asked === 2, JSON.stringify(C.assess));
    LG.stripExamples(C);
    check('guide: حذف النصّ يُبقي الأعداد ويمحو الأمثلة', C.said === 2 && C.skills[0].points.every(p => p.ex === null) && C.assess.every(q => q.ex === null));

    // ما يُمرَّر إلى الاقتراح والمداولة
    const many = []; for (let i = 0; i < 40; i++) many.push([i * 18, i % 4 === 0 ? 'ثبت قدم الارتكاز جنب الكرة يا أحمد' : i % 4 === 1 ? 'ركز على ثني الركبة والمرجحة' : i % 4 === 2 ? 'أحسنت، مد القدم للمتابعة' : 'يلا الطابور الثاني ابدأ']);
    const Cm = LG.speechCoverage(many, G, ['shoot']);
    const d = { guide: { id: 'g8-football', skills: ['shoot'] }, sample: sm, M: { gspeech: Cm } };
    const GX = LG.guideCtx(d);
    check('guide: سياق الاقتراح — المهارة وأضعف نقطةٍ وأقواها، وما سُمع وما لم يُسمع، والكرة لكلّ طالبين، وتشكيلات تدريباتها',
          GX.skill === 'التصويب بوجه القدم الخارجي' && GX.weak.short === 'ميل الجذع والتوازن' && GX.weak.ok === 2 && GX.weak.rated === 6 && GX.best.short === 'قدم الارتكاز'
          && GX.cover.said === 3 && GX.cover.missing.join() === 'ميل الجذع والتوازن' && GX.assess.asked === 0 && GX.per === 2 && GX.forms.includes('pairs') && !GX.forms.includes('stations'),
          JSON.stringify(GX));
    check('guide: كلامٌ قليل (أقلّ من ١٥ جملة) لا يُحكم منه على ما لم يُذكر', !LG.guideCtx({ guide: d.guide, sample: null, M: { gspeech: LG.speechCoverage(segs, G, ['shoot']) } }).cover);

    // eye-core: البند ١ والبند ١٠ والمداولة بالدليل
    const sg1 = E.suggest({}, {}, { female: false, sample: sm, guide: GX }).find(x => x.id === 1);
    check('guide→suggest: البند ١ باسم المهارة وأضعف نقاطها', sg1 && /أتقن مهارة «التصويب بوجه القدم الخارجي» \(2\)/.test(sg1.evidence) && /وأضعف نقاطها الفنّيّة «ميل الجذع والتوازن» \(2 من 6\)\.$/.test(sg1.evidence), sg1 && sg1.evidence);
    const M10 = { speech: SX.analyze(many.map(([t, x]) => ({ t, x })), { seconds: 720 }), gspeech: Cm };
    const sg10 = E.suggest(M10, {}, { female: true, guide: LG.guideCtx({ guide: d.guide, M: M10 }) }).find(x => x.id === 10);
    check('guide→suggest: البند ١٠ من الكلام يذكر النقاط الفنّيّة المسموعة، بالجنس', sg10 && /وذكرت من النقاط الفنّيّة لمهارة الدرس \(3\) من \(4\)\.$/.test(sg10.evidence), sg10 && sg10.evidence);
    const Mp = { people: { detSecs: 400, classSize: 24, balls: 4, movingAll: 55, inside: 24 }, forms: { longLineSec: 90, maxLine: 10, count: 2, types: ['L', 'S'], segments: [{ type: 'L', dur: 90 }, { type: 'S', dur: 200 }] } };
    const dpG = E.debriefPrompts(Mp, {}, { female: false, sample: sm, guide: GX }), dp0 = E.debriefPrompts(Mp, {}, { female: false });
    check('guide→debrief: أضعف نقطةٍ في العيّنة ولم تُسمع في الكلام — سؤالٌ واحد لا اثنان', dpG.ask.some(t => /أقلّ النقاط الفنّيّة تحقّقاً في العيّنة: «ميل الجذع والتوازن» \(2 من 6\)، ولم تُسمع في كلامك/.test(t))
          && !dpG.ask.some(t => /لم تُسمع في كلامك نقطة/.test(t)) && dpG.good.some(t => /نقطة «قدم الارتكاز»/.test(t)), JSON.stringify(dpG.ask));
    check('guide→debrief: الكرات بما يقترحه الدليل (كرةٌ لكلّ طالبين)، والقاطرة بتشكيلات تدريباته', dpG.ask.some(t => /في دليل المعلّم بكرةٍ لكلّ طالبين، وكانت كرةٌ لكلّ \(6\) طلبة/.test(t))
          && dpG.ask.some(t => /وتدريبات المهارة في دليل المعلّم: .*ثنائيات/.test(t)) && dp0.ask.some(t => /^كانت كرةٌ لكلّ \(6\) طلبة/.test(t)) && !dp0.ask.some(t => /دليل/.test(t)));
    check('guide→debrief: لم يُسأل من أسئلة التقويم شيء ← سؤالٌ عنها', dpG.ask.some(t => /لم يُسمع سؤالٌ من أسئلة التقويم في الدليل \(شرح طريقة أداء المهارة…\)/.test(t)));
    const GXp = LG.guideCtx({ guide: { id: 'g8-football', skills: ['play'] }, M: {} });
    const dpP = E.debriefPrompts({ people: { detSecs: 400, classSize: 24, movingAll: 30, queuePct: 10 } }, {}, { female: false, guide: GXp });
    check('guide→debrief: مباراةٌ بحركةٍ قليلة ← تعديل القواعد لقدرات المرحلة من الدليل', dpP.ask.some(t => /تقليص عدد اللاعبين إلى \(7\) أو \(9\)/.test(t)), JSON.stringify(dpP.ask));

    // التوصيل
    const UI = read('js/eye.js'), RP = read('js/eye-report.js'), H = read('reports.html'), SW = read('sw.js');
    check('wiring: الدليل وبياناته قبل eye.js، ويُخزَّنان للعمل بلا شبكة', H.indexOf('js/lesson-guide-data.js') > 0 && H.indexOf('js/lesson-guide-data.js') < H.indexOf('js/lesson-guide.js')
          && H.indexOf('js/lesson-guide.js') < H.indexOf('<script src="js/eye.js">') && /lesson-guide-data\.js/.test(SW) && /lesson-guide\.js/.test(SW));
    check('wiring: الاقتراح والمداولة والملخّص يأخذون الدليل من بيانات الرصد (ctxOf)', /guide: d && d\.guide && LG\(\) \? LG\(\)\.guideCtx\(d\) : null/.test(UI));
    check('wiring: الإيقاف يحفظ الدليل ومهارته وما سُمع من نقاطها، والحذف يمحو أمثلتها',
          /if \(GD && sp\) keep\.gspeech = LG\(\)\.speechCoverage\(SX\(\) \? SX\(\)\.lessonSegs\(sp\.segs, rollS\) : sp\.segs, GD, S\.guide\.skills\);/.test(UI) && /LG\(\)\.stripExamples\(S\.result\.M\.gspeech\)/.test(UI));
    check('wiring: تغيير المهارة بعد الرصد يعيد العدّ من النصّ المحفوظ ثمّ الاقتراح، ولا يعدّ لمهارةٍ أخرى بعد حذف النصّ',
          /function guideChanged\(\) \{[\s\S]{0,900}d\.M\.gspeech = LG\(\)\.speechCoverage\(segs, G, S\.guide\.skills\);\s*\n\s*else if \(!same\) d\.M\.gspeech = null;[\s\S]{0,120}resuggest\(\);/.test(UI));
    check('wiring: العيّنة بالنقاط — اللمسة تختار الطالب، ولوحة نقاطه، وعيّنةٌ قُيّمت تقديراً عامّاً تبقى كما هي',
          /if \(sampleSkill\(\)\) \{ S\.samplePick = S\.samplePick === i \? -1 : i; renderSample\(\); return; \}/.test(UI) && /data-spt="\$\{k\}"/.test(UI) && /if \(hasSample\(sm\)\) return null;/.test(UI));
    check('wiring: المؤشّرات الحيّة (ذُكرت / العيّنة) والنتيجة «مطابقة دليل المعلّم» نصٌّ مهروب', /sp\.G = G \? LG\(\)\.speechCoverage\(SX\(\)\.lessonSegs\(sp\.segs, S\.rollSpans\), G, S\.guide\.skills\) : null;/.test(UI)
          && /مطابقة دليل المعلّم/.test(UI) && /«\$\{esc\(pt\.ex\[1\]\)\}»/.test(UI) && /\$\{esc\(p\.text\)\}/.test(UI));
    check('wiring: تأكيد اللمسة والطالب المختار بإطارٍ خارجيّ (outline) — ring لا يظهر على bg-white تحت قاعدة الزجاج', !/ring-2/.test(UI) && /el\.style\.outline = '2px solid ' \+ color/.test(UI) && /style="outline:2px solid #0f4c81;outline-offset:2px"/.test(UI));
    check('wiring: بطاقة المعلّم — نقاط المهارة في العيّنة وعدد ما سُمع منها (لا النصّ)', /LGm\.pointStats\(data\.sample, GG\)/.test(RP) && /M\.gspeech && M\.gspeech\.total/.test(RP) && !/ex\[1\]/.test(RP));
}

/* ── ٢٣) الحضور والزيّ (2026-10-27): بداية الحصة لا تُحسب شرحاً ولا انتظاراً ولا من حركة الطلبة ── */
{
    const SX = require('../js/eye-speech.js');
    const mk = () => [];
    const put = (arr, m, n, extra) => { for (let i = 0; i < n; i++) arr.push(Object.assign({ m, v: false, w: false }, extra && extra(i))); return arr; };
    // المعلّم يسجّل الحضور ثلاث دقائق (يتكلّم والطلبة واقفون) ثمّ الحصة نفسها كما في القسم ٣
    const roll = put(mk(), I, 180, i => ({ v: i % 3 !== 0 }));
    const M2 = E.summarize({ secs: roll.concat(lesson), grid: [], sens: 'medium' });
    check('roll: بداية الحصة قبل أوّل نشاط ← حضورٌ وزيّ تلقائيّاً', M2.admin && M2.admin.auto && Math.abs(M2.admin.sec - 180) <= 3 && M2.admin.spans[0][0] === 0, JSON.stringify(M2.admin));
    check('roll: لا يُحسب شرحاً — الشرح والانتظار والنشاط كما في الحصة بلاه', Math.abs(M2.explainSec - M.explainSec) <= 3 && M2.waits === M.waits && M2.longestIdle === M.longestIdle && M2.activePct === M.activePct,
          [M2.explainSec, M.explainSec, M2.waits, M2.activePct].join(' / '));
    check('roll: ولا يدخل زمن الرصد ولا نسبة الكلام، ويبقى زمن الحصة كلّه', Math.abs(M2.observed - M.observed) <= 3 && M2.seconds === 2580 && M2.lessonSec === M2.seconds - M2.admin.sec && M2.talkPct === M.talkPct, M2.observed + ' / ' + M2.talkPct);
    check('roll: الحالة والخطّ الزمنيّ «r» بلونه', M2.states.slice(0, 170).every(k => k === 'r') && M2.timeline[0].k === 'r' && M2.timeline[0].c === 'r' && M2.timeline[19].k === 'a');
    check('roll: الكلام فيه يُعدّ وحده', M2.admin.talkSec >= 115 && M2.admin.talkSec <= 121, M2.admin.talkSec);

    // تجمّعٌ قصيرٌ ثمّ الحضور: يبدأ من أوّل توقّف (في أوّل دقيقتين)
    const M3 = E.summarize({ secs: put(put(mk(), A, 30), I, 150, () => ({ v: true })).concat(lesson), grid: [] });
    check('roll: تجمّعٌ قبله لا يُحسب منه — من أوّل توقّفٍ حتّى أوّل نشاط', M3.admin && M3.admin.spans[0][0] >= 25 && M3.admin.spans[0][0] <= 40 && Math.abs(M3.explainSec - M.explainSec) <= 3, JSON.stringify(M3.admin));
    // بدايةٌ طويلةٌ جدّاً: عشر دقائق على الأكثر، والباقي كما كان
    const M4 = E.summarize({ secs: put(mk(), I, 900, () => ({ v: true })).concat(lesson), grid: [] });
    check('roll: التلقائيّ عشر دقائق على الأكثر', M4.admin.sec === E.ROLL_AUTO_MAX && M4.explainSec - M.explainSec >= 290 && M4.explainSec - M.explainSec <= 310, M4.admin.sec + ' / ' + M4.explainSec);
    // توقّفٌ يبدأ بعد دقيقتين (الحصة بدأت بنشاط) ← ليس حضوراً
    const M5 = E.summarize({ secs: put(put(mk(), A, 200), I, 200, () => ({ v: true })).concat(lesson), grid: [] });
    check('roll: الحصة بدأت بنشاط ← لا حضور تلقائيّ، والتوقّف بعدها شرحٌ كما كان', !M5.admin && M5.explainSec >= M.explainSec + 180, String(M5.explainSec));

    // بلمسة المشرف
    const RS1 = E.rollSpans([{ t: 0, k: 'roll' }, { t: 200, k: 'warm' }, { t: 900, k: 'roll' }, { t: 960, k: 'teach' }], Array(1200).fill('a'));
    check('roll: بلمسة «حضور وزيّ» حيث لُمس ولو تكرّر، لا تلقائيّ', !RS1.auto && JSON.stringify(RS1.spans) === '[[0,200],[900,960]]', JSON.stringify(RS1));
    const RS2 = E.rollSpans([{ t: 150, k: 'warm' }], Array(600).fill('x'));
    check('roll: لمسة «الإحماء» أوّلاً ← ما قبلها حضورٌ وزيّ (بلا كاميرا)', RS2.auto && JSON.stringify(RS2.spans) === '[[0,150]]', JSON.stringify(RS2));
    const stR = [...Array(10).fill('a'), ...Array(140).fill('i'), ...Array(450).fill('a')];
    check('roll: …ومع الكاميرا والطلبة واقفون أغلبه ← من البداية حتّى اللمسة', JSON.stringify(E.rollSpans([{ t: 150, k: 'warm' }], stR).spans) === '[[0,150]]');
    check('roll: لمسة «الإحماء» متأخّرة والكاميرا ترى نشاطاً أغلبه ← ليس حضوراً', E.rollSpans([{ t: 150, k: 'warm' }], Array(600).fill('a')).spans.length === 0);
    check('roll: لمسة «الإحماء» في أوّل ثوانٍ ← لا شيء', E.rollSpans([{ t: 8, k: 'warm' }], Array(600).fill('i')).spans.length === 0);
    const st6 = [...Array(300).fill('i'), ...Array(300).fill('a')];
    check('roll: أوّل لمسةٍ «الأنشطة التعليمية» تقطع التلقائيّ عندها', JSON.stringify(E.rollSpans([{ t: 120, k: 'teach' }], st6).spans) === '[[0,120]]'
          && E.rollSpans([{ t: 10, k: 'teach' }], st6).spans.length === 0);
    check('roll: بلا كاميرا ولا لمسة ← لا شيء', E.rollSpans([], Array(600).fill('x')).spans.length === 0);
    check('roll: ليس عنصراً — PART يعرفه، والعناصر خمسة، ولا زمن موصى به له', E.PART.roll === E.ROLL && E.PARTS.length === 5 && E.ROLL.min == null && !E.ACTIVE_PARTS.includes('roll'));

    // عناصر الحصة لا تتغيّر به: الإحماء بعد الحضور
    const cx = [{ t: 0, k: 'roll' }, { t: 180, k: 'warm' }, { t: 480, k: 'fit' }, { t: 900, k: 'teach' }, { t: 1600, k: 'apply' }, { t: 2300, k: 'close' }];
    const M6 = E.summarize({ secs: roll.concat(lesson), grid: [], ctx: cx });
    const det6 = E.partsDetail(M6, null);
    check('roll: عناصر الحصة خمسةٌ بلاه، وزمنها من بعده', det6.length === 5 && det6[0].k === 'warm' && det6[0].sec === 300 && !M6.admin.auto && M6.admin.sec === 180 && M6.ctx.covered === M6.seconds - 180,
          JSON.stringify(det6.map(r => r.k + r.sec)));
    check('roll: لا شرح منسوبٌ إلى «الإحماء» من الحضور', det6[0].explainSec === 0 && E.suggest(M6, {}, {}).some(s => s.id === 6));

    // الطلبة: طابور الحضور ليس قاطرة، وحركتهم تُقاس من الحصة، وعددهم الأكبر يُؤخذ منه
    const pRoll = { n: 24, mv: 0, o: 0, q: 0, r: 0, ln: 24, fm: 'L', d: 3 }, pLes = { n: 20, mv: 14, o: 0, q: 2, r: 0, ln: 3, fm: 'S', d: 1 };
    const secsP = put(mk(), I, 180, () => ({ v: true, p: pRoll })).concat(lesson.map(s => Object.assign({}, s, { p: pLes })));
    const MP = E.summarize({ secs: secsP, grid: [] });
    check('roll: طابور الحضور لا يُعدّ قاطرةً طويلة', MP.forms && MP.forms.longLineSec === 0 && MP.forms.maxLine === 3, JSON.stringify(MP.forms && { l: MP.forms.longLineSec, m: MP.forms.maxLine }));
    check('roll: حركة الطلبة من الحصة وحدها، والعدد الأكبر من الحضور', MP.people.movingAll === 70 && MP.people.classSize === 24 && Math.abs(MP.people.detSecs - lesson.length) <= 3, JSON.stringify({ mv: MP.people.movingAll, c: MP.people.classSize }));
    check('roll: الحصة دقيقةً دقيقة بلا دقائق الحضور', MP.mins[0][0] === null && MP.mins[0][1] === null && MP.mins[3][0] === 70, JSON.stringify(MP.mins.slice(0, 4)));

    // الكلام: ما قيل في الحضور لا يُحلَّل (إلّا ما يحتاج مراجعة)
    const segs = [{ t: 20, x: 'ليش ما لابس الزي اليوم' }, { t: 40, x: 'اسمعوا قفوا في الطابور' }, { t: 60, x: 'اسكت' }, { t: 300, x: 'أحسنت ارفع الركبة' }, { t: 320, x: 'ليش نثني الركبة' }];
    const A0 = SX.analyze(segs, { seconds: 1200 }), A1 = SX.analyze(segs, { seconds: 1200, admin: [[0, 180]] });
    check('roll→speech: أسئلة الزيّ وتعليمات الطابور لا تُحسب أسئلةً ولا تنظيماً', A0.q.n === 2 && A1.q.n === 1 && A1.q.hi === 1 && A1.org.n === 0 && A0.org.n >= 1 && A1.praise.n === 1, JSON.stringify({ q0: A0.q.n, q1: A1.q.n, o: A1.org.n }));
    check('roll→speech: تُعدّ وحدها، و«ما يحتاج مراجعة» يبقى للمشرف أينما قيل، وزمن الحصة بلاها', A1.admin.clauses === 3 && A1.harsh.n === 1 && A1.clauses === 2 && A1.lesson === 1020, JSON.stringify(A1.admin) + ' ' + A1.lesson);
    check('roll→speech: lessonSegs بالصيغتين', SX.lessonSegs(segs, [[0, 180]]).length === 2 && SX.lessonSegs([[30, 'أ'], [200, 'ب']], [[0, 180]]).length === 1 && SX.lessonSegs(segs, []).length === 5);

    // المتابعة الحيّة
    const recR = { secs: put(mk(), I, 400, () => ({ v: true, p: pRoll })), grid: [], sens: 'medium' };
    const LR = E.live(recR, E.summarize(recR), {});
    const ak = LR.alerts.map(a => a.k);
    check('roll→live: الحالة «الحضور والزيّ» لا «انتظار»، ولا تنبيه انتظارٍ ولا قاطرة', LR.state === 'r' && LR.roll.now && LR.roll.auto && !ak.includes('idle') && !ak.includes('line'), JSON.stringify(LR.alerts));
    check('roll→live: تلميحٌ بأنّها تلقائيّة، وتنبيهٌ حين تطول (٥ دقائق)', ak.includes('rollAuto') && ak.includes('roll') && !ak.includes('parts'), ak.join());
    check('roll→live: المقاطع «r» بعنصرها، ولا حركة طلبةٍ فيها', LR.series[0].k === 'r' && LR.series[0].c === 'roll' && LR.series[5].mv === null && LR.now === null && LR.parts.length === 5);
    const recE = { secs: put(mk(), I, 400, () => ({ v: true })), grid: [], sens: 'medium', ctx: [{ t: 0, k: 'roll' }] };
    const LE = E.live(recE, E.summarize(recE), {});
    const recN = { secs: put(mk(), null, 60), grid: [], sens: 'medium' };
    const LN = E.live(recN, E.summarize(recN), { camera: false });
    check('roll→live: بلا كاميرا ولا لمسة في أوّل الحصة ← تلميح «حضور وزيّ»', LN.alerts.some(a => a.k === 'rollTouch') && !E.live(recN, E.summarize(recN), { camera: true }).alerts.some(a => a.k === 'rollTouch'));
    check('roll→live: بلمسته — العنصر الجاري «roll» بلا زمنٍ موصى به ولا تلميح', LE.part === 'roll' && !LE.roll.auto && !LE.alerts.some(a => a.k === 'over' || a.k === 'rollAuto' || a.k === 'parts' || a.k === 'idle'), JSON.stringify(LE.alerts));

    // الاقتراح والمداولة والملخّص والأنماط
    const s7 = E.suggest(M2, {}, {}).find(s => s.id === 7);
    check('roll→suggest: البند ٧ يذكر ما استُثني', s7 && /بعد استثناء \(3\) دقائق لتسجيل الحضور والزيّ/.test(s7.evidence), s7 && s7.evidence);
    const s7b = E.suggest(M, {}, {}).find(s => s.id === 7);
    check('roll→suggest: بلا حضورٍ لا ذكر له', !/الحضور/.test(s7b.evidence));
    const MLong = Object.assign({}, M, { admin: { sec: 420, auto: false, spans: [[0, 420]] } }), MQuick = Object.assign({}, M, { admin: { sec: 90, auto: true, spans: [[0, 90]] } });
    const dpL = E.debriefPrompts(MLong, {}, { female: true }), dpQ = E.debriefPrompts(MQuick, {}, { female: false });
    check('roll→debrief: حين يطول يُسأل عنه بصيغة المخاطَبة، وحين يقصر يُعزَّز', dpL.ask.some(t => /استغرق تسجيل الحضور والزيّ \(7\) دقائق من أوّل الحصة\. كيف تختصرينه/.test(t))
          && dpQ.good.some(t => /^أنجزت تسجيل الحضور والزيّ في دقيقتين فبدأ النشاط سريعاً\.$/.test(t)) && !dpQ.ask.some(t => /الحضور/.test(t)), JSON.stringify([dpL.ask, dpQ.good]));
    check('roll→summary: يُذكر في الملاحظات حين يطول وحده', /واستغرق تسجيل الحضور والزيّ \(7\) دقائق/.test(E.summaryText(MLong, {})) && !/الحضور/.test(E.summaryText(MQuick, {})));
    check('roll→summary: بلا كاميرا لا يبدأ الملخّص بواو العطف', E.summaryText({ seconds: 600, ctx: { covered: 5 }, whistles: 3, admin: { sec: 400 } }, {}) === 'رُصدت الحصة بعين المشرف (10) دقائق: استغرق تسجيل الحضور والزيّ (7) دقائق، واستُعملت الصفّارة (3) مرّات.'
          && /: استُعملت الصفّارة/.test(E.summaryText({ seconds: 600, ctx: { covered: 5 }, whistles: 2 }, {})));
    check('roll→patterns: «تسجيل الحضور والزيّ يطول» نمطٌ بموضوعٍ تدريبيّ', E.ISSUES.some(x => x.k === 'longRoll' && x.test({ M: MLong }) && !x.test({ M: MQuick }) && !x.test({ M })));
    const M90 = Object.assign({}, M, { admin: { sec: 100, auto: true, spans: [[0, 100]] } });
    check('roll→suggest: المثنّى بعد «استثناء» بالياء', /بعد استثناء دقيقتين لتسجيل الحضور والزيّ/.test(E.suggest(M90, {}, {}).find(s => s.id === 7).evidence));
    check('roll: تقريرٌ محفوظٌ قبله (بلا admin) يُقرأ كما كان', E.lessonSecOf({ seconds: 600 }) === 600 && E.lessonSecOf(M2) === M2.seconds - M2.admin.sec);

    // التوصيل
    const UI = read('js/eye.js'), RP = read('js/eye-report.js');
    check('wiring: زرّ «حضور وزيّ» أوّل عناصر الحصة بلونه، وشرحه تحتها', /\$\{\[E\(\)\.ROLL\]\.concat\(E\(\)\.PARTS\)\.map\(c =>/.test(UI) && /grid grid-cols-3 sm:grid-cols-6 gap-1\.5/.test(UI) && /r: '#8492a6'/.test(UI) && /«حضور وزيّ» لتسجيل الغياب والزيّ/.test(UI));
    check('wiring: الكلام حيّاً وعند الإيقاف بلا الحضور والزيّ، وثوانيه تُتابَع حيّاً',
          /analyze\(sp\.segs, \{ topic: info\(\)\.topic, ctx: S\.ctxEvents, seconds: Math\.max\(0, now\(\) - \(S\.spOff \|\| 0\)\), admin: S\.rollSpans \}\)/.test(UI)
          && /analyze\(sp\.segs, \{ topic: info\(\)\.topic, ctx: S\.ctxEvents, seconds: Math\.max\(0, M\.seconds - \(S\.spOff \|\| 0\)\), admin: rollS \}\)/.test(UI)
          && /if \(sig !== S\.rollSig\) \{ S\.rollSig = sig; S\.rollSpans = rs; if \(S\.sp\) S\.sp\.dirty = true; \}/.test(UI)
          && /SX\(\)\.lessonSegs\(segs0, d\.M\.admin && d\.M\.admin\.spans\)/.test(UI));
    check('wiring: الحالة الحيّة واللوحة ومجرى الحصة والنتيجة تعرفه', /L\.state === 'r' \? \['الحضور والزيّ '/.test(UI) && /function rollLine\(sec, cur, auto\)/.test(UI)
          && /it\.k === 'r' \? CTX_COLOR\.r/.test(UI) && /b\.k === 'r' \? E\(\)\.ROLL\.label/.test(UI) && /const rollRow = AD \?/.test(UI) && /بلا الحضور والزيّ/.test(UI));
    check('wiring: اسم العنصر الجاري من PART (يعرف «roll») لا من العناصر الخمسة وحدها', !/CONTEXTS\.find/.test(UI) && /E\(\)\.PART\[S\.ctxCur\] \? E\(\)\.PART\[S\.ctxCur\]\.label/.test(UI));
    check('wiring: بطاقة المعلّم — سطر الحضور والزيّ ولونه في مجرى الحصة', /r: '#8492a6'/.test(RP) && /الحضور والزيّ في أوّل الحصة: /.test(RP) && /k === 'r' \? PART_COLOR\.r/.test(RP));
}

/* ── ٢٤) اللهجة العُمانيّة في فهم الكلام (2026-10-27) ── */
{
    const SX = require('../js/eye-speech.js');
    const f = x => SX.fix(SX.norm(x));
    check('dialect: سلسلة اللغات تبدأ بالعُمانيّة وتنتهي بالعامّة', SX.LANGS[0] === 'ar-OM' && SX.LANGS[SX.LANGS.length - 1] === 'ar' && SX.LANGS.length >= 3);
    check('dialect: «جدام/وجفوا/قطارات/ريولك» تُصحَّح للتحليل', f('وجفوا جدام الخط') === 'وقفوا قدام الخط' && f('سووا قطارات') === 'سووا قاطرات' && f('ارفع ريولك') === 'ارفع رجليك', f('وجفوا جدام الخط'));
    check('dialect: بحرف عطفٍ أو جرٍّ أو «ال» قبلها', f('والقطارات') === 'والقاطرات' && f('بجدام') === 'بقدام');
    check('dialect: «لعبة القطار» لا تُمسّ، وكلمةٌ تحتوي الخطأ لا تُمسّ', f('لعبة القطار') === 'لعبه القطار' && f('جدامهم') === 'جدامهم');
    const A = SX.analyze([{ t: 5, x: 'يلا قطارات ثلاث' }, { t: 40, x: 'ارفع ريولك فوق' }, { t: 60, x: 'عشتوا يا شباب' }, { t: 70, x: 'تحركوا' }], { seconds: 120 });
    check('dialect: التصحيح يدخل التحليل (تصحيحٌ بالجسم، تنظيم، تعزيز)', A.corr.n === 1 && A.corr.spec === 1 && A.praise.n === 1 && A.org.n === 2, JSON.stringify({ c: A.corr, p: A.praise.n, o: A.org.n }));
    check('dialect: والنصّ المحفوظ كما سُمع', A.corr.ex[0][1] === 'ارفع ريولك فوق' && A.formsEx[0][1] === 'يلا قطارات ثلاث');
    check('forms: التشكيلات التي طلبها بصوته تُعدّ', JSON.stringify(SX.analyze([{ t: 1, x: 'كل اثنين مع بعض' }, { t: 9, x: 'دائرة كبيرة' }, { t: 20, x: 'مربع ناقص طلع' }], { seconds: 60 }).forms) === '{"P":1,"C":1,"U":1}');
    check('forms: الأمثلة تُحذف مع «حذف النصّ»', SX.stripExamples(A).formsEx.length === 0 && SX.stripExamples(A).forms.L === 1);
    check('pickAlt: يُقدَّم بديلٌ أوفق لألفاظ الملعب', SX.pickAlt([{ transcript: 'كل وحده فيكم', confidence: 0.8 }, { transcript: 'كفو عليك', confidence: 0.5 }], '') === 'كفو عليك');
    check('pickAlt: والتساوي للأعلى ثقة، وبديلٌ واحدٌ يُعاد كما هو', SX.pickAlt(['احسنت', 'ممتاز'], '') === 'احسنت' && SX.pickAlt([{ transcript: ' تمام ' }], '') === 'تمام' && SX.pickAlt([], '') === '');
    check('pickAlt: مصطلح الدرس يرجّح', SX.pickAlt(['دفع الجملة', 'دفع الجلة'], 'دفع الجلة بطريقة الزحف') === 'دفع الجلة');
    const c = x => SX.cues(x).part;
    check('cues: إعلان العنصر من كلام المعلّم', c('يلا نبدأ الإحماء') === 'warm' && c('الحين النشاط التطبيقي') === 'apply' && c('بنختم الحين') === 'close' && c('خلونا نحضر الغياب') === 'roll');
    check('cues: الأخير في العبارة هو الجديد', c('خلصنا الإحماء، الحين الإعداد البدني') === 'fit' && c('بعد التطبيق نسوي التهدئة') === 'close');
    check('cues: كلامٌ عاديّ لا يُعلن عنصراً', c('ارفع ركبتك فوق') === null && c('احسنت يا بطل') === null);

    const UI = read('js/eye.js');
    check('wiring: خمسة بدائل وأنسبها، وسلسلة اللغات من الوحدة', /rec\.maxAlternatives = 5/.test(UI) && /SX\(\)\.pickAlt\(alts, info\(\)\.topic\)/.test(UI)
          && /const LANGS = \(\) => \(SX\(\) && SX\(\)\.LANGS\)/.test(UI) && /sp\.li < LANGS\(\)\.length - 1/.test(UI));
    check('wiring: إعلان العنصر اقتراحٌ يُلمس ويُسجَّل من لحظة قوله', /function speechCue\(x\)/.test(UI) && /setCtx\(c\.k, c\.t\)/.test(UI) && /function setCtx\(k, at\)/.test(UI)
          && /Math\.max\(lastT, Math\.min\(Math\.round\(now\(\)\), Math\.round\(at\)\)\)/.test(UI));
    check('wiring: تنبيه التقاطٍ متوقّف وإعادةٌ لا تكرّر نفسها', /يُسمع كلامٌ ولا يصل نصٌّ منذ/.test(UI) && /function restartSpeech\(\)/.test(UI)
          && /sp\.rec !== rec\) return;/.test(UI) && /\(sp\.err && !sp\.on\) \|\| quiet/.test(UI));
    check('wiring: لا AudioContext ولا getUserMedia ثانٍ في وحدة الكلام', !/AudioContext|getUserMedia|navigator|window\./.test(read('js/eye-speech.js')));
}

/* ── ٢٥) الكاميرا: حارس الحجب، الحركة في المكان، حافّة الصورة (2026-10-27) ── */
{
    // المعلّم يُحجب خلف طالبٍ أقصر منه: الطالب الظاهر قربه لا يُتبنّى، ومن يطابق طوله يُتبنّى
    const R = E.newTracker();
    const kids = [0.3, 0.4, 0.5, 0.6, 0.7].map(x => person(x, 0.5));
    const tall = (x, y) => person(x, y, { h: H * 1.3, y: y - H * 0.3 });
    for (let k = 0; k <= 2; k++) E.trackStep(R, kids.concat([tall(0.92, 0.5)]), k * 0.5, 16 / 9);
    const tid = E.pickNearest(E.peopleSnapshot(R, 1, null), 0.95, 0.5 + H);
    let tch = E.teacherStep(R, { id: tid }, 1);
    const lost = 1 + E.TRACK_TTL;
    E.trackStep(R, kids, lost, 16 / 9);
    E.trackStep(R, kids.concat([person(0.93, 0.5)]), lost + 0.5, 16 / 9);          // طالبٌ بطوله العاديّ قرب موضع المعلّم
    const t1 = E.teacherStep(R, tch, lost + 0.5);
    check('occlusion: طالبٌ أقصر قرب موضع المعلّم لا يُتبنّى معلّماً', tid != null && t1.id === tid, JSON.stringify({ tid, t1 }));
    E.trackStep(R, kids.concat([person(0.93, 0.5), tall(0.9, 0.5)]), lost + 1, 16 / 9);   // ثمّ عاد المعلّم بطوله
    const t2 = E.teacherStep(R, t1, lost + 1);
    check('occlusion: ومن يطابق طوله يُتبنّى', t2.id !== tid && t2.id > tid && Math.abs(t2.h / t1.h - 1) < 0.05, JSON.stringify(t2));
    check('occlusion: حدّا الطول ثابتان مُصدَّران', E.TEACHER_H[0] < 1 && E.TEACHER_H[1] > 1);

    // يتحرّك في مكانه (تغيّر صندوقه دون انتقال) ← pl، والمنتقل لا
    const P = E.newTracker();
    for (let k = 0; k <= 4; k++) E.trackStep(P, [person(0.3, 0.5, { act: 0.3 }), person(0.4 + 0.05 * k, 0.5), person(0.7, 0.5)], k * 0.5, 16 / 9);
    const sp = E.peopleSnapshot(P, 2, null).dots.sort((a, b) => a.x - b.x);
    check('in-place: المتمرّن في مكانه pl، والمنتقل mv بلا pl، والساكن لا هذا ولا ذاك', sp[0].mv && sp[0].pl && sp[1].mv && !sp[1].pl && !sp[2].mv && !sp[2].pl, JSON.stringify(sp));

    // حافّة الصورة
    const G = E.newTracker();
    E.trackStep(G, [person(-0.02, 0.5), person(0.985, 0.5), person(0.5, 0.5)], 0, 16 / 9);
    const se = E.peopleSnapshot(G, 0, null);
    check('edge: من يقع مركزه في ٣٪ من حافّتي الصورة يُعدّ', se.e === 2, se.e);
    const roi = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.95], [0.2, 0.95]];
    check('edge: ومن هو خارج المنطقة المحدَّدة لا يُعدّ', E.peopleSnapshot(G, 0, roi).e === 0);
    const mk = e => ({ m: 0.02, p: { n: 6, mv: 3, o: 0, q: 0, r: false, e } });
    const recE = { secs: Array.from({ length: 40 }, (_, i) => mk(i >= 15 ? 3 : 0)), sens: 'medium', ctx: [] };
    const LE = E.live(recE, E.summarize(recE), { phone: true });
    const recN = { secs: Array.from({ length: 40 }, (_, i) => mk(i % 3 ? 0 : 2)), sens: 'medium', ctx: [] };
    const LN = E.live(recN, E.summarize(recN), {});
    check('edge→live: أغلب آخر نصف دقيقة على الحافّة ← تنبيهٌ يذكر الزرّ في الهاتف', LE.edge && LE.alerts.some(a => a.k === 'edge' && /أوسع زاوية/.test(a.text)), JSON.stringify(LE.alerts));
    check('edge→live: لقطاتٌ متفرّقة لا تُنبّه', !LN.edge && !LN.alerts.some(a => a.k === 'edge'));

    const UI = read('js/eye.js');
    check('wiring: الحافّة تُحفظ لكلّ ثانية، ولون المتمرّن في مكانه ومفتاح النقاط', /cr: p\.cr, b: p\.b, e: p\.e/.test(UI) && /d\.pl \? DOT\.place/.test(UI) && /id="eyeDotKey"/.test(UI));
    check('wiring: «أوسع زاوية» بالرسائل القائمة (عدسة ثمّ تقريب) — لا تبديل آليّ', /function wideStep\(\)/.test(UI) && /if \(w\.lens\) phoneLens\(w\.lens\); else \{ phoneZoom\(w\.zoom\)/.test(UI)
          && !/auto-wide/.test(UI + read('cam.html')));
    const RP = read('js/eye-report.js');
    check('card: نافذة الطباعة بشريطٍ علويٍّ ورجوعٍ وEsc، ويختفي في الطباعة', /id="back"/.test(RP) && /window\.close\(\)/.test(RP) && /e\.key==="Escape"/.test(RP) && /@media print\{#bar\{display:none!important\}/.test(RP));
}

/* ── ٢٦) الاستمارة المصغّرة في «التقييم المقترح» (2026-10-27) ── */
{
    const UI = read('js/eye.js');
    check('mini-form: البنود الثلاثة عشر — المقترحة ثمّ «البنود الأخرى — قيّمها من هنا»', /const others = un\.map\(u =>/.test(UI) && /البنود الأخرى — قيّمها من هنا/.test(UI));
    check('mini-form: مستوياتٌ خمسة بألوان الاستمارة، والمقترح بنقطةٍ ذهبيّة', /function levelPicker\(id, chosen, sug, cur\)/.test(UI) && /RATING\(\)\[n\]/.test(UI) && /title="المقترح"/.test(UI));
    check('mini-form: البند الآخر لا يُحدَّد حتّى يُغيَّر مستواه عن النموذج', /data-score="\$\{curScore \|\| ''\}" aria-label="تطبيق البند/.test(UI) && /cb\.checked = n !== Number\(lv\.dataset\.cur\)/.test(UI));
    check('mini-form: التطبيق بأزرار النموذج نفسها ولدرجةٍ صالحةٍ وحدها', /filter\(p => p\.score >= 1 && p\.score <= 5\)/.test(UI) && /'#item-' \+ p\.id \+ ' \.rating-btn\[data-score="' \+ p\.score \+ '"\]'/.test(UI));
    check('mini-form: لا يُكتب الشاهد في وصف البند الرسميّ، ولا أرشيفٌ موازٍ', !/notes-' \+ p\.id/.test(UI) && !/svf_visits_archive|indexedDB\.open\('sv_db'/.test(UI));
    check('mini-form: المستمعان مرّةً واحدة على الحاوية', /if \(!box\.dataset\.lvBound\)/.test(UI));
}

/* ── ٢٧) الحماية من الانقطاع (2026-10-28) ── */
{
    const UI = read('js/eye.js');
    check('resume: نسخةٌ احتياطيّةٌ كلّ عشر ثوانٍ وعند إخفاء الصفحة — بلا مقطعٍ مصوَّر', /if \(S\.lastSec - S\.lastCk >= 10\) ckSave\(\);/.test(UI)
          && /visibilityState === 'hidden'\) ckSave\(\)/.test(UI) && /addEventListener\('pagehide', ckSave\)/.test(UI) && /if \(!S\.running \|\| S\.src === 'file'\) return;/.test(UI));
    check('resume: النسخة أرقامٌ ولمساتٌ ونصّ — لا صورة ولا صوت', /const ck = \{[\s\S]{0,900}sp: sp \? \{ mode: sp\.mode, lang: sp\.lang, segs: sp\.segs \} : null/.test(UI)
          && !/const ck = \{[\s\S]{0,900}(video|canvas|stream|ImageData)/.test(UI));
    check('resume: المدّة الضائعة ثوانٍ «غير محسوبة» وحدّها نصف ساعة، والساعة تكمل', /for \(let i = 0; i < gap; i\+\+\) S\.secs\.push\(\{ m: null, v: null, w: false, p: null \}\)/.test(UI)
          && /const CK_MAX_GAP = 1800;/.test(UI) && /S\.t0 = performance\.now\(\) - S\.lastSec \* 1000;/.test(UI));
    check('resume: «أكمل» بالمصدر نفسه، و«حلّل ما رُصد» بلا تشغيل، وبدءٌ جديدٌ يستأذن في حذفه', /if \(ck\.via === 'phone'\) startPhone\(\);\s*else if \(ck\.src === 'camera'\) startCamera\(\);\s*else startNoCam\(\);/.test(UI)
          && /restoreState\(ck, 0, false\);\s*ckClear\(\);\s*finish\(\);/.test(UI) && /بدء رصدٍ جديدٍ يحذفه/.test(UI));
    check('resume: نصّ الكلام قبل الانقطاع يبقى، وإذن المعلّم لا يُعاد سؤاله', /segs: seed \? seed\.segs\.slice\(\) : \[\]/.test(UI) && /if \(S\.resume && S\.resume\.speechConsent\)/.test(UI)
          && /S\.sp && S\.sp\.segs\.length \? S\.sp : S\.spSeed && S\.spSeed\.segs\.length \? S\.spSeed : null/.test(UI));
    check('resume: النتيجة احتياطٌ حتّى يُحفظ التقرير', /lastSave\(data\);/.test(UI) && /root\.svfEyeBeforeSave = function \(\) \{\s*lastClear\(\);/.test(UI));
    check('camera: كاميرا الجهاز المتوقّفة ثوانٍ غير محسوبة وزرّ إعادةٍ يكمل الرصد نفسه', /t\.readyState === 'ended' \|\| t\.muted/.test(UI) && /async function restartCamera\(\)/.test(UI)
          && /if \(S\.via === 'phone' \|\| S\.src === 'camera'\) phoneTick\(v\);/.test(UI) && /begin\('camera', v\);[\s\S]{0,120}watchFrames\(v\);/.test(UI));
    check('audio: الصوت المعلَّق (مكالمة) غير مقيسٍ لا صمت، ويُستأنف', /S\.audio\.ctx\.state === 'running' \? false : null/.test(UI) && /S\.audio\.ctx\.state !== 'running'\)\) return;/.test(UI)
          && /state === 'suspended'\) S\.audio\.ctx\.resume\(\)/.test(UI));
    check('speech: ثواني انقطاع الإنترنت خارج معدّلات الكلام وتُذكر', /navigator\.onLine === false \|\| Date\.now\(\) - \(S\.sp\.netAt \|\| 0\) < 5000\)\) S\.spOff\+\+/.test(UI)
          && /off: S\.spOff \|\| 0/.test(UI) && /انقطع فهم الكلام/.test(UI));
    // المحرّك: الثواني «غير المحسوبة» لا تدخل زمن الرصد ولا الانتظار
    const mk = (m, k) => Array.from({ length: k }, () => ({ m, v: null, w: false, p: null }));
    const rec = { secs: mk(0.06, 300).concat(mk(null, 600), mk(0.06, 300)), sens: 'medium', ctx: [] };
    const M = E.summarize(rec);
    check('engine: عشر دقائق ضائعة وسط الحصة ← لا انتظار ولا رصد', M.observed === 600 && M.excludedSec >= 600 && !(M.longestIdle >= 60), JSON.stringify({ o: M.observed, ex: M.excludedSec, li: M.longestIdle }));
    const L = E.live({ secs: mk(null, 40), sens: 'medium', ctx: [] }, E.summarize({ secs: mk(null, 40), sens: 'medium', ctx: [] }), { frozen: true });
    check('engine: الكاميرا المتوقّفة لا تُنبّه «الكاميرا تتحرّك»', !L.alerts.some(a => a.k === 'shake'));
}

/* ── ٢٨) مساعد الأدلّة: سجلٌّ بوقته تحت كلّ بند، وعبارة دليلٍ للتقرير من واقع الحصة (2026-10-28) ── */
{
    const L = E.evidenceLog({
        ev: [{ t: 120, k: 'fbInd' }, { t: 500, k: 'groups' }, { t: 700, k: 'fbMiss' }], counts: { dish: 2 },
        M: { observed: 1500, longestIdle: 130, longestIdleAt: 600, waits: 2, activePct: 62, explainPct: 10 },
        sample: { n: 6, a: '111222', b: '333322' }, marks: [{ t: 900, note: 'لم يصحّح وضع القدم', item: 1 }, { t: 950, note: 'بلا بند' }],
        follow: [{ verdict: 'met' }, { verdict: 'same' }]
    });
    check('log: كلّ دليلٍ تحت بنده بوقته، والمرتّب بالوقت وما لا وقت له آخراً', L[10][0].t === 120 && L[10][1].t === 700 && L[8][0].t === 500 && L[1][L[1].length - 1].t === 900 && L[1][0].t === 900 || (L[1].some(e => e.src === 'mark' && e.t === 900) && L[1].findIndex(e => e.t == null) > L[1].findIndex(e => e.t === 900)), JSON.stringify(L[1]));
    check('log: الانتظار بعبارةٍ للتقرير بالمدّة منصوبة، والزيّ في البندين ٤ و٥ بعدده', L[7].some(e => e.t === 600 && e.neg === 'انتظار الطلبة بين نشاطين دون ممارسة مدة بلغت دقيقتين')
          && L[4].some(e => e.neg === 'مشاركة (2) من الطلبة بغير الزي الرياضي') && L[5].length === 1);
    check('log: العيّنة (١ و٢) وأهداف الزيارة السابقة (١١) بأرقامها', L[1].some(e => /^إتقان \(83%\)/.test(e.pos || '')) && L[2].some(e => /\(4\) من \(6\)/.test(e.pos || '')) && L[11].some(e => /\(1\) من أهدافها/.test(e.pos || '')));
    check('log: علامة المشرف المنسوبة إلى بندٍ دليلٌ بلا عبارة تقرير، وغير المنسوبة لا تُعرض', L[1].some(e => e.src === 'mark' && e.text === 'لم يصحّح وضع القدم' && !e.pos && !e.neg) && !Object.values(L).some(a => a.some(e => e.text === 'بلا بند')));
    check('officialFor: المستويات ١–٣ موجبةٌ و٤–٥ سالبة، واثنتان على الأكثر', E.officialFor(L, 10, 2).join() === 'تقديم تغذية راجعة فردية فورية لتصحيح الأداء'
          && E.officialFor(L, 10, 4).join() === 'تكرار أخطاء في الأداء دون تصحيح' && E.officialFor(L, 13, 1).length === 0 && E.officialFor(L, 7, 4, true).length >= 1);
    // العبارات للتقرير: بلا تشكيل ولا ذكرٍ للمعلّم (تصريف الجنس في الاستمارة)، ولا علامات HTML
    const phr = [];
    Object.values(E.EV_TAG).forEach(r => phr.push(r.pos || r.neg));
    Object.values(L).forEach(a => a.forEach(e => { if (e.pos) phr.push(e.pos); if (e.neg) phr.push(e.neg); }));
    check('log: عبارات التقرير بلا تشكيلٍ ولا «المعلم» ولا وسوم', phr.length > 20 && phr.every(x => !/[ً-ْ]/.test(x) && !/معلم/.test(x) && !/[<>]/.test(x)), phr.find(x => /[ً-ْ]|معلم|[<>]/.test(x)));
    check('log: كلّ وسمٍ له عبارة', E.TAGS.every(T => !!E.EV_TAG[T.k] || T.k === 'dish'));
    const SPL = E.evidenceLog({ M: { observed: 0, speech: { clauses: 30, words: 400, corr: { n: 2, specEx: [[300, 'ارفع ركبتك أكثر']] }, check: { ex: [] }, q: { n: 4, hi: 0, hiEx: [] }, praise: { specEx: [] }, safe: { ex: [] } } } });
    check('log: كلام المعلّم بنصّه ووقته، والأسئلة المغلقة كلّها دليلٌ سالبٌ للبند ١٠ (لا ٣)', SPL[10][0].t === 300 && SPL[10][0].text === 'صحّح: «ارفع ركبتك أكثر»' && SPL[10].some(e => e.neg === 'اقتصار الأسئلة الشفهية على أسئلة مغلقة لا تستثير التفكير') && !SPL[3]);

    const UI = read('js/eye.js'), SUP = read('js/supervisory.js');
    check('wiring: الوصف الرسميّ يأخذ أدلّة الحصة بدل العشوائيّة، وإلّا كما كان', /const eyeEv = !customEvidences && typeof svfEyeOfficial === 'function' \? svfEyeOfficial\(itemId, rating\) : null;/.test(SUP)
          && /\} else if \(eyeEv && eyeEv\.length\) \{\s*\n\s*selectedEvidences = eyeEv;/.test(SUP) && /getRandomEvidences\(positiveEvidences, 2\)/.test(SUP));
    check('wiring: لوحة «تعديل الأدلة» تبدأ بأدلّة الحصة موسومةً «من الحصة»', /const eyeList = \(typeof svfEyeOfficial === 'function' && svfEyeOfficial\(itemId, rating, true\)\) \|\| \[\];/.test(SUP) && /من الحصة<\/span>/.test(SUP));
    check('wiring: تحت كلّ بندٍ «أدلّة من الحصة» بنصٍّ آمن، حيّاً أثناء الرصد', /function evList\(card, id, list\)/.test(UI) && /li\.appendChild\(document\.createTextNode\(e\.text\)\)/.test(UI)
          && /if \(S\.lastSec % 5 === 0\) refreshEvidence\(M\);/.test(UI) && /if \(fv && !fv\.classList\.contains\('hidden'\)\) decorate\(\);/.test(UI));
    check('wiring: العلامة تُنسب إلى بندٍ وتُحفظ معه', /data-markitem="\$\{i\}"/.test(UI) && /item: m\[2\] \|\| null/.test(UI));
}

/* ── ٢٩) مراجعةٌ واحدة و«اعتماد وحفظ»، والمداولة من الأدلّة، وكلّها لصاحب العين وحده (2026-10-28) ── */
{
    const UI = read('js/eye.js');
    check('owner: ما يدخل النموذج المشترك لصاحب العين وحده', /const EYE_OK = \(\) => !!\(root\.SupervisorGate && SupervisorGate\.canEye && SupervisorGate\.canEye\(\)\);/.test(UI)
          && /root\.svfEyeOfficial = function \(id, score, all\) \{\s*\n\s*if \(!EYE_OK\(\)\) return null;/.test(UI)
          && /if \(!EYE_OK\(\)\) \{ document\.querySelectorAll\('#form-view \.eye-evlist, #form-view \.eye-badge'\)\.forEach\(x => x\.remove\(\)\); return; \}/.test(UI)
          && /root\.svfEyeDebriefHtml = function \(\) \{\s*\n\s*if \(!EYE_OK\(\)\) return '';/.test(UI));
    check('review: لكلّ بندٍ أدلّته وما سيُكتب في الوصف، ويتجدّد مع المستوى', /\$\{evMini\(LOG\[s\.id\]\)\}/.test(UI) && /function previewText\(id, n\)/.test(UI) && /pv\.textContent = previewText\(Number\(id\), n\);/.test(UI)
          && /مراجعة التقييم والأدلّة/.test(UI));
    check('approve: تطبيقٌ ثمّ توليدٌ (لا يطمس المكتوب باليد) ثمّ الملخّص والأهداف ثمّ الحفظ بمساره نفسه', /function approveSave\(\)/.test(UI)
          && /if \(!edited\.length && typeof generateReport === 'function'\)/.test(UI) && /if \(typeof savePermanentReport === 'function'\) savePermanentReport\(\);/.test(UI)
          && /return f && f\.value\.trim\(\) && !\(g && g\.texts && g\.texts\[k\] === f\.value\);/.test(UI) && /developments: 'الجوانب التي تحتاج إلى تطوير', recs: 'التوصيات'/.test(UI));
    check('debrief: الأحوج سؤالٌ مرتكزٌ على لحظته، والأقوى تعزيزٌ بدليله، بالجنس', /function debriefEvidence\(d\)/.test(UI) && /'عند الدقيقة ' \+ mmss\(e\.t\)/.test(UI)
          && /ما الذي دفعكِ إلى ذلك؟/.test(UI) && /أجدتِ /.test(UI) && /\$\{evTalk\}/.test(UI));
}

/* ── ٣٠) وضع الحصة المبسّط: الأساسيّ وحده أثناء الرصد (2026-10-29) ── */
{
    const UI = read('js/eye.js'), CSS = read('styles.css');
    // «أهمّ ما تلمسه»: يُشغَّل نصّ الدالّة نفسه على عاداتٍ مصنوعة
    const src = UI.slice(UI.indexOf('    const QUICK_N = 6'), UI.indexOf('    function renderQuick()'));
    const pick = freq => new Function('E', 'S', src + '\nreturn quickTags();')(() => E, { tagFreq: freq });
    check('quick: قبل أن تتكوّن عادة — ستّةٌ من التدريس والتقويم والسلامة', JSON.stringify(pick({})) === JSON.stringify(['demo', 'fbInd', 'ask', 'fbMiss', 'out', 'hazard']));
    const used = pick({ games: 9, safe: 4, demo: 1 });
    check('quick: الأكثر لمساً يتقدّم، والباقي من الافتراض بترتيبه', used.length === 6 && used[0] === 'games' && used[1] === 'safe' && used[2] === 'demo' && used[3] === 'fbInd' && !used.includes('hazard'));
    check('quick: كلّ وسمٍ فيها من وسوم العين', pick({ x: 99 }).every(k => E.TAG[k]));
    check('simple: الوضع أثناء الرصد وحده، ويُبدَّل بزرٍّ في شريط الرصد ويُذكر', /const simple = S\.running && S\.simple !== false;/.test(UI) && /\$\('eyeBody'\)\.toggleAttribute\('data-eye-simple', simple\);/.test(UI)
          && /id="eyeMore"/.test(UI) && /S\.simple = !S\.simple; savePrefs\(\); layout\(\);/.test(UI) && /const p = \{ simple: S\.simple !== false, freq: S\.tagFreq \|\| \{\} \};/.test(UI));
    check('simple: القاعدتان في styles.css', /#eyeBody\[data-eye-simple\] \.eye-adv \{ display: none !important; \}/.test(CSS) && /#eyeBody:not\(\[data-eye-simple\]\) \.eye-simple-only \{ display: none !important; \}/.test(CSS));
    // ما يُخفى: المتابعة والمجرى والوسوم والعيّنة واللحظات والدليل والأهداف — وما يبقى: العناصر، والعلامة والإيقاف، وأدوات الإنقاذ
    const adv = ['eyeMonitor', 'eyeEvLive', 'eyeFocus', 'eyeGuide', 'eyeDotKey', 'eyeTeacherBtn', 'eyeSpeechText', 'eyeSpeechCounts'];
    check('simple: المتقدّم موسومٌ eye-adv', adv.every(id => new RegExp('id="' + id + '" class="eye-adv ').test(UI)) && /class="eye-adv bg-white rounded-2xl border border-slate-200 p-4">\s*<div[^>]*>\s*<b class="text-sm text-slate-900">مجرى الحصة/.test(UI)
          && /class="eye-adv grid grid-cols-1 lg:grid-cols-2 gap-5">\s*<section[^>]*>\s*<div[^>]*>\s*<h2 class="font-bold text-slate-900">ما لا تراه الكاميرا/.test(UI));
    const keep = ['eyeMark', 'eyeStop', 'eyeRoiBtn', 'eyeCamRestart', 'eyeRelink', 'eyeSpeechRetry', 'eyeSpeechCue', 'eyeSpeechQuiet', 'eyeLiveBar'];
    check('simple: الأساسيّ وأدوات الإنقاذ لا تُخفى', keep.every(id => { const m = UI.match(new RegExp('id="' + id + '" class="([^"]*)"')); return m && !/eye-adv/.test(m[1]); }) && !/eye-adv[^"]*" data-ctx|class="eye-adv eye-ctx/.test(UI));
    check('simple: أهمّ تنبيهٍ يظهر في اللوحة المبسّطة، بالتفويض للمسات', /const qa = \$\('eyeQuickAlert'\), top = L\.alerts\[0\];/.test(UI) && /qa\.textContent = top\.text;/.test(UI)
          && /\$\('eyeQuickTags'\)\.addEventListener\('click'/.test(UI) && /if \(S\.running\) \{ S\.tagFreq\[k\] = \(S\.tagFreq\[k\] \|\| 0\) \+ 1; savePrefs\(\); \}/.test(UI));
}

/* ── ٣١) مساعد الصياغة: ما يُرسَل، وقراءة الردّ، والوسيط (2026-10-29) ── */
{
    const D = require('../js/eye-draft.js');
    const items = [
        { id: 7, standard: 'إدارة الصف', title: 'فاعلية الإدارة الصفية', score: 2, level: 'يدير المعلم الصف بصورة جيدة.',
          ev: [{ src: 'cam', text: 'لا انتظار بين الأنشطة دقيقةً فأكثر', pos: 'الانتقال السلس بين أجزاء الدرس دون هدر للوقت' }] },
        { id: 10, standard: 'التقويم ومساندة التقدم', title: 'توظيف أساليب تقويم متنوعة', score: 4, level: 'يوظف المعلم أساليب تقويم بصورة غير ملائمة.',
          ev: [{ src: 'speech', text: 'صحّح: «ارفع ركبتك يا أحمد»', pos: 'تصحيح أخطاء الأداء فورا', neg: undefined },
               { src: 'tap', text: 'خطأ في الأداء لم يُصحَّح', neg: 'تكرار أخطاء في الأداء دون تصحيح' },
               { src: 'mark', text: 'سالم بن خالد لم يشارك' }] },
        { id: 12, standard: 'الحوكمة', title: 'الالتزام بأخلاقيات المهنة', score: 3, level: '', ev: [] }
    ];
    const R = D.build({ female: true, lower: true, cls: '3/2', topic: 'الوثب الطويل', summary: 'حركة الطلبة (52%)', items });
    check('draft: لا يُرسَل كلام المعلّم بنصّه ولا ملاحظة المشرف (أسماء الطلبة)', !/أحمد|سالم|ارفع ركبتك/.test(R.user));
    check('draft: البند بمستواه وجملة مستواه وعبارة الدليل لمستواه (السالبة لـ٤)', /\[10\] التقويم ومساندة التقدم .* المستوى: غير ملائم/.test(R.user)
          && R.user.includes('تكرار أخطاء في الأداء دون تصحيح') && !R.user.includes('تصحيح أخطاء الأداء فورا') && R.user.includes('الانتقال السلس بين أجزاء الدرس'));
    check('draft: ما لا دليل عليه يُقال، والحقيقة الرقميّة من الكاميرا تصحب العبارة', /\[12\][^\n]*\n\s*\(لا أدلّة من الحصة\)/.test(R.user) && R.user.includes('(لا انتظار بين الأنشطة دقيقةً فأكثر)'));
    check('draft: التعليمات بالجنس و«التلاميذ» والعناوين الثلاثة وحدّ الطول وبلا «<»', /نوصي المعلمة بالآتي:/.test(R.system) && /المؤنّث/.test(R.system) && /«التلاميذ»/.test(R.system)
          && D.FIELDS.every(F => R.system.includes(F.head + ':')) && R.system.includes(String(D.MAX_FIELD)) && /بلا الرمز </.test(R.system));
    check('draft: البيانات بلا اسمٍ للمعلّم ولا مدرسة (الإدخال لا يحملهما)', !/teacher|school/.test(JSON.stringify(Object.keys(R))) && /- معلمة، الصف: 3\/2، عنوان الدرس: الوثب الطويل/.test(R.user));

    const reply = '**جوانب الإجادة:**\n• إدارة الصف: تنتقل المعلمة بين أجزاء الدرس بسلاسة.\n\n## الجوانب التي تحتاج إلى تطوير\n- التقويم ومساندة التقدم: تكرار أخطاء في الأداء دون تصحيح &#1644; <b>\nالتوصيات:\nنوصي المعلمة بالآتي:\n• التقويم: تقديم تغذية راجعة.\nوالله ولي التوفيق.';
    const O = D.parse(reply);
    check('parse: العناوين بماركداون أو بلا نقطتين، والشرطة نقطة', O && O.strengths === '• إدارة الصف: تنتقل المعلمة بين أجزاء الدرس بسلاسة.' && /^• التقويم ومساندة التقدم/.test(O.developments) && /والله ولي التوفيق\.$/.test(O.recs));
    check('parse: آمنٌ للبوّابة — لا «<» ولا ترميز HTML', !/[<]|&#/.test(JSON.stringify(O)) && O.developments.includes('‹b>'));
    check('parse: ردٌّ بلا عناوين ← لا شيء، وJSON يُقبل', D.parse('شكراً') === null && D.parse('{"strengths":"• أ","developments":"• ب","recs":"ج"}').recs === 'ج');
    const P = D.problems({ strengths: 'أ'.repeat(1001), developments: '', recs: 'قالت المعلمة نورة الهاشمي' }, { teacher: 'نورة الهاشمي', school: 'مدرسة النور' });
    check('problems: الطويل والفارغ واسم المعلّمة المتسرّب', P.length === 3 && P.some(x => /أطول من حدّ البوّابة/.test(x)) && P.some(x => /فارغة/.test(x)) && P.some(x => /نورة الهاشمي/.test(x)));

    // الوسيط على Claude مُحاكى
    const W = read('tools/claude-draft/worker.js');
    const mod = { exports: null };
    new Function('module', W.replace('export default', 'module.exports ='))(mod);
    const worker = mod.exports, env = { ANTHROPIC_API_KEY: 'sk-test', SVF_KEY: 'secret-word' };
    let sent = null;
    globalThis.fetch = async (url, opt) => { sent = { url, opt, body: JSON.parse(opt.body) }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'جوانب الإجادة:\nأ' }], stop_reason: 'end_turn', usage: { input_tokens: 9 } }) }; };
    const mk = (o, key, body) => ({ method: 'POST', headers: { get: h => ({ Origin: o, origin: o, 'x-svf-key': key })[h] || null }, json: async () => body });
    PENDING.push((async () => {
        const bad1 = await worker.fetch(mk('https://evil.example', 'secret-word', { user: 'x' }), env);
        const bad2 = await worker.fetch(mk('https://supervisor-mct.com', 'wrong', { user: 'x' }), env);
        const big = await worker.fetch(mk('https://supervisor-mct.com', 'secret-word', { user: 'x'.repeat(30000) }), env);
        sent = null;
        const ok = await worker.fetch(mk('https://supervisor-mct.com', 'secret-word', { system: 's', user: 'u', model: 'claude-fable-5-1', max_tokens: 99999 }), env);
        const j = JSON.parse(await ok.text());
        check('worker: مصدرٌ آخر وكلمةٌ خاطئة وطلبٌ ضخم مرفوضة قبل Claude', bad1.status === 403 && bad2.status === 401 && big.status === 400);
        check('worker: المفتاح في الترويسة من البيئة، والنموذج والطول من الوسيط لا من الموقع', sent && sent.url === 'https://api.anthropic.com/v1/messages' && sent.opt.headers['x-api-key'] === 'sk-test'
              && sent.body.model === 'claude-sonnet-5-5' && sent.body.max_tokens === 2000 && sent.body.system === 's' && sent.body.messages[0].content === 'u');
        check('worker: يُرجع النصّ وسبب التوقّف', ok.status === 200 && j.text === 'جوانب الإجادة:\nأ' && j.stop === 'end_turn');
    })());

    const UI = read('js/eye.js'), H = read('reports.html'), SW = read('sw.js');
    check('wiring: الملفّ قبل الشاشة وفي عامل الخدمة', /eye-speech\.js"><\/script>\s*<script src="js\/eye-draft\.js"><\/script>/.test(H) && SW.includes("'./js/eye-draft.js'"));
    check('wiring: الطلب من draftInput بلا اسم المعلّم ولا المدرسة', /return \{ female: female\(\), lower: lower\(\), cls: I\.cls, topic: I\.topic, summary, items \};/.test(UI));
    check('wiring: الربط المباشر بكلمة الوسيط، والنسخ إلى Claude، واللصق', /'x-svf-key': \$\('eyeDraftKey'\)\.value\.trim\(\)/.test(UI) && /root\.open\('https:\/\/claude\.ai\/new'/.test(UI) && /function draftRead\(\)/.test(UI));
    check('wiring: الإدراج بعد المعاينة، يستأذن قبل الكتابة فوق نصٍّ، ويرفض ما يتجاوز حدّ البوّابة', /function draftUse\(\)/.test(UI) && /تحلّ الصياغة محلّه؟/.test(UI) && /أطول من حدّ البوّابة \(1000 حرف\) — اختصرها/.test(UI)
          && /strengths: 'strengthsContent', developments: 'developmentContent', recs: 'recommendationsContent'/.test(UI));
}

/* ── ٣٢) منهجية SOFIT من أرقام الرصد المحفوظة (2026-10-29) ── */
{
    const sum = a => a.reduce((x, r) => x + r.pct, 0);
    const d = { src: 'camera', tl: 'rrrraaaaaaiiiaaaaaaaaaaaaaaiiaaaa', tc: 'rrrrwwwwffffttttttaaaaaaaaaaacccc',
                tm: '---5566767221666655788887762155433', tt: '7777222244444883322115551112266333', M: { people: { vigAll: 18 } } };
    const F = E.sofit(d);
    const C = k => F.ctx.find(r => r.k === k).pct;
    check('sofit: عيّنةٌ كلّ عشرين ثانية، والسياق الخمس فئات يُجمع ~١٠٠', F && F.step === 20 && F.n === 17 && Math.abs(sum(F.ctx) - 100) <= 2);
    check('sofit: الحضور إدارة، والإحماء والإعداد لياقة، والتعليميّة مهارة، والتطبيقيّة لعب، والختام شرح', C('M') > 0 && C('F') > 0 && C('S') > 0 && C('G') > C('S') && C('K') > 0);
    check('sofit: نشاط الطلبة — المعتدل فأشدّ من حركة الطلبة، والشديد من الكشف، والساكن الباقي', F.act.mvpa === 50 && F.act.vig === 18 && F.act.walk === 32 && F.act.still === 50 && F.act.ok);
    check('sofit: سلوك المعلّم — يراقب حين يصمت، ويعلّم أو ينظّم حين يتكلّم', F.teacher && Math.abs(sum(F.teacher) - 100) <= 2 && F.teacher.find(r => r.k === 'observe').pct > 0);
    const N = E.sofit({ src: 'none', tl: 'xxxxxxxxxxxxxxxxxxxx', tc: 'wwwwffffttttaaaacccc', tm: '', tt: '' });
    check('sofit: بلا كاميرا — السياق من العناصر وحدها، ولا نشاط ولا سلوك', N && N.ctx && !N.act && !N.teacher && N.n === 10);
    const X = E.sofit({ src: 'camera', tl: 'aaxxxxxx', tc: 'aaaaaaaa', tm: '55555555', tt: '' });
    check('sofit: الكاميرا المتحرّكة لا عيّنة منها، والقليل لا يُحكم منه', X === null && E.sofit({}) === null);
    const UI = read('js/eye.js');
    check('wiring: قسم «وفق منهجية SOFIT+» في النتيجة بعد العناصر (ونشاط الطلبة من SOFIT)، بتنبيه أنّه تكييف', /const SF = E\(\)\.isAdv\(\) \? E\(\)\.sofit\(data\) : null, SP = E\(\)\.isAdv\(\) \? E\(\)\.sofitPlus\(data\) : null;/.test(UI) && /\[momHtml, partsHtml, sofitHtml,/.test(UI) && /تكييفٌ آليّ لـ<bdi dir="ltr">SOFIT\+<\/bdi>/.test(UI));
}

/* ── ٣٣) التتبّع على طريقة ByteTrack (2026-10-29) ── */
{
    const lastX = (T, id) => { const tr = T.tracks.find(x => x.id === id); return tr ? tr.hist[tr.hist.length - 1].nx : null; };
    // طالبان يتقاطعان: أ يجري يميناً وب يساراً على الخطّ نفسه تقريباً — بالتوقّع يبقى كلٌّ بهويّته بعد التقاطع
    const X = E.newTracker();
    for (let k = 0; k <= 8; k++) {
        const t = k * 0.5;
        E.trackStep(X, [person(0.30 + 0.06 * k, 0.50), person(0.71 - 0.06 * k, 0.52)], t, 1);   // بين لقطتين يتبادلان الجانبين
    }
    const ids = X.tracks.map(x => x.id).sort();
    check('bytetrack: تقاطع طالبين — لا تتبادل الهويّتان ولا يُخلق متتبَّعٌ جديد', ids.length === 2 && lastX(X, 1) > 0.6 && lastX(X, 2) < 0.4);
    // الكشف يخفت (ظلّ، زميلٌ يحجبه) والطالب يتحرّك: يبقى متتبَّعه نفسه
    const W = E.newTracker();
    E.trackStep(W, [person(0.3, 0.5)], 0, 1);
    for (let k = 1; k <= 4; k++) E.trackStep(W, [person(0.3 + 0.03 * k, 0.5, { score: 0.3 })], k * 0.5, 1);
    check('bytetrack: الكشف الضعيف يمدّ المتتبَّع القائم ولا يُنشئ غيره', W.tracks.length === 1 && W.tracks[0].hits === 5 && E.peopleSnapshot(W, 2, null, null).n === 1);
    // كشفٌ ضعيفٌ وحيد (لافتة، مخروط) لا يُعدّ طالباً حتّى يُرى مرّةً ثانية
    const L = E.newTracker();
    E.trackStep(L, [person(0.5, 0.5, { score: 0.3 })], 0, 1);
    const n1 = E.peopleSnapshot(L, 0, null, null).n;
    E.trackStep(L, [person(0.5, 0.5, { score: 0.3 })], 0.5, 1);
    check('bytetrack: الضعيف المنفرد مبدئيٌّ لا يُعدّ، ويُؤكَّد بالرؤية الثانية', n1 === 0 && E.peopleSnapshot(L, 0.5, null, null).n === 1 && L.tracks[0].ok === true);
    // الجاري بين لقطتين متباعدتين: التوقّع يبلغه ولو تجاوز حدّ المسافة من موضعه الأخير
    const R = E.newTracker();
    E.trackStep(R, [person(0.10, 0.5)], 0, 1);
    E.trackStep(R, [person(0.16, 0.5)], 0.5, 1);
    E.trackStep(R, [person(0.40, 0.5)], 2.5, 1);
    check('bytetrack: التوقّع بالسرعة يُبقي الجاري متتبَّعاً واحداً', R.tracks.length === 1);
    check('bytetrack: سقف السرعة يمنع القذف بقفزةٍ خاطئة', E.MAX_PRED === 2 && E.HIGH_SCORE > E.PERSON_MIN_SCORE);
}

/* ── ٣٤) نموذج الكشف الأحدث: YOLOX‑Nano في عاملٍ في الخلفيّة (2026-10-29) ── */
{
    const Y = require('../js/eye-yolox.js');
    // المدخل: BGR بقيمه، مصغّرٌ إلى المربّع، والباقي ١١٤
    const px = new Uint8ClampedArray(4 * 4 * 2);
    for (let i = 0; i < 8; i++) { px[i * 4] = 200; px[i * 4 + 1] = 100; px[i * 4 + 2] = 10; px[i * 4 + 3] = 255; }
    const T = Y.tensor(px, 4, 2, 8), pl = 64;
    check('yolox: المدخل BGR بقيمه بلا تطبيع، والمساحة الفارغة ١١٤', T.scale === 2 && T.data[0] === 10 && T.data[pl] === 100 && T.data[2 * pl] === 200 && T.data[8 * 4] === 114 && T.data.length === 3 * pl);
    check('yolox: عدد الخلايا ٣٥٤٩ لمدخل ٤١٦ و٨٤٠٠ لـ٦٤٠ (كما قِيس من النموذج)', Y.rows(416) === 3549 && Y.rows(640) === 8400);
    // مخرجٌ مصنوع: شخصٌ في الخليّة (٥، ١٠) من شبكة الخطوة ٨، وكرةٌ في شبكة الخطوة ٣٢، وتكرارٌ يُزال
    const size = 416, out = new Float32Array(Y.rows(size) * 85);
    const put = (row, ox, oy, lw, lh, obj, cls, p) => { const b = row * 85; out[b] = ox; out[b + 1] = oy; out[b + 2] = lw; out[b + 3] = lh; out[b + 4] = obj; out[b + 5 + cls] = p; };
    put(10 * 52 + 5, 0.5, 0.5, Math.log(4), Math.log(10), 0.9, 0, 0.9);          // المركز (44، 84)، ٣٢×٨٠ بكسلاً
    put(10 * 52 + 6, 0.4, 0.5, Math.log(4), Math.log(10), 0.8, 0, 0.8);          // مكرّرٌ متداخل
    put(52 * 52 + 26 * 26 + 3 * 13 + 2, 0.5, 0.5, 0, 0, 0.9, 32, 0.8);           // كرة
    put(5, 0.5, 0.5, 0, 0, 0.1, 0, 0.9);                                          // ضعيف
    const D = Y.decode(out, size, 1, 416, 416, { person: 0.22, ball: 0.35 });
    const P = D.filter(d => d.label === 'person');
    check('yolox: فكّ الشبكة (الإزاحة × الخطوة، والعرض بالأسّ) بنسبة الصورة', P.length === 1 && Math.abs(P[0].x * 416 - 28) < 0.01 && Math.abs(P[0].y * 416 - 44) < 0.01 && Math.abs(P[0].w * 416 - 32) < 0.01 && Math.abs(P[0].h * 416 - 80) < 0.01);
    check('yolox: الثقة = «فيه شيء» × الصنف، والمكرّر يُزال، والكرة صنفها، والضعيف يُترك', Math.abs(P[0].score - 0.81) < 1e-6 && D.filter(d => d.label === 'sports ball').length === 1 && D.length === 2);
    const UI = read('js/eye.js'), WK = read('js/eye-detect-worker.js'), SW = read('sw.js');
    check('wiring: العامل يحمّل ONNX Runtime والمعالجة نفسها، على المعالج بخيطٍ واحد', /import \* as ortNS from '\.\.\/vendor\/onnx\/ort\.wasm\.min\.mjs';/.test(WK) && /import '\.\/eye-yolox\.js';/.test(WK)
          && /executionProviders: \['wasm'\]/.test(WK) && /numThreads = 1/.test(WK) && !/postMessage\([^)]*buf/.test(WK.replace(/m\.buf/g, '')));
    check('wiring: YOLOX أوّلاً وإن تعذّر فـCenterNet، والصورة نسخةٌ تُنقل ولا تُحفظ', /try \{ eng = await yoloxEngine\(\); \} catch/.test(UI) && /if \(!eng\) eng = await humanEngine\(\);/.test(UI)
          && /const res = await AI\.engine\.detect\(c, rgba, cw, ch\);/.test(UI) && /new Uint8ClampedArray\(rgba\)\.buffer/.test(UI) && !/toDataURL|MediaRecorder|toBlob/.test(UI + WK));
    const fs = require('fs'), path = require('path'), V = f => fs.existsSync(path.join(__dirname, '..', 'vendor', 'onnx', f));
    check('vendor: النموذج والمشغّل وترخيصاهما، وفي عامل الخدمة', ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'yolox_nano.onnx', 'LICENSE-YOLOX', 'LICENSE-onnxruntime', 'README.md'].every(V)
          && SW.includes("'./js/eye-yolox.js'") && SW.includes("'./js/eye-detect-worker.js'"));
}

/* ── ٣٥) SOFIT+: الأبعاد الأربعة، ومؤشّر الممارسات، ولحظتاه، وقائمة النهاية (2026-10-29) ── */
{
    const SX = require('../js/eye-speech.js');
    const A = SX.analyze([{ t: 5, x: 'يا شباب انتبهوا' }, { t: 15, x: 'ممتاز يا أحمد' }, { t: 25, x: 'المجموعة الثانية ارفعوا الركبة' }], { topic: 'كرة القدم' });
    check('speech: نوع الكلام ومخاطَبه لكلّ عشر ثوانٍ (يشجّع/يعلّم، والصف/المجموعة/الطالب) — بلا نصّ', A.tb === '-pi' && A.to === 'csg' && !/أحمد/.test(A.tb + A.to)
          && SX.addressee(SX.norm('يا سالم')) === 's' && SX.addressee(SX.norm('الكل يرجع')) === 'c');
    check('tags: الإقصاء والتوقّف للأدوات سالبان، والاكتشاف موجب، ولكلٍّ عبارة دليل', E.TAG.elim.neg && E.TAG.equip.neg && !E.TAG.discover.neg && E.EV_TAG.elim.neg && E.EV_TAG.equip.neg && E.EV_TAG.discover.pos);
    const d = { src: 'camera', tl: 'rrrraaaaaaiiiaaaaaaaaaaaaaaiiaaaa', tc: 'rrrrwwwwffffttttttaaaaaaaaaaacccc', tm: '---5566767221666655788887762155433', tt: '7777222244444883322115551112266333',
        M: { forms: { windows: '----SSSSSSLLLLLLGGGGGGGGGGGSSSSSS', queue: '----000000666666000000000000000000' }, speech: { tb: 'oooo--pp--iiii-pp--i-p-------ii', to: 'cccc------sgggg------s' } },
        ev: [[130, 'elim']], cx: [[0, 'roll'], [40, 'warm'], [80, 'fit'], [120, 'teach'], [180, 'apply'], [290, 'close']], exit: { loc: 'ملعبٌ مكشوف' } };
    const R = E.sofitPlus(d), K = (arr, k) => (arr.find(r => r.k === k) || {}).pct || 0, L = k => (R.limits.find(l => l.k === k) || {}).n || 0;
    check('sofit+: سياق النشاط من التشكيلات (المجموعات والانتشار والطوابير)', R.act && K(R.act, 'groups') > 0 && K(R.act, 'free') > 0 && K(R.act, 'line') > 0);
    check('sofit+: سلوك المعلّم من نوع كلامه ومخاطَبه', R.teacherBy === 'speech' && K(R.teacher, 'promote') > 0 && K(R.teacher, 'group') > 0 && K(R.teacher, 'one') > 0);
    check('sofit+: ما يحدّ — الطابور من الانتظار، والإقصاء من لمسته حتّى تغيّر العنصر', L('queue') === 3 && L('elim') === 3 && R.limits.every(l => l.sec === l.n * 20));
    check('sofit+: اجتماع الممارسات وحركة الطلبة — المرتفع أعلى من المنخفض', R.rel && R.rel.hi.mv > R.rel.lo.mv && R.index > 0 && R.index <= 4);
    check('sofit+: لحظتان — الأدنى فيه ما يحدّ، والأعلى فيه ممارساتٌ داعمة', R.worst && R.best && R.worst.idx < R.best.idx && /لعبة إقصاء|انتظار الدور/.test(E.sofitPlusWhy(R.worst)) && /نشاطٌ حركيّ/.test(E.sofitPlusWhy(R.best)));
    check('sofit+: أوّل نصف دقيقةٍ لا يدخل المقارنة ولا اللحظات (متتبَّعون بلا سرعةٍ بعد)', R.rows.filter(r => r.t < 30).every(r => r.mv === null) && R.worst.t >= 30);
    check('sofit+: قائمة النهاية تُقرأ من المحفوظ', R.exit && R.exit.loc === 'ملعبٌ مكشوف');
    const flat = E.sofitPlus(Object.assign({}, d, { tm: d.tm.replace(/[0-9]/g, '8') }));
    check('sofit+: لا لحظتين حين لا فرق حقيقيّاً في حركة الطلبة', flat.best === null && flat.worst === null && E.SOFITP_GAP === 15);
    const old = E.sofitPlus({ src: 'camera', tl: d.tl, tc: d.tc, tm: d.tm, tt: d.tt, M: {} });
    check('sofit+: تقريرٌ قديمٌ بلا تشكيلٍ ولا نوع كلام — يُترك بُعده ولا يُخمَّن', old && old.act === null && old.teacherBy === 'talk' && old.lesson);
    const UI = read('js/eye.js');
    check('wiring: قائمة النهاية تُحفظ مع النتيجة، ولحظتا SOFIT+ في المداولة بالجنس، وسطرها للمساعد', /d\.exit = \{ loc: \$\('eyeExitLoc'\)\.value/.test(UI) && /const spHtml = SPx && \(SPx\.rel \|\| SPx\.best \|\| SPx\.worst\)/.test(UI)
          && /\$\{evTalk\}\s*\$\{spHtml\}/.test(UI) && /كنتِ تستطيعين' : 'كنتَ تستطيع'/.test(UI) && /const spLine = SP \?/.test(UI));
}

/* ── ٣٦) نقد الواجهة (2026-10-29): الاستمارة الرسميّة أوّلاً، والنتيجة أوّلاً، والرسم لا يتأخّر عن الطلبة ── */
{
    const s8 = n => E.suggest(M2, n, {}).find(s => s.id === 8);
    check('suggest ٨: لمسة استراتيجيّةٍ واحدة دليلٌ موجب ← «ملائم» لا «غير ملائم»، وبثقةٍ منخفضة', s8({ demo: 1 }).score === 3 && s8({ demo: 1 }).conf === 'low', JSON.stringify(s8({ demo: 1 })));
    check('suggest ٨: استراتيجيّتان ← ملائم، وثلاث ← جيد، وأربع ← متميز', s8({ demo: 1, groups: 1 }).score === 3 && s8({ demo: 1, groups: 1, games: 1 }).score === 2 && s8({ demo: 1, groups: 1, games: 1, stations: 1 }).score === 1);
    const s10 = n => E.suggest(M2, n, {}).find(s => s.id === 10);
    check('suggest ١٠: خطأٌ واحدٌ لم يُصحَّح لا يحكم على الحصة ← ملائم، ومن خطأين ← غير ملائم', s10({ fbMiss: 1 }).score === 3 && s10({ fbMiss: 2 }).score === 4);
    check('suggest ١٠: تغذيةٌ راجعة قليلة دليلٌ موجب ← لا تنزل دون «ملائم»', s10({ fbInd: 1 }).score === 3 && s10({ fbInd: 2 }).score === 3);
    // عنصرٌ حضر أقلّ من نصف دقيقة «قصيرٌ جدّاً» لا «غائب»، وما دون عشر ثوانٍ لمسةٌ خاطئة ← غائب
    const mk = secs => ({ parts: { list: [{ k: 'warm', sec: secs }, { k: 'fit', sec: 0 }, { k: 'teach', sec: 600 }, { k: 'apply', sec: 600 }, { k: 'close', sec: 120 }] } });
    const dw = s => E.partsDetail(mk(s), null)[0];
    check('parts: ١٧ ثانية ← «قصير جدّاً» (حاضرٌ لا غائب)', dw(17).verdict === 'short' && dw(17).tiny === true && E.partsDetail(mk(17), null)[1].verdict === 'missing');
    check('parts: ٥ ثوانٍ لمسةٌ خاطئة ← غائب، ونصف دقيقة ← يُقاس بالزمن', dw(5).verdict === 'missing' && !dw(5).tiny && !dw(40).tiny);
    const formsShort = E.targetCandidates ? null : null;
    const fm = E.METRIC.forms.read({ M: { forms: { count: 0 }, people: { detSecs: 60 } } });
    check('metric: التشكيلات لا تُقاس من رصدٍ قصير (لا «كان (0)» بعد دقيقة)', fm === null && E.METRIC.forms.read({ M: { forms: { count: 1 }, people: { detSecs: 900 } } }) === 1);
    const UI = read('js/eye.js'), CSS = read('styles.css');
    check('wiring: الاقتراح ضعيف الثقة لا يُحدَّد للتطبيق افتراضاً، ويُقال ذلك تحت البند', /const pre = curScore !== s\.score && s\.conf !== 'low';/.test(UI) && /ثقةٌ منخفضة: لم يُحدَّد للتطبيق/.test(UI));
    check('wiring: بعد الإيقاف النتيجة أوّلاً — data-eye-done يخفي بطاقة البدء ويقدّم النتيجة', /toggleAttribute\('data-eye-done'/.test(UI) && /#eyeBody\[data-eye-done\] > #eyeSetup \{ display: none !important; \}/.test(CSS)
          && /#eyeBody\[data-eye-done\] > #eyeResult \{ order: 1; \}/.test(CSS));
    check('wiring: المراجعة والحفظ قبل المداولة، والتفاصيل مطويّة بعدها', UI.indexOf('id="eyeReview"') < UI.indexOf('${talkHtml}') && /<details id="eyeDetails"/.test(UI) && UI.indexOf('${talkHtml}') < UI.indexOf('<details id="eyeDetails"'));
    check('wiring: النقاط تبهت ثمّ تختفي (لا تبقى ٤٫٥ ث في أماكن خالية)', /const DOT_FADE = 0\.7, DOT_HIDE = 1\.6;/.test(UI) && /age <= DOT_HIDE/.test(UI) && !/Math\.max\(2, AI\.ttl\) \? S\.pSnap/.test(UI));
    check('wiring: أثناء الرصد شريط الرصد وحده لاصق', /toggleAttribute\('data-eye-running'/.test(UI) && /html\[data-eye-running\] #supervisoryVisitsApp header \{ position: static !important; \}/.test(CSS));
    check('wiring: مجرى الحصة بطول ما رُصد بعد الإيقاف، والرسم والتلميح بالدالّة نفسها', /const tlLen = len =>/.test(UI) && (UI.match(/tlLen\(items\.length\)/g) || []).length === 2);
    check('wiring: الزمن بالدقائق والثواني في الفعليّ والموصى به', /\$\{mmss\(x\.sec\)\} \/ \$\{mmss\(x\.rec\)\}/.test(UI) && /\$\{mmss\(r\.sec\)\} من \$\{mmss\(Math\.round\(r\.rec \* 60\)\)\}/.test(UI) && !/recMin\(/.test(UI));
    check('wiring: «قصير جدّاً» في النتيجة وبطاقة المعلّم', /r\.tiny \? \['قصير جدّاً'/.test(UI) && /r\.tiny \? \['قصير جدّاً'/.test(read('js/eye-report.js')));
    check('wiring: SOFIT+ معزولٌ عن اتّجاه العربيّة، و«عيّنات» بالعدد، والمؤشّر من تسع عيّنات', UI.split('\n').filter(l => /SOFIT\+/.test(l) && !/^\s*\/\//.test(l) && !/<bdi dir="ltr">SOFIT\+<\/bdi>|\\u2066SOFIT\+\\u2069|'وفق SOFIT\+:'/.test(l)).length === 0
          && /E\(\)\.count\(SP\.n, 'عيّنةٌ واحدة'/.test(UI) && /SP\.index != null && SP\.n >= 9/.test(UI));
    check('wiring: بطاقتا الاتّفاق والأنماط لا تُعرضان فارغتين', /box\.classList\.toggle\('hidden', !A\.n\)/.test(UI) && /box\.classList\.toggle\('hidden', A\.lessons < 2\)/.test(UI));
    check('wiring: التشكيلات — لا «استُعمل 0 تشكيلات … :» بلا شيءٍ بعدها', /لم يثبت تشكيلٌ واحدٌ عشرين ثانيةً فأكثر/.test(UI));
}

/* ── ٣٧) دروس الدليل من ملفّه (2026-10-29): يُقرأ في المتصفّح، ويُحوَّل مرّةً ويُحفظ ── */
{
    const GI = require('../js/eye-guide-import.js');
    // البصمة: النصّ نفسه بصمته واحدة مهما اختلف تقطيع أسطره أو تشكيله أو أشكال عرض حروفه
    check('guide-import: البصمة لا تتأثّر بالأسطر والتشكيل وأشكال العرض', GI.textKey('مسك الكرة\nبالأصابع') === GI.textKey('مَسك  الكرة بالأصابع') && GI.textKey('ﻻ') === GI.textKey('لا') && GI.textKey('أ') !== GI.textKey('ب'));
    // أسطر pdf.js: السطر العربيّ من اليمين لليسار، والأسطر من الأعلى
    const items = [{ str: 'الكرة', transform: [1, 0, 0, 10, 100, 700], width: 30, height: 10 }, { str: 'مسك', transform: [1, 0, 0, 10, 140, 700], width: 20, height: 10 },
                   { str: 'خطوة للأمام', transform: [1, 0, 0, 10, 120, 680], width: 50, height: 10 }, { str: ' ', transform: [1, 0, 0, 10, 0, 690], width: 2, height: 10 }];
    check('guide-import: الأسطر من عناصر pdf.js بترتيب القراءة العربيّ', JSON.stringify(GI.linesFromItems(items)) === JSON.stringify(['مسك الكرة', 'خطوة للأمام']));
    const R = GI.buildPrompt('نصّ', { grade: 7, topic: 'كرة السلة', pages: '1–3' });
    check('guide-import: الطلب مهمّة «guide» ببنية البطاقة وبلا نقلٍ حرفيّ', R.task === 'guide' && /"skills"/.test(R.system) && /لا نقلٌ حرفيٌّ/.test(R.system) && /الصف: 7 — الموضوع: كرة السلة — الصفحات: 1–3/.test(R.user));
    const raw = GI.parseReply('```json\n{"topic":"لعبة كرة السلة","grade":7,"parts":{"warm":5,"fit":5,"teach":15,"apply":12,"close":3,"x":9},'
        + '"skills":[{"id":"chest pass","name":"التمريرة الصدرية","points":["مسك الكرة بالأصابع",{"text":"خطوة للأمام","cues":["خطوة"]}]},{"id":"","name":"التصويب <b>","knowledge":true,"points":[]}],'
        + '"drills":[{"name":"ثنائيات","skills":["chestpass","zzz"],"form":"circle","per":"2","kind":"apply"}],"assess":["اشرح التمريرة الصدرية"]}\n```');
    const T = GI.normalizeTopic(raw, { hash: 'abcd1234' });
    check('guide-import: قراءة الردّ بين علامات ``` وتسويته بالبنية التي تقرؤها العين', T && T.id === 'u-g7-abcd1234' && T.user === true && T.skills[0].id === 'chestpass' && T.skills[1].id === 's2'
          && T.skills[0].points.length === 2 && T.skills[0].points[0].cues.length > 0 && T.skills[1].knowledge === true && !/</.test(T.skills[1].name));
    check('guide-import: التدريب — تشكيلٌ غير معروف ← انتشار حرّ، ومهارةٌ غير موجودة تُسقط، والعدد رقم', T.drills[0].form === 'free' && T.drills[0].per === 2 && T.drills[0].kind === 'apply' && JSON.stringify(T.drills[0].skills) === '["chestpass"]');
    check('guide-import: زمن العناصر من الدليل بمفاتيحها الخمسة وحدها، وسؤال التقويم بألفاظه', T.parts && T.parts.teach === 15 && !('x' in T.parts) && T.assess[0].any.length && T.assess[0].with.includes('التمريرة'));
    check('guide-import: بلا موضوعٍ أو صفّ ← لا بطاقة، والمشكلات تُذكر', GI.normalizeTopic({ skills: [] }, {}) === null && GI.problems(Object.assign({}, T, { drills: [], assess: [] })).length >= 2);
    // الحفظ والبحث بالبصمة والضمّ إلى الدليل — على تخزينٍ مصنوع
    const mem = {}; globalThis.localStorage = { get length() { return Object.keys(mem).length; }, key: i => Object.keys(mem)[i], getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
    const LG = require('../js/lesson-guide.js');
    globalThis.SvfLessonGuide = LG;
    globalThis.SVF_LESSON_GUIDE = { topics: [{ id: 'g8-football', grade: 8, topic: 'لعبة كرة القدم', match: ['كرة القدم'], skills: [] }] };
    const k1 = GI.save({ status: 'draft', topic: T, src: { hash: 'abcd1234', pages: '1–3' } });
    check('guide-import: المسوّدة تُحفظ بمفتاحها وبصمتها، ولا تدخل الدليل قبل الاعتماد', k1 === 'supervision_v6_guide_u-g7-abcd1234' && GI.byHash('abcd1234').topic.topic === 'لعبة كرة السلة'
          && GI.apply() === 0 && !LG.byId('u-g7-abcd1234'));
    GI.save({ status: 'ok', topic: T, src: { hash: 'abcd1234' } });
    check('guide-import: المعتمدة تنضمّ إلى الدليل المضمَّن ويجدها find من الصفّ وعنوان الدرس', GI.apply() === 1 && LG.byId('g8-football') && LG.find({ cls: '7/2', topic: 'التمريرة الصدرية' }) && LG.find({ cls: '7/2', topic: 'التمريرة الصدرية' }).guide.id === 'u-g7-abcd1234');
    check('guide-import: الحذف يزيلها من الجهاز والدليل', GI.remove(k1) && GI.apply() === 0 && !LG.byId('u-g7-abcd1234') && !GI.list().length);
    delete globalThis.localStorage; delete globalThis.SvfLessonGuide; delete globalThis.SVF_LESSON_GUIDE;
    LG.setData(null);
    const CL = read('js/cloud.js'), UI = read('js/eye.js'), H = read('reports.html'), SW = read('sw.js'), GIs = read('js/eye-guide-import.js'), WK = read('tools/claude-draft/worker.js');
    check('wiring: البطاقات تتبع المشرف بين أجهزته بنوع «supervision» (القواعد كما هي)، والأرشيف لا يقرأ بادئتها', /guide: 'supervision_v6_guide_'/.test(CL) && /const DOC_KIND = \{ guide: 'supervision' \};/.test(CL) && (CL.match(/kind: docKind\(kind\)/g) || []).length === 2);
    check('wiring: الملفّ يُقرأ في المتصفّح (pdf.js محلّيّ) ولا يُرفع — يُرسل النصّ وحده إلى الوسيط', /import\(base \+ 'pdf\.min\.mjs'\)/.test(GIs) && /pdf\.worker\.min\.mjs/.test(GIs) && fs.existsSync(path.join(ROOT, 'vendor/pdfjs/pdf.min.mjs'))
          && fs.existsSync(path.join(ROOT, 'vendor/pdfjs/LICENSE')) && /JSON\.stringify\(buildPrompt\(text, M\)\)/.test(GIs) && !/FormData|arrayBuffer\(\)\)\s*\}/.test(GIs.replace(/const buf = await file\.arrayBuffer\(\);/, '')));
    check('wiring: النصّ المحوَّل من قبل يُفتح ولا يُرسل ثانيةً، وردّ Claude يُحفظ مسوّدةً فوراً', /const saved = byHash\(textKey\(t\)\);\s*if \(saved\) \{ review\(saved\);/.test(GIs) && /status: 'draft', topic: T/.test(GIs));
    check('wiring: الوسيط — مهمّة «guide» بحدودٍ أوسع، والتقرير كما كان', /guide: \{ in: 70000, out: 8000 \}/.test(WK) && /draft: \{ in: 24000, out: 2000 \}/.test(WK) && /max_tokens: lim\.out/.test(WK));
    check('wiring: الملفّ بعد الدليل وقبل العين، وفي عامل الخدمة', /lesson-guide\.js"><\/script>\s*<script src="js\/eye-guide-import\.js"><\/script>/.test(H) && SW.includes("'./js/eye-guide-import.js'"));
    check('wiring: زرّ «دروس الدليل» في بطاقة البدء وبطاقة الدليل، وتغيّر البطاقات يعيد كشف الدليل', /id="eyeGuideImport"/.test(UI) && /data-gimport/.test(UI) && /addEventListener\('svf-guides-changed'/.test(UI));
    check('wiring: زمن العناصر من الدليل أوّلاً، وسطر الخطّة تحت عناصر الحصة', /if \(G && G\.parts\) return Object\.assign\(\{\}, G\.parts\);/.test(UI) && /id="eyePlanHint"/.test(UI) && /function planText\(G, k\)/.test(UI));
}

/* ── ٣٨) الأدوات المتقدّمة مخفيّة، والحرارة والماء، وغير المشاركين بعذر (2026-10-30) ── */
{
    // حصّةٌ فيها كلّ المتقدّم: شدّةٌ وتزاحمٌ وكراتٌ بالكاميرا ومعلّمٌ محدَّد وتشكيلات
    const secs = [];
    const ev = [[0, 'warm'], [360, 'fit'], [600, 'teach'], [1260, 'apply'], [1740, 'close']].map(([t, k]) => ({ t, k }));
    for (let t = 0; t < 1920; t++) {
        const cyc = t % 180, act = !(cyc >= 144 && cyc < 173);
        secs.push({ m: act ? 0.05 : 0.004, v: false, w: cyc === 140 || cyc === 170,
            p: { n: 22, mv: act ? 15 : 1, o: 1, q: 0, r: true, fm: t % 400 < 200 ? 'S' : 'G', ln: 0, d: 2, vg: act ? 5 : 0, cr: act ? 6 : 0, b: t > 1260 && t < 1740 ? 4 : 0, t: [0.5, 0.6, 1, 0] } });
    }
    const M = E.summarize({ secs, grid: Array(108).fill(10), sens: 'medium', ctx: ev, mic: 'device' });
    const P = M.people;
    const slowM = Object.assign({}, M, { people: Object.assign({}, P, { teacher: Object.assign({}, P.teacher || {}, { edgePct: 20, secs: 900, cover: 30, movePct: 50 }) }) });
    check('adv: مفعَّلٌ افتراضاً في المحرّك (الاختبارات القديمة)، وsetAdv يضبطه', E.isAdv() === true && E.setAdv(false) === false && E.isAdv() === false);
    const sg = E.suggest(slowM, {}, {}), by = id => sg.find(x => x.id === id);
    check('adv off: البند ٧ بلا شدّة النشاط ولا موقع المعلّم', !/جرياً أو نشاطاً شديداً|أطراف الطلبة/.test(by(7).evidence), by(7).evidence);
    check('adv off: التزاحم لا يقترح البند ٥، والكرات بالكاميرا لا تقترح البند ٩', !by(5) && !by(9) && E.ballRatio(M) === null);
    const Mset = Object.assign({}, M, { people: Object.assign({}, P, { balls: 12, ballsSet: true }) });
    check('adv off: ما كتبه المشرف من الكرات يُعتدّ به', E.ballRatio(Mset) === 2 && /كرةٌ لكلّ طالبين/.test(E.suggest(Mset, {}, {}).find(x => x.id === 9).evidence));
    check('adv off: الملخّص بلا عدد التشكيلات', !/تشكيل/.test(E.summaryText(M, {})));
    const dp0 = E.debriefPrompts(slowM, {}, { female: true });
    check('adv off: المداولة بلا تزاحمٍ ولا تشكيلٍ ولا شدّةٍ ولا موقع معلّم', !dp0.ask.concat(dp0.good).some(t => /توزّعين المساحة|تشكيل|جرياً|وسط الطلبة|كرةٌ لكلّ/.test(t)), JSON.stringify(dp0));
    const C0 = E.targetCandidates({ M: slowM, counts: {} }, 20).map(t => t.k);
    check('adv off: لا أهداف للتشكيلات والتزاحم والكرات وموقع المعلّم', !['forms', 'crowd', 'balls', 'tEdge'].some(k => C0.includes(k)), C0.join(','));
    check('adv off: ولا أنماط لها', !['oneForm', 'crowd', 'fewBalls', 'teacherCenter'].some(k => E.issuesOf({ M: slowM }).includes(k)));
    const L0 = E.evidenceLog({ M: slowM, counts: {} });
    check('adv off: الأدلّة بلا موقع المعلّم والتزاحم والكرات', !JSON.stringify(L0).match(/أطراف الطلبة|وسط الطلبة|متلاصقون|التلاصق|كرةٌ لكلّ/));
    check('adv off: وسم الزيّ بيد المشرف يبقى، والزيّ من الكشف لا يُعدّ صفراً', E.METRIC.dish.read({ M, counts: {} }) === null && E.METRIC.dish.read({ M, counts: { dish: 2 } }) === 2);
    E.setAdv(true);
    check('adv on: يعود كلّ شيء', /جرياً أو نشاطاً شديداً/.test(E.suggest(M, {}, {}).find(x => x.id === 7).evidence) && E.ballRatio(M) === 6 && E.isAdv());

    // الحرارة المحسوسة (NWS): ٣٥° ورطوبة ٥٠٪ ← ٤١° (جدولها: 95°ف/50% ← 107°ف)، ودون ٢٧° أو بلا رطوبة فالحرارة نفسها
    check('heat: الحرارة المحسوسة وفئاتها', E.heatIndex(35, 50) === 41 && E.heatIndex(25, 80) === 25 && E.heatIndex(33, null) === 33 && E.heatIndex(30, 70) === 35
          && E.fieldOf({ temp: 38, rh: 40 }, {}).catLabel === 'خطر' && E.fieldOf({ temp: 30 }, {}).cat === 1 && E.fieldOf({ temp: 45, place: 'indoor' }, {}).cat === 0);
    const L40 = { seconds: 2400 };
    const F1 = E.fieldOf({ place: 'open', temp: 38, rh: 40 }, L40, { water: 1 });
    check('heat: استراحة ماءٍ متوقّعة كلّ عشرين دقيقة', F1.lessonMin === 40 && F1.expect === 2 && F1.water === 1);
    const s5 = (cnt, f) => E.suggest(L40, cnt, { field: f }).find(x => x.id === 5);
    const hot = { place: 'open', temp: 38, rh: 40 };
    check('suggest ٥: حرٌّ شديدٌ بلا ماء ← غير ملائم (من البطاقة، ثقةٌ متوسّطة)', s5({}, hot).score === 4 && s5({}, hot).basis === 'field' && s5({}, hot).conf === 'medium'
          && /كانت الحرارة المحسوسة \(43°\) — خطر — في ملعبٍ مكشوف، ولم تُتح استراحة ماءٍ في \(40\) دقيقة/.test(s5({}, hot).evidence), s5({}, hot).evidence);
    check('suggest ٥: ماءٌ أقلّ من المتوقّع ← ملائم، وبقدره مع الظلّ ← جيد', s5({ water: 1 }, hot).score === 3 && s5({ water: 2, shade: 1 }, hot).score === 2 && /ووُظّف الظلّ/.test(s5({ water: 2, shade: 1 }, hot).evidence));
    check('suggest ٥: إجهادٌ حراريّ ← غير ملائم، ومع ماءٍ أو ظلّ ← ملائم', s5({ heatHit: 1 }, { temp: 25 }).score === 4 && s5({ heatHit: 1, water: 2 }, hot).score === 3);
    check('suggest ٥: حرٌّ خفيف (حذر) بلا ماء ← ملائم، والصالة لا تُحسب', s5({}, { temp: 29 }).score === 3 && !s5({}, { temp: 45, place: 'indoor' }));
    check('suggest ٥: والحرّ يُضاف إلى لمسات السلامة', /هُيّئ المكان والأدوات تهيئةً آمنة، وكانت الحرارة المحسوسة/.test(s5({ safe: 1 }, hot).evidence) && s5({ safe: 1 }, hot).score === 4);
    const s2 = f => E.suggest(L40, {}, { field: f }).find(x => x.id === 2);
    check('suggest ٢: غير مشاركين بعذرٍ بلا دور ← ملائم', s2({ exc: 3 }).score === 3 && /بقي غير المشاركين بعذر \(3\) بلا دورٍ في الحصة/.test(s2({ exc: 3 }).evidence) && s2({ exc: 3 }).basis === 'field');
    check('suggest ٢: كلّهم بأدوار ← جيد وأدوارهم في الشاهد، وبعضهم ← جيد أيضاً بذكر العدد', s2({ exc: 2, excRole: 2, roles: ['ref', 'score'] }).score === 2
          && /أشرك المعلم غير المشاركين بعذر \(2\) بأدوارٍ في الحصة: التحكيم، والتسجيل والتوقيت/.test(s2({ exc: 2, excRole: 2, roles: ['ref', 'score'] }).evidence)
          && /\(1\) من غير المشاركين بعذر \(3\)/.test(s2({ exc: 3, excRole: 1 }).evidence), s2({ exc: 2, excRole: 2, roles: ['ref', 'score'] }).evidence);
    check('suggest ٢: «منهم بدور» لا يزيد على عددهم', E.fieldOf({ exc: 2, excRole: 5 }, {}).role === 2);
    const LG = E.evidenceLog({ M: L40, counts: {}, field: { place: 'open', temp: 41, rh: 30, exc: 2, excRole: 0 } });
    check('evidence ٥: الحرارة دليلٌ بلا حكم، وبلا ماءٍ وظلٍّ في الخطر عبارتان سالبتان', LG[5].some(e => /^الحرارة 41° والرطوبة 30% — المحسوسة 45° \(خطر\)/.test(e.text) && !e.pos && !e.neg)
          && E.officialFor(LG, 5, 4).length === 2 && E.officialFor(LG, 5, 4)[0] === 'عدم إتاحة استراحة لشرب الماء في حرارة محسوسة بلغت (45°)', JSON.stringify(LG[5]));
    check('evidence ٢: غير المشاركين بلا دور عبارةٌ سالبة، وبأدوارٍ موجبة', E.officialFor(LG, 2, 4)[0] === 'ترك الطلبة غير المشاركين في الممارسة دون دور في الحصة'
          && E.officialFor(E.evidenceLog({ M: L40, counts: {}, field: { exc: 2, excRole: 2 } }), 2, 2)[0] === 'إشراك الطلبة غير المشاركين في الممارسة بأدوار مساندة كالتحكيم والتسجيل');
    check('evidence: لمسة «استراحة ماء» بوقتها عبارةٌ موجبة', E.evidenceLog({ ev: [{ t: 600, k: 'water' }], counts: { water: 1 }, M: L40 })[5].some(e => e.t === 600 && e.pos === 'إتاحة استراحات لشرب الماء أثناء الممارسة'));
    const dpH = E.debriefPrompts(L40, { heatHit: 1 }, { female: true, field: { place: 'open', temp: 38, rh: 40, exc: 2 } });
    check('debrief: حرٌّ بلا ماء، وإجهادٌ حراريّ، ومعفون بلا دور — أسئلةٌ بصيغة المخاطَب', dpH.ask.some(t => /ولم تُتح استراحة ماءٍ في \(40\) دقيقة\. ما خطّتكِ للماء والظلّ/.test(t))
          && dpH.ask.some(t => /ظهرت علامات إجهادٍ حراريّ على طالب\. ما الذي تفعلينه فوراً/.test(t)) && dpH.ask.some(t => /أيّ دورٍ \(التحكيم، أو التسجيل والتوقيت، أو تنظيم الأدوات\) تسندينه/.test(t)), JSON.stringify(dpH));
    const dpG = E.debriefPrompts(L40, { water: 2 }, { field: { place: 'open', temp: 38, rh: 40, exc: 2, excRole: 2, roles: ['ref'] } });
    check('debrief: ماءٌ منتظم وأدوارٌ للجميع إجادتان', dpG.good.some(t => /أتحت استراحات ماءٍ منتظمة \(2\)/.test(t)) && dpG.good.some(t => /أشركت غير المشاركين بعذر \(2\) بأدوارٍ في الحصة: التحكيم/.test(t)));
    check('summary: الحرارة والماء وغير المشاركين في سطر الملاحظات', /وكانت الحرارة المحسوسة \(43°\) مع استراحة ماءٍ واحدة، وكان غير المشاركين بعذر \(3\)، منهم \(1\) بأدوارٍ في الحصة/.test(E.summaryText(Object.assign({ observed: 2400, activePct: 50 }, L40), { field: { place: 'open', temp: 38, rh: 40, exc: 3, excRole: 1 }, counts: { water: 1 } })));
    const TC = E.targetCandidates({ M: L40, counts: { water: 1 }, field: { place: 'open', temp: 38, rh: 40, exc: 3, excRole: 1 } }, 20);
    check('targets: استراحات الماء وأدوار غير المشاركين أهدافٌ تُقاس', TC.some(t => t.k === 'water' && t.base === 50 && t.goal === 100) && TC.some(t => t.k === 'excRole' && t.base === 33)
          && E.targetCheck({ k: 'water', base: 50, goal: 100 }, { M: L40, counts: {}, field: { temp: 22 } }).verdict === 'na' && E.NEEDS.field);
    check('patterns: حصةٌ حارّة بلا ماء، وإجهادٌ حراريّ، ومعفون بلا دور', ['noWater', 'heatHit', 'excIdle'].every(k => E.issuesOf({ M: L40, counts: { heatHit: 1 }, field: { place: 'open', temp: 38, rh: 40, exc: 2 } }).includes(k)));
    // الحيّ: عشرون دقيقةً بلا ماءٍ في الحرّ
    const rec = { secs: Array.from({ length: 1260 }, () => ({ m: 0.05, v: false, w: false })), sens: 'medium' };
    const LV = E.live(rec, E.summarize(rec), { wx: { cat: 3, hi: 43, last: null } });
    check('live: عشرون دقيقةً بلا استراحة ماءٍ في الخطر ← تنبيهٌ أحمر', LV.alerts.some(a => a.k === 'water' && a.level === 'bad' && /مضت \(21\) دقيقة بلا استراحة ماء — الحرارة المحسوسة \(43°\)/.test(a.text)), JSON.stringify(LV.alerts));
    check('live: بلا كاميرا لا تنبيه «الكاميرا تتحرّك» (كلّ الثواني غير محسوبة)', !E.live({ secs: Array.from({ length: 60 }, () => ({ m: null, v: null })), sens: 'medium' }, E.summarize({ secs: Array.from({ length: 60 }, () => ({ m: null, v: null })), sens: 'medium' }), { camera: false }).alerts.some(a => a.k === 'shake')
          && E.live({ secs: Array.from({ length: 60 }, () => ({ m: null, v: null })), sens: 'medium' }, E.summarize({ secs: Array.from({ length: 60 }, () => ({ m: null, v: null })), sens: 'medium' }), {}).alerts.some(a => a.k === 'shake'));
    check('live: واستراحةٌ قريبة تُسكته', !E.live(rec, E.summarize(rec), { wx: { cat: 3, hi: 43, last: 1000 } }).alerts.some(a => a.k === 'water'));
    check('tags: الماء والظلّ والإجهاد الحراريّ في «السلامة والموارد» للبند ٥', ['water', 'shade', 'heatHit'].every(k => E.TAG[k] && E.TAG[k].item === 5 && E.GROUPS.find(gp => gp.title === 'السلامة والموارد').keys.includes(k)) && E.TAG.heatHit.neg);

    // التوصيل
    const UI = read('js/eye.js'), RP = read('js/eye-report.js'), CSS = read('styles.css');
    check('wiring: «الأدوات المتقدّمة» في الإعدادات (مطفأةٌ افتراضاً، محفوظة)، والمحرّك يُضبط منها من أوّل تحميل', /chk\('eyeAdv', 'إظهار الأدوات المتقدّمة \(تجريبيّة\)', false/.test(UI)
          && /try \{ if \(E\(\)\) E\(\)\.setAdv\(!!\(readPrefs\(\) \|\| \{\}\)\.eyeAdv\); \}/.test(UI) && /loadPrefs\(\);\s*\n\s*applyAdv\(\);/.test(UI) && /toggleAttribute\('data-eye-pro', checked\('eyeAdv'\)\)/.test(UI));
    check('wiring: المخفيّ بقاعدةٍ واحدة: «تحديد المعلّم» وبطاقتا التشكيل والزيّ', /#eyeBody:not\(\[data-eye-pro\]\) \.eye-advtool \{ display: none !important; \}/.test(CSS) && /id="eyeTeacherBtn" class="eye-adv eye-advtool/.test(UI)
          && /kpi\('eyeKpiForm', 'التشكيل', true\)/.test(UI) && /kpi\('eyeKpiDish', 'بغير الزيّ \(تقديري\)', true\)/.test(UI));
    check('wiring: الزيّ من الكشف لا يُقترح، وSOFIT+ والشدّة والتزاحم وموقع المعلّم لا تُعرض بلا المتقدّم', /if \(E\(\)\.isAdv\(\) && M\.people && M\.people\.dishEst > 0/.test(UI)
          && /if \(E\(\)\.isAdv\(\) && vg != null && mv != null\) rows\.push\(row\('شدّة النشاط'/.test(UI) && /const TS = E\(\)\.isAdv\(\) \? P\.teacher : null;/.test(UI)
          && /const SPx = E\(\)\.isAdv\(\) \? E\(\)\.sofitPlus\(d\) : null/.test(UI) && /const SP = S\.result && E\(\)\.isAdv\(\) \? E\(\)\.sofitPlus\(S\.result\) : null;/.test(UI));
    check('wiring: بطاقة «الحرارة والمشاركة» في العمود الجانبيّ (تظهر في الوضع المبسّط): المكان والحرارة والرطوبة، والوسوم الثلاثة، والعدّادان والأدوار', /<section id="eyeField" class="bg-white/.test(UI)
          && ['eyeWxPlace', 'eyeWxTemp', 'eyeWxRh', 'eyeWxCat', 'eyeWxLast', 'eyeExcRoles'].every(id => UI.includes('id="' + id + '"')) && /\['water', 'shade', 'heatHit'\]\.map\(tagRowHtml\)/.test(UI));
    check('wiring: تُحفظ مع النتيجة وفي النسخة الاحتياطيّة، وتعود عند الفتح والاستكمال، وتُصفَّر', /field: JSON\.parse\(JSON\.stringify\(S\.field\)\),/.test(UI) && /marks: S\.marks, field: S\.field,/.test(UI)
          && /S\.field = Object\.assign\(freshField\(\), R\.field \|\| \{\}\);/.test(UI) && /S\.field = Object\.assign\(freshField\(\), data\.field \|\| \{\}\);/.test(UI) && (UI.match(/S\.field = freshField\(\);/g) || []).length === 2);
    check('wiring: الاقتراح والأدلّة والمداولة تقرأ البطاقة، وتعديلها بعد الرصد يعيد الاقتراح', /field: d && d\.field, counts: d && d\.counts, plan: planCtx\(d\) \}\);/.test(UI) && /marks: S\.marks, field: S\.field, ctx: suggCtx\(\)/.test(UI)
          && /field: d\.field, ctx: ctxOf\(d\)/.test(UI) && /if \(S\.result && !S\.running\) \{ S\.result\.field = JSON\.parse\(JSON\.stringify\(F\)\); resuggest\(\); \}/.test(UI));
    check('wiring: تنبيه الماء الحيّ من البطاقة، والبطاقة للمعلّم فيها الحرارة وغير المشاركين بلا المتقدّم', /roi: !!S\.roi, wx: wxLive\(\) \}\);/.test(UI)
          && /Y\.fieldOf\(data && data\.field/.test(RP) && /const ADV = !Y\.isAdv \|\| Y\.isAdv\(\);/.test(RP) && /if \(ADV && F && F\.count\)/.test(RP));
}

/* ── ٣٩) الدرجة تتبع دليلها في الاستمارة (2026-10-31): الزيّ ← ٤، توزيع الأدوات ← ٧، الاكتشاف والإقصاء ← ٨؛ ولا يقترح فعلُ المعلّم بنود الطلبة ── */
{
    E.setAdv(true);
    const by = (sg, id) => sg.find(x => x.id === id);
    const OF = (log, id, sc) => E.officialFor(log, id, sc, true);
    // ١) الدرجة تتبع البند
    check('evidence: الزيّ وسمٌ للبند ٤ (القيم)، وتوزيع الأدوات للبند ٧، والاكتشاف والإقصاء للبند ٨', E.TAG.dish.item === 4 && E.TAG.equip.item === 7 && E.TAG.discover.item === 8 && E.TAG.elim.item === 8 && E.TAG.elim.neg);
    const d1 = E.suggest({}, { dish: 2 }, {});
    check('evidence: الزيّ وحده يقترح البند ٤ لا ٥', by(d1, 4) && by(d1, 4).score === 3 && !by(d1, 5), JSON.stringify(d1));
    const d2 = E.suggest({}, { dish: 1, praise: 3 }, {});
    check('evidence: الزيّ مع الروح الرياضيّة: أسوأهما (طالبٌ واحد ← جيد، والروح الرياضيّة ثلاثاً ← متميز ← جيد)', by(d2, 4).score === 2 && /روح رياضية واحترام بين الطلبة \(3\) مرّات/.test(by(d2, 4).evidence), by(d2, 4) && by(d2, 4).evidence);
    const lg1 = E.evidenceLog({ ev: [{ t: 30, k: 'dish' }], counts: { dish: 2 } });
    check('evidence: دليل الزيّ الرسميّ للبند ٤، وذكرٌ بلا عبارةٍ تحت البند ٥', OF(lg1, 4, 4).join() === 'مشاركة (2) من الطلبة بغير الزي الرياضي' && lg1[5] && lg1[5].length === 1 && !lg1[5][0].neg && !lg1[5][0].pos);
    const e1 = E.suggest({}, { equip: 1 }, {}), e2 = E.suggest({}, { equip: 2, misbehave: 1 }, {});
    check('evidence: بلا كاميرا: توقّفٌ واحد لتوزيع الأدوات ← البند ٧ «ملائم»، واثنان ← «غير ملائم» ومعه السلوك', by(e1, 7) && by(e1, 7).score === 3 && by(e1, 7).basis === 'taps' && !by(e1, 9)
          && by(e2, 7).score === 4 && /سلوكٌ غير منضبط لم يُعالَج مرّة واحدة/.test(by(e2, 7).evidence), JSON.stringify(e2));
    const lg2 = E.evidenceLog({ ev: [{ t: 60, k: 'equip' }, { t: 90, k: 'misbehave' }], counts: { equip: 1, misbehave: 1 } });
    check('evidence: عبارة توزيع الأدوات للبند ٧ بلفظ الاستمارة، والسلوك دليلٌ للبندين ٤ و٧', OF(lg2, 7, 4).includes('هدر وقت الحصة في توزيع الأدوات وجمعها') && OF(lg2, 7, 4).includes('عدم انضباط سلوك بعض الطلبة دون معالجة')
          && OF(lg2, 4, 4).includes('ظهور سلوك غير رياضي دون معالجة') && !lg2[9]);
    // البند ٧ بالكاميرا: لمستان لتوزيع الأدوات تنزلان درجة
    const secs7 = Array.from({ length: 900 }, (_, i) => ({ m: 9, v: 0 }));
    const M7 = E.summarize({ secs: secs7, grid: [] });
    const a7 = by(E.suggest(M7, {}, {}), 7), b7 = by(E.suggest(M7, { equip: 2 }, {}), 7);
    check('evidence: بالكاميرا توقّفان لتوزيع الأدوات ينزلان البند ٧ درجةً ويُذكران', a7 && b7 && b7.score === a7.score + 1 && /توقّف النشاط لتوزيع الأدوات أو جمعها مرّتين/.test(b7.evidence), JSON.stringify([a7, b7]));
    const s1 = E.suggest({}, { discover: 1 }, {}), s2 = E.suggest({}, { demo: 1, groups: 1, games: 1, elim: 1 }, {}), s3 = E.suggest({}, { elim: 2 }, {});
    check('evidence: الاكتشاف استراتيجيّة (وحده «ملائم»)، والإقصاء ينزل درجة، والإقصاء وحده مرّتين «غير ملائم»', by(s1, 8).score === 3 && /تعلّم بالاكتشاف/.test(by(s1, 8).evidence)
          && by(s2, 8).score === 3 && /وُظّفت لعبة إقصاءٍ تُخرج الطلبة من الممارسة مرّة واحدة/.test(by(s2, 8).evidence) && by(s3, 8).score === 4, JSON.stringify([by(s2, 8), by(s3, 8)]));
    // فرص الممارسة الفعليّة تنقص البند ٨
    const idle = E.summarize({ secs: Array.from({ length: 900 }, (_, i) => ({ m: (i % 100) < 25 ? 0.05 : 0, v: 0 })), grid: [] });
    const p8 = by(E.suggest(idle, { demo: 1, groups: 1 }, {}), 8);
    check('evidence: حركةٌ دون ٣٥٪ من زمن الأنشطة تنزل البند ٨ درجةً وتُذكر', E.movingOf(idle) < 35 && p8.score === 4 && /وقلّت فرص الممارسة الفعليّة: \(\d+%\)/.test(p8.evidence) && p8.basis === 'both', JSON.stringify(p8));

    // ٢) فعل المعلّم لا يقترح بنود الطلبة
    const SPx = { words: 600, clauses: 40, lesson: 1800, corr: { n: 4, spec: 2, specEx: [] }, check: { n: 2, ex: [] }, q: { n: 8, hi: 5, hiEx: [[120, 'ليش نثني الركبة؟']] },
                  praise: { n: 9, spec: 6, specEx: [[200, 'أحسنت ركبتك مثنية']] }, values: { n: 3 }, health: { n: 1 }, safe: { n: 0, ex: [] }, orgShare: 10 };
    const sp = E.suggest({ seconds: 1800, speech: SPx }, {}, {});
    check('evidence: الكلام وحده لا يقترح البند ٣ ولا ٤، ويقترح ١٠ وفيه التعزيز', !by(sp, 3) && !by(sp, 4) && by(sp, 10) && /وسُمع تعزيزٌ لفظيّ \(9\) مرّات منه \(6\) بما أجاده الطالب تحديداً/.test(by(sp, 10).evidence), JSON.stringify(sp.map(x => x.id)));
    const sp3 = by(E.suggest({ seconds: 1800, speech: SPx }, { lead: 1 }, {}), 3), sp4 = by(E.suggest({ seconds: 1800, speech: SPx }, { praise: 1 }, {}), 4);
    check('evidence: مع لمسةٍ واحدة: الكلام يُذكر ولا يغيّر الدرجة (٣ و٤ «جيد/ملائم» من اللمسات وحدها)', sp3.score === 3 && sp3.basis === 'taps' && /تستثير التفكير/.test(sp3.evidence)
          && sp4.score === 2 && sp4.basis === 'taps' && /حثّ المعلم على القيم والروح الرياضيّة \(3\) مرّات/.test(sp4.evidence) && /ربط المعلم النشاط بالصحّة مرّة واحدة/.test(sp4.evidence), JSON.stringify([sp3, sp4]));
    const lgS = E.evidenceLog({ M: { speech: SPx } });
    check('evidence: أسئلة المعلّم وتعزيزه المحدّد أدلّةٌ للبند ١٠ لا ٣ و٤', !lgS[3] && !lgS[4] && OF(lgS, 10, 2).includes('طرح أسئلة شفهية تستثير تفكير الطلبة في أداء المهارة') && OF(lgS, 10, 2).includes('تعزيز الطلبة بعبارات محددة تبين ما أجادوه'));
    check('evidence: المؤشّران «التعزيز المحدّد» و«الأسئلة المفكّرة» للبند ١٠، و«الزيّ» للبند ٤', E.METRIC.praiseSpec.item === 10 && E.METRIC.qHi.item === 10 && E.METRIC.dish.item === 4);

    // ٣) أدلّةٌ لبنودها الأخرى في الاستمارة
    const lg3 = E.evidenceLog({ ev: [{ t: 10, k: 'peer' }, { t: 20, k: 'fbGrp' }, { t: 30, k: 'fbMiss' }], counts: { peer: 1, fbGrp: 1, fbMiss: 1 } });
    check('evidence: تقويم الأقران دليلٌ للبند ٣، والأخطاء الشائعة وتكرارها للبند ٢ — بعبارات الاستمارة', OF(lg3, 3, 2).join() === 'تقييم الطلبة أداءهم وأداء زملائهم'
          && OF(lg3, 2, 2).join() === 'تصحيح الأخطاء الشائعة أثناء الممارسة' && OF(lg3, 2, 4).join() === 'تكرار الأخطاء الفنية دون تصحيح' && OF(lg3, 10, 2).length === 2);
    const pe = E.suggest({}, { peer: 1, team: 1 }, {});
    check('evidence: تقويم الأقران يقترح البند ٣ مع المواقف الأخرى، ويبقى في البند ١٠', by(pe, 3).score === 2 && /تقويم الطلبة أداءهم وأداء زملائهم/.test(by(pe, 3).evidence) && /تقويماً ذاتياً أو بين الأقران/.test(by(pe, 10).evidence));
    check('evidence: الثقة تعدّ الوسم في بنوده الأخرى', E.confidence({ id: 3, basis: 'taps' }, {}, { peer: 2, lead: 2 }) === 'high' && E.confidence({ id: 7, basis: 'taps' }, {}, { equip: 1, misbehave: 1 }) === 'medium');
    // المساحة والصفّارة للبند ٩
    const MS = { observed: 900, space: { coverage: 30, concentration: 72 }, cued: 3 };
    const lg4 = E.evidenceLog({ M: MS });
    check('evidence: تركّز الحركة والصفّارة دليلان للبند ٩ لا ٥', OF(lg4, 9, 4).join() === 'عدم استثمار المساحة المتاحة إذ تركزت الممارسة في جزء محدود منها'
          && OF(lg4, 9, 2).includes('استخدام الصافرة بفاعلية في تنظيم بدء الأنشطة وإيقافها') && !lg4[5]);
    check('evidence: مساحةٌ واسعةٌ بلا تركّز دليلٌ موجب، والرصد القصير لا يُحكم منه', E.spaceOf({ observed: 900, space: { coverage: 80, concentration: 35 } }) === 'wide' && E.spaceOf({ observed: 200, space: { coverage: 30, concentration: 80 } }) === null);
    const g9 = by(E.suggest(Object.assign({}, MS, { activePct: 50, activeSec: 450 }), { tools: 1 }, {}), 9);
    check('evidence: البند ٩ يذكر المساحة والصفّارة ولا تغيّران درجته', g9.score === 2 && /وتركّزت الحركة في جزءٍ محدود من المساحة \(72% منها في خُمسها\)/.test(g9.evidence) && /ونُظّم \(3\) انتقالات بالصفّارة/.test(g9.evidence), g9.evidence);
    const g5 = E.suggest(Object.assign({}, MS, { activePct: 50 }), { safe: 1 }, {});
    check('evidence: البند ٥ لم يعد يذكر تركّز الحركة', by(g5, 5) && !/تركّزت/.test(by(g5, 5).evidence));
    const mb = E.evidenceLog({ ev: [{ t: 5, k: 'misbehave' }], counts: { misbehave: 1 } });
    check('evidence: السلوك السلبيّ دليلٌ سالبٌ للبند ٧ بلفظ الاستمارة', OF(mb, 7, 4).join() === 'عدم انضباط سلوك بعض الطلبة دون معالجة');

    // ٤) وسومٌ لأدلّة الاستمارة التي لم يكن لها وسم
    const NEW = ['rules', 'answers', 'roles', 'fairplay', 'respectRef', 'clean', 'checkTools', 'firstAid', 'tech', 'altTools', 'obsCard', 'record', 'tOnTime', 'tLate', 'tKit'];
    const ITEM = { rules: 1, answers: 1, roles: 3, fairplay: 4, respectRef: 4, clean: 4, checkTools: 5, firstAid: 5, tech: 9, altTools: 9, obsCard: 10, record: 10, tOnTime: 12, tLate: 12, tKit: 12 };
    check('evidence: الوسوم الجديدة الخمسة عشر ببنودها، ولكلٍّ عبارةٌ رسميّة، وفي مجموعة', NEW.every(k => E.TAG[k] && E.TAG[k].item === ITEM[k] && E.EV_TAG[k] && (E.EV_TAG[k].pos || E.EV_TAG[k].neg)
          && E.GROUPS.filter(gp => gp.keys.includes(k)).length === 1) && E.TAG.tLate.neg, NEW.find(k => !E.TAG[k] || E.TAG[k].item !== ITEM[k]));
    check('evidence: المجموعات الستّ بعناوينها', E.GROUPS.map(gp => gp.title).join('|') === 'التدريس|التقويم|تعلّم الطلبة|القيم والسلوك|السلامة والموارد|التزام المعلّم');
    const allPh = [];
    Object.values(E.EV_TAG).forEach(r => { [r.pos, r.neg].forEach(x => x && allPh.push(x)); Object.values(r.on || {}).forEach(o => [o.pos, o.neg].forEach(x => x && allPh.push(x))); });
    check('evidence: كلّ العبارات (ومنها عبارات البنود الأخرى) بلا تشكيلٍ ولا «المعلم» ولا وسوم', allPh.length > 40 && allPh.every(x => !/[ً-ْ]/.test(x) && !/معلم/.test(x) && !/[<>]/.test(x)), allPh.find(x => /[ً-ْ]|معلم|[<>]/.test(x)));
    check('evidence: كلّ بندٍ في «also» له عبارةٌ هناك', E.TAGS.every(t => (t.also || []).every(id => E.EV_TAG[t.k].on && E.EV_TAG[t.k].on[id] && (E.EV_TAG[t.k].on[id].pos || E.EV_TAG[t.k].on[id].neg))));
    const v4 = E.suggest({}, { fairplay: 1, respectRef: 1, clean: 1 }, {});
    check('evidence: المصافحة واحترام الحكم والنظافة تقترح البند ٤ (ثلاثٌ ← متميز)', by(v4, 4).score === 1 && /مصافحة وتقبّل الفوز والخسارة مرّة واحدة/.test(by(v4, 4).evidence), by(v4, 4) && by(v4, 4).evidence);
    const f5 = E.suggest({}, { safe: 1, checkTools: 1, firstAid: 1 }, {}), f5b = E.suggest({}, { firstAid: 1, hazard: 1 }, {});
    check('evidence: التهيئة وفحص الأدوات والإسعافات معاً ← البند ٥ «متميز»، ومع موقفٍ خطر «ملائم»', by(f5, 5).score === 1 && /فُحصت الأدوات قبل استخدامها/.test(by(f5, 5).evidence) && /حقيبة إسعافاتٍ أوّليّة/.test(by(f5, 5).evidence)
          && by(f5b, 5).score === 3, JSON.stringify([by(f5, 5), by(f5b, 5)]));
    const t9 = E.suggest({}, { tech: 1, tools: 1 }, {}), t9b = E.suggest({}, { tech: 1 }, {}), t9c = E.suggest({}, { altTools: 1 }, {});
    check('evidence: التقانة مع أدواتٍ كافية ← البند ٩ «متميز» (المستوى ١ في الاستمارة)، ووحدها «جيد»، والبديلة «جيد»', by(t9, 9).score === 1 && by(t9b, 9).score === 2 && by(t9c, 9).score === 2
          && /وظّف المعلم التقانة \(فيديو أو صور\) لتوضيح المهارة/.test(by(t9, 9).evidence) && /استُخدمت أدواتٌ بديلة/.test(by(t9c, 9).evidence));
    const r10 = by(E.suggest({}, { obsCard: 1, record: 1, fbInd: 1 }, {}), 10);
    check('evidence: بطاقة الملاحظة والسجلّ أساليب تقويم في البند ١٠', /بطاقة ملاحظةٍ لتقييم المهارة مرّة واحدة/.test(r10.evidence) && /رصداً للأداء في سجل المتابعة/.test(r10.evidence) && r10.score === 3, r10.evidence);
    const ro = by(E.suggest({}, { roles: 1, lead: 1, tactic: 1 }, {}), 3);
    check('evidence: الالتزام بالأدوار موقفٌ في البند ٣ (ثلاثةٌ ← متميز)', ro.score === 1 && /التزام الطلبة بأدوارهم في الفريق/.test(ro.evidence));
    const k1 = E.suggest({}, { rules: 2, answers: 1, tOnTime: 1, tKit: 1 }, {});
    check('evidence: وسوم البندين ١ و١٢ أدلّةٌ للوصف لا تقترح مستوى', !by(k1, 1) && !by(k1, 12) && /التزام المعلّم/.test(E.NOT_SEEN[12]));
    const lg5 = E.evidenceLog({ ev: [{ t: 1, k: 'tOnTime' }, { t: 5, k: 'tKit' }, { t: 9, k: 'rules' }, { t: 12, k: 'tLate' }], counts: {} });
    check('evidence: وسوم ١ و١٢ تصل إلى «ويتضح ذلك من خلال …» بمستواها', OF(lg5, 12, 2).join('|') === 'الالتزام بموعد بدء الحصة|ارتداء الزي الرياضي المناسب واللائق' && OF(lg5, 12, 4).join() === 'التأخر عن موعد بدء الحصة'
          && OF(lg5, 1, 2).join() === 'تطبيق الطلبة القانون المرتبط بالمهارة أثناء اللعب');
    const SSm = { n: 6, a: '', b: '333322' };
    const i1 = by(E.suggest({}, { rules: 2, answers: 1 }, { sample: SSm }), 1);
    check('evidence: البند ١ من العيّنة يذكر تطبيق القانون والإجابات المعرفيّة', i1 && /وطبّق الطلبة القانون المرتبط بالمهارة أثناء اللعب مرّتين، وأجابوا عن الأسئلة المعرفية المرتبطة بالدرس مرّة واحدة/.test(i1.evidence), i1 && i1.evidence);
    check('evidence: سبب ما لم يُقترح للبندين ٣ و٤ يقول إنّ فعل المعلّم وحده لا يقترحهما', E.unsupported([], {}).find(x => x.id === 3).why.includes('أسئلة المعلّم وحدها') && E.unsupported([], {}).find(x => x.id === 4).why.includes('تعزيز المعلّم'));

    // ٥) البند ٦ والخطّة الفصليّة
    check('plan: الموضوع العامّ ومهارته («لعبة كرة القدم» ← «التصويب بوجه القدم الخارجي») يتوافقان', E.planMatch('التصويب بوجه القدم الخارجي', ['لعبة كرة القدم']) === 'match');
    check('plan: «دفع الجلة» يوافق «دفع الجلة بطريقة الزحف»، و«الاتزان على العارضة» يوافق «الاتزان»', E.planMatch('دفع الجلة', ['دفع الجلة بطريقة الزحف']) === 'match' && E.planMatch('الاتزان على العارضة', ['الاتزان']) === 'match');
    check('plan: مهارةٌ بلا اسم لعبتها («التمريرة الصدرية» ← «لعبة كرة السلة») لا يُحكم بخلافها — يؤكّده المشرف', E.planMatch('التمريرة الصدرية', ['لعبة كرة السلة']) === 'differ' && E.planMatch('التمريرة الصدرية في كرة السلة', ['لعبة كرة السلة']) === 'match');
    check('plan: كلمةٌ مشتركةٌ واحدة من كلمتين «غير واضح»، وعنوانٌ عامّ («كرة») لا يكفي، وأحد الموضوعات المتعدّدة يكفي', E.planMatch('الوثب الطويل', ['الوثب العالي بالطريقة الظهرية']) === 'unclear'
          && E.planMatch('كرة', ['لعبة كرة القدم']) !== 'match' && E.planMatch('خطط اللعب الهجومية', ['طرق اللعب في كرة القدم', 'خطط اللعب في كرة القدم']) === 'match' && E.planMatch('', ['x']) === null);
    check('plan: الموضوع المركّب بـ«/» يُقارن بكلّ جزء', E.planMatch('التمريرة الحائطية', ['تطبيقات ومنافسات عملية / التمريرة الحائطية']) === 'match');
    const M6 = E.summarize({ secs: Array.from({ length: 1500 }, (_, i) => ({ m: i % 4 ? 9 : 0, v: 0 })), grid: [] });
    const p6a = by(E.suggest(M6, {}, { plan: { topic: 'دفع الجلة', planned: ['دفع الجلة بطريقة الزحف'], match: true } }), 6);
    const p6b = by(E.suggest(M6, {}, { plan: { topic: 'الوثب الطويل', planned: ['دفع الجلة بطريقة الزحف'], match: false } }), 6);
    const p6c = by(E.suggest(M6, {}, { plan: { topic: 'الوثب الطويل', planned: ['دفع الجلة بطريقة الزحف'], match: null } }), 6);
    const p60 = by(E.suggest(M6, {}, {}), 6);
    check('plan: البند ٦ يذكر التوافق ولا يرفعه، وعدم التوافق المؤكَّد ينزله درجة، وغير المؤكَّد لا يُذكر', p60 && p6a.score === p60.score && /ووافق عنوان الدرس موضوع الأسبوع في الخطة الفصليّة \(«دفع الجلة بطريقة الزحف»\)/.test(p6a.evidence)
          && p6b.score === p60.score + 1 && /ولم يوافق عنوان الدرس «الوثب الطويل» موضوع الأسبوع/.test(p6b.evidence) && p6c.evidence === p60.evidence, JSON.stringify([p60, p6a, p6b]));
    check('plan: الخطّة وحدها لا تقترح البند ٦', !by(E.suggest({}, {}, { plan: { topic: 'x', planned: ['y'], match: false } }), 6));
    const lg6 = E.evidenceLog({ ctx: { plan: { topic: 'دفع الجلة', planned: ['دفع الجلة بطريقة الزحف'], match: true } } });
    const lg6b = E.evidenceLog({ ctx: { plan: { topic: 'الوثب', planned: ['دفع الجلة بطريقة الزحف'], match: false } } });
    const lg6c = E.evidenceLog({ ctx: { plan: { topic: 'الوثب', planned: ['دفع الجلة بطريقة الزحف'], match: null } } });
    check('plan: دليل البند ٦ بلفظ الاستمارة («التوافق مع الخطة الفصلية» / «عدم توافق الدرس مع الخطة الفصلية»)، وغير المؤكَّد لا دليل', OF(lg6, 6, 2).join() === 'التوافق مع الخطة الفصلية وتوزيع الوحدات'
          && OF(lg6b, 6, 4).join() === 'عدم توافق الدرس مع الخطة الفصلية' && lg6[6][0].src === 'plan' && !lg6c[6]);

    // التوصيل
    const UI = read('js/eye.js');
    check('wiring: الخطّة من term-plan.js (الصفّ والتاريخ والعنوان من النموذج)، وما ليس واضحاً باختيار المشرف لعنوانٍ بعينه', /function planInfo\(\)/.test(UI) && /TP\.lessonsFor\(PLN, grade, date, ''\)/.test(UI)
          && /const ov = d && d\.planOk && d\.planOk\.topic === p\.topic \? d\.planOk\.v : null;/.test(UI) && /const suggCtx = \(\) => \(\{ female: female\(\), pupil, plan: planCtx\(null\) \}\);/.test(UI));
    check('wiring: صفّ «الخطة الفصليّة» في النتيجة يعيد الاقتراح، والمصدر «الخطة الفصليّة»', /id="eyePlanOk"/.test(UI) && /S\.result\.planOk = \{ v, topic: p\.topic \}; else delete S\.result\.planOk;\s*\n\s*resuggest\(\);/.test(UI) && /plan: 'الخطة الفصليّة' \};/.test(UI));
}

Promise.all(PENDING).catch(e => { failures++; console.log('FAIL async: ' + (e && e.message)); }).then(() => {
    console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
    process.exit(failures ? 1 : 0);
});
