// =========================================================================
// دروس دليل المعلّم من ملفّ الدليل — «عين المشرف» (منذ 2026-10-29)
//
// طلب المشرف: «الدليل عندي ملفّ PDF إلكترونيّ — كيف أضيف دروسه؟»، ثمّ: «أيّ نصٍّ يُحوَّل يُحفظ ويُرجع إليه لنفس الدرس،
// لا أحوّل النصّ نفسه في كلّ مرّة». فالمسار:
//   ١) يختار المشرف ملفّ الدليل وصفحات الموضوع — يُقرأ النصّ **في متصفّحه** (vendor/pdfjs) ولا يُرفع الملفّ إلى أيّ مكان؛
//   ٢) يرتّبه Claude بطاقةَ درسٍ بالبنية نفسها التي تقرؤها العين (js/lesson-guide-data.js) — عبر الوسيط (tools/claude-draft)
//      أو بنسخ الطلب ولصق الردّ مجّاناً؛
//   ٣) تُحفظ البطاقة فوراً (مسوّدةً) بمفتاح `supervision_v6_guide_<المعرّف>` ومعها **بصمة النصّ** — فإن اختير النصّ نفسه ثانيةً
//      فُتحت المحفوظة ولم يُرسل شيء؛ ويراجعها المشرف ويعتمدها، فتنضمّ إلى الدليل (SvfLessonGuide.setData) وتتبعه بين أجهزته
//      بالمزامنة السحابيّة (js/cloud.js: بادئة guide).
// الجزء النقيّ (البصمة، الأسطر من pdf.js، الطلب، قراءة الردّ وتسويته) يُصدَّر لـnode — tests/eye.test.js القسم ٣٧.
// =========================================================================
(function (root) {
    'use strict';

    const PREFIX = 'supervision_v6_guide_';
    const FORMS = ['pairs', 'lines', 'free', 'stations', 'game'];
    const PART_KEYS = ['warm', 'fit', 'teach', 'apply', 'close'];
    const MAX_PAGES = 30;
    const MAX_CHARS = 60000;          // ما يُرسل لموضوعٍ واحد — الوسيط يقبل حتّى ٧٠ ألفاً في مهمّة «guide»
    const GENERIC_ASK = ['اشرح', 'اشرحوا', 'وضح', 'وضحوا', 'كيف', 'لماذا', 'ليش', 'قارن', 'ما الفرق', 'وش الفرق', 'متى', 'ما هي', 'ايش'];

    // ── البصمة والتسوية ──
    function hashText(s) {
        let h = 0x811c9dc5;
        for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
        return h.toString(16).padStart(8, '0');
    }
    // أشكال العرض العربيّة (ﻻ ﺍ ﺐ…) ← حروفها بـNFKC، والتطويل يُحذف، والمسافات تُسوّى
    const normText = s => String(s || '').normalize('NFKC').replace(/ـ/g, '').replace(/[ \t ]+/g, ' ')
        .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    // البصمة لا تتأثّر بالتشكيل ولا بتقطيع الأسطر — النصّ نفسه بصمته واحدة
    const textKey = s => hashText(normText(s).replace(/[ً-ْ]/g, '').replace(/\s+/g, ' '));

    // ── أسطر الصفحة من عناصر pdf.js (getTextContent) — من اليمين لليسار في السطر العربيّ ──
    function linesFromItems(items) {
        const rows = [];
        (items || []).forEach(it => {
            if (!it || typeof it.str !== 'string' || !it.transform || !it.str.trim()) return;
            const x = it.transform[4], y = it.transform[5], h = Math.abs(it.height || it.transform[3] || 10) || 10;
            let r = rows.find(q => Math.abs(q.y - y) <= Math.max(2, Math.min(q.h, h) * 0.5));
            if (!r) { r = { y, h, items: [] }; rows.push(r); }
            r.items.push({ x, w: it.width || 0, s: it.str });
        });
        rows.sort((a, b) => b.y - a.y);
        return rows.map(r => {
            const ar = r.items.filter(i => /[؀-ۿﭐ-﻿]/.test(i.s)).length;
            const rtl = ar >= r.items.length / 2;
            r.items.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
            let out = '';
            r.items.forEach((it, i) => {
                if (i) {
                    const p = r.items[i - 1];
                    const gap = rtl ? p.x - (it.x + it.w) : it.x - (p.x + p.w);
                    if (gap > r.h * 0.12 && !/\s$/.test(out) && !/^\s/.test(it.s)) out += ' ';
                }
                out += it.s;
            });
            return out.replace(/\s+/g, ' ').trim();
        }).filter(Boolean);
    }

    // ── الطلب إلى Claude ──
    function buildPrompt(text, meta) {
        const M = meta || {};
        const system = [
            'أنت مساعدٌ لمشرف الرياضة المدرسية في سلطنة عُمان. تحوّل صفحاتٍ من «دليل المعلّم» إلى بطاقة درسٍ منظَّمة يقرؤها برنامجٌ يتابع الحصة.',
            'أجب بكائن JSON واحدٍ صالح فقط — بلا أيّ نصٍّ قبله أو بعده، وبلا علامات ```.',
            'البنية:',
            '{"topic": "اسم الموضوع كما في الدليل", "unit": "", "grade": رقم الصف, "sessions": "عدد الحصص إن ذُكر",',
            ' "match": ["ألفاظ يُعرف بها عنوان الدرس في الخطة الفصلية: اسم الموضوع وأسماء مهاراته المختصرة"],',
            ' "outcomes": ["المخرجات التعليمية"], "concepts": ["المفاهيم"], "tools": ["الأدوات"], "steps": ["خطوات التنفيذ المقترحة"], "note": "",',
            ' "parts": {"warm": د, "fit": د, "teach": د, "apply": د, "close": د} أو null إن لم يحدّد الدليل زمن عناصر الدرس,',
            ' "skills": [{"id": "معرّفٌ لاتينيٌّ قصير", "name": "اسم المهارة", "short": "اسمٌ مختصر", "match": ["ألفاظ اسمها"], "knowledge": false,',
            '   "points": [{"short": "اسمٌ قصير للنقطة", "text": "النقطة الفنية بإيجاز", "cues": ["ألفاظ قد يقولها المعلم وهو يصحّح هذه النقطة بالفصحى واللهجة العمانية"]}],',
            '   "tips": ["توجيهاتٌ للمعلم"]}],',
            ' "drills": [{"id": "d1", "name": "", "skills": ["معرّفات المهارات"], "form": "pairs|lines|free|stations|game", "per": عدد الطلبة لكل كرة أو 0,',
            '   "kind": "teach|apply", "desc": "وصفٌ موجز", "dev": ["تطوير النشاط"]}],',
            ' "adapt": ["تعديل القواعد لقدرات المرحلة إن ذُكر"],',
            ' "assess": [{"short": "", "text": "سؤال التقويم أو نشاطه", "any": ["ألفاظ السؤال: اشرح، قارن، كيف…"], "with": ["ألفاظ موضوعه"]}],',
            ' "assessGame": "", "selfLearning": []}',
            '',
            'القواعد:',
            '- صياغةٌ موجزةٌ بكلماتك لا نقلٌ حرفيٌّ لفقرات الدليل، وبلا تشكيل.',
            '- لا تذكر إلّا ما في النصّ المعطى؛ لا تخترع مهاراتٍ ولا أرقاماً. ما لم يُذكر يُترك فارغاً أو 0 أو null.',
            '- النقاط الفنية مرقّمةٌ في الدليل عادةً تحت كلّ مهارة: انقلها نقطةً نقطة (من ثلاثٍ إلى ستٍّ لكلّ مهارة).',
            '- ألفاظ النقطة (cues) ألفاظ النقطة نفسها (جزء الجسم والحركة)، لا اسم المهارة — من ٤ إلى ١٠ ألفاظ قصيرة.',
            '- المهارة المعرفية (كالقوانين أو المراكز) knowledge: true.',
            '- form: pairs ثنائيات، lines صفوف أو قطارات، free انتشار حر، stations محطات، game مباراة. kind: teach لتدريب المهارة، apply للنشاط التطبيقي والمنافسة.',
            '- id المهارات بحروفٍ لاتينيّة صغيرة بلا مسافات (مثل shoot، pass، dribble).'
        ].join('\n');
        const user = [
            'الصف: ' + (M.grade || 'غير محدّد') + (M.topic ? ' — الموضوع: ' + M.topic : '') + (M.pages ? ' — الصفحات: ' + M.pages : ''),
            '',
            'نصّ صفحات الدليل:',
            String(text || '').slice(0, MAX_CHARS)
        ].join('\n');
        return { system, user, task: 'guide' };
    }
    const promptText = req => req.system + '\n\n———\n\n' + req.user;

    // ── قراءة الردّ وتسويته ──
    function parseReply(text) {
        let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
        const a = t.indexOf('{'), b = t.lastIndexOf('}');
        if (a < 0 || b <= a) return null;
        try { const o = JSON.parse(t.slice(a, b + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; }
    }
    const clean = s => String(s == null ? '' : s).normalize('NFKC').replace(/[ً-ْـ]/g, '').replace(/</g, '‹').replace(/\s+/g, ' ').trim();
    const str = (v, n) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    const arr = (v, n, len) => (Array.isArray(v) ? v : []).map(x => str(x, len)).filter(Boolean).slice(0, n);
    const words = s => Array.from(new Set(clean(s).split(/[\s،,؛.:()\-–]+/).filter(w => w.length >= 3))).slice(0, 8);
    const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };

    function normalizeTopic(raw, meta) {
        const R = raw || {}, M = meta || {};
        const grade = int(R.grade || M.grade, 0, 12) || int(M.grade, 0, 12);
        const topic = str(R.topic || M.topic, 80);
        if (!topic || !grade) return null;
        const used = new Set();
        const skills = (Array.isArray(R.skills) ? R.skills : []).slice(0, 12).map((s, i) => {
            s = s || {};
            let id = String(s.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
            if (!/^[a-zA-Z]/.test(id) || used.has(id)) id = 's' + (i + 1);
            while (used.has(id)) id += 'x';
            used.add(id);
            const name = str(s.name || s.short, 90);
            if (!name) return null;
            const short = str(s.short || name, 40);
            const points = (Array.isArray(s.points) ? s.points : []).slice(0, 8).map(p => {
                p = typeof p === 'string' ? { text: p } : (p || {});
                const text = str(p.text || p.short, 160);
                if (!text) return null;
                const cues = arr(p.cues, 16, 30);
                return { short: str(p.short || text, 34), text, cues: cues.length ? cues : words(text) };
            }).filter(Boolean);
            const match = Array.from(new Set(arr(s.match, 10, 40).concat([short]))).filter(Boolean);
            const out = { id, name, short, match, points };
            if (s.knowledge === true) out.knowledge = true;
            const tips = arr(s.tips, 6, 140);
            if (tips.length) out.tips = tips;
            return out;
        }).filter(Boolean);
        const ids = new Set(skills.map(s => s.id));
        const drills = (Array.isArray(R.drills) ? R.drills : []).slice(0, 20).map((d, i) => {
            d = d || {};
            const name = str(d.name, 90);
            if (!name) return null;
            const sk = (Array.isArray(d.skills) ? d.skills : []).map(x => String(x)).filter(x => ids.has(x));
            const out = { id: 'd' + (i + 1), name, skills: sk.length ? sk : skills.map(s => s.id), form: FORMS.includes(d.form) ? d.form : 'free',
                          per: int(d.per, 0, 12), kind: d.kind === 'apply' ? 'apply' : 'teach', desc: str(d.desc, 400) };
            const dev = arr(d.dev, 6, 120);
            if (dev.length) out.dev = dev;
            const tools = arr(d.tools, 8, 40);
            if (tools.length) out.tools = tools;
            return out;
        }).filter(Boolean);
        const assess = (Array.isArray(R.assess) ? R.assess : []).slice(0, 8).map(q => {
            q = typeof q === 'string' ? { text: q } : (q || {});
            const text = str(q.text || q.short, 220);
            if (!text) return null;
            const any = arr(q.any, 14, 24), wth = arr(q.with, 14, 30);
            return { short: str(q.short || text, 50), text, any: any.length ? any : GENERIC_ASK.slice(), with: wth.length ? wth : words(text) };
        }).filter(Boolean);
        let parts = null;
        if (R.parts && typeof R.parts === 'object') {
            const p = {};
            PART_KEYS.forEach(k => { const v = Number(R.parts[k]); if (v > 0 && v <= 40) p[k] = Math.round(v); });
            if (Object.keys(p).length >= 3) parts = p;
        }
        const out = {
            id: 'u-g' + grade + '-' + (M.hash || hashText(topic)),
            grade, topic, user: true,
            unit: str(R.unit, 80), sessions: str(R.sessions, 20),
            match: Array.from(new Set(arr(R.match, 12, 40).concat([topic]))),
            outcomes: arr(R.outcomes, 12, 160), concepts: arr(R.concepts, 16, 40), tools: arr(R.tools, 20, 40), steps: arr(R.steps, 12, 160),
            note: str(R.note, 300), skills, drills, adapt: arr(R.adapt, 8, 140), assess,
            assessGame: str(R.assessGame, 240), selfLearning: arr(R.selfLearning, 6, 160)
        };
        if (parts) out.parts = parts;
        return out;
    }
    // ما يلزم أن يراه المشرف قبل الاعتماد
    function problems(T) {
        const P = [];
        if (!T) return ['لم تُفهم البطاقة'];
        if (!T.skills.length) P.push('لا مهارات — راجع الصفحات المختارة');
        T.skills.filter(s => !s.knowledge && !s.points.length && !/مباراة|منافس/.test(s.name)).forEach(s => P.push('«' + s.short + '» بلا نقاطٍ فنّيّة'));
        if (!T.drills.length) P.push('لا تدريبات');
        if (!T.assess.length) P.push('لا أسئلة تقويم');
        return P;
    }

    // ── الحفظ ──
    const store = () => { try { return root.localStorage || null; } catch (e) { return null; } };
    function list() {
        const ls = store(), out = [];
        if (!ls) return out;
        try {
            for (let i = 0; i < ls.length; i++) {
                const k = ls.key(i);
                if (!k || k.indexOf(PREFIX) !== 0) continue;
                try { const r = JSON.parse(ls.getItem(k)); if (r && r.topic && r.topic.id) out.push(Object.assign({ key: k }, r)); } catch (e) { /* معطوبة تُترك */ }
            }
        } catch (e) { /* لا تخزين */ }
        return out.sort((a, b) => (a.topic.grade - b.topic.grade) || String(a.topic.topic).localeCompare(String(b.topic.topic), 'ar'));
    }
    const byHash = h => list().find(r => r.src && r.src.hash === h) || null;
    function save(rec) {
        const ls = store();
        if (!ls || !rec || !rec.topic) return null;
        const key = PREFIX + rec.topic.id;
        const data = Object.assign({}, rec, { v: 1, updatedAt: Date.now() });
        delete data.key;
        if (!data.createdAt) data.createdAt = data.updatedAt;
        try { ls.setItem(key, JSON.stringify(data)); } catch (e) { return null; }
        try { if (root.SupervisorCloud && root.SupervisorCloud.push) root.SupervisorCloud.push(key); } catch (e) { /* محفوظةٌ محلّيّاً */ }
        return key;
    }
    function remove(key) {
        const ls = store();
        if (!ls || !key || key.indexOf(PREFIX) !== 0) return false;
        const snap = ls.getItem(key);
        try { ls.removeItem(key); } catch (e) { return false; }
        try { if (root.SupervisorCloud && root.SupervisorCloud.remove) root.SupervisorCloud.remove(key, snap); } catch (e) {}
        return true;
    }
    // المعتمَد يُضمّ إلى الدليل المضمَّن (ويحلّ محلّه إن حمل معرّفه)
    function apply() {
        const LG = root.SvfLessonGuide;
        if (!LG || !LG.setData) return 0;
        const base = (root.SVF_LESSON_GUIDE && root.SVF_LESSON_GUIDE.topics) || [];
        const mine = list().filter(r => r.status === 'ok').map(r => r.topic);
        const ids = new Set(mine.map(t => t.id));
        LG.setData({ version: 1, topics: base.filter(t => !ids.has(t.id)).concat(mine) });
        try { root.document && root.document.dispatchEvent(new CustomEvent('svf-guides-changed')); } catch (e) {}
        return mine.length;
    }

    // =====================================================================
    // الواجهة (المتصفّح وحده)
    // =====================================================================
    const $ = id => root.document && root.document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const GRADES = { 1: 'الأول', 2: 'الثاني', 3: 'الثالث', 4: 'الرابع', 5: 'الخامس', 6: 'السادس', 7: 'السابع', 8: 'الثامن', 9: 'التاسع', 10: 'العاشر', 11: 'الحادي عشر', 12: 'الثاني عشر' };
    const FORM_AR = { pairs: 'ثنائيات', lines: 'صفوف وقطارات', free: 'انتشار حرّ', stations: 'محطّات', game: 'مباراة' };
    const PART_AR = { warm: 'الإحماء', fit: 'الإعداد البدني', teach: 'التعليميّة', apply: 'التطبيقيّة', close: 'الختام' };
    const U = { pdf: null, file: '', pages: 0, rec: null, busy: false };

    function formGrade() {
        try { const c = $('class'); return c && root.SvfTermPlan ? root.SvfTermPlan.parseGrade(c.value) || 0 : 0; } catch (e) { return 0; }
    }
    function linked() {
        const u = $('eyeDraftUrl'), k = $('eyeDraftKey');
        return !!(u && k && /^https:\/\/\S+$/.test(u.value.trim()) && k.value.trim());
    }
    function modal() {
        let m = $('svfGuideModal');
        if (m) return m;
        m = root.document.createElement('div');
        m.id = 'svfGuideModal';
        m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'دروس دليل المعلّم');
        m.style.cssText = 'position:fixed;inset:0;z-index:80;background:rgba(8,39,66,.45);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
        m.innerHTML = '<div id="sgiBox" dir="rtl" style="background:#fff;max-width:880px;width:100%;border-radius:16px;box-shadow:0 20px 50px rgba(8,39,66,.3)" class="p-4 sm:p-6 my-4"></div>';
        m.addEventListener('click', e => { if (e.target === m) close(); });
        root.document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('svfGuideModal') && $('svfGuideModal').style.display !== 'none') close(); });
        root.document.body.appendChild(m);
        m.querySelector('#sgiBox').addEventListener('click', onClick);
        m.querySelector('#sgiBox').addEventListener('change', onChange);
        return m;
    }
    // الإظهار بـstyle.display: النافذة تحمل display:flex مضمَّناً فلا يُخفيها صنف «hidden»
    function open() { modal().style.display = 'flex'; U.rec = null; renderHome(); }
    function close() { const m = $('svfGuideModal'); if (m) m.style.display = 'none'; }
    function msg(text, tone) {
        const el = $('sgiMsg');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'text-sm mt-2 rounded-lg border px-3 py-2 leading-6 ' + (!text ? 'hidden' : tone === 'bad' ? 'bg-red-50 border-red-200 text-red-800' : tone === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-slate-50 border-slate-200 text-slate-700');
    }
    const when = ms => { try { return new Date(ms).toLocaleDateString('ar-OM-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };

    function renderHome() {
        const box = $('sgiBox');
        const recs = list();
        const g = formGrade();
        box.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div><h2 class="text-lg font-bold text-slate-900">دروس دليل المعلّم</h2>
                    <p class="text-xs text-slate-500 mt-1 leading-5">يُقرأ ملفّ الدليل في جهازك ولا يُرفع. ما يُحوَّل مرّةً يُحفظ ويتبعك بين أجهزتك، ولا يُحوَّل ثانيةً.</p></div>
                <button type="button" data-sgi="close" class="svf-btn svf-btn-ghost svf-btn-sm" aria-label="إغلاق">إغلاق</button>
            </div>
            <section class="mt-4">
                <h3 class="text-sm font-bold text-slate-900">المحفوظة (${recs.length})</h3>
                ${recs.length ? `<ul class="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-xl">${recs.map(r => `<li class="px-3 py-2 flex flex-wrap items-center gap-2">
                    <span class="flex-1 min-w-0 text-sm"><b class="text-slate-900">${esc(r.topic.topic)}</b> <span class="text-slate-500">· الصف ${esc(GRADES[r.topic.grade] || r.topic.grade)} · ${r.topic.skills.length} مهارات</span>
                        <span class="block text-[11px] text-slate-500">${r.status === 'ok' ? 'معتمَدة' : '<b class="text-amber-800">مسوّدة — لم تُعتمد</b>'}${r.src && r.src.file ? ' · ' + esc(r.src.file) : ''}${r.src && r.src.pages ? ' ص ' + esc(r.src.pages) : ''} · ${esc(when(r.updatedAt))}</span></span>
                    <button type="button" data-sgi="edit" data-key="${esc(r.key)}" class="svf-btn svf-btn-secondary svf-btn-sm">${r.status === 'ok' ? 'عرض وتعديل' : 'مراجعة واعتماد'}</button>
                    <button type="button" data-sgi="del" data-key="${esc(r.key)}" class="svf-btn svf-btn-ghost svf-btn-sm">حذف</button></li>`).join('')}</ul>`
                    : '<p class="text-sm text-slate-600 mt-1">لا دروس بعد. الدليل المضمَّن: كرة القدم للصف الثامن (نموذجٌ تجريبيّ).</p>'}
            </section>
            <section class="mt-5 border-t border-slate-200 pt-4">
                <h3 class="text-sm font-bold text-slate-900">إضافة درس من ملفّ الدليل</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    <label class="text-sm text-slate-700 sm:col-span-2">ملفّ الدليل (PDF)
                        <input type="file" id="sgiFile" accept="application/pdf,.pdf" class="block w-full mt-1 text-sm"></label>
                    <p id="sgiFileInfo" class="text-xs text-slate-500 sm:col-span-2">${U.pdf ? esc(U.file) + ' — ' + U.pages + ' صفحة' : 'اختر الملفّ ثمّ أرقام صفحات الموضوع كما تظهر في عارض الـPDF.'}</p>
                    <div class="flex items-end gap-2">
                        <label class="text-sm text-slate-700 flex-1">من صفحة<input type="number" id="sgiFrom" min="1" class="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5"></label>
                        <label class="text-sm text-slate-700 flex-1">إلى صفحة<input type="number" id="sgiTo" min="1" class="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5"></label>
                    </div>
                    <div class="flex items-end gap-2">
                        <label class="text-sm text-slate-700 flex-1">الصف<select id="sgiGrade" class="w-full mt-1 bg-white border border-slate-300 rounded-lg px-2 py-1.5">
                            <option value="">—</option>${Object.keys(GRADES).map(n => `<option value="${n}"${+n === g ? ' selected' : ''}>${GRADES[n]}</option>`).join('')}</select></label>
                        <label class="text-sm text-slate-700 flex-[2]">الموضوع (اختياريّ)<input type="text" id="sgiTopic" placeholder="مثل: لعبة كرة السلة" class="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5"></label>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2 mt-3"><button type="button" data-sgi="extract" class="svf-btn svf-btn-secondary"${U.pdf ? '' : ' disabled'}>استخراج نصّ الصفحات</button></div>
                <label class="block text-sm text-slate-700 mt-3">نصّ الصفحات — يمكنك تعديله أو لصق نصٍّ نسخته من الدليل بنفسك
                    <textarea id="sgiText" rows="8" class="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm leading-6" placeholder="يظهر النصّ هنا بعد الاستخراج"></textarea></label>
                <p id="sgiCount" class="text-xs text-slate-500 mt-1"></p>
                <div class="flex flex-wrap items-center gap-2 mt-3">
                    <button type="button" data-sgi="claude" class="svf-btn svf-btn-primary"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>رتّبها بمساعد Claude</button>
                    <button type="button" data-sgi="copy" class="svf-btn svf-btn-ghost svf-btn-sm">نسخ الطلب لـClaude</button>
                    <button type="button" data-sgi="pasteToggle" class="svf-btn svf-btn-ghost svf-btn-sm">الصق ردّ Claude</button>
                </div>
                <div id="sgiPasteBox" class="hidden mt-2">
                    <textarea id="sgiPaste" rows="5" class="w-full border border-slate-300 rounded-lg p-2 text-sm" dir="ltr" placeholder="الصق ردّ Claude كاملاً (JSON)"></textarea>
                    <button type="button" data-sgi="read" class="svf-btn svf-btn-secondary svf-btn-sm mt-1">قراءة الردّ</button>
                </div>
                <p class="text-[11px] text-slate-500 mt-2 leading-5">${linked() ? 'مساعد Claude مربوط: يُرسَل نصّ الصفحات وحده (لا الملفّ)، والتكلفة من رصيدك نحو عشرة سنتات للموضوع، مرّةً واحدة.' : 'مساعد Claude غير مربوطٍ على هذا الجهاز (الإعدادات ← مساعد الصياغة) — استعمل «نسخ الطلب» ثمّ «الصق ردّ Claude».'}</p>
            </section>
            <p id="sgiMsg" class="hidden"></p>`;
        countText();
    }
    function countText() {
        const t = $('sgiText'), c = $('sgiCount');
        if (!t || !c) return;
        const v = t.value.trim();
        if (!v) { c.textContent = ''; return; }
        const h = textKey(v), saved = byHash(h);
        c.innerHTML = esc(v.length.toLocaleString('en') + ' حرفاً' + (v.length > MAX_CHARS ? ' — أطول من المسموح (' + MAX_CHARS.toLocaleString('en') + ')، قلّل الصفحات' : ''))
            + (saved ? ` · <b class="text-green-800">حُوّل هذا النصّ من قبل: «${esc(saved.topic.topic)}» — لن يُرسل ثانيةً</b> <button type="button" data-sgi="edit" data-key="${esc(saved.key)}" class="underline text-blue-800">افتحها</button>` : '');
    }

    async function loadPdf(file) {
        msg('يُفتح الملفّ…');
        try {
            const base = new URL('vendor/pdfjs/', root.document.baseURI).href;
            const lib = await import(base + 'pdf.min.mjs');
            lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
            const buf = await file.arrayBuffer();
            U.pdf = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
            U.file = file.name.slice(0, 80); U.pages = U.pdf.numPages;
            $('sgiFileInfo').textContent = U.file + ' — ' + U.pages + ' صفحة';
            const ex = root.document.querySelector('#sgiBox [data-sgi="extract"]');
            if (ex) ex.disabled = false;
            msg('');
        } catch (e) {
            U.pdf = null;
            msg('تعذّر فتح الملفّ: ' + (e && e.message ? e.message : e), 'bad');
        }
    }
    async function extract() {
        if (!U.pdf) return;
        const a = int($('sgiFrom').value, 1, U.pages), b = int($('sgiTo').value || $('sgiFrom').value, 1, U.pages);
        if (!a || !b || b < a) { msg('اكتب رقمَي الصفحتين (من ≤ إلى).', 'bad'); return; }
        if (b - a + 1 > MAX_PAGES) { msg('حتّى ' + MAX_PAGES + ' صفحة في المرّة — الموضوع الواحد يكفي.', 'bad'); return; }
        msg('يُستخرج النصّ من ' + (b - a + 1) + ' صفحة…');
        const parts = [];
        let empty = 0;
        for (let p = a; p <= b; p++) {
            const page = await U.pdf.getPage(p);
            const tc = await page.getTextContent();
            const lines = linesFromItems(tc.items);
            if (!lines.join('').trim()) empty++;
            parts.push('— صفحة ' + p + ' —\n' + lines.join('\n'));
        }
        U.pageRange = a + '–' + b;
        $('sgiText').value = normText(parts.join('\n\n'));
        countText();
        if (empty === b - a + 1) msg('لم يُعثر على نصٍّ في هذه الصفحات — يبدو الملفّ صوراً ممسوحة. انسخ النصّ من عارضٍ يقرأ الصور أو اكتب النقاط الأساسيّة بنفسك هنا.', 'bad');
        else msg(empty ? '(' + empty + ') صفحة بلا نصّ (صور) — والباقي استُخرج. راجعه قبل الإرسال.' : 'استُخرج النصّ. راجعه سريعاً — إن ظهرت الكلمات مقلوبة أخبر المطوّر.', empty ? 'bad' : 'ok');
    }
    function meta() {
        const t = $('sgiText').value.trim();
        return { grade: int($('sgiGrade').value, 0, 12), topic: str($('sgiTopic').value, 80), pages: U.pageRange || '', hash: textKey(t), file: U.file || '' };
    }
    function guardText() {
        const t = $('sgiText').value.trim();
        if (t.length < 200) { msg('النصّ قصيرٌ جدّاً — استخرج صفحات الموضوع أو الصقها.', 'bad'); return null; }
        if (t.length > MAX_CHARS) { msg('النصّ أطول من المسموح — قلّل الصفحات.', 'bad'); return null; }
        const saved = byHash(textKey(t));
        if (saved) { review(saved); msg('هذا النصّ حُوّل من قبل — فُتحت بطاقته المحفوظة ولم يُرسل شيء.', 'ok'); return null; }
        return t;
    }
    // ردّ Claude ← بطاقةٌ تُحفظ مسوّدةً فوراً (فلا يضيع ما دُفع ثمنه وإن أُغلقت النافذة) ثمّ تُراجَع
    function accept(raw, M, text) {
        const T = normalizeTopic(raw, M);
        if (!T) { msg('لم تُفهم البطاقة: يلزم اسم الموضوع والصف.', 'bad'); return; }
        const rec = { status: 'draft', topic: T, src: { hash: M.hash, file: M.file, pages: M.pages, chars: (text || '').length } };
        const key = save(rec);
        if (!key) { msg('تعذّر الحفظ في هذا الجهاز (التخزين ممتلئ؟).', 'bad'); return; }
        review(Object.assign({ key }, rec));
    }
    async function runClaude() {
        if (U.busy) return;
        const text = guardText();
        if (!text) return;
        const M = meta();
        if (!M.grade) { msg('اختر الصف.', 'bad'); return; }
        if (!linked()) { msg('مساعد Claude غير مربوطٍ على هذا الجهاز — استعمل «نسخ الطلب» ثمّ «الصق ردّ Claude».', 'bad'); return; }
        U.busy = true;
        const btn = root.document.querySelector('#sgiBox [data-sgi="claude"]');
        if (btn) btn.disabled = true;
        msg('يرتّب Claude الدرس… قد يستغرق دقيقةً أو اثنتين لموضوعٍ طويل.');
        try {
            const r = await fetch($('eyeDraftUrl').value.trim(), { method: 'POST', headers: { 'content-type': 'application/json', 'x-svf-key': $('eyeDraftKey').value.trim() }, body: JSON.stringify(buildPrompt(text, M)) });
            let j = {};
            try { j = await r.json(); } catch (e) { j = {}; }
            if (!r.ok) throw new Error(j.error || ('رمز ' + r.status));
            const raw = parseReply(j.text);
            if (!raw) throw new Error(j.stop === 'max_tokens' ? 'الردّ انقطع لطوله — قلّل الصفحات (مهارات أقلّ في المرّة)' : 'لم تُفهم صيغة الردّ');
            accept(raw, M, text);
        } catch (e) {
            msg('تعذّر الترتيب: ' + (e && e.message ? e.message : e) + (root.navigator && root.navigator.onLine === false ? ' — لا اتّصال بالإنترنت.' : ''), 'bad');
        } finally {
            U.busy = false;
            if (btn) btn.disabled = false;
        }
    }
    function copyPrompt() {
        const text = guardText();
        if (!text) return;
        const M = meta();
        if (!M.grade) { msg('اختر الصف.', 'bad'); return; }
        const p = promptText(buildPrompt(text, M));
        let ok = false;
        try {
            const ta = root.document.createElement('textarea');
            ta.value = p; ta.style.position = 'fixed'; ta.style.opacity = '0';
            root.document.body.appendChild(ta); ta.select(); ok = root.document.execCommand('copy'); ta.remove();
        } catch (e) { ok = false; }
        if (!ok && root.navigator.clipboard) root.navigator.clipboard.writeText(p).catch(() => {});
        try { root.open('https://claude.ai/new', '_blank', 'noopener'); } catch (e) {}
        $('sgiPasteBox').classList.remove('hidden');
        msg('نُسخ الطلب. الصقه في Claude، ثمّ انسخ ردّه كاملاً والصقه هنا.', 'ok');
    }
    function readPasted() {
        const text = $('sgiText').value.trim();
        const raw = parseReply($('sgiPaste').value);
        if (!raw) { msg('لم يُفهم الردّ الملصوق — يلزم كائن JSON كما أعاده Claude.', 'bad'); return; }
        const M = meta();
        if (!M.grade && !raw.grade) { msg('اختر الصف.', 'bad'); return; }
        accept(raw, M, text);
    }

    // ── المراجعة والتعديل ──
    function review(rec) {
        U.rec = JSON.parse(JSON.stringify(rec));
        const T = U.rec.topic, box = $('sgiBox');
        const P = problems(T);
        const opt = (v, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(FORM_AR[v])}</option>`;
        box.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div><h2 class="text-lg font-bold text-slate-900">مراجعة بطاقة الدرس</h2>
                    <p class="text-xs text-slate-500 mt-1">${U.rec.status === 'ok' ? 'معتمَدة' : 'مسوّدة محفوظة — لا تستعملها العين حتّى تعتمدها'}${U.rec.src && U.rec.src.pages ? ' · من الصفحات ' + esc(U.rec.src.pages) : ''}</p></div>
                <button type="button" data-sgi="home" class="svf-btn svf-btn-ghost svf-btn-sm">رجوع</button>
            </div>
            ${P.length ? `<p class="text-sm mt-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 leading-6">${esc(P.join(' · '))}</p>` : ''}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <label class="text-sm text-slate-700 sm:col-span-2">الموضوع<input data-f="topic" value="${esc(T.topic)}" class="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5"></label>
                <label class="text-sm text-slate-700">الصف<select data-f="grade" class="w-full mt-1 bg-white border border-slate-300 rounded-lg px-2 py-1.5">${Object.keys(GRADES).map(n => `<option value="${n}"${+n === T.grade ? ' selected' : ''}>${GRADES[n]}</option>`).join('')}</select></label>
                <label class="text-sm text-slate-700 sm:col-span-3">ألفاظ يُعرف بها الدرس في عنوانه (بفواصل)<input data-f="match" value="${esc(T.match.join('، '))}" class="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5"></label>
            </div>
            <h3 class="text-sm font-bold text-slate-900 mt-4">المهارات ونقاطها الفنّيّة <span class="font-normal text-xs text-slate-500">— نقطةٌ في كلّ سطر</span></h3>
            <div class="space-y-3 mt-2">${T.skills.map((s, i) => `<div class="rounded-xl border border-slate-200 p-3" data-skill="${i}">
                <div class="flex flex-wrap items-center gap-2">
                    <input data-s="name" value="${esc(s.name)}" class="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold">
                    <label class="text-xs text-slate-600 flex items-center gap-1"><input type="checkbox" data-s="knowledge" class="w-4 h-4"${s.knowledge ? ' checked' : ''}> معرفيّة</label>
                    <label class="text-xs text-red-700 flex items-center gap-1"><input type="checkbox" data-s="drop" class="w-4 h-4"> حذف</label>
                </div>
                <textarea data-s="points" rows="${Math.max(2, s.points.length)}" class="w-full mt-2 border border-slate-300 rounded-lg p-2 text-sm leading-6">${esc(s.points.map(p => p.text).join('\n'))}</textarea></div>`).join('')}</div>
            <h3 class="text-sm font-bold text-slate-900 mt-4">التدريبات والأنشطة</h3>
            <div class="space-y-2 mt-2">${T.drills.map((d, i) => `<div class="rounded-xl border border-slate-200 p-3" data-drill="${i}">
                <div class="flex flex-wrap items-center gap-2">
                    <input data-d="name" value="${esc(d.name)}" class="flex-1 min-w-[12rem] border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold">
                    <select data-d="form" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm">${FORMS.map(f => opt(f, d.form)).join('')}</select>
                    <select data-d="kind" class="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-sm"><option value="teach"${d.kind === 'teach' ? ' selected' : ''}>تدريبٌ للمهارة</option><option value="apply"${d.kind === 'apply' ? ' selected' : ''}>نشاطٌ تطبيقيّ</option></select>
                    <label class="text-xs text-slate-600 flex items-center gap-1">طلبة لكلّ كرة<input type="number" data-d="per" min="0" max="12" value="${d.per}" class="w-14 border border-slate-300 rounded-lg px-1 py-1 text-center"></label>
                    <label class="text-xs text-red-700 flex items-center gap-1"><input type="checkbox" data-d="drop" class="w-4 h-4"> حذف</label>
                </div>
                <textarea data-d="desc" rows="2" class="w-full mt-2 border border-slate-300 rounded-lg p-2 text-sm leading-6">${esc(d.desc)}</textarea></div>`).join('') || '<p class="text-sm text-slate-500">لا تدريبات.</p>'}</div>
            <label class="block text-sm font-bold text-slate-900 mt-4">أسئلة التقويم <span class="font-normal text-xs text-slate-500">— سؤالٌ في كلّ سطر</span>
                <textarea data-f="assess" rows="${Math.max(2, T.assess.length)}" class="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm font-normal leading-6">${esc(T.assess.map(q => q.text).join('\n'))}</textarea></label>
            <div class="mt-4"><div class="text-sm font-bold text-slate-900">زمن عناصر الدرس في الدليل (دقائق) <span class="font-normal text-xs text-slate-500">— اتركه فارغاً إن لم يحدّده الدليل</span></div>
                <div class="grid grid-cols-5 gap-2 mt-1">${PART_KEYS.map(k => `<label class="text-xs text-slate-600">${PART_AR[k]}<input type="number" min="0" max="40" data-part="${k}" value="${T.parts && T.parts[k] ? T.parts[k] : ''}" class="w-full mt-0.5 border border-slate-300 rounded-lg px-1 py-1 text-center"></label>`).join('')}</div></div>
            <div class="flex flex-wrap items-center gap-2 mt-5">
                <button type="button" data-sgi="approve" class="svf-btn svf-btn-primary"><i class="fa-solid fa-check" aria-hidden="true"></i>${U.rec.status === 'ok' ? 'حفظ التعديلات' : 'اعتماد واستعمالها في العين'}</button>
                <button type="button" data-sgi="saveDraft" class="svf-btn svf-btn-secondary">حفظ مسوّدة</button>
                <span class="flex-1"></span>
                <button type="button" data-sgi="home" class="svf-btn svf-btn-ghost">رجوع</button>
            </div>
            <p id="sgiMsg" class="hidden"></p>`;
    }
    // النموذج ← البطاقة: النقطة التي لم يتغيّر نصّها تبقى بألفاظها، والجديدة تُشتقّ ألفاظها من كلماتها
    function fromForm() {
        const T = JSON.parse(JSON.stringify(U.rec.topic)), box = $('sgiBox');
        const f = k => box.querySelector('[data-f="' + k + '"]');
        T.topic = str(f('topic').value, 80) || T.topic;
        T.grade = int(f('grade').value, 1, 12) || T.grade;
        T.match = Array.from(new Set(f('match').value.split(/[،,]/).map(x => str(x, 40)).filter(Boolean).concat([T.topic])));
        T.skills = T.skills.map((s, i) => {
            const el = box.querySelector('[data-skill="' + i + '"]');
            if (!el || el.querySelector('[data-s="drop"]').checked) return null;
            const old = {};
            s.points.forEach(p => { old[p.text] = p; });
            const name = str(el.querySelector('[data-s="name"]').value, 90) || s.name;
            const pts = el.querySelector('[data-s="points"]').value.split('\n').map(x => str(x, 160)).filter(Boolean).slice(0, 8)
                .map(t => old[t] || { short: str(t, 34), text: t, cues: words(t) });
            const out = Object.assign({}, s, { name, points: pts });
            if (name !== s.name) { out.short = str(name, 40); out.match = Array.from(new Set(s.match.concat([out.short]))); }
            if (el.querySelector('[data-s="knowledge"]').checked) out.knowledge = true; else delete out.knowledge;
            return out;
        }).filter(Boolean);
        const ids = new Set(T.skills.map(s => s.id));
        T.drills = T.drills.map((d, i) => {
            const el = box.querySelector('[data-drill="' + i + '"]');
            if (!el || el.querySelector('[data-d="drop"]').checked) return null;
            const q = k => el.querySelector('[data-d="' + k + '"]');
            const sk = d.skills.filter(x => ids.has(x));
            return Object.assign({}, d, { name: str(q('name').value, 90) || d.name, form: FORMS.includes(q('form').value) ? q('form').value : d.form,
                kind: q('kind').value === 'apply' ? 'apply' : 'teach', per: int(q('per').value, 0, 12), desc: str(q('desc').value, 400),
                skills: sk.length ? sk : Array.from(ids) });
        }).filter(Boolean);
        const oldQ = {};
        T.assess.forEach(q => { oldQ[q.text] = q; });
        T.assess = f('assess').value.split('\n').map(x => str(x, 220)).filter(Boolean).slice(0, 8)
            .map(t => oldQ[t] || { short: str(t, 50), text: t, any: GENERIC_ASK.slice(), with: words(t) });
        const parts = {};
        box.querySelectorAll('[data-part]').forEach(el => { const v = Number(el.value); if (v > 0 && v <= 40) parts[el.dataset.part] = Math.round(v); });
        if (Object.keys(parts).length >= 3) T.parts = parts; else delete T.parts;
        return T;
    }
    function store2(status) {
        const T = fromForm();
        if (!T.skills.length) { msg('يلزم مهارةٌ واحدةٌ على الأقلّ.', 'bad'); return; }
        const oldKey = U.rec.key;
        const rec = { status, topic: T, src: U.rec.src || {}, createdAt: U.rec.createdAt };
        // تغيّر الصفّ يغيّر المعرّف — تُحذف القديمة لئلّا تبقى بطاقتان
        T.id = T.id.replace(/^u-g\d+-/, 'u-g' + T.grade + '-');
        const key = save(rec);
        if (!key) { msg('تعذّر الحفظ.', 'bad'); return; }
        if (oldKey && oldKey !== key) remove(oldKey);
        U.rec = Object.assign({ key }, rec);
        apply();
        if (status === 'ok') { renderHome(); msg('اعتُمدت «' + T.topic + '» — تظهر في «دليل المعلّم» حين يطابق الصفّ وعنوان الدرس.', 'ok'); }
        else msg('حُفظت مسوّدةً.', 'ok');
    }

    function onClick(e) {
        const b = e.target.closest && e.target.closest('[data-sgi]');
        if (!b) return;
        const a = b.dataset.sgi;
        if (a === 'close') close();
        else if (a === 'home') { U.rec = null; renderHome(); }
        else if (a === 'extract') extract().catch(err => msg('تعذّر الاستخراج: ' + (err && err.message ? err.message : err), 'bad'));
        else if (a === 'claude') runClaude();
        else if (a === 'copy') copyPrompt();
        else if (a === 'pasteToggle') $('sgiPasteBox').classList.toggle('hidden');
        else if (a === 'read') readPasted();
        else if (a === 'edit') { const r = list().find(x => x.key === b.dataset.key); if (r) review(r); }
        else if (a === 'del') {
            const r = list().find(x => x.key === b.dataset.key);
            if (r && root.confirm('حذف «' + r.topic.topic + '»؟ تُحذف من أجهزتك كلّها، ويلزم تحويلها من جديد إن احتجتها.')) { remove(r.key); apply(); renderHome(); }
        } else if (a === 'approve') store2('ok');
        else if (a === 'saveDraft') store2(U.rec && U.rec.status === 'ok' ? 'ok' : 'draft');
    }
    function onChange(e) {
        if (e.target.id === 'sgiFile' && e.target.files && e.target.files[0]) loadPdf(e.target.files[0]);
    }
    if (root.document) {
        root.document.addEventListener('input', e => { if (e.target && e.target.id === 'sgiText') countText(); });
        root.document.addEventListener('svf-cloud-changed', () => apply());
        const boot = () => apply();
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot); else boot();
    }

    const api = { PREFIX, FORMS, MAX_CHARS, MAX_PAGES, hashText, normText, textKey, linesFromItems, buildPrompt, promptText, parseReply,
                  normalizeTopic, problems, list, byHash, save, remove, apply, open, close };
    root.SvfGuideImport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
