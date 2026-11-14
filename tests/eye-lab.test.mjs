import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../tools/eye-lab/worker.mjs';
import lab from '../js/eye-lab.js';

const env = { SVF_LAB_KEY: 'test-secret', GEMINI_API_KEY: 'provider-test-key' };
const origin = 'https://supervisor-mct.com';
const payload = { task: 'eye-lab', from: 15, to: 30, mime: 'video/mp4', media: 'A'.repeat(120), eye: { whistleEye: [], whistleReference: [24] } };
function request(body, overrides = {}) {
    return new Request('https://lab.example', {
        method: 'POST', headers: { Origin: origin, 'x-svf-key': env.SVF_LAB_KEY, ...overrides }, body: JSON.stringify(body)
    });
}

test('requires HTTPS, origin, credentials and valid input', async () => {
    assert.equal(lab.endpoint(' https://lab.example '), 'https://lab.example/');
    for (const url of ['http://lab.example', 'https://x:y@lab.example', 'https://lab.example/?secret=x']) {
        assert.throws(() => lab.endpoint(url));
    }
    assert.equal((await worker.fetch(request(payload, { Origin: 'https://other.example' }), env)).status, 403);
    assert.equal((await worker.fetch(request(payload, { 'x-svf-key': 'wrong' }), env)).status, 401);
    assert.equal((await worker.fetch(request(payload), { ...env, GEMINI_API_KEY: '' })).status, 503);
    assert.equal((await worker.fetch(request({ ...payload, to: 42 }), env)).status, 400);
    assert.equal((await worker.fetch(request({ ...payload, mime: 'audio/wav' }), env)).status, 400);
    assert.equal((await worker.fetch(request(payload, { 'content-length': '2200000' }), env)).status, 413);
    assert.deepEqual(await (await worker.fetch(request({ task: 'eye-lab-check' }), env)).json(), { ready: true });
});

test('sends video and synchronized telemetry and filters out-of-window notes', async (t) => {
    const fake = t.mock.method(globalThis, 'fetch', async (url, opts) => {
        assert.match(url, /^https:\/\/generativelanguage.googleapis.com\//);
        assert.equal(opts.headers['x-goog-api-key'], env.GEMINI_API_KEY);
        const parts = JSON.parse(opts.body).contents[0].parts;
        assert.deepEqual(JSON.parse(parts[0].text), { from: 15, to: 30, eye: payload.eye });
        assert.deepEqual(parts[1].inlineData, { mimeType: 'video/mp4', data: payload.media });
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ notes: [
            { t: 24.2, observed: 'صفارة', eye: 'لم ترصدها' },
            { t: 3, observed: 'خارج الفترة' }
        ] }) }] } }] });
    });
    const result = await worker.fetch(request(payload), env);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await result.json(), { notes: [{ t: 24, observed: 'صفارة', eye: 'لم ترصدها', suggestion: '' }] });
    assert.equal(fake.mock.calls.length, 1);
});

test('uses both live tracks, posts a final short clip, and discards a cancelled clip', async (t) => {
    const video = { readyState: 'live' }, audio = { readyState: 'live' };
    class Recorder {
        static isTypeSupported(type) { return type === 'video/mp4'; }
        constructor(stream, options) {
            assert.deepEqual(stream.tracks, [video, audio]);
            this.mimeType = options.mimeType;
        }
        start() { this.state = 'recording'; }
        stop() {
            this.state = 'inactive';
            queueMicrotask(() => {
                this.ondataavailable({ data: new Blob(['mock']) });
                this.onstop();
            });
        }
    }
    const installed = {
        MediaRecorder: Recorder,
        MediaStream: class { constructor(tracks) { this.tracks = tracks; } },
        document: { hidden: false, addEventListener() {}, removeEventListener() {} }
    };
    for (const [key, value] of Object.entries(installed)) {
        Object.defineProperty(globalThis, key, { configurable: true, value });
        t.after(() => { delete globalThis[key]; });
    }
    const fake = t.mock.method(globalThis, 'fetch', async (_url, opts) => {
        const body = JSON.parse(opts.body);
        assert.equal(body.from, 0);
        assert.equal(body.to, 4);
        assert.equal(body.mime, 'video/mp4');
        assert.deepEqual(body.eye, { counts: [2] });
        return Response.json({ notes: [{ t: 2, observed: 'شخصان' }] });
    });
    let elapsed = 0, status;
    const options = { video, audio, clock: () => elapsed, sample: () => ({ counts: [2] }), url: 'https://lab.example', key: 'secret', onUpdate: s => { status = s; } };
    const first = lab.create(options);
    elapsed = 4;
    first.stop(true);
    await new Promise(r => setImmediate(r));
    assert.equal(fake.mock.calls.length, 1);
    assert.equal(status.reviewed, 1);
    assert.equal(status.active, false);
    const next = lab.create(options);
    elapsed = 8;
    next.cancel();
    await new Promise(r => setImmediate(r));
    assert.equal(fake.mock.calls.length, 1);
});
