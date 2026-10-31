/* مساعد الصياغة — «عين المشرف» (2026-10-29)
 *
 * يحوّل مستويات البنود وأدلّة الحصة إلى صياغة الوزارة لثلاث خانات: جوانب الإجادة، والجوانب التي تحتاج إلى تطوير، والتوصيات.
 * الصياغة يكتبها Claude بأحد طريقين (eye.js): ربطٌ مباشر عبر وسيطٍ صغيرٍ يحفظ المفتاح (tools/claude-draft/)، أو نسخ الطلب ولصقه
 * في Claude يدويّاً ثمّ لصق الردّ هنا — والطريقان يمرّان بالدالّتين نفسيهما: build ← الطلب، وparse ← الخانات الثلاث.
 *
 * ما يُرسَل: الصفّ وعنوان الدرس وجنس المعلّم (لا اسمه ولا مدرسته)، ولكلّ بندٍ مستواه وجملة مستواه الرسميّة وعبارات الأدلّة.
 * **لا يُرسَل كلام المعلّم بنصّه ولا ملاحظات المشرف** (قد تحمل أسماء طلبة) — تُرسَل عبارة الدليل الرسميّة وحدها لما مصدره الكلام والعلامات.
 * والنتيجة معاينةٌ يعدّلها المشرف ويعتمدها بنفسه قبل أن تدخل الاستمارة.
 *
 * نقيّ بلا DOM، يُصدَّر لـnode (tests/eye.test.js القسم ٣١).
 */
