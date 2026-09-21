// =========================================================================
// خطّ سير اليوم في الزيارات المدرسيّة
//
// حين تكون للمشرف أكثر من زيارةٍ في اليوم يكتب في **آخر الأهداف** سطراً:
//     #قادم من مدرسة …        و/أو        #متجه إلى مدرسة …
//
// يُخزَّن اسما المدرستين حقلَين في التقرير (cameFrom / goingTo) ولا يدخلان
// `report.objectives`:
//   • `restoreSchoolObjectives` تنبّه على كلّ هدفٍ محفوظٍ لا تجده في قائمة
//     النوع، فسطرٌ كهذا كان سيُنبَّه عليه في كلّ فتحٍ للتقرير؛
//   • ولا يصحّ أن يُحتسب هدفاً في التحقّق قبل الرفع (`schoolValidate`).
// وإنّما يُلحقان بالمصفوفة المرسَلة إلى البوّابة عند التصدير فقط، فيكتبهما
// السكربت بعد الأهداف — يدمج المصفوفة بسطرٍ لكلّ عنصر، فلا يلزمه تغييرٌ في
// مسار الطابور.
//
// هذا هو المصدر الوحيد للصياغة في الموقع. السكربت
// (school-visits-automation.user.js) مستقلٌّ عن الموقع فله نسخته من
// routeName/routeLines، و tests/route.test.js يقارن النسختين على المدخلات نفسها.
// =========================================================================
(function (global) {
    'use strict';

    // جهةٌ تبدأ بإحدى هذه لا تُسبَق بـ«مدرسة»: قد يكون المقصد إدارةً أو مركزاً
    const OWN_KIND = /^(مدرسة|مدارس|معهد|مركز|كلية|روضة|إدارة|دائرة|مديرية)(\s|$)/;
    // «(1-12)»: نطاق الصفوف يلحق اسم المدرسة في الموقع ولا يُكتب في السطر
    const GRADE_RANGE = /\s*\(\s*[\d٠-٩]+\s*[-–]\s*[\d٠-٩]+\s*\)\s*$/;

    // اسم الجهة كما يُكتب في السطر: مُسوّى المسافات، بلا نطاق الصفوف، وبـ«مدرسة» أوّلاً
    function routeName(name) {
        let n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().replace(GRADE_RANGE, '').trim();
        if (!n) return '';
        return OWN_KIND.test(n) ? n : 'مدرسة ' + n;
    }

    // الاسم دون بادئة «مدرسة» — ما يوضع في الخانة (الخانة عنوانها «قادم من»)
    function bareName(name) {
        let n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().replace(GRADE_RANGE, '').trim();
        return n;
    }

    // الأسطر المُلحقة: قادم من ثمّ متجه إلى، وما ليس له اسمٌ يُحذف
    function routeLines(cameFrom, goingTo) {
        const a = routeName(cameFrom), b = routeName(goingTo);
        const out = [];
        if (a) out.push('#قادم من ' + a);
        if (b) out.push('#متجه إلى ' + b);
        return out;
    }

    // الأهداف الحقيقيّة تُكتب نصّاً لا يبدأ بـ«#»؛ فالسطر الذي يبدؤها خطّ سير لا هدف
    function isRouteLine(s) { return String(s == null ? '' : s).trim().charAt(0) === '#'; }
    function realObjectives(list) { return (Array.isArray(list) ? list : []).filter(o => !isRouteLine(o)); }

    // المصفوفة المرسَلة إلى البوّابة: الأهداف ثمّ خطّ السير. آمنةٌ لو كانت الأسطر فيها سلفاً
    function withRoute(objectives, cameFrom, goingTo) {
        return realObjectives(objectives).concat(routeLines(cameFrom, goingTo));
    }

    const api = { routeName, bareName, routeLines, isRouteLine, realObjectives, withRoute };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.SchoolRoute = api;
})(typeof window !== 'undefined' ? window : globalThis);
