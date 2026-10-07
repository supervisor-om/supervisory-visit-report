// اختبار انحدار: node tests/portal-save.test.js
// من سجلّ حقيقيّ (2026-09-26، v15.5) في وحدة الزيارات الإشرافية:
//   • «🛑 لم يُعثر على زر الحفظ» ثمّ طلب الحفظ اليدويّ — والزرّ موجود
//   • «📼 نقر <TR>/<TD> … رجاء استكمال تعبئة حقول الاستمارة» — ضُغطت رسالة
//     التحقّق ظنّاً أنّها تبويب «حقول الاستمارة» (النصّ يحتويه)
//   • نافذة «إعلام» تبقى فوق النموذج فيحفظ المستخدم يدوياً بعد إغلاقها
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'tools/daf51553aa5f5d6215/school-visits-automation.user.js'), 'utf8')
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

// عنصرٌ مصغَّر بما تمسّه الدوالّ: النقر والنصّ والسمات والظهور
function el(tag, o) {
    o = o || {};
    return Object.assign({
        tagName: tag, id: '', value: '', alt: '', title: '', textContent: '',
        type: '', offsetParent: {}, clicks: 0,
        click() { this.clicks++; },
        getAttribute(k) { return this[k] == null ? null : String(this[k]); }
    }, o);
}

// مستندٌ مصغَّر: querySelector يفهم ما تستعمله الدوالّ فعلاً
function doc(els) {
    const match = (e, sel) => {
        // وجودُ سمةٍ بلا قيمة: [onclick]
        const bare = /^(\w+|\*)?\[(\w+)\]$/.exec(sel);
        if (bare) {
            const [, btag, battr] = bare;
            if (btag && btag !== '*' && e.tagName.toLowerCase() !== btag.toLowerCase()) return false;
            return e[battr] != null && String(e[battr]) !== '';
        }
        const m = /^(\w+|\*)?(?:\[type="([^"]+)"\])?(?:\[id([$*^]?)="([^"]+)"\])?(?:\[(alt|title|value)\*="([^"]+)"\])?$/.exec(sel);
        if (!m) return false;
        const [, tag, type, idOp, idVal, attr, attrVal] = m;
        if (tag && tag !== '*' && e.tagName.toLowerCase() !== tag.toLowerCase()) return false;
        if (type && (e.type || '').toLowerCase() !== type.toLowerCase()) return false;
        if (idVal) {
            const id = e.id || '';
            if (idOp === '$' && !id.endsWith(idVal)) return false;
            if (idOp === '*' && !id.includes(idVal)) return false;
            if (idOp === '^' && !id.startsWith(idVal)) return false;
            if (!idOp && id !== idVal) return false;
        }
        if (attr && !String(e[attr] || '').includes(attrVal)) return false;
        return true;
    };
    return {
        getElementById: id => els.find(e => e.id === id) || null,
        querySelector: sel => els.find(e => sel.split(',').some(s => match(e, s.trim()))) || null,
        querySelectorAll: sel => els.filter(e => sel.split(',').some(s => match(e, s.trim())))
    };
}

// الدوالّ الحقيقيّة من السكربت، بمحيطٍ مزيّف
function load(els) {
    const logs = [];
    const code = between('        // ─── الحفظ في وحدة الزيارات الإشرافية ───', '        function supPortalErrors()')
               + between('        // تبويبات صفحة التقييم بمعرّفاتها', '        // جمع كلّ العناصر المطابقة');
    const ctx = {
        console,
        docs: () => [doc(els)],
        normAr: v => String(v || '')
            .replace(/[ـً-ْ]/g, '').replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim(),
        slog: (m, t) => logs.push((t || 'info') + ': ' + m)
    };
    vm.createContext(ctx);
    vm.runInContext(code + '\nthis.supFindSave = supFindSave; this.supClickTab = supClickTab;'
                         + ' this.supDismissNotice = supDismissNotice; this.supDumpButtons = supDumpButtons;', ctx);
    return { ctx, logs };
}

