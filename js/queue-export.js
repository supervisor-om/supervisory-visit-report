// ============================================================================
//  queue-export.js — رفع زياراتٍ مختارةٍ من الأرشيف إلى بوّابة الوزارة
//
//  تختار الزيارات بمربّعات الاختيار في الأرشيف، فتُبنى طابوراً واحداً
//  يعالجه سكربت تامبر مانكي زيارةً بعد أخرى.
//
//  الطابور يعمل بالحفظ التلقائيّ فقط — انظر «وضع الطابور» في CLAUDE.md.
// ============================================================================

(function () {
    'use strict';

    const SENT_KEY   = 'svf_sent_visits';     // حُفظت في البوّابة بتأكيد — "المعلّم|التاريخ"
    const QUEUED_KEY = 'svf_queued_visits';   // رُفعت من هنا — مفاتيح تقارير الأرشيف
    const PORTAL_URL = 'https://moe.gov.om/SMS/SupervisionVisits/SupervisionVisitsModule.aspx?VisitMode=1';

    /* ─── التحديد ─── */
    // يبقى بين عمليّات الرسم: الكتابة في حقل البحث تُعيد رسم البطاقات
    const selected = new Set();
    window.svfSelected = selected;

    function readSet(key) {
        try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
        catch (e) { return new Set(); }
    }
    function addToSet(key, values) {
        const s = readSet(key);
        values.forEach(v => s.add(v));
        try { localStorage.setItem(key, JSON.stringify([...s])); } catch (e) {}
    }

    // «سبق رفعها» لا تعني «حُفظت»: تأكيد الحفظ يقع في نطاق البوّابة
    window.svfIsQueued = key => readSet(QUEUED_KEY).has(key);
    window.svfIsSent   = (teacher, date) => readSet(SENT_KEY).has(teacher + '|' + date);
    window.svfMarkSent = list => addToSet(SENT_KEY, list.map(v => v.teacher + '|' + v.date));

    /* ─── تحويل تقريرٍ محفوظٍ إلى صيغة البوّابة ─── */
    // نفس بنية exportData في exportToMoe، لكن مصدرها الأرشيف لا الشاشة.
    // savePermanentReport يحفظ الحقول داخل formData بمعرّفات عناصر النموذج
    // (topic، lesson، strengthsContent، score-N، notes-N …) لا في جذر التقرير.
    function toPortal(d) {
        const fd = (d.formData && typeof d.formData === 'object') ? d.formData : {};
        const f = (...keys) => {
            for (const k of keys) {
                const v = fd[k] != null ? fd[k] : d[k];
                if (v != null && String(v).trim() !== '') return String(v).trim();
            }
            return '';
        };

        let date = f('visitDate', 'date');
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const [y, mo, dd] = date.split('-');
            date = dd + '/' + mo + '/' + y;
        }

        // لا تقييم افتراضيّ: البند بلا درجةٍ صالحةٍ يُسجَّل null فيُستبعد التقرير
        const items = typeof evaluationItems !== 'undefined' ? evaluationItems : [];
        const ratings = items.map(item => {
            const n = parseInt(fd['score-' + item.id], 10);
            return n >= 1 && n <= 5 ? n : null;
        });

        const notes = {};
        items.forEach(item => {
            const v = String(fd['notes-' + item.id] || '').trim();
            if (v) notes[item.id] = v;
        });

        return {
            kind:            'supervision',
            date:            date,
            teacher:         f('teacherName', 'teacher'),
            school:          f('school', 'schoolName'),
            subject:         f('subject'),
            period:          f('lesson', 'period'),
            lessonTitle:     f('topic', 'lessonTitle'),
            className:       f('class', 'className'),
            fileNumber:      f('fileNumber'),
            visitNumber:     f('visitNumber'),
            ratings:         ratings,
            notes:           notes,
            excellence:      f('strengthsContent', 'excellence'),
            development:     f('developmentContent', 'development'),
            recommendations: f('recommendationsContent', 'recommendations')
        };
    }

    /* ─── التحقّق: البوّابة ترفض هذه الحقول فارغةً ─── */
    function validate(v) {
        const gaps = [];
        if (!v.teacher)     gaps.push('اسم المعلم');
        if (!v.date)        gaps.push('التاريخ');
        if (!v.lessonTitle) gaps.push('عنوان الدرس (حقل «الموضوع»)');
        if (v.ratings.length !== 13) gaps.push('بنود التقييم الثلاثة عشر');
        const unrated = v.ratings.map((r, i) => r == null ? i + 1 : 0).filter(Boolean);
        if (unrated.length) gaps.push('تقييم البند ' + unrated.join('، '));
        return gaps;
    }

    /* ─── بناء الطابور من مفاتيح الأرشيف ─── */
    function buildFromKeys(keys) {
        const ready = [], broken = [];
        keys.forEach(key => {
            let d = null;
            try { d = JSON.parse(localStorage.getItem(key)); } catch (e) {}
            if (!d || typeof d !== 'object') { broken.push({ key, label: key, gaps: ['التقرير غير مقروء'] }); return; }

            const v = toPortal(d);
            const gaps = validate(v);
            const label = (v.teacher || 'بلا اسم') + ' (' + (v.date || 'بلا تاريخ') + ')';
            if (gaps.length) broken.push({ key, label, gaps });
            else ready.push({ key, visit: v });
        });

        // الأقدم أوّلاً — ترتيبٌ منطقيٌّ للإدخال في البوّابة
        ready.sort((a, b) => {
            const p = s => String(s || '').split('/').reverse().join('');
            return p(a.visit.date).localeCompare(p(b.visit.date));
        });
        return { ready, broken };
    }
    window.svfBuildFromKeys = buildFromKeys;

    /* ─── الرفع ─── */
    function sendSelected() {
        const keys = [...selected];
        if (!keys.length) {
            if (typeof showToast === 'function') showToast('حدّد زيارةً واحدةً على الأقل', 'error');
            return;
        }

        const { ready, broken } = buildFromKeys(keys);

        let msg = 'المحدَّد: ' + keys.length + ' زيارة\nجاهزة للرفع: ' + ready.length;
        if (broken.length) {
            msg += '\n\nمستبعدة لنقصٍ في البيانات (' + broken.length + '):\n• '
                 + broken.map(b => b.label + ': ينقصه ' + b.gaps.join('، ')).join('\n• ')
                 + '\n\nأكملها في الأرشيف ثمّ أعد رفعها.';
        }
        if (!ready.length) { alert(msg); return; }

        msg += '\n\nتنبيه: الطابور يعمل بالحفظ التلقائي فقط — تأكّد أنّ زرّ «الحفظ التلقائي»'
             + ' مُشغَّلٌ في لوحة البوّابة.';
        if (!confirm(msg + '\n\nأفتح البوّابة وأبدأ الرفع الآن؟')) return;

        const payload = { kind: 'supervision', visits: ready.map(r => r.visit) };
        const json = JSON.stringify(payload);

        // القنوات الثلاث نفسها المستخدمة في التصدير المفرد
        try { localStorage.setItem('sv_moe_supervision_export', json); } catch (e) {}
        try { navigator.clipboard.writeText(json); } catch (e) {}

        addToSet(QUEUED_KEY, ready.map(r => r.key));
        ready.forEach(r => selected.delete(r.key));

        // الفتح داخل ضغطة المستخدم نفسها — التأجيل يُفقده التصريح فيحجبه المتصفّح
        const b64 = btoa(unescape(encodeURIComponent(json)));
        window.open(PORTAL_URL + '#svfs=' + b64, '_blank');

        if (typeof renderSavedReports === 'function') renderSavedReports();
        updateSelectionUI();
        if (typeof showToast === 'function')
            showToast('فُتحت البوّابة بـ ' + ready.length + ' زيارة — تابع اللوحة هناك', 'success');
    }
    window.svfSendSelected = sendSelected;

    /* ─── شريط التحديد ─── */
    function updateSelectionUI() {
        const count = selected.size;
        const label = document.getElementById('selectionCount');
        if (label) {
            label.textContent = count ? 'المحدَّد: ' + count + ' زيارة' : 'لم تحدّد شيئاً';
            label.className = count ? 'text-sm font-bold text-indigo-700' : 'text-sm text-slate-500';
        }
        const btn = document.getElementById('sendSelectedToMoeBtn');
        if (btn) {
            btn.disabled = !count;
            btn.classList.toggle('opacity-50', !count);
            btn.classList.toggle('cursor-not-allowed', !count);
        }
    }
    window.svfUpdateSelectionUI = updateSelectionUI;

    window.svfToggleKey = function (key, on) {
        if (on) selected.add(key); else selected.delete(key);
        updateSelectionUI();
    };

    // «تحديد الكل» يعني المعروض بعد التصفية لا كلّ ما في الأرشيف
    window.svfSelectAllVisible = function () {
        document.querySelectorAll('#saved-reports-list .queue-pick').forEach(cb => {
            cb.checked = true;
            selected.add(cb.dataset.key);
        });
        updateSelectionUI();
    };

    // الإلغاء يشمل ما خفي بالتصفية أيضاً، وإلّا بقي محدَّداً دون أن تراه
    window.svfClearSelection = function () {
        selected.clear();
        document.querySelectorAll('#saved-reports-list .queue-pick').forEach(cb => { cb.checked = false; });
        updateSelectionUI();
    };

})();
