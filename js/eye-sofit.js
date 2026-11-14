/* وحدة معايير SOFIT و SOFIT+ ومؤشرات استجابة الصافرة – (js/eye-sofit.js)
 * جزء من تفكيك وترقية محرك "عين المشرف" (Supervisor Eye Modular Architecture)
 *
 * تفصل هذه الوحدة حسابات النشاط البدني المعتدل إلى الشديد (MVPA)،
 * تقسيم فترات الدرس، وحساب سرعة استجابة الطلاب للصافرة عن ملف `eye-core.js`.
 */
(function (root) {
  'use strict';

  const SOFIT_STEP = 20;
  const VISIT_CONTEXT = { warm: 'F', fit: 'F', teach: 'S', apply: 'G' };
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

    let ctxN = 0, tchN = 0;
    samples.forEach(s => {
      const activeRatio = s.movingRatio != null ? s.movingRatio : (s.mvpa || 0);
      if (activeRatio >= 0.45) mvpaCount++;
      if (activeRatio >= 0.7) vigCount++;
      if (activeRatio < 0.2) waitCount++;

      if (Object.hasOwn(ctxCounts, s.ctx)) { ctxCounts[s.ctx]++; ctxN++; }

      if (Object.hasOwn(tchCounts, s.tchRole)) { tchCounts[s.tchRole]++; tchN++; }
    });

    const n = samples.length;
    const mvpaPct = Math.round((mvpaCount * 100) / n);
    const vigorousPct = Math.round((vigCount * 100) / n);
    const waitingPct = Math.round((waitCount * 100) / n);

    const ctxPct = {};
    Object.keys(ctxCounts).forEach(k => { ctxPct[k] = ctxN ? Math.round((ctxCounts[k] * 100) / ctxN) : null; });

    const tchPct = {};
    Object.keys(tchCounts).forEach(k => { tchPct[k] = tchN ? Math.round((tchCounts[k] * 100) / tchN) : null; });

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
    const measured = timeline.filter(f => Number.isFinite(f.t) && Number.isFinite(f.movingRatio));
    whistles.forEach(wt => {
      const before = measured.filter(f => f.t >= wt - 6 && f.t < wt);
      const after = measured.filter(f => f.t > wt && f.t <= wt + 12);
      if (!before.length || !after.length) return;
      const baseMove = before.reduce((sum, f) => sum + f.movingRatio, 0) / before.length;
      const changed = f => baseMove >= 0.35 ? f.movingRatio <= baseMove * 0.45
        : baseMove <= 0.2 && f.movingRatio >= Math.max(0.35, baseMove + 0.25);
      const response = after.find((f, i) => after[i + 1] && after[i + 1].t - f.t <= 1.5 &&
        changed(f) && changed(after[i + 1]));
      const responseSec = response ? Math.round((response.t - wt) * 10) / 10 : null;
      events.push({ whistleTime: wt, responseSec, status: responseSec == null ? 'لم ترصد استجابة' : 'رُصد تغير الحركة' });
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

  // تستخدم الواجهة ثواني كشف الطلبة، وتستبعد الحضور والفترات التي لا صورة صالحة فيها.
  function visitSummary(secs, context, states, whistles) {
    const timeline = [];
    const samples = [];
    for (let t = 0; t < secs.length; t++) {
      const row = secs[t], people = row?.p;
      if (!people?.n || !Number.isFinite(people.mv) || !/[ai]/.test(states[t] || '')) continue;
      const movingRatio = people.mv / people.n;
      timeline.push({ t, movingRatio });
      if (t % SOFIT_STEP !== 0) continue;
      samples.push({ movingRatio, ctx: VISIT_CONTEXT[context[t]] || null });
    }
    const response = whistleResponses(whistles, timeline);
    return {
      samples: samples.length,
      activity: samples.length >= 3 ? sofit({ samples }) : null,
      response: response.events.length ? response : null
    };
  }

  const sofitApi = {
    SOFIT_STEP,
    MVPA_GOAL,
    SOFIT_CTX,
    SOFIT_TCH,
    sofit,
    whistleResponses,
    visitSummary
  };

  root.SvfEyeSofit = sofitApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = sofitApi;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
