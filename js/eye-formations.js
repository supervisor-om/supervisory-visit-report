/* وحدة تحليل التشكيلات الرياضية والخريطة الحرارية للملعب – (js/eye-formations.js)
 * جزء من تفكيك وترقية محرك "عين المشرف" (Supervisor Eye Modular Architecture)
 *
 * تفصل هذه الوحدة حسابات الهندسة المكانية، التشكيلات (خطوط، دوائر، مجموعات)،
 * وتغطية المعلم للملعب (Heatmap & Spatial Coverage) عن ملف `eye-core.js` الضخم.
 */
(function (root) {
  'use strict';

  const FORMS = {
    L: 'صفوف / قاطرات منتظمة',
    C: 'حلقة دائرية / قوس إشرافي',
    G: 'مجموعات / محطات تدريبية',
    X: 'انتشار حر / غير منتظم'
  };

  const LINK_DIST = 1.6;
  const LONG_LINE = 5;
  const GRID_W = 12;
  const GRID_H = 8;

  // تصنيف شكل التجمع الهندسي لمجموعة من الطلاب (3 فأكثر)
  function shapeOfCluster(pts) {
    const n = pts.length;
    if (n < 3) return 'X';

    // 1. حساب المركز الهندسي ومصفوفة التغاير (PCA Eigenvalues) لمعرفة الاستطالة الخطية
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += pts[i].fx; my += pts[i].fy; }
    mx /= n; my /= n;

    let sxx = 0, syy = 0, sxy = 0;
    const radii = [];
    for (let i = 0; i < n; i++) {
      const dx = pts[i].fx - mx, dy = pts[i].fy - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
      radii.push(Math.hypot(dx, dy));
    }
    sxx /= n; syy /= n; sxy /= n;

    const trace = sxx + syy;
    const det = sxx * syy - sxy * sxy;
    const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
    const l1 = trace / 2 + disc;
    const l2 = Math.max(1e-6, trace / 2 - disc);
    const elongation = Math.sqrt(l1 / l2);

    // إذا كانت نسبة الاستطالة عالية فالتشكيل خط مستقيم أو صف
    if (elongation >= 2.65) return 'L';

    // 2. فحص انتظام نصف القطر حول المركز لمعرفة ما إذا كان حلقة دائرية أو قوساً (U-Shape / Circle)
    if (n >= 4) {
      const meanR = radii.reduce((a, b) => a + b, 0) / n;
      if (meanR > 0.04) {
        const varR = radii.reduce((acc, r) => acc + Math.pow(r - meanR, 2), 0) / n;
        const cvR = Math.sqrt(varR) / meanR;
        if (cvR <= 0.32) return 'C';
      }
    }

    return 'G';
  }

  // تحليل التشكيلات المكانية للطلاب عبر Union-Find
  function formations(ppl) {
    const list = (ppl || []).filter(p => p && p.fx != null && p.fy != null);
    const n = list.length;
    if (!n) {
      return { dom: 'X', line: 0, circle: 0, group: 0, loose: 0, longestLine: 0, clusters: [], structuredRatio: 0 };
    }

    const parent = Array.from({ length: n }, (_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (i, j) => {
      const ri = find(i), rj = find(j);
      if (ri !== rj) parent[ri] = rj;
    };

    for (let i = 0; i < n; i++) {
      const hi = Math.max(0.08, list[i].h || 0.18);
      for (let j = i + 1; j < n; j++) {
        const hj = Math.max(0.08, list[j].h || 0.18);
        const hAvg = (hi + hj) / 2;
        const d = Math.hypot(list[i].fx - list[j].fx, list[i].fy - list[j].fy);
        if (d <= LINK_DIST * hAvg) union(i, j);
      }
    }

    const groupsMap = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!groupsMap.has(r)) groupsMap.set(r, []);
      groupsMap.get(r).push(list[i]);
    }

    let line = 0, circle = 0, group = 0, loose = 0, longestLine = 0;
    const clusters = [];

    groupsMap.forEach(pts => {
      if (pts.length < 3) {
        loose += pts.length;
        return;
      }
      const kind = shapeOfCluster(pts);
      clusters.push({ kind, count: pts.length, points: pts });
      if (kind === 'L') {
        line += pts.length;
        if (pts.length > longestLine) longestLine = pts.length;
      } else if (kind === 'C') {
        circle += pts.length;
      } else {
        group += pts.length;
      }
    });

    let dom = 'X';
    const maxCount = Math.max(line, circle, group);
    if (maxCount >= Math.max(3, n * 0.35)) {
      if (maxCount === line) dom = 'L';
      else if (maxCount === circle) dom = 'C';
      else dom = 'G';
    }

    const structuredRatio = Math.round(((line + circle + group) / n) * 100) / 100;
    return { dom, line, circle, group, loose, longestLine, clusters, structuredRatio };
  }

  // إحصاءات التشكيلات عبر الزمن
  function formationStats(series) {
    const arr = series || [];
    if (!arr.length) return { L: 0, C: 0, G: 0, X: 0, dominant: 'X', transitions: 0 };
    const counts = { L: 0, C: 0, G: 0, X: 0 };
    let transitions = 0;
    let prev = null;
    arr.forEach(s => {
      const k = (s && s.dom && counts[s.dom] != null) ? s.dom : 'X';
      counts[k]++;
      if (prev && prev !== k && k !== 'X') transitions++;
      if (k !== 'X') prev = k;
    });
    const total = arr.length;
    const dominant = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b), 'X');
    return {
      L: Math.round((counts.L * 100) / total),
      C: Math.round((counts.C * 100) / total),
      G: Math.round((counts.G * 100) / total),
      X: Math.round((counts.X * 100) / total),
      dominant,
      transitions
    };
  }

  // حساب الخريطة الحرارية لتنقلات المعلم واكتشاف المناطق الميتة (Dead Zones) في الملعب
  function teacherCoverageHeatmap(tchHistory, gridW, gridH) {
    const gw = gridW || GRID_W, gh = gridH || GRID_H;
    const cells = new Float32Array(gw * gh);
    const pts = (tchHistory || []).filter(p => p && p.fx != null && p.fy != null);
    if (!pts.length) {
      return { cells: Array.from(cells), coveragePct: 0, deadZones: ['كامل الملعب'], quadrantBalance: [0, 0, 0, 0] };
    }

    const quad = [0, 0, 0, 0]; // [أعلى-يسار، أعلى-يمين، أسفل-يسار، أسفل-يمين]
    pts.forEach(p => {
      const cx = Math.min(gw - 1, Math.max(0, Math.floor(p.fx * gw)));
      const cy = Math.min(gh - 1, Math.max(0, Math.floor(p.fy * gh)));
      cells[cy * gw + cx] += 1;
      const qx = p.fx >= 0.5 ? 1 : 0;
      const qy = p.fy >= 0.5 ? 2 : 0;
      quad[qy + qx] += 1;
    });

    let visited = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i] > 0) visited++;
    const coveragePct = Math.round((visited / cells.length) * 100);

    const total = pts.length;
    const quadrantBalance = quad.map(q => Math.round((q * 100) / total));
    const zoneNames = ['الجهة الأمامية اليسرى', 'الجهة الأمامية اليمنى', 'الجهة الخلفية اليسرى', 'الجهة الخلفية اليمنى'];
    const deadZones = [];
    quadrantBalance.forEach((pct, idx) => {
      if (pct < 8) deadZones.push(zoneNames[idx]);
    });

    return {
      cells: Array.from(cells),
      coveragePct,
      deadZones,
      quadrantBalance
    };
  }

  const formApi = {
    FORMS,
    LONG_LINE,
    GRID_W,
    GRID_H,
    shapeOfCluster,
    formations,
    formationStats,
    teacherCoverageHeatmap
  };

  root.SvfEyeFormations = formApi;
  if (root.SvfEye) {
    Object.assign(root.SvfEye, {
      formationsPca: formations,
      formationStatsPca: formationStats,
      teacherCoverageHeatmap
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = formApi;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
