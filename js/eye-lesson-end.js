(() => {
    'use strict';
    const LIMIT = 40 * 60;
    const FROM = LIMIT - 180, TO = LIMIT + 180;
    function bellFrame(db, hz, t, state, whistle) {
        if (t < FROM || t > TO || !Number.isFinite(hz) || hz <= 0 || whistle) {
            state.start = null;
            return null;
        }
        const lo = Math.ceil(400 / hz), hi = Math.min(db.length - 1, Math.floor(1900 / hz));
        let peak = -Infinity, bin = lo;
        for (let i = lo; i <= hi; i++) if (db[i] > peak) { peak = db[i]; bin = i; }
        if (peak < -52) { state.start = null; return null; }
        const range = Math.max(3, Math.round(150 / hz));
        let side = -Infinity, overtone = -Infinity;
        for (let d = range; d <= range + 3; d++) side = Math.max(side, db[bin - d] ?? -Infinity, db[bin + d] ?? -Infinity);
        for (let d = -2; d <= 2; d++) overtone = Math.max(overtone, db[bin * 2 + d] ?? -Infinity, db[bin * 3 + d] ?? -Infinity);
        if (peak - side < 14 || overtone < peak - 25) { state.start = null; return null; }
        if (state.start == null || Math.abs(bin - state.bin) > 2 || t - state.last > 0.35) {
            state.start = t; state.bin = bin; state.reported = false;
        }
        state.last = t;
        if (state.reported || t - state.start < 1.15) return null;
        state.reported = true;
        return Math.round(state.start);
    }
    function spokenEnd(data, normalize) {
        if (typeof normalize !== 'function') return null;
        const end = (data.sp?.seg || []).find(([t, text]) => t >= LIMIT - 300 &&
            !/[؟?]/.test(text) && /^(?:وبكذا |وبهذا |خلاص )?(?:انتهت الحصه|انتهت حصتنا|انتهينا من الحصه|انتهينا من درس اليوم|نختم الحصه هنا)(?: |$)/.test(normalize(text)) &&
            !/(?:بعد شوي|اذا|عندما|لازم|سوف)(?: |$)/.test(normalize(text)));
        return end || null;
    }
    function phaseAt(rows, deadline) {
        return (rows || []).filter(r => r[0] <= deadline).at(-1)?.[1] || null;
    }
    function motionAfter(states, deadline) {
        if (typeof states !== 'string') return null;
        const part = states.slice(deadline, deadline + 20);
        const seen = (part.match(/[ai]/g) || []).length;
        return seen >= 6 ? { seen, active: (part.match(/a/g) || []).length } : null;
    }
    function time(value) {
        const raw = String(value ?? '').trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
        if (/^\d{1,4}$/.test(raw)) return Number(raw);
        if (!/^\d{1,3}:[0-5]\d$/.test(raw)) return null;
        const [minutes, seconds] = raw.split(':').map(Number);
        return minutes * 60 + seconds;
    }
    const api = { LIMIT, bellFrame, spokenEnd, phaseAt, motionAfter, time };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else window.SvfEyeLessonEnd = api;
})();
