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
        // مفتاح التقرير المفتوح للتعديل. كان غير معرَّفٍ أصلاً ولا يُنشأ إلّا
        // ضمنياً في performReset، فأوّلُ حفظٍ في صفحةٍ حديثة التحميل — بلا
        // تعيينٍ قبله — كان يرمي ReferenceError فلا يُحفظ التقرير ولا يظهر خطأ.
        let currentEditingKey = null;
        let schoolVisitTypesData = {};
        let schoolClassroomVisits = [];
        let objectiveNotes = {};
        let prevRecommendationsStatus = []; // [{ text, status: 'done'|'partial'|'not-done'|null }]
        // طاقم المدرسة: يُدرَج في رأي الزائر عند التوليد ويُحفظ لكلّ مدرسةٍ باسمها
        let schoolTeachers = [];           // [{ name, gender: 'm'|'f', load, grades, section }]
        let schoolPrincipal = { name: '', gender: 'f' };
