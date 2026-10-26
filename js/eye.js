// =========================================================================
// عين المشرف — الشاشة (منذ 2026-10-25، والمرحلة الأولى 2026-10-26)
//
// تبويبٌ في الزيارات الإشرافيّة: يشغّل المشرف كاميرا جهازه (أو يختار مقطعاً مصوَّراً، أو يرصد بلا كاميرا)
// فتُحلَّل الحصة **داخل المتصفّح**: إطارٌ صغيرٌ (٩٦ بكسلاً) كلّ ربع ثانية، وطيف الصوت كلّ عُشر ثانية، ونموذج
// كشف أشخاصٍ (vendor/human — يُحمَّل عند أوّل استعمال ويعمل في الجهاز) مرّتين في الثانية، ثمّ js/eye-core.js
// يحوّلها أرقاماً. وما لا تراه الكاميرا يسجّله المشرف بلمسة، وعناصر الحصة الخمسة (الإحماء … الختام) كذلك.
//
// المرحلة الأولى (2026-10-26):
//  • منطقة الصفّ: يلمس المشرف أركان الملعب الأربعة، فلا يُحسب ما خارجها، ومن بقي خارجها يُعدّ «خارج النشاط».
//  • عرض النقاط: الشاشة لا تعرض الصورة افتراضاً — صورةٌ رماديّةٌ مكبّرة البكسلات لا تُعرف فيها الوجوه، وفوقها
//    الطلبة نقاطاً. «إظهار الصورة» اختيارٌ صريح.
//  • «أُبلغ المعلّم بالرصد» شرطٌ لبدء الكاميرا أو الميكروفون، ويُحفظ مع التقرير.
//  • الميكروفون يُختار، و«على المعلّم» لميكروفونٍ لاسلكيٍّ على ياقته.
//  • العدّادات تُصحَّح (−) أثناء الحصة وبعدها، فيُعاد الاقتراح.
//  • عند حفظ التقرير تُكتب الدرجات المعتمدة (`svfEyeBeforeSave`)، ومنها لوحة «اتّفاق العين معك».
//
// الخصوصيّة: لا يُسجَّل فيديو ولا صوت، ولا تُرسَل صورةٌ إلى أيّ مكان؛ الإطار يُقارَن بسابقه ثمّ يُنسى،
// والكاميرا والميكروفون يُغلقان عند الإيقاف.
//
// فهم الكلام (2026-10-26، بإذن المعلّم — طلب المشرف): «فهم الكلام» اختيارٌ صريحٌ بسؤالٍ مستقلّ. التعرّف على الكلام في
// المتصفّح (SpeechRecognition): داخل الجهاز إن أتاحه (Chrome على الحاسوب بحزمة اللغة)، وإلّا عبر خدمة المتصفّح — في Chrome
// على الجوّال يُرسَل الصوت إلى Google لتحويله نصّاً. لا يُحفظ صوت؛ النصّ وتحليله (js/eye-speech.js) يُحفظان مع التقرير،
// ويُحذف النصّ بزرٍّ بعد التحليل فتبقى الأرقام.
// =========================================================================
(function (root) {
    'use strict';

    const E = () => root.SvfEye;
    const $ = id => document.getElementById(id);
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s) : String(s == null ? '' : s));
    const toast = (m, t) => { if (typeof root.showToast === 'function') root.showToast(m, t); };
    const RATING = () => (root.SVF_COLORS && root.SVF_COLORS.rating) || { 1: '#1d6b45', 2: '#0f4c81', 3: '#9a6f24', 4: '#b5452f', 5: '#7a2320' };
    // ألوان عناصر الحصة (الحرف من PARTS.c) — والحروف القديمة للتقارير المحفوظة قبل العناصر الخمسة
    const CTX_COLOR = { w: '#d9a441', f: '#9a6f24', t: '#5b8fc7', a: '#2f6fae', c: '#246445', e: '#64748b', o: '#b98a32', p: '#5b8fc7', g: '#246445' };
    const FORM_COLOR = { L: '#0f4c81', C: '#246445', G: '#9a6f24', S: '#64748b' };
    const REC_KEY = 'svf_eye_rec';
    const recPref = () => { try { const v = JSON.parse(localStorage.getItem(REC_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };

    const W = 96;               // عرض الإطار المحلَّل
    const S = {
        bound: false, running: false, src: null, stream: null, video: null, canvas: null, cx: null, prev: null, h: 72,
        grid: null, secs: [], acc: null, events: [], counts: {}, t0: 0, lastSec: 0, timers: [], audio: null, ast: {},
        wake: null, fileUrl: null, written: '', result: null,
        roi: null, roiDraft: null, roiMode: false, mask: null, cells: null,
        ctxEvents: [], ctxCur: null, pSnap: null, pSnapAt: -1, runId: 0, classMax: 0,
        sp: null, speechConsent: false
    };
    const SR = () => root.SpeechRecognition || root.webkitSpeechRecognition || null;
    const SX = () => root.SvfEyeSpeech;
    const AI = { human: null, loading: null, ok: false, busy: false, fail: 0, T: null, prevG: null, prevKey: '', canvas: null, cx: null,
                 timer: null, lastMs: 0, slow: 0, count: 0, ttl: 2.5 };
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
    const checked = id => !!($(id) && $(id).checked);
    const now = () => (S.src === 'file' ? (S.video ? S.video.currentTime : 0) : (performance.now() - S.t0) / 1000);
    const mmss = sec => { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; };
    const suggCtx = () => ({ female: female(), pupil });

    // ── البناء ──
    function build() {
        const body = $('eyeBody');
        if (!body) return;
        const tagRow = k => {
            const t = E().TAG[k];
            return `<div class="flex items-stretch gap-1">
                        <button type="button" class="eye-tag flex-1 min-w-0 flex items-center justify-between gap-2 text-right text-sm px-3 py-2 rounded-lg border bg-white transition-colors ${t.neg ? 'border-red-200 hover:border-red-500' : 'border-slate-200 hover:border-blue-500'}" data-tag="${k}">
                            <span class="min-w-0">${esc(t.label)}</span>
                            <b class="eye-count tabular-nums ${t.neg ? 'text-red-700' : 'text-blue-800'}" data-count="${k}">0</b></button>
                        <button type="button" class="eye-dec hidden flex-none w-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-400" data-dec="${k}" aria-label="إنقاص ${esc(t.label)}">−</button>
                    </div>`;
        };
        const sel = (id, label, opts) => `<label class="flex items-center gap-1.5 text-sm text-slate-600">${label}
                    <select id="${id}" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm">${opts}</select></label>`;
        const kpi = (id, label, cls) => `<div class="px-4 py-3 ${cls}"><div class="text-2xl font-bold text-slate-900 tabular-nums" id="${id}">—</div><div class="text-xs text-slate-600 mt-0.5" id="${id}L">${label}</div></div>`;

        body.innerHTML = `
            <div class="svf-head" style="margin-bottom:0">
                <div>
                    <h1>عين المشرف</h1>
                    <p>تحليلٌ حيٌّ للحصة داخل جهازك: الطلبة في الملعب ومن يتحرّك منهم ومن هو خارج النشاط، والانتظار والانتقالات، وتوزيع زمن الحصة،
                       ومن الصوت زمن الشرح والتوجيه والصفّارة. وما لا تراه الكاميرا تسجّله بلمسة، ثمّ يُقترح تقييمٌ لكلّ بندٍ عليه شاهد.</p>
                </div>
            </div>

            <section class="bg-white rounded-2xl border border-slate-200 p-3 space-y-3">
                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" id="eyeStartCam" class="svf-btn svf-btn-primary"><i class="fa-solid fa-video" aria-hidden="true"></i>تشغيل الكاميرا</button>
                    <label for="eyeFile" id="eyeFileBtn" class="svf-btn svf-btn-secondary" role="button" tabindex="0"><i class="fa-solid fa-film" aria-hidden="true"></i>تحليل مقطع مصوَّر</label>
                    <input type="file" id="eyeFile" accept="video/*" class="hidden">
                    <button type="button" id="eyeStartNoCam" class="svf-btn svf-btn-ghost"><i class="fa-solid fa-stopwatch" aria-hidden="true"></i>رصد بلا كاميرا</button>
                    <button type="button" id="eyeStop" class="hidden svf-btn svf-btn-primary"><i class="fa-solid fa-stop" aria-hidden="true"></i>إيقاف وتحليل</button>
                    <span class="flex-1"></span>
                    <label class="flex items-center gap-2 text-sm font-semibold text-slate-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <input type="checkbox" id="eyeConsent"> أُبلغ المعلّم بالرصد</label>
                </div>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-slate-100">
                    ${sel('eyeFacing', 'الكاميرا', '<option value="environment">الخلفية</option><option value="user">الأمامية</option>')}
                    ${sel('eyeSens', 'الحساسية', '<option value="high">عالية</option><option value="medium" selected>متوسطة</option><option value="low">منخفضة</option>')}
                    ${sel('eyeRate', 'سرعة المقطع', '<option value="1">×1</option><option value="2">×2</option><option value="4">×4</option>')}
                    <label class="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" id="eyeAI" checked> كشف الطلبة</label>
                    <span class="flex items-center gap-2">
                        <label class="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" id="eyeMic" checked> الصوت</label>
                        <select id="eyeMicDev" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm max-w-[12rem]" aria-label="الميكروفون"><option value="">الميكروفون الافتراضي</option></select>
                        <label class="flex items-center gap-1.5 text-sm text-slate-600" title="ميكروفونٌ لاسلكيٌّ على ياقة المعلّم: يصير الكلام المرصود كلامه"><input type="checkbox" id="eyeTeacherMic"> على المعلّم</label>
                        <label id="eyeSpeechLbl" class="flex items-center gap-1.5 text-sm text-slate-600" title="يحوّل كلام المعلّم إلى نصٍّ ويحلّله: التعزيز والتصحيح والأسئلة والتحقّق من الفهم والسلامة — بإذن المعلّم"><input type="checkbox" id="eyeSpeech"> فهم الكلام</label>
                    </span>
                </div>
            </section>
            <p id="eyeMsg" class="hidden bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm" role="alert"></p>

            <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <section class="lg:col-span-3 space-y-3 min-w-0">
                    <div id="eyeStage" class="relative rounded-2xl overflow-hidden bg-slate-900" style="aspect-ratio:16/9">
                        <video id="eyeVideo" playsinline muted class="absolute inset-0 w-full h-full object-contain" style="opacity:0"></video>
                        <canvas id="eyeView" class="absolute inset-0 w-full h-full" style="pointer-events:none;touch-action:none"></canvas>
                        <canvas id="eyeHeat" class="absolute inset-0 w-full h-full pointer-events-none hidden"></canvas>
                        <div id="eyeIdle" class="absolute inset-0 flex items-center justify-center text-center p-8 text-slate-300 text-sm leading-7">
                            ضع الجهاز أفقيّاً على حاملٍ ثابتٍ مرتفع يرى الملعب كلّه، ثمّ شغّل الكاميرا والمس أركان منطقة الصفّ.</div>
                        <div id="eyeRoiHint" class="hidden pointer-events-none absolute top-3 inset-x-3 text-center text-sm text-white bg-slate-900/85 rounded-lg px-3 py-2"></div>
                        <div id="eyeStatus" class="hidden pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 bg-slate-900/80 text-white text-sm rounded-lg px-3 py-1.5" aria-live="polite">
                            <span class="w-2 h-2 rounded-full bg-red-500"></span><span id="eyeClock" class="tabular-nums">00:00</span><span class="opacity-60">|</span><span id="eyeState">—</span>
                            <span id="eyeAiState" class="hidden opacity-80 text-xs border-r border-white/30 pr-2 mr-1"></span></div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <button type="button" id="eyeRoiBtn" class="svf-btn svf-btn-secondary svf-btn-sm" disabled><i class="fa-solid fa-draw-polygon" aria-hidden="true"></i>تحديد منطقة الصف</button>
                        <button type="button" id="eyeRoiClear" class="hidden svf-btn svf-btn-ghost svf-btn-sm">مسح المنطقة</button>
                        <span class="flex-1"></span>
                        <label class="flex items-center gap-1.5" title="أطفئها لتُخفى الصورة ويظهر الطلبة نقاطاً على صورةٍ رماديّة لا تُعرف فيها الوجوه"><input type="checkbox" id="eyeShowVideo" checked> إظهار الصورة</label>
                        <label class="flex items-center gap-1.5"><input type="checkbox" id="eyeHeatToggle"> خريطة الحركة</label>
                    </div>
                    <p class="text-xs text-slate-500 leading-5">لا يُسجَّل فيديو ولا صوت ولا تُرسَل صورة: تُحلَّل الإطارات في ذاكرة الجهاز ثمّ تُنسى، ونموذج كشف الطلبة يعمل في الجهاز نفسه.</p>
                    <p id="eyeSpeechNote" class="hidden text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-5"></p>

                    <div id="eyeSpeechLive" class="hidden bg-white rounded-2xl border border-slate-200 p-4" aria-live="polite">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <b class="text-sm text-slate-900">كلام المعلّم</b>
                            <span id="eyeSpeechState" class="text-xs text-slate-500"></span>
                        </div>
                        <p id="eyeSpeechText" class="text-sm text-slate-800 leading-7 mt-2 min-h-[1.75rem]"></p>
                        <div id="eyeSpeechCounts" class="flex flex-wrap gap-1.5 mt-2"></div>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 p-4">
                        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <b class="text-sm text-slate-900">عناصر الحصة</b>
                            <span class="text-xs text-slate-500">المس العنصر حين يبدأ — يُقاس زمنه والحركة والشرح والانتظار فيه</span>
                        </div>
                        <div class="grid grid-cols-5 gap-1.5" role="group" aria-label="عناصر الحصة">
                            ${E().PARTS.map(c => `<button type="button" class="eye-ctx svf-btn svf-btn-secondary flex-col !gap-1 !px-1 !py-2 text-xs leading-4 text-center" data-ctx="${c.k}" aria-pressed="false" title="${esc(c.label)}">
                                <i class="inline-block w-full h-1 rounded-sm" style="background:${CTX_COLOR[c.c]}" aria-hidden="true"></i>${esc(c.short)}</button>`).join('')}
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl border border-slate-200 p-4">
                        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <b class="text-sm text-slate-900">مجرى الحصة</b>
                            <span class="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                <span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:#0f4c81"></i>نشاط</span>
                                <span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:#cbd5e1"></i>انتظار أو شرح</span>
                                <span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm border border-slate-300" style="background:#f1f5f9"></i>غير محسوب</span>
                                <span class="flex items-center gap-1"><i class="inline-block w-1 h-3" style="background:#b5452f"></i>لمسة</span>
                            </span>
                        </div>
                        <canvas id="eyeTimeline" class="w-full block" style="height:72px"></canvas>
                        <div class="flex justify-between text-[11px] text-slate-500 mt-1"><span>البداية</span><span id="eyeTlEnd">الآن</span></div>
                    </div>
                </section>

                <aside class="lg:col-span-2 space-y-4 min-w-0">
                    <section class="bg-white rounded-2xl border border-slate-200 grid grid-cols-2">
                        ${kpi('eyeKpiTime', 'زمن الرصد', 'border-l border-b border-slate-200')}
                        ${kpi('eyeKpiActive', 'النشاط الحركي', 'border-b border-slate-200')}
                        ${kpi('eyeKpiPupils', 'عدد الطلبة (الأكبر)', 'border-l border-b border-slate-200')}
                        ${kpi('eyeKpiOut', 'خارج المنطقة', 'border-b border-slate-200')}
                        ${kpi('eyeKpiForm', 'التشكيل', 'border-l border-b border-slate-200')}
                        ${kpi('eyeKpiDish', 'بغير الزي (تقديري)', 'border-b border-slate-200')}
                        ${kpi('eyeKpiWaits', 'فترات الانتظار', 'border-l border-slate-200')}
                        ${kpi('eyeKpiWhistle', 'الصفّارة', '')}
                    </section>

                    <section class="bg-white rounded-2xl border border-slate-200 p-4">
                        <div class="flex items-center justify-between gap-2">
                            <h2 class="font-bold text-slate-900">ما لا تراه الكاميرا</h2>
                            <button type="button" id="eyeUndo" class="svf-btn svf-btn-ghost svf-btn-sm" disabled>تراجع عن آخر لمسة</button>
                        </div>
                        <p class="text-xs text-slate-600 mt-1 mb-3 leading-5">المس الوسم كلّما رأيته في الحصة — مع الكاميرا أو بدونها — و«−» يصحّح العدد أثناء الحصة وبعدها.</p>
                        <div class="space-y-3">
                            ${E().GROUPS.map(gp => `<div><div class="text-xs font-bold text-slate-500 mb-1.5">${esc(gp.title)}</div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1.5">${gp.keys.map(tagRow).join('')}</div></div>`).join('')}
                        </div>
                        <button type="button" id="eyeTapsOnly" class="svf-btn svf-btn-secondary svf-btn-sm w-full mt-4">اقترح التقييم من لمساتي وحدها</button>
                    </section>
                </aside>
            </div>

            <section id="eyeResult" class="hidden space-y-4" aria-live="polite"></section>
            <section id="eyeAgree" class="bg-white rounded-2xl border border-slate-200 p-5"></section>`;

        S.canvas = document.createElement('canvas');
        S.canvas.width = W; S.canvas.height = S.h;
        S.cx = S.canvas.getContext('2d', { willReadFrequently: true });

        $('eyeStartCam').addEventListener('click', startCamera);
        $('eyeStartNoCam').addEventListener('click', startNoCam);
        $('eyeFile').addEventListener('click', e => { if (!needConsent(true)) e.preventDefault(); });
        $('eyeFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) startFile(f); });
        $('eyeFileBtn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('eyeFile').click(); } });
        $('eyeStop').addEventListener('click', () => stop(true));
        $('eyeUndo').addEventListener('click', undo);
        $('eyeTapsOnly').addEventListener('click', () => { if (!S.running) finish(); });
        $('eyeHeatToggle').addEventListener('change', () => { $('eyeHeat').classList.toggle('hidden', !$('eyeHeatToggle').checked); drawHeat(); });
        // الصورة طبيعيّةٌ افتراضاً (طلب المشرف 2026-10-26)، وإخفاؤها اختيارٌ يُذكر في هذا المتصفّح
        try { if (localStorage.getItem('svf_eye_show') === '0') $('eyeShowVideo').checked = false; } catch (e) { /* يبقى الافتراض */ }
        $('eyeShowVideo').addEventListener('change', () => {
            try { localStorage.setItem('svf_eye_show', checked('eyeShowVideo') ? '1' : '0'); } catch (e) { /* تفضيلٌ لا يلزم حفظه */ }
            applyVideoVisibility(); drawView();
        });
        $('eyeRoiBtn').addEventListener('click', toggleRoiMode);
        $('eyeRoiClear').addEventListener('click', () => setRoi(null));
        $('eyeView').addEventListener('pointerdown', roiPoint);
        $('eyeConsent').addEventListener('change', () => { if (checked('eyeConsent')) message(''); });
        // فهم الكلام: متاحٌ حيث يدعم المتصفّح التعرّف على الكلام (Chrome، Edge، Safari)
        if (!SR()) { $('eyeSpeech').disabled = true; $('eyeSpeechLbl').title = 'هذا المتصفّح لا يدعم التعرّف على الكلام — استعمل Chrome'; $('eyeSpeechLbl').classList.add('opacity-50'); }
        $('eyeSpeech').addEventListener('change', speechNote);
        body.querySelectorAll('.eye-tag').forEach(b => b.addEventListener('click', () => tap(b.dataset.tag, b)));
        body.querySelectorAll('.eye-dec').forEach(b => b.addEventListener('click', () => dec(b.dataset.dec)));
        body.querySelectorAll('.eye-ctx').forEach(b => b.addEventListener('click', () => setCtx(b.dataset.ctx)));
        root.addEventListener('resize', () => { drawTimeline(); drawHeat(); drawView(); });
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', refreshMics);
        refreshMics();
        renderKpis(null);
        S.bound = true;
    }

    function message(text) {
        const el = $('eyeMsg');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('hidden', !text);
    }

    // الكاميرا أو الميكروفون بعلم المعلّم — شرطٌ للبدء
    function needConsent(media) {
        if (!media || checked('eyeConsent')) return true;
        // سؤالٌ مباشرٌ بدل رسالةٍ قد لا تُرى على الجوّال (تجربة المشرف 2026-10-26) — يبقى داخل الضغطة نفسها
        let ok = false;
        try { ok = root.confirm('هل أبلغت المعلّم بالرصد؟\nاضغط «موافق» للتأكيد وبدء التشغيل.'); } catch (e) { ok = false; }
        if (ok) { $('eyeConsent').checked = true; message(''); return true; }
        message('علّم «أُبلغ المعلّم بالرصد» أوّلاً: الرصد بالكاميرا أو الميكروفون يكون بعلم المعلّم.');
        const c = $('eyeConsent'); if (c) c.focus();
        return false;
    }

    // ── الميكروفونات ──
    async function refreshMics() {
        const sel = $('eyeMicDev');
        if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        try {
            const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
            const cur = sel.value;
            sel.innerHTML = '<option value="">الميكروفون الافتراضي</option>' + list.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || ('ميكروفون ' + (i + 1)))}</option>`).join('');
            if (cur && list.some(d => d.deviceId === cur)) sel.value = cur;
        } catch (e) { /* القائمة تبقى بالافتراضيّ */ }
    }
    const audioConstraints = () => {
        const a = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
        const id = $('eyeMicDev') && $('eyeMicDev').value;
        if (id) a.deviceId = { exact: id };
        return a;
    };

    // ── اللمسات ──
    function tap(k, btn) {
        S.events.push({ t: S.running ? Math.round(now()) : null, k });
        S.counts[k] = (S.counts[k] || 0) + 1;
        renderCounts();
        if (btn) { btn.classList.add('ring-2', 'ring-blue-500'); setTimeout(() => btn.classList.remove('ring-2', 'ring-blue-500'), 280); }
        if (S.running) drawTimeline(); else resuggest();
    }
    function dec(k) {
        if (!(S.counts[k] > 0)) return;
        S.counts[k]--;
        for (let i = S.events.length - 1; i >= 0; i--) if (S.events[i].k === k) { S.events.splice(i, 1); break; }
        renderCounts();
        if (S.running) drawTimeline(); else resuggest();
    }
    function undo() {
        const ev = S.events.pop();
        if (!ev) return;
        S.counts[ev.k] = Math.max(0, (S.counts[ev.k] || 0) - 1);
        renderCounts();
        toast('أُلغيت آخر لمسة: ' + E().TAG[ev.k].label);
        if (S.running) drawTimeline(); else resuggest();
    }
    function renderCounts() {
        document.querySelectorAll('#eyeBody [data-count]').forEach(el => { el.textContent = S.counts[el.dataset.count] || 0; });
        document.querySelectorAll('#eyeBody [data-dec]').forEach(el => { el.classList.toggle('hidden', !(S.counts[el.dataset.dec] > 0)); });
        const u = $('eyeUndo'); if (u) u.disabled = !S.events.length;
    }
    // تعديل العدّادات بعد الحصة يعيد الاقتراح على أرقام الرصد نفسها
    function resuggest() {
        const d = S.result;
        if (!d || S.running) return;
        d.counts = Object.assign({}, S.counts);
        d.sugg = E().suggest(d.M || {}, d.counts, suggCtx());
        save(d);
        renderResult(d);
    }

    // ── سياق الحصة ──
    function setCtx(k) {
        if (!S.running) { toast('يُلمس عنصر الحصة أثناء الرصد', 'info'); return; }
        if (S.ctxCur === k) return;
        S.ctxCur = k;
        S.ctxEvents.push({ t: Math.round(now()), k });
        renderCtx();
    }
    function renderCtx() {
        document.querySelectorAll('#eyeBody .eye-ctx').forEach(b => {
            const on = b.dataset.ctx === S.ctxCur;
            b.classList.toggle('svf-btn-primary', on);
            b.classList.toggle('svf-btn-secondary', !on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    // ── منطقة الصفّ ──
    function fitRect(Wc, Hc) {
        const v = S.video;
        const ar = v && v.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
        let rw = Wc, rh = Wc / ar;
        if (rh > Hc) { rh = Hc; rw = Hc * ar; }
        return { ox: (Wc - rw) / 2, oy: (Hc - rh) / 2, rw, rh };
    }
    function toggleRoiMode() {
        if (!S.running || !S.video) { toast('تُحدَّد منطقة الصف والكاميرا تعمل', 'info'); return; }
        S.roiMode = !S.roiMode;
        S.roiDraft = S.roiMode ? [] : null;
        $('eyeView').style.pointerEvents = S.roiMode ? 'auto' : 'none';
        $('eyeView').style.cursor = S.roiMode ? 'crosshair' : '';
        roiHint();
        drawView();
    }
    function roiHint() {
        const el = $('eyeRoiHint');
        if (!el) return;
        const n = S.roiDraft ? S.roiDraft.length : 0;
        el.textContent = S.roiMode ? 'المس أركان منطقة الصف الأربعة على الشاشة (' + n + ' من 4)' : '';
        el.classList.toggle('hidden', !S.roiMode);
        const b = $('eyeRoiBtn');
        if (b) b.lastChild.textContent = S.roiMode ? 'إلغاء التحديد' : (S.roi ? 'إعادة تحديد المنطقة' : 'تحديد منطقة الصف');
    }
    function roiPoint(e) {
        if (!S.roiMode) return;
        e.preventDefault();
        const c = $('eyeView'), r = c.getBoundingClientRect();
        const R = fitRect(r.width, r.height);
        const x = (e.clientX - r.left - R.ox) / R.rw, y = (e.clientY - r.top - R.oy) / R.rh;
        if (x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02) return;
        S.roiDraft.push([Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]);
        if (S.roiDraft.length >= 4) {
            const pts = S.roiDraft;
            S.roiMode = false; S.roiDraft = null;
            c.style.pointerEvents = 'none'; c.style.cursor = '';
            setRoi(orderPoly(pts));
            toast('حُدّدت منطقة الصف — ما خارجها لا يُحسب، ومن بقي خارجها يُعدّ خارج النشاط');
        }
        roiHint();
        drawView();
    }
    // الأركان بأيّ ترتيبٍ لُمست ← مضلّعٌ لا يتقاطع (ترتيبٌ بالزاوية حول المركز)
    function orderPoly(pts) {
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        return pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx))
                  .map(p => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
    }
    function setRoi(poly) {
        S.roi = poly && poly.length >= 3 ? poly : null;
        S.mask = S.roi ? E().roiMask(S.roi, W, S.h) : null;
        S.cells = S.roi ? E().roiCells(S.roi) : null;
        AI.prevG = null;
        $('eyeRoiClear').classList.toggle('hidden', !S.roi);
        roiHint();
        drawView();
    }

    // ── التشغيل ──
    function freshVideo() {
        const old = $('eyeVideo');
        const v = old.cloneNode(false);
        old.replaceWith(v);
        return v;
    }
    // المسرح يأخذ شكل الصورة: الجوّال العموديّ يعطي صورةً طوليّة فيضيق المسرح ويطول (بحدّ ٧٥٪ من الشاشة) بدل عمودٍ ضيّق
    function fitStage() {
        const st = $('eyeStage'), v = S.video;
        if (!st) return;
        if (S.running && v && v.videoWidth && v.videoHeight > v.videoWidth) {
            st.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
            st.style.width = 'min(100%, calc(75vh * ' + v.videoWidth + ' / ' + v.videoHeight + '))';
            st.style.marginInline = 'auto';
        } else {
            st.style.aspectRatio = '16 / 9';
            st.style.width = '';
            st.style.marginInline = '';
        }
        drawView(); drawHeat();
    }
    function applyVideoVisibility() {
        const v = $('eyeVideo');
        if (v) v.style.opacity = S.running && checked('eyeShowVideo') ? '1' : '0';
    }

    function permissionText(e) {
        const n = e && e.name;
        if (n === 'NotAllowedError' || n === 'SecurityError') return 'رُفض الإذن بالكاميرا أو الميكروفون. اسمح بهما لهذا الموقع من إعدادات المتصفّح، ثمّ أعد المحاولة.';
        if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'لم يُعثر على الجهاز المطلوب (كاميرا أو ميكروفون). جرّب «تحليل مقطع مصوَّر» أو اختر ميكروفوناً آخر.';
        if (n === 'NotReadableError') return 'الكاميرا أو الميكروفون مستعملٌ في تطبيقٍ آخر. أغلقه ثمّ أعد المحاولة.';
        return 'تعذّر التشغيل: ' + (e && e.message ? e.message : 'خطأ غير معروف');
    }

    // ── فهم الكلام ──
    function speechNote() {
        const el = $('eyeSpeechNote');
        if (!el) return;
        el.textContent = checked('eyeSpeech') ? 'مع «فهم الكلام» يحوّل المتصفّح كلام المعلّم إلى نصّ: في Chrome على الجوّال عبر خدمة Google (يغادر الصوت الجهاز لهذا الغرض وحده)، '
            + 'وفي الحاسوب داخل الجهاز إن توفّرت حزمة العربيّة. لا يُحفظ صوت؛ يُحفظ النصّ مع التقرير، ويُحذف بزرٍّ بعد التحليل.' : '';
        el.classList.toggle('hidden', !checked('eyeSpeech'));
    }
    // سؤالٌ مستقلٌّ عن إذن المعلّم بتحويل كلامه إلى نصّ — داخل الضغطة نفسها
    function speechConsent() {
        if (!checked('eyeSpeech') || !SR()) return false;
        let ok = false;
        try {
            ok = root.confirm('«فهم الكلام» يحوّل كلام المعلّم إلى نصٍّ ويحلّله (التعزيز والتصحيح والأسئلة والسلامة).\n'
                + 'في Chrome على الجوّال يُرسَل الصوت إلى خدمة Google لتحويله نصّاً — لا يُحفظ صوت، ويُحفظ النصّ مع التقرير.\n\n'
                + 'هل وافق المعلّم على ذلك؟');
        } catch (e) { ok = false; }
        if (!ok) { $('eyeSpeech').checked = false; speechNote(); toast('أُوقف «فهم الكلام» لهذه الحصة', 'info'); }
        S.speechConsent = ok;
        return ok;
    }
    async function speechStart(track) {
        const Ctor = SR();
        if (!Ctor || !S.running) return;
        const runId = S.runId;
        const sp = S.sp = { on: true, segs: [], mode: 'cloud', lang: 'ar-OM', restarts: [], interim: '', err: '', rec: null, track: track || null, dirty: true, A: null };
        // داخل الجهاز إن كانت حزمة العربيّة مثبّتة (Chrome على الحاسوب)، وإلّا خدمة المتصفّح
        try {
            if (typeof Ctor.available === 'function') {
                const st = await Ctor.available({ langs: [sp.lang], processLocally: true });
                if (st === 'available') sp.mode = 'local';
            }
        } catch (e) { /* خدمة المتصفّح */ }
        if (!S.running || S.runId !== runId || S.sp !== sp) return;
        speechRun(sp);
        renderSpeechLive();
    }
    function speechRun(sp) {
        const Ctor = SR();
        if (!Ctor) return;
        let rec;
        try { rec = new Ctor(); } catch (e) { sp.err = 'تعذّر تشغيل التعرّف على الكلام في هذا المتصفّح.'; renderSpeechLive(); return; }
        rec.lang = sp.lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
        if (sp.mode === 'local') { try { rec.processLocally = true; } catch (e) { sp.mode = 'cloud'; } }
        rec.onresult = e => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i], x = String((r[0] && r[0].transcript) || '').trim();
                if (!x) continue;
                if (r.isFinal) speechAdd(sp, x); else interim += ' ' + x;
            }
            sp.interim = interim.trim();
            sp.err = '';
            renderSpeechLive();
        };
        rec.onerror = e => {
            const k = e && e.error;
            if (k === 'not-allowed' || k === 'service-not-allowed') { sp.on = false; sp.err = 'رُفض إذن التعرّف على الكلام — اسمح بالميكروفون لهذا الموقع ثمّ أعد الرصد.'; }
            else if (k === 'language-not-supported') { if (sp.mode === 'local') sp.mode = 'cloud'; else if (sp.lang !== 'ar-SA') sp.lang = 'ar-SA'; else { sp.on = false; sp.err = 'العربيّة غير متاحة للتعرّف على الكلام في هذا المتصفّح.'; } }
            else if (k === 'network') sp.err = 'التعرّف على الكلام يحتاج اتّصالاً بالإنترنت — تُعاد المحاولة.';
            else if (k === 'audio-capture') sp.err = 'تعذّر على خدمة الكلام الوصول إلى الميكروفون (قد يشغله تحليل الصوت). جرّب إطفاء «الصوت» وإبقاء «فهم الكلام».';
            renderSpeechLive();
        };
        // التعرّف يتوقّف بعد الصمت (خاصّةً على الجوّال) — يُعاد تشغيله ما دام الرصد جارياً، بتمهّلٍ إن تكرّر كثيراً
        rec.onend = () => {
            if (!sp.on || !S.running || S.sp !== sp) return;
            const t = Date.now();
            sp.restarts = sp.restarts.filter(x => t - x < 60000);
            sp.restarts.push(t);
            setTimeout(() => { if (sp.on && S.running && S.sp === sp) speechRun(sp); }, sp.restarts.length > 12 ? 3000 : 250);
        };
        sp.rec = rec;
        // مسار ميكروفون الرصد نفسه (ميكروفون المعلّم المختار) حيث يقبله المتصفّح، وإلّا الميكروفون الافتراضيّ
        try { if (sp.track && sp.track.readyState === 'live') rec.start(sp.track); else rec.start(); }
        catch (e) { try { rec.start(); } catch (e2) { sp.err = 'تعذّر بدء التعرّف على الكلام.'; renderSpeechLive(); } }
    }
    function speechAdd(sp, x) {
        const t = Math.round(now());
        const prev = sp.segs[sp.segs.length - 1];
        if (prev && t - prev.t <= 6 && prev.x === x) return;                        // نتيجةٌ نهائيّةٌ مكرّرة (Chrome على أندرويد)
        if (prev && t - prev.t <= 6 && x.indexOf(prev.x) === 0) { prev.x = x.slice(0, 300); sp.dirty = true; return; }   // تراكميّةٌ تحلّ محلّ سابقتها
        if (sp.segs.length < 900) sp.segs.push({ t, x: x.slice(0, 300) });
        sp.dirty = true;
    }
    function speechStop() {
        const sp = S.sp;
        if (!sp) return;
        sp.on = false;
        try { if (sp.rec) sp.rec.stop(); } catch (e) { /* انتهى أصلاً */ }
    }
    function renderSpeechLive() {
        const box = $('eyeSpeechLive'), sp = S.sp;
        if (!box) return;
        box.classList.toggle('hidden', !(sp && S.running));
        if (!sp || !S.running) return;
        const st = $('eyeSpeechState');
        st.textContent = sp.err || ((sp.mode === 'local' ? 'داخل الجهاز' : 'عبر خدمة المتصفّح') + ' · ' + sp.segs.length + ' عبارة');
        st.className = 'text-xs ' + (sp.err ? 'text-red-700 font-bold' : 'text-slate-500');
        const last = sp.segs[sp.segs.length - 1];
        const tx = $('eyeSpeechText');
        tx.textContent = '';
        if (last) tx.appendChild(document.createTextNode('«' + last.x + '»'));
        if (sp.interim) { const i = document.createElement('span'); i.className = 'text-slate-400'; i.textContent = ' ' + sp.interim; tx.appendChild(i); }
        if (!last && !sp.interim) tx.textContent = 'ينتظر كلام المعلّم…';
        if (sp.dirty && SX()) { sp.A = SX().analyze(sp.segs, { topic: info().topic, ctx: S.ctxEvents, seconds: now() }); sp.dirty = false; }
        const A = sp.A;
        const chips = A ? [['تعزيز', A.praise.n], ['تصحيح', A.corr.n], ['أسئلة', A.q.n], ['تحقّق من الفهم', A.check.n], ['سلامة', A.safe.n]] : [];
        $('eyeSpeechCounts').innerHTML = chips.map(([k, v]) => `<span class="text-xs rounded-lg border border-slate-200 px-2 py-1 text-slate-700">${esc(k)} <b class="tabular-nums text-slate-900">${v}</b></span>`).join('');
    }

    async function startCamera() {
        if (S.running) return;
        message('');
        if (!needConsent(true)) return;
        const wantSpeech = speechConsent();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            message('هذا المتصفّح لا يتيح الكاميرا هنا. افتح الموقع عبر https في Chrome أو Safari أو Edge.');
            return;
        }
        const hi = checked('eyeAI');
        const video = { facingMode: { ideal: $('eyeFacing').value }, width: { ideal: hi ? 1280 : 640 }, height: { ideal: hi ? 720 : 480 } };
        const wantMic = checked('eyeMic');
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video, audio: wantMic ? audioConstraints() : false });
        } catch (e) {
            if (!wantMic) { message(permissionText(e)); return; }
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video });
                toast('الميكروفون غير متاح — يُحلَّل الفيديو وحده', 'info');
            } catch (e2) { message(permissionText(e2)); return; }
        }
        S.stream = stream;
        refreshMics();
        const v = freshVideo();
        v.srcObject = stream;
        v.muted = true;
        try { await v.play(); } catch (e) { /* يبدأ مع أوّل إطار */ }
        if (stream.getAudioTracks().length) startAudio(ctx => ctx.createMediaStreamSource(stream), false);
        begin('camera', v);
        if (wantSpeech) speechStart(stream.getAudioTracks()[0] || null);
    }

    function startFile(file) {
        if (S.running) return;
        message('');
        if (!needConsent(true)) return;
        if (checked('eyeSpeech')) toast('«فهم الكلام» للرصد الحيّ وحده — يُحلَّل المقطع بلا نصّ', 'info');
        const v = freshVideo();
        if (S.fileUrl) URL.revokeObjectURL(S.fileUrl);
        S.fileUrl = URL.createObjectURL(file);
        v.src = S.fileUrl;
        v.muted = !checked('eyeMic');
        v.playbackRate = rate();
        v.addEventListener('loadedmetadata', () => { v.playbackRate = rate(); }, { once: true });
        v.addEventListener('click', () => { if (v.paused && S.running) v.play().catch(() => {}); });
        v.addEventListener('ended', () => stop(true), { once: true });
        v.addEventListener('error', () => { message('تعذّر تشغيل هذا المقطع في المتصفّح. جرّب ملفّاً بصيغة MP4.'); stop(false); }, { once: true });
        if (checked('eyeMic')) startAudio(ctx => ctx.createMediaElementSource(v), true);
        begin('file', v);
        v.play().catch(() => { message('اضغط على المقطع لتشغيله.'); });
    }

    // رصدٌ بلا كاميرا: سياق الحصة واللمسات بأوقاتها، والصوت إن طُلب (ميكروفون المعلّم يصلح لأيّ مادّة)
    async function startNoCam() {
        if (S.running) return;
        message('');
        const wantMic = checked('eyeMic');
        if (!needConsent(wantMic || checked('eyeSpeech'))) return;
        const wantSpeech = speechConsent();
        if (wantMic && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
                S.stream = stream;
                refreshMics();
                startAudio(ctx => ctx.createMediaStreamSource(stream), false);
            } catch (e) { toast('الميكروفون غير متاح — رصدٌ باللمسات وحدها', 'info'); }
        }
        begin('none', null);
        if (wantSpeech) speechStart(S.stream ? (S.stream.getAudioTracks()[0] || null) : null);
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
        S.runId++;
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
        S.ctxEvents = [];
        S.ctxCur = null;
        S.result = null;
        S.hadAudio = !!S.audio;
        S.mic = checked('eyeTeacherMic') ? 'teacher' : 'device';
        S.pSnap = null; S.pSnapAt = -1; S.classMax = 0;
        S.tl = null;
        S.consent = src !== 'none' || !!S.audio || checked('eyeSpeech') ? checked('eyeConsent') : false;
        S.sp = null;
        setRoi(null);                       // كلّ رصدٍ جديد يبدأ بالإطار كلّه: الكاميرا قد تحرّكت
        renderCounts();
        renderCtx();
        applyVideoVisibility();
        $('eyeResult').classList.add('hidden');
        $('eyeIdle').classList.toggle('hidden', src !== 'none');
        if (src === 'none') $('eyeIdle').textContent = 'رصدٌ بلا كاميرا: المس «عناصر الحصة» حين يبدأ كلٌّ منها، والوسوم كلّما رأيتها' + (S.audio ? '، والصوت يُحلَّل' : '') + (checked('eyeSpeech') && S.speechConsent ? '، وكلام المعلّم يصير نصّاً.' : '.');
        $('eyeStatus').classList.remove('hidden');
        ['eyeStartCam', 'eyeFileBtn', 'eyeStartNoCam', 'eyeTapsOnly'].forEach(id => $(id).classList.add('hidden'));
        $('eyeStop').classList.remove('hidden');
        ['eyeFacing', 'eyeMic', 'eyeRate', 'eyeMicDev', 'eyeTeacherMic', 'eyeAI', 'eyeSpeech'].forEach(id => { $(id).disabled = true; });
        $('eyeRoiBtn').disabled = src === 'none';
        liveDot(true);
        const r = src === 'file' ? rate() : 1;
        if (video) S.timers.push(setInterval(frameTick, Math.round(250 / r)));
        if (S.audio) S.timers.push(setInterval(audioTick, Math.round(100 / r)));
        S.timers.push(setInterval(liveTick, 1000));
        if (video && checked('eyeAI')) startAI(r);
        if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(w => { S.wake = w; }).catch(() => {});
        toast(src === 'file' ? 'بدأ تحليل المقطع' : src === 'none' ? 'بدأ الرصد بلا كاميرا' : 'بدأ الرصد — حدّد منطقة الصف، والمس السياق والوسوم طوال الحصة');
        drawView();
    }

    // ── كشف الطلبة (نموذجٌ داخل الجهاز) ──
    function loadAI() {
        if (AI.loading) return AI.loading;
        AI.loading = (async () => {
            const base = new URL('vendor/human/', document.baseURI).href;
            const mod = await import(base + 'human.esm.js');
            const human = new mod.Human({
                modelBasePath: base, backend: 'webgl', debug: false, cacheSensitivity: 0, warmup: 'none',
                face: { enabled: false }, body: { enabled: false }, hand: { enabled: false }, gesture: { enabled: false },
                segmentation: { enabled: false }, filter: { enabled: false },
                object: { enabled: true, modelPath: 'centernet.json', minConfidence: 0.25, iouThreshold: 0.4, maxDetected: 60, skipFrames: 0, skipTime: 0 }
            });
            await human.load();
            const be = human.tf && human.tf.getBackend ? human.tf.getBackend() : '';
            if (be && !/webgl|webgpu|humangl/.test(be)) throw new Error('backend ' + be);
            AI.human = human;
            AI.ok = true;
            return human;
        })();
        AI.loading.catch(() => { AI.loading = null; AI.ok = false; });
        return AI.loading;
    }
    function aiState(text) {
        const el = $('eyeAiState');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('hidden', !text);
    }
    function startAI(r) {
        const id = S.runId;
        AI.T = E().newTracker();
        AI.prevG = null; AI.fail = 0; AI.slow = 0; AI.count = 0; AI.lastMs = 0;
        aiState('كشف الطلبة: تحميل…');
        loadAI().then(() => {
            if (!S.running || S.runId !== id) return;
            aiState('كشف الطلبة: جاهز');
            scheduleDet(id, r);
        }).catch(() => {
            if (!S.running || S.runId !== id) return;
            aiState('');
            message('كشف الطلبة غير متاحٍ في هذا الجهاز أو المتصفّح — يكمل الرصد بحركة الصورة.');
        });
    }
    // الكشف يتباعد بحسب سرعة الجهاز: لا يأخذ أكثر من ثلث الوقت، فتبقى إطارات الحركة والصوت تتدفّق
    function scheduleDet(id, r) {
        const base = Math.round(500 / r);
        const ms = AI.count > 1 ? AI.lastMs : 0;           // الكشف الأوّل يهيّئ النموذج فلا يُقاس به
        const delay = Math.min(5000, Math.max(base, Math.round(ms * 2)));
        AI.ttl = Math.max(2.5, delay * 2.5 / 1000);         // الجهاز البطيء يكشف متباعداً: يبقى الطالب متابَعاً بينها
        AI.timer = setTimeout(async () => {
            if (!S.running || S.runId !== id || !AI.ok) return;
            await detTick();
            if (S.running && S.runId === id && AI.ok) scheduleDet(id, r);
        }, delay);
    }
    async function detTick() {
        const v = S.video;
        if (!S.running || !AI.ok || AI.busy || !v || v.readyState < 2 || !v.videoWidth) return;
        AI.busy = true;
        const id = S.runId, t0 = performance.now();
        try {
            const vw = v.videoWidth, vh = v.videoHeight;
            const box = E().polyBox(S.roi, 0.04);     // تُقصّ منطقة الصفّ وتُكبَّر: الطالب البعيد يُكشف أوضح
            const sx = box.x * vw, sy = box.y * vh, sw = box.w * vw, sh = box.h * vh;
            const scale = Math.min(1, 640 / Math.max(sw, sh));
            const cw = Math.max(32, Math.round(sw * scale)), ch = Math.max(32, Math.round(sh * scale));
            if (!AI.canvas) { AI.canvas = document.createElement('canvas'); AI.cx = AI.canvas.getContext('2d', { willReadFrequently: true }); }
            const c = AI.canvas;
            if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; AI.prevG = null; }
            AI.cx.drawImage(v, sx, sy, sw, sh, 0, 0, cw, ch);
            const t = now();
            const rgba = AI.cx.getImageData(0, 0, cw, ch).data;
            const gray = E().toGray(rgba, cw * ch);
            const key = [box.x, box.y, box.w, box.h].join(',');
            const prev = AI.prevKey === key ? AI.prevG : null;
            const shift = prev ? E().grayShift(prev, gray) : 0;
            const thr = E().SENS[sens()].thr;
            const res = await AI.human.detect(c);
            if (!S.running || S.runId !== id) return;
            const dets = (res.object || []).filter(o => o.label === 'person' && o.score >= E().PERSON_MIN_SCORE).map(o => {
                const b = o.boxRaw;
                return {
                    x: box.x + b[0] * box.w, y: box.y + b[1] * box.h, w: b[2] * box.w, h: b[3] * box.h, score: o.score,
                    act: prev ? E().boxMotion(prev, gray, cw, ch, { x: b[0], y: b[1], w: b[2], h: b[3] }, thr, shift) : 0,
                    dish: (sc => (sc ? E().isDishdasha(sc) : null))(E().garmentScore(rgba, cw, ch, { x: b[0], y: b[1], w: b[2], h: b[3] }))
                };
            });
            AI.prevG = gray; AI.prevKey = key;
            E().trackStep(AI.T, dets, t, vw / vh, AI.ttl);
            S.pSnap = E().peopleSnapshot(AI.T, t, S.roi);
            S.classMax = Math.max(S.classMax || 0, S.pSnap.n + S.pSnap.o);   // عدد الطلبة = أكبر عددٍ رُصد
            S.pSnapAt = now();                       // وقت وصول النتيجة: تُنسب إلى الثانية الجارية لا إلى ثانيةٍ أُغلقت
            AI.fail = 0;
            // جهازٌ بطيءٌ جدّاً (أكثر من ثانيةٍ ونصف للّقطة ثلاث مرّاتٍ متتالية بعد التهيئة) ← حركة الصورة وحدها
            AI.lastMs = performance.now() - t0;
            AI.count++;
            AI.slow = AI.count > 2 && AI.lastMs > 1500 ? AI.slow + 1 : 0;
            if (AI.slow >= 3 && !root.SVF_EYE_SLOW_OK) {
                AI.ok = false; aiState('');
                message('الجهاز بطيءٌ على كشف الطلبة — يكمل الرصد بحركة الصورة. جرّب جهازاً أحدث أو متصفّح Chrome.');
                return;
            }
            aiState('في الملعب: ' + S.pSnap.n + (S.pSnap.r ? ' · خارجها: ' + S.pSnap.o : ''));
            drawView();
        } catch (e) {
            if (++AI.fail > 5) { AI.ok = false; aiState(''); message('توقّف كشف الطلبة لخطأٍ في الجهاز — يكمل الرصد بحركة الصورة.'); }
        } finally { AI.busy = false; }
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
            // ثانيةٌ أغلب إطاراتها مهتزّة (الجوّال يتحرّك في اليد) لا تُحسب فيها حركة الطلبة أيضاً
            const shaky = a.bad > 0 && a.bad >= a.n;
            const p = !shaky && S.pSnap && S.pSnapAt >= S.lastSec - 1 && S.pSnapAt < S.lastSec + 1.5 ? S.pSnap : null;
            S.secs.push({
                m: a.n && a.n >= a.bad ? a.sum / a.n : null,   // أغلب الإطارات مهتزّة ← غير محسوب
                v: a.af ? a.voice / a.af >= 0.35 : (S.audio ? false : null),
                w: a.whistle,
                p: p ? { n: p.n, mv: p.mv, o: p.o, q: p.q, r: p.r, fm: p.fm, ln: p.ln, d: p.d } : null
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
        if (h !== S.h) { S.h = h; S.canvas.height = h; S.prev = null; if (S.roi) S.mask = E().roiMask(S.roi, W, h); fitStage(); }
        try { S.cx.drawImage(v, 0, 0, W, S.h); } catch (e) { return; }
        const n = W * S.h;
        const cur = E().toGray(S.cx.getImageData(0, 0, W, S.h).data, n);
        if (S.prev) {
            const r = E().frameDiff(S.prev, cur, W, S.h, E().SENS[sens()].thr, S.grid, S.mask);
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

    const recNow = () => ({ secs: S.secs, grid: S.grid || [], sens: sens(), cells: S.cells, ctx: S.ctxEvents, mic: S.mic });

    function liveTick() {
        if (!S.running) return;
        flushTo(Math.floor(now()));
        const M = E().summarize(recNow());
        $('eyeClock').textContent = mmss(S.lastSec);
        renderKpis(M, S.lastSec);
        const last = M.states.slice(-3);
        const k = last.length ? last[last.length - 1] : 'x';
        const ctxL = S.ctxCur ? E().CONTEXTS.find(c => c.k === S.ctxCur).label : '';
        $('eyeState').textContent = S.src === 'none' ? (ctxL || 'رصد') : (k === 'a' ? 'نشاط' : k === 'i' ? 'انتظار' : 'الكاميرا تتحرّك') + (ctxL ? ' · ' + ctxL : '');
        drawTimeline(M.timeline);
        drawHeat();
        drawView();
        renderSpeechLive();
    }

    function renderKpis(M, sec) {
        const set = (id, v, label) => { const el = $(id); if (el) el.textContent = v; if (label && $(id + 'L')) $(id + 'L').textContent = label; };
        if (!M) {
            set('eyeKpiTime', '00:00'); set('eyeKpiActive', '—', 'النشاط الحركي'); set('eyeKpiPupils', '—', 'عدد الطلبة (الأكبر)'); set('eyeKpiOut', '—');
            set('eyeKpiForm', '—'); set('eyeKpiDish', '—'); set('eyeKpiWaits', '—'); set('eyeKpiWhistle', '—');
            return;
        }
        set('eyeKpiTime', mmss(sec != null ? sec : M.seconds));
        const P = M.people;
        if (P && P.movingAll != null) set('eyeKpiActive', (P.movingPlay != null ? P.movingPlay : P.movingAll) + '%', P.movingPlay != null ? 'حركة الطلبة في العناصر' : 'حركة الطلبة');
        else set('eyeKpiActive', M.observed >= 20 ? M.activePct + '%' : '—', 'النشاط الحركي');
        const snap = S.running ? S.pSnap : null;
        // عدد الطلبة = أكبر عددٍ رُصد (لا يعود إلى عددٍ أقلّ حين يتداخل الطلبة أثناء الحركة)
        const big = S.running ? S.classMax : P ? P.classSize : 0;
        set('eyeKpiPupils', big ? String(big) : '—', snap ? 'عدد الطلبة (الأكبر) · الآن ' + (snap.n + snap.o) : 'عدد الطلبة (الأكبر)');
        set('eyeKpiOut', snap && snap.r ? String(snap.o) : P && P.roi ? String(P.outsideMed) : '—');
        set('eyeKpiForm', snap && snap.fm && snap.fm !== '-' ? E().FORMS[snap.fm] : M.forms && M.forms.count ? String(M.forms.count) + ' تشكيلات' : '—');
        set('eyeKpiDish', snap ? String(snap.d || 0) : P ? String(P.dishEst || 0) : '—');
        set('eyeKpiWaits', M.observed >= 20 ? String(M.waits) : '—');
        set('eyeKpiWhistle', S.running ? (S.audio ? String(M.whistles) : 'بلا صوت') : String(M.whistles || 0));
    }

    // ── الرسم ──
    function drawTimeline(tl) {
        const c = $('eyeTimeline');
        if (!c) return;
        if (tl) S.tl = tl;
        const items = S.tl || [];
        const dpr = root.devicePixelRatio || 1, Wc = c.clientWidth || 600, Hc = c.clientHeight || 72;
        c.width = Math.round(Wc * dpr); c.height = Math.round(Hc * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, Wc, Hc);
        g.fillStyle = '#f1f5f9';
        g.fillRect(0, Hc - 2, Wc, 2);
        if (!items.length) return;
        const n = Math.max(items.length, 24);            // الحصة القصيرة لا تُمدّ على العرض كلّه
        const bw = Wc / n, top = 8, bar = Hc - top - 6;
        items.forEach((it, i) => {
            const x = Wc - (i + 1) * bw;                  // الزمن من اليمين إلى اليسار
            if (it.c && it.c !== '-') { g.fillStyle = CTX_COLOR[it.c] || '#94a3b8'; g.fillRect(x, 0, Math.max(1, bw), 5); }
            const hh = it.k === 'a' ? 12 + it.v * (bar - 12) : it.k === 'i' ? 8 : bar;
            g.fillStyle = it.k === 'a' ? '#0f4c81' : it.k === 'i' ? '#cbd5e1' : '#f1f5f9';
            g.fillRect(x + 0.5, top + bar - hh, Math.max(1, bw - 1), hh);
        });
        // اللمسات بأوقاتها: خطٌّ رفيعٌ أسفل الشريط (الأحمر للسلبيّ)
        const evs = S.running ? S.events : ((S.result && S.result.ev) || []).map(e => ({ t: e[0], k: e[1] }));
        evs.forEach(e => {
            if (e.t == null || !E().TAG[e.k]) return;
            const x = Wc - (e.t / 10 + 0.5) * bw;
            g.fillStyle = E().TAG[e.k].neg ? '#b5452f' : '#b98a32';
            g.fillRect(x, Hc - 6, 2, 6);
        });
    }

    function drawHeat(digits) {
        const c = $('eyeHeat');
        if (!c || c.classList.contains('hidden')) return;
        const GW = E().GRID_W, GH = E().GRID_H;
        const vals = digits || (S.grid ? E().heatDigits(S.grid) : null);
        if (!vals) return;
        const dpr = root.devicePixelRatio || 1, Wc = c.clientWidth, Hc = c.clientHeight;
        c.width = Math.round(Wc * dpr); c.height = Math.round(Hc * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, Wc, Hc);
        const R = fitRect(Wc, Hc);
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
        g.drawImage(small, R.ox, R.oy, R.rw, R.rh);
    }

    // الشاشة الحيّة: بلا «إظهار الصورة» خلفيّةٌ رماديّةٌ بأربعين بكسلاً عرضاً (لا وجوه تُعرف) ثمّ المنطقة والنقاط
    function drawView() {
        const c = $('eyeView');
        if (!c) return;
        // بلا رصدٍ جارٍ تُمسح اللوحة ولو كانت الشاشة مخفيّة — وإلّا بقيت نقاط رصدٍ سابق فوق الشاشة الفارغة (كشفه الفحص على الجوّال)
        if (!S.running || !S.video) { c.width = c.width; return; }
        const dpr = root.devicePixelRatio || 1, Wc = c.clientWidth, Hc = c.clientHeight;
        if (!Wc || !Hc) return;
        c.width = Math.round(Wc * dpr); c.height = Math.round(Hc * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, Wc, Hc);
        if (!S.running || !S.video) return;
        const R = fitRect(Wc, Hc);
        if (!checked('eyeShowVideo')) {
            g.fillStyle = '#0b1f33';
            g.fillRect(0, 0, Wc, Hc);
            if (S.canvas && S.prev) {
                const pw = 40, ph = Math.max(16, Math.round(pw * S.h / W));
                const pc = S.pix || (S.pix = document.createElement('canvas'));
                if (pc.width !== pw || pc.height !== ph) { pc.width = pw; pc.height = ph; }
                const px = pc.getContext('2d', { willReadFrequently: true });
                px.drawImage(S.canvas, 0, 0, pw, ph);
                const im = px.getImageData(0, 0, pw, ph), d = im.data;
                for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = d[i + 1] = d[i + 2] = y; }
                px.putImageData(im, 0, 0);
                g.save(); g.globalAlpha = 0.5; g.imageSmoothingEnabled = false;
                g.drawImage(pc, R.ox, R.oy, R.rw, R.rh);
                g.restore();
            }
        }
        const P = ([x, y]) => [R.ox + x * R.rw, R.oy + y * R.rh];
        const poly = S.roiMode ? S.roiDraft : S.roi;
        if (poly && poly.length) {
            g.save();
            g.strokeStyle = '#f0b44a'; g.lineWidth = 2; g.setLineDash(S.roiMode ? [6, 4] : []);
            g.beginPath();
            poly.forEach((p, i) => { const [x, y] = P(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
            if (!S.roiMode) g.closePath();
            g.stroke();
            if (!S.roiMode) { g.fillStyle = 'rgba(240,180,74,0.08)'; g.fill(); }
            g.fillStyle = '#f0b44a';
            poly.forEach(p => { const [x, y] = P(p); g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); });
            g.restore();
        }
        const snap = S.pSnap && now() - S.pSnapAt <= Math.max(2, AI.ttl) ? S.pSnap : null;
        if (snap) {
            snap.dots.forEach(d => {
                const [x, y] = P([d.x, d.y]);
                g.beginPath();
                g.arc(x, y - 6, 6, 0, Math.PI * 2);
                g.fillStyle = !d.in ? 'rgba(224,122,106,0.95)' : d.mv ? '#f0b44a' : '#e2e8f0';
                g.fill();
                g.lineWidth = 1.5; g.strokeStyle = '#082742'; g.stroke();
            });
        }
    }

    // ── الإيقاف والتحليل ──
    function release() {
        speechStop();
        S.timers.forEach(t => clearInterval(t));
        S.timers = [];
        if (AI.timer) { clearTimeout(AI.timer); AI.timer = null; }
        if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
        if (S.audio) { try { S.audio.ctx.close(); } catch (e) {} S.audio = null; }
        if (S.wake) { S.wake.release().catch(() => {}); S.wake = null; }
        if (S.video) { try { S.video.pause(); } catch (e) {} }
        S.prev = null;
        AI.prevG = null;
    }

    function stop(analyze) {
        if (!S.running) return;
        flushTo(Math.floor(now()));
        S.running = false;
        S.roiMode = false; S.roiDraft = null;
        const view = $('eyeView'); if (view) { view.style.pointerEvents = 'none'; view.style.cursor = ''; }
        release();
        liveDot(false);
        aiState('');
        roiHint();
        $('eyeStatus').classList.add('hidden');
        $('eyeStop').classList.add('hidden');
        $('eyeIdle').classList.remove('hidden');
        ['eyeStartCam', 'eyeFileBtn', 'eyeStartNoCam', 'eyeTapsOnly'].forEach(id => $(id).classList.remove('hidden'));
        ['eyeFacing', 'eyeMic', 'eyeRate', 'eyeMicDev', 'eyeTeacherMic', 'eyeAI', 'eyeSpeech'].forEach(id => { $(id).disabled = id === 'eyeSpeech' && !SR(); });
        $('eyeRoiBtn').disabled = true;
        $('eyeRoiClear').classList.add('hidden');
        renderSpeechLive();
        applyVideoVisibility();
        fitStage();
        drawView();
        // آخر عبارةٍ يُسلّمها التعرّف على الكلام بعد الإيقاف بلحظة — تُنتظر قبل التحليل
        if (analyze) { if (S.sp) setTimeout(finish, 900); else finish(); }
    }

    function finish() {
        const M = E().summarize(recNow());
        const hasTaps = S.events.length > 0 || Object.keys(S.counts).some(k => S.counts[k] > 0);
        const sp = S.sp && S.sp.segs.length ? S.sp : null;
        if (!M.observed && !M.ctx.covered && !hasTaps && !sp) { message('لا شيء يُحلَّل بعد: شغّل الكاميرا أو المس «سياق الحصة» أو وسوم «ما لا تراه الكاميرا» أثناء الحصة.'); return; }
        // «طلبة خارج النشاط»: تقترحه الكاميرا من منطقة الصفّ، ويبقى عدد المشرف إن لمسه
        let outAuto = 0;
        if (M.people && M.people.roi && M.people.outsideMed > 0 && !(S.counts.out > 0)) {
            outAuto = M.people.outsideMed;
            S.counts.out = outAuto;
            renderCounts();
        }
        // «بغير الزيّ الرياضيّ»: يقترحه كشف الطلبة (ما ثبت في اللقطات) ويصحّحه المشرف بالوسم
        let dishAuto = 0;
        if (M.people && M.people.dishEst > 0 && !(S.counts.dish > 0)) {
            dishAuto = M.people.dishEst;
            S.counts.dish = dishAuto;
            renderCounts();
        }
        const keep = Object.assign({}, M);
        delete keep.states; delete keep.timeline;
        keep.rec = recPref();                          // الزمن الموصى به للعناصر (اختيار المشرف) يُحفظ مع النتيجة
        // كلام المعلّم: تحليله يدخل M فيُقترح منه ويُعاد الاقتراح عليه، والنصّ نفسه في data.sp
        if (sp && SX()) keep.speech = SX().analyze(sp.segs, { topic: info().topic, ctx: S.ctxEvents, seconds: M.seconds });
        const sugg = E().suggest(keep, S.counts, suggCtx());
        const data = {
            v: 2, at: new Date().toISOString(), src: M.observed ? S.src : (S.src === 'none' || M.ctx.covered ? 'none' : 'taps'), sens: sens(),
            audio: !!S.hadAudio, mic: S.mic || 'device', consent: !!S.consent,
            roi: S.roi || null,
            M: keep,
            tl: M.timeline.map(t => t.k).join(''),
            tv: M.timeline.map(t => Math.round(t.v * 9)).join(''),
            tc: M.timeline.map(t => t.c).join(''),
            heat: S.grid && M.observed ? E().heatDigits(S.grid).join('') : '',
            counts: Object.assign({}, S.counts),
            ev: S.events.filter(e => e.t != null).slice(-300).map(e => [e.t, e.k]),
            cx: S.ctxEvents.map(e => [e.t, e.k]),
            outAuto, dishAuto,
            sp: sp ? { mode: sp.mode, lang: sp.lang, consent: !!S.speechConsent, seg: sp.segs.map(x => [x.t, x.x]) } : null,
            sugg,
            summary: E().summaryText(keep, suggCtx()),
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
        decorate();
    }

    // ── النتيجة ──
    function chip(score) {
        return `<span class="inline-block text-xs font-bold text-white rounded-md px-2 py-0.5" style="background:${RATING()[score]}">${esc(E().LEVELS[score])}</span>`;
    }
    const basisText = { camera: 'من الكاميرا', ai: 'من كشف الطلبة', ctx: 'من سياق الحصة', taps: 'من لمساتك', both: 'من لمساتك والرصد', speech: 'من كلام المعلّم' };
    const confText = { high: 'ثقة عالية', medium: 'ثقة متوسطة', low: 'ثقة منخفضة' };
    const confColor = { high: '#1d6b45', medium: '#9a6f24', low: '#b5452f' };

    // الزيارة المفتوحة في النموذج — للبطاقة والمقارنة بالرصد السابق
    function info() {
        const v = id => (($(id) || {}).value || '').trim();
        return { teacher: v('teacherName'), school: v('school'), cls: v('class'), date: v('visitDate'), topic: v('topic'), female: female(), pupil };
    }
    const normName = n => (root.SupervisorIdentity && SupervisorIdentity.normName ? SupervisorIdentity.normName(n) : String(n || '').replace(/\s+/g, ' ').trim());
    // آخر رصدٍ بعين المشرف للمعلّم نفسه قبل هذه الزيارة (من الأرشيف) — مؤشّر نموّه
    function prevEye() {
        const I = info();
        if (!I.teacher) return null;
        const me = normName(I.teacher), cur = typeof currentEditingKey !== 'undefined' ? currentEditingKey : null;
        let best = null;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || k.indexOf('supervision_v6_visit_') !== 0 || k === cur) continue;
                try {
                    const r = JSON.parse(localStorage.getItem(k));
                    if (!r || normName(r.teacherName) !== me || !r.formData || !r.formData.eyeData) continue;
                    if (I.date && r.visitDate && r.visitDate >= I.date) continue;
                    const d = JSON.parse(r.formData.eyeData);
                    if (!d || !d.M) continue;
                    if (!best || String(r.visitDate) > String(best.date)) best = { date: r.visitDate, d };
                } catch (e) { /* تقريرٌ تالف */ }
            }
        } catch (e) { /* التخزين غير متاح */ }
        return best;
    }
    const movingOf = M => (M && M.people && M.people.movingAll != null && M.people.detSecs >= 60 ? (M.people.movingPlay != null ? M.people.movingPlay : M.people.movingAll) : M && M.observed ? M.activePct : null);
    function growthLines(data, prev) {
        if (!prev) return [];
        const out = [], a = movingOf(prev.d.M), b = movingOf(data.M);
        if (a != null && b != null) out.push('حركة الطلبة: ' + a + '% ← ' + b + '%');
        const pa = E().partsDetail(prev.d.M, prev.d.M.rec), pb = E().partsDetail(data.M, data.M.rec);
        const okN = det => (det ? det.filter(r => r.verdict === 'ok').length : null);
        if (prev.d.M.ctx && prev.d.M.ctx.covered >= 60 && data.M.ctx && data.M.ctx.covered >= 60) out.push('العناصر في زمنها الموصى به: ' + okN(pa) + ' ← ' + okN(pb) + ' من ٥');
        const fa = prev.d.M.forms, fb = data.M.forms;
        if (fa && fb) out.push('التشكيلات المستعملة: ' + fa.count + ' ← ' + fb.count);
        const da = (prev.d.counts || {}).dish, db = (data.counts || {}).dish;
        if (da != null || db != null) out.push('بغير الزيّ الرياضيّ: ' + (da || 0) + ' ← ' + (db || 0));
        return out;
    }

    function renderResult(data) {
        const box = $('eyeResult');
        if (!box || !data) return;
        const M = data.M || {};
        const D = E().dur;
        // أرقام الطلبة تُعرض حين تكفي لقطاتها (كالملخّص والاقتراح) — وإلّا فحركة الصورة
        const P = M.people && M.people.movingAll != null && M.people.detSecs >= 60 ? M.people : null;
        const C = M.ctx && M.ctx.covered >= 60 ? M.ctx : null;
        const det = C ? E().partsDetail(M, M.rec) : null;
        const F = M.forms;
        const when = (() => { try { return new Date(data.at).toLocaleString('ar-OM-u-nu-latn', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();
        const row = (k, v) => `<div class="py-2.5 flex justify-between gap-4 border-b border-slate-100"><dt class="text-slate-600">${k}</dt><dd class="font-semibold text-slate-900 text-left">${v}</dd></div>`;
        const small = s => ' <span class="text-xs font-normal text-slate-500">' + s + '</span>';
        const noAudio = '<span class="text-slate-500 font-normal">لم يُحلَّل الصوت</span>';
        const rows = [];
        if (M.observed) {
            rows.push(row('زمن الرصد', esc(D(M.observed)) + (M.excludedSec >= 30 ? small('(استُبعد ' + esc(D(M.excludedSec)) + ' لحركة الكاميرا)') : '')));
            rows.push(row('منطقة الصف', data.roi ? 'محدّدة' : '<span class="text-slate-500 font-normal">الإطار كلّه</span>'));
            if (P) {
                rows.push(row('عدد الطلبة', `<input type="number" id="eyeClassSize" min="1" max="80" value="${esc(String(P.classSize || P.inside))}" class="w-16 text-center border border-slate-300 rounded-md py-0.5" aria-label="عدد طلبة الصف">`
                    + small('أكبر عددٍ رُصد — صحّحه إن دخل فيه المعلّم')));
                if (P.roi) rows.push(row('خارج منطقة الصف', esc(String(P.outsideMed)) + (data.outAuto ? small('اقتُرح منه «طلبة خارج النشاط»') : '')));
                rows.push(row('حركة الطلبة', P.movingAll + '%' + (P.movingPlay != null ? small('في العناصر النشطة ' + P.movingPlay + '%') : small('من زمن الرصد'))));
                rows.push(row('انتظار الدور', P.queuePct + '%' + small('من الطلبة أثناء النشاط')));
            } else {
                rows.push(row('النشاط الحركي للطلبة', M.activePct + '%' + small(esc(D(M.activeSec)))));
            }
            rows.push(row('فترات الانتظار بين الأنشطة', M.waits ? M.waits + small('أطولها ' + esc(D(M.longestIdle))) : 'لا فترات طويلة'));
        }
        if (data.mic === 'teacher') {
            rows.push(row('كلام المعلم (ميكروفونه)', data.audio ? M.talkPct + '%' + small('من الحصة، وأثناء النشاط ' + M.coachPct + '%') : noAudio));
        } else if (M.observed) {
            rows.push(row('الشرح والتوجيه (تقديري)', data.audio ? esc(D(M.explainSec)) : noAudio));
        }
        if (M.observed) {
            rows.push(row('الصفّارة', !data.audio ? noAudio : M.whistles ? M.whistles + (M.cued ? small('منها ' + M.cued + ' عند الانتقال') : '') : 'لم تُرصد'));
            if (!C && M.phases) rows.push(row('نشاط مراحل الحصة', `<span class="inline-flex flex-wrap gap-x-3 justify-end"><span>الإحماء ${M.phases.warm}%</span><span>الرئيس ${M.phases.main}%</span><span>الختام ${M.phases.close}%</span></span>`));
            rows.push(row('استثمار المساحة', M.space && M.space.coverage ? M.space.coverage + '% ' + (data.roi ? 'من منطقة الصف' : 'من الملعب المرئي') : '—'));
        }
        if (data.consent) rows.push(row('أُبلغ المعلم بالرصد', 'نعم'));
        const metrics = rows.length ? rows.join('') : `<p class="text-sm text-slate-600 py-2">لم تُشغَّل الكاميرا — الاقتراح من لمساتك وحدها.</p>`;

        // عناصر الحصة: الزمن الفعليّ مقابل الموصى به، والحركة والشرح والانتظار في كلّ عنصر
        const VERD = { ok: ['مناسب', '#1d6b45'], long: ['أطول', '#9a6f24'], short: ['أقصر', '#9a6f24'], missing: ['غائب', '#b5452f'] };
        let partsHtml = '';
        if (det) {
            const maxMin = Math.max(1, ...det.map(r => Math.max(r.minutes, r.rec)));
            const rec = recPref() || {};
            partsHtml = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-lg font-bold text-slate-900">عناصر الحصة</h2>
                    <span class="text-xs text-slate-500">الشريط: الزمن الفعليّ · الخطّ الذهبيّ: الموصى به بنسبة زمن الحصة${M.parts && M.parts.orderOk === false ? ' · <b class="text-red-700">لم تأتِ بترتيبها</b>' : ''}</span></div>
                <div class="mt-3 space-y-3">${det.map(r => {
                    const mv = r.moving != null ? r.moving : r.activePct;
                    const [vt, vc] = VERD[r.verdict];
                    return `<div>
                        <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <b class="text-slate-800"><i class="inline-block w-2.5 h-2.5 rounded-sm ml-1.5" style="background:${CTX_COLOR[E().PART[r.k].c]}"></i>${esc(r.label)}</b>
                            <span class="flex flex-wrap items-center gap-x-3 text-xs text-slate-600 tabular-nums">
                                <span>${r.minutes} د من ${r.rec} د</span>
                                ${mv != null && r.sec ? `<span${r.lowAct ? ' class="text-red-700 font-bold"' : ''}>الحركة ${mv}%</span>` : ''}
                                ${r.explainSec >= 30 ? `<span>شرح ${esc(D(r.explainSec))}</span>` : ''}
                                ${r.waitSec >= 30 ? `<span>انتظار ${esc(D(r.waitSec))}</span>` : ''}
                                <span class="font-bold text-white rounded px-1.5" style="background:${vc}">${vt}</span>
                            </span>
                        </div>
                        <div class="relative h-2.5 bg-slate-100 rounded mt-1.5">
                            <div class="absolute inset-y-0 right-0 rounded" style="width:${Math.min(100, 100 * r.minutes / maxMin)}%;background:${CTX_COLOR[E().PART[r.k].c]}"></div>
                            <div class="absolute -inset-y-1 w-0.5" style="right:${Math.min(100, 100 * r.rec / maxMin)}%;background:#f0b44a"></div>
                        </div></div>`;
                }).join('')}</div>
                <details class="mt-4 text-sm"><summary class="cursor-pointer text-slate-600">الزمن الموصى به لكلّ عنصر (دقائق لحصّة ٤٠ دقيقة — عدّله وفق دليل المعلّم)</summary>
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">${E().PARTS.map(x => `<label class="text-xs text-slate-600">${esc(x.label)}
                        <input type="number" min="0" max="40" step="1" data-rec="${x.k}" value="${esc(String(rec[x.k] != null ? rec[x.k] : x.min))}" class="w-full border border-slate-300 rounded-md px-2 py-1 mt-0.5"></label>`).join('')}</div>
                    <button type="button" id="eyeRecSave" class="svf-btn svf-btn-secondary svf-btn-sm mt-2">حفظ وإعادة الاقتراح</button>
                </details></div>`;
        }

        // التشكيلات والزيّ الرياضيّ
        let formsHtml = '';
        const dishN = (data.counts || {}).dish || 0;
        if (F || (P && (P.dishEst || dishN))) {
            const segs = F ? F.segments.map(x => `<span class="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"><i class="inline-block w-2 h-2 rounded-full" style="background:${FORM_COLOR[x.type]}"></i>${esc(E().FORMS[x.type])} <span class="text-slate-500 tabular-nums">${esc(D(x.dur))}</span></span>`).join('<span class="text-slate-400 text-xs">←</span>') : '';
            formsHtml = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 class="text-lg font-bold text-slate-900">التشكيلات والزيّ الرياضيّ</h2>
                ${F ? `<p class="text-sm text-slate-700 mt-2">استُعمل <b>${F.count}</b> ${F.count === 1 ? 'تشكيلٌ' : 'تشكيلات'} من <b>${F.types.length}</b> ${F.types.length === 1 ? 'نوع' : 'أنواع'}:
                        ${F.types.map(t => esc(E().FORMS[t]) + ' (' + F.byType[t].count + ')').join('، ')}</p>
                    <div class="flex flex-wrap items-center gap-1.5 mt-2">${segs}</div>
                    ${F.maxLine > E().LONG_LINE ? `<p class="text-sm mt-2 ${F.longLineSec >= 60 ? 'text-red-700 font-bold' : 'text-slate-700'}">أطول قاطرة: ${F.maxLine} طلبة، ووقفت قاطراتٌ أطول من ${E().LONG_LINE} مدّة ${esc(D(F.longLineSec))}</p>`
                        : `<p class="text-sm text-slate-600 mt-2">لا قاطرة تزيد على ${E().LONG_LINE} طلبة${F.maxLine ? ' — أطولها ' + F.maxLine : ''}.</p>`}` : ''}
                ${P ? `<p class="text-sm text-slate-700 mt-3 pt-3 border-t border-slate-100">بغير الزيّ الرياضيّ (الدشداشة البيضاء): <b>${dishN}</b>${P.classSize ? ' من ' + P.classSize : ''}
                    <span class="text-xs text-slate-500">${data.dishAuto ? '— تقديرٌ من الكشف، صحّحه من وسم «بغير الزي الرياضي»' : ''}</span></p>` : ''}
                <p class="text-xs text-slate-500 mt-2 leading-5">التشكيل والزيّ تقديرٌ من مواضع الطلبة وألوان ملابسهم في الصورة — يدقّ كلّما ارتفعت الكاميرا ورأت الملعب كاملاً.</p>
            </div>`;
        }

        // كلام المعلّم: الأرقام، وأمثلةٌ بنصّه وأوقاتها، وعباراتٌ للمراجعة (لا تدخل التقييم ولا البطاقة)، والنصّ الكامل وحذفه
        let speechHtml = '';
        const SPA = M.speech;
        if (SPA && SPA.clauses) {
            const segs = (data.sp && data.sp.seg) || [];
            const cx = (data.cx || []).map(e => ({ t: e[0], k: e[1] }));
            const partOf = t => { let k = null; cx.forEach(e => { if (e.t <= t) k = e.k; }); return k && E().PART[k] ? E().PART[k].short : ''; };
            const box = (label, n, sub) => `<div class="rounded-xl border border-slate-200 px-3 py-2"><div class="text-xl font-bold text-slate-900 tabular-nums">${esc(String(n))}</div>
                <div class="text-[11px] text-slate-600 leading-4">${esc(label)}${sub ? '<br><span class="text-slate-500">' + esc(sub) + '</span>' : ''}</div></div>`;
            const exList = (ttl, arr) => (arr && arr.length ? `<div><div class="text-xs font-bold text-slate-500 mb-1">${esc(ttl)}</div>${arr.map(([t, x]) =>
                `<p class="text-sm text-slate-700 leading-6"><span class="text-[11px] text-slate-500 tabular-nums ml-1">${mmss(t)}</span>«${esc(x)}»</p>`).join('')}</div>` : '');
            const partRows = E().PARTS.filter(x => SPA.parts && SPA.parts[x.k]).map(x => {
                const r = SPA.parts[x.k];
                return `<tr class="border-t border-slate-100"><td class="py-1.5 text-slate-800"><i class="inline-block w-2 h-2 rounded-sm ml-1" style="background:${CTX_COLOR[x.c]}"></i>${esc(x.short)}</td>
                    <td class="text-center tabular-nums">${r.words}</td><td class="text-center tabular-nums">${r.praise}</td><td class="text-center tabular-nums">${r.corr}</td><td class="text-center tabular-nums">${r.q}</td><td class="text-center tabular-nums">${r.org}</td></tr>`;
            }).join('');
            const terms = SPA.topic && SPA.topic.terms && SPA.topic.terms.length ? SPA.topic : null;
            speechHtml = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-lg font-bold text-slate-900">كلام المعلّم</h2>
                    <span class="text-xs text-slate-500">${data.sp && data.sp.mode === 'local' ? 'حُوِّل إلى نصٍّ داخل الجهاز' : 'حُوِّل إلى نصٍّ بخدمة المتصفّح'} · ${esc(String(SPA.words))} كلمة${SPA.wpm ? ' · ' + esc(String(SPA.wpm)) + ' في الدقيقة' : ''}${data.mic === 'teacher' ? '' : ' · ميكروفون الجهاز قد يلتقط غير المعلّم'}</span></div>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                    ${box('تعزيز', SPA.praise.n, SPA.praise.spec ? 'محدّد ' + SPA.praise.spec : '')}${box('تصحيح للأداء', SPA.corr.n, SPA.corr.spec ? 'بالمهارة ' + SPA.corr.spec : '')}
                    ${box('أسئلة', SPA.q.n, SPA.q.hi ? 'للتفكير ' + SPA.q.hi : '')}${box('تحقّق من الفهم', SPA.check.n)}
                    ${box('تذكير بالسلامة', SPA.safe.n)}${box('تعليمات تنظيمية', SPA.orgShare + '%')}
                </div>
                <p class="text-sm text-slate-700 mt-3 leading-7">${terms ? 'مصطلحات الدرس (' + esc(terms.terms.join('، ')) + '): سُمعت <b>' + terms.n + '</b> ' + (terms.n === 1 ? 'مرّة' : 'مرّات') + ' · ' : ''}القيم والروح الرياضيّة: <b>${SPA.values.n}</b> · الربط بالصحّة: <b>${SPA.health.n}</b></p>
                <div class="grid md:grid-cols-2 gap-4 mt-3">
                    ${exList('تعزيزٌ محدّد', SPA.praise.specEx)}${exList('تصحيحٌ بالمهارة', SPA.corr.specEx)}
                    ${exList('أسئلةٌ تستثير التفكير', SPA.q.hiEx)}${exList('تحقّقٌ من الفهم', SPA.check.ex)}
                    ${exList('تذكيرٌ بالسلامة', SPA.safe.ex)}${exList('تعزيزٌ عامّ', (SPA.praise.ex || []).filter(e => !(SPA.praise.specEx || []).some(s => s[0] === e[0])))}
                </div>
                ${SPA.harsh && SPA.harsh.n ? `<div class="mt-4 rounded-xl border border-red-200 bg-red-50 p-3"><div class="text-sm font-bold text-red-800">عباراتٌ تحتاج مراجعتك (${SPA.harsh.n})</div>
                    <p class="text-xs text-red-800 mt-0.5">لا تدخل التقييم ولا المداولة ولا بطاقة المعلّم — قد يخطئ المحوِّل في سماعها، فتحقّق منها بنفسك.</p>
                    ${(SPA.harsh.ex || []).map(([t, x]) => `<p class="text-sm text-red-900 leading-6 mt-1"><span class="text-[11px] tabular-nums ml-1">${mmss(t)}</span>«${esc(x)}»</p>`).join('')}</div>` : ''}
                ${partRows ? `<div class="overflow-x-auto mt-4"><table class="w-full text-sm"><thead><tr class="text-xs text-slate-500"><th class="text-right font-medium py-1">العنصر</th><th class="font-medium">كلمات</th><th class="font-medium">تعزيز</th><th class="font-medium">تصحيح</th><th class="font-medium">أسئلة</th><th class="font-medium">تنظيم</th></tr></thead><tbody>${partRows}</tbody></table></div>` : ''}
                ${segs.length ? `<details class="mt-4 text-sm"><summary class="cursor-pointer text-slate-600">النصّ الكامل (${segs.length} عبارة)</summary>
                    <div class="mt-2 max-h-80 overflow-y-auto space-y-1 pr-1">${segs.map(([t, x]) => `<p class="leading-6 text-slate-700"><span class="text-[11px] text-slate-500 tabular-nums ml-1">${mmss(t)}${partOf(t) ? ' · ' + esc(partOf(t)) : ''}</span>${esc(x)}</p>`).join('')}</div></details>` : ''}
                <div class="flex flex-wrap items-center gap-2 mt-3">
                    ${segs.length || (SPA.praise.ex || []).length ? '<button type="button" id="eyeSpeechPurge" class="svf-btn svf-btn-ghost svf-btn-sm">حذف النصّ والإبقاء على الأرقام</button>' : '<span class="text-xs text-slate-500">حُذف النصّ وبقيت الأرقام.</span>'}
                </div>
                <p class="text-xs text-slate-500 mt-2 leading-5">القاموس يعدّ ما يُسمع ولا يفهم السياق، والمحوِّل قد يخطئ في سماع الكلمة — راجع الأمثلة قبل اعتماد الاقتراح.</p>
            </div>`;
        }

        // للمداولة وللمعلّم: ما يُعزَّز وما يُسأل عنه، والنموّ منذ الرصد السابق، والبطاقة
        const dp = E().debriefPrompts(M, data.counts || {}, suggCtx());
        const prev = prevEye(), grow = growthLines(data, prev);
        const canDebrief = !!(root.SupervisorGate && SupervisorGate.canDebrief && SupervisorGate.canDebrief());
        const talkHtml = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 class="text-lg font-bold text-slate-900">للمداولة وللمعلّم</h2>
            <div class="grid md:grid-cols-2 gap-4 mt-3">
                <div><div class="text-xs font-bold text-green-700 mb-1">ما يُعزَّز</div>${dp.good.length ? dp.good.map(t => `<p class="text-sm text-slate-700 leading-7">• ${esc(t)}</p>`).join('') : '<p class="text-sm text-slate-500">—</p>'}</div>
                <div><div class="text-xs font-bold text-amber-700 mb-1">أسئلةٌ من الرصد</div>${dp.ask.length ? dp.ask.map(t => `<p class="text-sm text-slate-700 leading-7">• ${esc(t)}</p>`).join('') : '<p class="text-sm text-slate-500">—</p>'}</div>
            </div>
            ${grow.length ? `<div class="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-700"><b class="text-slate-900">منذ الرصد السابق (<bdi>${esc(prev.date || '')}</bdi>):</b> ${grow.map(esc).join(' · ')}</div>` : ''}
            <div class="flex flex-wrap gap-2 mt-4">
                <button type="button" id="eyeCard" class="svf-btn svf-btn-primary"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i>بطاقة التحليل للمعلّم</button>
                <button type="button" id="eyePrint" class="svf-btn svf-btn-secondary"><i class="fa-solid fa-print" aria-hidden="true"></i>طباعة / PDF</button>
                ${canDebrief ? '<button type="button" id="eyeToDebrief" class="svf-btn svf-btn-ghost">افتح المداولة</button>' : ''}
            </div></div>`;

        const sugg = data.sugg || [];
        const applied = new Set(data.applied || []);
        const items = sugg.map(s => {
            const cur = document.querySelector('#score-' + s.id);
            const curScore = cur ? Number(cur.textContent) : null;
            const conf = s.conf && confText[s.conf] ? `<span class="inline-flex items-center gap-1 text-xs text-slate-600"><i class="inline-block w-2 h-2 rounded-full" style="background:${confColor[s.conf]}"></i>${esc(confText[s.conf])}</span>` : '';
            return `<li class="py-3 flex gap-3 items-start border-b border-slate-100 last:border-0">
                <input type="checkbox" class="eye-apply mt-1.5 w-4 h-4" data-id="${s.id}" data-score="${s.score}" ${curScore === s.score ? '' : 'checked'} aria-label="تطبيق اقتراح البند ${s.id}">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <b class="text-slate-900">${esc(title(s.id))}</b>${chip(s.score)}
                        <span class="text-xs text-slate-500">${esc(basisText[s.basis] || '')}</span>
                        ${conf}
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
                    <span class="text-xs text-slate-500">${esc(when)}${data.src === 'file' ? ' — من مقطعٍ مصوَّر' : data.src === 'none' ? ' — بلا كاميرا' : ''}</span>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                    <dl class="text-sm">${metrics}</dl>
                    <div class="pt-2">
                        ${data.summary ? `<p class="text-sm text-slate-700 leading-7 bg-slate-50 border border-slate-200 rounded-xl p-3">${esc(data.summary)}</p>
                        <button type="button" id="eyeToNotes" class="svf-btn svf-btn-secondary svf-btn-sm mt-3">إدراج الملخّص في «الملاحظات العامة»</button>` : ''}
                    </div>
                </div>
            </div>
            ${partsHtml}
            ${formsHtml}
            ${speechHtml}
            ${talkHtml}
            <div class="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 class="text-lg font-bold text-slate-900">التقييم المقترح</h2>
                <p class="text-sm text-slate-600 mt-1 leading-6">اقتراحٌ يُراجَع لا حكمٌ نهائيّ: يُقترح البند الذي عليه شاهدٌ من الرصد أو من لمساتك، ومع كلٍّ شاهده ودرجة الثقة فيه.
                   صحّح العدّادات إن لزم فيُعاد الاقتراح، ثمّ حدِّد ما تعتمده وطبّقه على نموذج التقييم — ويظهر الشاهد تحت البند فيه.</p>
                ${sugg.length ? `<ul class="mt-2">${items}</ul>` : '<p class="text-sm text-slate-600 py-4">لا بند عليه شاهدٌ كافٍ بعد. ارصد عشر دقائق على الأقلّ، أو المس عناصر الحصة والوسوم أثناءها.</p>'}
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
            S.tl = data.tl.split('').map((k, i) => ({ k, v: Number((data.tv || '')[i] || 0) / 9, c: (data.tc || '')[i] || '-' }));
            drawTimeline();
            $('eyeTlEnd').textContent = 'النهاية';
        }
        if (data.heat) { S.savedHeat = data.heat.split('').map(Number); drawHeat(S.savedHeat); }
        renderKpis(Object.assign({ states: [] }, M), M.seconds);
        $('eyeApply') && $('eyeApply').addEventListener('click', apply);
        $('eyeToNotes') && $('eyeToNotes').addEventListener('click', () => toNotes(data.summary));
        $('eyeNew').addEventListener('click', reset);
        $('eyeCard').addEventListener('click', () => shareCard('share'));
        $('eyePrint').addEventListener('click', () => shareCard('print'));
        $('eyeToDebrief') && $('eyeToDebrief').addEventListener('click', () => { if (typeof toggleSupervisoryView === 'function') toggleSupervisoryView('debrief-view'); });
        $('eyeClassSize') && $('eyeClassSize').addEventListener('change', e => {
            const v = Math.round(Number(e.target.value));
            if (!(v >= 1 && v <= 80) || !S.result || !S.result.M || !S.result.M.people) return;
            S.result.M.people.classSize = v;
            resuggest();
        });
        $('eyeSpeechPurge') && $('eyeSpeechPurge').addEventListener('click', () => {
            if (!S.result) return;
            let ok = false;
            try { ok = root.confirm('يُحذف نصّ كلام المعلّم وأمثلته من هذه الزيارة، وتبقى الأرقام والتقييم المقترح. متابعة؟'); } catch (e) { ok = false; }
            if (!ok) return;
            if (S.result.sp) { S.result.sp.seg = []; S.result.sp.purged = true; }
            if (S.result.M && S.result.M.speech && SX()) S.result.M.speech = SX().stripExamples(S.result.M.speech);
            save(S.result);
            renderResult(S.result);
            toast('حُذف النصّ — احفظ التقرير ليُحذف من نسخته المحفوظة');
        });
        $('eyeRecSave') && $('eyeRecSave').addEventListener('click', () => {
            const rec = {};
            box.querySelectorAll('[data-rec]').forEach(el => { const v = Number(el.value); if (v >= 0 && v <= 40) rec[el.dataset.rec] = v; });
            try { localStorage.setItem(REC_KEY, JSON.stringify(rec)); } catch (e) { /* تفضيلٌ لهذا المتصفّح */ }
            if (S.result && S.result.M) { S.result.M.rec = rec; resuggest(); }
            toast('حُفظ الزمن الموصى به للعناصر وأُعيد الاقتراح');
        });
        decorate();
    }

    // بطاقة التحليل للمعلّم (js/eye-report.js): صورةٌ تُشارَك (واتساب وغيره) أو صفحةٌ تُطبع PDF — من أرقام الرصد وحدها
    function shareCard(mode) {
        if (!S.result) return;
        if (!root.SvfEyeReport) { toast('تعذّر تحميل البطاقة — حدّث الصفحة', 'error'); return; }
        const I = info(), prev = prevEye();
        const extra = { grow: growthLines(S.result, prev), prevDate: prev && prev.date, prompts: E().debriefPrompts(S.result.M || {}, S.result.counts || {}, suggCtx()) };
        SvfEyeReport[mode === 'print' ? 'print' : 'share'](S.result, I, extra).then(r => {
            if (r === 'download') toast('حُفظت البطاقة صورةً في جهازك — أرسلها للمعلّم');
        }).catch(e => { if (!e || e.name !== 'AbortError') toast('تعذّرت مشاركة البطاقة', 'error'); });
    }

    // الشاهد تحت البند في «نموذج التقييم»: ما اقترحته العين وشاهده، بلا مساسٍ بالوصف الرسميّ
    function decorate() {
        let d = null;
        try { d = JSON.parse((($('eyeData') || {}).value) || 'null'); } catch (e) { d = null; }
        const by = {};
        ((d && d.sugg) || []).forEach(s => { by[s.id] = s; });
        document.querySelectorAll('#form-view [id^="item-"]').forEach(card => {
            const id = Number(card.id.slice(5));
            if (!id) return;
            let b = card.querySelector('.eye-badge');
            const s = by[id];
            if (!s) { if (b) b.remove(); return; }
            if (!b) {
                b = document.createElement('div');
                b.className = 'eye-badge mt-2 text-xs text-slate-600 leading-5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5';
                const host = card.querySelector('.flex-grow') || card;
                host.appendChild(b);
            }
            const lv = E().LEVELS[s.score] || '';
            const ev = String(s.evidence || '');
            b.textContent = '';
            const strong = document.createElement('b');
            strong.className = 'text-slate-800';
            strong.textContent = 'عين المشرف: «' + lv + '» ';
            b.appendChild(strong);
            b.appendChild(document.createTextNode(ev.length > 170 ? ev.slice(0, 168) + '…' : ev));
            b.title = ev;
        });
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
        S.ctxEvents = []; S.ctxCur = null; S.pSnap = null; S.src = null; S.consent = false; S.hadAudio = false; S.classMax = 0;
        S.sp = null; S.speechConsent = false;
        renderCounts();
        renderCtx();
        $('eyeResult').classList.add('hidden');
        $('eyeResult').innerHTML = '';
        $('eyeIdle').classList.remove('hidden');
        $('eyeTlEnd').textContent = 'الآن';
        renderKpis(null);
        drawTimeline([]);
        message('');
    }

    // ── اتّفاق العين معك (من التقارير المحفوظة) ──
    function agreementRows() {
        const rows = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || k.indexOf('supervision_v6_visit_') !== 0) continue;
                try {
                    const r = JSON.parse(localStorage.getItem(k));
                    const raw = r && r.formData && r.formData.eyeData;
                    if (!raw) continue;
                    const d = JSON.parse(raw);
                    if (d && d.final && Array.isArray(d.sugg)) rows.push({ sugg: d.sugg, final: d.final });
                } catch (e) { /* تقريرٌ تالف يُتخطّى */ }
            }
        } catch (e) { /* التخزين غير متاح */ }
        return rows;
    }
    function renderAgreement() {
        const box = $('eyeAgree');
        if (!box) return;
        const A = E().agreement(agreementRows());
        const head = `<div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-lg font-bold text-slate-900">اتّفاق العين معك</h2>
            <span class="text-xs text-slate-500">من التقارير المحفوظة: ما اقترحته العين وما اعتمدتَه أنت</span></div>`;
        if (!A.n) {
            box.innerHTML = head + `<p class="text-sm text-slate-600 mt-2 leading-6">حين تحفظ تقاريرَ اقترحت فيها العين تقييماً، يظهر هنا مدى اتّفاقها معك في كلّ بند —
                ومنه تُضبط عتباتها. بعد عشر حصصٍ تقريباً تصير الأرقام دالّة.</p>`;
            return;
        }
        const lean = b => (b >= 0.3 ? 'العين أكرم منك' : b <= -0.3 ? 'العين أشدّ منك' : 'متوازنة');
        box.innerHTML = head + `
            <div class="grid grid-cols-3 border border-slate-200 rounded-xl mt-3 text-center">
                <div class="py-3 border-l border-slate-200"><div class="text-2xl font-bold tabular-nums text-slate-900">${A.lessons}</div><div class="text-xs text-slate-600">حصص</div></div>
                <div class="py-3 border-l border-slate-200"><div class="text-2xl font-bold tabular-nums text-slate-900">${A.exact}%</div><div class="text-xs text-slate-600">تطابقٌ تامّ</div></div>
                <div class="py-3"><div class="text-2xl font-bold tabular-nums text-slate-900">${A.near}%</div><div class="text-xs text-slate-600">في حدود درجة</div></div>
            </div>
            <div class="overflow-x-auto mt-3"><table class="w-full text-sm">
                <thead><tr class="text-slate-500 text-xs"><th class="text-right font-medium py-2">البند</th><th class="font-medium">اقتراحات</th><th class="font-medium">تطابق</th><th class="font-medium">في حدود درجة</th><th class="font-medium">الميل</th></tr></thead>
                <tbody>${A.items.map(it => `<tr class="border-t border-slate-100"><td class="py-2 text-slate-800">${esc(title(it.id))}</td>
                    <td class="text-center tabular-nums">${it.n}</td><td class="text-center tabular-nums">${it.exact}%</td><td class="text-center tabular-nums">${it.near}%</td>
                    <td class="text-center text-xs text-slate-600">${esc(lean(it.bias))}</td></tr>`).join('')}</tbody></table></div>`;
    }

    // يُستدعى قبل حفظ التقرير (savePermanentReport): الدرجات المعتمدة للبنود المقترحة
    root.svfEyeBeforeSave = function () {
        const ta = $('eyeData');
        if (!ta || !ta.value) return;
        let d;
        try { d = JSON.parse(ta.value); } catch (e) { return; }
        if (!d || !Array.isArray(d.sugg) || !d.sugg.length) return;
        d.final = {};
        d.sugg.forEach(s => {
            const el = document.getElementById('score-' + s.id);
            const v = el ? parseInt(el.textContent, 10) : NaN;
            if (v >= 1 && v <= 5) d.final[s.id] = v;
        });
        const txt = JSON.stringify(d);
        const wasMine = ta.value === S.written;
        ta.value = txt;
        if (wasMine) { S.written = txt; S.result = d; }
        setTimeout(renderAgreement, 0);
    };

    // يُستدعى عند فتح التبويب (toggleSupervisoryView)
    root.svfEyeOpen = function () {
        if (!E()) return;
        if (!S.bound) build();
        renderAgreement();
        decorate();
        drawView();
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
            S.events = (data.ev || []).map(e => ({ t: e[0], k: e[1] }));
            renderCounts();
            renderResult(data);
        } catch (e) { /* بياناتٌ تالفة: تبقى الشاشة فارغة */ }
    };
    root.svfEyeStop = function () { stop(false); };
    // نموذج التقييم يستدعيها عند ظهوره (toggleSupervisoryView) وبعد التصفير: الشاهد تحت البنود أو إزالته
    root.svfEyeDecorate = function () { try { decorate(); } catch (e) { /* لا أثر على النموذج */ } };
    // المداولة (js/debrief.js): لوحة «من عين المشرف» للزيارة المفتوحة، أو فراغ
    root.svfEyeDebriefHtml = function () {
        let d = null;
        try { d = JSON.parse((($('eyeData') || {}).value) || 'null'); } catch (e) { d = null; }
        if (!d || !d.M || !E()) return '';
        const M = d.M, P = M.people && M.people.detSecs >= 60 ? M.people : null;
        const det = M.ctx && M.ctx.covered >= 60 ? E().partsDetail(M, M.rec) : null;
        const dp = E().debriefPrompts(M, d.counts || {}, suggCtx());
        const kv = (k, v) => `<div class="px-3 py-2"><div class="text-lg font-bold text-slate-900 tabular-nums">${esc(v)}</div><div class="text-[11px] text-slate-600">${esc(k)}</div></div>`;
        const mv = movingOf(M);
        return `<div class="bg-white rounded-2xl border border-slate-200 p-5">
            <div class="flex flex-wrap items-baseline justify-between gap-2"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-eye ml-2 text-slate-500"></i>من عين المشرف</h3>
                <button type="button" id="debriefEyeCard" class="svf-btn svf-btn-secondary svf-btn-sm">بطاقة التحليل للمعلّم</button></div>
            <div class="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-xl mt-3 divide-x divide-x-reverse divide-slate-200">
                ${kv('عدد الطلبة', P ? String(P.classSize || P.inside) : '—')}${kv('حركة الطلبة', mv != null ? mv + '%' : '—')}
                ${kv('التشكيلات', M.forms ? String(M.forms.count) : '—')}${kv('بغير الزيّ', String((d.counts || {}).dish || 0))}
            </div>
            ${M.speech && M.speech.clauses && SX() ? `<p class="text-sm text-slate-700 mt-3"><b class="text-slate-900">من كلامه:</b> ${esc(SX().line(M.speech))}</p>` : ''}
            ${det ? `<div class="flex flex-wrap gap-1.5 mt-3">${det.map(r => `<span class="text-xs rounded-lg border px-2 py-1 ${r.verdict === 'ok' ? 'border-green-200 text-green-800' : r.verdict === 'missing' ? 'border-red-200 text-red-800' : 'border-amber-200 text-amber-800'}">${esc(r.short)} ${r.minutes} د</span>`).join('')}</div>` : ''}
            ${dp.good.length ? `<div class="mt-3"><div class="text-[11px] font-bold text-green-700 mb-1">ما يُعزَّز</div>${dp.good.map(t => `<div class="text-sm text-slate-700 leading-7">• ${esc(t)}</div>`).join('')}</div>` : ''}
            ${dp.ask.length ? `<div class="mt-3"><div class="text-[11px] font-bold text-amber-700 mb-1">أسئلةٌ من الرصد</div>${dp.ask.map(t => `<div class="text-sm text-slate-700 leading-7">• ${esc(t)}</div>`).join('')}</div>` : ''}
        </div>`;
    };
    // سطورٌ قصيرةٌ للمعلّم في رسالة المداولة (واتساب)
    root.svfEyeTeacherLines = function () {
        let d = null;
        try { d = JSON.parse((($('eyeData') || {}).value) || 'null'); } catch (e) { d = null; }
        if (!d || !d.M || !E()) return '';
        const dp = E().debriefPrompts(d.M, d.counts || {}, suggCtx());
        const lines = ['من رصد الحصة:'];
        if (d.summary) lines.push(d.summary);
        dp.good.slice(0, 2).forEach(t => lines.push('✓ ' + t));
        return lines.join('\n');
    };
    root.svfEyeShareCard = function () {
        try {
            const d = JSON.parse((($('eyeData') || {}).value) || 'null');
            if (!d || !d.M) { toast('لا رصد بعين المشرف لهذه الزيارة', 'info'); return; }
            if (!S.result || S.written !== $('eyeData').value) { S.result = d; S.written = $('eyeData').value; }
            shareCard('share');
        } catch (e) { toast('لا رصد بعين المشرف لهذه الزيارة', 'info'); }
    };
})(typeof window !== 'undefined' ? window : this);
