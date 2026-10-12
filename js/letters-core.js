// =========================================================================
// المراسلات — القوالب وبناء الخطاب (منذ 2026-10-12)
//
// دالّاتٌ نقيّةٌ بلا DOM (تُصدَّر لـnode أيضاً). الخطاب: موضوعٌ، ومخاطَبٌ، وتحيّةٌ، ومتنٌ من القالب،
// وخاتمةٌ وتوقيع، ومعه اختياريّاً «كشفٌ مرفق» بالفئة المستهدفة من قاعدة المعلّمين.
// القالب الأوّل (تبادل الزيارات) بصياغة المشرف نفسه، مع تصحيح الإملاء وتصريف «المذكور» بعدد الكشف وجنسه.
// =========================================================================
(function (root) {
    'use strict';

    const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
    const arNum = v => String(v == null ? '' : v).replace(/\d/g, d => AR_DIGITS[+d]);
    const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    // «2026-05-11» ← { day: 'الاثنين', date: '١١/ ٥/ ٢٠٢٦م' } كما في نموذج المشرف
    function arDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
        if (!m) return { day: '', date: '' };
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        return { day: DAYS[d.getUTCDay()], date: arNum(`${+m[3]}/ ${+m[2]}/ ${m[1]}`) + 'م' };
    }

    // «07:30» ← «٧:٣٠ ص»
    function arTime(hhmm) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(clean(hhmm));
        if (!m) return clean(hhmm);
        let h = +m[1];
        const pm = h >= 12;
        if (h > 12) h -= 12;
        if (h === 0) h = 12;
        return arNum(`${h}:${m[2]}`) + (pm ? ' م' : ' ص');
    }

    // المخاطَب: مدرسةٌ واحدة ← «الفاضل/ مدير مدرسة …»، وأكثر ← «الأفاضل/ مديرو المدارس المعنية»
    function addressee(schools, female) {
        const list = (schools || []).map(clean).filter(Boolean);
        if (list.length === 1) {
            const s = list[0].replace(/^مدرسة\s+/, '');
            return female ? `الفاضلة/ مديرة مدرسة ${s}       المحترمة` : `الفاضل/ مدير مدرسة ${s}       المحترم`;
        }
        return 'الأفاضل/ مديرو المدارس المعنية       المحترمون';
    }

    // «المعلم المذكور» بعدد الكشف وجنسه
    function mentionedTeachers(teachers) {
        const t = (teachers || []).filter(x => x && clean(x.name));
        const allF = t.length && t.every(x => x.gender === 'f');
        if (t.length === 1) return allF ? 'للمعلمة المذكورة' : 'للمعلم المذكور';
        if (!t.length) return 'للمعلمين المذكورين';
        return allF ? 'للمعلمات المذكورات' : 'للمعلمين المذكورين';
    }

    // سطرٌ لكلّ بند، بلا ترقيمٍ أو شرطةٍ في أوّله (يُرقَّم من جديد) — والرقم بلا فاصلٍ بعده جزءٌ من النصّ
    const listLines = v => String(v || '').split('\n').map(l => clean(l).replace(/^(?:[-–•*]|[\d٠-٩]+\s*[-.)–])\s*/, '')).filter(Boolean);
    const schoolOf = v => clean(v).replace(/^مدرسة\s+/, '');
    // «الفاضل/ …» ← يُلحق «المحترم/المحترمة/المحترمون» بحسب اللقب إن لم يُكتب
    function withTitle(to) {
        if (/المحترم/.test(to)) return to;
        const suf = /^الفاضلة/.test(to) ? 'المحترمة' : /^الأفاضل/.test(to) ? 'المحترمون' : 'المحترم';
        return to + '       ' + suf;
    }

    // «بأسماء المعلمين المنفذين لـ» بعدد الكشف وجنسه
    function executors(teachers) {
        const t = (teachers || []).filter(x => x && clean(x.name));
        const allF = t.length && t.every(x => x.gender === 'f');
        if (t.length === 1) return allF ? 'باسم المعلمة المنفذة ل' : 'باسم المعلم المنفذ ل';
        return allF ? 'بأسماء المعلمات المنفذات ل' : 'بأسماء المعلمين المنفذين ل';
    }

    const OPENING = 'عطّر الله أوقاتكم بكل خير وسرور، وحول الموضوع المشار إليه أعلاه،';

    // ── القوالب: fields تصف النموذج، وbody(f, ctx) تبني فقرات المتن ──
    const TEMPLATES = [
        {
            id: 'exchange', label: 'برنامج تبادل الزيارات', icon: 'fa-people-arrows', attach: true,
            subject: f => clean(f.program) || 'برنامج تبادل الزيارات',
            fields: [
                { id: 'program', label: 'اسم البرنامج', value: 'برنامج تبادل الزيارات (المهرجان الرياضي التعليمي)' },
                { id: 'date', label: 'تاريخ التنفيذ', type: 'date' },
                { id: 'host', label: 'المدرسة المستضيفة', list: 'schools' },
                { id: 'time', label: 'وقت الحضور', type: 'time', value: '07:30' },
                { id: 'uniform', label: 'الالتزام بالزي الرياضي', type: 'check', value: true },
                { id: 'mandatory', label: 'فقرة إلزاميّة الحضور', type: 'check', value: true }
            ],
            body: (f, c) => {
                const d = arDate(f.date);
                const p = [
                    `${OPENING} وضمن خطة إشراف مادة الرياضة المدرسية لتنفيذ ${clean(f.program) || 'برنامج تبادل الزيارات'}، `
                    + `نود إفادتكم بأنه سيتم تنفيذ البرنامج حسب الفئة المستهدفة بالكشف المرفق، وذلك يوم ${d.day || '……'} الموافق (${d.date || '……'}).`,
                    `التكرم بالإيعاز ${mentionedTeachers(c.teachers)} الحضور إلى مدرسة ${clean(f.host).replace(/^مدرسة\s+/, '') || '……'} `
                    + `الساعة ${arTime(f.time) || '……'}` + (f.uniform ? '، والالتزام بالزي الرياضي.' : '.')
                ];
                if (f.mandatory) p.push('كما نشير إلى إلزامية الحضور للفئة المستهدفة، ولن يُقبل التغيب إلا بعذرٍ مقبول، علماً بأنه سيتم '
                    + 'إرسال إفادات الغياب لمن تغيب بدون عذرٍ مقبول، وعليه نهيب بالجميع الالتزام.');
                return p;
            }
        },
        {
            id: 'notes', label: 'ملاحظات زيارة مدرسية', icon: 'fa-clipboard-list', attach: false, oneSchool: true,
            subject: f => 'ملاحظات الزيارة ' + (clean(f.visitType) || 'الإشرافية') + ' لمادة الرياضة المدرسية',
            fields: [
                { id: 'visitType', label: 'نوع الزيارة', value: 'الإشرافية' },
                { id: 'visitDate', label: 'تاريخ الزيارة', type: 'date' },
                { id: 'items', label: 'الملاحظات والتوصيات (سطرٌ لكلّ بند)', type: 'textarea', fromLastVisit: true },
                { id: 'deadline', label: 'مدّة التنفيذ', value: 'خلال أسبوعين من تاريخه' }
            ],
            body: f => {
                const d = arDate(f.visitDate);
                const items = listLines(f.items);
                return [
                    `${OPENING} نفيدكم بأنه تم تنفيذ الزيارة ${clean(f.visitType) || 'الإشرافية'} لمادة الرياضة المدرسية بمدرستكم `
                    + `يوم ${d.day || '……'} الموافق (${d.date || '……'})، وقد أسفرت عن الملاحظات والتوصيات الآتية:`,
                    ...items.map((t, i) => `${arNum(i + 1)}- ${t.replace(/\.?$/, '.')}`),
                    `نأمل التكرم بالاطلاع والإيعاز لمن يلزم بالمتابعة والتنفيذ ${clean(f.deadline) || 'في أقرب وقت'}، شاكرين لكم حسن تعاونكم.`
                ];
            }
        },
        {
            id: 'violation', label: 'مدرسة مخالفة (للدائرة)', icon: 'fa-triangle-exclamation', attach: false, oneSchool: true, noRecipients: true,
            subject: f => 'عدم التزام مدرسة ' + (schoolOf(f.school) || '……') + ' بتنفيذ الملاحظات والتوصيات',
            to: f => withTitle(clean(f.toTitle) || 'الفاضل/ مدير دائرة المؤسسات التعليمية الخاصة'),
            greeting: 'السلام عليكم ورحمة الله وبركاته، وبعد،،',
            closing: ['تكرمكم بالعلم واتخاذ اللازم.', 'شاكرين لكم حسن تعاونكم', 'وتفضلوا بقبول فائق الاحترام والتقدير'],
            cc: f => listLines(f.cc),
            fields: [
                { id: 'toTitle', label: 'المخاطَب', value: 'الفاضل/ مدير دائرة المؤسسات التعليمية الخاصة' },
                { id: 'school', label: 'المدرسة المخالفة', list: 'schools' },
                { id: 'visitDate', label: 'تاريخ الزيارة', type: 'date' },
                { id: 'purpose', label: 'غرض الزيارة', value: 'لمتابعة مدى التزام المدرسة بتلافي الملاحظات المرصودة' },
                { id: 'finding', label: 'جملة الرصد', value: 'ولوحظ أثناء الزيارة عدم التزام المدرسة بتنفيذ التوصيات والملاحظات، والتي تمثلت في الآتي:' },
                { id: 'items', label: 'المخالفات (سطرٌ لكلّ بند)', type: 'textarea', fromLastVisit: true },
                { id: 'cc', label: 'نسخة لـ (سطرٌ لكلّ جهة)', type: 'textarea', value: 'مكتب د. المدير العام.\nقسم إشراف الإدارة المدرسية.' }
            ],
            body: f => {
                const d = arDate(f.visitDate);
                const items = listLines(f.items);
                return [
                    `طيب الله أوقاتكم بالمسرات، وحول الموضوع المشار إليه أعلاه، نفيدكم علمًا بأنه تمّت زيارة مدرسة ${schoolOf(f.school) || '……'} `
                    + `يوم ${d.day || '……'} الموافق (${d.date || '……'})، ${clean(f.purpose)}، ${clean(f.finding)}`,
                    ...items.map((t, i) => `${arNum(i + 1)}. ${t.replace(/\.?$/, '.')}`)
                ];
            }
        },
        {
            // نموذج المشرف (2026-10-12). الكشف من «مدارس الفئة المستهدفة»، والمخاطَب الدائرة؛ وما يُشارك خطابَ التبادل يُؤخذ منه (from)
            id: 'thanks', label: 'طلب شهادات شكر', icon: 'fa-award', attach: true, rosterOnly: true,
            subject: f => 'طلب شهادات شكر للمنفذين ل' + (clean(f.program) || 'برنامج تبادل الزيارات'),
            to: f => withTitle(clean(f.toTitle) || 'الفاضل/ د.مدير دائرة تطوير الأداء المدرسي'),
            greeting: 'السلام عليكم ورحمة الله وبركاته، وبعد',
            closing: ['شاكرين لكم حسن تعاونكم', 'وتفضلوا بقبول وافر الاحترام والتقدير'],
            fields: [
                { id: 'toTitle', label: 'المخاطَب', value: 'الفاضل/ د.مدير دائرة تطوير الأداء المدرسي' },
                { id: 'program', label: 'اسم البرنامج', value: 'برنامج تبادل الزيارات (المهرجان التعليمي الرياضي)', from: 'exchange' },
                { id: 'host', label: 'مدرسة التنفيذ', list: 'schools', from: 'exchange' },
                { id: 'date', label: 'تاريخ التنفيذ', type: 'date', from: 'exchange' }
            ],
            body: (f, c) => {
                const d = arDate(f.date);
                return [`طيب الله أوقاتكم بكل خير وسرور، وبالإشارة إلى الموضوع أعلاه، أرفق لكم كشفًا ${executors(c.teachers)}`
                    + `${clean(f.program) || 'برنامج تبادل الزيارات'} المقرر تنفيذه في مدرسة ${schoolOf(f.host) || '……'} `
                    + `وذلك يوم ${d.day || '……'} الموافق (${d.date || '……'})، وعليه أرجو التكرم باستلامها منكم في فترة تسبق اليوم المحدد للتنفيذ.`];
            }
        },
        {
            id: 'workshop', label: 'دعوة لورشة / اجتماع', icon: 'fa-chalkboard', attach: true,
            subject: f => 'دعوة لحضور ' + (clean(f.topic) || 'ورشة تدريبية'),
            fields: [
                { id: 'topic', label: 'الورشة / الاجتماع', value: 'ورشة تدريبية بعنوان: ' },
                { id: 'date', label: 'التاريخ', type: 'date' },
                { id: 'venue', label: 'المكان', list: 'schools' },
                { id: 'time', label: 'الوقت', type: 'time', value: '08:00' },
                { id: 'bring', label: 'ما يُحضَر (اختياريّ)', value: '' }
            ],
            body: (f, c) => {
                const d = arDate(f.date);
                const venue = clean(f.venue);
                return [
                    `${OPENING} يسرّنا دعوة الفئة المستهدفة بالكشف المرفق لحضور ${clean(f.topic) || 'ورشة تدريبية'}، `
                    + `وذلك يوم ${d.day || '……'} الموافق (${d.date || '……'}) الساعة ${arTime(f.time) || '……'}`
                    + (venue ? ` في ${/^(مدرسة|قاعة|مركز|دائرة|مديرية)/.test(venue) ? venue : 'مدرسة ' + venue}.` : '.'),
                    `التكرم بالإيعاز ${mentionedTeachers(c.teachers)} الحضور في الموعد المحدد`
                    + (clean(f.bring) ? `، مع إحضار ${clean(f.bring)}.` : '.')
                ];
            }
        },
        {
            id: 'followup', label: 'متابعة توصيات متأخرة', icon: 'fa-list-check', attach: false, oneSchool: true,
            subject: () => 'متابعة تنفيذ توصيات الزيارة السابقة لمادة الرياضة المدرسية',
            fields: [
                { id: 'visitDate', label: 'تاريخ الزيارة السابقة', type: 'date' },
                { id: 'items', label: 'التوصيات المطلوب متابعتها (سطرٌ لكلّ بند)', type: 'textarea', fromOverdue: true },
                { id: 'reply', label: 'مهلة الإفادة', value: 'خلال أسبوع من تاريخه' }
            ],
            body: f => {
                const d = arDate(f.visitDate);
                const items = listLines(f.items);
                return [
                    `${OPENING} وإشارةً إلى زيارتنا لمدرستكم يوم ${d.day || '……'} الموافق (${d.date || '……'})، `
                    + 'نود التذكير بالتوصيات الآتية التي حان موعد تنفيذها:',
                    ...items.map((t, i) => `${arNum(i + 1)}- ${t.replace(/\.?$/, '.')}`),
                    `نأمل التكرم بالمتابعة وإفادتنا بما تمّ ${clean(f.reply) || 'في أقرب وقت'}، شاكرين لكم حسن تعاونكم.`
                ];
            }
        }
    ];
    const templateOf = id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];

    // الخطاب كاملاً: { subject, to, greeting, body[], closing, signature[], teachers[] }
    function buildLetter(templateId, fields, ctx) {
        const t = templateOf(templateId);
        const f = Object.assign({}, ...t.fields.map(x => ({ [x.id]: x.value })), fields || {});
        const c = Object.assign({ schools: [], teachers: [], femalePrincipal: false, signer: '', title: 'مشرف مادة الرياضة المدرسية' }, ctx || {});
        return {
            template: t.id,
            subject: t.subject(f),
            to: t.to ? t.to(f) : addressee(c.schools, c.femalePrincipal),
            greeting: t.greeting || 'السلام عليكم ورحمة الله وبركاته، وبعد:',
            body: t.body(f, c),
            closing: t.closing || ['وتفضلوا بقبول فائق الاحترام والتقدير،،،'],
            signature: [clean(c.title), clean(c.signer)].filter(Boolean),
            teachers: t.attach ? (c.teachers || []).filter(x => x && clean(x.name)) : [],
            cc: t.cc ? t.cc(f) : []
        };
    }

    // نصٌّ عاديٌّ للنسخ إلى نظام المراسلات
    function letterText(L) {
        const lines = [L.to, '', L.greeting, ''];
        L.body.forEach(p => lines.push(p));
        lines.push('');
        L.closing.forEach(s => lines.push(s));
        lines.push('');
        L.signature.forEach(s => lines.push(s));
        if (L.cc.length) { lines.push('', 'نسخة لـ:'); L.cc.forEach(s => lines.push('* ' + s)); }
        if (L.teachers.length) {
            lines.push('', 'كشف الفئة المستهدفة:');
            L.teachers.forEach((x, i) => lines.push(`${arNum(i + 1)}- ${clean(x.name)} — ${clean(x.school)}${x.fileNumber ? ' — ' + arNum(x.fileNumber) : ''}`));
        }
        return lines.join('\n');
    }

    // HTML الخطاب لـWord والمعاينة — كلّ سطرٍ فقرة (Word يمدّ السطر المنتهي بـ<br>)، والنصوص مهروبة
    const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function letterHTML(L) {
        const P = 'margin:0 0 8pt 0;line-height:1.6;font-family:Arial;font-size:14pt;text-align:justify;';
        const p = (t, extra) => `<p dir="rtl" style="${P}${extra || ''}">${escH(t)}</p>`;
        // الفراغ قبل «المحترم» يُحفظ (HTML وWord يطويان المسافات المتتالية)
        let h = `<p dir="rtl" style="${P}font-weight:bold;">${escH(L.to).replace(/ {2,}/g, m => '&nbsp;'.repeat(m.length * 3))}</p>`
            + p('الموضوع: ' + L.subject, 'font-weight:bold;text-align:center;text-decoration:underline;')
            + p(L.greeting)
            + L.body.map(t => p(t)).join('')
            + L.closing.map(t => p(t, 'text-align:center;font-weight:bold;')).join('')
            + L.signature.map(s => p(s, 'text-align:left;font-weight:bold;margin:0;')).join('')
            + (L.cc.length ? p('نسخة لـ:', 'font-weight:bold;margin-top:14pt;font-size:12pt;') + L.cc.map(t => p('• ' + t, 'margin:0;font-size:12pt;')).join('') : '');
        if (L.teachers.length) {
            const td = 'border:1px solid #000;padding:3pt 6pt;font-family:Arial;font-size:12pt;';
            h += p('كشف الفئة المستهدفة', 'font-weight:bold;margin-top:14pt;')
                + `<table dir="rtl" style="border-collapse:collapse;width:100%;"><tr>`
                + ['م', 'الاسم', 'المدرسة', 'رقم الملف'].map(x => `<th style="${td}background:#E7E6E6;">${x}</th>`).join('') + '</tr>'
                + L.teachers.map((x, i) => `<tr><td style="${td}text-align:center;">${arNum(i + 1)}</td><td style="${td}">${escH(clean(x.name))}</td>`
                    + `<td style="${td}">${escH(clean(x.school))}</td><td style="${td}text-align:center;">${escH(arNum(clean(x.fileNumber)))}</td></tr>`).join('')
                + '</table>';
        }
        return h;
    }

    const api = { TEMPLATES, templateOf, buildLetter, letterText, letterHTML, arDate, arTime, arNum, addressee, mentionedTeachers, withTitle };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfLetters = api;
})(typeof window !== 'undefined' ? window : this);
