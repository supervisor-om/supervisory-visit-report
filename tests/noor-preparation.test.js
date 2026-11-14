'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const relay = read('tools/noor-eye.user.js');
const form = read('js/noor-preparation.js');
const settle = () => new Promise(resolve => setImmediate(resolve));
const eye = 'https://supervisor-mct.com';
const noor = 'https://lms.moe.gov.om';
const details = '/tsupv/courses/view_preparation/prep_OMAN/cid:course_OMAN';
const list = '/tsupv/courses/preparations_index/lid:101/cid:202/tuid:303';
const token = 'a1234567-1234-1234-1234-123456789012';

function node() {
    const handlers = {};
    return {
        value: '', textContent: '', hidden: false, dataset: {},
        addEventListener(name, fn) { (handlers[name] ||= []).push(fn); },
        dispatchEvent(e) { (handlers[e.type] || []).forEach(fn => fn(e)); return !e.defaultPrevented; },
        append() {}, replaceChildren() {}, setAttribute() {}
    };
}

function fixture(visit) {
    const elements = new Map();
    const get = id => {
        if (!elements.has(id)) elements.set(id, node());
        return elements.get(id);
    };
    Object.entries(visit).forEach(([id, value]) => { get(id).value = value; });
    const b = get('noorImportPrepared');
    b.closest = () => get('noorImportPanel');
    const share = new Map(), tab = new Map(), timeouts = new Map();
    let next = 0;
    let opened;
    const base = { URL, URLSearchParams, Date, crypto: { randomUUID: () => token },
        GM_setValue: (k, v) => share.set(k, v), GM_getValue: (k, fallback) => share.get(k) ?? fallback,
        GM_deleteValue: k => share.delete(k), setTimeout(fn, ms) { timeouts.set(++next, { fn, ms }); return next; },
        clearTimeout: k => timeouts.delete(k)
    };
    const formEnv = {
        ...base, location: new URL(eye + '/reports.html'),
        document: { readyState: 'complete', getElementById: get, createElement: node, addEventListener() {} },
        CustomEvent: class {
            constructor(type, options = {}) { Object.assign(this, options, { type }); }
            preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
        },
        SupervisorGate: { canEye: () => true, isDemo: () => false },
        open(url, _target, options) { assert.match(options, /noopener/); opened = url; }
    };
    formEnv.window = formEnv;
    vm.runInNewContext(form, formEnv);
    vm.runInNewContext(relay, formEnv);
    return {
        get, share, opened: () => opened,
        click() { b.dispatchEvent({ type: 'click', isTrusted: true }); },
        async poll() {
            const entry = [...timeouts].find(([, value]) => value.ms === 800);
            if (entry) { timeouts.delete(entry[0]); await entry[1].fn(); }
            await settle();
        },
        async visitNoor(url, teacher, school, { rows = [], inputs = [] } = {}) {
            const noorNodes = [];
            const widget = {
                querySelector: sel => ({ innerText: sel.includes('header') ? 'الهدف' : 'تنمية المرونة' })
            };
            vm.runInNewContext(relay, {
                ...base, location: Object.assign(new URL(url), { assign(nextUrl) { opened = nextUrl; } }),
                Event,
                sessionStorage: { getItem: k => tab.get(k), setItem: (k, v) => tab.set(k, v), removeItem: k => tab.delete(k) },
                history: { replaceState() {} },
                document: { readyState: 'complete', querySelector: () => ({
                    querySelector: () => ({ innerText: 'المرونة' }),
                    querySelectorAll: () => [{ innerText: 'المعلم: ' + teacher }]
                }), querySelectorAll: selector => selector === 'table tbody tr' ? rows : selector.startsWith('input') ? inputs : [widget],
                getElementById: () => ({ innerText: school }),
                createElement() { const el = { ...node(), style: {} }; noorNodes.push(el); return el; },
                body: { append(el) { el.isConnected = true; } }
                }
            });
            await settle();
            return noorNodes;
        }
    };
}

const visit = { teacherName: 'سليمان السيابي', school: 'مدرسة محمد المنذري', subject: 'الرياضة', class: 'السابع',
    visitDate: '2026-11-14', lesson: '1', topic: 'المرونة' };

