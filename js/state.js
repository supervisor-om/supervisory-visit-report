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
        let objectiveNotes = {};
        let prevRecommendationsStatus = []; // [{ text, status: 'done'|'partial'|'not-done'|null }]
