const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const guide = require('../js/lesson-guide.js');
const { agreements, visitKey } = require('../js/smart-followup.js');

const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const seed = { window: {} };
vm.runInNewContext(source('js/lesson-guide-data.js'), seed);
const data = seed.window.SVF_LESSON_GUIDE;
guide.setData(data);

test('matches a grade-specific lesson, narrows overlapping names, and keeps both independent matches', () => {
    const lookup = (cls, topic) => guide.find({ cls, topic });
    const stations = lookup('السابع/٢', 'محطات المرونة');
    assert.equal(stations.guide.id, 'g7-fitness');
    assert.deepEqual(Array.from(stations.skills), ['flexibility']);
    assert.equal(guide.observable(guide.skillOf(stations.guide, 'flexibility')), false);
    assert.deepEqual(Array.from(lookup('٧/٢', 'قياس المرونة').skills), ['flexibility-test']);
    assert.deepEqual(Array.from(lookup('٧/٢', 'قياس وتحدي التحمل الدوري التنفسي').skills), ['endurance-test']);
    assert.deepEqual(Array.from(lookup('٧/٢', 'المرونة والتحمل الدوري التنفسي').skills), ['flexibility', 'endurance']);
    assert.equal(lookup('٨/٢', 'محطات المرونة'), null);
    assert.equal(lookup('٧', 'الكرة الطائرة'), null);
    const assessments = guide.questionsFor(stations.guide, stations.skills);
    assert.equal(assessments.length, 1);
    assert.match(assessments[0].text, /المرونة/);
    const coverage = guide.speechCoverage([[10, 'مرجح الرجل للأمام والخلف'], [12, 'ما العوامل التي تؤثر في المرونة']], stations.guide, stations.skills);
    assert.equal(coverage.said, 1);
    assert.equal(coverage.asked, 1);
    assert.equal(coverage.assess.length, 1);
});

test('an equally specific match in two guides requires manual selection', () => {
    const fitness = data.topics.find(topic => topic.id === 'g7-fitness');
    guide.setData({ topics: [...data.topics, { ...fitness, id: 'another-edition' }] });
    try { assert.equal(guide.find({ cls: '7', topic: 'محطات المرونة' }), null); }
    finally { guide.setData(data); }
});

function row(key, d, topic, { goal, outcomes, file = '87', teacher = 'أحمد سالم', school = 'مدرسة الأمل', deleted } = {}) {
    const visit = { teacher, school, file, date: d, cls: '7', period: '2', topic };
    return { key, data: { teacherName: teacher, school, visitDate: d, deleted, formData: {
        class: visit.cls, lesson: visit.period, topic, fileNumber: file,
        debriefData: goal ? JSON.stringify({ agree: { goal, action: 'تحقق من المحاولة التالية' } }) : '',
        smartFollowupData: outcomes ? JSON.stringify({ visit: visitKey(visit), reviews: outcomes }) : ''
    } } };
}

const first = row('supervision_v6_visit_100', '2026-09-10', 'محطات المرونة', { goal: 'قدّم تغذية راجعة محددة' });
const deferred = row('supervision_v6_visit_200', '2026-09-30', 'مفاهيم اللياقة', { outcomes: { [first.key]: { outcome: 'deferred' } } });
const observed = row('supervision_v6_visit_300', '2026-10-20', 'كرة السلة', { outcomes: { [first.key]: { outcome: 'observed', note: 'طبّق الطالبان التوجيه.' } } });

test('a deferred agreement carries forward across different lessons, until the new evidence is saved', () => {
    const visit = { teacher: 'أحمد سالم', school: 'مدرسة الأمل', file: '87', date: '2026-10-20', key: observed.key };
    const open = agreements([first, deferred, observed], visit);
    assert.equal(open.length, 1);
    assert.equal(open[0].open, true);
    assert.equal(open[0].latest.outcome, 'deferred');
    const profile = agreements([first, deferred, observed]);
    assert.equal(profile[0].open, false);
    assert.equal(profile[0].latest.topic, 'كرة السلة');
    assert.equal(profile[0].latest.note, 'طبّق الطالبان التوجيه.');
});

