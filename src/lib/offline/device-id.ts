// Stable per-browser device identifier kept in localStorage.
// Used for device binding (registered_devices) and sync log attribution.
const KEY = "pc.device.id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = (globalThis.crypto?.randomUUID?.() ?? `dev_${Math.random().toString(36).slice(2)}_${Date.now()}`);
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function getDeviceMeta() {
  if (typeof navigator === "undefined") {
    return { platform: "server", user_agent: "", device_name: "Server" };
  }
  const ua = navigator.userAgent;
  const platform =
    /android/i.test(ua) ? "android" :
    /iphone|ipad|ipod/i.test(ua) ? "ios" :
    /windows/i.test(ua) ? "windows" :
    /mac/i.test(ua) ? "macos" :
    /linux/i.test(ua) ? "linux" : "web";
  const device_name =
    /android/i.test(ua) ? "Android device" :
    /iphone/i.test(ua) ? "iPhone" :
    /ipad/i.test(ua) ? "iPad" :
    "Browser";
  return { platform, user_agent: ua.slice(0, 240), device_name };
}
