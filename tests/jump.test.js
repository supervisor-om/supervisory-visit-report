// عدّاد القفز (js/jump-core.js)
// مشهدٌ مصنوع: خلفيّةٌ ثابتة بنقشٍ عشوائيّ، و«لاعبٌ» بنقشه يتحرّك رأسيّاً كما يُطلب، وضجيج كاميرا. الصندوق يُحدَّث كلّ ٠٫٢ ث كالكشف.
// node tests/jump.test.js
const J = require('../js/jump-core.js');

let failures = 0;
function check(name, ok, info) { if (ok) console.log('PASS ' + name); else { failures++; console.log('FAIL ' + name + (info ? '  — ' + info : '')); } }

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const W = 240, H = 135;

// motion(t) ← إزاحة اللاعب للأعلى بالبكسل (موجبٌ صعود، سالبٌ نزول)، و xMotion(t) ← إزاحته أفقيّاً
function scene(opts) {
    const o = Object.assign({ fps: 30, dur: 20, ph: 90, pw: 40, px: 100, top: 32, noise: 3, flicker: 0, dup: 1, seed: 7, motion: () => 0, xMotion: () => 0, det: 0.2, arms: null }, opts);
    const R = rng(o.seed), bg = new Uint8Array(W * H), pat = new Uint8Array(o.pw * o.ph);
    for (let i = 0; i < bg.length; i++) bg[i] = 60 + Math.floor(R() * 120);
    // جسمٌ بطبقاتٍ رأسيّة (رأسٌ وجذعٌ وساقان) ونقش
    for (let y = 0; y < o.ph; y++) for (let x = 0; x < o.pw; x++) {
        const band = y < o.ph * 0.15 ? 200 : y < o.ph * 0.55 ? 40 : 120;
        pat[y * o.pw + x] = Math.max(0, Math.min(255, band + Math.floor((R() - 0.5) * 60)));
    }
    const frame = (t) => {
        const g = new Uint8Array(bg), dy = Math.round(o.motion(t)), dx = Math.round(o.xMotion(t));
        const fl = o.flicker ? Math.round(o.flicker * Math.sin(t * 7)) : 0;
        for (let y = 0; y < o.ph; y++) {
            const Y = o.top - dy + y;
            if (Y < 0 || Y >= H) continue;
            for (let x = 0; x < o.pw; x++) { const X = o.px + dx + x; if (X >= 0 && X < W) g[Y * W + X] = pat[y * o.pw + x]; }
        }
        // يدان فوق الرأس تتحرّكان رأسيّاً (arms(t) بالبكسل) والجسم ثابت
        if (o.arms) { const ay = o.top - dy - Math.round(o.ph * 0.18) - Math.round(o.arms(t)); for (let y = ay; y < ay + 8; y++) for (let x = o.px + 4; x < o.px + o.pw - 4; x++) if (y >= 0 && y < H && (x - o.px) % 16 < 9) g[y * W + x] = 230; }
        for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, g[i] + fl + Math.round((R() - 0.5) * 2 * o.noise)));
        return g;
    };
    // الحلقة كما في الصفحة: الصندوق من آخر «كشف»، والبصمتان على النافذة نفسها
    const st = J.newJumper();
    let n = 0, prev = null, box = null, lastDet = -1;
    const steps = Math.round(o.dur * o.fps);
    for (let k = 0; k <= steps; k++) {
        const tCam = k / o.fps, g = frame(tCam);
        for (let d = 0; d < o.dup; d++) {             // إطارٌ مكرّر (الصفحة ترسم أسرع من الكاميرا)
            const t = tCam + d / (o.fps * o.dup);
            if (lastDet < 0 || t - lastDet >= o.det) {
                lastDet = t;
                box = { x: o.px + Math.round(o.xMotion(t)), y: o.top - Math.round(o.motion(t)), w: o.pw, h: o.ph };
            }
            if (prev) {
                const c0 = Math.round(box.x + box.w * 0.2), c1 = Math.round(box.x + box.w * 0.8);
                const r0 = Math.round(box.y - box.h * 0.25), r1 = Math.round(box.y + box.h * 1.05);
                const s = o.old ? J.shift(J.profile(prev, W, H, c0, c1, r0, r1), J.profile(g, W, H, c0, c1, r0, r1), Math.max(4, Math.round(box.h * 0.22)))
                    : J.measure(prev, g, W, H, c0, c1, r0, r1, Math.max(4, Math.round(box.h * 0.22)));
                if (J.step(st, s, box.h, t)) n++;
            }
            prev = g;
        }
    }
    return n;
}
// قفزاتٌ منتظمة: في الهواء airT من كلّ دورة، بقوسٍ (قطعٍ مكافئ) ارتفاعه A بكسل
const jumps = (hz, airT, A, start) => t => {
    if (t < (start || 1)) return 0;
    const P = 1 / hz, u = ((t - (start || 1)) % P);
    if (u >= airT) return 0;
    const q = u / airT;
    return A * 4 * q * (1 - q);
};
const expectJumps = (hz, dur, start) => Math.floor((dur - (start || 1)) * hz);

