/* وحدة معايير SOFIT و SOFIT+ ومؤشرات استجابة الصافرة – (js/eye-sofit.js)
 * جزء من تفكيك وترقية محرك "عين المشرف" (Supervisor Eye Modular Architecture)
 *
 * تفصل هذه الوحدة حسابات النشاط البدني المعتدل إلى الشديد (MVPA)،
 * تقسيم فترات الدرس، وحساب سرعة استجابة الطلاب للصافرة عن ملف `eye-core.js`.
 */
(function (root) {
  'use strict';

  const SOFIT_STEP = 20;
  const MVPA_GOAL = 50; // الهدف المعياري العالمي: 50% على الأقل من زمن الحصة في نشاط حركي معتدل إلى شديد

  const SOFIT_CTX = {
    M: 'إدارة وتنظيم',
    K: 'شرح ومعرفة نظرية',
    F: 'لياقة وإحماء بدني',
    S: 'تدريب مهاري',
    G: 'تطبيق وألعاب تنافسية'
  };

  const SOFIT_TCH = {
    teach: 'تدريس وتغذية راجعة نشطة',
    manage: 'إدارة وتوجيه تنظيمي',
    observe: 'ملاحظة وإشراف صامت'
  };

  // حساب مؤشرات SOFIT القياسية من السلسلة الزمنية للحصة
  function sofit(d) {
    const samples = (d && d.samples) || [];
    if (!samples.length) {
      return {
        mvpaPct: 0,
        vigorousPct: 0,
        waitingPct: 0,
        ctxPct: { M: 0, K: 0, F: 0, S: 0, G: 0 },
        tchPct: { teach: 0, manage: 0, observe: 0 },
        goalMet: false
      };
    }

    let mvpaCount = 0, vigCount = 0, waitCount = 0;
    const ctxCounts = { M: 0, K: 0, F: 0, S: 0, G: 0 };
    const tchCounts = { teach: 0, manage: 0, observe: 0 };

    samples.forEach(s => {
      const activeRatio = s.movingRatio != null ? s.movingRatio : (s.mvpa || 0);
      if (activeRatio >= 0.45) mvpaCount++;
      if (activeRatio >= 0.7) vigCount++;
      if (activeRatio < 0.2) waitCount++;

      const c = (s.ctx && ctxCounts[s.ctx] != null) ? s.ctx : (activeRatio >= 0.5 ? 'S' : 'M');
      ctxCounts[c]++;

      const tRole = (s.tchRole && tchCounts[s.tchRole] != null) ? s.tchRole : 'observe';
      tchCounts[tRole]++;
    });

    const n = samples.length;
    const mvpaPct = Math.round((mvpaCount * 100) / n);
    const vigorousPct = Math.round((vigCount * 100) / n);
    const waitingPct = Math.round((waitCount * 100) / n);

    const ctxPct = {};
    Object.keys(ctxCounts).forEach(k => { ctxPct[k] = Math.round((ctxCounts[k] * 100) / n); });

    const tchPct = {};
    Object.keys(tchCounts).forEach(k => { tchPct[k] = Math.round((tchCounts[k] * 100) / n); });

    return {
      mvpaPct,
      vigorousPct,
      waitingPct,
      ctxPct,
      tchPct,
      goalMet: mvpaPct >= MVPA_GOAL
    };
  }

  // قياس زمن استجابة الطلاب لصافرة المعلم (Whistle Response Latency)
  function whistleResponses(whistleTimes, frameTimeline) {
    const whistles = whistleTimes || [];
    const timeline = frameTimeline || [];
    if (!whistles.length || !timeline.length) {
      return { count: whistles.length, avgLatencySec: null, events: [] };
    }

    const events = [];
    whistles.forEach(wt => {
      // البحث عن أول تغير واضح في سرعة الحركة أو انتظام التشكيل خلال 12 ثانية بعد الصافرة
      const before = timeline.filter(f => f.t >= wt - 3 && f.t <= wt);
      const after = timeline.filter(f => f.t > wt && f.t <= wt + 12);
      if (!after.length) return;

      const baseMove = before.length
        ? before.reduce((a, b) => a + (b.movingRatio || 0), 0) / before.length
        : (after[0].movingRatio || 0);

      let responseT = null;
      for (let i = 0; i < after.length; i++) {
        const delta = Math.abs((after[i].movingRatio || 0) - baseMove);
        if (delta >= 0.22 || (after[i].structuredRatio || 0) >= 0.7) {
          responseT = Math.round((after[i].t - wt) * 10) / 10;
          break;
        }
      }

      events.push({
        whistleTime: wt,
        responseSec: responseT,
        status: responseT != null && responseT <= 4.5 ? 'استجابة سريعة' : responseT != null ? 'استجابة متوسطة' : 'لم ترصد استجابة'
      });
    });

    const valid = events.filter(e => e.responseSec != null);
    const avgLatencySec = valid.length
      ? Math.round((valid.reduce((a, b) => a + b.responseSec, 0) / valid.length) * 10) / 10
      : null;

    return {
      count: whistles.length,
      avgLatencySec,
      events
    };
  }

  const sofitApi = {
    SOFIT_STEP,
    MVPA_GOAL,
    SOFIT_CTX,
    SOFIT_TCH,
    sofit,
    whistleResponses
  };

  root.SvfEyeSofit = sofitApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = sofitApi;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
