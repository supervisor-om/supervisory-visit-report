// =========================================================================
// عين المشرف — كاميرا الهاتف (منذ 2026-10-26)
//
// طلب المشرف: «أضع الـiPhone على حاملٍ في الملعب، وأتابع الحصة وأقيّم من الـiPad» — والجهازان على نقطة اتّصال
// الـiPhone الشخصيّة. Apple لا تعكس كاميرا الـiPhone إلى الـiPad (لا AirPlay ولا Continuity Camera إليه)، فالربط
// هنا من المتصفّح نفسه:
//
//   • الـiPhone (cam.html) يلتقط بالعدسة العريضة ويرسل الصورة **مباشرةً** إلى الـiPad عبر WebRTC — على الشبكة
//     المحلّيّة، مشفّرةً (DTLS-SRTP)، لا تمرّ بخادمٍ ولا تُسجَّل. والـiPad يحلّلها كما يحلّل كاميرته (eye.js).
//   • **الربط** (تبادل وصف الاتّصال SDP مرّةً واحدة) عبر وثيقةٍ صغيرةٍ في مسار المشرف نفسه
//     `reports/<المعرّف>/items/svf_eyelink_<الرمز>` — القواعد المنشورة تقبلها بشكل التقارير (key/kind/updatedAt/json)،
//     والمزامنة السحابيّة (js/cloud.js) **تتجاهلها** لأنّ مفتاحها خارج بادئتي التقارير. لا تُحذف (القواعد تمنع الحذف):
//     بعد الاتّصال يُفرَّغ نصّها وتُعلَّم deleted. والرمز عشرة أحرفٍ عشوائيّة، وصلاحيّته ربع ساعة.
//   • **قناة بيانات** للتحكّم من الـiPad: قائمة عدسات الهاتف واختيار إحداها، والتقريب إن أتاحه المتصفّح.
//
// الدوالّ النقيّة (الرمز، الرابط، شكل الوثيقة، اختيار العدسة) تُصدَّر لـnode وتُختبر في tests/eye.test.js.
// =========================================================================
(function (root) {
    'use strict';

    const PREFIX = 'svf_eyelink_';
    const CODE_RE = /^[a-z0-9]{10}$/;
    const SUP_RE = /^[a-z][a-z0-9-]{1,30}$/;               // كقاعدة المسار في firestore.rules
    const TTL_MS = 15 * 60 * 1000;                          // صلاحيّة الرمز
    const POLL_MS = 1200;
    const ICE = [{ urls: 'stun:stun.l.google.com:19302' }]; // للاحتياط؛ على نقطة الاتّصال يكفي العنوان المحلّيّ
    // العدسة العريضة جدّاً (0.5×): أسماء الأجهزة تختلف بلغة النظام، فالمطابقة متسامحة
    const ULTRA_RE = /ultra.?wide|ultrawide|0[.,]5|فائق|واسعة جد|عريضة جد|ultra/i;
    const BACK_RE = /back|rear|environment|خلف/i;
    const FRONT_RE = /front|user|face|أمام/i;
    const VIRTUAL_RE = /dual|triple|ثنائي|ثلاثي/i;          // أجهزةٌ افتراضيّة تبدّل العدسة وحدها

    function newCode() {
        const abc = 'abcdefghijkmnpqrstuvwxyz23456789';          // بلا حروفٍ ملتبسة (l/1/o/0)
        const out = [];
        const bytes = new Uint8Array(10);
        const c = (root.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null));
        if (c && c.getRandomValues) c.getRandomValues(bytes); else for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
        bytes.forEach(b => out.push(abc[b % abc.length]));
        return out.join('');
    }
    const docKey = code => PREFIX + code;
    function linkUrl(base, sup, code) {
        const u = String(base || '').replace(/[#?].*$/, '').replace(/\/[^/]*$/, '/');
        return u + 'cam.html#' + sup + '.' + code;
    }
    function parseHash(hash) {
        const m = String(hash || '').replace(/^#/, '').trim().toLowerCase().match(/^([a-z][a-z0-9-]{1,30})\.([a-z0-9]{10})$/);
        return m && SUP_RE.test(m[1]) && CODE_RE.test(m[2]) ? { sup: m[1], code: m[2] } : null;
    }
    // وثيقة الربط بشكل التقرير الذي تقبله القواعد — json نصٌّ (الوصف)، وبعد الاتّصال تُفرَّغ وتُعلَّم deleted
    function signalDoc(code, payload) {
        return { key: docKey(code), kind: 'supervision', updatedAt: Date.now(), json: JSON.stringify(Object.assign({ v: 1 }, payload || {})) };
    }
    function tombstone(code) { return { key: docKey(code), kind: 'supervision', updatedAt: Date.now(), json: '', deleted: true }; }
    function readSignal(doc) {
        if (!doc || doc.deleted || typeof doc.json !== 'string' || !doc.json) return null;
        try { const p = JSON.parse(doc.json); return p && typeof p === 'object' ? p : null; } catch (e) { return null; }
    }
    // عدسات الهاتف الخلفيّة مرتّبة: العريضة جدّاً أوّلاً، ثمّ الخلفيّة الفعليّة، ثمّ الافتراضيّة؛ والأماميّة آخراً
    function rankCams(devices) {
        const cams = (devices || []).filter(d => d && d.kind === 'videoinput');
        const rank = d => {
            const l = d.label || '';
            if (FRONT_RE.test(l)) return 9;
            if (ULTRA_RE.test(l)) return 0;
            if (VIRTUAL_RE.test(l)) return 4;
            if (BACK_RE.test(l)) return 2;
            return 5;
        };
        return cams.map((d, i) => ({ id: d.deviceId, label: d.label || ('كاميرا ' + (i + 1)), ultra: ULTRA_RE.test(d.label || '') && !FRONT_RE.test(d.label || ''), front: FRONT_RE.test(d.label || ''), r: rank(d), i }))
            .sort((a, b) => a.r - b.r || a.i - b.i).map(c => { delete c.r; delete c.i; return c; });
    }
    function pickLens(devices) {
        const ranked = rankCams(devices);
        return ranked.find(c => c.ultra) || ranked.find(c => !c.front) || ranked[0] || null;
    }
    // اسمٌ قصيرٌ للعدسة على الزرّ (أسماء iOS طويلة وبلغة النظام)
    function lensLabel(label, ultra) {
        const l = String(label || '');
        if (ultra || (ULTRA_RE.test(l) && !FRONT_RE.test(l))) return 'العريضة جدّاً';
        if (/tele|مقرّب|مقرب/i.test(l)) return 'المقرّبة';
        if (/triple|ثلاثي/i.test(l)) return 'الثلاثيّة (تلقائيّ)';
        if (/dual|ثنائي|مزدوج/i.test(l)) return 'المزدوجة (تلقائيّ)';
        if (FRONT_RE.test(l)) return 'الأماميّة';
        if (BACK_RE.test(l)) return 'العاديّة (×1)';
        return l.slice(0, 24) || 'كاميرا';
    }

    // ── مخزن الربط ── Firestore في مسار المشرف، أو localStorage للاختبار المحلّيّ (SVF_EYELINK_STORE = 'local')
    function storeFor(sup) {
        if (root.SVF_EYELINK_STORE === 'local') {
            return {
                get: async key => { try { return JSON.parse(localStorage.getItem('svf_eyelink_test_' + key) || 'null'); } catch (e) { return null; } },
                set: async (key, doc) => { localStorage.setItem('svf_eyelink_test_' + key, JSON.stringify(doc)); }
            };
        }
        const sdk = () => {
            if (!root.SupervisorIdentity || !SupervisorIdentity.loadSdk) return Promise.reject(new Error('وحدة الهويّة غير محمّلة'));
            return SupervisorIdentity.loadSdk();
        };
        return {
            get: async key => { const fb = await sdk(); const s = await fb.getDoc(fb.doc(fb.db, 'reports', sup, 'items', key)); return s.exists() ? s.data() : null; },
            set: async (key, doc) => { const fb = await sdk(); await fb.setDoc(fb.doc(fb.db, 'reports', sup, 'items', key), doc); }
        };
    }

    // اكتمال جمع عناوين الاتّصال — أو ما جُمع خلال مهلةٍ قصيرة (العنوان المحلّيّ يأتي أوّلاً)
    function gathered(pc, ms) {
        if (pc.iceGatheringState === 'complete') return Promise.resolve();
        return new Promise(res => {
            const t = setTimeout(done, ms || 2500);
            function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', chk); res(); }
            function chk() { if (pc.iceGatheringState === 'complete') done(); }
            pc.addEventListener('icegatheringstatechange', chk);
        });
    }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function channel(dc, onMessage) {
        dc.onmessage = e => { let m = null; try { m = JSON.parse(e.data); } catch (x) { m = null; } if (m && onMessage) onMessage(m); };
        return m => { try { if (dc.readyState === 'open') dc.send(JSON.stringify(m)); } catch (e) { /* القناة أُغلقت */ } };
    }

    // ── الـiPad: ينشئ الرمز والعرض، وينتظر جواب الهاتف ثمّ يستقبل الصورة ──
    // opts: {sup, onStream(stream), onState(state), onMessage(msg)} ← {code, url, send, close}
    async function host(opts) {
        const o = opts || {};
        if (!SUP_RE.test(o.sup || '')) throw new Error('مسار المشرف غير صالح');
        const code = newCode(), key = docKey(code), store = storeFor(o.sup);
        const state = s => { try { o.onState && o.onState(s); } catch (e) { /* الواجهة */ } };
        const pc = new RTCPeerConnection({ iceServers: ICE });
        pc.addTransceiver('video', { direction: 'recvonly' });
        const dc = pc.createDataChannel('svf-ctl');
        const send = channel(dc, o.onMessage);
        dc.onopen = () => state('channel');
        pc.ontrack = e => { try { o.onStream && o.onStream(e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track])); } catch (x) { /* الواجهة */ } };
        pc.onconnectionstatechange = () => state(pc.connectionState);
        let closed = false;
        await pc.setLocalDescription(await pc.createOffer());
        await gathered(pc);
        await store.set(key, signalDoc(code, { offer: pc.localDescription.sdp, at: Date.now() }));
        state('waiting');
        (async () => {                                       // انتظار الجواب
            const t0 = Date.now();
            while (!closed && Date.now() - t0 < TTL_MS) {
                await sleep(Date.now() - t0 < 120000 ? POLL_MS : 3000);   // بعد دقيقتين يتمهّل: قراءاتٌ أقلّ من القاعدة
                let p = null;
                try { p = readSignal(await store.get(key)); } catch (e) { p = null; }
                if (closed) return;
                if (p && p.answer) {
                    try { await pc.setRemoteDescription({ type: 'answer', sdp: p.answer }); state('connecting'); }
                    catch (e) { state('failed'); }
                    try { await store.set(key, tombstone(code)); } catch (e) { /* يبقى حتّى تنتهي صلاحيّته */ }
                    return;
                }
            }
            if (!closed) state('expired');
        })();
        return {
            code, url: linkUrl(root.location ? root.location.href : '', o.sup, code), send,
            close() {
                if (closed) return;
                closed = true;
                try { dc.close(); } catch (e) {}
                try { pc.close(); } catch (e) {}
                store.set(key, tombstone(code)).catch(() => {});
            },
            pc
        };
    }

    // ── الـiPhone: يقرأ عرض الـiPad ويجيب ويرسل الصورة ──
    // opts: {sup, code, stream, onState, onMessage} ← {send, replaceTrack, close}
    async function join(opts) {
        const o = opts || {};
        if (!SUP_RE.test(o.sup || '') || !CODE_RE.test(o.code || '')) throw new Error('رابط الربط غير صالح');
        const key = docKey(o.code), store = storeFor(o.sup);
        const state = s => { try { o.onState && o.onState(s); } catch (e) { /* الواجهة */ } };
        const p = readSignal(await store.get(key));
        if (!p || !p.offer) throw new Error('الرمز غير صالحٍ أو استُعمل — افتح «كاميرا الهاتف» في الـiPad من جديد');
        if (p.at && Date.now() - p.at > TTL_MS) throw new Error('انتهت صلاحيّة الرمز — افتح «كاميرا الهاتف» في الـiPad من جديد');
        const pc = new RTCPeerConnection({ iceServers: ICE });
        let send = () => {};
        pc.ondatachannel = e => { send = channel(e.channel, o.onMessage); e.channel.onopen = () => state('channel'); };
        pc.onconnectionstatechange = () => state(pc.connectionState);
        await pc.setRemoteDescription({ type: 'offer', sdp: p.offer });
        const track = o.stream.getVideoTracks()[0];
        const sender = pc.addTrack(track, o.stream);
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        await store.set(key, signalDoc(o.code, { offer: p.offer, answer: pc.localDescription.sdp, at: p.at || Date.now() }));
        state('connecting');
        // صورةٌ واضحةٌ للكشف: معدّلٌ أعلى ممّا يختاره المتصفّح افتراضاً (الشبكة محلّيّة)
        pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState !== 'connected') return;
            try {
                const prm = sender.getParameters();
                prm.encodings = prm.encodings && prm.encodings.length ? prm.encodings : [{}];
                prm.encodings[0].maxBitrate = 4000000;
                sender.setParameters(prm).catch(() => {});
            } catch (e) { /* المتصفّح يختار */ }
        });
        return {
            send: m => send(m),
            replaceTrack: t => sender.replaceTrack(t),
            close() { try { pc.close(); } catch (e) {} },
            pc
        };
    }

    const api = { PREFIX, TTL_MS, ULTRA_RE, newCode, docKey, linkUrl, parseHash, signalDoc, tombstone, readSignal, rankCams, pickLens, lensLabel, storeFor, host, join };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    root.SvfEyeLink = api;
})(typeof window !== 'undefined' ? window : this);
