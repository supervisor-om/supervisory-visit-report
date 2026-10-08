// اختبار: node tests/school-map.test.js
// v16.7: دليل مدارس البوّابة الموحّد ومسحه.
//   • schoolDirLookup: اسم الموقع ← اسم البوّابة الحرفيّ ونظامه (بديلٌ مثبَّت، أو مطابقةٌ وحيدةٌ في كلّ الأنظمة)
//   • runSchoolScan: يمرّ على الأنظمة ويجمع المدارس، ويُستأنف بعد إعادة تحميل الصفحة
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'tools/daf51553aa5f5d6215/school-visits-automation.user.js'), 'utf8')
    .replace(/\r\n/g, '\n');

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
const CODE = between('function normEdu(v)', '// أسماء أنظمة التعليم')
    + between('// ═══ دليل مدارس البوّابة الموحّد (v16.7) ═══', '// ─── حالة البحث تبقى في الجلسة ───')
    + between('// ═══ مسح مدارس البوّابة (v16.7) ═══', '// كلماتٌ عامّةٌ لا تميّز')
    + between('// كلماتٌ عامّةٌ لا تميّز', '// للتوافق مع ما يستدعيها');

/* ── ١) البحث في الدليل ── */
{
    const ctx = { GM_getValue: (k, d) => d, GM_setValue() {} };
    vm.createContext(ctx);
    vm.runInContext('function normEdu(v){return v}\n'.slice(0, 0) + CODE + '\nthis.lookup = schoolDirLookup;', ctx);
    const MAP = {
        schools: [
            { portal: 'الاجيال العصريه الدوليه الخاصه', system: 'ثنائي اللغة' },
            { portal: 'نور الاسلام الخاصه', system: 'ثنائي اللغة خاص' },
            { portal: 'يزيد بن حاتم الازدى للبنين الصفوف(9-12)', system: 'عام' },
            { portal: 'الاوائل الخاصه فرع الحيل', system: 'دولي' },
            { portal: 'الاوائل الخاصه فرع الخوض', system: 'دولي' },
            { portal: 'الصحوة الخاصة', system: 'دولي' }
        ],
        aliases: { 'al sahwa schools': 'الصحوة الخاصة' }
    };
    let r = ctx.lookup('الأجيال العصرية الدولية (1-12)', MAP);
    check('lookup: «الأجيال العصرية الدولية (1-12)» ← اسم البوّابة ونظامها',
          r && r.portal === 'الاجيال العصريه الدوليه الخاصه' && r.system === 'ثنائي اللغة', JSON.stringify(r));
    r = ctx.lookup('نور الإسلام الخاصة', MAP);
    check('lookup: الهمزة والتاء المربوطة لا تمنعان', r && r.system === 'ثنائي اللغة خاص');
    r = ctx.lookup('Al Sahwa Schools', MAP);
    check('lookup: الاسم الإنجليزيّ بالبديل المثبَّت', r && r.portal === 'الصحوة الخاصة' && r.via === 'alias', JSON.stringify(r));
    check('lookup: فرعان بالاسم نفسه ← لا اختيار', ctx.lookup('الاوائل الخاصة', MAP) === null);
    r = ctx.lookup('الاوائل الخاصه فرع الخوض', MAP);
    check('lookup: والفرع المكتوب كاملاً يُعرف', r && r.portal === 'الاوائل الخاصه فرع الخوض');
    check('lookup: مدرسةٌ ليست في الدليل ← null', ctx.lookup('مدرسة لا وجود لها', MAP) === null);
    check('lookup: بلا دليل ← null', ctx.lookup('نور الإسلام الخاصة', null) === null);
    check('lookup: بديلٌ يشير لاسمٍ ليس في الدليل يُهمَل ويُكمل بالمطابقة',
          ctx.lookup('نور الإسلام الخاصة', Object.assign({}, MAP, { aliases: { [ 'نور الاسلام الخاصه' ]: 'مدرسة محذوفة' } })).portal === 'نور الاسلام الخاصه');
}

