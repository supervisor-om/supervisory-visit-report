/* عدّاد القفز — «تحدّي القفز» في ركن «جرّب عين المشرف» (try-eye.html، 2026-11-07)
 *
 * نقيٌّ بلا DOM (يُصدَّر لـnode — tests/jump.test.js). الكشف (YOLOX) يعطي صندوق كلّ لاعبٍ بضع مرّاتٍ في الثانية، وهذا أبطأ من القفزة؛
 * فالقفز يُقاس من الصورة نفسها في كلّ إطار (نحو ٣٠ في الثانية) على صورةٍ رماديّةٍ صغيرة:
 *   profile  ← متوسّط الرماديّ لكلّ صفٍّ داخل أعمدة اللاعب (وسط صندوقه) — «بصمةٌ» رأسيّةٌ لجسمه
 *   shift    ← كم صفّاً انزاحت البصمة بين إطارين (أقلّ فرقٍ مطلق بين مشتقّتيهما، وتنعيمٌ دون البكسل) — موجبٌ = صعد
 *   step     ← يجمع الانزياح موضعاً رأسيّاً، ويعدّ القفزة: صعودٌ يتجاوز ٣٪ من طول الجسم **بسرعة إقلاعٍ** (لا وقوفٌ من القرفصاء)
 *              ثمّ هبوطٌ يرجع أغلب ما صعد خلال ثانيةٍ وخُمس.
 * (2026-11-07 بعد تجربة المشرف: «ليست دقيقة» ← لاعبٌ واحد، وصورةٌ بعرض ٤٨٠، وعتبتان أخفّ.)
 * البصمة تُحسب للإطارين على الصفوف نفسها، فتغيّر صندوق الكشف بين لقطتين لا يخلق انزياحاً.
 */
