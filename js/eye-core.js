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
//  • عناصر الحصة الخمسة بلمسة المشرف (`PARTS`: الإحماء، الإعداد البدني، الأنشطة التعليمية، الأنشطة التطبيقية،
//    ختام الدرس — 2026-10-26 بطلبه): زمن كلّ عنصرٍ وزمن الحركة والشرح والانتظار فيه، ومقارنته بالزمن الموصى به.
//  • عدد طلبة الحصة = **أكبر عددٍ رُصد** (طلب المشرف: الكشف ينقص أثناء الحركة فلا يُعتدّ باللحظة).
//  • التشكيلات (`formations`): قاطرات/صفوف، دوائر، مجموعات، انتشار حرّ — وكم تشكيلاً استُعمل، والقاطرة الطويلة (> ٦).
//  • الزيّ الرياضيّ (`garmentScore`): الدشداشة البيضاء = ثوبٌ أبيض طويلٌ يغطّي الساقين — تقديرٌ يصحّحه المشرف.
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
    const LINK = 1.6;             // التشكيل: طالبان أقرب من طول جسمٍ ونصف في مجموعةٍ واحدة
    const LINE_ELONG = 0.35;      // مجموعةٌ عرضها أقلّ من ثلث طولها = قاطرة أو صفّ
    const LONG_LINE = 6;          // قاطرةٌ فيها أكثر من ستّة طلبة = طويلة (طلب المشرف)

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
        { k: 'dish',      item: 5,  label: 'بغير الزي الرياضي (عددهم)', neg: true, qty: true },
        { k: 'tools',     item: 9,  label: 'أدوات كافية ومتنوعة' },
        { k: 'noTools',   item: 9,  label: 'نقص أدوات وانتظار الدور', neg: true }
    ];
    const GROUPS = [
        { title: 'التدريس', keys: ['demo', 'groups', 'games', 'stations', 'levels', 'include', 'out'] },
        { title: 'التقويم', keys: ['fbInd', 'fbGrp', 'ask', 'peer', 'fbMiss'] },
        { title: 'مهارات التعلم والقيم', keys: ['lead', 'team', 'tactic', 'praise', 'misbehave'] },
        { title: 'السلامة والموارد', keys: ['safe', 'hazard', 'dish', 'tools', 'noTools'] }
    ];
    const TAG = {};
    TAGS.forEach(t => { TAG[t.k] = t; });

    // عناصر الحصة الخمسة — يلمسها المشرف حين يبدأ كلٌّ منها (حرفٌ واحدٌ للحفظ المضغوط).
    // min: الزمن الموصى به بالدقائق لحصّة ٤٠ دقيقة — **تقديرٌ أوّليّ** يعدّله المشرف من الشاشة (وفق دليل المعلّم)،
    // ويُقاس بنسبته إلى زمن الحصة المرصود. act: أدنى نشاطٍ متوقَّع للطلبة فيه (٪)، والختام بلا حدّ (تهدئة).
    const PARTS = [
        { k: 'warm',  c: 'w', label: 'الإحماء',            short: 'إحماء',       min: 5,  act: 60 },
        { k: 'fit',   c: 'f', label: 'الإعداد البدني',      short: 'إعداد بدني',  min: 7,  act: 60 },
        { k: 'teach', c: 't', label: 'الأنشطة التعليمية',   short: 'تعليمية',     min: 12, act: 40 },
        { k: 'apply', c: 'a', label: 'الأنشطة التطبيقية',   short: 'تطبيقية',     min: 12, act: 60 },
        { k: 'close', c: 'c', label: 'ختام الدرس',          short: 'ختام',        min: 4,  act: null }
    ];
    const PART = {};
    PARTS.forEach(x => { PART[x.k] = x; });
    const CONTEXTS = PARTS;                                   // الاسم القديم (الواجهة والتقارير المحفوظة)
    const ACTIVE_PARTS = ['warm', 'fit', 'teach', 'apply'];   // عناصرُ يُنتظر فيها نشاطٌ حركيّ
    const FORMS = { L: 'قاطرات وصفوف', C: 'دائرة', G: 'مجموعات', S: 'انتشار حرّ' };

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
            nx: d.x + d.w / 2, ny: d.y + d.h, act: d.act || 0, dish: d.dish == null ? null : !!d.dish
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
            vote(tr, pts[p.b].dish);
        });
        pts.forEach((d, b) => {
            if (usedB.has(b)) return;
            const tr = { id: T.next++, last: t, hist: [Object.assign({ t }, d)], dv: 0, dy: 0 };
            vote(tr, d.dish);
            T.tracks.push(tr);
        });
        return T;
    }
    // صوت الزيّ لكلّ متتبَّع: الحكم بالأغلبيّة عبر لقطاتٍ عدّة لا بلقطةٍ واحدة
    function vote(tr, dish) {
        if (dish == null) return;
        tr.dv = (tr.dv || 0) + 1;
        if (dish) tr.dy = (tr.dy || 0) + 1;
    }
    const isDishTrack = p => (p.dv || 0) >= 2 && (p.dy || 0) / p.dv >= 0.6;
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
            return Object.assign({ id: tr.id, x: last.nx, y: last.ny, fx: last.fx, fy: last.fy, h: last.h, dv: tr.dv || 0, dy: tr.dy || 0,
                inside: inPoly(last.nx, last.ny, poly) }, trackMotion(tr));
        });
        const ins = ppl.filter(p => p.inside);
        const still = ins.filter(p => !p.moving);
        let q = 0;
        still.forEach(p => {
            const near = still.filter(o => o !== p && Math.hypot(o.fx - p.fx, o.fy - p.fy) <= QUEUE_DIST * Math.max(p.h, o.h)).length;
            if (near >= 2) q++;
        });
        const F = formations(ins);
        return {
            n: ins.length, mv: ins.length - still.length, o: ppl.length - ins.length, q,
            r: !!(poly && poly.length >= 3),
            fm: F.dom, ln: F.maxLine, d: ins.filter(isDishTrack).length,
            dots: ppl.map(p => ({ x: p.x, y: p.y, mv: p.moving, in: p.inside, dish: isDishTrack(p) }))
        };
    }

    // ── التشكيلات ──
    // ppl: [{fx, fy, h}] بوحدة ارتفاع الإطار. يُجمع الطلبة المتقاربون (أقلّ من طول جسمٍ ونصف) مجموعاتٍ، ثمّ لكلّ
    // مجموعةٍ من ثلاثةٍ فأكثر شكلُها من تحليل المكوّنات الرئيسة: ممدودةٌ = قاطرة/صفّ، وحلقةٌ مجوّفةٌ = دائرة
    // (بعد تسوية المحورين، فالدائرة المائلة بالمنظور تبقى دائرة)، وغيرها مجموعة. ومن لا يجاور أحداً منتشرٌ حرّ.
    function formations(ppl) {
        const n = (ppl || []).length;
        const out = { dom: '-', lines: [], maxLine: 0, groups: 0, circles: 0, n };
        if (!n) return out;
        const par = ppl.map((_, i) => i);
        const find = i => (par[i] === i ? i : (par[i] = find(par[i])));
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const a = ppl[i], b = ppl[j];
            if (Math.hypot(a.fx - b.fx, a.fy - b.fy) / Math.max(1e-6, Math.max(a.h, b.h)) <= LINK) par[find(i)] = find(j);
        }
        const cl = {};
        ppl.forEach((p, i) => { (cl[find(i)] = cl[find(i)] || []).push(p); });
        let inL = 0, inC = 0, inG = 0, loose = 0;
        Object.values(cl).forEach(c => {
            if (c.length < 3) { loose += c.length; return; }
            const sh = shapeOf(c);
            if (sh === 'L') { out.lines.push(c.length); inL += c.length; }
            else if (sh === 'C') { out.circles++; inC += c.length; }
            else { out.groups++; inG += c.length; }
        });
        out.maxLine = out.lines.reduce((m, v) => Math.max(m, v), 0);
        if (inC >= n / 2) out.dom = 'C';
        else if (inL >= n / 2) out.dom = 'L';
        else if (loose >= n / 2) out.dom = 'S';
        else if (inG >= n / 2) out.dom = 'G';
        else out.dom = [['L', inL], ['C', inC], ['G', inG], ['S', loose]].sort((p, q) => q[1] - p[1])[0][0];
        return out;
    }
    function shapeOf(c) {
        const k = c.length;
        const mx = c.reduce((s, p) => s + p.fx, 0) / k, my = c.reduce((s, p) => s + p.fy, 0) / k;
        let sxx = 0, syy = 0, sxy = 0;
        c.forEach(p => { const dx = p.fx - mx, dy = p.fy - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
        sxx /= k; syy /= k; sxy /= k;
        const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
        const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
        if (l1 <= 1e-12) return 'G';
        if (Math.sqrt(l2 / l1) < LINE_ELONG) return 'L';
        if (k < 6) return 'G';
        // تسوية المحورين ثمّ بُعد كلّ طالبٍ عن المركز: حلقةٌ = أبعادٌ متقاربة والمركز خالٍ
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), cs = Math.cos(ang), sn = Math.sin(ang);
        const r = c.map(p => {
            const dx = p.fx - mx, dy = p.fy - my;
            const u = (dx * cs + dy * sn) / Math.sqrt(l1), v = (-dx * sn + dy * cs) / Math.sqrt(Math.max(l2, 1e-12));
            return Math.hypot(u, v);
        });
        const mr = r.reduce((s, v) => s + v, 0) / k;
        const sd = Math.sqrt(r.reduce((s, v) => s + (v - mr) * (v - mr), 0) / k);
        return sd / mr < 0.3 && Math.min.apply(null, r) >= 0.45 * mr ? 'C' : 'G';
    }

    // ── الزيّ الرياضيّ ──
    // rgba بعرض w وارتفاع h، والصندوق نسبيّ. الدشداشة ثوبٌ أبيض طويل: الشريط الأوسط من أسفل الجسم (٥٥–٩٢٪ من
    // ارتفاع الصندوق، والوسط ٤٠٪ من عرضه) أبيضُ في أغلبه، وأفتح من الأرض على جانبيه بفارقٍ واضح — فلا يُعدّ
    // ملعبٌ فاتحٌ بين الساقين ثوباً. الصندوق الأصغر من ٢٨ بكسلاً لا يُحكم عليه.
    function garmentScore(rgba, w, h, box) {
        const bx = box.x * w, by = box.y * h, bw = box.w * w, bh = box.h * h;
        if (bh < 28 || bw < 6) return null;
        const y0 = Math.max(0, Math.floor(by + bh * 0.55)), y1 = Math.min(h, Math.ceil(by + bh * 0.92));
        const x0 = Math.max(0, Math.floor(bx + bw * 0.3)), x1 = Math.min(w, Math.ceil(bx + bw * 0.7));
        const sw = Math.max(2, Math.round(bw * 0.3));
        let n = 0, white = 0, sum = 0, sideN = 0, sideSum = 0;
        const lum = i => (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const i = (y * w + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = lum(i);
                n++; sum += L;
                if (L >= 165 && mx - mn <= 0.2 * mx) white++;
            }
            for (const [a, z] of [[Math.floor(bx - sw), Math.floor(bx)], [Math.ceil(bx + bw), Math.ceil(bx + bw + sw)]]) {
                for (let x = Math.max(0, a); x < Math.min(w, z); x++) { sideN++; sideSum += lum((y * w + x) * 4); }
            }
        }
        if (!n) return null;
        return { white: white / n, contrast: sideN ? sum / n - sideSum / sideN : null };
    }
    const isDishdasha = sc => !!sc && sc.white >= 0.55 && (sc.contrast == null || sc.contrast >= 20);

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

    // ── عناصر الحصة ──
    // events: [{t, k}] ← عنصر كلّ ثانية (null قبل أوّل لمسة). لمساتٌ بمفاتيح قديمة (شرح/تنظيم…) تُهمل.
    function ctxSeries(events, n) {
        const out = new Array(n).fill(null);
        const ev = (events || []).filter(e => e && e.t != null && PART[e.k]).slice().sort((a, b) => a.t - b.t);
        let j = 0, cur = null;
        for (let t = 0; t < n; t++) {
            while (j < ev.length && ev[j].t <= t) { cur = ev[j].k; j++; }
            out[t] = cur;
        }
        return out;
    }
    function ctxStats(series) {
        const sec = {};
        PARTS.forEach(x => { sec[x.k] = 0; });
        let covered = 0;
        series.forEach(k => { if (k && sec[k] != null) { sec[k]++; covered++; } });
        const pct = {};
        Object.keys(sec).forEach(k => { pct[k] = covered ? Math.round(100 * sec[k] / covered) : 0; });
        return { covered, sec, pct };
    }
    // لكلّ عنصر: مدّته، وزمن الحركة فيه (الكاميرا)، والشرح (كلامٌ في توقّف) والانتظار (توقّفٌ بلا كلام)، وحركة الطلبة
    // (كشف الطلبة)، والصفّارة — وترتيب ظهوره.
    function partsOf(series, st, secs) {
        const R = {};
        PARTS.forEach(x => { R[x.k] = { k: x.k, sec: 0, act: 0, idle: 0, explain: 0, wait: 0, n: 0, mv: 0, whistles: 0, first: -1 }; });
        series.forEach((k, t) => {
            const r = k && R[k];
            if (!r) return;
            if (r.first < 0) r.first = t;
            r.sec++;
            const s = secs[t] || {};
            if (st[t] === 'a') r.act++;
            else if (st[t] === 'i') { r.idle++; if (s.v) r.explain++; else r.wait++; }
            if (s.p && s.p.n) { r.n += s.p.n; r.mv += s.p.mv; }
            if (s.w) r.whistles++;
        });
        const order = PARTS.map(x => R[x.k]).filter(r => r.sec >= 30).sort((p, q) => p.first - q.first).map(r => r.k);
        const canon = PARTS.map(x => x.k).filter(k => order.includes(k));
        return {
            list: PARTS.map(x => {
                const r = R[x.k], cam = r.act + r.idle;
                return { k: x.k, sec: r.sec, activePct: cam ? Math.round(100 * r.act / cam) : null, explainSec: r.explain, waitSec: r.wait,
                         moving: r.n ? Math.round(100 * r.mv / r.n) : null, whistles: r.whistles };
            }),
            order, orderOk: order.join() === canon.join()
        };
    }
    // مقارنة كلّ عنصرٍ بالزمن الموصى به — بنسبته إلى زمن الحصة المرصود (حصةٌ من ٤٥ دقيقة يكبر فيها كلّ عنصر).
    // rec: {warm: دقائق, …} (اختيار المشرف) وإلّا PARTS.min. الفرق المقبول: الأكبر من دقيقتين و٤٠٪ من الموصى به.
    function partsDetail(M, rec) {
        const P = M && M.parts;
        if (!P || !P.list) return null;
        const recMin = {};
        PARTS.forEach(x => { recMin[x.k] = rec && rec[x.k] > 0 ? Number(rec[x.k]) : x.min; });
        const sumRec = PARTS.reduce((s, x) => s + recMin[x.k], 0);
        const total = P.list.reduce((s, r) => s + r.sec, 0);
        const scale = total && sumRec ? total / 60 / sumRec : 1;
        return P.list.map(r => {
            const want = recMin[r.k] * scale, have = r.sec / 60, tol = Math.max(2, 0.4 * want);
            const verdict = r.sec < 30 ? 'missing' : have - want > tol ? 'long' : want - have > tol ? 'short' : 'ok';
            return Object.assign({}, r, { label: PART[r.k].label, short: PART[r.k].short, rec: Math.round(want * 10) / 10, minutes: Math.round(have * 10) / 10, verdict,
                lowAct: PART[r.k].act != null && r.sec >= 60 && (r.moving != null ? r.moving : r.activePct) != null && (r.moving != null ? r.moving : r.activePct) < PART[r.k].act });
        });
    }

    // ── التشكيلات عبر الحصة ──
    // التشكيل الغالب كلّ عشر ثوانٍ، ثمّ المقاطع المتّصلة من عشرين ثانيةً فأكثر = تشكيلٌ استُعمل.
    function formationStats(secs) {
        const win = [];
        for (let t = 0; t < secs.length; t += 10) {
            const cnt = {};
            secs.slice(t, t + 10).forEach(s => { const f = s && s.p && s.p.fm; if (f && f !== '-') cnt[f] = (cnt[f] || 0) + 1; });
            const top = Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p])[0];
            win.push(top && cnt[top] >= 2 ? top : '-');
        }
        const segs = [];
        win.forEach((c, i) => {
            const last = segs[segs.length - 1];
            if (last && last.type === c) last.len++;
            else segs.push({ type: c, start: i * 10, len: 1 });
        });
        const used = segs.filter(x => x.type !== '-' && x.len >= 2).map(x => ({ type: x.type, start: x.start, dur: x.len * 10 }));
        const byType = {};
        used.forEach(x => { const b = byType[x.type] || (byType[x.type] = { count: 0, sec: 0 }); b.count++; b.sec += x.dur; });
        let longLineSec = 0, maxLine = 0;
        secs.forEach(s => { const l = s && s.p && s.p.ln || 0; if (l > LONG_LINE) longLineSec++; maxLine = Math.max(maxLine, l); });
        return { segments: used, byType, types: Object.keys(byType), count: used.length, longLineSec, maxLine, windows: win.join('') };
    }

    // ── الطلبة عبر الحصة ──
    const median = arr => {
        if (!arr.length) return 0;
        const a = arr.slice().sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)];
    };
    const quantile = (arr, q) => {
        if (!arr.length) return 0;
        const a = arr.slice().sort((x, y) => x - y);
        return a[Math.min(a.length - 1, Math.floor(q * a.length))];
    };
    function summarizePeople(secs, st, ctx) {
        const rows = [];
        secs.forEach((s, t) => { if (s && s.p) rows.push({ t, p: s.p }); });
        if (!rows.length) return null;
        const share = rs => {
            const tot = rs.reduce((a, r) => a + r.p.n, 0);
            return tot ? Math.round(100 * rs.reduce((a, r) => a + r.p.mv, 0) / tot) : null;
        };
        const isCore = t => ctx && ACTIVE_PARTS.includes(ctx[t]);
        const coreRows = rows.filter(r => isCore(r.t));
        const useCore = coreRows.length >= 60;
        const activeRows = useCore ? coreRows : rows.filter(r => st[r.t] === 'a');
        const qTot = activeRows.reduce((a, r) => a + r.p.n, 0);
        const roi = rows.some(r => r.p.r);
        return {
            detSecs: rows.length,
            // عدد طلبة الحصة = أكبر عددٍ رُصد (الكشف ينقص أثناء الحركة والتداخل، ولا يزيد إلّا بخطأٍ نادر)
            classSize: rows.reduce((m, r) => Math.max(m, r.p.n + r.p.o), 0),
            pupils: median(rows.map(r => r.p.n + r.p.o)),
            inside: median(rows.map(r => r.p.n)),
            movingAll: share(rows),
            movingPlay: useCore ? share(coreRows) : null,
            queuePct: qTot ? Math.round(100 * activeRows.reduce((a, r) => a + r.p.q, 0) / qTot) : 0,
            outsideMed: roi ? median(rows.map(r => r.p.o)) : 0,
            // بغير الزيّ: ما يثبت في عُشر اللقطات على الأقلّ (لا قمّة لحظةٍ واحدة)
            dishEst: quantile(rows.map(r => r.p.d || 0), 0.9),
            roi
        };
    }

    // ── الملخّص ──
    // rec = { secs: [{m, v, w, p}], grid, sens, cells (منطقة الصفّ في الشبكة), ctx: [{t,k}] (عناصر الحصة), mic: 'teacher'|'device' }
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

        // بنية الحصة بلا عناصر ملموسة: أوّل ٢٠٪ إحماء، وآخر ١٥٪ ختام
        const n = compact.length;
        const pct = arr => (arr.length ? Math.round(100 * arr.filter(k => k === 'a').length / arr.length) : 0);
        const wN = Math.round(n * 0.2), cN = Math.round(n * 0.15);
        const phases = { warm: pct(compact.slice(0, wN)), main: pct(compact.slice(wN, n - cN)), close: pct(compact.slice(n - cN)) };

        // استثمار المساحة: داخل منطقة الصفّ وحدها إن رُسمت
        const grid = Array.from((rec && rec.grid) || []);
        const cells = rec && rec.cells && rec.cells.length === grid.length ? rec.cells : null;
        const gr = cells ? grid.filter((v, k) => cells[k]) : grid;
        const max = gr.reduce((m, v) => Math.max(m, v), 0);
        const total = gr.reduce((s, v) => s + v, 0);
        const sorted = gr.slice().sort((p, q) => q - p);
        const top = sorted.slice(0, Math.max(1, Math.round(gr.length * 0.2))).reduce((s, v) => s + v, 0);
        const space = {
            coverage: max && gr.length ? Math.round(100 * gr.filter(v => v >= max * 0.15).length / gr.length) : 0,
            concentration: total ? Math.round(100 * top / total) : 0
        };

        // عناصر الحصة، وكلام المعلّم أثناء النشاط (العناصر النشطة إن لُمست، وإلّا حالة الكاميرا)
        const C = ctxStats(ctx);
        const useCtx = C.covered >= Math.max(60, st.length * 0.5);
        let coachBase = 0, coachSec = 0;
        st.forEach((k, t) => {
            const on = useCtx ? ACTIVE_PARTS.includes(ctx[t]) : k === 'a';
            if (!on || !secs[t] || secs[t].v == null) return;
            coachBase++;
            if (secs[t].v) coachSec++;
        });

        // الخطّ الزمنيّ: مقاطع عشر ثوانٍ بالحالة الغالبة وشدّةٍ نسبيّة، وعنصرها الغالب
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
            timeline.push({ k, v: Math.min(1, m / (sens.active * 3)), c: top1 ? PART[top1].c : '-' });
        }
        const forms = formationStats(secs);

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
            parts: partsOf(ctx, st, secs),
            people: summarizePeople(secs, st, useCtx ? ctx : null),
            forms: forms.windows.replace(/-/g, '').length ? forms : null,
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
    // «الإحماء (5) دقائق، والإعداد البدني (7) دقائق…» للعناصر الحاضرة
    const partsText = det => list(det.filter(r => r.verdict !== 'missing').map(r => r.label + ' ' + dur(r.sec)));
    const partsWord = n => count(n, 'عنصراً واحداً', 'عنصرين', 'عناصر', 'عنصراً');

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

        // ٧ فاعلية الإدارة الصفّيّة — حركة الطلبة أنفسهم إن كُشفوا، وإلّا حركة الصورة؛ والقاطرات الطويلة تنقصها
        const classN = people ? (people.classSize || people.inside) : 0;
        if ((m.observed || 0) >= MIN_OBSERVE) {
            let s, e, basis;
            if (people) {
                const core = people.movingPlay != null;
                const p = core ? people.movingPlay : people.movingAll;
                const T = core ? [65, 50, 38, 25] : [55, 45, 35, 25];
                s = p >= T[0] ? 1 : p >= T[1] ? 2 : p >= T[2] ? 3 : p >= T[3] ? 4 : 5;
                e = 'تحرّك الطلبة (' + p + '%) من ' + (core ? 'زمن الإحماء والإعداد البدني والأنشطة' : 'زمن الرصد') + ' في المتوسّط، وعددهم ' + pupilsN(classN);
                basis = 'ai';
            } else {
                const p = m.activePct;
                s = p >= 60 ? 1 : p >= 50 ? 2 : p >= 40 ? 3 : p >= 30 ? 4 : 5;
                e = 'بلغ زمن النشاط الحركي للطلبة (' + p + '%) من زمن الرصد، أي ' + dur(m.activeSec) + ' من ' + dur(m.observed);
                basis = 'camera';
            }
            if (m.longestIdle >= 300) s++;
            else if (m.waits >= 2 && m.avgTransition <= 45 && m.longestIdle < 180) s--;
            const FM = m.forms;
            if (FM && FM.longLineSec >= 120 && FM.maxLine > LONG_LINE) s++;
            e += m.waits ? '، وتخلّلته ' + count(m.waits, 'فترة انتظار واحدة', 'فترتا انتظار', 'فترات انتظار', 'فترة انتظار') + ' أطولها ' + dur(m.longestIdle)
                         : '، بلا فترات انتظار طويلة بين الأنشطة';
            if (FM && FM.longLineSec >= 60 && FM.maxLine > LONG_LINE) e += '، ووقفت قاطراتٌ طويلةٌ (حتّى ' + pupilsN(FM.maxLine) + ') مدّة ' + dur(FM.longLineSec);
            if (m.cued) e += '، ونُظّم ' + count(m.cued, 'انتقالٌ واحد', 'انتقالان', 'انتقالات', 'انتقالاً') + ' بالصفّارة';
            add(7, s, basis, e + '.');
        }

        // ٦ تخطيط المنهاج — من عناصر الحصة الخمسة إن لُمست (حضورها وترتيبها وزمن كلٍّ منها)، وإلّا من بنيتها المرئيّة.
        // أعلاه «جيد»: التخطيط المكتوب يقدّره المشرف.
        const det = cx ? partsDetail(m, m.rec) : null;
        if (det && cx.covered >= MIN_STRUCTURE && det.some(r => r.verdict !== 'missing')) {
            const present = det.filter(r => r.verdict !== 'missing'), missing = det.filter(r => r.verdict === 'missing');
            const long = present.filter(r => r.verdict === 'long'), short = present.filter(r => r.verdict === 'short');
            const orderOk = !m.parts || m.parts.orderOk !== false;
            const s = 2 + Math.min(2, missing.length) + (orderOk ? 0 : 1) + (long.length + short.length >= 2 ? 1 : 0);
            let e = (missing.length ? 'اشتملت الحصة على ' + partsWord(present.length) + ' من عناصرها الخمسة: ' : 'اشتملت الحصة على عناصرها الخمسة: ') + partsText(det);
            if (missing.length) e += '، وغاب عنها ' + list(missing.map(r => r.label));
            if (long.length) e += '، وطال ' + list(long.map(r => r.label)) + ' عن الزمن الموصى به';
            if (short.length) e += '، وقصر ' + list(short.map(r => r.label)) + ' عنه';
            if (!orderOk) e += '، ولم تأتِ العناصر بترتيبها';
            add(6, s, 'ctx', e + '.');
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
            const longAudio = (m.observed || 0) >= MIN_OBSERVE && m.explainPct > 40;
            if (longAudio) { s++; e += '، مع شرحٍ طويل استغرق (' + m.explainPct + '%) من زمن الرصد'; }
            add(8, s, longAudio ? 'both' : 'taps', e + '.');
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

        // ٥ الأمن والسلامة — ومنها الزيّ الرياضيّ: «بغير الزيّ» عددٌ يقترحه كشف الطلبة ويؤكّده المشرف
        const dishN = c('dish');
        if (c('safe') || c('hazard') || dishN) {
            const p = c('safe'), n = c('hazard');
            let s = n >= 2 ? (p ? 4 : 5) : n === 1 ? (p ? 3 : 4) : 2;
            const bits = [];
            if (p) bits.push('هُيّئ المكان والأدوات تهيئةً آمنة');
            if (n) bits.push((bits.length ? 'و' : '') + 'رُصد ' + count(n, 'موقفٌ خطر', 'موقفان خطران', 'مواقف خطرة', 'موقفاً خطراً'));
            if (dishN) {
                const share = classN ? dishN / classN : 0;
                const ds = dishN >= 5 || share >= 0.2 ? 4 : dishN >= 2 || share >= 0.08 ? 3 : 2;
                s = p || n ? Math.max(s, ds) : ds;
                bits.push((bits.length ? 'و' : '') + 'شارك ' + pupilsN(dishN) + (classN ? ' من ' + pupilsN(classN) : '') + (F ? ' بغير الزيّ الرياضيّ' : ' بالدشداشة بدل الزيّ الرياضيّ'));
            }
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
            if (!why && id === 6) why = 'تحتاج عشرين دقيقة رصدٍ على الأقلّ، ولمس «عناصر الحصة» حين يبدأ كلٌّ منها';
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
        if (people) {
            bits.push('شارك فيها ' + pupilsN(people.classSize || people.inside));
            bits.push('وتحرّكوا (' + (people.movingPlay != null ? people.movingPlay : people.movingAll) + '%) من ' + (people.movingPlay != null ? 'زمن العناصر النشطة' : 'زمن الرصد'));
        } else if (M.observed) bits.push('بلغ زمن النشاط الحركي للطلبة (' + M.activePct + '%)');
        const det = M.ctx && M.ctx.covered >= 60 ? partsDetail(M, M.rec) : null;
        if (det) bits.push((bits.length ? 'و' : '') + 'توزّع زمنها: ' + partsText(det));
        if (M.forms && M.forms.count) bits.push('واستُعمل ' + count(M.forms.count, 'تشكيلٌ واحد', 'تشكيلان', 'تشكيلات', 'تشكيلاً'));
        if (M.waits) bits.push('وتخلّلتها ' + count(M.waits, 'فترة انتظار واحدة', 'فترتا انتظار', 'فترات انتظار', 'فترة انتظار') + ' أطولها ' + dur(M.longestIdle));
        if (M.explainSec >= 60 && !det) bits.push('واستغرق الشرح والتوجيه ' + dur(M.explainSec));
        if (M.whistles) bits.push('واستُعملت الصفّارة ' + times(M.whistles));
        if (!bits.length) return '';
        return P('رُصدت الحصة بعين المشرف ' + dur(span) + ': ' + bits.join('، ') + '.');
    }

    // ما يُطرح في المداولة من أرقام الرصد: إجادةٌ تُعزَّز، وأسئلةٌ تأمّليّةٌ مبنيّةٌ على ما حدث (بصيغة المخاطَب)
    function debriefPrompts(M, counts, ctx) {
        ctx = ctx || {};
        const F = !!ctx.female, P = typeof ctx.pupil === 'function' ? ctx.pupil : (s => s);
        const m = M || {}, c = k => (counts && counts[k]) || 0;
        const good = [], ask = [];
        const det = m.ctx && m.ctx.covered >= 60 ? partsDetail(m, m.rec) : null;
        if (det) {
            det.filter(r => r.verdict === 'long').forEach(r => ask.push('استغرق ' + r.label + ' ' + dur(r.sec) + '، والموصى به نحو ' + dur(r.rec * 60) + '. ما الذي أطاله، وكيف {تختصره|تختصرينه}؟'));
            det.filter(r => r.verdict === 'missing').forEach(r => ask.push('لم يظهر «' + r.label + '» في الحصة. أين موقعه في {خطّتك|خطّتكِ} للدرس؟'));
            det.filter(r => r.lowAct).forEach(r => ask.push('تحرّك الطلبة (' + (r.moving != null ? r.moving : r.activePct) + '%) من زمن ' + r.label + '. ما الذي يرفع زمن الممارسة فيه؟'));
            const best = det.filter(r => r.verdict !== 'missing' && PART[r.k].act != null && (r.moving != null ? r.moving : r.activePct) >= PART[r.k].act)
                .sort((p, q) => (q.moving != null ? q.moving : q.activePct) - (p.moving != null ? p.moving : p.activePct))[0];
            if (best) good.push('بلغت حركة الطلبة (' + (best.moving != null ? best.moving : best.activePct) + '%) في ' + best.label + '.');
            if (!det.some(r => r.verdict === 'missing') && m.parts && m.parts.orderOk !== false) good.push('اشتملت الحصة على عناصرها الخمسة بترتيبها.');
        }
        const FM = m.forms;
        if (FM && FM.longLineSec >= 60 && FM.maxLine > LONG_LINE)
            ask.push('وقفت قاطرةٌ من ' + pupilsN(FM.maxLine) + ' مدّة ' + dur(FM.longLineSec) + '. كيف {تعيد|تعيدين} تنظيمها ليقلّ زمن الانتظار؟');
        if (FM && FM.count === 1 && FM.segments[0]) ask.push('استُعمل تشكيلٌ واحد («' + FORMS[FM.segments[0].type] + '») طوال الحصة. أيّ تشكيلٍ آخر يناسب المهارة؟');
        if (FM && FM.types && FM.types.length >= 3) good.push('{نوّع المعلم|نوّعت المعلمة} التشكيلات: ' + list(FM.types.map(t => FORMS[t])) + '.');
        if (c('dish')) ask.push('شارك ' + pupilsN(c('dish')) + ' بغير الزيّ الرياضيّ. ما الإجراء المتّفق عليه مع الإدارة وأولياء الأمور؟');
        if (c('out')) ask.push('ظلّ ' + pupilsN(c('out')) + ' خارج النشاط. كيف {تشركهم|تشركينهم} ولو بدورٍ مساعد؟');
        if (m.waits && m.longestIdle >= 180) ask.push('أطول فترة انتظارٍ بين نشاطين بلغت ' + dur(m.longestIdle) + '. ما الذي كان يحدث فيها؟');
        if (m.cued >= 2) good.push('نُظّمت الانتقالات بالصفّارة (' + m.cued + ' مرّات).');
        return { good: good.map(t => P(g(t, F))), ask: ask.map(t => P(g(t, F))) };
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
        PARTS, PART, ACTIVE_PARTS, FORMS, LONG_LINE, formations, formationStats, garmentScore, isDishdasha, partsOf, partsDetail, debriefPrompts,
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
