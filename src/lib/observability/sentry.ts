// PHASE 11.7 — Sentry init shim.
// No-op until VITE_SENTRY_DSN is provided. Once configured, dynamically
// loads @sentry/react so bundles stay clean for projects without Sentry.
import { setSentry, APP_RELEASE } from "./capture";

let initialised = false;

export async function initSentry(opts?: { tenantId?: string | null; userId?: string | null }) {
  if (initialised || typeof window === "undefined") return;
  const dsn = (import.meta as { env?: { VITE_SENTRY_DSN?: string } }).env?.VITE_SENTRY_DSN;
  if (!dsn) return; // intentional no-op
  initialised = true;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      release: APP_RELEASE,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0,
      sendDefaultPii: false,
    });
    if (opts?.userId) Sentry.setUser({ id: opts.userId });
    if (opts?.tenantId) Sentry.setTag("tenant_id", opts.tenantId);
    setSentry({
      captureException: (e) => Sentry.captureException(e),
      captureMessage: (m) => Sentry.captureMessage(m),
      withScope: (cb) => Sentry.withScope(cb as never),
    });
  } catch {
    // Sentry not installed yet — stays no-op.
  }
}