/* ── ٢) المسح ── */
function scanEnv(systems, schoolsBy, preState) {
    const ss = {}, gm = {}, logs = [], downloads = [];
    if (preState) ss.svf_school_scan = JSON.stringify(preState);
    const state = { cur: systems[0] };
    const opt = (t, v) => ({ text: t, value: v });
    const ctx = {
        sessionStorage: { getItem: k => (k in ss ? ss[k] : null), setItem: (k, v) => { ss[k] = v; }, removeItem: k => { delete ss[k]; } },
        GM_getValue: (k, d) => (k in gm ? gm[k] : d), GM_setValue: (k, v) => { gm[k] = v; },
        log: (m, t) => logs.push(m),
        findEduSystemDropdown: () => ({ options: [opt('-- اختر --', '-1')].concat(systems.map((s, i) => opt(s, String(i + 1)))) }),
        getCurrentEduSystem: () => ({ text: state.cur }),
        switchEduSystem: t => { state.cur = t; return true; },
        findSchoolDropdown: () => ({ options: [opt('-- اختر --', '-1')].concat((schoolsBy[state.cur] || []).map((s, i) => opt(s, 'v' + i))) }),
        optionsSig: () => '', waitSchoolListChange: async () => null,
        URL: { createObjectURL: () => 'blob:x' }, Blob: function (parts) { this.text = parts.join(''); },
        document: { createElement: () => ({ click() { downloads.push(this.download); }, remove() {} }), body: { appendChild() {} } },
        JSON, Date
    };
    vm.createContext(ctx);
    vm.runInContext(CODE + '\nthis.scan = runSchoolScan; this.scanState = scanState;', ctx);
    return { ctx, ss, gm, logs, downloads, state };
}

(async () => {
    const SYS = ['عام', 'دولي', 'ثنائي اللغة خاص'];
    const BY = { 'عام': ['مدرسة أ', 'مدرسة ب'], 'دولي': ['الصحوة الخاصة'], 'ثنائي اللغة خاص': ['نور الاسلام الخاصه'] };

    let e = scanEnv(SYS, BY);
    await e.ctx.scan(false);
    const res = JSON.parse(e.gm.svf_school_scan_result || '{}');
    check('scan: كلّ الأنظمة', Object.keys(res.systems || {}).length === 3);
    check('scan: والمدارس بأنظمتها', (res.schools || []).length === 4
          && res.schools.some(s => s.portal === 'نور الاسلام الخاصه' && s.system === 'ثنائي اللغة خاص'));
    check('scan: «اختر» ليست مدرسةً ولا نظاماً', !JSON.stringify(res).includes('اختر'));
    check('scan: يُنزَّل الملفّ', e.downloads[0] === 'school-scan.json');
    check('scan: والحالة تُمحى بعد الاكتمال', !('svf_school_scan' in e.ss));

    // انقطع بعد النظام الأوّل (أُعيد تحميل الصفحة) — يُستأنف من الثاني ولا يُكرَّر الأوّل
    e = scanEnv(SYS, BY, { systems: SYS, i: 1, result: { 'عام': ['مدرسة أ', 'مدرسة ب'] }, started: 1 });
    e.state.cur = 'دولي';
    await e.ctx.scan(true);
    const res2 = JSON.parse(e.gm.svf_school_scan_result || '{}');
    check('resume: يكمل من حيث توقّف', (res2.schools || []).length === 4 && e.logs.some(m => /استئناف مسح المدارس من النظام 2/.test(m)));

    check('wiring: الزرّ في اللوحة', /id="svf-btn-scan-v7">🏫 مسح مدارس البوابة/.test(SRC)
          && /\$\('#svf-btn-scan-v7'\)\?\.addEventListener\('click', \(\) => runSchoolScan\(false\)\)/.test(SRC));
    check('wiring: المسح المقطوع يُستأنف قبل الطيّار الآليّ',
          /if \(scanState\(\)\) \{\s*\n\s*setTimeout\(\(\) => runSchoolScan\(true\), 2500\);\s*\n\s*return;/.test(SRC)
          && SRC.indexOf('if (scanState()) {') < SRC.indexOf("const phase = sessionStorage.getItem('svf_pilot_phase');"));
    check('wiring: الدليل يُجلب عند التحميل', /buildPanel\(visitData\);\s*\n\s*loadSchoolMap\(\);/.test(SRC));
    check('wiring: البحث عن المدرسة يبدأ بالدليل',
          /const dir = schoolDirLookup\(schoolName\);[\s\S]{0,700}schoolName = dir\.portal;[\s\S]{0,200}eduSystem: dir\.system/.test(SRC)
          && SRC.indexOf('const dir = schoolDirLookup(schoolName);') < SRC.indexOf('let r = matchSchool(schoolDD, schoolName);'));

    console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
    process.exit(failures ? 1 : 0);
})();
