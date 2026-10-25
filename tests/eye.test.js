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

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
