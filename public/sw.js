// SohojPharma Offline-First PWA Service Worker
const STATIC_CACHE = "sohojpharma-assets-v3";
const PAGE_CACHE = "sohojpharma-pages-v3";
const KNOWN_CACHES = new Set([STATIC_CACHE, PAGE_CACHE]);

const PRECACHE_URLS = [
  "/m",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            fetch(url, { cache: "reload" }).then((res) => {
              if (res && res.ok) return cache.put(url, res);
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KNOWN_CACHES.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    /\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico|webmanifest)$/i.test(pathname)
  );
}

async function networkWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http://") && !event.request.url.startsWith("https://")) return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept server function RPCs or API routes in SW (handled by app/IndexedDB)
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) {
    return;
  }

  // 1. Static assets: Cache-First + background populate
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res && res.ok) cache.put(event.request, res.clone());
          return res;
        } catch {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      }),
    );
    return;
  }

  // 2. HTML Navigations: Network-First with 3.5s timeout -> cached page -> /m app shell fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        try {
          const res = await networkWithTimeout(event.request, 3500);
          if (res && res.ok) cache.put(event.request, res.clone());
          return res;
        } catch {
          const exact = await cache.match(event.request);
          if (exact) return exact;
          if (url.pathname.startsWith("/m")) {
            const shell = await cache.match("/m");
            if (shell) return shell;
          }
          return new Response(
            "<!doctype html><html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><body style='font-family:sans-serif;padding:24px;text-align:center'><h2>অফলাইন মোড</h2><p>এই পেজটি অফলাইনে ক্যাশ করা নেই। পূর্বে ভিজিট করা /m পেজ ব্যবহার করুন।</p><a href='/m' style='display:inline-block;margin-top:12px;padding:10px 18px;background:#0d5c46;color:#fff;border-radius:8px;text-decoration:none'>হোমে যান</a></body></html>",
            { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      }),
    );
  }
});
