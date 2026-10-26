// =========================================================================
// الرسوم البيانيّة — إعداداتٌ مشتركة وحفظ الصور (منذ 2026-10-26)
//
// كان هنا تبويب «الإحصائيّات» القديم (دائرة الدرجات وخطّ متوسّطٍ يخلط المعلّمين) — حلّت محلّه «لوحة المتابعة» و«ملف المعلم»
// في js/dash.js (ومحرّكها js/dash-core.js). يبقى هنا ما تشترك فيه الرسوم: خطّ الواجهة وألوانها، وحفظ أيّ رسمٍ صورةً PNG
// بخلفيّةٍ بيضاء — من لوح Chart.js أو من SVG (الخريطة والنموّ) — للعرض على مدير الدائرة.
// =========================================================================
(function (root) {
    'use strict';

    const C = root.SVF_COLORS || null;
    // ألوان المستويات هي ألوان أزرار التقييم في الاستمارة نفسها (styles.css و SVF_COLORS.rating)
    const RATING = (C && C.rating) || { 1: '#1d6b45', 2: '#0f4c81', 3: '#9a6f24', 4: '#b5452f', 5: '#7a2320' };
    const INK = '#0f172a', MUTED = '#64748b', GRID = 'rgba(15, 23, 42, .08)', NAVY = '#0f4c81';
    const FONT = "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif";

    if (typeof root.Chart !== 'undefined' && root.Chart.defaults) {
        root.Chart.defaults.font.family = FONT;
        root.Chart.defaults.color = MUTED;
        root.Chart.defaults.borderColor = GRID;
    }

    function download(blob, name) {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }
    // لوح Chart.js شفّاف الخلفيّة: يُرسم فوق أبيض قبل الحفظ (والعرض نفسه لا يُمسّ)
    function flatten(canvas) {
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(canvas, 0, 0);
        return c;
    }
    function canvasPng(canvas, name) {
        if (!canvas) return;
        flatten(canvas).toBlob(b => download(b, name + '.png'), 'image/png');
    }
    // SVG ← صورة: تُقرأ أبعاده من viewBox وتُضاعف للوضوح
    function svgData(svg) {
        const clone = svg.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
        const w = vb[2] || svg.clientWidth || 800, h = vb[3] || svg.clientHeight || 400;
        clone.setAttribute('width', w); clone.setAttribute('height', h);
        return { w, h, url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)) };
    }
    function svgPng(svg, name, scale) {
        if (!svg) return;
        const k = scale || 2, s = svgData(svg);
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = Math.round(s.w * k); c.height = Math.round(s.h * k);
            const g = c.getContext('2d');
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, c.width, c.height);
            g.drawImage(img, 0, 0, c.width, c.height);
            c.toBlob(b => download(b, name + '.png'), 'image/png');
        };
        img.src = s.url;
    }
    // صورةٌ للطباعة (لوحٌ أو SVG) — نصّ data: يوضع في <img>
    function imageUrl(el) {
        if (!el) return '';
        if (el.tagName && el.tagName.toLowerCase() === 'canvas') return flatten(el).toDataURL('image/png');
        if (el.tagName && el.tagName.toLowerCase() === 'svg') return svgData(el).url;
        return '';
    }

    root.SvfChart = { RATING, INK, MUTED, GRID, NAVY, FONT, download, canvasPng, svgPng, imageUrl };
})(typeof window !== 'undefined' ? window : this);
