(function (root) {
  'use strict';
  function itemCues(snapshots) {
    if (!Array.isArray(snapshots)) return {};
    const cues = {};
    snapshots.forEach(s => {
      if (s && s.itemIndex !== undefined) {
        if (!cues[s.itemIndex]) cues[s.itemIndex] = [];
        cues[s.itemIndex].push(s);
      }
    });
    return cues;
  }
  function windowStats(events, windowMs) {
    const now = Date.now();
    const cutoff = now - (windowMs || 60000);
    const recent = (events || []).filter(e => e && e.timestamp >= cutoff);
    return {
      count: recent.length,
      ratePerMin: (recent.length / ((windowMs || 60000) / 60000)).toFixed(1),
      lastEvent: recent.length > 0 ? recent[recent.length - 1] : null
    };
  }
  function review(sessionData) {
    if (!sessionData) return { status: 'empty', score: 0 };
    const totalSnapshots = (sessionData.snapshots || []).length;
    const duration = sessionData.durationMs || 0;
    const bridge = root.SvfEyeGrowBridge;
    const autoEval = bridge ? bridge.generateGrowDeliberation(sessionData) : null;
    return {
      status: (totalSnapshots > 0 || duration > 0) ? 'active' : 'idle',
      totalSnapshots,
      durationMinutes: Math.round(duration / 60000),
      completeness: autoEval ? 100 : Math.min(100, Math.round((totalSnapshots / 13) * 100)),
      overallScore: autoEval ? autoEval.overallScore : 0,
      indicators13: autoEval ? autoEval.indicators13 : [],
      grow: autoEval ? autoEval.grow : null,
      sixHats: autoEval ? autoEval.sixHats : null,
      summaryFields: autoEval ? autoEval.summaryFields : null
    };
  }
  function time(ms) {
    if (!ms || isNaN(ms)) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  function pushToVisitReport(docId, sessionData, opts) {
    if (root.SvfEyeGrowBridge && typeof root.SvfEyeGrowBridge.syncToVisitForm === 'function') {
      return root.SvfEyeGrowBridge.syncToVisitForm(docId, sessionData, opts);
    }
    return review(sessionData);
  }
  const api = {
    itemCues,
    windowStats,
    review,
    time,
    pushToVisitReport
  };
  root.SvfEyeFusion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})((typeof window !== 'undefined' ? window : globalThis));
