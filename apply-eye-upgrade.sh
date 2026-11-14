#!/usr/bin/env bash
# سكربت الترقية والتنظيف الشامل لمشروع "عين المشرف" (Supervisor Eye v88)
# يقوم هذا السكربت بـ:
# 1. حذف صفحة try-eye.html وتنظيف الإشارات إليها في الاختبارات.
# 2. تحديث قائمة ملفات <script> في reports.html و index.html لتضمين جميع الوحدات الجديدة بالترتيب الصحيح.
# 3. تشغيل الاختبارات الآلية الشاملة للتأكد من سلامة جميع الوحدات قبل الرفع إلى GitHub.

set -euo pipefail
cd -- "$(dirname -- "$0")"

echo "=== 1. حذف صفحة try-eye.html إن وجدت ==="
if [ -f "try-eye.html" ]; then
  rm -- try-eye.html
  echo "✔ تم حذف try-eye.html"
fi

echo "=== 2. تحديث استدعاء السكربتات في reports.html ==="
if [ -f "reports.html" ]; then
  node -e '
    const fs = require("fs");
    let html = fs.readFileSync("reports.html", "utf8");
    const oldBlock = `<script src="js/eye-core.js"></script>`;
    const newBlock = [
      `<script src="js/eye-core.js"></script>`,
      `  <script src="js/eye-reid.js"></script>`,
      `  <script src="js/eye-formations.js"></script>`,
      `  <script src="js/eye-sofit.js"></script>`,
      `  <script src="js/eye-biomechanics.js"></script>`,
      `  <script src="js/eye-homography.js"></script>`,
      `  <script src="js/eye-hud.js"></script>`,
      `  <script src="js/eye-grow-bridge.js"></script>`
    ].join("\n");
    if (!html.includes("js/eye-reid.js") && html.includes(oldBlock)) {
      html = html.replace(oldBlock, newBlock);
      fs.writeFileSync("reports.html", html, "utf8");
      console.log("✔ تم إدراج جميع الوحدات السبع الجديدة في reports.html بعد js/eye-core.js");
    } else {
      console.log("ℹ الوحدات مضافة مسبقاً في reports.html");
    }
  '
fi

echo "=== 3. تحديث استدعاء جسر الربط في index.html ==="
if [ -f "index.html" ]; then
  node -e '
    const fs = require("fs");
    let html = fs.readFileSync("index.html", "utf8");
    if (!html.includes("js/eye-grow-bridge.js")) {
      const target = `<script src="js/debrief.js"></script>`;
      const replacement = `<script src="js/debrief.js"></script>\n  <script src="js/eye-grow-bridge.js"></script>`;
      if (html.includes(target)) {
        html = html.replace(target, replacement);
        fs.writeFileSync("index.html", html, "utf8");
        console.log("✔ تم ربط js/eye-grow-bridge.js مع تبويب المداولة الإشرافية في index.html");
      }
    }
  '
fi

echo "=== تشغيل اختبارات ترقية عين المشرف ==="
node tests/eye-upgrade.test.js
