/* نموذج الكشف الأحدث لعين المشرف — YOLOX (Megvii، ترخيص Apache-2.0) عبر ONNX Runtime Web (2026-10-29)
 *
 * المعالجة قبل النموذج وبعده، نقيّةً بلا DOM — يستعملها عامل الكشف (js/eye-detect-worker.js) والقياس في node (tests/eye.test.js القسم ٣٤):
 *   tensor(rgba, w, h, size) ← مدخل النموذج: BGR بقيمها 0–255، والصورة مصغّرةٌ إلى المربّع وما فضل رماديّ 114 (طريقة YOLOX نفسها)
 *   decode(out, size, scale, opts) ← صناديق {x, y, w, h, score, label} بنسبة الصورة الأصليّة (0–1)، بعد إزالة المكرّر (NMS)
 * مخرج YOLOX الخام [1, N, 85]: لكلّ خليّةٍ من شبكات الخطوات 8 و16 و32: إزاحة المركز، ولوغاريتم العرض والارتفاع، ثمّ «فيه شيء»،
 * ثمّ ثمانون صنفاً من COCO (الشخص 0، والكرة الرياضيّة 32) — الاحتمالات بعد sigmoid في النموذج نفسه.
 */
(function (root) {
    'use strict';
    const STRIDES = [8, 16, 32];
    const PERSON = 0, BALL = 32;
    const LABELS = { [PERSON]: 'person', [BALL]: 'sports ball' };

    // rgba: بكسلات الصورة (Uint8ClampedArray)، size: ضلع مدخل النموذج — ← {data: Float32Array(3·size·size), scale}
    function tensor(rgba, w, h, size) {
        const r = Math.min(size / w, size / h), nw = Math.max(1, Math.round(w * r)), nh = Math.max(1, Math.round(h * r));
        const plane = size * size, out = new Float32Array(3 * plane).fill(114);
        for (let y = 0; y < nh; y++) {
            const sy = Math.min(h - 1, Math.floor((y + 0.5) / r));
            for (let x = 0; x < nw; x++) {
                const sx = Math.min(w - 1, Math.floor((x + 0.5) / r)), i = (sy * w + sx) * 4, o = y * size + x;
                out[o] = rgba[i + 2];                 // B
                out[plane + o] = rgba[i + 1];         // G
                out[2 * plane + o] = rgba[i];         // R
            }
        }
        return { data: out, scale: r };
    }

    const iou = (a, b) => {
        const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
        const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        return inter / Math.max(1e-9, a.w * a.h + b.w * b.h - inter);
    };
    function nms(boxes, thr) {
        const keep = [];
        boxes.sort((a, b) => b.score - a.score).forEach(b => { if (!keep.some(k => k.label === b.label && iou(k, b) > thr)) keep.push(b); });
        return keep;
    }

    // out: Float32Array بطول N·85، size: ضلع المدخل، scale: من tensor، w/h: أبعاد الصورة الأصليّة
    // opts: {person: أدنى ثقة للشخص, ball: للكرة, iou, max}
    function decode(out, size, scale, w, h, opts) {
        const o = opts || {}, minP = o.person != null ? o.person : 0.2, minB = o.ball != null ? o.ball : 0.3, stride85 = 85;
        const boxes = [];
        let row = 0;
        STRIDES.forEach(s => {
            const g = Math.round(size / s);
            for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++, row++) {
                const b = row * stride85, obj = out[b + 4];
                if (obj < Math.min(minP, minB)) continue;
                const sp = obj * out[b + 5 + PERSON], sb = obj * out[b + 5 + BALL];
                const label = sp >= minP ? PERSON : sb >= minB ? BALL : -1;
                if (label < 0) continue;
                const cx = (out[b] + gx) * s, cy = (out[b + 1] + gy) * s, bw = Math.exp(out[b + 2]) * s, bh = Math.exp(out[b + 3]) * s;
                const x = (cx - bw / 2) / scale, y = (cy - bh / 2) / scale;
                boxes.push({ x: Math.max(0, x) / w, y: Math.max(0, y) / h, w: Math.min(w - Math.max(0, x), bw / scale) / w, h: Math.min(h - Math.max(0, y), bh / scale) / h,
                             score: label === PERSON ? sp : sb, label: LABELS[label] });
            }
        });
        return nms(boxes, o.iou != null ? o.iou : 0.45).slice(0, o.max || 80);
    }
    const rows = size => STRIDES.reduce((n, s) => n + Math.pow(Math.round(size / s), 2), 0);

    const api = { STRIDES, PERSON, BALL, tensor, decode, nms, iou, rows };
    root.SvfYolox = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