/* ١) القفز المنتظم */
{
    const exp = expectJumps(1.6, 20);
    const n = scene({ motion: jumps(1.6, 0.4, 13) });
    check('قفزٌ منتظم (١٫٦ في الثانية، ١٤٪ من الطول) ← ' + exp, Math.abs(n - exp) <= 1, 'عُدّ ' + n);
    const n2 = scene({ motion: jumps(2.2, 0.3, 7) });
    const e2 = expectJumps(2.2, 20);
    check('قفزٌ صغيرٌ سريع (٢٫٢ في الثانية، ٨٪) ← ' + e2, Math.abs(n2 - e2) <= 2, 'عُدّ ' + n2);
    // قفزٌ خفيفٌ سريع كما يقفز الزوّار في المكان: ٠٫٢٢ ث في الهواء (٦ سم ≈ ٣٫٥٪) ٢٫٥ في الثانية — لاعبٌ قريب طوله ١١٠ بكسلاً (الصورة بعرض ٤٨٠)
    const n4 = scene({ motion: jumps(2.5, 0.22, 4), ph: 110, pw: 44, top: 14 });
    check('قفزٌ خفيفٌ سريع (٢٫٥ في الثانية، ٣٫٥٪) ← ' + expectJumps(2.5, 20), Math.abs(n4 - expectJumps(2.5, 20)) <= 2, 'عُدّ ' + n4);
    // ومعه انثناء الركبتين عند كلّ هبوط (٣٪ تحت الوقوف) — الهبوط لا يُنسي مستوى الوقوف ولا يحجب القفزة التالية
    const bend = t => { if (t < 1) return 0; const u = (t - 1) % 0.4; return u < 0.22 ? jumps(2.5, 0.22, 4.5)(t) : u < 0.37 ? -3.3 * Math.sin(Math.PI * (u - 0.22) / 0.15) : 0; };
    const n5 = scene({ motion: bend, ph: 110, pw: 44, top: 14, seed: 5 });
    check('قفزٌ خفيفٌ بانثناء الركبتين عند الهبوط ← ' + expectJumps(2.5, 20), Math.abs(n5 - expectJumps(2.5, 20)) <= 2, 'عُدّ ' + n5);
    const n3 = scene({ motion: jumps(1.2, 0.5, 24), seed: 11 });
    check('قفزٌ عالٍ (٢٧٪) ← ' + expectJumps(1.2, 20), Math.abs(n3 - expectJumps(1.2, 20)) <= 1, 'عُدّ ' + n3);
}
/* ٢) كاميرا أبطأ، وإطاراتٌ مكرّرة، وكشفٌ أبطأ */
{
    const exp = expectJumps(1.6, 20);
    check('١٥ إطاراً في الثانية', Math.abs(scene({ fps: 15, motion: jumps(1.6, 0.4, 13) }) - exp) <= 1);
    check('إطارٌ مكرّر (رسمٌ ٦٠ والكاميرا ٣٠)', Math.abs(scene({ dup: 2, motion: jumps(1.6, 0.4, 13) }) - exp) <= 1);
    check('كشفٌ كلّ نصف ثانية', Math.abs(scene({ det: 0.5, motion: jumps(1.6, 0.4, 13) }) - exp) <= 1);
    check('لاعبٌ أبعد (طوله ٤٥ بكسلاً)', Math.abs(scene({ ph: 45, pw: 20, top: 60, motion: jumps(1.6, 0.4, 7) }) - exp) <= 1);
}
/* ٣) ما ليس قفزاً */
{
    check('وقوفٌ ساكن ← ٠', scene({}) === 0);
    check('وقوفٌ وضجيجٌ شديد ← ٠', scene({ noise: 9 }) === 0);
    check('ضوءٌ يتذبذب ← ٠', scene({ flicker: 12 }) === 0);
    // قرفصاء بطيئة: ينزل ١٨٪ ثمّ يقوم، دورةٌ كلّ ثانيتين
    const squat = t => -16 * (1 - Math.cos(2 * Math.PI * 0.5 * t)) / 2;
    check('قرفصاءٌ بطيئة ← ٠', scene({ motion: squat }) === 0, 'عُدّ ' + scene({ motion: squat }));
    const squat2 = t => -16 * (1 - Math.cos(2 * Math.PI * 0.7 * t)) / 2;
    check('قرفصاءٌ متتابعة (دورةٌ كلّ ١٫٤ ث) ← ٠', scene({ motion: squat2 }) === 0, 'عُدّ ' + scene({ motion: squat2 }));
    // اهتزازٌ رأسيٌّ صغيرٌ في الوقوف (٢٫٧٪ من الطول، نحو ٤ سم) — أمّا الارتداد الأكبر (٥٪ فأكثر) فيُعدّ قفزةً خفيفة: «لا يحتاج الدقّة»
    check('اهتزازٌ صغيرٌ في الوقوف ← ٠', scene({ motion: t => 1.2 * Math.sin(2 * Math.PI * 1.5 * t) }) === 0, 'عُدّ ' + scene({ motion: t => 1.2 * Math.sin(2 * Math.PI * 1.5 * t) }));
    // يلوّح بذراعيه فوق رأسه وجسمه واقف (القياس على ما تغيّر يرى اليدين وحدهما — القفزة تحرّك الساقين أيضاً)
    const wave = t => 9 * (1 - Math.cos(2 * Math.PI * 1.5 * t)) / 2;
    check('يلوّح بيديه فوق رأسه واقفاً ← ٠', scene({ arms: wave }) === 0, 'عُدّ ' + scene({ arms: wave }));
    check('يقفز ويلوّح بيديه معاً ← ' + expectJumps(1.6, 20), Math.abs(scene({ arms: wave, motion: jumps(1.6, 0.4, 13) }) - expectJumps(1.6, 20)) <= 1, 'عُدّ ' + scene({ arms: wave, motion: jumps(1.6, 0.4, 13) }));
    // مشيٌ جانبيٌّ عبر الصورة
    check('مشيٌ جانبيّ ← ٠', scene({ xMotion: t => (t * 25) % 90 - 45, px: 100 }) <= 1);
    // صعودٌ بلا هبوط (اقترب من الكاميرا أو صعد درجة)
    check('صعودٌ بلا رجوع ← ٠', scene({ motion: t => (t > 3 ? Math.min(14, (t - 3) * 40) : 0) }) === 0);
}
/* ٣ب) ما أوقف العدّ في تجربة المشرف (2026-11-07 «لا يحسب القفزات»): انحرافٌ بطيءٌ والطالب يقفز بلا توقّف، وقفزٌ خفيفٌ قصير */
{
    const j6 = jumps(2, 0.32, 6), e6 = expectJumps(2, 20);
    check('قفزٌ متواصل وانحرافٌ نازلٌ (٠٫٧ صفٍّ/ث — يتراجع وهو يقفز) ← ' + e6, Math.abs(scene({ motion: t => j6(t) - 0.7 * t }) - e6) <= 1, 'عُدّ ' + scene({ motion: t => j6(t) - 0.7 * t }));
    check('قفزٌ متواصل وانحرافٌ نازلٌ أسرع (١٫٢ صفٍّ/ث) ← ' + e6, Math.abs(scene({ motion: t => j6(t) - 1.2 * t }) - e6) <= 1, 'عُدّ ' + scene({ motion: t => j6(t) - 1.2 * t }));
    check('قفزٌ متواصل وانحرافٌ صاعد ← ' + e6, Math.abs(scene({ motion: t => j6(t) + 1.2 * t }) - e6) <= 1);
    // قفزٌ خفيفٌ قصير: خُمس ثانيةٍ في الهواء، ٣٪ من الطول
    const n7 = scene({ motion: jumps(2.5, 0.2, 3), ph: 100, pw: 40, top: 18 });
    check('قفزٌ خفيفٌ قصير (٣٪، خُمس ثانية) ← ' + expectJumps(2.5, 20), Math.abs(n7 - expectJumps(2.5, 20)) <= 2, 'عُدّ ' + n7);
    // ومعه الانثناء قبل الإقلاع وبعد الهبوط والانحراف معاً
    const cm = t => { if (t < 1) return 0; const u = (t - 1) % 0.5; return u < 0.1 ? -3 * Math.sin(Math.PI * u / 0.1) : u < 0.42 ? jumps(2, 0.32, 7)(1 + u - 0.1) : -3 * Math.sin(Math.PI * (u - 0.42) / 0.08); };
    check('انثناءٌ قبل كلّ قفزةٍ وبعدها وانحراف ← ' + e6, Math.abs(scene({ motion: t => cm(t) - 0.8 * t }) - e6) <= 1, 'عُدّ ' + scene({ motion: t => cm(t) - 0.8 * t }));
}
/* ٤) الدالّتان */
{
    const g = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) g[r * W + c] = r * 2;
    const p = J.profile(g, W, H, 10, 20, 5, 15);
    check('profile: متوسّط الصفّ داخل الأعمدة', p.length === 10 && p[0] === 10 && p[9] === 28);
    const a = new Float32Array(60), b = new Float32Array(60);
    for (let i = 0; i < 60; i++) { a[i] = Math.sin(i * 0.7) * 50 + (i % 7) * 9; }
    for (let i = 0; i < 60; i++) b[i] = a[Math.min(59, i + 3)];
    check('shift: محتوى صعد ٣ صفوف ← +٣', Math.abs(J.shift(a, b, 8) - 3) < 0.6, J.shift(a, b, 8));
    for (let i = 0; i < 60; i++) b[i] = a[Math.max(0, i - 2)];
    check('shift: نزل صفّين ← −٢', Math.abs(J.shift(a, b, 8) + 2) < 0.6, J.shift(a, b, 8));
    check('shift: نافذةٌ ملساء ← ٠', J.shift(new Float32Array(40).fill(90), new Float32Array(40).fill(91), 6) === 0);
    // measure: ما تغيّر وحده — خلفيّةٌ ثابتةٌ قويّة الخطوط لا تجذبه إلى الصفر
    const MW = 120, MH = 100, bgm = new Uint8Array(MW * MH), R2 = rng(11);
    for (let r = 0; r < MH; r++) for (let c = 0; c < MW; c++) bgm[r * MW + c] = (r % 12 < 6 ? 40 : 210) + Math.floor(R2() * 10);    // خطوطٌ أفقيّةٌ قويّة
    const draw = dy => { const g2 = new Uint8Array(bgm); for (let r = 30; r < 80; r++) for (let c = 50; c < 70; c++) { const rr = r - dy; if (rr >= 0 && rr < MH) g2[rr * MW + c] = 100 + ((r * 7 + c * 3) % 40); } return g2; };
    const m3 = J.measure(draw(0), draw(3), MW, MH, 40, 80, 15, 90, 10), m2 = J.measure(draw(0), draw(-2), MW, MH, 40, 80, 15, 90, 10);
    check('measure: صعد ٣ صفوف أمام خطوطٍ ثابتة ← +٣', Math.abs(m3 - 3) < 0.6, m3);
    check('measure: نزل صفّين ← −٢', Math.abs(m2 + 2) < 0.6, m2);
    check('measure: لا شيء تغيّر ← ٠', J.measure(draw(0), draw(0), MW, MH, 40, 80, 15, 90, 10) === 0);
    const pm3 = J.shift(J.profile(draw(0), MW, MH, 40, 80, 15, 90), J.profile(draw(3), MW, MH, 40, 80, 15, 90), 10);
    check('measure يصيب حيث تخطئ البصمة القديمة (خطوطٌ ثابتة) — كانت ' + pm3.toFixed(2), Math.abs(m3 - 3) < Math.abs(pm3 - 3) || Math.abs(pm3 - 3) >= 0.6);
}
/* ٤ب) لاعبٌ واحدٌ بين الزوّار */
{
    const P = (id, x, h, o) => Object.assign({ id, x, cy: 0.6, h, w: h * 0.25, near: h >= 0.18, now: false }, o || {});
    const zone = [0.3, 0.7];
    // الأطول خارج المنطقة لا يُختار، ومن في المنطقة يُختار
    const L1 = [P(1, 0.15, 0.6), P(2, 0.52, 0.45), P(3, 0.85, 0.5)];
    check('pickPlayer: من في المنطقة لا الأطول خارجها', J.pickPlayer(L1, zone).id === 2);
    check('pickPlayer: بلا أحدٍ في المنطقة ← لا لاعب', J.pickPlayer([P(1, 0.1, 0.6), P(3, 0.9, 0.5)], zone) === null);
    check('pickPlayer: البعيد (غير القريب) لا يُختار', J.pickPlayer([P(1, 0.5, 0.12)], zone) === null);
    check('pickPlayer: اثنان متقاربان في المنطقة ← الأقرب إلى وسطها', J.pickPlayer([P(1, 0.36, 0.5), P(2, 0.49, 0.47)], zone).id === 2);
    // انقطاع التتبّع: يرثه شبيهه في موضعه، لا طفلٌ أقصر ولا من يقف أمامه ولا البعيد عنه
    const last = { x: 0.5, h: 0.5 };
    check('relock: الشبيه في الموضع نفسه يرثه', (J.relock([P(7, 0.51, 0.49)], last, zone, 16 / 9) || {}).id === 7);
    check('relock: طفلٌ أقصر يمرّ ← لا', J.relock([P(8, 0.5, 0.3)], last, zone, 16 / 9) === null);
    check('relock: من يقف أمامه (أطول كثيراً) ← لا', J.relock([P(9, 0.5, 0.8)], last, zone, 16 / 9) === null);
    check('relock: بعيدٌ عن آخر موضعه ← لا', J.relock([P(10, 0.66, 0.5)], last, zone, 16 / 9) === null);
    check('relock: خارج المنطقة ← لا', J.relock([P(11, 0.75, 0.5)], { x: 0.72, h: 0.5 }, zone, 16 / 9) === null);
    check('swapped: القافز في مكانه (طوله يتغيّر قليلاً) ← لا', !J.swapped(P(1, 0.505, 0.55), last, 16 / 9));
    check('swapped: المعرّف قفز إلى زميلٍ على بعد طول جسم ← نعم', J.swapped(P(1, 0.8, 0.5), last, 16 / 9));
    check('swapped: المعرّف صار لطفلٍ أقصر في الموضع نفسه ← نعم', J.swapped(P(1, 0.5, 0.3), last, 16 / 9));
    check('swapped: بلا آخر موضع ← لا', !J.swapped(P(1, 0.9, 0.2), { x: null, h: 0 }, 16 / 9));
    // الحجب: يتحرّك عبر نافذة اللاعب، أو يقف أمامه
    const pl = P(1, 0.5, 0.5);
    check('occluded: زائرٌ يمرّ أمام اللاعب ← نعم', J.occluded(pl, [pl, P(2, 0.52, 0.45, { cy: 0.65, now: true })]));
    check('occluded: من يقف أمامه ← نعم', J.occluded(pl, [pl, P(3, 0.5, 0.7)]));
    check('occluded: جمهورٌ واقفٌ خلفه (أقصر، لا يتحرّك) ← لا', !J.occluded(pl, [pl, P(4, 0.5, 0.3, { cy: 0.5 }), P(5, 0.47, 0.28, { cy: 0.5 })]));
    check('occluded: يتحرّك بعيداً عنه ← لا', !J.occluded(pl, [pl, P(6, 0.85, 0.45, { now: true })]));
    check('occluded: طفلٌ صغيرٌ يمرّ بعيداً خلفه (أقصر كثيراً) ← لا', !J.occluded(pl, [pl, P(12, 0.5, 0.2, { cy: 0.45, now: true })]));
    check('occluded: زميلٌ بطوله يمرّ بجانبه عبر نافذته ← نعم', J.occluded(pl, [pl, P(13, 0.47, 0.48, { cy: 0.62, now: true })]));
    // الطلبة المتجمّعون خلف اللاعب (أقدامهم أعلى في الصورة) يتحرّكون — لا يوقفون العدّ
    check('occluded: زميلٌ يتحرّك خلفه مباشرةً ← لا', !J.occluded(pl, [pl, P(14, 0.48, 0.42, { cy: 0.55, now: true })]));
    check('occluded: مجموعةٌ تتحرّك خلفه وحوله ← لا', !J.occluded(pl, [pl, P(15, 0.45, 0.4, { cy: 0.55, now: true }), P(16, 0.56, 0.38, { cy: 0.54, now: true }), P(17, 0.7, 0.5, { now: true })]));
    const beside = P(20, 0.593, 0.5, { now: true });
    const lane = J.visibleLane(pl, [pl, beside]);
    check('قصّ التداخل الجانبي والإبقاء على وسط اللاعب', lane && lane[0] < pl.x && lane[1] > pl.x && lane[1] < pl.x + pl.w * 0.3);
    check('تداخلان جانبيان يحجبان مساحة القياس', !J.visibleLane(pl, [pl, P(20, 0.578, 0.5, { now: true }), P(21, 0.422, 0.5, { now: true })]));
    check('التتبّع لا ينتقل إلى شخصين متقاربين عند الالتباس', J.relock([P(22, 0.49, 0.5), P(23, 0.51, 0.5)], last, zone, 16 / 9) === null);

    // hold: لا قفزةٌ مبتورة بعد الحجب
    const st = J.newJumper();
    let tt = 0, cnt = 0;
    for (let k = 0; k < 30; k++) { tt += 1 / 30; J.step(st, 0, 100, tt); }
    for (let k = 0; k < 4; k++) { tt += 1 / 30; J.step(st, 3, 100, tt); }      // صعودٌ سريعٌ ثمّ حُجب
    J.hold(st, tt);
    for (let k = 0; k < 6; k++) { tt += 1 / 30; if (J.step(st, -2, 100, tt)) cnt++; }
    check('hold: صعودٌ قُطع بالحجب ثمّ نزولٌ ← لا يُعدّ', cnt === 0 && st.st === 'g');
}
console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
