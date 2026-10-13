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

    // «07:30» ← «(٧:٣٠) صباحاً» — صيغة المشرف (2026-10-13): «في تمام الساعة (٧:٠٠) صباحاً»
    function arTime(hhmm) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(clean(hhmm));
        if (!m) return clean(hhmm);
        let h = +m[1];
        const part = h < 12 ? 'صباحاً' : h === 12 ? 'ظهراً' : 'مساءً';
        if (h > 12) h -= 12;
        if (h === 0) h = 12;
        return `(${arNum(`${h}:${m[2]}`)}) ${part}`;
    }

    // الأرقام بين الكلمات بين قوسين (طلب المشرف 2026-10-13): «35 دقيقة» ← «(35) دقيقة».
    // ما كان داخل قوسين يبقى («(1-12)»، التاريخ، رقم الملف)، وترقيم البند في أوّل السطر «١. » لا يُمسّ؛
    // والرقم المركّب كتلةٌ واحدة («12/5»، «7:30»، «5-8»).
    function wrapNums(text) {
        const s = String(text == null ? '' : text);
        const lead = /^[\d٠-٩]+[.\-–]\s/.exec(s);
        const head = lead ? lead[0] : '', rest = s.slice(head.length);
        let out = '', depth = 0, buf = '';
        const flush = () => { out += buf.replace(/[\d٠-٩]+(?:[\/:.\-–][\d٠-٩]+)*/g, m => `(${m})`); buf = ''; };
        for (const ch of rest) {
            if (ch === '(') { if (!depth) flush(); depth++; out += ch; }
            else if (ch === ')' && depth) { depth--; out += ch; }
            else if (depth) out += ch;
            else buf += ch;
        }
        flush();
        return head + out;
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
                    + `في تمام الساعة ${arTime(f.time) || '……'}` + (f.uniform ? '، والالتزام بالزي الرياضي.' : '.')
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
            // صيغ المشرف الثلاث (2026-10-12) — زرٌّ في الواجهة يضع حقولها: عدم التنفيذ (بنسخ)، وتكرار الرصد (بلا نسخ)،
            // واستمرارها سنوات (بلا افتتاحيّة، وفقرةٌ مستقلّة قبل جملة الرصد، وبنسخ)
            presets: [
                { label: 'عدم تنفيذ التوصيات', values: { opening: 'طيب الله أوقاتكم بالمسرات،',
                    purpose: 'لمتابعة مدى التزام المدرسة بتلافي الملاحظات المرصودة', extra: '',
                    finding: 'ولوحظ أثناء الزيارة عدم التزام المدرسة بتنفيذ التوصيات والملاحظات، والتي تمثلت في الآتي:',
                    cc: 'مكتب د. المدير العام.\nقسم إشراف الإدارة المدرسية.' } },
                { label: 'تكرار رصد الملاحظات', values: { opening: 'طيب الله أوقاتكم بالمسرات،',
                    purpose: 'لمتابعة مدى التزام المدرسة بتلافي الملاحظات المرصودة خلال الزيارة السابقة', extra: '',
                    finding: 'ولوحظ أثناء الزيارة تكرار رصد الملاحظات المتمثلة في الآتي:', cc: '' } },
                { label: 'ملاحظات مستمرة منذ سنوات', values: { opening: '',
                    purpose: 'وذلك لمتابعة مدى التزام المدرسة بتلافي الملاحظات المرصودة خلال الزيارات الإشرافية السابقة',
                    extra: 'ونود الإشارة إلى أن عددًا من هذه الملاحظات مستمر ومتكرر منذ ما يقارب ست سنوات، وقد سبق رصدها من قِبل مشرفي مادة '
                        + 'الرياضة المدرسية خلال الزيارات المتعاقبة للمدرسة، مع التأكيد في حينه على ضرورة معالجتها وتلافيها.',
                    finding: 'إلا أنه لوحظ أثناء الزيارة الحالية استمرار الملاحظات وعدم تنفيذ التوصيات السابقة بالصورة المطلوبة، والمتمثلة في الآتي:',
                    cc: 'مكتب د. المدير العام.\nقسم إشراف الإدارة المدرسية.' } }
            ],
            fields: [
                { id: 'toTitle', label: 'المخاطَب', value: 'الفاضل/ مدير دائرة المؤسسات التعليمية الخاصة' },
                { id: 'school', label: 'المدرسة المخالفة (ويمكن إلحاق «بولاية …»)', list: 'schools' },
                { id: 'visitDate', label: 'تاريخ الزيارة', type: 'date' },
                { id: 'opening', label: 'الافتتاحيّة (اختياريّة)', value: 'طيب الله أوقاتكم بالمسرات،' },
                { id: 'purpose', label: 'غرض الزيارة', value: 'لمتابعة مدى التزام المدرسة بتلافي الملاحظات المرصودة' },
                { id: 'extra', label: 'فقرة إضافيّة قبل الرصد (اختياريّة)', type: 'textarea', value: '' },
                { id: 'finding', label: 'جملة الرصد', value: 'ولوحظ أثناء الزيارة عدم التزام المدرسة بتنفيذ التوصيات والملاحظات، والتي تمثلت في الآتي:' },
                { id: 'items', label: 'المخالفات (سطرٌ لكلّ بند)', type: 'textarea', fromLastVisit: true },
                { id: 'cc', label: 'نسخة لـ (سطرٌ لكلّ جهة)', type: 'textarea', value: 'مكتب د. المدير العام.\nقسم إشراف الإدارة المدرسية.' }
            ],
            body: f => {
                const d = arDate(f.visitDate);
                const items = listLines(f.items);
                const purpose = clean(f.purpose), extra = clean(f.extra), finding = clean(f.finding);
                // «؛ وذلك لمتابعة…» كما كتبها المشرف، وإلّا «، لمتابعة…»
                const visit = (clean(f.opening) ? clean(f.opening) + ' ' : '')
                    + `وحول الموضوع المشار إليه أعلاه، نفيدكم علمًا بأنه تمّت زيارة مدرسة ${schoolOf(f.school) || '……'} `
                    + `يوم ${d.day || '……'} الموافق (${d.date || '……'})` + (purpose ? (/^وذلك/.test(purpose) ? '؛ ' : '، ') + purpose : '');
                const lines = extra
                    ? [visit.replace(/[.،]?$/, '.'), extra.replace(/[.،]?$/, '.') + (finding ? ' ' + finding : '')]
                    : [visit + (finding ? '، ' + finding : '')];
                return lines.concat(items.map((t, i) => `${arNum(i + 1)}. ${t.replace(/\.?$/, '.')}`));
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
            // نموذج المشرف (2026-10-12): لمدير مدرسة المعلّم، والمعلّم من القاعدة (رقم الملف والجنس والمدرسة تُملأ في الواجهة)
            id: 'absence', label: 'غياب عن برنامج تدريبي', icon: 'fa-user-xmark', attach: false, oneSchool: true,
            subject: f => 'غياب ' + (f.female ? 'المعلمة' : 'المعلم') + ' ' + (clean(f.teacher) || '……') + ' عن ' + (clean(f.program) || 'برنامج تدريبي'),
            greeting: 'السلام عليكم ورحمة الله وبركاته، وبعد',
            closing: ['وتفضلوا بقبول فائق الاحترام،،،'],
            fields: [
                { id: 'teacher', label: 'المعلم الغائب', list: 'teachers' },
                { id: 'fileNumber', label: 'رقم الملف' },
                { id: 'female', label: 'معلمة', type: 'check', value: false },
                { id: 'date', label: 'يوم البرنامج', type: 'date' },
                { id: 'program', label: 'البرنامج', value: 'برنامج تدريبي' },
                { id: 'ref', label: 'رقم قيد مخاطبة الفئة المستهدفة' },
                { id: 'days', label: 'مهلة الإعادة (أيام عمل)', value: '3' },
                { id: 'dept', label: 'تُعاد إلى', value: 'دائرة تطوير الأداء المدرسي قسم إشراف المهارات الفردية' }
            ],
            body: f => {
                const d = arDate(f.date), F = !!f.female, prog = clean(f.program) || 'برنامج تدريبي';
                return [`لكم منا خالص التحية والتقدير، وحول الموضوع المشار إليه أعلاه، نرفق لكم استمارة غياب ${F ? 'المعلمة' : 'المعلم'}/ `
                    + `${clean(f.teacher) || '……'} رقم الملف (${arNum(clean(f.fileNumber)) || '……'}) ${F ? 'معلمة' : 'معلم'} رياضة مدرسية، `
                    + `وذلك يوم ${d.day || '……'} الموافق (${d.date || '……'})، علمًا بأنه قد تم مخاطبة المدرسة بالفئة المستهدفة برقم قيد `
                    + `(${arNum(clean(f.ref)) || '……'})، عليه نرفق لكم استمارة غياب مستهدف عن ${prog}، للتكرم بطباعة الاستمارة المرفقة `
                    + `وتسليمها ${F ? 'للمعنية' : 'للمعني'} للإفادة ومن ثم الإفادة برأيكم في المكان المخصص لكم في الاستمارة، وإعادة إرسالها `
                    + `في نفس الخطاب وليس بمراسلة جديدة إلى ${clean(f.dept) || 'دائرة تطوير الأداء المدرسي'} في موعد أقصاه `
                    + `(${arNum(clean(f.days)) || '٣'}) أيام عمل من تاريخه.`];
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
                    + `وذلك يوم ${d.day || '……'} الموافق (${d.date || '……'}) في تمام الساعة ${arTime(f.time) || '……'}`
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

    // الخطاب كاملاً: { subject, to, greeting, body[], closing[], teachers[], cc[] } — بلا توقيع (طلب المشرف 2026-10-13: نظام المراسلات يُظهر المرسِل)
    function buildLetter(templateId, fields, ctx) {
        const t = templateOf(templateId);
        const f = Object.assign({}, ...t.fields.map(x => ({ [x.id]: x.value })), fields || {});
        const c = Object.assign({ schools: [], teachers: [], femalePrincipal: false }, ctx || {});
        return {
            template: t.id,
            subject: t.subject(f),
            to: t.to ? t.to(f) : addressee(c.schools, c.femalePrincipal),
            greeting: t.greeting || 'السلام عليكم ورحمة الله وبركاته، وبعد:',
            body: t.body(f, c).map(wrapNums),
            closing: t.closing || ['وتفضلوا بقبول فائق الاحترام والتقدير،،،'],
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
        if (L.cc.length) { lines.push('', 'نسخة لـ:'); L.cc.forEach(s => lines.push('* ' + s)); }
        if (L.teachers.length) {
            lines.push('', 'كشف الفئة المستهدفة:');
            L.teachers.forEach((x, i) => lines.push(`${arNum(i + 1)}- ${clean(x.name)} — ${clean(x.school)}${x.fileNumber ? ' — ' + arNum(x.fileNumber) : ''}`));
        }
        return lines.join('\n');
    }

    // HTML الخطاب لـWord والمعاينة — كلّ سطرٍ فقرة (Word يمدّ السطر المنتهي بـ<br>)، والنصوص مهروبة
    const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // paste: للّصق في محرّر نظام المراسلات — بلا سطر الموضوع (له خانته هناك) وبلا خطٍّ وحجم (يأخذ خطّ المحرّر)، والجدول بحدوده
    function letterHTML(L, opts) {
        const paste = !!(opts && opts.paste);
        const P = paste ? 'margin:0 0 8pt 0;text-align:justify;' : 'margin:0 0 8pt 0;line-height:1.6;font-family:Arial;font-size:14pt;text-align:justify;';
        const p = (t, extra) => `<p dir="rtl" style="${P}${extra || ''}">${escH(t)}</p>`;
        // الفراغ قبل «المحترم» يُحفظ (HTML وWord يطويان المسافات المتتالية)
        let h = `<p dir="rtl" style="${P}font-weight:bold;">${escH(L.to).replace(/ {2,}/g, m => '&nbsp;'.repeat(m.length * 3))}</p>`
            + (paste ? '' : p('الموضوع: ' + L.subject, 'font-weight:bold;text-align:center;text-decoration:underline;'))
            + p(L.greeting)
            + L.body.map(t => p(t)).join('')
            + L.closing.map(t => p(t, 'text-align:center;font-weight:bold;')).join('')
            + (L.cc.length ? p('نسخة لـ:', 'font-weight:bold;margin-top:14pt;font-size:12pt;') + L.cc.map(t => p('• ' + t, 'margin:0;font-size:12pt;')).join('') : '');
        if (L.teachers.length) {
            const td = 'border:1px solid #000;padding:3pt 6pt;' + (paste ? '' : 'font-family:Arial;font-size:12pt;');
            h += p('كشف الفئة المستهدفة', 'font-weight:bold;margin-top:14pt;')
                + `<table dir="rtl" border="1" cellpadding="4" style="border-collapse:collapse;width:100%;"><tr>`
                + ['م', 'الاسم', 'المدرسة', 'رقم الملف'].map(x => `<th style="${td}background:#E7E6E6;">${x}</th>`).join('') + '</tr>'
                + L.teachers.map((x, i) => `<tr><td style="${td}text-align:center;">${arNum(i + 1)}</td><td style="${td}">${escH(clean(x.name))}</td>`
                    + `<td style="${td}">${escH(clean(x.school))}</td><td style="${td}text-align:center;">${escH(arNum(clean(x.fileNumber)))}</td></tr>`).join('')
                + '</table>';
        }
        return h;
    }

    const api = { TEMPLATES, templateOf, buildLetter, letterText, letterHTML, arDate, arTime, arNum, wrapNums, addressee, mentionedTeachers, withTitle };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfLetters = api;
})(typeof window !== 'undefined' ? window : this);
