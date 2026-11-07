/* عدّاد القفز — «تحدّي القفز» في ركن «جرّب عين المشرف» (try-eye.html، 2026-11-07)
 *
 * نقيٌّ بلا DOM (يُصدَّر لـnode — tests/jump.test.js). الكشف (YOLOX) يعطي صندوق كلّ لاعبٍ بضع مرّاتٍ في الثانية، وهذا أبطأ من القفزة؛
 * فالقفز يُقاس من الصورة نفسها في كلّ إطار (نحو ٣٠ في الثانية) على صورةٍ رماديّةٍ صغيرة:
 *   profile  ← متوسّط الرماديّ لكلّ صفٍّ داخل أعمدة اللاعب (وسط صندوقه) — «بصمةٌ» رأسيّةٌ لجسمه
 *   shift    ← كم صفّاً انزاحت البصمة بين إطارين (أقلّ فرقٍ مطلق بين مشتقّتيهما، وتنعيمٌ دون البكسل) — موجبٌ = صعد
 *   step     ← يجمع الانزياح موضعاً رأسيّاً، ويعدّ القفزة: صعودٌ يتجاوز ٣٪ من طول الجسم **بسرعة إقلاعٍ** (لا وقوفٌ من القرفصاء)
 *              ثمّ هبوطٌ يرجع أغلب ما صعد خلال ثانيةٍ وخُمس.
 * (2026-11-07 بعد تجربة المشرف: «ليست دقيقة» ← لاعبٌ واحد، وصورةٌ بعرض ٤٨٠، وعتبتان أخفّ.)
 * (2026-11-07 ثانيةً: «لا يحسب القفزات، لا يحتاج الدقّة» ← مستوى الوقوف صار أعلى أرضٍ في آخر ثانيةٍ ونصف — كان لا يتجدّد إلّا
 *  والطالب ساكن، والقافز لا يسكن، فانحرافٌ نازلٌ صغيرٌ في القياس (يتراجع قليلاً وهو يقفز) أسقط القفزات كلّها بعد أوّلها؛
 *  والعتبات أخفّ للقفز الخفيف السريع.)
 * البصمة تُحسب للإطارين على الصفوف نفسها، فتغيّر صندوق الكشف بين لقطتين لا يخلق انزياحاً.
 */
