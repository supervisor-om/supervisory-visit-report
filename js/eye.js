// =========================================================================
// عين المشرف — الشاشة (منذ 2026-10-25)
//
// تبويبٌ في الزيارات الإشرافيّة: يشغّل المشرف كاميرا جهازه (أو يختار مقطعاً مصوَّراً من جهازه)
// فتُحلَّل الحصة **داخل المتصفّح**: إطارٌ صغيرٌ (٩٦ بكسلاً) كلّ ربع ثانية، وطيف الصوت كلّ عُشر ثانية،
// ثمّ js/eye-core.js يحوّلهما أرقاماً: زمن النشاط الحركي، والانتظار والانتقالات، وبنية الحصة،
// واستثمار المساحة، والشرح، والصفّارة. وما لا تراه الكاميرا يسجّله المشرف بلمسة.
//
// بعد الإيقاف: ملخّصٌ، و«التقييم المقترح» لكلّ بندٍ عليه شاهد (مع جملة الشاهد)، يُطبَّق على النموذج
// بالضغط على أزرار التقييم نفسها، وسطرٌ يُدرج في «الملاحظات العامة». النتيجة تُحفظ أرقاماً في
// #eyeData (داخل #form-view) فتُحفظ مع التقرير وتُستعاد وتُصفَّر معه.
//
// الخصوصيّة: لا يُسجَّل فيديو ولا صوت، ولا تُرسَل صورةٌ إلى أيّ مكان؛ الإطار يُقارَن بسابقه ثمّ يُنسى،
// والكاميرا والميكروفون يُغلقان عند الإيقاف.
// =========================================================================
(function (root) {
    'use strict';

    const E = () => root.SvfEye;
    const $ = id => document.getElementById(id);
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s) : String(s == null ? '' : s));
    const toast = (m, t) => { if (typeof root.showToast === 'function') root.showToast(m, t); };
    const RATING = () => (root.SVF_COLORS && root.SVF_COLORS.rating) || { 1: '#1d6b45', 2: '#0f4c81', 3: '#9a6f24', 4: '#b5452f', 5: '#7a2320' };

    const W = 96;               // عرض الإطار المحلَّل
    const S = {
        bound: false, running: false, src: null, stream: null, video: null, canvas: null, cx: null, prev: null, h: 72,
        grid: null, secs: [], acc: null, events: [], counts: {}, t0: 0, lastSec: 0, timers: [], audio: null, ast: {},
        wake: null, fileUrl: null, written: '', result: null
    };
    const freshAcc = () => ({ sum: 0, n: 0, bad: 0, voice: 0, af: 0, whistle: false });

    // ── سياق الزيارة المفتوحة ──
    const female = () => { try { return typeof getSupervisoryGender === 'function' && getSupervisoryGender() === 1; } catch (e) { return false; } };
    const lower = () => { try { return typeof supLowerGrade === 'function' && supLowerGrade(); } catch (e) { return false; } };
    const pupil = s => (lower() && typeof root.svfPupilText === 'function' ? root.svfPupilText(s) : s);
    const title = id => {
        const it = typeof evaluationItems !== 'undefined' ? evaluationItems.find(x => x.id === id) : null;
        return it ? it.id + '. ' + it.title : 'البند ' + id;
    };
    const sens = () => ($('eyeSens') && $('eyeSens').value) || 'medium';
    const rate = () => Math.max(1, Number(($('eyeRate') && $('eyeRate').value) || 1));
    const now = () => (S.src === 'file' ? (S.video ? S.video.currentTime : 0) : (performance.now() - S.t0) / 1000);
    const mmss = sec => { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; };

    // ── البناء ──
    function build() {
        const body = $('eyeBody');
        if (!body) return;
        const tagBtn = k => {
            const t = E().TAG[k];
            return `<button type="button" class="eye-tag flex items-center justify-between gap-2 w-full text-right text-sm px-3 py-2 rounded-lg border bg-white transition-colors ${t.neg ? 'border-red-200 hover:border-red-500' : 'border-slate-200 hover:border-blue-500'}" data-tag="${k}">
                        <span class="min-w-0">${esc(t.label)}</span>
                        <b class="eye-count tabular-nums ${t.neg ? 'text-red-700' : 'text-blue-800'}" data-count="${k}">0</b></button>`;
        };
        body.innerHTML = `
            <div class="svf-head" style="margin-bottom:0">
                <div>
                    <h1>عين المشرف</h1>
                    <p>تحليلٌ حيٌّ للحصة من كاميرا جهازك: زمن النشاط الحركي للطلبة، والانتظار والانتقالات، وبنية الحصة، واستثمار المساحة،
                       ومن الصوت زمن الشرح والصفّارة. وما لا تراه الكاميرا تسجّله بلمسة، ثمّ يُقترح تقييمٌ لكلّ بندٍ عليه شاهد.</p>
                </div>
            </div>

            <section class="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
                <button type="button" id="eyeStartCam" class="svf-btn svf-btn-primary"><i class="fa-solid fa-video" aria-hidden="true"></i>تشغيل الكاميرا</button>
                <label for="eyeFile" id="eyeFileBtn" class="svf-btn svf-btn-secondary" role="button" tabindex="0"><i class="fa-solid fa-film" aria-hidden="true"></i>تحليل مقطع مصوَّر</label>
                <input type="file" id="eyeFile" accept="video/*" class="hidden">
                <button type="button" id="eyeStop" class="hidden svf-btn svf-btn-primary"><i class="fa-solid fa-stop" aria-hidden="true"></i>إيقاف وتحليل</button>
                <span class="flex-1"></span>
                <label class="flex items-center gap-1.5 text-sm text-slate-600">الكاميرا
                    <select id="eyeFacing" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm"><option value="environment">الخلفية</option><option value="user">الأمامية</option></select></label>
                <label class="flex items-center gap-1.5 text-sm text-slate-600">الحساسية
                    <select id="eyeSens" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm"><option value="high">عالية</option><option value="medium" selected>متوسطة</option><option value="low">منخفضة</option></select></label>
                <label class="flex items-center gap-1.5 text-sm text-slate-600">سرعة المقطع
                    <select id="eyeRate" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm"><option value="1">×1</option><option value="2">×2</option><option value="4">×4</option></select></label>
                <label class="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" id="eyeMic" checked> الصوت</label>
            </section>
            <p id="eyeMsg" class="hidden bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm" role="alert"></p>

            <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <section class="lg:col-span-3 space-y-3">
                    <div id="eyeStage" class="relative rounded-2xl overflow-hidden bg-slate-900" style="aspect-ratio:16/9">
                        <video id="eyeVideo" playsinline muted class="absolute inset-0 w-full h-full object-contain"></video>
                        <canvas id="eyeHeat" class="absolute inset-0 w-full h-full pointer-events-none hidden"></canvas>
                        <div id="eyeIdle" class="absolute inset-0 flex items-center justify-center text-center p-8 text-slate-300 text-sm leading-7">
                            ضع الجهاز على حاملٍ ثابتٍ يرى الملعب كلّه، ثمّ شغّل الكاميرا. حركة الجهاز نفسه تُستبعد ولا تُحسب نشاطاً.</div>
                        <div id="eyeStatus" class="hidden absolute top-3 right-3 flex items-center gap-2 bg-slate-900/80 text-white text-sm rounded-lg px-3 py-1.5" aria-live="polite">
                            <span class="w-2 h-2 rounded-full bg-red-500"></span><span id="eyeClock" class="tabular-nums">00:00</span><span class="opacity-60">|</span><span id="eyeState">—</span></div>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                        <span>لا يُسجَّل فيديو ولا صوت ولا تُرسَل صورة: تُقارَن الإطارات في ذاكرة الجهاز ثمّ تُنسى.</span>
                        <label class="flex items-center gap-1.5"><input type="checkbox" id="eyeHeatToggle"> خريطة الحركة</label>
                    </div>
                    <div class="bg-white rounded-2xl border border-slate-200 p-4">
                        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <b class="text-sm text-slate-900">مجرى الحصة</b>
                            <span class="flex items-center gap-3 text-xs text-slate-600">
                                <span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:#0f4c81"></i>نشاط</span>
                                <span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:#cbd5e1"></i>انتظار أو شرح</span>
                                <span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm border border-slate-300" style="background:#f1f5f9"></i>غير محسوب</span>
                            </span>
                        </div>
                        <canvas id="eyeTimeline" class="w-full block" style="height:64px"></canvas>
                        <div class="flex justify-between text-[11px] text-slate-500 mt-1"><span>البداية</span><span id="eyeTlEnd">الآن</span></div>
                    </div>
                </section>

                <aside class="lg:col-span-2 space-y-4">
                    <section class="bg-white rounded-2xl border border-slate-200 grid grid-cols-2">
                        <div class="px-4 py-3 border-l border-b border-slate-200"><div class="text-2xl font-bold text-slate-900 tabular-nums" id="eyeKpiTime">00:00</div><div class="text-xs text-slate-600 mt-0.5">زمن الرصد</div></div>
                        <div class="px-4 py-3 border-b border-slate-200"><div class="text-2xl font-bold text-slate-900 tabular-nums" id="eyeKpiActive">—</div><div class="text-xs text-slate-600 mt-0.5">النشاط الحركي</div></div>
                        <div class="px-4 py-3 border-l border-slate-200"><div class="text-2xl font-bold text-slate-900 tabular-nums" id="eyeKpiWaits">—</div><div class="text-xs text-slate-600 mt-0.5">فترات الانتظار</div></div>
                        <div class="px-4 py-3"><div class="text-2xl font-bold text-slate-900 tabular-nums" id="eyeKpiWhistle">—</div><div class="text-xs text-slate-600 mt-0.5">الصفّارة</div></div>
                    </section>

                    <section class="bg-white rounded-2xl border border-slate-200 p-4">
                        <div class="flex items-center justify-between gap-2">
                            <h2 class="font-bold text-slate-900">ما لا تراه الكاميرا</h2>
                            <button type="button" id="eyeUndo" class="svf-btn svf-btn-ghost svf-btn-sm" disabled>تراجع عن آخر لمسة</button>
                        </div>
                        <p class="text-xs text-slate-600 mt-1 mb-3 leading-5">المس الوسم كلّما رأيته في الحصة — مع الكاميرا أو بدونها. كلّ لمسةٍ شاهدٌ للبند الذي يخصّه.</p>
                        <div class="space-y-3">
                            ${E().GROUPS.map(gp => `<div><div class="text-xs font-bold text-slate-500 mb-1.5">${esc(gp.title)}</div>
                                <div class="grid grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1.5">${gp.keys.map(tagBtn).join('')}</div></div>`).join('')}
                        </div>
                        <button type="button" id="eyeTapsOnly" class="svf-btn svf-btn-secondary svf-btn-sm w-full mt-4">اقترح التقييم من لمساتي وحدها</button>
                    </section>
                </aside>
            </div>

            <section id="eyeResult" class="hidden space-y-4" aria-live="polite"></section>`;

        S.canvas = document.createElement('canvas');
        S.canvas.width = W; S.canvas.height = S.h;
        S.cx = S.canvas.getContext('2d', { willReadFrequently: true });

        $('eyeStartCam').addEventListener('click', startCamera);
        $('eyeFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) startFile(f); });
        $('eyeFileBtn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('eyeFile').click(); } });
        $('eyeStop').addEventListener('click', () => stop(true));
        $('eyeUndo').addEventListener('click', undo);
        $('eyeTapsOnly').addEventListener('click', () => { if (!S.running) finish(); });
        $('eyeHeatToggle').addEventListener('change', () => { $('eyeHeat').classList.toggle('hidden', !$('eyeHeatToggle').checked); drawHeat(); });
        body.querySelectorAll('.eye-tag').forEach(b => b.addEventListener('click', () => tap(b.dataset.tag, b)));
        root.addEventListener('resize', () => { drawTimeline(); drawHeat(); });
        S.bound = true;
    }

    function message(text) {
        const el = $('eyeMsg');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('hidden', !text);
    }

    // ── اللمسات ──
    function tap(k, btn) {
        S.events.push({ t: S.running ? Math.round(now()) : null, k });
        S.counts[k] = (S.counts[k] || 0) + 1;
        renderCounts();
        if (btn) { btn.classList.add('ring-2', 'ring-blue-500'); setTimeout(() => btn.classList.remove('ring-2', 'ring-blue-500'), 280); }
    }
    function undo() {
        const ev = S.events.pop();
        if (!ev) return;
        S.counts[ev.k] = Math.max(0, (S.counts[ev.k] || 0) - 1);
        renderCounts();
        toast('أُلغيت آخر لمسة: ' + E().TAG[ev.k].label);
    }
    function renderCounts() {
        document.querySelectorAll('#eyeBody [data-count]').forEach(el => { el.textContent = S.counts[el.dataset.count] || 0; });
        const u = $('eyeUndo'); if (u) u.disabled = !S.events.length;
    }

    // ── التشغيل ──
    function freshVideo() {
        const old = $('eyeVideo');
        const v = old.cloneNode(false);
        old.replaceWith(v);
        return v;
    }

    function permissionText(e) {
        const n = e && e.name;
        if (n === 'NotAllowedError' || n === 'SecurityError') return 'رُفض الإذن بالكاميرا. اسمح بها لهذا الموقع من إعدادات المتصفّح، ثمّ اضغط «تشغيل الكاميرا» مرّةً أخرى.';
        if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'لم يُعثر على كاميرا في هذا الجهاز. جرّب «تحليل مقطع مصوَّر» بدلاً منها.';
        if (n === 'NotReadableError') return 'الكاميرا مستعملةٌ في تطبيقٍ آخر. أغلقه ثمّ أعد المحاولة.';
        return 'تعذّر تشغيل الكاميرا: ' + (e && e.message ? e.message : 'خطأ غير معروف');
    }

    async function startCamera() {
        if (S.running) return;
        message('');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            message('هذا المتصفّح لا يتيح الكاميرا هنا. افتح الموقع عبر https في Chrome أو Safari أو Edge.');
            return;
        }
        const video = { facingMode: { ideal: $('eyeFacing').value }, width: { ideal: 640 }, height: { ideal: 480 } };
        const wantMic = $('eyeMic').checked;
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video, audio: wantMic ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false });
        } catch (e) {
            if (!wantMic) { message(permissionText(e)); return; }
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video });
                toast('الميكروفون غير متاح — يُحلَّل الفيديو وحده', 'info');
            } catch (e2) { message(permissionText(e2)); return; }
        }
        S.stream = stream;
        const v = freshVideo();
        v.srcObject = stream;
        v.muted = true;
        try { await v.play(); } catch (e) { /* يبدأ مع أوّل إطار */ }
        if (stream.getAudioTracks().length) startAudio(ctx => ctx.createMediaStreamSource(stream), false);
        begin('camera', v);
    }

    function startFile(file) {
        if (S.running) return;
        message('');
        const v = freshVideo();
        if (S.fileUrl) URL.revokeObjectURL(S.fileUrl);
        S.fileUrl = URL.createObjectURL(file);
        v.src = S.fileUrl;
        v.muted = !$('eyeMic').checked;
        v.playbackRate = rate();
        v.addEventListener('loadedmetadata', () => { v.playbackRate = rate(); }, { once: true });
        v.addEventListener('click', () => { if (v.paused && S.running) v.play().catch(() => {}); });
        v.addEventListener('ended', () => stop(true), { once: true });
        v.addEventListener('error', () => { message('تعذّر تشغيل هذا المقطع في المتصفّح. جرّب ملفّاً بصيغة MP4.'); stop(false); }, { once: true });
        if ($('eyeMic').checked) startAudio(ctx => ctx.createMediaElementSource(v), true);
        begin('file', v);
        v.play().catch(() => { message('اضغط على المقطع لتشغيله.'); });
    }

    function startAudio(makeSource, audible) {
        try {
            const AC = root.AudioContext || root.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const src = makeSource(ctx);
            const an = ctx.createAnalyser();
            an.fftSize = 2048;
            an.smoothingTimeConstant = 0.2;
            src.connect(an);
            if (audible) an.connect(ctx.destination);
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            S.audio = { ctx, an, buf: new Float32Array(an.frequencyBinCount), binHz: ctx.sampleRate / an.fftSize };
            S.ast = {};
        } catch (e) { S.audio = null; }
    }

    function begin(src, video) {
        S.running = true;
        S.src = src;
        S.video = video;
        S.prev = null;
        S.secs = [];
        S.acc = freshAcc();
        S.grid = new Uint32Array(E().GRID_W * E().GRID_H);
        S.t0 = performance.now();
        S.lastSec = 0;
        S.events = [];
        S.counts = {};
        S.result = null;
        S.hadAudio = !!S.audio;
        renderCounts();
        $('eyeResult').classList.add('hidden');
        $('eyeIdle').classList.add('hidden');
        $('eyeStatus').classList.remove('hidden');
        ['eyeStartCam', 'eyeFileBtn', 'eyeTapsOnly'].forEach(id => $(id).classList.add('hidden'));
        $('eyeStop').classList.remove('hidden');
        ['eyeFacing', 'eyeMic', 'eyeRate'].forEach(id => { $(id).disabled = true; });
        liveDot(true);
        const r = src === 'file' ? rate() : 1;
        S.timers.push(setInterval(frameTick, Math.round(250 / r)));
        if (S.audio) S.timers.push(setInterval(audioTick, Math.round(100 / r)));
        S.timers.push(setInterval(liveTick, 1000));
        if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(w => { S.wake = w; }).catch(() => {});
        toast(src === 'file' ? 'بدأ تحليل المقطع' : 'بدأ الرصد — لمس الوسوم متاحٌ طوال الحصة');
    }

    function liveDot(on) {
        const tab = document.querySelector('.nav-tab[data-view="eye-view"]');
        if (!tab) return;
        let dot = tab.querySelector('.eye-live');
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'eye-live hidden inline-block w-2 h-2 rounded-full bg-red-600 mr-2 align-middle';
            dot.setAttribute('aria-label', 'الرصد يعمل');
            tab.appendChild(dot);
        }
        dot.classList.toggle('hidden', !on);
    }

    // ── الحلقات ──
    function flushTo(sec) {
        while (S.lastSec < sec) {
            const a = S.acc;
            S.secs.push({
                m: a.n && a.n >= a.bad ? a.sum / a.n : null,   // أغلب الإطارات مهتزّة ← غير محسوب
                v: a.af ? a.voice / a.af >= 0.35 : false,
                w: a.whistle
            });
            S.acc = freshAcc();
            S.lastSec++;
        }
    }

    function frameTick() {
        const v = S.video;
        if (!S.running || !v || v.readyState < 2 || !v.videoWidth) return;
        flushTo(Math.floor(now()));
        const h = Math.max(36, Math.round(W * v.videoHeight / v.videoWidth));
        if (h !== S.h) { S.h = h; S.canvas.height = h; S.prev = null; }
        try { S.cx.drawImage(v, 0, 0, W, S.h); } catch (e) { return; }
        const n = W * S.h;
        const cur = E().toGray(S.cx.getImageData(0, 0, W, S.h).data, n);
        if (S.prev) {
            const r = E().frameDiff(S.prev, cur, W, S.h, E().SENS[sens()].thr, S.grid);
            if (r.shake) S.acc.bad++; else { S.acc.sum += r.m; S.acc.n++; }
        }
        S.prev = cur;
    }

    function audioTick() {
        if (!S.running || !S.audio) return;
        S.audio.an.getFloatFrequencyData(S.audio.buf);
        if (!isFinite(S.audio.buf[10])) return;          // الصمت التامّ يعطي ‎-Infinity
        S.ast.t = now();
        const r = E().audioFrame(S.audio.buf, S.audio.binHz, S.ast);
        S.acc.af++;
        if (r.voice) S.acc.voice++;
        if (r.whistle) S.acc.whistle = true;
    }

    function liveTick() {
        if (!S.running) return;
        flushTo(Math.floor(now()));
        const M = E().summarize({ secs: S.secs, grid: S.grid, sens: sens() });
        $('eyeClock').textContent = mmss(S.lastSec);
        $('eyeKpiTime').textContent = mmss(S.lastSec);
        $('eyeKpiActive').textContent = M.observed >= 20 ? M.activePct + '%' : '—';
        $('eyeKpiWaits').textContent = M.observed >= 20 ? String(M.waits) : '—';
        $('eyeKpiWhistle').textContent = S.audio ? String(M.whistles) : 'بلا صوت';
        const last = M.states.slice(-3);
        const k = last.length ? last[last.length - 1] : 'x';
        $('eyeState').textContent = k === 'a' ? 'نشاط' : k === 'i' ? 'انتظار' : 'الكاميرا تتحرّك';
        drawTimeline(M.timeline);
        drawHeat();
    }

    // ── الرسم ──
    function drawTimeline(tl) {
        const c = $('eyeTimeline');
        if (!c) return;
        if (tl) S.tl = tl;
        const items = S.tl || [];
        const dpr = root.devicePixelRatio || 1, Wc = c.clientWidth || 600, Hc = c.clientHeight || 64;
        c.width = Math.round(Wc * dpr); c.height = Math.round(Hc * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, Wc, Hc);
        g.fillStyle = '#f1f5f9';
        g.fillRect(0, Hc - 2, Wc, 2);
        if (!items.length) return;
        const n = Math.max(items.length, 24);            // الحصة القصيرة لا تُمدّ على العرض كلّه
        const bw = Wc / n;
        items.forEach((it, i) => {
            const x = Wc - (i + 1) * bw;                  // الزمن من اليمين إلى اليسار
            const hh = it.k === 'a' ? 12 + it.v * (Hc - 16) : it.k === 'i' ? 8 : Hc - 4;
            g.fillStyle = it.k === 'a' ? '#0f4c81' : it.k === 'i' ? '#cbd5e1' : '#f1f5f9';
            g.fillRect(x + 0.5, Hc - hh, Math.max(1, bw - 1), hh);
        });
    }

    function drawHeat(digits) {
        const c = $('eyeHeat');
        if (!c || c.classList.contains('hidden')) return;
        const v = S.video, GW = E().GRID_W, GH = E().GRID_H;
        const vals = digits || (S.grid ? E().heatDigits(S.grid) : null);
        if (!vals) return;
        const dpr = root.devicePixelRatio || 1, Wc = c.clientWidth, Hc = c.clientHeight;
        c.width = Math.round(Wc * dpr); c.height = Math.round(Hc * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, Wc, Hc);
        // مساحة الفيديو المعروضة (object-contain)
        const ar = v && v.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
        let rw = Wc, rh = Wc / ar;
        if (rh > Hc) { rh = Hc; rw = Hc * ar; }
        const ox = (Wc - rw) / 2, oy = (Hc - rh) / 2;
        // خليّةٌ لكلّ بكسل ثمّ تكبيرٌ ناعم: بقعٌ متدرّجة لا مربّعات
        const small = document.createElement('canvas');
        small.width = GW; small.height = GH;
        const sg = small.getContext('2d'), img = sg.createImageData(GW, GH);
        for (let i = 0; i < GW * GH; i++) {
            const d = vals[i] || 0;
            img.data[i * 4] = 240; img.data[i * 4 + 1] = 180; img.data[i * 4 + 2] = 74;
            img.data[i * 4 + 3] = d ? Math.round(255 * (0.1 + d / 9 * 0.5)) : 0;
        }
        sg.putImageData(img, 0, 0);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(small, ox, oy, rw, rh);
    }

    // ── الإيقاف والتحليل ──
    function release() {
        S.timers.forEach(t => clearInterval(t));
        S.timers = [];
        if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
        if (S.audio) { try { S.audio.ctx.close(); } catch (e) {} S.audio = null; }
        if (S.wake) { S.wake.release().catch(() => {}); S.wake = null; }
        if (S.video) { try { S.video.pause(); } catch (e) {} }
        S.prev = null;
    }

    function stop(analyze) {
        if (!S.running) return;
        flushTo(Math.floor(now()));
        S.running = false;
        release();
        liveDot(false);
        $('eyeStatus').classList.add('hidden');
        $('eyeStop').classList.add('hidden');
        ['eyeStartCam', 'eyeFileBtn', 'eyeTapsOnly'].forEach(id => $(id).classList.remove('hidden'));
        ['eyeFacing', 'eyeMic', 'eyeRate'].forEach(id => { $(id).disabled = false; });
        if (analyze) finish();
    }

    function finish() {
        const M = E().summarize({ secs: S.secs, grid: S.grid || [], sens: sens() });
        const hasTaps = S.events.length > 0;
        if (!M.observed && !hasTaps) { message('لا شيء يُحلَّل بعد: شغّل الكاميرا أو المس وسوم «ما لا تراه الكاميرا» أثناء الحصة.'); return; }
        const ctx = { female: female(), pupil };
        const sugg = E().suggest(M, S.counts, ctx);
        const data = {
            v: 1, at: new Date().toISOString(), src: M.observed ? S.src : 'taps', sens: sens(), audio: !!(M.observed && S.hadAudio),
            M: {
                seconds: M.seconds, observed: M.observed, activeSec: M.activeSec, idleSec: M.idleSec, excludedSec: M.excludedSec,
                activePct: M.activePct, waits: M.waits, longestIdle: M.longestIdle, avgTransition: M.avgTransition,
                talkSec: M.talkSec, explainSec: M.explainSec, explainPct: M.explainPct, whistles: M.whistles, cued: M.cued,
                phases: M.phases, structure: M.structure, space: M.space
            },
            tl: M.timeline.map(t => t.k).join(''),
            tv: M.timeline.map(t => Math.round(t.v * 9)).join(''),
            heat: S.grid ? E().heatDigits(S.grid).join('') : '',
            counts: Object.assign({}, S.counts),
            sugg,
            summary: E().summaryText(M, ctx),
            applied: []
        };
        save(data);
        renderResult(data);
        $('eyeResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function save(data) {
        const ta = $('eyeData');
        S.result = data;
        S.written = JSON.stringify(data);
        if (ta) ta.value = S.written;
    }

    // ── النتيجة ──
    function chip(score) {
        return `<span class="inline-block text-xs font-bold text-white rounded-md px-2 py-0.5" style="background:${RATING()[score]}">${esc(E().LEVELS[score])}</span>`;
    }
    const basisText = { camera: 'من الكاميرا', taps: 'من لمساتك', both: 'من لمساتك والكاميرا' };

    function renderResult(data) {
        const box = $('eyeResult');
        if (!box || !data) return;
        const M = data.M || {};
        const D = E().dur;
        const when = (() => { try { return new Date(data.at).toLocaleString('ar-OM-u-nu-latn', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();
        const row = (k, v) => `<div class="py-2.5 flex justify-between gap-4 border-b border-slate-100"><dt class="text-slate-600">${k}</dt><dd class="font-semibold text-slate-900 text-left">${v}</dd></div>`;
        const metrics = M.observed ? [
            row('زمن الرصد', esc(D(M.observed)) + (M.excludedSec >= 30 ? ' <span class="text-xs font-normal text-slate-500">(استُبعد ' + esc(D(M.excludedSec)) + ' لحركة الكاميرا)</span>' : '')),
            row('النشاط الحركي للطلبة', M.activePct + '% <span class="text-xs font-normal text-slate-500 mr-1">' + esc(D(M.activeSec)) + '</span>'),
            row('فترات الانتظار بين الأنشطة', M.waits ? M.waits + ' <span class="text-xs font-normal text-slate-500">أطولها ' + esc(D(M.longestIdle)) + '</span>' : 'لا فترات طويلة'),
            row('الشرح والتوجيه (تقديري)', data.audio ? esc(D(M.explainSec)) : '<span class="text-slate-500 font-normal">لم يُحلَّل الصوت</span>'),
            row('الصفّارة', !data.audio ? '<span class="text-slate-500 font-normal">لم يُحلَّل الصوت</span>' : M.whistles ? M.whistles + (M.cued ? ' <span class="text-xs font-normal text-slate-500">منها ' + M.cued + ' عند الانتقال</span>' : '') : 'لم تُرصد'),
            row('نشاط مراحل الحصة', M.phases ? `<span class="inline-flex flex-wrap gap-x-3 justify-end"><span>الإحماء ${M.phases.warm}%</span><span>الرئيس ${M.phases.main}%</span><span>الختام ${M.phases.close}%</span></span>` : '—'),
            row('استثمار المساحة', M.space && M.space.coverage ? M.space.coverage + '% من الملعب المرئي' : '—')
        ].join('') : `<p class="text-sm text-slate-600 py-2">لم تُشغَّل الكاميرا — الاقتراح من لمساتك وحدها.</p>`;

        const sugg = data.sugg || [];
        const applied = new Set(data.applied || []);
        const items = sugg.map(s => {
            const cur = document.querySelector('#score-' + s.id);
            const curScore = cur ? Number(cur.textContent) : null;
            return `<li class="py-3 flex gap-3 items-start border-b border-slate-100 last:border-0">
                <input type="checkbox" class="eye-apply mt-1.5 w-4 h-4" data-id="${s.id}" data-score="${s.score}" ${curScore === s.score ? '' : 'checked'} aria-label="تطبيق اقتراح البند ${s.id}">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <b class="text-slate-900">${esc(title(s.id))}</b>${chip(s.score)}
                        <span class="text-xs text-slate-500">${esc(basisText[s.basis] || '')}</span>
                        ${applied.has(s.id) ? '<span class="text-xs font-bold text-green-700">طُبّق</span>' : ''}
                        ${curScore && curScore !== s.score ? `<span class="text-xs text-slate-500">في النموذج الآن: ${esc(E().LEVELS[curScore] || '')}</span>` : ''}
                    </div>
                    <p class="text-sm text-slate-700 mt-1 leading-7">${esc(s.evidence)}</p>
                </div></li>`;
        }).join('');
        const un = E().unsupported(sugg, M);

        box.innerHTML = `
            <div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <h2 class="text-lg font-bold text-slate-900">نتيجة الرصد</h2>
                    <span class="text-xs text-slate-500">${esc(when)}${data.src === 'file' ? ' — من مقطعٍ مصوَّر' : ''}</span>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                    <dl class="text-sm">${metrics}</dl>
                    <div class="pt-2">
                        ${data.summary ? `<p class="text-sm text-slate-700 leading-7 bg-slate-50 border border-slate-200 rounded-xl p-3">${esc(data.summary)}</p>
                        <button type="button" id="eyeToNotes" class="svf-btn svf-btn-secondary svf-btn-sm mt-3">إدراج الملخّص في «الملاحظات العامة»</button>` : ''}
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 class="text-lg font-bold text-slate-900">التقييم المقترح</h2>
                <p class="text-sm text-slate-600 mt-1 leading-6">اقتراحٌ يُراجَع لا حكمٌ نهائيّ: يُقترح البند الذي عليه شاهدٌ من الكاميرا أو من لمساتك، ومع كلٍّ شاهده.
                   حدِّد ما تعتمده ثمّ طبّقه على نموذج التقييم.</p>
                ${sugg.length ? `<ul class="mt-2">${items}</ul>` : '<p class="text-sm text-slate-600 py-4">لا بند عليه شاهدٌ كافٍ بعد. ارصد عشر دقائق على الأقلّ، أو المس الوسوم أثناء الحصة.</p>'}
                <details class="mt-3 text-sm">
                    <summary class="cursor-pointer text-slate-600">بنودٌ بلا اقتراح (${un.length})</summary>
                    <ul class="mt-2 space-y-1.5">${un.map(u => `<li class="text-slate-600"><b class="text-slate-800">${esc(title(u.id))}</b> — ${esc(u.why)}</li>`).join('')}</ul>
                </details>
                <div class="flex flex-wrap gap-2 mt-4">
                    ${sugg.length ? '<button type="button" id="eyeApply" class="svf-btn svf-btn-primary">تطبيق المحدَّد على نموذج التقييم</button>' : ''}
                    <button type="button" id="eyeNew" class="svf-btn svf-btn-ghost">رصد جديد</button>
                </div>
            </div>`;
        box.classList.remove('hidden');

        if (data.tl) {
            S.tl = data.tl.split('').map((k, i) => ({ k, v: Number((data.tv || '')[i] || 0) / 9 }));
            drawTimeline();
            $('eyeTlEnd').textContent = 'النهاية';
        }
        if (data.heat) { S.savedHeat = data.heat.split('').map(Number); drawHeat(S.savedHeat); }
        $('eyeApply') && $('eyeApply').addEventListener('click', apply);
        $('eyeToNotes') && $('eyeToNotes').addEventListener('click', () => toNotes(data.summary));
        $('eyeNew').addEventListener('click', reset);
    }

    function apply() {
        const picks = Array.from(document.querySelectorAll('#eyeResult .eye-apply:checked')).map(c => ({ id: +c.dataset.id, score: +c.dataset.score }));
        if (!picks.length) { toast('حدِّد بنداً واحداً على الأقلّ', 'error'); return; }
        let done = 0;
        picks.forEach(p => {
            // الزرّ نفسه الذي يضغطه المشرف: الدرجة والوصف المولَّد يتبعانه كما لو اختارها بيده
            const btn = document.querySelector('#item-' + p.id + ' .rating-btn[data-score="' + p.score + '"]');
            if (btn) { btn.click(); done++; }
        });
        if (!done) { toast('تعذّر الوصول إلى بنود النموذج', 'error'); return; }
        const data = S.result;
        if (data) { data.applied = Array.from(new Set((data.applied || []).concat(picks.map(p => p.id)))); save(data); }
        if (typeof toggleSupervisoryView === 'function') toggleSupervisoryView('form-view');
        const cards = picks.map(p => document.getElementById('item-' + p.id)).filter(Boolean);
        cards.forEach(c => c.classList.add('ring-2', 'ring-amber-400'));
        setTimeout(() => cards.forEach(c => c.classList.remove('ring-2', 'ring-amber-400')), 2600);
        if (cards[0]) cards[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('طُبّق التقييم المقترح على ' + done + (done === 1 ? ' بند' : done === 2 ? ' بندين' : ' بنود') + ' — راجعه في النموذج');
    }

    function toNotes(text) {
        const ta = $('generalNotesContent');
        if (!ta || !text) return;
        if (ta.value.includes(text)) { toast('الملخّص في الملاحظات العامة أصلاً'); return; }
        ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + text : text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        toast('أُدرج الملخّص في «الملاحظات العامة» — يُرفع إلى خانة الملاحظات في البوّابة');
    }

    function reset() {
        if (S.running) return;
        S.secs = []; S.grid = null; S.events = []; S.counts = {}; S.result = null; S.tl = null; S.savedHeat = null;
        renderCounts();
        $('eyeResult').classList.add('hidden');
        $('eyeResult').innerHTML = '';
        $('eyeIdle').classList.remove('hidden');
        $('eyeTlEnd').textContent = 'الآن';
        ['eyeKpiTime', 'eyeKpiActive', 'eyeKpiWaits', 'eyeKpiWhistle'].forEach(id => { $(id).textContent = id === 'eyeKpiTime' ? '00:00' : '—'; });
        drawTimeline([]);
        message('');
    }

    // يُستدعى عند فتح التبويب (toggleSupervisoryView)
    root.svfEyeOpen = function () {
        if (!E()) return;
        if (!S.bound) build();
        if (S.running) { drawTimeline(); return; }
        const saved = ($('eyeData') && $('eyeData').value) || '';
        if (saved === S.written) { if (S.result) { drawTimeline(); drawHeat(S.savedHeat); } return; }
        // تقريرٌ آخر فُتح أو صُفّر النموذج: تُعرض نتيجته المحفوظة أو تبدأ الشاشة من جديد
        reset();
        S.written = saved;
        if (!saved) return;
        try {
            const data = JSON.parse(saved);
            S.result = data;
            S.counts = Object.assign({}, data.counts || {});
            renderCounts();
            renderResult(data);
        } catch (e) { /* بياناتٌ تالفة: تبقى الشاشة فارغة */ }
    };
    root.svfEyeStop = function () { stop(false); };
})(typeof window !== 'undefined' ? window : this);
