# الحالة والمتبقّي

> نُقل حرفيّاً من `CLAUDE.md` في 2026-11-09 حين صار الملفّ أكبر من أن يُقرأ في كلّ جلسة. **أضف هنا ما يخصّ هذا الموضوع**، لا في `CLAUDE.md`.

## الحالة الآن

المسار يعمل من الضغطة الأولى حتّى مرحلة التقييم. المتبقّي:

1. **تبويب المهارات التخصصيّة** (٢١ مهارة) لا يقابله شيء في الموقع — يحتاج حقولاً جديدة.
2. **اختبار انحدار** على المحاكاة قبل كلّ إصدار، ومعه `node tests/queue-and-config.test.js`
   و`node tests/identity.test.js` و`node tests/cloud.test.js` و`node tests/monthly.test.js`
   و`node tests/term-board.test.js`
   و`node tests/recs.test.js` و`node tests/classroom.test.js` و`node tests/objectives.test.js` و`node tests/route.test.js`
   و`node tests/sanitize-portal.test.js` و`node tests/manual-confirm.test.js` و`node tests/supervisory-form.test.js` و`node tests/school-overlap.test.js` و`node tests/term-plan.test.js` و`node tests/portal-names.test.js` و`node tests/data-quality.test.js` و`node tests/teacher-brief.test.js` و`node tests/gender-regen.test.js` و`node tests/recs-v2.test.js` و`node tests/letters.test.js` و`node tests/debrief.test.js` و`node tests/eye.test.js` و`node tests/same-day-visits.test.js` و`node tests/dash.test.js` و`node tests/queue-continue.test.js` و`node tests/school-wilaya.test.js` و`node tests/evidence.test.js` و`node tests/jump.test.js`.
   ملف المحاكاة نفسه لم يُرفع بعد.
3. **مطابقة الدرجة لها ملاذٌ أخيرٌ بالموضع** (`opts[Number(v)]` في تعبئة البنود) — تخمينٌ
   يخالف قاعدة «لا تخمين لسلّم التقييم». يُراجَع حين يُطبع سلّم البوّابة الحقيقيّ من التشخيص.
4. **وسم «حُفظت»** يطابق بالاسم والتاريخ بعد التسوية (2026-10-08)، ولكلّ تقريرٍ بمفتاحه منذ v17.4 (2026-10-26). ما حُفظ قبلها
   لتوأمين في يومٍ واحد يبقى ملتبساً حتّى يُؤكَّد يدويّاً.
5. **أمان:** بيانات دخول البوّابة كانت بنصٍّ صريحٍ في ملف مهارة `supervisory-report` —
   يجب حذفها وتغيير كلمة المرور. السكربت يخزّنها في تامبر مانكي لا في الشيفرة.

## اختباراتٌ راسبة قبل النقل إلى هذا التنظيم (2026-11-09)

وُجدت راسبةً على `main` قبل تقسيم `CLAUDE.md` (فُحص بإرجاع التغيير) — أثرُ تعديلاتٍ بعد 2026-10-30 لا أثرُ النقل:
- `tests/school-escape.test.js` — `document.createTextNode is not a function` (الـDOM المصغّر في الاختبار ينقصه ما صارت الشيفرة تستعمله).
- `tests/supervisory-fixes.test.js` — `checkbox.setAttribute is not a function` (مثله).
- `tests/supervisory-form.test.js` — «تصدير Word (المفرد والمرفقات): الهامش العلويّ 360 كالقالب».
