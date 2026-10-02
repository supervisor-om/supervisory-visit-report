// اختبار انحدار للوحة «إشرافي هذا الفصل»: node tests/term-board.test.js
//   ١) حساب الفصل ومداه: سبتمبر←يناير، فبراير←يونيو، والصيف مقدّمة الأوّل
//   ٢) التبديل بين فصلَي العام الدراسيّ نفسه (لا إلى عامٍ آخر)
//   ٣) جمع الزيارات من الأرشيف الحقيقيّ: المدى، والمفتاحان، والتالف يُتخطّى
//   ٤) الصورة: من زُرت، ومن لم تزر وترتيب أولويّتهم، ومن طال العهد به، والمدارس
//   ٥) العرض: التاريخ المحلّيّ (لا UTC)، والتهريب، وصيغ العدد العربيّة، وحال اللاربط
//   ٦) التوصيل: الصفحة والتبويب وعامل الخدمة وtoggleSupervisoryView
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  — ' + detail : ''));
    if (!ok) failures++;
};

/* ── تخزينٌ وDOM بالقدر الذي تحتاجه اللوحة ── */
function makeStore(seed) {
    const map = new Map(Object.entries(seed || {}));
    return {
        get length() { return map.size; },
        key(i) { return [...map.keys()][i]; },
        getItem(k) { return map.has(k) ? map.get(k) : null; },
        setItem(k, v) { map.set(k, String(v)); },
        removeItem(k) { map.delete(k); }
    };
}

const norm = s => String(s || '').split(/\s+/).filter(w => w && w !== 'بن' && w !== 'بنت').join(' ').trim();

/* ساعةٌ ثابتة: نتيجة الاختبار لا تتبدّل بيوم تشغيله */
function fixedClock(iso) {
    const at = new Date(iso).getTime();
    class D extends Date {
        constructor(...a) { if (!a.length) super(at); else super(...a); }
        static now() { return at; }
    }
    return D;
}

function makeEnv(opts) {
    const o = opts || {};
    const box = {
        id: 'term-view', _html: '', classList: { add() {}, remove() {}, contains: () => false },
        querySelectorAll: () => []
    };
    Object.defineProperty(box, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; } });
    const ctx = {
        console, Date: o.now ? fixedClock(o.now) : Date, Math, JSON, Map, Set, Number, String, Array, Object, isNaN,
        localStorage: makeStore(o.store),
        document: { getElementById: id => (id === 'term-view' ? box : null) },
        svfEscapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
        performReset: () => {},
        toggleSupervisoryView: () => {},
        showToast: () => {},
        SupervisorIdentity: o.teachers
            ? { normName: norm, getTeachers: () => o.teachers, getIdentity: () => ({ id: 'asad' }) }
            : null
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/term-board.js'), 'utf8'), ctx);
    return { ctx, box };
}

const visit = (iso, teacher, school, extra) => JSON.stringify(Object.assign(
    { teacherName: teacher, visitDate: iso, school: school || '', formData: { 'score-1': '2' } }, extra || {}));

