(function (root) {
  'use strict';
  const STRIDES = [8, 16, 32];
  const PERSON = 0, BALL = 32;
  const LABELS = { [PERSON]: 'person', [BALL]: 'sports ball' };
  let _cachedSize = 0;
  let _cachedTensor = null;
  let _xMap = null;
  let _yMap = null;
  let _mapKey = '';
  let _offCanvas = null;
  let _offCtx = null;
  function ensureMaps(w, h, size, nw, nh, r) {
    const key = w + 'x' + h + '@' + size;
    if (_mapKey === key && _xMap && _yMap) return;
    _mapKey = key;
    _xMap = new Int32Array(nw);
    _yMap = new Int32Array(nh);
    for (let x = 0; x < nw; x++) {
      _xMap[x] = Math.min(w - 1, Math.floor((x + 0.5) / r)) * 4;
    }
    for (let y = 0; y < nh; y++) {
      _yMap[y] = Math.min(h - 1, Math.floor((y + 0.5) / r)) * w * 4;
    }
  }
  function tensor(rgba, w, h, size, reuse) {
    const r = Math.min(size / w, size / h);
    const nw = Math.max(1, Math.round(w * r));
    const nh = Math.max(1, Math.round(h * r));
    const plane = size * size;
    let out;
    if (reuse && _cachedSize === size && _cachedTensor) {
      out = _cachedTensor;
      out.fill(114);
    } else {
      out = new Float32Array(3 * plane).fill(114);
      if (reuse) {
        _cachedSize = size;
        _cachedTensor = out;
      }
    }
    ensureMaps(w, h, size, nw, nh, r);
    const xMap = _xMap, yMap = _yMap;
    const plane2 = 2 * plane;
    for (let y = 0; y < nh; y++) {
      const rowOff = yMap[y];
      const outRow = y * size;
      for (let x = 0; x < nw; x++) {
        const i = rowOff + xMap[x];
        const o = outRow + x;
        out[o] = rgba[i + 2];
        out[plane + o] = rgba[i + 1];
        out[plane2 + o] = rgba[i];
      }
    }
    return { data: out, scale: r, nw, nh };
  }
  function tensorFromBitmap(bitmap, size, reuse) {
    const w = bitmap.width, h = bitmap.height;
    const r = Math.min(size / w, size / h);
    const nw = Math.max(1, Math.round(w * r));
    const nh = Math.max(1, Math.round(h * r));
    if (typeof OffscreenCanvas !== 'undefined') {
      if (!_offCanvas || _offCanvas.width !== size || _offCanvas.height !== size) {
        _offCanvas = new OffscreenCanvas(size, size);
        _offCtx = _offCanvas.getContext('2d', { willReadFrequently: true });
      }
      _offCtx.fillStyle = 'rgb(114,114,114)';
      _offCtx.fillRect(0, 0, size, size);
      _offCtx.drawImage(bitmap, 0, 0, nw, nh);
      const imgData = _offCtx.getImageData(0, 0, size, size).data;
      const plane = size * size, plane2 = 2 * plane;
      let out;
      if (reuse && _cachedSize === size && _cachedTensor) {
        out = _cachedTensor;
      } else {
        out = new Float32Array(3 * plane);
        if (reuse) { _cachedSize = size; _cachedTensor = out; }
      }
      for (let o = 0, i = 0; o < plane; o++, i += 4) {
        out[o] = imgData[i + 2];
        out[plane + o] = imgData[i + 1];
        out[plane2 + o] = imgData[i];
      }
      return { data: out, scale: r, nw, nh, rgba: imgData, rgbaW: size, rgbaH: size, scaledBox: true };
    }
    return null;
  }
  function colorSig(rgba, w, h, box) {
    if (!rgba || !w || !h || !box) return null;
    const bx = Math.max(0, Math.floor((box.x + box.w * 0.2) * w));
    const bw = Math.max(1, Math.floor(box.w * 0.6 * w));
    const by = Math.max(0, Math.floor((box.y + box.h * 0.15) * h));
    const bh = Math.max(2, Math.floor(box.h * 0.7 * h));
    const midY = by + (bh >> 1);
    const maxX = Math.min(w, bx + bw), maxY = Math.min(h, by + bh);
    const hist = new Float32Array(16);
    const stepX = Math.max(1, Math.floor(bw / 8));
    const stepY = Math.max(1, Math.floor(bh / 12));
    let topCount = 0, botCount = 0;
    for (let y = by; y < maxY; y += stepY) {
      const isBot = y >= midY ? 8 : 0;
      const row = y * w;
      for (let x = bx; x < maxX; x += stepX) {
        const i = (row + x) * 4;
        const R = rgba[i], G = rgba[i + 1], B = rgba[i + 2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const d = mx - mn;
        const sat = mx === 0 ? 0 : d / mx;
        const val = mx / 255;
        let bin;
        if (val < 0.22) {
          bin = 0;
        } else if (sat < 0.18 && val > 0.72) {
          bin = 1;
        } else if (sat < 0.22) {
          bin = 2;
        } else {
          let hue = 0;
          if (mx === R) hue = ((G - B) / d + (G < B ? 6 : 0)) / 6;
          else if (mx === G) hue = ((B - R) / d + 2) / 6;
          else hue = ((R - G) / d + 4) / 6;
          bin = 3 + Math.min(4, Math.floor(hue * 5));
        }
        hist[isBot + bin] += 1;
        if (isBot) botCount++; else topCount++;
      }
    }
    if (topCount > 0) for (let k = 0; k < 8; k++) hist[k] /= topCount;
    if (botCount > 0) for (let k = 8; k < 16; k++) hist[k] /= botCount;
    return Array.from(hist, v => Math.round(v * 1000) / 1000);
  }
  function colorSim(a, b) {
    if (!a || !b || a.length !== 16 || b.length !== 16) return 0.5;
    let topSim = 0, botSim = 0;
    for (let i = 0; i < 8; i++) topSim += Math.sqrt(Math.max(0, a[i] * b[i]));
    for (let i = 8; i < 16; i++) botSim += Math.sqrt(Math.max(0, a[i] * b[i]));
    return Math.min(1, topSim * 0.65 + botSim * 0.35);
  }
  const iou = (a, b) => {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / Math.max(1e-9, a.w * a.h + b.w * b.h - inter);
  };
  function nms(boxes, thr) {
    const keep = [];
    boxes.sort((a, b) => b.score - a.score).forEach(b => {
      if (!keep.some(k => k.label === b.label && iou(k, b) > thr)) keep.push(b);
    });
    return keep;
  }
  function decode(out, size, scale, w, h, opts) {
    const o = opts || {}, minP = o.person != null ? o.person : 0.2, minB = o.ball != null ? o.ball : 0.3, stride85 = 85;
    const minObj = Math.min(minP, minB);
    const boxes = [];
    let row = 0;
    STRIDES.forEach(s => {
      const g = Math.round(size / s);
      for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++, row++) {
        const b = row * stride85, obj = out[b + 4];
        if (obj < minObj) continue;
        const sp = obj * out[b + 5 + PERSON], sb = obj * out[b + 5 + BALL];
        const label = sp >= minP ? PERSON : sb >= minB ? BALL : -1;
        if (label < 0) continue;
        const cx = (out[b] + gx) * s, cy = (out[b + 1] + gy) * s, bw = Math.exp(out[b + 2]) * s, bh = Math.exp(out[b + 3]) * s;
        const x = (cx - bw / 2) / scale, y = (cy - bh / 2) / scale;
        const nx = Math.max(0, x) / w, ny = Math.max(0, y) / h;
        const nw = Math.min(w - Math.max(0, x), bw / scale) / w;
        const nh = Math.min(h - Math.max(0, y), bh / scale) / h;
        boxes.push({
          x: nx, y: ny, w: nw, h: nh,
          score: label === PERSON ? sp : sb,
          label: LABELS[label]
        });
      }
    });
    const kept = nms(boxes, o.iou != null ? o.iou : 0.45).slice(0, o.max || 80);
    if (o.rgba && o.reid !== false) {
      const rw = o.rgbaW || w, rh = o.rgbaH || h;
      for (let i = 0; i < kept.length; i++) {
        if (kept[i].label === 'person') {
          kept[i].sig = colorSig(o.rgba, rw, rh, kept[i]);
        }
      }
    }
    return kept;
  }
  const rows = size => STRIDES.reduce((n, s) => n + Math.pow(Math.round(size / s), 2), 0);
  const api = { STRIDES, PERSON, BALL, tensor, tensorFromBitmap, colorSig, colorSim, decode, nms, iou, rows };
  root.SvfYolox = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
