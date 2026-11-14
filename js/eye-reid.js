(function (root) {
  'use strict';
  const TEACHER_H_DEFAULT = [0.8, 1.25];
  const SIG_LEN = 16;
  const EMA_ALPHA = 0.22;
  const REID_HOLD_SEC = 45;
  const KALMAN_DAMP = 0.85;
  function blendSig(oldSig, newSig, alpha) {
    if (!newSig || newSig.length !== SIG_LEN) return oldSig || null;
    if (!oldSig || oldSig.length !== SIG_LEN) return newSig.slice();
    const a = alpha != null ? alpha : EMA_ALPHA;
    const out = new Array(SIG_LEN);
    for (let i = 0; i < SIG_LEN; i++) {
      out[i] = Math.round((oldSig[i] * (1 - a) + newSig[i] * a) * 1000) / 1000;
    }
    return out;
  }
  function colorSim(a, b) {
    if (root.SvfYolox && typeof root.SvfYolox.colorSim === 'function') {
      return root.SvfYolox.colorSim(a, b);
    }
    if (!a || !b || a.length !== SIG_LEN || b.length !== SIG_LEN) return 0.5;
    let topSim = 0, botSim = 0;
    for (let i = 0; i < 8; i++) topSim += Math.sqrt(Math.max(0, a[i] * b[i]));
    for (let i = 8; i < 16; i++) botSim += Math.sqrt(Math.max(0, a[i] * b[i]));
    return Math.min(1, topSim * 0.65 + botSim * 0.35);
  }
  function uniformConsistency(sig) {
    if (!sig || sig.length !== SIG_LEN) return 0.5;
    let selfSim = 0;
    for (let i = 0; i < 8; i++) {
      selfSim += Math.sqrt(Math.max(0, sig[i] * sig[i + 8]));
    }
    return Math.min(1, selfSim);
  }
  function trackStepReID(T, dets, t, ar, ttl) {
    if (!T) return [];
    const maxAge = ttl != null ? ttl : 2.5;
    const aspect = ar || 1.777;
    const tracks = T.tracks || (T.tracks = []);
    if (!T.nextId) T.nextId = 1;
    tracks.forEach(tr => {
      const dt = Math.max(0, Math.min(1.0, t - (tr.t || t)));
      tr.predX = (tr.fx != null ? tr.fx : tr.cx) + (tr.vx || 0) * dt;
      tr.predY = (tr.fy != null ? tr.fy : tr.cy) + (tr.vy || 0) * dt;
    });
    const personDets = (dets || []).filter(d => (!d.label || d.label === 'person') && d.score >= 0.2);
    const usedTracks = new Set();
    const usedDets = new Set();
    const pairs = [];
    personDets.forEach((d, di) => {
      const cx = d.x + d.w / 2;
      const cy = d.y + d.h / 2;
      const fx = cx;
      const fy = d.y + d.h;
      tracks.forEach((tr, ti) => {
        const age = t - (tr.t || 0);
        if (age > maxAge) return;
        const dx = (fx - tr.predX) * aspect;
        const dy = fy - tr.predY;
        const dist = Math.hypot(dx, dy);
        const hRatio = Math.max(d.h, tr.h || d.h) / Math.max(1e-4, Math.min(d.h, tr.h || d.h));
        if (dist > 0.95 || hRatio > 1.85) return;
        const cSim = (tr.sig && d.sig) ? colorSim(tr.sig, d.sig) : 0.5;
        const colorPenalty = (1 - cSim) * 0.45;
        const cost = dist + (hRatio - 1) * 0.35 + colorPenalty;
        pairs.push({ ti, di, cost, cSim, fx, fy, cx, cy, d });
      });
    });
    pairs.sort((a, b) => a.cost - b.cost);
    pairs.forEach(p => {
      if (usedTracks.has(p.ti) || usedDets.has(p.di)) return;
      usedTracks.add(p.ti);
      usedDets.add(p.di);
      const tr = tracks[p.ti];
      const dt = Math.max(0.033, t - (tr.t || t));
      const nvx = (p.fx - (tr.fx != null ? tr.fx : p.fx)) / dt;
      const nvy = (p.fy - (tr.fy != null ? tr.fy : p.fy)) / dt;
      tr.vx = (tr.vx || 0) * 0.6 + nvx * 0.4 * KALMAN_DAMP;
      tr.vy = (tr.vy || 0) * 0.6 + nvy * 0.4 * KALMAN_DAMP;
      tr.speed = Math.hypot(tr.vx * aspect, tr.vy);
      tr.x = p.d.x; tr.y = p.d.y; tr.w = p.d.w; tr.h = p.d.h;
      tr.cx = p.cx; tr.cy = p.cy; tr.fx = p.fx; tr.fy = p.fy;
      tr.score = p.d.score;
      tr.t = t;
      tr.hits = (tr.hits || 1) + 1;
      if (p.d.sig) tr.sig = blendSig(tr.sig, p.d.sig, EMA_ALPHA);
    });
    personDets.forEach((d, di) => {
      if (usedDets.has(di)) return;
      const cx = d.x + d.w / 2, cy = d.y + d.h / 2, fx = cx, fy = d.y + d.h;
      tracks.push({
        id: T.nextId++,
        x: d.x, y: d.y, w: d.w, h: d.h,
        cx, cy, fx, fy,
        vx: 0, vy: 0, speed: 0,
        score: d.score,
        t,
        born: t,
        hits: 1,
        sig: d.sig ? d.sig.slice() : null
      });
    });
    T.tracks = tracks.filter(tr => (t - (tr.t || 0)) <= maxAge);
    return T.tracks.filter(tr => (t - (tr.t || 0)) <= 0.45);
  }
  function teacherStepReID(T, tch, t) {
    tch = tch || { id: null, fx: 0.5, fy: 0.5, h: 0.25, t: -99, sig: null, locked: false, lockScore: 0 };
    const tracks = (T && T.tracks) ? T.tracks : [];
    const live = tracks.filter(tr => (t - (tr.t || 0)) <= 0.6);
    if (!live.length) return tch;
    const heights = live.map(tr => tr.h).sort((a, b) => a - b);
    const medH = heights[Math.floor(heights.length / 2)] || 0.2;
    const curr = live.find(tr => tr.id === tch.id);
    if (curr) {
      const cSim = (tch.sig && curr.sig) ? colorSim(tch.sig, curr.sig) : 0.85;
      if (cSim >= 0.52 || !tch.sig) {
        tch.fx = curr.fx; tch.fy = curr.fy;
        tch.cx = curr.cx; tch.cy = curr.cy;
        tch.x = curr.x; tch.y = curr.y; tch.w = curr.w; tch.h = curr.h;
        tch.t = t;
        if (curr.sig) tch.sig = blendSig(tch.sig, curr.sig, 0.15);
        tch.lockScore = Math.min(1, (tch.lockScore || 0.5) + 0.04);
        return tch;
      }
    }
    const dtSinceSeen = t - (tch.t || 0);
    if (dtSinceSeen <= REID_HOLD_SEC) {
      let best = null;
      let bestScore = -1e9;
      live.forEach(tr => {
        const relH = tr.h / Math.max(1e-4, medH);
        const hFit = (relH >= TEACHER_H_DEFAULT[0] && relH <= 1.45) ? 1.0 : Math.max(0, 1 - Math.abs(relH - 1.1));
        const dist = (tch.fx != null && tch.fy != null)
          ? Math.hypot(tr.fx - tch.fx, tr.fy - tch.fy)
          : 0.3;
        const maxDist = dtSinceSeen < 3.0 ? 0.55 : 1.5;
        if (dist > maxDist && !tch.sig) return;
        const cSim = (tch.sig && tr.sig) ? colorSim(tch.sig, tr.sig) : 0.5;
        const distScore = Math.max(0, 1 - dist / maxDist);
        const edgeBonus = (tr.fx < 0.2 || tr.fx > 0.8 || tr.fy < 0.25) ? 0.08 : 0;
        const totalScore = (cSim * 0.55) + (distScore * 0.25) + (hFit * 0.12) + edgeBonus;
        if (totalScore > bestScore) {
          bestScore = totalScore;
          best = tr;
        }
      });
      if (best && bestScore >= 0.42) {
        tch.id = best.id;
        tch.fx = best.fx; tch.fy = best.fy;
        tch.cx = best.cx; tch.cy = best.cy;
        tch.x = best.x; tch.y = best.y; tch.w = best.w; tch.h = best.h;
        tch.t = t;
        if (best.sig) tch.sig = blendSig(tch.sig, best.sig, 0.2);
        return tch;
      }
    }
    return tch;
  }
  function lockTeacherAt(T, tch, normX, normY, t) {
    const tracks = (T && T.tracks) ? T.tracks : [];
    let best = null, minD = 999;
    tracks.forEach(tr => {
      const d = Math.hypot((tr.cx || tr.fx) - normX, (tr.cy || tr.fy) - normY);
      if (d < minD) { minD = d; best = tr; }
    });
    if (!best || minD > 0.25) return tch;
    tch = tch || {};
    tch.id = best.id;
    tch.fx = best.fx; tch.fy = best.fy;
    tch.cx = best.cx; tch.cy = best.cy;
    tch.x = best.x; tch.y = best.y; tch.w = best.w; tch.h = best.h;
    tch.t = t || best.t || 0;
    tch.sig = best.sig ? best.sig.slice() : tch.sig;
    tch.locked = true;
    tch.lockScore = 1.0;
    return tch;
  }
  const reidApi = {
    blendSig,
    colorSim,
    uniformConsistency,
    trackStepReID,
    teacherStepReID,
    lockTeacherAt
  };
  root.SvfEyeReID = reidApi;
  if (root.SvfEye) {
    Object.assign(root.SvfEye, {
      blendSig,
      colorSim,
      uniformConsistency,
      trackStepReID,
      teacherStep: teacherStepReID,
      lockTeacherAt
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = reidApi;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
