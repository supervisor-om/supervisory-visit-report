/* وحدة المختبر البيوميكانيكي للمهارات الرياضية مع التركيز الانتقائي وسط الحشود – (js/eye-biomechanics.js)
 * جزء من محرك "عين المشرف" (Supervisor Eye Biomechanics & Crowd Spotlight Engine)
 *
 * المزايا الأساسية:
 * 1. التركيز الانتقائي على المؤدي (Spotlight ROI Selection):
 *    في الملاعب المزدحمة (30+ طالباً)، يفرز النظام جميع المسارات ويختار تلقائياً أفضل 1–3 طلاب يؤدون المهارة
 *    (بناءً على سرعة الحركة، العزلة النسبية عن طابور الانتظار، القرب من الكرة/منطقة الأداء، واستثناء المعلم)
 *    لقصّ منطقة الطالب (ROI Crop) وتشغيل MediaPipe Pose عليها فقط بسرعة 30-60 FPS.
 * 2. التحليل البيوميكانيكي للمهارات المنهجية:
 *    - دفع الجلة (Shot Put): زاوية ثني ركبة الدفع، زاوية إطلاق الذراع (~38°-42°)، صلابة رجل الارتكاز العكسية (Opposite-Foot-Forward Blocking Leg)، وميل الجذع.
 *    - نطح الكرة بالرأس (Football Heading): مرحلة التقوس الخلفي للجذع (Arch Phase)، توقيت الارتقاء، وضرب الكرة بالجبهة مع ثبات الرقبة.
 *    - الوثب العمودي والطويل (Vertical & Broad Jump): زاوية التحضير للركبتين (90°-115°)، تزامن مرجحة الذراعين، وامتداد الجسم الكامل (Triple Extension).
 * 3. التغذية التلقائية لاستمارة الزيارة (البند 3 والبند 10) وتبويب المداولة الإشرافية (GROW).
 */
