/* مختبر العين: مقاطع قصيرة من المسار نفسه الذي تعرضه العين، على ساعة الرصد. */
(function (root) {
    'use strict';
    const WINDOW_MS = 15000, MAX_CLIPS = 20, MAX_BYTES = 1500000;
    const MIME = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
    function endpoint(value) {
        const url = new URL(value.trim());
        if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
            throw new Error('أدخل رابط HTTPS لوسيط المختبر.');
        }
        return url.href;
    }

    function create(options) {
        const { video, audio, clock, sample, onUpdate, url, key } = options;
        const stream = new MediaStream([video, audio]);
        const type = MIME.find(t => MediaRecorder.isTypeSupported(t));
        if (!type) throw new Error('المتصفّح لا يدعم تسجيل صورة وصوت المختبر.');
        const state = { status: '', notes: [], sent: 0, reviewed: 0, skipped: 0, failed: 0, active: true, pending: false };
        let current, timer, controller, ended = false, cancelled = false;
        const show = status => { state.status = status; onUpdate(state); };
        const sameTracks = () => video.readyState === 'live' && !video.muted && audio.readyState === 'live';
        let awaitingFinal = false;

        async function send(clip) {
            if (clip.size > MAX_BYTES) { state.skipped++; show('تجاوز حجم المقطع الحدّ. حاول تقليل دقة الكاميرا.'); return; }
            if (state.pending) { state.skipped++; show('الوكيل ما زال يراجع المقطع السابق. تُركت هذه الفترة دون مراجعة.'); return; }
            const request = new AbortController();
            controller = request;
            const timeout = setTimeout(() => request.abort(), 35000);
            state.pending = true;
            state.sent++;
            show('الوكيل يراجع المقطع…');
            try {
                const media = await clip.blob.arrayBuffer();
                const bytes = new Uint8Array(media);
                let raw = '';
                for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
                const res = await fetch(url, {
                    method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
                    headers: { 'content-type': 'application/json', 'x-svf-key': key }, signal: request.signal,
                    body: JSON.stringify({ task: 'eye-lab', from: clip.from, to: clip.to, mime: clip.mime, media: btoa(raw), eye: clip.eye })
                });
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok || !Array.isArray(data.notes)) throw new Error(data.error || 'تعذّرت قراءة رد الوسيط.');
                state.notes.push(...data.notes.slice(0, 5));
                state.reviewed++;
                show(state.active ? 'وصلت ملاحظات الوكيل. الرصد مستمر.' : 'اكتملت مراجعة المقاطع المستلمة.');
            } catch (err) {
                if (cancelled) return;
                state.failed++;
                show('تعذّرت مراجعة المقطع. ' + (err.name === 'AbortError' ? 'انتهت مهلة الاتصال.' : err.message));
                if (state.failed >= 2 && state.reviewed === 0 && state.active) stop(false);
            } finally {
                clearTimeout(timeout);
                if (!cancelled) { state.pending = false; onUpdate(state); }
            }
        }

        function openClip() {
            clearTimeout(timer);
            if (ended) return;
            if (!sameTracks() || document.hidden) { stop(false); return; }
            const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 480000, audioBitsPerSecond: 48000 });
            const from = Math.max(0, Math.floor(clock()));
            const chunks = [];
            const clip = { recorder, from, discard: false, size: 0 };
            current = clip;
            recorder.ondataavailable = e => {
                clip.size += e.data.size;
                if (!clip.discard && clip.size <= MAX_BYTES && e.data.size) chunks.push(e.data);
            };
            recorder.onerror = () => { stop(false); show('تعذّر تسجيل الصورة والصوت على هذا الجهاز.'); };
            recorder.onstop = () => {
                if (current === clip) current = null;
                if (cancelled) return;
                const to = clip.to ?? Math.max(from, Math.floor(clock()));
                const data = clip.eye || sample(from, to);
                const shouldSend = !clip.discard && clip.size && to - from >= 2 && to - from <= 25;
                if (!clip.discard && to - from > 25) state.skipped++;
                if (shouldSend) {
                    const mime = recorder.mimeType.split(';')[0];
                    send({ from, to, eye: data, mime, size: clip.size, blob: new Blob(chunks, { type: mime }) });
                }
                if (awaitingFinal) {
                    awaitingFinal = false;
                    if (!shouldSend && !state.pending) show('انتهت التجربة.');
                }
                if (!ended && state.sent < MAX_CLIPS) {
                    try { openClip(); } catch (_) { stop(false); show('تعذّر بدء مقطع جديد.'); }
                } else if (!ended) {
                    stop(false);
                    show('بلغ الوكيل حدّ المقاطع لهذه الجولة. الرصد المحلي مستمر.');
                }
            };
            recorder.start();
            timer = setTimeout(() => closeClip(clip), WINDOW_MS);
        }

        function closeClip(clip) {
            clip.to = Math.max(clip.from, Math.floor(clock()));
            clip.eye = sample(clip.from, clip.to);
            if (clip.recorder.state !== 'inactive') clip.recorder.stop();
        }

        function stop(final) {
            if (ended && final) return;
            ended = true;
            state.active = false;
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            if (current) {
                current.discard = !final;
                awaitingFinal = !!final;
                closeClip(current);
            }
            if (!final) controller?.abort();
            show(final && (current || state.pending) ? 'انتهت التجربة. جارٍ إكمال المراجعة…' : 'توقفت مشاركة الصورة والصوت.');
        }

        function onVisibility() {
            if (document.hidden) stop(false);
        }

        try { openClip(); } catch (err) { stop(false); throw err; }
        document.addEventListener('visibilitychange', onVisibility);
        show('مشاركة الكاميرا والميكروفون فعّالة. تظهر الملاحظات بعد كل مقطع.');
        return {
            stop,
            cancel() {
                cancelled = true;
                stop(false);
            }
        };
    }

    const api = { create, endpoint };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SvfEyeLab = api;
})(typeof window !== 'undefined' ? window : globalThis);
