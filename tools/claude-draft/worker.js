/* وسيط «مساعد الصياغة» — Cloudflare Worker (2026-10-29)
 *
 * يحفظ مفتاح Claude بعيداً عن الموقع (الموقع ملفّاتٌ عامّة: مفتاحٌ فيه يأخذه أيّ زائر ويستعمله على حسابك).
 * الموقع يرسل {system, user}؛ والوسيط يختار النموذج وحدّ الطول بنفسه — فلا يستطيع أحدٌ رفع التكلفة من الموقع.
 *
 * المتغيّرات في لوحة Cloudflare (Settings ← Variables and Secrets):
 *   ANTHROPIC_API_KEY  (سرّ)  مفتاح Claude من platform.claude.com
 *   SVF_KEY            (سرّ)  كلمةٌ طويلة تختارها، وتكتبها نفسها في إعدادات عين المشرف
 *   ALLOWED_ORIGINS    (اختياريّ) افتراضه https://supervisor-mct.com
 *   MODEL              (اختياريّ) افتراضه claude-sonnet-5-5
 * التفاصيل في README.md بجانبه.
 */
const MAX_IN = 24000;          // حرفاً للطلب كلّه — تقرير زيارةٍ كاملٌ أقلّ من ثلثها
const MAX_TOKENS = 2000;

const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, headers) });

export default {
    async fetch(req, env) {
        const allowed = String(env.ALLOWED_ORIGINS || 'https://supervisor-mct.com').split(',').map(s => s.trim()).filter(Boolean);
        const origin = req.headers.get('Origin') || '';
        const cors = {
            'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'content-type, x-svf-key',
            'Vary': 'Origin'
        };
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (req.method !== 'POST') return json({ error: 'POST فقط' }, 405, cors);
        if (!allowed.includes(origin)) return json({ error: 'مصدرٌ غير مسموح' }, 403, cors);
        if (!env.SVF_KEY || req.headers.get('x-svf-key') !== env.SVF_KEY) return json({ error: 'كلمة الوسيط غير صحيحة' }, 401, cors);
        if (!env.ANTHROPIC_API_KEY) return json({ error: 'مفتاح Claude غير مضبوط في الوسيط' }, 500, cors);

        let body;
        try { body = await req.json(); } catch (e) { return json({ error: 'طلبٌ غير مقروء' }, 400, cors); }
        const system = typeof body.system === 'string' ? body.system : '', user = typeof body.user === 'string' ? body.user : '';
        if (!user || system.length + user.length > MAX_IN) return json({ error: 'الطلب فارغٌ أو أطول من المسموح' }, 400, cors);

        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': env.API_VERSION || '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: MAX_TOKENS, system, messages: [{ role: 'user', content: user }] })
        });
        let j = {};
        try { j = await r.json(); } catch (e) { /* يُبلَّغ أدناه */ }
        if (!r.ok) return json({ error: (j.error && j.error.message) || ('Claude: ' + r.status) }, 502, cors);
        const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
        return json({ text, stop: j.stop_reason || '', usage: j.usage || null }, 200, cors);
    }
};
