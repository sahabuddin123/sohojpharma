// B9.8 — low-stock alerts (batches with qty_on_hand at/below threshold).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/low-stock")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: lowBatches, error } = await supabaseAdmin
          .from("batches")
          .select("id, tenant_id, batch_no, qty_on_hand, product_id, products!inner(name, reorder_level)")
          .lte("qty_on_hand", 10)
          .limit(500);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        let queued = 0;
        for (const b of (lowBatches ?? []) as Array<{
          id: string; tenant_id: string; batch_no: string; qty_on_hand: number; product_id: string;
          products: { name: string; reorder_level: number } | null;
        }>) {
          const { data: members } = await supabaseAdmin
            .from("tenant_members").select("user_id").eq("tenant_id", b.tenant_id);
          for (const m of members ?? []) {
            await supabaseAdmin.from("notifications").insert({
              tenant_id: b.tenant_id,
              user_id: m.user_id,
              type: "warning",
              title: "Low stock",
              body: `${b.products?.name ?? "Product"} batch ${b.batch_no} at ${b.qty_on_hand}.`,
              data: { product_id: b.product_id, batch_id: b.id, kind: "low_stock" },
            });
            queued++;
          }
        }
        return Response.json({ ok: true, queued });
      },
    },
  },
});