/* ── ١) زرّ الحفظ يُعثر عليه بأسمائه المختلفة ── */
{
    const cases = [
        ['المعرّف ImgSave', el('INPUT', { id: 'ctl00_content_ImgSave', type: 'image' })],
        ['المعرّف btnSave', el('INPUT', { id: 'ctl00_applicationPageContentPlaceHolder_btnSave', type: 'submit' })],
        ['المعرّف ImgUpdate', el('INPUT', { id: 'ctl00_content_ImgUpdate', type: 'image' })],
        ['قيمة الزرّ «حفظ»', el('INPUT', { id: 'x1', type: 'submit', value: 'حفظ' })],
        ['alt صورةٍ «حفظ»', el('INPUT', { id: 'x2', type: 'image', alt: 'حفظ البيانات' })],
        ['نصّ زرٍّ «حفظ»', el('BUTTON', { id: 'x3', textContent: ' حفظ ' })]
    ];
    cases.forEach(([name, button]) => {
        const { ctx } = load([el('INPUT', { id: 'other', type: 'text' }), button]);
        check('save: يجد زرّ الحفظ بـ' + name, ctx.supFindSave() === button);
    });

    const { ctx } = load([el('INPUT', { id: 'ctl00_content_ImgAdd', type: 'image', alt: 'إضافة' })]);
    check('save: لا يلتقط زرّاً لا صلة له بالحفظ', ctx.supFindSave() === null,
          'التقط ' + (ctx.supFindSave() || {}).id);
}

/* ── ٢) سرد الأزرار حين لا يُعثر عليه — فلا تلزم جولة تشخيصٍ أخرى ── */
{
    const { ctx, logs } = load([
        el('INPUT', { id: 'ctl00_content_ImgAdd', type: 'image', alt: 'إضافة', onclick: "SaveClicked();" }),
        el('A', { id: 'lnkBack', textContent: 'عودة', onclick: '__doPostBack()' })
    ]);
    ctx.supDumpButtons();
    const dump = logs.join(' | ');
    check('dump: يسرد معرّفات الأزرار ونصوصها', /ctl00_content_ImgAdd/.test(dump) && /إضافة/.test(dump), dump);
    check('dump: ويسرد onclick ليُعرف الزرّ الحقيقيّ', /SaveClicked/.test(dump), dump);
}

/* ── ٣) التبويب يُضغط بمعرّفه، ولا تُضغط رسالة التحقّق ── */
{
    const tm1 = el('TD', { id: 'TM1', textContent: 'بنود الاستمارة' });
    const tm2 = el('TD', { id: 'TM2', textContent: 'حقول الاستمارة' });
    const notice = el('TD', { id: '', textContent: 'رجاء استكمال تعبئة حقول الاستمارة' });
    const { ctx } = load([notice, tm1, tm2]);   // الرسالة أوّلاً كما في الصفحة الحقيقيّة
    check('tab: «حقول الاستمارة» يُضغط تبويبها بالمعرّف TM2',
          ctx.supClickTab('حقول الاستمارة') === true && tm2.clicks === 1 && notice.clicks === 0,
          'الرسالة نُقرت ' + notice.clicks + ' مرّة');
    check('tab: «بنود الاستمارة» يُضغط TM1', ctx.supClickTab('بنود الاستمارة') === true && tm1.clicks === 1);

    // بلا معرّفات: النصّ احتياطٌ، والرسالة مستثناة منه
    const notice2 = el('TD', { id: '', textContent: 'رجاء استكمال تعبئة حقول الاستمارة' });
    const tab2 = el('TD', { id: '', textContent: 'حقول الاستمارة' });
    const e2 = load([notice2, tab2]);
    check('tab: بلا معرّفاتٍ يُضغط التبويب لا الرسالة',
          e2.ctx.supClickTab('حقول الاستمارة') === true && tab2.clicks === 1 && notice2.clicks === 0,
          'الرسالة نُقرت ' + notice2.clicks + ' مرّة');
}

