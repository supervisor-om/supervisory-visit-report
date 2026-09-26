// =========================================================================
// التقرير الشهري — ملء نموذج Word الخاصّ بالمشرف (word/document.xml)
//
// لا يُرسم التصميم من جديد: يُستنسخ من ملف المشرف نفسه صفُّ البيانات بخطوطه
// وأحجامه وألوانه وعروض أعمدته، ويُغيَّر النصّ وحده. فالشعارات ومربّع العنوان
// والهوامش والصفّان الأخيران تبقى كما صمّمها المشرف حرفاً.
//
//   • الجدولان اللذان فيهما «الخطة الشهرية المعتمدة» هما جدولا البيانات
//     (صفحةٌ لكلّ جدول). سعة الأوّل = عدد صفوفه في النموذج.
//   • كلّ خليّةٍ تُؤخذ من نموذجٍ بنوع نصّها: ✓ من خليّة ✓، و«-» من خليّة «-»،
//     والنصّ من خليّة نصّ — فخطّ Segoe UI Symbol لا يُطبَّق على «-».
//   • تظليل الصفوف كتلاً من خمسة: رماديٌّ ثمّ أبيض، متّصلاً عبر الصفحتين.
//   • الإجازة في «الخطة المنفذة» بالأحمر، و«(1)» في الزيارات الإشرافيّة بالأحمر.
// =========================================================================
(function (global) {
    'use strict';

    const RED = 'EE0000';
    const isOff = t => /^[اإ]جاز[ةه]/.test(String(t || '').trim());
    const BAND = 5;
    const MONTH_RE = /(يناير|فبراير|مارس|[اأإ]بريل|مايو|يونيو|يوليو|[اأ]غسطس|سبتمبر|[اأ]كتوبر|نوفمبر|ديسمبر)/;

    const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const encode = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // عناصر المستوى الأعلى بعمق التداخل (جداولٌ داخل خلايا، صفوفٌ داخل جداول)
    function spans(xml, open, close, from, to) {
        const out = [];
        const re = new RegExp(`${open}|${close}`, 'g');
        re.lastIndex = from || 0;
        let m, depth = 0, start = 0;
        const end = to == null ? xml.length : to;
        while ((m = re.exec(xml)) && m.index < end) {
            if (m[0] === close) { depth--; if (!depth) out.push([start, re.lastIndex]); }
            else { if (!depth) start = m.index; depth++; }
        }
        return out;
    }
    const tables = xml => spans(xml, '<w:tbl>', '</w:tbl>');
    const rowsOf = tbl => spans(tbl, '<w:tr[ >]', '</w:tr>').map(([a, b]) => tbl.slice(a, b));
    const cellsOf = tr => spans(tr, '<w:tc>', '</w:tc>').map(([a, b]) => tr.slice(a, b));
    const textOf = s => (s.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(t => decode(t.replace(/<[^>]+>/g, ''))).join('');
    const stripIds = s => s.replace(/\s+w14:(?:paraId|textId)="[^"]*"/g, '');

    // ── نصّ الخليّة ──
    // الفقرة الأولى: يبقى أوّل تشغيلٍ نصّيّ بخصائصه، ويُحذف ما بعده من تشغيلات.
    // وإن لم يكن فيها تشغيل (خليّةٌ فارغة) يُبنى من خصائص الفقرة.
    function setCellRuns(cell, parts, paraIndex) {
        const paras = spans(cell, '<w:p[ >]', '</w:p>');
        const target = paras[paraIndex || 0];
        if (!target) return cell;
        const p0 = target[0], p1 = target[1] - 6;       // قبل </w:p>
        const para = cell.slice(p0, p1);
        const runs = spans(para, '<w:r[ >]', '</w:r>').map(([a, b]) => para.slice(a, b));
        const textRun = runs.find(r => /<w:t[ >]/.test(r));
        let rPr = '';
        if (textRun) rPr = (textRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
        else { const pr = para.match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/); rPr = pr ? pr[1] : ''; }

        const withColor = color => {
            if (!color) return rPr;
            if (!rPr) return `<w:rPr><w:color w:val="${color}"/></w:rPr>`;
            return /<w:color /.test(rPr) ? rPr.replace(/<w:color [^>]*\/>/, `<w:color w:val="${color}"/>`)
                                         : rPr.replace('</w:rPr>', `<w:color w:val="${color}"/></w:rPr>`);
        };
        // فاصل سطرٍ داخل الفقرة نفسها (لا فقرةٌ جديدة) — أكثر من مدرسةٍ في زيارات
        // إشرافية يومٍ واحد، مثلاً؛ x.br بلا نصٍّ فلا يسقطه فلتر «لا فارغ»
        const newRuns = parts.filter(x => x.text !== '' || x.br).map(x =>
            x.br ? `<w:r>${withColor(x.color)}<w:br/></w:r>`
                 : `<w:r>${withColor(x.color)}<w:t xml:space="preserve">${encode(x.text)}</w:t></w:r>`).join('');

        // تُحذف التشغيلات كلّها (نصّاً ورموزاً) ويُكتب الجديد بعد خصائص الفقرة
        let rest = para;
        for (const r of runs) rest = rest.replace(r, '');
        const pprEnd = rest.indexOf('</w:pPr>');
        const at = pprEnd >= 0 ? pprEnd + 8 : rest.indexOf('>') + 1;
        const newPara = rest.slice(0, at) + newRuns + rest.slice(at);
        return cell.slice(0, p0) + newPara + cell.slice(p1);
    }

    // فقراتٌ بترتيبها: الأولى فالثانية… وما زاد على المطلوب من فقرات الخليّة يُحذف
    // — خليّة «الأسباب» في النموذج سطران، والكتابة في الأوّل وحده كرّرت الثاني.
    function setCellParagraphs(cell, texts) {
        let c = cell;
        const count = spans(c, '<w:p[ >]', '</w:p>').length;
        texts.forEach((t, i) => { if (i < count) c = setCellRuns(c, t, i); });
        const paras = spans(c, '<w:p[ >]', '</w:p>');
        for (let i = paras.length - 1; i >= Math.max(1, texts.length); i--)
            c = c.slice(0, paras[i][0]) + c.slice(paras[i][1]);
        return c;
    }

    function setShading(cell, shd) {
        if (!shd) return cell;
        if (/<w:shd [^>]*\/>/.test(cell.slice(0, cell.indexOf('</w:tcPr>'))))
            return cell.replace(/<w:shd [^>]*\/>/, shd);
        return cell.replace('</w:tcPr>', shd + '</w:tcPr>');
    }

    // ── نماذج الخلايا من جدول النموذج ──
    const kindOf = t => /✓|✓/.test(t) ? 'check' : /^\s*-*\s*$/.test(t) ? 'dash' : 'text';

    function analyseTable(tbl) {
        const rows = rowsOf(tbl);
        const isHeader = r => /التاريخ|الزيارة المدرسية/.test(textOf(r));
        const isSummary = r => /المجموع|نسبة الإنجاز/.test(textOf(r));
        const header = rows.filter(isHeader);
        const summary = rows.filter(isSummary);
        const data = rows.filter(r => !isHeader(r) && !isSummary(r));
        const cellsShd = r => (cellsOf(r)[0].match(/<w:shd [^>]*\/>/) || [''])[0];
        const fillOf = shd => (shd.match(/w:fill="([^"]+)"/) || [])[1] || '';
        const gray = data.find(r => /^(?!FFFFFF|auto)[0-9A-F]{6}$/i.test(fillOf(cellsShd(r))));
        const white = data.find(r => !cellsShd(r) || /^(FFFFFF|auto)$/i.test(fillOf(cellsShd(r))));
        const proto = { byCol: [], shdGray: gray ? cellsShd(gray) : '', shdWhite: white ? cellsShd(white) : '',
                        trOpen: '', trPr: '' };
        const first = data[0] || '';
        proto.trOpen = stripIds((first.match(/^<w:tr[^>]*>/) || ['<w:tr>'])[0]);
        proto.trPr = (first.match(/<w:trPr>[\s\S]*?<\/w:trPr>/) || [''])[0];
        for (const r of data) cellsOf(r).forEach((c, i) => {
            const k = kindOf(textOf(c));
            proto.byCol[i] = proto.byCol[i] || {};
            // «-» يُفضَّل من خليّةٍ بخطّ النصّ: خليّة الرمز تجعله شرطةً غامقة
            const symbolFont = /Segoe UI Symbol|Wingdings/.test(c);
            if (!proto.byCol[i][k] || (k === 'dash' && proto.byCol[i].dashSymbol && !symbolFont)) {
                proto.byCol[i][k] = stripIds(c);
                if (k === 'dash') proto.byCol[i].dashSymbol = symbolFont;
            }
        });
        return { rows, header, summary, data, proto };
    }

    function cellFor(proto, col, text) {
        const m = proto.byCol[col] || {};
        return m[kindOf(text)] || m.text || m.dash || m.check || '';
    }

    function buildRow(proto, row, bandIndex) {
        const shd = Math.floor(bandIndex / BAND) % 2 === 0 ? proto.shdGray : proto.shdWhite;
        const checks = row.marks > 0 ? Array(row.marks).fill('✓').join(' ') : '-';
        // أكثر من مدرسةٍ في اليوم ← سطرٌ لكلّ معلّمٍ (buildRows في monthly-core.js)؛
        // الفصل بـ<w:br/> داخل الفقرة نفسها لا فقرةٌ جديدة، فلا حاجة لفتحةٍ في القالب
        const redCounts = s => String(s).split('\n').flatMap((line, i, lines) => {
            const parts = line.split(/(\(\d+\))/).filter(x => x !== '')
                .map(x => ({ text: x, color: /^\(\d+\)$/.test(x) ? RED : null }));
            return i < lines.length - 1 ? [...parts, { text: '', br: true }] : parts;
        });
        const values = [
            [{ text: row.date }],
            [{ text: row.dayName }],
            [{ text: row.planned }],
            [{ text: row.executed, color: isOff(row.executed) && !isOff(row.planned) ? RED : null }],
            [{ text: checks }],
            row.supervisory && row.supervisory !== '-' ? redCounts(row.supervisory) : [{ text: '-' }],
            [{ text: row.methods }],
            [{ text: row.followE }],
            [{ text: row.followA }]
        ];
        const cells = values.map((parts, i) => {
            const plain = parts.map(p => p.text).join('');
            const tpl = cellFor(proto, i, plain);
            return setShading(setCellRuns(tpl, parts), shd);
        });
        return proto.trOpen + proto.trPr + cells.join('') + '</w:tr>';
    }

    // ── نصّ فقرةٍ موزّعٌ على تشغيلات: استبدالٌ بالمدى دون مسّ الخصائص ──
    function replaceInParagraph(p, re, fn) {
        const items = [];
        const tre = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
        let m, pos = 0;
        while ((m = tre.exec(p))) {
            const text = decode(m[1]);
            const inner = m.index + m[0].indexOf('>') + 1;
            items.push({ text, start: pos, end: pos + text.length, xs: inner, xe: inner + m[1].length });
            pos += text.length;
        }
        const whole = items.map(i => i.text).join('');
        const found = whole.match(re);
        if (!found) return p;
        const a = found.index, b = a + found[0].length, rep = fn(found);
        // النصّ الجديد في التشغيل الذي يبدأ فيه المدى، ويُقتطع الباقي من غيره
        const next = items.map(it => {
            if (it.end <= a || it.start >= b) return it.text;
            const pre = it.text.slice(0, Math.max(0, a - it.start));
            const post = it.text.slice(Math.max(0, b - it.start));
            return (it.start <= a && a < it.end ? pre + rep : pre) + post;
        });
        let out = p;
        for (let i = items.length - 1; i >= 0; i--)
            out = out.slice(0, items[i].xs) + encode(next[i]) + out.slice(items[i].xe);
        // w:t بمسافاتٍ في طرفيه يحتاج xml:space
        return out.replace(/<w:t>([^<]*\s)<\/w:t>|<w:t>(\s[^<]*)<\/w:t>/g, (x, a1, a2) => `<w:t xml:space="preserve">${a1 || a2}</w:t>`);
    }

    function paragraphs(xml) { return spans(xml, '<w:p[ >]', '</w:p>'); }

    function mapParagraphs(xml, test, fn) {
        const ps = paragraphs(xml);
        let out = '', last = 0;
        for (const [a, b] of ps) {
            const p = xml.slice(a, b);
            out += xml.slice(last, a) + (test(p) ? fn(p) : p);
            last = b;
        }
        return out + xml.slice(last);
    }

    // ── العنوان: «تقرير شهر: يونيو 2026م» في مربّعَي النصّ (الحديث وبديله القديم) ──
    // مربّع النصّ فقرةٌ داخل فقرة، فتُعالَج الفقرات الداخليّة وحدها: الخارجيّة
    // تجمع نسختَي العنوان فلا يُبدَّل إلّا أوّلهما.
    function fillTitle(xml, monthName, year) {
        return xml.replace(/<w:p[ >](?:(?!<w:p[ >]|<\/w:p>)[\s\S])*<\/w:p>/g, p => {
            if (!/تقرير\s*شهر/.test(textOf(p))) return p;
            let q = replaceInParagraph(p, MONTH_RE, () => monthName);
            q = replaceInParagraph(q, /\d{4}(?=\s*م)/, () => String(year));
            return q;
        });
    }

    // ── صفّا المجموع ونسبة الإنجاز ──
    function fillSummary(rowXml, t) {
        const txt = textOf(rowXml);
        const cells = cellsOf(rowXml);
        let out = cells.slice();
        if (/المجموع/.test(txt)) {
            const vals = [null, String(t.planned), String(t.executed), String(t.schools), t.supText];
            out = cells.map((c, i) => {
                if (i === 0) return c;
                const v = i < vals.length ? vals[i] : '-';
                return setCellRuns(c, [{ text: v }]);
            });
        } else if (/نسبة الإنجاز/.test(txt)) {
            out = cells.map((c, i) => {
                const ct = textOf(c);
                if (/نسبة الإنجاز/.test(ct)) {
                    // «= ( 20 ÷ 21 )» — الرقمان بعد علامة «=» الثانية
                    return mapParagraphs(c, p => /÷/.test(textOf(p)), p =>
                        replaceInParagraph(p, /(=\s*\(\s*)(\d+)(\s*÷\s*)(\d+)/, m => `${m[1]}${t.executed}${m[3]}${t.planned}`));
                }
                if (/نتيجة القياس/.test(ct))
                    return mapParagraphs(c, p => /نتيجة القياس/.test(textOf(p)), p =>
                        replaceInParagraph(p, /\d+(?=\s*%)/, () => String(t.rate)));
                if (/الأسباب|الاسباب/.test(ct)) {
                    const paras = spans(c, '<w:p[ >]', '</w:p>').length;
                    if (!t.reasons) return setCellParagraphs(c, [[{ text: 'الأسباب: -' }]]);
                    return paras > 1
                        ? setCellParagraphs(c, [[{ text: 'الأسباب: -' }], [{ text: t.reasons }]])
                        : setCellParagraphs(c, [[{ text: 'الأسباب: -' + t.reasons }]]);
                }
                return c;
            });
        }
        // إعادة تركيب الصفّ بخلاياه الجديدة
        let r = rowXml, offset = 0;
        const sp = spans(rowXml, '<w:tc>', '</w:tc>');
        sp.forEach(([a, b], i) => {
            r = r.slice(0, a + offset) + out[i] + r.slice(b + offset);
            offset += out[i].length - (b - a);
        });
        return r;
    }

    /**
     * @param xml    word/document.xml من نموذج المشرف
     * @param report { monthName, year, rows, totals }
     * @returns { xml, pages: [n1, n2], capacity }
     */
    function fill(xml, report) {
        const tbls = tables(xml);
        const dataIdx = tbls.map(([a, b], i) => /الخطة الشهرية المعتمدة/.test(textOf(xml.slice(a, b))) ? i : -1).filter(i => i >= 0);
        if (!dataIdx.length) throw new Error('لم أجد جدول «الخطة الشهرية المعتمدة» في الملف — ارفع التقرير الشهري نفسه.');
        const analysed = dataIdx.map(i => analyseTable(xml.slice(...tbls[i])));
        if (!analysed[0].data.length) throw new Error('جدول النموذج بلا صفوف بيانات يُستنسخ منها.');

        const capacity = dataIdx.length > 1 ? analysed[0].data.length : report.rows.length;
        const pages = dataIdx.length > 1
            ? [report.rows.slice(0, capacity), report.rows.slice(capacity)]
            : [report.rows];

        let out = xml, offset = 0, band = 0;
        dataIdx.forEach((ti, k) => {
            const [a, b] = tbls[ti];
            const tbl = xml.slice(a, b);
            const an = analysed[k];
            const isLast = k === dataIdx.length - 1;
            const firstRowAt = tbl.indexOf(an.rows[0]);
            const lastRow = an.rows[an.rows.length - 1];
            const rowsEnd = tbl.lastIndexOf(lastRow) + lastRow.length;
            const pageRows = (pages[k] || []).map(row => buildRow(an.proto, row, band++)).join('');
            const summary = isLast ? an.summary.map(s => fillSummary(s, report.totals)).join('') : '';
            const newTbl = tbl.slice(0, firstRowAt) + an.header.join('') + pageRows + summary + tbl.slice(rowsEnd);
            out = out.slice(0, a + offset) + newTbl + out.slice(b + offset);
            offset += newTbl.length - (b - a);
        });

        out = fillTitle(out, report.monthName, report.year);
        return { xml: out, pages: pages.map(p => p.length), capacity };
    }

    const api = { fill, tables, rowsOf, cellsOf, textOf, analyseTable, replaceInParagraph, setCellRuns, kindOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.MonthlyDocx = api;
})(typeof window !== 'undefined' ? window : globalThis);
