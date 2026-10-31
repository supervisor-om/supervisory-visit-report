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
    // حُفظت في البوّابة — مفاتيح تقارير الأرشيف (منذ 2026-10-26). «المعلّم|التاريخ» لا يميّز زيارتين
    // للمعلّم في اليوم نفسه؛ السكربت (v17.4) يكتب مفتاح التقرير الذي حفظه، والتأكيد اليدويّ كذلك
    const SENT_REPORTS_KEY = 'svf_sent_reports';
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
    // ما يطابق pred يُحذف من القائمة، ويُعاد ما حُذف بنصّه كما كان (للعلامة التي يقرؤها السكربت)
    function removeWhere(key, pred) {
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { arr = []; }
        if (!Array.isArray(arr)) return [];
        const gone = arr.filter(v => pred(v)), keep = arr.filter(v => !pred(v));
        if (gone.length) try { localStorage.setItem(key, JSON.stringify(keep)); } catch (e) {}
        return gone;
    }

    /* ─── إزالة وسم «حُفظت في البوابة» (2026-10-31) ─── */
    // طلب المشرف: زيارةٌ موسومةٌ «حُفظت» يُزال وسمها (حُذفت من البوّابة، أو وُسمت خطأً) فتعود عاديّةً وتُرفع من جديد.
    // الوسم يأتي من سجلّ سكربت الرفع (تخزين تامبر مانكي) ويُدمج في الموقع عند كلّ عودةٍ إليه، فحذفه من هنا وحده لا يكفي:
    // علامة الإزالة (svf_sent_unmarked: [{k, l, at}] — l: v المعلّم|التاريخ، r مفتاح التقرير، s المدرسة|التاريخ) يقرؤها
    // السكربت (v17.5) فيحذف المعرّف من سجلّه ثمّ يمحو العلامة؛ وحتّى ذلك (أو مع نسخةٍ أقدم) تُستثنى المعرّفات من الوسم هنا.
    // وحفظٌ تالٍ للزيارة نفسها بعد الإزالة يُعيد وسمها (السكربت يقارن وقت الحفظ بوقت العلامة).
    const UNMARK_KEY = 'svf_sent_unmarked';
    function unmarkedSet() {
        try { const a = JSON.parse(localStorage.getItem(UNMARK_KEY) || '[]'); return new Set((Array.isArray(a) ? a : []).map(m => m && m.l + '\u0001' + m.k)); }
        catch (e) { return new Set(); }
    }
    function addUnmarks(l, raws) {
        if (!raws.length) return;
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(UNMARK_KEY) || '[]'); } catch (e) { arr = []; }
        if (!Array.isArray(arr)) arr = [];
        const at = Date.now();
        raws.forEach(k => { arr = arr.filter(m => !(m && m.l === l && m.k === k)); arr.push({ k, l, at }); });
        try { localStorage.setItem(UNMARK_KEY, JSON.stringify(arr.slice(-500))); } catch (e) {}
    }
    // تأكيدٌ يدويٌّ بعد الإزالة: العلامة تُلغى (الوسم يعود)
    function dropUnmarks(l, raws) {
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(UNMARK_KEY) || '[]'); } catch (e) { return; }
        if (!Array.isArray(arr)) return;
        const set = new Set(raws), keep = arr.filter(m => !(m && m.l === l && set.has(m.k)));
        if (keep.length !== arr.length) try { localStorage.setItem(UNMARK_KEY, JSON.stringify(keep)); } catch (e) {}
    }
    const isUnmarked = (U, l, k) => U.has(l + '\u0001' + k);
    // سكربت الرفع (v17.5) يستمع فيطبّق الإزالة على سجلّه فوراً — لا ينتظر عودةً إلى التبويب
    const sentChanged = () => { try { window.dispatchEvent(new Event('svf-sent-changed')); } catch (e) {} };

    // «سبق رفعها» لا تعني «حُفظت»: تأكيد الحفظ يقع في نطاق البوّابة
    window.svfIsQueued = key => readSet(QUEUED_KEY).has(key);
    // المطابقة بعد التسوية لا حرفيّاً (2026-10-08: حفظها السكربت ولم يظهر الوسم): السكربت يكتب
    // الاسم مقصوصاً والأرشيف يقرأ ما حُفظ كما هو، والتاريخ قد يُكتب «8/10» أو «08/10» أو «2026-10-08».
    function sentKey(teacher, date) {
        const name = window.SupervisorIdentity && SupervisorIdentity.normName
            ? SupervisorIdentity.normName(teacher)
            : String(teacher || '').replace(/\s+/g, ' ').trim();
        const d = String(date || '').trim();
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(d);
        const parts = m ? [m[3], m[2], m[1]] : ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d)) ? [m[1], m[2], m[3]] : null);
        const day = parts ? (+parts[0]) + '/' + (+parts[1]) + '/' + parts[2] : d;
        return name + '|' + day;
    }
    window.svfSentKey = sentKey;
    window.svfIsSent   = (teacher, date) => {
        const want = sentKey(teacher, date), U = unmarkedSet();
        for (const k of readSet(SENT_KEY)) {
            const i = k.lastIndexOf('|');
            if (i > 0 && !isUnmarked(U, 'v', k) && sentKey(k.slice(0, i), k.slice(i + 1)) === want) return true;
        }
        return false;
    };
    window.svfIsSentReport = key => !!key && readSet(SENT_REPORTS_KEY).has(key) && !isUnmarked(unmarkedSet(), 'r', key);
    window.svfMarkSent = list => {
        const ids = list.map(v => v.teacher + '|' + v.date);
        addToSet(SENT_KEY, ids);
        dropUnmarks('v', ids);
        const keys = list.map(v => v && v.key).filter(Boolean);
        if (keys.length) { addToSet(SENT_REPORTS_KEY, keys); dropUnmarks('r', keys); }
        sentChanged();
    };
    // إزالة الوسم عن زيارةٍ إشرافيّة: مفتاح تقريرها، و«المعلّم|التاريخ» بكلّ صيغه، و«سبق رفعها»
    window.svfUnmarkSent = (teacher, date, key) => {
        const want = sentKey(teacher, date);
        const byTD = removeWhere(SENT_KEY, k => { const i = k.lastIndexOf('|'); return i > 0 && sentKey(k.slice(0, i), k.slice(i + 1)) === want; });
        addUnmarks('v', byTD);
        if (key) {
            addUnmarks('r', removeWhere(SENT_REPORTS_KEY, k => k === key).concat([key]).filter((k, i, a) => a.indexOf(k) === i));
            removeWhere(QUEUED_KEY, k => k === key);
        }
        sentChanged();
        return byTD.length;
    };
    // أهي موسومةٌ «حُفظت» كما يعرضها الأرشيف؟ مفتاحها، أو «المعلّم|التاريخ» لزيارةٍ وحيدةٍ في يومها (export.js بالقاعدة نفسها)
    const ARCHIVE_RE = /^(supervision_v6_visit_|visit_v5_)/;
    function tdCounts() {
        const m = new Map();
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!ARCHIVE_RE.test(k || '')) continue;
                let d = null; try { d = JSON.parse(localStorage.getItem(k)); } catch (e) {}
                if (!d || typeof d !== 'object' || d.deleted) continue;
                const vd = String(d.visitDate || '');
                const id = sentKey(d.teacherName, vd.includes('-') ? vd.split('-').reverse().join('/') : vd);
                m.set(id, (m.get(id) || 0) + 1);
            }
        } catch (e) {}
        return m;
    }
    function isSentVisit(key, v, counts) {
        if (window.svfIsSentReport(key)) return true;
        return window.svfIsSent(v.teacher, v.date) && (counts.get(sentKey(v.teacher, v.date)) || 1) === 1;
    }
    window.svfIsSentVisit = (key, v) => isSentVisit(key, v, tdCounts());

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
            recommendations: f('recommendationsContent', 'recommendations'),
            notesGeneral:    f('generalNotesContent', 'notesGeneral')
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
        const counts = tdCounts();
        keys.forEach(key => {
            let d = null;
            try { d = JSON.parse(localStorage.getItem(key)); } catch (e) {}
            if (!d || typeof d !== 'object') { broken.push({ key, label: key, gaps: ['التقرير غير مقروء'] }); return; }

            const v = toPortal(d);
            const gaps = validate(v);
            const label = (v.teacher || 'بلا اسم') + ' (' + (v.date || 'بلا تاريخ') + ')';
            if (gaps.length) broken.push({ key, label, gaps });
            // مفتاح التقرير يصحب الزيارة فيُسجّل السكربت أيّها حُفظت (البوّابة لا تقرؤه)، و«sent» وسمها في الأرشيف:
            // الموسومة يتخطّاها السكربت (v17.5) «مُدخلةً سابقاً» ويذكرها في تقريره — لا تُكتب في البوّابة مرّةً ثانية
            else ready.push({ key, visit: Object.assign(v, { key, sent: isSentVisit(key, v, counts) }) });
        });

        // الأقدم أوّلاً — ترتيبٌ منطقيٌّ للإدخال في البوّابة
        ready.sort((a, b) => {
            const p = s => String(s || '').split('/').reverse().join('');
            return p(a.visit.date).localeCompare(p(b.visit.date));
        });
        return { ready, broken };
    }
    window.svfBuildFromKeys = buildFromKeys;
    // التصدير المفرد يتحقّق بالقاعدة نفسها: ما يرفضه الطابور ترفضه البوّابة
    window.svfValidateVisit = validate;

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
                 + '\n\nأكملها في «زياراتي الإشرافية» ثمّ أعد رفعها.';
        }
        if (!ready.length) { alert(msg); return; }
        msg += sentNote(ready);

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
    // الموسومة «حُفظت» تُتخطّى ولا تُكرَّر — يُقال ذلك قبل الفتح
    function sentNote(ready) {
        const s = ready.filter(r => r.visit.sent);
        if (!s.length) return '';
        return '\n\nموسومةٌ «حُفظت في البوابة» (' + s.length + '): ستُتخطّى ولا تُكرَّر، وتُذكر في تقرير الرفع.'
             + ' لإعادة رفع إحداها أزل وسمها من بطاقتها أوّلاً.';
    }

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

    // ════════════════════════════════════════════════════════════════
    //  الزيارات المدرسيّة: التحديد نفسه ورفعه طابوراً إلى بوّابة أخرى
    //  (‎#svf=‎ لا ‎#svfs=‎، وصفحة SchoolVisits لا SupervisionVisits)
    // ════════════════════════════════════════════════════════════════
    const SCHOOL_QUEUED_KEY = 'svf_queued_school';
    const SCHOOL_SENT_KEY   = 'svf_sent_school_visits';
    const SCHOOL_PORTAL_URL = 'https://moe.gov.om/SMS/VariousRecords/SchoolVisits/SchoolVisitsMain.aspx';

    const schoolSelected = new Set();
    window.svfSchoolSelected = schoolSelected;
    window.svfSchoolIsQueued = key => readSet(SCHOOL_QUEUED_KEY).has(key);
    // والمدرسة كالمعلّم: تسويةٌ عربيّة للاسم وللتاريخ قبل المقارنة
    const schoolKey = (school, date) => {
        const n = window.SupervisorIdentity && SupervisorIdentity.normalize
            ? SupervisorIdentity.normalize(school) : String(school || '').replace(/\s+/g, ' ').trim();
        return n + '|' + sentKey('', date).slice(1);
    };
    window.svfSchoolIsSent   = (school, date) => {
        const want = schoolKey(school, date), U = unmarkedSet();
        for (const k of readSet(SCHOOL_SENT_KEY)) {
            const i = k.lastIndexOf('|');
            if (i > 0 && !isUnmarked(U, 's', k) && schoolKey(k.slice(0, i), k.slice(i + 1)) === want) return true;
        }
        return false;
    };
    window.svfSchoolMarkSent = list => {
        const ids = list.map(v => v.school + '|' + v.date);
        addToSet(SCHOOL_SENT_KEY, ids);
        dropUnmarks('s', ids);
        sentChanged();
    };
    window.svfSchoolUnmarkSent = (school, date, key) => {
        const want = schoolKey(school, date);
        const gone = removeWhere(SCHOOL_SENT_KEY, k => { const i = k.lastIndexOf('|'); return i > 0 && schoolKey(k.slice(0, i), k.slice(i + 1)) === want; });
        addUnmarks('s', gone);
        if (key) removeWhere(SCHOOL_QUEUED_KEY, k => k === key);
        sentChanged();
        return gone.length;
    };

    // نوع الزيارة في البوّابة: ١ إشرافية، ٢ استطلاعية، ٣ أخرى
    function schoolVisitTypeNum(typeKey) {
        const name = (typeof schoolVisitTypesData !== 'undefined' && schoolVisitTypesData[typeKey]
                        && schoolVisitTypesData[typeKey].name) || typeKey || '';
        const hay = name + ' ' + typeKey;
        if (/استطلاع|إستطلاع/.test(hay)) return '2';
        if (/اشراف|إشراف|supervisory/.test(hay)) return '1';
        if (/اخرى|أخرى/.test(hay)) return '3';
        return '1';
    }

    // ولاية المدرسة من قاعدة المعلّمين — قائمة مدارس البوّابة مقصورةٌ على الولاية المختارة (v17.6)
    function svfSchoolWilaya(school) {
        try {
            return (window.SupervisorIdentity && typeof SupervisorIdentity.wilayaOfSchool === 'function'
                && SupervisorIdentity.wilayaOfSchool(school)) || '';
        } catch (e) { return ''; }
    }
    window.svfSchoolWilaya = svfSchoolWilaya;

    function schoolToPortal(d) {
        let date = d.visitDate || d.date || '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const [y, mo, dd] = date.split('-');
            date = dd + '/' + mo + '/' + y;
        }
        const typeKey = d.visitType || '';
        const typeName = (typeof schoolVisitTypesData !== 'undefined' && schoolVisitTypesData[typeKey]
                            && schoolVisitTypesData[typeKey].name) || typeKey;
        return {
            visitType:       schoolVisitTypeNum(typeKey),
            visitTypeName:   typeName,
            school:          d.schoolName || d.school || '',
            wilaya:          svfSchoolWilaya(d.schoolName || d.school || ''),
            date:            date,
            // النموذج لم يكن يحفظ الوقتين في التقارير القديمة — تُستعمل ساعات الدوام
            arrivalTime:     d.arrivalTime || '08:00',
            departureTime:   d.departureTime || '12:00',
            // الأهداف تُرقَّم تسلسليّاً ١، ٢، … كترقيم رأي الزائر (كلاهما بترتيب الأهداف
            // المحدَّدة نفسه) ثمّ خطّ سير اليوم بلا ترقيم — السكربت يدمج المصفوفة بسطرٍ لكلّ عنصر
            objectives:      (Array.isArray(d.objectives) ? d.objectives : [])
                                .map(o => String(o).replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim())
                                .map((o, i) => (i + 1) + '- ' + o)
                                .concat(typeof SchoolRoute !== 'undefined' ? SchoolRoute.routeLines(d.cameFrom, d.goingTo) : []),
            // خمسة حقولٍ فقط كما تقرؤها البوّابة — لا رقم ملفٍّ ولا جنس (انظر export.js)
            classroomVisits: (Array.isArray(d.classroomVisits) ? d.classroomVisits : []).map(cv =>
                ({ teacher: cv.teacher, grade: cv.grade, period: cv.period, subject: cv.subject, rating: cv.rating })),
            visitorOpinion:  d.visitorOpinion || '',
            recommendations: d.recommendations || ''
        };
    }

    function schoolValidate(v) {
        const gaps = [];
        if (!v.school) gaps.push('اسم المدرسة');
        if (!v.date)   gaps.push('التاريخ');
        // سطر خطّ السير يبدأ بـ«#» ولا يُحتسب هدفاً: زيارةٌ بلا أهدافٍ وبخطّ سيرٍ وحده ناقصة
        if (!v.objectives.filter(o => String(o).charAt(0) !== '#').length) gaps.push('أهداف الزيارة');
        if (!v.visitorOpinion && !v.recommendations) gaps.push('رأي الزائر أو التوصيات');
        return gaps;
    }

    function buildSchoolFromKeys(keys) {
        const ready = [], broken = [];
        keys.forEach(key => {
            let d = null;
            try { d = JSON.parse(localStorage.getItem(key)); } catch (e) {}
            if (!d || typeof d !== 'object') { broken.push({ key, label: key, gaps: ['التقرير غير مقروء'] }); return; }
            const v = schoolToPortal(d);
            const gaps = schoolValidate(v);
            const label = (v.school || 'بلا مدرسة') + ' (' + (v.date || 'بلا تاريخ') + ')';
            if (gaps.length) broken.push({ key, label, gaps });
            else ready.push({ key, visit: Object.assign(v, { key, sent: window.svfSchoolIsSent(v.school, v.date) }) });
        });
        ready.sort((a, b) => {
            const p = s => String(s || '').split('/').reverse().join('');
            return p(a.visit.date).localeCompare(p(b.visit.date));
        });
        return { ready, broken };
    }
    window.svfBuildSchoolFromKeys = buildSchoolFromKeys;

    function sendSelectedSchool() {
        const keys = [...schoolSelected];
        if (!keys.length) {
            if (typeof showToast === 'function') showToast('حدّد زيارةً واحدةً على الأقل', 'error');
            return;
        }
        const { ready, broken } = buildSchoolFromKeys(keys);

        let msg = 'المحدَّد: ' + keys.length + ' زيارة\nجاهزة للرفع: ' + ready.length;
        if (broken.length) {
            msg += '\n\nمستبعدة لنقصٍ في البيانات (' + broken.length + '):\n• '
                 + broken.map(b => b.label + ': ينقصه ' + b.gaps.join('، ')).join('\n• ')
                 + '\n\nأكملها في السجل ثمّ أعد رفعها.';
        }
        if (!ready.length) { alert(msg); return; }
        msg += sentNote(ready);

        msg += '\n\nتنبيه: الطابور يعمل بالحفظ التلقائي فقط — تأكّد أنّ زرّ «الحفظ التلقائي»'
             + ' مُشغَّلٌ في لوحة البوّابة.';
        if (!confirm(msg + '\n\nأفتح البوّابة وأبدأ الرفع الآن؟')) return;

        const payload = { kind: 'school', visits: ready.map(r => r.visit) };
        const json = JSON.stringify(payload);
        try { localStorage.setItem('sv_moe_school_export', json); } catch (e) {}
        try { navigator.clipboard.writeText(json); } catch (e) {}

        addToSet(SCHOOL_QUEUED_KEY, ready.map(r => r.key));
        ready.forEach(r => schoolSelected.delete(r.key));

        const b64 = btoa(unescape(encodeURIComponent(json)));
        window.open(SCHOOL_PORTAL_URL + '#svf=' + b64, '_blank');

        if (typeof renderSchoolReportsList === 'function') renderSchoolReportsList();
        updateSchoolSelectionUI();
        if (typeof showToast === 'function')
            showToast('فُتحت البوّابة بـ ' + ready.length + ' زيارة — تابع اللوحة هناك', 'success');
    }
    window.svfSendSelectedSchool = sendSelectedSchool;

    function updateSchoolSelectionUI() {
        const count = schoolSelected.size;
        const label = document.getElementById('schoolSelectionCount');
        if (label) {
            label.textContent = count ? 'المحدَّد: ' + count + ' زيارة' : 'لم تحدّد شيئاً';
            label.className = count ? 'text-sm font-bold text-green-800' : 'text-sm text-slate-500';
        }
        const btn = document.getElementById('sendSelectedSchoolToMoeBtn');
        if (btn) {
            btn.disabled = !count;
            btn.classList.toggle('opacity-50', !count);
            btn.classList.toggle('cursor-not-allowed', !count);
        }
    }
    window.svfSchoolUpdateSelectionUI = updateSchoolSelectionUI;

    window.svfSchoolToggleKey = function (key, on) {
        if (on) schoolSelected.add(key); else schoolSelected.delete(key);
        updateSchoolSelectionUI();
    };
    window.svfSchoolSelectAllVisible = function () {
        document.querySelectorAll('#reportsListContainer .queue-pick-school').forEach(cb => {
            cb.checked = true;
            schoolSelected.add(cb.dataset.key);
        });
        updateSchoolSelectionUI();
    };
    window.svfSchoolClearSelection = function () {
        schoolSelected.clear();
        document.querySelectorAll('#reportsListContainer .queue-pick-school').forEach(cb => { cb.checked = false; });
        updateSchoolSelectionUI();
    };

    /* ─── نتيجة آخر رفع (2026-10-31) ─── */
    // سكربت الرفع (v17.5) لا يتوقّف عند زيارةٍ لم تُحفظ: يكمل الطابور ويكتب لكلّ زيارةٍ حالتها وسببها، ثمّ يضخّ التقرير هنا
    // (svf_upload_report = {sup, school}، كلٌّ {at, total, rows: [{i, name, date, key, status, reason}], count}).
    // يظهر أعلى الأرشيف حتّى يُخفيه المشرف (svf_upload_report_seen — وقت آخر تقريرٍ أُخفي لكلّ نوع).
    const UPLOAD_KEY = 'svf_upload_report', UPLOAD_SEEN = 'svf_upload_report_seen';
    const UP_ST = {
        saved:  ['حُفظت', 'bg-green-50 text-green-800 border-green-200'],
        dup:    ['مُدخلةٌ سابقاً — لم تُكرَّر', 'bg-blue-50 text-blue-800 border-blue-200'],
        failed: ['لم تُحفظ', 'bg-red-50 text-red-800 border-red-200'],
        unsure: ['لم يتأكّد حفظها', 'bg-amber-50 text-amber-800 border-amber-200']
    };
    const upEsc = v => (typeof svfEscapeHtml === 'function' ? svfEscapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'));
    function readJson(key, def) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? def : v; } catch (e) { return def; } }
    function uploadReport(kind) {
        const all = readJson(UPLOAD_KEY, {});
        const r = all && typeof all === 'object' ? all[kind] : null;
        return r && Array.isArray(r.rows) ? r : null;
    }
    window.svfUploadReport = uploadReport;
    // مفتاح الزيارة في الأرشيف: مفتاحها في الصفّ إن بقي، وإلّا بالاسم والتاريخ (تقارير رُفعت قبل أن تحمل مفاتيحها)
    function findVisitKey(kind, row) {
        if (row.key) { try { if (localStorage.getItem(row.key)) return row.key; } catch (e) {} }
        const want = kind === 'school' ? schoolKey(row.name, row.date) : sentKey(row.name, row.date);
        const re = kind === 'school' ? /^(supervision_v6_school_report_|school_report_)/ : ARCHIVE_RE;
        const hits = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!re.test(k || '')) continue;
                let d = null; try { d = JSON.parse(localStorage.getItem(k)); } catch (e) {}
                if (!d || d.deleted) continue;
                const vd = String(d.visitDate || '');
                const pd = vd.includes('-') ? vd.split('-').reverse().join('/') : vd;
                const id = kind === 'school' ? schoolKey(d.schoolName || d.school, pd) : sentKey(d.teacherName, pd);
                if (id === want) hits.push(k);
            }
        } catch (e) {}
        return hits.length === 1 ? hits[0] : '';
    }
    window.svfUploadReportText = function (rep) {
        if (!rep) return '';
        const c = rep.count || {};
        return [(rep.kind === 'school' ? 'تقرير رفع الزيارات المدرسيّة' : 'تقرير رفع الزيارات الإشرافيّة')
                + ' — حُفظت ' + (c.saved || 0) + ' من ' + (rep.total || rep.rows.length)]
            .concat(rep.rows.map(r => (Number(r.i) + 1) + '. ' + (r.name || '—') + ' — ' + (r.date || '—') + ': '
                + (UP_ST[r.status] || UP_ST.failed)[0] + (r.reason ? ' — ' + r.reason : ''))).join('\n');
    };
    window.svfRenderUploadReport = function (kind) {
        const el = document.getElementById(kind === 'school' ? 'schoolUploadReport' : 'supUploadReport');
        if (!el) return;
        const rep = uploadReport(kind);
        const seen = readJson(UPLOAD_SEEN, {}) || {};
        if (!rep || !rep.rows.length || Number(seen[kind] || 0) >= Number(rep.at || 0)) {
            el.classList.add('hidden'); el.innerHTML = ''; return;
        }
        const c = { saved: 0, dup: 0, failed: 0, unsure: 0 };
        rep.rows.forEach(r => { if (c[r.status] != null) c[r.status]++; else c.failed++; });
        const total = Math.max(Number(rep.total) || 0, rep.rows.length);
        const when = (() => { try { return new Date(Number(rep.at)).toLocaleString('ar-OM', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();
        const chip = st => { const S = UP_ST[st] || UP_ST.failed; return `<span class="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full border ${S[1]}">${upEsc(S[0])}</span>`; };
        const row = r => {
            const key = findVisitKey(kind, r);
            return `<li class="py-2.5 border-t border-slate-100 flex items-start gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2"><b class="text-slate-900">${upEsc(r.name || '—')}</b>
                        <span class="text-xs text-slate-500"><bdi>${upEsc(r.date || '')}</bdi></span>${chip(r.status)}</div>
                    ${r.reason && r.status !== 'saved' ? `<div class="text-[13px] text-slate-700 mt-1 leading-relaxed">${upEsc(r.reason)}</div>` : ''}
                </div>
                ${key ? `<button type="button" class="svf-btn svf-btn-ghost svf-btn-sm shrink-0" data-up-open="${upEsc(key)}">فتح</button>` : ''}
            </li>`;
        };
        const bad = rep.rows.filter(r => r.status !== 'saved'), good = rep.rows.filter(r => r.status === 'saved');
        const retry = bad.filter(r => r.status === 'failed').map(r => findVisitKey(kind, r)).filter(Boolean);
        el.innerHTML = `<div class="bg-white border border-slate-200 rounded-2xl p-4 md:p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div class="font-bold text-slate-900">نتيجة آخر رفع إلى البوابة: حُفظت ${c.saved} من ${total}</div>
                    <div class="text-xs text-slate-500 mt-0.5">${upEsc(when)}${total > rep.rows.length ? ' · توقّف الطابور قبل آخره' : ''}</div>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${retry.length ? `<button type="button" class="svf-btn svf-btn-secondary svf-btn-sm" data-up-pick="1">تحديد ما لم يُحفظ (${retry.length})</button>` : ''}
                    <button type="button" class="svf-btn svf-btn-ghost svf-btn-sm" data-up-copy="1">نسخ التقرير</button>
                    <button type="button" class="svf-btn svf-btn-ghost svf-btn-sm" data-up-hide="1">إخفاء</button>
                </div>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">${['saved', 'dup', 'failed', 'unsure'].filter(k => c[k]).map(k => `<span>${chip(k)} <b>${c[k]}</b></span>`).join('')}</div>
            ${bad.length ? `<ul class="mt-2">${bad.map(row).join('')}</ul>` : '<p class="text-sm text-green-800 mt-2">حُفظت الزيارات كلّها.</p>'}
            ${c.unsure ? '<p class="text-xs text-slate-500 mt-2">«لم يتأكّد حفظها»: افتح قائمة الزيارات في البوابة؛ إن وجدتها محفوظةً فأكّد حفظها يدويّاً من بطاقتها، وإلّا أعد رفعها.</p>' : ''}
            ${good.length ? `<details class="mt-2"><summary class="text-sm text-slate-600 cursor-pointer">ما حُفظ (${good.length})</summary><ul>${good.map(row).join('')}</ul></details>` : ''}
        </div>`;
        el.classList.remove('hidden');
        if (el.dataset.upBound) return;
        el.dataset.upBound = '1';
        el.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            const k = el.id === 'schoolUploadReport' ? 'school' : 'sup';
            if (b.dataset.upHide) {
                const s2 = readJson(UPLOAD_SEEN, {}) || {};
                const r2 = uploadReport(k);
                s2[k] = r2 ? Number(r2.at) : Date.now();
                try { localStorage.setItem(UPLOAD_SEEN, JSON.stringify(s2)); } catch (er) {}
                window.svfRenderUploadReport(k);
            } else if (b.dataset.upCopy) {
                const t = window.svfUploadReportText(uploadReport(k));
                const done = () => { if (typeof showToast === 'function') showToast('نُسخ تقرير الرفع', 'success'); };
                try { navigator.clipboard.writeText(t).then(done, () => window.prompt('انسخ التقرير:', t)); } catch (er) { window.prompt('انسخ التقرير:', t); }
            } else if (b.dataset.upPick) {
                const r2 = uploadReport(k);
                const keys = r2 ? r2.rows.filter(r => r.status === 'failed').map(r => findVisitKey(k, r)).filter(Boolean) : [];
                const set = k === 'school' ? schoolSelected : selected;
                keys.forEach(x => set.add(x));
                if (k === 'school') { if (typeof renderSchoolReportsList === 'function') renderSchoolReportsList(); updateSchoolSelectionUI(); }
                else { if (typeof renderSavedReports === 'function') renderSavedReports(); updateSelectionUI(); }
                if (typeof showToast === 'function') showToast('حُدّد ' + keys.length + ' — أصلح ما ذُكر سببه ثمّ «رفع المحدد إلى البوابة»', 'success');
            } else if (b.dataset.upOpen) {
                const key = b.dataset.upOpen;
                if (k === 'school') { if (typeof editSchoolReport === 'function') editSchoolReport(key); }
                else if (typeof loadPermanentReport === 'function') loadPermanentReport(key);
            }
        });
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
