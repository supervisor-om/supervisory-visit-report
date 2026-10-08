// اختبار: node tests/data-quality.test.js
// جودة بيانات المعلّمين: ما ينقص القاعدة، وما يخالف أسماء البوّابة التي حفظها السكربت.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { svfDataQuality } = require(path.join(ROOT, 'js/data-quality.js'));

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

// تسويةٌ كتسوية identity.js: الهمزات والتاء والألف المقصورة و«بن»
const norm = v => String(v || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .split(/\s+/).filter(w => w && w !== 'بن' && w !== 'بنت').join(' ');

const T = [
    { name: 'مريم مصطفى موسى', school: 'نور الإسلام الخاصة', fileNumber: '', gender: 'f', grades: '1-6', principal: '' },
    { name: 'سالم البوسعيدي', school: 'يزيد بن حاتم', fileNumber: '123', gender: 'm', grades: '10-12', principal: 'خالد' },
    { name: 'منصور الهنائي', school: 'يزيد بن حاتم', fileNumber: '456', gender: '', grades: '', principal: '' },
    { name: '', school: 'سجلّ بلا اسم' }
];
const PORTAL = {
    'مريم مصطفي موسي': { site: 'مريم مصطفي موسى', portal: 'مريم مصطفى محمد السيد', emp: '32315171', school: 'نور الاسلام الخاصه' },
    'سالم البوسعيدي': { site: 'سالم البوسعيدي', portal: 'سالم البوسعيدى', emp: '999' }
};
const q = svfDataQuality(T, PORTAL, norm);

check('total: السجلّ بلا اسم لا يُعدّ', q.total === 3);
check('noFile: مريم وحدها', q.noFile.length === 1 && q.noFile[0].name === 'مريم مصطفى موسى');
check('noGender: منصور', q.noGender.length === 1 && q.noGender[0].name === 'منصور الهنائي');
check('noGrades: منصور', q.noGrades.length === 1 && q.noGrades[0].name === 'منصور الهنائي');
check('noPrincipal: مدرسةٌ لا يذكر أيٌّ من سجلّاتها المدير',
      q.noPrincipal.length === 1 && q.noPrincipal[0] === 'نور الإسلام الخاصة', JSON.stringify(q.noPrincipal));
check('noPrincipal: ويكفي سجلٌّ واحدٌ يذكره', !q.noPrincipal.includes('يزيد بن حاتم'));
check('nameDiff: مريم — الاسم في البوّابة ورقمها',
      q.nameDiff.length === 1 && q.nameDiff[0].portal === 'مريم مصطفى محمد السيد' && q.nameDiff[0].emp === '32315171',
      JSON.stringify(q.nameDiff));
check('nameDiff: فرق الياء والألف المقصورة وحده ليس اختلافاً', !q.nameDiff.some(d => d.name === 'سالم البوسعيدي'));
check('issues: المجموع', q.issues === 1 + 1 + 1 + 1 + 1);

const empty = svfDataQuality([], {}, norm);
check('empty: بلا معلّمين لا أخطاء', empty.total === 0 && empty.issues === 0);
const full = svfDataQuality([{ name: 'أ', school: 'س', fileNumber: '1', gender: 'm', grades: '5', principal: 'م' }], {}, norm);
check('full: بياناتٌ مكتملة ← صفر', full.issues === 0);

const tb = fs.readFileSync(path.join(ROOT, 'js/term-board.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'reports.html'), 'utf8');
const src = fs.readFileSync(path.join(ROOT, 'js/data-quality.js'), 'utf8');
check('wiring: البطاقة أسفل «إشرافي هذا الفصل»', /svfDataQualityCard\(\)/.test(tb));
check('wiring: الملفّ في الصفحة', html.includes('js/data-quality.js'));
check('wiring: بلا ربطٍ لا بطاقة', /if \(!me\) return '';/.test(src));
check('wiring: النصوص مهروبة', (src.match(/\$\{esc\(/g) || []).length >= 6);

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
