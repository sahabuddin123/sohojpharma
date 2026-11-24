// B6.3 — Mobile auth: login + refresh via Supabase GoTrue, profile via API key.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight, JSON_HEADERS } from "@/lib/public-api/auth";

async function gotrue(path: string, init: RequestInit) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const r = await fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await r.text();
  return new Response(body, {
    status: r.status,
    headers: { ...JSON_HEADERS, "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/v1/auth/$action")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        const action = params.action;
        if (action === "login") {
          const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
          if (!body?.email || !body?.password) return jsonError("invalid_request", "email & password required", 400);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1";
          const normalizedEmail = body.email.trim().toLowerCase();

          // Check rate limit for IP & email
          const { data: ipCheck } = await supabaseAdmin.rpc("check_auth_rate_limit", { p_key: `ip:${ip}` });
          const { data: emailCheck } = await supabaseAdmin.rpc("check_auth_rate_limit", { p_key: `email:${normalizedEmail}` });

          const locked = (ipCheck && !ipCheck.allowed) || (emailCheck && !emailCheck.allowed);
          if (locked) {
            const retryAfter = Math.max(ipCheck?.retry_after_seconds || 0, emailCheck?.retry_after_seconds || 0) || 60;
            return new Response(JSON.stringify({
              error: "too_many_requests",
              message: `Too many failed login attempts. Please wait ${retryAfter} seconds before trying again.`,
              retry_after_seconds: retryAfter,
            }), {
              status: 429,
              headers: {
                ...JSON_HEADERS,
                "Content-Type": "application/json",
                "Retry-After": String(retryAfter),
              },
            });
          }

          const res = await gotrue("/token?grant_type=password", { method: "POST", body: JSON.stringify(body) });
          const isSuccess = res.status >= 200 && res.status < 300;

          // Record attempt result
          await supabaseAdmin.rpc("record_auth_attempt", { p_key: `ip:${ip}`, p_success: isSuccess });
          await supabaseAdmin.rpc("record_auth_attempt", { p_key: `email:${normalizedEmail}`, p_success: isSuccess });

          return res;
        }
        if (action === "refresh") {
          const body = await request.json().catch(() => null) as { refresh_token?: string } | null;
          if (!body?.refresh_token) return jsonError("invalid_request", "refresh_token required", 400);
          return gotrue("/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify(body) });
        }
        if (action === "logout") {
          const token = request.headers.get("authorization");
          if (!token) return jsonError("unauthorized", "Bearer token required", 401);
          return gotrue("/logout", { method: "POST", headers: { Authorization: token } });
        }
        return jsonError("not_found", `Unknown action: ${action}`, 404);
      },
      GET: async ({ request, params }) => {
        if (params.action !== "profile" && params.action !== "tenant") {
          return jsonError("not_found", "Unknown action", 404);
        }
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (params.action === "tenant") {
          const { data } = await supabaseAdmin
            .from("tenants").select("id, name, slug, plan_code, status")
            .eq("id", g.key.tenantId).maybeSingle();
          const res = jsonOk({ tenant: data });
          await g.finish(200);
          return res;
        }
        const res = jsonOk({ key_id: g.key.keyId, tenant_id: g.key.tenantId, scope: g.key.scope });
        await g.finish(200);
        return res;
      },
    },
  },
});
