(() => {
    'use strict';

    const ITEMS = {
        1: 'تحصيل الطلبة', 2: 'تقدم الطلبة', 3: 'مهارات التعلم', 4: 'القيم والسلوك',
        5: 'الأمن والسلامة', 6: 'التخطيط', 7: 'الإدارة الصفية', 8: 'استراتيجيات التدريس',
        9: 'المصادر والموارد', 10: 'التقويم'
    };

    function itemCues(s, strategies, specificCorrection) {
        const items = [];
        if (/طبق|ادوا|نفذ|ارني|ورني/.test(s) && /مهار|تمرين|حرك|اداء|محاول/.test(s)) items.push(1);
        if (specificCorrection || /اعد المحاوله|حاول مره|قار[نوا]+.*المحاول|جرب مره ثانيه/.test(s)) items.push(2);
        const digital = /(?:^| )(?:الشاشه|الفيديو|المقطع|مقطع فيديو|الصوره|الصور|التطبيق الرقمي|التسجيل|الجهاز اللوحي|الايباد|التابلت)(?: |$)/.test(s);
        const digitalTask = /قارن|حلل|حدد الخطا|استخرج|فسر|قيم الاداء|صحح.*اداء/.test(s);
        if ((/فسر|برر|استنتج|قارن|ناقش/.test(s) && /سبب|زميل|مجموع|اختيار|محاول|نتيج/.test(s)) || (digital && digitalTask)) items.push(3);
        if (/احترم|انصاف|الروح الرياضيه|تقبل النتيجه|احترام المنافس|ساعد زميلك/.test(s)) items.push(4);
        if (/سلامه|مسافه امنه|ابتعد|لا تتزاحم|لا تدفع|اترك مسافه|انتبه للمسافه/.test(s)) items.push(5);
        if (/هدفنا|نتعلم اليوم|هدف الحصه|نواتج التعلم/.test(s)) items.push(6);
        if (/انتقل|تنتقل|قفوا|ابد[اوا]+|عند الاشاره|انتظروا الدور|صفوا/.test(s)) items.push(7);
        if (strategies.length || /شاهدوا النموذج|لاحظوا النموذج|لعبه مصغره/.test(s)) items.push(8);
        if ((/استخدم|استعمل|خذوا|وزعوا/.test(s) && /الكر|الاقماع|الحبل|الشبكه|البطاق|الادوات|المساحه/.test(s)) ||
            (digital && /اعرض|ساعرض|نستعرض|شاهد|انظر|استخدم|لاحظوا/.test(s))) items.push(9);
        if (specificCorrection || /صحح|برر|بطاقه ملاحظ|قيم اداء|تحقق من/.test(s)) items.push(10);
        return items;
    }

    function windowStats(states, from, to) {
        if (typeof states !== 'string' || from < 0 || to > states.length || to <= from) return null;
        const window = states.slice(from, to);
        const observed = (window.match(/[ai]/g) || []).length;
        return observed >= Math.max(4, Math.ceil(window.length * 0.6)) ?
            { active: (window.match(/a/g) || []).length, observed } : null;
    }

    function review(data, speech, log) {
        if (!speech || !data?.sp?.seg?.length) return {};
        const spans = data.M?.admin?.spans || [];
        const offset = Number(data.fusionOffset) || 0;
        const states = data.fusionStates || '';
        const noCamera = ['none', 'taps'].includes(data.src);
        const rows = speech.lessonSegs(data.sp.seg.map(([t, x]) => ({t, x})), spans);
        const correctionTimes = new Set((data.M?.speech?.corr?.specEx || []).map(([t]) => Math.round(t)));
        const out = {};
        rows.forEach(({t, x}) => {
            if (typeof x !== 'string' || !x.trim() || !Number.isFinite(t)) return;
            const cue = speech.norm(x);
            const raw = x.trim();
            const soundTime = Math.max(0, Math.round(t));
            const imageTime = soundTime + offset;
            if (imageTime < 0) return;
            const ids = itemCues(cue, speech.strategyCues?.(x) || [], correctionTimes.has(soundTime));
            if (/[؟?]/.test(raw) && !ids.includes(10)) ids.push(10);
            ids.forEach(id => {
                const previous = out[id] || (out[id] = []);
                if (previous.some(p => p.cue === cue && Math.abs(p.soundTime - soundTime) <= 15)) return;
                const near = (log[id] || []).filter(e => Number.isFinite(e.t) && e.t >= imageTime - 5 && e.t <= imageTime + 20);
                const before = noCamera ? null : windowStats(states, imageTime - 8, imageTime);
                const after = noCamera ? null : windowStats(states, imageTime, imageTime + 12);
                previous.push({ id, cue, text: raw.slice(0, 260), soundTime, imageTime, before, after,
                    camera: noCamera ? [] : near.filter(e => ['cam','ai'].includes(e.src)).slice(0, 2),
                    marks: near.filter(e => ['tap','mark'].includes(e.src)).slice(0, 2) });
            });
        });
        Object.values(out).forEach(list => list.sort((a,b) =>
            (Number(!!b.after) + b.camera.length * 2 + b.marks.length * 2) -
            (Number(!!a.after) + a.camera.length * 2 + a.marks.length * 2) || a.soundTime - b.soundTime));
        return out;
    }

    function time(value) {
        const raw = String(value ?? '').trim();
        if (/^\d+$/.test(raw)) return Number(raw);
        if (!/^\d+:[0-5]\d$/.test(raw)) return null;
        const [minutes, seconds] = raw.split(':').map(Number);
        return minutes * 60 + seconds;
    }

    const bridge = () => (typeof window !== 'undefined' ? window : globalThis).SvfEyeGrowBridge;
    function sessionReview(data, opts) { return bridge()?.generateGrowDeliberation(data, opts) || null; }
    function draftForVisit(data, opts) { return bridge()?.sessionDraft(data, opts) || null; }
    const api = { ITEMS, review, time, windowStats, sessionReview, draftForVisit };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else window.SvfEyeFusion = api;
})();