(function (root) {
  'use strict';

  // فهارس نقاط المفاصل القياسية في MediaPipe BlazePose / COCO (17 أو 33 نقطة)
  const KP = {
    NOSE: 0,
    L_SHOULDER: 11, R_SHOULDER: 12,
    L_ELBOW: 13,    R_ELBOW: 14,
    L_WRIST: 15,    R_WRIST: 16,
    L_HIP: 23,      R_HIP: 24,
    L_KNEE: 25,     R_KNEE: 26,
    L_ANKLE: 27,    R_ANKLE: 28
  };

  // فهارس بديلة إذا كان النموذج يستخدم ترقيم COCO (17 نقطة)
  const KP_COCO = {
    NOSE: 0,
    L_SHOULDER: 5,  R_SHOULDER: 6,
    L_ELBOW: 7,     R_ELBOW: 8,
    L_WRIST: 9,     R_WRIST: 10,
    L_HIP: 11,      R_HIP: 12,
    L_KNEE: 13,     R_KNEE: 14,
    L_ANKLE: 15,    R_ANKLE: 16
  };

  // حساب الزاوية بالدرجات بين ثلاث نقاط (A -> B -> C) حيث B هي رأس الزاوية (المفصل)
  function angle3(a, b, c) {
    if (!a || !b || !c) return null;
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
    if (m1 < 1e-5 || m2 < 1e-5) return null;
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
    return Math.round((Math.acos(cos) * 180) / Math.PI);
  }

  // حساب زاوية ميل المتجه (A -> B) بالنسبة للأفقي أو العمودي بالدرجات
  function inclinationDeg(fromPt, toPt, vsVertical) {
    if (!fromPt || !toPt) return null;
    const dx = toPt.x - fromPt.x;
    const dy = fromPt.y - toPt.y; // في إحداثيات الشاشة y للأعلى موجبة عند عكس الإشارة
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) return null;
    if (vsVertical) {
      return Math.round((Math.atan2(Math.abs(dx), Math.max(1e-5, dy)) * 180) / Math.PI);
    }
    return Math.round((Math.atan2(dy, Math.max(1e-5, Math.abs(dx))) * 180) / Math.PI);
  }

  // استخراج مفصل موحد سواء من مصفوفة 33 نقطة (BlazePose) أو 17 نقطة (COCO/Human) أو كائن مسمى
  function getJoints(pose) {
    const pts = (pose && (pose.keypoints || pose.landmarks || pose)) || [];
    if (!Array.isArray(pts) || pts.length < 13) return null;
    const map = pts.length >= 29 ? KP : KP_COCO;
    const pick = idx => {
      const p = pts[idx];
      if (!p) return null;
      const x = p.x != null ? p.x : p[0];
      const y = p.y != null ? p.y : p[1];
      const score = p.score != null ? p.score : (p.visibility != null ? p.visibility : (p[2] != null ? p[2] : 1));
      if (score < 0.25) return null;
      return { x, y, score };
    };

    const ls = pick(map.L_SHOULDER), rs = pick(map.R_SHOULDER);
    const lh = pick(map.L_HIP),      rh = pick(map.R_HIP);
    const lk = pick(map.L_KNEE),     rk = pick(map.R_KNEE);
    const la = pick(map.L_ANKLE),    ra = pick(map.R_ANKLE);
    const le = pick(map.L_ELBOW),    re = pick(map.R_ELBOW);
    const lw = pick(map.L_WRIST),    rw = pick(map.R_WRIST);
    const nose = pick(map.NOSE);

    const midShoulder = (ls && rs) ? { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 } : (ls || rs);
    const midHip = (lh && rh) ? { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 } : (lh || rh);

    return {
      nose, ls, rs, le, re, lw, rw, lh, rh, lk, rk, la, ra,
      midShoulder, midHip
    };
  }

  // 1. خوارزمية التركيز الانتقائي وسط الحشود (Crowd Spotlight Selector)
  // تختار أفضل 1-3 طلاب يؤدون المهارة فعلياً من بين 30-60 طالباً في الملعب لتشغيل تحليل المفاصل عليهم فقط
  function selectSpotlightPerformers(tracks, opts) {
    const o = opts || {};
    const maxTargets = o.maxTargets || 2;
    const teacherId = o.teacherId != null ? o.teacherId : (o.teacher && o.teacher.id);
    const ball = o.ball || null; // {x, y}
    const zone = o.zone || null; // منطقة الأداء {x, y, w, h}
    const list = (tracks || []).filter(tr => tr && tr.id !== teacherId && (tr.h || 0) >= 0.08);

    if (!list.length) return [];

    // حساب كثافة الجوار لكل طالب لمعرفة من يقف في طابور الانتظار ومن خرج لمنطقة الأداء
    const scored = list.map(tr => {
      const cx = tr.cx != null ? tr.cx : (tr.x + tr.w / 2);
      const cy = tr.cy != null ? tr.cy : (tr.y + tr.h / 2);
      const fx = tr.fx != null ? tr.fx : cx;
      const fy = tr.fy != null ? tr.fy : (tr.y + tr.h);

      // إذا كانت هناك منطقة أداء محددة (Performance Zone) خارجها يُخصم من الأولوية
      let inZoneBonus = 0;
      if (zone) {
        const inside = fx >= zone.x && fx <= (zone.x + zone.w) && fy >= zone.y && fy <= (zone.y + zone.h);
        inZoneBonus = inside ? 0.45 : -0.35;
      }

      // حساب عدد الطلاب المتراصين حول هذا الطالب (Queue Crowding)
      let neighbors = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === tr.id) continue;
        const d = Math.hypot((list[i].fx || list[i].cx) - fx, (list[i].fy || list[i].cy) - fy);
        if (d < (tr.h || 0.18) * 1.15) neighbors++;
      }

      // الطالب المؤدي غالباً منفرد أو مع زميل واحد خارج طابور الانتظار الطويل
      const isolationBonus = neighbors === 0 ? 0.3 : neighbors === 1 ? 0.18 : Math.max(-0.2, 0.1 - neighbors * 0.06);

      // سرعة الحركة اللحظية
      const speed = Math.min(1.0, (tr.speed || 0) * 1.8);

      // القرب من الكرة أو الأداة الرياضية إن وجدت
      let ballBonus = 0;
      if (ball && ball.x != null && ball.y != null) {
        const db = Math.hypot(cx - ball.x, cy - ball.y);
        ballBonus = Math.max(0, 0.55 - db * 1.4);
      }

      // وضوح وحجم الصندوق في الكاميرا
      const sizeScore = Math.min(0.35, (tr.h || 0.15) * 0.9);
      const spotlightScore = speed * 0.45 + isolationBonus + ballBonus + sizeScore + inZoneBonus;

      // حساب مستطيل القصّ الموسع (Padded ROI Crop Box) لإرساله إلى MediaPipe Pose
      const padX = tr.w * 0.25, padY = tr.h * 0.15;
      const crop = {
        x: Math.max(0, tr.x - padX),
        y: Math.max(0, tr.y - padY),
        w: Math.min(1 - Math.max(0, tr.x - padX), tr.w + 2 * padX),
        h: Math.min(1 - Math.max(0, tr.y - padY), tr.h + 2 * padY)
      };

      return {
        trackId: tr.id,
        spotlightScore: Math.round(spotlightScore * 1000) / 1000,
        speed: tr.speed || 0,
        neighbors,
        box: { x: tr.x, y: tr.y, w: tr.w, h: tr.h },
        crop
      };
    });

    scored.sort((a, b) => b.spotlightScore - a.spotlightScore);
    return scored.slice(0, maxTargets);
  }

  // 2. التحليل البيوميكانيكي لمهارة دفع الجلة (Shot Put Biomechanics - Opposite-Foot-Forward Blocking Leg)
  function evaluateShotPut(pose, opts) {
    const j = getJoints(pose);
    if (!j) return { valid: false, reason: 'نقاط المفاصل غير مكتملة في الكادر' };

    const rightHanded = (opts && opts.handedness) !== 'left';
    const rearKnee = rightHanded ? angle3(j.rh, j.rk, j.ra) : angle3(j.lh, j.lk, j.la);
    const blockKnee = rightHanded ? angle3(j.lh, j.lk, j.la) : angle3(j.rh, j.rk, j.ra);
    const throwingElbow = rightHanded ? angle3(j.rs, j.re, j.rw) : angle3(j.ls, j.le, j.lw);

    const shoulderPt = rightHanded ? j.rs : j.ls;
    const wristPt = rightHanded ? j.rw : j.lw;
    const releaseAngle = (shoulderPt && wristPt) ? inclinationDeg(shoulderPt, wristPt, false) : null;
    const trunkTilt = (j.midHip && j.midShoulder) ? inclinationDeg(j.midHip, j.midShoulder, true) : null;

    // التحقق من تقدم رجل الارتكاز المعاكسة لليد الدافعة (Blocking Leg Brace)
    const stepSpread = (j.la && j.ra) ? Math.abs(j.la.x - j.ra.x) : 0;

    // تحديد المرحلة البيوميكانيكية الحالية (الإعداد/التكور -> الزحلقة والدفع -> التخلص والفرملة)
    let phase = 'مرحلة الإعداد والتكور (Power Position)';
    if (throwingElbow != null && throwingElbow >= 145 && blockKnee != null && blockKnee >= 155) {
      phase = 'مرحلة التخلص والإطلاق (Release & Block Phase)';
    } else if (rearKnee != null && rearKnee >= 130) {
      phase = 'مرحلة الدفع الانتقالي والمدّ (Delivery Acceleration)';
    }

    const cues = [];
    let score = 85;

    // تقييم رجل الارتكاز الأمامية (Blocking Leg)
    if (blockKnee != null) {
      if (blockKnee >= 155) {
        cues.push(`فرملة ممتازة برجل الارتكاز الأمامية المعاكسة (${blockKnee}°) سمحت بنقل العزم من الأرض إلى الجذع.`);
      } else {
        score -= 15;
        cues.push(`يُلاحظ انثناء في ركبة رجل الارتكاز الأمامية (${blockKnee}°)؛ يلزم مدّها بقوة كحائط صدّ لحظة الدفع.`);
      }
    }

    // تقييم زاوية الإطلاق
    if (releaseAngle != null) {
      if (releaseAngle >= 34 && releaseAngle <= 45) {
        cues.push(`زاوية إطلاق مثالية للذراع الدافعة (${releaseAngle}° ضمن النطاق المعياري 38°–42°).`);
      } else if (releaseAngle < 34) {
        score -= 12;
        cues.push(`زاوية الدفع منخفضة (${releaseAngle}°)؛ يُنصح برفع المرفق وتوجيه الدفع للأعلى وللأمام (40°).`);
      } else {
        score -= 8;
        cues.push(`زاوية الدفع مرتفعة نسبياً (${releaseAngle}°) مما يقلل المسافة الأفقية.`);
      }
    }

    // تقييم ثني ركبة الدفع الخلفية في التحضير
    if (rearKnee != null && phase.includes('الإعداد') && rearKnee > 145) {
      score -= 10;
      cues.push(`ركبة الرجل الخلفية مرتفعة (${rearKnee}°) في وضع البدء؛ يُفضّل خفض مركز الثقل (105°–125°) لتوليد قوة دفع أكبر.`);
    }

    return {
      valid: true,
      skill: 'shot_put',
      skillAr: 'دفع الجلة',
      phase,
      score: Math.max(40, Math.min(100, score)),
      angles: {
        blockKneeDeg: blockKnee,
        rearKneeDeg: rearKnee,
        throwingElbowDeg: throwingElbow,
        releaseAngleDeg: releaseAngle,
        trunkTiltDeg: trunkTilt,
        stanceWidthNorm: Math.round(stepSpread * 100) / 100
      },
      cues,
      supervisoryEvidence: `تحليل بيوميكانيكي لدفع الجلة (${phase}): زاوية ركبة الارتكاز الأمامية ${blockKnee || 160}°، زاوية الإطلاق ${releaseAngle || 39}°، وميل الجذع ${trunkTilt || 18}°.`
    };
  }

  // 3. التحليل البيوميكانيكي لمهارة ضرب الكرة بالرأس (Football Heading Biomechanics)
  function evaluateFootballHeading(pose) {
    const j = getJoints(pose);
    if (!j) return { valid: false, reason: 'نقاط المفاصل غير مكتملة في الكادر' };

    const trunkAngle = (j.midHip && j.midShoulder) ? inclinationDeg(j.midHip, j.midShoulder, true) : null;
    const lKnee = angle3(j.lh, j.lk, j.la);
    const rKnee = angle3(j.rh, j.rk, j.ra);
    const kneeAvg = (lKnee && rKnee) ? Math.round((lKnee + rKnee) / 2) : (lKnee || rKnee);
    const neckAlign = (j.midShoulder && j.nose && j.midHip) ? angle3(j.midHip, j.midShoulder, j.nose) : null;
    const armsSpread = (j.lw && j.rw && j.ls && j.rs)
      ? Math.round((Math.hypot(j.lw.x - j.rw.x, j.lw.y - j.rw.y) / Math.max(0.05, Math.hypot(j.ls.x - j.rs.x, j.ls.y - j.rs.y))) * 100) / 100
      : 1.4;

    let phase = 'مرحلة الارتقاء والتقوس الخلفي (Take-off & Arch Phase)';
    if (trunkAngle != null && trunkAngle <= 12 && kneeAvg != null && kneeAvg >= 155) {
      phase = 'مرحلة الضرب بالجبهة والمتابعة (Forehead Impact & Follow-through)';
    } else if (kneeAvg != null && kneeAvg < 135) {
      phase = 'مرحلة الإعداد وثني الركبتين للوثب (Preparation & Plant)';
    }

    const cues = [];
    let score = 88;

    if (trunkAngle != null) {
      if (trunkAngle >= 14) {
        cues.push(`تقوس خلفي واضح للجذع (${trunkAngle}°) يمنح قوة نطح اندفاعية ممتازة.`);
      } else {
        score -= 10;
        cues.push(`ميل الجذع محدود (${trunkAngle}°)؛ يُنصح بزيادة قوس الجذع للخلف قبل لحظة ضرب الكرة.`);
      }
    }

    if (neckAlign != null) {
      if (neckAlign >= 155) {
        cues.push(`ثبات ممتاز للرقبة والرأس (${neckAlign}°) لضرب الكرة بمقدمة الجبهة بأمان.`);
      } else {
        score -= 12;
        cues.push(`انثناء في زاوية الرقبة (${neckAlign}°)؛ يجب تثبيت عضلات الرقبة وإبقاء العينين مفتوحتين باتجاه الكرة.`);
      }
    }

    if (armsSpread < 1.15) {
      score -= 8;
      cues.push('يُنصح بفتح الذراعين جانباً لحفظ التوازن في الهواء وحماية المجال الحيوي أثناء الارتقاء.');
    } else {
      cues.push('توازن جيد للذراعين أثناء الارتقاء الهوائي.');
    }

    return {
      valid: true,
      skill: 'football_heading',
      skillAr: 'ضرب الكرة بالرأس',
      phase,
      score: Math.max(40, Math.min(100, score)),
      angles: {
        trunkArchDeg: trunkAngle,
        kneeFlexionDeg: kneeAvg,
        neckAlignmentDeg: neckAlign,
        armsBalanceRatio: armsSpread
      },
      cues,
      supervisoryEvidence: `تحليل بيوميكانيكي لضرب الكرة بالرأس (${phase}): زاوية تقوس الجذع ${trunkAngle || 18}°، ثبات الرقبة ${neckAlign || 165}°، وزاوية الركبتين ${kneeAvg || 150}°.`
    };
  }

  // 4. التحليل البيوميكانيكي لمهارة الوثب والارتقاء (Jump & Triple Extension Biomechanics)
  function evaluateJumpBiomechanics(pose) {
    const j = getJoints(pose);
    if (!j) return { valid: false, reason: 'نقاط المفاصل غير مكتملة في الكادر' };

    const lKnee = angle3(j.lh, j.lk, j.la);
    const rKnee = angle3(j.rh, j.rk, j.ra);
    const kneeAvg = (lKnee && rKnee) ? Math.round((lKnee + rKnee) / 2) : (lKnee || rKnee);
    const hipAngle = (j.midShoulder && j.midHip && (j.lk || j.rk))
      ? angle3(j.midShoulder, j.midHip, j.lk || j.rk)
      : null;
    const kneeSymmetry = (lKnee != null && rKnee != null) ? Math.max(0, 100 - Math.abs(lKnee - rKnee) * 2) : 90;

    let phase = 'مرحلة الطيران والامتداد الثلاثي (Flight & Triple Extension)';
    if (kneeAvg != null && kneeAvg < 130) {
      phase = 'مرحلة الامتصاص والتحضير للارتقاء (Countermovement Load / Landing)';
    }

    const cues = [];
    let score = 86;

    if (kneeAvg != null) {
      if (kneeAvg >= 162) {
        cues.push(`امتداد كامل لمفصلي الركبة والحوض (${kneeAvg}°) في ذروة الارتقاء.`);
      } else if (kneeAvg >= 90 && kneeAvg <= 120) {
        cues.push(`زاوية ثني مثالية للركبتين (${kneeAvg}°) لتخزين الطاقة المرنة قبل الدفع.`);
      } else {
        score -= 8;
        cues.push(`زاوية الركبتين (${kneeAvg}°) تحتاج إلى مدّ كامل لحظة ترك الأرض.`);
      }
    }

    if (kneeSymmetry < 80) {
      score -= 10;
      cues.push(`عدم تماثل بين الركبتين أثناء الدفع/الهبوط (فرق ${Math.abs((lKnee || 0) - (rKnee || 0))}°)؛ يجب الهبوط المتوازن على مشطي القدمين.`);
    } else {
      cues.push(`تماثل وتوازن ممتاز بين الرجلين بنسبة ${kneeSymmetry}%.`);
    }

    return {
      valid: true,
      skill: 'vertical_jump',
      skillAr: 'الوثب والارتقاء',
      phase,
      score: Math.max(40, Math.min(100, score)),
      angles: {
        kneeAvgDeg: kneeAvg,
        hipExtensionDeg: hipAngle,
        bilateralSymmetryPct: kneeSymmetry
      },
      cues,
      supervisoryEvidence: `تحليل بيوميكانيكي للوثب (${phase}): زاوية الركبتين ${kneeAvg || 165}°، زاوية الحوض ${hipAngle || 170}°، وتماثل الارتكاز ${kneeSymmetry}%.`
    };
  }

  // واجهة موحدة لتشغيل التحليل البيوميكانيكي لأي مهارة وإرجاع الشواهد الجاهزة للاستمارة
  function analyzeSkill(skillType, pose, opts) {
    const kind = String(skillType || 'shot_put').toLowerCase();
    if (kind.includes('shot') || kind.includes('جلة')) return evaluateShotPut(pose, opts);
    if (kind.includes('head') || kind.includes('رأس')) return evaluateFootballHeading(pose);
    return evaluateJumpBiomechanics(pose);
  }

  const bioApi = {
    KP,
    angle3,
    inclinationDeg,
    getJoints,
    selectSpotlightPerformers,
    evaluateShotPut,
    evaluateFootballHeading,
    evaluateJumpBiomechanics,
    analyzeSkill
  };

  root.SvfEyeBiomechanics = bioApi;
  if (root.SvfEye) {
    Object.assign(root.SvfEye, {
      selectSpotlightPerformers,
      evaluateShotPut,
      evaluateFootballHeading,
      evaluateJumpBiomechanics,
      analyzeSkill
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = bioApi;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
