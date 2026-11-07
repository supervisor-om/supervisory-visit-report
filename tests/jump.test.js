// عدّاد القفز (js/jump-core.js) — «تحدّي القفز» في try-eye.html (2026-11-07)
// مشهدٌ مصنوع: خلفيّةٌ ثابتة بنقشٍ عشوائيّ، و«لاعبٌ» بنقشه يتحرّك رأسيّاً كما يُطلب، وضجيج كاميرا. الصندوق يُحدَّث كلّ ٠٫٢ ث كالكشف.
// node tests/jump.test.js
const J = require('../js/jump-core.js');
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, ok, info) { if (ok) console.log('PASS ' + name); else { failures++; console.log('FAIL ' + name + (info ? '  — ' + info : '')); } }

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const W = 240, H = 135;

// motion(t) ← إزاحة اللاعب للأعلى بالبكسل (موجبٌ صعود، سالبٌ نزول)، و xMotion(t) ← إزاحته أفقيّاً
function scene(opts) {
    const o = Object.assign({ fps: 30, dur: 20, ph: 90, pw: 40, px: 100, top: 32, noise: 3, flicker: 0, dup: 1, seed: 7, motion: () => 0, xMotion: () => 0, det: 0.2 }, opts);
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
                const s = J.shift(J.profile(prev, W, H, c0, c1, r0, r1), J.profile(g, W, H, c0, c1, r0, r1), Math.max(4, Math.round(box.h * 0.22)));
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
    // تمايلٌ رأسيٌّ صغير (٣٪)
    check('تمايلٌ صغير ← ٠', scene({ motion: t => 2.5 * Math.sin(2 * Math.PI * 1.5 * t) }) === 0);
    // مشيٌ جانبيٌّ عبر الصورة
    check('مشيٌ جانبيّ ← ٠', scene({ xMotion: t => (t * 25) % 90 - 45, px: 100 }) <= 1);
    // صعودٌ بلا هبوط (اقترب من الكاميرا أو صعد درجة)
    check('صعودٌ بلا رجوع ← ٠', scene({ motion: t => (t > 3 ? Math.min(14, (t - 3) * 40) : 0) }) === 0);
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
}
/* ٥) التوصيل في try-eye.html */
{
    const H5 = fs.readFileSync(path.join(__dirname, '..', 'try-eye.html'), 'utf8');
    check('try-eye: تحمّل jump-core.js', /<script src="js\/jump-core\.js"><\/script>/.test(H5));
    check('try-eye: البصمتان من الإطارين على النافذة نفسها', /SvfJump\.profile\(JG\.prev, JW, JH, c0, c1, r0, r1\)/.test(H5) && /SvfJump\.profile\(gray, JW, JH, c0, c1, r0, r1\)/.test(H5));
    check('try-eye: يُعدّ في «jump» وحده لا في العدّ التنازليّ', /if \(SvfJump\.step\(j, s, hpx, t\) && G\.st === 'jump'\)/.test(H5));
    check('try-eye: مفتاح J و?game=jump ودوران التحدّيات', /k === 'j' \|\| k === 'J'/.test(H5) && /Q\.get\('game'\) === 'jump'/.test(H5) && /CFG\.cycle\[/.test(H5));
    check('try-eye: لا تسجيل', !/toDataURL|MediaRecorder|toBlob/.test(H5));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
