// =========================================================================
//  بوّابة الدخول — صفحات الموقع كلّها خلف رمز المشرف
//
//  الرمز هو **نفسه** رمز المشرف في نظام بيانات المعلمين: لا رموز جديدة ولا
//  تغيير لرموز المشرفين. التحقّق يجري في js/identity.js بالبصمات نفسها
//  (SUPERVISORS + ADMIN_HASH) التي يكتبها sync_supervisors.py.
//
//  ما تفعله هذه البوّابة وما لا تفعله:
//    • تمنع المتطفّل العابر من فتح الصفحات ورؤية التقارير وأدوات الرفع.
//    • **ليست حمايةً للبيانات**: الموقع صفحاتٌ ثابتةٌ على GitHub Pages، ومن
//      يعرف مسار ملفٍّ يقرؤه مباشرةً، وقاعدة المعلمين ما زالت مفتوحةً حتّى
//      تُفعَّل مصادقة Firebase. الحماية الحقيقيّة هناك لا هنا.
//
//  يُحمَّل في <head> قبل المحتوى: الجلسة تُقرأ فوراً فلا يظهر شيءٌ قبل الدخول.
// =========================================================================
(function (global) {
    'use strict';

    const KEY = 'svf_gate';
    const LOCK = 'data-svf-locked';

    function readSession() {
        try {
            const v = JSON.parse(localStorage.getItem(KEY) || 'null');
            return (v && typeof v.id === 'string' && /^[0-9a-f]{64}$/.test(v.hash || '')) ? v : null;
        } catch (e) { return null; }
    }

    function writeSession(who) {
        try {
            localStorage.setItem(KEY, JSON.stringify({
                id: who.id, name: who.name, hash: who.hash, admin: !!who.admin, at: Date.now()
            }));
        } catch (e) { /* جلسةٌ لا تُحفظ تعني سؤالاً في كلّ فتحة، لا منعاً */ }
    }

    // القفل يُوضع لحظة تنفيذ الملفّ (قبل رسم المحتوى) ويُرفع بعد الدخول
    function lock() { document.documentElement.setAttribute(LOCK, ''); }
    function unlock() { document.documentElement.removeAttribute(LOCK); }

    function injectStyle() {
        const css = `
            html[${LOCK}] body > *:not(#svfGate) { display: none !important; }
            html[${LOCK}] body { background: #0a1410; }
            #svfGate { position: fixed; inset: 0; z-index: 2147483000; display: flex;
                align-items: center; justify-content: center; padding: 20px;
                background: radial-gradient(120% 90% at 50% 0%, #16281f 0%, #0a1410 60%);
                font-family: 'Tajawal', system-ui, sans-serif; direction: rtl; }
            #svfGate .box { width: 100%; max-width: 380px; background: rgba(255,255,255,.06);
                border: 1px solid rgba(247,245,238,.16); border-radius: 22px; padding: 28px 24px;
                box-shadow: 0 24px 60px rgba(0,0,0,.45); backdrop-filter: blur(8px); text-align: center; }
            #svfGate h1 { color: #f7f5ee; font-size: 19px; font-weight: 700; margin: 0 0 6px; }
            #svfGate p  { color: rgba(247,245,238,.62); font-size: 13px; margin: 0 0 20px; line-height: 1.7; }
            #svfGate input { width: 100%; box-sizing: border-box; text-align: center; letter-spacing: 3px;
                background: rgba(10,20,16,.5); border: 1px solid rgba(247,245,238,.22); color: #f7f5ee;
                border-radius: 12px; padding: 12px; font-size: 16px; font-family: inherit; }
            #svfGate input:focus { outline: 2px solid #f0b44a; outline-offset: 1px; }
            #svfGate button { width: 100%; margin-top: 12px; background: #f0b44a; color: #16281f;
                border: 0; border-radius: 12px; padding: 12px; font-size: 15px; font-weight: 700;
                font-family: inherit; cursor: pointer; }
            #svfGate button:disabled { opacity: .6; cursor: default; }
            #svfGate .msg { color: #ffb4a2; font-size: 13px; margin-top: 12px; min-height: 18px; }
            #svfGate .foot { color: rgba(247,245,238,.38); font-size: 11px; margin: 18px 0 0; }
            #svfLogout { position: fixed; inset-block-end: 14px; inset-inline-start: 14px; z-index: 2147482000;
                background: rgba(10,20,16,.72); color: #f7f5ee; border: 1px solid rgba(247,245,238,.2);
                border-radius: 999px; padding: 6px 14px; font: 600 12px 'Tajawal', system-ui, sans-serif;
                cursor: pointer; opacity: .55; transition: opacity .15s; }
            #svfLogout:hover { opacity: 1; }
            @media print { #svfGate, #svfLogout { display: none !important; } }
        `;
        const el = document.createElement('style');
        el.id = 'svfGateStyle';
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
    }

    function render() {
        if (document.getElementById('svfGate')) return;
        const box = document.createElement('div');
        box.id = 'svfGate';
        box.innerHTML = `
            <form class="box" id="svfGateForm" autocomplete="off">
                <h1>منظومة الإشراف التربوي</h1>
                <p>الدخول برمز المشرف نفسه المستعمل في نظام بيانات المعلمين.</p>
                <input id="svfGateCode" type="password" inputmode="text" autocomplete="off"
                       placeholder="رمز المشرف" aria-label="رمز المشرف">
                <button type="submit" id="svfGateBtn">دخول</button>
                <p class="msg" id="svfGateMsg" role="status"></p>
                <p class="foot">الرياضة المدرسية — محافظة مسقط</p>
            </form>`;
        document.body.appendChild(box);
        document.getElementById('svfGateForm').addEventListener('submit', submit);
        setTimeout(() => document.getElementById('svfGateCode')?.focus(), 60);
    }

    async function submit(e) {
        e.preventDefault();
        const input = document.getElementById('svfGateCode');
        const btn = document.getElementById('svfGateBtn');
        const msg = document.getElementById('svfGateMsg');
        const code = (input?.value || '').trim();
        msg.textContent = '';

        if (!code) { msg.textContent = 'أدخل رمزك أولاً.'; return; }
        if (!global.SupervisorIdentity || typeof SupervisorIdentity.verifyCode !== 'function') {
            msg.textContent = 'تعذّر التحقّق — أعد تحميل الصفحة.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'جارٍ التحقّق…';
        let who = null;
        try { who = await SupervisorIdentity.verifyCode(code); } catch (err) { who = null; }
        btn.disabled = false;
        btn.textContent = 'دخول';

        if (!who) {
            msg.textContent = 'رمز غير صحيح.';
            input.value = '';
            input.focus();
            return;
        }

        writeSession(who);
        // الرمز نفسه يربط المشرف بمعلّميه — بلا سؤالٍ ثانٍ ولا رمزٍ آخر.
        // تُحفظ الهويّة فوراً، وسحب المعلّمين يجري في أوّل صفحةٍ تحمل الوحدة:
        // الانتقال بعد الدخول مباشرةً يقطع أيّ طلبٍ يُبدأ هنا.
        try {
            if (!who.admin && !SupervisorIdentity.getIdentity()) SupervisorIdentity.adopt(who);
        } catch (err) { /* الربط تحسينٌ لا شرطٌ للدخول */ }
        open();
    }

    function open() {
        document.getElementById('svfGate')?.remove();
        unlock();
        addLogout();
        try { document.dispatchEvent(new CustomEvent('svf-gate-open')); } catch (e) {}
    }

    function addLogout() {
        if (document.getElementById('svfLogout')) return;
        const s = readSession();
        const b = document.createElement('button');
        b.id = 'svfLogout';
        b.type = 'button';
        b.textContent = 'خروج' + (s && s.name ? ' · ' + s.name : '');
        b.title = 'إنهاء الجلسة على هذا الجهاز';
        b.addEventListener('click', () => {
            try { localStorage.removeItem(KEY); } catch (e) {}
            location.reload();
        });
        document.body.appendChild(b);
    }

    function start() {
        injectStyle();
        if (readSession()) { unlock(); addLogout(); return; }
        render();
    }

    lock();   // يُقفل فوراً: لا يُرى المحتوى قبل الحكم على الجلسة
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    global.SupervisorGate = {
        session: readSession,
        isOpen: () => !!readSession(),
        logout: () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); }
    };
})(typeof window !== 'undefined' ? window : globalThis);
