// اختبار: node tests/license.test.js
// v17.1: السكربت لا يعمل في البوّابة إلّا بعد الدخول إلى الموقع برمز مشرف (طلب أسعد 2026-10-11).
const fs = require('fs');
const vm = require('vm');
const SRC = fs.readFileSync(require('./_script-src.js'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};
const between = (a, b) => {
    const i = SRC.indexOf(a), j = SRC.indexOf(b, i);
    if (i < 0 || j < 0) throw new Error('marker not found: ' + a);
    return SRC.slice(i, j);
};

function env(siteSession, now) {
    const gm = {}, ls = {};
    if (siteSession !== undefined) ls.svf_gate = typeof siteSession === 'string' ? siteSession : JSON.stringify(siteSession);
    const appended = [];
    const ctx = {
        GM_getValue: (k, d) => (k in gm ? gm[k] : d), GM_setValue: (k, v) => { gm[k] = v; },
        localStorage: { getItem: k => (k in ls ? ls[k] : null) },
        Date: { now: () => now || 1e12 },
        document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild: x => appended.push(x) } }
    };
    vm.createContext(ctx);
    vm.runInContext(between('// ═══ التفعيل برمز المشرف (v17.1) ═══', 'function svfSyncSaved()')
        + '\nthis.act = svfActivateFromSite; this.lic = svfLicense; this.notice = svfLicenseNotice;', ctx);
    return { ctx, gm, appended };
}
const HASH = 'a'.repeat(64);

let e = env({ id: 'asad', name: 'أسعد', hash: HASH, at: 1 });
check('activate: جلسة موقعٍ صالحة تُفعّل', e.ctx.act() === true && e.ctx.lic() && e.ctx.lic().id === 'asad');
check('activate: لا يُحفظ إلّا المعرّف والاسم والبصمة والوقت', Object.keys(JSON.parse(e.gm.svf_license)).sort().join() === 'at,hash,id,name');

e = env(undefined);
check('activate: بلا دخولٍ لا تفعيل', e.ctx.act() === false && e.ctx.lic() === null);
check('activate: جلسةٌ معبوثٌ بها (بصمةٌ غير صالحة) لا تُفعّل', env({ id: 'x', hash: '123' }).ctx.act() === false);
check('activate: نصٌّ تالف لا يكسر', env('{نص').ctx.act() === false);

// الصلاحية ٤٥ يوماً من آخر فتحٍ للموقع
const day = 864e5;
e = env({ id: 'hind', hash: HASH }, 1e12);
e.ctx.act();
const stored = e.gm.svf_license;
const later = days => { const x = env(undefined, 1e12 + days * day); x.gm.svf_license = stored; return x.ctx.lic(); };
check('expiry: بعد ٤٤ يوماً ما زال مفعّلاً', !!later(44));
check('expiry: بعد ٤٦ يوماً ينتهي', later(46) === null);

check('notice: الإشعار يُعرض ويدلّ على الموقع', (() => { const x = env(undefined); x.ctx.notice();
    return x.appended.length === 1 && /supervisor-mct\.com/.test(x.appended[0].innerHTML); })());

// التوصيل
check('wiring: الموقع يفعّل عند التحميل والعودة وبعد الدخول',
      /svfActivateFromSite\(\);\s*\n\s*window\.addEventListener\('focus', svfActivateFromSite\);/.test(SRC)
      && /setInterval\(\(\) => \{ if \(svfActivateFromSite\(\)/.test(SRC));
check('wiring: وحدة الزيارات المدرسيّة لا تعمل بلا تفعيل',
      /if \(!svfLicense\(\)\) \{ if \(\/schoolvisits\/i\.test\(location\.pathname\)\) svfLicenseNotice\(\); return; \}/.test(SRC));
check('wiring: ووحدة الإشرافيّة كذلك (والمحاكاة مستثناة للاختبار)',
      /if \(!svfLicense\(\) && !\/sim-moe\/i\.test\(location\.pathname\)\) \{ svfLicenseNotice\(\); return; \}/.test(SRC));
check('wiring: الفحص قبل أيّ عملٍ في الوحدتين', (() => {
    const school = SRC.indexOf("if (location.hostname.includes('moe.gov.om') && !IS_DMS && !/supervisionvisits/i.test(location.pathname)) {");
    const sup = SRC.indexOf("&& /supervisionvisits/i.test(location.pathname)) {");
    return school > 0 && SRC.indexOf('if (!svfLicense())', school) - school < 400 && SRC.indexOf('if (!svfLicense() &&', sup) - sup < 200;
})());
// نظام المراسلات (v17.3): نطاقٌ فرعيّ يُستثنى من الوحدتين، ووحدته تفحص الترخيص قبل اللوحة
check('dms: مستثنى من وحدتي البوّابة', /&& !IS_DMS && !\/supervisionvisits\/i/.test(SRC) && /\(location\.hostname\.includes\('moe\.gov\.om'\) && !IS_DMS\)/.test(SRC));
check('dms: الترخيص قبل اللوحة، ولا ضغط «إرسال»', /if \(!svfLicense\(\)\) \{ svfLicenseNotice\(\); return; \}\s*\n\s*panel\(L\);/.test(SRC)
    && !/إرسال['"]\)\.click|\.click\(\)[^\n]*إرسال/.test(SRC.slice(SRC.indexOf('if (IS_DMS) {'))));
check('dms: @match', /\/\/ @match\s+https:\/\/dms\.moe\.gov\.om\/\*/.test(SRC));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
