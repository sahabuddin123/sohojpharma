// B6.6 — Resume a held cart: marks resumed_at, returns the cart.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

export const Route = createFileRoute("/api/public/v1/sales/held/$id/resume")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request, params }) => {
        const g = await guard(request, "write", 60);
        if (!g.ok) return g.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("held_sales")
          .update({ resumed_at: new Date().toISOString() })
          .eq("tenant_id", g.key.tenantId)
          .eq("id", params.id)
          .is("resumed_at", null)
          .select("id, label, customer_id, cart")
          .maybeSingle();
        if (error) return jsonError("server_error", error.message, 500);
        if (!data) return jsonError("not_found", "Held sale not found or already resumed", 404);
        const res = jsonOk({ held_sale: data });
        await g.finish(200);
        return res;
      },
    },
  },
});
