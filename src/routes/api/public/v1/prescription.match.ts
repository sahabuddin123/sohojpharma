// B12.17 — Public API: POST /prescription/match — match detected medicines to product DB.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

type Detected = { brand_name?: string; generic_name?: string; strength?: string };

export const Route = createFileRoute("/api/public/v1/prescription/match")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const g = await guard(request, "read", 60);
        if (!g.ok) return g.response;
        let body: { items?: Detected[] };
        try { body = await request.json(); } catch { return jsonError("invalid_request", "Invalid JSON", 400); }
        const items = body.items ?? [];
        if (!items.length) return jsonError("invalid_request", "items required", 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const matches = await Promise.all(items.map(async (it) => {
          const term = (it.brand_name || it.generic_name || "").trim();
          if (!term) return { input: it, candidates: [] };
          const { data } = await supabaseAdmin
            .from("products")
            .select("id, name, sku, retail_price, generic_id, generics(name)")
            .eq("tenant_id", g.key.tenantId)
            .ilike("name", `%${term}%`)
            .limit(5);
          const candidates = (data ?? []).map((p, i) => ({
            product_id: p.id, name: p.name, sku: p.sku, price: p.retail_price,
            generic: (p.generics as { name?: string } | null)?.name ?? null,
            score: 100 - i * 10,
          }));
          return { input: it, candidates };
        }));
        const res = jsonOk({ data: matches });
        await g.finish(200);
        return res;
      },
    },
  },
});
