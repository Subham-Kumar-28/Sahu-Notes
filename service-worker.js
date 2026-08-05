const CACHE_NAME = 'notes-app-v4';
const APP_SHELL = [
    '/',
    '/manifest.json',
    '/offline.html',
    '/public/app.css',
    '/public/app.js',
    '/public/icons/icon-192.png',
    '/public/icons/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Cache-first for app shell, network-first for API, stale-while-revalidate for uploads
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // API calls: network first, fall back to cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return res;
                })
                .catch(() => caches.match(request).then(m => m || new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                })))
        );
        return;
    }

    // Navigation: network-first so updates always appear, fall back to cache, offline page last
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('/', clone));
                    return res;
                })
                .catch(() => caches.match('/').then(m => m || caches.match('/offline.html')))
        );
        return;
    }

    // Static assets: network-first with cache fallback (offline support)
    event.respondWith(
        fetch(request)
            .then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return res;
            })
            .catch(() => caches.match(request).then(m => m || caches.match('/offline.html')))
    );
});

