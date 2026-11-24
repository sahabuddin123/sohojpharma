// B6.2 — Public API authentication & HMAC verification helpers.
// Server-only. Imported only inside /api/public/v1/* route handlers.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-API-Key, X-Signature, X-Timestamp, X-Request-Id",
  "Access-Control-Max-Age": "86400",
} as const;

export const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  ...CORS_HEADERS,
} as const;

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "method_not_allowed"
  | "server_error";

export function jsonError(code: ApiErrorCode, message: string, status: number, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ error: { code, message, ...(extra ?? {}) } }),
    { status, headers: JSON_HEADERS },
  );
}

export function jsonOk<T>(data: T, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...(extraHeaders ?? {}) },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ---------- API key auth ----------
// Format: pk_<prefix>.<secret>  where hash = sha256(secret)
function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export interface AuthedKey {
  keyId: string;
  tenantId: string;
  scope: "read" | "read_write" | "full";
  secret: string; // raw secret part (for HMAC)
}

export async function authenticate(request: Request): Promise<
  { ok: true; key: AuthedKey } | { ok: false; response: Response }
> {
  const raw =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!raw || !raw.includes(".")) {
    return { ok: false, response: jsonError("unauthorized", "Missing or malformed API key", 401) };
  }
  const [prefixPart, secret] = raw.split(".", 2);
  const prefix = prefixPart.replace(/^pk_/, "");
  if (!prefix || !secret) {
    return { ok: false, response: jsonError("unauthorized", "Malformed API key", 401) };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, tenant_id, scope, hash, revoked_at")
    .eq("prefix", prefix)
    .maybeSingle();
  if (error || !data || data.revoked_at) {
    return { ok: false, response: jsonError("unauthorized", "Invalid API key", 401) };
  }
  const expected = Buffer.from(data.hash, "hex");
  const provided = Buffer.from(sha256(secret), "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, response: jsonError("unauthorized", "Invalid API key", 401) };
  }

  // fire-and-forget last_used_at
  void supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    ok: true,
    key: {
      keyId: data.id,
      tenantId: data.tenant_id,
      scope: data.scope as AuthedKey["scope"],
      secret,
    },
  };
}

// ---------- HMAC signature verification (optional, for write endpoints) ----------
// Header X-Signature = hex(hmac_sha256(secret, `${timestamp}.${method}.${path}.${body}`))
// X-Timestamp must be within ±300s of now.
export function verifyHmac(
  request: Request,
  rawBody: string,
  secret: string,
): { ok: true } | { ok: false; response: Response } {
  const sig = request.headers.get("x-signature");
  const ts = request.headers.get("x-timestamp");
  if (!sig || !ts) {
    return { ok: false, response: jsonError("unauthorized", "Missing signature headers", 401) };
  }
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    return { ok: false, response: jsonError("unauthorized", "Stale or invalid timestamp", 401) };
  }
  const url = new URL(request.url);
  const payload = `${ts}.${request.method.toUpperCase()}.${url.pathname}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, response: jsonError("unauthorized", "Bad signature", 401) };
  }
  return { ok: true };
}

export function requireScope(key: AuthedKey, needed: "read" | "write"): Response | null {
  if (needed === "read") return null; // all scopes can read
  if (key.scope === "read") return jsonError("forbidden", "Key lacks write scope", 403);
  return null;
}

// ---------- Rate limiting (in-memory, per Worker isolate) ----------
// B6.11 — Per API key, sliding window per minute. Best-effort only.
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(keyId: string, limitPerMin = 120): Response | null {
  const now = Date.now();
  const b = buckets.get(keyId);
  if (!b || b.resetAt <= now) {
    buckets.set(keyId, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  b.count += 1;
  if (b.count > limitPerMin) {
    return jsonError("rate_limited", "Too many requests", 429, {
      retry_after_ms: b.resetAt - now,
    });
  }
  return null;
}

// ---------- Audit logging (B6.14) ----------
export async function logApiCall(args: {
  tenantId: string;
  keyId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      tenant_id: args.tenantId,
      action: `public_api.${args.method.toLowerCase()}`,
      entity_table: "public_api",
      after_data: {
        api_key_id: args.keyId,
        path: args.path,
        status: args.status,
        duration_ms: args.durationMs,
      },
    });
  } catch {
    // never fail the request on audit failure
  }
}

// ---------- Convenience guard wrapper ----------
export async function guard(
  request: Request,
  needed: "read" | "write",
  limitPerMin = 120,
): Promise<{ ok: true; key: AuthedKey; finish: (status: number) => Promise<void> } | { ok: false; response: Response }> {
  const t0 = Date.now();
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  const scopeErr = requireScope(auth.key, needed);
  if (scopeErr) return { ok: false, response: scopeErr };
  const rl = rateLimit(auth.key.keyId, limitPerMin);
  if (rl) return { ok: false, response: rl };
  return {
    ok: true,
    key: auth.key,
    finish: async (status: number) => {
      const url = new URL(request.url);
      await logApiCall({
        tenantId: auth.key.tenantId,
        keyId: auth.key.keyId,
        method: request.method,
        path: url.pathname,
        status,
        durationMs: Date.now() - t0,
      });
    },
  };
}
