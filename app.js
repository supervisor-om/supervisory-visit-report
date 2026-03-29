        // =========================================================================
        // 1. STATE & CONSTANTS
        // =========================================================================
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = SpeechRecognition ? new SpeechRecognition() : null;
        if (recognition) {
            recognition.continuous = false;
            recognition.lang = 'ar-SA';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
        }

        let performanceChartInstance = null;
        let schoolVisitTypesData = {};
        let schoolClassroomVisits = [];
        let objectiveNotes = {}; // { index: noteText } - ملاحظات الأهداف

        // صيغة القوالب: [ذكر_جمع/ذكر_مفرد/أنثى_جمع/أنثى_مفرد]
        const defaultSchoolVisitTypesData = {
            'gov_exploratory': {
                name: 'زيارة استطلاعية (حكومية)',
                objectives: [
                    '1- مقابلة [مدير/مدير/مديرة/مديرة] المدرسة و[معلمي/معلم/معلمات/معلمة] الرياضة المدرسية.',
                    '2- حضور الطابور المدرسي.',
                    '3- متابعة تنفيذ خطة المنهاج والاطلاع على سجلات المتابعة (الزي والمشاركة والتحضير).',
                    '4- تحديث قاعدة بيانات [المعلمين/المعلم/المعلمات/المعلمة].',
                    '5- متابعة تخطيط الملاعب والأدوات الرياضية.',
                    '6- متابعة استلام الأدلة وكتاب الطالب والتأكد من طبعاتها الحديثة.',
                    '7- متابعة النشرات والوثائق ومناقشتها.',
                    '8- التأكيد على تنفيذ الحصة على شكل منافسات وألعاب جماعية.'
                ]
            },
            'supervisory': {
                name: 'زيارة إشرافية',
                objectives: [
                    '1- الالتقاء ب[الفاضل/الفاضل/الفاضلة/الفاضلة] [مدير/مدير/مديرة/مديرة] المدرسة و[معلمي/معلم/معلمات/معلمة] الرياضة المدرسية.',
                    '2- حضور الطابور المدرسي.',
                    '3- متابعة تنفيذ خطة المنهاج والاطلاع على سجلات المتابعة (الزي والمشاركة).',
                    '4- حضور موقف صفي مع [المعلمين/المعلم/المعلمات/المعلمة] والمداولة الإشرافية.',
                    '5- شرح آلية تنفيذ الحصة كتطبيقات تنافسية.',
                    '6- متابعة التحضير في منصة نور.'
                ]
            }
        };

        const evaluationItems = [ 
            { id: 1, domain: 'الإنجاز الدراسي', standard: 'التحصيل الدراسي', title: 'تحصيل الطلبة في الأعمال الصفية وغير الصفية', desc: '(اكتساب المهارات الحركية والمعارف المرتبطة بها)' }, 
            { id: 2, domain: 'الإنجاز الدراسي', standard: 'التقدم الدراسي', title: 'التقدم الدراسي للطلبة بما فيهم الطلبة ذوي الإعاقة/الاحتياجات التعليمية', desc: '(تطور الأداء المهاري والخططي)' }, 
            { id: 3, domain: 'الإنجاز الدراسي', standard: 'مهارات التعلم', title: 'تطبيق مهارات التعلم (الذاتي- التعاوني - الرقمي - التفكير العليا) وربطها بالواقع', desc: '(القيادة، التعاون، التفكير الخططي في مواقف اللعب)' }, 
            { id: 4, domain: 'النمو الشخصي', standard: 'القيم والسلوك', title: 'تمسك الطلبة بالهوية العمانية والقيم الإنسانية', desc: '(الروح الرياضية وأخلاقيات اللعب)' }, 
            { id: 5, domain: 'مناخ المدرسة وبيئة التعلم', standard: 'جودة بيئة التعلم', title: 'متابعة جوانب الأمن والسلامة والنظافة في بيئة التعلم', desc: '(سلامة الأدوات والمرافق الرياضية)' }, 
            { id: 6, domain: 'التدريس والتقويم', standard: 'تخطيط المنهاج الدراسي', title: 'تخطيط المنهاج الدراسي لتحقيق نواتج التعلم', desc: '(التخطيط لتنمية المهارات الحركية واللياقة البدنية)' }, 
            { id: 7, domain: 'التدريس والتقويم', standard: 'إدارة الصف', title: 'فاعلية الإدارة الصفية', desc: '(إدارة وتنظيم النشاط البدني)' }, 
            { id: 8, domain: 'التدريس والتقويم', standard: 'فاعلية التدريس', title: 'توظيف استراتيجيات التدريس الفعالة', desc: '(استراتيجيات التدريس المناسبة للنشاط البدني)' }, 
            { id: 9, domain: 'التدريس والتقويم', standard: 'فاعلية التدريس', title: 'تفعيل المصادر والموارد التعليمية', desc: '(الأدوات والأجهزة والمرافق الرياضية)' }, 
            { id: 10, domain: 'التدريس والتقويم', standard: 'التقويم ومساندة التقدم', title: 'توظيف أساليب تقويم متنوعة', desc: '(تقويم الأداء الحركي والمهاري للطلبة)' }, 
            { id: 11, domain: 'القيادة والإدارة والحوكمة', standard: 'توظيف التقويم', title: 'توظيف التقويم الذاتي والتطوير المهني في تحسين الأداء', desc: '(التأمل في الممارسات التدريسية وتطويرها)' }, 
            { id: 12, domain: 'القيادة والإدارة والحوكمة', standard: 'الأنظمة', title: 'تطبيق السياسات والأنظمة واللوائح المنظمة للعمل', desc: '(الالتزام بأخلاقيات المهنة واللوائح)' }, 
            { id: 13, domain: 'القيادة والإدارة والحوكمة', standard: 'مبادرات', title: 'تنفيذ مبادرات وأنشطة تربوية في المجتمع المدرسي', desc: '(تنظيم الفعاليات والمسابقات الرياضية)' } 
        ];

        const evidenceBasedContent = {
            '1': { 
                levels: { 1: "يكتسب جميع الطلبة المهارات الأساسية والمعارف والمفاهيم في ضوء أهداف الدرس بصورة فعالة.", 2: "يكتسب معظم الطلبة المهارات الأساسية والمعارف والمفاهيم في ضوء أهداف الدرس بصورة فعالة.", 3: "يكتسب أغلب الطلبة المهارات الأساسية والمعارف والمفاهيم في ضوء أهداف الدرس بصورة ملائمة أو مقبولة.", 4: "يكتسب قليل الطلبة المهارات الأساسية والمعارف والمفاهيم في ضوء أهداف الدرس بصورة محدودة.", 5: "يكتسب عدد نادر الطلبة المهارات الأساسية والمعارف والمفاهيم في ضوء أهداف الدرس بصورة محدودة جدا/ نادرة." }, 
                evidences: ["أداء المهارة وفق الخطوات الفنية الصحيحة", "تطبيق القانون المرتبط بالمهارة أثناء اللعب", "الإجابة على الأسئلة المعرفية المرتبطة بالدرس", "ربط المهارة بمواقف اللعب الحقيقية", "تفاعل الطلبة مع التغذية الراجعة وتصحيح الأداء"], 
                neg_evidences: ["ضعف في أداء المهارة الفنية وفق الخطوات الصحيحة", "عدم تطبيق القانون المرتبط بالمهارة أثناء اللعب", "عجز عن الإجابة على الأسئلة المعرفية المرتبطة بالدرس", "صعوبة في ربط المهارة بمواقف اللعب الحقيقية", "عدم تفاعل الطلبة مع التغذية الراجعة"] 
            },
            '2': { 
                levels: { 1: "يتقدم جميع الطلبة دراسيا أثناء الحصة بما فيهم الطلبة ذوي الإعاقة/ الاحتياجات التعليمية بصورة متميزة.", 2: "يتقدم معظم الطلبة دراسيا أثناء الحصة بما فيهم الطلبة ذوي الإعاقة/ الاحتياجات التعليمية بصورة فاعلة.", 3: "يتقدم أغلب الطلبة دراسيا أثناء الحصة بما فيهم الطلبة ذوي الإعاقة/ الاحتياجات التعليمية بصورة ملائمة.", 4: "يتقدم قليل الطلبة دراسيا أثناء الحصة بما فيهم الطلبة ذوي الإعاقة/ الاحتياجات التعليمية بصورة محدودة.", 5: "يتقدم عدد نادر الطلبة دراسيا أثناء الحصة بما فيهم الطلبة ذوي الإعاقة/ الاحتياجات التعليمية بصورة محدودة جدا." }, 
                evidences: ["تحسن الأداء المهاري في الجزء الختامي مقارنة بالتمهيدي", "مشاركة الطلبة ذوي الاحتياجات بفاعلية وفق قدراتهم", "تطور مستوى اللعب الجماعي أثناء التقسيمة", "تصحيح الأخطاء الشائعة أثناء الممارسة", "التدرج في صعوبة التمرينات بما يناسب قدرات الطلبة"], 
                neg_evidences: ["ثبات المستوى المهاري دون تطور ملحوظ", "عزوف بعض الطلبة عن المشاركة الفعالة", "تكرار الأخطاء الفنية دون تصحيح", "عدم التدرج المناسب في التمرينات", "ضعف مستوى اللعب الجماعي أثناء التقسيمة"] 
            },
            '3': { 
                levels: { 1: "يطبق جميع الطلبة مهارات التعلم الذاتي والتعاوني والرقمي ومهارات التفكير العليا بمستوى متميز.", 2: "يطبق معظم الطلبة مهارات التعلم الذاتي والتعاوني والرقمي ومهارات التفكير العليا بمستوى فاعل.", 3: "يطبق أغلب الطلبة مهارات التعلم الذاتي والتعاوني والرقمي ومهارات التفكير العليا بمستوى ملائم أو مناسب.", 4: "يطبق قليل الطلبة مهارات التعلم الذاتي والتعاوني والرقمي ومهارات التفكير العليا بمستوى محدود.", 5: "يطبق عدد نادر الطلبة مهارات التعلم الذاتي والتعاوني والرقمي ومهارات التفكير العليا بمستوى محدود جدا/ نادر." }, 
                evidences: ["قيادة الطالب للمجموعة أثناء الإحماء أو التطبيق", "التعاون بين الزملاء لإنجاز المهمة الحركية", "اقتراح حلول للمشكلات الخططية أثناء اللعب", "تقييم الطالب لأداء زميله باستخدام البطاقة", "الالتزام بالأدوار الموكلة إليهم داخل الفريق"], 
                neg_evidences: ["غياب دور الطالب القيادي في المجموعات", "ضعف التعاون بين أفراد الفريق الواحد", "الاعتماد الكلي على المعلم في التوجيه", "غياب التقييم الذاتي أو للزميل", "عدم الالتزام بالأدوار الموكلة داخل الفريق"] 
            },
            '4': { 
                levels: { 1: "يلتزم جميع الطلبة بالقيم الإنسانية المشتركة، ويراعون ذلك بمستوى متميز.", 2: "يلتزم معظم الطلبة بالقيم الإنسانية المشتركة، ويراعون ذلك بمستوى فاعل.", 3: "يلتزم أغلب الطلبة بالقيم الإنسانية المشتركة، ويراعون ذلك بمستوى ملائم/مناسب.", 4: "يلتزم قليل الطلبة بالقيم الإنسانية المشتركة، ويراعون ذلك بمستوى محدود.", 5: "يلتزم عدد محدود جدا الطلبة بالقيم الإنسانية المشتركة، ويراعون ذلك بمستوى محدود جدا ونادر." }, 
                evidences: ["مصافحة الزملاء وتقبل الفوز والخسارة", "احترام قرارات الطالب الحكم أثناء المنافسة", "الالتزام بالزي الرياضي المحتشم والكامل", "المحافظة على نظافة المكان بعد انتهاء الدرس", "التعامل باحترام مع المعلم والزملاء"], 
                neg_evidences: ["ظهور سلوكيات غير رياضية أثناء المنافسة", "عدم احترام قرارات التحكيم", "مخالفة الزي الرياضي المقرر", "إهمال نظافة المكان بعد انتهاء الدرس", "التعامل بأسلوب غير لائق مع الزملاء"] 
            },
            '5': { 
                levels: { 1: "يتابع المعلم جوانب الأمن والسلامة والنظافة في بيئة التعلم بصورة متميزة.", 2: "يتابع المعلم جوانب الأمن والسلامة والنظافة في بيئة التعلم بصورة جيدة.", 3: "يتابع المعلم جوانب الأمن والسلامة والنظافة في بيئة التعلم بصورة مناسبة.", 4: "يتابع المعلم جوانب الأمن والسلامة والنظافة في بيئة التعلم بصورة محدودة.", 5: "يتابع المعلم جوانب الأمن والسلامة والنظافة في بيئة التعلم بصورة نادرة/ منعدمة." }, 
                evidences: ["خلو الملعب من العوائق والأجسام الخطرة", "تثبيت الأهداف والأجهزة الرياضية بشكل آمن", "توزيع الطلبة في مسافات آمنة أثناء التطبيق", "فحص الأدوات الرياضية قبل استخدامها", "وجود حقيبة إسعافات أولية جاهزة للاستخدام"], 
                neg_evidences: ["وجود عوائق في ساحة اللعب تهدد السلامة", "عدم تثبيت الأهداف والأجهزة بشكل آمن", "تزاحم الطلبة في مساحات ضيقة أثناء التطبيق", "إهمال فحص الأدوات قبل الاستخدام", "عدم توفر حقيبة إسعافات أولية"] 
            },
            '6': { 
                levels: { 1: "يخطط المعلم لجميع دروسه متسلسلا في تنوع الأهداف مرتبطا بالخطة الفصلية ومحققا لنواتج التعلم بصورة متميزة.", 2: "يخطط المعلم معظم دروسه متسلسلا في تنوع الأهداف مرتبطا بالخطة الفصلية ومحققا لنواتج التعلم بصورة جيدة.", 3: "يخطط المعلم أغلب دروسه متسلسلا في تنوع الأهداف مرتبطا بالخطة الفصلية ومحققا لنواتج التعلم بصورة مناسبة.", 4: "يخطط المعلم قليل دروسه متسلسلا في تنوع الأهداف مرتبطا بالخطة الفصلية ومحققا لنواتج التعلم بصورة محدودة.", 5: "يخطط المعلم عدد محدود جدا دروسه متسلسلا في تنوع الأهداف مرتبطا بالخطة الفصلية ومحققا لنواتج التعلم بصورة نادرة." }, 
                evidences: ["تنوع الأهداف (مهارية، معرفية، وجدانية) في الخطة", "تسلسل الأنشطة من السهل إلى الصعب", "شمولية التحضير الكتابي لعناصر الدرس الأساسية", "التوافق مع الخطة الفصلية وتوزيع الوحدات", "تحديد أدوات التقويم المناسبة لكل هدف"], 
                neg_evidences: ["عشوائية في تسلسل الأنشطة", "عدم وجود تحضير كتابي مكتمل العناصر", "عدم توافق الدرس مع الخطة الفصلية", "غياب أهداف الدرس الواضحة والمحددة", "عدم تحديد أدوات التقويم المناسبة"] 
            },
            '7': { 
                levels: { 1: "يقوم المعلم بإدارة زمن التعلم، وسلوك طلبته ويثير دافعيتهم للتعلم بصورة فعالة.", 2: "يقوم المعلم بإدارة زمن التعلم، وسلوك طلبته ويثير دافعيتهم للتعلم بصورة جيدة.", 3: "يقوم المعلم بإدارة زمن التعلم، وسلوك طلبته ويثير دافعيتهم للتعلم بصورة ملائمة.", 4: "يقوم المعلم بإدارة زمن التعلم، وسلوك طلبته ويثير دافعيتهم للتعلم بصورة محدودة.", 5: "يقوم المعلم بإدارة زمن التعلم، وسلوك طلبته ويثير دافعيتهم للتعلم بصورة نادرة." }, 
                evidences: ["الاستجابة السريعة لإشارات البدء والتوقف", "التنقل السلس والمنظم بين أجزاء الدرس", "توزيع الأدوات بطريقة منظمة توفر الوقت", "وقوف المعلم في مكان يكشف جميع الطلبة", "استثمار وقت الحصة كاملاً في النشاط البدني"], 
                neg_evidences: ["فوضى في الانتقال بين التشكيلات", "هدر وقت الحصة في تنظيم وتوزيع الأدوات", "وقوف المعلم في مكان غير كاشف للطلبة", "عدم انضباط سلوك الطلبة أثناء الشرح", "ضياع وقت التعلم الفعلي"] 
            },
            '8': { 
                levels: { 1: "يوظف المعلم استراتيجيات التدريس فعالة بحيث يستفيد منها جميع الطلبة في تعميق تعلمهم بمستوى متميز.", 2: "يوظف المعلم استراتيجيات التدريس فعالة بحيث يستفيد منها معظم الطلبة في تعميق تعلمهم بمستوى فاعل.", 3: "يوظف المعلم استراتيجيات التدريس فعالة بحيث يستفيد منها أغلب الطلبة في تعميق تعلمهم بمستوى ملائم.", 4: "يوظف المعلم استراتيجيات التدريس فعالة بحيث يستفيد منها قليل الطلبة في تعميق تعلمهم بمستوى محدود.", 5: "يوظف المعلم استراتيجيات التدريس فعالة بحيث يستفيد منها عدد قليل جدا الطلبة في تعميق تعلمهم بمستوى نادر." }, 
                evidences: ["استخدام أسلوب التعلم بالأقران أو المجموعات", "توظيف التعلم بالاكتشاف الموجه في المهارات", "التنويع في أساليب التدريس لمراعاة الفروق الفردية", "تفعيل الألعاب الصغيرة لخدمة الهدف المهاري", "إشراك جميع الطلبة في عملية التعلم النشط"], 
                neg_evidences: ["الاعتماد الكلي على التلقين والشرح اللفظي", "ملل الطلبة من تكرار نفس الأسلوب", "عدم مراعاة الفروق الفردية في التدريس", "قلة فرص الممارسة العملية للطلبة", "عدم إشراك الطلبة في عملية التعلم"] 
            },
            '9': { 
                levels: { 1: "يفعل المعلم التقنيات الرقمية(المنصات، والسبورات التفاعلية، والمختبرات، مصادر التعلم، والذكاء الاصطناعي...الخ) بحيث يستفيد منها جميع الطلبة في تعميق تعلمهم بمستوى متميز.", 2: "يفعل المعلم التقنيات الرقمية(المنصات، والسبورات التفاعلية، والمختبرات، مصادر التعلم، والذكاء الاصطناعي...الخ) بحيث يستفيد منها معظم الطلبة في تعميق تعلمهم بمستوى جيد.", 3: "يفعل المعلم التقنيات الرقمية(المنصات، والسبورات التفاعلية، والمختبرات، مصادر التعلم، والذكاء الاصطناعي...الخ) بحيث يستفيد منها أغلب الطلبة في تعميق تعلمهم بمستوى ملائم.", 4: "يفعل المعلم التقنيات الرقمية(المنصات، والسبورات التفاعلية، والمختبرات، مصادر التعلم، والذكاء الاصطناعي...الخ) بحيث يستفيد منها قليل من الطلبة في تعميق تعلمهم بمستوى محدود.", 5: "يفعل المعلم التقنيات الرقمية(المنصات، والسبورات التفاعلية، والمختبرات، مصادر التعلم، والذكاء الاصطناعي...الخ) بحيث يستفيد منها قليل جدا الطلبة في تعميق تعلمهم بمستوى نادر." }, 
                evidences: ["استخدام الأدوات البديلة عند نقص الإمكانيات", "توظيف التقانة (فيديو/صور) لتوضيح المهارة", "الاستخدام الأمثل للمساحات المتاحة في المدرسة", "توفير أدوات كافية لزيادة عدد التكرارات", "استخدام صافرة وأدوات توضيحية بفاعلية"], 
                neg_evidences: ["عدم كفاية الأدوات لعدد الطلبة", "عدم استخدام المساحات المتاحة في المدرسة", "خلو الدرس من وسائل توضيحية مساندة", "تعطل الأدوات المستخدمة أو عدم صلاحيتها", "سوء توزيع الأدوات على المجموعات"] 
            },
            '10': { 
                levels: { 1: "يوظف المعلم أساليب تقويم متنوعة؛ يراعى التمايز بين جميع الطلبة بما يعكس على تعلمهم بمستوى متميز.", 2: "يوظف المعلم أساليب تقويم متنوعة؛ يراعى التمايز بين معظم الطلبة بما يعكس على تعلمهم بمستوى فاعل.", 3: "يوظف المعلم أساليب تقويم متنوعة؛ يراعى التمايز بين أغلب الطلبة بما يعكس على تعلمهم بمستوى ملائم.", 4: "يوظف المعلم أساليب تقويم متنوعة؛ يراعى التمايز بين قليل من الطلبة بما يعكس على تعلمهم بمستوى محدود.", 5: "يوظف المعلم أساليب تقويم متنوعة؛ يراعى التمايز بين قليل جدا من الطلبة بما يعكس على تعلمهم بمستوى نادر." }, 
                evidences: ["استخدام بطاقات الملاحظة لتقييم المهارة", "تقديم تغذية راجعة فورية لتصحيح الأخطاء", "إشراك الطلبة في التقويم الذاتي والزميل", "طرح أسئلة شفهية للتأكد من الفهم المعرفي", "رصد درجات الأداء المهاري في سجل المتابعة"], 
                neg_evidences: ["غياب التغذية الراجعة المصححة للأداء", "عدم رصد الدرجات أو الملاحظات في السجل", "عدم استخدام أدوات قياس واضحة", "إهمال تقويم الجانب المعرفي", "عدم إشراك الطلبة في عملية التقويم"] 
            },
            '11': { 
                levels: { 1: "يجري المعلم تقويما لأدائه ذاتيا ويوظفه في تحسين تعلم جميع الطلبة بمستوى متميز.", 2: "يجري المعلم تقويما لأدائه ذاتيا ويوظفه في تحسين تعلم معظم الطلبة بمستوى فاعل.", 3: "يجري المعلم تقويما لأدائه ذاتيا ويوظفه في تحسين تعلم أغلب الطلبة بمستوى مناسب.", 4: "يجري المعلم تقويما لأدائه ذاتيا ويوظفه في تحسين تعلم قليل الطلبة بمستوى محدود.", 5: "يجري المعلم تقويما لأدائه ذاتيا ويوظفه في تحسين تعلم قليل جدا الطلبة بمستوى نادر." }, 
                evidences: ["تطبيق استراتيجيات جديدة تم تعلمها في المشاغل", "تقبل توجيهات المشرف والعمل على تنفيذها", "تحليل نتائج تعلم الطلبة وتطوير الخطط بناءً عليها", "تبادل الزيارات مع الزملاء للاستفادة من الخبرات", "المشاركة الفعالة في الإنماء المهني بالمدرسة"], 
                neg_evidences: ["عدم تقبل التوجيهات الفنية لتطوير الأداء", "تكرار نفس الممارسات الخاطئة", "غياب أثر البرامج التدريبية على الأداء", "عدم تحليل نتائج تعلم الطلبة", "عدم المشاركة في تبادل الخبرات"] 
            },
            '12': { 
                levels: { 1: "يطبق السياسات والأنظمة واللوائح المنظمة للعمل بصورة فعالة.", 2: "يطبق السياسات والأنظمة واللوائح المنظمة للعمل بصورة فاعلة.", 3: "يطبق السياسات والأنظمة واللوائح المنظمة للعمل بصورة مناسبة.", 4: "يطبق السياسات والأنظمة واللوائح المنظمة للعمل بصورة محدودة.", 5: "يطبق السياسات والأنظمة واللوائح المنظمة للعمل بصورة نادرة." }, 
                evidences: ["الالتزام بمواعيد الحضور والانصراف للحصة", "ارتداء الزي الرياضي المناسب واللائق", "تطبيق لائحة شؤون الطلبة في المواقف السلوكية", "التقيد بتعاميم الأمن والسلامة المدرسية", "المحافظة على عهدة التربية الرياضية وسجلاتها"], 
                neg_evidences: ["التأخر عن موعد الحصة الدراسية", "عدم الالتزام بالزي الرياضي الرسمي", "تجاهل تعاميم الأمن والسلامة", "قصور في سجلات المادة والعهدة", "عدم تطبيق اللوائح السلوكية"] 
            },
            '13': { 
                levels: { 1: "يقدم مبادرات فعالة لدعم وتحسين العملية التعليمية، كما يتميز بالتفاعل الإيجابي في جميع الأنشطة التربوية والمجتمع المحلي.", 2: "يقدم مبادرات فاعلة لدعم وتحسين العملية التعليمية، كما يتميز بالتفاعل الإيجابي في معظم الأنشطة التربوية والمجتمع المحلي.", 3: "يقدم مبادرات ملائمة لدعم وتحسين العملية التعليمية، كما يتميز بالتفاعل الإيجابي في أغلب الأنشطة التربوية والمجتمع المحلي.", 4: "يقدم مبادرات محدودة لدعم وتحسين العملية التعليمية، كما يتميز بالتفاعل الإيجابي في محدود الأنشطة التربوية والمجتمع المحلي.", 5: "نادرا ما يقدم مبادرات لدعم وتحسين العملية التعليمية، كما أن تفاعله مع الأنشطة التربوية والمجتمع المحلي محدود جدا." }, 
                evidences: ["تنظيم دوري رياضي داخلي أثناء الفسحة", "تفعيل برنامج الرياضة المدرسية في الطابور", "تدريب الفرق المدرسية للمسابقات الخارجية", "تنفيذ مسابقات رياضية للمعلمين أو المجتمع المحلي", "نشر الثقافة الصحية والرياضية في المدرسة"], 
                neg_evidences: ["عدم تفعيل الرياضة المدرسية في الطابور", "غياب النشاط الداخلي أثناء الفسحة", "عدم المشاركة في المسابقات الخارجية", "انعزال المعلم عن المجتمع المدرسي", "غياب المبادرات لنشر الثقافة الرياضية"] 
            }
        };

        const instructionalRecommendations = { 
            '1': "احرص على تنويع الأنشطة والتدريبات العملية لضمان إتقان جميع الطلبة للمهارات الحركية.", 
            '2': "تابع التقدم الفردي للطلبة وقدم تحديات مناسبة لمستوياتهم.", 
            '3': "شجع الطلبة على اتخاذ القرارات التكتيكية وتوزيع الأدوار القيادية.", 
            '4': "عزز قيم الروح الرياضية واللعب النظيف من خلال الممارسة العملية.", 
            '5': "افحص الملعب والأدوات دورياً وعلم الطلبة قواعد الأمن والسلامة.", 
            '6': "استمر في التخطيط المنهجي للدروس بما يضمن التدرج في المهارات.", 
            '7': "وظف استراتيجيات فعالة لإدارة المجموعات لزيادة وقت النشاط الفعلي.", 
            '8': "نوّع في استخدام استراتيجيات التدريس كالتعلم باللعب والتدريس بالأقران.", 
            '9': "استغل الموارد المتاحة بشكل إبداعي وكيف الأنشطة مع الإمكانيات.", 
            '10': "استخدم قوائم الملاحظة لتقديم تغذية راجعة فورية للطلبة.", 
            '11': "تأمل في ممارساتك وابحث عن أفكار جديدة لتطوير أساليبك.", 
            '12': "التزم دائماً باللوائح وكن نموذجاً في السلوك المهني.", 
            '13': "بادر بتنظيم فعاليات رياضية تشمل المجتمع المدرسي والمحلي." 
        };

        // =========================================================================
        // 2. SHARED UTILITIES
        // =========================================================================
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            if(!container) return;
            const toastMsg = document.getElementById('toast-message');
            const icon = document.getElementById('toast-icon');
            const text = document.getElementById('toast-text');
            
            container.classList.remove('opacity-0', 'translate-y-4');
            
            if (type === 'success') {
                toastMsg.className = 'bg-emerald-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 font-medium';
                icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            } else if (type === 'error') {
                toastMsg.className = 'bg-red-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 font-medium';
                icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
            } else {
                toastMsg.className = 'bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 font-medium';
                icon.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
            }
            
            text.textContent = message;
            setTimeout(() => { container.classList.add('opacity-0', 'translate-y-4'); }, 3000);
        }

        function copyText(text) {
            if (!text) { showToast('لا يوجد نص لنسخه', 'error'); return; }
            navigator.clipboard.writeText(text).then(() => showToast('تم نسخ النص')).catch(() => showToast('فشل النسخ', 'error'));
        }

        function showView(viewElement) {
            if(!viewElement) return;
            document.getElementById('welcomeView')?.classList.add('hidden');
            document.getElementById('supervisoryVisitsApp')?.classList.add('hidden');
            document.getElementById('schoolVisitsApp')?.classList.add('hidden');
            viewElement.classList.remove('hidden');
            window.scrollTo(0, 0);
        }

        window.addCustomEvidence = function(itemId) {
            showToast('ميزة إضافة شاهد مخصص قيد التطوير وسيتم توفيرها لاحقاً.', 'info');
        };
        window.deleteCustomEvidence = function(itemId, value) {
            showToast('ميزة حذف شاهد مخصص قيد التطوير وسيتم توفيرها لاحقاً.', 'info');
        };

        const getBase64Image = (url, targetHeight = 100) => {
            return new Promise((resolve) => {
                let isResolved = false;
                const img = new Image();
                img.crossOrigin = 'Anonymous'; 
                const timeoutId = setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        resolve(url);
                    }
                }, 5000);
                img.src = url;
                img.onload = () => {
                    if (isResolved) return;
                    clearTimeout(timeoutId);
                    const ratio = img.width / img.height;
                    const newHeight = targetHeight;
                    const newWidth = newHeight * ratio;
                    const canvas = document.createElement('canvas');
                    canvas.width = newWidth;
                    canvas.height = newHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, newWidth, newHeight);
                    try {
                        const dataURL = canvas.toDataURL(url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg', 0.9);
                        isResolved = true;
                        resolve(dataURL);
                    } catch (e) {
                        isResolved = true;
                        resolve(url);
                    }
                };
                img.onerror = () => {
                    if (isResolved) return;
                    clearTimeout(timeoutId);
                    isResolved = true;
                    resolve(url);
                };
            });
        };

        // =========================================================================
        // 3. UNIFIED HTML GENERATOR FOR PRINT & WORD
        // =========================================================================
        function getReportHTML(data, isWord = false) {
            const itemsTable1 = evaluationItems.filter(i => i.id <= 7);
            const itemsTable2 = evaluationItems.filter(i => i.id >= 8);

            const generateTableRows = (items, sideContent) => {
                let rowsHtml = '';
                const grouped = items.reduce((acc, item) => {
                    if (!acc[item.domain]) acc[item.domain] = {};
                    if (!acc[item.domain][item.standard]) acc[item.domain][item.standard] = [];
                    acc[item.domain][item.standard].push(item);
                    return acc;
                }, {});

                let isFirstItemOfTable = true;
                
                for (const domain in grouped) {
                    const standards = grouped[domain];
                    const domainItemCount = Object.values(standards).reduce((acc, curr) => acc + curr.length, 0);
                    let isFirstRowOfDomain = true;
                    
                    for (const standard in standards) {
                        const standardItems = standards[standard];
                        const standardItemCount = standardItems.length;
                        let isFirstRowOfStandard = true;
                        
                        standardItems.forEach((item) => {
                            const score = data.scores[`item-${item.id}`] || '';
                            
                            let domainCell = isFirstRowOfDomain ? `<td rowspan="${domainItemCount}" style="width:12%; border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; font-weight:bold; background-color:#f2f2f2;">${domain}</td>` : '';
                            let standardCell = isFirstRowOfStandard ? `<td rowspan="${standardItemCount}" style="width:12%; border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; background-color:#f2f2f2;">${standard}</td>` : '';
                            
                            let sideCell = '';
                            if (isFirstItemOfTable) {
                                sideCell = `<td rowspan="${items.length}" style="width:28%; border:1px solid #000; padding:4px; text-align:right; vertical-align:top;">${sideContent}</td>`;
                                isFirstItemOfTable = false;
                            }
                            
                            rowsHtml += `<tr>
                                ${domainCell}
                                ${standardCell}
                                <td style="width:4%; border:1px solid #000; padding:4px; text-align:center;">${item.id}</td>
                                <td style="width:38%; border:1px solid #000; padding:4px; text-align:right;">${item.title}</td>
                                <td style="width:6%; border:1px solid #000; padding:4px; text-align:center; font-weight:bold;">${score}</td>
                                ${sideCell}
                            </tr>`;
                            
                            isFirstRowOfDomain = false;
                            isFirstRowOfStandard = false;
                        });
                    }
                }
                return rowsHtml;
            };

            const rows1 = generateTableRows(itemsTable1, data.strengths);
            const rows2 = generateTableRows(itemsTable2, data.needs);

            const pageBreak = isWord ? '<br clear="all" style="page-break-before:always" />' : '';
            
            const imgMinistryTag = `<img src="${data.imgMinistry}" style="height: 60px; width: auto;" alt="شعار الوزارة">`;
            const imgQualityTag = `<img src="${data.imgQuality}" style="height: 60px; width: auto;" alt="شعار الجودة">`;
            const imgVisionTag = `<img src="${data.imgVision}" style="height: 60px; width: auto;" alt="رؤية عمان">`;

            return `
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000; direction: rtl; text-align: right; width: 100%;">
                    
                    <table style="width: 100%; border: none; margin-bottom: 10px;">
                        <tr>
                            <td style="width: 33%; text-align: right; border: none; vertical-align: middle;">${imgMinistryTag}</td>
                            <td style="width: 34%; text-align: center; border: none; vertical-align: middle;">${imgQualityTag}</td>
                            <td style="width: 33%; text-align: left; border: none; vertical-align: middle;">${imgVisionTag}</td>
                        </tr>
                    </table>

                    <div style="text-align: center; margin-bottom: 15px;">
                        <div style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">نموذج رئيسي رقم(5 )</div>
                        <div style="font-size: 16px; font-weight: bold; text-decoration: underline; margin-bottom: 3px;">استمارة زيارة إشرافية لمعلم مجال / مادة</div>
                        <div style="font-size: 12px;">(عملية إعداد وتنفيذ الخطة التشغيلية للإشراف الفنية)</div>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px;">
                        <tr>
                            <td style="width: 15%; border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">المدرسة:</td>
                            <td style="width: 35%; border: 1px solid #000; padding: 4px;">${data.school}</td>
                            <td style="width: 15%; border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">اسم المعلم:</td>
                            <td style="width: 35%; border: 1px solid #000; padding: 4px;">${data.teacher}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">رقم الملف:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.fileNo}</td>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">المادة/ المجال:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.subject}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">رقم الزيارة:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.visitNo}</td>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">التاريخ:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.date}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">الصف:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.className}</td>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">الحصة:</td>
                            <td style="border: 1px solid #000; padding: 4px;">${data.lesson}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 4px; background-color: #f2f2f2; font-weight: bold;">الموضوع:</td>
                            <td style="border: 1px solid #000; padding: 4px;" colspan="3">${data.topic}</td>
                        </tr>
                    </table>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; table-layout: fixed;">
                        <thead>
                            <tr>
                                <th style="width: 12%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">المجال</th>
                                <th style="width: 12%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">المعيار</th>
                                <th style="width: 4%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">م</th>
                                <th style="width: 38%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">البنود/المؤشرات</th>
                                <th style="width: 6%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">التقدير</th>
                                <th style="width: 28%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">جوانب الإجادة في الأداء وأدلتها*</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows1}
                        </tbody>
                    </table>
                    
                    ${pageBreak}

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; table-layout: fixed;">
                        <thead>
                            <tr>
                                <th style="width: 12%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">المجال</th>
                                <th style="width: 12%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">المعيار</th>
                                <th style="width: 4%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">م</th>
                                <th style="width: 38%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">البنود/المؤشرات</th>
                                <th style="width: 6%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">التقدير</th>
                                <th style="width: 28%; border: 1px solid #000; padding: 4px; background-color: #d9d9d9;">الجوانب التى تحتاج إلى تطوير في الأداء وأدلتها*</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows2}
                        </tbody>
                    </table>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
                        <tr>
                            <th style="border: 1px solid #000; padding: 5px; background-color: #d9d9d9; text-align: right;">الدعم المقدم / التوصيات*</th>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 10px; min-height: 80px; vertical-align: top;">${data.recs}</td>
                        </tr>
                    </table>

                    <table style="width: 100%; border: none; font-size: 12px; font-weight: bold; margin-bottom: 10px;">
                        <tr>
                            <td style="border: none; width: 50%;">اسم الزائر: ${data.visitorName}</td>
                            <td style="border: none; width: 50%; text-align: left;">الوظيفة: ${data.visitorPosition}</td>
                        </tr>
                    </table>

                    <div style="border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 10px; font-weight: bold;">
                        ● معيار التقييم: متميز (1) – جيد (2) - ملائم (3) – غير ملائم (4) – يحتاج إلى تدخل سريع (5)
                    </div>
                </div>
            `;
        }

        async function getReportData() {
            const imgMinistryUrl = "https://i.imgur.com/TeE90J3.png";
            const imgQualityUrl = "https://i.imgur.com/tbfi4V4.png";
            const imgVisionUrl = "https://i.imgur.com/AmHGqEM.jpeg";

            const [imgMinistry, imgQuality, imgVision] = await Promise.all([
                getBase64Image(imgMinistryUrl, 60),
                getBase64Image(imgQualityUrl, 60),
                getBase64Image(imgVisionUrl, 60)
            ]);

            const scores = {};
            evaluationItems.forEach(item => {
                scores[`item-${item.id}`] = document.querySelector(`#score-${item.id}`).textContent;
            });

            return {
                imgMinistry, imgQuality, imgVision,
                school: document.querySelector('#school').value || "",
                teacher: document.querySelector('#teacherName').value || "",
                subject: document.querySelector('#subject').value || "",
                date: document.querySelector('#visitDate').value || "",
                fileNo: document.querySelector('#fileNumber').value || "",
                visitNo: document.querySelector('#visitNumber').value || "",
                className: document.querySelector('#class').value || "",
                lesson: document.querySelector('#lesson').value || "",
                topic: document.querySelector('#topic').value || "",
                visitorName: document.querySelector('#visitorName').value || "",
                visitorPosition: document.querySelector('#visitorPosition').value || "",
                strengths: document.querySelector('#strengthsContent').value.replace(/\n/g, '<br>') || "",
                needs: document.querySelector('#developmentContent').value.replace(/\n/g, '<br>') || "",
                recs: document.querySelector('#recommendationsContent').value.replace(/\n/g, '<br>') || "",
                scores: scores
            };
        }

        // =========================================================================
        // 4. SUPERVISORY APP FUNCTIONS
        // =========================================================================
        function generateEvaluationForm() {
            const formContainer = document.querySelector('#evaluationForm');
            if(!formContainer) return;
            formContainer.innerHTML = '';
            let currentDomain = '';
            let sectionDiv;
            
            evaluationItems.forEach(item => {
                if (item.domain !== currentDomain) {
                    currentDomain = item.domain;
                    sectionDiv = document.createElement('div');
                    sectionDiv.className = 'bg-white rounded-2xl shadow-sm border border-slate-200 mb-6';
                    sectionDiv.innerHTML = `
                        <div class="bg-slate-100 p-4 border-b border-slate-200 rounded-t-2xl">
                            <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                <span class="w-2 h-6 bg-blue-600 rounded-full"></span>${currentDomain}
                            </h3>
                        </div>`;
                    formContainer.appendChild(sectionDiv);
                }
                
                const itemCard = document.createElement('div');
                itemCard.className = 'p-5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors item-card relative';
                itemCard.id = `item-${item.id}`;
                itemCard.innerHTML = `
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <div class="flex-grow">
                            <h4 class="font-bold text-slate-800 text-lg mb-1">${item.id}. ${item.title}</h4>
                            <p class="text-slate-500 text-sm">${item.desc}</p>
                        </div>
                        <div class="score w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xl text-slate-700 shadow-inner" id="score-${item.id}">3</div>
                    </div>
                    <div class="grid grid-cols-5 gap-2 mb-4 rating-selector">
                        <button type="button" class="rating-btn score-1 py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="1">متميز</button>
                        <button type="button" class="rating-btn score-2 py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="2">جيد</button>
                        <button type="button" class="rating-btn score-3 active py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="3">ملائم</button>
                        <button type="button" class="rating-btn score-4 py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="4">غير ملائم</button>
                        <button type="button" class="rating-btn score-5 py-2 px-1 rounded-lg border border-slate-200 bg-white text-xs md:text-sm font-medium transition-all" data-score="5">تدخل سريع</button>
                    </div>
                    <div class="relative">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-xs font-bold text-slate-500">الوصف الإشرافي والأدلة:</label>
                            <button type="button" class="edit-evidence-btn" id="edit-evidence-${item.id}" data-id="${item.id}">✏️ تعديل الأدلة (اختياري)</button>
                        </div>
                        <div id="notes-${item.id}" class="item-notes w-full min-h-[80px] p-3 pl-10 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" contenteditable="true"></div>
                        <div id="evidence-panel-${item.id}" class="evidence-panel hidden absolute z-50 bg-white border border-slate-200 shadow-xl rounded-lg p-4 w-full max-w-md mt-1 left-0">
                            <h5 class="font-bold text-sm mb-2 text-slate-700">اختر الشواهد المناسبة:</h5>
                            <div id="evidence-list-${item.id}" class="space-y-2 max-h-48 overflow-y-auto mb-3 p-1"></div>
                            <div class="border-t border-slate-100 pt-2 mb-2">
                                <div class="flex gap-2 items-center">
                                    <input type="text" class="new-evidence-input w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="إضافة دليل آخر..." data-id="${item.id}">
                                    <button type="button" class="add-evidence-btn bg-blue-100 text-blue-700 hover:bg-blue-200 p-1.5 rounded-md transition-colors" data-id="${item.id}" title="إضافة"><i class="fa-solid fa-plus text-sm"></i></button>
                                </div>
                            </div>
                            <div class="flex justify-end"><button type="button" class="close-evidence-panel text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded font-medium" data-id="${item.id}">إغلاق</button></div>
                        </div>
                        ${recognition ? `<button type="button" class="mic-btn absolute bottom-2 left-2 text-slate-400 hover:text-blue-600 transition-colors p-1 rounded-full"><i class="fa-solid fa-microphone"></i></button>` : ''}
                    </div>
                `;
                sectionDiv.appendChild(itemCard);
            });
            evaluationItems.forEach(item => updateScore(item.id, 3, true));
        }

        function generateDescriptionText(itemId, rating, customEvidences = null) {
            const content = evidenceBasedContent[itemId];
            if (!content) return "";
            
            const positiveEvidences = content.evidences || [];
            const negativeEvidences = content.neg_evidences || [];
            let text = "";
            let selectedEvidences = [];
            
            if (customEvidences) {
                selectedEvidences = customEvidences;
            } else {
                if (rating == 1) selectedEvidences = getRandomEvidences(positiveEvidences, 2);
                else if (rating == 2) selectedEvidences = getRandomEvidences(positiveEvidences, 1);
                else if (rating == 3) selectedEvidences = getRandomEvidences(positiveEvidences, 1);
                else if (rating == 4) selectedEvidences = getRandomEvidences(negativeEvidences, 1);
                else if (rating == 5) selectedEvidences = getRandomEvidences(negativeEvidences, 2);
            }
            
            const joinEvidences = (list) => { 
                if (list.length === 0) return ""; 
                if (list.length === 1) return list[0]; 
                return list.join("، و"); 
            };
            
            const joinedEvidencesText = joinEvidences(selectedEvidences);
            
            if (content.levels && content.levels[rating]) {
                if (joinedEvidencesText) {
                    text = `${content.levels[rating]}، ويتضح ذلك من خلال ${joinedEvidencesText}.`;
                } else {
                    text = `${content.levels[rating]}.`;
                }
            } else {
                text = `مستوى ${rating}، ويتضح ذلك من خلال ${joinedEvidencesText}.`;
            }
            
            return text;
        }

        function getRandomEvidences(arr, count) {
            if (!arr || arr.length === 0) return [];
            const shuffled = [...arr].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count);
        }

        function openEvidencePanel(itemId) {
            const panel = document.querySelector(`#evidence-panel-${itemId}`);
            const listContainer = document.querySelector(`#evidence-list-${itemId}`);
            const currentText = document.querySelector(`#notes-${itemId}`).textContent;
            const content = evidenceBasedContent[itemId];
            const rating = document.querySelector(`#score-${itemId}`).textContent;
            
            if (!content) return;
            
            document.querySelectorAll('.evidence-panel').forEach(p => p.classList.add('hidden'));
            
            const sourceList = (rating >= 4) ? (content.neg_evidences || []) : content.evidences;
            listContainer.innerHTML = '';
            
            if(sourceList.length === 0) {
                listContainer.innerHTML = '<p class="text-xs text-gray-400 p-2">لا توجد شواهد مقترحة لهذا التقدير.</p>';
            } else {
                sourceList.forEach((ev, index) => {
                    const isChecked = currentText.includes(ev);
                    const div = document.createElement('div');
                    div.className = 'evidence-item flex items-center gap-2 group hover:bg-slate-50 p-1 rounded';
                    div.innerHTML = `
                        <input type="checkbox" id="ev-${itemId}-${index}" class="evidence-checkbox w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" value="${ev}" ${isChecked ? 'checked' : ''} data-item-id="${itemId}">
                        <label for="ev-${itemId}-${index}" class="text-sm text-slate-700 leading-tight cursor-pointer select-none flex-grow">${ev}</label>
                        <button type="button" class="delete-evidence-btn text-slate-300 hover:text-red-500 transition-opacity p-1" data-item-id="${itemId}" data-value="${ev}" title="حذف"><i class="fa-solid fa-trash-can text-xs"></i></button>
                    `;
                    listContainer.appendChild(div);
                });
            }
            panel.classList.remove('hidden');
        }

        function updateDescriptionFromPanel(itemId) {
            const checkboxes = document.querySelectorAll(`#evidence-list-${itemId} .evidence-checkbox:checked`);
            const selectedEvidences = Array.from(checkboxes).map(cb => cb.value);
            const rating = document.querySelector(`#score-${itemId}`).textContent;
            const newText = generateDescriptionText(itemId, rating, selectedEvidences);
            document.querySelector(`#notes-${itemId}`).textContent = newText;
        }

        function updateScore(itemId, score, forceUpdate = false) {
            const mainScoreDisplay = document.querySelector(`#score-${itemId}`);
            mainScoreDisplay.textContent = score;
            updateScoreColor(mainScoreDisplay, score);
            
            const ratingContainer = document.querySelector(`#item-${itemId} .rating-selector`);
            ratingContainer.querySelectorAll('.rating-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.score == score);
            });
            
            document.querySelector(`#edit-evidence-${itemId}`).classList.remove('hidden');
            
            const notesDiv = document.querySelector(`#notes-${itemId}`);
            if (forceUpdate || notesDiv.textContent.trim() === '') {
                notesDiv.textContent = generateDescriptionText(itemId, score);
            }
        }
        
        function updateScoreColor(element, score) {
            element.className = 'score w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shadow-inner transition-colors';
            if (score == 1) element.classList.add('bg-green-100', 'text-green-800'); 
            else if (score == 2) element.classList.add('bg-blue-100', 'text-blue-800'); 
            else if (score == 3) element.classList.add('bg-amber-100', 'text-amber-800'); 
            else if (score == 4) element.classList.add('bg-red-50', 'text-red-800'); 
            else if (score == 5) element.classList.add('bg-red-600', 'text-white');
        }

        function toggleSupervisoryView(viewId) {
            document.querySelectorAll('#form-view, #dashboard-view, #saved-reports-view').forEach(view => {
                view.classList.add('hidden');
            });
            
            document.querySelector(`#${viewId}`)?.classList.remove('hidden');
            
            document.querySelectorAll('.nav-tab').forEach(tab => {
                tab.classList.remove('active', 'bg-white', 'shadow-sm', 'text-blue-700');
                tab.classList.add('text-slate-500');
                if(tab.dataset.view === viewId) {
                    tab.classList.add('active', 'bg-white', 'shadow-sm', 'text-blue-700');
                    tab.classList.remove('text-slate-500');
                }
            });
            
            if (viewId === 'saved-reports-view') {
                renderSavedReports();
            } else if (viewId === 'dashboard-view') { 
                populateTeacherDashboardDropdown(); 
                updateDashboardView(); 
            }
        }

        function getSupervisorySchoolName() { 
            return document.querySelector('#school').value.trim(); 
        }
        
        function getSupervisoryTeacherName() { 
            return document.querySelector('#teacherName').value.trim(); 
        }

        async function prepareOfficialPrint() {
            const data = await getReportData();
            const html = getReportHTML(data, false);
            const printView = document.getElementById('printView');
            printView.innerHTML = html;
            
            setTimeout(() => {
                window.print();
            }, 500);
        }
        
        async function exportToWord() { 
            showToast('جاري تجهيز الصور للتقرير... (يرجى الانتظار)', 'info');
            const data = await getReportData();
            const wordHTML = `
                <!DOCTYPE html>
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40' lang="ar" dir="rtl">
                <head><meta charset="utf-8"><title>Export</title></head>
                <body>
                    ${getReportHTML(data, true)}
                </body>
                </html>
            `;
            
            const fileName = `${data.visitNo || 'زيارة'} - ${data.school} - ${data.teacher}.docx`;
            const converted = htmlDocx.asBlob(wordHTML, { orientation: 'portrait', margins: { top: 720, bottom: 720, left: 720, right: 720 } });
            const finalBlob = new Blob([converted], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            
            const url = window.URL.createObjectURL(finalBlob);
            const link = document.createElement('a'); 
            link.href = url; 
            link.download = fileName; 
            link.target = '_blank';
            document.body.appendChild(link); 
            
            const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
            link.dispatchEvent(clickEvent);
            
            document.body.removeChild(link); 
            setTimeout(() => window.URL.revokeObjectURL(url), 1000); 
            showToast('تم تصدير ملف Word');
        }

        function generateReport() {
            let itemsByScore = { 1: [], 2: [], 3: [], 4: [], 5: [] }; 
            
            evaluationItems.forEach(item => { 
                const score = parseInt(document.querySelector(`#score-${item.id}`).textContent); 
                itemsByScore[score].push({ id: item.id, title: item.title, standard: item.standard, notes: document.querySelector(`#notes-${item.id}`).textContent }); 
            });
            
            const strengths = [...itemsByScore[1], ...itemsByScore[2]].slice(0, 4); 
            const developments = [...itemsByScore[5], ...itemsByScore[4]].slice(0, 4);
            let recommendationsList = [...developments]; 
            const extraRecs = itemsByScore[3].sort(() => 0.5 - Math.random()).slice(0, 2); 
            
            extraRecs.forEach(rec => { 
                if (!recommendationsList.find(item => item.id === rec.id)) {
                    recommendationsList.push(rec); 
                }
            });
            
            document.querySelector('#strengthsContent').value = strengths.map(s => `• ${s.standard}: ${s.notes}`).join('\n'); 
            document.querySelector('#developmentContent').value = developments.map(d => `• ${d.standard}: ${d.notes}`).join('\n'); 
            
            let recommendationsText = "نوصي المعلم بالآتي:\n"; 
            recommendationsList.forEach(rec => { 
                if (instructionalRecommendations[rec.id]) {
                    recommendationsText += `• ${rec.standard}: ${instructionalRecommendations[rec.id]}\n`; 
                }
            }); 
            
            document.querySelector('#recommendationsContent').value = recommendationsText + "\nوالله ولي التوفيق.";
            document.querySelector('#reportSection').classList.remove('hidden'); 
            document.querySelector('#reportSection').scrollIntoView({ behavior: 'smooth' }); 
            showToast('تم توليد التقرير بنجاح');
        }

        function startSupervisoryDictation(divId, button) {
            if (!recognition) { 
                showToast('المتصفح لا يدعم الإملاء الصوتي', 'error'); 
                return; 
            }
            button.classList.add('recording'); 
            recognition.start();
            
            recognition.onresult = (event) => { 
                const target = document.querySelector(`#${divId}`);
                target.textContent += (target.textContent.length > 0 ? ' ' : '') + event.results[0][0].transcript; 
            };
            recognition.onspeechend = () => recognition.stop(); 
            recognition.onend = () => { button.classList.remove('recording'); };
        }

        function showConfirmationModal(title, message, onConfirm) {
            document.querySelector('#supervisory-modal-title').textContent = title; 
            document.querySelector('#supervisory-modal-message').textContent = message;
            
            const modal = document.querySelector('#supervisoryConfirmationModal'); 
            modal.classList.remove('hidden');
            
            const confirmBtn = document.querySelector('#supervisory-modal-confirm-btn'); 
            const cancelBtn = document.querySelector('#supervisory-modal-cancel-btn');
            
            const newConfirm = confirmBtn.cloneNode(true); 
            const newCancel = cancelBtn.cloneNode(true); 
            
            confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn); 
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            
            newConfirm.addEventListener('click', () => { 
                onConfirm(); 
                modal.classList.add('hidden'); 
            }); 
            
            newCancel.addEventListener('click', () => { 
                modal.classList.add('hidden'); 
            });
        }

        function performReset() {
            document.querySelector('#evaluationForm').reset(); 
            document.querySelectorAll('input:not([type="button"]), textarea').forEach(input => input.value = ''); 
            document.querySelector('#visitDate').value = new Date().toISOString().split('T')[0];
            
            evaluationItems.forEach(item => { 
                updateScore(item.id, 3, true); 
                document.querySelector(`#notes-${item.id}`).textContent = generateDescriptionText(item.id, 3); 
            });
            
            document.querySelector('#reportSection').classList.add('hidden'); 
            showToast('تم إعادة تعيين النموذج');
        }

        function savePermanentReport() {
            const teacherName = document.querySelector('#teacherName').value.trim(); 
            const visitDate = document.querySelector('#visitDate').value; 
            
            if (!teacherName || !visitDate) { 
                showToast('يرجى إدخال اسم المعلم والتاريخ', 'error'); 
                return; 
            }
            
            const reportId = `supervision_v6_visit_${Date.now()}`; 
            const reportData = { 
                id: reportId, 
                teacherName, 
                visitDate, 
                school: document.querySelector('#school').value.trim(), 
                formData: {} 
            };
            
            document.querySelectorAll('#form-view input, #form-view select, #form-view textarea').forEach(el => { 
                if (el.id) reportData.formData[el.id] = el.value; 
            });
            
            evaluationItems.forEach(item => { 
                reportData.formData[`score-${item.id}`] = document.querySelector(`#score-${item.id}`).textContent; 
                reportData.formData[`notes-${item.id}`] = document.querySelector(`#notes-${item.id}`).textContent; 
            });
            
            localStorage.setItem(reportId, JSON.stringify(reportData));
            
            const visitDataForDashboard = { date: visitDate, scores: {} }; 
            
            evaluationItems.forEach(item => {
                visitDataForDashboard.scores[`item-${item.id}`] = parseInt(document.querySelector(`#score-${item.id}`).textContent) || 3;
            });
            
            const teacherArchiveKey = `supervision_v6_teacher_archive_${teacherName}`; 
            let archive = [];
            try {
                archive = JSON.parse(localStorage.getItem(teacherArchiveKey)) || [];
                if(!Array.isArray(archive)) archive = [];
            } catch(e) { archive = []; }
            
            const existingVisitIndex = archive.findIndex(v => v.date === visitDate); 
            if (existingVisitIndex > -1) {
                archive[existingVisitIndex] = visitDataForDashboard; 
            } else {
                archive.push(visitDataForDashboard); 
            }
            
            archive.sort((a, b) => new Date(a.date) - new Date(b.date)); 
            localStorage.setItem(teacherArchiveKey, JSON.stringify(archive)); 
            
            showToast('تم حفظ التقرير بنجاح');
            renderSavedReports();
        }

        function loadPermanentReport(reportKey) {
            try {
                const data = JSON.parse(localStorage.getItem(reportKey));
                if (data && data.formData) { 
                    performReset(); 
                    Object.keys(data.formData).forEach(key => { 
                        const el = document.querySelector(`#${key}`); 
                        if (el) { 
                            if (el.classList.contains('item-notes')) el.textContent = data.formData[key]; 
                            else if (el.classList.contains('score')) el.textContent = data.formData[key]; 
                            else el.value = data.formData[key]; 
                        } 
                    }); 
                    if(data.formData['school']) document.querySelector('#school').value = data.formData['school']; 
                    if(data.formData['teacherName']) document.querySelector('#teacherName').value = data.formData['teacherName']; 
                    evaluationItems.forEach(item => updateScore(item.id, parseInt(data.formData[`score-${item.id}`] || 3))); 
                    toggleSupervisoryView('form-view'); 
                    showToast('تم تحميل التقرير'); 
                }
            } catch (e) {
                showToast('خطأ في استرجاع التقرير', 'error');
            }
        }

        async function printArchivedReport(reportKey) {
            try {
                const stored = JSON.parse(localStorage.getItem(reportKey));
                if (!stored || !stored.formData) {
                    showToast('لا توجد بيانات لهذا التقرير', 'error');
                    return;
                }
                const fd = stored.formData;
                showToast('جاري تجهيز الطباعة...', 'info');

                const imgMinistryUrl = "https://i.imgur.com/TeE90J3.png";
                const imgQualityUrl = "https://i.imgur.com/tbfi4V4.png";
                const imgVisionUrl = "https://i.imgur.com/AmHGqEM.jpeg";
                const [imgMinistry, imgQuality, imgVision] = await Promise.all([
                    getBase64Image(imgMinistryUrl, 60),
                    getBase64Image(imgQualityUrl, 60),
                    getBase64Image(imgVisionUrl, 60)
                ]);

                const scores = {};
                evaluationItems.forEach(item => {
                    scores[`item-${item.id}`] = fd[`score-${item.id}`] || '3';
                });

                const data = {
                    imgMinistry, imgQuality, imgVision,
                    school: fd.school || '',
                    teacher: fd.teacherName || '',
                    subject: fd.subject || '',
                    date: fd.visitDate || '',
                    fileNo: fd.fileNumber || '',
                    visitNo: fd.visitNumber || '',
                    className: fd.class || '',
                    lesson: fd.lesson || '',
                    topic: fd.topic || '',
                    visitorName: fd.visitorName || '',
                    visitorPosition: fd.visitorPosition || '',
                    strengths: (fd.strengthsContent || '').replace(/\n/g, '<br>'),
                    needs: (fd.developmentContent || '').replace(/\n/g, '<br>'),
                    recs: (fd.recommendationsContent || '').replace(/\n/g, '<br>'),
                    scores
                };

                const printView = document.getElementById('printView');
                printView.innerHTML = getReportHTML(data, false);
                setTimeout(() => window.print(), 500);
            } catch (e) {
                showToast('خطأ في تجهيز الطباعة', 'error');
            }
        }

        function renderSavedReports() {
            const listContainer = document.querySelector('#saved-reports-list'); 
            const noReportsMessage = document.querySelector('#no-saved-reports-message'); 
            const filterInput = document.querySelector('#filter-reports-input');
            const filterText = filterInput ? filterInput.value.toLowerCase() : ''; 
            
            if(!listContainer) return;
            
            listContainer.innerHTML = '';
            let reports = []; 
            
            for (let i = 0; i < localStorage.length; i++) { 
                const key = localStorage.key(i);
                if (key.startsWith('supervision_v6_visit_') || key.startsWith('visit_v5_')) {
                    try {
                        const parsedData = JSON.parse(localStorage.getItem(key));
                        if(parsedData && typeof parsedData === 'object') {
                            reports.push({ key: key, data: parsedData }); 
                        }
                    } catch(e) {
                        console.warn('Skipping unparsable report key:', key);
                    }
                }
            } 
            
            reports.sort((a, b) => {
                const dateA = a.data?.visitDate ? new Date(a.data.visitDate).getTime() : 0;
                const dateB = b.data?.visitDate ? new Date(b.data.visitDate).getTime() : 0;
                return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
            });
            let found = false; 
            
            reports.forEach(({ key, data }) => { 
                if(!data) return;
                const schoolName = data.school || '-'; 
                const tName = data.teacherName || '';
                if (tName.toLowerCase().includes(filterText) || schoolName.toLowerCase().includes(filterText)) { 
                    found = true; 
                    const card = document.createElement('div'); 
                    card.className = 'bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between'; 
                    card.innerHTML = `
                        <div class="mb-4">
                            <h4 class="font-bold text-slate-800 text-lg">${tName || 'غير معروف'}</h4>
                            <div class="text-sm text-slate-500 mt-1 flex flex-col gap-1">
                                <span><i class="fa-solid fa-school ml-1 text-slate-400"></i> ${schoolName}</span>
                                <span><i class="fa-regular fa-calendar ml-1 text-slate-400"></i> ${data.visitDate || '-'}</span>
                            </div>
                        </div>
                        <div class="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                            <button class="load-btn flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 py-2 rounded-lg text-sm font-bold transition-colors" data-key="${key}">عرض</button>
                            <button class="print-archive-btn flex-1 bg-green-50 text-green-600 hover:bg-green-100 py-2 rounded-lg text-sm font-bold transition-colors" data-key="${key}"><i class="fa-solid fa-print ml-1"></i>طباعة</button>
                            <button class="delete-btn flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-2 rounded-lg text-sm font-bold transition-colors" data-key="${key}">حذف</button>
                        </div>
                    `; 
                    listContainer.appendChild(card); 
                } 
            }); 
            
            if(noReportsMessage) {
                if(found) noReportsMessage.classList.add('hidden'); 
                else noReportsMessage.classList.remove('hidden');
            }
        }

        function deletePermanentReport(key) { 
            showConfirmationModal('تأكيد الحذف', 'سيتم حذف التقرير نهائياً', () => { 
                try {
                    const data = JSON.parse(localStorage.getItem(key)); 
                    localStorage.removeItem(key); 
                    if(data && data.teacherName) { 
                        const teacherArchiveKey = `supervision_v6_teacher_archive_${data.teacherName}`; 
                        const oldArchiveKey = `teacher_archive_v5_${data.teacherName}`; 
                        
                        let archive = [];
                        try { archive = JSON.parse(localStorage.getItem(teacherArchiveKey)) || JSON.parse(localStorage.getItem(oldArchiveKey)) || []; } catch(e){}
                        
                        if(Array.isArray(archive)) {
                            archive = archive.filter(visit => visit.date !== data.visitDate); 
                            if (archive.length > 0) {
                                localStorage.setItem(teacherArchiveKey, JSON.stringify(archive)); 
                            } else {
                                localStorage.removeItem(teacherArchiveKey); 
                                localStorage.removeItem(oldArchiveKey); 
                            }
                        }
                    } 
                    renderSavedReports(); 
                    showToast('تم الحذف بنجاح'); 
                } catch(e) {
                    localStorage.removeItem(key);
                    renderSavedReports();
                }
            }); 
        }

        function populateTeacherDashboardDropdown() { 
            const teacherSelect = document.querySelector('#teacher-dashboard-select'); 
            if(!teacherSelect) return;
            
            const teacherNames = new Set(); 
            
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k.startsWith('supervision_v6_teacher_archive_')) {
                    teacherNames.add(k.replace('supervision_v6_teacher_archive_', '')); 
                } else if (k.startsWith('teacher_archive_v5_')) {
                    teacherNames.add(k.replace('teacher_archive_v5_', '')); 
                }
            }
            
            teacherSelect.innerHTML = '<option value="">اختر معلمًا...</option>'; 
            teacherNames.forEach(name => teacherSelect.innerHTML += `<option value="${name}">${name}</option>`); 
        }

        function updateDashboardView() { 
            if (performanceChartInstance) performanceChartInstance.destroy(); 
            
            const teacherSelect = document.querySelector('#teacher-dashboard-select');
            if(!teacherSelect) return;
            
            const teacherName = teacherSelect.value; 
            const chartContainer = document.querySelector('#chart-container'); 
            const noDataMessage = document.querySelector('#no-data-message'); 
            const chartType = document.querySelector('#chartTypeSelect').value; 
            const dateGroup = document.querySelector('#visitDateGroup'); 
            
            dateGroup.classList.toggle('hidden', chartType !== 'radar'); 
            
            if (!teacherName) { 
                chartContainer.classList.add('hidden'); 
                noDataMessage.classList.remove('hidden'); 
                return; 
            } 
            
            let archive = [];
            try {
                archive = JSON.parse(localStorage.getItem(`supervision_v6_teacher_archive_${teacherName}`)) || 
                          JSON.parse(localStorage.getItem(`teacher_archive_v5_${teacherName}`)) || []; 
                if(!Array.isArray(archive)) archive = [];
            } catch(e) { archive = []; }
            
            if (archive.length === 0) { 
                chartContainer.classList.add('hidden'); 
                noDataMessage.classList.remove('hidden'); 
                return; 
            } 
            
            chartContainer.classList.remove('hidden'); 
            noDataMessage.classList.add('hidden'); 
            
            const visitDateSelect = document.querySelector('#visitDateSelect'); 
            
            if(chartType === 'radar') { 
                if(visitDateSelect.children.length === 0 || visitDateSelect.children.length !== archive.length) { 
                    visitDateSelect.innerHTML = ''; 
                    archive.forEach(visit => {
                        if(visit && visit.date) visitDateSelect.innerHTML += `<option value="${visit.date}">${visit.date}</option>`;
                    }); 
                    if(archive[archive.length - 1]?.date) {
                        visitDateSelect.value = archive[archive.length - 1].date; 
                    }
                } 
            } 
            
            const ctx = document.querySelector('#performanceChart').getContext('2d'); 
            const labels = evaluationItems.map(item => `${item.id}. ${item.standard}`); 
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']; 
            
            let chartConfig = { 
                type: chartType, 
                data: { labels: (chartType === 'line' ? archive.map(v=>v.date||'') : labels), datasets: [] }, 
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { legend: { position: 'bottom' } }, 
                    scales: { 
                        r: { min: 0, max: 5, ticks: { stepSize: 1 } }, 
                        y: { min: 0, max: 5 } 
                    } 
                } 
            }; 
            
            if (chartType === 'line') { 
                chartConfig.data.datasets = evaluationItems.map((item, i) => ({ 
                    label: item.title.substring(0, 20) + '...', 
                    data: archive.map(v => v.scores && v.scores[`item-${item.id}`] ? v.scores[`item-${item.id}`] : 0), 
                    borderColor: colors[i % colors.length], 
                    tension: 0.2 
                })); 
            } else if (chartType === 'radar') { 
                const visitData = archive.find(v => v.date === visitDateSelect.value); 
                const data = visitData && visitData.scores ? evaluationItems.map(item => visitData.scores[`item-${item.id}`] || 0) : []; 
                chartConfig.data.datasets = [{ 
                    label: `أداء ${visitDateSelect.value}`, 
                    data: data, 
                    backgroundColor: 'rgba(59, 130, 246, 0.2)', 
                    borderColor: '#3b82f6', 
                    pointBackgroundColor: '#fff' 
                }]; 
            } else { 
                const avgScores = evaluationItems.map(item => { 
                    const s = archive.map(v => v.scores && v.scores[`item-${item.id}`] ? v.scores[`item-${item.id}`] : 0); 
                    return s.length > 0 ? (s.reduce((a,b)=>a+b,0)/s.length) : 0; 
                }); 
                chartConfig.data.datasets = [{ 
                    label: 'المتوسط العام', 
                    data: avgScores, 
                    backgroundColor: '#3b82f6' 
                }]; 
            } 
            
            performanceChartInstance = new Chart(ctx, chartConfig); 
        }

        // =========================================================================
        // 5. SCHOOL APP FUNCTIONS
        // =========================================================================
        function loadSchoolVisitTypes() {
            // استخدام مفتاح جديد تماماً لتجنب تعارض الـ Local Storage في Github Pages
            const newKey = 'supervision_v6_school_visit_types';
            const oldKey = 'school_visit_types';
            
            let storedTypes = localStorage.getItem(newKey) || localStorage.getItem(oldKey);
            
            if (storedTypes) { 
                try {
                    const parsed = JSON.parse(storedTypes); 
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        schoolVisitTypesData = parsed; 
                        // تنظيف وحماية البيانات القادمة من التخزين
                        Object.keys(schoolVisitTypesData).forEach(k => {
                            if (!schoolVisitTypesData[k] || typeof schoolVisitTypesData[k] !== 'object') {
                                schoolVisitTypesData[k] = { name: 'نوع غير محدد', objectives: [] };
                            }
                            if (!Array.isArray(schoolVisitTypesData[k].objectives)) {
                                schoolVisitTypesData[k].objectives = [];
                            }
                        });
                    } else {
                        schoolVisitTypesData = JSON.parse(JSON.stringify(defaultSchoolVisitTypesData));
                    }
                } catch(e) {
                    console.warn('تمت استعادة الإعدادات الافتراضية بسبب تلف في البيانات المخزنة.');
                    schoolVisitTypesData = JSON.parse(JSON.stringify(defaultSchoolVisitTypesData));
                }
            } else {
                schoolVisitTypesData = JSON.parse(JSON.stringify(defaultSchoolVisitTypesData));
                localStorage.setItem(newKey, JSON.stringify(schoolVisitTypesData));
            }
            // حذف الأنواع القديمة غير المرغوب فيها
            const removedKeys = ['private_exploratory', 'exploratory', 'technical', 'admin'];
            removedKeys.forEach(k => { delete schoolVisitTypesData[k]; });
            // تحديث الأنواع الافتراضية دائماً بأحدث نسخة من الكود
            Object.keys(defaultSchoolVisitTypesData).forEach(k => {
                schoolVisitTypesData[k] = JSON.parse(JSON.stringify(defaultSchoolVisitTypesData[k]));
            });
            localStorage.setItem(newKey, JSON.stringify(schoolVisitTypesData));
            populateSchoolVisitTypeDropdown();
            renderSchoolVisitTypesList();
        }

        function populateSchoolVisitTypeDropdown() {
            const visitTypeSelect = document.getElementById('visitTypeSelect');
            if(!visitTypeSelect) return;
            
            visitTypeSelect.innerHTML = '<option value="" disabled selected>اختر نوع الزيارة</option>';
            if(!schoolVisitTypesData || typeof schoolVisitTypesData !== 'object') return;
            
            Object.keys(schoolVisitTypesData).forEach(key => {
                if(!schoolVisitTypesData[key]) return;
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = schoolVisitTypesData[key].name || 'نوع مخصص';
                visitTypeSelect.appendChild(opt);
            });
        }

        // تطبيق فلتر التذكير/التأنيث والإفراد/الجمع على نص القالب
        // الوضع: 0=ذكر_جمع، 1=ذكر_مفرد، 2=أنثى_جمع، 3=أنثى_مفرد
        function applyGenderFilter(text, mode) {
            return text.replace(/\[([^\]]+)\]/g, (match, options) => {
                const parts = options.split('/');
                return parts[mode] !== undefined ? parts[mode] : parts[0];
            });
        }

        function getGenderMode() {
            return parseInt(document.querySelector('input[name="genderMode"]:checked')?.value || '0');
        }

        function renderSchoolObjectives(typeKey) {
            const objectivesContainer = document.getElementById('objectivesContainer');
            if(!objectivesContainer) return;

            const genderSelector = document.getElementById('genderNumberSelector');

            // حفظ الملاحظات والحالة قبل إعادة الرسم
            objectivesContainer.querySelectorAll('.objective-item').forEach((item, i) => {
                const noteInput = item.querySelector('.objective-note');
                if (noteInput && noteInput.value.trim()) objectiveNotes[i] = noteInput.value.trim();
                else delete objectiveNotes[i];
            });

            objectivesContainer.innerHTML = '';
            if(!schoolVisitTypesData) return;

            const typeData = schoolVisitTypesData[typeKey];
            if (typeData && Array.isArray(typeData.objectives)) {
                if (genderSelector) genderSelector.classList.remove('hidden');
                const mode = getGenderMode();
                typeData.objectives.forEach((obj, index) => {
                    if(!obj) return;
                    const resolved = applyGenderFilter(obj, mode);
                    const safeVal = resolved.replace(/"/g, '&quot;');
                    const savedNote = objectiveNotes[index] || '';
                    const hasNote = !!savedNote;

                    const div = document.createElement('div');
                    div.className = 'objective-item rounded-lg border ' + (hasNote ? 'border-amber-200 bg-amber-50' : 'border-transparent hover:bg-slate-50');
                    div.innerHTML = `
                        <div class="flex items-start gap-2 p-2">
                            <input type="checkbox" name="objectives" value="${safeVal}" id="obj-${index}" class="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500">
                            <label for="obj-${index}" class="flex-1 text-sm font-medium text-gray-900 cursor-pointer select-none whitespace-pre-line">${resolved}</label>
                            <button type="button" class="note-toggle flex-shrink-0 text-xs px-2 py-1 rounded-full border transition-all ${hasNote ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300'}" data-index="${index}" title="إضافة ملاحظة">
                                <i class="fa-solid fa-flag"></i>
                            </button>
                        </div>
                        <div class="note-area ${hasNote ? '' : 'hidden'} px-3 pb-2">
                            <input type="text" class="objective-note w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400" placeholder="اكتب الملاحظة ← ستتحول تلقائياً إلى توصية..." value="${savedNote.replace(/"/g, '&quot;')}">
                        </div>
                    `;
                    objectivesContainer.appendChild(div);
                });

                // ربط أزرار الملاحظة
                objectivesContainer.querySelectorAll('.note-toggle').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const item = btn.closest('.objective-item');
                        const noteArea = item.querySelector('.note-area');
                        const noteInput = item.querySelector('.objective-note');
                        const isHidden = noteArea.classList.toggle('hidden');
                        if (!isHidden) {
                            btn.className = btn.className.replace('bg-slate-100 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300', 'bg-amber-100 text-amber-700 border-amber-300');
                            item.className = 'objective-item rounded-lg border border-amber-200 bg-amber-50';
                            noteInput.focus();
                        } else {
                            noteInput.value = '';
                            delete objectiveNotes[btn.dataset.index];
                            btn.className = btn.className.replace('bg-amber-100 text-amber-700 border-amber-300', 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300');
                            item.className = 'objective-item rounded-lg border border-transparent hover:bg-slate-50';
                        }
                    });
                });
            } else {
                if (genderSelector) genderSelector.classList.add('hidden');
            }
        }

        // الجمل الإيجابية الافتراضية لكل نوع هدف
        function getPositiveAddition(text) {
            if (text.includes("الطابور")) return "، وكان الهتاف بصوت عالٍ والانصراف منظماً ومراسم رفع العلم صحيحة.";
            if (text.includes("خطة المنهاج") || text.includes("سجلات المتابعة")) return "، ويسير التنفيذ وفق الخطة الزمنية المقررة.";
            if (text.includes("قاعدة بيانات")) return " وتحديثها بصورة منتظمة.";
            if (text.includes("الملاعب") || text.includes("الأدوات الرياضية")) return "، وكانت الملاعب مهيأة والأدوات في حالة جيدة.";
            if (text.includes("الأدلة") || text.includes("كتاب الطالب")) return "، وتبين أن الطبعات حديثة ومتوفرة.";
            if (text.includes("النشرات") || text.includes("الوثائق")) return " وإبداء الملاحظات اللازمة.";
            if (text.includes("منافسات") || text.includes("ألعاب جماعية")) return " وتحقيق الأهداف المرجوة.";
            if (text.includes("التحضير") || text.includes("نور")) return "، وكانت الخطط مستوفية للمعايير المطلوبة.";
            if (text.includes("الالتقاء") || text.includes("مقابلة")) return "، وكانت الأجواء إيجابية وتعاونية.";
            if (text.includes("الطابور") || text.includes("موقف صفي")) return "، وتمت المداولة الإشرافية.";
            return ".";
        }

        function renderSchoolClassroomVisits() {
            const classroomVisitsList = document.getElementById('classroomVisitsList');
            if(!classroomVisitsList) return;
            
            classroomVisitsList.innerHTML = '';
            if (!Array.isArray(schoolClassroomVisits) || schoolClassroomVisits.length === 0) {
                classroomVisitsList.innerHTML = '<p class="text-xs text-slate-400 italic p-2">لم تتم إضافة أي مواقف صفية بعد.</p>';
                return;
            }
            schoolClassroomVisits.forEach((visit, index) => {
                if(!visit) return;
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center bg-indigo-50 p-2 rounded-lg text-sm';
                div.innerHTML = `
                    <div class="flex-grow">
                        <span class="font-bold text-indigo-700">${visit.teacher || '-'}</span> 
                        <span class="text-slate-500 mx-1">|</span> 
                        <span class="text-slate-600">الصف ${visit.grade || '-'}</span>
                        <span class="text-slate-500 mx-1">|</span>
                        <span class="text-slate-600">الحصة ${visit.period || '-'}</span>
                        <span class="text-slate-500 mx-1">|</span>
                        <span class="text-slate-600">${visit.subject || '-'}</span>
                        <span class="text-slate-500 mx-1">|</span>
                        <span class="font-semibold text-slate-700">${visit.rating || '-'}</span>
                    </div>
                    <button type="button" class="text-red-500 hover:text-red-700 delete-visit-btn p-1" data-index="${index}">
                        <i class="fa-solid fa-times"></i>
                    </button>
                `;
                classroomVisitsList.appendChild(div);
            });
            
            document.querySelectorAll('#classroomVisitsList .delete-visit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = e.currentTarget.dataset.index;
                    if(schoolClassroomVisits && schoolClassroomVisits.length > idx) {
                        schoolClassroomVisits.splice(idx, 1);
                        renderSchoolClassroomVisits();
                    }
                });
            });
        }

        function addSchoolClassroomVisit() {
            const teacher = document.getElementById('cvTeacher')?.value.trim();
            const grade = document.getElementById('cvGrade')?.value.trim();
            const period = document.getElementById('cvPeriod')?.value.trim();
            const subject = document.getElementById('cvSubject')?.value.trim();
            const rating = document.getElementById('cvRating')?.value;
            
            if (!teacher || !grade || !subject || !period) {
                showToast('يرجى تعبئة جميع بيانات الموقف الصفي', 'error');
                return;
            }
            
            if(!Array.isArray(schoolClassroomVisits)) schoolClassroomVisits = [];
            schoolClassroomVisits.push({ teacher, grade, period, subject, rating });
            renderSchoolClassroomVisits();
            
            if(document.getElementById('cvTeacher')) document.getElementById('cvTeacher').value = '';
            if(document.getElementById('cvGrade')) document.getElementById('cvGrade').value = '';
            if(document.getElementById('cvPeriod')) document.getElementById('cvPeriod').value = '';
            if(document.getElementById('cvSubject')) document.getElementById('cvSubject').value = '';
            
            showToast('تمت إضافة الموقف الصفي');
        }

        function renderSchoolReportsList() {
            const reportsListContainer = document.querySelector('#schoolDashboardView #reportsListContainer');
            if(!reportsListContainer) return;
            
            reportsListContainer.innerHTML = '';
            const reports = [];
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('supervision_v6_school_report_') || key.startsWith('school_report_')) {
                    try {
                        const parsedItem = JSON.parse(localStorage.getItem(key));
                        if(parsedItem && typeof parsedItem === 'object') {
                            reports.push({ key, ...parsedItem });
                        }
                    } catch(e) {
                        console.warn('Skipping invalid school report data structure for key:', key);
                    }
                }
            }
            
            reports.sort((a, b) => {
                const dateA = a.visitDate ? new Date(a.visitDate).getTime() : 0;
                const dateB = b.visitDate ? new Date(b.visitDate).getTime() : 0;
                return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
            });
            
            if (reports.length === 0) {
                reportsListContainer.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400"><i class="fa-solid fa-folder-open text-4xl mb-2"></i><p>لا توجد تقارير محفوظة.</p></div>';
                return;
            }
            
            reports.forEach(report => {
                const typeName = (schoolVisitTypesData && schoolVisitTypesData[report.visitType]) ? schoolVisitTypesData[report.visitType].name : 'غير محدد';
                const card = document.createElement('div');
                card.className = 'bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col';
                const objLen = Array.isArray(report.objectives) ? report.objectives.length : 0;
                
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-3">
                        <h3 class="font-bold text-lg text-slate-800">${report.schoolName || 'بدون اسم'}</h3>
                        <span class="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200">${typeName}</span>
                    </div>
                    <div class="text-sm text-slate-500 mb-4 space-y-1">
                        <div class="flex items-center"><i class="fa-regular fa-calendar ml-2 w-4"></i> ${report.visitDate || '-'}</div>
                        <div class="flex items-center"><i class="fa-solid fa-check-double ml-2 w-4"></i> ${objLen} أهداف محققة</div>
                    </div>
                    <div class="mt-auto flex gap-2 pt-3 border-t border-slate-100">
                        <button class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-sm font-medium transition-colors view-report-btn" data-key="${report.key}">عرض</button>
                        <button class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg text-sm font-medium transition-colors edit-report-btn" data-key="${report.key}">تعديل</button>
                        <button class="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg text-sm font-medium transition-colors delete-report-btn" data-key="${report.key}">حذف</button>
                    </div>
                `;
                reportsListContainer.appendChild(card);
            });
        }

        function collectCheckedObjectivesWithNotes() {
            const result = [];
            const reportForm = document.getElementById('reportForm');
            if (!reportForm) return result;
            reportForm.querySelectorAll('.objective-item').forEach(item => {
                const cb = item.querySelector('input[name="objectives"]');
                if (cb && cb.checked) {
                    const noteInput = item.querySelector('.objective-note');
                    result.push({ text: cb.value, note: noteInput ? noteInput.value.trim() : '' });
                }
            });
            return result;
        }

        function convertObjectiveToPast(text) {
            if (text.startsWith("الالتقاء")) return text.replace("الالتقاء", "تم الالتقاء");
            if (text.startsWith("حضور")) return text.replace("حضور", "تم حضور");
            if (text.startsWith("متابعة")) return text.replace("متابعة", "تمت متابعة");
            if (text.startsWith("شرح")) return text.replace("شرح", "تم شرح");
            if (text.startsWith("الاطلاع")) return text.replace("الاطلاع", "تم الاطلاع");
            if (text.startsWith("تحديث")) return text.replace("تحديث", "تم تحديث");
            if (text.startsWith("مقابلة")) return text.replace("مقابلة", "تمت مقابلة");
            return "تم " + text;
        }

        function generateSchoolSmartVisitorOpinion() {
            const reportForm = document.getElementById('reportForm');
            if (!reportForm) return;
            const checkedItems = collectCheckedObjectivesWithNotes();

            if (checkedItems.length === 0 && (!Array.isArray(schoolClassroomVisits) || schoolClassroomVisits.length === 0)) {
                showToast('يرجى تحديد الأهداف أو إضافة مواقف صفية أولاً', 'error');
                return;
            }

            let opinionText = "";
            let counter = 1;

            checkedItems.forEach(({ text: obj, note }) => {
                let text = obj.trim().replace(/^[\d٠-٩]+\s*[-–]\s*/, '');
                text = convertObjectiveToPast(text);

                if (note) {
                    // عند وجود ملاحظة: تُذكر في رأي الزائر
                    text += `، وقد لوحظ أن ${note}`;
                    if (!text.endsWith('.')) text += '.';
                } else {
                    // بدون ملاحظة: جملة إيجابية
                    text += getPositiveAddition(text);
                }

                opinionText += counter + "- " + text + "\n";
                counter++;
            });

            if (Array.isArray(schoolClassroomVisits) && schoolClassroomVisits.length > 0) {
                opinionText += counter + "- تم حضور مواقف صفية وإجراء المداولة الإشرافية، وذلك على النحو الآتي:\n";
                schoolClassroomVisits.forEach(cv => {
                    opinionText += `   • الحصة (${cv.period}): الأستاذ ${cv.teacher} – درس ${cv.subject} – الصف ${cv.grade}، وكان مستوى الأداء ${cv.rating}.\n`;
                });
            }

            const visOp = document.getElementById('visitorOpinion');
            if(visOp) {
                visOp.value = opinionText.trim();
                showToast('تم توليد رأي الزائر بنجاح');
            }
        }

        function buildActionableRecommendation(objText) {
            const t = objText.replace(/^[\d٠-٩]+\s*[-–]\s*/, '').trim();
            if (t.includes("خطة المنهاج") || t.includes("سجلات المتابعة") || t.includes("التحضير") || t.includes("نور"))
                return "متابعة المعلمين بالتحضير بشكل مستمر وإعداد سجلاتهم المنظمة للعمل";
            if (t.includes("الطابور"))
                return "العمل على تحسين تنظيم الطابور المدرسي ورفع مستوى الهتاف وضبط الانضباط";
            if (t.includes("الملاعب") || t.includes("الأدوات الرياضية"))
                return "متابعة صيانة الملاعب وتجهيز الأدوات الرياضية وإزالة أي مخاطر تؤثر على سلامة الطلاب";
            if (t.includes("الأدلة") || t.includes("كتاب الطالب"))
                return "متابعة استلام الأدلة وكتب الطالب والتأكد من توافرها بطبعاتها الحديثة";
            if (t.includes("النشرات") || t.includes("الوثائق"))
                return "متابعة تطبيق النشرات والتعاميم الواردة والحرص على مناقشتها مع الكادر التعليمي";
            if (t.includes("منافسات") || t.includes("ألعاب جماعية"))
                return "التأكيد على تنفيذ الحصة في شكل منافسات وألعاب جماعية تحقق الأهداف المرجوة";
            if (t.includes("قاعدة بيانات"))
                return "إتمام تحديث قاعدة بيانات المعلمين وضمان دقة المعلومات المدخلة";
            if (t.includes("موافقات التعيين") || t.includes("موافقات"))
                return "متابعة استيفاء موافقات التعيين وإنجاز الإجراءات الرسمية المتعلقة بها";
            if (t.includes("مقابلة") || t.includes("الالتقاء"))
                return "الحرص على التواصل المستمر مع الكادر التعليمي وإدارة المدرسة ومتابعة المستجدات";
            if (t.includes("موقف صفي") || t.includes("مداولة"))
                return "متابعة تطوير الأداء التدريسي وتطبيق توصيات المداولة الإشرافية";
            // عام
            return "متابعة " + t.replace(/^(متابعة|حضور|تحديث|شرح|مقابلة)\s+/i, '');
        }

        function generateSchoolRecommendations() {
            const notedItems = collectCheckedObjectivesWithNotes().filter(i => i.note);

            const recEl = document.getElementById('recommendations');
            if (!recEl) return;

            if (notedItems.length === 0) {
                recEl.value = '';
                showToast('لا توجد ملاحظات — لا توصيات مطلوبة', 'info');
                return;
            }

            let rec = 'نوصي إدارة المدرسة بالآتي:\n';
            notedItems.forEach(({ text: objText }) => {
                let recommendation = buildActionableRecommendation(objText);
                if (!recommendation.endsWith('.')) recommendation += '.';
                rec += `- ${recommendation}\n`;
            });

            recEl.value = rec.trim();
            showToast('تم توليد التوصيات بنجاح');
        }

        function startSchoolDictation(targetId, btn) {
            if (!recognition) { showToast('المتصفح لا يدعم الإملاء الصوتي', 'error'); return; }
            const target = document.getElementById(targetId);
            if(!target) return;
            btn.classList.add('recording');
            recognition.start();
            recognition.onresult = (event) => { 
                const current = target.value;
                const newText = event.results[0][0].transcript;
                target.value = current + (current.length > 0 ? ' ' : '') + newText;
            };
            recognition.onspeechend = () => recognition.stop();
            recognition.onend = () => { btn.classList.remove('recording'); };
        }

        function saveSchoolReport(e) {
            e.preventDefault();
            const reportForm = document.getElementById('reportForm');
            if(!reportForm) return;
            const formData = new FormData(reportForm);
            const objectives = [];
            reportForm.querySelectorAll('input[name="objectives"]:checked').forEach(cb => objectives.push(cb.value));
            
            const rId = document.getElementById('reportId')?.value;
            const reportId = rId ? rId : `supervision_v6_school_report_${Date.now()}`;
            const visitType = document.getElementById('visitTypeSelect')?.value;
            
            if (!visitType) { 
                showToast('يرجى اختيار نوع الزيارة', 'error'); 
                return; 
            }
            
            const reportData = {
                id: reportId,
                schoolName: formData.get('schoolName') || '',
                visitDate: formData.get('visitDate') || '',
                visitType: visitType,
                objectives: objectives,
                classroomVisits: Array.isArray(schoolClassroomVisits) ? schoolClassroomVisits : [],
                visitorOpinion: document.getElementById('visitorOpinion')?.value || '',
                recommendations: document.getElementById('recommendations')?.value || ''
            };
            
            try {
                localStorage.setItem(reportId, JSON.stringify(reportData));
                showToast('تم حفظ التقرير بنجاح');
                showSchoolDashboard();
            } catch(error) {
                showToast('خطأ: لا توجد مساحة كافية للحفظ', 'error');
            }
        }

        function editSchoolReport(key) {
            try {
                const report = JSON.parse(localStorage.getItem(key));
                if (!report || typeof report !== 'object') return;
                
                if(document.getElementById('reportId')) document.getElementById('reportId').value = key;
                if(document.getElementById('schoolName')) document.getElementById('schoolName').value = report.schoolName || '';
                if(document.getElementById('schoolVisitDate')) document.getElementById('schoolVisitDate').value = report.visitDate || '';
                if(document.getElementById('visitTypeSelect')) document.getElementById('visitTypeSelect').value = report.visitType || '';
                if(document.getElementById('visitorOpinion')) document.getElementById('visitorOpinion').value = report.visitorOpinion || '';
                if(document.getElementById('recommendations')) document.getElementById('recommendations').value = report.recommendations || '';
                
                schoolClassroomVisits = Array.isArray(report.classroomVisits) ? report.classroomVisits : [];
                renderSchoolClassroomVisits();
                renderSchoolObjectives(report.visitType);
                
                if (Array.isArray(report.objectives)) {
                    setTimeout(() => {
                        report.objectives.forEach(objVal => {
                            const cb = Array.from(document.querySelectorAll('input[name="objectives"]')).find(el => el.value === objVal);
                            if (cb) cb.checked = true;
                        });
                    }, 0);
                }
                showSchoolForm();
            } catch(e) {
                showToast('خطأ في استرجاع التقرير', 'error');
            }
        }

        function viewSchoolReport(key) {
            try {
                const report = JSON.parse(localStorage.getItem(key));
                if (!report || typeof report !== 'object') {
                    showToast('ملف التقرير تالف', 'error');
                    return;
                }
                
                generateSchoolPreview(report);
                document.getElementById('schoolFormView')?.classList.add('hidden');
                document.getElementById('schoolDashboardView')?.classList.add('hidden');
                document.getElementById('reportPreviewContainer')?.classList.remove('hidden');
            } catch (e) {
                 showToast('لا يمكن قراءة ملف التقرير', 'error');
            }
        }

        function generateSchoolPreview(report) {
            const typeName = (schoolVisitTypesData && schoolVisitTypesData[report.visitType]) ? schoolVisitTypesData[report.visitType].name : 'زيارة مدرسية';
            let objectivesHtml = '<ol class="list-decimal list-inside space-y-1 text-slate-700 mt-2">';
            
            if(Array.isArray(report.objectives) && report.objectives.length > 0) {
                report.objectives.forEach(obj => objectivesHtml += `<li>${obj}</li>`);
            } else {
                objectivesHtml += '<li class="text-slate-400 italic">لا توجد أهداف محددة.</li>';
            }
            objectivesHtml += '</ol>';
            
            const content = `
                <div class="text-center mb-8 border-b pb-6">
                    <h2 class="text-2xl font-bold text-slate-900 mb-2">تقرير زيارة مدرسية</h2>
                    <span class="inline-block bg-slate-100 rounded-full px-4 py-1 text-sm font-semibold text-slate-600">${typeName}</span>
                </div>
                <div class="grid grid-cols-2 gap-6 mb-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">المدرسة</p>
                        <p class="font-bold text-lg text-slate-800">${report.schoolName || '-'}</p>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">التاريخ</p>
                        <p class="font-bold text-lg text-slate-800">${report.visitDate || '-'}</p>
                    </div>
                </div>
                <div class="mb-8">
                    <h3 class="text-lg font-bold text-slate-800 mb-3 border-r-4 border-blue-500 pr-3">أولاً: أهداف الزيارة</h3>
                    <div class="bg-white border border-slate-200 rounded-xl p-5">${objectivesHtml}</div>
                </div>
                <div class="mb-8">
                    <h3 class="text-lg font-bold text-slate-800 mb-3 border-r-4 border-purple-500 pr-3">ثانياً: رأي الزائر</h3>
                    <div class="bg-white border border-slate-200 rounded-xl p-5 min-h-[100px] whitespace-pre-wrap">${report.visitorOpinion || 'لا يوجد رأي للزائر.'}</div>
                </div>
                <div class="mb-8">
                    <h3 class="text-lg font-bold text-slate-800 mb-3 border-r-4 border-green-500 pr-3">ثالثاً: التوصيات والملاحظات</h3>
                    <div class="bg-white border border-slate-200 rounded-xl p-5 min-h-[100px] whitespace-pre-wrap">${report.recommendations || 'لا توجد توصيات.'}</div>
                </div>
            `;
            const repContent = document.getElementById('reportContent');
            if(repContent) repContent.innerHTML = content;
            
            const btnBack = document.getElementById('backToFormBtn');
            if(btnBack) {
                btnBack.onclick = () => {
                    if(document.getElementById('reportId')) document.getElementById('reportId').value = report.id || '';
                    if(report.id) {
                        editSchoolReport(report.id);
                    } else {
                        if(document.getElementById('schoolName')) document.getElementById('schoolName').value = report.schoolName || '';
                        if(document.getElementById('schoolVisitDate')) document.getElementById('schoolVisitDate').value = report.visitDate || '';
                        if(document.getElementById('visitTypeSelect')) document.getElementById('visitTypeSelect').value = report.visitType || '';
                        if(document.getElementById('visitorOpinion')) document.getElementById('visitorOpinion').value = report.visitorOpinion || '';
                        if(document.getElementById('recommendations')) document.getElementById('recommendations').value = report.recommendations || '';
                        schoolClassroomVisits = Array.isArray(report.classroomVisits) ? report.classroomVisits : [];
                        renderSchoolClassroomVisits();
                        renderSchoolObjectives(report.visitType);
                        setTimeout(() => { 
                            if(Array.isArray(report.objectives)) {
                                report.objectives.forEach(val => { 
                                    const cb = Array.from(document.querySelectorAll('input[name="objectives"]')).find(el => el.value === val); 
                                    if(cb) cb.checked = true; 
                                });
                            }
                        }, 0);
                        showSchoolForm();
                    }
                };
            }
        }

        function deleteSchoolReport(key) {
            if(confirm('هل أنت متأكد من حذف هذا التقرير؟')) {
                localStorage.removeItem(key);
                renderSchoolReportsList();
                showToast('تم الحذف بنجاح');
            }
        }

        function renderSchoolVisitTypesList() {
            const visitTypesList = document.getElementById('visitTypesList');
            if(!visitTypesList) return;
            
            visitTypesList.innerHTML = '';
            if(!schoolVisitTypesData || typeof schoolVisitTypesData !== 'object') return;
            
            Object.keys(schoolVisitTypesData).forEach(key => {
                const type = schoolVisitTypesData[key];
                if (!type || typeof type !== 'object') return; // حماية من البيانات التالفة
                
                const div = document.createElement('div');
                div.className = 'p-3 bg-slate-50 rounded-lg border border-slate-200';
                
                const objArray = Array.isArray(type.objectives) ? type.objectives : [];
                const objectivesList = objArray.map(obj => `<li class="text-xs text-slate-600 truncate">• ${obj}</li>`).join('');
                
                div.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-slate-700">${type.name || 'بدون اسم'}</h4>
                        <div class="flex gap-2">
                            <button class="text-blue-500 hover:text-blue-700 edit-type-btn p-1" data-key="${key}">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="text-red-500 hover:text-red-700 delete-type-btn p-1" data-key="${key}">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <ul class="pl-2 space-y-1 max-h-20 overflow-y-auto custom-scrollbar">${objectivesList}</ul>
                `;
                visitTypesList.appendChild(div);
            });
        }

        function showSchoolDashboard() {
            document.getElementById('schoolDashboardView')?.classList.remove('hidden');
            document.getElementById('schoolFormView')?.classList.add('hidden');
            document.getElementById('reportPreviewContainer')?.classList.add('hidden');
            renderSchoolReportsList();
        }
        
        function showSchoolForm() {
            document.getElementById('schoolDashboardView')?.classList.add('hidden');
            document.getElementById('schoolFormView')?.classList.remove('hidden');
            document.getElementById('reportPreviewContainer')?.classList.add('hidden');
        }

        // =========================================================================
        // 6. INITIALIZATION & EVENT BINDINGS
        // =========================================================================
        
        function initAppEnvironment() {
            try {
                // --- Welcome View Bindings ---
                const showSupBtn = document.getElementById('showSupervisoryAppBtn');
                if(showSupBtn) showSupBtn.addEventListener('click', () => showView(document.getElementById('supervisoryVisitsApp')));
                
                const showSchBtn = document.getElementById('showSchoolAppBtn');
                if(showSchBtn) showSchBtn.addEventListener('click', () => showView(document.getElementById('schoolVisitsApp')));
                
                const backWelcomeBtn = document.getElementById('backToWelcomeFromSupervisory');
                if(backWelcomeBtn) backWelcomeBtn.addEventListener('click', () => showView(document.getElementById('welcomeView')));
                
                const backWelcomeSchBtn = document.getElementById('backToWelcomeFromSchool');
                if(backWelcomeSchBtn) backWelcomeSchBtn.addEventListener('click', () => showView(document.getElementById('welcomeView')));

                // --- Initialize Supervisory App ---
                try {
                    generateEvaluationForm();
                    const visitDateInput = document.querySelector('#visitDate');
                    if(visitDateInput) visitDateInput.value = new Date().toISOString().split('T')[0];
                    toggleSupervisoryView('form-view');
                } catch(e) { console.error('Supervisory Init Error', e); }

                document.querySelectorAll('#supervisoryVisitsApp .nav-tab').forEach(tab => {
                    tab.addEventListener('click', () => toggleSupervisoryView(tab.dataset.view));
                });
                
                const evalForm = document.querySelector('#evaluationForm');
                if(evalForm) {
                    evalForm.addEventListener('click', e => { 
                        if (e.target.matches('.rating-btn')) {
                            updateScore(e.target.closest('.item-card').id.split('-')[1], e.target.dataset.score, true); 
                        }
                        if (e.target.closest('.mic-btn')) {
                            startSupervisoryDictation(e.target.closest('.mic-btn').previousElementSibling.id, e.target.closest('.mic-btn')); 
                        }
                        if (e.target.closest('.edit-evidence-btn')) { 
                            const itemId = e.target.closest('.edit-evidence-btn').dataset.id; 
                            openEvidencePanel(itemId); 
                        } 
                        if (e.target.matches('.close-evidence-panel')) { 
                            e.target.closest('.evidence-panel').classList.add('hidden'); 
                        } 
                        if (e.target.closest('.add-evidence-btn')) { 
                            const btn = e.target.closest('.add-evidence-btn'); 
                            if(typeof addCustomEvidence === 'function') addCustomEvidence(btn.dataset.id); 
                        } 
                        if (e.target.closest('.delete-evidence-btn')) { 
                            const btn = e.target.closest('.delete-evidence-btn'); 
                            if(typeof deleteCustomEvidence === 'function') deleteCustomEvidence(btn.dataset.itemId, btn.dataset.value); 
                        } 
                    });

                    evalForm.addEventListener('change', e => { 
                        if (e.target.matches('.evidence-checkbox')) { 
                            const itemId = e.target.dataset.itemId; 
                            updateDescriptionFromPanel(itemId); 
                        } 
                    });

                    evalForm.addEventListener('keypress', e => { 
                        if (e.target.matches('.new-evidence-input') && e.key === 'Enter') { 
                            e.preventDefault(); 
                            if(typeof addCustomEvidence === 'function') addCustomEvidence(e.target.dataset.id); 
                        } 
                    });
                }

                const savePermBtn = document.getElementById('savePermanentReportBtn');
                if(savePermBtn) savePermBtn.addEventListener('click', savePermanentReport);
                
                const genReportBtn = document.getElementById('generateReportBtn');
                if(genReportBtn) genReportBtn.addEventListener('click', generateReport);
                
                const printOfficialBtn = document.getElementById('printOfficialReportBtn');
                if(printOfficialBtn) printOfficialBtn.addEventListener('click', prepareOfficialPrint);
                
                const exportWordBtn = document.getElementById('exportToWordBtn');
                if(exportWordBtn) exportWordBtn.addEventListener('click', exportToWord);
                
                const resetConfBtn = document.getElementById('showResetConfirmationBtn');
                if(resetConfBtn) resetConfBtn.addEventListener('click', () => showConfirmationModal('إعادة تعيين', 'هل أنت متأكد؟', performReset));
                
                const updateDashBtn = document.getElementById('updateDashboardViewBtn');
                if(updateDashBtn) updateDashBtn.addEventListener('click', updateDashboardView);
                
                const reportSec = document.querySelector('#reportSection');
                if(reportSec) {
                    reportSec.addEventListener('click', e => { 
                        if(e.target.closest('.copy-btn')) {
                            copyText(document.querySelector(`#${e.target.closest('.copy-btn').dataset.target}`).value); 
                        }
                    });
                }
                
                const supSavedList = document.querySelector('#saved-reports-list');
                if(supSavedList) {
                    supSavedList.addEventListener('click', e => { 
                        if(e.target.dataset.key) { 
                            if(e.target.classList.contains('load-btn')) loadPermanentReport(e.target.dataset.key);
                            if(e.target.classList.contains('delete-btn')) deletePermanentReport(e.target.dataset.key);
                            if(e.target.classList.contains('print-archive-btn') || e.target.closest('.print-archive-btn')) {
                                const btn = e.target.closest('.print-archive-btn') || e.target;
                                printArchivedReport(btn.dataset.key);
                            } 
                        } 
                    });
                }
                
                const supFilter = document.querySelector('#filter-reports-input');
                if(supFilter) {
                    supFilter.addEventListener('input', renderSavedReports);
                }

                // --- Initialize School App ---
                try { loadSchoolVisitTypes(); } catch(e) { console.error('School Types Error', e); }
                try { renderSchoolReportsList(); } catch(e) { console.error('School Reports Error', e); }

                // --- إصلاح زر تقرير جديد وربط الحدث بأمان تام ---
                const addNewReportBtn = document.getElementById('addNewReportBtn');
                if (addNewReportBtn) {
                    addNewReportBtn.addEventListener('click', () => {
                        try {
                            const repForm = document.getElementById('reportForm');
                            if(repForm) repForm.reset();
                            
                            const repId = document.getElementById('reportId');
                            if(repId) repId.value = '';
                            
                            const dateInput = document.getElementById('schoolVisitDate');
                            if(dateInput) dateInput.value = new Date().toISOString().split('T')[0];
                            
                            const objCont = document.getElementById('objectivesContainer');
                            if(objCont) objCont.innerHTML = '';
                            
                            schoolClassroomVisits = [];
                            objectiveNotes = {};
                            renderSchoolClassroomVisits();

                            const visSelect = document.getElementById('visitTypeSelect');
                            if(visSelect && visSelect.options.length > 0) visSelect.selectedIndex = 0;

                            showSchoolForm();
                        } catch(err) {
                            console.error("New Report Error: ", err);
                            showToast('حدث خطأ أثناء محاولة فتح التقرير', 'error');
                        }
                    });
                }

                const genVisOpBtn = document.getElementById('generateVisitorOpinionBtn');
                if (genVisOpBtn) genVisOpBtn.addEventListener('click', generateSchoolSmartVisitorOpinion);

                const genRecsBtn = document.getElementById('generateRecommendationsBtn');
                if (genRecsBtn) genRecsBtn.addEventListener('click', generateSchoolRecommendations);
                
                const addCvBtn = document.getElementById('addClassroomVisitBtn');
                if (addCvBtn) addCvBtn.addEventListener('click', addSchoolClassroomVisit);
                
                const schFormView = document.querySelector('#schoolFormView');
                if (schFormView) {
                    schFormView.addEventListener('click', (e) => {
                         if (e.target.closest('.mic-btn')) {
                             const btn = e.target.closest('.mic-btn');
                             const targetId = btn.previousElementSibling.id;
                             startSchoolDictation(targetId, btn);
                         }
                    });
                }

                const quickRecs = document.getElementById('quickRecs');
                if (quickRecs) {
                    quickRecs.addEventListener('change', (e) => {
                        const val = e.target.value;
                        if(val) {
                            const textarea = document.getElementById('recommendations');
                            if(textarea) {
                                textarea.value += (textarea.value.length > 0 ? '\n- ' : '- ') + val;
                            }
                            e.target.value = '';
                        }
                    });
                }

                const copyObjBtn = document.getElementById('copyObjectivesBtn');
                if (copyObjBtn) {
                    copyObjBtn.addEventListener('click', () => {
                        const checked = Array.from(document.querySelectorAll('#objectivesContainer input:checked')).map((cb, index) => (index + 1) + '- ' + cb.value).join('\n');
                        copyText(checked);
                    });
                }
                
                const copyVisOpBtn = document.getElementById('copyVisitorOpinionBtn');
                if (copyVisOpBtn) {
                    copyVisOpBtn.addEventListener('click', () => {
                        copyText(document.getElementById('visitorOpinion')?.value);
                    });
                }
                
                const copyRecBtn = document.getElementById('copyRecommendationsBtn');
                if (copyRecBtn) {
                    copyRecBtn.addEventListener('click', () => {
                        copyText(document.getElementById('recommendations')?.value);
                    });
                }

                const backToDashBtn = document.getElementById('backToDashboardBtn');
                if (backToDashBtn) backToDashBtn.addEventListener('click', showSchoolDashboard);
                
                const backToFormBtn = document.getElementById('backToFormBtn');
                if (backToFormBtn) backToFormBtn.addEventListener('click', showSchoolForm);

                const visitTypeSel = document.getElementById('visitTypeSelect');
                if (visitTypeSel) {
                    visitTypeSel.addEventListener('change', (e) => {
                        renderSchoolObjectives(e.target.value);
                    });
                }

                document.querySelectorAll('input[name="genderMode"]').forEach(input => {
                    input.addEventListener('change', () => {
                        const visitType = document.getElementById('visitTypeSelect')?.value;
                        if (visitType) renderSchoolObjectives(visitType);
                    });
                });

                const repFormSubmit = document.getElementById('reportForm');
                if (repFormSubmit) repFormSubmit.addEventListener('submit', saveSchoolReport);

                const prevRepBtn = document.getElementById('previewReportBtn');
                if (prevRepBtn) {
                    prevRepBtn.addEventListener('click', () => {
                        const reportForm = document.getElementById('reportForm');
                        if(!reportForm) return;
                        
                        const formData = new FormData(reportForm);
                        const objectives = [];
                        reportForm.querySelectorAll('input[name="objectives"]:checked').forEach(cb => objectives.push(cb.value));
                        
                        const tempReport = {
                            id: document.getElementById('reportId')?.value || '',
                            schoolName: formData.get('schoolName') || '',
                            visitDate: formData.get('visitDate') || '',
                            visitType: document.getElementById('visitTypeSelect')?.value || '',
                            objectives: objectives,
                            classroomVisits: schoolClassroomVisits || [],
                            visitorOpinion: document.getElementById('visitorOpinion')?.value || '',
                            recommendations: document.getElementById('recommendations')?.value || ''
                        };
                        
                        if(!tempReport.visitType) { 
                            showToast('اختر نوع الزيارة أولاً', 'error'); 
                            return; 
                        }
                        
                        generateSchoolPreview(tempReport);
                        document.getElementById('schoolFormView')?.classList.add('hidden');
                        document.getElementById('reportPreviewContainer')?.classList.remove('hidden');
                    });
                }

                const repListCont = document.querySelector('#schoolDashboardView #reportsListContainer');
                if(repListCont) {
                    repListCont.addEventListener('click', (e) => {
                        if (e.target.classList.contains('delete-report-btn')) deleteSchoolReport(e.target.dataset.key);
                        if (e.target.classList.contains('edit-report-btn')) editSchoolReport(e.target.dataset.key);
                        if (e.target.classList.contains('view-report-btn')) viewSchoolReport(e.target.dataset.key);
                    });
                }

                const mgVisTypeBtn = document.getElementById('manageVisitTypesBtn');
                if (mgVisTypeBtn) {
                    mgVisTypeBtn.addEventListener('click', () => {
                        renderSchoolVisitTypesList();
                        document.getElementById('manageTypesModal')?.classList.remove('hidden');
                    });
                }
                
                const closeMgModalBtn = document.getElementById('closeManageModalBtn');
                if (closeMgModalBtn) {
                    closeMgModalBtn.addEventListener('click', () => {
                        document.getElementById('manageTypesModal')?.classList.add('hidden');
                    });
                }
                
                const visTypeList = document.getElementById('visitTypesList');
                if(visTypeList) {
                    visTypeList.addEventListener('click', (e) => {
                        const deleteBtn = e.target.closest('.delete-type-btn');
                        const editBtn = e.target.closest('.edit-type-btn');
                        
                        if (deleteBtn) {
                            const key = deleteBtn.dataset.key;
                            if (confirm('هل أنت متأكد من حذف هذا النوع؟')) {
                                delete schoolVisitTypesData[key];
                                localStorage.setItem('supervision_v6_school_visit_types', JSON.stringify(schoolVisitTypesData));
                                renderSchoolVisitTypesList();
                                populateSchoolVisitTypeDropdown();
                                showToast('تم حذف النوع بنجاح');
                            }
                        }
                        
                        if (editBtn) {
                            const key = editBtn.dataset.key;
                            const type = schoolVisitTypesData[key];
                            if(type) {
                                if(document.getElementById('typeName')) document.getElementById('typeName').value = type.name || '';
                                if(document.getElementById('typeObjectives')) document.getElementById('typeObjectives').value = (Array.isArray(type.objectives) ? type.objectives : []).join('\n');
                                if(document.getElementById('editTypeKey')) document.getElementById('editTypeKey').value = key;
                                if(document.getElementById('addEditModalTitle')) document.getElementById('addEditModalTitle').textContent = 'تعديل نوع زيارة';
                                document.getElementById('manageTypesModal')?.classList.add('hidden');
                                document.getElementById('addEditTypeModal')?.classList.remove('hidden');
                            }
                        }
                    });
                }

                const openAddTypeModalBtn = document.getElementById('openAddTypeModalBtn');
                if (openAddTypeModalBtn) {
                    openAddTypeModalBtn.addEventListener('click', () => {
                        document.getElementById('addEditTypeForm')?.reset();
                        if(document.getElementById('editTypeKey')) document.getElementById('editTypeKey').value = '';
                        if(document.getElementById('addEditModalTitle')) document.getElementById('addEditModalTitle').textContent = 'إضافة نوع زيارة';
                        document.getElementById('manageTypesModal')?.classList.add('hidden');
                        document.getElementById('addEditTypeModal')?.classList.remove('hidden');
                    });
                }
                
                const cancelEditBtn = document.getElementById('cancelEditBtn');
                if (cancelEditBtn) {
                    cancelEditBtn.addEventListener('click', () => {
                        document.getElementById('addEditTypeModal')?.classList.add('hidden');
                        document.getElementById('manageTypesModal')?.classList.remove('hidden');
                    });
                }

                const addEditTypeForm = document.getElementById('addEditTypeForm');
                if (addEditTypeForm) {
                    addEditTypeForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const name = document.getElementById('typeName')?.value || 'نوع جديد';
                        const objVal = document.getElementById('typeObjectives')?.value || '';
                        const objectives = objVal.split('\n').filter(o => o.trim() !== '');
                        let key = document.getElementById('editTypeKey')?.value;
                        
                        if (objectives.length === 0) {
                            showToast('يرجى إضافة هدف واحد على الأقل', 'error');
                            return;
                        }
                        
                        if (!key) {
                            key = 'custom_' + Date.now();
                        }
                        
                        schoolVisitTypesData[key] = { name, objectives };
                        localStorage.setItem('supervision_v6_school_visit_types', JSON.stringify(schoolVisitTypesData));
                        renderSchoolVisitTypesList();
                        populateSchoolVisitTypeDropdown();
                        document.getElementById('addEditTypeModal')?.classList.add('hidden');
                        document.getElementById('manageTypesModal')?.classList.remove('hidden');
                        showToast('تم حفظ النوع بنجاح');
                    });
                }

                // Finally show welcome view
                showView(document.getElementById('welcomeView'));

            } catch (fatalError) {
                console.error("توقف السكربت كلياً بسبب خطأ:", fatalError);
                showToast("حدث خطأ فادح في تحميل واجهة النظام.", "error");
            }
        }

        // الطريقة الأكثر موثوقية لتفعيل السكربت وتهيئة النظام في كل بيئات التشغيل
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initAppEnvironment);
        } else {
            initAppEnvironment();
        }

