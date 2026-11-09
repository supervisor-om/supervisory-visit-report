---
paths:
  - "tools/daf51553aa5f5d6215/**/*"
  - "school-visits-automation.user.js"
  - "selectors.json"
  - "school-map.json"
  - "js/queue-export.js"
  - "js/export.js"
  - "tests/portal-save.test.js"
  - "tests/_script-src.js"
---

# سكربت تامبر مانكي وبوّابة الوزارة

- **لا تعدّل `tools/daf51553aa5f5d6215/school-visits-automation.user.js`** — ناتج بناءٍ معمًّى. المصدر في المستودع الخاصّ
  `supervisor-om/svf-userscript` (على جهاز المشرف `C:\Users\PC10\svf-userscript`): عدّل هناك ← ارفع `@version` ← `npm run build`
  ← `node test/equivalence.test.mjs` هناك واختبارات هذا المستودع ← commit وpush في المستودعين.
- `school-visits-automation.user.js` في الجذر ملفٌّ نصّيٌّ يشرح النقل، **ليس سكربتاً** — لا تُرجعه سكربتاً.
- السجلّ في البوّابة رسميّ باسم المشرف: لا حفظ قبل اكتمال التحقّق، ولا تخمين لسلّم التقييم، ولا توزيع نصوصٍ بالترتيب.
- كلّ كتابةٍ في حقول البوّابة تمرّ بـ`sanitizeForPortal()`؛ وما تحتاجه الوحدتان (الإشرافيّة والمدرسيّة) يُعرَّف في المستوى المشترك.
- ما يُرسَل إلى البوّابة له ثلاثة مسارات تُعدَّل معاً: `js/export.js` و`js/queue-export.js` والسكربت (يعترض زرّ التصدير).
- قبل لمس منطق الحفظ أو البحث اقرأ `docs/claude/portal.md` و`docs/claude/portal-history.md` (وللمدرسيّة `docs/claude/school-portal.md`).
