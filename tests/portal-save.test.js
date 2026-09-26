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
    check('wiring: النسخة رُفعت إلى 15.9', /@version\s+15\.9/.test(SRC));
}

console.log(failures ? '\n' + failures + ' FAIL' : '\nALL PASS');
process.exit(failures ? 1 : 0);
