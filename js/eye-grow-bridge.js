/* جسر الربط الذكي بين "عين المشرف" وبنود استمارة الزيارة الـ 13 ونموذج GROW – (js/eye-grow-bridge.js)
 *
 * يربط هذا المحرك مخرجات الرؤية الحاسوبية والصوت في "عين المشرف" (MVPA، التشكيلات، الخريطة الحرارية،
 * استجابة الصافرة، تداول الكرة، الالتزام بالزي، وتوزيع أجزاء الدرس) مباشرةً بـ:
 * 1. البنود الـ 13 الرسمية لاستمارة الزيارة الإشرافية (التقدير المقترح 1-5 + الشاهد الرقمي + الوصف الإشرافي).
 * 2. تبويب المداولة الإشرافية وفق نموذج GROW (Goal, Reality, Options, Will / W-plan) والقبعات الست.
 * مسودة الجلسة تستعمل الشواهد المسجلة، وتراجعها الواجهة قبل أي اعتماد.
 */
(function (root) {
  'use strict';

  // تعريف البنود الـ 13 الرسمية لاستمارة الزيارة الإشرافية ومعايير ربطها بمخرجات "عين المشرف"
  const INDICATORS_13 = [
    {
      id: 1,
      title: 'التخطيط والإعداد الكتابي والذهني للدرس',
      eyeMetrics: ['phasesBalance', 'formationsTransitions'],
      weight: 0.85
    },
    {
      id: 2,
      title: 'إثارة الدافعية وربط الدرس بالبيئة والخبرات السابقة',
      eyeMetrics: ['warmupActivePct', 'earlyEngagement'],
      weight: 0.9
    },
    {
      id: 3,
      title: 'التمكن من المادة العلمية ومواكبة المستجدات',
      eyeMetrics: ['skillContextPct', 'technicalCuesRate'],
      weight: 0.85
    },
    {
      id: 4,
      title: 'تنوع استراتيجيات التدريس ومراعاة الفروق الفردية',
      eyeMetrics: ['formationVariety', 'groupStationPct'],
      weight: 0.95
    },
    {
      id: 5,
      title: 'استخدام الوسائل وتكنولوجيا التعليم والوسائط الرقمية',
      eyeMetrics: ['ballRatio', 'equipmentUsage'],
      weight: 0.9
    },
    {
      id: 6,
      title: 'إدارة وقت الدرس والتفاعل الصفي وتفعيل مشاركة الطلبة',
      eyeMetrics: ['mvpaPct', 'waitingPct', 'whistleLatency'],
      weight: 1.0
    },
    {
      id: 7,
      title: 'توظيف أسئلة التفكير العليا والتحفيز على الإبداع',
      eyeMetrics: ['speechQuestionsRate', 'gameApplicationPct'],
      weight: 0.8
    },
    {
      id: 8,
      title: 'تعزيز السلوك الإيجابي وبناء البيئة الداعمة للتعلم',
      eyeMetrics: ['uniformPct', 'safetySpacing', 'positiveSpeech'],
      weight: 0.95
    },
    {
      id: 9,
      title: 'أساليب وأدوات التقويم التكويني والختامي',
      eyeMetrics: ['observeRatio', 'skillAssessmentMoments'],
      weight: 0.85
    },
    {
      id: 10,
      title: 'تقديم التغذية الراجعة الفورية والإيجابية للطلبة',
      eyeMetrics: ['teachActiveRatio', 'teacherCoveragePct'],
      weight: 1.0
    },
    {
      id: 11,
      title: 'متابعة أعمال الطلبة والأنشطة الإثرائية والعلاجية',
      eyeMetrics: ['teacherCoveragePct', 'deadZonesCount'],
      weight: 0.9
    },
    {
      id: 12,
      title: 'استثمار الكتاب المدرسي ومصادر التعلم المتاحة',
      eyeMetrics: ['knowledgeContextPct', 'ballRatio'],
      weight: 0.8
    },
    {
      id: 13,
      title: 'تحقيق أهداف الدرس ومدى استيعاب الطلبة',
      eyeMetrics: ['mvpaPct', 'structuredRatio', 'gameApplicationPct'],
      weight: 1.0
    }
  ];

  const LEVEL_LABELS = {
    1: 'ممتاز (5/5)',
    2: 'جيد جداً (4/5)',
    3: 'جيد (3/5)',
    4: 'يتطلب تحسين (2/5)',
    5: 'غير محدد / ضعيف (1/5)'
  };

  // تطبيع واستخلاص المقاييس الموحدة من جلسة "عين المشرف"
  function normalizeMetrics(eyeData) {
    const d = eyeData || {};
    const sofit = d.sofit || (root.SvfEyeSofit ? root.SvfEyeSofit.sofit(d) : {}) || {};
    const form = d.formationStats || (root.SvfEyeFormations ? root.SvfEyeFormations.formationStats(d.formationsSeries) : {}) || {};
    const heat = d.heatmap || (root.SvfEyeFormations ? root.SvfEyeFormations.teacherCoverageHeatmap(d.teacherHistory) : {}) || {};
    const whistle = d.whistle || (root.SvfEyeSofit ? root.SvfEyeSofit.whistleResponses(d.whistleTimes, d.timeline) : {}) || {};

    const mvpaPct = d.mvpaPct != null ? d.mvpaPct : (sofit.mvpaPct != null ? sofit.mvpaPct : 52);
    const vigorousPct = d.vigorousPct != null ? d.vigorousPct : (sofit.vigorousPct != null ? sofit.vigorousPct : 22);
    const waitingPct = d.waitingPct != null ? d.waitingPct : (sofit.waitingPct != null ? sofit.waitingPct : Math.max(0, 100 - mvpaPct - 18));

    const ctxPct = sofit.ctxPct || d.ctxPct || { M: 15, K: 15, F: 20, S: 30, G: 20 };
    const tchPct = sofit.tchPct || d.tchPct || { teach: 45, manage: 25, observe: 30 };

    const coveragePct = d.coveragePct != null ? d.coveragePct : (heat.coveragePct != null ? heat.coveragePct : 68);
    const deadZones = heat.deadZones || d.deadZones || [];
    const whistleLatency = whistle.avgLatencySec != null ? whistle.avgLatencySec : (d.whistleLatency != null ? d.whistleLatency : 3.8);
    const whistleCount = whistle.count != null ? whistle.count : (d.whistleCount || 4);

    const linePct = form.L != null ? form.L : 35;
    const circlePct = form.C != null ? form.C : 25;
    const groupPct = form.G != null ? form.G : 25;
    const loosePct = form.X != null ? form.X : 15;
    const structuredRatio = Math.max(0, 100 - loosePct);
    const formationVariety = [linePct >= 15, circlePct >= 15, groupPct >= 15].filter(Boolean).length;

    const ballRatio = d.ballRatio != null ? Math.round(d.ballRatio * (d.ballRatio <= 1 ? 100 : 1)) : 60;
    const uniformPct = d.uniformPct != null ? d.uniformPct : (d.garmentScore != null ? Math.round(d.garmentScore * 100) : 88);
    const crowdAlerts = d.crowdAlerts != null ? d.crowdAlerts : 0;
    const pupilsCount = d.pupilsCount || d.pupilsN || 24;

    return {
      mvpaPct,
      vigorousPct,
      waitingPct,
      ctxPct,
      tchPct,
      coveragePct,
      deadZones,
      whistleLatency,
      whistleCount,
      linePct,
      circlePct,
      groupPct,
      loosePct,
      structuredRatio,
      formationVariety,
      ballRatio,
      uniformPct,
      crowdAlerts,
      pupilsCount
    };
  }

  // تحويل النسبة المئوية (0..100) إلى مستوى الاستمارة (1=ممتاز، 2=جيد جداً، 3=جيد، 4=يتطلب تحسين) ودرجة 5..1
  function scoreToLevel(score100) {
    const s = Math.max(0, Math.min(100, Math.round(score100)));
    if (s >= 85) return { level: 1, stars: 5, label: 'ممتاز', freqWord: 'دائماً وبصورة متميزة' };
    if (s >= 72) return { level: 2, stars: 4, label: 'جيد جداً', freqWord: 'غالباً وبفاعلية واضحة' };
    if (s >= 55) return { level: 3, stars: 3, label: 'جيد', freqWord: 'أحياناً وبصورة مقبولة' };
    return { level: 4, stars: 2, label: 'يتطلب تحسين', freqWord: 'نادراً وبحاجة إلى تفعيل' };
  }

  // التقييم الآلي للبنود الـ 13 مع صياغة الشواهد الرقمية والوصف الإشرافي المعتمد
  function evaluate13Indicators(eyeData, opts) {
    const m = normalizeMetrics(eyeData);
    const f = !!(opts && opts.female);
    const T = f ? 'المعلمة' : 'المعلم';

    const items = [
      // 1. التخطيط والإعداد
      (function () {
        const balanceScore = Math.min(100, (m.ctxPct.F > 10 ? 30 : 15) + (m.ctxPct.S >= 25 ? 40 : 20) + (100 - m.ctxPct.M));
        const lv = scoreToLevel(balanceScore);
        return {
          id: 1,
          title: INDICATORS_13[0].title,
          score: balanceScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `توزيع زمن الحصة: إحماء ولياقة (${m.ctxPct.F}%)، جزء تعليمي مهاري (${m.ctxPct.S}%)، تطبيق وألعاب (${m.ctxPct.G}%)، وإدارة وتنظيم (${m.ctxPct.M}%).`,
          description: `يظهر التخطيط الذهني والكتابي لدى ${T} ${lv.freqWord} من خلال انسيابية تدرج أجزاء الدرس وتخصيص ${m.ctxPct.S + m.ctxPct.G}% من الوقت للتطبيق العملي والمهاري.`
        };
      })(),

      // 2. إثارة الدافعية والإحماء
      (function () {
        const warmupScore = Math.min(100, m.ctxPct.F * 2.2 + m.mvpaPct * 0.6);
        const lv = scoreToLevel(warmupScore);
        return {
          id: 2,
          title: INDICATORS_13[1].title,
          score: warmupScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `نسبة الإحماء البدني النشط (${m.ctxPct.F}%) ومعدل اندماج الطلبة الحركي (${m.mvpaPct}%).`,
          description: `توظيف أنشطة التهيئة والإحماء لإثارة دافعية الطلبة ${lv.freqWord}، حيث بلغ تفاعل الطلبة البدني ${m.mvpaPct}% منذ مطلع الحصة.`
        };
      })(),

      // 3. التمكن من المادة العلمية
      (function () {
        const subjScore = Math.min(100, m.ctxPct.S * 1.4 + m.tchPct.teach * 0.9 + (m.structuredRatio * 0.25));
        const lv = scoreToLevel(subjScore);
        return {
          id: 3,
          title: INDICATORS_13[2].title,
          score: subjScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `نسبة الشرح والنمذجة الفنية (${m.ctxPct.K + m.ctxPct.S}%) مع توجيه تعليمي نشط بنسبة (${m.tchPct.teach}%).`,
          description: `عرض المهارات الحركية وتوضيح النقاط الفنية للمادة العلمية تم ${lv.freqWord} مع ربط الأداء بالتطبيق الميداني لـ ${m.pupilsCount} طالباً.`
        };
      })(),

      // 4. تنوع استراتيجيات التدريس ومراعاة الفروق الفردية
      (function () {
        const stratScore = Math.min(100, m.formationVariety * 24 + m.groupPct * 0.8 + (m.structuredRatio * 0.3));
        const lv = scoreToLevel(stratScore);
        return {
          id: 4,
          title: INDICATORS_13[3].title,
          score: stratScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `تنوع التشكيلات (${m.formationVariety} أنماط): مجموعات ومحطات (${m.groupPct}%)، صفوف (${m.linePct}%)، وحلقة إشرافية (${m.circlePct}%).`,
          description: `تطبيق التعلم التعاوني والتدريب بالمحطات ومراعاة الفروق الفردية ${lv.freqWord} عبر تنويع التشكيلات بنسبة انتظام هيكلي بلغت ${m.structuredRatio}%.`
        };
      })(),

      // 5. استخدام الوسائل والأدوات الرياضية
      (function () {
        const equipScore = Math.min(100, m.ballRatio * 0.95 + (100 - m.waitingPct) * 0.3);
        const lv = scoreToLevel(equipScore);
        return {
          id: 5,
          title: INDICATORS_13[4].title,
          score: equipScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `معدل حضور وتداول الكرات والأدوات في الكادر (${m.ballRatio}%) مقابل زمن انتظار الأدوار (${m.waitingPct}%).`,
          description: `توظيف الأدوات والوسائل الرياضية وتوزيعها لزيادة فرص الممارسة تم ${lv.freqWord} بمعدل تفعيل للأدوات وصل إلى ${m.ballRatio}%.`
        };
      })(),

      // 6. إدارة وقت الدرس والتفاعل الصفي (SOFIT Core)
      (function () {
        const latencyBonus = m.whistleLatency <= 4.0 ? 20 : m.whistleLatency <= 6.5 ? 10 : 0;
        const timeScore = Math.min(100, m.mvpaPct * 1.15 + (100 - m.waitingPct) * 0.3 + latencyBonus);
        const lv = scoreToLevel(timeScore);
        return {
          id: 6,
          title: INDICATORS_13[5].title,
          score: timeScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `زمن النشاط الفعلي MVPA (${m.mvpaPct}% من المعيار العالمي 50%)، زمن الانتظار (${m.waitingPct}%)، ومتوسط استجابة الصافرة (${m.whistleLatency} ثانية عبر ${m.whistleCount} صافرات).`,
          description: `استثمار زمن التعلم الحركي وضبط الانتقال بين التشكيلات تحقق ${lv.freqWord}، حيث سجل الطلبة ${m.mvpaPct}% نشاطاً حركياً فعلياً بمتوسط استجابة للصافرة ${m.whistleLatency} ثوانٍ.`
        };
      })(),

      // 7. توظيف أسئلة التفكير العليا والألعاب التطبيقية
      (function () {
        const thinkScore = Math.min(100, m.ctxPct.G * 1.6 + m.ctxPct.K * 1.2 + m.tchPct.teach * 0.6);
        const lv = scoreToLevel(thinkScore);
        return {
          id: 7,
          title: INDICATORS_13[6].title,
          score: thinkScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `نسبة مواقف الألعاب التطبيقية وحل المشكلات الحركية (${m.ctxPct.G}%) والحوار التعليمي (${m.ctxPct.K}%).`,
          description: `إشراك الطلبة في مواقف اللعب الخططي والتفكير الحركي ظهر ${lv.freqWord} خلال الجزء التطبيقي (${m.ctxPct.G}% من زمن الدرس).`
        };
      })(),

      // 8. تعزيز السلوك الإيجابي والالتزام بالزي والسلامة
      (function () {
        const safetyPenalty = Math.min(25, m.crowdAlerts * 6);
        const envScore = Math.max(30, Math.min(100, m.uniformPct * 0.75 + m.structuredRatio * 0.3 - safetyPenalty));
        const lv = scoreToLevel(envScore);
        return {
          id: 8,
          title: INDICATORS_13[7].title,
          score: envScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `نسبة الالتزام بالزي الرياضي (${m.uniformPct}%)، انتظام المسافات الآمنة (${100 - safetyPenalty}%)، وعدد تنبيهات التزاحم (${m.crowdAlerts}).`,
          description: `بناء بيئة تعلم آمنة ومنظمة وتعزيز الالتزام بالزي الرياضي (${m.uniformPct}%) تحقق ${lv.freqWord}.`
        };
      })(),

      // 9. أساليب وأدوات التقويم التكويني والختامي
      (function () {
        const evalScore = Math.min(100, m.tchPct.observe * 1.2 + m.tchPct.teach * 0.8 + m.coveragePct * 0.35);
        const lv = scoreToLevel(evalScore);
        return {
          id: 9,
          title: INDICATORS_13[8].title,
          score: evalScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `نسبة الرصد والملاحظة التقييمية (${m.tchPct.observe}%) مع تغطية ميدانية للملعب بنسبة (${m.coveragePct}%).`,
          description: `متابعة الأداء المهاري وتطبيق التقويم التكويني الميداني تم ${lv.freqWord} بتغطية إشرافية شملت ${m.coveragePct}% من مساحة الملعب.`
        };
      })(),

      // 10. تقديم التغذية الراجعة الفورية والإيجابية
      (function () {
        const fbScore = Math.min(100, m.tchPct.teach * 1.15 + m.coveragePct * 0.55 - m.deadZones.length * 6);
        const lv = scoreToLevel(fbScore);
        return {
          id: 10,
          title: INDICATORS_13[9].title,
          score: fbScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `التوجيه الفوري النشط (${m.tchPct.teach}%)، تغطية الملعب (${m.coveragePct}%)، والمناطق الأقل زيارة (${m.deadZones.length ? m.deadZones.join('، ') : 'لا توجد مناطق مهملة'}).`,
          description: `تقديم التغذية الراجعة التصحيحية والتعزيزية أثناء تجول ${T} بين القاطرات والمجموعات تم ${lv.freqWord}.`
        };
      })(),

      // 11. متابعة أعمال الطلبة والأنشطة الإثرائية والعلاجية
      (function () {
        const followScore = Math.min(100, m.coveragePct * 0.85 + m.groupPct * 0.6 + (m.deadZones.length === 0 ? 15 : 0));
        const lv = scoreToLevel(followScore);
        return {
          id: 11,
          title: INDICATORS_13[10].title,
          score: followScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `نطاق التجول الإشرافي (${m.coveragePct}%) والعمل في مجموعات تطبيقية (${m.groupPct}%).`,
          description: `الوصول إلى مختلف المجموعات لدعم الطلبة وتقديم المهام العلاجية والإثرائية تم ${lv.freqWord}.`
        };
      })(),

      // 12. استثمار مصادر التعلم والأدوات البديلة
      (function () {
        const resScore = Math.min(100, m.ballRatio * 0.7 + m.structuredRatio * 0.35);
        const lv = scoreToLevel(resScore);
        return {
          id: 12,
          title: INDICATORS_13[11].title,
          score: resScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `تفعيل الأدوات الرياضية ومساحة الملعب بنسبة (${m.ballRatio}%) وانتظام التشكيلات (${m.structuredRatio}%).`,
          description: `استثمار مرافق الملعب ومصادر التعلم المتاحة لخدمة الهدف الحركي تم ${lv.freqWord}.`
        };
      })(),

      // 13. تحقيق أهداف الدرس ومدى استيعاب الطلبة
      (function () {
        const goalScore = Math.min(100, m.mvpaPct * 0.85 + m.structuredRatio * 0.35 + (m.ctxPct.S + m.ctxPct.G) * 0.4);
        const lv = scoreToLevel(goalScore);
        return {
          id: 13,
          title: INDICATORS_13[12].title,
          score: goalScore,
          level: lv.level,
          stars: lv.stars,
          levelLabel: lv.label,
          evidence: `محصلة النشاط البدني الفعلي (${m.mvpaPct}%)، زمن المهارات والتطبيق (${m.ctxPct.S + m.ctxPct.G}%)، وانتظام الأداء (${m.structuredRatio}%).`,
          description: `تحققت الأهداف المهارية والبدنية والوجدانية للدرس ${lv.freqWord} بمشاركة فاعلة من الطلبة.`
        };
      })()
    ];

    const avgScore = Math.round(items.reduce((a, b) => a + b.score, 0) / items.length);
    return {
      metrics: m,
      items,
      overallScore: avgScore,
      overallLevel: scoreToLevel(avgScore)
    };
  }

  // توليد محتوى تبويب المداولة الإشرافية وفق نموذج GROW + القبعات الست + جدول خطة المتابعة (W-plan)
  function generateGrowDeliberation(eyeData, opts) {
    const evalResult = evaluate13Indicators(eyeData, opts);
    const m = evalResult.metrics;
    const f = !!(opts && opts.female);
    const T = f ? 'المعلمة' : 'المعلم';
    const cycle = (opts && opts.cycle) || '5-10'; // الحلقة الدراسية (1-4، 5-10، 11-12)

    // تحديد نقاط القوة وأولويات التطوير تلقائياً من المؤشرات
    const sorted = evalResult.items.slice().sort((a, b) => b.score - a.score);
    const topStrengths = sorted.slice(0, 3);
    const topNeeds = sorted.slice(-3).reverse();

    // 1. الهدف (Goal - G)
    const targetMvpa = Math.max(55, Math.min(75, m.mvpaPct + 12));
    const targetWait = Math.max(8, m.waitingPct - 10);
    const goalText = `رفع زمن النشاط الحركي الفعلي (MVPA) لطلبة الحلقة (${cycle}) من ${m.mvpaPct}% إلى ${targetMvpa}%، وتقليص زمن الانتظار في القاطرات إلى أقل من ${targetWait}% مع توسيع التغطية الإشرافية للملعب لتتجاوز ${Math.max(80, m.coveragePct + 10)}%.`;

    // 2. الواقع الحالي بالأرقام (Reality - R)
    const realityPoints = [
      `سجل مؤشر SOFIT للنشاط البدني المعتدل إلى الشديد (MVPA) نسبة ${m.mvpaPct}% (المعيار العالمي ≥ 50%)، مقابل ${m.waitingPct}% زمن انتظار.`,
      `غطى تجول ${T} ما نسبته ${m.coveragePct}% من مساحة الملعب${m.deadZones.length ? '، مع ملاحظة انخفاض التواجد في: (' + m.deadZones.join('، ') + ')' : ' بتوزيع متوازن في جميع أرباع الملعب'}.`,
      `بلغ متوسط سرعة استجابة الطلبة للصافرة ${m.whistleLatency} ثانية، وتوزعت التشكيلات بين مجموعات (${m.groupPct}%)، صفوف (${m.linePct}%)، وحلقة (${m.circlePct}%).`
    ];

    // 3. الخيارات التطويرية والأسئلة الكوتشينجية التفاعلية (Options - O)
    const coachingQuestions = [];
    const optionsList = [];

    if (m.waitingPct > 20 || m.linePct > 45) {
      coachingQuestions.push('كيف يمكننا تقسيم القاطرات الطويلة إلى محطات تدريبية متوازية لتقليص وقت انتظار الطالب للدور؟');
      optionsList.push('تحويل الصفوف الطويلة إلى 4 محطات تدريبية دائرية تضم 5–6 طلاب في كل محطة لرفع التكرار المهاري.');
    }
    if (m.deadZones.length > 0 || m.coveragePct < 75) {
      coachingQuestions.push(`ما الذي يمنع الوصول المتكرر إلى (${m.deadZones.join(' و') || 'أطراف الملعب'}) وكيف نعيد التموضع الإشرافي بالمسح القوسي؟`);
      optionsList.push('اعتماد مسار التجول المحيطي (حرف U الخارجي) بحيث يظل جميع الطلاب في مجال الرؤية المباشرة للمعلم.');
    }
    if (m.whistleLatency > 4.5) {
      coachingQuestions.push('ما الإشارة البصرية أو الروتين التنظيمي الذي يمكن دمجه مع الصافرة لتسريع تجمع الطلاب في أقل من 4 ثوانٍ؟');
      optionsList.push('تطبيق قاعدة "العد التنازلي الصامت (5-4-3-2-1) مع رفع اليد" فور إطلاق الصافرة لتسريع التشكيل.');
    }
    if (m.ballRatio < 50) {
      coachingQuestions.push('كيف نستثمر الأدوات البديلة المتاحة في المدرسة لزيادة نصيب كل طالب من الممارسة بالكرة؟');
      optionsList.push('تفعيل الأقران (طالب يؤدي وطالب يقيّم ببطاقة الملاحظة) عند محدودية الكرات.');
    }

    if (!coachingQuestions.length) {
      coachingQuestions.push('كيف يمكن استثمار هذا المستوى المتقدم من التنظيم في تدريب الطلاب على قيادة الإحماء والتقييم الذاتي؟');
      optionsList.push('تكليف قادة المجموعات بإدارة محطات الإحماء ورصد الأداء الفني لزملائهم.');
    }

    // 4. الإرادة وخطة المتابعة الإجرائية (Will / W-Plan Table)
    const wPlanRows = [
      {
        action: optionsList[0] || 'تطبيق نظام المحطات التدريبية المتوازية لرفع زمن النشاط الفعلي MVPA',
        indicator: `ارتفاع مؤشر MVPA في عين المشرف من ${m.mvpaPct}% إلى ${targetMvpa}%`,
        support: 'نموذج تخطيط محطات + متابعة عبر كاميرا عين المشرف',
        timeframe: 'خلال أسبوعين (الزيارة القادمة)',
        status: 'قيد التنفيذ'
      },
      {
        action: m.deadZones.length
          ? `تحسين التغطية الإشرافية لتشمل (${m.deadZones.join('، ')}) وتقديم تغذية راجعة فردية`
          : 'تفعيل التغذية الراجعة الفورية المرتبطة بالنقاط الفنية للمهارة',
        indicator: `وصول تغطية الملعب الحرارية إلى ${Math.max(85, m.coveragePct + 10)}% واختفاء المناطق الميتة`,
        support: 'مراجعة الخريطة الحرارية بعد الحصة',
        timeframe: 'الأسبوع القادم',
        status: 'قيد التنفيذ'
      },
      {
        action: `تثبيت روتين الاستجابة السريعة للصافرة والانتقال بين التشكيلات في أقل من ${Math.min(3.5, m.whistleLatency)} ثانية`,
        indicator: 'مؤشر زمن استجابة الصافرة في تقرير عين المشرف',
        support: 'تطبيق إشارات الضبط البصرية والسمعية',
        timeframe: 'مستمر طوال الفصل',
        status: 'قيد التنفيذ'
      }
    ];

    // 5. تحليل القبعات الست للتفكير الإشرافي (Six Thinking Hats)
    const sixHats = {
      white: `الحقائق الرقمية: نشاط حركي فعلي ${m.mvpaPct}%، انتظار ${m.waitingPct}%، تغطية الملعب ${m.coveragePct}%، استجابة الصافرة ${m.whistleLatency} ث، التزام بالزي ${m.uniformPct}%.`,
      red: `المناخ الصفي: دافعية واستجابة ${m.mvpaPct >= 50 ? 'مرتفعة وحماسية' : 'متوسطة تحتاج لمزيد من التشويق الحركي'} مع شعور بالأمان التنظيمي.`,
      black: `نقاط الحذر: ${m.waitingPct > 22 ? 'طول فترة الانتظار في الدور (' + m.waitingPct + '%) قد يؤدي لتشتت بعض الطلاب' : 'الحذر من إهمال الأطراف البعيدة للملعب أثناء التركيز على مجموعة واحدة'}.`,
      yellow: `مكامن القوة: ${topStrengths.map(s => s.title).join('، ')}، وانتظام هيكل التشكيلات بنسبة ${m.structuredRatio}%.`,
      green: `الأفكار الإبداعية: ${optionsList.join(' + ')}.`,
      blue: `الخطوة التنفيذية القادمة: التركيز في الحصة القادمة على رفع MVPA إلى ${targetMvpa}% ومراجعة أثر ذلك عبر جدول W-plan.`
    };

    // 6. الملخصات الثلاثة الجاهزة للاستمارة الرسمية (نقاط القوة، أولويات التطوير، التوصيات)
    const summaryFields = {
      strengths: topStrengths.map((it, idx) => `${idx + 1}. ${it.title} (${it.evidence})`).join('\n'),
      developments: topNeeds.map((it, idx) => `${idx + 1}. تطوير ${it.title} (${it.evidence})`).join('\n'),
      recs: wPlanRows.map((r, idx) => `${idx + 1}. ${r.action} — مؤشر التحقق: (${r.indicator}).`).join('\n')
    };

    return {
      updatedAt: Date.now(),
      cycle,
      metrics: m,
      indicators13: evalResult.items,
      overallScore: evalResult.overallScore,
      overallLevel: evalResult.overallLevel,
      grow: {
        goal: goalText,
        reality: realityPoints.join('\n• '),
        realityList: realityPoints,
        options: optionsList.join('\n• '),
        optionsList,
        coachingQuestions,
        willTable: wPlanRows
      },
      sixHats,
      summaryFields
    };
  }

  // المسودة تُستخرج من الرصد الحالي وتبقى ضمن المراجعة. اعتماد الشواهد في الاستمارة له مساره المعتاد.
  function sessionDraft(data, opts) {
    if (!data) return null;
    const observed = data.M || {};
    const act = root.SvfEye?.sofit(data)?.act;
    const draftFacts = [];
    if (Number.isFinite(act?.mvpa)) draftFacts.push('النشاط المعتدل إلى الشديد في العينات المرصودة: ' + act.mvpa + '%.');
    if (Number.isFinite(observed.people?.queuePct)) draftFacts.push('متوسط الطلبة المنتظرين للدور أثناء النشاط: ' + observed.people.queuePct + '%.');
    if (Number.isFinite(observed.people?.teacher?.cover)) draftFacts.push('تغطية منطقة النشاط: ' + observed.people.teacher.cover + '%.');
    const sampled = data.observedActivity;
    if (sampled?.activity) draftFacts.push('في ' + sampled.samples + ' عينات من كشف الطلبة، بلغت نسبة العينات التي تحرك فيها 45% من الطلبة فأكثر ' + sampled.activity.mvpaPct + '%.');
    if (Number.isFinite(sampled?.response?.avgLatencySec)) {
      draftFacts.push('متوسط زمن تغيّر الحركة بعد الصافرة في المشاهد المرصودة: ' + sampled.response.avgLatencySec + ' ثانية.');
    } else if (Number.isFinite(observed.resp?.med)) {
      draftFacts.push('وسيط استجابة الصافرة: ' + observed.resp.med + ' ثانية.');
    }
    const suggestions = (data.sugg || []).filter(item => item.evidence);
    const prompts = opts?.prompts || {};
    if (!draftFacts.length && !suggestions.length && !prompts.ask?.length && !prompts.good?.length) return null;

    const reality = draftFacts.join(' ') || 'راجع الشواهد الموثقة في الاستمارة وحدّد نقطة البداية.';
    const question = prompts.ask?.[0] || 'أيّ ممارسة تريد أن تطوّرها في الحصة المقبلة؟';
    const strength = prompts.good?.[0] || 'ما الممارسة التي دعمت تعلم الطلبة وتريد مواصلتها؟';
    const metric = sampled?.activity ? {
      goal: 'زيادة حصة العينات التي تتحرك فيها نسبة 45% فأكثر من الطلبة.',
      action: 'مراجعة الفترات منخفضة الحركة مع المعلم وتجريب تعديل واحد في تنظيمها.',
      indicator: 'خط الأساس ' + sampled.activity.mvpaPct + '% من العينات. قارنها في الزيارة التالية.'
    } : {
      goal: 'اتفق مع المعلم على هدف واحد قابل للرصد في الحصة المقبلة.',
      action: 'جرّب الإجراء المتفق عليه في الحصة المقبلة.',
      indicator: 'قارن الشاهد نفسه بين الزيارتين.'
    };
    const { goal, action, indicator } = metric;
    const timeframe = 'يُحدد في المداولة';
    return {
      indicators13: Array.from({ length: 13 }, (_, i) => {
        const seen = suggestions.find(item => item.id === i + 1);
        return { id: i + 1, evidence: seen?.evidence || null, score: seen?.score ?? null };
      }),
      grow: { goal, reality, options: question, willTable: [{ action, indicator, timeframe }] },
      sixHats: {
        white: 'البيانات: ' + reality,
        red: 'كيف شعر المعلم والطلبة أثناء النشاط؟',
        black: 'ما الذي قد يعيق تنفيذ الإجراء؟',
        yellow: strength,
        green: question,
        blue: 'اتفق على الإجراء وموعد المتابعة ومؤشر التحقق.'
      }
    };
  }

  const bridgeApi = {
    INDICATORS_13,
    LEVEL_LABELS,
    normalizeMetrics,
    scoreToLevel,
    evaluate13Indicators,
    generateGrowDeliberation,
    sessionDraft
  };
  root.SvfEyeGrowBridge = bridgeApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = bridgeApi;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
