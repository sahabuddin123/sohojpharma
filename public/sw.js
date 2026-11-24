// SohojPharma PWA Service Worker
const CACHE_NAME = 'sohojpharma-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 1. Ignore non-GET requests (POST, PUT, DELETE for API & auth)
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. Ignore non-HTTP/HTTPS schemes (e.g. chrome-extension://)
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  // 3. Never intercept external 3rd-party domains (Cloudflare insights, analytics, external CDNs)
  // Let the browser handle them directly so ad-blockers / Brave Shields do not cause fetch rejections
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // 4. Safe fetch handler with catch fallback
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('', { status: 408, statusText: 'Network timeout' });
    })
  );
});
