/* عامل الكشف في الخلفيّة — عين المشرف (2026-10-29، والنموذج القويّ وبطاقة الرسوم 2026-11-09)
 * YOLOX عبر ONNX Runtime Web في خيطٍ منفصل، فلا تتجمّد الصفحة أثناء الكشف:
 *   الخفيف YOLOX‑Nano ‏416 على المعالج (WASM)، والقويّ YOLOX‑S ‏640 على بطاقة الرسوم (WebGPU) أو المعالج.
 * الرسائل: {type:'init', base, model, size, ep:'wasm'|'webgpu'} ← {type:'progress', p} أثناء التنزيل ثمّ {type:'ready', ep, size}؛
 *   {type:'detect', id, w, h, buf, person, ball} ← {type:'dets', id, dets, ms}؛ والخطأ {type:'error', id?, error, code?}
 *   (code:'nogpu' = هذا العامل لا يرى بطاقة الرسوم — تجرّبها الصفحة نفسها، انظر createRunner).
 * الصورة تصل بكسلاتٍ في الذاكرة وتُنسى بعد الكشف — لا تُحفظ ولا تُرسَل إلى أيّ مكان.
 */
import './eye-yolox.js';

// النموذج يُنزَّل هنا لا داخل المشغّل: ليُعرض تقدّم التنزيل (القويّ ٣٦ ميغابايت)
async function fetchModel(url, post) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + url.split('/').pop());
    const total = +(r.headers.get('content-length') || 0);
    if (!total || !r.body || !r.body.getReader) return new Uint8Array(await r.arrayBuffer());
    const rd = r.body.getReader(), parts = [];
    let got = 0, last = -5;
    for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); got += value.length;
        const p = Math.min(99, Math.floor(got * 100 / total));
        if (p >= last + 5) { last = p; post({ type: 'progress', p }); }
    }
    const out = new Uint8Array(got);
    let o = 0;
    parts.forEach(c => { out.set(c, o); o += c.length; });
    return out;
}

// يعالج رسائل البروتوكول ويردّ بـpost — في العامل، أو في الصفحة نفسها حين لا يتيح المتصفّح بطاقة الرسوم داخل العامل
export function createRunner(post) {
    let ort = null, sess = null, inName = '', outName = '', SIZE = 416, EP = 'wasm';
    return async function (m) {
        m = m || {};
        try {
            if (m.type === 'init') {
                const gpu = m.ep === 'webgpu';
                if (gpu) {
                    const nav = globalThis.navigator;
                    const ad = nav && nav.gpu ? await nav.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null) : null;
                    if (!ad) { post({ type: 'error', error: 'بطاقة الرسوم غير متاحةٍ هنا', code: 'nogpu' }); return; }
                }
                const ns = gpu ? await import('../vendor/onnx/ort.webgpu.min.mjs') : await import('../vendor/onnx/ort.wasm.min.mjs');
                ort = ns.default || ns;
                ort.env.wasm.numThreads = 1;               // GitHub Pages لا يتيح الخيوط المتعدّدة
                ort.env.wasm.wasmPaths = m.base;
                if (gpu && ort.env.webgpu) ort.env.webgpu.powerPreference = 'high-performance';
                const bytes = await fetchModel(m.model, post);
                // بطاقة الرسوم وحدها: إن تعذّرت فشل الإنشاء، ولا يعود المشغّل صامتاً إلى المعالج بنموذجٍ ثقيل
                sess = await ort.InferenceSession.create(bytes, { executionProviders: [gpu ? 'webgpu' : 'wasm'], graphOptimizationLevel: 'all' });
                inName = sess.inputNames[0]; outName = sess.outputNames[0]; SIZE = m.size || 416; EP = gpu ? 'webgpu' : 'wasm';
                await sess.run({ [inName]: new ort.Tensor('float32', new Float32Array(3 * SIZE * SIZE).fill(114), [1, 3, SIZE, SIZE]) });   // تهيئة
                post({ type: 'ready', ep: EP, size: SIZE });
            } else if (m.type === 'detect') {
                if (!sess) throw new Error('النموذج لم يُحمَّل');
                const t0 = performance.now();
                const T = globalThis.SvfYolox.tensor(new Uint8ClampedArray(m.buf), m.w, m.h, SIZE);
                const r = await sess.run({ [inName]: new ort.Tensor('float32', T.data, [1, 3, SIZE, SIZE]) });
                const dets = globalThis.SvfYolox.decode(r[outName].data, SIZE, T.scale, m.w, m.h, { person: m.person, ball: m.ball });
                post({ type: 'dets', id: m.id, dets, ms: Math.round(performance.now() - t0) });
            } else if (m.type === 'close') {
                if (sess && sess.release) await sess.release().catch(() => {});
                sess = null;
            }
        } catch (err) {
            post({ type: 'error', id: m.id, error: String((err && err.message) || err) });
        }
    };
}

// في العامل وحده يُربط الاستقبال — حين تستورده الصفحة (احتياط بطاقة الرسوم) لا يمسّ رسائل النافذة
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    const run = createRunner(msg => self.postMessage(msg));
    self.onmessage = e => run(e.data);
}
