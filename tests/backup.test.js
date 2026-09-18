// اختبار انحدار للنسخة الاحتياطيّة وحراسة التخزين: node tests/backup.test.js
//   ١) ما يدخل النسخة وما لا يدخل — تأكيدات البوّابة تدخل، وبيانات المعلمين لا
//   ٢) الاستيراد: سجلٌّ يفشل لا يقطع الباقي، والرسالة تقول الحقيقة
//   ٣) الكتابة المحروسة: امتلاء التخزين يُبلَّغ به ولا يُسكت عنه
//   ٤) التوصيل: مواضع الكتابة العارية لم تعد موجودة
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

function makeEnv(opts) {
    const o = opts || {};
    const store = new Map(Object.entries(o.storage || {}));
    const toasts = [];
    let blob = null, downloadName = '';
    const localStorage = {
        get length() { return store.size; },
        key: i => [...store.keys()][i],
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => {
            if (o.full && !String(k).startsWith('__')) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
            if (o.failOn && o.failOn(k)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
            store.set(k, String(v));
        },
        removeItem: k => store.delete(k)
    };
    const el = { click() { downloadName = this.download; }, set href(v) {}, download: '' };
    const ctx = {
        window: {}, console, localStorage,
        showToast: (m, t) => toasts.push({ m, t }),
        Blob: function (parts, opt) { this.parts = parts; this.type = opt && opt.type; blob = this; },
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
        FileReader: function () {
            this.readAsText = f => { this.onload({ target: { result: f } }); };
        },
        document: {
            createElement: () => el,
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => []
        },
        renderSavedReports: () => {},
        renderSchoolReportsList: () => {},
        loadSchoolVisitTypes: () => {},
        // ما تحتاجه export.js عند التحميل فقط
        evaluationItems: [], schoolClassroomVisits: [], schoolTeachers: [],
        getReportHTML: () => '', htmlDocx: { asBlob: () => ({ size: 1 }) }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'), ctx);
    // showToast الحقيقيّة تحتاج عناصر الصفحة وتصمت بدونها — تُستبدل بمسجّلٍ بعد التحميل
    ctx.showToast = (m, t) => toasts.push({ m, t });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/export.js'), 'utf8'), ctx);
    return { ctx, store, toasts, blobOf: () => blob, nameOf: () => downloadName };
}

const FULL_STORE = {
    'supervision_v6_visit_1': '{"teacherName":"سارة"}',
    'supervision_v6_school_report_1': '{"schoolName":"الوفاء"}',
    'supervision_v6_school_visit_types': '{"gov":{}}',
    'supervision_v6_school_roster_مدرسة الوفاء': '[]',
    'visit_v5_old': '{}',
    'svf_sent_visits': '["سارة|10/09/2026"]',
    'svf_sent_school_visits': '["الوفاء|10/09/2026"]',
    'svf_queued_visits': '["supervision_v6_visit_1"]',
    'svf_queued_school': '[]',
    'svf_recs_equipment': '["أقماع"]',
    'svf_monthly_prefix_asad': '6- أسعد',
    'svf_monthly_plan_id_asad': '6',
    'svf_identity': '{"id":"asad"}',
    'svf_teachers_cache_asad': '{"teachers":[{"name":"سارة","fileNumber":"1"}]}',
    'svf_cloud_last': '123456',
    'svf_monthly_plan_6_2026_5': '{"visits":{}}'
};

/* ── ١) ما يدخل النسخة ── */
{
    const env = makeEnv({ storage: FULL_STORE });
    env.ctx.exportBackup();
    const json = JSON.parse(env.blobOf().parts[0]);
    const keys = Object.keys(json);
    check('النسخة تحمل التقارير', keys.includes('supervision_v6_visit_1') && keys.includes('supervision_v6_school_report_1'));
    check('وتأكيدات البوّابة — وهي مربط الفرس',
          keys.includes('svf_sent_visits') && keys.includes('svf_sent_school_visits'), JSON.stringify(keys));
    check('ووسوم «سبق رفعها»', keys.includes('svf_queued_visits') && keys.includes('svf_queued_school'));
    check('وأدوات منشئ التوصيات وتفضيلات التقرير الشهري',
          keys.includes('svf_recs_equipment') && keys.includes('svf_monthly_prefix_asad') && keys.includes('svf_monthly_plan_id_asad'));
    check('وأنواع الزيارات وطاقم المدرسة', keys.includes('supervision_v6_school_visit_types') &&
          keys.some(k => k.startsWith('supervision_v6_school_roster_')));
    check('والصيغة القديمة visit_v5_ لا تُترك', keys.includes('visit_v5_old'));

    check('ولا تُصدَّر نسخة المعلمين — فيها بياناتهم', !keys.includes('svf_teachers_cache_asad'), JSON.stringify(keys));
    check('ولا الهويّة — الربط يُعاد برمز', !keys.includes('svf_identity'));
    check('ولا توقيت المزامنة — يُربك جهازاً آخر', !keys.includes('svf_cloud_last'));
    check('ولا نسخة الخطة المؤقّتة', !keys.includes('svf_monthly_plan_6_2026_5'));
    check('واسم الملف بالتاريخ', /^نسخة_احتياطية_\d{4}-\d{2}-\d{2}\.json$/.test(env.nameOf()), env.nameOf());
}
{
    const env = makeEnv({ storage: { 'svf_identity': '{}' } });
    env.ctx.exportBackup();
    check('بلا بياناتٍ: لا تُنشأ نسخةٌ فارغة', env.toasts.some(t => t.t === 'error'), JSON.stringify(env.toasts));
}

/* ── ٢) الاستيراد ── */
{
    const env = makeEnv({ storage: {} });
    const file = JSON.stringify(FULL_STORE);
    env.ctx.importBackup(file);
    check('الاستيراد يُرجع التقارير والتأكيدات',
          env.store.has('supervision_v6_visit_1') && env.store.has('svf_sent_visits'));
    check('ولا يُدخل ما ليس من النسخة', !env.store.has('svf_identity') && !env.store.has('svf_cloud_last'));
    check('ويُعلن العدد', env.toasts.some(t => /تم استيراد \d+ سجل/.test(t.m)), JSON.stringify(env.toasts));
}
{
    // سجلٌّ واحدٌ يفشل: الباقي يجب أن يمضي
    const env = makeEnv({ storage: {}, failOn: k => k === 'supervision_v6_school_report_1' });
    env.ctx.importBackup(JSON.stringify(FULL_STORE));
    check('فشلُ سجلٍّ لا يقطع الباقي', env.store.has('supervision_v6_visit_1') && env.store.has('svf_sent_visits'),
          [...env.store.keys()].join(','));
    check('ويُقال كم فشل ولماذا',
          env.toasts.some(t => /تعذّر 1/.test(t.m) && /ممتلئة/.test(t.m)), JSON.stringify(env.toasts));
    check('ولا تُنسب العلّة إلى الملف',
          !env.toasts.some(t => /تعذّرت قراءة الملف/.test(t.m)), JSON.stringify(env.toasts));
}
{
    const env = makeEnv({ storage: {} });
    env.ctx.importBackup('{ليس JSON');
    check('ملفٌّ تالف: رسالةٌ تدلّ على الملف نفسه',
          env.toasts.some(t => /تعذّرت قراءة الملف/.test(t.m) && t.t === 'error'), JSON.stringify(env.toasts));
}

/* ── ٣) الكتابة المحروسة ── */
{
    const env = makeEnv({ storage: {}, full: true });
    const ok = env.ctx.svfSafeSet('supervision_v6_school_visit_types', '{}', 'أنواع الزيارات');
    check('الكتابة الفاشلة تُرجع false', ok === false);
    check('وتُبلَّغ للمستخدم بما فشل',
          env.toasts.some(t => t.t === 'error' && /أنواع الزيارات/.test(t.m) && /نسخةً احتياطيّة/.test(t.m)),
          JSON.stringify(env.toasts));
    const env2 = makeEnv({ storage: {} });
    check('والناجحة تُرجع true وتكتب', env2.ctx.svfSafeSet('k', 'v') === true && env2.store.get('k') === 'v');
    check('ولا تُزعج المستخدم عند النجاح', env2.toasts.length === 0);
}

/* ── ٤) التوصيل ── */
{
    const init = fs.readFileSync(path.join(ROOT, 'js/init.js'), 'utf8');
    const school = fs.readFileSync(path.join(ROOT, 'js/school.js'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const monthly = fs.readFileSync(path.join(ROOT, 'monthly.html'), 'utf8');
    check('wiring: لا كتابة عارية لأنواع الزيارات',
          !/localStorage\.setItem\('supervision_v6_school_visit_types'/.test(init) &&
          !/localStorage\.setItem\(newKey/.test(school));
    check('wiring: والمواضع الأربعة محروسة',
          (init.match(/svfSafeSet\('supervision_v6_school_visit_types'/g) || []).length === 2 &&
          (school.match(/svfSafeSet\(newKey/g) || []).length === 2);
    check('wiring: عامل الخدمة يخزّن مكتبة الحزمة', /jszip\.min\.js/.test(sw));
    check('wiring: ورقم النسخة رُفع', /const VERSION = 'v8'/.test(sw));
    check('wiring: أيقونة للصفحتين', /rel="icon"/.test(html) && /rel="icon"/.test(monthly));
    check('wiring: الملفّات الداخليّة مستثناةٌ من النشر',
          fs.existsSync(path.join(ROOT, '_config.yml')) &&
          /CLAUDE\.md[\s\S]*tests\//.test(fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8')));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
