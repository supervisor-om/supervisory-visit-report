// =========================================================================
// Service Worker — نظام التقارير الإشرافية
//
// الاستراتيجية:
//   • ملفات التطبيق (نفس الأصل) → الشبكة أولاً، والذاكرة احتياط عند انقطاعها
//     بهذا تصل التحديثات المنشورة فوراً بدل بقاء المشرف على نسخة قديمة.
//   • المكتبات الخارجية (مثبّتة الإصدار) → الذاكرة أولاً، فهي لا تتغيّر.
//
// عند أي تعديل جوهري: ارفع رقم VERSION لتُمسح الذاكرة القديمة تلقائياً.
// =========================================================================
const VERSION = 'v2';
const CACHE_NAME = `supervisory-${VERSION}`;

const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './js/state.js',
    './js/templates.js',
    './js/utils.js',
    './js/supervisory.js',
    './js/school.js',
    './js/charts.js',
    './js/export.js',
    './js/storage.js',
    './js/db.js',
    './js/init.js',
    './manifest.json',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js',
    'https://unpkg.com/html-docx-js@0.3.1/dist/html-docx.js',
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&family=Noto+Naskh+Arabic:wght@400;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// التثبيت: خزّن كل أصل على حدة حتى لا يُفشل تعثّرُ واحدٍ العمليةَ كلها
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.allSettled(ASSETS.map(a => cache.add(a))))
            .then(() => self.skipWaiting())
    );
});

// التفعيل: امسح أي ذاكرة من إصدار سابق ثم تولَّ التحكم فوراً
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

function putInCache(request, response) {
    if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
    }
    return response;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const sameOrigin = new URL(request.url).origin === self.location.origin;

    // ملفات التطبيق: الشبكة أولاً
    if (request.mode === 'navigate' || sameOrigin) {
        event.respondWith(
            fetch(request)
                .then(response => putInCache(request, response))
                .catch(() => caches.match(request).then(cached => {
                    if (cached) return cached;
                    if (request.mode === 'navigate') return caches.match('./index.html');
                    return Response.error();
                }))
        );
        return;
    }

    // مكتبات خارجية: الذاكرة أولاً
    event.respondWith(
        caches.match(request).then(cached =>
            cached || fetch(request).then(response => putInCache(request, response))
        )
    );
});
