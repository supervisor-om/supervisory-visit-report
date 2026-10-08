// اختبار: node tests/sent-match.test.js
// وسم «حُفظت في البوابة» يطابق بعد التسوية لا حرفيّاً (2026-10-08: «حفظها السكربت ولم يظهر الوسم»).
// السكربت يكتب «المعلّم|التاريخ» من التقرير المصدَّر (الاسم مقصوص)، والأرشيف يقرأ ما حُفظ كما هو.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

function load(store, identity) {
    const ls = Object.assign({}, store);
    const ctx = {
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
        console
    };
    ctx.window = ctx;
    if (identity) ctx.SupervisorIdentity = identity;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/queue-export.js'), 'utf8'), ctx);
    return ctx;
}
const norm = {
    normName: v => String(v || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').split(/\s+/).filter(w => w && w !== 'بن').join(' '),
    normalize: v => String(v || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim()
};

let w = load({ svf_sent_visits: JSON.stringify(['محمد حسن يونس|08/10/2026']) }, norm);
check('sent: المطابقة الحرفيّة ما زالت تعمل', w.svfIsSent('محمد حسن يونس', '08/10/2026'));
check('sent: مسافةٌ زائدة في اسم الأرشيف لا تُسقط الوسم', w.svfIsSent('محمد حسن يونس ', '08/10/2026'));
check('sent: ومسافتان بين الكلمتين', w.svfIsSent('محمد  حسن يونس', '08/10/2026'));
check('sent: «8/10» و«08/10» تاريخٌ واحد', w.svfIsSent('محمد حسن يونس', '8/10/2026'));
check('sent: وصيغة الموقع 2026-10-08', w.svfIsSent('محمد حسن يونس', '2026-10-08'));
check('sent: الهمزة والألف المقصورة', load({ svf_sent_visits: JSON.stringify(['مريم مصطفي موسي|07/10/2026']) }, norm)
      .svfIsSent('مريم مصطفى موسى', '07/10/2026'));
check('sent: معلّمٌ آخر لا يُوسم', !w.svfIsSent('محمد حسن', '08/10/2026'));
check('sent: وتاريخٌ آخر لا يُوسم', !w.svfIsSent('محمد حسن يونس', '09/10/2026'));
check('sent: بلا وحدة الهويّة تعمل التسوية البسيطة', load({ svf_sent_visits: JSON.stringify(['محمد حسن يونس|08/10/2026']) })
      .svfIsSent(' محمد حسن يونس', '8/10/2026'));

w = load({ svf_sent_school_visits: JSON.stringify(['الأجيال العصرية الدولية|08/10/2026']) }, norm);
check('school: التاء المربوطة والهمزة', w.svfSchoolIsSent('الاجيال العصريه الدوليه', '8/10/2026'));
check('school: مدرسةٌ أخرى لا تُوسم', !w.svfSchoolIsSent('نور الإسلام', '08/10/2026'));

w = load({}, norm);
w.svfMarkSent([{ teacher: 'سالم', date: '01/10/2026' }]);
check('mark: التأكيد اليدويّ يُقرأ بالمطابقة نفسها', w.svfIsSent('سالم ', '2026-10-01'));

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
