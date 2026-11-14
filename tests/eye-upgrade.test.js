// مجموعة الاختبارات الآلية الشاملة لترقية محرك "عين المشرف" (tests/eye-upgrade.test.js)
// تتحقق من سلامة جميع الوحدات:
// eye-yolox, eye-reid, eye-formations, eye-sofit, eye-grow-bridge, eye-fusion, eye-biomechanics, eye-homography, eye-hud

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// تحميل مرن للوحدات ليعمل داخل مجلد tests/ في المستودع (../js/) أو مباشرةً في مجلد المخرجات
function loadMod(name) {
  const candidates = [
    path.join(__dirname, '..', 'js', name),
    path.join(__dirname, name)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error('تعذر العثور على الوحدة: ' + name);
}

const yolox = loadMod('eye-yolox.js');
const reid = loadMod('eye-reid.js');
const formations = loadMod('eye-formations.js');
const sofit = loadMod('eye-sofit.js');
const bridge = loadMod('eye-grow-bridge.js');
global.SvfEyeGrowBridge = bridge;
const fusion = loadMod('eye-fusion.js');
const bio = loadMod('eye-biomechanics.js');
const poseInput = loadMod('eye-pose.js');
const homo = loadMod('eye-homography.js');
const hud = loadMod('eye-hud.js');

let passed = 0;
function test(title, fn) {
  fn();
  passed++;
  console.log('  ✔', title);
}

console.log('=== تشغيل اختبارات ترقية "عين المشرف" ===');

// 1. اختبارات YOLOX والبصمة اللونية
test('eye-yolox: توليد Tensor واستخراج البصمة اللونية 16-bin HSV', () => {
  const w = 64, h = 64;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(210);
  const t = yolox.tensor(rgba, w, h, 416, true);
  assert.strictEqual(t.data.length, 3 * 416 * 416);

  const sigA = yolox.colorSig(rgba, w, h, { x: 0.1, y: 0.1, w: 0.3, h: 0.6 });
  assert.strictEqual(sigA.length, 16);
  assert.ok(yolox.colorSim(sigA, sigA) >= 0.99);
});

// 2. اختبارات تثبيت هوية المعلم (Teacher Re-ID)
test('eye-reid: تتبع الأشخاص وقفل هوية المعلم يدوياً واستعادتها', () => {
  const T = { tracks: [] };
  const sigTeacher = [0, 0.9, 0.1, 0, 0, 0, 0, 0, 0, 0.9, 0.1, 0, 0, 0, 0, 0];
  const sigStudent = [0, 0, 0, 0.9, 0.1, 0, 0, 0, 0, 0, 0, 0.9, 0.1, 0, 0, 0];

  reid.trackStepReID(T, [
    { x: 0.2, y: 0.2, w: 0.08, h: 0.28, score: 0.92, label: 'person', sig: sigTeacher },
    { x: 0.6, y: 0.5, w: 0.06, h: 0.19, score: 0.88, label: 'person', sig: sigStudent }
  ], 1.0, 1.77, 2.5);

  let tch = reid.lockTeacherAt(T, null, 0.24, 0.34, 1.0);
  assert.strictEqual(tch.locked, true);
  assert.strictEqual(tch.id, 1);

  // محاكاة عودة المعلم بعد اختفاء مؤقت مع استعادته عبر البصمة اللونية
  reid.trackStepReID(T, [
    { x: 0.22, y: 0.21, w: 0.08, h: 0.28, score: 0.91, label: 'person', sig: sigTeacher },
    { x: 0.61, y: 0.50, w: 0.06, h: 0.19, score: 0.87, label: 'person', sig: sigStudent }
  ], 5.0, 1.77, 10);
  tch = reid.teacherStepReID(T, tch, 5.0);
  assert.ok(tch.fx >= 0.2 && tch.fx <= 0.35);
});

// 3. اختبارات التشكيلات والخريطة الحرارية
test('eye-formations: كشف تشكيل الصفوف المستقيمة والخريطة الحرارية للملعب', () => {
  const linePts = [
    { fx: 0.1, fy: 0.5, h: 0.2 },
    { fx: 0.2, fy: 0.5, h: 0.2 },
    { fx: 0.3, fy: 0.5, h: 0.2 },
    { fx: 0.4, fy: 0.5, h: 0.2 }
  ];
  const res = formations.formations(linePts);
  assert.strictEqual(res.dom, 'L');
  assert.strictEqual(res.longestLine, 4);

  const heat = formations.teacherCoverageHeatmap([{ fx: 0.1, fy: 0.1 }, { fx: 0.2, fy: 0.2 }]);
  assert.ok(heat.coveragePct > 0);
  assert.ok(heat.deadZones.length >= 2);
});

// 4. اختبارات SOFIT واستجابة الصافرة
test('eye-sofit: حساب MVPA وسرعة استجابة الطلبة للصافرة', () => {
  const s = sofit.sofit({
    samples: [
      { movingRatio: 0.65, ctx: 'S', tchRole: 'teach' },
      { movingRatio: 0.72, ctx: 'G', tchRole: 'observe' }
    ]
  });
  assert.strictEqual(s.mvpaPct, 100);
  assert.strictEqual(s.goalMet, true);

  const wr = sofit.whistleResponses([10.0], [
    { t: 8.5, movingRatio: 0.1, structuredRatio: 0.3 },
    { t: 12.2, movingRatio: 0.5, structuredRatio: 0.8 },
    { t: 13.2, movingRatio: 0.6, structuredRatio: 0.8 }
  ]);
  assert.strictEqual(wr.count, 1);
  assert.strictEqual(wr.avgLatencySec, 2.2);
  assert.strictEqual(sofit.whistleResponses([10], [{ t: 9, movingRatio: 0.1 }, { t: 12, movingRatio: 0.5 }]).avgLatencySec, null);

  const secs = Array.from({ length: 63 }, () => ({ p: { n: 10, mv: 7 } }));
  for (let t = 45; t < 51; t++) secs[t].p.mv = 1;
  const context = secs.map(() => 'apply');
  const states = secs.map((_, t) => t < 20 ? 'r' : 'a');
  const seen = sofit.visitSummary(secs, context, states, [10, 50]);
  assert.strictEqual(seen.samples, 3);
  assert.strictEqual(seen.activity.ctxPct.G, 100);
  assert.strictEqual(seen.response.events.length, 1);
  assert.strictEqual(seen.response.avgLatencySec, 1);
});

// 5. اختبارات جسر الربط بالبنود الـ 13 ونموذج GROW
test('eye-grow-bridge & eye-fusion: توليد تقييم 13 بنداً وخطة GROW/W-plan', () => {
  const rev = fusion.sessionReview({
    mvpaPct: 60,
    waitingPct: 15,
    coveragePct: 76,
    deadZones: ['الجهة الخلفية اليمنى'],
    whistleLatency: 3.4,
    whistleCount: 4,
    ballRatio: 0.7,
    uniformPct: 90,
    durationMs: 1800000
  });
  assert.strictEqual(rev.indicators13.length, 13);
  assert.ok(rev.grow && rev.grow.goal.includes('60%'));
  assert.strictEqual(rev.grow.willTable.length, 3);
  assert.ok(rev.sixHats && rev.sixHats.white.length > 10);
});

// 6. اختبارات المختبر البيوميكانيكي والتركيز الانتقائي وسط الحشود
test('eye-biomechanics: فرز 35 طالباً واختيار المؤدي وتحليل دفع الجلة', () => {
  const tracks = [{ id: 1, x: 0.1, y: 0.2, w: 0.08, h: 0.28, speed: 0.05 }];
  for (let i = 2; i <= 34; i++) {
    tracks.push({ id: i, x: 0.2 + (i % 8) * 0.03, y: 0.6 + Math.floor(i / 8) * 0.04, w: 0.05, h: 0.18, speed: 0.02 });
  }
  tracks.push({ id: 99, x: 0.55, y: 0.45, w: 0.08, h: 0.24, speed: 0.45 });

  const top = bio.selectSpotlightPerformers(tracks, { teacherId: 1, maxTargets: 2 });
  assert.strictEqual(top[0].trackId, 99);

  const pose = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, score: 0.9 }));
  pose[12] = { x: 0.55, y: 0.34, score: 0.95 };
  pose[14] = { x: 0.62, y: 0.29, score: 0.95 };
  pose[16] = { x: 0.70, y: 0.22, score: 0.95 };
  pose[23] = { x: 0.49, y: 0.55, score: 0.95 };
  pose[25] = { x: 0.46, y: 0.72, score: 0.95 };
  pose[27] = { x: 0.44, y: 0.89, score: 0.95 };

  const shot = bio.evaluateShotPut(pose);
  assert.strictEqual(shot.valid, true);
  assert.ok(shot.angles.blockKneeDeg >= 170);
  assert.ok(shot.angles.releaseAngleDeg >= 34 && shot.angles.releaseAngleDeg <= 45);

  const target = top[0];
  const source = { width: 640, height: 360 };
  let draw;
  const canvas = { getContext: () => ({ drawImage: (...args) => { draw = args; } }) };
  assert.ok(poseInput.cropFrame(canvas, source, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, target.crop));
  assert.strictEqual(draw[0], source);
  assert.ok(Math.abs(draw[1] - (target.crop.x - 0.25) * 1280) < 0.001);
  const frame = poseInput.analyze(pose, target, canvas, 'shot_put', 'right', bio);
  assert.ok(frame?.angles.some(a => a.label === 'ميل خط الكتف والرسغ'));
  const occluded = pose.map((p, i) => i === 16 ? { ...p, visibility: 0.1 } : p);
  assert.ok(!poseInput.analyze(occluded, target, canvas, 'shot_put', 'right', bio)?.angles.some(a => a.label === 'ميل خط الكتف والرسغ'));
});