(function (root) {
    'use strict';

    const LEVELS = { 1: 'متميز', 2: 'جيد', 3: 'ملائم', 4: 'غير ملائم', 5: 'تدخل سريع' };
    // الخانات الثلاث بعناوينها كما في الاستمارة — الردّ يُقسَّم عليها
    const FIELDS = [
        { k: 'strengths', head: 'جوانب الإجادة' },
        { k: 'developments', head: 'الجوانب التي تحتاج إلى تطوير' },
        { k: 'recs', head: 'التوصيات' }
    ];
    const MAX_FIELD = 900;          // حدّ كلّ خانةٍ في الطلب — خانات البوّابة ١٠٠٠ حرف (السكربت يتوقّف ولا يقصّ)
    const NO_TEXT_SRC = { speech: 1, mark: 1 };   // مصدرٌ قد يحمل أسماء: تُرسَل عبارته الرسميّة وحدها

    const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) : s; };

    // input: {female, lower, cls, topic, summary, items: [{id, standard, title, score, level, ev: [{src, text, pos, neg}]}]}
    function build(input) {
        const I = input || {}, f = !!I.female;
        const T = f ? 'المعلمة' : 'المعلم', P = I.lower ? 'التلاميذ' : 'الطلبة';
        const system = [
            'أنت مساعدٌ لمشرف الرياضة المدرسية في وزارة التعليم بسلطنة عُمان، تصوغ نصوص «استمارة زيارة إشرافية لمعلم مجال/ مادة» الرسميّة.',
            'اكتب ثلاثة أقسامٍ فقط، كلّ عنوانٍ في سطرٍ وحده كما هو حرفيّاً:',
            'جوانب الإجادة:',
            'الجوانب التي تحتاج إلى تطوير:',
            'التوصيات:',
            '',
            'القواعد:',
            '- جوانب الإجادة من البنود بمستوى «متميز» أو «جيد» (وإن لم يوجد فأقوى بنود «ملائم» ذات الأدلّة الموجبة)، أربع نقاطٍ على الأكثر.',
            '- الجوانب التي تحتاج إلى تطوير من البنود بمستوى «غير ملائم» أو «تدخل سريع» (وإن لم يوجد فبنود «ملائم» ذات الأدلّة السالبة)، أربع نقاطٍ على الأكثر.',
            '- كلّ نقطةٍ سطرٌ يبدأ بـ«• » ثمّ اسم المعيار ثمّ نقطتان ثمّ جملةٌ رسميّة مبنيّة على جملة المستوى وأدلّة الحصة: «• إدارة الصف: …».',
            '- التوصيات تبدأ بسطر «نوصي ' + T + ' بالآتي:» ثمّ من نقطتين إلى خمس بالشكل نفسه، كلّ توصيةٍ إجراءٌ محدّدٌ قابلٌ للتنفيذ والقياس في الزيارة القادمة، وتنتهي بسطر «والله ولي التوفيق.».',
            '- لا تذكر إلّا ما في الأدلّة المعطاة؛ لا تخترع أرقاماً ولا مواقف ولا أسماء. والأرقام كما وردت بين قوسين.',
            '- خاطب عن ' + T + ' بصيغة ' + (f ? 'المؤنّث' : 'المذكّر') + ' في الأفعال والضمائر، واكتب «' + P + '» لا غيرها.',
            '- عربيّةٌ فصحى رسميّة موجزة، بلا تشكيل، بلا رموزٍ تعبيريّة، بلا تنسيق ماركداون (لا ** ولا #)، وبلا الرمز <.',
            '- لا تذكر الكاميرا ولا التطبيق ولا الذكاء الاصطناعيّ ولا «عين المشرف».',
            '- لا يتجاوز كلّ قسمٍ ' + MAX_FIELD + ' حرف.',
            '- لا تكتب شيئاً قبل العنوان الأوّل ولا بعد «والله ولي التوفيق.».'
        ].join('\n');
        const rows = (I.items || []).filter(it => it && it.score >= 1 && it.score <= 5).map(it => {
            const ev = (it.ev || []).map(e => {
                const ph = it.score >= 4 ? e.neg : e.pos;
                const fact = NO_TEXT_SRC[e.src] ? '' : clip(e.text, 140);
                return ph || fact ? '  - ' + [ph, fact && fact !== ph ? '(' + fact + ')' : ''].filter(Boolean).join(' ') : '';
            }).filter(Boolean);
            const uniq = Array.from(new Set(ev)).slice(0, 6);
            return '[' + it.id + '] ' + clip(it.standard, 60) + ' — ' + clip(it.title, 120) + ' — المستوى: ' + LEVELS[it.score]
                + (it.level ? '\n  جملة المستوى: ' + clip(it.level, 260) : '')
                + (uniq.length ? '\n  أدلّة الحصة:\n' + uniq.join('\n') : '\n  (لا أدلّة من الحصة)');
        });
        const user = [
            'بيانات الزيارة:',
            '- ' + (f ? 'معلمة' : 'معلم') + (I.cls ? '، الصف: ' + clip(I.cls, 30) : '') + (I.topic ? '، عنوان الدرس: ' + clip(I.topic, 120) : ''),
            I.summary ? '- ملخّص الرصد: ' + clip(I.summary, 400) : '',
            '',
            'البنود:',
            rows.join('\n')
        ].filter(x => x !== '').join('\n');
        return { system, user };
    }

    // طلبٌ واحدٌ للصقه في Claude يدويّاً (الطريق المجانيّ)
    function promptText(req) {
        return req.system + '\n\n———\n\n' + req.user;
    }

    // نصٌّ آمنٌ للبوّابة: ترميز HTML يُفكّ، و«<» تُحيَّد (البوّابة ترفض الحفظ كلّه بها)، والماركداون والتشكيل يُنزعان
    function clean(s) {
        return String(s || '')
            .replace(/&#(\d+);?/g, (m, d) => { const c = Number(d); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''; })
            .replace(/&(nbsp|amp|quot|lt|gt);/g, (m, n) => ({ nbsp: ' ', amp: '&', quot: '"', lt: '‹', gt: '›' })[n])
            .replace(/</g, '‹')
            .replace(/\*\*|__|`/g, '')
            .replace(/^\s*#+\s*/gm, '')
            .replace(/^\s*[-*]\s+/gm, '• ')
            .replace(/[ً-ْ]/g, '')
            .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // الردّ ← الخانات الثلاث. يقبل العناوين بنقطتين أو بدونهما، وبماركداون حولها، ويقبل JSON بالمفاتيح نفسها.
    function parse(text) {
        const t = String(text || '').trim();
        if (!t) return null;
        if (/^\s*\{/.test(t)) {
            try { const j = JSON.parse(t); const o = {}; FIELDS.forEach(F => { o[F.k] = clean(j[F.k] || ''); }); return o[FIELDS[0].k] || o.recs ? o : null; } catch (e) { /* ليس JSON */ }
        }
        const lines = t.split(/\r?\n/), norm = s => s.replace(/[*#_`:：\s]/g, '');
        const at = FIELDS.map(F => lines.findIndex(l => norm(l) === norm(F.head)));
        if (at.every(i => i < 0)) return null;
        const out = {};
        FIELDS.forEach((F, i) => {
            if (at[i] < 0) { out[F.k] = ''; return; }
            const next = at.filter(j => j > at[i]).sort((a, b) => a - b)[0];
            out[F.k] = clean(lines.slice(at[i] + 1, next == null ? lines.length : next).join('\n'));
        });
        return out;
    }

    // ما يلزم أن يراه المشرف قبل الاعتماد: خانةٌ فارغة أو أطول من حدّ البوّابة، أو اسم المعلّم/المدرسة إن تسرّب
    function problems(out, ctx) {
        const P = [], C = ctx || {};
        FIELDS.forEach(F => {
            const v = (out && out[F.k]) || '';
            if (!v) P.push('«' + F.head + '» فارغة في الردّ');
            else if (v.replace(/\n/g, '\r\n').length > 1000) P.push('«' + F.head + '» أطول من حدّ البوّابة (1000 حرف)');
        });
        const all = FIELDS.map(F => (out && out[F.k]) || '').join('\n');
        [C.teacher, C.school].filter(x => x && String(x).trim().length > 2).forEach(x => { if (all.includes(String(x).trim())) P.push('الردّ يذكر «' + String(x).trim() + '» — راجعه'); });
        return P;
    }

    const api = { LEVELS, FIELDS, MAX_FIELD, build, promptText, parse, clean, problems };
    root.SvfEyeDraft = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
