/* استخراج المفاصل محلياً من قصاصة المؤدي. يُحمّل النموذج عند طلب التحليل الحركي. */
(function (root) {
    'use strict';

    const ASSET = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
    const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
    const LIMIT = 320;
    const CONFIDENCE = 0.55;
    const TORSO = [11, 12, 23, 24];
    const ANGLES = {
        shot_put: { blockKneeDeg: 'ركبة الارتكاز', rearKneeDeg: 'الركبة الخلفية', throwingElbowDeg: 'المرفق', releaseAngleDeg: 'ميل خط الكتف والرسغ', trunkTiltDeg: 'ميل الجذع' },
        football_heading: { trunkArchDeg: 'ميل الجذع', kneeFlexionDeg: 'الركبتان', neckAlignmentDeg: 'محاذاة الرأس والجذع' },
        vertical_jump: { kneeAvgDeg: 'الركبتان', hipExtensionDeg: 'الحوض' }
    };
    const LINKS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

    function pickAt(people, x, y) {
        const hits = people.filter(p => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
        return hits.length === 1 ? hits[0] : null;
    }

    function overlaps(a, b) {
        const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        return w > 0 && h > 0 && w * h >= Math.min(a.w * a.h, b.w * b.h) * 0.22;
    }

    function resolveFocus(lock, people, now, similarity) {
        const target = people.find(p => p.id === lock.person.id);
        const prior = lock.person;
        const gap = now - lock.seen;
        const match = p => !!(prior.sig && p.sig && similarity) && similarity(prior.sig, p.sig) >= 0.72;
        const close = p => Math.hypot(p.fx - prior.fx, p.fy - prior.fy) <= Math.max(prior.h, p.h) * 1.15;
        if (target && gap >= 0 && gap <= 3 && close(target) &&
            (!prior.sig || !target.sig || !similarity || match(target))) {
            const others = people.filter(p => p !== target);
            if (!others.some(p => overlaps(target, p)) &&
                (!lock.blocked || (match(target) && !others.some(p => close(p) && match(p))))) {
                lock.person = target.sig ? target : { ...target, sig: prior.sig };
                lock.seen = now;
                lock.blocked = false;
                return target;
            }
        }
        lock.blocked = true;
        return null;
    }

    async function load() {
        const { FilesetResolver, PoseLandmarker } = await import(ASSET + '/vision_bundle.mjs');
        const vision = await FilesetResolver.forVisionTasks(ASSET + '/wasm');
        return PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
            runningMode: 'IMAGE',
            numPoses: 2,
            minPoseDetectionConfidence: CONFIDENCE,
            minPosePresenceConfidence: CONFIDENCE
        });
    }

    function cropFrame(canvas, source, area, crop) {
        const sx = (crop.x - area.x) * source.width / area.w;
        const sy = (crop.y - area.y) * source.height / area.h;
        const width = crop.w * source.width / area.w;
        const height = crop.h * source.height / area.h;
        if (Math.min(width, height) < 24) return false;
        const scale = Math.min(1, LIMIT / Math.max(width, height));
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext('2d').drawImage(source, sx, sy, width, height, 0, 0, canvas.width, canvas.height);
        return true;
    }

    function analyze(points, target, pixels, skill, handedness, biomech) {
        const labels = ANGLES[skill];
        if (!labels || !Array.isArray(points) || points.length !== 33) return null;
        const { crop, box } = target;
        const local = points.map(p => {
            const score = Math.min(p?.visibility ?? 1, p?.presence ?? 1);
            if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || !Number.isFinite(score) || score < CONFIDENCE ||
                p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null;
            return { x: p.x, y: p.y, score };
        });
        const torso = TORSO.map(i => local[i]).filter(Boolean);
        if (torso.length < 3) return null;
        const x = crop.x + crop.w * torso.reduce((sum, p) => sum + p.x, 0) / torso.length;
        const y = crop.y + crop.h * torso.reduce((sum, p) => sum + p.y, 0) / torso.length;
        if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return null;

        const maxDim = Math.max(pixels.width, pixels.height);
        const isotropic = local.map(p => p && { x: p.x * pixels.width / maxDim, y: p.y * pixels.height / maxDim, score: p.score });
        const result = biomech.analyzeSkill(skill, isotropic, { handedness });
        const angles = Object.entries(labels)
            .filter(([key]) => Number.isFinite(result.angles?.[key]))
            .map(([key, label]) => ({ label, value: result.angles[key] }));
        if (!result.valid || !angles.length) return null;
        return { skill, skillAr: result.skillAr, angles, points: local.map(p => p && ({ x: crop.x + p.x * crop.w, y: crop.y + p.y * crop.h })) };
    }

    function draw(ctx, frame, target, points = []) {
        const x = p => frame.ox + frame.rw * p.x;
        const y = p => frame.oy + frame.rh * p.y;
        const box = target.box;
        ctx.save();
        ctx.strokeStyle = '#55e2ea';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x(box), y(box), box.w * frame.rw, box.h * frame.rh);
        ctx.setLineDash([]);
        ctx.beginPath();
        LINKS.forEach(([a, b]) => {
            if (!points[a] || !points[b]) return;
            ctx.moveTo(x(points[a]), y(points[a]));
            ctx.lineTo(x(points[b]), y(points[b]));
        });
        ctx.stroke();
        ctx.restore();
    }

    const api = { load, cropFrame, analyze, draw, pickAt, resolveFocus };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SvfEyePose = api;
})(typeof window !== 'undefined' ? window : globalThis);