(function (root) {
    'use strict';
    const T_FRAC = 0.03;      // أدنى ارتفاعٍ للقفزة: ٣٪ من طول الجسم في الصورة (قفزةٌ خفيفةٌ سريعة ٥ سم لطولٍ ١٦٠ سم) — كانت ٥٪ ففاتت القفزات الخفيفة
    const T_MIN = 2;          // ولا أقلّ من صفّين في الصورة الصغيرة (ضجيج الكاميرا)
    const V_MIN = 0.3;        // سرعة الصعود: ٠٫٣ طول جسمٍ في الثانية فأكثر (القفزة الخفيفة ~٠٫٤٥، والنهوض البطيء من القرفصاء ~٠٫٢٥؛ والسريع يردّه مستوى الوقوف)
    const V_WIN = 0.1;        // السرعة على عُشر ثانية — الإطار المكرّر لا يضخّمها
    const FALL = 0.6;         // الهبوط: رجوع ٦٠٪ ممّا صعد = هبط
    const AIR_MAX = 1.2;      // أطول زمنٍ في الهواء يُقبل (ثانية)
    const AIR_TIMEOUT = 1.6;  // ثمّ يُنسى الصعود (صعد درجةً أو اقترب من الكاميرا)
    const BASE_TAU = 0.6;     // خطّ الأرض يتبع الموضع ببطءٍ وهو على الأرض (انحراف القياس، الاقتراب والابتعاد)
    const STILL_V = 0.15;     // ساكنٌ رأسيّاً: أقلّ من ٠٫١٥ طول جسمٍ في الثانية
    const STAND_TAU = 3;      // مستوى الوقوف يبهت في ثلاث ثوانٍ (انحراف القياس، الاقتراب والابتعاد)
    const DOWN_TAU = 0.08;    // وينزل مع اللاعب سريعاً: القفزات المتتالية لا تُقاس من منتصف الهبوط
    // سرعة الإقلاع تتبع الارتفاع (قذيفة: v = √(2gH)) — لطولٍ ١٫٧ م ≈ ٣٫٤ √(الارتفاع ÷ الطول) طولاً في الثانية، ويُقبل نصفها تقريباً
    // (القياس على عُشر ثانيةٍ يُنقصها). النهوض من القرفصاء يصعد كثيراً ببطء فلا يبلغها.
    const V_RISE = 1.5;

    // gray: Uint8Array بعرض W، والنافذة [c0, c1) × [r0, r1)
    function profile(gray, W, H, c0, c1, r0, r1) {
        c0 = Math.max(0, Math.min(W, c0 | 0)); c1 = Math.max(c0, Math.min(W, c1 | 0));
        r0 = Math.max(0, Math.min(H, r0 | 0)); r1 = Math.max(r0, Math.min(H, r1 | 0));
        const out = new Float32Array(r1 - r0), k = Math.max(1, c1 - c0);
        for (let r = r0; r < r1; r++) {
            let s = 0;
            const o = r * W;
            for (let c = c0; c < c1; c++) s += gray[o + c];
            out[r - r0] = s / k;
        }
        return out;
    }
    function grad(p) {
        const g = new Float32Array(Math.max(0, p.length - 1));
        for (let i = 0; i < g.length; i++) g[i] = p[i + 1] - p[i];
        return g;
    }
    // انزياح المحتوى بين بصمتين بالنافذة نفسها: cur[i] ≈ prev[i + s] ← s > 0 صعد s صفّاً
    function shift(prev, cur, smax) {
        const a = grad(prev), b = grad(cur), n = b.length;
        if (n < 8 || a.length !== n) return 0;
        let energy = 0;
        for (let i = 0; i < n; i++) energy += Math.abs(b[i]);
        if (energy / n < 0.15) return 0;                       // نافذةٌ ملساء (جدارٌ أو ظلام): لا قياس
        smax = Math.max(1, Math.min(smax | 0, Math.floor(n / 3)));
        const cost = new Array(2 * smax + 1);
        let best = Infinity, bi = smax;
        for (let s = -smax; s <= smax; s++) {
            let sum = 0, m = 0;
            for (let i = 0; i < n; i++) {
                const j = i + s;
                if (j < 0 || j >= n) continue;
                sum += Math.abs(b[i] - a[j]); m++;
            }
            const c = m >= n * 0.5 ? sum / m : Infinity;
            cost[s + smax] = c;
            if (c < best) { best = c; bi = s + smax; }
        }
        let s = bi - smax;
        if (bi > 0 && bi < cost.length - 1 && isFinite(cost[bi - 1]) && isFinite(cost[bi + 1])) {
            const d = cost[bi - 1] - 2 * cost[bi] + cost[bi + 1];
            if (d > 1e-9) s += Math.max(-0.5, Math.min(0.5, 0.5 * (cost[bi - 1] - cost[bi + 1]) / d));
        }
        return s;
    }

    function newJumper() { return { y: 0, b: 0, st: 'g', t0: 0, peak: 0, vmax: 0, vr: 0, sb: null, lt: null, hist: [] }; }
    // J: حالة اللاعب، s: الانزياح منذ الإطار السابق (صفوف)، hpx: طول جسمه في الصورة الصغيرة، t: الوقت بالثواني
    // ← true حين تكتمل قفزة
    function step(J, s, hpx, t) {
        const dt = J.lt == null ? 0 : Math.min(0.25, Math.max(0, t - J.lt));
        J.lt = t;
        J.y += s;
        J.hist.push([t, J.y]);
        while (J.hist.length > 2 && t - J.hist[0][0] > V_WIN + 0.05) J.hist.shift();
        const h = Math.max(4, hpx);
        let v = 0, vKnown = false;
        for (let i = J.hist.length - 2; i >= 0; i--) {
            const dtt = t - J.hist[i][0];
            if (dtt >= V_WIN * 0.6) { v = (J.y - J.hist[i][1]) / dtt / h; vKnown = true; break; }
        }
        const T = Math.max(T_MIN, T_FRAC * h);
        // مستوى الوقوف: أعلى موضعٍ ساكنٍ على الأرض مؤخّراً (يبهت ببطء) — القفزة تعلو عليه، والنهوض من القرفصاء يعود إليه فقط
        // (والسرعة المجهولة في أوّل الإطارات ليست سكوناً — كان أوّل إطارٍ في منتصف قفزةٍ يُثبَّت مستوىً للوقوف)
        if (J.st === 'g' && vKnown && Math.abs(v) < STILL_V) {
            // في القرفصاء (أدنى من مستوى الوقوف بـ٨٪ من الطول فأكثر) يبهت أبطأ كثيراً: النزول لا يُنسي مستوى الوقوف،
            // وما دون ذلك (انحراف القياس، انثناء الركبتين عند الهبوط) يبهت في ثلاث ثوانٍ فلا يحجب القفزات الخفيفة
            const tau = J.sb != null && J.y < J.sb - Math.max(T, 0.08 * h) ? STAND_TAU * 4 : STAND_TAU;
            const d = J.sb == null ? J.y : J.sb + (J.y - J.sb) * Math.min(1, dt / tau);
            J.sb = Math.max(J.y, d);
        }
        if (J.st === 'g') {
            // خطّ الأرض: يتبع الهبوط سريعاً (الهبوط بعد القفزة يبلغ الأرض)، والارتفاعَ ببطء
            J.b += (J.y - J.b) * Math.min(1, dt / (J.y < J.b ? DOWN_TAU : BASE_TAU));
            // أعلى سرعة صعودٍ قريبة: الإقلاع أسرع ما في القفزة ويسبق تجاوزَ العتبة
            J.vr = Math.max(v, (J.vr || 0) * Math.exp(-dt / 0.25));
            if (J.y - J.b > T) { J.st = 'a'; J.t0 = t; J.peak = J.y; J.vmax = Math.max(v, J.vr); }
            return false;
        }
        if (J.y > J.peak) J.peak = J.y;
        if (v > J.vmax) J.vmax = v;
        const rise = J.peak - J.b;
        if (J.peak - J.y > FALL * rise) {
            const ok = t - J.t0 <= AIR_MAX && rise > T && J.vmax >= Math.max(V_MIN, V_RISE * Math.sqrt(rise / h))
                && (J.sb == null || J.peak - J.sb >= T);
            J.st = 'g'; J.b = J.y; J.vmax = 0; J.vr = 0;
            return ok;
        }
        if (t - J.t0 > AIR_TIMEOUT) { J.st = 'g'; J.b = J.y; J.vmax = 0; J.vr = 0; }
        return false;
    }

    const api = { T_FRAC, T_MIN, V_MIN, V_RISE, FALL, AIR_MAX, profile, shift, newJumper, step };
    root.SvfJump = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
