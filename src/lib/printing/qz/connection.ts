// QZ Tray connection lifecycle. Loaded lazily so SSR and Chrome-only flows
// never touch the qz-tray module.
import type { QzStatus } from "../types";

type QzModule = typeof import("qz-tray");
type Qz = QzModule extends { default: infer D } ? D : QzModule;

let qzPromise: Promise<Qz> | null = null;

async function loadQz(): Promise<Qz> {
  if (!qzPromise) {
    qzPromise = import("qz-tray").then((m) => {
      const mod = (m as unknown as { default?: Qz }).default ?? (m as unknown as Qz);
      return mod;
    });
  }
  return qzPromise;
}

export async function getQz(): Promise<Qz | null> {
  if (typeof window === "undefined") return null;
  try {
    return await loadQz();
  } catch {
    return null;
  }
}

export async function connect(): Promise<QzStatus> {
  const qz = await getQz();
  if (!qz) return { available: false, connected: false, error: "QZ module unavailable" };
  try {
    // Initialize production security layer (additive, never throws).
    try {
      const { initQzSecurity } = await import("./security");
      await initQzSecurity();
    } catch { /* never block connect */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = qz as any;
    if (api.websocket?.isActive?.()) {
      const version = await safeVersion(api);
      return { available: true, connected: true, version };
    }
    await api.websocket.connect({ retries: 0, delay: 1 });
    const version = await safeVersion(api);
    return { available: true, connected: true, version };
  } catch (err) {
    return { available: true, connected: false, error: friendly(err) };
  }
}

export async function disconnect(): Promise<void> {
  const qz = await getQz();
  if (!qz) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = qz as any;
  try {
    if (api.websocket?.isActive?.()) {
      await api.websocket.disconnect();
    }
  } catch {
    /* noop */
  }
}

export async function reconnect(): Promise<QzStatus> {
  await disconnect();
  return connect();
}

export async function isConnected(): Promise<boolean> {
  const qz = await getQz();
  if (!qz) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = qz as any;
  return Boolean(api.websocket?.isActive?.());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeVersion(api: any): Promise<string | undefined> {
  try { return await api.api?.getVersion?.(); } catch { return undefined; }
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/refus|denied|not running|websocket/i.test(msg)) return "QZ Tray is not running or unreachable.";
  return msg;
}
