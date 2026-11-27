// Guarded service-worker registration. Never registers in dev, Lovable preview,
// inside an iframe, or when the URL has ?sw=off. In any refused context, any
// existing /sw.js registration is unregistered to clean up stale workers.

const SW_URL = "/sw.js?v=5";

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  if (new URL(window.location.href).searchParams.get("sw") === "off") return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => {
        const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        return url.includes("/sw.js");
      })
      .map((r) => r.unregister()),
  );
}

export async function registerPWA(
  onUpdate?: (reload: () => void) => void,
): Promise<void> {
  if (isRefusedContext()) {
    await unregisterMatching().catch(() => {});
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox(SW_URL, { scope: "/", updateViaCache: "none" });

    wb.addEventListener("waiting", () => {
      onUpdate?.(() => {
        wb.addEventListener("controlling", () => window.location.reload());
        wb.messageSkipWaiting();
      });
    });

    const reg = await wb.register();
    if (navigator.onLine) {
      await reg?.update().catch(() => {});
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage({ type: "REFRESH_PRECACHE" });
    }
  } catch (err) {
    console.warn("[pwa] registration failed", err);
  }
}
