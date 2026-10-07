// =========================================================================
// عنوان الدرس من الخطة الفصلية (منذ 2026-10-07)
//
// الصفّ + تاريخ الزيارة (+ جنس المعلّم) ← موضوع الأسبوع في الخطة (js/term-plan-data.js،
// يولّده scripts/build_term_plan.py من ملفّ Word). يُكتب في خانة الدرس **ما دامت فارغةً
// أو ما زالت تحمل ما كتبته الخطة** — ما كتبه المشرف بيده لا يُمسّ. وإن كان في الأسبوع أكثر
// من موضوع (يختار المعلّم، أو موضوعٌ للذكور وآخر للإناث والجنس مجهول) لا يُختار عنه:
// تُعرض الموضوعات اقتراحاتٍ في الخانة نفسها.
//
// موضعان: الموقف الصفّيّ في الزيارة المدرسيّة (cvGrade + schoolVisitDate ← cvSubject)،
// والزيارة الإشرافيّة (class + visitDate ← topic).
// =========================================================================
(function (root) {
    'use strict';

    const ORD = [
        ['حادي عشر', 11], ['الحادي عشر', 11], ['ثاني عشر', 12], ['الثاني عشر', 12],
        ['اول', 1], ['أول', 1], ['ثاني', 2], ['ثالث', 3], ['رابع', 4], ['خامس', 5],
        ['سادس', 6], ['سابع', 7], ['ثامن', 8], ['تاسع', 9], ['عاشر', 10]
    ];

    // «12/5» و«ثاني عشر/14» و«الأول» و«١٠/٣» ← رقم الصفّ؛ وما لا يُفهم ← 0
    function parseGrade(text) {
        const s = String(text || '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).trim();
        if (!s) return 0;
        const num = s.match(/^\D{0,6}?(\d{1,2})(?!\d)/);
        if (num && +num[1] >= 1 && +num[1] <= 12) return +num[1];
        const words = s.replace(/^ال/, '').replace(/[إأآ]/g, 'ا');
        for (const [w, n] of ORD) {
            const ww = w.replace(/^ال/, '').replace(/[إأآ]/g, 'ا');
            if (words.startsWith(ww)) return n;
        }
        return 0;
    }

    // الموضوعات المقرّرة للصفّ في ذلك اليوم، مصفّاةً بالجنس إن عُرف
    function lessonsFor(plan, grade, isoDate, gender) {
        const list = plan && plan.grades && plan.grades[String(grade)];
        if (!list || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return [];
        const hits = list.filter(e => e.from <= isoDate && isoDate <= e.to);
        const g = gender === 'm' || gender === 'f' ? gender : '';
        const out = hits.filter(e => !e.gender || !g || e.gender === g);
        const seen = new Set();
        return out.filter(e => !seen.has(e.topic) && seen.add(e.topic));
    }

    // الحكم: موضوعٌ واحدٌ يُكتب، وأكثر يُقترح
    function suggestTitle(plan, gradeText, isoDate, gender) {
        const grade = parseGrade(gradeText);
        const lessons = grade ? lessonsFor(plan, grade, isoDate, gender) : [];
        return {
            grade,
            title: lessons.length === 1 ? lessons[0].topic : '',
            options: lessons.map(e => e.topic)
        };
    }

    const api = { parseGrade, lessonsFor, suggestTitle };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfTermPlan = api;

    // ── الربط بالنماذج ──
    const el = id => document.getElementById(id);
    const plan = () => root.SVF_TERM_PLAN || null;

    function setList(input, listId, options) {
        let dl = el(listId);
        if (!dl) { dl = document.createElement('datalist'); dl.id = listId; document.body.appendChild(dl); }
        dl.innerHTML = '';
        options.forEach(v => { const o = document.createElement('option'); o.value = v; dl.appendChild(o); });
        if (options.length) input.setAttribute('list', listId); else input.removeAttribute('list');
    }

    // يُكتب ما دامت الخانة فارغةً أو تحمل آخر ما كتبته الخطة؛ ما كتبه المشرف يبقى
    function apply(target, listId, gradeText, isoDate, gender) {
        if (!target || !plan()) return;
        const s = suggestTitle(plan(), gradeText, isoDate, gender);
        setList(target, listId, s.options);
        const cur = target.value.trim();
        const auto = target.dataset.planAuto || '';
        const mine = cur && cur !== auto;
        target.title = s.options.length > 1 ? 'في الخطة لهذا الأسبوع: ' + s.options.join(' · ') : '';
        if (mine) return;
        if (s.title) {
            target.value = s.title;
            target.dataset.planAuto = s.title;
        } else if (cur && cur === auto) {
            target.value = '';                 // تغيّر الصفّ أو التاريخ فلم يعد ما كتبته الخطة صالحاً
            target.dataset.planAuto = '';
        }
        if (!s.title && s.options.length > 1)
            target.placeholder = 'اختر من الخطة (' + s.options.length + ' موضوعات) أو اكتب';
    }

    function cvGender() {
        try {
            const meta = typeof root.svfCvMeta === 'function' ? root.svfCvMeta(el('cvTeacher') && el('cvTeacher').value) : {};
            return meta.gender || '';
        } catch (e) { return ''; }
    }
    function supGender() {
        const r = document.querySelector('input[name="supervisoryTeacherGender"]:checked');
        return r ? (r.value === '1' ? 'f' : 'm') : '';
    }

    function applyCv() {
        apply(el('cvSubject'), 'svfPlanCv', el('cvGrade') && el('cvGrade').value,
              el('schoolVisitDate') && el('schoolVisitDate').value, cvGender());
    }
    function applySup() {
        apply(el('topic'), 'svfPlanSup', el('class') && el('class').value,
              el('visitDate') && el('visitDate').value, supGender());
    }

    // ما يكتبه المشرف بيده يفكّ ارتباط الخانة بالخطة
    function markManual(e) {
        const t = e.target;
        if (t.value.trim() !== (t.dataset.planAuto || '')) t.dataset.planAuto = '';
    }

    root.svfTermPlanInit = function () {
        ['cvGrade', 'cvTeacher', 'schoolVisitDate'].forEach(id => {
            const x = el(id); if (!x) return;
            x.addEventListener('change', applyCv); x.addEventListener('input', applyCv);
        });
        ['class', 'visitDate'].forEach(id => {
            const x = el(id); if (!x) return;
            x.addEventListener('change', applySup); x.addEventListener('input', applySup);
        });
        document.querySelectorAll('input[name="supervisoryTeacherGender"]').forEach(r => r.addEventListener('change', applySup));
        ['cvSubject', 'topic'].forEach(id => { const x = el(id); if (x) x.addEventListener('input', markManual); });
    };
    root.svfTermPlanApplyCv = applyCv;
    root.svfTermPlanApplySup = applySup;
})(typeof window !== 'undefined' ? window : this);