test('ignores deleted reports, identity mismatches, copied draft state and agreements from future visits', () => {
    const deleted = row('supervision_v6_visit_101', '2026-09-11', 'موضوع', { goal: 'اتفاق محذوف', deleted: true });
    const different = row('supervision_v6_visit_400', '2026-10-21', 'موضوع', { file: '88', outcomes: { [first.key]: { outcome: 'observed' } } });
    const copied = structuredClone(observed);
    copied.data.formData.topic = 'موضوع مختلف';
    const future = row('supervision_v6_visit_500', '2026-12-01', 'موضوع', { goal: 'اتفاق زيارة لاحقة' });
    const visit = { teacher: 'احمد سالم', school: 'مدرسة الامل', date: '2026-10-23' };
    const list = agreements([first, deleted, different, copied, future], visit);
    assert.deepEqual(list.map(item => item.key), [first.key]);
    assert.equal(list[0].open, true);
    assert.equal(list[0].latest, null);
    assert.equal(agreements([first], { ...visit, school: 'مدرسة أخرى' }).length, 0);
});

test('visit cards share the saved form, and status changes are scoped to the current visit', () => {
    const elements = {};
    for (const id of ['teacherName', 'school', 'fileNumber', 'visitDate', 'class', 'lesson', 'topic', 'smartFollowupData', 'eyeSmartFollowup', 'debriefSmartFollowup']) {
        elements[id] = { value: '', querySelector: () => null, innerHTML: '' };
    }
    Object.entries({ teacherName: 'أحمد سالم', school: 'مدرسة الأمل', fileNumber: '87', visitDate: '2026-10-20', class: 'السابع', lesson: '2' })
        .forEach(([id, value]) => { elements[id].value = value; });
    const handlers = {};
    const ctx = {
        document: { getElementById: id => elements[id], addEventListener: (event, fn) => { handlers[event] = fn; } },
        localStorage: { length: 1, key: () => first.key, getItem: () => JSON.stringify(first.data) },
        SupervisorGate: { canEye: () => true, isDemo: () => false }, SvfLessonGuide: guide,
        SvfTermPlan: require('../js/term-plan.js'), SvfNoorPreparation: { matchedTitle: () => 'محطات المرونة' },
        svfEscapeHtml: String
    };
    ctx.window = ctx;
    vm.runInNewContext(source('js/smart-followup.js'), ctx);
    const feature = ctx.SvfSmartFollowup;
    feature.renderVisit();
    assert.match(elements.eyeSmartFollowup.innerHTML, /محطات المرونة/);
    assert.match(elements.debriefSmartFollowup.innerHTML, /قدّم تغذية راجعة محددة/);
    const outcome = { value: 'observed' }, note = { value: '' }, status = { textContent: '' };
    const fields = { '[data-smart-outcome]': outcome, '[data-smart-note]': note, '[data-smart-status]': status };
    const card = { dataset: { smartOrigin: first.key }, querySelector: selector => fields[selector] };
    const target = { matches: selector => selector.includes('[data-smart-note]'), closest: () => card };
    handlers.change({ target });
    assert.match(status.textContent, /أضف الدليل/);
    assert.equal(JSON.parse(elements.smartFollowupData.value).reviews[first.key], undefined);
    note.value = 'أعاد الطالب المحاولة.';
    handlers.change({ target });
    assert.equal(JSON.parse(elements.smartFollowupData.value).reviews[first.key].outcome, 'observed');
    elements.topic.value = 'حصة مختلفة';
    feature.beforeSave();
    assert.equal(elements.smartFollowupData.value, '');
    assert.match(source('reports.html'), /id="smartFollowupData"/);
    assert.match(source('sw.js'), /\.\/js\/smart-followup\.js/);
});
