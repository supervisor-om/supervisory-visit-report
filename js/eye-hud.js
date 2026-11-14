(function (root) {
  'use strict';
  const COLORS = {
    active:   { fill: 'rgba(16, 185, 129, 0.14)', stroke: '#10b981', text: '#ecfdf5' },
    medium:   { fill: 'rgba(245, 158, 11, 0.14)', stroke: '#f59e0b', text: '#fffbeb' },
    idle:     { fill: 'rgba(239, 68, 68, 0.18)',  stroke: '#ef4444', text: '#fef2f2' },
    empty:    { fill: 'rgba(148, 163, 184, 0.08)', stroke: 'rgba(148,163,184,0.45)', text: '#e2e8f0' },
    teacher:  '#f0b44a',
    spotlight:'#38bdf8',
    jointOk:  '#34d399',
    jointWarn:'#fb7185'
  };
  function statusStyle(mvpaPct, studentCount) {
    if (!studentCount) return COLORS.empty;
    if (mvpaPct >= 55) return COLORS.active;
    if (mvpaPct >= 30) return COLORS.medium;
    return COLORS.idle;
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function drawBadge(ctx, text, x, y, bg, fg, font) {
    ctx.save();
    ctx.font = font || '600 12px "IBM Plex Sans Arabic", Tahoma, sans-serif';
    const padX = 8, h = 22;
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2;
    const bx = Math.max(4, Math.min(ctx.canvas.width - bw - 4, x - bw / 2));
    const by = Math.max(4, Math.min(ctx.canvas.height - h - 4, y - h / 2));
    ctx.fillStyle = bg || 'rgba(8, 39, 66, 0.86)';
    roundRectPath(ctx, bx, by, bw, h, 6);
    ctx.fill();
    ctx.fillStyle = fg || '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + h / 2 + 1);
    ctx.restore();
  }
  function drawStationsLayer(ctx, W, H, calibration, stationAnalysis) {
    if (!calibration || !calibration.getStationScreenPolygons) return;
    const polys = calibration.getStationScreenPolygons();
    const stats = (stationAnalysis && stationAnalysis.stations) || [];
    polys.forEach((p, idx) => {
      const st = stats[idx] || { studentCount: 0, mvpaPct: 0, teacherPresent: false };
      const stStyle = statusStyle(st.mvpaPct, st.studentCount);
      ctx.save();
      ctx.beginPath();
      p.polygon.forEach((pt, i) => {
        const px = pt.x * W, py = pt.y * H;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = stStyle.fill;
      ctx.fill();
      ctx.lineWidth = st.teacherPresent ? 2.5 : 1.5;
      ctx.setLineDash(st.studentCount ? [] : [6, 5]);
      ctx.strokeStyle = stStyle.stroke;
      ctx.stroke();
      ctx.restore();
      const cx = p.center.x * W, cy = p.center.y * H;
      const label = st.studentCount
        ? `م${p.id}: ${st.studentCount} طلاب | ${st.mvpaPct}%`
        : `م${p.id}: فارغة`;
      drawBadge(ctx, label, cx, cy, 'rgba(8, 39, 66, 0.82)', stStyle.text);
    });
  }
  function drawTeacherBadge(ctx, W, H, teacher) {
    if (!teacher || teacher.x == null || teacher.y == null) return;
    const x = teacher.x * W, y = teacher.y * H;
    const w = teacher.w * W, h = teacher.h * H;
    ctx.save();
    ctx.strokeStyle = COLORS.teacher;
    ctx.lineWidth = 2.5;
    roundRectPath(ctx, x, y, w, h, 8);
    ctx.stroke();
    const conf = Math.round((teacher.lockScore || 0.85) * 100);
    const title = teacher.locked ? `المعلم (مثبّت ${conf}%)` : `المعلم (${conf}%)`;
    drawBadge(ctx, title, x + w / 2, Math.max(14, y - 12), 'rgba(240, 180, 74, 0.95)', '#082742');
    ctx.restore();
  }
  function drawBiomechanicsLayer(ctx, W, H, spotlights, bioResult) {
    (spotlights || []).forEach((sp, idx) => {
      const bx = sp.box.x * W, by = sp.box.y * H, bw = sp.box.w * W, bh = sp.box.h * H;
      ctx.save();
      ctx.strokeStyle = COLORS.spotlight;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      roundRectPath(ctx, bx, by, bw, bh, 8);
      ctx.stroke();
      ctx.restore();
      if (idx === 0) {
        drawBadge(ctx, `مؤدي نشط #${sp.trackId}`, bx + bw / 2, Math.max(14, by - 12), 'rgba(14, 116, 144, 0.92)', '#f0f9ff');
      }
    });
    if (bioResult && bioResult.valid && bioResult.angles) {
      const a = bioResult.angles;
      const parts = [];
      if (a.blockKneeDeg != null) parts.push(`الارتكاز: ${a.blockKneeDeg}°`);
      if (a.releaseAngleDeg != null) parts.push(`الإطلاق: ${a.releaseAngleDeg}°`);
      if (a.trunkArchDeg != null) parts.push(`تقوس الجذع: ${a.trunkArchDeg}°`);
      if (a.kneeAvgDeg != null) parts.push(`الركبتان: ${a.kneeAvgDeg}°`);
      const summary = `${bioResult.skillAr} (${bioResult.score}%) — ${parts.join(' | ')}`;
      drawBadge(ctx, summary, W / 2, H - 22, 'rgba(8, 39, 66, 0.9)', '#34d399', '600 13px "IBM Plex Sans Arabic", Tahoma, sans-serif');
    }
  }
  function drawTopBar(ctx, W, stats) {
    if (!stats) return;
    const ep = (stats.ep || 'wasm').toUpperCase();
    const ms = stats.ms != null ? `${stats.ms}ms` : '--';
    const mvpa = stats.mvpaPct != null ? `MVPA ${stats.mvpaPct}%` : '';
    const count = stats.pupilsCount != null ? `${stats.pupilsCount} طالب` : '';
    const text = [ep, ms, count, mvpa].filter(Boolean).join('  •  ');
    drawBadge(ctx, text, W / 2, 18, 'rgba(8, 39, 66, 0.85)', '#f8fafc');
  }
  function renderHUD(canvas, state) {
    if (!canvas || !canvas.getContext) return false;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const st = state || {};
    if (st.clear !== false) ctx.clearRect(0, 0, W, H);
    if (st.calibration) {
      drawStationsLayer(ctx, W, H, st.calibration, st.stationAnalysis);
    }
    if (st.teacher) {
      drawTeacherBadge(ctx, W, H, st.teacher);
    }
    if (st.spotlights || st.bioResult) {
      drawBiomechanicsLayer(ctx, W, H, st.spotlights, st.bioResult);
    }
    if (st.topStats) {
      drawTopBar(ctx, W, st.topStats);
    }
    return true;
  }
  function bindInteractiveLock(canvas, getTracker, getTeacherRef, onLock) {
    if (!canvas || !canvas.addEventListener) return function () {};
    const handler = function (ev) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (ev.clientX - rect.left) / rect.width;
      const ny = (ev.clientY - rect.top) / rect.height;
      const T = typeof getTracker === 'function' ? getTracker() : getTracker;
      const tch = typeof getTeacherRef === 'function' ? getTeacherRef() : getTeacherRef;
      if (root.SvfEyeReID && typeof root.SvfEyeReID.lockTeacherAt === 'function') {
        const updated = root.SvfEyeReID.lockTeacherAt(T, tch, nx, ny, performance.now() / 1000);
        if (typeof onLock === 'function') onLock(updated);
      }
    };
    canvas.addEventListener('click', handler);
    return function unbind() { canvas.removeEventListener('click', handler); };
  }
  const hudApi = {
    COLORS,
    drawStationsLayer,
    drawTeacherBadge,
    drawBiomechanicsLayer,
    drawTopBar,
    renderHUD,
    bindInteractiveLock
  };
  root.SvfEyeHUD = hudApi;
  if (root.SvfEye) {
    Object.assign(root.SvfEye, {
      renderHUD,
      bindInteractiveLock
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = hudApi;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
