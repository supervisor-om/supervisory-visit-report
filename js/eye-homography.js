/* وحدة معايرة منظور الملعب والمسقط الرأسي وتقسيم المحطات التدريبية الأربع – (js/eye-homography.js)
 * جزء من محرك "عين المشرف" (Supervisor Eye Court Homography & 4-Station Rotation Engine)
 *
 * المزايا الأساسية:
 * 1. معايرة المنظور الهندسي بـ 4 نقاط (4-Point Perspective Homography):
 *    تحويل إحداثيات الكاميرا المائلة (2D Screen Space) إلى مسقط رأسي حقيقي بالأمتار (Top-Down Court Meters)
 *    باستخدام حل نظام المعادلات الخطية (Gaussian Elimination 8x8) وحساب المصفوفة العكسية لإسقاط شبكة المحطات على الكاميرا.
 * 2. أبعاد قياسية ومصغرة جاهزة للملاعب المدرسية (كرة يد، كرة سلة، كرة طائرة، كرة قدم مصغرة، أو ساحة مدرسية مخصصة).
 * 3. نظام المحطات التدريبية الأربع والتناوب الدائري (4-Station Circular Rotation Tracker):
 *    يقسم الملعب المعاير إلى 4 محطات مستقلة، ويرصد في كل محطة: عدد الطلاب، نسبة النشاط الحركي (MVPA)،
 *    حالة المحطة (نشطة / خاملة / مزدحمة)، وزيارة المعلم لكل محطة، مع جدول التناوب الدائري لـ 4 أو 8 فرق عبر 4 جولات.
 */