// 7. اختبارات معايرة الملعب والمحطات الأربع
test('eye-homography: التحويل الهندسي بالأمتار وتحليل المحطات الأربع وجدول التناوب', () => {
  const cal = homo.createCourtCalibration(null, 'handball');
  const d = cal.distanceMeters({ x: 0.15, y: 0.22 }, { x: 0.85, y: 0.22 });
  assert.strictEqual(d, 32);

  const st = homo.analyzeStations([
    { id: 2, fx: 0.3, fy: 0.35, speed: 0.25 },
    { id: 3, fx: 0.72, fy: 0.35, speed: 0.01 }
  ], { id: 1, fx: 0.3, fy: 0.35 }, cal);
  assert.strictEqual(st.stations.length, 4);
  assert.strictEqual(st.alerts.length, 1);

  const rot = homo.generateStationRotationSchedule(['الأمل', 'التعاون', 'القوة', 'الشجاعة'], 5);
  assert.strictEqual(rot.rounds.length, 4);
});

// 8. اختبارات طبقة العرض البصري التفاعلي (HUD)
test('eye-hud: رسم طبقات المحطات والمعلم والمؤدي فوق Canvas', () => {
  const drawn = [];
  const ctx = {
    canvas: { width: 1280, height: 720 },
    save: () => {}, restore: () => {}, clearRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, arcTo: () => {},
    fill: () => {}, stroke: () => {}, setLineDash: () => {},
    measureText: s => ({ width: String(s).length * 7 }),
    fillText: s => drawn.push(s)
  };
  const ok = hud.renderHUD({ width: 1280, height: 720, getContext: () => ctx }, {
    teacher: { id: 1, x: 0.2, y: 0.2, w: 0.06, h: 0.2, locked: true, lockScore: 0.95 },
    topStats: { ep: 'webgpu', ms: 8, pupilsCount: 30, mvpaPct: 65 }
  });
  assert.strictEqual(ok, true);
  assert.ok(drawn.some(t => t.includes('المعلم')));
  assert.ok(drawn.some(t => t.includes('WEBGPU')));
});

console.log(`=== اجتازت جميع الاختبارات بنجاح (${passed}/8) ===`);
