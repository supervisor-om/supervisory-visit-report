const CACHE_NAME = 'supervisory-v1';
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
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/html-docx-js/dist/html-docx.js',
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&family=Noto+Naskh+Arabic:wght@400;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (!response || response.status !== 200) return response;
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            });
        }).catch(() => {
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});