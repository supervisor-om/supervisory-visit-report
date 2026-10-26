// =========================================================================
// عين المشرف — المحرّك (منذ 2026-10-25، والمرحلة الأولى 2026-10-26)
//
// دالّاتٌ نقيّةٌ بلا DOM (تُصدَّر لـnode أيضاً). الواجهة (js/eye.js) تلتقط من الكاميرا
// إطاراً كلّ ربع ثانيةٍ بحجم ٩٦ بكسلاً، ومن الميكروفون طيفاً كلّ عُشر ثانية، وتمرّرهما هنا:
//
//  • الحركة: فرق الإطار عن سابقه بعد طرح تغيّر الإضاءة العامّ — **داخل منطقة الصفّ** إن رسمها
//    المشرف (`roiMask`)، فلا يُحسب صفٌّ آخر ولا شجرٌ ولا مارّون. أكثر من ٤٥٪ يتغيّر معاً = الكاميرا تحرّكت.
//  • الطلبة (المرحلة الأولى): نموذج كشف أشخاصٍ داخل الجهاز (vendor/human) يعطي صناديق، و`trackStep`
//    يتابعها بين اللقطات، و`peopleSnapshot` يعدّ في كلّ لحظة: داخل المنطقة، ومن يتحرّك منهم (انتقالٌ
//    أو حركةٌ في مكانه)، ومن خارجها، ومن يقف متقارباً ينتظر دوره. «زمن حركة الطالب» منها لا من البكسلات.
//  • الحالة كلّ ثانية: «نشاط» أو «انتظار» بعتبةٍ مع تخلّفٍ وتنعيمٍ خمس ثوانٍ، والمقطع الأقصر من ١٢ ثانية
//    يُضمّ إلى ما حوله.
//  • سياق الحصة بلمسة المشرف (`CONTEXTS`: شرح/تنظيم/تطبيق/لعب — على طريقة SOFIT): يقسم الزمن فيُقاس
//    نشاط الطلبة في التطبيق واللعب وحدهما، وتُبنى «بنية الحصة» منه لا من نسبٍ ثابتة.
//  • الصوت: كلامٌ فوق أرضيّة الضجيج، وصفّارةٌ = نغمةٌ صافية. و«ميكروفون المعلّم» (يُعلَّق على ياقته) يجعل
//    الكلام كلامه: أثناء النشاط توجيهٌ حيّ، وفي التوقّف شرح.
//  • ما لا تراه الكاميرا يسجّله المشرف بلمسة (TAGS).
//
// suggest() يقترح درجةً **لبندٍ عليه شاهدٌ فقط** (السلّم مقلوب: ١ متميّز … ٥ تدخّل سريع)، ومع كلّ اقتراحٍ
// جملة شاهدٍ بالأرقام ودرجة ثقة. البنود ١ و١١–١٣ لا تُقترح. و`agreement` يقيس اتّفاق العين مع المشرف
// عبر التقارير المحفوظة — منه تُضبط العتبات. لا يُحفظ إطارٌ ولا صوت: أرقامٌ في الذاكرة ثمّ في #eyeData.
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

    // الطلبة — وحدة المسافة «طول الجسم» فلا تتأثّر ببعد الكاميرا
    const PERSON_MIN_SCORE = 0.3; // أقلّ منه يكثر فيه الخطأ (لافتاتٌ ومخاريط) — قيس على مشهد مشاة
    const MATCH_GATE = 0.9;       // أبعد من ٠٫٩ طول جسمٍ بين لقطتين ← شخصٌ آخر
    const TRACK_TTL = 2.5;        // ثوانٍ بلا ظهورٍ ثمّ يُنسى
    const MOVE_SPEED = 0.25;      // ربع طول الجسم في الثانية ← يتحرّك (مشيٌ بطيء فما فوق)
    const BOX_ACT = 0.12;         // نسبة ما تغيّر داخل صندوقه ← يتحرّك في مكانه (تمرين، تمرير)
    const QUEUE_DIST = 1.6;       // واقفون متقاربون (طول جسمٍ ونصف) ثلاثةٌ فأكثر ← انتظار دور

    // ما يسجّله المشرف بلمسة — item: البند الذي يشهد له، neg: شاهدٌ سلبيّ، qty: عددُ أشخاصٍ لا مرّات
    const TAGS = [
        { k: 'demo',      item: 8,  label: 'عرض نموذجي للمهارة' },
        { k: 'groups',    item: 8,  label: 'مجموعات أو تعلّم تعاوني' },
        { k: 'games',     item: 8,  label: 'ألعاب ومنافسات' },
        { k: 'stations',  item: 8,  label: 'محطات أو تعلّم ذاتي' },
        { k: 'levels',    item: 8,  label: 'تكليف حسب المستوى' },
        { k: 'include',   item: 2,  label: 'مراعاة الفروق والدمج' },
        { k: 'out',       item: 2,  label: 'طلبة خارج النشاط (عددهم)', neg: true, qty: true },
        { k: 'fbInd',     item: 10, label: 'تغذية راجعة فردية' },
        { k: 'fbGrp',     item: 10, label: 'تغذية راجعة جماعية' },
        { k: 'ask',       item: 10, label: 'سؤال تقويمي' },
        { k: 'peer',      item: 10, label: 'تقويم ذاتي أو أقران' },
        { k: 'fbMiss',    item: 10, label: 'خطأ في الأداء لم يُصحَّح', neg: true },
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
        { title: 'التدريس', keys: ['demo', 'groups', 'games', 'stations', 'levels', 'include', 'out'] },
        { title: 'التقويم', keys: ['fbInd', 'fbGrp', 'ask', 'peer', 'fbMiss'] },
        { title: 'مهارات التعلم والقيم', keys: ['lead', 'team', 'tactic', 'praise', 'misbehave'] },
        { title: 'السلامة والموارد', keys: ['safe', 'hazard', 'tools', 'noTools'] }
    ];
    const TAG = {};
    TAGS.forEach(t => { TAG[t.k] = t; });

    // سياق الحصة — يلمسه المشرف عند تغيّر المرحلة (حرفٌ واحدٌ للحفظ المضغوط)
    const CONTEXTS = [
        { k: 'explain',  c: 'e', label: 'شرح' },
        { k: 'organize', c: 'o', label: 'تنظيم' },
        { k: 'practice', c: 'p', label: 'تطبيق' },
        { k: 'play',     c: 'g', label: 'لعب' }
    ];

    // البنود التي لا تُقترح، وسببها
    const NOT_SEEN = {
        1: 'تحصيل الطلبة يُقدَّر من أدائهم للمهارة ونتاجهم، لا من الحركة وحدها',
        11: 'التقويم الذاتي والتطوير المهني لا يظهران في حصة واحدة',
        12: 'الالتزام بالأخلاقيات واللوائح يُقدَّر من السجلات والمتابعة',
        13: 'المبادرات والأنشطة في المجتمع المدرسي خارج الحصة'
    };

    // ── منطقة الصفّ ──
    // poly: نقاطٌ [x, y] نسبةً إلى الإطار (٠–١)
    function inPoly(x, y, poly) {
        if (!poly || poly.length < 3) return true;
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) inside = !inside;
        }
        return inside;
    }
    function roiMask(poly, w, h) {
        if (!poly || poly.length < 3) return null;
        const m = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inPoly((x + 0.5) / w, (y + 0.5) / h, poly) ? 1 : 0;
        return m;
    }
    function roiCells(poly) {
        const out = [];
        for (let gy = 0; gy < GRID_H; gy++) for (let gx = 0; gx < GRID_W; gx++) out.push(inPoly((gx + 0.5) / GRID_W, (gy + 0.5) / GRID_H, poly) ? 1 : 0);
        return out;
    }
    function polyBox(poly, pad) {
        if (!poly || poly.length < 3) return { x: 0, y: 0, w: 1, h: 1 };
        pad = pad || 0;
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        poly.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(1, x1 + pad); y1 = Math.min(1, y1 + pad);
        return { x: x0, y: y0, w: Math.max(0.01, x1 - x0), h: Math.max(0.01, y1 - y0) };
    }

    // ── الصورة ──
    function toGray(rgba, n, out) {
        const g = out || new Uint8Array(n);
        for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
        return g;
    }

    // فرق إطارين: m نسبة البكسلات المتغيّرة، وshake إن تغيّرت الصورة كلّها تقريباً.
    // grid (Uint32Array بطول GRID_W×GRID_H) يجمع الحركة لخريطة المساحة — للإطار الصالح وحده.
    // mask (من roiMask): يُحسب داخل منطقة الصفّ وحدها، والنسبة من مساحتها.
    function frameDiff(prev, cur, w, h, thr, grid, mask) {
        const n = w * h;
        let sp = 0, sc = 0, cnt = 0;
        for (let i = 0; i < n; i++) { if (mask && !mask[i]) continue; sp += prev[i]; sc += cur[i]; cnt++; }
        if (!cnt) return { m: 0, shake: false };
        const shift = (sc - sp) / cnt;        // تغيّر الإضاءة العامّ يُطرح قبل المقارنة
        const cells = new Uint32Array(GRID_W * GRID_H);
        let changed = 0;
        for (let y = 0; y < h; y++) {
            const gy = Math.min(GRID_H - 1, Math.floor(y * GRID_H / h));
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (mask && !mask[i]) continue;
                if (Math.abs(cur[i] - prev[i] - shift) > thr) {
                    changed++;
                    cells[gy * GRID_W + Math.min(GRID_W - 1, Math.floor(x * GRID_W / w))]++;
                }
            }
        }
        const m = changed / cnt;
        const shake = m > SHAKE;
        if (grid && !shake) for (let i = 0; i < cells.length; i++) grid[i] += cells[i];
        return { m, shake };
    }

    // تغيّر الإضاءة العامّ بين صورتين رماديّتين بالحجم نفسه
    function grayShift(prev, cur) {
        let s = 0;
        for (let i = 0; i < cur.length; i++) s += cur[i] - prev[i];
        return cur.length ? s / cur.length : 0;
    }
    // نسبة ما تغيّر داخل صندوقٍ (نسبيّ ٠–١) — حركة الطالب في مكانه
    function boxMotion(prev, cur, w, h, box, thr, shift) {
        if (!prev || !cur || prev.length !== cur.length) return 0;
        const x0 = Math.max(0, Math.floor(box.x * w)), y0 = Math.max(0, Math.floor(box.y * h));
        const x1 = Math.min(w, Math.ceil((box.x + box.w) * w)), y1 = Math.min(h, Math.ceil((box.y + box.h) * h));
        let n = 0, c = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = y * w + x;
            n++;
            if (Math.abs(cur[i] - prev[i] - (shift || 0)) > thr) c++;
        }
        return n ? c / n : 0;
    }

    // ── تتبّع الطلبة ──
    // det: {x, y, w, h, score, act} نسبةً إلى الإطار (x,y الزاوية العليا). ar = عرض الإطار ÷ ارتفاعه.
    // الموضع بوحدة «ارتفاع الإطار» في المحورين (x×ar) فتصحّ المسافات، والقدم (أسفل الصندوق) هي موضعه في الملعب.
    function newTracker() { return { next: 1, tracks: [] }; }
    function trackStep(T, dets, t, ar, ttl) {
        ar = ar || 1;
        ttl = ttl || TRACK_TTL;
        const pts = (dets || []).filter(d => d && (d.score == null || d.score >= PERSON_MIN_SCORE)).map(d => ({
            fx: (d.x + d.w / 2) * ar, fy: d.y + d.h, cx: (d.x + d.w / 2) * ar, cy: d.y + d.h / 2, h: d.h,
            nx: d.x + d.w / 2, ny: d.y + d.h, act: d.act || 0
        }));
        T.tracks = T.tracks.filter(tr => t - tr.last <= ttl);
        const pairs = [];
        T.tracks.forEach((tr, a) => {
            const p = tr.hist[tr.hist.length - 1];
            pts.forEach((d, b) => {
                const dist = Math.hypot(d.fx - p.fx, d.fy - p.fy) / Math.max(1e-6, Math.max(d.h, p.h));
                if (dist < MATCH_GATE) pairs.push({ a, b, dist });
            });
        });
        pairs.sort((p, q) => p.dist - q.dist);
        const usedA = new Set(), usedB = new Set();
        pairs.forEach(p => {
            if (usedA.has(p.a) || usedB.has(p.b)) return;
            usedA.add(p.a); usedB.add(p.b);
            const tr = T.tracks[p.a];
            tr.hist.push(Object.assign({ t }, pts[p.b]));
            while (tr.hist.length > 2 && t - tr.hist[0].t > 6) tr.hist.shift();
            tr.last = t;
        });
        pts.forEach((d, b) => { if (!usedB.has(b)) T.tracks.push({ id: T.next++, last: t, hist: [Object.assign({ t }, d)] }); });
        return T;
    }
    // سرعة الطالب (أطوال جسمٍ في الثانية) على آخر ثانيتين، وحركته في مكانه
    function trackMotion(tr) {
        const h = tr.hist, last = h[h.length - 1];
        let ref = null;
        for (let i = h.length - 2; i >= 0; i--) { if (last.t - h[i].t >= 0.8) { ref = h[i]; if (last.t - h[i].t >= 2) break; } }
        const speed = ref ? Math.hypot(last.cx - ref.cx, last.cy - ref.cy) / Math.max(1e-6, last.h) / Math.max(0.5, last.t - ref.t) : 0;
        return { speed, act: last.act || 0, moving: speed >= MOVE_SPEED || (last.act || 0) >= BOX_ACT };
    }
    // لقطة اللحظة: n داخل المنطقة، mv يتحرّك منهم، o خارجها، q واقفون متقاربون (انتظار دور)
    function peopleSnapshot(T, t, poly) {
        const live = T.tracks.filter(tr => t - tr.last <= 1.2);
        const ppl = live.map(tr => {
            const last = tr.hist[tr.hist.length - 1];
            return Object.assign({ id: tr.id, x: last.nx, y: last.ny, fx: last.fx, fy: last.fy, h: last.h, inside: inPoly(last.nx, last.ny, poly) }, trackMotion(tr));
        });
        const ins = ppl.filter(p => p.inside);
        const still = ins.filter(p => !p.moving);
        let q = 0;
        still.forEach(p => {
            const near = still.filter(o => o !== p && Math.hypot(o.fx - p.fx, o.fy - p.fy) <= QUEUE_DIST * Math.max(p.h, o.h)).length;
            if (near >= 2) q++;
        });
        return {
            n: ins.length, mv: ins.length - still.length, o: ppl.length - ins.length, q,
            r: !!(poly && poly.length >= 3),
            dots: ppl.map(p => ({ x: p.x, y: p.y, mv: p.moving, in: p.inside }))
        };
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

    // ── سياق الحصة ──
    // events: [{t, k}] ← سياق كلّ ثانية (null قبل أوّل لمسة)
    function ctxSeries(events, n) {
        const out = new Array(n).fill(null);
        const ev = (events || []).filter(e => e && e.t != null && CONTEXTS.some(c => c.k === e.k)).slice().sort((a, b) => a.t - b.t);
        let j = 0, cur = null;
        for (let t = 0; t < n; t++) {
            while (j < ev.length && ev[j].t <= t) { cur = ev[j].k; j++; }
            out[t] = cur;
        }
        return out;
    }
    function ctxStats(series) {
        const sec = { explain: 0, organize: 0, practice: 0, play: 0 };
        let covered = 0;
        series.forEach(k => { if (k) { sec[k]++; covered++; } });
        const pct = {};
        Object.keys(sec).forEach(k => { pct[k] = covered ? Math.round(100 * sec[k] / covered) : 0; });
        return { covered, sec, pct };
    }

    // ── الطلبة عبر الحصة ──
    const median = arr => {
        if (!arr.length) return 0;
        const a = arr.slice().sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)];
    };
    function summarizePeople(secs, st, ctx) {
        const rows = [];
        secs.forEach((s, t) => { if (s && s.p) rows.push({ t, p: s.p }); });
        if (!rows.length) return null;
        const share = rs => {
            const tot = rs.reduce((a, r) => a + r.p.n, 0);
            return tot ? Math.round(100 * rs.reduce((a, r) => a + r.p.mv, 0) / tot) : null;
        };
        const isPlay = t => ctx && (ctx[t] === 'practice' || ctx[t] === 'play');
        const playRows = rows.filter(r => isPlay(r.t));
        const usePlay = playRows.length >= 60;
        const activeRows = usePlay ? playRows : rows.filter(r => st[r.t] === 'a');
        const qTot = activeRows.reduce((a, r) => a + r.p.n, 0);
        const roi = rows.some(r => r.p.r);
        return {
            detSecs: rows.length,
            pupils: median(rows.map(r => r.p.n + r.p.o)),
            inside: median(rows.map(r => r.p.n)),
            movingAll: share(rows),
            movingPlay: usePlay ? share(playRows) : null,
            queuePct: qTot ? Math.round(100 * activeRows.reduce((a, r) => a + r.p.q, 0) / qTot) : 0,
            outsideMed: roi ? median(rows.map(r => r.p.o)) : 0,
            roi
        };
    }

    // ── الملخّص ──
    // rec = { secs: [{m, v, w, p}], grid, sens, cells (منطقة الصفّ في الشبكة), ctx: [{t,k}], mic: 'teacher'|'device' }
    function summarize(rec) {
        const sens = SENS[rec && rec.sens] || SENS.medium;
        const secs = (rec && rec.secs) || [];
        const st = classify(secs.map(s => (s && s.m != null ? s.m : null)), sens.active);
        const ctx = ctxSeries(rec && rec.ctx, st.length);
        let a = 0, i = 0, x = 0, talk = 0, explain = 0, heard = 0;
        st.forEach((k, t) => {
            if (k === 'a') a++; else if (k === 'i') i++; else x++;
            if (secs[t] && secs[t].v != null) heard++;
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

        // بنية الحصة: أوّل ٢٠٪ إحماء، وآخر ١٥٪ ختام (حين لا سياق ملموس)
        const n = compact.length;
        const pct = arr => (arr.length ? Math.round(100 * arr.filter(k => k === 'a').length / arr.length) : 0);
        const wN = Math.round(n * 0.2), cN = Math.round(n * 0.15);
        const phases = { warm: pct(compact.slice(0, wN)), main: pct(compact.slice(wN, n - cN)), close: pct(compact.slice(n - cN)) };

        // استثمار المساحة: داخل منطقة الصفّ وحدها إن رُسمت
        const grid = Array.from((rec && rec.grid) || []);
        const cells = rec && rec.cells && rec.cells.length === grid.length ? rec.cells : null;
        const g = cells ? grid.filter((v, k) => cells[k]) : grid;
        const max = g.reduce((m, v) => Math.max(m, v), 0);
        const total = g.reduce((s, v) => s + v, 0);
        const sorted = g.slice().sort((p, q) => q - p);
        const top = sorted.slice(0, Math.max(1, Math.round(g.length * 0.2))).reduce((s, v) => s + v, 0);
        const space = {
            coverage: max && g.length ? Math.round(100 * g.filter(v => v >= max * 0.15).length / g.length) : 0,
            concentration: total ? Math.round(100 * top / total) : 0
        };

        // سياق الحصة، وكلام المعلّم أثناء النشاط (تطبيقٌ ولعب إن لُمس السياق، وإلّا حالة الكاميرا)
        const C = ctxStats(ctx);
        const useCtx = C.covered >= Math.max(60, st.length * 0.5);
        let coachBase = 0, coachSec = 0;
        st.forEach((k, t) => {
            const on = useCtx ? (ctx[t] === 'practice' || ctx[t] === 'play') : k === 'a';
            if (!on || !secs[t] || secs[t].v == null) return;
            coachBase++;
            if (secs[t].v) coachSec++;
        });

        // الخطّ الزمنيّ: مقاطع عشر ثوانٍ بالحالة الغالبة وشدّةٍ نسبيّة، وسياقها الغالب
        const timeline = [];
        for (let t = 0; t < st.length; t += 10) {
            const part = st.slice(t, t + 10), ms = secs.slice(t, t + 10).map(s => (s && s.m != null ? s.m : null)).filter(v => v != null);
            const cnt = { a: 0, i: 0, x: 0 };
            part.forEach(k => { cnt[k]++; });
            const k = cnt.x > cnt.a + cnt.i ? 'x' : (cnt.a >= cnt.i ? 'a' : 'i');
            const m = ms.length ? ms.reduce((s, v) => s + v, 0) / ms.length : 0;
            const cc = {};
            ctx.slice(t, t + 10).forEach(c => { if (c) cc[c] = (cc[c] || 0) + 1; });
            const top1 = Object.keys(cc).sort((p, q) => cc[q] - cc[p])[0];
            const ctxC = top1 ? CONTEXTS.find(c => c.k === top1).c : '-';
            timeline.push({ k, v: Math.min(1, m / (sens.active * 3)), c: ctxC });
        }

        return {
            seconds: st.length, observed, activeSec: a, idleSec: i, excludedSec: x,
            activePct: observed ? Math.round(100 * a / observed) : 0,
            waits: internal.length, longestIdle, avgTransition,
            talkSec: talk, explainSec: explain, explainPct: observed ? Math.round(100 * explain / observed) : 0,
            talkPct: heard ? Math.round(100 * talk / heard) : 0,
            coachSec, coachPct: coachBase ? Math.round(100 * coachSec / coachBase) : 0, coachBase,
            mic: rec && rec.mic === 'teacher' ? 'teacher' : 'device',
            whistles: whistleAt.length, cued,
            phases, structure: {
                warm: phases.warm >= 40,
                main: phases.main >= 50,
                close: phases.close <= phases.main - 15
            },
            ctx: { covered: C.covered, pct: C.pct, sec: C.sec },
            people: summarizePeople(secs, st, useCtx ? ctx : null),
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
    const pupilsN = n => count(n, 'طالبٌ واحد', 'طالبان', 'طلبة', 'طالباً');
    const list = arr => (arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join('، و') + '، و' + arr[arr.length - 1]);
    const clamp = s => Math.max(1, Math.min(5, s));
    const ctxText = p => 'الشرح (' + p.explain + '%)، والتنظيم (' + p.organize + '%)، والتطبيق (' + p.practice + '%)، واللعب (' + p.play + '%)';

    // درجة الثقة: من زمن الرصد ونسبة المستبعد، أو من تغطية السياق، أو من عدد اللمسات على البند
    function confidence(s, M, counts) {
        const m = M || {};
        if (s.basis === 'camera') {
            const o = m.observed || 0, bad = (m.excludedSec || 0) / Math.max(1, o + (m.excludedSec || 0));
            return o >= 1800 && bad < 0.1 ? 'high' : o >= 900 && bad < 0.25 ? 'medium' : 'low';
        }
        if (s.basis === 'ai') {
            const d = (m.people && m.people.detSecs) || 0;
            return d >= 1500 ? 'high' : d >= 900 ? 'medium' : 'low';
        }
        if (s.basis === 'ctx') {
            const cov = ((m.ctx && m.ctx.covered) || 0) / Math.max(1, m.seconds || 0);
            return cov >= 0.85 ? 'high' : cov >= 0.6 ? 'medium' : 'low';
        }
        const n = TAGS.filter(t => t.item === s.id).reduce((a, t) => a + ((counts && counts[t.k]) || 0), 0);
        return n >= 4 ? 'high' : n >= 2 ? 'medium' : 'low';
    }

    // M من summarize (أو المحفوظ منه)، counts {وسم: عدد}، ctx {female, pupil(text)}
    function suggest(M, counts, ctx) {
        ctx = ctx || {};
        const F = !!ctx.female, P = typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        const c = k => (counts && counts[k]) || 0;
        const out = [];
        const m = M || {};
        const add = (id, score, basis, evidence) => {
            const s = { id, score: clamp(score), basis, evidence: P(g(evidence, F)) };
            s.conf = confidence(s, m, counts);
            out.push(s);
        };
        const people = m.people && m.people.detSecs >= MIN_OBSERVE / 2 && m.people.movingAll != null ? m.people : null;
        const cx = m.ctx && m.ctx.covered >= Math.max(60, (m.seconds || 0) * 0.5) ? m.ctx : null;
        const teacherMic = m.mic === 'teacher' && (m.coachBase || 0) >= 300;

        // ٧ فاعلية الإدارة الصفّيّة — حركة الطلبة أنفسهم إن كُشفوا، وإلّا حركة الصورة
        if ((m.observed || 0) >= MIN_OBSERVE) {
            let s, e, basis;
            if (people) {
                const play = people.movingPlay != null;
                const p = play ? people.movingPlay : people.movingAll;
                const T = play ? [70, 55, 40, 25] : [55, 45, 35, 25];
                s = p >= T[0] ? 1 : p >= T[1] ? 2 : p >= T[2] ? 3 : p >= T[3] ? 4 : 5;
                e = 'تحرّك الطلبة (' + p + '%) من ' + (play ? 'زمن التطبيق واللعب' : 'زمن الرصد') + ' في المتوسّط، من ' + pupilsN(people.inside) + ' في الملعب';
                basis = 'ai';
            } else {
                const p = m.activePct;
                s = p >= 60 ? 1 : p >= 50 ? 2 : p >= 40 ? 3 : p >= 30 ? 4 : 5;
                e = 'بلغ زمن النشاط الحركي للطلبة (' + p + '%) من زمن الرصد، أي ' + dur(m.activeSec) + ' من ' + dur(m.observed);
                basis = 'camera';
            }
            const longOrg = cx && cx.pct.organize >= 25;
            if (m.longestIdle >= 300 || longOrg) s++;
            else if (m.waits >= 2 && m.avgTransition <= 45 && m.longestIdle < 180) s--;
            if (cx) e += '، واستغرق التنظيم (' + cx.pct.organize + '%) من زمن الحصة';
            e += m.waits ? '، وتخلّلته ' + count(m.waits, 'فترة انتظار واحدة', 'فترتا انتظار', 'فترات انتظار', 'فترة انتظار') + ' أطولها ' + dur(m.longestIdle)
                         : '، بلا فترات انتظار طويلة بين الأنشطة';
            if (m.cued) e += '، ونُظّم ' + count(m.cued, 'انتقالٌ واحد', 'انتقالان', 'انتقالات', 'انتقالاً') + ' بالصفّارة';
            add(7, s, basis, e + '.');
        }

        // ٦ تخطيط المنهاج — من سياق الحصة إن لُمس، وإلّا من بنيتها المرئيّة (والتخطيط المكتوب يقدّره المشرف)
        if (cx && cx.covered >= MIN_STRUCTURE) {
            const p = cx.pct;
            const ok = [p.practice + p.play >= 50, p.organize <= 20, p.explain <= 30];
            const s = { 3: 2, 2: 3, 1: 4, 0: 5 }[ok.filter(Boolean).length];
            const bits = ['توزّع زمن الحصة بين ' + ctxText(p)];
            if (!ok[0]) bits.push('وقلّ التطبيق واللعب عن نصف زمنها');
            if (!ok[1]) bits.push('وطال التنظيم');
            if (!ok[2]) bits.push('وطال الشرح');
            add(6, s, 'ctx', bits.join('، ') + '.');
        } else if ((m.observed || 0) >= MIN_STRUCTURE && m.structure) {
            const ok = ['warm', 'main', 'close'].filter(k => m.structure[k]).length;
            const s = { 3: 2, 2: 3, 1: 4, 0: 5 }[ok];
            const parts = [
                m.structure.warm ? 'بدأت الحصة بإحماءٍ نشط (' + m.phases.warm + '%)' : 'كان الإحماء في أوّل الحصة محدوداً (' + m.phases.warm + '%)',
                m.structure.main ? 'وجاء الجزء الرئيس أكثرها نشاطاً (' + m.phases.main + '%)' : 'وقلّ النشاط في الجزء الرئيس (' + m.phases.main + '%)',
                m.structure.close ? 'وهدأ الختام للتهدئة والمراجعة' : 'ولم يظهر ختامٌ للتهدئة والمراجعة'
            ];
            add(6, s, 'camera', parts.join('، ') + '.');
        }

        // ٨ استراتيجيّات التدريس — تسجيلات المشرف، والشرح الطويل (من السياق أو الصوت) ينقصها
        const strat = ['demo', 'groups', 'games', 'stations', 'levels'].filter(k => c(k) > 0);
        if (strat.length) {
            let s = strat.length >= 4 ? 1 : strat.length === 3 ? 2 : strat.length === 2 ? 3 : 4;
            let e = '{نوّع المعلم|نوّعت المعلمة} بين: ' + list(strat.map(k => TAG[k].label));
            if (strat.length === 1) e = '{وظّف المعلم|وظّفت المعلمة}: ' + TAG[strat[0]].label;
            const longCtx = cx && cx.pct.explain > 35;
            const longAudio = !cx && (m.observed || 0) >= MIN_OBSERVE && m.explainPct > 40;
            if (longCtx) { s++; e += '، مع شرحٍ طويل استغرق (' + cx.pct.explain + '%) من زمن الحصة'; }
            else if (longAudio) { s++; e += '، مع شرحٍ طويل استغرق (' + m.explainPct + '%) من زمن الرصد'; }
            add(8, s, longCtx || longAudio ? 'both' : 'taps', e + '.');
        }

        // ١٠ أساليب التقويم — ومعها توجيه المعلّم أثناء النشاط من ميكروفونه
        const fb = ['fbInd', 'fbGrp', 'ask', 'peer'];
        const fbTotal = fb.reduce((s, k) => s + c(k), 0), kinds = fb.filter(k => c(k) > 0).length;
        if (fbTotal || c('fbMiss')) {
            let s = !fbTotal ? 4 : fbTotal >= 8 && kinds >= 3 ? 1 : fbTotal >= 6 && kinds >= 2 ? 2 : fbTotal >= 3 ? 3 : 4;
            const bits = [];
            if (c('fbInd')) bits.push('تغذية راجعة فردية ' + times(c('fbInd')));
            if (c('fbGrp')) bits.push('جماعية ' + times(c('fbGrp')));
            if (c('ask')) bits.push('أسئلة تقويمية ' + times(c('ask')));
            if (c('peer')) bits.push('تقويماً ذاتياً أو بين الأقران ' + times(c('peer')));
            let e = fbTotal ? '{وظّف المعلم|وظّفت المعلمة}: ' + list(bits) : '';
            if (c('fbMiss')) {
                if (fbTotal && c('fbMiss') >= 2) s++;
                e += (e ? '، و' : '') + 'رُصد خطأٌ في الأداء لم يُصحَّح ' + times(c('fbMiss'));
            }
            let basis = 'taps';
            if (teacherMic && fbTotal) {
                if (m.coachPct >= 20 && fbTotal >= 3) s--;
                else if (m.coachPct < 5) s++;
                e += '، و{تحدّث|تحدّثت} إلى الطلبة أثناء النشاط (' + m.coachPct + '%) من زمنه';
                basis = 'both';
            }
            add(10, s, basis, e + '.');
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

        // ٢ الفروق الفرديّة والدمج — والطلبة خارج النشاط (عددهم من المشرف، وتقترحه الكاميرا)
        const inc = c('include') + c('levels'), outN = c('out');
        if (inc || outN) {
            let s = inc >= 2 ? 1 : 2;
            const bits = [];
            if (inc) bits.push('{راعى المعلم|راعت المعلمة} الفروق الفردية بين الطلبة ' + times(inc) + ' (تكليفٌ حسب المستوى أو دمجٌ لذوي الإعاقة والاحتياجات)');
            if (outN) {
                s = Math.max(inc ? s : 0, outN >= 3 ? 4 : 3);
                bits.push((inc ? 'و' : '') + 'ظلّ ' + pupilsN(outN) + ' خارج النشاط');
            }
            add(2, s, 'taps', bits.join('، ') + '.');
        }

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

        // ٩ المصادر والموارد — وانتظار الدور الذي تراه الكاميرا
        const queue = people && people.queuePct >= 40 ? people.queuePct : 0;
        if (c('tools') || c('noTools') || queue) {
            const p = c('tools'), n = c('noTools');
            let s = n >= 2 ? 4 : n === 1 ? (p ? 3 : 4) : 2;
            const bits = [];
            if (p) bits.push('وُظّفت أدواتٌ كافية ومتنوعة');
            if (n) bits.push((p ? 'و' : '') + 'رُصد نقصٌ في الأدوات وانتظارٌ للدور ' + times(n));
            if (queue) {
                s = Math.max(p || n ? s : 0, queue >= 55 ? 4 : 3);
                bits.push((bits.length ? 'و' : '') + 'وقف (' + queue + '%) من الطلبة ينتظرون دورهم أثناء التطبيق');
            }
            add(9, s, p || n ? (queue ? 'both' : 'taps') : 'ai', bits.join('، ') + '.');
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
            if (!why && id === 7) why = 'تحتاج عشر دقائق رصدٍ بالكاميرا على الأقلّ';
            if (!why && id === 6) why = 'تحتاج عشرين دقيقة رصدٍ على الأقلّ، أو لمس «سياق الحصة»';
            if (!why) why = 'لا شاهد مسجَّل — يقدّرها المشرف';
            out.push({ id, why });
        }
        return out;
    }

    // سطرٌ واحدٌ لـ«الملاحظات العامة» (يُرفع إلى البوّابة، فيبقى قصيراً)
    function summaryText(M, ctx) {
        const P = ctx && typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        if (!M || !(M.observed || (M.ctx && M.ctx.covered))) return '';
        const span = M.observed || M.seconds || (M.ctx && M.ctx.covered) || 0;
        const people = M.people && M.people.movingAll != null && M.people.detSecs >= 60 ? M.people : null;
        const bits = [];
        if (people) bits.push('تحرّك الطلبة (' + (people.movingPlay != null ? people.movingPlay : people.movingAll) + '%) من ' + (people.movingPlay != null ? 'زمن التطبيق واللعب' : 'زمن الرصد'));
        else if (M.observed) bits.push('بلغ زمن النشاط الحركي للطلبة (' + M.activePct + '%)');
        if (M.ctx && M.ctx.covered >= 60) bits.push((bits.length ? 'و' : '') + 'توزّع زمن الحصة بين ' + ctxText(M.ctx.pct));
        if (M.waits) bits.push('وتخلّلتها ' + count(M.waits, 'فترة انتظار واحدة', 'فترتا انتظار', 'فترات انتظار', 'فترة انتظار') + ' أطولها ' + dur(M.longestIdle));
        if (M.explainSec >= 60 && !(M.ctx && M.ctx.covered >= 60)) bits.push('واستغرق الشرح والتوجيه ' + dur(M.explainSec));
        if (M.whistles) bits.push('واستُعملت الصفّارة ' + times(M.whistles));
        if (!bits.length) return '';
        return P('رُصدت الحصة بعين المشرف ' + dur(span) + ': ' + bits.join('، ') + '.');
    }

    // خريطة المساحة رقماً (٠–٩) لكلّ خلية — تُحفظ مع التقرير بلا صورة
    function heatDigits(grid) {
        const arr = Array.from(grid || []);
        const max = arr.reduce((m, v) => Math.max(m, v), 0);
        return arr.map(v => (max ? Math.round(9 * v / max) : 0));
    }

    // اتّفاق العين مع المشرف — rows: [{sugg: [{id, score}], final: {id: score}}] من التقارير المحفوظة.
    // bias موجبٌ = المشرف اعتمد درجةً أضعف ممّا اقترحت العين (العين أكرم)، وسالبٌ = العين أشدّ.
    function agreement(rows) {
        const items = {};
        let n = 0, ex = 0, nr = 0, lessons = 0;
        (rows || []).forEach(r => {
            if (!r || !r.final || !Array.isArray(r.sugg)) return;
            let used = false;
            r.sugg.forEach(s => {
                const f = Number(r.final[s.id]);
                if (!(f >= 1 && f <= 5) || !(s.score >= 1 && s.score <= 5)) return;
                used = true;
                const it = items[s.id] || (items[s.id] = { id: s.id, n: 0, exact: 0, near: 0, diff: 0 });
                const d = f - s.score;
                it.n++; n++; it.diff += d;
                if (d === 0) { it.exact++; ex++; }
                if (Math.abs(d) <= 1) { it.near++; nr++; }
            });
            if (used) lessons++;
        });
        const pc = (a, b) => (b ? Math.round(100 * a / b) : 0);
        return {
            lessons, n, exact: pc(ex, n), near: pc(nr, n),
            items: Object.keys(items).map(Number).sort((a, b) => a - b).map(id => {
                const it = items[id];
                return { id, n: it.n, exact: pc(it.exact, it.n), near: pc(it.near, it.n), bias: it.n ? Math.round(10 * it.diff / it.n) / 10 : 0 };
            })
        };
    }

    const api = {
        LEVELS, SENS, SHAKE, GRID_W, GRID_H, MIN_OBSERVE, MIN_STRUCTURE, TAGS, GROUPS, TAG, NOT_SEEN, CONTEXTS,
        PERSON_MIN_SCORE, MOVE_SPEED, BOX_ACT,
        inPoly, roiMask, roiCells, polyBox,
        toGray, frameDiff, grayShift, boxMotion,
        newTracker, trackStep, trackMotion, peopleSnapshot,
        audioFrame, classify, runsOf, ctxSeries, ctxStats, summarizePeople, summarize,
        suggest, confidence, unsupported, summaryText, heatDigits, agreement, dur, count, g
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfEye = api;
})(typeof window !== 'undefined' ? window : this);
