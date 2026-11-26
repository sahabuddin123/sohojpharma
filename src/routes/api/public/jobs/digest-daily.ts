// Phase E15 — daily digest: low stock + expiring + pending approvals per tenant.
import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/api/cron-auth.server";

export const Route = createFileRoute("/api/public/jobs/digest-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = verifyCronRequest(request);
        if (unauth) return unauth;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tenants, error } = await supabaseAdmin
          .from("tenants").select("id, name");
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        let queued = 0;
        for (const tenant of tenants ?? []) {
          const [low, expiring, pendingPo, pendingReturns] = await Promise.all([
            supabaseAdmin.from("batches").select("id", { count: "exact", head: true })
              .eq("tenant_id", tenant.id).lte("qty_on_hand", 10),
            supabaseAdmin.from("batches").select("id", { count: "exact", head: true })
              .eq("tenant_id", tenant.id).not("expiry_date", "is", null).lte("expiry_date", soon).gt("qty_on_hand", 0),
            supabaseAdmin.from("purchase_orders").select("id", { count: "exact", head: true })
              .eq("tenant_id", tenant.id).eq("status", "sent"),
            supabaseAdmin.from("purchase_returns").select("id", { count: "exact", head: true })
              .eq("tenant_id", tenant.id).eq("status", "submitted"),
          ]);
          const lowCount = low.count ?? 0;
          const expCount = expiring.count ?? 0;
          const poCount = pendingPo.count ?? 0;
          const prCount = pendingReturns.count ?? 0;
          if (lowCount + expCount + poCount + prCount === 0) continue;
          await supabaseAdmin.rpc("notify_tenant_v2" as never, {
            _tenant_id: tenant.id,
            _severity: "info",
            _kind: "digest_daily",
            _title: "Daily summary",
            _body: `Low stock: ${lowCount} · Expiring (30d): ${expCount} · POs awaiting approval: ${poCount} · Returns awaiting approval: ${prCount}`,
            _link: "/notifications",
            _entity_type: null,
            _entity_id: null,
            _data: { lowCount, expCount, poCount, prCount },
          } as never);
          queued++;
        }
        return Response.json({ ok: true, queued });
      },
    },
  },
});