(function (root) {
  'use strict';

  // الأبعاد القياسية والمصغرة للملاعب المدرسية بالأمتار (الطول × العرض)
  const COURT_PRESETS = {
    school_yard: { name: 'ساحة مدرسية قياسية', lengthM: 28, widthM: 15 },
    basketball:  { name: 'ملعب كرة سلة', lengthM: 28, widthM: 15 },
    volleyball:  { name: 'ملعب كرة طائرة', lengthM: 18, widthM: 9 },
    handball:    { name: 'ملعب كرة يد مصغر', lengthM: 32, widthM: 16 },
    mini_foot:   { name: 'ملعب كرة قدم مصغر', lengthM: 30, widthM: 24 }
  };

  // أسماء المحطات التدريبية الأربع الافتراضية
  const DEFAULT_STATIONS = [
    { id: 1, name: 'المحطة (1): التدريب المهاري الأساسي', quadrant: 'TL', xMin: 0, xMax: 0.5, yMin: 0, yMax: 0.5 },
    { id: 2, name: 'المحطة (2): التصويب والدقة على الأقماع', quadrant: 'TR', xMin: 0.5, xMax: 1.0, yMin: 0, yMax: 0.5 },
    { id: 3, name: 'المحطة (3): اللياقة والرشاقة التوافقية', quadrant: 'BL', xMin: 0, xMax: 0.5, yMin: 0.5, yMax: 1.0 },
    { id: 4, name: 'المحطة (4): الألعاب المصغرة والتطبيق', quadrant: 'BR', xMin: 0.5, xMax: 1.0, yMin: 0.5, yMax: 1.0 }
  ];

  // حل نظام معادلات خطية A·x = b بالحذف الغاوسي مع الارتكاز الجزئي (Partial Pivoting)
  function solveLinearSystem8(A, b) {
    const n = 8;
    const M = A.map((row, i) => row.slice().concat([b[i]]));

    for (let col = 0; col < n; col++) {
      let pivot = col;
      let maxVal = Math.abs(M[col][col]);
      for (let row = col + 1; row < n; row++) {
        const v = Math.abs(M[row][col]);
        if (v > maxVal) { maxVal = v; pivot = row; }
      }
      if (maxVal < 1e-11) return null;
      if (pivot !== col) {
        const tmp = M[col]; M[col] = M[pivot]; M[pivot] = tmp;
      }

      const div = M[col][col];
      for (let j = col; j <= n; j++) M[col][j] /= div;

      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = M[row][col];
        if (Math.abs(factor) < 1e-12) continue;
        for (let j = col; j <= n; j++) {
          M[row][j] -= factor * M[col][j];
        }
      }
    }

    return M.map(row => row[n]);
  }

  // حساب مصفوفة التحويل الهندسي 3x3 (Homography Matrix H) التي تحوّل النقاط الأربع من src إلى dst
  // srcPts, dstPts: [{x, y}, {x, y}, {x, y}, {x, y}] بالترتيب: أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار
  function computeHomography(srcPts, dstPts) {
    if (!Array.isArray(srcPts) || !Array.isArray(dstPts) || srcPts.length < 4 || dstPts.length < 4) return null;
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const x = srcPts[i].x, y = srcPts[i].y;
      const u = dstPts[i].x, v = dstPts[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    const h = solveLinearSystem8(A, b);
    if (!h) return null;
    return [
      h[0], h[1], h[2],
      h[3], h[4], h[5],
      h[6], h[7], 1
    ];
  }

  // تطبيق مصفوفة التحويل 3x3 على نقطة (x, y)
  function projectPoint(H, x, y) {
    if (!H || H.length !== 9) return { x, y };
    const w = H[6] * x + H[7] * y + H[8];
    if (Math.abs(w) < 1e-8) return { x, y };
    return {
      x: (H[0] * x + H[1] * y + H[2]) / w,
      y: (H[3] * x + H[4] * y + H[5]) / w
    };
  }

  // إنشاء كائن معايرة الملعب (Calibrator) من 4 زوايا يحددها المشرف على شاشة الكاميرا
  // corners: [{x, y}, {x, y}, {x, y}, {x, y}] بإحداثيات الشاشة المطبّعة (0..1)
  function createCourtCalibration(corners, presetOrDims) {
    const preset = typeof presetOrDims === 'string'
      ? (COURT_PRESETS[presetOrDims] || COURT_PRESETS.school_yard)
      : (presetOrDims || COURT_PRESETS.school_yard);

    const lengthM = preset.lengthM || 28;
    const widthM = preset.widthM || 15;

    const src = (corners && corners.length === 4) ? corners : [
      { x: 0.15, y: 0.22 }, // أعلى-يسار (بعيد)
      { x: 0.85, y: 0.22 }, // أعلى-يمين (بعيد)
      { x: 0.96, y: 0.92 }, // أسفل-يمين (قريب)
      { x: 0.04, y: 0.92 }  // أسفل-يسار (قريب)
    ];

    const dstNorm = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ];

    const H_toCourt = computeHomography(src, dstNorm);
    const H_toScreen = computeHomography(dstNorm, src);

    // تحويل نقطة من شاشة الكاميرا (fx, fy) إلى المسقط الرأسي للملعب (u, v في 0..1) وإلى الأمتار الحقيقية (mx, my)
    function screenToCourt(fx, fy) {
      const p = projectPoint(H_toCourt, fx, fy);
      const u = Math.max(-0.2, Math.min(1.2, p.x));
      const v = Math.max(-0.2, Math.min(1.2, p.y));
      const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      return {
        u: Math.round(u * 1000) / 1000,
        v: Math.round(v * 1000) / 1000,
        meterX: Math.round(u * lengthM * 100) / 100,
        meterY: Math.round(v * widthM * 100) / 100,
        inside
      };
    }

    // تحويل نقطة من المسقط الرأسي للملعب (u, v في 0..1) إلى إحداثيات الكاميرا لرسم الخطوط والمحطات فوق الفيديو
    function courtToScreen(u, v) {
      return projectPoint(H_toScreen, u, v);
    }

    // حساب المسافة الحقيقية بالأمتار بين نقطتين على شاشة الكاميرا
    function distanceMeters(ptA, ptB) {
      const cA = screenToCourt(ptA.fx != null ? ptA.fx : ptA.x, ptA.fy != null ? ptA.fy : ptA.y);
      const cB = screenToCourt(ptB.fx != null ? ptB.fx : ptB.x, ptB.fy != null ? ptB.fy : ptB.y);
      return Math.round(Math.hypot(cA.meterX - cB.meterX, cA.meterY - cB.meterY) * 100) / 100;
    }

    // استخراج مضلعات المحطات الأربع على شاشة الكاميرا لرسمها بصرياً
    function getStationScreenPolygons(customStations) {
      const stations = customStations || DEFAULT_STATIONS;
      return stations.map(st => {
        const poly = [
          courtToScreen(st.xMin, st.yMin),
          courtToScreen(st.xMax, st.yMin),
          courtToScreen(st.xMax, st.yMax),
          courtToScreen(st.xMin, st.yMax)
        ];
        const center = courtToScreen((st.xMin + st.xMax) / 2, (st.yMin + st.yMax) / 2);
        return {
          id: st.id,
          name: st.name,
          quadrant: st.quadrant,
          polygon: poly,
          center
        };
      });
    }

    return {
      presetName: preset.name || 'ملعب مدرسي',
      lengthM,
      widthM,
      corners: src,
      H_toCourt,
      H_toScreen,
      screenToCourt,
      courtToScreen,
      distanceMeters,
      getStationScreenPolygons
    };
  }

  // تحليل نشاط المحطات التدريبية الأربع لحظياً (4-Station Activity & Teacher Visit Analyzer)
  function analyzeStations(tracks, teacher, calibration, customStations) {
    const cal = calibration || createCourtCalibration();
    const stations = customStations || DEFAULT_STATIONS;
    const tchId = teacher && teacher.id != null ? teacher.id : null;

    const stationStats = stations.map(st => ({
      id: st.id,
      name: st.name,
      quadrant: st.quadrant,
      studentCount: 0,
      movingCount: 0,
      mvpaPct: 0,
      avgSpeedMps: 0,
      teacherPresent: false,
      status: 'فارغة',
      alert: null
    }));

    // تحديد المحطة التي يتواجد فيها المعلم حالياً
    if (teacher && teacher.fx != null && teacher.fy != null) {
      const tc = cal.screenToCourt(teacher.fx, teacher.fy);
      stationStats.forEach((st, idx) => {
        const def = stations[idx];
        if (tc.u >= def.xMin && tc.u <= def.xMax && tc.v >= def.yMin && tc.v <= def.yMax) {
          st.teacherPresent = true;
        }
      });
    }

    // توزيع الطلاب على المحطات الأربع وحساب سرعاتهم الحقيقية بالأمتار/ثانية
    (tracks || []).forEach(tr => {
      if (!tr || tr.id === tchId || tr.fx == null || tr.fy == null) return;
      const c = cal.screenToCourt(tr.fx, tr.fy);
      if (!c.inside) return;

      for (let i = 0; i < stations.length; i++) {
        const def = stations[i];
        if (c.u >= def.xMin && c.u <= def.xMax && c.v >= def.yMin && c.v <= def.yMax) {
          const st = stationStats[i];
          st.studentCount++;
          const speedNorm = tr.speed || 0;
          const speedMps = Number.isFinite(tr.speedMps) ? tr.speedMps : null;
          if (speedMps != null) {
            st._sumSpeed = (st._sumSpeed || 0) + speedMps;
            st._speedN = (st._speedN || 0) + 1;
          }
          if (tr.moving ?? (speedNorm >= 0.12 || speedMps >= 1.1)) {
            st.movingCount++;
          }
          break;
        }
      }
    });

    // حساب النسب المئوية والتنبيهات لكل محطة
    stationStats.forEach(st => {
      const sumSpd = st._sumSpeed || 0, speedN = st._speedN || 0;
      delete st._speedN;
      delete st._sumSpeed;
      if (st.studentCount === 0) {
        st.status = 'فارغة';
        return;
      }
      st.mvpaPct = Math.round((st.movingCount * 100) / st.studentCount);
      st.avgSpeedMps = speedN ? Math.round((sumSpd / speedN) * 100) / 100 : null;

      if (st.mvpaPct >= 55) {
        st.status = 'نشطة جداً';
      } else if (st.mvpaPct >= 30) {
        st.status = 'نشاط متوسط';
      } else {
        st.status = 'خاملة / انتظار طويل';
        st.alert = `انخفاض النشاط في ${st.name} (${st.mvpaPct}%) — تحتاج لتدخل المعلم`;
      }

      if (st.studentCount >= 12 && st.mvpaPct < 40) {
        st.alert = `تكدس طلابي (${st.studentCount} طالباً) في ${st.name} مع بطء في التناوب`;
      }
    });

    const activeStationsCount = stationStats.filter(s => s.studentCount > 0 && s.mvpaPct >= 40).length;
    const alerts = stationStats.map(s => s.alert).filter(Boolean);

    return {
      courtPreset: cal.presetName,
      dimensionsM: { length: cal.lengthM, width: cal.widthM },
      activeStationsCount,
      stations: stationStats,
      alerts
    };
  }

  // توليد جدول التناوب الدائري للمحطات الأربع (Circular Station Rotation Schedule لـ 4 أو 8 فرق عبر 4 جولات)
  function generateStationRotationSchedule(teamsInput, roundDurationMin) {
    const dur = roundDurationMin || 6;
    const default4 = ['الأمل', 'التعاون', 'القوة', 'الشجاعة'];
    const teams = Array.isArray(teamsInput) && teamsInput.length ? teamsInput : default4;
    const rounds = [];

    if (teams.length === 8) {
      // نظام 8 فرق مزدوجة (فريقان في كل محطة يتنافسان أو يتشاركان المهام عبر 4 جولات)
      const pairs = [
        [teams[0], teams[1]],
        [teams[2], teams[3]],
        [teams[4], teams[5]],
        [teams[6], teams[7]]
      ];
      for (let r = 0; r < 4; r++) {
        rounds.push({
          round: r + 1,
          durationMin: dur,
          assignments: DEFAULT_STATIONS.map((st, sIdx) => {
            const pair = pairs[(sIdx - r + 4) % 4];
            return {
              stationId: st.id,
              stationName: st.name,
              teams: pair.join(' × ')
            };
          })
        });
      }
    } else {
      // نظام 4 فرق قياسي (فريق واحد في كل محطة يدور مع عقارب الساعة عبر 4 جولات)
      for (let r = 0; r < 4; r++) {
        rounds.push({
          round: r + 1,
          durationMin: dur,
          assignments: DEFAULT_STATIONS.map((st, sIdx) => ({
            stationId: st.id,
            stationName: st.name,
            teams: teams[(sIdx - r + 4) % teams.length]
          }))
        });
      }
    }

    return {
      totalRounds: 4,
      roundDurationMin: dur,
      totalTimeMin: dur * 4,
      rounds
    };
  }

  const homoApi = {
    COURT_PRESETS,
    DEFAULT_STATIONS,
    computeHomography,
    projectPoint,
    createCourtCalibration,
    analyzeStations,
    generateStationRotationSchedule
  };

  root.SvfEyeHomography = homoApi;
  if (root.SvfEye) {
    Object.assign(root.SvfEye, {
      COURT_PRESETS,
      DEFAULT_STATIONS,
      computeHomography,
      createCourtCalibration,
      analyzeStations,
      generateStationRotationSchedule
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = homoApi;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
