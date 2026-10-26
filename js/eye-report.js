// =========================================================================
// عين المشرف — بطاقة التحليل للمعلّم (منذ 2026-10-26)
//
// طلب المشرف: «حفظ هذه التحليلات برسوماتٍ بيانيّة وإمكانيّة إرسالها للمعلّم». البطاقة صورةٌ عموديّة (١٠٨٠ عرضاً)
// تُرسم من **أرقام الرصد المحفوظة وحدها** (#eyeData) — لا إطار كاميرا فيها ولا صوت: لا تقرأ هذه الوحدة الفيديو
// أصلاً (يفحصه الاختبار). فيها: المعلّم والزيارة، وأرقامٌ أربعة، وعناصر الحصة الخمسة (الفعليّ مقابل الموصى به)،
// ومجرى الحصة، والتشكيلات، وما يُعزَّز وما يُتأمَّل، والنموّ منذ الرصد السابق.
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
    const PART_COLOR = { w: '#d9a441', f: '#9a6f24', t: '#5b8fc7', a: '#2f6fae', c: '#246445' };
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
        big.width = W; big.height = 3200;
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

        // ٤) مجرى الحصة (نشاطٌ وانتظار، وعناصرها أعلاه)
        if (data && data.tl) {
            y = heading(g, 'مجرى الحصة', y + 20) + 10;
            const n = data.tl.length, bx0 = PAD, bx1 = W - PAD, bw = (bx1 - bx0) / Math.max(n, 24), H = 90;
            rrect(g, bx0 - 10, y - 10, bx1 - bx0 + 20, H + 50, 14, '#fff');
            for (let i = 0; i < n; i++) {
                const x = bx1 - (i + 1) * bw, k = data.tl[i], v = Number((data.tv || '')[i] || 0) / 9, c = (data.tc || '')[i];
                if (c && PART_COLOR[c]) { g.fillStyle = PART_COLOR[c]; g.fillRect(x, y, Math.max(1, bw), 8); }
                const hh = k === 'a' ? 16 + v * (H - 30) : k === 'i' ? 10 : 0;
                if (hh) { g.fillStyle = k === 'a' ? C.navy : '#cbd5e1'; g.fillRect(x + 0.5, y + 14 + (H - 14 - hh), Math.max(1, bw - 1), hh); }
            }
            g.fillStyle = C.muted; g.font = font(400, 20);
            g.textAlign = 'right'; g.fillText('البداية', bx1, y + H + 30);
            g.textAlign = 'left'; g.fillText('النهاية', bx0, y + H + 30);
            g.textAlign = 'right';
            y += H + 60;
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
            await navigator.share({ files: [file], title: 'تحليل الحصة', text: 'تحليل الحصة' + (info.teacher ? ' — ' + info.teacher : '') });
            return 'shared';
        }
        download(blob, name);
        return 'download';
    }

    async function print(data, info, extra) {
        info = info || {};
        const w = root.open('', '_blank');                // داخل الضغطة: تُفتح الآن وتُملأ بعد الرسم
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
