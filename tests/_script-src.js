// مسار المصدر المقروء لسكربت الأتمتة (منذ 2026-10-11)
// المنشور في tools/… صار نسخةً معمّاة، والمقروء في المستودع الخاصّ supervisor-om/svf-userscript
// المستنسَخ بجانب هذا المستودع (../svf-userscript). اختبارات السكربت تقرأ المقروء.
// SVF_SCRIPT_SRC يغلب المسار الافتراضيّ. وبلا المصدر تُتخطّى الاختبارات بإعلانٍ صريح — لا تفشل صامتة.
const fs = require('fs');
const path = require('path');
const p = process.env.SVF_SCRIPT_SRC || path.join(__dirname, '..', '..', 'svf-userscript', 'school-visits-automation.user.js');
if (!fs.existsSync(p)) {
    console.log('SKIP: المصدر المقروء غير موجود (' + p + ') — استنسخ supervisor-om/svf-userscript بجانب هذا المستودع');
    console.log('\nALL PASS (skipped)');
    process.exit(0);
}
module.exports = p;
