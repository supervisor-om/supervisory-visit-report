// =========================================================================
// النسخة السحابيّة للتقارير — تعمل بالربط وحده
//
// المشرف الذي ربط رمزه (js/identity.js) تُحفظ تقاريره — الإشرافيّة
// والمدرسيّة — نسخةً ثانيةً في قاعدة البيانات تحت مساره وحده، فتتبعه بين
// أجهزته ولا تضيع بمسح المتصفّح. ومن لم يربط يبقى كلُّ شيءٍ على جهازه كما
// كان: لا تُحمَّل مكتبة ولا يُرسَل شيء.
//
//   • **الجهاز هو الأصل.** الحفظ يتمّ محلّياً أوّلاً ثمّ يُرفع؛ فشلُ الرفع
//     لا يُفقد تقريراً ولا يمنع حفظه.
//   • **الأحدث يغلب** (updatedAt): ما في السحابة أحدثُ ينزل، وما في الجهاز
//     أحدثُ يصعد. ولا يُقارن تقريران بغير مفتاحهما.
//   • **الحذف يُرفع علامةً لا محواً** (deleted:true): بلا ذلك يعيد الجهازُ
//     الآخر رفعَ ما حُذف فيعود التقرير من قبره.
//   • المسار `reports/<معرّف المشرف>/items/<مفتاح التقرير>`.
//
// **فصلٌ تنظيميّ لا قفل** — كحال قاعدة المعلمين نفسها: القواعد تسمح
// بالقراءة بلا مصادقة، فمن عرف المسار قرأ. السرّيّة الحقيقيّة تحتاج
// Firebase Authentication (المرحلة ٢ في firestore.rules).
// =========================================================================
(function (global) {
    'use strict';

    // بادئات مفاتيح التقارير في المتصفّح — ما عداها لا يُرفع ولا يُنزَّل
    const KIND_PREFIX = {
        supervision: 'supervision_v6_visit_',
        school: 'supervision_v6_school_report_'
    };

    // المسار جزءٌ من عنوان الوثيقة، فيُتحقّق من شكله قبل استعماله
    const BUCKET_RE = /^[a-z][a-z0-9-]{1,30}$/;
    const ROOT = 'reports';
    const ITEMS = 'items';

    const OFF_KEY = 'svf_cloud_off';     // إيقافٌ اختياريّ يبقى بعد الإغلاق
    const LAST_KEY = 'svf_cloud_last';   // وقت آخر مزامنةٍ ناجحة
    const FULL_KEY = 'svf_cloud_full';   // وقت آخر مزامنةٍ شاملة

    // **الحصّة اليوميّة**: سردُ المجموعة كاملةً يُحتسب قراءةً لكلّ تقرير، وفتحُ
    // الموقع يتكرّر في اليوم الواحد — وقد سبق أن أُنفدت حصّةُ هذا المشروع بقراءةٍ
    // من هذا النوع. فالمزامنة تطلب ما تغيّر منذ آخر مرّة وحده.
    const SKEW_MS = 5 * 60 * 1000;        // فرقُ ساعات الأجهزة لا يُسقط تقريراً
    const FULL_MS = 24 * 60 * 60 * 1000;  // وشاملةٌ كلّ يوم تُصلح ما أسقطه فرقٌ أكبر

    // ------------------------------------------------------------- الهويّة
    function identity() {
        try {
            return (global.SupervisorIdentity && SupervisorIdentity.getIdentity()) || null;
        } catch (e) { return null; }
    }

    // المعرّف نفسه هو المسار: ثابتٌ لا يتبدّل بتغيير الرمز، فلا يفقد
    // المشرف أرشيفه حين يغيّره. و«المشرف العام» له مسارٌ مستقلّ.
    function bucket() {
        const me = identity();
        if (!me) return '';
        const b = me.admin ? 'admin' : me.id;
        return BUCKET_RE.test(b) ? b : '';
    }

    function isOff() {
        try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; }
    }

    function isOn() { return !!bucket() && !isOff(); }

    function setOff(off) {
        try {
            if (off) localStorage.setItem(OFF_KEY, '1');
            else localStorage.removeItem(OFF_KEY);
        } catch (e) { /* التخزين ممتلئ — الحالة تبقى كما كانت */ }
        renderCard();
    }

    function stampAt(key) {
        const v = Number(localStorage.getItem(key));
        return v > 0 ? v : 0;
    }

    function lastSync() { return stampAt(LAST_KEY); }

    // ------------------------------------------------------ تقارير الجهاز
    function kindOf(key) {
        for (const [kind, prefix] of Object.entries(KIND_PREFIX)) {
            if (key.indexOf(prefix) === 0) return kind;
        }
        return '';
    }

    function readLocal(key) {
        try {
            const v = JSON.parse(localStorage.getItem(key));
            return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
        } catch (e) { return null; }
    }

    function localKeys() {
        const out = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && kindOf(k)) out.push(k);
            }
        } catch (e) { /* لا تقارير تُقرأ */ }
        return out;
    }

    function stamp(key, data) {
        if (!Number(data.updatedAt)) {
            data.updatedAt = Date.now();
            try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
        }
        return Number(data.updatedAt) || 0;
    }

    // ------------------------------------------------------------ الاتّصال
    // المكتبة تُحمَّل من identity.js: تطبيقٌ واحدٌ لا تطبيقان
    function sdk() {
        if (!global.SupervisorIdentity) return Promise.reject(new Error('الهويّة غير محمّلة'));
        return SupervisorIdentity.loadSdk();
    }

    function itemsCol(fb) { return fb.collection(fb.db, ROOT, bucket(), ITEMS); }
    function itemDoc(fb, key) { return fb.doc(fb.db, ROOT, bucket(), ITEMS, key); }

    // --------------------------------------------------------------- الرفع
    // تُستدعى بعد كلّ حفظ. لا ترمي: التقرير محفوظٌ محلّياً على كلّ حال.
    async function push(key) {
        if (!isOn()) return false;
        const kind = kindOf(key);
        const data = readLocal(key);
        if (!kind || !data) return false;
        try {
            const fb = await sdk();
            const me = identity();
            await fb.setDoc(itemDoc(fb, key), {
                key: key,
                kind: kind,
                supervisor: me ? me.name : '',
                updatedAt: stamp(key, data),
                json: JSON.stringify(data)
            });
            return true;
        } catch (e) { return false; }
    }

    // الحذف علامةٌ تُرفع لا وثيقةٌ تُمحى — وإلّا أعاد جهازٌ آخر رفعَ المحذوف.
    // و**نصّ التقرير يبقى في الوثيقة** مع العلامة: الحذف بالخطأ يقع، وبلا
    // النصّ لا رجعة فيه. يُستخرج بـ deletedItems() ويُعاد بـ restore().
    // `snapshot` نصّ التقرير يُلتقط قبل محوه محلّياً — فالنداء يأتي بعده.
    async function remove(key, snapshot) {
        if (!isOn()) return false;
        const kind = kindOf(key);
        if (!kind) return false;
        const json = typeof snapshot === 'string' && snapshot
            ? snapshot
            : (readLocal(key) ? JSON.stringify(readLocal(key)) : '');
        try {
            const fb = await sdk();
            const me = identity();
            const doc = {
                key: key,
                kind: kind,
                supervisor: me ? me.name : '',
                updatedAt: Date.now(),
                deleted: true
            };
            if (json) doc.json = json;
            await fb.setDoc(itemDoc(fb, key), doc);
            return true;
        } catch (e) { return false; }
    }

    // المحذوفات الباقية في السحابة بنصّها — سلّةٌ يُرجع منها ما حُذف بالخطأ
    async function deletedItems() {
        if (!isOn()) return [];
        const fb = await sdk();
        const snap = await fb.getDocs(itemsCol(fb));
        const out = [];
        snap.forEach(d => {
            const v = d.data();
            if (v && v.deleted && typeof v.json === 'string' && kindOf(v.key || '')) {
                let t = {};
                try { t = JSON.parse(v.json); } catch (e) {}
                out.push({ key: v.key, kind: v.kind, deletedAt: v.updatedAt,
                           title: t.teacherName || t.schoolName || '', date: t.visitDate || '' });
            }
        });
        return out.sort((a, b) => b.deletedAt - a.deletedAt);
    }

    // الإرجاع: يُكتب التقرير في الجهاز بتوقيتٍ جديد ثمّ يُرفع، فتزول العلامة
    // عن سائر الأجهزة عند مزامنتها.
    async function restore(key) {
        if (!isOn() || !kindOf(key)) return false;
        const fb = await sdk();
        const snap = await fb.getDocs(itemsCol(fb));
        let found = null;
        snap.forEach(d => { const v = d.data(); if (v && v.key === key) found = v; });
        if (!found || typeof found.json !== 'string') return false;
        let data;
        try { data = JSON.parse(found.json); } catch (e) { return false; }
        if (!data || typeof data !== 'object') return false;
        data.updatedAt = Date.now();
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { return false; }
        await push(key);
        announce();
        return true;
    }

    // ------------------------------------------------------------ المزامنة
    let running = null;

    async function sync() {
        if (!isOn()) return { on: false };
        if (running) return running;          // نداءان معاً لا يتسابقان
        running = doSync().catch(e => ({ on: true, error: e && e.message || 'تعذّرت المزامنة' }));
        try { return await running; } finally { running = null; }
    }

    async function doSync() {
        const fb = await sdk();

        // شاملةٌ أوّل مرّة وكلّ يوم، وما بينهما ما تغيّر وحده
        const since = lastSync();
        const full = !since || Date.now() - stampAt(FULL_KEY) > FULL_MS;
        const col = itemsCol(fb);
        const snap = await fb.getDocs(
            full ? col : fb.query(col, fb.where('updatedAt', '>', since - SKEW_MS)));

        const cloud = new Map();
        snap.forEach(d => {
            const v = d.data();
            if (v && typeof v.key === 'string' && kindOf(v.key)) cloud.set(v.key, v);
        });

        let pulled = 0, erased = 0;
        cloud.forEach((v, key) => {
            const local = readLocal(key);
            const localAt = local ? Number(local.updatedAt) || 0 : -1;
            const cloudAt = Number(v.updatedAt) || 0;

            if (v.deleted) {
                // حُذف في جهازٍ آخر: لا يُمحى هنا إن كان قد عُدّل بعد الحذف
                if (local && cloudAt >= localAt) {
                    try { localStorage.removeItem(key); erased++; } catch (e) {}
                }
                return;
            }
            if (typeof v.json !== 'string' || cloudAt <= localAt) return;
            try {
                const obj = JSON.parse(v.json);
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
                localStorage.setItem(key, v.json);
                pulled++;
            } catch (e) { /* وثيقةٌ معطوبة تُترك ولا تُفسد المزامنة */ }
        });

        // في الجزئيّة لا تُعرف السحابة كلّها، فيُرفع ما تغيّر هنا منذ آخر مزامنة.
        // والشاملة تُقارن بكلّ ما فيها فتُصلح ما فات.
        let pushed = 0;
        for (const key of localKeys()) {
            const local = readLocal(key);
            if (!local) continue;
            const c = cloud.get(key);
            const localAt = stamp(key, local);
            const known = c ? Number(c.updatedAt) || 0 : (full ? -1 : since - SKEW_MS);
            if (localAt > known) {
                if (await push(key)) pushed++;
            }
        }

        const now = Date.now();
        try {
            localStorage.setItem(LAST_KEY, String(now));
            if (full) localStorage.setItem(FULL_KEY, String(now));
        } catch (e) {}
        if (pulled || erased) announce();
        return { on: true, pulled: pulled, erased: erased, pushed: pushed, full: full };
    }

    // تُعلِم الواجهةَ أنّ تقارير الجهاز تبدّلت فتُعاد قوائمها
    function announce() {
        try { document.dispatchEvent(new CustomEvent('svf-cloud-changed')); } catch (e) {}
    }

    // ------------------------------------------------------------ الواجهة
    const esc = s => String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    function when(ms) {
        if (!ms) return 'لم تتمّ مزامنةٌ بعد';
        return 'آخر مزامنة ' + new Date(ms).toLocaleString('ar-OM-u-nu-latn',
            { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
    }

    function summarize(r) {
        if (!r || r.on === false) return '';
        if (r.error) return r.error;
        const bits = [];
        if (r.pushed) bits.push('رُفع ' + r.pushed);
        if (r.pulled) bits.push('نزل ' + r.pulled);
        if (r.erased) bits.push('حُذف ' + r.erased);
        return bits.length ? bits.join(' · ') : 'كلّ شيءٍ محدَّث';
    }

    function renderCard(message, isError) {
        const box = document.getElementById('cloudCard');
        if (!box) return;
        const me = identity();
        const msg = message
            ? `<p class="text-sm mt-3 ${isError ? 'text-red-600' : 'text-slate-500'}">${esc(message)}</p>`
            : '';

        if (!me) {
            box.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-right">
                <div class="flex items-center gap-2 font-bold text-slate-600 mb-1">
                    <i class="fa-solid fa-cloud text-slate-400"></i> النسخة السحابيّة للتقارير
                </div>
                <p class="text-sm text-slate-500">تقاريرك محفوظةٌ على هذا الجهاز وحده. اربط رمزك أعلاه لتُحفظ لك نسخةٌ سحابيّةٌ خاصّةٌ بك تتبعك بين أجهزتك.</p>
            </div>`;
            return;
        }

        if (isOff()) {
            box.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-right">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div class="min-w-0">
                        <div class="font-bold text-slate-600"><i class="fa-solid fa-cloud-arrow-up text-slate-400 ml-1"></i> النسخة السحابيّة متوقّفة</div>
                        <div class="text-xs text-slate-500 mt-1">التقارير تُحفظ على هذا الجهاز وحده.</div>
                    </div>
                    <button id="cloudOnBtn" type="button"
                        class="bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl transition-all">تشغيل</button>
                </div>
                ${msg}
            </div>`;
            document.getElementById('cloudOnBtn').addEventListener('click', () => {
                setOff(false);
                syncNow();
            });
            return;
        }

        box.innerHTML = `
        <div class="bg-white border border-sky-200 rounded-2xl p-5 shadow-sm text-right">
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                    <div class="font-bold text-slate-700"><i class="fa-solid fa-cloud text-sky-600 ml-1"></i> النسخة السحابيّة مفعّلة — ${esc(me.name)}</div>
                    <div class="text-xs text-slate-500 mt-1">${esc(when(lastSync()))}</div>
                </div>
                <div class="flex gap-2">
                    <button id="cloudSyncBtn" type="button"
                        class="bg-white border border-slate-200 hover:border-sky-400 hover:bg-sky-50 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl transition-all">
                        <i class="fa-solid fa-rotate"></i> مزامنة الآن</button>
                    <button id="cloudOffBtn" type="button"
                        class="bg-white border border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-600 hover:text-red-700 text-sm font-medium px-4 py-2 rounded-xl transition-all">إيقاف</button>
                </div>
            </div>
            ${msg}
        </div>`;
        document.getElementById('cloudSyncBtn').addEventListener('click', e => {
            e.currentTarget.disabled = true;
            syncNow();
        });
        document.getElementById('cloudOffBtn').addEventListener('click', () => setOff(true));
    }

    async function syncNow() {
        const r = await sync();
        if (r.on === false) { renderCard(); return r; }
        renderCard(summarize(r), !!r.error);
        return r;
    }

    // عند فتح الموقع: مزامنةٌ صامتة — خطؤها لا يُعلن، والتقارير محلّيّةٌ أصلاً
    function initCard() {
        renderCard();
        if (!isOn()) return;
        sync().then(r => { if (!r.error) renderCard(summarize(r)); });
    }

    // الربط أو إلغاؤه يبدّل الحالة، فتُعاد البطاقة ويُزامَن الجديد
    try {
        document.addEventListener('svf-teachers-changed', () => {
            renderCard();
            if (isOn()) sync().then(r => { if (!r.error) renderCard(summarize(r)); });
        });
    } catch (e) { /* بلا مستند: الوحدة تُختبر بلا واجهة */ }

    global.SupervisorCloud = {
        isOn: isOn, bucket: bucket, kindOf: kindOf,
        push: push, remove: remove, sync: sync, syncNow: syncNow,
        deletedItems: deletedItems, restore: restore,
        initCard: initCard, renderCard: renderCard, setOff: setOff, lastSync: lastSync
    };
})(typeof window !== 'undefined' ? window : globalThis);
