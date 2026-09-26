// اختبار انحدار: node tests/manual-confirm.test.js
// زرّ «تأكيد الحفظ يدويّاً» — لمن لم يصله الكشف التلقائيّ (سكربت تامبر مانكي
// على جهازٍ آخر، أو غير مثبَّت) فيبقى أرشيفه بلا وسم «حُفظت في البوابة» رغم
// أنّ الزيارة حُفظت فعلاً. يكتب المفتاح نفسه الذي يكتبه الكشف التلقائيّ
// (svf_sent_visits / svf_sent_school_visits)، فيتوحّد المصدران.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ── ١) svfMarkSent / svfSchoolMarkSent يكتبان المفتاح الذي تقرؤه svfIsSent / svfSchoolIsSent ── */
{
    const store = new Map();
    const localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        get length() { return store.size; }, key: i => [...store.keys()][i]
    };
    const ctx = { localStorage, console, document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/queue-export.js'), 'utf8'), ctx);

    check('svfIsSent قبل التأكيد: لا شيء', ctx.svfIsSent('أحمد', '25/09/2026') === false);
    ctx.svfMarkSent([{ teacher: 'أحمد', date: '25/09/2026' }]);
    check('svfMarkSent: svfIsSent يعود صحيحاً بعده بالمفتاح نفسه', ctx.svfIsSent('أحمد', '25/09/2026') === true);
    check('svfMarkSent: لا يمسّ زيارةً أخرى', ctx.svfIsSent('فاطمة', '25/09/2026') === false);

    check('svfSchoolIsSent قبل التأكيد: لا شيء', ctx.svfSchoolIsSent('مدرسة الأمل', '25/09/2026') === false);
    ctx.svfSchoolMarkSent([{ school: 'مدرسة الأمل', date: '25/09/2026' }]);
    check('svfSchoolMarkSent: svfSchoolIsSent يعود صحيحاً بعده', ctx.svfSchoolIsSent('مدرسة الأمل', '25/09/2026') === true);
    check('svfSchoolMarkSent: مفتاحه مستقلٌّ عن svf_sent_visits الإشرافيّ', ctx.svfIsSent('مدرسة الأمل', '25/09/2026') === false);
}

/* ── ٢) الربط في export.js/school.js: الزرّ يظهر حين لا تكون محفوظةً، ويختفي حين تكون ── */
{
    const exp = fs.readFileSync(path.join(ROOT, 'js/export.js'), 'utf8').replace(/\r\n/g, '\n');
    const sch = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8').replace(/\r\n/g, '\n');

    check('export.js: confirm-sent-btn داخل الفرع "غير محفوظة" لا الفرع "محفوظة"',
          /if \(window\.svfIsSent[\s\S]{0,300}\} else \{[\s\S]{0,900}confirm-sent-btn/.test(exp));
    check('export.js: الزرّ يحمل المعلّم والتاريخ نفسيهما اللذين تُبنى منهما svfIsSent',
          /data-teacher="\$\{attrTeacher\}" data-date="\$\{attrDate\}"/.test(exp)
          && /const attrTeacher = String\(tName\)/.test(exp) && /const attrDate = String\(portalDate\)/.test(exp));

    check('school.js: confirm-sent-school-btn داخل الفرع "غير محفوظة" لا الفرع "محفوظة"',
          /if \(window\.svfSchoolIsSent[\s\S]{0,300}\} else \{[\s\S]{0,900}confirm-sent-school-btn/.test(sch));
    check('school.js: الزرّ يحمل المدرسة والتاريخ نفسيهما اللذين تُبنى منهما svfSchoolIsSent',
          /data-school="\$\{attrSchool\}" data-date="\$\{attrDate\}"/.test(sch)
          && /const attrSchool = String\(report\.schoolName/.test(sch));
}

/* ── ٣) الربط في init.js: النقر يستدعي svfMarkSent/svfSchoolMarkSent ثمّ يُعيد الرسم ── */
{
    const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8').replace(/\r\n/g, '\n');

    check('init.js: نقر confirm-sent-btn يستدعي svfMarkSent بالمعلّم والتاريخ من data-* ثمّ يُعيد الرسم',
          /confirmBtn = e\.target\.closest\('\.confirm-sent-btn'\)/.test(init)
          && /window\.svfMarkSent\(\[\{ teacher: confirmBtn\.dataset\.teacher, date: confirmBtn\.dataset\.date \}\]\);\n\s*renderSavedReports\(\);/.test(init));

    check('init.js: نقر confirm-sent-school-btn يستدعي svfSchoolMarkSent بالمدرسة والتاريخ من data-* ثمّ يُعيد الرسم',
          /confirmBtn = e\.target\.closest\('\.confirm-sent-school-btn'\)/.test(init)
          && /window\.svfSchoolMarkSent\(\[\{ school: confirmBtn\.dataset\.school, date: confirmBtn\.dataset\.date \}\]\);\n\s*renderSchoolReportsList\(\);/.test(init));
}

console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
