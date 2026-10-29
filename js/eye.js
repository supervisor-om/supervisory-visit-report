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
//
// كاميرا الهاتف (2026-10-26): «كاميرا الهاتف» يعرض رمز QR يفتحه الـiPhone على الحامل (cam.html)، فتصل صورته مباشرةً إلى هذا الجهاز
// (js/eye-link.js — WebRTC على نقطة الاتّصال) وتُحلَّل هنا؛ والصوت وفهم الكلام من ميكروفون هذا الجهاز. الثواني بلا صورةٍ لا تُحسب.
// =========================================================================
(function (root) {
    'use strict';

    const E = () => root.SvfEye;
    const $ = id => document.getElementById(id);
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s) : String(s == null ? '' : s));
    const toast = (m, t) => { if (typeof root.showToast === 'function') root.showToast(m, t); };
    const RATING = () => (root.SVF_COLORS && root.SVF_COLORS.rating) || { 1: '#1d6b45', 2: '#0f4c81', 3: '#9a6f24', 4: '#b5452f', 5: '#7a2320' };
    // ألوان عناصر الحصة (الحرف من PARTS.c) — والحروف القديمة للتقارير المحفوظة قبل العناصر الخمسة
    // و r: الحضور والزيّ (ليس عنصراً — رماديٌّ مزرقّ)
    // نقاط الطلبة فوق الصورة: ذهبيّ ينتقل، أخضر فاتح يتمرّن في مكانه، أبيض ساكن، طوبيّ خارج المنطقة
    const DOT_FADE = 0.7, DOT_HIDE = 1.6;     // ثوانٍ منذ آخر لقطة: تبهت النقاط ثمّ تختفي (drawView)
    const DOT = { move: '#f0b44a', place: '#7fd1a4', still: '#e2e8f0', out: 'rgba(224,122,106,0.95)' };
    const CTX_COLOR = { w: '#d9a441', f: '#9a6f24', t: '#5b8fc7', a: '#2f6fae', c: '#246445', r: '#8492a6', e: '#64748b', o: '#b98a32', p: '#5b8fc7', g: '#246445' };
    const ROLL_TINT = 'rgba(132,146,166,.22)';       // مساحة الحضور والزيّ في مجرى الحصة
    const FORM_COLOR = { L: '#0f4c81', C: '#246445', G: '#9a6f24', S: '#64748b' };
    const REC_KEY = 'svf_eye_rec';
    // الزمن الموصى به لعناصر الحصة: ما حدّده دليل الدرس المختار أوّلاً (بطاقةٌ من ملفّ الدليل — js/eye-guide-import.js)، ثمّ اختيار المشرف
    const recPref = () => {
        try { const G = typeof guideOn === 'function' ? guideOn() : null; if (G && G.parts) return Object.assign({}, G.parts); } catch (e) { /* لا دليل */ }
        try { const v = JSON.parse(localStorage.getItem(REC_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
    };

    const W = 96;               // عرض الإطار المحلَّل
    const S = {
        bound: false, running: false, src: null, stream: null, video: null, canvas: null, cx: null, prev: null, h: 72,
        grid: null, secs: [], acc: null, events: [], counts: {}, t0: 0, lastSec: 0, timers: [], audio: null, ast: {},
        wake: null, fileUrl: null, written: '', result: null,
        roi: null, roiDraft: null, roiMode: false, mask: null, cells: null,
        ctxEvents: [], ctxCur: null, pSnap: null, pSnapAt: -1, runId: 0, classMax: 0,
        rollSpans: [], rollSig: '',                        // ثواني الحضور والزيّ (من summarize) — تُستثنى من تحليل الكلام حيّاً
        sp: null, speechConsent: false,
        simple: true, tagFreq: {},                         // وضع الحصة المبسّط، وكم لمس المشرف كلّ وسم (لاختيار «أهمّ ما تلمسه»)
        sample: null, sampleRound: 'a', marks: [],         // عيّنة الطلبة، وعلامات المشرف بأوقاتها
        teacher: null, pickTeacher: false,                 // المعلّم يُحدَّد بلمسة: يُستثنى من الطلبة ويُرصد موضعه
        // كاميرا الهاتف (js/eye-link.js): الصورة من الـiPhone، والصوت والكلام من ميكروفون هذا الجهاز
        via: null, link: null, linkGen: 0, linkSup: '', linkDown: false, lastFrameAt: 0, rvfc: false, frameTok: null,
        lostSec: 0, phoneCams: null, wantSpeech: false,
        // دليل المعلّم (js/lesson-guide.js): {id, skills, sure, on} — من الصفّ وعنوان الدرس، ومهارة الحصة يختارها المشرف
        guide: null, gkey: '', samplePick: -1,
        // الانقطاع (2026-10-28): رصدٌ يُكمَل من نسخته الاحتياطيّة، والمدّة الضائعة، وثواني توقّف الكاميرا، وانقطاع فهم الكلام
        resume: null, spSeed: null, gapSec: 0, resumes: 0, spOff: 0, lastCk: 0, ckWarned: false, camFrozenFor: 0
    };
    const IDLE_TEXT = 'ضع الجهاز أفقيّاً على حاملٍ ثابتٍ مرتفع يرى الملعب كلّه، ثمّ شغّل الكاميرا والمس أركان منطقة الصفّ.';
    const SAMPLE_HINT = 'طلبةٌ متفاوتون تقيّمهم في أوّل التطبيق ثمّ في آخره: المس الرقم ليتبدّل لم يتقن ← جزئيّاً ← أتقن. منها شاهد البندين ١ و٢.';
    const GRADE_NAME = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
    const SR = () => root.SpeechRecognition || root.webkitSpeechRecognition || null;
    const SX = () => root.SvfEyeSpeech;
    const LANGS = () => (SX() && SX().LANGS) || ['ar-OM', 'ar-SA'];
    const LG = () => root.SvfLessonGuide;
    const AI = { engine: null, loading: null, ok: false, busy: false, fail: 0, T: null, prevG: null, prevKey: '', canvas: null, cx: null,
                 timer: null, lastMs: 0, slow: 0, count: 0, ttl: 2.5 };
    const freshAcc = () => ({ sum: 0, n: 0, bad: 0, voice: 0, af: 0, whistle: false, lost: false });

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
    // مع العيّنة ومتابعة أهداف الزيارة السابقة — لكلّ ما يُبنى من بيانات رصدٍ محفوظة (الاقتراح، الملخّص، المداولة، البطاقة)
    const ctxOf = d => Object.assign(suggCtx(), { sample: d && d.sample, follow: d && d.follow ? d.follow.list : null, followDate: d && d.follow ? d.follow.date : null,
                                                  guide: d && d.guide && LG() ? LG().guideCtx(d) : null });
    const standardOf = id => { const it = typeof evaluationItems !== 'undefined' ? evaluationItems.find(x => x.id === id) : null; return it ? it.standard : 'البند ' + id; };
    const freshSample = n => ({ n: n || 8, a: '', b: '' });
    const hasSample = sm => !!(sm && /[123]/.test(String(sm.a || '') + String(sm.b || '')));
    const partShort = k => (k && E().PART[k] ? E().PART[k].short : '');
    // عنصر الحصة الذي كان قائماً عند الثانية t (من لمسات «عناصر الحصة»)
    const partAt = (cx, t) => { let k = null; (cx || []).forEach(e => { const et = Array.isArray(e) ? e[0] : e.t, ek = Array.isArray(e) ? e[1] : e.k; if (et <= t) k = ek; }); return k; };

function tagRowHtml(k) {
        const t = E().TAG[k];
        return `<div class="flex items-stretch gap-1">
                    <button type="button" class="eye-tag flex-1 min-w-0 flex items-center justify-between gap-2 text-right text-sm px-3 py-2 rounded-lg border bg-white transition-colors ${t.neg ? 'border-red-200 hover:border-red-500' : 'border-slate-200 hover:border-blue-500'}" data-tag="${k}">
                        <span class="min-w-0">${esc(t.label)}</span>
                        <b class="eye-count tabular-nums ${t.neg ? 'text-red-700' : 'text-blue-800'}" data-count="${k}">0</b></button>
                    <button type="button" class="eye-dec hidden flex-none w-11 text-lg rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-400" data-dec="${k}" aria-label="إنقاص ${esc(t.label)}">−</button>
                </div>`;
    }

    // ── البناء ──
    function build() {
        const body = $('eyeBody');
        if (!body) return;
        const tagRow = tagRowHtml;
        const sel = (id, label, opts) => `<label class="flex items-center justify-between gap-2 text-sm text-slate-700">${label}
                    <select id="${id}" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm">${opts}</select></label>`;
        const chk = (id, label, on, title) => `<label class="flex items-center gap-2 text-sm text-slate-700"${title ? ` title="${title}"` : ''}><input type="checkbox" class="w-5 h-5 flex-none" id="${id}"${on ? ' checked' : ''}> ${label}</label>`;
        const kpi = (id, label) => `<div class="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 min-w-0">
                    <div class="text-xs text-slate-600 truncate" id="${id}L">${label}</div><div class="text-lg font-bold text-slate-900 tabular-nums truncate" id="${id}">—</div></div>`;
        const card = (id, icon, name, sub, tag) => `<${tag === 'label' ? 'label for="eyeFile" role="button" tabindex="0"' : 'button type="button"'} id="${id}"
                    class="eye-src flex flex-col items-start gap-1 text-right rounded-xl border border-slate-200 bg-white p-4 min-w-0 cursor-pointer transition-colors hover:border-blue-500">
                    <i class="fa-solid ${icon} text-xl text-blue-800" aria-hidden="true"></i>
                    <span class="font-bold text-slate-900">${name}</span><span class="text-xs text-slate-500 leading-5">${sub}</span></${tag === 'label' ? 'label' : 'button'}>`;

        body.innerHTML = `
            <div class="svf-head" style="margin-bottom:0">
                <div>
                    <h1>عين المشرف</h1>
                    <p>تحليلٌ حيٌّ للحصة داخل جهازك: حركة الطلبة والانتظار وزمن عناصر الحصة والصفّارة وكلام المعلّم — تُتابَع لحظةً بلحظة،
                       ثمّ يُقترح تقييمٌ لكلّ بندٍ عليه شاهد.</p>
                </div>
            </div>

            <section id="eyeSetup" class="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <div id="eyeResume" class="hidden rounded-xl border border-amber-300 bg-amber-50 p-3" aria-live="polite">
                    <p id="eyeResumeText" class="text-sm text-amber-950 leading-6"></p>
                    <div class="flex flex-wrap gap-2 mt-2">
                        <button type="button" id="eyeResumeGo" class="svf-btn svf-btn-primary svf-btn-sm"><i class="fa-solid fa-play" aria-hidden="true"></i><span>أكمل الرصد</span></button>
                        <button type="button" id="eyeResumeAn" class="svf-btn svf-btn-secondary svf-btn-sm">حلّل ما رُصد</button>
                        <button type="button" id="eyeResumeDrop" class="svf-btn svf-btn-ghost svf-btn-sm">احذفه</button>
                    </div>
                </div>
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 class="font-bold text-slate-900">ابدأ الرصد</h2>
                    <span class="text-xs text-slate-500">من أين الصورة؟</span>
                </div>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    ${card('eyeStartCam', 'fa-video', 'كاميرا هذا الجهاز', 'على حاملٍ مرتفعٍ يرى الملعب كلّه')}
                    ${card('eyeStartPhone', 'fa-mobile-screen', 'كاميرا الهاتف', 'الـiPhone على الحامل، والمتابعة من هنا')}
                    ${card('eyeFileBtn', 'fa-film', 'مقطع مصوَّر', 'تحليل فيديو محفوظ في الجهاز', 'label')}
                    ${card('eyeStartNoCam', 'fa-stopwatch', 'بلا كاميرا', 'عناصر الحصة واللمسات والصوت')}
                </div>
                <input type="file" id="eyeFile" accept="video/*" class="hidden">
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
                    <label class="flex items-center gap-2 text-sm font-semibold text-slate-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <input type="checkbox" id="eyeConsent" class="w-5 h-5"> أُبلغ المعلّم بالرصد</label>
                    <button type="button" id="eyeGuideImport" class="svf-btn svf-btn-ghost svf-btn-sm" title="إضافة درسٍ من ملفّ دليل المعلّم (PDF) — يُحوَّل مرّةً ويُحفظ"><i class="fa-solid fa-book-open" aria-hidden="true"></i><span>دروس الدليل</span></button>
                    <details id="eyeSettings" class="flex-1 min-w-0">
                        <summary class="cursor-pointer select-none text-sm text-slate-700 flex items-center gap-2 py-1"><i class="fa-solid fa-sliders" aria-hidden="true"></i>
                            <b class="font-semibold">الإعدادات</b><span id="eyeSetSum" class="text-xs text-slate-500 truncate min-w-0"></span></summary>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-3">
                            <div class="space-y-2">
                                <div class="text-xs font-bold text-slate-500">الصورة</div>
                                ${sel('eyeFacing', 'الكاميرا', '<option value="environment">الخلفية</option><option value="user">الأمامية</option>')}
                                ${sel('eyeSens', 'الحساسية', '<option value="high">عالية</option><option value="medium" selected>متوسطة</option><option value="low">منخفضة</option>')}
                                ${sel('eyeRate', 'سرعة المقطع', '<option value="1">×1</option><option value="2">×2</option><option value="4">×4</option>')}
                                ${chk('eyeAI', 'كشف الطلبة (نموذجٌ داخل الجهاز)', true)}
                            </div>
                            <div class="space-y-2">
                                <div class="text-xs font-bold text-slate-500">الصوت</div>
                                ${chk('eyeMic', 'تحليل الصوت: الكلام والصفّارة', true)}
                                <select id="eyeMicDev" class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm" aria-label="الميكروفون"><option value="">الميكروفون الافتراضي</option></select>
                                ${chk('eyeTeacherMic', 'الميكروفون على المعلّم (لاسلكيّ)', false, 'ميكروفونٌ لاسلكيٌّ على ياقة المعلّم: يصير الكلام المرصود كلامه')}
                                <label id="eyeSpeechLbl" class="flex items-center gap-2 text-sm text-slate-700" title="يحوّل كلام المعلّم إلى نصٍّ ويحلّله: التعزيز والتصحيح والأسئلة والتحقّق من الفهم والسلامة — بإذن المعلّم"><input type="checkbox" id="eyeSpeech"> فهم الكلام (بإذن المعلّم)</label>
                            </div>
                            <div class="space-y-2 sm:col-span-2">
                                <div class="text-xs font-bold text-slate-500">مساعد الصياغة (Claude) — اختياريّ</div>
                                <p class="text-xs text-slate-500 leading-5">للربط المباشر: رابط الوسيط وكلمته (طريقة الإعداد في <bdi>tools/claude-draft/README.md</bdi>). بدونهما يعمل «نسخ الطلب لـClaude» مجّاناً.</p>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input type="url" id="eyeDraftUrl" dir="ltr" autocomplete="off" spellcheck="false" placeholder="https://svf-draft.….workers.dev" class="w-full min-w-0 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm" aria-label="رابط وسيط مساعد الصياغة">
                                    <input type="password" id="eyeDraftKey" dir="ltr" autocomplete="off" placeholder="كلمة الوسيط" class="w-full min-w-0 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm" aria-label="كلمة وسيط مساعد الصياغة">
                                </div>
                            </div>
                        </div>
                    </details>
                </div>
            </section>
            <section id="eyePair" class="hidden bg-white rounded-2xl border border-slate-200 p-4" aria-live="polite">
                <div class="flex flex-wrap items-start gap-4">
                    <div id="eyePairQr" class="flex-none w-44 h-44 rounded-xl border border-slate-200 bg-white p-1 flex items-center justify-center text-xs text-slate-500 text-center"></div>
                    <div class="flex-1 min-w-0 space-y-2" style="min-width:min(100%,16rem)">
                        <h2 class="font-bold text-slate-900">ربط كاميرا الهاتف</h2>
                        <ol class="text-sm text-slate-700 leading-7 list-decimal pr-5">
                            <li>الجهازان على شبكةٍ واحدة: شغّل «نقطة الاتّصال الشخصيّة» في الـiPhone واربط هذا الجهاز بها.</li>
                            <li>وجّه كاميرا الـiPhone إلى الرمز وافتح الرابط في Safari.</li>
                            <li>اضغط «تشغيل الكاميرا» هناك، وضع الهاتف <b>أفقيّاً</b> على الحامل — تُختار العدسة العريضة تلقائيّاً.</li>
                        </ol>
                        <p id="eyePairState" class="text-sm font-semibold text-slate-900"></p>
                        <p id="eyePairMic" class="text-xs text-slate-600 leading-5"></p>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" id="eyePairCopy" class="svf-btn svf-btn-ghost svf-btn-sm">نسخ الرابط</button>
                            <button type="button" id="eyePairNew" class="hidden svf-btn svf-btn-secondary svf-btn-sm">رمز جديد</button>
                            <button type="button" id="eyePairCancel" class="svf-btn svf-btn-ghost svf-btn-sm">إلغاء</button>
                        </div>
                    </div>
                </div>
            </section>
            <section id="eyeFocus" class="eye-adv hidden bg-white rounded-2xl border border-slate-200 border-r-4 p-4" style="border-right-color:#f0b44a" aria-live="polite"></section>
            <section id="eyeGuide" class="eye-adv hidden bg-white rounded-2xl border border-slate-200 p-4"></section>
            <p id="eyeMsg" class="hidden bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm" role="alert"></p>

            <div id="eyeWork" class="hidden space-y-5">
                <div class="eye-done-only flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-200 pt-4">
                    <h2 class="text-lg font-bold text-slate-900">ما رُصد في الحصة</h2>
                    <span class="text-xs text-slate-500">صحّح العدّادات أو العيّنة هنا فيُعاد الاقتراح أعلاه</span>
                </div>
                <section id="eyeLiveBar" class="hidden sticky z-30 rounded-2xl border border-slate-200 px-3 py-2 flex items-center gap-2 sm:gap-3" style="top:5rem;background-color:#fff;box-shadow:0 6px 18px rgba(8,39,66,.10)">
                    <span class="flex items-center gap-2"><i class="eye-rec inline-block w-2.5 h-2.5 rounded-full bg-red-600" aria-hidden="true"></i>
                        <b id="eyeLiveClock" class="text-xl tabular-nums text-slate-900">00:00</b></span>
                    <span id="eyeLivePart" class="flex-1 text-sm text-slate-700 min-w-0 truncate"></span>
                    <span id="eyeLiveSrc" class="hidden md:inline text-xs text-slate-500"></span>
                    <button type="button" id="eyeMore" class="svf-btn svf-btn-ghost" aria-pressed="false" title="إظهار كلّ أدوات الرصد أو العودة إلى الوضع المبسّط"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span id="eyeMoreL" class="hidden sm:inline">كل الأدوات</span></button>
                    <button type="button" id="eyeMark" class="svf-btn svf-btn-secondary" aria-label="علامة الآن"><i class="fa-solid fa-bookmark" aria-hidden="true"></i><span class="hidden sm:inline">علامة</span></button>
                    <button type="button" id="eyeStop" class="hidden svf-btn svf-btn-primary"><i class="fa-solid fa-stop" aria-hidden="true"></i>إيقاف وتحليل</button>
                </section>

                <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
                    <section class="lg:col-span-3 space-y-3 min-w-0">
                        <div id="eyeStage" class="relative rounded-2xl overflow-hidden bg-slate-900" style="aspect-ratio:16/9">
                            <video id="eyeVideo" playsinline muted class="absolute inset-0 w-full h-full object-contain" style="opacity:0"></video>
                            <canvas id="eyeView" class="absolute inset-0 w-full h-full" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;touch-action:none"></canvas>
                            <canvas id="eyeHeat" class="absolute inset-0 w-full h-full pointer-events-none hidden" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
                            <div id="eyeIdle" class="absolute inset-0 flex items-center justify-center text-center p-8 text-slate-300 text-sm leading-7">${esc(IDLE_TEXT)}</div>
                            <div id="eyeRoiHint" class="hidden pointer-events-none absolute top-3 inset-x-3 text-center text-sm text-white bg-slate-900/85 rounded-lg px-3 py-2"></div>
                            <div id="eyeStatus" class="hidden pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 bg-slate-900/80 text-white text-sm rounded-lg px-3 py-1.5" aria-live="polite">
                                <span class="w-2 h-2 rounded-full bg-red-500"></span><span id="eyeClock" class="tabular-nums">00:00</span><span class="opacity-60">|</span><span id="eyeState">—</span>
                                <span id="eyeAiState" class="hidden opacity-80 text-xs border-r border-white/30 pr-2 mr-1"></span></div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                            <button type="button" id="eyeRoiBtn" class="svf-btn svf-btn-secondary" disabled><i class="fa-solid fa-draw-polygon" aria-hidden="true"></i>تحديد منطقة الصف</button>
                            <button type="button" id="eyeRoiClear" class="hidden svf-btn svf-btn-ghost svf-btn-sm">مسح المنطقة</button>
                            <button type="button" id="eyeTeacherBtn" class="eye-adv svf-btn svf-btn-secondary" disabled title="المس المعلّم على الشاشة: يُستثنى من عدد الطلبة، ويُرصد هل يقف على أطرافهم ويتنقّل بينهم"><i class="fa-solid fa-user-tie" aria-hidden="true"></i><span>تحديد المعلّم</span></button>
                            <button type="button" id="eyeCamRestart" class="hidden svf-btn svf-btn-moe"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>إعادة تشغيل الكاميرا</button>
                            <span class="flex-1"></span>
                            <label class="flex items-center gap-2 min-h-[44px] px-1" title="أطفئها لتُخفى الصورة ويظهر الطلبة نقاطاً على صورةٍ رماديّة لا تُعرف فيها الوجوه"><input type="checkbox" id="eyeShowVideo" class="w-5 h-5" checked> إظهار الصورة</label>
                            <label class="flex items-center gap-2 min-h-[44px] px-1"><input type="checkbox" id="eyeHeatToggle" class="w-5 h-5"> خريطة الحركة</label>
                        </div>
                        <div id="eyeDotKey" class="eye-adv hidden flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600" aria-label="مفتاح نقاط الطلبة">
                            ${[['move', 'ينتقل في الملعب'], ['place', 'يتمرّن في مكانه'], ['still', 'ساكن'], ['out', 'خارج المنطقة']].map(([k, t]) =>
                                `<span class="flex items-center gap-1"><i class="inline-block w-2.5 h-2.5 rounded-full" style="background:${DOT[k]};box-shadow:0 0 0 1.5px #082742"></i>${t}</span>`).join('')}
                            <span class="flex items-center gap-1"><i class="inline-block w-2.5 h-2.5" style="background:#082742;box-shadow:0 0 0 1.5px #f0b44a"></i>المعلّم</span>
                        </div>
                        <div id="eyeLensRow" class="hidden flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span class="font-semibold text-slate-800">عدسة الهاتف</span>
                            <span id="eyeLens" class="flex flex-wrap gap-1.5"></span>
                            <label id="eyeZoomLbl" class="hidden flex items-center gap-1.5">التقريب <input type="range" id="eyeZoom" class="w-28"></label>
                            <button type="button" id="eyeWide" class="hidden svf-btn svf-btn-secondary svf-btn-sm" title="العدسة العريضة جدّاً وأقلّ تقريب — حين يكون الطلبة على حافّة الصورة"><i class="fa-solid fa-expand" aria-hidden="true"></i>أوسع زاوية</button>
                            <span class="flex-1"></span>
                            <button type="button" id="eyeRelink" class="hidden svf-btn svf-btn-moe svf-btn-sm"><i class="fa-solid fa-link" aria-hidden="true"></i>إعادة ربط الهاتف</button>
                        </div>

                        <div class="bg-white rounded-2xl border border-slate-200 p-3">
                            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <b class="text-sm text-slate-900">عناصر الحصة</b>
                                <span class="text-xs text-slate-500">المس العنصر حين يبدأ</span>
                            </div>
                            <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="group" aria-label="عناصر الحصة">
                                ${[E().ROLL].concat(E().PARTS).map(c => `<button type="button" class="eye-ctx svf-btn svf-btn-secondary flex-col !gap-1 !px-1 !py-2.5 text-xs leading-4 text-center" data-ctx="${c.k}" aria-pressed="false" title="${esc(c.admin ? c.label + ' — بداية الحصة: لا يُحسب شرحاً ولا انتظاراً' : c.label)}">
                                    <i class="inline-block w-full h-1 rounded-sm" style="background:${CTX_COLOR[c.c]}" aria-hidden="true"></i>${esc(c.short)}</button>`).join('')}
                            </div>
                            <p id="eyePlanHint" class="hidden text-xs text-blue-900 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 mt-2 leading-5" aria-live="polite"></p>
                            <p class="eye-adv text-[11px] text-slate-500 mt-1.5 leading-4">«حضور وزيّ» لتسجيل الغياب والزيّ — لا يُحسب شرحاً ولا انتظاراً، وإن لم تلمسه عُدّت بداية الحصة قبل أوّل نشاطٍ كذلك.</p>
                        </div>
                        <p class="eye-adv text-xs text-slate-500 leading-5">لا يُسجَّل فيديو ولا صوت ولا تُرسَل صورة: تُحلَّل الإطارات في ذاكرة الجهاز ثمّ تُنسى، ونموذج كشف الطلبة يعمل في الجهاز نفسه.</p>
                        <p id="eyeSpeechNote" class="eye-adv hidden text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-5"></p>
                        <div id="eyeEvLive" class="eye-adv hidden bg-white rounded-2xl border border-slate-200 p-4">
                            <div class="flex flex-wrap items-baseline justify-between gap-2">
                                <b class="text-sm text-slate-900">أدلّة الحصة حتّى الآن</b>
                                <span class="text-xs text-slate-500">تُكتب تحت بنودها في «نموذج التقييم» بأوقاتها</span>
                            </div>
                            <div id="eyeEvItems" class="flex flex-wrap gap-1.5 mt-2"></div>
                            <ul id="eyeEvLast" class="mt-2 space-y-1"></ul>
                        </div>
                        <div id="eyeSpeechLive" class="hidden bg-white rounded-2xl border border-slate-200 p-4" aria-live="polite">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <b class="text-sm text-slate-900">كلام المعلّم</b>
                                <span class="flex items-center gap-2"><span id="eyeSpeechState" class="text-xs text-slate-500"></span>
                                    <button type="button" id="eyeSpeechRetry" class="hidden svf-btn svf-btn-secondary svf-btn-sm">تشغيل فهم الكلام</button></span>
                            </div>
                            <p id="eyeSpeechText" class="eye-adv text-sm text-slate-800 leading-7 mt-2 min-h-[1.75rem]"></p>
                            <div id="eyeSpeechCue" class="hidden mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                                <p id="eyeCueText" class="text-xs text-blue-900 leading-5"></p>
                                <div class="flex flex-wrap items-center gap-2 mt-1.5">
                                    <button type="button" id="eyeCueOk" class="svf-btn svf-btn-primary svf-btn-sm"></button>
                                    <button type="button" id="eyeCueNo" class="svf-btn svf-btn-ghost svf-btn-sm">تجاهل</button>
                                    <span class="text-[11px] text-blue-800">يُسجَّل من لحظة قوله</span>
                                </div>
                            </div>
                            <p id="eyeSpeechQuiet" class="hidden mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-5"></p>
                            <div id="eyeSpeechCounts" class="eye-adv flex flex-wrap gap-1.5 mt-2"></div>
                        </div>
                    </section>

                    <aside class="lg:col-span-2 min-w-0">
                        <section id="eyeQuick" class="eye-simple-only bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
                            <div class="flex flex-wrap items-baseline justify-between gap-2">
                                <b class="text-sm text-slate-900">أهمّ ما تلمسه</b>
                                <span class="text-[11px] text-slate-500">الأكثر استعمالاً عندك · الباقي في «كل الأدوات»</span>
                            </div>
                            <p id="eyeQuickAlert" class="hidden rounded-lg border px-3 py-2 text-sm leading-6" aria-live="polite"></p>
                            <div id="eyeQuickTags" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1.5"></div>
                        </section>
                        <section id="eyeMonitor" class="eye-adv bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                            <div class="flex items-center justify-between gap-2">
                                <h2 id="eyeMonTitle" class="font-bold text-slate-900">المتابعة الحيّة</h2>
                                <span id="eyeMonState" class="text-xs font-bold rounded-full px-2.5 py-1 bg-slate-100 text-slate-600">—</span>
                            </div>
                            <div>
                                <div id="eyeMonLabel" class="text-sm text-slate-600">حركة الطلبة الآن</div>
                                <b id="eyeMonNow" class="block text-5xl font-bold tabular-nums text-slate-900 leading-tight">—</b>
                                <div id="eyeMonSub" class="text-xs text-slate-500 mt-1 leading-5"></div>
                            </div>
                            <div id="eyeSparkWrap">
                                <div class="relative h-24"><canvas id="eyeSpark" class="absolute inset-0 w-full h-full" style="position:absolute;inset:0;width:100%;height:100%" role="img" aria-label="حركة الطلبة في آخر خمس دقائق"></canvas></div>
                                <div class="flex justify-between text-[11px] text-slate-500 mt-1"><span>قبل ٥ دقائق</span><span>الآن</span></div>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                ${kpi('eyeKpiPupils', 'الطلبة (الأكبر)')}${kpi('eyeMonIdle', 'الانتظار')}
                                ${kpi('eyeKpiForm', 'التشكيل')}${kpi('eyeKpiWhistle', 'الصفّارة')}
                                ${kpi('eyeKpiOut', 'خارج المنطقة')}${kpi('eyeKpiDish', 'بغير الزيّ (تقديري)')}
                            </div>
                            <div>
                                <div class="flex items-baseline justify-between gap-2 mb-2"><b class="text-sm text-slate-900">زمن عناصر الحصة</b><span class="text-[11px] text-slate-500">الخطّ: الموصى به</span></div>
                                <div id="eyeMonParts" class="space-y-1.5"></div>
                            </div>
                            <div id="eyeAlerts" class="space-y-1.5" aria-live="polite"></div>
                        </section>
                    </aside>
                </div>

                <section class="eye-adv bg-white rounded-2xl border border-slate-200 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <b class="text-sm text-slate-900">مجرى الحصة</b>
                        <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                            <span class="flex items-center gap-1"><i class="inline-block w-3 h-3 rounded-sm" style="background:rgba(15,76,129,.25);border-top:2px solid #0f4c81"></i>حركة الطلبة</span>
                            <span class="flex items-center gap-1"><i class="inline-block w-3 h-2 rounded-sm" style="background:#cbd5e1"></i>انتظار</span>
                            <span class="flex items-center gap-1"><i class="inline-block w-3 h-2 rounded-sm" style="background:${CTX_COLOR.r}"></i>حضور وزيّ</span>
                            <span class="flex items-center gap-1"><i class="inline-block w-3 h-2 rounded-sm" style="background:#d9a441"></i>كلام المعلّم</span>
                            <span class="flex items-center gap-1"><i class="inline-block" style="width:0;height:0;border-inline:5px solid transparent;border-top:7px solid #082742"></i>صفّارة</span>
                            <span class="flex items-center gap-1"><i class="inline-block w-1 h-3" style="background:#b5452f"></i>لمسة</span>
                            <span class="flex items-center gap-1"><i class="inline-block w-2 h-3" style="background:#f0b44a"></i>علامة</span>
                        </span>
                    </div>
                    <div class="relative">
                        <canvas id="eyeTimeline" class="w-full block" style="width:100%;height:150px;display:block;touch-action:pan-y" role="img" aria-label="مجرى الحصة: حركة الطلبة والانتظار والعناصر وكلام المعلّم عبر الزمن"></canvas>
                        <div id="eyeTlTip" class="hidden pointer-events-none absolute top-1 z-10 bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 leading-5 whitespace-nowrap"></div>
                    </div>
                    <div class="flex justify-between text-[11px] text-slate-500 mt-1"><span>البداية</span><span id="eyeTlEnd">الآن</span></div>
                </section>

                <div class="eye-adv grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <section class="bg-white rounded-2xl border border-slate-200 p-4">
                        <div class="flex items-center justify-between gap-2">
                            <h2 class="font-bold text-slate-900">ما لا تراه الكاميرا</h2>
                            <button type="button" id="eyeUndo" class="svf-btn svf-btn-ghost svf-btn-sm" disabled>تراجع</button>
                        </div>
                        <p class="text-xs text-slate-600 mt-1 leading-5">المس الوسم كلّما رأيته، و«−» يصحّح العدد أثناء الحصة وبعدها.</p>
                        <div class="flex gap-1 overflow-x-auto mt-3 pb-1" role="tablist" aria-label="مجموعات الوسوم">
                            ${E().GROUPS.map((gp, i) => `<button type="button" role="tab" class="eye-gtab flex-none svf-btn svf-btn-sm ${i ? 'svf-btn-ghost' : 'svf-btn-secondary'}" data-gtab="${i}" aria-selected="${i ? 'false' : 'true'}">${esc(gp.title)}<b class="eye-gcount tabular-nums text-blue-800" data-gcount="${i}"></b></button>`).join('')}
                        </div>
                        ${E().GROUPS.map((gp, i) => `<div class="eye-gpanel grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2${i ? ' hidden' : ''}" data-gpanel="${i}" role="tabpanel">${gp.keys.map(tagRow).join('')}</div>`).join('')}
                        <button type="button" id="eyeTapsOnly" class="svf-btn svf-btn-secondary svf-btn-sm w-full mt-4">اقترح التقييم من لمساتي وحدها</button>
                    </section>
                    <div class="space-y-5 min-w-0">
                        <section class="bg-white rounded-2xl border border-slate-200 p-4">
                            <div class="flex items-center justify-between gap-2">
                                <h2 class="font-bold text-slate-900">عيّنة الطلبة — إتقان المهارة</h2>
                                <label class="flex items-center gap-1.5 text-xs text-slate-600">العدد
                                    <select id="eyeSampleN" class="bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-sm">${[5, 6, 8, 10, 12].map(n => `<option value="${n}"${n === 8 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
                            </div>
                            <p id="eyeSampleHint" class="text-xs text-slate-600 mt-1 mb-2 leading-5">${esc(SAMPLE_HINT)}</p>
                            <div class="grid grid-cols-2 gap-1.5" role="group" aria-label="القراءة">
                                <button type="button" class="eye-round svf-btn svf-btn-primary svf-btn-sm" data-round="a" aria-pressed="true">أوّل التطبيق</button>
                                <button type="button" class="eye-round svf-btn svf-btn-secondary svf-btn-sm" data-round="b" aria-pressed="false">آخر الحصة</button>
                            </div>
                            <div id="eyeSampleChips" class="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mt-2"></div>
                            <div id="eyeSamplePts"></div>
                            <p id="eyeSampleSum" class="text-xs text-slate-600 mt-2 leading-5"></p>
                        </section>
                        <section class="bg-white rounded-2xl border border-slate-200 p-4">
                            <b class="text-sm text-slate-900">لحظات للمداولة</b>
                            <p class="text-xs text-slate-500 mt-1 leading-5">«علامة» في شريط الرصد تحفظ اللحظة وعنصرها؛ اكتب ملاحظةً قصيرة إن شئت.</p>
                            <ul id="eyeMarks" class="mt-2 space-y-1.5"></ul>
                        </section>
                    </div>
                </div>
            </div>

            <section id="eyeResult" class="hidden space-y-4" aria-live="polite"></section>
            <section id="eyeAgree" class="eye-adv bg-white rounded-2xl border border-slate-200 p-5"></section>
            <section id="eyePatterns" class="eye-adv bg-white rounded-2xl border border-slate-200 p-5"></section>`;

        S.canvas = document.createElement('canvas');
        S.canvas.width = W; S.canvas.height = S.h;
        S.cx = S.canvas.getContext('2d', { willReadFrequently: true });

        const fresh = fn => () => {
            if (S.running) return;
            if (ckRead()) {
                let ok = false;
                try { ok = root.confirm('يوجد رصدٌ لم يكتمل — بدء رصدٍ جديدٍ يحذفه.\n«أكمل الرصد» أو «حلّل ما رُصد» في أعلى الشاشة يحفظانه.\n\nبدء رصدٍ جديد؟'); } catch (e) { ok = false; }
                if (!ok) return;
                ckClear();
            }
            S.resume = null;
            fn();
        };
        $('eyeStartCam').addEventListener('click', fresh(startCamera));
        $('eyeStartNoCam').addEventListener('click', fresh(startNoCam));
        $('eyeStartPhone').addEventListener('click', fresh(startPhone));
        $('eyeResumeGo').addEventListener('click', resumeGo);
        $('eyeResumeAn').addEventListener('click', resumeAnalyze);
        $('eyeResumeDrop').addEventListener('click', resumeDrop);
        $('eyeCamRestart').addEventListener('click', restartCamera);
        // الصفحة تُخفى (تطبيقٌ آخر، قفل الشاشة) أو تُغلق: نسخةٌ احتياطيّةٌ فوراً — Safari قد يُغلقها في الخلفيّة دون إنذار
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ckSave(); });
        root.addEventListener('pagehide', ckSave);
        $('eyePairCancel').addEventListener('click', cancelPhone);
        $('eyePairNew').addEventListener('click', () => { if (S.linkSup) openLink(S.linkSup); });
        $('eyeRelink').addEventListener('click', () => { if (S.running && S.via === 'phone' && S.linkSup) openLink(S.linkSup); });
        $('eyePairCopy').addEventListener('click', copyPairUrl);
        $('eyeLens').addEventListener('click', e => { const b = e.target.closest('[data-lens]'); if (b) phoneLens(b.dataset.lens); });
        $('eyeZoom').addEventListener('change', () => phoneZoom($('eyeZoom').value));
        $('eyeWide').addEventListener('click', phoneWide);
        $('eyeSpeechRetry').addEventListener('click', restartSpeech);
        $('eyeFile').addEventListener('click', e => { if (!needConsent(true)) e.preventDefault(); });
        $('eyeFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) startFile(f); });
        $('eyeFileBtn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('eyeFile').click(); } });
        $('eyeStop').addEventListener('click', () => stop(true));
        $('eyeUndo').addEventListener('click', undo);
        $('eyeTapsOnly').addEventListener('click', () => { if (!S.running) finish(); });
        $('eyeHeatToggle').addEventListener('change', () => { $('eyeHeat').classList.toggle('hidden', !$('eyeHeatToggle').checked); drawHeat(S.running ? undefined : S.savedHeat || undefined); if (!S.running) layout(); });
        // الصورة طبيعيّةٌ افتراضاً (طلب المشرف 2026-10-26)، وإخفاؤها اختيارٌ يُذكر في هذا المتصفّح
        try { if (localStorage.getItem('svf_eye_show') === '0') $('eyeShowVideo').checked = false; } catch (e) { /* يبقى الافتراض */ }
        $('eyeShowVideo').addEventListener('change', () => {
            try { localStorage.setItem('svf_eye_show', checked('eyeShowVideo') ? '1' : '0'); } catch (e) { /* تفضيلٌ لا يلزم حفظه */ }
            applyVideoVisibility(); drawView();
        });
        $('eyeRoiBtn').addEventListener('click', toggleRoiMode);
        $('eyeRoiClear').addEventListener('click', () => setRoi(null));
        $('eyeTeacherBtn').addEventListener('click', toggleTeacherPick);
        $('eyeView').addEventListener('pointerdown', roiPoint);
        $('eyeConsent').addEventListener('change', () => { if (checked('eyeConsent')) message(''); });
        // فهم الكلام: متاحٌ حيث يدعم المتصفّح التعرّف على الكلام (Chrome، Edge، Safari)
        if (!SR()) { $('eyeSpeech').disabled = true; $('eyeSpeechLbl').title = 'هذا المتصفّح لا يدعم التعرّف على الكلام — استعمل Chrome'; $('eyeSpeechLbl').classList.add('opacity-50'); }
        $('eyeSpeech').addEventListener('change', speechNote);
        body.querySelectorAll('.eye-tag').forEach(b => b.addEventListener('click', () => tap(b.dataset.tag, b)));
        body.querySelectorAll('.eye-dec').forEach(b => b.addEventListener('click', () => dec(b.dataset.dec)));
        body.querySelectorAll('.eye-ctx').forEach(b => b.addEventListener('click', () => setCtx(b.dataset.ctx)));
        $('eyeCueOk').addEventListener('click', () => { const c = S.cue; if (c) { setCtx(c.k, c.t); flash($('eyeCueOk'), '#1d6b45', 300); } });
        $('eyeCueNo').addEventListener('click', () => { S.cue = null; renderCue(); });
        $('eyeMark').addEventListener('click', addMark);
        $('eyeMore').addEventListener('click', () => { S.simple = !S.simple; savePrefs(); layout(); if (!S.simple) { drawTimeline(); drawSpark(); drawView(); } });
        // «أهمّ ما تلمسه» يُرسم من جديد في كلّ رصد، فالأحداث بالتفويض لا على أزرارٍ تُستبدل
        $('eyeQuickTags').addEventListener('click', e => {
            const t = e.target.closest('[data-tag]'); if (t) { tap(t.dataset.tag, t); return; }
            const d = e.target.closest('[data-dec]'); if (d) dec(d.dataset.dec);
        });
        $('eyeMarks').addEventListener('input', e => { const i = +e.target.dataset.mark; if (S.marks[i]) { S.marks[i].note = e.target.value.slice(0, 160); syncMarks(false); } });
        $('eyeMarks').addEventListener('change', e => {
            if (e.target.dataset.markitem != null) {
                const m = S.marks[+e.target.dataset.markitem];
                if (m) { m.item = Number(e.target.value) || null; if (S.running) refreshEvidence(); else syncMarks(true); }
                return;
            }
            if (e.target.dataset.mark != null) syncMarks(true);
        });
        $('eyeMarks').addEventListener('click', e => { const b = e.target.closest('[data-unmark]'); if (b) { S.marks.splice(+b.dataset.unmark, 1); renderMarks(); drawTimeline(); syncMarks(true); } });
        body.querySelectorAll('.eye-round').forEach(b => b.addEventListener('click', () => { S.sampleRound = b.dataset.round; renderSample(); }));
        $('eyeSampleChips').addEventListener('click', e => { const b = e.target.closest('[data-pupil]'); if (b) sampleTap(+b.dataset.pupil); });
        $('eyeSamplePts').addEventListener('click', e => { const b = e.target.closest('[data-spt]'); if (b) samplePoint(b.dataset.spt); });
        // دروس الدليل من ملفّه (js/eye-guide-import.js): نافذةٌ تُفتح من بطاقة البدء أو من بطاقة الدليل
        const openImport = () => { if (root.SvfGuideImport) root.SvfGuideImport.open(); else toast('أداة الدليل لم تُحمَّل — أعد تحميل الصفحة', 'error'); };
        $('eyeGuideImport').addEventListener('click', openImport);
        // بطاقةٌ اعتُمدت أو حُذفت أو نزلت من جهازٍ آخر: يُعاد كشف دليل الدرس (ما لم يكن تقريرٌ محفوظٌ اختار دليله)
        document.addEventListener('svf-guides-changed', () => {
            if (S.result && S.result.guide) { renderGuide(); return; }
            S.gkey = null; detectGuide(); renderGuide(); renderSample(); planHint();
        });
        $('eyeGuide').addEventListener('click', e => {
            if (e.target.closest('[data-gimport]')) { openImport(); return; }
            const b = e.target.closest('[data-gskill],[data-gopen],[data-gmin]');
            if (!b || !S.guide) return;
            if (b.dataset.gskill) guideSkill(b.dataset.gskill);
            else if (b.hasAttribute('data-gopen')) { S.guide.on = true; S.guide.min = false; guideChanged(); }
            else { S.guide.min = !S.guide.min; renderGuide(); }    // طيّ البطاقة لا يُلغي الدليل
        });
        $('eyeSampleN').addEventListener('change', () => { const sm = S.sample || freshSample(); sm.n = +$('eyeSampleN').value || 8; S.sample = sm; renderSample(); sampleChanged(); });
        // مجموعات الوسوم تبويباتٌ — قائمةٌ قصيرةٌ بدل أربع مجموعاتٍ متتالية
        body.querySelectorAll('.eye-gtab').forEach(b => b.addEventListener('click', () => {
            body.querySelectorAll('.eye-gtab').forEach(x => { const on = x === b; x.classList.toggle('svf-btn-secondary', on); x.classList.toggle('svf-btn-ghost', !on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
            body.querySelectorAll('.eye-gpanel').forEach(p => p.classList.toggle('hidden', p.dataset.gpanel !== b.dataset.gtab));
        }));
        // الإعدادات تُذكر في هذا المتصفّح، فلا تُضبط في كلّ حصة
        loadPrefs();
        PREF_IDS.forEach(id => { const el = $(id); if (el) el.addEventListener('change', savePrefs); });
        setSummary();
        // مجرى الحصة: المرور (أو اللمس) يعرض وقت المقطع وعنصره وحالته وأرقامه
        $('eyeTimeline').addEventListener('pointermove', tlTip);
        $('eyeTimeline').addEventListener('pointerdown', tlTip);
        $('eyeTimeline').addEventListener('pointerleave', () => $('eyeTlTip').classList.add('hidden'));
        root.addEventListener('resize', () => { drawTimeline(); drawHeat(); drawView(); drawSpark(); });
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', refreshMics);
        refreshMics();
        renderKpis(null);
        renderQuick();
        renderSample();
        renderMarks();
        S.bound = true;
        layout();
    }

    // ── الإعدادات المحفوظة ──
    const PREF_KEY = 'svf_eye_prefs';
    const PREF_IDS = ['eyeFacing', 'eyeSens', 'eyeRate', 'eyeAI', 'eyeMic', 'eyeMicDev', 'eyeTeacherMic', 'eyeSpeech', 'eyeDraftUrl', 'eyeDraftKey'];
    function readPrefs() { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); return p && typeof p === 'object' ? p : null; } catch (e) { return null; } }
    function loadPrefs() {
        const p = readPrefs();
        if (!p) return;
        if ('simple' in p) S.simple = p.simple !== false;
        if (p.freq && typeof p.freq === 'object') S.tagFreq = Object.assign({}, p.freq);
        PREF_IDS.forEach(id => {
            const el = $(id);
            if (!el || !(id in p) || el.disabled) return;
            if (el.type === 'checkbox') el.checked = !!p[id];
            else if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(p[id]))) return;   // الميكروفون يُستعاد حين تُسرد الأجهزة
            else el.value = String(p[id]);
        });
        speechNote();
    }
    function savePrefs() {
        const p = { simple: S.simple !== false, freq: S.tagFreq || {} };
        PREF_IDS.forEach(id => { const el = $(id); if (el) p[id] = el.type === 'checkbox' ? el.checked : el.value; });
        try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* تُستعمل لهذه المرّة */ }
        setSummary();
        const dg = $('eyeDraftGo');                       // الربط المباشر يظهر حين يُكتب رابط الوسيط وكلمته
        if (dg) { dg.classList.toggle('hidden', !draftLinked()); $('eyeDraftCopy').classList.toggle('svf-btn-secondary', !draftLinked()); $('eyeDraftCopy').classList.toggle('svf-btn-ghost', draftLinked()); }
    }
    // سطرٌ واحد يلخّص الإعدادات الجارية بجانب «الإعدادات»
    function setSummary() {
        const el = $('eyeSetSum');
        if (!el) return;
        const mic = $('eyeMicDev'), micName = mic && mic.value ? (mic.selectedOptions[0] || {}).textContent : '';
        el.textContent = '— ' + [
            $('eyeFacing').value === 'user' ? 'الكاميرا الأماميّة' : 'الكاميرا الخلفيّة',
            checked('eyeAI') ? 'كشف الطلبة' : 'بلا كشف الطلبة',
            checked('eyeMic') ? 'الصوت' + (checked('eyeTeacherMic') ? ' من ميكروفون المعلّم' : micName ? ': ' + micName : '') : 'بلا صوت',
            checked('eyeSpeech') ? 'فهم الكلام' : '',
            draftLinked() ? 'مساعد الصياغة مربوط' : ''
        ].filter(Boolean).join(' · ');
    }

    // ── ما يظهر: الإعداد قبل الرصد، ومساحة الرصد أثناءه وبعده ──
    function layout() {
        if (!$('eyeSetup')) return;
        const pairing = !$('eyePair').classList.contains('hidden');
        $('eyeSetup').classList.toggle('hidden', S.running || pairing);
        $('eyeWork').classList.toggle('hidden', !(S.running || S.result));
        $('eyeLiveBar').classList.toggle('hidden', !S.running);
        // وضع الحصة المبسّط: أثناء الرصد وحده — بعد الإيقاف تظهر النتيجة والأدوات كلّها
        const simple = S.running && S.simple !== false;
        $('eyeBody').toggleAttribute('data-eye-simple', simple);
        // بعد الإيقاف: النتيجة أوّلاً (styles.css) — إلّا إن كانت لافتة الاستكمال ظاهرة (هي في بطاقة البدء)
        $('eyeBody').toggleAttribute('data-eye-done', !S.running && !!S.result && !pairing && $('eyeResume').classList.contains('hidden'));
        $('eyeMore').setAttribute('aria-pressed', S.simple === false ? 'true' : 'false');
        $('eyeMoreL').textContent = S.simple === false ? 'مبسّط' : 'كل الأدوات';
        // أثناء الرصد يبقى شريط الرصد وحده لاصقاً: شريط التبويبات اللاصق معه كان يأخذ ربع شاشة الجوّال (فحص 2026-10-29)
        document.documentElement.toggleAttribute('data-eye-running', !!S.running);
        if (S.running) placeBar();
        else {
            // بعد الرصد: الشاشة فارغة (لا يُحفظ فيديو) — يُقال ذلك بدل تعليمات التركيب، وتُمسح أيّ نقاطٍ بقيت
            if (S.result) $('eyeIdle').textContent = 'انتهى الرصد — لا يُحفظ فيديو ولا صورة.' + (S.result.heat ? ' «خريطة الحركة» تُظهر أين تحرّك الطلبة.' : '');
            $('eyeIdle').classList.toggle('hidden', !!(S.result && S.result.heat) && checked('eyeHeatToggle'));
            drawView();
        }
        // لوحة النقاط لا تُرى إلّا أثناء الرصد: مسحُها بعد الإيقاف لم يكفِ — بقيت نقاط آخر لقطةٍ أحياناً حين انتهى المقطع وحده (فحص Chromium)
        $('eyeView').style.visibility = S.running ? '' : 'hidden';
        planHint();
    }
    // شريط الرصد يلتصق تحت شريط التبويبات (وهو لاصقٌ أيضاً) فلا يختفي «إيقاف» و«علامة» عند التمرير
    function placeBar() {
        const bar = $('eyeLiveBar'), head = document.querySelector('#supervisoryVisitsApp header');
        let top = 8;
        try { if (head && getComputedStyle(head).position === 'sticky') top = (parseFloat(getComputedStyle(head).top) || 0) + head.offsetHeight + 8; } catch (e) { /* الافتراض */ }
        bar.style.top = top + 'px';
    }

    // ── المتابعة الحيّة ──
    const MV_COLOR = v => (v == null ? 'text-slate-900' : v >= 55 ? 'text-green-700' : v >= 40 ? 'text-slate-900' : v >= 25 ? 'text-amber-700' : 'text-red-700');
    const lessonMin = () => { const r = recPref(); return E().PARTS.reduce((s, x) => s + (r && r[x.k] > 0 ? Number(r[x.k]) : x.min), 0); };
    // زمن العناصر: الفعليّ مقابل الموصى به (الخطّ عند ثلثي الشريط)، والجاري بارز — {k, short, label, sec, rec (ثوانٍ), cur}
    function partsBars(list) {
        return list.map(x => {
            const scale = 1.5 * x.rec, w = scale ? Math.min(100, 100 * x.sec / scale) : 0, over = x.over != null ? x.over : x.sec > x.rec + 120;
            return `<div class="flex items-center gap-2 text-xs">
                <span class="w-[4.5rem] flex-none truncate ${x.cur ? 'font-bold text-slate-900' : 'text-slate-600'}">${esc(x.short)}</span>
                <span class="relative flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden" title="${esc(x.label + ': ' + mmss(x.sec) + ' من ' + mmss(x.rec))}">
                    <i class="absolute inset-y-0 right-0 rounded-full" style="width:${w}%;background:${CTX_COLOR[E().PART[x.k].c]}${x.cur ? '' : ';opacity:.85'}"></i>
                    <i class="absolute inset-y-0 w-0.5 bg-slate-600" style="right:${(100 / 1.5).toFixed(1)}%"></i></span>
                <span class="w-[5.75rem] flex-none text-left tabular-nums whitespace-nowrap ${over ? 'text-red-700 font-bold' : x.cur ? 'text-slate-900 font-bold' : 'text-slate-500'}" dir="ltr">${mmss(x.sec)} / ${mmss(x.rec)}</span></div>`;
        }).join('');
    }
    // الحضور والزيّ فوق أشرطة العناصر: سطرٌ خافت (ليس عنصراً، ولا زمن موصى به له)
    function rollLine(sec, cur, auto) {
        if (!(sec >= 10)) return '';
        return `<div class="flex items-center gap-2 text-xs text-slate-500">
            <span class="w-[4.5rem] flex-none truncate ${cur ? 'font-bold text-slate-800' : ''}"><i class="inline-block w-2 h-2 rounded-sm ml-1" style="background:${CTX_COLOR.r}"></i>${esc(E().ROLL.short)}</span>
            <span class="flex-1 min-w-0 truncate">لا يُحسب شرحاً ولا انتظاراً${auto ? ' · تلقائيّاً' : ''}</span>
            <span class="w-[4.5rem] flex-none text-left tabular-nums ${cur ? 'font-bold text-slate-800' : ''}">${mmss(sec)}</span></div>`;
    }
    // بعد الرصد (أو عند فتح تقريرٍ محفوظ) تصير اللوحة «ملخّص الرصد»: أرقام الحصة كلّها لا آخر لحظة، ولا تنبيهات
    function renderMonitorDone(data) {
        if (!$('eyeMonitor') || !data) return;
        const M = data.M || {};
        const P = M.people && M.people.movingAll != null && M.people.detSecs >= 60 ? M.people : null;
        $('eyeMonTitle').textContent = 'ملخّص الرصد';
        const badge = $('eyeMonState');
        badge.textContent = 'انتهى · ' + mmss(M.seconds || 0);
        badge.className = 'text-xs font-bold rounded-full px-2.5 py-1 bg-slate-100 text-slate-700';
        const hero = $('eyeMonNow'), lbl = $('eyeMonLabel'), sub = $('eyeMonSub');
        let v = null;
        if (P) {
            v = P.movingPlay != null ? P.movingPlay : P.movingAll;
            lbl.textContent = 'حركة الطلبة في الحصة';
            sub.textContent = [P.movingPlay != null ? 'في العناصر النشطة · الحصة كلّها ' + P.movingAll + '%' : 'من زمن الرصد', 'المعيار ٥٠٪'].join(' · ');
        } else if (M.observed >= 20) {
            v = M.activePct;
            lbl.textContent = 'النشاط الحركيّ في الحصة';
            sub.textContent = 'من حركة الصورة';
        } else {
            lbl.textContent = 'زمن الرصد';
            sub.textContent = data.audio ? 'كلام المعلّم ' + (M.talkPct || 0) + '% من الوقت' : '';
        }
        hero.textContent = v != null ? v + '%' : mmss(M.seconds || 0);
        hero.className = 'block text-5xl font-bold tabular-nums leading-tight ' + MV_COLOR(v);
        $('eyeSparkWrap').classList.add('hidden');            // مجرى الحصة كلّها تحت اللوحة
        const idle = $('eyeMonIdle');
        idle.textContent = M.longestIdle ? mmss(M.longestIdle) : M.observed ? 'لا انتظار' : '—';
        idle.className = 'text-lg font-bold tabular-nums truncate text-slate-900';
        $('eyeMonIdleL').textContent = M.longestIdle ? 'أطول انتظار (' + M.waits + ')' : 'الانتظار';
        const det = M.ctx && M.ctx.covered ? E().partsDetail(M, M.rec) : null;
        const AD = M.admin;
        $('eyeMonParts').innerHTML = (AD ? rollLine(AD.sec, false, AD.auto) : '')
            + (det ? partsBars(det.map(x => ({ k: x.k, short: x.short, label: x.label, sec: x.sec, rec: Math.round(x.rec * 60), cur: false, over: x.verdict === 'long' })))
            : '<p class="text-xs text-slate-500">لم تُلمس عناصر الحصة في هذا الرصد.</p>');
        $('eyeAlerts').innerHTML = '<button type="button" id="eyeToResult" class="svf-btn svf-btn-secondary svf-btn-sm w-full"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i>التحليل والتقييم المقترح</button>';
        $('eyeToResult').addEventListener('click', () => $('eyeResult').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    function resetMonitor() {
        if ($('eyeQuickAlert')) $('eyeQuickAlert').classList.add('hidden');
        if (!$('eyeMonitor')) return;
        $('eyeMonTitle').textContent = 'المتابعة الحيّة';
        $('eyeMonState').textContent = 'يبدأ…';
        $('eyeMonState').className = 'text-xs font-bold rounded-full px-2.5 py-1 bg-slate-100 text-slate-600';
        $('eyeMonLabel').textContent = 'حركة الطلبة الآن';
        $('eyeMonNow').textContent = '—';
        $('eyeMonNow').className = 'block text-5xl font-bold tabular-nums leading-tight text-slate-900';
        $('eyeMonSub').textContent = '';
        $('eyeMonIdle').textContent = '—'; $('eyeMonIdleL').textContent = 'الانتظار';
        $('eyeSparkWrap').classList.remove('hidden');
        $('eyeMonParts').innerHTML = ''; $('eyeAlerts').innerHTML = '';
        drawSpark();
    }
    function renderMonitor(L, M) {
        if (!$('eyeMonitor') || !L) return;
        $('eyeMonTitle').textContent = 'المتابعة الحيّة';
        $('eyeSparkWrap').classList.remove('hidden');
        const P = M.people && M.people.movingAll != null && M.people.detSecs >= 30 ? M.people : null;
        const frozen = phoneFrozen();
        // الحالة الآن
        const st = S.src === 'none' ? ['رصد بلا كاميرا', 'bg-slate-100 text-slate-700']
            : frozen ? ['لا صورة من الهاتف', 'bg-red-50 text-red-800']
            : L.state === 'r' ? ['الحضور والزيّ ' + mmss(L.run), 'bg-slate-100 text-slate-700']
            : L.state === 'a' ? ['نشاط', 'bg-green-50 text-green-800']
            : L.state === 'i' ? ['انتظار ' + mmss(L.run), 'bg-amber-50 text-amber-900']
            : L.state === 'x' ? ['الكاميرا تتحرّك', 'bg-slate-100 text-slate-700'] : ['يبدأ…', 'bg-slate-100 text-slate-600'];
        const badge = $('eyeMonState');
        badge.textContent = st[0];
        badge.className = 'text-xs font-bold rounded-full px-2.5 py-1 ' + st[1];
        // الرقم الكبير: حركة الطلبة الآن (الكشف)، وإلّا النشاط الحركيّ للصورة، وبلا كاميرا زمن العنصر الجاري
        const hero = $('eyeMonNow'), lbl = $('eyeMonLabel'), sub = $('eyeMonSub');
        const avg = P ? (P.movingPlay != null ? P.movingPlay : P.movingAll) : M.observed >= 20 ? M.activePct : null;
        if (L.state === 'r' && !frozen) {
            // تسجيل الحضور والزيّ: القياس يبدأ مع أوّل نشاط
            lbl.textContent = 'الحضور والزيّ';
            hero.textContent = mmss(L.run);
            hero.className = 'block text-5xl font-bold tabular-nums leading-tight ' + (L.run >= E().ROLL_LONG ? 'text-amber-700' : 'text-slate-900');
            sub.textContent = 'لا يُحسب شرحاً ولا انتظاراً · حركة الطلبة تُقاس من أوّل نشاط' + (L.roll && L.roll.auto ? ' · بداية الحصة (تلقائيّاً)' : '');
        } else if (S.src === 'none') {
            lbl.textContent = L.part ? 'زمن «' + E().PART[L.part].label + '»' : 'زمن الرصد';
            hero.textContent = mmss(L.part ? L.partSec : L.seconds);
            hero.className = 'block text-5xl font-bold tabular-nums leading-tight text-slate-900';
            sub.textContent = S.audio ? 'كلام المعلّم ' + (M.talkPct || 0) + '% من الوقت' : '';
        } else if (L.now != null && !frozen) {
            lbl.textContent = 'حركة الطلبة الآن';
            hero.textContent = L.now + '%';
            hero.className = 'block text-5xl font-bold tabular-nums leading-tight ' + MV_COLOR(L.now);
            // المتوسّط من لقطات الكشف نفسها (لا من حركة الصورة) فيُقرأ الرقمان معاً
            const mAvg = P ? avg : L.avg;
            sub.textContent = [mAvg != null ? 'متوسّط الحصة ' + mAvg + '%' : '', L.recent != null && L.part ? 'آخر دقيقتين في «' + E().PART[L.part].short + '» ' + L.recent + '%' : '', 'المعيار ٥٠٪'].filter(Boolean).join(' · ');
        } else {
            lbl.textContent = 'النشاط الحركيّ في الحصة';
            hero.textContent = avg != null ? avg + '%' : '—';
            hero.className = 'block text-5xl font-bold tabular-nums leading-tight ' + MV_COLOR(avg);
            sub.textContent = checked('eyeAI') && S.src !== 'none' ? (AI.ok ? 'كشف الطلبة يبدأ مع أوّل لقطات…' : 'من حركة الصورة — كشف الطلبة غير متاح') : 'من حركة الصورة';
        }
        // الانتظار: الجاري الآن، وإلّا أطول انتظارٍ بين نشاطين
        const idle = $('eyeMonIdle'), idleL = $('eyeMonIdleL');
        if (L.state === 'i' && !frozen && S.src !== 'none') { idle.textContent = mmss(L.run); idleL.textContent = 'انتظارٌ الآن'; idle.className = 'text-lg font-bold tabular-nums truncate ' + (L.run >= E().ALERT_IDLE ? 'text-amber-700' : 'text-slate-900'); }
        else { idle.textContent = M.longestIdle ? mmss(M.longestIdle) : S.src === 'none' ? '—' : 'لا انتظار'; idleL.textContent = M.longestIdle ? 'أطول انتظار (' + M.waits + ')' : 'الانتظار'; idle.className = 'text-lg font-bold tabular-nums truncate text-slate-900'; }
        $('eyeMonParts').innerHTML = rollLine(L.roll && L.roll.sec, L.roll && L.roll.now, L.roll && L.roll.auto) + partsBars(L.parts);
        // التنبيهات
        const IC = { bad: ['fa-circle-exclamation', 'border-red-200 bg-red-50 text-red-800'], warn: ['fa-triangle-exclamation', 'border-amber-200 bg-amber-50 text-amber-900'],
                     info: ['fa-clock', 'border-slate-200 bg-slate-50 text-slate-700'], hint: ['fa-lightbulb', 'border-blue-200 bg-blue-50 text-blue-800'] };
        $('eyeAlerts').innerHTML = L.alerts.length ? L.alerts.map(a => `<div class="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-6 ${IC[a.level][1]}">
                <i class="fa-solid ${IC[a.level][0]} mt-1.5 text-xs" aria-hidden="true"></i><span class="min-w-0">${esc(a.text)}</span></div>`).join('')
            : '<p class="text-xs text-slate-500">لا تنبيهات — الحصة تسير.</p>';
        // الوضع المبسّط: أهمّ تنبيهٍ وحده (أوّلها أخطرها)
        const qa = $('eyeQuickAlert'), top = L.alerts[0];
        qa.classList.toggle('hidden', !top);
        if (top) { qa.className = 'rounded-lg border px-3 py-2 text-sm leading-6 ' + IC[top.level][1]; qa.textContent = top.text; }
        // شريط الرصد (ويُعاد حساب موضعه: شريط التبويبات قد يتغيّر ارتفاعه بتدوير الجهاز)
        placeBar();
        $('eyeLiveClock').textContent = mmss(L.seconds);
        const lp = $('eyeLivePart');
        const autoRoll = !L.part && L.state === 'r';
        lp.textContent = L.part ? E().PART[L.part].label + ' · ' + mmss(L.partSec) : autoRoll ? E().ROLL.label + ' · ' + mmss(L.run) : 'المس عنصر الحصة الجاري';
        lp.className = 'flex-1 text-sm min-w-0 truncate ' + (L.part || autoRoll ? 'text-slate-800 font-semibold' : 'text-amber-800');
        $('eyeLiveSrc').textContent = [S.via === 'phone' ? 'كاميرا الهاتف' : S.src === 'file' ? 'مقطع مصوَّر' : S.src === 'none' ? 'بلا كاميرا' : 'كاميرا الجهاز',
            S.audio ? (S.mic === 'teacher' ? 'ميكروفون المعلّم' : 'الصوت') : '', S.sp ? 'فهم الكلام' : ''].filter(Boolean).join(' · ');
    }

    // خطّ آخر خمس دقائق: حركة الطلبة٪ (أو مستوى حركة الصورة)، والقديم يميناً والآن يساراً — كمجرى الحصة
    function drawSpark() {
        const c = $('eyeSpark');
        if (!c) return;
        const dpr = root.devicePixelRatio || 1, Wc = c.clientWidth, Hc = c.clientHeight;
        if (!Wc || !Hc) return;
        c.width = Math.round(Wc * dpr); c.height = Math.round(Hc * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, Wc, Hc);
        const all = S.tl || [], N = 30, items = all.slice(-N);
        const useMv = items.some(b => b.mv != null);
        const val = b => (useMv ? b.mv : b.v != null ? b.v * 100 : null);
        const top = 4, bot = Hc - 4, H = bot - top;
        const Y = v => bot - (Math.max(0, Math.min(100, v)) / 100) * H;
        const step = Wc / (N - 1);
        const X = i => Wc - (i + (N - items.length)) * step;      // أحدث مقطعٍ عند الحافّة اليسرى
        g.strokeStyle = 'rgba(15,23,42,.08)'; g.lineWidth = 1;
        [0, 50, 100].forEach(v => { g.beginPath(); g.moveTo(0, Y(v) + 0.5); g.lineTo(Wc, Y(v) + 0.5); g.stroke(); });
        if (useMv) { g.setLineDash([5, 4]); g.strokeStyle = '#94a3b8'; g.beginPath(); g.moveTo(0, Y(50)); g.lineTo(Wc, Y(50)); g.stroke(); g.setLineDash([]); }
        items.forEach((b, i) => { if (b.k === 'i' || b.k === 'r') { g.fillStyle = b.k === 'i' ? 'rgba(203,213,225,.55)' : ROLL_TINT; g.fillRect(X(i) - step / 2, top, step, H); } });
        const pts = items.map((b, i) => [X(i), val(b)]).filter(p => p[1] != null);
        if (pts.length < 2) return;
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p[0], Y(p[1])) : g.moveTo(p[0], Y(p[1]))));
        g.lineTo(pts[pts.length - 1][0], bot); g.lineTo(pts[0][0], bot); g.closePath();
        g.fillStyle = 'rgba(15,76,129,.14)'; g.fill();
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p[0], Y(p[1])) : g.moveTo(p[0], Y(p[1]))));
        g.strokeStyle = '#0f4c81'; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
        const last = pts[pts.length - 1];
        g.beginPath(); g.arc(last[0], Y(last[1]), 4, 0, Math.PI * 2); g.fillStyle = '#0f4c81'; g.fill();
        g.lineWidth = 2; g.strokeStyle = '#ffffff'; g.stroke();
    }

    // طول محور «مجرى الحصة» بمقاطع العشر ثوانٍ: أثناء الرصد بطول الحصة المتوقَّع (يمتلئ مع الوقت)، وبعده بطول ما رُصد فعلاً —
    // كانت الحصة القصيرة تنضغط في زاوية (2026-10-29). الرسم والتلميح يقرآن الدالّة نفسها.
    const tlLen = len => (S.running ? Math.max(len, Math.round(lessonMin() * 6), 24) : Math.max(len, 6));
    // تلميح مجرى الحصة: المقطع تحت المؤشّر
    function tlTip(e) {
        const c = $('eyeTimeline'), tip = $('eyeTlTip'), items = S.tl || [];
        if (!items.length) { tip.classList.add('hidden'); return; }
        const r = c.getBoundingClientRect(), x = e.clientX - r.left;
        const n = tlLen(items.length), bw = r.width / n;
        const i = Math.floor((r.width - x) / bw);
        const b = items[i];
        if (!b) { tip.classList.add('hidden'); return; }
        const part = b.c && b.c !== '-' && b.c !== E().ROLL.c ? (E().PARTS.find(p => p.c === b.c) || {}).label : '';
        tip.textContent = '';
        const line = t => { const d = document.createElement('div'); d.textContent = t; tip.appendChild(d); };
        line(mmss(i * 10) + ' – ' + mmss(i * 10 + 10) + (part ? ' · ' + part : ''));
        line(b.k === 'a' ? 'نشاط' : b.k === 'i' ? 'انتظار' : b.k === 'r' ? E().ROLL.label + ' — لا يُحسب شرحاً ولا انتظاراً' : 'غير محسوب');
        if (b.mv != null) line('حركة الطلبة ' + b.mv + '%');
        if (b.talk != null) line('كلام المعلّم ' + Math.round(b.talk * 100) + '%');
        tip.classList.remove('hidden');
        const w = tip.offsetWidth;
        tip.style.left = Math.max(0, Math.min(r.width - w, x - w / 2)) + 'px';
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
            const pref = readPrefs();
            const cur = sel.value || (pref && pref.eyeMicDev) || '';      // الميكروفون المحفوظ يُستعاد حين تُسرد الأجهزة
            sel.innerHTML = '<option value="">الميكروفون الافتراضي</option>' + list.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || ('ميكروفون ' + (i + 1)))}</option>`).join('');
            if (cur && list.some(d => d.deviceId === cur)) sel.value = cur;
            setSummary();
        } catch (e) { /* القائمة تبقى بالافتراضيّ */ }
    }
    const audioConstraints = () => {
        const a = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
        const id = $('eyeMicDev') && $('eyeMicDev').value;
        if (id) a.deviceId = { exact: id };
        return a;
    };

    // ومضةٌ تؤكّد اللمسة: إطارٌ خارجيّ (outline) لا ring — قاعدة الزجاج في القشرة تضع box-shadow على كلّ bg-white فتمحو ring (لم تكن تظهر)
    function flash(el, color, ms) {
        if (!el) return;
        el.style.outline = '2px solid ' + color; el.style.outlineOffset = '2px';
        setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, ms);
    }

    // ── اللمسات ──
    function tap(k, btn) {
        if (S.running) { S.tagFreq[k] = (S.tagFreq[k] || 0) + 1; savePrefs(); }   // ما يُلمس في الحصص يصعد إلى «أهمّ ما تلمسه»
        S.events.push({ t: S.running ? Math.round(now()) : null, k });
        S.counts[k] = (S.counts[k] || 0) + 1;
        renderCounts();
        flash(btn, '#0f4c81', 280);
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
    // «أهمّ ما تلمسه» في الوضع المبسّط: ستّة وسوم — الأكثر لمساً في حصصك، وقبل أن تتكوّن عادةٌ: مزيجٌ من التدريس والتقويم والسلامة
    const QUICK_N = 6, QUICK_DEFAULT = ['demo', 'fbInd', 'ask', 'fbMiss', 'out', 'hazard'];
    function quickTags() {
        const f = S.tagFreq || {}, rank = k => { const i = QUICK_DEFAULT.indexOf(k); return i < 0 ? 99 : i; };
        return E().TAGS.map((t, i) => ({ k: t.k, f: f[t.k] || 0, r: rank(t.k), i }))
            .sort((a, b) => b.f - a.f || a.r - b.r || a.i - b.i).slice(0, QUICK_N).map(x => x.k);
    }
    function renderQuick() {
        const box = $('eyeQuickTags');
        if (!box) return;
        box.innerHTML = quickTags().map(tagRowHtml).join('');
        renderCounts();
    }

    // تعديل العدّادات بعد الحصة يعيد الاقتراح على أرقام الرصد نفسها
    function resuggest() {
        const d = S.result;
        if (!d || S.running) return;
        d.counts = Object.assign({}, S.counts);
        if (d.follow && Array.isArray(d.follow.targets)) d.follow.list = d.follow.targets.map(t => E().targetCheck(t, d)).filter(Boolean);
        d.sugg = E().suggest(d.M || {}, d.counts, ctxOf(d));
        d.summary = E().summaryText(d.M || {}, ctxOf(d));
        save(d);
        renderResult(d);
    }

    // ── سياق الحصة ──
    // at: وقتٌ سابقٌ اختياريّ — حين يُعتمد ما أعلنه المعلّم بصوته يُسجَّل العنصر من لحظة قوله لا من لحظة اللمس
    function setCtx(k, at) {
        if (!S.running) { toast('يُلمس عنصر الحصة أثناء الرصد', 'info'); return; }
        if (S.cue) { S.cue = null; renderCue(); }
        if (S.ctxCur === k) return;
        const lastT = S.ctxEvents.length ? S.ctxEvents[S.ctxEvents.length - 1].t : 0;
        const t = at == null ? Math.round(now()) : Math.max(lastT, Math.min(Math.round(now()), Math.round(at)));
        S.ctxCur = k;
        S.ctxEvents.push({ t, k });
        renderCtx();
        planHint();
    }
    // ما خطّطه الدليل للعنصر الجاري — سطرٌ تحت «عناصر الحصة» (يظهر في الوضع المبسّط أيضاً) فيُقارن المشرف ما أمامه بالخطّة فوراً
    function planHint() {
        const el = $('eyePlanHint');
        if (!el) return;
        const G = guideOn(), k = S.ctxCur;
        const txt = G && S.running && k && E().PART[k] ? planText(G, k) : '';
        el.textContent = txt;
        el.classList.toggle('hidden', !txt);
    }
    function planText(G, k) {
        const FORM = LG().FORM, ids = S.guide.skills.length ? S.guide.skills : G.skills.map(x => x.id);
        const perTxt = n => (n === 1 ? 'كرةٌ لكلّ طالب' : n === 2 ? 'كرةٌ لكلّ طالبين' : n ? 'كرةٌ لكلّ (' + n + ') طلبة' : '');
        const mins = G.parts && G.parts[k] ? ' · ' + G.parts[k] + ' د' : '';
        if (k === 'teach' || k === 'apply') {
            const ds = LG().drillsFor(G, ids).filter(d => d.kind === k).slice(0, 2);
            if (!ds.length) return mins ? 'الدليل: ' + E().PART[k].label + mins : '';
            return 'الدليل' + mins + ': ' + ds.map(d => d.name + ' (' + [FORM[d.form], perTxt(d.per)].filter(Boolean).join('، ') + ')').join(' — ');
        }
        return mins ? 'الدليل: ' + E().PART[k].label + mins : '';
    }
    // ما أعلنه المعلّم بصوته («نبدأ الإحماء»، «الحين النشاط التطبيقي»): **اقتراحٌ** يلمسه المشرف — لا يُسجَّل وحده، فالمحوِّل قد يخطئ
    // والمعلّم قد يذكر العنصر ولا يبدؤه. يُعرض دقيقتين، ولا يُقترح العنصر الجاري.
    function speechCue(x) {
        const c = SX() && SX().cues ? SX().cues(x) : null;
        if (!c || !c.part || c.part === S.ctxCur || !E().PART[c.part]) return;
        S.cue = { k: c.part, t: Math.round(now()), x: String(x).slice(0, 90) };
        renderCue();
    }
    function renderCue() {
        const box = $('eyeSpeechCue');
        if (!box) return;
        const c = S.cue;
        if (c && (!S.running || now() - c.t > 120 || c.k === S.ctxCur)) S.cue = null;
        box.classList.toggle('hidden', !S.cue);
        if (!S.cue) return;
        $('eyeCueText').textContent = 'سُمع عند ' + mmss(S.cue.t) + ': «' + S.cue.x + '»';
        $('eyeCueOk').textContent = 'بدأ «' + E().PART[S.cue.k].label + '»';
    }
    function renderCtx() {
        document.querySelectorAll('#eyeBody .eye-ctx').forEach(b => {
            const on = b.dataset.ctx === S.ctxCur;
            b.classList.toggle('svf-btn-primary', on);
            b.classList.toggle('svf-btn-secondary', !on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    // ── لحظات للمداولة: علامات المشرف بأوقاتها ──
    function addMark() {
        if (!S.running) { toast('توضع العلامة أثناء الرصد', 'info'); return; }
        if (S.marks.length >= 40) { toast('بلغت العلامات حدّها (٤٠)', 'info'); return; }
        S.marks.push({ t: Math.round(now()), note: '' });
        renderMarks();
        drawTimeline();
        flash($('eyeMark'), '#f0b44a', 300);
    }
    function renderMarks() {
        const ul = $('eyeMarks');
        if (!ul) return;
        const cx = S.running ? S.ctxEvents : (S.result && S.result.cx) || S.ctxEvents;
        ul.innerHTML = S.marks.map((m, i) => `<li class="flex items-center gap-2">
                <span class="flex-none text-xs tabular-nums text-slate-600 w-11">${mmss(m.t)}</span>
                ${partShort(partAt(cx, m.t)) ? `<span class="flex-none text-[11px] text-slate-500">${esc(partShort(partAt(cx, m.t)))}</span>` : ''}
                <input type="text" data-mark="${i}" value="${esc(m.note || '')}" maxlength="160" placeholder="ملاحظة قصيرة (اختياريّة)" class="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1 text-sm">
                <select data-markitem="${i}" class="flex-none w-20 border border-slate-300 rounded-lg px-1 py-1 text-xs" aria-label="البند الذي تشهد له العلامة" title="انسبها إلى بندٍ فتظهر دليلاً تحته">
                    <option value="">البند</option>${[...Array(13)].map((_, k) => `<option value="${k + 1}" ${m.item === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select>
                <button type="button" data-unmark="${i}" class="flex-none w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-red-400" aria-label="حذف العلامة">×</button></li>`).join('')
            || '<li class="text-xs text-slate-400">لا علامات بعد.</li>';
    }
    // بعد الرصد: العلامات تُحفظ مع النتيجة (الملاحظة تُكتب في أيّ وقت)
    function syncMarks(rerender) {
        if (!S.result || S.running) return;
        S.result.marks = S.marks.map(markRow);
        save(S.result);
        if (rerender) renderResult(S.result);
    }

    // ── عيّنة الطلبة ──
    // بلا دليل: لمسة الرقم تبدّل لم يتقن ← جزئيّاً ← أتقن. ومع مهارةٍ لها نقاطٌ فنّيّة في دليل المعلّم تصير العيّنة «استمارة ملاحظة
    // النواحي الفنّيّة»: لمسة الرقم تختار الطالب، ثمّ يُلمس ما حقّقه من النقاط (pa/pb)، ومنها رمز إتقانه (a/b) كما كان.
    function sampleTap(i) {
        if (sampleSkill()) { S.samplePick = S.samplePick === i ? -1 : i; renderSample(); return; }
        const sm = S.sample || (S.sample = freshSample(+(($('eyeSampleN') || {}).value) || 8));
        const r = S.sampleRound === 'b' ? 'b' : 'a';
        const arr = String(sm[r] || '').padEnd(sm.n, '0').slice(0, sm.n).split('');
        arr[i] = String((Number(arr[i] || 0) + 1) % 4);
        sm[r] = arr.join('').replace(/0+$/, '');
        renderSample();
        sampleChanged();
    }
    // مهارة العيّنة: مهارتها إن قُيّم فيها أحد، وإلّا أوّل مهارةٍ مختارةٍ لها نقاط — وعيّنةٌ قُيّمت تقديراً عامّاً قبل اختيار المهارة تبقى كما هي
    function sampleSkill() {
        const G = guideOn();
        if (!G) return null;
        const sm = S.sample;
        if (sm && sm.sk && hasSample(sm)) { const sk = LG().skillOf(G, sm.sk); return LG().observable(sk) ? { G, sk } : null; }
        if (hasSample(sm)) return null;
        const id = (S.guide.skills || []).find(k => LG().observable(LG().skillOf(G, k)));
        return id ? { G, sk: LG().skillOf(G, id) } : null;
    }
    function samplePoint(v) {
        const CK = sampleSkill(), i = S.samplePick;
        if (!CK || i < 0) return;
        const sm = S.sample || (S.sample = freshSample(+(($('eyeSampleN') || {}).value) || 8));
        if (v === 'next') { S.samplePick = (i + 1) % sm.n; renderSample(); return; }
        const r = S.sampleRound === 'b' ? 'b' : 'a', P = CK.sk.points.length;
        if (sm.sk !== CK.sk.id) { sm.sk = CK.sk.id; delete sm.pa; delete sm.pb; }
        if (v === 'clear') LG().clearPupil(sm, r, i, P);
        else if (v === 'all' || v === 'none') LG().setPoint(sm, r, i, v, true, P);
        else {
            const m = Array.isArray(sm['p' + r]) && Number.isInteger(sm['p' + r][i]) ? sm['p' + r][i] : -1, bit = +v;
            LG().setPoint(sm, r, i, bit, !(m >= 0 && (m & (1 << bit))), P);
        }
        renderSample();
        sampleChanged();
    }
    function sampleChanged() {
        updateGuideLive();
        if (!S.result || S.running) return;
        S.result.sample = hasSample(S.sample) ? JSON.parse(JSON.stringify(S.sample)) : null;
        resuggest();
    }
    function renderSample() {
        const box = $('eyeSampleChips');
        if (!box) return;
        const sm = S.sample || freshSample(+(($('eyeSampleN') || {}).value) || 8);
        if ($('eyeSampleN')) $('eyeSampleN').value = String(sm.n);
        const r = S.sampleRound === 'b' ? 'b' : 'a';
        document.querySelectorAll('#eyeBody .eye-round').forEach(b => {
            const on = b.dataset.round === r;
            b.classList.toggle('svf-btn-primary', on); b.classList.toggle('svf-btn-secondary', !on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const CK = sampleSkill(), P = CK ? CK.sk.points.length : 0;
        if (!CK) S.samplePick = -1;
        else if (S.samplePick >= sm.n) S.samplePick = -1;
        const hint = $('eyeSampleHint');
        if (hint) hint.textContent = CK ? 'استمارة ملاحظة النواحي الفنّيّة لـ«' + CK.sk.short + '» من دليل المعلّم: المس الطالب ثمّ ما حقّقه من نقاطها — كلّها أتقن، ونصفها فأكثر جزئيّاً. منها شاهد البندين ١ و٢.' : SAMPLE_HINT;
        const LOOK = { 0: ['border-slate-200 text-slate-600', '', 'لم يُقيَّم'], 1: ['border-red-300 bg-red-50 text-red-800', 'fa-xmark', 'لم يتقن'],
                       2: ['border-amber-300 bg-amber-50 text-amber-900', 'fa-circle-half-stroke', 'جزئيّاً'], 3: ['border-green-300 bg-green-50 text-green-800', 'fa-check', 'أتقن'] };
        const DOT = { 1: '#b5452f', 2: '#9a6f24', 3: '#1d6b45' };
        const mk = CK && Array.isArray(sm['p' + r]) && sm.sk === CK.sk.id ? sm['p' + r] : [];
        const popc = m => { let n = 0; for (let x = m; x > 0; x >>= 1) n += x & 1; return n; };
        let h = '';
        for (let i = 0; i < sm.n; i++) {
            const v = Number(String(sm[r] || '')[i] || 0), was = r === 'b' ? Number(String(sm.a || '')[i] || 0) : 0;
            const [cls, ic, lbl] = LOOK[v] || LOOK[0];
            const m = Number.isInteger(mk[i]) ? mk[i] : -1, pick = CK && S.samplePick === i;
            const inner = CK ? `${i + 1}${m >= 0 ? `<span class="text-[11px] font-medium opacity-80">${popc(m)}/${P}</span>` : ''}`
                : `${i + 1}${ic ? `<i class="fa-solid ${ic} text-xs" aria-hidden="true"></i>` : ''}`;
            h += `<button type="button" data-pupil="${i}" class="relative flex items-center justify-center gap-1 h-10 rounded-lg border bg-white text-sm font-bold tabular-nums ${cls}"${pick ? ' style="outline:2px solid #0f4c81;outline-offset:2px"' : ''} aria-label="الطالب ${i + 1}: ${lbl}"${CK ? ` aria-pressed="${pick ? 'true' : 'false'}"` : ''}>
                ${inner}${was ? `<i class="absolute top-1 left-1 w-1.5 h-1.5 rounded-full" style="background:${DOT[was]}" title="أوّل التطبيق" aria-hidden="true"></i>` : ''}</button>`;
        }
        box.innerHTML = h;
        // لوحة النقاط للطالب المختار
        const pts = $('eyeSamplePts');
        if (pts) {
            const i = S.samplePick;
            if (CK && i >= 0) {
                const m = Number.isInteger(mk[i]) ? mk[i] : -1;
                pts.innerHTML = `<div class="mt-2 rounded-xl border border-blue-200 bg-blue-50/40 p-2">
                    <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-600 mb-1.5"><b class="text-sm text-slate-900">الطالب ${i + 1}</b><span>${m >= 0 ? 'حقّق ' + popc(m) + ' من ' + P : 'لم يُقيَّم بعد'} — المس ما حقّقه</span></div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">${CK.sk.points.map((p, k) => { const on = m >= 0 && !!(m & (1 << k));
                        return `<button type="button" data-spt="${k}" aria-pressed="${on}" class="svf-btn svf-btn-sm ${on ? 'svf-btn-primary' : 'svf-btn-secondary'} justify-start text-right"><i class="fa-solid ${on ? 'fa-check' : 'fa-minus'} text-xs" aria-hidden="true"></i>${k + 1}. ${esc(p.short)}</button>`; }).join('')}</div>
                    <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <button type="button" data-spt="all" class="svf-btn svf-btn-ghost svf-btn-sm">كلّها</button>
                        <button type="button" data-spt="none" class="svf-btn svf-btn-ghost svf-btn-sm">لا شيء</button>
                        ${m >= 0 ? '<button type="button" data-spt="clear" class="svf-btn svf-btn-ghost svf-btn-sm">لم يُقيَّم</button>' : ''}
                        <span class="flex-1"></span>
                        <button type="button" data-spt="next" class="svf-btn svf-btn-secondary svf-btn-sm">التالي<i class="fa-solid fa-arrow-left text-xs" aria-hidden="true"></i></button>
                    </div></div>`;
            } else pts.innerHTML = CK ? '<p class="text-xs text-slate-500 mt-2">المس رقم طالبٍ لتسجّل ما حقّقه من النقاط.</p>' : '';
        }
        const SS = E().sampleStats(sm), sum = $('eyeSampleSum');
        if (!sum) return;
        const rd = (t, x) => (x.rated ? t + ': قُيّم ' + x.rated + ' — أتقن ' + x.ok + '، جزئيّاً ' + x.part + '، لم يتقن ' + x.no + ' (' + x.pct + '%)' : '');
        sum.textContent = SS ? [rd('أوّل التطبيق', SS.a), rd('آخر الحصة', SS.b), SS.both ? 'تقدّم ' + SS.improved + ' من ' + SS.both : ''].filter(Boolean).join(' · ') : '';
        const PS = CK && sm.sk === CK.sk.id ? LG().pointStats(sm, CK.G) : null, cur = PS && PS[r];
        if (cur && cur.rated) {
            const w = cur.pts.slice().sort((p, q) => p.pct - q.pct || p.i - q.i)[0];
            if (w && w.pct < 100) sum.textContent += ' · أضعف نقطة: «' + w.short + '» (' + w.ok + '/' + cur.rated + ')';
        }
        if (SS && !SS.final && (SS.a.rated || SS.b.rated)) sum.textContent += ' — يلزم ' + E().MIN_SAMPLE + ' طلبةٍ في القراءة ليُقترح منها';
        updateGuideLive();
    }

    // ── دليل المعلّم (js/lesson-guide.js) ──
    // الدليل من الصفّ وعنوان الدرس في النموذج — يُعاد حين يتغيّران، ويبقى اختيار المشرف ما دامت الحصة نفسها
    const guideOn = () => (S.guide && S.guide.on && LG() ? LG().byId(S.guide.id) : null);
    function detectGuide() {
        if (!LG()) { S.guide = null; return; }
        const I = info(), key = I.cls + '|' + I.topic;
        if (S.guide && S.gkey === key) return;
        S.gkey = key;
        const r = LG().find({ cls: I.cls, topic: I.topic });
        S.guide = r ? { id: r.guide.id, skills: r.skills.slice(), sure: r.sure, on: r.sure, min: false } : null;
    }
    function guideSkill(id) {
        const G = guideOn();
        if (!G) return;
        const set = new Set(S.guide.skills);
        if (set.has(id)) set.delete(id); else set.add(id);
        S.guide.skills = G.skills.map(x => x.id).filter(k => set.has(k));       // بترتيب الدليل
        guideChanged();
    }
    // تغيّر الدليل أو مهارته: البطاقة والعيّنة، والكلام حيّاً، وبعد الرصد يُعاد التحليل والاقتراح
    function guideChanged() {
        renderGuide();
        renderSample();
        planHint();
        if (S.running && S.sp) S.sp.dirty = true;
        const d = S.result;
        if (!d || S.running) return;
        const G = guideOn();
        const prev = d.guide;
        d.guide = G ? { id: G.id, skills: S.guide.skills.slice() } : null;
        if (d.M) {
            const segs0 = d.sp && Array.isArray(d.sp.seg) ? d.sp.seg : [];
            const segs = SX() ? SX().lessonSegs(segs0, d.M.admin && d.M.admin.spans) : segs0;     // بلا الحضور والزيّ
            const same = prev && d.guide && prev.id === d.guide.id && prev.skills.join() === d.guide.skills.join();
            if (G && segs.length) d.M.gspeech = LG().speechCoverage(segs, G, S.guide.skills);
            else if (!same) d.M.gspeech = null;      // حُذف النصّ: لا يُعاد عدّه لمهارةٍ أخرى
        }
        resuggest();
    }
    function renderGuide() {
        const box = $('eyeGuide');
        if (!box) return;
        const G = S.guide && LG() ? LG().byId(S.guide.id) : null;
        if (!G) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        box.classList.remove('hidden');
        const gname = 'الصف ' + (GRADE_NAME[G.grade] || G.grade);
        const sel = new Set(S.guide.skills || []);
        if (!S.guide.on) {
            box.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-sm text-slate-700"><i class="fa-solid fa-book-open ml-1.5 text-slate-500" aria-hidden="true"></i>دليل المعلّم متاحٌ لـ${esc(gname)}: <b>${esc(G.topic)}</b></span>
                <button type="button" data-gopen class="svf-btn svf-btn-secondary svf-btn-sm">استعمله في هذه الحصة</button></div>`;
            return;
        }
        const chosen = G.skills.filter(sk => sel.has(sk.id));
        const head = `<div class="flex flex-wrap items-baseline justify-between gap-2">
                <h2 class="font-bold text-slate-900"><i class="fa-solid fa-book-open ml-1.5 text-slate-500" aria-hidden="true"></i>دليل المعلّم — ${esc(G.topic)} · ${esc(gname)}</h2>
                <span class="flex items-center gap-2 text-xs text-slate-500">${G.sessions ? esc(G.sessions) + ' حصة · ' : ''}${G.user ? 'من ملفّ دليلك' : 'نموذجٌ تجريبيّ'}${G.parts ? ' · زمن العناصر من الدليل' : ''}
                    <button type="button" data-gimport class="svf-btn svf-btn-ghost svf-btn-sm">دروس الدليل</button>
                    <button type="button" data-gmin class="svf-btn svf-btn-ghost svf-btn-sm" aria-expanded="${S.guide.min ? 'false' : 'true'}">${S.guide.min ? 'عرض' : 'طيّ'}</button></span></div>`;
        if (S.guide.min) {
            box.innerHTML = head + `<p class="text-sm text-slate-600 mt-1">مهارة الحصة: ${chosen.length ? esc(chosen.map(x => x.short).join('، ')) : 'لم تُختر'}</p>`;
            return;
        }
        const chips = `<div class="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="مهارة الحصة">
                <span class="text-xs text-slate-600 ml-1">مهارة الحصة:</span>
                ${G.skills.map(sk => { const on = sel.has(sk.id); return `<button type="button" data-gskill="${esc(sk.id)}" aria-pressed="${on}" class="svf-btn svf-btn-sm ${on ? 'svf-btn-primary' : 'svf-btn-secondary'}">${esc(sk.short)}</button>`; }).join('')}</div>`;
        const withPts = chosen.filter(sk => sk.points && sk.points.length);
        const blocks = withPts.length ? `<div class="mt-3 grid gap-3${withPts.length > 1 ? ' md:grid-cols-2' : ''}">${withPts.map(sk => `<div class="rounded-xl border border-slate-200 p-3 min-w-0${withPts.length === 1 ? ' max-w-3xl' : ''}">
                <div class="flex flex-wrap items-baseline justify-between gap-2"><b class="text-sm text-slate-900">${esc(sk.name)}</b>
                    <span class="text-[11px] text-slate-500">${sk.knowledge ? 'معرفيّة — في الكلام والأسئلة' : 'النقاط الفنّيّة'}</span></div>
                <ol class="mt-1.5 space-y-1.5">${sk.points.map((p, i) => `<li class="flex items-start gap-2 text-sm">
                    <span class="flex-none w-5 h-5 mt-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center tabular-nums">${i + 1}</span>
                    <span class="flex-1 min-w-0 text-slate-800 leading-6">${esc(p.text)}</span>
                    <span class="flex-none flex flex-wrap justify-end gap-1" data-gp="${esc(sk.id)}:${i}"></span></li>`).join('')}</ol>
                ${sk.tips && sk.tips.length ? `<p class="text-xs text-slate-500 mt-1.5 leading-5">${esc(sk.tips.join(' · '))}</p>` : ''}</div>`).join('')}</div>`
            : chosen.length ? `<p class="text-sm text-slate-600 mt-2 leading-6">${chosen.some(x => x.id === 'play') ? 'المنافسات والمباريات: تتابعها الكاميرا (الحركة والانتظار والتشكيل)، وتعديل القواعد لقدرات المرحلة أدناه.' : ''}</p>`
            : '<p class="text-sm text-slate-600 mt-2 leading-6">اختر مهارة الحصة لتظهر نقاطها الفنّيّة، وتصير «عيّنة الطلبة» استمارة ملاحظتها، ويتابع «فهم الكلام» ذكرها.</p>';
        const FORM = LG().FORM;
        const drills = LG().drillsFor(G, S.guide.skills);
        const perTxt = n => (n === 1 ? 'كرةٌ لكلّ طالب' : n === 2 ? 'كرةٌ لكلّ طالبين' : n ? 'كرةٌ لكلّ (' + n + ') طلبة' : '');
        const drillsHtml = drills.length ? `<details class="text-sm rounded-xl border border-slate-200 px-3 py-2"><summary class="cursor-pointer text-slate-700 font-semibold">تدريبات المهارة وأنشطتها في الدليل (${drills.length})</summary>
                <ul class="mt-2 space-y-2">${drills.map(d => `<li class="leading-6"><div class="flex flex-wrap items-center gap-1.5"><b class="text-slate-900">${esc(d.name)}</b>
                    <span class="text-[11px] rounded bg-slate-100 text-slate-700 px-1.5">${esc(FORM[d.form] || '')}</span>${d.per ? `<span class="text-[11px] rounded bg-slate-100 text-slate-700 px-1.5">${esc(perTxt(d.per))}</span>` : ''}
                    <span class="text-[11px] text-slate-500">${d.kind === 'apply' ? 'نشاطٌ تطبيقيّ' : 'تدريبٌ للمهارة'}</span></div>
                    <p class="text-slate-700">${esc(d.desc)}</p>${d.dev && d.dev.length ? `<p class="text-xs text-slate-500">تطوير النشاط: ${esc(d.dev.join('، '))}</p>` : ''}</li>`).join('')}</ul></details>` : '';
        const moreHtml = `<details class="text-sm rounded-xl border border-slate-200 px-3 py-2"><summary class="cursor-pointer text-slate-700 font-semibold">أسئلة التقويم ومخرجات الموضوع</summary>
                <div class="mt-2 space-y-2 leading-6">
                    <div><div class="text-xs font-bold text-slate-500">أسئلة التقويم — يتابعها «فهم الكلام»</div>${(G.assess || []).map((q, i) => `<div class="flex items-start gap-2"><span class="flex-1 text-slate-700">${esc(q.text)}</span><span class="flex-none" data-ga="${i}"></span></div>`).join('')}
                        ${G.assessGame ? `<p class="text-slate-700">${esc(G.assessGame)}</p>` : ''}</div>
                    ${(G.outcomes || []).length ? `<div><div class="text-xs font-bold text-slate-500">المخرجات التعليميّة</div><p class="text-slate-700">${esc(G.outcomes.join('؛ '))}</p></div>` : ''}
                    ${(G.concepts || []).length || (G.tools || []).length ? `<div><div class="text-xs font-bold text-slate-500">المفاهيم · الأدوات</div><p class="text-slate-700">${esc((G.concepts || []).join('، '))} · ${esc((G.tools || []).join('، '))}</p></div>` : ''}
                    ${G.adapt && G.adapt.length ? `<div><div class="text-xs font-bold text-slate-500">تعديل القواعد لقدرات المرحلة</div><p class="text-slate-700">${esc(G.adapt.join('؛ '))}</p></div>` : ''}
                    ${G.note ? `<p class="text-xs text-slate-500">${esc(G.note)}</p>` : ''}
                </div></details>`;
        box.innerHTML = head + chips + blocks + `<div class="grid md:grid-cols-2 gap-2 mt-3">${drillsHtml}${moreHtml}</div>`;
        updateGuideLive();
    }
    // المؤشّرات بجانب كلّ نقطة: ذُكرت في كلام المعلّم (حيّاً أو من المحفوظ)، ومن حقّقها في العيّنة (القراءة الجارية)
    function updateGuideLive() {
        const box = $('eyeGuide'), G = guideOn();
        if (!box || !G || box.classList.contains('hidden')) return;
        const C = S.running ? (S.sp && S.sp.G) : (S.result && S.result.M && S.result.M.gspeech);
        const cov = C && C.id === G.id ? C : null;
        const r = S.sampleRound === 'b' ? 'b' : 'a';
        const PS = S.sample && S.sample.sk ? LG().pointStats(S.sample, G) : null;
        const badge = (txt, on, ttl) => `<span class="text-[11px] rounded px-1.5 py-0.5 border ${on ? 'bg-green-50 text-green-800 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}" title="${esc(ttl)}">${esc(txt)}</span>`;
        box.querySelectorAll('[data-gp]').forEach(el => {
            const [sid, si] = el.dataset.gp.split(':'), i = +si;
            const bits = [];
            const cs = cov && cov.skills.find(x => x.id === sid);
            if (cs && cs.points[i]) bits.push(badge(cs.points[i].n ? 'ذُكرت' + (cs.points[i].n > 1 ? ' ×' + cs.points[i].n : '') : 'لم تُذكر', cs.points[i].n > 0, 'في كلام المعلّم'));
            const rr = PS && PS.skill === sid ? PS[r] : null;
            if (rr && rr.rated) bits.push(badge('العيّنة ' + rr.pts[i].ok + '/' + rr.rated, rr.pts[i].pct >= 75, (r === 'b' ? 'آخر الحصة' : 'أوّل التطبيق') + ': من حقّقها'));
            el.innerHTML = bits.join('');
        });
        box.querySelectorAll('[data-ga]').forEach(el => {
            const q = cov && cov.assess[+el.dataset.ga];
            el.innerHTML = q ? badge(q.n ? 'سُئل' : 'لم يُسأل', q.n > 0, 'في كلام المعلّم') : '';
        });
    }

    // ── تركيز هذه الحصة: أهداف الزيارة السابقة للمعلّم نفسه (قبل الرصد وأثناءه) ──
    function renderFocus() {
        const box = $('eyeFocus');
        if (!box) return;
        const prev = S.result ? null : prevEye();
        const T = prev && prev.d && Array.isArray(prev.d.targets) ? prev.d.targets.filter(t => t && E().METRIC[t.k]) : [];
        if (!T.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        box.innerHTML = `<div class="flex flex-wrap items-baseline justify-between gap-2">
                <b class="text-slate-900">تركيز هذه الحصة — أهداف الزيارة السابقة</b>
                <span class="text-xs text-slate-500">اتُّفق عليها في <bdi>${esc(prev.date || '')}</bdi>، ويقيسها هذا الرصد بعد الإيقاف</span></div>
            <ul class="mt-2 space-y-1">${T.map(t => {
                const x = E().METRIC[t.k];
                return `<li class="text-sm text-slate-700 leading-6">• <b class="text-slate-900">${esc(E().targetGoalText(t))}</b>
                    <span class="text-xs text-slate-500">— كانت ${esc(E().fmtTarget(x.unit, t.base))}، ويقيسه ${esc(E().NEEDS[x.needs] || '')}</span></li>`;
            }).join('')}</ul>`;
        box.classList.remove('hidden');
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
        if (S.pickTeacher) { S.pickTeacher = false; teacherUi(); }
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
        if (S.pickTeacher) { pickTeacherAt(e); return; }
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
    // ── المعلّم: لمسةٌ عليه في الشاشة (أثناء الرصد بكشف الطلبة) ──
    function toggleTeacherPick() {
        if (S.teacher) { S.teacher = null; S.pickTeacher = false; teacherUi(); toast('أُلغي تحديد المعلّم — يُعدّ مع الطلبة'); drawView(); return; }
        if (!S.running || !S.video || !AI.ok) { toast('يُحدَّد المعلّم والكاميرا وكشف الطلبة يعملان', 'info'); return; }
        if (S.roiMode) toggleRoiMode();
        S.pickTeacher = !S.pickTeacher;
        teacherUi();
    }
    function pickTeacherAt(e) {
        e.preventDefault();
        const c = $('eyeView'), r = c.getBoundingClientRect();
        const R = fitRect(r.width, r.height);
        const x = (e.clientX - r.left - R.ox) / R.rw, y = (e.clientY - r.top - R.oy) / R.rh;
        const id = E().pickNearest(S.pSnap, x, y);
        if (id == null) { toast('لم يُكشف أحدٌ قرب اللمسة — المس النقطة التي على المعلّم', 'info'); return; }
        S.teacher = E().teacherStep(AI.T, { id }, now());
        S.pickTeacher = false;
        teacherUi();
        toast('حُدّد المعلّم — يُستثنى من عدد الطلبة، ويُرصد موضعه وتنقّله');
        drawView();
    }
    function teacherUi() {
        const c = $('eyeView'), b = $('eyeTeacherBtn'), hint = $('eyeRoiHint');
        if (c) { c.style.pointerEvents = S.pickTeacher || S.roiMode ? 'auto' : 'none'; c.style.cursor = S.pickTeacher || S.roiMode ? 'crosshair' : ''; }
        if (hint && !S.roiMode) { hint.textContent = S.pickTeacher ? 'المس المعلّم على الشاشة (النقطة التي عليه)' : ''; hint.classList.toggle('hidden', !S.pickTeacher); }
        if (b) { b.querySelector('span').textContent = S.teacher ? 'إلغاء تحديد المعلّم' : S.pickTeacher ? 'إلغاء' : 'تحديد المعلّم'; b.disabled = !S.running || !S.video; }
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
        if (S.resume && S.resume.speechConsent) { S.speechConsent = true; return true; }      // أُكمل رصدٌ وافق فيه المعلّم
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
        const seed = S.spSeed; S.spSeed = null;          // رصدٌ مُكمَل: ما قيل قبل الانقطاع يبقى
        const sp = S.sp = { on: true, segs: seed ? seed.segs.slice() : [], mode: 'cloud', li: 0, lang: LANGS()[0], restarts: [], interim: '', err: '', rec: null, track: track || null, dirty: true, A: null,
                            heard: Date.now() };
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
        // حتّى خمسة بدائل للعبارة: يُختار منها الأنسب لألفاظ الملعب ومصطلحات الدرس (pickAlt — والتساوي لأعلاها ثقة)
        rec.lang = sp.lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 5;
        if (sp.mode === 'local') { try { rec.processLocally = true; } catch (e) { sp.mode = 'cloud'; } }
        rec.onresult = e => {
            let interim = '';
            sp.heard = Date.now();
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                if (r.isFinal) {
                    const alts = [];
                    for (let j = 0; j < r.length; j++) if (r[j]) alts.push(r[j]);
                    const x = String((SX() ? SX().pickAlt(alts, info().topic) : (r[0] && r[0].transcript)) || '').trim();
                    if (x) { speechAdd(sp, x); speechCue(x); }
                } else {
                    const x = String((r[0] && r[0].transcript) || '').trim();
                    if (x) interim += ' ' + x;
                }
            }
            sp.interim = interim.trim();
            sp.err = '';
            renderSpeechLive();
        };
        rec.onerror = e => {
            const k = e && e.error;
            if (k === 'not-allowed' || k === 'service-not-allowed') { sp.on = false; sp.err = 'رُفض إذن التعرّف على الكلام — اسمح بالميكروفون لهذا الموقع ثمّ أعد الرصد.'; }
            else if (k === 'language-not-supported') {
                if (sp.mode === 'local') sp.mode = 'cloud';
                else if (sp.li < LANGS().length - 1) { sp.li++; sp.lang = LANGS()[sp.li]; }      // العُمانيّة ← الإماراتيّة ← السعوديّة ← العامّة
                else { sp.on = false; sp.err = 'العربيّة غير متاحة للتعرّف على الكلام في هذا المتصفّح.'; }
            }
            else if (k === 'network') { sp.netAt = Date.now(); sp.err = 'لا إنترنت — فهم الكلام متوقّف ويُعاد حين يعود الاتّصال، والتحليل مستمرّ. مدّته لا تُحسب في معدّلات الكلام.'; }
            else if (k === 'audio-capture') sp.err = 'تعذّر على خدمة الكلام الوصول إلى الميكروفون (قد يشغله تحليل الصوت). جرّب إطفاء «الصوت» وإبقاء «فهم الكلام».';
            renderSpeechLive();
        };
        // التعرّف يتوقّف بعد الصمت (خاصّةً على الجوّال) — يُعاد تشغيله ما دام الرصد جارياً، بتمهّلٍ إن تكرّر كثيراً
        rec.onend = () => {
            if (!sp.on || !S.running || S.sp !== sp || sp.rec !== rec) return;     // أُعيد التشغيل يدويّاً: لهذا التشغيل خلفٌ
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
    // إعادة التعرّف بلمسة: بعد رفض الإذن، أو حين يُسمع كلامٌ ولا يصل نصّ (المحوِّل علق بعد مكالمةٍ أو قفل الشاشة)
    function restartSpeech() {
        const sp = S.sp;
        if (!sp || !S.running) return;
        const old = sp.rec;
        sp.rec = null;                                  // onend القديم لا يُعيد نفسه
        try { if (old) old.abort(); } catch (e) { /* انتهى أصلاً */ }
        sp.on = true; sp.err = ''; sp.heard = Date.now();
        renderSpeechLive();
        setTimeout(() => { if (sp.on && S.running && S.sp === sp && !sp.rec) speechRun(sp); }, 300);
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
        // التقاطٌ متوقّف: تحليل الصوت يسمع كلاماً (٢٠ ثانيةً فأكثر) ولا يصل من المحوِّل نصّ — أو بلا تحليل صوتٍ دقيقتان بلا نصّ
        const gap = Math.max(0, (Date.now() - (sp.heard || Date.now())) / 1000);
        let voiced = 0;
        if (S.audio) for (let j = Math.max(0, S.secs.length - Math.floor(gap)); j < S.secs.length; j++) if (S.secs[j] && S.secs[j].v) voiced++;
        const quiet = sp.on && !sp.err && (S.audio ? voiced >= 20 : gap >= 120);
        const qe = $('eyeSpeechQuiet');
        qe.classList.toggle('hidden', !quiet);
        if (quiet) qe.textContent = (S.audio ? 'يُسمع كلامٌ ولا يصل نصٌّ منذ ' : 'لم يصل نصٌّ منذ ') + mmss(gap)
            + ' — قد يكون التعرّف توقّف (مكالمة، قفل الشاشة، انقطاع الإنترنت). المس «تشغيل فهم الكلام».';
        // توقّف التعرّف (إذنٌ يُطلب بلمسة — كأن بدأ الرصد بوصول صورة الهاتف لا بضغطة)، أو التقاطٌ متوقّف: يُعاد بلمسة
        $('eyeSpeechRetry').classList.toggle('hidden', !((sp.err && !sp.on) || quiet));
        renderCue();
        const last = sp.segs[sp.segs.length - 1];
        const tx = $('eyeSpeechText');
        tx.textContent = '';
        if (last) tx.appendChild(document.createTextNode('«' + last.x + '»'));
        if (sp.interim) { const i = document.createElement('span'); i.className = 'text-slate-400'; i.textContent = ' ' + sp.interim; tx.appendChild(i); }
        if (!last && !sp.interim) tx.textContent = 'ينتظر كلام المعلّم…';
        if (sp.dirty && SX()) {
            sp.A = SX().analyze(sp.segs, { topic: info().topic, ctx: S.ctxEvents, seconds: Math.max(0, now() - (S.spOff || 0)), admin: S.rollSpans });
            const G = guideOn();
            sp.G = G ? LG().speechCoverage(SX().lessonSegs(sp.segs, S.rollSpans), G, S.guide.skills) : null;      // نقاط المهارة وأسئلة التقويم كما تُسمع (بلا الحضور والزيّ)
            sp.dirty = false;
            updateGuideLive();
        }
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
        watchFrames(v);                                 // كاميرا تتوقّف (مكالمة، قفل الشاشة) تُكشف ولا تُعدّ صورتها المتجمّدة انتظاراً
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

    // ── كاميرا الهاتف (2026-10-26) ──
    // الـiPhone على الحامل يرسل صورته مباشرةً إلى هذا الجهاز (WebRTC على نقطة الاتّصال)، وهنا يجري التحليل كلّه؛ والصوت
    // وفهم الكلام من ميكروفون هذا الجهاز — المستقبِل اللاسلكيّ لميكروفون المعلّم موصولٌ به. الثواني التي لا تصل فيها صورةٌ
    // (انقطاعٌ، قفل شاشة الهاتف، تبديل العدسة) «غير محسوبة» لا انتظار، وتُذكر مدّتها في النتيجة.
    const LK = () => root.SvfEyeLink;
    function linkSup() {
        try { if (root.SupervisorCloud && SupervisorCloud.bucket) { const b = SupervisorCloud.bucket(); if (b) return b; } } catch (e) { /* التالي */ }
        try {
            const s = root.SupervisorGate && SupervisorGate.session();
            const b = s ? (s.admin ? 'admin' : s.id) : '';
            if (/^[a-z][a-z0-9-]{1,30}$/.test(b)) return b;
        } catch (e) { /* بلا جلسة */ }
        return '';
    }
    let qrLoading = null;
    function loadQr() {
        if (typeof root.qrcode === 'function') return Promise.resolve(root.qrcode);
        if (!qrLoading) qrLoading = new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = new URL('vendor/qrcode/qrcode.js', document.baseURI).href;
            s.onload = () => (typeof root.qrcode === 'function' ? res(root.qrcode) : rej(new Error('qr')));
            s.onerror = () => { qrLoading = null; rej(new Error('qr')); };
            document.head.appendChild(s);
        });
        return qrLoading;
    }
    async function drawQr(url) {
        const box = $('eyePairQr');
        box.textContent = '…';
        try {
            const q = (await loadQr())(0, 'M');
            q.addData(url);
            q.make();
            box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 8, scalable: true, title: 'رمز ربط كاميرا الهاتف' });
            const svg = box.querySelector('svg');
            if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; }
        } catch (e) { box.textContent = 'تعذّر رسم الرمز — انسخ الرابط وافتحه في الهاتف.'; }
    }
    const startBtns = ['eyeStartCam', 'eyeStartPhone', 'eyeFileBtn', 'eyeStartNoCam', 'eyeTapsOnly'];
    function pairUi(on, text) {
        const box = $('eyePair');
        if (!box) return;
        box.classList.toggle('hidden', !on);
        if (text != null) $('eyePairState').textContent = text;
        if (!S.running) {
            startBtns.forEach(id => $(id).classList.toggle('hidden', !!on));
            $('eyeIdle').textContent = on ? 'ينتظر كاميرا الهاتف — امسح الرمز بكاميرا الـiPhone.' : IDLE_TEXT;
        }
        layout();
        const micEl = $('eyePairMic');
        if (on && micEl) {
            micEl.textContent = S.audio
                ? 'الصوت' + (S.wantSpeech ? ' وفهم الكلام' : '') + ' من ميكروفون هذا الجهاز' + (checked('eyeTeacherMic') ? ' (على المعلّم).' : ' — إن كان مستقبِل ميكروفون المعلّم موصولاً به فعلّم «على المعلّم» في المرّة القادمة قبل البدء.')
                : 'بلا صوت: الصورة وحدها من الهاتف.';
        }
    }
    function copyPairUrl() {
        const url = S.link && S.link.url;
        if (!url) return;
        const done = () => toast('نُسخ الرابط — افتحه في Safari على الـiPhone');
        try { navigator.clipboard.writeText(url).then(done, () => root.prompt('انسخ الرابط:', url)); }
        catch (e) { root.prompt('انسخ الرابط:', url); }
    }
    async function startPhone() {
        if (S.running || S.link) return;
        message('');
        if (!needConsent(true)) return;
        const wantSpeech = speechConsent();
        if (!root.RTCPeerConnection || !LK()) { message('هذا المتصفّح لا يتيح الاتّصال المباشر بالهاتف. استعمل Safari أو Chrome حديثاً.'); return; }
        const sup = linkSup();
        if (!sup) { message('«كاميرا الهاتف» تحتاج الدخول برمزك (الربط بقاعدة المعلمين): به يُنشأ رمز الربط في مسارك.'); return; }
        // الميكروفون يُفتح الآن داخل الضغطة (iOS لا يبدأ تحليل الصوت إلّا بلمسة)، ويبدأ عدّه حين تصل الصورة
        if (checked('eyeMic') && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                S.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
                refreshMics();
                startAudio(ctx => ctx.createMediaStreamSource(S.stream), false);
            } catch (e) { toast('الميكروفون غير متاح — تُحلَّل صورة الهاتف وحدها', 'info'); }
        }
        S.wantSpeech = wantSpeech;
        await openLink(sup);
    }
    // رمزٌ جديد: أوّل الرصد، أو إعادة الربط أثناءه (والرابط السابق يُغلق)
    async function openLink(sup) {
        const gen = ++S.linkGen;
        if (S.link) { const old = S.link; S.link = null; try { old.close(); } catch (e) { /* أُغلق */ } }
        S.linkSup = sup;
        S.linkFailed = false;
        $('eyePairNew').classList.add('hidden');
        $('eyeRelink').classList.add('hidden');
        $('eyePairQr').textContent = '…';
        pairUi(true, 'جاري إنشاء رمز الربط…');
        let link;
        try {
            link = await LK().host({
                sup,
                onStream: st => { if (gen === S.linkGen) phoneStream(st); },
                onState: st => { if (gen === S.linkGen) phoneState(st); },
                onMessage: m => { if (gen === S.linkGen) phoneMsg(m); }
            });
        } catch (e) {
            if (gen !== S.linkGen) return;
            pairUi(true, 'تعذّر إنشاء رمز الربط — تحقّق من اتّصال هذا الجهاز بالإنترنت (نقطة الاتّصال)، ثمّ «رمز جديد».');
            $('eyePairNew').classList.remove('hidden');
            return;
        }
        if (gen !== S.linkGen) { link.close(); return; }
        S.link = link;
        drawQr(link.url);
        pairUi(true, 'ينتظر الهاتف… الرمز صالحٌ ربع ساعة.');
    }
    function cancelPhone() {
        S.linkGen++;
        if (S.link) { const l = S.link; S.link = null; try { l.close(); } catch (e) { /* أُغلق */ } }
        pairUi(false);
        if (S.running) { S.linkDown = true; $('eyeRelink').classList.remove('hidden'); return; }
        // لم يبدأ الرصد: يُغلق الميكروفون ويعود كلّ شيء
        if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
        if (S.audio) { try { S.audio.ctx.close(); } catch (e) { /* أُغلق */ } S.audio = null; }
        S.wantSpeech = false;
    }
    // تتبّع وصول الإطارات: صورةٌ متجمّدةٌ (انقطاع) لا تُقارَن بنفسها فتُعدّ «انتظاراً». إشارتان: نداء كلّ إطارٍ معروض
    // (requestVideoFrameCallback) وعدّاد الإطارات (getVideoPlaybackQuality — يُقرأ متزامناً فلا يخدعه انشغال الصفحة)
    function watchFrames(v) {
        const tok = S.frameTok = {};
        S.lastFrameAt = 0; S.frameCount = 0; S.lastTickAt = 0; S.vpqOk = false; S.linkAt = performance.now();
        S.rvfc = !!(v && typeof v.requestVideoFrameCallback === 'function');
        S.vpq = !!(v && typeof v.getVideoPlaybackQuality === 'function');
        if (!S.rvfc) return;
        const cb = () => {
            if (tok !== S.frameTok || !S.running || S.video !== v) return;
            S.lastFrameAt = performance.now();
            v.requestVideoFrameCallback(cb);
        };
        v.requestVideoFrameCallback(cb);
    }
    // في كلّ نبضة: عدّاد الإطارات تقدّم ← وصل إطار؛ ونبضةٌ تأخّرت لانشغال الصفحة (الكشف على جهازٍ بطيء) لا تُعدّ انقطاعاً
    function phoneTick(v) {
        const t = performance.now();
        if (S.vpq) {
            // يُعتمد العدّاد حين يتحرّك مرّةً (بعض المتصفّحات تتركه صفراً لصورة الاتّصال المباشر)
            try { const n = v.getVideoPlaybackQuality().totalVideoFrames; if (n && n !== S.frameCount) { S.frameCount = n; S.lastFrameAt = t; S.vpqOk = true; } }
            catch (e) { S.vpq = false; }
        }
        if (S.lastTickAt && t - S.lastTickAt > 1500 && S.lastFrameAt) S.lastFrameAt = Math.max(S.lastFrameAt, t - 1000);
        S.lastTickAt = t;
    }
    const phoneFrozen = () => S.via === 'phone' && (S.linkDown || ((S.rvfc || S.vpqOk) && performance.now() - S.lastFrameAt > 2000));
    function phoneStream(stream) {
        pairUi(false);
        $('eyeRelink').classList.add('hidden');
        S.linkDown = false; S.linkFailed = false;
        if (S.running && S.via === 'phone') {              // عاد الهاتف أثناء الرصد
            S.video.srcObject = stream;
            S.video.play().catch(() => {});
            S.prev = null; AI.prevG = null;
            watchFrames(S.video);
            toast('عاد الاتّصال بكاميرا الهاتف');
            return;
        }
        if (S.running) return;
        const v = freshVideo();
        v.srcObject = stream;
        v.muted = true;
        v.play().catch(() => {});
        begin('camera', v, 'phone');
        watchFrames(v);
        lensUi();
        if (S.wantSpeech) speechStart(S.stream ? (S.stream.getAudioTracks()[0] || null) : null);
    }
    function phoneState(st) {
        if (st === 'channel' || st === 'connected') {
            S.linkDown = false;
            if (st === 'channel' && S.link) S.link.send({ type: 'hello' });
            if (!S.running) pairUi(true, 'الهاتف متّصل — تصل الصورة…');
        } else if (st === 'connecting') {
            if (!S.running) pairUi(true, 'وُجد الهاتف — جاري الاتّصال…');
        } else if (st === 'disconnected') {
            S.linkDown = true;
        } else if (st === 'failed' || st === 'closed') {
            S.linkDown = true;
            if (S.running) { S.linkFailed = true; $('eyeRelink').classList.remove('hidden'); toast('انقطع الاتّصال بكاميرا الهاتف — الثواني بلا صورة لا تُحسب', 'info'); }
            else { pairUi(true, 'تعذّر الاتّصال بالهاتف. تأكّد أنّ الجهازين على نقطة الاتّصال نفسها، ثمّ «رمز جديد».'); $('eyePairNew').classList.remove('hidden'); }
        } else if (st === 'expired') {
            pairUi(true, 'انتهت صلاحيّة الرمز — اضغط «رمز جديد».');
            $('eyePairNew').classList.remove('hidden');
        }
    }
    function phoneMsg(m) {
        if (!m || typeof m !== 'object') return;
        if (m.type === 'cams') {
            const list = (Array.isArray(m.list) ? m.list : []).filter(c => c && typeof c.id === 'string' && c.id.length <= 200).slice(0, 8)
                .map(c => ({ id: c.id, label: String(c.label || '').slice(0, 60), ultra: !!c.ultra }));
            const z = m.zoom && typeof m.zoom === 'object' && isFinite(m.zoom.min) && isFinite(m.zoom.max) && m.zoom.max > m.zoom.min
                ? { min: +m.zoom.min, max: +m.zoom.max, step: +m.zoom.step || 0.1, v: isFinite(m.zoom.v) ? +m.zoom.v : +m.zoom.min } : null;
            const was = S.phoneCams && S.phoneCams.cur;
            S.phoneCams = { cur: typeof m.cur === 'string' ? m.cur : '', list, zoom: z };
            if (was && was !== S.phoneCams.cur) lensChanged();
            lensUi();
        } else if (m.type === 'bye') {
            S.linkDown = true;
            if (S.running) { S.linkFailed = true; $('eyeRelink').classList.remove('hidden'); toast('أُغلقت كاميرا الهاتف — «إعادة ربط الهاتف» لإعادتها، أو «إيقاف وتحليل»', 'info'); }
        }
    }
    function lensUi() {
        const row = $('eyeLensRow');
        if (!row) return;
        const on = S.running && S.via === 'phone';
        row.classList.toggle('hidden', !on);
        if (!on) return;
        const c = S.phoneCams || { list: [] };
        $('eyeLens').innerHTML = c.list.length
            ? c.list.map(x => `<button type="button" class="svf-btn svf-btn-sm ${x.id === c.cur ? 'svf-btn-primary' : 'svf-btn-secondary'}" data-lens="${esc(x.id)}" aria-pressed="${x.id === c.cur}">${esc(LK().lensLabel(x.label, x.ultra))}</button>`).join('')
            : '<span class="text-slate-500">ينتظر قائمة العدسات…</span>';
        const z = c.zoom, zl = $('eyeZoomLbl'), zi = $('eyeZoom');
        zl.classList.toggle('hidden', !z);
        if (z) { zi.min = z.min; zi.max = z.max; zi.step = z.step; zi.value = z.v; }
        $('eyeWide').classList.toggle('hidden', !wideStep());
    }
    // أوسع زاويةٍ في الهاتف: العدسة العريضة جدّاً إن لم تكن الحاليّة، وإلّا أقلّ تقريب — خطوةٌ بلمسة (تبديل العدسة يمسح منطقة الصفّ والمعلّم)
    function wideStep() {
        const c = S.phoneCams;
        if (!c) return null;
        const u = c.list.find(x => x.ultra);
        if (u && u.id !== c.cur) return { lens: u.id };
        if (c.zoom && c.zoom.v > c.zoom.min + 1e-6) return { zoom: c.zoom.min };
        return null;
    }
    function phoneWide() {
        const w = wideStep();
        if (!w) { toast('الهاتف على أوسع زاويةٍ لديه — أبعد الحامل أو ارفعه', 'info'); return; }
        if (w.lens) phoneLens(w.lens); else { phoneZoom(w.zoom); S.phoneCams.zoom.v = w.zoom; lensUi(); }
    }
    // العدسة أو التقريب يغيّران هندسة الصورة: منطقة الصفّ والمعلّم والمتتبَّعون يُعادون
    function lensChanged() {
        if (!S.running) return;
        setRoi(null);
        S.teacher = null; S.pickTeacher = false;
        if (AI.T) AI.T = E().newTracker();
        S.prev = null; AI.prevG = null;
        teacherUi();
        toast('تغيّرت صورة الهاتف — حدّد منطقة الصف' + (checked('eyeAI') ? ' والمعلّم' : '') + ' من جديد', 'info');
    }
    function phoneLens(id) {
        if (!S.link || !S.phoneCams || id === S.phoneCams.cur) return;
        S.link.send({ type: 'lens', id });
    }
    function phoneZoom(v) {
        if (!S.link) return;
        S.link.send({ type: 'zoom', v: Number(v) });
        lensChanged();
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

    function begin(src, video, via) {
        S.running = true;
        S.runId++;
        renderQuick();                    // «أهمّ ما تلمسه» بعادة المشرف حتّى آخر حصة
        S.src = src;
        S.via = via || null;              // 'phone' ← الصورة من كاميرا الهاتف
        S.lostSec = 0;
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
        S.rollSpans = []; S.rollSig = '';
        S.cue = null;
        S.result = null;
        S.hadAudio = !!S.audio;
        S.mic = checked('eyeTeacherMic') ? 'teacher' : 'device';
        S.pSnap = null; S.pSnapAt = -1; S.classMax = 0;
        S.tl = null;
        S.consent = src !== 'none' || !!S.audio || checked('eyeSpeech') ? checked('eyeConsent') : false;
        S.sp = null;
        S.sample = null; S.sampleRound = 'a'; S.marks = []; S.samplePick = -1;
        S.teacher = null; S.pickTeacher = false;
        setRoi(null);                       // كلّ رصدٍ جديد يبدأ بالإطار كلّه: الكاميرا قد تحرّكت
        S.gapSec = 0; S.resumes = 0; S.spOff = 0; S.camFrozenFor = 0; S.ckWarned = false;
        // رصدٌ يُكمَل من نسخته الاحتياطيّة: أرقامه ولمساته تعود، والمدّة منذ آخر نسخةٍ «غير محسوبة»، والساعة تكمل
        const RS = S.resume; S.resume = null;
        let resumed = null;
        if (RS) {
            S.spSeed = null;
            const gap = Math.max(0, Math.min(CK_MAX_GAP, Math.round((Date.now() - RS.at) / 1000)));
            restoreState(RS, gap, true);
            S.t0 = performance.now() - S.lastSec * 1000;
            resumed = { from: RS.sec, gap };
            ckClear();
        } else S.spSeed = null;
        S.lastCk = S.lastSec;
        renderCounts();
        renderCtx();
        renderSample();
        renderMarks();
        renderFocus();
        resetMonitor();
        applyVideoVisibility();
        $('eyeResult').classList.add('hidden');
        $('eyeIdle').classList.toggle('hidden', src !== 'none');
        if (src === 'none') $('eyeIdle').textContent = 'رصدٌ بلا كاميرا: المس «عناصر الحصة» حين يبدأ كلٌّ منها، والوسوم كلّما رأيتها' + (S.audio ? '، والصوت يُحلَّل' : '') + (checked('eyeSpeech') && S.speechConsent ? '، وكلام المعلّم يصير نصّاً.' : '.');
        $('eyeStatus').classList.remove('hidden');
        startBtns.forEach(id => $(id).classList.add('hidden'));
        $('eyeStop').classList.remove('hidden');
        ['eyeFacing', 'eyeMic', 'eyeRate', 'eyeMicDev', 'eyeTeacherMic', 'eyeAI', 'eyeSpeech'].forEach(id => { $(id).disabled = true; });
        $('eyeRoiBtn').disabled = src === 'none';
        teacherUi();
        liveDot(true);
        const r = src === 'file' ? rate() : 1;
        if (video) S.timers.push(setInterval(frameTick, Math.round(250 / r)));
        if (S.audio) S.timers.push(setInterval(audioTick, Math.round(100 / r)));
        S.timers.push(setInterval(liveTick, 1000));
        if (video && checked('eyeAI')) startAI(r);
        if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(w => { S.wake = w; }).catch(() => {});
        layout();
        renderResume();
        if (resumed) { renderGuide(); renderFocus(); toast('أُكمل الرصد من ' + mmss(resumed.from) + ' — ' + (resumed.gap ? 'استُبعدت ' + E().dur(resumed.gap) + ' ضائعة. ' : '')
            + (S.roi ? 'تأكّد أنّ منطقة الصفّ ما زالت على الملعب، ' : '') + (src !== 'none' && checked('eyeAI') ? 'وحدّد المعلّم من جديد.' : ''), 'info'); drawView(); return; }
        toast(src === 'file' ? 'بدأ تحليل المقطع' : src === 'none' ? 'بدأ الرصد بلا كاميرا'
            : (S.via === 'phone' ? 'وصلت صورة الهاتف — ' : 'بدأ الرصد — ') + 'حدّد منطقة الصف، والمس السياق والوسوم طوال الحصة');
        drawView();
    }

    // ── كشف الطلبة (نموذجٌ داخل الجهاز) ──
    // نموذج الكشف (2026-10-29): YOLOX‑Nano في عاملٍ في الخلفيّة (vendor/onnx/، المعالج — لا تتجمّد الصفحة ولا يعتمد على بطاقة الرسوم)،
    // وإن تعذّر فـCenterNet السابق (vendor/human/). كلاهما يُرجع {object: [{label, score, boxRaw: [x, y, w, h]}]} بنسبة اللوح.
    // SVF_EYE_ENGINE = 'human' يفرض السابق (للفحص والمقارنة).
    function yoloxEngine() {
        return new Promise((resolve, reject) => {
            let w;
            try { w = new Worker(new URL('js/eye-detect-worker.js', document.baseURI), { type: 'module' }); } catch (e) { reject(e); return; }
            const base = new URL('vendor/onnx/', document.baseURI).href, wait = new Map();
            let seq = 0, ready = false;
            const fail = err => { clearTimeout(to); try { w.terminate(); } catch (e) { /* انتهى */ } wait.forEach(p => p.rej(err)); wait.clear(); if (!ready) reject(err); };
            const to = setTimeout(() => fail(new Error('انتهت مهلة تحميل النموذج')), 60000);
            const engine = {
                name: 'yolox', label: 'YOLOX',
                detect: (canvas, rgba, cw, ch) => new Promise((res, rej) => {
                    const id = ++seq, buf = new Uint8ClampedArray(rgba).buffer;      // نسخةٌ تُنقل إلى العامل؛ الأصل يبقى للزيّ والحركة
                    wait.set(id, { res, rej });
                    w.postMessage({ type: 'detect', id, w: cw, h: ch, buf, person: E().PERSON_MIN_SCORE, ball: E().BALL_MIN_SCORE }, [buf]);
                }).then(m => ({ object: m.dets.map(d => ({ label: d.label, score: d.score, boxRaw: [d.x, d.y, d.w, d.h] })), ms: m.ms })),
                stop: () => { try { w.terminate(); } catch (e) { /* انتهى */ } }
            };
            w.onmessage = e => {
                const m = e.data || {};
                if (m.type === 'ready') { ready = true; clearTimeout(to); resolve(engine); return; }
                const p = m.id != null ? wait.get(m.id) : null;
                if (p) { wait.delete(m.id); if (m.type === 'dets') p.res(m); else p.rej(new Error(m.error)); }
                else if (m.type === 'error') fail(new Error(m.error));
            };
            w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); fail(new Error((e && e.message) || 'عامل الكشف')); };
            w.postMessage({ type: 'init', base, model: base + 'yolox_nano.onnx', size: 416 });
        });
    }
    async function humanEngine() {
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
        return { name: 'human', label: 'CenterNet', detect: c => human.detect(c), stop: () => {} };
    }
    function loadAI() {
        if (AI.loading) return AI.loading;
        AI.loading = (async () => {
            let eng = null;
            if (root.SVF_EYE_ENGINE !== 'human' && typeof Worker === 'function') {
                try { eng = await yoloxEngine(); } catch (e) { console.warn('YOLOX غير متاح — CenterNet', e); }
            }
            if (!eng) eng = await humanEngine();
            AI.engine = eng;
            AI.ok = true;
            return eng;
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
            aiState('كشف الطلبة: جاهز (' + AI.engine.label + ')');
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
        if (!S.running || !AI.ok || AI.busy || !v || v.readyState < 2 || !v.videoWidth || phoneFrozen()) return;
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
            const res = await AI.engine.detect(c, rgba, cw, ch);
            if (!S.running || S.runId !== id) return;
            const dets = (res.object || []).filter(o => o.label === 'person' && o.score >= E().PERSON_MIN_SCORE).map(o => {
                const b = o.boxRaw;
                return {
                    x: box.x + b[0] * box.w, y: box.y + b[1] * box.h, w: b[2] * box.w, h: b[3] * box.h, score: o.score,
                    act: prev ? E().boxMotion(prev, gray, cw, ch, { x: b[0], y: b[1], w: b[2], h: b[3] }, thr, shift) : 0,
                    dish: (sc => (sc ? E().isDishdasha(sc) : null))(E().garmentScore(rgba, cw, ch, { x: b[0], y: b[1], w: b[2], h: b[3] }))
                };
            });
            // الكرات (النموذج نفسه): ما يقع داخل منطقة الصفّ
            const balls = (res.object || []).filter(o => o.label === 'sports ball' && o.score >= E().BALL_MIN_SCORE).filter(o => {
                const b = o.boxRaw, cx = box.x + (b[0] + b[2] / 2) * box.w, cy = box.y + (b[1] + b[3] / 2) * box.h;
                return !S.roi || E().inPoly(cx, cy, S.roi);
            }).length;
            AI.prevG = gray; AI.prevKey = key;
            E().trackStep(AI.T, dets, t, vw / vh, AI.ttl);
            S.teacher = E().teacherStep(AI.T, S.teacher, t);
            S.pSnap = E().peopleSnapshot(AI.T, t, S.roi, S.teacher);
            S.pSnap.b = balls;
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
            const tc = S.pSnap.tc;
            aiState('في الملعب: ' + S.pSnap.n + (S.pSnap.r ? ' · خارجها: ' + S.pSnap.o : '') + (S.teacher ? (tc ? ' · المعلّم ' + (tc.edge === true ? 'على الطرف' : tc.edge === false ? 'في الوسط' : 'محدَّد') : ' · المعلّم غاب عن الكشف') : ''));
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
                v: a.af ? a.voice / a.af >= 0.35 : (S.audio && S.audio.ctx && S.audio.ctx.state === 'running' ? false : null),
                w: a.whistle,
                p: p ? Object.assign({ n: p.n, mv: p.mv, o: p.o, q: p.q, r: p.r, fm: p.fm, ln: p.ln, d: p.d, vg: p.vg, cr: p.cr, b: p.b, e: p.e },
                    p.tc ? { t: [p.tc.x, p.tc.y, p.tc.mv ? 1 : 0, p.tc.edge == null ? -1 : p.tc.edge ? 1 : 0] } : {}) : null
            });
            if (a.lost && a.bad >= a.n) S.lostSec++;            // ثانيةٌ بلا صورةٍ من الهاتف
            S.acc = freshAcc();
            S.lastSec++;
        }
    }

    function frameTick() {
        const v = S.video;
        if (!S.running || !v) return;
        if (S.via === 'phone' || S.src === 'camera') phoneTick(v);
        // صورة الهاتف لا تصل (انقطاعٌ، أو قُفلت شاشته، أو تتبدّل العدسة)، أو توقّفت كاميرا الجهاز (مكالمة، تطبيقٌ آخر أخذها):
        // الثانية «غير محسوبة» — الصورة المتجمّدة ليست انتظاراً
        if ((S.via === 'phone' && (phoneFrozen() || v.readyState < 2 || !v.videoWidth)) || camFrozen()) {
            flushTo(Math.floor(now()));
            S.acc.bad++; S.acc.lost = true;
            S.prev = null;
            return;
        }
        if (v.readyState < 2 || !v.videoWidth) return;
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
        if (!S.running || !S.audio || (S.audio.ctx && S.audio.ctx.state !== 'running')) return;   // مُعلَّق (مكالمة): لا يُقرأ طيفٌ قديم
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
        if (S.lastSec - S.lastCk >= 10) ckSave();
        // كاميرا الجهاز متوقّفة ثلاث ثوانٍ: زرّ «إعادة تشغيل الكاميرا» يكملها في الرصد نفسه
        if (S.src === 'camera' && S.via !== 'phone') {
            S.camFrozenFor = camFrozen() ? S.camFrozenFor + 1 : 0;
            $('eyeCamRestart').classList.toggle('hidden', S.camFrozenFor < 3);
            if (S.camFrozenFor === 3) toast('توقّفت الكاميرا — ثوانيها لا تُحسب. «إعادة تشغيل الكاميرا» تكمل الرصد نفسه', 'error');
        }
        if (S.audio && S.audio.ctx && S.audio.ctx.state === 'suspended') S.audio.ctx.resume().catch(() => {});
        // فهم الكلام عبر خدمة المتصفّح بلا إنترنت: ثوانٍ لا تُحسب في معدّلات الكلام
        if (S.sp && S.sp.on && S.sp.mode !== 'local' && (navigator.onLine === false || Date.now() - (S.sp.netAt || 0) < 5000)) S.spOff++;
        renderKpis(M, S.lastSec);
        // ثواني الحضور والزيّ تتغيّر حيّاً (التلقائيّ يمتدّ حتّى أوّل نشاط): الكلام يُعاد تحليله بلاها
        const rs = (M.admin && M.admin.spans) || [], sig = JSON.stringify(rs);
        if (sig !== S.rollSig) { S.rollSig = sig; S.rollSpans = rs; if (S.sp) S.sp.dirty = true; }
        const last = M.states.slice(-3);
        const k = last.length ? last[last.length - 1] : 'x';
        const ctxL = S.ctxCur && E().PART[S.ctxCur] ? E().PART[S.ctxCur].label : '';
        $('eyeState').textContent = S.src === 'none' ? (ctxL || 'رصد')
            : phoneFrozen() ? 'لا صورة من الهاتف'
            : camFrozen() ? 'الكاميرا متوقّفة'
            : k === 'r' ? E().ROLL.label
            : (k === 'a' ? 'نشاط' : k === 'i' ? 'انتظار' : 'الكاميرا تتحرّك') + (ctxL ? ' · ' + ctxL : '');
        // بلا صورةٍ من الهاتف عشر ثوانٍ: زرّ إعادة الربط ظاهر
        if (S.via === 'phone') $('eyeRelink').classList.toggle('hidden', !($('eyePair').classList.contains('hidden')
            && (!S.link || S.linkFailed || (phoneFrozen() && performance.now() - Math.max(S.lastFrameAt, S.linkAt || 0) > 10000))));
        // المتابعة الحيّة: سلسلةٌ لكلّ عشر ثوانٍ و«الآن» والتنبيهات (eye-core: live)
        const L = S.live = E().live(recNow(), M, { rec: recPref(), phone: S.via === 'phone', frozen: S.camFrozenFor > 0, camera: S.src !== 'none', ai: checked('eyeAI') && AI.ok, roi: !!S.roi });
        drawTimeline(L.series.map(liveItem));
        renderMonitor(L, M);
        drawSpark();
        drawHeat();
        drawView();
        $('eyeDotKey').classList.toggle('hidden', !(checked('eyeAI') && AI.ok && S.src !== 'none'));
        if (S.lastSec % 5 === 0) refreshEvidence(M);
        if (S.via === 'phone') $('eyeWide').classList.toggle('hidden', !wideStep());
        renderSpeechLive();
    }
    // مقطع السلسلة الحيّة بشكل مجرى الحصة (والمحفوظ مثله: tl/tv/tc/tm/tt)
    const liveItem = b => ({ k: b.k, v: b.act != null ? b.act : 0, c: b.c ? E().PART[b.c].c : '-', mv: b.mv, talk: b.talk, w: b.w });

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
        set('eyeKpiPupils', big ? String(big) : '—', snap ? 'الطلبة (الأكبر) · الآن ' + (snap.n + snap.o) : 'الطلبة (الأكبر)');
        set('eyeKpiOut', snap && snap.r ? String(snap.o) : P && P.roi ? String(P.outsideMed) : '—');
        set('eyeKpiForm', snap && snap.fm && snap.fm !== '-' ? E().FORMS[snap.fm] : M.forms && M.forms.count ? E().count(M.forms.count, 'تشكيلٌ واحد', 'تشكيلان', 'تشكيلات', 'تشكيلاً') : '—');
        set('eyeKpiDish', snap ? String(snap.d || 0) : P ? String(P.dishEst || 0) : '—');
        set('eyeKpiWaits', M.observed >= 20 ? String(M.waits) : '—');
        const resp = M.resp && M.resp.med != null ? ' · ' + M.resp.med + ' ث' : '';
        set('eyeKpiWhistle', S.running ? (S.audio ? String(M.whistles) + resp : 'بلا صوت') : String(M.whistles || 0) + resp, resp ? 'الصفّارة · الاستجابة' : 'الصفّارة');
    }

    // ── الرسم ──
    // مجرى الحصة: من اليمين (البداية) إلى اليسار، على طول الحصة الموصى به (٤٠ د) فيمتلئ حيّاً.
    //   شريط العناصر بألوانها · حركة الطلبة٪ مساحةً (وبلا كشفٍ مستوى حركة الصورة أعمدةً) وخطّ ٥٠٪ · شريط الحالة (نشاط/انتظار/غير محسوب)
    //   · كلام المعلّم · الصفّارة مثلّثات · اللمسات · علامات المشرف · ودقائقُ على المحور
    function drawTimeline(tl) {
        const c = $('eyeTimeline');
        if (!c) return;
        if (tl) S.tl = tl;
        const items = S.tl || [];
        const dpr = root.devicePixelRatio || 1, Wc = c.clientWidth || 600, Hc = c.clientHeight || 150;
        c.width = Math.round(Wc * dpr); c.height = Math.round(Hc * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, Wc, Hc);
        const n = tlLen(items.length);
        const tick = n <= 60 ? 1 : 5;          // دقيقةٌ لكلّ خطّ في الرصد القصير، وخمسٌ في الحصة
        const bw = Wc / n, X = i => Wc - (i + 1) * bw;
        const P0 = 0, P1 = 6, M0 = 14, M1 = Hc - 44, S0 = M1 + 5, S1 = M1 + 11, T0 = M1 + 14, T1 = M1 + 19, AX = Hc - 4;
        const Y = v => M1 - (Math.max(0, Math.min(100, v)) / 100) * (M1 - M0);
        // الشبكة والمحور: كلّ خمس دقائق، والنسب ٠/٥٠/١٠٠
        g.font = '10px ' + "'IBM Plex Sans Arabic', Tahoma, sans-serif";
        g.fillStyle = '#94a3b8'; g.textAlign = 'center';
        for (let m = 0; m * 6 <= n; m += tick) {
            const x = Wc - m * 6 * bw;
            g.fillStyle = 'rgba(15,23,42,.06)'; g.fillRect(Math.round(x), M0, 1, T1 - M0);
            g.fillStyle = '#94a3b8'; if (m) g.fillText(m + ' د', Math.max(12, Math.min(Wc - 12, x)), AX);
        }
        const useMv = items.some(b => b.mv != null);
        g.fillStyle = 'rgba(15,23,42,.08)';
        [0, 100].forEach(v => g.fillRect(0, Math.round(Y(v)), Wc, 1));
        if (useMv) { g.setLineDash([5, 4]); g.strokeStyle = '#94a3b8'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Y(50) + 0.5); g.lineTo(Wc, Y(50) + 0.5); g.stroke(); g.setLineDash([]); }
        if (!items.length) return;
        items.forEach((it, i) => {
            const x = X(i), w = Math.max(1, bw);
            if (it.c && it.c !== '-') { g.fillStyle = CTX_COLOR[it.c] || '#94a3b8'; g.fillRect(x, P0, w, P1 - P0); }
            // الحالة: نشاطٌ كحليّ، وانتظارٌ رماديّ، والحضور والزيّ رماديٌّ مزرقّ (مساحته مظلَّلة)، وغير المحسوب فاتح
            g.fillStyle = it.k === 'a' ? '#0f4c81' : it.k === 'i' ? '#cbd5e1' : it.k === 'r' ? CTX_COLOR.r : '#eef2f7';
            g.fillRect(x, S0, w, S1 - S0);
            if (it.k === 'i') { g.fillStyle = 'rgba(203,213,225,.35)'; g.fillRect(x, M0, w, M1 - M0); }
            if (it.k === 'r') { g.fillStyle = ROLL_TINT; g.fillRect(x, M0, w, M1 - M0); }
            if (it.talk != null && it.talk > 0) { g.fillStyle = 'rgba(217,164,65,' + (0.25 + 0.75 * it.talk).toFixed(2) + ')'; g.fillRect(x, T0, w, T1 - T0); }
            if (!useMv && it.k !== 'x' && it.k !== 'r') {
                const v = it.k === 'a' ? 12 + it.v * 88 : 6;
                g.fillStyle = it.k === 'a' ? '#0f4c81' : '#cbd5e1';
                g.fillRect(x + 0.5, Y(v), Math.max(1, bw - 1), M1 - Y(v));
            }
        });
        if (useMv) {
            // مساحة حركة الطلبة وخطّها — الفجوات (بلا قياس) تقطع الخطّ ولا تُوصل
            const runs = [];
            let cur = null;
            items.forEach((it, i) => { if (it.mv == null) { cur = null; return; } if (!cur) runs.push(cur = []); cur.push([X(i) + bw / 2, Y(it.mv)]); });
            runs.forEach(r => {
                if (r.length === 1) r = [[r[0][0] + bw / 2, r[0][1]], [r[0][0] - bw / 2, r[0][1]]];
                g.beginPath(); r.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
                g.lineTo(r[r.length - 1][0], M1); g.lineTo(r[0][0], M1); g.closePath();
                g.fillStyle = 'rgba(15,76,129,.18)'; g.fill();
                g.beginPath(); r.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
                g.strokeStyle = '#0f4c81'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
            });
        }
        // الصفّارة: مثلّثٌ أعلى المساحة (حيّاً من المقاطع، وبعد الرصد من أوقاتها المحفوظة)
        const wh = S.running ? items.map((it, i) => (it.w ? i * 10 + 5 : null)).filter(v => v != null)
            : ((S.result && S.result.M && S.result.M.resp && S.result.M.resp.list) || []).map(r => r[0]);
        g.fillStyle = '#082742';
        wh.forEach(t => { const x = Wc - (t / 10) * bw; g.beginPath(); g.moveTo(x - 4, M0 - 6); g.lineTo(x + 4, M0 - 6); g.lineTo(x, M0); g.closePath(); g.fill(); });
        // اللمسات بأوقاتها: خطٌّ رفيعٌ أسفل المساحة (الأحمر للسلبيّ)
        const evs = S.running ? S.events : ((S.result && S.result.ev) || []).map(e => ({ t: e[0], k: e[1] }));
        evs.forEach(e => {
            if (e.t == null || !E().TAG[e.k]) return;
            const x = Wc - (e.t / 10 + 0.5) * bw;
            g.fillStyle = E().TAG[e.k].neg ? '#b5452f' : '#b98a32';
            g.fillRect(x, M1 - 7, 2, 7);
        });
        // علامات المشرف: خطٌّ ذهبيّ بطول المساحة ومثلّثٌ أعلاه — ولحظات الرصد نقطةٌ كحليّة
        const marks = S.running || !S.result ? S.marks.map(m => m.t) : (S.result.marks || []).map(m => m[0]);
        marks.forEach(t => {
            const x = Wc - (t / 10 + 0.5) * bw;
            g.fillStyle = '#f0b44a';
            g.fillRect(x - 1, M0, 2, M1 - M0);
            g.beginPath(); g.moveTo(x - 5, M0 - 7); g.lineTo(x + 5, M0 - 7); g.lineTo(x, M0); g.closePath(); g.fill();
        });
        if (!S.running && S.result) E().autoMoments(S.result.M || {}).forEach(m => {
            const x = Wc - (m.t / 10 + 0.5) * bw;
            g.fillStyle = '#082742'; g.beginPath(); g.arc(x, M0 + 4, 3.5, 0, Math.PI * 2); g.fill();
        });
        // «الآن»: خطٌّ رفيعٌ عند آخر مقطعٍ أثناء الرصد
        if (S.running) { const x = X(items.length - 1); g.fillStyle = '#b5452f'; g.fillRect(Math.round(x) - 1, M0, 1.5, S1 - M0); }
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
        // النقطة موضع الطالب في آخر لقطة — والجاري يقطع أمتاراً في ثوانٍ، فتبهت بعد ثلثي ثانية وتختفي بعد ثانيةٍ ونصف
        // (كانت تبقى حتّى ٤٫٥ ث فتُرسم في أماكن خالية — فحص 2026-10-29). العدّ والتحليل لا يتأثّران: هذا الرسم وحده.
        const age = S.pSnap ? now() - S.pSnapAt : Infinity;
        const snap = S.pSnap && age <= DOT_HIDE ? S.pSnap : null;
        if (snap) {
            g.globalAlpha = age <= DOT_FADE ? 1 : 0.45;
            snap.dots.forEach(d => {
                const [x, y] = P([d.x, d.y]);
                if (d.tch) {                                   // المعلّم: مربّعٌ كحليّ بإطارٍ ذهبيّ
                    g.fillStyle = '#082742'; g.fillRect(x - 8, y - 14, 16, 16);
                    g.lineWidth = 2.5; g.strokeStyle = '#f0b44a'; g.strokeRect(x - 8, y - 14, 16, 16);
                    return;
                }
                g.beginPath();
                g.arc(x, y - 6, 6, 0, Math.PI * 2);
                g.fillStyle = !d.in ? DOT.out : d.pl ? DOT.place : d.mv ? DOT.move : DOT.still;
                g.fill();
                g.lineWidth = 1.5; g.strokeStyle = '#082742'; g.stroke();
            });
            g.globalAlpha = 1;
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
        // كاميرا الهاتف: يُبلَّغ الهاتف فيُطفئ كاميرته، ثمّ يُغلق الاتّصال
        S.linkGen++;
        S.frameTok = null;
        if (S.link) {
            const l = S.link;
            S.link = null;
            try { l.send({ type: 'bye' }); } catch (e) { /* أُغلق */ }
            setTimeout(() => { try { l.close(); } catch (e) { /* أُغلق */ } }, 400);
        }
        pairUi(false);
        S.prev = null;
        AI.prevG = null;
    }

    function stop(analyze) {
        if (!S.running) return;
        flushTo(Math.floor(now()));
        S.running = false;
        ckClear();
        $('eyeCamRestart').classList.add('hidden');
        S.roiMode = false; S.roiDraft = null; S.pickTeacher = false;
        const view = $('eyeView'); if (view) { view.style.pointerEvents = 'none'; view.style.cursor = ''; }
        release();
        liveDot(false);
        aiState('');
        roiHint();
        $('eyeStatus').classList.add('hidden');
        $('eyeDotKey').classList.add('hidden');
        $('eyeEvLive').classList.add('hidden');
        $('eyeStop').classList.add('hidden');
        $('eyeIdle').classList.remove('hidden');
        startBtns.forEach(id => $(id).classList.remove('hidden'));
        ['eyeFacing', 'eyeMic', 'eyeRate', 'eyeMicDev', 'eyeTeacherMic', 'eyeAI', 'eyeSpeech'].forEach(id => { $(id).disabled = id === 'eyeSpeech' && !SR(); });
        $('eyeRoiBtn').disabled = true;
        $('eyeRoiClear').classList.add('hidden');
        $('eyeRelink').classList.add('hidden');
        lensUi();
        teacherUi();
        renderSpeechLive();
        applyVideoVisibility();
        fitStage();
        drawView();
        layout();
        // آخر عبارةٍ يُسلّمها التعرّف على الكلام بعد الإيقاف بلحظة — تُنتظر قبل التحليل
        if (analyze) { if (S.sp) setTimeout(finish, 900); else finish(); }
    }

    function finish() {
        const M = E().summarize(recNow());
        const hasTaps = S.events.length > 0 || Object.keys(S.counts).some(k => S.counts[k] > 0);
        const sp = S.sp && S.sp.segs.length ? S.sp : S.spSeed && S.spSeed.segs.length ? S.spSeed : null;
        if (!M.observed && !M.ctx.covered && !hasTaps && !sp && !hasSample(S.sample)) { message('لا شيء يُحلَّل بعد: شغّل الكاميرا أو المس «عناصر الحصة» أو وسوم «ما لا تراه الكاميرا» أو «عيّنة الطلبة» أثناء الحصة.'); return; }
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
        // وما قيل أثناء الحضور والزيّ لا يُحلَّل (لا شرح ولا أسئلة ولا تعليمات درس)
        const rollS = (M.admin && M.admin.spans) || [];
        if (sp && SX()) keep.speech = SX().analyze(sp.segs, { topic: info().topic, ctx: S.ctxEvents, seconds: Math.max(0, M.seconds - (S.spOff || 0)), admin: rollS });
        // دليل المعلّم: الدليل ومهارة الحصة يُحفظان، وما سُمع من نقاطها الفنّيّة وأسئلة تقويمها
        const GD = guideOn();
        if (GD && sp) keep.gspeech = LG().speechCoverage(SX() ? SX().lessonSegs(sp.segs, rollS) : sp.segs, GD, S.guide.skills);
        const LS = E().live(recNow(), M).series;
        const packed = (ser, k, sc) => { const t = E().pack(ser, k, sc); return /[0-9]/.test(t) ? t : ''; };
        const data = {
            v: 2, at: new Date().toISOString(), src: M.observed ? S.src : (S.src === 'none' || M.ctx.covered ? 'none' : 'taps'), sens: sens(),
            audio: !!S.hadAudio, mic: S.mic || 'device', consent: !!S.consent,
            roi: S.roi || null,
            M: keep,
            tl: M.timeline.map(t => t.k).join(''),
            tv: M.timeline.map(t => Math.round(t.v * 9)).join(''),
            tc: M.timeline.map(t => t.c).join(''),
            // حركة الطلبة وكلام المعلّم لكلّ عشر ثوانٍ — لمجرى الحصة بعد الرصد (رقمٌ ٠–٩، و«-» بلا قياس)
            tm: packed(LS, 'mv', 0.1), tt: packed(LS, 'talk', 10),
            heat: S.grid && M.observed ? E().heatDigits(S.grid).join('') : '',
            counts: Object.assign({}, S.counts),
            ev: S.events.filter(e => e.t != null).slice(-300).map(e => [e.t, e.k]),
            cx: S.ctxEvents.map(e => [e.t, e.k]),
            outAuto, dishAuto,
            det: S.src !== 'none' && AI.ok && AI.engine && AI.count ? AI.engine.name : null,   // نموذج الكشف الذي رصد هذه الحصة
            sp: sp ? { mode: sp.mode, lang: sp.lang, consent: !!S.speechConsent, seg: sp.segs.map(x => [x.t, x.x]), off: S.spOff || 0 } : null,
            sample: hasSample(S.sample) ? JSON.parse(JSON.stringify(S.sample)) : null,
            guide: GD ? { id: GD.id, skills: S.guide.skills.slice() } : null,
            marks: S.marks.map(markRow),
            targets: [],
            applied: []
        };
        // الصورة من كاميرا الهاتف، وكم ثانيةً لم تصل فيها (استُبعدت)
        if (S.via === 'phone' && M.observed) { data.via = 'phone'; data.lost = S.lostSec || 0; }
        else if (M.observed && S.lostSec) data.lost = S.lostSec;                 // ثواني توقّف كاميرا الجهاز
        if (S.gapSec || S.resumes) data.gap = { sec: S.gapSec || 0, n: S.resumes || 0 };   // توقّف الرصد (إغلاق الصفحة) ثمّ أُكمل
        // أهداف الزيارة السابقة للمعلّم نفسه تُقاس على رصد اليوم (والبند ١١ منها)
        const prev = prevEye();
        if (prev && Array.isArray(prev.d.targets) && prev.d.targets.length)
            data.follow = { date: prev.date || '', targets: prev.d.targets, list: prev.d.targets.map(t => E().targetCheck(t, data)).filter(Boolean) };
        data.sugg = E().suggest(keep, data.counts, ctxOf(data));
        data.summary = E().summaryText(keep, ctxOf(data));
        save(data);
        lastSave(data);
        renderResult(data);
        renderResume();
        $('eyeResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── الحماية من الانقطاع (2026-10-28) ──
    // كلّ عشر ثوانٍ، وعند إخفاء الصفحة: نسخةٌ احتياطيّةٌ من الرصد الجاري في المتصفّح — أرقامه ولمساته وعلاماته ونصّ الكلام، **بلا صورةٍ
    // ولا صوت**. فإن أُغلقت الصفحة (Safari في الخلفيّة، نفاد الشحن، تحديثٌ بالخطأ) عُرض عند فتحها «أكمل الرصد» أو «حلّل ما رُصد».
    // المدّة بين آخر نسخةٍ والاستكمال «غير محسوبة» (كانقطاع صورة الهاتف): لا انتظار ولا نشاط. وبعد التحليل تبقى النتيجة احتياطاً
    // (svf_eye_last) حتّى يُحفظ التقرير — فإن أُغلقت الصفحة قبل الحفظ عُرض «استعادتها».
    const CK_KEY = 'svf_eye_live', LAST_KEY = 'svf_eye_last';
    const CK_MAX_GAP = 1800;                            // أكثر من نصف ساعة: الحصة انتهت — يُحلَّل ما رُصد ولا يُكمَل
    const SRC_LABEL = c => (c.via === 'phone' ? 'كاميرا الهاتف' : c.src === 'camera' ? 'كاميرا الجهاز' : 'بلا كاميرا');
    const formSig = () => { const I = info(); return { teacher: I.teacher, date: I.date, topic: I.topic, cls: I.cls }; };
    function ckRead() { try { const c = JSON.parse(localStorage.getItem(CK_KEY) || 'null'); return c && c.v === 1 && Array.isArray(c.secs) ? c : null; } catch (e) { return null; } }
    function ckClear() { try { localStorage.removeItem(CK_KEY); } catch (e) { /* لا تخزين */ } }
    function lastRead() { try { const c = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); return c && c.data ? c : null; } catch (e) { return null; } }
    function lastClear() { try { localStorage.removeItem(LAST_KEY); } catch (e) { /* لا تخزين */ } }
    function lastSave(data) { try { localStorage.setItem(LAST_KEY, JSON.stringify({ at: Date.now(), form: formSig(), data })); } catch (e) { /* النتيجة في النموذج */ } }
    function ckSave() {
        if (!S.running || S.src === 'file') return;            // المقطع المصوَّر يُعاد تحليله من الملفّ
        S.lastCk = S.lastSec;
        const sp = S.sp && S.sp.segs.length ? S.sp : S.spSeed;
        const ck = {
            v: 1, at: Date.now(), sec: S.lastSec, src: S.src, via: S.via, mic: S.mic, hadAudio: !!S.hadAudio, consent: !!S.consent,
            speechConsent: !!S.speechConsent, form: formSig(),
            secs: S.secs, grid: S.grid ? Array.from(S.grid) : null, events: S.events, counts: S.counts, ctx: S.ctxEvents, ctxCur: S.ctxCur,
            lost: S.lostSec || 0, gap: S.gapSec || 0, resumes: S.resumes || 0, spOff: S.spOff || 0, classMax: S.classMax || 0,
            roi: S.roi, sample: S.sample, sampleRound: S.sampleRound, marks: S.marks,
            guide: S.guide ? { id: S.guide.id, skills: (S.guide.skills || []).slice() } : null,
            sp: sp ? { mode: sp.mode, lang: sp.lang, segs: sp.segs } : null
        };
        try { localStorage.setItem(CK_KEY, JSON.stringify(ck)); }
        catch (e) { if (!S.ckWarned) { S.ckWarned = true; toast('تعذّر الحفظ الاحتياطيّ للرصد (تخزين المتصفّح ممتلئ) — الرصد مستمرّ', 'error'); } }
    }
    // gap: ثوانٍ ضائعة تُضاف «غير محسوبة» بعد آخر ثانيةٍ محفوظة (الاستكمال)، وصفرٌ للتحليل وحده
    function restoreState(R, gap, resuming) {
        S.secs = R.secs.slice();
        for (let i = 0; i < gap; i++) S.secs.push({ m: null, v: null, w: false, p: null });
        S.lastSec = S.secs.length;
        S.grid = R.grid ? Uint32Array.from(R.grid) : new Uint32Array(E().GRID_W * E().GRID_H);
        S.events = R.events || []; S.counts = Object.assign({}, R.counts || {});
        S.ctxEvents = R.ctx || []; S.ctxCur = R.ctxCur || null;
        S.lostSec = R.lost || 0; S.gapSec = (R.gap || 0) + gap; S.resumes = (R.resumes || 0) + (resuming ? 1 : 0);
        S.spOff = (R.spOff || 0) + (R.sp ? gap : 0);
        S.classMax = R.classMax || 0;
        S.sample = R.sample || null; S.sampleRound = R.sampleRound || 'a'; S.marks = R.marks || [];
        S.hadAudio = S.hadAudio || !!R.hadAudio; S.consent = S.consent || !!R.consent;
        S.speechConsent = S.speechConsent || !!R.speechConsent;
        S.spSeed = R.sp && R.sp.segs && R.sp.segs.length ? { mode: R.sp.mode, lang: R.sp.lang, segs: R.sp.segs } : null;
        if (R.guide && LG() && LG().byId(R.guide.id)) S.guide = { id: R.guide.id, skills: R.guide.skills.slice(), sure: true, on: true, min: false };
        if (R.roi) setRoi(R.roi);
    }
    function renderResume() {
        const box = $('eyeResume');
        if (!box) return;
        const ck = S.running ? null : ckRead();
        const last = !ck && !S.running && !S.result && !(($('eyeData') || {}).value) ? lastRead() : null;
        box.classList.toggle('hidden', !ck && !last);
        if (!ck && !last) return;
        const c = ck || last, who = c.form && c.form.teacher ? ' لـ«' + c.form.teacher + '»' : '';
        const ago = Math.max(0, Math.round((Date.now() - c.at) / 1000));
        const I = info(), other = c.form && c.form.teacher && I.teacher && c.form.teacher.trim() !== I.teacher.trim();
        const go = $('eyeResumeGo');
        if (ck) {
            const late = ago > CK_MAX_GAP, can = ck.src === 'camera' || ck.src === 'none';
            box.dataset.mode = 'ck';
            $('eyeResumeText').textContent = 'رصدٌ لم يكتمل' + who + ': رُصدت ' + mmss(ck.sec) + ' (' + SRC_LABEL(ck) + ')، وتوقّف قبل ' + E().dur(Math.max(1, ago)) + '. '
                + (late ? 'مضى أكثر من نصف ساعة — يُحلَّل ما رُصد.' : 'أكمله فتُستبعد المدّة الضائعة ولا تُحسب انتظاراً.')
                + (other ? ' تنبيه: النموذج المفتوح الآن لـ«' + I.teacher + '».' : '');
            go.classList.toggle('hidden', late || !can);
            go.querySelector('span').textContent = ck.via === 'phone' ? 'أكمل — اربط الهاتف' : ck.src === 'camera' ? 'أكمل بالكاميرا' : 'أكمل الرصد';
            $('eyeResumeAn').textContent = 'حلّل ما رُصد';
            $('eyeResumeDrop').textContent = 'احذفه';
        } else {
            box.dataset.mode = 'last';
            $('eyeResumeText').textContent = 'نتيجة رصدٍ' + who + ' لم تُحفظ مع التقرير (قبل ' + E().dur(Math.max(1, ago)) + ').' + (other ? ' تنبيه: النموذج المفتوح الآن لـ«' + I.teacher + '».' : '');
            go.classList.add('hidden');
            $('eyeResumeAn').textContent = 'استعادتها';
            $('eyeResumeDrop').textContent = 'حذفها';
        }
    }
    function resumeGo() {
        const ck = ckRead();
        if (!ck || S.running) return;
        S.resume = ck;
        if (ck.consent) $('eyeConsent').checked = true;
        if (ck.via === 'phone') startPhone();
        else if (ck.src === 'camera') startCamera();
        else startNoCam();
    }
    function resumeAnalyze() {
        if (S.running) return;
        if ($('eyeResume').dataset.mode === 'last') {
            const last = lastRead();
            if (!last) { renderResume(); return; }
            $('eyeData').value = JSON.stringify(last.data);
            root.svfEyeOpen();
            toast('استُعيدت نتيجة الرصد — احفظ التقرير لتبقى معه');
            return;
        }
        const ck = ckRead();
        if (!ck) { renderResume(); return; }
        reset();
        S.src = ck.src; S.via = ck.via; S.mic = ck.mic;
        restoreState(ck, 0, false);
        ckClear();
        finish();
        renderCounts(); renderCtx(); renderSample(); renderMarks();
        renderResume();
    }
    function resumeDrop() {
        const mode = $('eyeResume').dataset.mode;
        let ok = false;
        try { ok = root.confirm(mode === 'last' ? 'تُحذف نتيجة الرصد التي لم تُحفظ. متابعة؟' : 'يُحذف الرصد غير المكتمل نهائيّاً. متابعة؟'); } catch (e) { ok = false; }
        if (!ok) return;
        if (mode === 'last') lastClear(); else ckClear();
        renderResume();
    }
    // كاميرا الجهاز: انتهى مسارها (تطبيقٌ آخر أخذها) أو كُتم (مكالمة) أو لم يصل إطارٌ ثانيتين
    const camFrozen = () => {
        if (!S.running || S.src !== 'camera' || S.via === 'phone') return false;
        const t = S.stream && S.stream.getVideoTracks()[0];
        return !t || t.readyState === 'ended' || t.muted || ((S.rvfc || S.vpqOk) && performance.now() - S.lastFrameAt > 2000);
    };
    async function restartCamera() {
        if (!S.running || S.src !== 'camera' || S.via === 'phone') return;
        const hi = checked('eyeAI'), hadMic = !!S.audio;
        const video = { facingMode: { ideal: $('eyeFacing').value }, width: { ideal: hi ? 1280 : 640 }, height: { ideal: hi ? 720 : 480 } };
        let stream = null;
        try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: hadMic ? audioConstraints() : false }); }
        catch (e) { try { stream = await navigator.mediaDevices.getUserMedia({ video }); } catch (e2) { toast(permissionText(e2), 'error'); return; } }
        if (!S.running) { stream.getTracks().forEach(t => t.stop()); return; }
        const old = S.stream;
        S.stream = stream;
        if (old) old.getTracks().forEach(t => t.stop());
        S.video.srcObject = stream;
        S.video.play().catch(() => {});
        S.prev = null; AI.prevG = null;
        watchFrames(S.video);
        if (stream.getAudioTracks().length) {
            if (S.audio) { try { S.audio.ctx.close(); } catch (e) { /* أُغلق */ } S.audio = null; }
            startAudio(ctx => ctx.createMediaStreamSource(stream), false);
        }
        if (S.sp) { S.sp.track = stream.getAudioTracks()[0] || null; restartSpeech(); }
        S.camFrozenFor = 0;
        $('eyeCamRestart').classList.add('hidden');
        toast('عادت الكاميرا — الرصد مستمرّ، وثواني التوقّف لم تُحسب');
    }

    function save(data) {
        const ta = $('eyeData');
        S.result = data;
        S.written = JSON.stringify(data);
        if (ta) ta.value = S.written;
        decorate();
        layout();
    }

    // ── النتيجة ──
    // مستويات البند الخمسة بألوان أزرار الاستمارة: المختار ممتلئ، والمقترح بنقطةٍ ذهبيّة، وما في النموذج الآن مكتوبٌ تحته
    function levelPicker(id, chosen, sug, cur) {
        const btns = [1, 2, 3, 4, 5].map(n => {
            const on = n === chosen, col = RATING()[n];
            return `<button type="button" class="eye-lvb relative rounded-lg border px-1 py-1.5 text-[11px] leading-4 font-semibold" data-id="${id}" data-score="${n}" aria-pressed="${on}"
                style="${on ? 'background:' + col + ';border-color:' + col + ';color:#fff' : 'background:#fff;border-color:#cbd5e1;color:#334155'}">${esc(E().LEVELS[n])}${n === sug
                ? '<i class="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full" style="background:#f0b44a;box-shadow:0 0 0 1.5px #fff" title="المقترح"></i>' : ''}</button>`;
        }).join('');
        return `<div class="eye-lv grid grid-cols-5 gap-1 mt-2" role="group" aria-label="مستوى ${esc(title(id))}" data-cur="${cur || ''}">${btns}</div>
            <p class="text-[11px] text-slate-500 mt-1">${cur ? 'في النموذج الآن: ' + esc(E().LEVELS[cur]) : ''}${sug ? (cur ? ' · ' : '') + '<i class="inline-block w-2 h-2 rounded-full align-middle" style="background:#f0b44a"></i> المقترح' : ''}</p>`;
    }
    function pickLevel(b) {
        const id = b.dataset.id, n = Number(b.dataset.score), lv = b.closest('.eye-lv');
        lv.querySelectorAll('.eye-lvb').forEach(x => {
            const on = x === b, col = RATING()[Number(x.dataset.score)];
            x.setAttribute('aria-pressed', on ? 'true' : 'false');
            x.style.background = on ? col : '#fff'; x.style.borderColor = on ? col : '#cbd5e1'; x.style.color = on ? '#fff' : '#334155';
        });
        const cb = document.querySelector('#eyeResult .eye-apply[data-id="' + id + '"]');
        if (cb) { cb.dataset.score = String(n); cb.checked = n !== Number(lv.dataset.cur); }
        let pv = document.querySelector('#eyeResult .eye-prev[data-id="' + id + '"]');
        if (!pv) { pv = document.createElement('p'); pv.className = 'eye-prev text-[11px] text-slate-600 mt-1 leading-5'; pv.dataset.id = id; lv.parentNode.appendChild(pv); }
        pv.textContent = previewText(Number(id), n);
        applyCount();
    }
    function applyCount() {
        const n = document.querySelectorAll('#eyeResult .eye-apply:checked').length, el = $('eyeApplyN');
        if (el) el.textContent = n ? E().count(n, 'بندٌ واحدٌ محدَّد', 'بندان محدَّدان', 'بنود محدَّدة', 'بنداً محدَّداً') : 'لم يُحدَّد بند';
        if ($('eyeApply')) $('eyeApply').disabled = !n;
    }
    // أدلّة البند في المراجعة: آخر أربعة بأوقاتها ومصدرها
    function evMini(list) {
        if (!list || !list.length) return '';
        const rows = list.slice(0, 4).map(e => `<li class="leading-5"><span class="tabular-nums text-slate-500 ml-1">${e.t != null ? mmss(e.t) : '—'}</span>${esc(e.text)}<span class="text-[10px] text-slate-400 mr-1"> · ${esc(SRC_TEXT[e.src] || '')}</span></li>`).join('');
        return `<ul class="mt-1.5 space-y-0.5 text-xs text-slate-700 border-r-2 border-blue-200 pr-2">${rows}${list.length > 4 ? `<li class="text-slate-500">و${list.length - 4} غيرها — كلّها تحت البند في «نموذج التقييم»</li>` : ''}</ul>`;
    }
    // ما سيُكتب في «ويتضح ذلك من خلال …» لهذا المستوى
    function previewText(id, n) {
        const ph = E().officialFor(S.reviewLog || {}, Number(id), Number(n));
        return ph.length ? 'يُكتب في الوصف: «…ويتضح ذلك من خلال ' + ph.join('، و') + '»' : 'لا دليل من الحصة لهذا المستوى — يُكتب دليلٌ من قائمة البند كما كان';
    }
    const basisText = { camera: 'من الكاميرا', ai: 'من كشف الطلبة', ctx: 'من سياق الحصة', taps: 'من لمساتك', both: 'من لمساتك والرصد', speech: 'من كلام المعلّم',
                        sample: 'من عيّنة الطلبة', follow: 'من متابعة أهداف الزيارة السابقة' };
    const VERDICT = { met: ['تحقّق', '#1d6b45'], better: ['تحسّن', '#9a6f24'], same: ['لم يتغيّر', '#64748b'], worse: ['تراجع', '#b5452f'], na: ['لم يُقس', '#94a3b8'] };
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
        // الحضور والزيّ: زمنه وحده — لا يُحسب شرحاً ولا انتظاراً ولا من حركة الطلبة
        const AD = M.admin && M.admin.sec >= 10 ? M.admin : null;
        const rollRow = AD ? row(E().ROLL.label, esc(D(AD.sec)) + small((AD.auto ? 'بداية الحصة قبل أوّل نشاط (تلقائيّاً)' : 'بلمسة «' + E().ROLL.short + '»') + ' — لا يُحسب شرحاً ولا انتظاراً'
            + (AD.sec >= E().ROLL_LONG ? ' · <b class="text-amber-800">طال</b>' : ''))) : '';
        if (M.observed) {
            // المستبعد وأسبابه: توقّف الرصد (أُغلقت الصفحة ثمّ أُكمل)، وانقطاع صورة الهاتف أو توقّف الكاميرا، والباقي اهتزاز الكاميرا
            const ex = M.excludedSec || 0, gapS = Math.min((data.gap && data.gap.sec) || 0, ex), lost = Math.min(data.lost || 0, ex - gapS);
            const why = [];
            if (gapS >= 5) why.push(esc(D(gapS)) + ' لتوقّف الرصد' + (data.gap.n > 1 ? ' (' + data.gap.n + ' مرّات)' : ''));
            if (lost >= 5) why.push(esc(D(lost)) + (data.via === 'phone' ? ' لانقطاع صورة الهاتف' : ' لتوقّف الكاميرا'));
            const rest = ex - gapS - lost;
            rows.push(row('زمن الرصد', esc(D(M.observed)) + (ex >= 30 || why.length
                ? small('(استُبعد ' + esc(D(ex)) + (why.length ? ': ' + why.join('، ') + (rest >= 30 ? '، والباقي لحركة الكاميرا' : '') : ' لحركة الكاميرا') + ')') : '')));
            if (rollRow) rows.push(rollRow);
            rows.push(row('منطقة الصف', data.roi ? 'محدّدة' : '<span class="text-slate-500 font-normal">الإطار كلّه</span>'));
            if (P) {
                rows.push(row('عدد الطلبة', `<input type="number" id="eyeClassSize" min="1" max="80" value="${esc(String(P.classSize || P.inside))}" class="w-16 text-center border border-slate-300 rounded-md py-0.5" aria-label="عدد طلبة الصف">`
                    + small(P.teacher ? 'أكبر عددٍ رُصد (بلا المعلّم)' : 'أكبر عددٍ رُصد — صحّحه إن دخل فيه المعلّم، أو حدِّده أثناء الرصد')));
                if (P.roi) rows.push(row('خارج منطقة الصف', esc(String(P.outsideMed)) + (data.outAuto ? small('اقتُرح منه «طلبة خارج النشاط»') : '')));
                rows.push(row('حركة الطلبة', P.movingAll + '%' + (P.movingPlay != null ? small('في العناصر النشطة ' + P.movingPlay + '%') : small('من زمن الرصد'))));
                const mv = P.movingPlay != null ? P.movingPlay : P.movingAll, vg = P.vigPlay != null ? P.vigPlay : P.vigAll;
                if (vg != null && mv != null) rows.push(row('شدّة النشاط', `<span class="inline-flex flex-wrap gap-x-3 justify-end"><span>ساكن ${100 - mv}%</span><span>معتدل ${Math.max(0, mv - vg)}%</span><span>شديد ${vg}%</span></span>`
                    + small('المعيار المتداول: نصف الزمن نشاطاً معتدلاً فأشدّ' + (mv >= E().MVPA_GOAL ? ' — بلغه' : ' — دونه'))));
                rows.push(row('انتظار الدور', P.queuePct + '%' + small('من الطلبة أثناء النشاط')));
                if (P.crowdPct != null) rows.push(row('التزاحم أثناء الحركة', P.crowdPct + '%' + small('من المتحرّكين كان زميلٌ ملاصقاً له')));
                const ratio = E().ballRatio(M);
                rows.push(row('الكرات في النشاط', `<input type="number" id="eyeBalls" min="0" max="60" value="${esc(P.balls != null ? String(P.balls) : '')}" placeholder="—" class="w-16 text-center border border-slate-300 rounded-md py-0.5" aria-label="عدد الكرات">`
                    + small(ratio ? 'كرةٌ لكلّ ' + E().perPupils(ratio) + ' — صحّح العدد إن لزم' : 'لم تُرَ كرات — اكتب عددها إن كانت حصّة كرة')));
                const TS = P.teacher;
                if (TS) rows.push(row(female() ? 'موقع المعلمة' : 'موقع المعلم', (TS.edgePct != null ? 'على أطراف الطلبة ' + TS.edgePct + '%' : '—')
                    + small('يتنقّل ' + TS.movePct + '%' + (TS.cover != null ? ' · غطّى ' + TS.cover + '% من مساحة النشاط' : ''))));
            } else {
                rows.push(row('النشاط الحركي للطلبة', M.activePct + '%' + small(esc(D(M.activeSec)))));
            }
            rows.push(row('فترات الانتظار بين الأنشطة', M.waits ? M.waits + small('أطولها ' + esc(D(M.longestIdle))) : 'لا فترات طويلة'));
        } else if (rollRow) rows.push(rollRow);
        if (data.mic === 'teacher') {
            rows.push(row(female() ? 'كلام المعلمة (ميكروفونها)' : 'كلام المعلم (ميكروفونه)', data.audio ? M.talkPct + '%' + small('من الحصة، وأثناء النشاط ' + M.coachPct + '%') : noAudio));
        } else if (M.observed) {
            rows.push(row('الشرح والتوجيه (تقديري)', data.audio ? esc(D(M.explainSec)) + (AD ? small('بلا الحضور والزيّ') : '') : noAudio));
        }
        if (M.observed) {
            rows.push(row('الصفّارة', !data.audio ? noAudio : M.whistles ? M.whistles + (M.cued ? small('منها ' + M.cued + ' عند الانتقال') : '') : 'لم تُرصد'));
            const RS = M.resp;
            if (RS && RS.n) rows.push(row('الاستجابة للصفّارة', (RS.med != null ? RS.med + ' ث' + small('في المتوسّط') : 'لم تُقس')
                + small('(' + RS.n + ') ' + (RS.n >= 3 && RS.n <= 10 ? 'إشارات' : 'إشارة') + (RS.stopMed != null ? ' · التوقّف ' + RS.stopMed + ' ث' : '') + (RS.startMed != null ? ' · البدء ' + RS.startMed + ' ث' : '') + (RS.slow ? ' · بطيئة ' + RS.slow : ''))));
            if (!C && M.phases) rows.push(row('نشاط مراحل الحصة', `<span class="inline-flex flex-wrap gap-x-3 justify-end"><span>الإحماء ${M.phases.warm}%</span><span>الرئيس ${M.phases.main}%</span><span>الختام ${M.phases.close}%</span></span>`));
            rows.push(row('استثمار المساحة', M.space && M.space.coverage ? M.space.coverage + '% ' + (data.roi ? 'من منطقة الصف' : 'من الملعب المرئي') : '—'));
        }
        const SSr = E().sampleStats(data.sample);
        if (SSr && (SSr.a.rated || SSr.b.rated)) {
            const fin = SSr.final || (SSr.b.rated ? SSr.b : SSr.a);
            rows.push(row('عيّنة الطلبة', 'إتقان ' + fin.pct + '%' + small((SSr.both ? 'تقدّم ' + SSr.improved + ' من ' + SSr.both + ' · ' : '') + 'قُيّم ' + fin.rated + (SSr.final ? '' : ' — أقلّ من ' + E().MIN_SAMPLE))));
        }
        if (data.consent) rows.push(row(female() ? 'أُبلغت المعلمة بالرصد' : 'أُبلغ المعلم بالرصد', 'نعم'));
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
                    const [vt, vc] = r.tiny ? ['قصير جدّاً', '#9a6f24'] : VERD[r.verdict];
                    return `<div>
                        <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <b class="text-slate-800"><i class="inline-block w-2.5 h-2.5 rounded-sm ml-1.5" style="background:${CTX_COLOR[E().PART[r.k].c]}"></i>${esc(r.label)}</b>
                            <span class="flex flex-wrap items-center gap-x-3 text-xs text-slate-600 tabular-nums">
                                <span>${mmss(r.sec)} من ${mmss(Math.round(r.rec * 60))}</span>
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
        // منهجية SOFIT+: ممارسات المعلّم التي ترفع نشاط الطلبة أو تحدّ منه، كلّ عشرين ثانية — من أرقام الرصد المحفوظة
        let sofitHtml = '';
        const SF = E().sofit(data), SP = E().sofitPlus(data);
        if (SP || SF) {
            const SC = { M: '#8492a6', K: '#d9a441', F: '#1d6b45', S: '#0f4c81', G: '#5b8fc7', D: '#9a6f24', still: '#cbd5e1', walk: '#5b8fc7', vig: '#0f4c81',
                         whole: '#9a6f24', groups: '#0f4c81', free: '#5b8fc7', line: '#b5452f',
                         promote: '#1d6b45', one: '#0f4c81', group: '#3a6ea5', class: '#5b8fc7', manage: '#8492a6', observe: '#cbd5e1' };
            const sbar = rows => `<div class="flex h-3 rounded-full overflow-hidden bg-slate-100">${rows.filter(r => r.pct > 0).map(r => `<i class="block h-full" style="width:${r.pct}%;background:${SC[r.k]}" title="${esc(r.label + ' ' + r.pct + '%')}"></i>`).join('')}</div>
                <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-600">${rows.filter(r => r.pct > 0).map(r => `<span class="inline-flex items-center gap-1"><i class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${SC[r.k]}"></i>${esc(r.label)} <b class="tabular-nums text-slate-900">${r.pct}%</b></span>`).join('')}</div>`;
            const A = SF && SF.act;
            const actRows = A ? [{ k: 'still', label: 'ساكن (جالس أو واقف)', pct: A.still }].concat(A.vig != null
                ? [{ k: 'walk', label: 'معتدل (مشي وحركة)', pct: A.walk }, { k: 'vig', label: 'شديد (جري وتمرينٌ قويّ)', pct: A.vig }]
                : [{ k: 'walk', label: 'معتدل فأشدّ', pct: A.mvpa }]) : null;
            const block = (ttl, sub, inner) => `<div class="mt-4"><div class="flex flex-wrap items-baseline justify-between gap-2 mb-1.5"><b class="text-sm text-slate-900">${esc(ttl)}</b>${sub || ''}</div>${inner}</div>`;
            const T = female() ? 'المعلّمة' : 'المعلّم';
            const mom = (r, good) => r ? `<div class="flex gap-2 items-start text-sm leading-6"><span class="tabular-nums text-xs text-slate-500 mt-0.5">${mmss(r.t)}</span>
                <span class="min-w-0"><b class="${good ? 'text-green-700' : 'text-red-700'}">${good ? 'أعلى' : 'أدنى'} مؤشّر (${r.idx} من 4) — حركة الطلبة ${r.mv}%</b><br><span class="text-slate-600">${esc(E().sofitPlusWhy(r) || '—')}</span></span></div>` : '';
            const X = (SP && SP.exit) || {};
            const opt = (id, cur, list) => `<select id="${id}" class="eye-exit w-full min-w-0 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm"><option value="">—</option>${list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
            sofitHtml = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 class="text-lg font-bold text-slate-900">وفق منهجية <bdi dir="ltr">SOFIT+</bdi></h2>
                    <span class="text-xs text-slate-500">عيّنةٌ كلّ 20 ثانية${SP ? ' · ' + E().count(SP.n, 'عيّنةٌ واحدة', 'عيّنتان', 'عيّنات', 'عيّنةً') : ''}</span>
                </div>
                <p class="text-xs text-slate-500 mt-1 leading-5"><bdi dir="ltr">SOFIT+</bdi> أداةٌ محكَّمة ترصد ممارسات ${T} التي ترفع نشاط الطلبة أو تحدّ منه: سياق الحصة، وسياق النشاط، وسلوك ${T}، وإدارة النشاط.</p>
                ${SP && SP.rel ? `<div class="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-slate-800 leading-7">حين اجتمعت <b>ثلاث ممارساتٍ داعمة فأكثر</b> كانت حركة الطلبة <b class="text-green-700">(${SP.rel.hi.mv}%)</b>، وحين قلّت عن اثنتين كانت <b class="text-red-700">(${SP.rel.lo.mv}%)</b>.
                    <span class="block text-xs text-slate-600">الممارسات: نشاطٌ حركيّ، وتشكيلٌ يُشرك الجميع (مجموعات أو انتشار)، وتعليمٌ أو تشجيعٌ أثناء النشاط، ولا ما يحدّ منه.</span></div>` : ''}
                ${SP && SP.index != null && SP.n >= 9 ? `<p class="text-sm text-slate-700 mt-3">مؤشّر الممارسات المجتمعة في الحصة: <b class="tabular-nums">${SP.index}</b> من 4</p>` : ''}
                ${A ? block('نشاط الطلبة', `<span class="text-sm ${A.ok ? 'text-green-700' : 'text-red-700'} font-bold">معتدلٌ فأشدّ ${A.mvpa}% <span class="font-normal text-slate-500">— المعيار ${A.goal}% فأكثر</span></span>`, sbar(actRows)) : ''}
                ${SP && SP.lesson ? block('سياق الحصة', '', sbar(SP.lesson)) : ''}
                ${SP && SP.act ? block('سياق النشاط', '<span class="text-xs text-slate-500">من التشكيلات في الصورة</span>', sbar(SP.act)) : ''}
                ${SP && SP.teacher ? block('سلوك ' + T, `<span class="text-xs text-slate-500">${SP.teacherBy === 'speech' ? 'من نوع كلامه ومخاطَبه' : 'من وجود كلامه لا مضمونه'}</span>`, sbar(SP.teacher)) : ''}
                ${SP && SP.limits.length ? block('ما يحدّ من النشاط', '', `<div class="flex flex-wrap gap-1.5">${SP.limits.map(l => `<span class="text-xs rounded-lg border border-red-200 bg-red-50 text-red-800 px-2 py-1">${esc(l.label)} <b class="tabular-nums">${esc(D(l.sec))}</b></span>`).join('')}</div>`)
                    : SP && SP.rows.length ? block('ما يحدّ من النشاط', '', '<p class="text-sm text-green-700">لم يُرصد طابورٌ ولا إقصاءٌ ولا توقّفٌ للأدوات.</p>') : ''}
                ${SP && (SP.best || SP.worst) ? block('لحظتان للمداولة', '', `<div class="space-y-2">${mom(SP.best, true)}${mom(SP.worst, false)}</div>`) : ''}
                <details id="eyeExit" class="mt-4 rounded-xl border border-slate-200 p-3"${X.loc || X.wx || X.eq ? '' : ' open'}>
                    <summary class="cursor-pointer text-sm font-bold text-slate-900">قائمة نهاية الحصة <span class="font-normal text-xs text-slate-500">— من <bdi dir="ltr">SOFIT+</bdi></span></summary>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-sm">
                        <label class="block min-w-0"><span class="text-xs text-slate-600">المكان</span>${opt('eyeExitLoc', X.loc, ['ملعبٌ مكشوف', 'ملعبٌ مظلّل', 'صالةٌ مغطّاة', 'ساحة المدرسة'])}</label>
                        <label class="block min-w-0"><span class="text-xs text-slate-600">الطقس</span>${opt('eyeExitWx', X.wx, ['معتدل', 'حارّ', 'حارٌّ جدّاً', 'رياحٌ أو غبار', 'ممطر'])}</label>
                        <label class="block min-w-0"><span class="text-xs text-slate-600">كمية الأدوات</span>${opt('eyeExitEq', X.eq, ['أداةٌ لكلّ طالب', 'أداةٌ لكلّ طالبين', 'مشتركةٌ بين ثلاثةٍ فأكثر', 'غير متوفّرة'])}</label>
                        <label class="block min-w-0"><span class="text-xs text-slate-600">نوع الأدوات</span><input id="eyeExitKind" class="eye-exit w-full min-w-0 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm" maxlength="80" value="${esc(X.kind || '')}" placeholder="كرات، أقماع، أطواق…"></label>
                    </div>
                    <p class="text-xs text-slate-500 mt-2">محتوى الدرس: ${esc(info().topic || '—')}</p>
                </details>
                <p class="text-xs text-slate-500 mt-3 leading-5">تكييفٌ آليّ لـ<bdi dir="ltr">SOFIT+</bdi> من رصد العين، لا يغني عن ملاحظةٍ مدرَّبة: النشاط والتشكيل من الصورة، والسياق من عناصر الحصة التي لمستها،
                   وسلوك ${T} من كلامه، والإقصاء والتوقّف للأدوات من لمساتك.</p>
            </div>`;
        }

        let formsHtml = '';
        const dishN = (data.counts || {}).dish || 0;
        if (F || (P && (P.dishEst || dishN))) {
            const segs = F ? F.segments.map(x => `<span class="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"><i class="inline-block w-2 h-2 rounded-full" style="background:${FORM_COLOR[x.type]}"></i>${esc(E().FORMS[x.type])} <span class="text-slate-500 tabular-nums">${esc(D(x.dur))}</span></span>`).join('<span class="text-slate-400 text-xs">←</span>') : '';
            formsHtml = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 class="text-lg font-bold text-slate-900">التشكيلات والزيّ الرياضيّ</h2>
                ${F ? `${F.count ? `<p class="text-sm text-slate-700 mt-2">استُعمل <b>${F.count}</b> ${F.count === 1 ? 'تشكيلٌ' : 'تشكيلات'} من <b>${F.types.length}</b> ${F.types.length === 1 ? 'نوع' : 'أنواع'}:
                        ${F.types.map(t => esc(E().FORMS[t]) + ' (' + F.byType[t].count + ')').join('، ')}</p>`
                    : '<p class="text-sm text-slate-600 mt-2">لم يثبت تشكيلٌ واحدٌ عشرين ثانيةً فأكثر ليُعدّ تشكيلاً مستعملاً — ما يلي لحظاتٌ عابرة.</p>'}
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
            const partOf = t => {
                if (M.admin && E().inSpans(M.admin.spans, Math.max(0, Math.round(Number(t) || 0)))) return E().ROLL.short;   // ومنه التلقائيّ
                let k = null; cx.forEach(e => { if (e.t <= t) k = e.k; }); return k && E().PART[k] ? E().PART[k].short : '';
            };
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
                    <span class="text-xs text-slate-500">${data.sp && data.sp.mode === 'local' ? 'حُوِّل إلى نصٍّ داخل الجهاز' : 'حُوِّل إلى نصٍّ بخدمة المتصفّح'} · ${esc(String(SPA.words))} كلمة${SPA.wpm ? ' · ' + esc(String(SPA.wpm)) + ' في الدقيقة' : ''}${data.mic === 'teacher' ? '' : ' · ميكروفون الجهاز قد يلتقط غير المعلّم'}${data.sp && data.sp.off >= 30 ? ' · انقطع فهم الكلام ' + esc(D(data.sp.off)) + ' (لم تُحسب في المعدّلات)' : ''}</span></div>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                    ${box('تعزيز', SPA.praise.n, SPA.praise.spec ? 'محدّد ' + SPA.praise.spec : '')}${box('تصحيح للأداء', SPA.corr.n, SPA.corr.spec ? 'بالمهارة ' + SPA.corr.spec : '')}
                    ${box('أسئلة', SPA.q.n, SPA.q.hi ? 'للتفكير ' + SPA.q.hi : '')}${box('تحقّق من الفهم', SPA.check.n)}
                    ${box('تذكير بالسلامة', SPA.safe.n)}${box('تعليمات تنظيمية', SPA.orgShare + '%')}
                </div>
                <p class="text-sm text-slate-700 mt-3 leading-7">${terms ? 'مصطلحات الدرس (' + esc(terms.terms.join('، ')) + '): سُمعت <b>' + terms.n + '</b> ' + (terms.n === 1 ? 'مرّة' : 'مرّات') + ' · ' : ''}القيم والروح الرياضيّة: <b>${SPA.values.n}</b> · الربط بالصحّة: <b>${SPA.health.n}</b></p>
                ${SPA.forms && Object.keys(SPA.forms).length && SX() ? `<p class="text-sm text-slate-700 mt-1 leading-7">تشكيلاتٌ طلبها بصوته: ${Object.keys(SPA.forms).map(k => esc(SX().FORM_LABEL[k] || k) + ' <b>' + SPA.forms[k] + '</b>').join(' · ')}${M.forms && M.forms.count ? ' <span class="text-xs text-slate-500">— قارنها بما رأته الكاميرا في «التشكيلات»</span>' : ''}</p>` : ''}
                ${SPA.admin && SPA.admin.clauses ? `<p class="text-xs text-slate-500 mt-1">قيلت ${esc(E().count(SPA.admin.clauses, 'عبارةٌ واحدة', 'عبارتان', 'عبارات', 'عبارة'))} أثناء الحضور والزيّ — لم تُحلَّل (ليست شرحاً ولا أسئلةً للدرس).</p>` : ''}
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

        // مطابقة دليل المعلّم: نقاط المهارة في العيّنة وفي الكلام، وأسئلة التقويم، والتشكيل والكرات، وبدائل الدليل
        let guideHtml = '';
        const GDd = data.guide && LG() ? LG().byId(data.guide.id) : null;
        if (GDd) {
            const ids = data.guide.skills || [];
            const names = GDd.skills.filter(x => ids.includes(x.id)).map(x => x.short);
            const PS = LG().pointStats(data.sample, GDd);
            const C = M.gspeech && M.gspeech.id === GDd.id ? M.gspeech : null;
            const GX = LG().guideCtx(data) || {};
            const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
            const barRow = (label, ok, rated, extra) => {
                const p = pct(ok, rated), col = p >= 75 ? '#1d6b45' : p >= 50 ? '#9a6f24' : '#b5452f';
                return `<div><div class="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span class="text-slate-800">${esc(label)}</span>
                    <span class="text-xs text-slate-600 tabular-nums">${ok} من ${rated}${extra ? ' · ' + esc(extra) : ''}</span></div>
                    <div class="h-2.5 bg-slate-100 rounded mt-1"><div class="h-2.5 rounded" style="width:${p}%;background:${col}"></div></div></div>`;
            };
            let sampleBlock = '';
            const rd = PS && (PS.final || (PS.b.rated ? PS.b : PS.a.rated ? PS.a : null));
            if (rd && rd.rated) {
                const tag = PS.final ? (PS.finalRound === 'b' ? 'آخر الحصة' : 'أوّل التطبيق') : 'أقلّ من ' + E().MIN_SAMPLE + ' طلبة';
                sampleBlock = `<div><div class="text-xs font-bold text-slate-500 mb-2">النقاط الفنّيّة لـ«${esc(PS.name)}» في العيّنة — ${esc(tag)}</div>
                    <div class="space-y-2.5">${rd.pts.map((x, i) => barRow((i + 1) + '. ' + x.short, x.ok, rd.rated,
                        PS.gain && PS.gain[i].from != null && PS.gain[i].to != null ? 'أوّل التطبيق ' + PS.gain[i].from + '% ← ' + PS.gain[i].to + '%' : '')).join('')}</div></div>`;
            } else if (ids.some(k => LG().observable(LG().skillOf(GDd, k)))) {
                sampleBlock = '<p class="text-sm text-slate-600 leading-6">لم تُقيَّم العيّنة بنقاط المهارة — «عيّنة الطلبة» صارت استمارة ملاحظتها، فقيّم خمسة طلبةٍ فأكثر.</p>';
            }
            let speechBlock = '';
            if (C && C.total) {
                speechBlock = `<div><div class="text-xs font-bold text-slate-500 mb-2">في كلام ${female() ? 'المعلمة' : 'المعلم'}: ذُكر (${C.said}) من (${C.total}) نقاط</div>
                    <ul class="space-y-1.5">${C.skills.map(cs => { const sk = LG().skillOf(GDd, cs.id); return cs.points.map((pt, i) => `<li class="text-sm leading-6 flex gap-2">
                        <i class="fa-solid ${pt.n ? 'fa-check text-green-700' : 'fa-minus text-slate-400'} mt-1.5 text-xs" aria-hidden="true"></i>
                        <span class="min-w-0"><span class="${pt.n ? 'text-slate-800' : 'text-slate-500'}">${esc(sk ? sk.points[i].short : '')}</span>${pt.n > 1 ? ` <span class="text-xs text-slate-500">×${pt.n}</span>` : ''}
                        ${pt.ex ? `<span class="block text-xs text-slate-500"><span class="tabular-nums">${mmss(pt.ex[0])}</span> «${esc(pt.ex[1])}»</span>` : ''}</span></li>`).join(''); }).join('')}</ul></div>`;
            }
            let assessBlock = '';
            if (C && GDd.assess && GDd.assess.length) {
                assessBlock = `<div><div class="text-xs font-bold text-slate-500 mb-2">أسئلة التقويم في الدليل: سُئل (${C.asked}) من (${GDd.assess.length})</div>
                    <ul class="space-y-1.5">${GDd.assess.map((q, i) => { const a = C.assess[i] || {}; return `<li class="text-sm leading-6 flex gap-2">
                        <i class="fa-solid ${a.n ? 'fa-check text-green-700' : 'fa-minus text-slate-400'} mt-1.5 text-xs" aria-hidden="true"></i>
                        <span class="min-w-0"><span class="${a.n ? 'text-slate-800' : 'text-slate-500'}">${esc(q.short)}</span>
                        ${a.ex ? `<span class="block text-xs text-slate-500"><span class="tabular-nums">${mmss(a.ex[0])}</span> «${esc(a.ex[1])}»</span>` : ''}</span></li>`; }).join('')}</ul></div>`;
            }
            const ratio = E().ballRatio(M);
            const perT = n => (n === 1 ? 'طالب' : n === 2 ? 'طالبين' : '(' + n + ') طلبة');
            const orgBits = [];
            if (GX.formsText && GX.formsText.length) orgBits.push('تدريبات المهارة في الدليل: <b>' + esc(GX.formsText.join('، ')) + '</b>' + (GX.applyText && GX.applyText.length ? '، وأنشطتها التطبيقيّة: ' + esc(GX.applyText.join('، ')) : ''));
            if (F && F.types && F.types.length) orgBits.push('ورُصد: <b>' + esc(F.types.map(t => E().FORMS[t]).join('، ')) + '</b>' + (F.maxLine > E().LONG_LINE ? ' — أطول قاطرة ' + F.maxLine + ' طلبة' : ''));
            if (GX.per) orgBits.push('الكرات: الدليل يبني تدريبات المهارة على كرةٍ لكلّ ' + perT(GX.per) + (ratio ? '، ورُصدت كرةٌ لكلّ <b>' + esc(perT(ratio)) + '</b>' : ''));
            const devs = LG().drillsFor(GDd, ids).filter(d => d.dev && d.dev.length);
            const altBlock = devs.length || (GX.game && GDd.adapt) ? `<details class="text-sm mt-3"><summary class="cursor-pointer text-slate-600">بدائل من الدليل للمداولة (تطوير النشاط${GX.game ? ' وتعديل قواعد المباراة' : ''})</summary>
                    <ul class="mt-2 space-y-1 leading-6">${devs.map(d => `<li class="text-slate-700"><b class="text-slate-800">${esc(d.name)}:</b> ${esc(d.dev.join('، '))}</li>`).join('')}
                    ${GX.game && GDd.adapt ? `<li class="text-slate-700"><b class="text-slate-800">قواعد المباراة لقدرات المرحلة:</b> ${esc(GDd.adapt.join('، '))}</li>` : ''}</ul></details>` : '';
            const body = [sampleBlock, speechBlock, assessBlock].filter(Boolean);
            guideHtml = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-lg font-bold text-slate-900">مطابقة دليل المعلّم</h2>
                    <span class="text-xs text-slate-500">${esc(GDd.topic)} · الصف ${esc(GRADE_NAME[GDd.grade] || String(GDd.grade))}${names.length ? ' — ' + esc(names.join('، ')) : ''}</span></div>
                ${ids.length ? '' : '<p class="text-sm text-slate-600 mt-2">اختر مهارة الحصة في بطاقة «دليل المعلّم» أعلاه لتُقارن بها الحصة.</p>'}
                ${body.length ? `<div class="grid md:grid-cols-${Math.min(3, body.length)} gap-5 mt-3">${body.join('')}</div>` : ''}
                ${orgBits.length ? `<p class="text-sm text-slate-700 mt-3 pt-3 border-t border-slate-100 leading-7">${orgBits.join(' · ')}</p>` : ''}
                ${altBlock}
            </div>`;
        }

        // للمداولة وللمعلّم: ما يُعزَّز وما يُسأل عنه، والنموّ منذ الرصد السابق، والبطاقة
        const dp = E().debriefPrompts(M, data.counts || {}, ctxOf(data));
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

        // متابعة أهداف الزيارة السابقة: قبلُ ← الآن مقابل الهدف
        let followHtml = '';
        const FW = data.follow && Array.isArray(data.follow.list) ? data.follow.list : [];
        if (FW.length) {
            followHtml = `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-lg font-bold text-slate-900">متابعة أهداف الزيارة السابقة</h2>
                    <span class="text-xs text-slate-500">اتُّفق عليها في <bdi>${esc(data.follow.date || '')}</bdi> — ومنها شاهد البند ١١</span></div>
                <div class="overflow-x-auto mt-3"><table class="w-full text-sm">
                    <thead><tr class="text-xs text-slate-500"><th class="text-right font-medium py-1">الهدف</th><th class="font-medium">قبلُ</th><th class="font-medium">الآن</th><th class="font-medium">المتّفق عليه</th><th class="font-medium"></th></tr></thead>
                    <tbody>${FW.map(f => {
                        const [vt, vc] = VERDICT[f.verdict] || VERDICT.na;
                        return `<tr class="border-t border-slate-100"><td class="py-2 text-slate-800">${esc(f.label)}${f.verdict === 'na' ? `<div class="text-[11px] text-slate-500">يقيسه ${esc(E().NEEDS[f.needs] || '')}</div>` : ''}</td>
                            <td class="text-center tabular-nums">${esc(E().fmtTarget(f.unit, f.base))}</td><td class="text-center tabular-nums font-bold">${esc(E().fmtTarget(f.unit, f.now))}</td>
                            <td class="text-center tabular-nums">${esc(E().fmtTarget(f.unit, f.goal))}</td>
                            <td class="text-center"><span class="inline-block text-xs font-bold text-white rounded px-1.5" style="background:${vc}">${vt}</span></td></tr>`;
                    }).join('')}</tbody></table></div></div>`;
        }

        // لحظات الحصة: علامات المشرف وما كشفه الرصد — بأوقاتها وعناصرها، لتُطرح في المداولة «في الدقيقة …»
        const momList = momentsOf(data);
        const momHtml = momList.length ? `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-lg font-bold text-slate-900">لحظات الحصة</h2>
                    <span class="text-xs text-slate-500">علاماتك وما كشفه الرصد — تظهر في المداولة بأوقاتها</span></div>
                <ul class="mt-3 divide-y divide-slate-100">${momList.map(x => `<li class="py-2 flex items-baseline gap-3">
                    <span class="flex-none text-xs tabular-nums text-slate-600 w-11">${mmss(x.t)}</span>
                    <span class="flex-none text-[11px] rounded px-1.5 py-0.5 ${x.mine ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-slate-100 text-slate-600'}">${x.mine ? 'علامتك' : 'من الرصد'}</span>
                    ${x.part ? `<span class="flex-none text-[11px] text-slate-500">${esc(partShort(x.part))}</span>` : ''}
                    <span class="text-sm text-slate-800 leading-6 min-w-0">${esc(x.text || 'بلا ملاحظة')}</span></li>`).join('')}</ul></div>` : '';

        // أهدافٌ قابلة للقياس للزيارة القادمة: تُختار وتُعدَّل، وتُدرج في التوصيات وفي «مؤشّر النجاح» بالمداولة
        const chosen = Array.isArray(data.targets) ? data.targets : [];
        const cands = E().targetCandidates(data, 5);
        chosen.forEach(t => { if (!cands.some(c => c.k === t.k)) cands.push(Object.assign({}, E().METRIC[t.k] ? { label: E().METRIC[t.k].label, unit: E().METRIC[t.k].unit, dir: E().METRIC[t.k].dir } : {}, t)); });
        const targetsHtml = cands.length ? `<div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-lg font-bold text-slate-900">أهدافٌ قابلة للقياس للزيارة القادمة</h2>
                    <span class="text-xs text-slate-500">اختر هدفاً أو اثنين تتّفق عليهما مع المعلّم — يقيسها الرصد التالي له تلقائيّاً</span></div>
                <ul class="mt-2">${cands.map(c => {
                    const on = chosen.find(t => t.k === c.k), t = on || c, x = E().METRIC[c.k];
                    const isSec = c.unit === 'sec', gv = isSec ? Math.round(t.goal / 6) / 10 : t.goal;
                    return `<li class="py-3 flex gap-3 items-start border-b border-slate-100 last:border-0">
                        <input type="checkbox" class="eye-target mt-1 w-5 h-5" data-k="${esc(c.k)}" ${on ? 'checked' : ''} aria-label="${esc(c.label)}">
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <b class="text-slate-900">${esc(c.label)}</b>
                                <span class="text-xs text-slate-500">الآن ${esc(E().fmtTarget(c.unit, t.base))}</span>
                                <label class="flex items-center gap-1 text-xs text-slate-600">الهدف ${x && x.dir > 0 ? '≥' : '≤'}
                                    <input type="number" data-goal="${esc(c.k)}" value="${esc(String(gv))}" min="0" max="${isSec ? 60 : 100}" step="${isSec ? 0.5 : 1}" class="w-16 text-center border border-slate-300 rounded-md py-0.5">${isSec ? ' د' : c.unit === '%' ? '%' : ''}</label>
                            </div>
                            <p class="text-sm text-slate-600 mt-1 leading-6">${esc(E().targetText(t, suggCtx()))}</p>
                        </div></li>`;
                }).join('')}</ul>
                <div class="flex flex-wrap gap-2 mt-3">
                    <button type="button" id="eyeTargetsRecs" class="svf-btn svf-btn-secondary svf-btn-sm" ${chosen.length ? '' : 'disabled'}>إدراج المحدَّد في «التوصيات»</button>
                    <span class="text-xs text-slate-500 self-center">${chosen.length ? 'اختير ' + chosen.length + ' — ويظهر في المداولة وبطاقة المعلّم' : 'لم يُختر هدفٌ بعد'}</span>
                </div></div>` : '';

        const sugg = data.sugg || [];
        const applied = new Set(data.applied || []);
        const LOG = S.reviewLog = logOf(data);              // أدلّة الحصة لكلّ بند (مساعد الأدلّة)
        const formScore = id => { const el = document.querySelector('#score-' + id); const n = el ? Number(el.textContent) : NaN; return n >= 1 && n <= 5 ? n : null; };
        const items = sugg.map(s => {
            const curScore = formScore(s.id);
            const conf = s.conf && confText[s.conf] ? `<span class="inline-flex items-center gap-1 text-xs text-slate-600"><i class="inline-block w-2 h-2 rounded-full" style="background:${confColor[s.conf]}"></i>${esc(confText[s.conf])}</span>` : '';
            // الاقتراح ضعيف الثقة لا يُحدَّد للتطبيق افتراضاً (2026-10-29) — الاستمارة رسميّة، فيعتمده المشرف بلمسة المستوى أو المربّع
            const pre = curScore !== s.score && s.conf !== 'low';
            return `<li class="py-3 flex gap-3 items-start border-b border-slate-100 last:border-0">
                <input type="checkbox" class="eye-apply mt-1 w-5 h-5" data-id="${s.id}" data-score="${s.score}" ${pre ? 'checked' : ''} aria-label="تطبيق البند ${s.id} على النموذج">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <b class="text-slate-900">${esc(title(s.id))}</b>
                        <span class="text-xs text-slate-500">${esc(basisText[s.basis] || '')}</span>
                        ${conf}
                        ${applied.has(s.id) ? '<span class="text-xs font-bold text-green-700">طُبّق</span>' : ''}
                    </div>
                    <p class="text-sm text-slate-700 mt-1 leading-7">${esc(s.evidence)}</p>
                    ${s.conf === 'low' && curScore !== s.score ? '<p class="text-xs text-amber-800 mt-1 leading-5">ثقةٌ منخفضة: لم يُحدَّد للتطبيق — حدِّد المربّع أو المس المستوى إن وافقتَ عليه.</p>' : ''}
                    ${evMini(LOG[s.id])}
                    ${levelPicker(s.id, s.score, s.score, curScore)}
                    <p class="eye-prev text-[11px] text-slate-600 mt-1 leading-5" data-id="${s.id}">${esc(previewText(s.id, s.score))}</p>
                </div></li>`;
        }).join('');
        const un = E().unsupported(sugg, M);
        // الاستمارة المصغّرة (2026-10-27): البنود الأخرى تُقيَّم من هنا أيضاً — المحدَّد فيها درجة النموذج الآن، ولا يُطبَّق إلّا ما غيّرته
        const others = un.map(u => {
            const curScore = formScore(u.id);
            return `<li class="py-3 flex gap-3 items-start border-b border-slate-100 last:border-0">
                <input type="checkbox" class="eye-apply mt-1 w-5 h-5" data-id="${u.id}" data-score="${curScore || ''}" aria-label="تطبيق البند ${u.id} على النموذج">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2"><b class="text-slate-900">${esc(title(u.id))}</b>
                        ${applied.has(u.id) ? '<span class="text-xs font-bold text-green-700">طُبّق</span>' : ''}</div>
                    ${LOG[u.id] && LOG[u.id].length ? evMini(LOG[u.id]) : `<p class="text-xs text-slate-500 mt-0.5 leading-5">${esc(u.why)}</p>`}
                    ${levelPicker(u.id, curScore, null, curScore)}
                    ${curScore ? `<p class="eye-prev text-[11px] text-slate-600 mt-1 leading-5" data-id="${u.id}">${esc(previewText(u.id, curScore))}</p>` : ''}
                </div></li>`;
        }).join('');

        box.innerHTML = `
            <div class="bg-white rounded-2xl border border-slate-200 p-5">
                <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <h2 class="text-lg font-bold text-slate-900">نتيجة الرصد</h2>
                    <span class="text-xs text-slate-500">${esc(when)}${data.src === 'file' ? ' — من مقطعٍ مصوَّر' : data.src === 'none' ? ' — بلا كاميرا' : data.via === 'phone' ? ' — من كاميرا الهاتف' : ''}</span>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                    <dl class="text-sm">${metrics}</dl>
                    <div class="pt-2">
                        ${data.summary ? `<p class="text-sm text-slate-700 leading-7 bg-slate-50 border border-slate-200 rounded-xl p-3">${esc(data.summary)}</p>
                        <button type="button" id="eyeToNotes" class="svf-btn svf-btn-secondary svf-btn-sm mt-3">إدراج الملخّص في «الملاحظات العامة»</button>` : ''}
                    </div>
                </div>
            </div>
            ${followHtml}
            ${targetsHtml}
            <div id="eyeReview" class="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 class="text-lg font-bold text-slate-900">مراجعة التقييم والأدلّة</h2>
                <p class="text-sm text-slate-600 mt-1 leading-6">لكلّ بندٍ مستواه المقترح وأدلّته من الحصة بأوقاتها، وما سيُكتب في الوصف الرسميّ. راجع وعدّل بلمسة، ثمّ «اعتماد وحفظ».
                   اقتراحٌ يُراجَع لا حكمٌ نهائيّ: يُقترح البند الذي عليه شاهدٌ من الرصد أو من لمساتك، ومع كلٍّ شاهده ودرجة الثقة فيه.
                   صحّح العدّادات إن لزم فيُعاد الاقتراح، ثمّ حدِّد ما تعتمده وطبّقه على نموذج التقييم — ويظهر الشاهد تحت البند فيه.</p>
                ${sugg.length ? `<ul class="mt-2">${items}</ul>` : '<p class="text-sm text-slate-600 py-4">لا بند عليه شاهدٌ كافٍ بعد. ارصد عشر دقائق على الأقلّ، أو المس عناصر الحصة والوسوم أثناءها.</p>'}
                ${un.length ? `<details id="eyeOthers" class="mt-3 text-sm"${sugg.length ? '' : ' open'}>
                    <summary class="cursor-pointer text-slate-700 font-semibold">البنود الأخرى — قيّمها من هنا (${un.length})</summary>
                    <p class="text-xs text-slate-500 mt-1 leading-5">لا اقتراح عليها من هذا الرصد. المحدَّد فيها درجتها في النموذج الآن؛ المس مستوىً آخر فيُحدَّد البند للتطبيق.</p>
                    <ul class="mt-1">${others}</ul>
                </details>` : ''}
                <div id="eyeDraft" class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                        <b class="text-sm text-slate-900">مساعد الصياغة (Claude)</b>
                        <span class="text-xs text-slate-500">يصوغ الإجادة والتطوير والتوصيات من المستويات أعلاه وأدلّة الحصة — تراجعها قبل اعتمادها</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <button type="button" id="eyeDraftGo" class="svf-btn svf-btn-secondary svf-btn-sm${draftLinked() ? '' : ' hidden'}"><i class="fa-solid fa-pen-nib" aria-hidden="true"></i>صياغة بمساعد Claude</button>
                        <button type="button" id="eyeDraftCopy" class="svf-btn svf-btn-${draftLinked() ? 'ghost' : 'secondary'} svf-btn-sm"><i class="fa-regular fa-copy" aria-hidden="true"></i>نسخ الطلب لـClaude</button>
                        <button type="button" id="eyeDraftPasteBtn" class="svf-btn svf-btn-ghost svf-btn-sm">الصق ردّ Claude</button>
                    </div>
                    <p class="text-[11px] text-slate-500 mt-1.5 leading-5">يُرسَل الصفّ وعنوان الدرس ومستويات البنود وعبارات الأدلّة — لا اسم المعلّم ولا المدرسة، ولا كلامه بنصّه، ولا ملاحظاتك، ولا صورة ولا صوت.</p>
                    <div id="eyeDraftPasteBox" class="hidden mt-2">
                        <textarea id="eyeDraftPaste" rows="5" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm leading-6" placeholder="الصق هنا ردّ Claude كاملاً"></textarea>
                        <button type="button" id="eyeDraftRead" class="svf-btn svf-btn-secondary svf-btn-sm mt-1">قراءة الردّ</button>
                    </div>
                    <p id="eyeDraftMsg" class="hidden text-xs mt-2 rounded-lg border px-3 py-2 leading-5" aria-live="polite"></p>
                    <div id="eyeDraftOut" class="hidden mt-3 space-y-3"></div>
                </div>
                <div class="flex flex-wrap items-center gap-2 mt-4">
                    <button type="button" id="eyeApproveSave" class="svf-btn svf-btn-primary"><i class="fa-solid fa-check-double" aria-hidden="true"></i>اعتماد وحفظ في الأرشيف</button>
                    <button type="button" id="eyeApply" class="svf-btn svf-btn-secondary">تطبيق المحدَّد فقط</button>
                    <span id="eyeApplyN" class="text-xs text-slate-500"></span>
                    <span class="flex-1"></span>
                    <button type="button" id="eyeNew" class="svf-btn svf-btn-ghost">رصد جديد</button>
                </div>
            </div>
            ${talkHtml}
            ${(() => {   // التفاصيل مطويّة (2026-10-29): المراجعة والحفظ والمداولة أوّلاً، والتحليل المفصّل لمن أراده
                const parts = [momHtml, partsHtml, sofitHtml, formsHtml, speechHtml, guideHtml].filter(Boolean);
                return parts.length ? `<details id="eyeDetails" class="group">
                    <summary class="cursor-pointer select-none list-none bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center justify-between gap-2">
                        <span><b class="text-lg text-slate-900">تفاصيل التحليل</b>
                            <span class="block text-xs text-slate-500 mt-0.5">${esc([momHtml && 'اللحظات', partsHtml && 'عناصر الحصة', sofitHtml && '\u2066SOFIT+\u2069', formsHtml && 'التشكيلات والزيّ', speechHtml && 'كلام المعلّم', guideHtml && 'دليل المعلّم'].filter(Boolean).join(' · '))}</span></span>
                        <i class="fa-solid fa-chevron-down text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true"></i></summary>
                    <div class="space-y-4 mt-4">${parts.join('')}</div></details>` : '';
            })()}`;
        box.classList.remove('hidden');

        if (data.tl) {
            const dig = (str, i, k) => { const ch = (str || '')[i]; return ch && ch !== '-' ? Number(ch) * k : null; };
            S.tl = data.tl.split('').map((k, i) => ({ k, v: Number((data.tv || '')[i] || 0) / 9, c: (data.tc || '')[i] || '-', mv: dig(data.tm, i, 10), talk: dig(data.tt, i, 0.1) }));
            drawTimeline();
            $('eyeTlEnd').textContent = 'النهاية';
        }
        if (data.heat) { S.savedHeat = data.heat.split('').map(Number); drawHeat(S.savedHeat); }
        renderKpis(Object.assign({ states: [] }, M), M.seconds);
        renderMonitorDone(data);
        updateGuideLive();
        $('eyeApply') && $('eyeApply').addEventListener('click', apply);
        $('eyeApproveSave') && $('eyeApproveSave').addEventListener('click', approveSave);
        bindDraft();
        document.querySelectorAll('#eyeResult .eye-exit').forEach(el => el.addEventListener('change', () => {
            const d = S.result;
            if (!d) return;
            d.exit = { loc: $('eyeExitLoc').value, wx: $('eyeExitWx').value, eq: $('eyeExitEq').value, kind: $('eyeExitKind').value.trim().slice(0, 80) };
            save(d);
        }));
        if (!box.dataset.lvBound) {                       // الحاوية تبقى بين إعادات الرسم — المستمعان مرّةً واحدة
            box.dataset.lvBound = '1';
            box.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.eye-lvb'); if (b && box.contains(b)) pickLevel(b); });
            box.addEventListener('change', e => { if (e.target.classList && e.target.classList.contains('eye-apply')) applyCount(); });
        }
        applyCount();
        $('eyeToNotes') && $('eyeToNotes').addEventListener('click', () => toNotes(data.summary));
        $('eyeNew').addEventListener('click', () => { lastClear(); reset(); });
        $('eyeCard').addEventListener('click', () => shareCard('share'));
        $('eyePrint').addEventListener('click', () => shareCard('print'));
        $('eyeToDebrief') && $('eyeToDebrief').addEventListener('click', () => { if (typeof toggleSupervisoryView === 'function') toggleSupervisoryView('debrief-view'); });
        $('eyeBalls') && $('eyeBalls').addEventListener('change', e => {
            const raw = String(e.target.value || '').trim(), v = Math.round(Number(raw));
            if (!S.result || !S.result.M || !S.result.M.people || (raw && !(v >= 0 && v <= 60))) return;
            S.result.M.people.balls = raw && v > 0 ? v : null;
            resuggest();
        });
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
            if (S.result.M && S.result.M.gspeech && LG()) LG().stripExamples(S.result.M.gspeech);
            save(S.result);
            renderResult(S.result);
            toast('حُذف النصّ — احفظ التقرير ليُحذف من نسخته المحفوظة');
        });
        box.querySelectorAll('.eye-target').forEach(cb => cb.addEventListener('change', () => setTarget(cb.dataset.k, cb.checked)));
        box.querySelectorAll('[data-goal]').forEach(inp => inp.addEventListener('change', () => setTargetGoal(inp.dataset.k || inp.dataset.goal, inp.value)));
        $('eyeTargetsRecs') && $('eyeTargetsRecs').addEventListener('click', targetsToRecs);
        $('eyeRecSave') && $('eyeRecSave').addEventListener('click', () => {
            const rec = {};
            box.querySelectorAll('[data-rec]').forEach(el => { const v = Number(el.value); if (v >= 0 && v <= 40) rec[el.dataset.rec] = v; });
            try { localStorage.setItem(REC_KEY, JSON.stringify(rec)); } catch (e) { /* تفضيلٌ لهذا المتصفّح */ }
            if (S.result && S.result.M) { S.result.M.rec = rec; resuggest(); }
            toast('حُفظ الزمن الموصى به للعناصر وأُعيد الاقتراح');
        });
        decorate();
        renderFocus();
    }

    // علامات المشرف (بنصّه) ولحظات الرصد، مرتّبةً بالوقت
    function momentsOf(data) {
        if (!data) return [];
        const cx = data.cx || [];
        const mine = (data.marks || []).map(m => ({ t: m[0], text: m[1] || '', mine: true, part: partAt(cx, m[0]) }));
        const auto = E().autoMoments(data.M || {}, suggCtx()).map(x => Object.assign(x, { part: x.part || partAt(cx, x.t) }));
        return mine.concat(auto).sort((a, b) => a.t - b.t);
    }

    // ── أهداف الزيارة القادمة ──
    function setTarget(k, on) {
        const d = S.result;
        if (!d || !E().METRIC[k]) return;
        d.targets = (d.targets || []).filter(t => t.k !== k);
        if (on) {
            const c = E().targetCandidates(d, 20).find(t => t.k === k);
            if (c) d.targets.push({ k, item: c.item, base: c.base, goal: c.goal });
        }
        save(d);
        renderResult(d);
    }
    function setTargetGoal(k, val) {
        const d = S.result, x = E().METRIC[k];
        if (!d || !x) return;
        let v = Number(val);
        if (!isFinite(v) || v < 0) return;
        if (x.unit === 'sec') v = Math.round(v * 60);
        else v = Math.round(v);
        let t = (d.targets || []).find(t => t.k === k);
        if (!t) {                                        // تعديل الهدف يختاره
            const c = E().targetCandidates(d, 20).find(t => t.k === k);
            if (!c) return;
            t = { k, item: c.item, base: c.base, goal: c.goal };
            d.targets = (d.targets || []).concat(t);
        }
        t.goal = v;
        save(d);
        renderResult(d);
    }
    function targetLines(d) {
        return (d && d.targets || []).filter(t => E().METRIC[t.k]).map(t => '• ' + standardOf(t.item) + ': ' + E().targetText(t, suggCtx()) + '، ويُقاس في الزيارة القادمة.');
    }
    function targetsToRecs() {
        const ta = $('recommendationsContent'), lines = targetLines(S.result);
        if (!ta || !lines.length) return;
        const add = lines.filter(l => !ta.value.includes(l.slice(2)));
        if (!add.length) { toast('الأهداف في «التوصيات» أصلاً'); return; }
        ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + add.join('\n') : add.join('\n');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        toast('أُدرج ' + (add.length === 1 ? 'هدفٌ' : add.length + ' أهداف') + ' في «التوصيات» — تُرفع إلى خانتها في البوّابة');
    }

    // ── أنماط رصدك (من التقارير المحفوظة في العام الدراسيّ الحاليّ) ──
    function patternRows() {
        const rows = [];
        const ay = typeof academicYearOf === 'function' ? academicYearOf(new Date().toISOString()) : null;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || k.indexOf('supervision_v6_visit_') !== 0) continue;
                try {
                    const r = JSON.parse(localStorage.getItem(k));
                    const raw = r && r.formData && r.formData.eyeData;
                    if (!raw) continue;
                    const d = JSON.parse(raw);
                    if (!d || !d.M) continue;
                    if (ay != null && r.visitDate && academicYearOf(r.visitDate) !== ay) continue;
                    rows.push({ teacher: r.teacherName || '', date: r.visitDate || '', d });
                } catch (e) { /* تقريرٌ تالف يُتخطّى */ }
            }
        } catch (e) { /* التخزين غير متاح */ }
        return rows;
    }
    function renderPatterns() {
        const box = $('eyePatterns');
        if (!box) return;
        const A = E().patterns(patternRows());
        const head = `<div class="flex flex-wrap items-baseline justify-between gap-2"><h2 class="text-lg font-bold text-slate-900">أنماط رصدك</h2>
            <span class="text-xs text-slate-500">من التقارير المحفوظة في هذا العام الدراسيّ: ما يتكرّر عند معلّميك، ومنه موضوعات برنامجك التدريبيّ</span></div>`;
        // بطاقةٌ فارغة لا تُعرض (2026-10-29): كانت تظهر تحت شاشة البدء قبل أيّ حصة
        box.classList.toggle('hidden', A.lessons < 2);
        if (A.lessons < 2) { box.innerHTML = ''; return; }
        const names = arr => arr.slice(0, 4).map(esc).join('، ') + (arr.length > 4 ? ' و(' + (arr.length - 4) + ') غيرهم' : '');
        const kv = (v, k) => `<div class="py-3 px-2"><div class="text-2xl font-bold tabular-nums text-slate-900">${v}</div><div class="text-xs text-slate-600">${k}</div></div>`;
        const topics = A.topics.filter(t => t.teachers.length >= 2).slice(0, 3);
        box.innerHTML = head + `
            <div class="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-xl mt-3 text-center divide-x divide-x-reverse divide-slate-200">
                ${kv(A.lessons, 'حصص مرصودة')}${kv(A.teachers, A.teachers === 1 ? 'معلّم' : 'معلّمون')}
                ${kv(A.avgMove != null ? A.avgMove + '%' : '—', 'متوسّط حركة الطلبة')}${kv(A.follow.measured ? A.follow.met + ' من ' + A.follow.measured : '—', 'أهدافٌ تحقّقت في المتابعة')}
            </div>
            ${A.issues.length ? `<h3 class="font-bold text-slate-800 mt-4">ما يتكرّر في حصصك</h3>
            <ul class="mt-2 space-y-2.5">${A.issues.map(x => `<li>
                <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span class="text-slate-800">${esc(x.label)}</span>
                    <span class="text-xs text-slate-500 tabular-nums">${x.n} من ${A.lessons} حصص · ${x.pct}%</span></div>
                <div class="h-2 bg-slate-100 rounded mt-1"><div class="h-2 rounded" style="width:${x.pct}%;background:#0f4c81"></div></div>
                <div class="text-xs text-slate-500 mt-1">${names(x.teachers)}</div></li>`).join('')}</ul>` : '<p class="text-sm text-slate-600 mt-3">لا نمط متكرّراً في الحصص المرصودة.</p>'}
            ${topics.length ? `<div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><b class="text-sm text-slate-900">مقترحٌ لبرنامجك التدريبيّ</b>
                <ol class="mt-1.5 space-y-1 list-decimal pr-5 text-sm text-slate-700">${topics.map(t => `<li class="leading-6"><b class="text-slate-900">${esc(t.topic)}</b> — يحتاجه (${t.teachers.length}) معلّمين: ${names(t.teachers)}</li>`).join('')}</ol>
                <p class="text-xs text-slate-500 mt-1.5">موضوعٌ يشترك فيه معلّمان فأكثر يصلح ورشةً أو درساً تطبيقيّاً أو زيارةً تبادليّة.</p></div>` : ''}`;
    }

    // بطاقة التحليل للمعلّم (js/eye-report.js): صورةٌ تُشارَك (واتساب وغيره) أو صفحةٌ تُطبع PDF — من أرقام الرصد وحدها
    function shareCard(mode) {
        if (!S.result) return;
        if (!root.SvfEyeReport) { toast('تعذّر تحميل البطاقة — حدّث الصفحة', 'error'); return; }
        const I = info(), prev = prevEye();
        const extra = { grow: growthLines(S.result, prev), prevDate: prev && prev.date, prompts: E().debriefPrompts(S.result.M || {}, S.result.counts || {}, ctxOf(S.result)),
                        targets: (S.result.targets || []).filter(t => E().METRIC[t.k]).map(t => E().targetGoalText(t) + ' (الآن ' + E().fmtTarget(E().METRIC[t.k].unit, t.base) + ')') };
        SvfEyeReport[mode === 'print' ? 'print' : 'share'](S.result, I, extra).then(r => {
            if (r === 'download') toast('حُفظت البطاقة صورةً في جهازك — أرسلها للمعلّم');
        }).catch(e => { if (!e || e.name !== 'AbortError') toast('تعذّرت مشاركة البطاقة', 'error'); });
    }

    // ── مساعد الأدلّة (2026-10-28) ──
    // سجلّ الأدلّة (eye-core: evidenceLog) — حيّاً من الرصد الجاري، أو من النتيجة المحفوظة في #eyeData. لا يُحفظ وحده: يُبنى من أرقام الرصد.
    const markRow = m => (m.item ? [m.t, m.note || '', m.item] : [m.t, m.note || '']);
    function logOf(d) {
        if (!d) return {};
        return E().evidenceLog({ ev: (d.ev || []).map(e => ({ t: e[0], k: e[1] })), counts: d.counts || {}, M: d.M || {}, sample: d.sample,
            follow: d.follow && d.follow.list, marks: (d.marks || []).map(m => ({ t: m[0], note: m[1], item: m[2] })), ctx: ctxOf(d) });
    }
    function liveLog(M) {
        const sp = S.sp && S.sp.A;
        return E().evidenceLog({ ev: S.events, counts: S.counts, M: sp ? Object.assign({}, M, { speech: sp }) : M, sample: S.sample,
            marks: S.marks, ctx: suggCtx() });
    }
    function currentLog() {
        if (S.running) return S.log || {};
        let d = null;
        try { d = JSON.parse((($('eyeData') || {}).value) || 'null'); } catch (e) { d = null; }
        return logOf(d);
    }
    const SRC_TEXT = { tap: 'لمستك', mark: 'علامتك', cam: 'الكاميرا', ai: 'كشف الطلبة', ctx: 'عناصر الحصة', speech: 'كلام المعلّم', sample: 'عيّنة الطلبة', follow: 'أهداف الزيارة السابقة' };
    function refreshEvidence(M) {
        if (!S.running) return;
        S.log = liveLog(M || E().summarize(recNow()));
        const box = $('eyeEvLive'), L = S.log, ids = Object.keys(L).map(Number).sort((a, b) => a - b);
        const all = [];
        ids.forEach(id => L[id].forEach(e => all.push(Object.assign({ id }, e))));
        box.classList.toggle('hidden', !all.length);
        $('eyeEvItems').innerHTML = ids.map(id => `<span class="text-xs rounded-lg border border-slate-200 px-2 py-1 text-slate-700" title="${esc(title(id))}">البند ${id} <b class="tabular-nums text-slate-900">${L[id].length}</b></span>`).join('');
        const last = all.filter(e => e.t != null).sort((a, b) => b.t - a.t).slice(0, 4);
        $('eyeEvLast').innerHTML = last.map(e => `<li class="text-xs text-slate-700 leading-5"><span class="tabular-nums text-slate-500 ml-1">${mmss(e.t)}</span><b class="text-slate-800 ml-1">البند ${e.id}:</b>${esc(e.text)}</li>`).join('');
        const fv = $('form-view');
        if (fv && !fv.classList.contains('hidden')) decorate();
    }
    // عبارات الدليل للبند بمستواه — تحلّ محلّ العشوائيّة في «ويتضح ذلك من خلال …» (supervisory.js)، وفي لوحة «تعديل الأدلة» كلّها (all)
    // ما يدخل «نموذج التقييم» المشترك (الوصف ولوحة الأدلّة والأدلّة تحت البنود) لصاحب العين وحده (EYE_OWNERS في gate.js):
    // بقيّة المشرفين على النظام السابق بلا تغيير — حتّى لو وُجد في #eyeData رصدٌ (تقريرٌ منقول) لا يُقرأ لهم
    const EYE_OK = () => !!(root.SupervisorGate && SupervisorGate.canEye && SupervisorGate.canEye());
    root.svfEyeOfficial = function (id, score, all) {
        if (!EYE_OK()) return null;
        try { const out = E().officialFor(currentLog(), Number(id), Number(score), !!all); return out.length ? out : null; } catch (e) { return null; }
    };

    // تحت كلّ بندٍ في «نموذج التقييم»: اقتراح العين وشاهده، وأدلّة الحصة بأوقاتها — بلا مساسٍ بالوصف الرسميّ
    function decorate() {
        let d = null;
        try { d = JSON.parse((($('eyeData') || {}).value) || 'null'); } catch (e) { d = null; }
        const by = {};
        ((d && d.sugg) || []).forEach(s => { by[s.id] = s; });
        if (!EYE_OK()) { document.querySelectorAll('#form-view .eye-evlist, #form-view .eye-badge').forEach(x => x.remove()); return; }
        const LOG = S.running ? (S.log || {}) : logOf(d);
        document.querySelectorAll('#form-view [id^="item-"]').forEach(card => {
            const id = Number(card.id.slice(5));
            if (!id) return;
            evList(card, id, LOG[id] || []);
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

    // «أدلّة من الحصة (ن)»: قائمةٌ مطويّةٌ تحت البند — الوقت والمصدر وما حدث (textContent)، وعبارة التقرير
    function evList(card, id, list) {
        let box = card.querySelector('.eye-evlist');
        if (!list.length) { if (box) box.remove(); return; }
        if (!box) {
            box = document.createElement('details');
            box.className = 'eye-evlist mt-2 text-xs text-slate-700 bg-white border border-blue-100 rounded-lg px-2.5 py-1.5';
            const host = card.querySelector('.flex-grow') || card;
            host.appendChild(box);
        }
        const open = box.open;
        box.textContent = '';
        const sum = document.createElement('summary');
        sum.className = 'cursor-pointer font-semibold text-blue-900';
        sum.textContent = 'أدلّة من الحصة (' + list.length + ')' + (S.running ? ' — تتجدّد' : '');
        box.appendChild(sum);
        const ul = document.createElement('ul');
        ul.className = 'mt-1 space-y-1';
        list.forEach(e => {
            const li = document.createElement('li');
            li.className = 'leading-5';
            const tm = document.createElement('span');
            tm.className = 'tabular-nums text-slate-500 ml-1';
            tm.textContent = (e.t != null ? mmss(e.t) : '—') + ' ';
            li.appendChild(tm);
            li.appendChild(document.createTextNode(e.text));
            const src = document.createElement('span');
            src.className = 'text-[10px] text-slate-400 mr-1';
            src.textContent = ' · ' + (SRC_TEXT[e.src] || '');
            li.appendChild(src);
            if (e.pos || e.neg) {
                const ph = document.createElement('div');
                ph.className = 'text-[11px] ' + (e.neg ? 'text-red-800' : 'text-green-800');
                ph.textContent = 'للتقرير: ' + (e.pos || e.neg);
                li.appendChild(ph);
            }
            ul.appendChild(li);
        });
        box.appendChild(ul);
        box.open = open;
    }

    // ── مساعد الصياغة (js/eye-draft.js) ──
    const DRAFT = () => root.SvfEyeDraft;
    const draftLinked = () => { const u = $('eyeDraftUrl'), k = $('eyeDraftKey'); return !!(u && k && /^https:\/\/\S+$/.test(u.value.trim()) && k.value.trim()); };
    // المستوى الذي تراه في المراجعة الآن (المختار بلمسة، وإلّا درجة النموذج)
    function reviewScores() {
        const out = {};
        for (let id = 1; id <= 13; id++) {
            const b = document.querySelector('#eyeResult .eye-lvb[data-id="' + id + '"][aria-pressed="true"]');
            const el = document.querySelector('#score-' + id), f = el ? Number(el.textContent) : NaN;
            out[id] = b ? Number(b.dataset.score) : (f >= 1 && f <= 5 ? f : null);
        }
        return out;
    }
    function draftInput() {
        const sc = reviewScores(), I = info();
        let g = 0;
        try { g = typeof getSupervisoryGender === 'function' ? getSupervisoryGender() : 0; } catch (e) { g = 0; }
        const items = (typeof evaluationItems !== 'undefined' ? evaluationItems : []).map(it => {
            const s = sc[it.id];
            let level = '';
            try {
                const L = typeof evidenceBasedContent !== 'undefined' ? evidenceBasedContent[String(it.id)] : null;
                level = L && L.levels && s ? (L.levels[s] || '') : '';
                if (level && typeof applyGenderFilter === 'function') level = applyGenderFilter(level, g);
            } catch (e) { level = ''; }
            return { id: it.id, standard: it.standard, title: it.title, score: s, level: pupil(level), ev: (S.reviewLog || {})[it.id] || [] };
        });
        // SOFIT+ في سطرٍ للمساعد: المقارنة وما حدّ من النشاط — أرقامٌ وتسمياتٌ بلا أسماء
        const SP = S.result ? E().sofitPlus(S.result) : null;
        const spLine = SP ? ['وفق SOFIT+:', SP.rel ? 'حين اجتمعت ممارساتٌ داعمة كانت حركة الطلبة (' + SP.rel.hi.mv + '%) وحين قلّت (' + SP.rel.lo.mv + '%)' : '',
            SP.limits.length ? 'ومما حدّ من النشاط: ' + SP.limits.map(l => l.label).join('، ') : ''].filter(Boolean).join(' ') : '';
        const summary = [S.result && S.result.summary, spLine.length > 14 ? spLine : ''].filter(Boolean).join(' ');
        return { female: female(), lower: lower(), cls: I.cls, topic: I.topic, summary, items };
    }
    function draftMsg(text, kind) {
        const el = $('eyeDraftMsg');
        if (!el) return;
        el.classList.toggle('hidden', !text);
        el.className = 'text-xs mt-2 rounded-lg border px-3 py-2 leading-5 ' + (kind === 'bad' ? 'border-red-200 bg-red-50 text-red-800' : kind === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-white text-slate-700') + (text ? '' : ' hidden');
        el.textContent = text || '';
    }
    async function draftRun() {
        const D = DRAFT(), btn = $('eyeDraftGo');
        if (!D) return;
        if (!draftLinked()) { draftMsg('أضف رابط الوسيط وكلمته في «الإعدادات» ← مساعد الصياغة، أو استعمل «نسخ الطلب لـClaude».', 'bad'); return; }
        const req = D.build(draftInput());
        btn.disabled = true;
        draftMsg('يصوغ Claude التقرير… قرابة نصف دقيقة.');
        try {
            const r = await fetch($('eyeDraftUrl').value.trim(), { method: 'POST', headers: { 'content-type': 'application/json', 'x-svf-key': $('eyeDraftKey').value.trim() }, body: JSON.stringify(req) });
            let j = {};
            try { j = await r.json(); } catch (e) { j = {}; }
            if (!r.ok) throw new Error(j.error || ('رمز ' + r.status));
            const out = D.parse(j.text);
            if (!out) throw new Error('لم تُفهم صيغة الردّ');
            draftShow(out, j.stop === 'max_tokens');
        } catch (e) {
            draftMsg('تعذّرت الصياغة: ' + (e && e.message ? e.message : e) + (navigator.onLine === false ? ' — لا اتّصال بالإنترنت.' : '') + ' ويبقى «نسخ الطلب لـClaude» متاحاً.', 'bad');
        } finally { btn.disabled = false; }
    }
    // الطريق المجّانيّ: الطلب إلى الحافظة، وClaude في تبويبٍ جديد، ثمّ يُلصق الردّ هنا
    function draftCopy() {
        const D = DRAFT();
        if (!D) return;
        const text = D.promptText(D.build(draftInput()));
        let ok = false;
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
        } catch (e) { ok = false; }
        if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
        try { root.open('https://claude.ai/new', '_blank', 'noopener'); } catch (e) { /* يفتحه المشرف بنفسه */ }
        $('eyeDraftPasteBox').classList.remove('hidden');
        draftMsg('نُسخ الطلب. الصقه في Claude، ثمّ انسخ ردّه كاملاً والصقه في الخانة أدناه واضغط «قراءة الردّ».');
    }
    function draftRead() {
        const D = DRAFT(), out = D && D.parse($('eyeDraftPaste').value);
        if (!out) { draftMsg('لم أجد في الردّ العناوين الثلاثة («جوانب الإجادة:» و«الجوانب التي تحتاج إلى تطوير:» و«التوصيات:»). الصق الردّ كاملاً.', 'bad'); return; }
        draftShow(out, false);
    }
    function draftShow(out, cut) {
        const D = DRAFT(), I = info(), box = $('eyeDraftOut');
        S.draft = out;
        const probs = D.problems(out, { teacher: I.teacher, school: I.school });
        if (cut) probs.unshift('الردّ انقطع لطوله — راجع آخر خانة');
        box.innerHTML = D.FIELDS.map(F => `<label class="block">
                <span class="flex items-baseline justify-between gap-2 text-xs font-bold text-slate-700">${esc(F.head)}<span class="eye-dlen font-normal text-slate-500 tabular-nums" data-k="${F.k}"></span></span>
                <textarea class="eye-dtext w-full mt-1 bg-white border border-slate-300 rounded-lg p-2 text-sm leading-7" rows="6" data-k="${F.k}"></textarea></label>`).join('')
            + (probs.length ? `<ul class="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">${probs.map(p => '<li>' + esc(p) + '</li>').join('')}</ul>` : '')
            + `<div class="flex flex-wrap items-center gap-2">
                <button type="button" id="eyeDraftUse" class="svf-btn svf-btn-primary svf-btn-sm"><i class="fa-solid fa-file-pen" aria-hidden="true"></i>أدرج هذه الصياغة في الاستمارة</button>
                <button type="button" id="eyeDraftDrop" class="svf-btn svf-btn-ghost svf-btn-sm">تجاهلها</button>
                <span class="text-[11px] text-slate-500">عدّل ما شئت قبل الإدراج — ثمّ «اعتماد وحفظ» يُبقيها كما هي</span></div>`;
        box.querySelectorAll('.eye-dtext').forEach(t => { t.value = out[t.dataset.k] || ''; });
        const lens = () => box.querySelectorAll('.eye-dtext').forEach(t => {
            const n = t.value.replace(/\n/g, '\r\n').length, el = box.querySelector('.eye-dlen[data-k="' + t.dataset.k + '"]');
            el.textContent = n + ' من 1000'; el.style.color = n > 1000 ? '#b5452f' : '';
        });
        lens();
        box.oninput = lens;
        box.classList.remove('hidden');
        $('eyeDraftUse').addEventListener('click', draftUse);
        $('eyeDraftDrop').addEventListener('click', () => { S.draft = null; box.classList.add('hidden'); box.innerHTML = ''; draftMsg(''); });
        draftMsg('راجع الصياغة: كلّ ما فيها يجب أن يكون ممّا رصدته فعلاً.', 'ok');
    }
    function draftUse() {
        const box = $('eyeDraftOut'), map = { strengths: 'strengthsContent', developments: 'developmentContent', recs: 'recommendationsContent' };
        const vals = {};
        box.querySelectorAll('.eye-dtext').forEach(t => { vals[t.dataset.k] = pupil(DRAFT().clean(t.value)); });
        if (Object.keys(vals).some(k => vals[k].replace(/\n/g, '\r\n').length > 1000)) { toast('خانةٌ أطول من حدّ البوّابة (1000 حرف) — اختصرها أوّلاً', 'error'); return; }
        const filled = Object.keys(map).filter(k => { const f = $(map[k]); return f && f.value.trim() && f.value.trim() !== (vals[k] || '').trim(); });
        if (filled.length) {
            let ok = false;
            try { ok = root.confirm('في الاستمارة نصٌّ في ' + filled.length + (filled.length === 1 ? ' خانة' : ' خانات') + ' — تحلّ الصياغة محلّه؟'); } catch (e) { ok = false; }
            if (!ok) return;
        }
        Object.keys(map).forEach(k => {
            const f = $(map[k]);
            if (f && vals[k]) { f.value = vals[k]; f.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        draftMsg('أُدرجت الصياغة في الاستمارة. «اعتماد وحفظ» يطبّق المستويات ويحفظ دون أن يغيّرها.', 'ok');
        toast('أُدرجت الصياغة في الاستمارة');
    }
    function bindDraft() {
        if (!$('eyeDraft')) return;
        $('eyeDraftGo').addEventListener('click', draftRun);
        $('eyeDraftCopy').addEventListener('click', draftCopy);
        $('eyeDraftPasteBtn').addEventListener('click', () => { $('eyeDraftPasteBox').classList.toggle('hidden'); if (!$('eyeDraftPasteBox').classList.contains('hidden')) $('eyeDraftPaste').focus(); });
        $('eyeDraftRead').addEventListener('click', draftRead);
    }

    const pickedRows = () => Array.from(document.querySelectorAll('#eyeResult .eye-apply:checked')).map(c => ({ id: +c.dataset.id, score: +c.dataset.score })).filter(p => p.score >= 1 && p.score <= 5);
    // الزرّ نفسه الذي يضغطه المشرف: الدرجة والوصف (بأدلّة الحصة) يتبعانه كما لو اختارها بيده
    function applyPicks(picks) {
        let done = 0;
        picks.forEach(p => {
            const btn = document.querySelector('#item-' + p.id + ' .rating-btn[data-score="' + p.score + '"]');
            if (btn) { btn.click(); done++; }
        });
        const data = S.result;
        if (done && data) { data.applied = Array.from(new Set((data.applied || []).concat(picks.map(p => p.id)))); save(data); }
        return done;
    }
    // خانات التقرير التي كتبها المشرف بيده (ليست كما وُلّدت) — لا يطمسها «اعتماد وحفظ»
    function editedReportFields() {
        try {
            const F = typeof SUP_GENERATED_FIELDS !== 'undefined' ? SUP_GENERATED_FIELDS : null, g = typeof supLastGenerated !== 'undefined' ? supLastGenerated : null;
            if (!F) return [];
            const names = { strengths: 'جوانب الإجادة', developments: 'الجوانب التي تحتاج إلى تطوير', recs: 'التوصيات' };
            return Object.keys(F).filter(k => { const f = document.querySelector(F[k]); return f && f.value.trim() && !(g && g.texts && g.texts[k] === f.value); }).map(k => names[k] || k);
        } catch (e) { return []; }
    }
    // المرحلة الثانية: «اعتماد وحفظ» — تطبيق المراجَع، ثمّ توليد التقرير (ما لم يكتب المشرف نصّه بيده)، والملخّص في «الملاحظات العامة»،
    // والأهداف المختارة في «التوصيات»، ثمّ الحفظ في الأرشيف بمساره نفسه (savePermanentReport — ومعه سؤال «زيارة جديدة أم تحديث»)
    function approveSave() {
        const I = info();
        if (!I.teacher || !I.date) { toast('اكتب اسم المعلّم وتاريخ الزيارة في «نموذج التقييم» أوّلاً', 'error'); return; }
        const picks = pickedRows();
        const rest = Array.from(document.querySelectorAll('#eyeOthers .eye-apply:not(:checked)')).map(c => +c.dataset.id);
        const edited = editedReportFields();
        const msg = (picks.length ? 'يُطبَّق ما راجعته (' + picks.length + (picks.length > 10 ? ' بنداً' : ' بنود') + ')' : 'لا تغيير على الدرجات') + '، '
            + (edited.length ? 'وما كتبته بيدك في «' + edited.join('» و«') + '» يبقى كما هو' : 'ويُولَّد التقرير') + '، ثمّ يُحفظ في الأرشيف.'
            + (rest.length ? '\nبنودٌ تبقى بدرجتها الحاليّة في النموذج: ' + rest.join('، ') + '.' : '') + '\n\nمتابعة؟';
        let ok = false;
        try { ok = root.confirm(msg); } catch (e) { ok = false; }
        if (!ok) return;
        if (picks.length && !applyPicks(picks)) { toast('تعذّر الوصول إلى بنود النموذج', 'error'); return; }
        if (typeof toggleSupervisoryView === 'function') toggleSupervisoryView('form-view');
        if (!edited.length && typeof generateReport === 'function') { try { generateReport(); } catch (e) { console.warn(e); } }
        const d = S.result;
        if (d && d.summary) { const ta = $('generalNotesContent'); if (ta && !ta.value.includes(d.summary)) { ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + d.summary : d.summary; ta.dispatchEvent(new Event('input', { bubbles: true })); } }
        if (d && Array.isArray(d.targets) && d.targets.length) {
            const ta = $('recommendationsContent'), add = targetLines(d).filter(l => ta && !ta.value.includes(l.slice(2)));
            if (ta && add.length) { ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + add.join('\n') : add.join('\n'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        if (typeof savePermanentReport === 'function') savePermanentReport();
    }

    function apply() {
        const picks = pickedRows();
        if (!picks.length) { toast('حدِّد بنداً واحداً على الأقلّ', 'error'); return; }
        const done = applyPicks(picks);
        if (!done) { toast('تعذّر الوصول إلى بنود النموذج', 'error'); return; }
        if (typeof toggleSupervisoryView === 'function') toggleSupervisoryView('form-view');
        const cards = picks.map(p => document.getElementById('item-' + p.id)).filter(Boolean);
        cards.forEach(c => flash(c, '#f0b44a', 2600));
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
        if (S.link || !$('eyePair').classList.contains('hidden')) cancelPhone();   // ربطٌ معلَّقٌ لزيارةٍ أخرى
        S.secs = []; S.grid = null; S.events = []; S.counts = {}; S.result = null; S.tl = null; S.savedHeat = null;
        S.ctxEvents = []; S.ctxCur = null; S.pSnap = null; S.src = null; S.consent = false; S.hadAudio = false; S.classMax = 0;
        S.rollSpans = []; S.rollSig = '';
        S.sp = null; S.speechConsent = false;
        S.sample = null; S.sampleRound = 'a'; S.marks = []; S.samplePick = -1;
        S.via = null; S.lostSec = 0; S.phoneCams = null;
        S.resume = null; S.spSeed = null; S.gapSec = 0; S.resumes = 0; S.spOff = 0; S.camFrozenFor = 0;
        S.guide = null; S.gkey = '';
        detectGuide();
        renderGuide();
        renderCounts();
        renderCtx();
        renderSample();
        renderMarks();
        $('eyeResult').classList.add('hidden');
        $('eyeResult').innerHTML = '';
        $('eyeIdle').classList.remove('hidden');
        $('eyeTlEnd').textContent = 'الآن';
        renderKpis(null);
        resetMonitor();
        drawTimeline([]);
        message('');
        renderFocus();
        layout();
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
        box.classList.toggle('hidden', !A.n);         // فارغةٌ لا تُعرض — تظهر بعد أوّل تقريرٍ محفوظٍ اقترحت فيه العين
        if (!A.n) { box.innerHTML = ''; return; }
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
        lastClear();                                    // نتيجة الرصد تُحفظ الآن مع التقرير
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
        setTimeout(() => { renderAgreement(); renderPatterns(); }, 0);
    };

    // يُستدعى عند فتح التبويب (toggleSupervisoryView)
    root.svfEyeOpen = function () {
        if (!E()) return;
        if (!S.bound) build();
        setTimeout(renderResume, 0);
        renderAgreement();
        renderPatterns();
        decorate();
        drawView();
        if (S.running) { drawTimeline(); renderFocus(); renderGuide(); return; }
        const saved = ($('eyeData') && $('eyeData').value) || '';
        if (saved === S.written) {
            if (S.result) { drawTimeline(); drawHeat(S.savedHeat); }
            if (!(S.result && S.result.guide)) detectGuide();
            renderGuide(); renderSample(); renderFocus();
            return;
        }
        // تقريرٌ آخر فُتح أو صُفّر النموذج: تُعرض نتيجته المحفوظة أو تبدأ الشاشة من جديد
        reset();
        S.written = saved;
        if (!saved) return;
        try {
            const data = JSON.parse(saved);
            S.result = data;
            S.counts = Object.assign({}, data.counts || {});
            S.events = (data.ev || []).map(e => ({ t: e[0], k: e[1] }));
            S.sample = data.sample ? JSON.parse(JSON.stringify(data.sample)) : null;
            S.marks = (data.marks || []).map(m => ({ t: m[0], note: m[1] || '', item: m[2] || null }));
            if (data.guide && LG() && LG().byId(data.guide.id)) {
                const I = info();
                S.guide = { id: data.guide.id, skills: (data.guide.skills || []).slice(), sure: true, on: true, min: false };
                S.gkey = I.cls + '|' + I.topic;
                renderGuide();
            }
            renderCounts();
            renderSample();
            renderMarks();
            renderResult(data);
        } catch (e) { /* بياناتٌ تالفة: تبقى الشاشة فارغة */ }
        layout();
    };
    root.svfEyeStop = function () { stop(false); };
    // نموذج التقييم يستدعيها عند ظهوره (toggleSupervisoryView) وبعد التصفير: الشاهد تحت البنود أو إزالته
    root.svfEyeDecorate = function () { try { decorate(); } catch (e) { /* لا أثر على النموذج */ } };
    // المداولة (js/debrief.js): لوحة «من عين المشرف» للزيارة المفتوحة، أو فراغ
    root.svfEyeDebriefHtml = function () {
        if (!EYE_OK()) return '';
        let d = null;
        try { d = JSON.parse((($('eyeData') || {}).value) || 'null'); } catch (e) { d = null; }
        if (!d || !d.M || !E()) return '';
        const M = d.M, P = M.people && M.people.detSecs >= 60 ? M.people : null;
        const det = M.ctx && M.ctx.covered >= 60 ? E().partsDetail(M, M.rec) : null;
        const dp = E().debriefPrompts(M, d.counts || {}, ctxOf(d));
        const mom = momentsOf(d);
        const tg = Array.isArray(d.targets) ? d.targets.filter(t => E().METRIC[t.k]) : [];
        const kv = (k, v) => `<div class="px-3 py-2"><div class="text-lg font-bold text-slate-900 tabular-nums">${esc(v)}</div><div class="text-[11px] text-slate-600">${esc(k)}</div></div>`;
        const mv = movingOf(M);
        const evTalk = debriefEvidence(d);
        // SOFIT+: ممارساته ونشاط الطلبة — المقارنة ولحظتاها سؤالان للنقاش
        const SPx = E().sofitPlus(d), fem = female();
        const spHtml = SPx && (SPx.rel || SPx.best || SPx.worst) ? `<div class="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div class="text-[11px] font-bold text-blue-900 mb-1">من <bdi dir="ltr">SOFIT+</bdi> — ممارساتك ونشاط الطلبة</div>
                ${SPx.rel ? `<div class="text-sm text-slate-800 leading-7">حين اجتمعت ثلاث ممارساتٍ داعمة فأكثر كانت حركة الطلبة (${SPx.rel.hi.mv}%)، وحين قلّت كانت (${SPx.rel.lo.mv}%).</div>` : ''}
                ${SPx.worst ? `<div class="text-sm text-slate-700 leading-7">• عند الدقيقة <span class="tabular-nums">${mmss(SPx.worst.t)}</span> كانت حركة الطلبة (${SPx.worst.mv}%)${E().sofitPlusWhy(SPx.worst) ? ': ' + esc(E().sofitPlusWhy(SPx.worst)) : ''}. ما الذي ${fem ? 'كنتِ تستطيعين' : 'كنتَ تستطيع'} تغييره في تلك اللحظة؟</div>` : ''}
                ${SPx.best ? `<div class="text-sm text-slate-700 leading-7">• عند الدقيقة <span class="tabular-nums">${mmss(SPx.best.t)}</span> بلغت (${SPx.best.mv}%): ${esc(E().sofitPlusWhy(SPx.best) || '')}. كيف ${fem ? 'تجعلين' : 'تجعل'} هذا هو الغالب في حصصك؟</div>` : ''}
            </div>` : '';
        return `<div class="bg-white rounded-2xl border border-slate-200 p-5">
            <div class="flex flex-wrap items-baseline justify-between gap-2"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-eye ml-2 text-slate-500"></i>من عين المشرف</h3>
                <button type="button" id="debriefEyeCard" class="svf-btn svf-btn-secondary svf-btn-sm">بطاقة التحليل للمعلّم</button></div>
            <div class="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-xl mt-3 divide-x divide-x-reverse divide-slate-200">
                ${kv('عدد الطلبة', P ? String(P.classSize || P.inside) : '—')}${kv('حركة الطلبة', mv != null ? mv + '%' : '—')}
                ${kv('التشكيلات', M.forms ? String(M.forms.count) : '—')}${kv('بغير الزيّ', String((d.counts || {}).dish || 0))}
            </div>
            ${M.speech && M.speech.clauses && SX() ? `<p class="text-sm text-slate-700 mt-3"><b class="text-slate-900">من كلامه:</b> ${esc(SX().line(M.speech))}</p>` : ''}
            ${det ? `<div class="flex flex-wrap gap-1.5 mt-3">${det.map(r => `<span class="text-xs rounded-lg border px-2 py-1 ${r.verdict === 'ok' ? 'border-green-200 text-green-800' : r.verdict === 'missing' ? 'border-red-200 text-red-800' : 'border-amber-200 text-amber-800'}">${esc(r.short)} ${r.minutes} د</span>`).join('')}</div>` : ''}
            ${evTalk}
            ${spHtml}
            ${dp.good.length ? `<div class="mt-3"><div class="text-[11px] font-bold text-green-700 mb-1">ما يُعزَّز</div>${dp.good.map(t => `<div class="text-sm text-slate-700 leading-7">• ${esc(t)}</div>`).join('')}</div>` : ''}
            ${dp.ask.length ? `<div class="mt-3"><div class="text-[11px] font-bold text-amber-700 mb-1">أسئلةٌ من الرصد</div>${dp.ask.map(t => `<div class="text-sm text-slate-700 leading-7">• ${esc(t)}</div>`).join('')}</div>` : ''}
            ${mom.length ? `<div class="mt-3"><div class="text-[11px] font-bold text-slate-600 mb-1">لحظاتٌ للنقاش</div>${mom.slice(0, 8).map(x => `<div class="text-sm text-slate-700 leading-7">
                <span class="text-xs tabular-nums text-slate-500 ml-1">${mmss(x.t)}</span>${x.part ? `<span class="text-[11px] text-slate-500 ml-1">${esc(partShort(x.part))}</span>` : ''}${esc(x.text || 'علامة')}</div>`).join('')}</div>` : ''}
            ${tg.length ? `<div class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div class="text-[11px] font-bold text-slate-600 mb-1">أهدافٌ قابلة للقياس للزيارة القادمة</div>
                ${tg.map(t => `<div class="text-sm text-slate-800 leading-7">• ${esc(E().targetGoalText(t))} <span class="text-xs text-slate-500">(الآن ${esc(E().fmtTarget(E().METRIC[t.k].unit, t.base))})</span></div>`).join('')}
                <button type="button" id="debriefEyeIndicator" class="svf-btn svf-btn-secondary svf-btn-sm mt-2">أدرجها في «مؤشّر النجاح»</button></div>` : ''}
        </div>`;
    };
    // المرحلة الثالثة: المداولة من الأدلّة نفسها — البنود بدرجاتها في النموذج الآن: الأحوج (٤–٥، أو ٣ عليه دليلٌ سالب) سؤالٌ مرتكزٌ على لحظةٍ
    // بعينها «عند الدقيقة … رُصد …»، والأقوى (١–٢ بدليلٍ موجب) تعزيزٌ بدليله. بصيغة المخاطَب والجنس، والنصوص مهروبة.
    function debriefEvidence(d) {
        const LOG = logOf(d), ctx = ctxOf(d), fem = !!ctx.female, g = (m, f) => (fem ? f : m);
        const sc = id => { const el = document.getElementById('score-' + id); const n = el ? Number(el.textContent) : NaN; return n >= 1 && n <= 5 ? n : null; };
        const ids = Object.keys(LOG).map(Number);
        const focus = ids.filter(id => sc(id) >= 4 || (sc(id) === 3 && LOG[id].some(e => e.neg))).sort((a, b) => sc(b) - sc(a) || a - b).slice(0, 3);
        const strong = ids.filter(id => sc(id) && sc(id) <= 2 && LOG[id].some(e => e.pos)).sort((a, b) => sc(a) - sc(b) || a - b).slice(0, 3);
        if (!focus.length && !strong.length) return '';
        const when = e => (e.t != null ? 'عند الدقيقة ' + mmss(e.t) : 'في الحصة');
        const line = e => `<div class="text-sm text-slate-700 leading-7"><span class="text-xs tabular-nums text-slate-500 ml-1">${e.t != null ? mmss(e.t) : '—'}</span>${esc(e.text)}</div>`;
        const head = id => `<div class="text-sm font-bold text-slate-900 mt-2">${esc(title(id))} <span class="text-xs font-normal text-slate-500">— في النموذج: ${esc(E().LEVELS[sc(id)] || '')}</span></div>`;
        const ask = id => {
            const L = LOG[id], e = L.find(x => x.neg && x.t != null) || L.find(x => x.neg) || L[0];
            return `<div class="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1 leading-7">${esc(when(e) + ': ' + e.text + '. ' + g('ما الذي دفعك إلى ذلك؟ وما البديل الذي ستجرّبه في الحصة القادمة؟', 'ما الذي دفعكِ إلى ذلك؟ وما البديل الذي ستجرّبينه في الحصة القادمة؟'))}</div>`;
        };
        const praise = id => {
            const e = LOG[id].find(x => x.pos && x.t != null) || LOG[id].find(x => x.pos);
            return `<div class="text-sm text-green-900 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-1 leading-7">${esc(g('أجدتَ ', 'أجدتِ ') + when(e) + ': ' + e.text + '. ' + g('كيف تحافظ على ذلك وتنقله إلى حصصك الأخرى؟', 'كيف تحافظين على ذلك وتنقلينه إلى حصصك الأخرى؟'))}</div>`;
        };
        return `<div class="mt-3 rounded-xl border border-blue-100 p-3">
            <div class="text-[11px] font-bold text-blue-900">أدلّةٌ للنقاش من الحصة — مرتّبةٌ على درجات النموذج الآن</div>
            ${focus.map(id => head(id) + ask(id) + LOG[id].slice(0, 3).map(line).join('')).join('')}
            ${strong.length ? `<div class="text-[11px] font-bold text-green-700 mt-3">للتعزيز</div>` + strong.map(id => head(id) + praise(id)).join('') : ''}
        </div>`;
    }
    // «مؤشّر النجاح» في اتّفاق المداولة من الأهداف المختارة — يقيسه الرصد التالي
    root.svfEyeIndicatorText = function () {
        let d = null;
        try { d = JSON.parse((($('eyeData') || {}).value) || 'null'); } catch (e) { d = null; }
        const T = d && Array.isArray(d.targets) ? d.targets.filter(t => E() && E().METRIC[t.k]) : [];
        return T.length ? pupil(T.map(t => E().targetGoalText(t)).join('؛ ') + ' — تقيسها عين المشرف في الزيارة القادمة') : '';
    };
    // سطورٌ قصيرةٌ للمعلّم في رسالة المداولة (واتساب)
    root.svfEyeTeacherLines = function () {
        let d = null;
        try { d = JSON.parse((($('eyeData') || {}).value) || 'null'); } catch (e) { d = null; }
        if (!d || !d.M || !E()) return '';
        const dp = E().debriefPrompts(d.M, d.counts || {}, ctxOf(d));
        const lines = ['من رصد الحصة:'];
        if (d.summary) lines.push(d.summary);
        dp.good.slice(0, 2).forEach(t => lines.push('✓ ' + t));
        const tg = Array.isArray(d.targets) ? d.targets.filter(t => E().METRIC[t.k]) : [];
        if (tg.length) { lines.push('أهدافنا للزيارة القادمة:'); tg.forEach(t => lines.push('• ' + pupil(E().targetGoalText(t)))); }
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
