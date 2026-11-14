import './eye-yolox.js';
async function fetchModel(url, post) {
  let cache = null;
  if (typeof caches !== 'undefined') {
    try {
      cache = await caches.open('svf-eye-models-v1');
      const cached = await cache.match(url);
      if (cached && cached.ok) {
        post({ type: 'progress', p: 100 });
        return new Uint8Array(await cached.arrayBuffer());
      }
    } catch (_) {}
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' - ' + url.split('/').pop());
  const total = +(r.headers.get('content-length') || 0);
  if (!total || !r.body || !r.body.getReader) {
    const buf = await r.arrayBuffer();
    if (cache) {
      try { await cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (_) {}
    }
    return new Uint8Array(buf);
  }
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
  if (cache) {
    try { await cache.put(url, new Response(out.buffer.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (_) {}
  }
  return out;
}
async function probeWebGPU() {
  try {
    const nav = globalThis.navigator;
    if (!nav || !nav.gpu) return null;
    const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    return adapter;
  } catch (_) {
    return null;
  }
}
export function createRunner(post) {
  let ort = null, sess = null, inName = '', outName = '', SIZE = 416, EP = 'wasm';
  let busy = false;
  return async function (m) {
    m = m || {};
    try {
      if (m.type === 'init') {
        let wantGpu = m.ep === 'webgpu' || m.ep === 'auto';
        let gpuAdapter = wantGpu ? await probeWebGPU() : null;
        if (m.ep === 'webgpu' && !gpuAdapter && !m.allowFallback) {
          post({ type: 'error', error: 'لا يوجد محول GPU يدعم WebGPU', code: 'nogpu' });
          return;
        }
        const useGpu = Boolean(gpuAdapter);
        let ns;
        try {
          ns = useGpu
            ? await import('../vendor/onnx/ort.webgpu.min.mjs')
            : await import('../vendor/onnx/ort.wasm.min.mjs');
        } catch (_) {
          ns = await import('../vendor/onnx/ort.wasm.min.mjs');
        }
        ort = ns.default || ns;
        if (ort.env && ort.env.wasm) {
          ort.env.wasm.numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
            ? Math.min(4, (globalThis.navigator && globalThis.navigator.hardwareConcurrency) || 2)
            : 1;
          ort.env.wasm.simd = true;
          if (m.base) ort.env.wasm.wasmPaths = m.base;
        }
        if (useGpu && ort.env && ort.env.webgpu) {
          ort.env.webgpu.powerPreference = 'high-performance';
        }
        const bytes = await fetchModel(m.model, post);
        SIZE = m.size || 416;
        try {
          EP = useGpu ? 'webgpu' : 'wasm';
          sess = await ort.InferenceSession.create(bytes, {
            executionProviders: [EP],
            graphOptimizationLevel: 'all'
          });
        } catch (gpuErr) {
          if (useGpu && m.allowFallback !== false) {
            EP = 'wasm';
            sess = await ort.InferenceSession.create(bytes, {
              executionProviders: ['wasm'],
              graphOptimizationLevel: 'all'
            });
          } else {
            throw gpuErr;
          }
        }
        inName = sess.inputNames[0];
        outName = sess.outputNames[0];
        const warmBuf = new Float32Array(3 * SIZE * SIZE).fill(114);
        await sess.run({ [inName]: new ort.Tensor('float32', warmBuf, [1, 3, SIZE, SIZE]) });
        post({ type: 'ready', ep: EP, size: SIZE, offscreen: typeof OffscreenCanvas !== 'undefined' });
      } else if (m.type === 'detect') {
        if (!sess) throw new Error('الجلسة غير مجهزة');
        if (busy && m.dropIfBusy) {
          if (m.bitmap && typeof m.bitmap.close === 'function') m.bitmap.close();
          return;
        }
        busy = true;
        const t0 = performance.now();
        try {
          let T = null;
          let rgbaSource = null, rw = m.w, rh = m.h;
          if (m.bitmap && globalThis.SvfYolox.tensorFromBitmap) {
            T = globalThis.SvfYolox.tensorFromBitmap(m.bitmap, SIZE, true);
            if (m.bitmap && typeof m.bitmap.close === 'function') m.bitmap.close();
            if (T && T.rgba) {
              rgbaSource = T.rgba;
              rw = T.nw || SIZE;
              rh = T.nh || SIZE;
            }
          }
          if (!T) {
            rgbaSource = new Uint8ClampedArray(m.buf);
            T = globalThis.SvfYolox.tensor(rgbaSource, m.w, m.h, SIZE, true);
          }
          const inputTensor = new ort.Tensor('float32', T.data, [1, 3, SIZE, SIZE]);
          const r = await sess.run({ [inName]: inputTensor });
          const dets = globalThis.SvfYolox.decode(
            r[outName].data,
            SIZE,
            T.scale,
            m.w,
            m.h,
            {
              person: m.person,
              ball: m.ball,
              reid: m.reid !== false,
              rgba: rgbaSource,
              rgbaW: rw,
              rgbaH: rh
            }
          );
          post({ type: 'dets', id: m.id, dets, ms: Math.round(performance.now() - t0), ep: EP });
        } finally {
          busy = false;
        }
      } else if (m.type === 'close') {
        if (sess && sess.release) await sess.release().catch(() => {});
        sess = null;
      }
    } catch (err) {
      busy = false;
      post({ type: 'error', id: m.id, error: String((err && err.message) || err) });
    }
  };
}
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  const run = createRunner(msg => self.postMessage(msg));
  self.onmessage = e => run(e.data);
}