const NOW = '2027-01-15T10:00:00';   /* منتصف الفصل الأوّل 2026/2027 */
const day = (n, from) => {           /* تاريخٌ قبل n يوماً من الساعة الثابتة */
    const d = new Date(from || NOW); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// ═════════════════════════ ١) الفصل ومداه ═════════════════════════
console.log('\n§1 حساب الفصل ومداه');
{
    const { ctx } = makeEnv();
    const t = iso => ctx.svfTermOf(new Date(iso + 'T06:00:00'));
    check('سبتمبر ← الفصل الأول', t('2026-09-15').id === 't1' && t('2026-09-15').year === 2026);
    check('ديسمبر ← الفصل الأول نفسه', t('2026-12-20').id === 't1' && t('2026-12-20').year === 2026);
    check('يناير تتمّة الفصل الأول (لا فصلاً جديداً)', t('2027-01-10').id === 't1' && t('2027-01-10').year === 2026);
    check('فبراير ← الفصل الثاني', t('2027-03-01').id === 't2' && t('2027-03-01').year === 2027);
    check('يونيو ← الفصل الثاني', t('2027-06-20').id === 't2' && t('2027-06-20').year === 2027);
    check('الصيف (يوليو/أغسطس) مقدّمة الفصل الأول القادم',
        t('2026-07-10').id === 't1' && t('2026-07-10').year === 2026 &&
        t('2026-08-25').id === 't1' && t('2026-08-25').year === 2026);

    const r1 = ctx.svfTermRange({ id: 't1', year: 2026 });
    check('مدى الأول: 1 سبتمبر ← 31 يناير',
        r1.from.getMonth() === 8 && r1.from.getDate() === 1 && r1.from.getFullYear() === 2026 &&
        r1.to.getMonth() === 0 && r1.to.getDate() === 31 && r1.to.getFullYear() === 2027);
    check('مدى الأول ينتهي بآخر اللحظة لا بأوّلها', r1.to.getHours() === 23 && r1.to.getMinutes() === 59);
    check('تسمية الأول بالعام الدراسيّ', r1.label === 'الفصل الأول 2026/2027', r1.label);

    const r2 = ctx.svfTermRange({ id: 't2', year: 2027 });
    check('مدى الثاني: 1 فبراير ← 30 يونيو',
        r2.from.getMonth() === 1 && r2.from.getDate() === 1 && r2.from.getFullYear() === 2027 &&
        r2.to.getMonth() === 5 && r2.to.getDate() === 30 && r2.to.getFullYear() === 2027);
    check('تسمية الثاني بالعام الدراسيّ نفسه', r2.label === 'الفصل الثاني 2026/2027', r2.label);
}

// ═══════════════ ٢) التبديل يبقى في العام الدراسيّ نفسه ═══════════════
console.log('\n§2 التبديل بين الفصلين');
{
    const { ctx } = makeEnv();
    const a = ctx.svfTermSibling({ id: 't1', year: 2026 }, 't2');
    check('من الأول 2026/2027 ← الثاني 2027 (فبراير القادم)', a.id === 't2' && a.year === 2027, JSON.stringify(a));
    // الرجوع من الثاني إلى الأول كان يُعيد سنةً خاطئة قبل الإصلاح
    const b = ctx.svfTermSibling({ id: 't2', year: 2027 }, 't1');
    check('ومن الثاني ← الأول 2026 لا 2027', b.id === 't1' && b.year === 2026, JSON.stringify(b));
    const c = ctx.svfTermSibling({ id: 't1', year: 2026 }, 't1');
    check('طلب الفصل نفسه لا يزيحه', c.id === 't1' && c.year === 2026);
}

// ═════════════════ ٣) جمع الزيارات من الأرشيف ═════════════════
console.log('\n§3 قراءة الأرشيف');
{
    const { ctx } = makeEnv({ store: {
        'supervision_v6_visit_1': visit('2026-09-20', 'سالم المعمري', 'الوادي'),
        'supervision_v6_visit_2': visit('2027-03-10', 'سالم المعمري', 'الوادي'),   /* الفصل الثاني */
        'visit_v5_old':           visit('2026-10-02', 'هدى البلوشي', 'النهضة'),    /* المفتاح القديم */
        'supervision_v6_visit_3': '{ تالف',
        'supervision_v6_visit_4': visit('2026-10-05', '', 'بلا اسم'),
        'supervision_v6_visit_5': visit('', 'بلا تاريخ', 'س'),
        'svf_identity':           '{"id":"asad"}'
    } });
    const r1 = ctx.svfTermRange({ id: 't1', year: 2026 });
    const got = ctx.svfTermAllVisits().filter(v => v.when >= r1.from && v.when <= r1.to);
    check('الفصل الأول يضمّ زيارتَيه فقط', got.length === 2, got.map(v => v.iso).join(','));
    check('المفتاح القديم visit_v5_ مقروء', got.some(v => v.iso === '2026-10-02'));
    check('التالف وبلا اسمٍ وبلا تاريخٍ تُتخطّى بلا رمي', ctx.svfTermAllVisits().length === 3);
    check('الأحدث أوّلاً', ctx.svfTermAllVisits()[0].iso === '2027-03-10');
}

// ═════════════════ ٤) الصورة الكاملة ═════════════════
console.log('\n§4 صورة الفصل');
{
    const { ctx } = makeEnv({
        now: NOW,
        store: {
            /* التهجئتان لمعلّمٍ واحد: «بن» تسقط في المطابقة */
            'supervision_v6_visit_1': visit(day(5), 'سالم بن علي المعمري', 'الوادي'),
            'supervision_v6_visit_2': visit(day(12), 'سالم علي المعمري', 'الوادي'),
            'supervision_v6_visit_3': visit(day(50), 'هدى البلوشي', 'النهضة'),      /* طال العهد */
            'supervision_v6_visit_4': visit('2026-04-20', 'ناصر الهنائي', 'الوادي') /* فصلٌ ماضٍ */
        },
        teachers: [
            { name: 'سالم بن علي المعمري', school: 'الوادي' },
            { name: 'هدى البلوشي', school: 'النهضة' },
            { name: 'ناصر الهنائي', school: 'الوادي' },   /* زيارته قديمة: لم يُزر هذا الفصل */
            { name: 'مريم الكندية', school: 'الأمل' }     /* لم تُزر قطّ */
        ]
    });
    /* الفصل الذي نحن فيه الآن مهما كان يوم التشغيل */
    const p = ctx.svfTermPicture(ctx.svfTermOf(new Date()));
    const inTerm = p.visits.length;

    check('الزيارات داخل الفصل وحدها', inTerm === 3, 'عددها ' + inTerm);
    check('التهجئتان معلّمٌ واحدٌ بزيارتين',
        p.teachers.length === 2 && p.teachers.some(t => t.count === 2), JSON.stringify(p.teachers.map(t => t.count)));
    check('مرتبطٌ بالقاعدة', p.linked === true && p.rosterCount === 4);

    const names = p.notVisited.map(t => t.name);
    check('«لم تزرهم» = من لم تزره هذا الفصل', names.length === 2 && names.includes('ناصر الهنائي') && names.includes('مريم الكندية'), names.join(','));
    check('من لم تزره قطّ أوّلاً، ثمّ الأطول عهداً', names[0] === 'مريم الكندية', names.join(','));
    check('ومعه آخر زيارةٍ له في أيّ فصل',
        p.notVisited.find(t => t.name === 'ناصر الهنائي').last === '2026-04-20' &&
        p.notVisited.find(t => t.name === 'مريم الكندية').last === '');

    check('«طال العهد» من زُرتهم هذا الفصل وتأخّروا',
        p.stale.length === 1 && p.stale[0].name === 'هدى البلوشي' && p.stale[0].days >= 42,
        JSON.stringify(p.stale.map(s => [s.name, s.days])));
    check('ومن زُرت قريباً ليس فيهم', !p.stale.some(s => s.name.includes('المعمري')));

    const schools = Object.fromEntries(p.schools);
    check('توزيع المدارس بعدد الزيارات', schools['الوادي'] === 2 && schools['النهضة'] === 1, JSON.stringify(schools));
    check('المدارس مرتَّبة تنازليّاً', p.schools[0][1] >= p.schools[p.schools.length - 1][1]);
}

// ═════════════════ ٥) العرض ═════════════════
console.log('\n§5 ما يُرسم');
{
    const { ctx, box } = makeEnv({
        now: NOW,
        store: { 'supervision_v6_visit_1': visit(day(2), 'سالم المعمري', 'الوادي') },
        teachers: [{ name: 'سالم المعمري', school: 'الوادي' }, { name: 'مريم الكندية', school: 'الأمل' }]
    });
    ctx.renderTermBoard('t1');
    const html = box.innerHTML;
    const term = ctx.svfTermOf(new Date());
    const from = ctx.svfTermRange(term).from;
    const localFrom = from.getFullYear() + '-' + String(from.getMonth() + 1).padStart(2, '0') + '-01';
    const utcFrom = new Date(from.getTime() - from.getTimezoneOffset() * 60000 - 86400000).toISOString().slice(0, 10);

    check('العنوان والأقسام الأربعة',
        /إشرافي هذا الفصل/.test(html) && /لم تزرهم بعد/.test(html) && /طال العهد بهم/.test(html) &&
        /زياراتك هذا الفصل/.test(html) && /توزيع الزيارات على المدارس/.test(html));
    check('حدّ المدى بالتاريخ المحلّيّ لا بـUTC (توقيت مسقط +4 يُنقصه يوماً)',
        html.includes(localFrom) && !html.includes(utcFrom), localFrom + ' / ' + utcFrom);
    check('التواريخ معزولةٌ بـbdi فلا ينقلب عرضها في الجملة العربيّة', /<bdi>\d{4}-\d{2}-\d{2}<\/bdi>/.test(html));
    check('زرّ «ابدأ زيارة» لمن لم يُزر', /term-visit-btn/.test(html) && /data-teacher="مريم الكندية"/.test(html));
    check('أزرار تبديل الفصل', (html.match(/term-tab/g) || []).length >= 2);
    check('نسبة التغطية محسوبة', /50%/.test(html));

    check('صيغ العدد العربيّة',
        ctx.svfTermVisitWord(1) === 'زيارة واحدة' && ctx.svfTermVisitWord(2) === 'زيارتان' &&
        ctx.svfTermVisitWord(5) === '5 زيارات' && ctx.svfTermVisitWord(11) === '11 زيارة');
}
{
    /* اسمٌ فيه HTML — الأسماء تصل من أجهزةٍ أخرى عبر المزامنة */
    const { ctx, box } = makeEnv({
        now: NOW,
        store: { 'supervision_v6_visit_1': visit(day(1), '<img src=x onerror=alert(1)>', '<b>مدرسة</b>') },
        teachers: [{ name: '<script>bad()</script>', school: 'الأمل' }]
    });
    ctx.renderTermBoard();
    const html = box.innerHTML;
    check('أسماء المعلّمين والمدارس مهرَّبة',
        !/<img src=x/.test(html) && !/<script>bad/.test(html) && /&lt;img src=x/.test(html));
}
{
    /* بلا ربطٍ بقاعدة المعلمين */
    const { ctx, box } = makeEnv({ now: NOW, store: { 'supervision_v6_visit_1': visit(day(1), 'سالم المعمري', 'الوادي') } });
    ctx.renderTermBoard();
    const html = box.innerHTML;
    check('بلا ربط: اللوحة تعمل بالأرشيف وتُبيّن ما ينقصها',
        /يحتاج الربط|اربطه من الصفحة الرئيسية/.test(html) && /سالم المعمري/.test(html));
    check('وبلا ربطٍ لا تُزعم نسبة تغطية', /—/.test(html));
}

// ═════════════════ ٦) التوصيل ═════════════════
console.log('\n§6 التوصيل بالصفحة');
{
    const html = fs.readFileSync(path.join(ROOT, 'reports.html'), 'utf8');
    const sup = fs.readFileSync(path.join(ROOT, 'js/supervisory.js'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

    check('تبويبٌ في شريط الزيارات الإشرافية', /data-view="term-view"/.test(html) && /إشرافي هذا الفصل/.test(html));
    check('وحاويةٌ له في الصفحة', /id="term-view"/.test(html));
    check('والملف محمَّلٌ بعد autofill.js',
        html.indexOf('src="js/term-board.js"') > html.indexOf('src="js/autofill.js"'));
    check('toggleSupervisoryView يُخفيه مع البقيّة ويبنيه عند فتحه',
        /term-view/.test(sup) && /renderTermBoard\(\)/.test(sup));
    check('عامل الخدمة يحفظ الملف', /js\/term-board\.js/.test(sw));
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
