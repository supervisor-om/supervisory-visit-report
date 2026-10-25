// =========================================================================
// عين المشرف — المحرّك (منذ 2026-10-25)
//
// دالّاتٌ نقيّةٌ بلا DOM (تُصدَّر لـnode أيضاً). الواجهة (js/eye.js) تلتقط من الكاميرا
// إطاراً كلّ ربع ثانيةٍ بحجم ٩٦ بكسلاً، ومن الميكروفون طيفاً كلّ عُشر ثانية، وتمرّرهما هنا:
//
//  • الحركة: فرق الإطار عن سابقه بعد طرح تغيّر الإضاءة العامّ. نسبة البكسلات المتغيّرة
//    هي شدّة الحركة؛ وأكثر من نصف الصورة يتغيّر معاً = الكاميرا تحرّكت (يُستبعد).
//  • الحالة كلّ ثانية: «نشاط» أو «انتظار» بعتبةٍ مع تخلّفٍ (hysteresis) وتنعيمٍ خمس ثوانٍ،
//    والمقاطع الأقصر من ١٢ ثانية تُضمّ إلى ما حولها. منها: زمن النشاط الحركي، وفترات
//    الانتظار والانتقالات، وبنية الحصة (إحماء / جزءٌ رئيس / ختام)، واستثمار المساحة.
//  • الصوت: مستوى نطاق الكلام فوق أرضيّة الضجيج = كلام؛ وكلامٌ في «انتظار» = شرحٌ وتوجيه.
//    وقمّةٌ ضيّقةٌ عالية بين ٢ و٤٫٥ كيلوهرتز = صفّارة.
//  • ما لا تراه الكاميرا يسجّله المشرف بلمسة (TAGS): التغذية الراجعة، والاستراتيجيّات، والقيم…
//
// suggest() يقترح درجةً **لبندٍ عليه شاهدٌ فقط** (السلّم مقلوب: ١ متميّز … ٥ تدخّل سريع)،
// ومع كلّ اقتراحٍ جملة شاهدٍ بالأرقام. البنود ١ و١١–١٣ لا تُقترح: لا تُرى في حصةٍ واحدة.
// لا يُحفظ إطارٌ ولا صوت: ما يبقى أرقامٌ في الذاكرة ثمّ في التقرير (#eyeData).
// =========================================================================
(function (root) {
    'use strict';

    const LEVELS = { 1: 'متميز', 2: 'جيد', 3: 'ملائم', 4: 'غير ملائم', 5: 'تدخل سريع' };

    // thr: فرق البكسل الذي يُعدّ حركة (من ٢٥٥)، active: نسبة الصورة المتحرّكة التي تُعدّ «نشاطاً»
    const SENS = {
        high:   { thr: 14, active: 0.010, label: 'عالية' },
        medium: { thr: 20, active: 0.018, label: 'متوسطة' },
        low:    { thr: 28, active: 0.030, label: 'منخفضة' }
    };
    const SHAKE = 0.45;          // أكثر من هذا من الصورة تغيّر معاً ← الكاميرا تحرّكت أو تبدّل الضوء
    const GRID_W = 12, GRID_H = 9;
    const SMOOTH = 5;            // ثوانٍ
    const MIN_RUN = 12;          // أقصر مقطعٍ يُعتدّ به
    const STOP_MIN = 20;         // انتظارٌ أطول من هذا يُعدّ توقّفاً
    const MIN_OBSERVE = 600;     // عشر دقائق رصدٍ صالح لاقتراح الإدارة الصفّيّة
    const MIN_STRUCTURE = 1200;  // عشرون دقيقة لاقتراح بنية الحصة

    // ما يسجّله المشرف بلمسة — item: البند الذي يشهد له، neg: شاهدٌ سلبيّ
    const TAGS = [
        { k: 'demo',      item: 8,  label: 'عرض نموذجي للمهارة' },
        { k: 'groups',    item: 8,  label: 'مجموعات أو تعلّم تعاوني' },
        { k: 'games',     item: 8,  label: 'ألعاب ومنافسات' },
        { k: 'stations',  item: 8,  label: 'محطات أو تعلّم ذاتي' },
        { k: 'levels',    item: 8,  label: 'تكليف حسب المستوى' },
        { k: 'include',   item: 2,  label: 'مراعاة الفروق والدمج' },
        { k: 'fbInd',     item: 10, label: 'تغذية راجعة فردية' },
        { k: 'fbGrp',     item: 10, label: 'تغذية راجعة جماعية' },
        { k: 'ask',       item: 10, label: 'سؤال تقويمي' },
        { k: 'peer',      item: 10, label: 'تقويم ذاتي أو أقران' },
        { k: 'lead',      item: 3,  label: 'قيادة طالب' },
        { k: 'team',      item: 3,  label: 'تعاون وعمل فريق' },
        { k: 'tactic',    item: 3,  label: 'تفكير خططي' },
        { k: 'praise',    item: 4,  label: 'تعزيز الروح الرياضية' },
        { k: 'misbehave', item: 4,  label: 'سلوك سلبي لم يُعالَج', neg: true },
        { k: 'safe',      item: 5,  label: 'تهيئة آمنة للمكان والأدوات' },
        { k: 'hazard',    item: 5,  label: 'موقف خطر', neg: true },
        { k: 'tools',     item: 9,  label: 'أدوات كافية ومتنوعة' },
        { k: 'noTools',   item: 9,  label: 'نقص أدوات وانتظار الدور', neg: true }
    ];
    const GROUPS = [
        { title: 'التدريس', keys: ['demo', 'groups', 'games', 'stations', 'levels', 'include'] },
        { title: 'التقويم', keys: ['fbInd', 'fbGrp', 'ask', 'peer'] },
        { title: 'مهارات التعلم والقيم', keys: ['lead', 'team', 'tactic', 'praise', 'misbehave'] },
        { title: 'السلامة والموارد', keys: ['safe', 'hazard', 'tools', 'noTools'] }
    ];
    const TAG = {};
    TAGS.forEach(t => { TAG[t.k] = t; });

    // البنود التي لا تُقترح، وسببها
    const NOT_SEEN = {
        1: 'تحصيل الطلبة يُقدَّر من أدائهم للمهارة ونتاجهم، لا من الحركة وحدها',
        11: 'التقويم الذاتي والتطوير المهني لا يظهران في حصة واحدة',
        12: 'الالتزام بالأخلاقيات واللوائح يُقدَّر من السجلات والمتابعة',
        13: 'المبادرات والأنشطة في المجتمع المدرسي خارج الحصة'
    };

    // ── الصورة ──
    function toGray(rgba, n, out) {
        const g = out || new Uint8Array(n);
        for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
        return g;
    }

    // فرق إطارين: m نسبة البكسلات المتغيّرة، وshake إن تغيّرت الصورة كلّها تقريباً.
    // grid (Uint32Array بطول GRID_W×GRID_H) يجمع الحركة لخريطة المساحة — للإطار الصالح وحده.
    function frameDiff(prev, cur, w, h, thr, grid) {
        const n = w * h;
        let sp = 0, sc = 0;
        for (let i = 0; i < n; i++) { sp += prev[i]; sc += cur[i]; }
        const shift = (sc - sp) / n;          // تغيّر الإضاءة العامّ يُطرح قبل المقارنة
        const cells = new Uint32Array(GRID_W * GRID_H);
        let changed = 0;
        for (let y = 0; y < h; y++) {
            const gy = Math.min(GRID_H - 1, Math.floor(y * GRID_H / h));
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (Math.abs(cur[i] - prev[i] - shift) > thr) {
                    changed++;
                    cells[gy * GRID_W + Math.min(GRID_W - 1, Math.floor(x * GRID_W / w))]++;
                }
            }
        }
        const m = changed / n;
        const shake = m > SHAKE;
        if (grid && !shake) for (let i = 0; i < cells.length; i++) grid[i] += cells[i];
        return { m, shake };
    }

    // ── الصوت ──
    // db: طيف ديسيبل (getFloatFrequencyData)، binHz: عرض الخانة. st يحمل أرضيّة الضجيج وتتبّع الصفّارة،
    // والواجهة تضع st.t (الزمن بالثواني) قبل كلّ نداء.
    function audioFrame(db, binHz, st) {
        const len = db.length;
        const at = hz => Math.max(1, Math.min(len - 1, Math.round(hz / binHz)));
        const lo = at(300), hi = at(3400);
        let sum = 0;
        for (let i = lo; i <= hi; i++) sum += Math.pow(10, db[i] / 10);
        const voiceDb = 10 * Math.log10(sum / (hi - lo + 1) + 1e-12);
        st.floor = (st.floor == null || voiceDb < st.floor) ? voiceDb : st.floor + 0.02;
        const voice = voiceDb > st.floor + 12;

        // الصفّارة نغمةٌ صافية: قمّةٌ تعلو جارتيها على بُعد ١٥٠–٤٠٠ هرتز بفارقٍ كبير.
        // الكلام والهتاف طيفٌ عريض — يعلو نطاقاً كاملاً لا خانةً واحدة، فلا يُعدّ صفّارة.
        const wl = at(2000), wh = at(4500);
        let pk = -Infinity, pi = wl;
        for (let i = wl; i <= wh; i++) if (db[i] > pk) { pk = db[i]; pi = i; }
        const k1 = Math.max(2, Math.round(150 / binHz)), k2 = Math.max(k1 + 1, Math.round(400 / binHz));
        let side = -Infinity;
        for (let d = k1; d <= k2; d++) {
            if (pi - d >= 0) side = Math.max(side, db[pi - d]);
            if (pi + d < len) side = Math.max(side, db[pi + d]);
        }
        const hit = pk > -60 && pk - side > 18;
        st.wRun = hit ? (st.wRun || 0) + 1 : 0;
        let whistle = false;
        if (st.wRun === 2 && (st.t || 0) - (st.lastW == null ? -1e9 : st.lastW) > 1.2) { whistle = true; st.lastW = st.t || 0; }
        return { voice, whistle };
    }

    // ── الحالة كلّ ثانية ──
    function runsOf(st) {
        const out = [];
        for (let i = 0; i < st.length; i++) {
            const last = out[out.length - 1];
            if (last && last.k === st[i]) last.len++;
            else out.push({ k: st[i], s: i, len: 1 });
        }
        return out;
    }

    // ms: شدّة الحركة لكلّ ثانية (null = لا إطار صالح) ← 'a' نشاط، 'i' انتظار، 'x' غير محسوب
    function classify(ms, active) {
        const n = ms.length, st = new Array(n);
        let prev = 'i';
        for (let i = 0; i < n; i++) {
            if (ms[i] == null) { st[i] = 'x'; continue; }
            let s = 0, c = 0;
            for (let j = Math.max(0, i - SMOOTH + 1); j <= i; j++) if (ms[j] != null) { s += ms[j]; c++; }
            const v = s / c;
            st[i] = (prev === 'a' ? v >= active * 0.6 : v >= active) ? 'a' : 'i';
            prev = st[i];
        }
        // مقطعٌ قصيرٌ بين مقطعين من حالةٍ أخرى يُضمّ إليهما (ارتجافة لا تغيّرٌ حقيقيّ)
        for (let pass = 0; pass < 2; pass++) {
            const r = runsOf(st).filter(x => x.k !== 'x');
            for (let k = 0; k < r.length; k++) {
                const cur = r[k];
                if (cur.len >= MIN_RUN) continue;
                const a = r[k - 1], b = r[k + 1];
                const to = a && b ? (a.k === b.k ? a.k : null) : (a || b ? (a || b).k : null);
                if (to && to !== cur.k) for (let i = cur.s; i < cur.s + cur.len; i++) if (st[i] !== 'x') st[i] = to;
            }
        }
        return st;
    }

    // ── الملخّص ──
    // rec = { secs: [{m, v, w}], grid: [...], sens }
    function summarize(rec) {
        const sens = SENS[rec && rec.sens] || SENS.medium;
        const secs = (rec && rec.secs) || [];
        const st = classify(secs.map(s => (s && s.m != null ? s.m : null)), sens.active);
        let a = 0, i = 0, x = 0, talk = 0, explain = 0;
        st.forEach((k, t) => {
            if (k === 'a') a++; else if (k === 'i') i++; else x++;
            if (secs[t] && secs[t].v) { talk++; if (k === 'i') explain++; }
        });
        const observed = a + i;

        // المقاطع بلا «غير المحسوب»: الانتظار بين نشاطين انتقالٌ، وأطوله يُذكر
        const compact = st.filter(k => k !== 'x');
        const runs = runsOf(compact);
        const internal = runs.filter((r, k) => r.k === 'i' && k > 0 && k < runs.length - 1 && r.len >= STOP_MIN);
        const longestIdle = internal.reduce((m, r) => Math.max(m, r.len), 0);
        const avgTransition = internal.length ? Math.round(internal.reduce((s, r) => s + r.len, 0) / internal.length) : 0;

        // الصفّارة وانتقالاتٌ تصحبها (±٨ ثوانٍ من بدء الانتظار أو نهايته)
        const whistleAt = [];
        secs.forEach((s, t) => { if (s && s.w) whistleAt.push(t); });
        const realIndex = [];                    // موضع كلّ ثانيةٍ مضغوطةٍ في الزمن الحقيقيّ
        st.forEach((k, t) => { if (k !== 'x') realIndex.push(t); });
        const near = t => whistleAt.some(w => Math.abs(w - t) <= 8);
        const cued = internal.filter(r => near(realIndex[r.s]) || near(realIndex[r.s + r.len - 1])).length;

        // بنية الحصة: أوّل ٢٠٪ إحماء، وآخر ١٥٪ ختام
        const n = compact.length;
        const pct = arr => (arr.length ? Math.round(100 * arr.filter(k => k === 'a').length / arr.length) : 0);
        const wN = Math.round(n * 0.2), cN = Math.round(n * 0.15);
        const phases = { warm: pct(compact.slice(0, wN)), main: pct(compact.slice(wN, n - cN)), close: pct(compact.slice(n - cN)) };

        // استثمار المساحة: الخلايا التي بلغت حركتها ١٥٪ من أكثرها، وحصّة أكثر الخُمس حركةً
        const grid = Array.from((rec && rec.grid) || []);
        const max = grid.reduce((m, v) => Math.max(m, v), 0);
        const total = grid.reduce((s, v) => s + v, 0);
        const sorted = grid.slice().sort((p, q) => q - p);
        const top = sorted.slice(0, Math.max(1, Math.round(grid.length * 0.2))).reduce((s, v) => s + v, 0);
        const space = {
            coverage: max ? Math.round(100 * grid.filter(v => v >= max * 0.15).length / grid.length) : 0,
            concentration: total ? Math.round(100 * top / total) : 0
        };

        // الخطّ الزمنيّ: مقاطع عشر ثوانٍ بالحالة الغالبة وشدّةٍ نسبيّة
        const timeline = [];
        for (let t = 0; t < st.length; t += 10) {
            const part = st.slice(t, t + 10), ms = secs.slice(t, t + 10).map(s => (s && s.m != null ? s.m : null)).filter(v => v != null);
            const cnt = { a: 0, i: 0, x: 0 };
            part.forEach(k => { cnt[k]++; });
            const k = cnt.x > cnt.a + cnt.i ? 'x' : (cnt.a >= cnt.i ? 'a' : 'i');
            const m = ms.length ? ms.reduce((s, v) => s + v, 0) / ms.length : 0;
            timeline.push({ k, v: Math.min(1, m / (sens.active * 3)) });
        }

        return {
            seconds: st.length, observed, activeSec: a, idleSec: i, excludedSec: x,
            activePct: observed ? Math.round(100 * a / observed) : 0,
            waits: internal.length, longestIdle, avgTransition,
            talkSec: talk, explainSec: explain, explainPct: observed ? Math.round(100 * explain / observed) : 0,
            whistles: whistleAt.length, cued,
            phases, structure: {
                warm: phases.warm >= 40,
                main: phases.main >= 50,
                close: phases.close <= phases.main - 15
            },
            space, timeline, states: st
        };
    }

    // ── الصياغة ──
    const g = (t, female) => String(t || '').replace(/\{([^|{}]*)\|([^|{}]*)\}/g, (m, a, b) => (female ? b : a));
    // العدد بين قوسين (يستقيم في النصّ العربيّ) بتمييزه الصحيح
    function count(n, one, two, few, many) {
        if (n === 1) return one;
        if (n === 2) return two;
        return '(' + n + ') ' + (n >= 3 && n <= 10 ? few : many);
    }
    function dur(sec) {
        sec = Math.max(0, Math.round(sec || 0));
        if (sec < 60) return count(sec, 'ثانية واحدة', 'ثانيتان', 'ثوانٍ', 'ثانية');
        const m = Math.round(sec / 60);
        return count(m, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة');
    }
    const times = n => count(n, 'مرّة واحدة', 'مرّتين', 'مرّات', 'مرّة');
    const list = arr => (arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join('، و') + '، و' + arr[arr.length - 1]);
    const clamp = s => Math.max(1, Math.min(5, s));

    // M من summarize، counts {وسم: عدد}، ctx {female, pupil(text)}
    function suggest(M, counts, ctx) {
        ctx = ctx || {};
        const F = !!ctx.female, P = typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        const c = k => (counts && counts[k]) || 0;
        const out = [];
        const add = (id, score, basis, evidence) => out.push({ id, score: clamp(score), basis, evidence: P(g(evidence, F)) });
        const m = M || {};

        // ٧ فاعلية الإدارة الصفّيّة — الكاميرا: زمن النشاط والانتظار والانتقالات
        if ((m.observed || 0) >= MIN_OBSERVE) {
            const p = m.activePct;
            let s = p >= 60 ? 1 : p >= 50 ? 2 : p >= 40 ? 3 : p >= 30 ? 4 : 5;
            if (m.longestIdle >= 300) s++;
            else if (m.waits >= 2 && m.avgTransition <= 45 && m.longestIdle < 180) s--;
            let e = 'بلغ زمن النشاط الحركي للطلبة (' + p + '%) من زمن الرصد، أي ' + dur(m.activeSec) + ' من ' + dur(m.observed);
            e += m.waits ? '، وتخلّلته ' + count(m.waits, 'فترة انتظار واحدة', 'فترتا انتظار', 'فترات انتظار', 'فترة انتظار') + ' أطولها ' + dur(m.longestIdle)
                         : '، بلا فترات انتظار طويلة بين الأنشطة';
            if (m.cued) e += '، ونُظّم ' + count(m.cued, 'انتقالٌ واحد', 'انتقالان', 'انتقالات', 'انتقالاً') + ' بالصفّارة';
            add(7, s, 'camera', e + '.');
        }

        // ٦ تخطيط المنهاج — بنية الحصة المرئيّة (التخطيط المكتوب يقدّره المشرف، فلا «متميز» من الكاميرا)
        if ((m.observed || 0) >= MIN_STRUCTURE && m.structure) {
            const ok = ['warm', 'main', 'close'].filter(k => m.structure[k]).length;
            const s = { 3: 2, 2: 3, 1: 4, 0: 5 }[ok];
            const parts = [
                m.structure.warm ? 'بدأت الحصة بإحماءٍ نشط (' + m.phases.warm + '%)' : 'كان الإحماء في أوّل الحصة محدوداً (' + m.phases.warm + '%)',
                m.structure.main ? 'وجاء الجزء الرئيس أكثرها نشاطاً (' + m.phases.main + '%)' : 'وقلّ النشاط في الجزء الرئيس (' + m.phases.main + '%)',
                m.structure.close ? 'وهدأ الختام للتهدئة والمراجعة' : 'ولم يظهر ختامٌ للتهدئة والمراجعة'
            ];
            add(6, s, 'camera', parts.join('، ') + '.');
        }

        // ٨ استراتيجيّات التدريس — تسجيلات المشرف، والشرح الطويل (من الصوت) ينقصها
        const strat = ['demo', 'groups', 'games', 'stations', 'levels'].filter(k => c(k) > 0);
        if (strat.length) {
            let s = strat.length >= 4 ? 1 : strat.length === 3 ? 2 : strat.length === 2 ? 3 : 4;
            let e = '{نوّع المعلم|نوّعت المعلمة} بين: ' + list(strat.map(k => TAG[k].label));
            const long = (m.observed || 0) >= MIN_OBSERVE && m.explainPct > 40;
            if (long) { s++; e += '، مع شرحٍ طويل استغرق (' + m.explainPct + '%) من زمن الرصد'; }
            add(8, s, long ? 'both' : 'taps', e + '.');
        }

        // ١٠ أساليب التقويم
        const fb = ['fbInd', 'fbGrp', 'ask', 'peer'];
        const fbTotal = fb.reduce((s, k) => s + c(k), 0), kinds = fb.filter(k => c(k) > 0).length;
        if (fbTotal) {
            const s = fbTotal >= 8 && kinds >= 3 ? 1 : fbTotal >= 6 && kinds >= 2 ? 2 : fbTotal >= 3 ? 3 : 4;
            const bits = [];
            if (c('fbInd')) bits.push('تغذية راجعة فردية ' + times(c('fbInd')));
            if (c('fbGrp')) bits.push('جماعية ' + times(c('fbGrp')));
            if (c('ask')) bits.push('أسئلة تقويمية ' + times(c('ask')));
            if (c('peer')) bits.push('تقويماً ذاتياً أو بين الأقران ' + times(c('peer')));
            add(10, s, 'taps', '{وظّف المعلم|وظّفت المعلمة}: ' + list(bits) + '.');
        }

        // ٣ مهارات التعلّم
        const sk = ['lead', 'team', 'tactic'].filter(k => c(k) > 0);
        if (sk.length) add(3, { 3: 1, 2: 2, 1: 3 }[sk.length], 'taps', 'ظهرت في الحصة مواقف: ' + list(sk.map(k => TAG[k].label)) + '.');

        // ٤ القيم والروح الرياضيّة
        if (c('praise') || c('misbehave')) {
            const p = c('praise'), n = c('misbehave');
            const s = n >= 2 ? (p ? 4 : 5) : n === 1 ? (p ? 3 : 4) : (p >= 3 ? 1 : 2);
            const negTxt = 'رُصد سلوكٌ سلبيّ لم يُعالَج ' + times(n);
            add(4, s, 'taps', (p ? '{عزّز المعلم|عزّزت المعلمة} الروح الرياضية ' + times(p) + (n ? '، و' + negTxt : '') : negTxt) + '.');
        }

        // ٢ الفروق الفرديّة والدمج
        const inc = c('include') + c('levels');
        if (inc) add(2, inc >= 2 ? 1 : 2, 'taps', '{راعى المعلم|راعت المعلمة} الفروق الفردية بين الطلبة ' + times(inc) + ' (تكليفٌ حسب المستوى أو دمجٌ لذوي الإعاقة والاحتياجات).');

        // ٥ الأمن والسلامة
        if (c('safe') || c('hazard')) {
            const p = c('safe'), n = c('hazard');
            const s = n >= 2 ? (p ? 4 : 5) : n === 1 ? (p ? 3 : 4) : 2;
            const bits = [];
            if (p) bits.push('هُيّئ المكان والأدوات تهيئةً آمنة');
            if (n) bits.push('رُصد ' + count(n, 'موقفٌ خطر', 'موقفان خطران', 'مواقف خطرة', 'موقفاً خطراً'));
            if (m.space && m.space.concentration >= 60 && (m.observed || 0) >= MIN_OBSERVE) bits.push('وتركّزت الحركة في جزءٍ محدود من المساحة');
            add(5, s, 'taps', bits.join('، ') + '.');
        }

        // ٩ المصادر والموارد
        if (c('tools') || c('noTools')) {
            const p = c('tools'), n = c('noTools');
            const s = n >= 2 ? 4 : n === 1 ? (p ? 3 : 4) : 2;
            const shortTxt = 'رُصد نقصٌ في الأدوات وانتظارٌ للدور ' + times(n);
            add(9, s, 'taps', (p ? 'وُظّفت أدواتٌ كافية ومتنوعة' + (n ? '، و' + shortTxt : '') : shortTxt) + '.');
        }

        return out.sort((a, b) => a.id - b.id);
    }

    // ما لم يُقترح وسببه — للعرض تحت الاقتراحات
    function unsupported(sugg, M) {
        const have = new Set((sugg || []).map(s => s.id));
        const out = [];
        for (let id = 1; id <= 13; id++) {
            if (have.has(id)) continue;
            let why = NOT_SEEN[id];
            if (!why && id === 7) why = 'تحتاج عشر دقائق رصدٍ على الأقلّ';
            if (!why && id === 6) why = 'تحتاج عشرين دقيقة رصدٍ على الأقلّ لتظهر بنية الحصة';
            if (!why) why = 'لا شاهد مسجَّل — يقدّرها المشرف';
            out.push({ id, why });
        }
        return out;
    }

    // سطرٌ واحدٌ لـ«الملاحظات العامة» (يُرفع إلى البوّابة، فيبقى قصيراً)
    function summaryText(M, ctx) {
        const P = ctx && typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        if (!M || !M.observed) return '';
        const bits = ['بلغ زمن النشاط الحركي للطلبة (' + M.activePct + '%)'];
        if (M.waits) bits.push('وتخلّلتها ' + count(M.waits, 'فترة انتظار واحدة', 'فترتا انتظار', 'فترات انتظار', 'فترة انتظار') + ' أطولها ' + dur(M.longestIdle));
        if (M.explainSec >= 60) bits.push('واستغرق الشرح والتوجيه ' + dur(M.explainSec));
        if (M.whistles) bits.push('واستُعملت الصفّارة ' + times(M.whistles));
        return P('رُصدت الحصة بعين المشرف ' + dur(M.observed) + ': ' + bits.join('، ') + '.');
    }

    // خريطة المساحة رقماً (٠–٩) لكلّ خلية — تُحفظ مع التقرير بلا صورة
    function heatDigits(grid) {
        const arr = Array.from(grid || []);
        const max = arr.reduce((m, v) => Math.max(m, v), 0);
        return arr.map(v => (max ? Math.round(9 * v / max) : 0));
    }

    const api = {
        LEVELS, SENS, SHAKE, GRID_W, GRID_H, MIN_OBSERVE, MIN_STRUCTURE, TAGS, GROUPS, TAG, NOT_SEEN,
        toGray, frameDiff, audioFrame, classify, runsOf, summarize, suggest, unsupported, summaryText,
        heatDigits, dur, count, g
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfEye = api;
})(typeof window !== 'undefined' ? window : this);
