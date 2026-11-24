// PHASE 11.7 — Unified observability façade.
// Routes events to (1) Sentry if VITE_SENTRY_DSN is configured, and
// (2) the existing public.error_logs table via captureError.
// Safe to call from anywhere; never throws.
import { supabase } from "@/integrations/supabase/client";

export const APP_RELEASE =
  (import.meta as { env?: { VITE_APP_VERSION?: string } }).env?.VITE_APP_VERSION ??
  "1.0.0-RC1";

type Level = "fatal" | "error" | "warning" | "info" | "debug";
type Source = "frontend" | "server_fn" | "edge" | "db" | "rpc" | "network";

export interface CaptureOpts {
  level?: Level;
  source?: Source;
  tenantId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  route?: string;
  tags?: Record<string, string>;
  context?: Record<string, unknown>;
  /** Logical category for Sentry alert rules (e.g. "journal", "checkout"). */
  category?:
    | "journal"
    | "checkout"
    | "inventory"
    | "rls"
    | "payment"
    | "cash_register"
    | "ocr"
    | "rpc"
    | "network"
    | "ui";
}

// ---- Sentry (loaded lazily; no-op until DSN configured) ---------------------
type SentryLike = {
  captureException: (e: unknown, hint?: unknown) => void;
  captureMessage: (msg: string, hint?: unknown) => void;
  setTag?: (k: string, v: string) => void;
  setUser?: (u: { id?: string } | null) => void;
  withScope?: (cb: (scope: unknown) => void) => void;
};
let sentry: SentryLike | null = null;
export function setSentry(client: SentryLike | null) {
  sentry = client;
}

// ---- Internal: persist to error_logs ----------------------------------------
async function persist(message: string, stack: string | null, opts: CaptureOpts) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from("error_logs").insert({
      user_id: opts.userId ?? auth.user?.id ?? null,
      tenant_id: opts.tenantId ?? null,
      level: (opts.level ?? "error") as never,
      source: (opts.source ?? "frontend") as never,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000) ?? null,
      route: opts.route ?? (typeof window !== "undefined" ? window.location.pathname : null),
      release: APP_RELEASE,
      context: {
        ...(opts.context ?? {}),
        tags: opts.tags ?? {},
        category: opts.category,
        branch_id: opts.branchId ?? null,
      } as never,
    });
  } catch {
    /* never let logging break the app */
  }
}

function applyScope(opts: CaptureOpts) {
  if (!sentry?.withScope) return;
  sentry.withScope((scope: unknown) => {
    const s = scope as {
      setTag: (k: string, v: string) => void;
      setUser: (u: { id?: string } | null) => void;
      setContext: (k: string, v: unknown) => void;
      setLevel?: (l: Level) => void;
    };
    if (opts.tenantId) s.setTag("tenant_id", opts.tenantId);
    if (opts.branchId) s.setTag("branch_id", opts.branchId);
    if (opts.route) s.setTag("route", opts.route);
    if (opts.category) s.setTag("category", opts.category);
    if (opts.source) s.setTag("source", opts.source);
    s.setTag("release", APP_RELEASE);
    if (opts.userId) s.setUser({ id: opts.userId });
    if (opts.context) s.setContext("context", opts.context);
    if (opts.tags) for (const [k, v] of Object.entries(opts.tags)) s.setTag(k, v);
    if (opts.level && s.setLevel) s.setLevel(opts.level);
  });
}

// ---- Public API -------------------------------------------------------------
export function captureException(err: unknown, opts: CaptureOpts = {}) {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  const stack = err instanceof Error ? err.stack ?? null : null;
  applyScope(opts);
  try { sentry?.captureException(err); } catch { /* ignore */ }
  void persist(message, stack, opts);
}

export function captureMessage(message: string, opts: CaptureOpts = {}) {
  applyScope(opts);
  try { sentry?.captureMessage(message); } catch { /* ignore */ }
  void persist(message, null, { ...opts, level: opts.level ?? "info" });
}

/** Time an async operation; emits a warning when slow, exception on failure. */
export async function capturePerformance<T>(
  name: string,
  fn: () => Promise<T>,
  opts: CaptureOpts & { slowMs?: number } = {},
): Promise<T> {
  const t0 = performance.now();
  try {
    const out = await fn();
    const ms = Math.round(performance.now() - t0);
    if (opts.slowMs && ms > opts.slowMs) {
      captureMessage(`slow:${name} ${ms}ms`, {
        ...opts,
        level: "warning",
        context: { ...(opts.context ?? {}), op: name, duration_ms: ms },
      });
    }
    return out;
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    captureException(e, {
      ...opts,
      context: { ...(opts.context ?? {}), op: name, duration_ms: ms },
    });
    throw e;
  }
}

// ---- Back-compat shims for existing call sites ------------------------------
export const captureError = captureException;

let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    captureException(e.error ?? e.message, { source: "frontend", category: "ui" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    captureException(e.reason, {
      source: "frontend",
      category: "ui",
      context: { kind: "unhandledrejection" },
    });
  });
}
