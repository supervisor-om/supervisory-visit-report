// =========================================================================
// هوية المشرف — الربط الاختياريّ بقاعدة بيانات المعلمين
//
// المشرف يُدخل رمزه في موقع بيانات المعلمين نفسه، فيتعرّف الموقع عليه ويسحب
// معلّميه وحدهم (حقل «المشرف») إلى نسخةٍ في المتصفّح. بلا رمزٍ لا تُحمَّل
// مكتبة Firebase أصلاً ويعمل الموقع كما كان.
//
//   • لا يُخزَّن الرمز نصّاً: تُحفظ بصمته مع الهوية، فلا يُعاد إدخاله كلّ مرّة.
//   • إن غيّر المشرف رمزه في موقع المعلمين (supervisor_codes) لم تعد البصمة
//     تطابق، فيُلغى الربط عند التحديث التالي ويُطلب الرمز الجديد.
//   • النسخة المحلّيّة تحمل ما يلزم التقارير فقط — لا رقم مدنيّ ولا هاتف.
//   • قراءةٌ فقط: هذا الموقع لا يكتب في قاعدة المعلمين.
//   • الفصل بين المشرفين هنا تنظيمٌ لا قفل: قواعد القاعدة تسمح بالقراءة لأيّ
//     أحد حتّى تُفعَّل المصادقة (firestore.rules في teacher-data-collection).
//
// القائمة بين العلامتين يكتبها sync_supervisors.py في teacher-data-tools —
// لا تُعدَّل يدوياً، وإلّا قبل هذا الموقع رمزاً يرفضه موقع المعلمين.
// =========================================================================
(function (global) {
    'use strict';

    /* === SUPERVISORS:BEGIN === */
    const SUPERVISORS = [
        { id: 'sabah', name: 'صباح المقبالي',
          hash: '8ff29a74698dcaa4300887c3cf23039558d01047187ce6c548c5ed933da2a45d' },
        { id: 'majid', name: 'ماجد الأخزمي',
          hash: 'd877e40bc66bb03d760ac49bc89804517f17dbc11254393b72f9d0735c95aefa' },
        { id: 'nasser-r', name: 'ناصر الرزيقي',
          hash: 'b9a5101697e521e561eb7f9e50556d30d3c6f34c0f724241877e7f16afa39645' },
        { id: 'hisham', name: 'هشام العدواني',
          hash: '8deb94b9c8c6b93c8bb71ad751708e53e942f99940ccc701a3fa68847cf7f6c4' },
        { id: 'nasser-n', name: 'ناصر الناعبي',
          hash: '6b0085633cd47ec837e76c9871c521f022470278263a39361c61cbc8d21631a3' },
        { id: 'asad', name: 'أسعد الخصيبي',
          hash: '4164a649903c12ffbe46eeef00b2407f8a7810e849aad87291a840a97a35318f' },
        { id: 'hind', name: 'هند الهنائية',
          hash: '88fc0bd950bac496a86150f2d12a4b71ed54d35eaa85bb9fa892e8f8d9851861' },
        { id: 'yusra', name: 'يسرى الذخرية',
          hash: 'a467d5444c774b2c07fda8d064bc54156ede6e88d13d2206c294690238bc64cf' },
        { id: 'rua', name: 'رؤى المحاربية',
          hash: '11a0ba4f3afa901648d55de340176ef6a9b2f83213b3d58c7a0ac8394c289e58' },
        { id: 'amal', name: 'أمل النعمانية',
          hash: '1ba1e4c3709621a74b284da5253142141442e298ffabec6bb549ac48f2e18072' },
        { id: 'raya', name: 'رياء الشريقية',
          hash: '1d273991ac265dc9c48fcb1206b9c54908f699a9cbdbf092e61f6e280d3e53f3' },
        { id: 'aisha', name: 'عائشة البلوشية',
          hash: '9e25d0a9e7ec463aea1ad4f1547093b5852628622bb8b720a9feac55bab42c60' },
        { id: 'mahra', name: 'مهرة اليعقوبية',
          hash: 'b314aa3e1aa576b2cf98d741c24928ce7d371ffbf50c770c56f5974fa5de2aa6' },
        { id: 'ruqaya', name: 'رقية العميرية',
          hash: '3fac8fee92bc8999a1b45d92cceea326c9b6b5ed9c8ca87ac3ea7b8cd6bb2ac6' },
        { id: 'asiya', name: 'آسية الكندية',
          hash: '345ac74cea2a95b2467a8a79520b808e3e7d616198ff0f900681624352b0706f' }
    ];
    const ADMIN_HASH = '8d1d894f28ad2a5f8ecc4ad8230dfcfd5b2ee8e71ac3634ec89f40de605ca3a1';
    /* === SUPERVISORS:END === */

    const FIREBASE = {
        apiKey: 'AIzaSyC-TbgJ65PuKeiedsTBjhpOvuV0uTg95kA',
        authDomain: 'teacher-data-collection-716bb.firebaseapp.com',
        projectId: 'teacher-data-collection-716bb',
        storageBucket: 'teacher-data-collection-716bb.appspot.com',
        messagingSenderId: '265119186663',
        appId: '1:265119186663:web:6703a0600f0de0f93b2c42'
    };
    // النسخة الخفيفة: قراءاتٌ مفردة بلا اتّصالٍ دائم، وحجمها ثلث الكاملة
    const SDK_BASE = 'https://www.gstatic.com/firebasejs/11.6.1/';

    const ID_KEY = 'svf_identity';
    const CACHE_PREFIX = 'svf_teachers_cache_';
    // رقم بنية النسخة المحفوظة. **يُرفع كلّما أُضيف حقلٌ إلى FIELDS أو تغيّر اشتقاق**:
    // نسخةٌ سُحبت بالبنية القديمة تبقى «حديثة» أقلّ من يوم فلا تُحدَّث، فتُعبَّأ
    // النماذج ناقصةً بلا خطأ ظاهر (هكذا غاب رقم الملف بعد إضافته).
    const CACHE_VERSION = 2;
    const ADMIN_ID = '*';
    const REFRESH_MS = 24 * 60 * 60 * 1000;

    const SUP_FIELD = 'المشرف';

    // الحقول المنقولة من سجلّ المعلّم — ما عداها لا يغادر قاعدة البيانات.
    // القائمة بدائل: الحكوميّ والخاصّ يسمّيان الصفوف بمفتاحين مختلفين.
    const FIELDS = {
        name:       ['اسم المعلم'],
        school:     ['المدرسة'],
        schoolType: ['نوع المدرسة'],
        supervisor: [SUP_FIELD],
        load:       ['عدد الحصص'],
        grades:     ['الصفوف التي يدرسها', 'الفصول التي تدرسها'],
        specialty:  ['التخصص'],
        wilaya:     ['الولاية'],
        principal:  ['اسم مدير المدرسة'],
        fileNumber: ['رقم الملف']
    };

    // الجنس مشتقٌّ من «الحالة الاجتماعية» (متزوجة/عزباء/منفصلة ← أنثى) لأنّ القاعدة لا
    // تحمل حقل جنس. يُشتقّ هنا ولا تُنسخ الحالة الاجتماعيّة نفسها إلى المتصفّح.
    const MARITAL = 'الحالة الاجتماعية';
    function genderOf(row) {
        const v = String(row[MARITAL] == null ? '' : row[MARITAL]).trim();
        // المؤنّث أوّلاً: «منفصلة» تبدأ بـ«منفصل» و«متزوجة» بـ«متزوج»
        if (/^(متزوجة|عزباء|منفصلة)/.test(v)) return 'f';
        if (/^(متزوج|[اأ]عزب|منفصل)/.test(v)) return 'm';
        return '';                     // مجهولٌ لا مُخمَّن — النموذج يبقى على افتراضه
    }

    // ---------------------------------------------------------------- تخزين
    function readJSON(key) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : null;
        } catch (e) { return null; }
    }

    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch (e) { throw new Error('تعذّر الحفظ في هذا المتصفّح — قد تكون مساحة التخزين ممتلئة.'); }
    }

    function remove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* لا شيء يُمسح */ }
    }

    function clearCaches() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
            }
            keys.forEach(remove);
        } catch (e) { /* لا شيء يُمسح */ }
    }

    // ---------------------------------------------------------------- الرمز
    async function sha256(text) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    }

    const effHash = (sup, overrides) => (overrides && overrides[sup.id]) || sup.hash;

    // حكم data.html نفسه: رمز مشرفٍ (بعد الرموز التي غيّرها المشرفون) ثمّ رمز المشرف العام
    function resolveHash(h, overrides) {
        const who = SUPERVISORS.find(s => effHash(s, overrides) === h);
        if (who) return { id: who.id, name: who.name, hash: h };
        if (ADMIN_HASH && h === ADMIN_HASH) return { id: ADMIN_ID, name: 'المشرف العام', hash: h, admin: true };
        return null;
    }

    // ------------------------------------------------------------- Firebase
    let sdkPromise = null;
    function loadSdk() {
        if (!sdkPromise) {
            sdkPromise = Promise.all([
                import(SDK_BASE + 'firebase-app.js'),
                import(SDK_BASE + 'firebase-firestore-lite.js')
            ]).then(([app, fs]) => ({
                db: fs.getFirestore(app.initializeApp(FIREBASE, 'teachers')),
                collection: fs.collection, getDocs: fs.getDocs, query: fs.query, where: fs.where,
                // الكتابة للنسخة السحابيّة للتقارير (js/cloud.js) — أمّا قاعدة
                // المعلمين نفسها فهذا الموقع لا يكتب فيها
                doc: fs.doc, setDoc: fs.setDoc
            })).catch(err => { sdkPromise = null; throw err; });
        }
        return sdkPromise;
    }

    // الرموز التي غيّرها المشرفون تُحفظ محلّيّاً كذلك: بوّابة الدخول تتحقّق بها
    // بلا إنترنت، وإلّا رُفض رمزُ من غيّر رمزه وهو غير متّصل
    const OVERRIDES_KEY = 'svf_code_overrides';

    function cachedOverrides() {
        const v = readJSON(OVERRIDES_KEY);
        return (v && typeof v === 'object') ? v : {};
    }

    async function loadOverrides(sdk) {
        const snap = await sdk.getDocs(sdk.collection(sdk.db, 'supervisor_codes'));
        const m = {};
        snap.forEach(d => { const v = d.data(); if (v && v.hash) m[d.id] = v.hash; });
        try { writeJSON(OVERRIDES_KEY, m); } catch (e) { /* التخزين ليس شرطاً للتحقّق */ }
        return m;
    }

    // تحقّقٌ من الرمز بلا ربط: محلّيّاً أوّلاً (الملفّ + الرموز المحفوظة)، ثمّ
    // من القاعدة إن لم يُطابق ووُجد اتّصال — فرمزٌ غُيّر للتوّ على جهازٍ آخر يُقبل
    async function verifyCode(code) {
        const text = String(code == null ? '' : code).trim();
        if (!text) return null;
        const h = await sha256(text);

        const local = resolveHash(h, cachedOverrides());
        if (local) return local;

        try {
            const sdk = await api.loadSdk();
            const fresh = await loadOverrides(sdk);
            return resolveHash(h, fresh);
        } catch (e) {
            return null;   // بلا اتّصال: يبقى الحكم على ما هو محفوظ
        }
    }

    function pick(row) {
        const t = {};
        for (const [k, keys] of Object.entries(FIELDS)) {
            let v = '';
            for (const f of keys) {
                if (row[f] != null && String(row[f]).trim()) { v = String(row[f]).trim(); break; }
            }
            t[k] = v;
        }
        t.gender = genderOf(row);
        t.grades = tidyGrades(t.grades);
        return t;
    }

    // «1،2،3» ← «1-3»، و«9،10،11،12» ← «9-12»، والمتقطّع يبقى مفصولاً.
    // شكل النطاق هو ما يكتبه رأي الزائر: «ويدرس الصفوف (5-12)».
    function tidyGrades(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        const nums = (s.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 12);
        if (!nums.length) return s;
        const uniq = [...new Set(nums)].sort((a, b) => a - b);
        if (uniq.length === 1) return String(uniq[0]);
        if (/-/.test(s) && nums.length === 2) return uniq[0] + '-' + uniq[1];
        const contiguous = uniq.every((n, i) => i === 0 || n === uniq[i - 1] + 1);
        return contiguous ? uniq[0] + '-' + uniq[uniq.length - 1] : uniq.join('، ');
    }

    // المشرف يطلب معلّميه بالاسم صراحةً — وهو الشكل الذي تقبله قواعد Firestore
    // حين تُقفل القراءة لاحقاً (القواعد ترفض الطلب ولا تُصفّيه)
    async function fetchTeachers(identity, sdk) {
        const col = sdk.collection(sdk.db, 'teachers');
        const q = identity.admin ? col : sdk.query(col, sdk.where(SUP_FIELD, '==', identity.name));
        const snap = await sdk.getDocs(q);
        const teachers = [];
        snap.forEach(d => teachers.push(pick(d.data())));
        teachers.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        return teachers;
    }

    // --------------------------------------------------------------- الهويّة
    function getIdentity() {
        const v = readJSON(ID_KEY);
        if (!v || typeof v.id !== 'string' || !/^[0-9a-f]{64}$/.test(v.hash || '')) return null;
        if (v.id === ADMIN_ID) {
            return v.hash === ADMIN_HASH
                ? { id: ADMIN_ID, name: 'المشرف العام', hash: v.hash, admin: true, linkedAt: v.linkedAt }
                : null;
        }
        const sup = SUPERVISORS.find(s => s.id === v.id);
        // الاسم من القائمة الحاليّة لا من المحفوظ: هو ما يحمله حقل «المشرف» في القاعدة
        return sup ? { id: sup.id, name: sup.name, hash: v.hash, linkedAt: v.linkedAt } : null;
    }

    function readCache(identity) {
        const c = readJSON(CACHE_PREFIX + identity.id);
        return c && c.id === identity.id && Array.isArray(c.teachers) ? c : null;
    }

    async function link(code) {
        code = String(code == null ? '' : code).trim();
        if (!code) throw new Error('أدخل رمزك أولاً.');
        const h = await sha256(code);
        let sdk, overrides;
        try {
            sdk = await api.loadSdk();
            overrides = await loadOverrides(sdk);
        } catch (e) {
            throw new Error('تعذّر الاتصال بقاعدة بيانات المعلمين — تحقّق من الإنترنت وأعد المحاولة.');
        }
        const who = resolveHash(h, overrides);
        if (!who) throw new Error('رمز غير صحيح.');
        let teachers;
        try {
            teachers = await fetchTeachers(who, sdk);
        } catch (e) {
            throw new Error('تعرّفنا على رمزك لكن تعذّر سحب المعلمين — أعد المحاولة.');
        }
        // الهويّة تُحفظ بعد نجاح السحب، ونسخ المشرفين الآخرين تُمسح قبلها
        clearCaches();
        const identity = Object.assign({}, who, { linkedAt: Date.now() });
        writeJSON(ID_KEY, { id: identity.id, hash: identity.hash, linkedAt: identity.linkedAt });
        writeJSON(CACHE_PREFIX + identity.id, { id: identity.id, v: CACHE_VERSION, at: Date.now(), teachers });
        announce();
        return { identity, teachers };
    }

    // هويّةٌ تحقّقت بالفعل (بوّابة الدخول) — تُحفظ فوراً بلا شبكة، وسحب المعلّمين
    // يتولّاه refresh عند أوّل فتحٍ لصفحةٍ تحمل الوحدة. الانتقال بين الصفحات
    // يقطع أيّ طلبٍ يُبدأ لحظة الدخول، فلا يُعوَّل عليه.
    function adopt(who) {
        if (!who || !who.id || !who.hash || who.admin) return null;
        const me = { id: who.id, hash: who.hash, linkedAt: Date.now() };
        try { writeJSON(ID_KEY, me); } catch (e) { return null; }
        clearCaches();
        announce();
        return getIdentity();
    }

    function unlink() {
        remove(ID_KEY);
        clearCaches();
        announce();
    }

    // تُستدعى عند فتح الموقع: بلا ربطٍ لا شيء، وبنسخةٍ حديثةٍ لا اتّصال.
    // النسخة الأقدم من يوم (أو force) تُحدَّث، ومعها يُتحقَّق أنّ الرمز لم يتغيّر.
    async function refresh(force) {
        if (!readJSON(ID_KEY)) return { linked: false };
        const me = getIdentity();
        if (!me) { unlink(); return { linked: false, reason: 'removed' }; }
        const cache = readCache(me);
        const fresh = cache && cache.v === CACHE_VERSION && Date.now() - cache.at < REFRESH_MS;
        if (!force && fresh) return { linked: true };

        let sdk, overrides;
        try {
            sdk = await api.loadSdk();
            overrides = await loadOverrides(sdk);
        } catch (e) {
            return { linked: true, offline: true };   // بلا اتّصال تبقى الهويّة والنسخة السابقة
        }
        if (!me.admin && effHash(SUPERVISORS.find(s => s.id === me.id), overrides) !== me.hash) {
            unlink();
            return { linked: false, reason: 'code-changed' };
        }
        try {
            const teachers = await fetchTeachers(me, sdk);
            writeJSON(CACHE_PREFIX + me.id, { id: me.id, v: CACHE_VERSION, at: Date.now(), teachers });
            announce();
            return { linked: true, refreshed: true };
        } catch (e) {
            return { linked: true, offline: true };
        }
    }

    function getTeachers() {
        const me = getIdentity();
        const c = me && readCache(me);
        return c ? c.teachers : [];
    }

    // ------------------------------------------------------------ البحث
    // تسويةٌ عربيّة: الهمزات والتاء المربوطة والألف المقصورة والتطويل والتشكيل.
    // و«بن/بنت» تُسقط في أسماء المعلّمين وحدها: قاعدة المعلمين تُدرجها
    // للعمانيّين (٣٠٦ من ٥٠٢) وبوّابة الوزارة قد لا تحملها، فالمقارنة بها تُفشل
    // المطابقة على الاسم نفسه.
    function normalize(v) {
        return String(v == null ? '' : v)
            .replace(/[ـً-ْ]/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normName(v) {
        return normalize(v).split(' ').filter(w => w !== 'بن' && w !== 'بنت').join(' ');
    }

    // مطابقةٌ بلا تخمين: تامّةٌ أوّلاً، ثمّ احتواءٌ فريد. التعدّد يُردّ كما هو
    // ليُعرض على المستخدم — ولا يُختار عنه (سجلٌّ رسميٌّ باسمه).
    function matchBy(list, value, keyFn) {
        const want = keyFn(value);
        if (!want) return [];
        const exact = list.filter(t => keyFn(t) === want);
        if (exact.length) return exact;
        const part = list.filter(t => { const k = keyFn(t); return k && (k.includes(want) || want.includes(k)); });
        return part;
    }

    const teacherKey = t => normName(typeof t === 'string' ? t : t.name);
    const schoolKey  = t => normalize(typeof t === 'string' ? t : t.school);

    function findTeacher(name) {
        const hits = matchBy(getTeachers(), name, teacherKey);
        return { matches: hits, teacher: hits.length === 1 ? hits[0] : null };
    }

    function teachersOfSchool(school) {
        return matchBy(getTeachers(), school, schoolKey);
    }

    // اسم المدير من سجلّات المدرسة: يُقبل حين تتّفق، ويُترك حين تختلف —
    // ٨٣ مدرسةً من ١٢٦ ذات سجلّين فأكثر تختلف فيها كتابة اسم المدير.
    function principalOfSchool(school) {
        const names = teachersOfSchool(school).map(t => t.principal).filter(Boolean);
        if (!names.length) return { name: '', conflict: false };
        const uniq = [...new Set(names.map(normalize))];
        return uniq.length === 1 ? { name: names[0], conflict: false } : { name: '', conflict: true };
    }

    function schoolNames() {
        const seen = new Map();
        getTeachers().forEach(t => {
            const k = schoolKey(t);
            if (k && !seen.has(k)) seen.set(k, t.school);
        });
        return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ar'));
    }

    function teacherNames() {
        const seen = new Map();
        getTeachers().forEach(t => {
            const k = teacherKey(t);
            if (k && !seen.has(k)) seen.set(k, t.name);
        });
        return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ar'));
    }

    // تُعلِم الواجهةَ أنّ القائمة تبدّلت (ربطٌ أو تحديثٌ أو إلغاء) لتُعاد بناؤها
    function announce() {
        try { document.dispatchEvent(new CustomEvent('svf-teachers-changed')); } catch (e) {}
    }

    // ------------------------------------------------------------ الواجهة
    const esc = s => String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    function teacherCount(n) {
        if (n === 0) return 'لا يوجد معلمون مسندون إليك بعد';
        if (n === 1) return 'معلم واحد';
        if (n === 2) return 'معلمان';
        if (n <= 10) return n + ' معلمين';
        return n + ' معلماً';
    }

    function renderCard(message, isError) {
        const box = document.getElementById('identityCard');
        if (!box) return;
        const me = getIdentity();
        const msg = message
            ? `<p class="text-sm mt-3 ${isError ? 'text-red-600' : 'text-slate-500'}">${esc(message)}</p>`
            : '';

        if (!me) {
            box.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-right">
                <div class="flex items-center gap-2 font-bold text-slate-700 mb-1">
                    <i class="fa-solid fa-link text-blue-600"></i> الربط بقاعدة بيانات المعلمين
                    <span class="text-xs font-medium text-slate-400">(اختياري)</span>
                </div>
                <p class="text-sm text-slate-500 mb-3">أدخل رمزك في موقع بيانات المعلمين ليرتبط الموقع بمعلميك. بدون الرمز يعمل الموقع كالمعتاد.</p>
                <form id="identityForm" class="flex gap-2">
                    <input id="identityCode" type="password" autocomplete="off" placeholder="رمز المشرف"
                        class="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <button id="identityLinkBtn" type="submit"
                        class="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold px-5 py-2 rounded-xl transition-all">ربط</button>
                </form>
                ${msg}
            </div>`;
            document.getElementById('identityForm').addEventListener('submit', async e => {
                e.preventDefault();
                const input = document.getElementById('identityCode');
                const btn = document.getElementById('identityLinkBtn');
                const stale = box.querySelector('p.text-red-600');
                if (stale) stale.remove();   // رسالة المحاولة السابقة لا تبقى أثناء التحقّق
                btn.disabled = true;
                btn.textContent = 'جارٍ التحقّق…';
                try {
                    const { identity } = await link(input.value);
                    renderCard();
                    if (typeof showToast === 'function') showToast('تم الربط: ' + identity.name);
                } catch (err) {
                    renderCard(err.message, true);
                    const again = document.getElementById('identityCode');
                    if (again) again.focus();
                }
            });
            return;
        }

        const cache = readCache(me);
        const count = cache ? teacherCount(cache.teachers.length) : 'لم تُسحب قائمة المعلمين بعد';
        const at = cache ? ' · آخر تحديث ' + new Date(cache.at).toLocaleString('ar-OM-u-nu-latn',
            { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : '';
        box.innerHTML = `
        <div class="bg-white border border-green-200 rounded-2xl p-5 shadow-sm text-right">
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                    <div class="font-bold text-slate-700"><i class="fa-solid fa-circle-check text-green-600 ml-1"></i> مرتبط: ${esc(me.name)}</div>
                    <div class="text-xs text-slate-500 mt-1">${esc(count + at)}</div>
                </div>
                <div class="flex gap-2">
                    <button id="identityRefreshBtn" type="button"
                        class="bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl transition-all">
                        <i class="fa-solid fa-rotate"></i> تحديث</button>
                    <button id="identityUnlinkBtn" type="button"
                        class="bg-white border border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-600 hover:text-red-700 text-sm font-medium px-4 py-2 rounded-xl transition-all">
                        إلغاء الربط</button>
                </div>
            </div>
            ${msg}
        </div>`;
        document.getElementById('identityRefreshBtn').addEventListener('click', async e => {
            e.currentTarget.disabled = true;
            renderAfter(await refresh(true));
        });
        document.getElementById('identityUnlinkBtn').addEventListener('click', () => {
            unlink();
            renderCard('أُلغي الربط. الموقع يعمل كالمعتاد، ويمكنك الربط مجدداً برمزك.');
        });
    }

    function renderAfter(result) {
        if (result.reason === 'code-changed') renderCard('تغيّر رمزك في موقع بيانات المعلمين — أدخل الرمز الجديد.', true);
        else if (result.reason === 'removed') renderCard('لم يعد اسمك في قائمة المشرفين — راجع المشرف العام.', true);
        else if (result.offline) renderCard('تعذّر التحديث الآن — تُستخدم آخر قائمة محفوظة.', true);
        else renderCard();
    }

    function initCard() {
        renderCard();
        // تعذُّر التحديث عند الفتح لا يُعلَن — يُعلَن حين يطلبه المشرف بالزرّ
        refresh(false).then(r => { if (r.reason || r.refreshed) renderAfter(r); });
    }

    const api = {
        getIdentity, getTeachers, link, unlink, refresh, initCard, loadSdk, verifyCode, adopt,
        findTeacher, teachersOfSchool, principalOfSchool, schoolNames, teacherNames,
        normalize, normName, tidyGrades
    };
    global.SupervisorIdentity = api;
})(typeof window !== 'undefined' ? window : globalThis);
