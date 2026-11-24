// B6.4 — Products list & barcode search.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

export const Route = createFileRoute("/api/public/v1/products")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const url = new URL(request.url);
        const q = url.searchParams.get("q") ?? "";
        const barcode = url.searchParams.get("barcode");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("products")
          .select("id, name, name_bn, barcode, sku, retail_price, purchase_price, vat_rate, is_active, reorder_level", { count: "exact" })
          .eq("tenant_id", g.key.tenantId)
          .is("deleted_at", null)
          .range(offset, offset + limit - 1);

        if (barcode) query = query.eq("barcode", barcode);
        else if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);

        const { data, count, error } = await query;
        if (error) return jsonError("server_error", error.message, 500);
        const res = jsonOk({ data: data ?? [], total: count ?? 0, limit, offset });
        await g.finish(200);
        return res;
      },
    },
  },
});
