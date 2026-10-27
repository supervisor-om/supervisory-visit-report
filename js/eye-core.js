(function (root) {
  'use strict';

  const PERSON_MIN_SCORE = 0.22;
  const TRACK_TTL = 4.5;
  const QUEUE_DIST = 0.12;
  const CROWD_DIST = 0.08;

  const HUMAN_CONFIG = {
    backend: 'webgl',
    modelBasePath: './models',
    filter: { enabled: true, width: 0, height: 0 },
    face: { enabled: false },
    body: { enabled: true, modelPath: 'pose.json' },
    hand: { enabled: false },
    object: { enabled: false },
    segmentation: { enabled: false },
    maxDetected: 45
  };

  function inPoly(px, py, poly) {
    if (!poly || poly.length < 3) return true;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi + 1e-6) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function interpolateTracks(tracks, dt) {
    if (!tracks || !Array.isArray(tracks)) return [];
    dt = dt || 0.033;
    return tracks.map(tr => {
      if (!tr.hist || tr.hist.length < 2) return tr;
      const h1 = tr.hist[tr.hist.length - 1];
      const h2 = tr.hist[tr.hist.length - 2];
      const dtHist = (h1.t - h2.t) || 0.033;
      const vx = (h1.fx - h2.fx) / dtHist;
      const vy = (h1.fy - h2.fy) / dtHist;
      
      const predFx = h1.fx + vx * dt;
      const predFy = h1.fy + vy * dt;
      return Object.assign({}, tr, {
        predFx: Math.max(0, Math.min(1, predFx)),
        predFy: Math.max(0, Math.min(1, predFy)),
        vx: vx,
        vy: vy
      });
    });
  }

  function createTracker() {
    return {
      tracks: [],
      nextId: 1
    };
  }

  function trackStep(T, dets, t, ar, ttl) {
    ttl = ttl || TRACK_TTL;
    dets = (dets || []).filter(d => d && (d.score == null || d.score >= PERSON_MIN_SCORE));
    
    dets.forEach(d => {
      const fx = d.fx != null ? d.fx : (d.box ? d.box[0] + d.box[2] / 2 : 0.5);
      const fy = d.fy != null ? d.fy : (d.box ? d.box[1] + d.box[3] / 2 : 0.5);
      const h = d.h || (d.box ? d.box[3] : 0.2);
      const garmentColor = d.garmentColor || d.color || null;
      
      let best = null;
      let minD = 0.2;
      T.tracks.forEach(tr => {
        if (t - tr.last > ttl) return;
        const last = tr.hist[tr.hist.length - 1];
        const dist = Math.hypot(last.fx - fx, last.fy - fy);
        if (dist < minD) {
          minD = dist;
          best = tr;
        }
      });

      if (best) {
        best.last = t;
        best.hist.push({ t, fx, fy, nx: fx, ny: fy, h, garmentColor, keypoints: d.keypoints });
        if (best.hist.length > 30) best.hist.shift();
      } else {
        const newTr = {
          id: T.nextId++,
          created: t,
          last: t,
          hist: [{ t, fx, fy, nx: fx, ny: fy, h, garmentColor, keypoints: d.keypoints }]
        };
        T.tracks.push(newTr);
      }
    });

    T.tracks = T.tracks.filter(tr => (t - tr.last) <= ttl);
    interpolateTracks(T.tracks, 0.033);
    return T;
  }

  function compareGarmentColors(c1, c2) {
    if (!c1 || !c2) return 0.8;
    if (c1 === c2) return 1.0;
    return 0.75;
  }

  function teacherStep(tch, T, t, avgStudentHeight) {
    if (!tch) tch = { id: null, seen: 0, garmentColor: null, height: null };
    const live = T.tracks.filter(tr => t - tr.last <= 1.5);
    let tr = live.find(x => x.id === tch.id);

    if (!tr) {
      let cands = live.filter(x => {
        if (x.hist.length < 2) return false;
        const last = x.hist[x.hist.length - 1];
        
        let garmentScore = 0.8;
        if (tch.garmentColor && last.garmentColor) {
          garmentScore = compareGarmentColors(tch.garmentColor, last.garmentColor);
        }
        
        let heightRatioOK = true;
        if (avgStudentHeight && avgStudentHeight > 0) {
          const ratio = last.h / avgStudentHeight;
          heightRatioOK = ratio >= 1.05;
        }

        return garmentScore >= 0.72 && heightRatioOK;
      });

      cands.sort((a, b) => {
        const lastA = a.hist[a.hist.length - 1];
        const lastB = b.hist[b.hist.length - 1];
        const dA = tch.fx != null ? Math.hypot(lastA.fx - tch.fx, lastA.fy - tch.fy) : 0;
        const dB = tch.fx != null ? Math.hypot(lastB.fx - tch.fx, lastB.fy - tch.fy) : 0;
        return dA - dB;
      });

      if (cands.length > 0) {
        tr = cands[0];
        tch.id = tr.id;
      }
    }

    if (tr) {
      const last = tr.hist[tr.hist.length - 1];
      tch.seen = t;
      tch.fx = last.fx;
      tch.fy = last.fy;
      tch.h = last.h;
      if (last.garmentColor) tch.garmentColor = last.garmentColor;
    }

    return tch;
  }

  function computeMovement(tr, voiceMovementState) {
    if (!tr || !tr.hist || tr.hist.length < 2) {
      return { state: 'stationary', color: '#ef4444', netDisplacement: 0, moving: false };
    }

    const windowSize = Math.min(tr.hist.length, 15);
    const start = tr.hist[tr.hist.length - windowSize];
    const last = tr.hist[tr.hist.length - 1];

    const netDisplacement = Math.hypot(last.fx - start.fx, last.fy - start.fy);
    
    let totalPath = 0;
    for (let i = tr.hist.length - windowSize + 1; i < tr.hist.length; i++) {
      totalPath += Math.hypot(tr.hist[i].fx - tr.hist[i-1].fx, tr.hist[i].fy - tr.hist[i-1].fy);
    }

    let state = 'stationary';
    let color = '#ef4444';
    let moving = false;

    if (voiceMovementState === 'active' || netDisplacement >= 0.045) {
      state = 'spatially_active';
      color = '#10b981';
      moving = true;
    } else if (totalPath >= 0.03 || voiceMovementState === 'in_place') {
      state = 'locally_moving';
      color = '#f59e0b';
      moving = true;
    }

    return {
      state: state,
      color: color,
      netDisplacement: netDisplacement,
      totalPath: totalPath,
      moving: moving
    };
  }

  function analyseFormations(students, voiceCommand) {
    if (!students || students.length < 3) {
      return { type: 'none', label: 'بدون تشكيل', confidence: 0 };
    }

    const pts = students.map(s => ({ x: s.fx || s.x, y: s.fy || s.y }));
    const n = pts.length;

    const cx = pts.reduce((acc, p) => acc + p.x, 0) / n;
    const cy = pts.reduce((acc, p) => acc + p.y, 0) / n;

    const dists = pts.map(p => Math.hypot(p.x - cx, p.y - cy));
    const avgDist = dists.reduce((a, b) => a + b, 0) / n;
    const distVariance = dists.reduce((a, b) => a + Math.pow(b - avgDist, 2), 0) / n;

    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    const aspectRatio = width / (height + 1e-6);

    if (voiceCommand) {
      const v = voiceCommand.toLowerCase();
      if (v.includes('مربع') || v.includes('open_square') || v.includes('u')) {
        return { type: 'open_square', label: 'مربع ناقص ضلع', confidence: 0.95 };
      }
      if (v.includes('دائرة') || v.includes('circle')) {
        return { type: 'circle', label: 'دائرة', confidence: 0.95 };
      }
      if (v.includes('قاطر') || v.includes('files') || v.includes('عمود')) {
        return { type: 'files', label: 'قاطرات', confidence: 0.95 };
      }
      if (v.includes('صف') || v.includes('rows')) {
        return { type: 'rows', label: 'صفوف', confidence: 0.95 };
      }
    }

    if (distVariance < 0.008 && avgDist > 0.05) {
      return { type: 'circle', label: 'دائرة', confidence: 0.88 };
    }

    if (aspectRatio < 0.45) {
      return { type: 'files', label: 'قاطرات', confidence: 0.85 };
    }

    if (aspectRatio > 2.2) {
      return { type: 'rows', label: 'صفوف', confidence: 0.85 };
    }

    const top = pts.filter(p => p.y < minY + height * 0.35).length;
    const bottom = pts.filter(p => p.y > maxY - height * 0.35).length;
    const left = pts.filter(p => p.x < minX + width * 0.35).length;
    const right = pts.filter(p => p.x > maxX - width * 0.35).length;

    const sides = [top, bottom, left, right];
    const activeSides = sides.filter(count => count >= Math.max(1, Math.floor(n * 0.15))).length;
    if (activeSides === 3) {
      return { type: 'open_square', label: 'مربع ناقص ضلع', confidence: 0.82 };
    }

    return { type: 'open_square', label: 'مربع ناقص ضلع', confidence: 0.70 };
  }

  function computeFileCrowding(students) {
    if (!students || students.length < 2) return { crowded: false, count: 0, clusters: [] };

    let crowdCount = 0;
    const clusters = [];

    for (let i = 0; i < students.length; i++) {
      for (let j = i + 1; j < students.length; j++) {
        const s1 = students[i];
        const s2 = students[j];
        
        const apparentH = (s1.h + s2.h) / 2 || 0.2;
        const scaledCrowdDist = CROWD_DIST * (apparentH / 0.2);

        const dist = Math.hypot((s1.fx || s1.x) - (s2.fx || s2.x), (s1.fy || s1.y) - (s2.fy || s2.y));
        if (dist <= scaledCrowdDist) {
          crowdCount++;
          clusters.push([s1.id, s2.id]);
        }
      }
    }

    return {
      crowded: crowdCount > 0,
      count: crowdCount,
      clusters: clusters,
      QUEUE_DIST: QUEUE_DIST,
      CROWD_DIST: CROWD_DIST
    };
  }

  function detectBarefootStudents(students) {
    if (!students || !Array.isArray(students)) return [];

    const barefootList = [];

    students.forEach(st => {
      let isBarefoot = false;
      const kps = st.keypoints || [];
      
      const ankleL = kps.find(k => k.name === 'left_ankle' || k.id === 15);
      const ankleR = kps.find(k => k.name === 'right_ankle' || k.id === 16);
      const footL = kps.find(k => k.name === 'left_foot_index' || k.id === 17);
      const footR = kps.find(k => k.name === 'right_foot_index' || k.id === 18);

      if (st.barefoot === true || (st.shoeDetected === false)) {
        isBarefoot = true;
      } else if (ankleL && footL && (ankleL.score > 0.4 || footL.score > 0.4)) {
        if (st.footSkinMatch) isBarefoot = true;
      }

      if (isBarefoot) {
        st.barefoot = true;
        st.alert = 'بدون حذاء';
        barefootList.push(st);
      }
    });

    return barefootList;
  }

  function checkFrameBoundaries(students) {
    if (!students || !Array.isArray(students)) return false;

    let nearBoundary = false;
    const margin = 0.05;

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const x = s.fx != null ? s.fx : s.x;
      const y = s.fy != null ? s.fy : s.y;

      if (x != null && y != null) {
        if (x <= margin || x >= (1 - margin) || y <= margin || y >= (1 - margin)) {
          nearBoundary = true;
          break;
        }
      }
    }

    if (nearBoundary) {
      if (root.SvfEyeLink && typeof root.SvfEyeLink.sendCameraCommand === 'function') {
        try {
          root.SvfEyeLink.sendCameraCommand('auto-wide');
        } catch (e) {
          console.warn('Auto-wide command error:', e);
        }
      }
    }

    return nearBoundary;
  }

  function drawStudentOverlay(ctx, students, options) {
    options = options || {};
    const pointSize = options.pointSize || 3.5;
    const lineWidth = options.lineWidth || 1.4;

    students.forEach(s => {
      const x = (s.fx != null ? s.fx : s.x) * ctx.canvas.width;
      const y = (s.fy != null ? s.fy : s.y) * ctx.canvas.height;
      const color = s.color || '#10b981';

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, pointSize, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      if (s.barefoot) {
        ctx.fillStyle = '#ef4444';
        ctx.font = '11px sans-serif';
        ctx.fillText('بدون حذاء', x + 6, y - 6);
      }

      ctx.restore();
    });
  }

  const SvfEyeCore = {
    HUMAN_CONFIG: HUMAN_CONFIG,
    PERSON_MIN_SCORE: PERSON_MIN_SCORE,
    TRACK_TTL: TRACK_TTL,
    QUEUE_DIST: QUEUE_DIST,
    CROWD_DIST: CROWD_DIST,
    pointSize: 3.5,
    lineWidth: 1.4,
    createTracker: createTracker,
    trackStep: trackStep,
    teacherStep: teacherStep,
    computeMovement: computeMovement,
    analyseFormations: analyseFormations,
    computeFileCrowding: computeFileCrowding,
    detectBarefootStudents: detectBarefootStudents,
    checkFrameBoundaries: checkFrameBoundaries,
    interpolateTracks: interpolateTracks,
    drawStudentOverlay: drawStudentOverlay,
    inPoly: inPoly
  };

  root.SvfEyeCore = SvfEyeCore;

})(typeof self !== 'undefined' ? self : this);
// إطاراً كلّ ربع ثانيةٍ بحجم ٩٦ بكسلاً، ومن الميكروفون طيف