/* ── ٤) نافذة «إعلام» تُغلق قبل البحث عن الحفظ ── */
{
    const back = el('INPUT', { id: 'btnBack', type: 'button', value: 'عودة' });
    const save = el('INPUT', { id: 'ctl00_content_ImgSave', type: 'image' });
    const { ctx, logs } = load([back, save]);
    check('notice: تُغلق بزرّ «عودة»', ctx.supDismissNotice() === true && back.clicks === 1);
    check('notice: ويُسجَّل إغلاقها', /أُغلقت نافذة البوّابة/.test(logs.join(' ')), logs.join(' '));
    check('notice: ولا يُمسّ زرّ الحفظ', save.clicks === 0);

    const hidden = el('INPUT', { id: 'btnBack2', type: 'button', value: 'عودة', offsetParent: null });
    const e2 = load([hidden]);
    check('notice: زرٌّ مخفيٌّ ليس نافذةً معروضة', e2.ctx.supDismissNotice() === false && hidden.clicks === 0);

    const e3 = load([el('INPUT', { id: 'btnDelete', type: 'button', value: 'حذف' })]);
    check('notice: لا تُضغط أزرارٌ أخرى', e3.ctx.supDismissNotice() === false);
}

/* ── ٥) رسائل البوّابة: «123» ليست رفضاً ── */
{
    // الدالّتان الحقيقيّتان: تصنيف الرسائل من الوحدة المدرسيّة، والترشيح الإشرافيّ
    const cls = between('        const SAVE_FAIL_RE', '        // ═══ الحفظ عبر إعادة تحميل الصفحة ═══');
    const fresh = between('        function supFreshMessages(baseline)', '        function supPortalErrors()');
    let msgs = [];
    const ctx = { console, supPortalErrors: () => msgs };
    vm.createContext(ctx);
    vm.runInContext(cls + fresh
        + '\nthis.classifyPortalMessages = classifyPortalMessages; this.supFreshMessages = supFreshMessages;', ctx);

    msgs = ['123'];
    check('msg: رقمٌ مجرّدٌ («123») لا يُعدّ رسالةً أصلاً',
          ctx.supFreshMessages([]).length === 0, JSON.stringify(ctx.supFreshMessages([])));

    msgs = ['رسالةٌ كانت قبل الحفظ'];
    check('msg: نصٌّ كان موجوداً قبل الضغط يُهمَل',
          ctx.supFreshMessages(['رسالةٌ كانت قبل الحفظ']).length === 0);

    msgs = ['تم الحفظ بنجاح'];
    let c = ctx.classifyPortalMessages(ctx.supFreshMessages([]));
    check('msg: «تم الحفظ بنجاح» نجاحٌ لا رفض', c.ok.length === 1 && c.fail.length === 0, JSON.stringify(c));

    msgs = ['لم يتم الحفظ'];
    c = ctx.classifyPortalMessages(ctx.supFreshMessages([]));
    check('msg: «لم يتم الحفظ» رفضٌ رغم احتوائه «تم الحفظ»', c.fail.length === 1 && c.ok.length === 0);

    msgs = ['رجاء استكمال تعبئة حقول الاستمارة'];
    c = ctx.classifyPortalMessages(ctx.supFreshMessages([]));
    check('msg: رسالة التحقّق رفضٌ صريح', c.fail.length === 1);

    check('msg: مسار الحفظ الإشرافيّ يأخذ خطّ أساسٍ قبل الضغط',
          /const baseline = supPortalErrors\(\);[\s\S]{0,200}btn\.click\(\)/.test(SRC));
    check('msg: ويصنّف الرسائل الجديدة بدل عدّها كلّها رفضاً',
          /supFreshMessages\(baseline\)[\s\S]{0,120}classifyPortalMessages\(msgs\)/.test(SRC));
    check('msg: ونجاحُ الحفظ يُسجّل الزيارة ويُقدّم الطابور',
          /c\.ok\.length && !c\.fail\.length[\s\S]{0,700}queueAdvance\(\)/.test(SRC));
}

