---
paths:
  - "site-shell.html"
  - "*.html"
  - "styles.css"
  - "js/svf-theme.js"
---

# القشرة والواجهة

- `site-shell.html` مصدرٌ يُنسخ **حرفيّاً** إلى `reports.html` و`monthly.html` و`letters.html` وصفحاتٍ في `plan-mct` و`teacher-data-collection`
  (منها `data.html`)، بين علامتَي `<!-- قشرة الموقع` و`<!-- /svf-shell -->`، والعلامات تُطلب **في أوّل السطر**. وعبارة الحقوق بين
  `<!-- svf-credit -->` و`<!-- /svf-credit -->` تُنسخ قبل آخر `</body>`. التفاصيل في `docs/claude/ui-shell.md`.
- **قاعدة الزجاج:** كلّ `bg-white` يصير شفّافاً بـ`!important` والقشرة بعد Tailwind — الملوّن أو الطافي يحتاج `!important` وخصوصيّةً أعلى.
- اللون: كحليّ `#0f4c81` للفعل، `#082742` لشريط الهويّة، ذهبيّ `#f0b44a` للتركيز ولجسر بوّابة الوزارة وحده (`.svf-btn-moe`). لا تدرّجات ولا emoji.
- الخطّ على الشاشة IBM Plex Sans Arabic، والطباعة وPDF Tajawal. وتقارير الزيارات أوراقٌ رسميّة: عبارة الحقوق تُخفى عند الطباعة.
- أيّ نصٍّ في `innerHTML` يمرّ بـ`svfEscapeHtml`، وافحص على عرض ٣٩٠ و١٤٤٠ بلا فيضٍ أفقيّ.
