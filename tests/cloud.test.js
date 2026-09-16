// اختبار انحدار: node tests/cloud.test.js
// يشغّل js/cloud.js الحقيقيّ بقاعدةٍ مزيّفةٍ بشكل Firestore Lite:
//   ١) بلا ربط: لا مزامنة ولا اتّصال — التقارير على الجهاز وحده
//   ٢) الرفع: المسار معرّفُ المشرف، والوثيقة بالشكل الذي تقبله القواعد
//   ٣) الأحدث يغلب: النزول والصعود بحسب updatedAt
//   ٤) الحذف علامةٌ لا محو، ولا يعيد جهازٌ آخر رفعَ ما حُذف
//   ٥) ما لا يخصّ التقارير لا يُرفع، والمعطوب لا يُفسد المزامنة
//   ٦) الإيقاف يوقف كلّ شيء، وانقطاع الشبكة لا يرمي
//   ٧) الحصّة اليوميّة: شاملةٌ أوّل مرّة وكلّ يوم، وما بينهما ما تغيّر وحده
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
const check = (name, ok, detail) => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail ? '  — ' + detail : ''));
    if (!ok) failures++;
};

const VISIT = 'supervision_v6_visit_';
const SCHOOL = 'supervision_v6_school_report_';

// قاعدةٌ مزيّفةٌ بشكل firestore-lite: doc/collection تبنيان مساراً، والسرد
// يُرجع ما تحت المجموعة وحدها — كما يفعل Firestore.
function fakeFirestore() {
    const docs = new Map();
    const log = [];
    const state = { fail: false };
    const sdk = {
        db: {},
        collection: (db, ...seg) => ({ path: seg.join('/') }),
        doc: (db, ...seg) => ({ path: seg.join('/') }),
        setDoc: async (ref, data) => {
            if (state.fail) throw new Error('offline');
            log.push(['set', ref.path, data]);
            docs.set(ref.path, JSON.parse(JSON.stringify(data)));
        },
        where: (field, op, value) => ({ field, op, value }),
        query: (col, w) => ({ path: col.path, w: w }),
        getDocs: async (col) => {
            if (state.fail) throw new Error('offline');
            log.push([col.w ? 'query' : 'list', col.path, col.w ? col.w.value : null]);
            let rows = [...docs.entries()].filter(([p]) => p.indexOf(col.path + '/') === 0);
            // التصفية «في الخادم» كما في Firestore: الجزئيّة لا تُرجع سواها
            if (col.w) rows = rows.filter(([, d]) => Number(d[col.w.field]) > col.w.value);
            return { forEach: fn => rows.forEach(([p, d]) => fn({ id: p.split('/').pop(), data: () => d })) };
        }
    };
    return { sdk, docs, log, state };
}

// بيئةٌ كاملة: تخزينٌ محلّيّ ومستندٌ صامتٌ وهويّةٌ يتحكّم بها الاختبار
function env(store, identity) {
    const data = Object.assign({}, store);
    const localStorage = {
        getItem: k => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: k => { delete data[k]; },
        key: i => Object.keys(data)[i] ?? null,
        get length() { return Object.keys(data).length; }
    };
    const events = [];
    const document = {
        getElementById: () => null,
        addEventListener: () => {},
        dispatchEvent: e => { events.push(e.type); return true; }
    };
    const fb = fakeFirestore();
    let loads = 0;
    const ctx = {
        localStorage, document, console,
        CustomEvent: class { constructor(type) { this.type = type; } },
        SupervisorIdentity: {
            getIdentity: () => identity || null,
            loadSdk: async () => { loads++; return fb.sdk; }
        }
    };
    vm.runInNewContext(SRC, ctx);
    return { api: ctx.SupervisorCloud, data, fb, events, loads: () => loads };
}

const report = (extra) => JSON.stringify(Object.assign({ id: 'x', school: 'مدرسة أ' }, extra));
const ME = { id: 'asad', name: 'أسعد الخصيبي', hash: 'f'.repeat(64) };

