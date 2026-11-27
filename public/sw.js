// SohojPharma Offline-First PWA Service Worker
const SW_VERSION = "__SW_CACHE_VERSION__";
const STATIC_CACHE = `sohojpharma-assets-${SW_VERSION}`;
const PAGE_CACHE = `sohojpharma-pages-${SW_VERSION}`;
const KNOWN_CACHES = new Set([STATIC_CACHE, PAGE_CACHE]);

const FALLBACK_ROUTES = [
  "/m",
  "/m/sale",
  "/m/sales",
  "/m/products",
  "/m/customers",
  "/m/purchase",
  "/m/purchases",
  "/m/inventory",
  "/m/collect",
  "/m/sync",
  "/store",
  "/sales/pos",
  "/sales",
  "/customers",
  "/products",
  "/purchases",
  "/purchases/new",
];

const FALLBACK_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

async function cacheBatch(cache, urls, concurrency = 10) {
  for (let i = 0; i < urls.length; i += concurrency) {
    const slice = urls.slice(i, i + concurrency);
    await Promise.allSettled(
      slice.map(async (url) => {
        const hit = await cache.match(url);
        if (hit) return;
        const res = await fetch(url, { cache: "no-cache" });
        if (res && res.ok && !res.redirected) {
          await cache.put(url, res);
        }
      }),
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      let assets = FALLBACK_ASSETS;
      let routes = FALLBACK_ROUTES;
      try {
        const manifestRes = await fetch("/sw-precache.json", { cache: "no-store" });
        if (manifestRes && manifestRes.ok) {
          const parsed = await manifestRes.json();
          if (Array.isArray(parsed.assets) && parsed.assets.length > 0) assets = parsed.assets;
          if (Array.isArray(parsed.routes) && parsed.routes.length > 0) routes = parsed.routes;
        }
      } catch {
        // use built-in fallback lists
      }

      const [staticCache, pageCache] = await Promise.all([
        caches.open(STATIC_CACHE),
        caches.open(PAGE_CACHE),
      ]);
      await Promise.allSettled([
        cacheBatch(staticCache, assets, 12),
        cacheBatch(pageCache, routes, 6),
      ]);
      await self.skipWaiting();
    })(),
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

  // Never intercept server function RPCs or API routes in SW (handled by IndexedDB + app sync engine)
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/") || url.pathname === "/sw-precache.json") {
    return;
  }

  // 1. Static assets & JS chunks: Cache-First + populate on network miss
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request) || await cache.match(url.pathname);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res && res.ok) {
            cache.put(event.request, res.clone());
          }
          return res;
        } catch {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      }),
    );
    return;
  }

  // 2. HTML Navigations: Network-First with timeout -> exact cache -> pathname cache -> app shell fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        try {
          const res = await networkWithTimeout(event.request, 3500);
          if (res && res.ok && !res.redirected) {
            cache.put(event.request, res.clone());
            cache.put(url.pathname, res.clone());
          }
          return res;
        } catch {
          const exact = (await cache.match(event.request)) || (await cache.match(url.pathname));
          if (exact) return exact;
          // Any mobile or desktop app shell cached route mounts TanStack Router at the current URL offline
          if (url.pathname.startsWith("/m")) {
            const mShell = await cache.match("/m");
            if (mShell) return mShell;
          } else {
            const deskShell = (await cache.match("/store")) || (await cache.match("/sales/pos")) || (await cache.match("/m"));
            if (deskShell) return deskShell;
          }
          return new Response(
            "<!doctype html><html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><body style='font-family:sans-serif;padding:24px;text-align:center'><h2>অফলাইন মোড</h2><p>এই পেজটি এখনো ক্যাশ করা হয়নি।</p><a href='/m' style='display:inline-block;margin-top:12px;padding:10px 18px;background:#0d5c46;color:#fff;border-radius:8px;text-decoration:none'>মোবাইল হোমে যান</a></body></html>",
            { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      }),
    );
  }
});