/* ── ٦) المادّة: تُسرد الخيارات حين لا تُطابق ── */
{
    check('subject: الخيارات تُسرد في السجلّ عند الإخفاق',
          /ليس في الخيارات[\s\S]{0,420}الخيارات \(/.test(SRC), 'لا تُسرد');
}

/* ── ٦ب) نافذة البوّابة تُغلق بزرٍّ بلا نصّ (onclick=DoOk) ── */
{
    const okImg = el('IMG', { id: '', onclick: 'DoOk()' });
    const save = el('INPUT', { id: 'ctl00_content_ImgSave', type: 'image' });
    const { ctx, logs } = load([okImg, save]);
    check('notice: تُغلق بصورة DoOk() رغم خلوّها من النصّ',
          ctx.supDismissNotice() === true && okImg.clicks === 1, 'لم تُغلق');
    check('notice: ويُسجَّل ذلك', /DoOk/.test(logs.join(' ')), logs.join(' '));
    check('notice: ولا يُمسّ زرّ الحفظ', save.clicks === 0);

    const hiddenOk = el('IMG', { id: '', onclick: 'DoOk()', offsetParent: null });
    const e2 = load([hiddenOk]);
    check('notice: صورةٌ مخفيّةٌ بـDoOk لا تُضغط', e2.ctx.supDismissNotice() === false && hiddenOk.clicks === 0);

    const other = el('IMG', { id: '', onclick: 'DoDelete()' });
    const e3 = load([other]);
    check('notice: onclick آخر لا يُضغط', e3.ctx.supDismissNotice() === false && other.clicks === 0);
}

/* ── ٦ج) قائمة المادّة تُنتظر حتّى تمتلئ ── */
{
    check('subject: تُنتظر القائمة قبل اختيار المادّة',
          /supWaitOptions\(STAGE1_FIELDS\['المادة'\], 'المادة'\);[\s\S]{0,40}supPut\(STAGE1_FIELDS\['المادة'\]/.test(SRC),
          'لا انتظار');
    check('subject: الانتظار يتجاهل الخيار الفارغ و«-1»',
          /String\(o\.value \|\| ''\)\.trim\(\)[\s\S]{0,160}!== '-1'/.test(SRC));
    check('subject: وتُسجَّل النتيجة امتلأت أم لم تمتلئ',
          /امتلأت \(/.test(SRC) && /لم تمتلئ خلال المهلة/.test(SRC));
}

/* ── ٦د) شريحة العدّ لا تُزال لحظة الحفظ ── */
{
    check('grace: الشريحة تبقى بعد انتهاء العدّ (لا إزالةً فوريّة)',
          !/const finish = \(ok\) => \{ clearInterval\(iv\); bar\.remove\(\); resolve\(ok\); \};/.test(SRC),
          'ما زالت تُزال فوراً');
    check('grace: تُزال بعد مهلةٍ لا في اللحظة نفسها',
          (SRC.match(/setTimeout\(\(\) => bar\.remove\(\), 8000\)/g) || []).length === 2,
          'العدد غير متوقَّع');
    check('grace: وزرّ الإلغاء يُعطَّل بدل أن يختفي',
          /x2\.disabled = true;[\s\S]{0,140}جارٍ الحفظ/.test(SRC));
}

/* ── ٦هـ) نصّ نافذة البوّابة يُقرأ فيُعرف سبب الرفض ── */
{
    const fresh2 = between('        // نصّ نافذة «إعلام»', '        function supPortalErrors()');
    const ctx = { console };
    const okImg = el('IMG', { id: '', onclick: 'DoOk()' });
    const cell = { tagName: 'TD', textContent: 'رجاء استكمال تعبئة حقول الاستمارة', parentElement: null };
    okImg.parentElement = cell;
    ctx.docs = () => [doc([okImg])];
    ctx.normAr = v => String(v || '');
    vm.createContext(ctx);
    vm.runInContext(fresh2 + '\nthis.supNoticeText = supNoticeText;', ctx);
    check('notice: نصّ النافذة يُقرأ من حاوية زرّ DoOk',
          /رجاء استكمال/.test(ctx.supNoticeText() || ''), JSON.stringify(ctx.supNoticeText()));

    check('notice: ويُضمّ إلى رسائل البوّابة فتُصنَّف',
          /const notice = supNoticeText\(\);\s*\n\s*if \(notice\) out\.push\(notice\);/.test(SRC),
          'غير مضموم');
}

/* ── ٦و) القوائم تُسرد حين لا تمتلئ قائمة المادّة ── */
{
    check('subject: تُسرد قوائم الصفحة عند إخفاق الانتظار',
          /لم تمتلئ خلال المهلة[\s\S]{0,120}supDumpSelects\(label\)/.test(SRC));
    check('subject: السرد يذكر المعرّف وعدد الخيارات وأوائلها',
          /function supDumpSelects[\s\S]{0,700}opts\.length \+ ' خياراً'/.test(SRC));
}

/* ── ٦ز) الحفظ التلقائيّ لا يُطفأ بنقرةٍ أثناء الحفظ ── */
{
    check('autosave: عَلَمُ «حفظٌ جارٍ» يُرفع قبل العدّ ويُخفض في finally',
          /supSaveInFlight = true;\s*\n\s*try \{/.test(SRC)
          && /\} finally \{\s*\n\s*supSaveInFlight = false;/.test(SRC));
    check('autosave: الإطفاء أثناءه يطلب نقرةً ثانية',
          /if \(!next && supSaveInFlight && Date\.now\(\) - supOffConfirmAt > 4000\)[\s\S]{0,320}return;/.test(SRC));
    check('autosave: والتأكيد الثاني يمضي (لا منعَ دائم)',
          /supOffConfirmAt = Date\.now\(\);/.test(SRC));
}

/* ── ٧) التوصيل في مسار الحفظ ── */
{
    check('wiring: النافذة تُغلق قبل البحث عن الزرّ',
          /if \(supDismissNotice\(\)\) await wait\(800\);[\s\S]{0,200}supFindSave\(\)/.test(SRC));
    check('wiring: وتُعاد المحاولة بعد إعادة الرسم',
          /let btn = supFindSave\(\);[\s\S]{0,120}btn = supFindSave\(\);/.test(SRC));
    check('wiring: وعند الإخفاق تُسرد الأزرار في السجلّ',
          /لم يُعثر على زر الحفظ[\s\S]{0,160}supDumpButtons\(\)/.test(SRC));
    check('wiring: النافذة تُغلق بعد كلّ تبديل تبويب',
          (SRC.match(/await wait\(1500\);\s*\n\s*supDismissNotice\(\)/g) || []).length >= 2);
    check('wiring: النسخة رُفعت إلى 16.4', /@version\s+16\.4/.test(SRC));
}

/* ── ٩) v16.1: المعلّم باسمٍ مختلفٍ في البوّابة (لقطة 2026-10-07) ──
   الموقع «مريم مصطفى موسى» والبوّابة «مريم مصطفى محمد السيد [معلم مادة رياضة مدرسية ]» */
{
    const normCode = between('function normAr(', 'let sup = null;');
    const altCode = between('// صفوف شبكة نتائج البحث وحدها', '// بحث المعلّم واختياره من شبكة النتائج');
    const logs = [];
    const row = (name, num) => ({
        querySelector: s => /DisplayInfo/.test(s) ? {} : null,
        cells: [{ textContent: name + ' [معلم مادة رياضة مدرسية ]' }, { textContent: num }]
    });
    const state = { rows: [] };
    const ctx = {
        docs: () => [{ querySelectorAll: () => state.rows }],
        slog: (m, t) => logs.push([t, m])
    };
    vm.createContext(ctx);
    vm.runInContext(normCode + '\n' + altCode
        + '\nthis.supAltTeacherRow = supAltTeacherRow; this.normName = normName; this.searchTerms = searchTerms;', ctx);
    const want = ctx.normName('مريم مصطفى موسى');

    state.rows = [row('مريم مصطفى محمد السيد', '32315171')];
    let r = ctx.supAltTeacherRow(want, '');
    check('teacher: صفٌّ وحيدٌ بأوّل اسمين يُختار', r && /مريم مصطفى محمد السيد/.test(r.name) && /أوّل اسمين/.test(r.why));

    state.rows = [row('مريم مصطفى محمد السيد', '32315171'), row('مريم مصطفى علي', '11112222')];
    r = ctx.supAltTeacherRow(want, '');
    check('teacher: صفّان بأوّل اسمين — لا اختيار', r === null && logs.some(([, m]) => /لن أختار عنك/.test(m)));
    const n = logs.length; ctx.supAltTeacherRow(want, '');
    check('teacher: وتنبيه اللبس لا يتكرّر في كلّ استطلاع', logs.length === n);

    r = ctx.supAltTeacherRow(want, '32315171');
    check('teacher: الرقم الوظيفيّ يحسم بين المتشابهين', r && r.num === '32315171' && /الرقم الوظيفيّ/.test(r.why));

    state.rows = [row('مريم سالم الهنائي', '32315171')];
    r = ctx.supAltTeacherRow(want, '');
    check('teacher: الاسم الأوّل وحده لا يكفي', r === null);

    state.rows = [row('مريم مصطفى محمد السيد', '32315171')];
    check('teacher: اسمٌ من كلمةٍ واحدة لا يُطابَق بأوّل اسمين', ctx.supAltTeacherRow(ctx.normName('مريم'), '') === null);

    const terms = ctx.searchTerms('مريم مصطفى موسى');
    check('teacher: البحث يجرّب «مريم مصطفى» قبل الاسم الأوّل وحده',
          terms.indexOf(ctx.normName('مريم مصطفى')) > -1 && terms.indexOf(ctx.normName('مريم مصطفى')) < terms.indexOf('مريم'));
    check('teacher: البديل يُستدعى بعد فشل المطابقة الكاملة في الانتظار',
          /supSelectRow\(d, tr\)\) return true;[\s\S]{0,200}const alt = supAltTeacherRow\(want, sup && sup\.fileNumber\)/.test(SRC));
}

/* ── ٨) v16.0: حارس التاريخ، والتوصيات في خانتها و«لا يوجد» في الدعم المقدم ── */
{
    const code = between('let supDateDescribed = false;', 'async function supStage1()');
    const logs = [];
    const mk = (value, attrs) => {
        const a = Object.assign({}, attrs || {});
        return {
            id: 'ctl00_x_visitDataPicker_dateTextBox', value, events: [],
            hasAttribute: n => n in a, getAttribute: n => a[n], removeAttribute: n => { delete a[n]; },
            dispatchEvent(e) { this.events.push(e.type); }, _attrs: a
        };
    };
    const hidden = { id: 'ctl00_x_visitDataPicker_hfDate', value: '' };
    const state = { box: null };
    const ctx = {
        sup: { date: '07/10/2026' },
        STAGE1_FIELDS: { 'التاريخ': ['visitDataPicker_dateTextBox'] },
        findAnywhere: () => state.box,
        docs: () => [{ querySelectorAll: () => [hidden] }],
        slog: (m, t) => logs.push([t, m]),
        Event: function (t) { this.type = t; }
    };
    vm.createContext(ctx);
    vm.runInContext(code + '\nthis.supEnsureDate = supEnsureDate;', ctx);

    state.box = mk('', { readonly: 'readonly' });
    const ok1 = ctx.supEnsureDate('بعد كتابته');
    check('date: الخانة الفارغة تُكتب وتُفكّ readonly', ok1 && state.box.value === '07/10/2026' && !('readonly' in state.box._attrs));
    check('date: تُطلق change وblur', state.box.events.includes('change') && state.box.events.includes('blur'));
    check('date: والحقل المخفيّ لمنتقي التاريخ يُكتب', hidden.value === '07/10/2026');
    check('date: ووصف الخانة يُطبع في السجلّ', logs.some(([, m]) => /خانة التاريخ id=/.test(m) && /readonly/.test(m)));

    state.box = mk('01/01/2026');   // postback أعاد قيمةً أخرى
    logs.length = 0;
    check('date: القيمة التي غيّرها postback تُعاد', ctx.supEnsureDate('بعد الاستمارة') && state.box.value === '07/10/2026'
          && logs.some(([t, m]) => t === 'warn' && /تغيّر إلى/.test(m)));

    state.box = mk('07/10/2026');
    logs.length = 0;
    check('date: الصحيحة لا تُمسّ ولا تُسجَّل', ctx.supEnsureDate('قبل «إضافة»') && state.box.events.length === 0 && logs.length === 0);

    state.box = null;
    check('date: غياب الخانة يُرجع false', ctx.supEnsureDate('x') === false);

    check('date: يُستدعى بعد الكتابة والاستمارة وبيانات المعلّم وقبل «إضافة»',
          ['بعد كتابته', 'بعد الاستمارة', 'بعد بيانات المعلّم', 'قبل «إضافة»']
            .every(s => SRC.includes("supEnsureDate('" + s + "')")));
    check('date: وإن لم يثبت قبل «إضافة» يتوقّف ولا يضغط',
          /if \(!supEnsureDate\('قبل «إضافة»'\)\) \{[\s\S]{0,300}return;\s*\n\s*\}/.test(SRC));

    const texts = between('const TEXTS = [', '];');
    const row = n => (texts.match(new RegExp("\\{ name: '" + n + "'[^\\n]*")) || [''])[0];
    check('texts: التوصيات في خانة «التوصيات»', /val: sup\.recommendations/.test(row('التوصيات')));
    check('texts: «الدعم المقدم» = لا يوجد', /val: EMPTY_TEXT/.test(row('الدعم المقدم')) && !/recommendations/.test(row('الدعم المقدم')));
    check('texts: «توصي» ليس من مفاتيح الدعم', !/'توصي'/.test(row('الدعم المقدم')));
    check('texts: التوصيات تُطابَق قبل الدعم', texts.indexOf("name: 'التوصيات'") < texts.indexOf("name: 'الدعم المقدم'"));
}

/* ── ١٠) v16.2: سجلّ 2026-10-07 — بنودٌ ظهرت قبل الرأس، واستمارةٌ من ١٥ بنداً ── */
{
    const stageCode = between('function supStage() {', 'async function supFill()');
    const f = { items: true, date: '', lesson: '' };
    const ctx = {
        STAGE1_FIELDS: { 'التاريخ': ['d'], 'عنوان الدرس': ['l'] }, STAGE2_FIELDS: {}, FORMS_DDL: ['f'],
        ratingCandidates: () => ['r'],
        findAnywhere: n => n[0] === 'rptrFormItems_ctl01_ddlItemEvals' ? (f.items ? {} : null)
                        : n[0] === 'd' ? { value: f.date } : n[0] === 'l' ? { value: f.lesson } : null
    };
    vm.createContext(ctx);
    vm.runInContext(stageCode + '\nthis.supStage = supStage;', ctx);
    check('stage: بنودٌ بلا تاريخ ← المرحلة ١ لا ٢', ctx.supStage() === 1);
    f.date = '07/10/2026';
    check('stage: بنودٌ بتاريخٍ بلا عنوان درس ← المرحلة ١', ctx.supStage() === 1);
    f.lesson = 'دفع الجلة';
    check('stage: بنودٌ والرأس مكتمل ← المرحلة ٢', ctx.supStage() === 2);

    check('form: عددُ بنودٍ يخالف التقرير يوقف الحفظ',
          /if \(evals\.length !== \(sup\.ratings \|\| \[\]\)\.length\) \{[\s\S]{0,700}return;\s*\n\s*\}/.test(SRC));
    check('form: والفحص قبل تعبئة الدرجات',
          SRC.indexOf('if (evals.length !== (sup.ratings || []).length)') < SRC.indexOf('(sup.ratings || []).forEach((score, i)'));
    check('form: الاستمارة المختارة مسبقاً تُستبدل إن لم تكن استمارة المعلّم',
          /const curOk = [\s\S]{0,200}supIsTeacherForm\(curForm\.text\)/.test(SRC) && /if \(forms && !curOk\) \{/.test(SRC));
    check('teacher: المعلّم المختار يدويّاً لا يُعاد البحث عنه',
          /المعلّم مختارٌ أصلاً/.test(SRC) && SRC.indexOf('المعلّم مختارٌ أصلاً') < SRC.indexOf('const terms = searchTerms(sup.teacher);'));
    check('texts: الخانات بلا تكرار، والفارغ في التقرير يُقال',
          /\.filter\(\(b, i, a\) => a\.indexOf\(b\) === i\)/.test(SRC) && /فارغٌ في التقرير/.test(SRC));
}

/* ── ١١) v16.3: «لمعلم أول مادة/ مجال» ليست استمارة المعلّم (سجلّ 2026-10-07 الثاني) ── */
{
    const code = between('function normAr(', 'let sup = null;') + '\n'
               + between('// استمارة المعلّم: «… لمعلم مجال/ مادة»', 'async function supStage1()');
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(code + '\nthis.isT = supIsTeacherForm; this.pick = supPickTeacherForm;', ctx);
    const senior = 'استمارة الزيارة إشرافية لمعلم أول مادة/ مجال 2026 / 2027';
    const food   = 'استمارة الزيارة الاشرافية لخدمات التغذية المدرسية 2026/ 2027';
    const health = 'استمارة الزيارة الإشرافية لخدمات الصحة المدرسية 2026/ 2027';
    const teacher = 'استمارة زيارة إشرافية لمعلم مجال/ مادة 2026/2027';
    check('form: «لمعلم أول» مرفوضة', ctx.isT(senior) === false);
    check('form: استمارات الخدمات مرفوضة', !ctx.isT(food) && !ctx.isT(health));
    check('form: «لمعلم مجال/ مادة» مقبولة', ctx.isT(teacher) === true);
    const o = (text, value) => ({ text, value });
    check('form: الاختيار يتخطّى «معلم أول» وإن كانت الأولى',
          ctx.pick([o(senior, '1'), o(food, '2'), o(teacher, '3'), o(health, '4')]).value === '3');
    check('form: ولا ملاذ بأوّل خيار حين تغيب استمارة المعلّم',
          ctx.pick([o(senior, '1'), o(food, '2')]) === null);
    check('form: الاستمارات تُسرد في السجلّ', /الاستمارات في البوّابة: /.test(SRC));
}

/* ── ١٢) v16.4: «خطأ في قاعدة البيانات عند محاولة الحفظ» — نصٌّ أطول من حدّ الخانة ── */
{
    const code = between('function normAr(', 'let sup = null;') + '\n'
               + between('// ─── حدّ طول الخانة (v16.4) ───', 'async function supStage2()');
    const ctx = { sanitizeForPortal: v => v };
    vm.createContext(ctx);
    vm.runInContext(code + '\nthis.lim = supFieldLimit; this.len = supPortalLength; this.chk = supCheckLength;', ctx);
    const box = (label, maxLength) => ({ maxLength: maxLength == null ? -1 : maxLength,
        closest: () => ({ textContent: label }) });

    check('len: الحدّ من maxlength', ctx.lim(box('أيّ شيء', 500)) === 500);
    check('len: أو من «أقصى عدد» في التسمية', ctx.lim(box('جوانب الإجادة في الأداء* أقصى عدد للحروف 1000')) === 1000);
    check('len: بالأرقام العربيّة أيضاً', ctx.lim(box('الدعم المقدم* أقصى عدد للحروف ٥٠٠')) === 500);
    check('len: بلا حدٍّ معروف ← 0 (لا منع)', ctx.lim(box('الملاحظات')) === 0);
    check('len: السطر الجديد يُحسب حرفين', ctx.len('أ\nب') === 4);

    const tooLong = [];
    check('len: النصّ داخل الحدّ يمرّ', ctx.chk(box('x', 10), 'قصير', 'التوصيات', tooLong) === true && tooLong.length === 0);
    check('len: الزائد يُرفض ويُسجَّل بطوله وحدّه',
          ctx.chk(box('x', 10), 'نصٌّ أطول من عشرة أحرف', 'جوانب الإجادة', tooLong) === false
          && tooLong[0].label === 'جوانب الإجادة' && tooLong[0].limit === 10 && tooLong[0].len > 10);
    check('len: بلا حدٍّ معروف لا يُرفض', ctx.chk(box('الملاحظات'), 'x'.repeat(5000), 'الملاحظات', []) === true);

    check('len: الفحص قبل الكتابة في الخانات النصّيّة',
          /if \(!supCheckLength\(target, t\.val, t\.name, tooLong\)\) return;\s*\n\s*setVal\(target, t\.val\)/.test(SRC));
    check('len: وفي أوصاف البنود', /supCheckLength\(box, note, 'وصف البند ' \+ n, tooLong\)\) \{\s*\n\s*setVal\(box, note\)/.test(SRC));
    check('len: والزائد يوقف الحفظ قبل supSave',
          /if \(tooLong\.length\) \{[\s\S]{0,600}return;\s*\n\s*\}/.test(SRC)
          && SRC.indexOf('if (tooLong.length) {') < SRC.lastIndexOf('await supSave(written);'));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
