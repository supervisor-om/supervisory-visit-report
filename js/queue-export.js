// ============================================================================
//  queue-export.js — تصدير طابور الزيارات إلى بوّابة الوزارة
//  يُضاف إلى supervisor-mct.com بجوار بقيّة ملفات js/
//
//  الغرض: بدل تصدير زيارةٍ واحدةٍ في كلّ مرّة، يجمع هذا الملف التقارير
//  المحفوظة غير المرسلة ويبنيها في طابورٍ واحدٍ يعالجه سكربت تامبر مانكي
//  زيارةً بعد أخرى، مع تتبّع ما أُرسل فعلاً حتّى لا يتكرّر.
// ============================================================================

(function () {
    'use strict';

    const SENT_KEY = 'svf_sent_visits';      // سجلّ ما أُرسل: "المعلّم|التاريخ"
    const PORTAL_URL = 'https://moe.gov.om/SMS/SupervisionVisits/SupervisionVisitsModule.aspx?VisitMode=1';

    /* ─── سجلّ المُرسَل ─── */
    function sentSet() {
        try { return new Set(JSON.parse(localStorage.getItem(SENT_KEY) || '[]')); }
        catch (e) { return new Set(); }
    }
    function markSent(list) {
        const s = sentSet();
        list.forEach(v => s.add(v.teacher + '|' + v.date));
        localStorage.setItem(SENT_KEY, JSON.stringify([...s]));
    }
    window.svfMarkSent = markSent;           // ليناديها السكربت بعد الحفظ

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

    /* ─── جمع الزيارات غير المرسلة ─── */
    function collectPending() {
        const sent = sentSet();
        const out = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || (!key.startsWith('supervision_v6_visit_') && !key.startsWith('visit_v5_'))) continue;
            let d = null;
            try { d = JSON.parse(localStorage.getItem(key)); } catch (e) { continue; }
            if (!d || typeof d !== 'object') continue;

            const v = toPortal(d);
            if (!v.teacher || !v.date) continue;
            if (sent.has(v.teacher + '|' + v.date)) continue;
            out.push(v);
        }

        // الأقدم أوّلاً — ترتيبٌ منطقيٌّ للإدخال
        out.sort((a, b) => {
            const p = s => s.split('/').reverse().join('');
            return p(a.date).localeCompare(p(b.date));
        });
        return out;
    }

    /* ─── التحقّق: البوّابة ترفض هذه الحقول فارغةً ─── */
    function validate(v) {
        const gaps = [];
        if (!v.teacher)     gaps.push('اسم المعلم');
        if (!v.date)        gaps.push('التاريخ');
        if (!v.lessonTitle) gaps.push('عنوان الدرس');
        if (v.ratings.length !== 13) gaps.push('بنود التقييم الثلاثة عشر');
        const unrated = v.ratings.map((r, i) => r == null ? i + 1 : 0).filter(Boolean);
        if (unrated.length) gaps.push('تقييم البند ' + unrated.join('، '));
        return gaps;
    }

    /* ─── التصدير ─── */
    function exportQueueToMoe() {
        const all = collectPending();
        if (!all.length) {
            alert('لا توجد زيارات غير مرسلة.\n\nالزيارات المرسلة سابقاً مستثناة تلقائياً.');
            return;
        }

        const ready = [], broken = [];
        all.forEach(v => {
            const gaps = validate(v);
            if (gaps.length) broken.push(v.teacher + ' (' + v.date + '): ينقصه ' + gaps.join('، '));
            else ready.push(v);
        });

        let msg = 'زيارات جاهزة للإرسال: ' + ready.length;
        if (broken.length) msg += '\n\nمستبعدة لنقص البيانات (' + broken.length + '):\n• ' + broken.join('\n• ');
        if (!ready.length) { alert(msg); return; }
        if (!confirm(msg + '\n\nهل تريد إرسالها إلى البوّابة الآن؟')) return;

        const payload = { kind: 'supervision', visits: ready };
        const json = JSON.stringify(payload);

        // القنوات الثلاث نفسها المستخدمة في التصدير المفرد
        try { localStorage.setItem('sv_moe_supervision_export', json); } catch (e) {}
        try { navigator.clipboard.writeText(json); } catch (e) {}
        try { window.postMessage({ source: 'MCT', type: 'EXPORT_REPORT', payload: payload }, '*'); } catch (e) {}

        // الفتح داخل ضغطة المستخدم نفسها — التأجيل يُفقده التصريح
        const b64 = btoa(unescape(encodeURIComponent(json)));
        window.open(PORTAL_URL + '#svfs=' + b64, '_blank');
    }

    window.exportQueueToMoe = exportQueueToMoe;
    window.svfCollectPending = collectPending;

    /* ─── ربط الزرّ ─── */
    document.addEventListener('DOMContentLoaded', function () {
        const btn = document.getElementById('exportQueueToMoeBtn');
        if (btn) btn.addEventListener('click', exportQueueToMoe);

        // عدّاد الزيارات المعلّقة على الزرّ إن وُجد
        const badge = document.getElementById('pendingCount');
        if (badge) badge.textContent = collectPending().length;
    });

})();