(async () => {
    /* ── ١) بلا ربط ── */
    {
        const e = env({ [VISIT + '1']: report({ updatedAt: 10 }) }, null);
        check('بلا ربط: المزامنة مطفأة', e.api.isOn() === false);
        check('بلا ربط: لا مسار', e.api.bucket() === '');
        const r = await e.api.sync();
        check('بلا ربط: sync لا تفعل شيئاً', r.on === false, JSON.stringify(r));
        check('بلا ربط: push لا يرفع', (await e.api.push(VISIT + '1')) === false);
        check('بلا ربط: remove لا يرفع', (await e.api.remove(VISIT + '1')) === false);
        check('بلا ربط: لا تُحمَّل المكتبة أصلاً', e.loads() === 0, String(e.loads()));
        check('بلا ربط: التقرير المحلّيّ لم يُمسّ', e.data[VISIT + '1'] === report({ updatedAt: 10 }));
    }

    /* ── ٢) الرفع وشكل الوثيقة ── */
    {
        const e = env({ [VISIT + '7']: report({ updatedAt: 500, teacherName: 'هاشم' }) }, ME);
        check('بالربط: المزامنة مشتغلة', e.api.isOn() === true);
        check('المسار معرّفُ المشرف', e.api.bucket() === 'asad', e.api.bucket());

        const ok = await e.api.push(VISIT + '7');
        const doc = e.fb.docs.get('reports/asad/items/' + VISIT + '7');
        check('push: يرفع', ok === true);
        check('push: المسار reports/<المعرّف>/items/<المفتاح>', !!doc, [...e.fb.docs.keys()].join(','));
        check('push: الحقول هي التي تقبلها القواعد وحدها',
              JSON.stringify(Object.keys(doc).sort()) === JSON.stringify(['json', 'key', 'kind', 'supervisor', 'updatedAt']),
              Object.keys(doc).join(','));
        check('push: النوع والمفتاح واسم المشرف',
              doc.kind === 'supervision' && doc.key === VISIT + '7' && doc.supervisor === 'أسعد الخصيبي',
              JSON.stringify([doc.kind, doc.key, doc.supervisor]));
        check('push: updatedAt هو وقت التقرير لا وقت الرفع', doc.updatedAt === 500, String(doc.updatedAt));
        check('push: التقرير كاملاً في json', JSON.parse(doc.json).teacherName === 'هاشم');

        // المشرف العام مسارٌ مستقلّ
        const admin = env({}, { id: '*', name: 'المشرف العام', admin: true });
        check('المشرف العام: مسارٌ باسم admin لا «*»', admin.api.bucket() === 'admin', admin.api.bucket());
    }

    /* ── ٣) الأحدث يغلب ── */
    {
        const e = env({
            [VISIT + 'a']: report({ updatedAt: 100, note: 'قديم' }),   // السحابة أحدث ← ينزل
            [VISIT + 'b']: report({ updatedAt: 900, note: 'جديد' }),   // الجهاز أحدث ← يصعد
            [SCHOOL + 'c']: report({ updatedAt: 300, note: 'مدرسيّ' }) // ليس في السحابة ← يصعد
        }, ME);
        e.fb.docs.set('reports/asad/items/' + VISIT + 'a',
            { key: VISIT + 'a', kind: 'supervision', updatedAt: 200, json: report({ updatedAt: 200, note: 'أحدث' }) });
        e.fb.docs.set('reports/asad/items/' + VISIT + 'b',
            { key: VISIT + 'b', kind: 'supervision', updatedAt: 400, json: report({ updatedAt: 400, note: 'أقدم' }) });
        e.fb.docs.set('reports/asad/items/' + VISIT + 'd',
            { key: VISIT + 'd', kind: 'supervision', updatedAt: 50, json: report({ updatedAt: 50, note: 'جهازٌ آخر' }) });

        const r = await e.api.sync();
        check('sync: نزل ما كان أحدث في السحابة', JSON.parse(e.data[VISIT + 'a']).note === 'أحدث', e.data[VISIT + 'a']);
        check('sync: لم يُطمس ما كان أحدث في الجهاز', JSON.parse(e.data[VISIT + 'b']).note === 'جديد', e.data[VISIT + 'b']);
        check('sync: صعد ما كان أحدث في الجهاز',
              JSON.parse(e.fb.docs.get('reports/asad/items/' + VISIT + 'b').json).note === 'جديد');
        check('sync: نزل تقريرٌ لا وجود له في الجهاز', JSON.parse(e.data[VISIT + 'd']).note === 'جهازٌ آخر');
        check('sync: صعد التقرير المدرسيّ بنوعه',
              e.fb.docs.get('reports/asad/items/' + SCHOOL + 'c').kind === 'school');
        check('sync: الحصيلة تُعدّ ما نزل وما صعد', r.pulled === 2 && r.pushed === 2 && r.erased === 0, JSON.stringify(r));
        check('sync: يُعلن التبدّل فتُعاد القوائم', e.events.includes('svf-cloud-changed'), e.events.join(','));
        check('sync: وقت آخر مزامنة يُحفظ', Number(e.data['svf_cloud_last']) > 0);
    }

    /* ── ٤) الحذف ── */
    {
        const e = env({ [VISIT + 'x']: report({ updatedAt: 100, teacherName: 'هاشم' }) }, ME);
        const raw = e.data[VISIT + 'x'];
        delete e.data[VISIT + 'x'];                       // كما يفعل الموقع: يمحو ثمّ يُعلم
        await e.api.remove(VISIT + 'x', raw);
        const doc = e.fb.docs.get('reports/asad/items/' + VISIT + 'x');
        check('remove: علامةُ حذفٍ لا محوٌ للوثيقة', !!doc && doc.deleted === true, JSON.stringify(doc));
        check('remove: نصّ التقرير يبقى مع العلامة فالحذف بالخطأ له رجعة',
              JSON.parse(doc.json || '{}').teacherName === 'هاشم', Object.keys(doc).join(','));

        // سلّة المحذوفات والإرجاع
        const trash = await e.api.deletedItems();
        check('deletedItems: يسرد المحذوف باسمه',
              trash.length === 1 && trash[0].key === VISIT + 'x' && trash[0].title === 'هاشم',
              JSON.stringify(trash));
        const back = await e.api.restore(VISIT + 'x');
        check('restore: يُرجع التقرير إلى الجهاز',
              back === true && JSON.parse(e.data[VISIT + 'x']).teacherName === 'هاشم', String(back));
        const after = e.fb.docs.get('reports/asad/items/' + VISIT + 'x');
        check('restore: تزول العلامة عن السحابة فلا يُمحى ثانيةً',
              !after.deleted && !!after.json, JSON.stringify(Object.keys(after)));
        check('restore: ما لا وجود له لا يُرجَع', (await e.api.restore(VISIT + 'nope')) === false);

        // ويعود الحال للاختبارات التالية
        delete e.data[VISIT + 'x'];
        await e.api.remove(VISIT + 'x', raw);

        // جهازٌ آخر لا يزال يحمل التقرير: المزامنة تمحوه عنده
        const other = env({ [VISIT + 'x']: report({ updatedAt: 100 }) }, ME);
        other.fb.docs.set('reports/asad/items/' + VISIT + 'x', doc);
        const r = await other.api.sync();
        check('sync: علامةُ الحذف تمحو التقرير في الجهاز الآخر',
              !(VISIT + 'x' in other.data) && r.erased === 1, JSON.stringify(r));
        check('sync: المحذوف لا يُعاد رفعه', r.pushed === 0, JSON.stringify(r));

        // عُدّل بعد الحذف ← التعديل أولى بالبقاء
        const edited = env({ [VISIT + 'x']: report({ updatedAt: doc.updatedAt + 1000, note: 'أُعيد' }) }, ME);
        edited.fb.docs.set('reports/asad/items/' + VISIT + 'x', doc);
        const r2 = await edited.api.sync();
        check('sync: ما عُدّل بعد الحذف لا يُمحى بل يُرفع',
              JSON.parse(edited.data[VISIT + 'x']).note === 'أُعيد' && r2.erased === 0 && r2.pushed === 1,
              JSON.stringify(r2));
    }

    /* ── ٥) ما لا يخصّ التقارير، والمعطوب ── */
    {
        const e = env({
            'svf_identity': '{"id":"asad"}',
            'svf_teachers_cache_asad': '{"teachers":[]}',
            'supervision_v6_school_roster_مدرسة': '[]',
            'supervision_v6_teacher_archive_هاشم': '[]',
            [VISIT + 'ok']: report({ updatedAt: 1 })
        }, ME);
        e.fb.docs.set('reports/asad/items/' + VISIT + 'bad', { key: VISIT + 'bad', kind: 'supervision', updatedAt: 9, json: '{{{' });
        e.fb.docs.set('reports/asad/items/junk', { key: 'junk', kind: 'supervision', updatedAt: 9, json: '{}' });

        const r = await e.api.sync();
        const sent = e.fb.log.filter(l => l[0] === 'set').map(l => l[1]);
        check('sync: الهويّة والنسخ والطواقم لا تُرفع',
              sent.length === 1 && sent[0].endsWith(VISIT + 'ok'), sent.join(','));
        check('sync: وثيقةٌ معطوبةٌ تُتجاوز ولا تُفسد المزامنة',
              !(VISIT + 'bad' in e.data) && r.pushed === 1, JSON.stringify(r));
        check('sync: مفتاحٌ غريبٌ من السحابة لا يُكتب في المتصفّح', !('junk' in e.data));
        check('kindOf: يميّز الإشرافيّ والمدرسيّ ويرفض ما عداهما',
              e.api.kindOf(VISIT + '1') === 'supervision' && e.api.kindOf(SCHOOL + '1') === 'school'
              && e.api.kindOf('svf_identity') === '');
    }

    /* ── ٦) الإيقاف وانقطاع الشبكة ── */
    {
        const e = env({ [VISIT + '1']: report({ updatedAt: 10 }) }, ME);
        e.api.setOff(true);
        check('الإيقاف: المزامنة تتوقّف', e.api.isOn() === false);
        check('الإيقاف: sync لا تتّصل', (await e.api.sync()).on === false && e.loads() === 0);
        check('الإيقاف: push لا يرفع', (await e.api.push(VISIT + '1')) === false);
        e.api.setOff(false);
        check('التشغيل: تعود', e.api.isOn() === true);

        const off = env({ [VISIT + '1']: report({ updatedAt: 10 }) }, ME);
        off.fb.state.fail = true;
        const r = await off.api.sync();
        check('بلا شبكة: sync تردّ خطأً ولا ترمي', !!r.error, JSON.stringify(r));
        check('بلا شبكة: push يردّ false ولا يرمي', (await off.api.push(VISIT + '1')) === false);
        check('بلا شبكة: التقرير المحلّيّ باقٍ', !!off.data[VISIT + '1']);
    }

    /* ── ٧) الحصّة: المزامنة الجزئيّة ── */
    {
        const e = env({ [VISIT + 'p']: report({ updatedAt: 100 }) }, ME);
        e.fb.docs.set('reports/asad/items/' + VISIT + 'old',
            { key: VISIT + 'old', kind: 'supervision', updatedAt: 50, json: report({ updatedAt: 50, note: 'قديم' }) });

        const first = await e.api.sync();
        check('الأولى شاملة', first.full === true && e.fb.log[0][0] === 'list', JSON.stringify(e.fb.log[0]));
        check('الشاملة تُنزل كلّ ما في السحابة', !!e.data[VISIT + 'old']);
        check('وقت الشاملة يُحفظ', Number(e.data['svf_cloud_full']) > 0);

        // الثانية جزئيّة: لا تسرد المجموعة كاملةً بل تطلب ما تغيّر
        e.fb.log.length = 0;
        const second = await e.api.sync();
        check('الثانية جزئيّة لا شاملة', second.full === false, JSON.stringify(second));
        check('الجزئيّة تطلب ما تغيّر لا الكلّ', e.fb.log[0][0] === 'query', JSON.stringify(e.fb.log[0]));
        check('الجزئيّة لا تُعيد رفع ما لم يتغيّر', second.pushed === 0, JSON.stringify(second));

        // تقريرٌ جديدٌ في السحابة بعد آخر مزامنة ينزل رغم أنّها جزئيّة
        const soon = Date.now() + 60000;
        e.fb.docs.set('reports/asad/items/' + VISIT + 'new',
            { key: VISIT + 'new', kind: 'supervision', updatedAt: soon, json: report({ updatedAt: soon, note: 'جديد' }) });
        const third = await e.api.sync();
        check('الجزئيّة تُنزل ما جدّ بعدها',
              JSON.parse(e.data[VISIT + 'new'] || '{}').note === 'جديد', JSON.stringify(third));

        // وتقريرٌ حُفظ هنا بعد آخر مزامنة يصعد
        e.data[VISIT + 'q'] = report({ updatedAt: Date.now() + 120000, note: 'هنا' });
        const fourth = await e.api.sync();
        check('الجزئيّة ترفع ما حُفظ هنا بعدها', fourth.pushed === 1, JSON.stringify(fourth));

        // بعد يومٍ تعود شاملة
        e.data['svf_cloud_full'] = String(Date.now() - 25 * 60 * 60 * 1000);
        e.fb.log.length = 0;
        const fifth = await e.api.sync();
        check('بعد يومٍ تعود شاملة', fifth.full === true && e.fb.log[0][0] === 'list', JSON.stringify(e.fb.log[0]));
    }

    console.log(failures ? `\n${failures} FAILED` : '\nكل الاختبارات نجحت');
    process.exit(failures ? 1 : 0);
})();
