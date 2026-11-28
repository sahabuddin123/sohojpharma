// B6.5 — Customers list + due summary.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";
import { sanitizePostgrestSearch } from "@/lib/security/postgrest";

export const Route = createFileRoute("/api/public/v1/customers")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const url = new URL(request.url);
        const q = sanitizePostgrestSearch(url.searchParams.get("q") ?? "");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("customers")
          .select("id, name, phone, email, due_balance, credit_limit, is_active", { count: "exact" })
          .eq("tenant_id", g.key.tenantId)
          .range(offset, offset + limit - 1);
        if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);

        const { data, count, error } = await query;
        if (error) return jsonError("server_error", error.message, 500);
        const res = jsonOk({ data: data ?? [], total: count ?? 0, limit, offset });
        await g.finish(200);
        return res;
      },
    },
  },
});
