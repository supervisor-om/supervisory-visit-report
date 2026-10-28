/* عامل الكشف في الخلفيّة — عين المشرف (2026-10-29)
 * YOLOX‑Nano عبر ONNX Runtime Web على المعالج (WASM) في خيطٍ منفصل، فلا تتجمّد الصفحة أثناء الكشف.
 * الرسائل: {type:'init', base, model, size} ← {type:'ready'}؛ {type:'detect', id, w, h, buf, person, ball} ← {type:'dets', id, dets, ms}؛
 * والخطأ {type:'error', id?, error}. الصورة تصل بكسلاتٍ في الذاكرة وتُنسى بعد الكشف — لا تُحفظ ولا تُرسَل إلى أيّ مكان.
 */
import * as ortNS from '../vendor/onnx/ort.wasm.min.mjs';
import './eye-yolox.js';

const ort = ortNS.default || ortNS;
let sess = null, inName = '', outName = '', SIZE = 416;

self.onmessage = async e => {
    const m = e.data || {};
    try {
        if (m.type === 'init') {
            ort.env.wasm.numThreads = 1;
            ort.env.wasm.wasmPaths = m.base;
            sess = await ort.InferenceSession.create(m.model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
            inName = sess.inputNames[0]; outName = sess.outputNames[0]; SIZE = m.size || 416;
            await sess.run({ [inName]: new ort.Tensor('float32', new Float32Array(3 * SIZE * SIZE).fill(114), [1, 3, SIZE, SIZE]) });   // تهيئة
            self.postMessage({ type: 'ready' });
        } else if (m.type === 'detect') {
            if (!sess) throw new Error('النموذج لم يُحمَّل');
            const t0 = performance.now();
            const T = self.SvfYolox.tensor(new Uint8ClampedArray(m.buf), m.w, m.h, SIZE);
            const r = await sess.run({ [inName]: new ort.Tensor('float32', T.data, [1, 3, SIZE, SIZE]) });
            const dets = self.SvfYolox.decode(r[outName].data, SIZE, T.scale, m.w, m.h, { person: m.person, ball: m.ball });
            self.postMessage({ type: 'dets', id: m.id, dets, ms: Math.round(performance.now() - t0) });
        }
    } catch (err) {
        self.postMessage({ type: 'error', id: m.id, error: String((err && err.message) || err) });
    }
};
