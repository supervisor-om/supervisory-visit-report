// =========================================================================
// عين المشرف — بطاقة التحليل للمعلّم (منذ 2026-10-26)
//
// طلب المشرف: «حفظ هذه التحليلات برسوماتٍ بيانيّة وإمكانيّة إرسالها للمعلّم». البطاقة صورةٌ عموديّة (١٠٨٠ عرضاً)
// تُرسم من **أرقام الرصد المحفوظة وحدها** (#eyeData) — لا إطار كاميرا فيها ولا صوت: لا تقرأ هذه الوحدة الفيديو
// أصلاً (يفحصه الاختبار). فيها: المعلّم والزيارة، وأرقامٌ أربعة، وعناصر الحصة الخمسة (الفعليّ مقابل الموصى به)،
// ومجرى الحصة، والتشكيلات، وعيّنة الطلبة، وأهداف الزيارة السابقة والقادمة، وما يُعزَّز وما يُتأمَّل، والنموّ منذ الرصد السابق.
//
// share(): مشاركة الصورة (واتساب وغيره) بـ Web Share على الجوّال، وإلّا تنزيلها. print(): صفحةٌ فيها الصورة
// تُطبع أو تُحفظ PDF — تُفتح النافذة داخل الضغطة نفسها (وإلّا حجبها المتصفّح) ثمّ تُملأ.
// =========================================================================
(function (root) {
    'use strict';

    const E = () => root.SvfEye;
    const W = 1080, PAD = 56;
    const C = { navy: '#0f4c81', dark: '#082742', gold: '#f0b44a', text: '#0f172a', muted: '#475569', line: '#e2e8f0', bg: '#f4f7fb',
                ok: '#1d6b45', warn: '#9a6f24', bad: '#b5452f', track: '#e8eef5' };
    const PART_COLOR = { w: '#d9a441', f: '#9a6f24', t: '#5b8fc7', a: '#2f6fae', c: '#246445', r: '#8492a6' };   // r: الحضور والزيّ
    const FORM_COLOR = { L: '#0f4c81', C: '#246445', G: '#9a6f24', S: '#64748b' };
    const FONT = '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif';
    const font = (w, px) => w + ' ' + px + 'px ' + FONT;

    async function fontsReady() {
        try {
            if (document.fonts && document.fonts.load) {
                await Promise.all([document.fonts.load(font(700, 40)), document.fonts.load(font(400, 28))]);
            }
        } catch (e) { /* خطّ النظام */ }
    }

    // نصٌّ من اليمين يلتفّ داخل عرضٍ معلوم — يعيد y بعد آخر سطر
    function wrap(g, text, xRight, y, maxW, lh) {
        const words = String(text || '').split(/\s+/).filter(Boolean);
        let line = '';
        words.forEach(w => {
            const t = line ? line + ' ' + w : w;
            if (g.measureText(t).width > maxW && line) { g.fillText(line, xRight, y); y += lh; line = w; }
            else line = t;
        });
        if (line) { g.fillText(line, xRight, y); y += lh; }
        return y;
    }
    function rrect(g, x, y, w, h, r, fill) {
        g.beginPath();
        g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
        g.fillStyle = fill; g.fill();
    }
    function heading(g, text, y) {
        g.fillStyle = C.text; g.font = font(700, 34); g.textAlign = 'right';
        g.fillText(text, W - PAD, y);
        return y + 22;
    }

    // ترسم البطاقة على لوحٍ طويلٍ ثمّ تقصّه على ما استُعمل منه
    async function draw(data, info, extra) {
        await fontsReady();
        info = info || {}; extra = extra || {};
        const P = typeof info.pupil === 'function' ? info.pupil : (s => s);
        const M = (data && data.M) || {}, Y = E();
        const big = document.createElement('canvas');
        big.width = W; big.height = 4400;
        const g = big.getContext('2d');
        g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
        g.fillStyle = C.bg; g.fillRect(0, 0, W, big.height);

        // ١) الرأس
        g.fillStyle = C.dark; g.fillRect(0, 0, W, 250);
        g.fillStyle = C.gold; g.fillRect(0, 246, W, 4);
        g.fillStyle = C.gold; g.font = font(600, 26); g.fillText('منظومة الإشراف التربوي · عين المشرف', W - PAD, 66);
        g.fillStyle = '#fff'; g.font = font(700, 50); g.fillText(P('تحليل الحصة') + (info.teacher ? ' — ' + info.teacher : ''), W - PAD, 140);
        g.fillStyle = '#cbd5e1'; g.font = font(400, 28);
        wrap(g, [info.school, info.cls && 'الصف ' + info.cls, info.topic && 'درس: ' + info.topic, info.date].filter(Boolean).join('  ·  '), W - PAD, 196, W - 2 * PAD, 36);

        // ٢) أربعة أرقام
        let y = 290;
        const people = M.people && M.people.detSecs >= 60 ? M.people : null;
        const moving = people && people.movingAll != null ? (people.movingPlay != null ? people.movingPlay : people.movingAll) : (M.observed ? M.activePct : null);
        const kpis = [
            ['عدد الطلبة', people ? String(people.classSize || people.inside) : '—'],
            [P('حركة الطلبة'), moving != null ? moving + '%' : '—'],
            ['زمن الرصد', Y.dur(M.observed || M.seconds || 0)],
            ['بغير الزيّ الرياضيّ', String(((data && data.counts) || {}).dish || 0)]
        ];
        const kw = (W - 2 * PAD - 3 * 20) / 4;
        kpis.forEach((k, i) => {
            const x = W - PAD - (i + 1) * kw - i * 20;
            rrect(g, x, y, kw, 150, 18, '#fff');
            g.fillStyle = C.navy; g.font = font(700, 50); g.textAlign = 'center'; g.fillText(k[1], x + kw / 2, y + 78);
            g.fillStyle = C.muted; g.font = font(400, 24); g.fillText(k[0], x + kw / 2, y + 120);
        });
        g.textAlign = 'right';
        y += 200;

        // ٣) عناصر الحصة
        const det = M.ctx && M.ctx.covered >= 60 ? Y.partsDetail(M, M.rec) : null;
        if (det) {
            y = heading(g, 'عناصر الحصة', y + 10);
            g.fillStyle = C.muted; g.font = font(400, 22);
            g.fillText('الشريط: الزمن الفعليّ · الخطّ الذهبيّ: الموصى به', W - PAD, y + 14);
            y += 40;
            const maxMin = Math.max(1, ...det.map(r => Math.max(r.minutes, r.rec)));
            const labW = 290, barX0 = PAD + 250, barX1 = W - PAD - labW, barW = barX1 - barX0;
            const VERD = { ok: ['مناسب', C.ok], long: ['أطول', C.warn], short: ['أقصر', C.warn], missing: ['غائب', C.bad] };
            det.forEach(r => {
                g.fillStyle = C.text; g.font = font(600, 28); g.textAlign = 'right';
                g.fillText(r.label, W - PAD, y + 30);
                rrect(g, barX0, y + 8, barW, 30, 8, C.track);
                const bw = Math.max(r.sec ? 6 : 0, barW * r.minutes / maxMin);
                if (bw) rrect(g, barX1 - bw, y + 8, bw, 30, 8, PART_COLOR[Y.PART[r.k].c]);
                const mx = barX1 - barW * r.rec / maxMin;
                g.fillStyle = C.gold; g.fillRect(mx - 2, y, 5, 46);
                const mv = r.moving != null ? r.moving : r.activePct;
                g.textAlign = 'left'; g.font = font(600, 24);
                const [vt, vc] = VERD[r.verdict];
                g.fillStyle = vc; g.fillText(vt, PAD, y + 22);
                g.fillStyle = C.muted; g.font = font(400, 22);
                g.fillText(r.minutes + ' د / ' + r.rec + ' د' + (mv != null && r.sec ? '  ·  ' + P('حركة') + ' ' + mv + '%' : ''), PAD, y + 50);
                g.textAlign = 'right';
                y += 74;
            });
            y += 10;
        }
        // الحضور والزيّ: سطرٌ وحده (ليس عنصراً) — لا يُحسب شرحاً ولا انتظاراً
        if (M.admin && M.admin.sec >= 60) {
            g.fillStyle = PART_COLOR.r; g.fillRect(W - PAD - 14, y + 2, 14, 14);
            g.fillStyle = C.muted; g.font = font(400, 24);
            g.fillText('الحضور والزيّ في أوّل الحصة: ' + Y.dur(M.admin.sec) + ' — لم يُحسب شرحاً ولا انتظاراً', W - PAD - 26, y + 16);
            y += 44;
        }

        // ٤) مجرى الحصة (نشاطٌ وانتظار، وعناصرها أعلاه)
        if (data && data.tl) {
            y = heading(g, 'مجرى الحصة', y + 20) + 10;
            const n = data.tl.length, bx0 = PAD, bx1 = W - PAD, bw = (bx1 - bx0) / Math.max(n, 24), H = 90;
            rrect(g, bx0 - 10, y - 10, bx1 - bx0 + 20, H + 50, 14, '#fff');
            for (let i = 0; i < n; i++) {
                const x = bx1 - (i + 1) * bw, k = data.tl[i], v = Number((data.tv || '')[i] || 0) / 9, c = (data.tc || '')[i];
                if (c && PART_COLOR[c]) { g.fillStyle = PART_COLOR[c]; g.fillRect(x, y, Math.max(1, bw), 8); }
                const hh = k === 'a' ? 16 + v * (H - 30) : k === 'i' || k === 'r' ? 10 : 0;
                if (hh) { g.fillStyle = k === 'a' ? C.navy : k === 'r' ? PART_COLOR.r : '#cbd5e1'; g.fillRect(x + 0.5, y + 14 + (H - 14 - hh), Math.max(1, bw - 1), hh); }
            }
            g.fillStyle = C.muted; g.font = font(400, 20);
            g.textAlign = 'right'; g.fillText('البداية', bx1, y + H + 30);
            g.textAlign = 'left'; g.fillText('النهاية', bx0, y + H + 30);
            g.textAlign = 'right';
            y += H + 60;
        }

        // ٤ب) الحركة والتنظيم: شدّة النشاط، والاستجابة للصفّارة، والكرات، والتزاحم، وموقع المعلّم
        const mvI = people ? (people.movingPlay != null ? people.movingPlay : people.movingAll) : null;
        const vgI = people ? (people.vigPlay != null ? people.vigPlay : people.vigAll) : null;
        const RS = M.resp && M.resp.med != null ? M.resp : null, ratio = Y.ballRatio ? Y.ballRatio(M) : null, TS = people && people.teacher;
        const org = [];
        if (RS) org.push(P('الاستجابة لإشارة الصفّارة: ' + RS.med + ' ث في المتوسّط (' + RS.n + (RS.n >= 3 && RS.n <= 10 ? ' إشارات)' : ' إشارة)')));
        if (ratio) org.push(P('الكرات: كرةٌ لكلّ ' + Y.perPupils(ratio)));
        if (people && people.crowdPct != null) org.push(P('التزاحم أثناء الحركة: ' + people.crowdPct + '% من المتحرّكين'));
        if (TS && TS.edgePct != null) org.push((info.female ? 'المعلمة' : 'المعلم') + P(' على أطراف الطلبة ' + TS.edgePct + '% من الوقت') + (TS.cover != null ? '، وتنقّل' + (info.female ? 'ت' : '') + ' في ' + TS.cover + '% من المساحة' : ''));
        if ((mvI != null && vgI != null) || org.length) {
            y = heading(g, 'الحركة والتنظيم', y + 20) + 16;
            if (mvI != null && vgI != null) {
                const segs = [[P('ساكن'), 100 - mvI, '#cbd5e1'], [P('معتدل'), Math.max(0, mvI - vgI), '#5b8fc7'], [P('شديد'), vgI, C.navy]];
                const bw = W - 2 * PAD;
                let x = W - PAD;
                segs.forEach(([lab, v, col]) => { const w = bw * v / 100; if (w > 0) { g.fillStyle = col; g.fillRect(x - w, y, w, 34); } x -= w; });
                g.font = font(400, 22); g.fillStyle = C.muted;
                g.fillText(segs.map(([lab, v]) => lab + ' ' + v + '%').join('  ·  ') + '  —  ' + P('المعيار: نصف الزمن نشاطاً معتدلاً فأشدّ'), W - PAD, y + 68);
                y += 104;
            }
            g.font = font(400, 26); g.fillStyle = C.text;
            org.forEach(t => { y = wrap(g, t, W - PAD, y, W - 2 * PAD, 38); });
        }

        // ٥) التشكيلات
        const F = M.forms;
        if (F && F.count) {
            y = heading(g, 'التشكيلات', y + 20) + 16;
            g.font = font(400, 26);
            let x = W - PAD;
            F.segments.forEach((s, i) => {
                const t = Y.FORMS[s.type] + ' ' + Y.dur(s.dur);
                const tw = g.measureText(t).width + 50;
                if (x - tw < PAD) { x = W - PAD; y += 56; }
                rrect(g, x - tw, y - 32, tw, 46, 12, '#fff');
                g.fillStyle = FORM_COLOR[s.type]; g.beginPath(); g.arc(x - 20, y - 9, 8, 0, Math.PI * 2); g.fill();
                g.fillStyle = C.text; g.fillText(t, x - 36, y);
                x -= tw + 14;
            });
            y += 50;
            g.font = font(400, 24);
            g.fillStyle = F.maxLine > Y.LONG_LINE && F.longLineSec >= 60 ? C.bad : C.muted;
            y = wrap(g, F.maxLine > Y.LONG_LINE
                ? P('أطول قاطرة: (' + F.maxLine + ') طلبة، ووقفت قاطراتٌ أطول من (' + Y.LONG_LINE + ') مدّة ' + Y.dur(F.longLineSec) + '.')
                : P('لا قاطرة تزيد على (' + Y.LONG_LINE + ') طلبة.'), W - PAD, y + 6, W - 2 * PAD, 34);
        }

        // ٥ب) كلام المعلّم — أرقامٌ بلا نصّ (العبارات التي تحتاج مراجعةً لا تدخل البطاقة)
        const SPA = M.speech;
        if (SPA && SPA.clauses) {
            y = heading(g, 'كلام المعلّم', y + 30) + 16;
            const items = [['تعزيز', SPA.praise.n, SPA.praise.spec ? 'محدّد ' + SPA.praise.spec : ''],
                           ['تصحيح للأداء', SPA.corr.n, SPA.corr.spec ? 'بالمهارة ' + SPA.corr.spec : ''],
                           ['أسئلة', SPA.q.n, SPA.q.hi ? 'للتفكير ' + SPA.q.hi : ''],
                           ['تحقّق من الفهم', SPA.check.n, '']];
            const kw2 = (W - 2 * PAD - 3 * 20) / 4;
            items.forEach((k, i) => {
                const x = W - PAD - (i + 1) * kw2 - i * 20;
                rrect(g, x, y, kw2, 132, 18, '#fff');
                g.textAlign = 'center';
                g.fillStyle = C.navy; g.font = font(700, 44); g.fillText(String(k[1]), x + kw2 / 2, y + 60);
                g.fillStyle = C.muted; g.font = font(400, 22); g.fillText(k[0], x + kw2 / 2, y + 94);
                if (k[2]) { g.font = font(400, 19); g.fillText(k[2], x + kw2 / 2, y + 120); }
            });
            g.textAlign = 'right';
            y += 160;
            // ونقاط المهارة الفنّيّة من دليل المعلّم كما سُمعت (عددها لا نصّها)
            const GC = M.gspeech && M.gspeech.total ? M.gspeech : null;
            if (GC) {
                g.font = font(400, 24); g.fillStyle = C.muted;
                y = wrap(g, 'ذُكر من النقاط الفنّيّة للمهارة في الدليل (' + GC.said + ') من (' + GC.total + ')، ومن أسئلة التقويم (' + GC.asked + ') من (' + GC.assess.length + ').', W - PAD, y + 4, W - 2 * PAD, 34);
            }
        }

        // ٥ج) عيّنة الطلبة — إتقان المهارة وتقدّمهم بين أوّل التطبيق وآخره
        const SS = Y.sampleStats && Y.sampleStats(data && data.sample);
        if (SS && SS.final) {
            y = heading(g, P('عيّنة الطلبة'), y + 30) + 14;
            g.font = font(400, 26); g.fillStyle = C.text;
            let t = P('أتقن المهارة (' + SS.final.ok + ') من (' + SS.final.rated + ')، وأدّاها جزئيّاً (' + SS.final.part + ') — نسبة الإتقان (' + SS.final.pct + '%)');
            if (SS.both >= Y.MIN_SAMPLE) t += P('، وتقدّم (' + SS.improved + ') بين أوّل التطبيق وآخره (' + SS.a.pct + '% ← ' + SS.b.pct + '%)');
            y = wrap(g, t + '.', W - PAD, y + 6, W - 2 * PAD, 38);
            // النقاط الفنّيّة للمهارة (دليل المعلّم): من حقّق كلّ نقطةٍ في القراءة الأخيرة
            const LGm = root.SvfLessonGuide, GG = LGm && data.guide ? LGm.byId(data.guide.id) : null;
            const PSg = GG ? LGm.pointStats(data.sample, GG) : null;
            if (PSg && PSg.final) {
                g.font = font(600, 24); g.fillStyle = C.muted;
                g.fillText('النقاط الفنّيّة لـ«' + PSg.name + '» — دليل المعلّم', W - PAD, y + 12);
                y += 30;
                const labW = 330, barX0 = PAD + 110, barX1 = W - PAD - labW, barW = barX1 - barX0;
                PSg.final.pts.forEach((pt, i) => {
                    const p = PSg.final.rated ? pt.ok / PSg.final.rated : 0;
                    g.fillStyle = C.text; g.font = font(400, 24); g.textAlign = 'right';
                    g.fillText((i + 1) + '. ' + pt.short, W - PAD, y + 26);
                    rrect(g, barX0, y + 6, barW, 26, 8, C.track);
                    if (p > 0) rrect(g, barX1 - barW * p, y + 6, Math.max(6, barW * p), 26, 8, p >= 0.75 ? C.ok : p >= 0.5 ? C.warn : C.bad);
                    g.textAlign = 'left'; g.fillStyle = C.muted; g.font = font(600, 22);
                    g.fillText(pt.ok + ' من ' + PSg.final.rated, PAD, y + 26);      // «٥ / ٦» تنقلبه اللوحة RTL إلى «٦ / ٥»
                    g.textAlign = 'right';
                    y += 48;
                });
            }
        }

        // ٥د) متابعة أهداف الزيارة السابقة، وأهدافنا للزيارة القادمة
        const FW = data && data.follow && Array.isArray(data.follow.list) ? data.follow.list.filter(f => f && f.verdict !== 'na') : [];
        if (FW.length) {
            y = heading(g, 'أهداف الزيارة السابقة' + (data.follow.date ? ' (' + data.follow.date + ')' : ''), y + 30) + 10;
            const VT = { met: ['تحقّق', C.ok], better: ['تحسّن', C.warn], same: ['لم يتغيّر', C.muted], worse: ['تراجع', C.bad] };
            FW.forEach(f => {
                const [vt, vc] = VT[f.verdict] || VT.same;
                g.textAlign = 'left'; g.font = font(700, 24); g.fillStyle = vc; g.fillText(vt, PAD, y);
                g.textAlign = 'right'; g.font = font(400, 26); g.fillStyle = C.text;
                y = wrap(g, P(f.label) + ': ' + Y.fmtTarget(f.unit, f.base) + ' ← ' + Y.fmtTarget(f.unit, f.now) + ' (الهدف ' + Y.fmtTarget(f.unit, f.goal) + ')', W - PAD, y, W - 2 * PAD - 140, 38) + 4;
            });
        }
        if (extra.targets && extra.targets.length) {
            y = heading(g, 'أهدافنا للزيارة القادمة', y + 30) + 10;
            g.font = font(400, 26);
            extra.targets.forEach(t => {
                g.fillStyle = C.gold; g.beginPath(); g.arc(W - PAD - 8, y - 9, 6, 0, Math.PI * 2); g.fill();
                g.fillStyle = C.text;
                y = wrap(g, P(t), W - PAD - 26, y, W - 2 * PAD - 26, 38) + 6;
            });
        }

        // ٦) ما يُعزَّز وما يُتأمَّل، والنموّ
        const dp = extra.prompts || { good: [], ask: [] };
        const list = (title, items, color) => {
            if (!items.length) return;
            y = heading(g, title, y + 30) + 10;
            g.font = font(400, 26);
            items.slice(0, 3).forEach(t => {
                g.fillStyle = color; g.beginPath(); g.arc(W - PAD - 8, y - 9, 6, 0, Math.PI * 2); g.fill();
                g.fillStyle = C.text;
                y = wrap(g, t, W - PAD - 26, y, W - 2 * PAD - 26, 38) + 8;
            });
        };
        list('ما يُعزَّز', dp.good || [], C.ok);
        list('للتأمّل', dp.ask || [], C.warn);
        if (extra.grow && extra.grow.length) {
            y = heading(g, 'منذ الرصد السابق' + (extra.prevDate ? ' (' + extra.prevDate + ')' : ''), y + 30) + 10;
            g.font = font(400, 26); g.fillStyle = C.text;
            extra.grow.forEach(t => { y = wrap(g, P(t), W - PAD, y, W - 2 * PAD, 38); });
        }

        // ٧) التذييل
        y += 30;
        g.fillStyle = C.line; g.fillRect(PAD, y, W - 2 * PAD, 2);
        g.fillStyle = C.muted; g.font = font(400, 22);
        y = wrap(g, 'عين المشرف: تحليلٌ داخل جهاز المشرف من أرقام الرصد — لا يُحفظ فيه فيديو ولا صوت، وهو اقتراحٌ يُراجَع لا حكمٌ نهائيّ.', W - PAD, y + 40, W - 2 * PAD, 32);
        const h = Math.ceil(y + 30);

        const out = document.createElement('canvas');
        out.width = W; out.height = h;
        out.getContext('2d').drawImage(big, 0, 0);        // قصّ اللوح على ما رُسم — لوحٌ رسمته هذه الوحدة لا إطار كاميرا
        return out;
    }

    const fileName = info => ('تحليل الحصة - ' + (info.teacher || 'معلم') + (info.date ? ' - ' + info.date : '')).replace(/[\\/:*?"<>|]/g, '-') + '.png';
    const toBlob = cv => new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('blob'))), 'image/png'));

    function download(blob, name) {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    async function share(data, info, extra) {
        info = info || {};
        const blob = await toBlob(await draw(data, info, extra));
        const name = fileName(info);
        let file = null;
        try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
            await navigator.share({ files: [file], title: 'تحليل الحصة', text: 'تحليل الحصة' + (info.teacher ? ' — ' (function(root) {
  'use strict';

  const C = {
    bg: '#ffffff',
    text: '#1e293b',
    muted: '#64748b',
    primary: '#0284c7',
    primaryLight: '#f0f9ff',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    border: '#e2e8f0',
    cardBg: '#f8fafc'
  };

  const font = (weight, size) => `${weight || 400} ${size || 14}px system-ui, -apple-system, sans-serif`;

  function fontsReady() {
    return document.fonts ? document.fonts.ready : Promise.resolve();
  }

  function wrap(g, text, x, y, maxWidth, lineHeight) {
    if (!text) return y;
    const words = String(text).split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = g.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        g.fillText(line.trim(), x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    g.fillText(line.trim(), x, y);
    return y + lineHeight;
  }

  function heading(g, text, x, y) {
    g.font = font(700, 18);
    g.fillStyle = C.primary;
    g.fillText(text, x, y);
    return y + 26;
  }

  function draw(data, info, extra) {
    info = info || {};
    extra = extra || {};
    const W = 800;
    const PAD = 30;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = 1200;
    const g = cv.getContext('2d');

    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, 1200);

    let y = PAD + 20;
    g.font = font(700, 24);
    g.fillStyle = C.primary;
    g.fillText('بطاقة تحليل معلم - عين المشرف', PAD, y);
    y += 35;

    g.font = font(400, 14);
    g.fillStyle = C.text;
    if (info.teacher) y = wrap(g, 'المعلم: ' + info.teacher, PAD, y, W - 2 * PAD, 22);
    if (info.subject) y = wrap(g, 'المادة: ' + info.subject, PAD, y, W - 2 * PAD, 22);
    if (info.date) y = wrap(g, 'التاريخ: ' + info.date, PAD, y, W - 2 * PAD, 22);

    y += 10;
    g.strokeStyle = C.border;
    g.beginPath();
    g.moveTo(PAD, y);
    g.lineTo(W - PAD, y);
    g.stroke();
    y += 20;

    if (data) {
      y = heading(g, 'ملخص التحليل الصوتي والتربوي', PAD, y);
      if (typeof data === 'string') {
        y = wrap(g, data, PAD, y, W - 2 * PAD, 24);
      } else if (typeof data === 'object') {
        Object.keys(data).forEach(k => {
          y = wrap(g, `${k}: ${JSON.stringify(data[k])}`, PAD, y, W - 2 * PAD, 22);
        });
      }
    }

    const out = document.createElement('canvas');
    out.width = W;
    out.height = Math.max(y + PAD, 400);
    const outG = out.getContext('2d');
    outG.drawImage(cv, 0, 0);
    return out;
  }

  const fileName = info => 'بطاقة_تحليل_' + (info.teacher || 'معلم') + '_' + (info.date || '') + '.png';
  const toBlob = cv => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png'));

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function share(data, info, extra) {
    info = info || {};
    const blob = await toBlob(await draw(data, info, extra));
    const name = fileName(info);
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: 'image/png' })] })) {
      await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], title: 'بطاقة تحليل المعلم', text: 'تقرير زيارة مشرف' });
      return 'shared';
    }
    download(blob, name);
    return 'download';
  }

  async function print(data, info, extra) {
    info = info || {};
    const w = root.open('', '_blank');
    const blob = await toBlob(await draw(data, info, extra));
    const url = URL.createObjectURL(blob);
    w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + fileName(info) + '</title><style>@page{size:A4;margin:10mm}html,body{margin:0;background:#fff}img{display:block;width:100%}</style></head><body><img src="' + url + '" onload="setTimeout(function(){window.print()},300)"></body></html>');
    w.document.close();
    return 'print';
  }

  let activeEscHandler = null;

  function closeTeacherAnalysisCard() {
    const cardModal = document.getElementById('svf-teacher-analysis-modal') || document.getElementById('svf-teacher-analysis-card');
    if (cardModal) {
      cardModal.style.display = 'none';
    }
    if (activeEscHandler) {
      window.removeEventListener('keydown', activeEscHandler);
      activeEscHandler = null;
    }
  }

  function renderReportCard(data, info, containerEl) {
    info = info || {};
    const container = containerEl || document.body;
    
    let modal = document.getElementById('svf-teacher-analysis-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'svf-teacher-analysis-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;overflow-y:auto;';
      container.appendChild(modal);
    }
    modal.style.display = 'flex';

    const topBarHTML = `
      <div id="svf-card-top-bar" style="position:sticky;top:0;left:0;right:0;width:100%;max-width:900px;z-index:10000;background:#ffffff;padding:12px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;box-sizing:border-box;">
        <button id="svf-card-back-btn" type="button" style="padding:8px 18px;background:#0284c7;color:#ffffff;border:none;border-radius:6px;cursor:pointer;font-size:15px;font-weight:bold;display:inline-flex;align-items:center;gap:6px;transition:background 0.2s;" onmouseover="this.style.background='#0369a1'" onmouseout="this.style.background='#0284c7'">
          ← رجوع إلى عين المشرف
        </button>
        <span style="font-size:16px;font-weight:bold;color:#1e293b;">بطاقة تحليل المعلم</span>
      </div>
    `;

    const contentHTML = `
      <div id="svf-card-content" style="background:#ffffff;width:100%;max-width:900px;padding:24px;box-sizing:border-box;margin-bottom:40px;border-radius:0 0 8px 8px;direction:rtl;text-align:right;">
        <h2 style="color:#0284c7;margin-top:0;">تقرير تحليل الزيارة والإشراف</h2>
        <p><strong>المعلم:</strong> ${info.teacher || 'غير محدد'}</p>
        <p><strong>المادة:</strong> ${info.subject || 'التربية الرياضية'}</p>
        <p><strong>التاريخ:</strong> ${info.date || new Date().toLocaleDateString('ar-OM')}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />
        <div id="svf-card-body">
          ${typeof data === 'string' ? data : `<pre style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:6px;">${JSON.stringify(data, null, 2)}</pre>`}
        </div>
      </div>
    `;

    modal.innerHTML = topBarHTML + contentHTML;

    const backBtn = document.getElementById('svf-card-back-btn');
    if (backBtn) {
      backBtn.onclick = function() {
        closeTeacherAnalysisCard();
      };
    }

    if (activeEscHandler) {
      window.removeEventListener('keydown', activeEscHandler);
    }
    activeEscHandler = function(e) {
      if (e.key === 'Escape' || e.code === 'Escape') {
        closeTeacherAnalysisCard();
      }
    };
    window.addEventListener('keydown', activeEscHandler);

    return modal;
  }

  function openTeacherAnalysisCard(data, info, extra) {
    return renderReportCard(data, info);
  }

  const api = {
    draw,
    share,
    print,
    renderReportCard,
    openTeacherAnalysisCard,
    closeTeacherAnalysisCard,
    fontsReady
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SvfEyeReport = api;
})(typeof window !== 'undefined' ? window : this);.open('', '_blank');                // داخل الضغطة: تُفتح الآن وتُملأ بعد الرسم
        const blob = await toBlob(await draw(data, info, extra));
        if (!w) { download(blob, fileName(info)); return 'download'; }
        const url = URL.createObjectURL(blob);
        w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + fileName(info).replace(/\.png$/, '').replace(/[<&]/g, '')
            + '</title><style>@page{size:A4;margin:10mm}html,body{margin:0;background:#fff}img{display:block;width:100%;max-width:190mm;margin:0 auto}</style></head>'
            + '<body><img src="' + url + '" alt="تحليل الحصة" onload="setTimeout(function(){window.print()},300)"></body></html>');
        w.document.close();
        return 'print';
    }

    root.SvfEyeReport = { draw, share, print };
})(typeof window !== 'undefined' ? window : this);
