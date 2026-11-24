// SohojPharma PWA Service Worker
const CACHE_NAME = 'sohojpharma-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let network handle all requests cleanly
  event.respondWith(fetch(event.request));
});