(function (root) {
    'use strict';
    const T_FRAC = 0.022;     // أدنى ارتفاعٍ للقفزة: ٢٫٢٪ من طول الجسم في الصورة (قفزةٌ خفيفة ٣–٤ سم لطولٍ ١٥٠ سم) — كانت ٥٪ ثمّ ٣٪ ففاتت القفزات الخفيفة
    const T_MIN = 1.5;        // ولا أقلّ من صفٍّ ونصف في الصورة الصغيرة (ضجيج الكاميرا)
    const V_MIN = 0.2;        // سرعة الصعود: ٠٫٢ طول جسمٍ في الثانية فأكثر — القفزة الخفيفة القصيرة (خُمس ثانيةٍ في الهواء) تُقاس ~٠٫٢٧ على عُشر ثانية
                              // (كانت ٠٫٣ فلم تُعدّ)؛ والنهوض من القرفصاء والتمايل يردّهما شرط V_RISE ومستوى الوقوف
    const V_WIN = 0.1;        // السرعة على عُشر ثانية — الإطار المكرّر لا يضخّمها
    const FALL = 0.5;         // الهبوط: رجوع نصف ما صعد = هبط
    const AIR_MAX = 1.2;      // أطول زمنٍ في الهواء يُقبل (ثانية)
    const AIR_TIMEOUT = 1.6;  // ثمّ يُنسى الصعود (صعد درجةً أو اقترب من الكاميرا)
    const BASE_TAU = 0.6;     // خطّ الأرض يتبع الموضع ببطءٍ وهو على الأرض (انحراف القياس، الاقتراب والابتعاد)
    const SB_WIN = 1.5;       // مستوى الوقوف: أعلى خطّ أرضٍ في آخر ثانيةٍ ونصف — النهوض السريع من القرفصاء يعود إليه ولا يعلوه،
                              // والانحراف البطيء في القياس لا يتراكم عليه (يُنسى ما قبله)
    const SB_FRAC = 0.5;      // والقمّة تعلوه بنصف العتبة على الأقلّ
    const GH_V = 0.25;        // وما يُحسب فيه من الأرض: لحظاتٌ سرعتها الرأسيّة دون ربع طول جسمٍ في الثانية
    const DOWN_TAU = 0.08;    // خطّ الأرض ينزل مع اللاعب سريعاً: القفزات المتتالية لا تُقاس من منتصف الهبوط
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

    // ── القياس على ما تغيّر وحده (2026-11-07، «لا يحسب القفزات») ──
    // البصمة (متوسّط كلّ صفّ) تخلط خطوط الخلفيّة الثابتة — حافّة طاولة، لافتة، حدّ الأرض والجدار — بجسم اللاعب، فتجذب القياس إلى
    // «لم يتحرّك»: في مقطعٍ لشخصٍ حقيقيٍّ يقفز أمام خلفيّةٍ ثابتة قُرئ الهبوط صفراً حين انتقلت النافذة مع الكشف، فلم تكتمل إلّا ربع القفزات،
    // ولم تُعدّ القفزات الخفيفة قطّ. هنا يُقارَن من النافذة ما تغيّر بين الإطارين وحده: الخلفيّة الثابتة لا تتغيّر فلا تدخل، وجسم اللاعب
    // يطابق نفسه عند انزياحه الحقيقيّ. cur(صفّ r) ≈ prev(صفّ r + s) ← s > 0 صعد.
    const M_TAU = 10;         // أدنى فرقٍ يُعدّ تغيّراً (والعتبة تعلو مع ضجيج الكاميرا: أربعة أضعاف انحرافه)
    const M_MIN = 0.004;      // أقلّ من ٠٫٤٪ من النافذة تغيّر ← ساكن
    const M_CONF = 0.75;      // أفضل انزياحٍ يقلّل الفرق ربعاً على الأقلّ عمّا بلا انزياح، وإلّا فالحركة ليست رأسيّة (تمايلٌ، ذراع)
    const M_CAP = 6000;       // بكسلاتٌ تكفي للقياس (يُؤخذ منها بالتساوي إن زادت)
    const M_LEGS = 0.1;       // القفزة تحرّك الساقين والقدمين: ١٠٪ ممّا تغيّر على الأقلّ في الخُمسين الأسفلين من النافذة —
                              // وإلّا فهو ذراعان تُلوّحان فوق الرأس والجسم واقف (لا يُعدّ قفزاً)
    function measure(prev, cur, W, H, c0, c1, r0, r1, smax) {
        c0 = Math.max(0, Math.min(W, c0 | 0)); c1 = Math.max(c0, Math.min(W, c1 | 0));
        r0 = Math.max(0, Math.min(H, r0 | 0)); r1 = Math.max(r0, Math.min(H, r1 | 0));
        const cols = c1 - c0, rows = r1 - r0, area = cols * rows;
        if (cols < 3 || rows < 12 || !prev || !cur) return 0;
        // تغيّر الإضاءة العامّ (وسيط الفروق) والضجيج من عيّنةٍ في الصورة كلّها، أغلبها خلفيّةٌ ثابتة —
        // لا من النافذة: اللاعب القريب يملأ أغلبها فيُحسب تغيّره ضجيجاً وتعلو العتبة فوق حركته
        const N = W * H, hist = new Uint32Array(511);
        let ns = 0;
        for (let i = 0; i < N; i += 7) { hist[cur[i] - prev[i] + 255]++; ns++; }
        const qnt = (h, n, q) => { let acc = 0; for (let i = 0; i < h.length; i++) { acc += h[i]; if (acc >= n * q) return i; } return 0; };
        const off = qnt(hist, ns, 0.5) - 255;
        const dev = new Uint32Array(511);
        for (let i = 0; i < 511; i++) if (hist[i]) dev[Math.abs(i - 255 - off)] += hist[i];
        const tau = Math.max(M_TAU, 4 * Math.min(1.4826 * qnt(dev, ns, 0.5), qnt(dev, ns, 0.2) / 0.253));
        // ما تغيّر
        let idx = [], legs = 0;
        const rl = r0 + Math.round(rows * 0.6);
        for (let r = r0; r < r1; r++) { const o = r * W; for (let c = c0; c < c1; c++) { const d = cur[o + c] - prev[o + c] - off; if (d > tau || d < -tau) { idx.push(o + c); if (r >= rl) legs++; } } }
        if (idx.length < Math.max(12, M_MIN * area)) return 0;
        if (legs < M_LEGS * idx.length) return 0;
        if (idx.length > M_CAP) { const k = idx.length / M_CAP, sub = []; for (let i = 0; i < M_CAP; i++) sub.push(idx[Math.floor(i * k)]); idx = sub; }
        smax = Math.max(1, Math.min(smax | 0, Math.floor(rows / 3)));
        const cost = new Float64Array(2 * smax + 1);
        let best = Infinity, bi = smax;
        for (let s = -smax; s <= smax; s++) {
            const sh = s * W;
            let sum = 0, m = 0;
            for (let i = 0; i < idx.length; i++) {
                const j = idx[i] + sh;
                if (j < 0 || j >= N) continue;
                const d = cur[idx[i]] - prev[j] - off;
                sum += d < 0 ? -d : d; m++;
            }
            const cst = m >= idx.length * 0.5 ? sum / m : Infinity;
            cost[s + smax] = cst;
            if (cst < best) { best = cst; bi = s + smax; }
        }
        if (!(best < M_CONF * cost[smax])) return 0;
        let s = bi - smax;
        if (bi > 0 && bi < cost.length - 1 && isFinite(cost[bi - 1]) && isFinite(cost[bi + 1])) {
            const d = cost[bi - 1] - 2 * cost[bi] + cost[bi + 1];
            if (d > 1e-9) s += Math.max(-0.5, Math.min(0.5, 0.5 * (cost[bi - 1] - cost[bi + 1]) / d));
        }
        return s;
    }

    function newJumper() { return { y: 0, b: 0, st: 'g', t0: 0, peak: 0, vmax: 0, vr: 0, sb: null, lt: null, hist: [], gh: [] }; }
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
        if (!J.gh) J.gh = [];
        while (J.gh.length && t - J.gh[0][0] > SB_WIN) J.gh.shift();
        if (J.st === 'g') {
            // خطّ الأرض: يتبع الهبوط سريعاً (الهبوط بعد القفزة يبلغ الأرض)، والارتفاعَ ببطء
            J.b += (J.y - J.b) * Math.min(1, dt / (J.y < J.b ? DOWN_TAU : BASE_TAU));
            // مستوى الوقوف من لحظات الثبات على الأرض وحدها (لا من منتصف الهبوط بعد القفزة)
            if (vKnown && Math.abs(v) < GH_V) J.gh.push([t, J.b]);
            // أعلى سرعة صعودٍ قريبة: الإقلاع أسرع ما في القفزة ويسبق تجاوزَ العتبة
            J.vr = Math.max(v, (J.vr || 0) * Math.exp(-dt / 0.25));
            if (J.y - J.b > T) { J.st = 'a'; J.t0 = t; J.peak = J.y; J.vmax = Math.max(v, J.vr); }
            return false;
        }
        if (J.y > J.peak) J.peak = J.y;
        if (v > J.vmax) J.vmax = v;
        const rise = J.peak - J.b;
        if (J.peak - J.y > FALL * rise) {
            // مستوى الوقوف = أعلى خطّ أرضٍ في آخر ثانيةٍ ونصف قبل الإقلاع
            let sb = null;
            for (let i = 0; i < J.gh.length; i++) if (J.gh[i][0] <= J.t0 && (sb == null || J.gh[i][1] > sb)) sb = J.gh[i][1];
            J.sb = sb;
            const ok = t - J.t0 <= AIR_MAX && rise > T && J.vmax >= Math.max(V_MIN, V_RISE * Math.sqrt(rise / h))
                && (sb == null || J.peak - sb >= SB_FRAC * T);
            J.st = 'g'; J.b = J.y; J.vmax = 0; J.vr = 0;
            return ok;
        }
        if (t - J.t0 > AIR_TIMEOUT) { J.st = 'g'; J.b = J.y; J.vmax = 0; J.vr = 0; }
        return false;
    }

    // ── اللاعب الواحد بين الزوّار (2026-11-07 بعد تجربة المشرف: «متشتّت مع مجموعة الطلبة … لا يحدّد الطالب الواحد بدقّة») ──
    // list: [{id, x (موضع القدم أفقيّاً ٠–١), cy (وسط الصندوق ٠–١), h, w, near, now}] — كما في P.list في try-eye.html
    const ZONE_H = [0.75, 1.33];      // من يرث اللاعب بعد انقطاع تتبّعه: طوله بين ٧٥٪ و١٣٣٪ من طول اللاعب (لا طفلٌ يمرّ ولا من يقف أمامه)
    function inZone(p, zone) { return !zone || (p.x >= zone[0] && p.x <= zone[1]); }
    // يُختار تلقائيّاً من في منطقة اللاعب وحدها: الأطول (الأقرب إلى الكاميرا)، وعند التقارب الأقرب إلى وسطها
    function pickPlayer(list, zone) {
        const c = list.filter(p => p.near && inZone(p, zone));
        if (!c.length) return null;
        const mid = zone ? (zone[0] + zone[1]) / 2 : 0.5, hMax = Math.max.apply(null, c.map(p => p.h));
        return c.filter(p => p.h >= hMax * 0.85).sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid))[0];
    }
    // انقطع تتبّع اللاعب: يرثه من في المنطقة بطولٍ قريبٍ من طوله، وأقرب من ٠٫٤ طول جسمٍ أفقيّاً إلى آخر موضعه
    // (اللاعب يقفز في مكانه؛ الواقف بجانبه أبعد من ذلك) — وإلّا لا أحد، ويُنتظر رجوعه
    function relock(list, last, zone, ar) {
        let best = null, bd = 0.4;
        list.forEach(q => {
            if (!q.near || !inZone(q, zone)) return;
            if (last.h && (q.h < last.h * ZONE_H[0] || q.h > last.h * ZONE_H[1])) return;
            const d = Math.abs(q.x - last.x) * (ar || 1) / Math.max(0.05, q.h);
            if (d < bd) { bd = d; best = q; }
        });
        return best;
    }
    // تبادل المعرّفات: حين يتقاطع اللاعب وزميلٌ قد يعطي التتبّع معرّف اللاعب لزميله — صندوقٌ «يقفز» أفقيّاً
    // أكثر من نصف طول جسمٍ بين لحظتين (القافز في مكانه لا يفعل ذلك) أو يتغيّر طوله كثيراً ← ليس هو
    const SWAP_X = 0.5;
    function swapped(p, last, ar) {
        if (!p || !last || last.x == null || !last.h) return false;
        const r = p.h / last.h;
        return r < ZONE_H[0] || r > ZONE_H[1] || Math.abs(p.x - last.x) * (ar || 1) / last.h > SWAP_X;
    }
    // شخصٌ آخر **أمام** اللاعب (أقرب إلى الكاميرا) يدخل نافذة القياس — يتحرّك فيها أو أطول — يُفسد البصمة ← لا قياس في هذا الإطار.
    // ومن خلفه (قدماه أعلى في الصورة) أو أقصر منه كثيراً (دون ٦٠٪ من طوله): جسم اللاعب يغطّيه ولا يُفسد القياس —
    // كان الطلبة المتجمّعون حول اللاعب يوقفون العدّ (2026-11-07: «لا يحسب القفزات»)
    const BEHIND = 0.6;
    const FRONT = 0.05;       // قدماه أدنى من قدمي اللاعب أو أعلى بأقلّ من ٥٪ من طوله = أمامه أو بجانبه
    const OCC = 0.25;         // ويغطّي ربع النافذة عرضاً وارتفاعاً على الأقلّ
    const foot = q => q.fy != null ? q.fy : q.cy + q.h / 2;
    function occluded(p, list) {
        const wx0 = p.x - p.w * 0.3, wx1 = p.x + p.w * 0.3, wy0 = p.cy - p.h * 0.75, wy1 = p.cy + p.h * 0.55;
        const ww = wx1 - wx0, wh = wy1 - wy0, pf = foot(p);
        return list.some(q => {
            if (q.id === p.id || q.h < p.h * BEHIND || !(q.now || q.h > p.h * 0.85)) return false;
            if (foot(q) < pf - FRONT * p.h) return false;
            const qx0 = q.x - q.w * 0.55, qx1 = q.x + q.w * 0.55, qy0 = q.cy - q.h * 0.55, qy1 = q.cy + q.h * 0.55;
            const ox = Math.min(wx1, qx1) - Math.max(wx0, qx0), oy = Math.min(wy1, qy1) - Math.max(wy0, qy0);
            return ox > ww * OCC && oy > wh * OCC;
        });
    }
    // إيقاف القياس لحظةً بلا قفزةٍ مبتورة: الموضع يبقى، والحالة على الأرض
    function hold(J, t) { J.st = 'g'; J.b = J.y; J.vmax = 0; J.vr = 0; J.lt = t; J.hist = [[t, J.y]]; J.gh = []; }

    const api = { T_FRAC, T_MIN, V_MIN, V_RISE, FALL, AIR_MAX, ZONE_H, SWAP_X, inZone, pickPlayer, relock, swapped, occluded, hold, profile, shift, measure, newJumper, step };
    root.SvfJump = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