test('one click opens Noor and the matching preparation arrives in the original visit', async () => {
    const f = fixture(visit);
    f.click();
    await settle();
    assert.equal(new URL(f.opened()).origin, noor);
    const [, status] = await f.visitNoor(f.opened(), '', '');
    assert.match(status.textContent, /قائمة المعلمين/);
    assert.equal(f.share.size, 3);
    await f.poll();
    assert.match(f.get('noorImportStatus').textContent, /قائمة المعلمين/);
    await f.visitNoor(noor + details, 'أحمد السيابي', visit.school);
    await f.poll();
    assert.match(f.get('noorImportStatus').textContent, /لا يطابق/);
    assert.equal(f.get('noorImportPreview').hidden, true);
    await f.visitNoor(noor + details, visit.teacherName, visit.school);
    await f.poll();
    assert.equal(f.get('noorPreparationTitle').textContent, 'المرونة');
    assert.equal(f.get('noorImportPreview').hidden, false);
    assert.equal(f.get('noorEvidenceData').value, '');
    assert.equal(f.share.size, 0);
});

function row(cells, links, headers) {
    const column = innerText => ({ innerText });
    return {
        cells: cells.map(column),
        closest: () => ({ tHead: { rows: [{ cells: headers.map(column) }] } }),
        querySelectorAll: () => links.map(href => ({ getAttribute: () => href }))
    };
}

test('searches for the selected teacher and opens the matching preparation without another click', async () => {
    const f = fixture(visit);
    f.click();
    await settle();
    let searched = 0;
    const search = { innerText: 'بحث', click() { searched++; }, getClientRects: () => [1] };
    const input = { placeholder: 'اسم المعلم', getAttribute: () => '', getClientRects: () => [1], dispatchEvent() {},
        form: { querySelectorAll: () => [search] } };
    await f.visitNoor(f.opened(), '', '', { inputs: [input] });
    assert.equal(input.value, visit.teacherName);
    assert.equal(searched, 1);
    const teachers = [row([visit.teacherName, visit.school], [list], ['الاسم', 'المدرسة']),
        row([visit.teacherName, 'مدرسة أخرى'], [list + '/other'], ['الاسم', 'المدرسة'])];
    await f.visitNoor(noor + '/tsupv', '', '', { rows: teachers, inputs: [input] });
    assert.equal(new URL(f.opened()).pathname, list);
    const columns = ['عنوان التحضير', 'اسم المادة', 'الصف', 'تاريخ النشر', 'الفترة'];
    const lessons = [
        row(['المرونة', 'الرياضة', '٧', '١٤/١١/٢٠٢٦', 'الثانية'], [details.replace('prep_', 'other_')], columns),
        row(['المرونة', 'الرياضة', 'السابع', '١٤/١١/٢٠٢٦', 'الأولى'], [details], columns)
    ];
    await f.visitNoor(f.opened(), '', '', { rows: lessons });
    assert.equal(new URL(f.opened()).pathname, details);
    await f.visitNoor(f.opened(), visit.teacherName, visit.school);
    await f.poll();
    assert.equal(f.get('noorPreparationTitle').textContent, 'المرونة');
    assert.equal(f.get('noorEvidenceData').value, '');
    assert.equal(f.share.size, 0);
});

test('leaves ambiguous matches in Noor for review', async () => {
    const f = fixture(visit);
    f.click();
    await settle();
    await f.visitNoor(f.opened(), '', '');
    const columns = ['عنوان التحضير', 'المادة', 'الصف', 'تاريخ النشر'];
    const cells = ['المرونة', 'الرياضة', 'السابع', '2026-11-14'];
    const [, status] = await f.visitNoor(noor + list, '', '', { rows: [
        row(cells, [details], columns), row(cells, [details.replace('prep_', 'other_')], columns)
    ] });
    assert.match(status.textContent, /أكثر من تحضير/);
    assert.equal(new URL(f.opened()).pathname, '/tsupv');
});

test('a separate Noor details tab sends only when the supervisor presses its button', async () => {
    const f = fixture(visit);
    f.click();
    await settle();
    const [, status, send] = await f.visitNoor(noor + details, visit.teacherName, visit.school);
    assert.equal(send.hidden, false);
    assert.equal(f.share.size, 2);
    assert.match(status.textContent, /طلب سحب مفتوح/);
    send.dispatchEvent({ type: 'click', isTrusted: true });
    await settle();
    await f.poll();
    assert.equal(f.get('noorPreparationTitle').textContent, 'المرونة');
    assert.equal(f.share.size, 0);
});

test('rejects external links and cancels when the visit changes', async () => {
    const f = fixture(visit);
    f.get('noorDetailUrl').value = 'https://example.com' + details;
    f.click();
    assert.equal(f.opened(), undefined);
    f.get('noorDetailUrl').value = noor + details;
    f.click();
    await settle();
    assert.equal(new URL(f.opened()).pathname, details);
    f.get('class').value = 'الثامن';
    f.get('class').dispatchEvent({ type: 'input' });
    await settle();
    assert.equal(f.share.size, 0);
    assert.equal(f.get('noorCancelImport').hidden, true);
});
