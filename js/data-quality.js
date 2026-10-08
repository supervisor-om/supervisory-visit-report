// =========================================================================
// جودة بيانات المعلّمين (منذ 2026-10-08)
//
// بطاقةٌ أسفل «إشرافي هذا الفصل» تسرد ما ينقص قاعدة المعلّمين أو يخالف البوّابة، فيُصلَح
// في موقع بيانات المعلّمين قبل أن يُبطئ السكربت أو يجعله يخمّن (زيارة مريم 2026-10-07:
// رقم الملف فارغ، والاسم في البوّابة «مريم مصطفى محمد السيد» لا «مريم مصطفى موسى»).
//
// المصادر قراءةٌ فقط: نسخة المعلّمين من identity.js، و svf_portal_names الذي يكتبه
// السكربت عند اختيار المعلّم في البوّابة (v16.6). لا يُكتب شيءٌ في القاعدة من هنا.
// =========================================================================
(function (root) {
    'use strict';

    const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

    // دالّةٌ نقيّة: teachers من القاعدة، portal = { مفتاح: {site, portal, emp, school} }
    function svfDataQuality(teachers, portal, normName) {
        const norm = normName || clean;
        const list = (teachers || []).filter(t => t && clean(t.name));
        const out = { total: list.length, noFile: [], noGender: [], noGrades: [], noPrincipal: [], nameDiff: [] };

        list.forEach(t => {
            if (!clean(t.fileNumber)) out.noFile.push(t);
            if (t.gender !== 'm' && t.gender !== 'f') out.noGender.push(t);
            if (!clean(t.grades)) out.noGrades.push(t);
        });

        // المدرسة التي لا يذكر أيٌّ من سجلّاتها اسم المدير
        const bySchool = {};
        list.forEach(t => {
            const s = clean(t.school);
            if (!s) return;
            (bySchool[s] = bySchool[s] || []).push(t);
        });
        out.noPrincipal = Object.keys(bySchool)
            .filter(s => bySchool[s].every(t => !clean(t.principal)))
            .sort((a, b) => a.localeCompare(b, 'ar'));

        // الاسم في البوّابة يخالف القاعدة — ممّا حفظه السكربت عند اختيار المعلّم
        const entries = Object.values(portal || {}).filter(e => e && e.portal);
        list.forEach(t => {
            const k = norm(t.name);
            const e = entries.find(x => norm(x.site) === k);
            if (e && norm(e.portal) !== k)
                out.nameDiff.push({ name: t.name, school: t.school, portal: e.portal, emp: e.emp || '' });
        });

        const byName = (a, b) => clean(a.name).localeCompare(clean(b.name), 'ar');
        ['noFile', 'noGender', 'noGrades', 'nameDiff'].forEach(k => out[k].sort(byName));
        out.issues = out.noFile.length + out.noGender.length + out.noGrades.length + out.noPrincipal.length + out.nameDiff.length;
        return out;
    }

    if (typeof module !== 'undefined' && module.exports) { module.exports = { svfDataQuality }; return; }
    root.svfDataQuality = svfDataQuality;

    // ── البطاقة ──
    const esc = s => (typeof root.svfEscapeHtml === 'function' ? root.svfEscapeHtml(s)
        : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

    function readPortalNames() {
        try { return JSON.parse(localStorage.getItem('svf_portal_names') || '{}') || {}; } catch (e) { return {}; }
    }

    function section(title, hint, rows, icon) {
        if (!rows.length) return '';
        return `<details class="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
            <summary class="cursor-pointer font-bold text-slate-700 text-sm flex items-center gap-2">
                <i class="fa-solid ${icon} text-amber-500"></i> ${esc(title)}
                <span class="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">${rows.length}</span>
            </summary>
            <p class="text-xs text-slate-500 mt-2">${esc(hint)}</p>
            <div class="mt-2 divide-y divide-slate-100 max-h-64 overflow-y-auto">${rows.join('')}</div>
        </details>`;
    }

    const teacherRow = t => `<div class="py-1.5 text-sm"><span class="font-bold text-slate-700">${esc(t.name)}</span>
        <span class="text-xs text-slate-500"> — ${esc(t.school) || '—'}</span></div>`;

    root.svfDataQualityCard = function () {
        const id = root.SupervisorIdentity;
        let me = null;
        try { me = id && id.getIdentity(); } catch (e) {}
        if (!me) return '';
        const q = svfDataQuality(id.getTeachers(), readPortalNames(), id.normName);
        const body = q.issues ? [
            section('اسمه في البوّابة مختلف', 'كما وجده السكربت في البوّابة عند رفع زيارة. وحِّد الاسم في القاعدة ليطابق البوّابة.',
                q.nameDiff.map(d => `<div class="py-1.5 text-sm">
                    <div><span class="text-slate-500">في القاعدة:</span> <span class="font-bold text-slate-700">${esc(d.name)}</span></div>
                    <div><span class="text-slate-500">في البوّابة:</span> <span class="font-bold text-emerald-700">${esc(d.portal)}</span>
                        ${d.emp ? '<span class="text-xs text-slate-500"> — الرقم الوظيفي <bdi>' + esc(d.emp) + '</bdi></span>' : ''}</div></div>`),
                'fa-id-card'),
            section('بلا رقم ملف', 'رقم الملف يجعل السكربت يختار المعلّم في البوّابة بيقين لا بالاسم.', q.noFile.map(teacherRow), 'fa-hashtag'),
            section('بلا جنس معروف', 'الجنس يُشتقّ من «الحالة الاجتماعية» — وبدونه تُكتب الصياغة بالمذكّر.', q.noGender.map(teacherRow), 'fa-venus-mars'),
            section('بلا صفوف', 'الصفوف تُقترح عند إضافة الموقف الصفّيّ، ومنها عنوان الدرس من الخطة.', q.noGrades.map(teacherRow), 'fa-layer-group'),
            section('مدارس بلا اسم مدير', 'اسم المدير يُكتب في بند الالتقاء من رأي الزائر.',
                q.noPrincipal.map(s => `<div class="py-1.5 text-sm font-bold text-slate-700">${esc(s)}</div>`), 'fa-school')
        ].join('') : '<p class="text-sm text-emerald-700 font-bold">بيانات معلّميك مكتملة 👏</p>';
        return `<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h4 class="font-bold text-slate-700 flex items-center gap-2">
                    <i class="fa-solid fa-clipboard-check text-blue-500"></i> جودة بيانات معلّميك
                    <span class="text-xs font-medium text-slate-400">(${q.total} معلّماً)</span></h4>
                <a href="https://teachers.supervisor-mct.com/data.html" target="_blank" rel="noopener"
                   class="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg font-bold">
                   تعديلها في موقع بيانات المعلمين</a>
            </div>
            <div class="space-y-2">${body}</div>
        </div>`;
    };
})(typeof window !== 'undefined' ? window : this);
