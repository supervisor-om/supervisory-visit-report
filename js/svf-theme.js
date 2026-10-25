// =========================================================================
//  لوحة ألوان المنظومة لـ Tailwind — مصدرٌ واحدٌ لصفحات هذا النطاق
//  (reports.html · monthly.html · letters.html). يُحمَّل بعد سكربت Tailwind
//  مباشرةً وقبل أيّ محتوى، ويحلّ محلّ كتلة tailwind.config التي كانت في رأس كلّ صفحة.
//
//  لماذا إعادة توجيه الألوان لا تعديل الأصناف؟ الواجهة تحمل مئات الأصناف
//  الملوّنة (indigo/purple/teal/cyan/pink/orange…) في HTML وفي ما تبنيه ملفّات
//  js/ عند التشغيل، فكانت الصفحة الواحدة تخرج بسبعة ألوانٍ متنافرة. هنا تُردّ
//  العائلات كلّها إلى أربعٍ دلاليّة:
//      blue  ← الفعل الرئيسيّ (كحليّ المنظومة)  ← indigo · violet · purple · sky · cyan · teal
//      amber ← التنبيه والتمييز (ذهبيّ)         ← orange · yellow
//      green ← النجاح والاكتمال (أخضر غامق)     ← emerald · lime
//      red   ← الخطر والحذف (طوبيّ)            ← rose · pink · fuchsia
//  والرماديّات كلّها ← slate. فأيّ صنفٍ يُكتب لاحقاً يقع في اللوحة تلقائيّاً.
//
//  الكحليّ والذهبيّ هما لونا أيقونة المنظومة (icons/) وشريط المتصفّح (theme-color).
//  ألوان سلّم التقييم الخمسة في styles.css بقيمٍ صريحة، وهي نفسها SVF_COLORS.rating
//  هنا (للرسوم البيانيّة) — عدّلهما معاً.
// =========================================================================
(function () {
    'use strict';

    var blue  = { 50: '#eef4f9', 100: '#d8e6f2', 200: '#b3cce4', 300: '#85acd1', 400: '#4f87b8', 500: '#2a6a9e', 600: '#0f4c81', 700: '#0c3e6a', 800: '#0a3256', 900: '#082742', 950: '#061c30' };
    var gold  = { 50: '#fbf7ee', 100: '#f5ead2', 200: '#ead3a3', 300: '#ddb96f', 400: '#d0a14a', 500: '#b98a32', 600: '#9a6f24', 700: '#7a571f', 800: '#63461d', 900: '#523a1b', 950: '#2e1f0c' };
    var green = { 50: '#eff6f1', 100: '#d9ebdf', 200: '#b5d6c0', 300: '#86ba9b', 400: '#579a75', 500: '#367d59', 600: '#246445', 700: '#1d5139', 800: '#19412f', 900: '#153627', 950: '#0a1e15' };
    var red   = { 50: '#fcf0ef', 100: '#f8dcd9', 200: '#f0b9b3', 300: '#e38c83', 400: '#d1645a', 500: '#bb463b', 600: '#9e352c', 700: '#832b25', 800: '#6b2622', 900: '#5a2320', 950: '#31100e' };
    var slate = { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' };

    // سلّم التقييم مقلوب: 1 متميّز … 5 تدخّل سريع
    var rating = { 1: '#1d6b45', 2: '#0f4c81', 3: '#9a6f24', 4: '#b5452f', 5: '#7a2320' };

    var colors = {
        primary: blue[600], secondary: green[600], accent: gold[600], danger: red[600],
        blue: blue, indigo: blue, violet: blue, purple: blue, sky: blue, cyan: blue, teal: blue,
        amber: gold, orange: gold, yellow: gold,
        green: green, emerald: green, lime: green,
        red: red, rose: red, pink: red, fuchsia: red,
        slate: slate, gray: slate, zinc: slate, neutral: slate, stone: slate
    };

    // متاحةٌ لمن يحتاج القيم في JS (الرسوم البيانيّة مثلاً)
    window.SVF_COLORS = { blue: blue, gold: gold, green: green, red: red, slate: slate, rating: rating };

    var config = {
        theme: {
            extend: {
                fontFamily: {
                    sans: ['IBM Plex Sans Arabic', 'Segoe UI', 'Tahoma', 'sans-serif'],
                    serif: ['Noto Naskh Arabic', 'serif']
                },
                colors: colors
            }
        }
    };
    window.SVF_TAILWIND = config;
    if (window.tailwind) window.tailwind.config = config;
})();
