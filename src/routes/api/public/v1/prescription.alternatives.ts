// B12.17 — Public API: GET /prescription/alternatives?product_id=...
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

export const Route = createFileRoute("/api/public/v1/prescription/alternatives")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const url = new URL(request.url);
        const product_id = url.searchParams.get("product_id");
        if (!product_id) return jsonError("invalid_request", "product_id required", 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .rpc("find_substitutes", { _tenant_id: g.key.tenantId, _product_id: product_id });
        if (error) return jsonError("server_error", error.message, 500);
        const res = jsonOk({ data: data ?? [] });
        await g.finish(200);
        return res;
      },
    },
  },
});
