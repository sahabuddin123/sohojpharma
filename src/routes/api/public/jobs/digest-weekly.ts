// Phase E15 — weekly digest: sales + purchases + profit per tenant.
import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/api/cron-auth.server";

export const Route = createFileRoute("/api/public/jobs/digest-weekly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = verifyCronRequest(request);
        if (unauth) return unauth;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: tenants, error } = await supabaseAdmin
          .from("tenants").select("id, name");
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        let queued = 0;
        for (const tenant of tenants ?? []) {
          const [sales, purchases] = await Promise.all([
            supabaseAdmin.from("sales").select("total_amount, profit").eq("tenant_id", tenant.id).gte("created_at", since),
            supabaseAdmin.from("purchases").select("total_amount").eq("tenant_id", tenant.id).gte("created_at", since),
          ]);
          const salesTotal = (sales.data ?? []).reduce((s, r) => s + Number((r as { total_amount?: number }).total_amount ?? 0), 0);
          const profit = (sales.data ?? []).reduce((s, r) => s + Number((r as { profit?: number }).profit ?? 0), 0);
          const purchTotal = (purchases.data ?? []).reduce((s, r) => s + Number((r as { total_amount?: number }).total_amount ?? 0), 0);
          if (salesTotal + purchTotal === 0) continue;
          await supabaseAdmin.rpc("notify_tenant_v2" as never, {
            _tenant_id: tenant.id,
            _severity: "info",
            _kind: "digest_weekly",
            _title: "Weekly summary",
            _body: `Sales: ${salesTotal.toFixed(2)} · Purchases: ${purchTotal.toFixed(2)} · Profit: ${profit.toFixed(2)}`,
            _link: "/reports",
            _entity_type: null,
            _entity_id: null,
            _data: { salesTotal, purchTotal, profit },
          } as never);
          queued++;
        }
        return Response.json({ ok: true, queued });
      },
    },
  },
});
