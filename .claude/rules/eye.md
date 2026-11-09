---
paths:
  - "js/eye*.js"
  - "js/lesson-guide*.js"
  - "js/jump-core.js"
  - "cam.html"
  - "try-eye.html"
  - "tests/eye.test.js"
  - "tests/jump.test.js"
  - "vendor/**/*"
  - "tools/claude-draft/**/*"
---

# عين المشرف — ما يلزم قبل أيّ تعديل

- اقرأ `docs/claude/eye.md` (الفهرس) ثمّ الجزء الذي يخصّ ما تعدّله من `docs/claude/eye/`.
- **لأسعد وحده** (`EYE_OWNERS` في `js/gate.js`). ما يدخل «نموذج التقييم» المشترك أو الأرشيف يمرّ بـ`EYE_OK()`،
  وغيره من المشرفين يبقى على النظام السابق تماماً — ولو فتح تقريراً فيه `#eyeData`.
- **لا يُحفظ إطارٌ ولا صوت**: لا `toDataURL` ولا `MediaRecorder` في وحدات العين (الاختبار يفحص ذلك). يُحفظ أرقامٌ وحالاتٌ في `#eyeData`.
- `js/eye-core.js` و`js/eye-speech.js` و`js/eye-draft.js` نقيّةٌ تُصدَّر لـnode — لا DOM فيها. الواجهة في `js/eye.js`.
- التحليلات التجريبيّة من الكاميرا تمرّ بعلَم «الأدوات المتقدّمة» (`ADV`/`isAdv()` في النواة، `eyeAdv` في `svf_eye_prefs`، مطفأٌ افتراضاً).
- كلّ ميزةٍ جديدة لها قسمٌ مرقّمٌ جديد في `tests/eye.test.js`، ثمّ `node --check js/*.js` و`node tests/eye.test.js`.
- العتبات أوّليّة ولم تُجرَّب في حصةٍ حقيقيّة — قل ذلك للمشرف.
