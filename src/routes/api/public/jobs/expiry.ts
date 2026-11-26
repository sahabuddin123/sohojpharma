// B9.9 — expiry alerts (90/60/30/7 days).
import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/api/cron-auth.server";

export const Route = createFileRoute("/api/public/jobs/expiry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = verifyCronRequest(request);
        if (unauth) return unauth;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const today = new Date();
        let total = 0;
        for (const days of [90, 60, 30, 7]) {
          const target = new Date(today);
          target.setDate(target.getDate() + days);
          const iso = target.toISOString().slice(0, 10);
          const { data } = await supabaseAdmin
            .from("batches")
            .select("id, tenant_id, batch_no, expiry_date, product_id")
            .eq("expiry_date", iso)
            .limit(500);
          for (const b of data ?? []) {
            const { data: members } = await supabaseAdmin
              .from("tenant_members").select("user_id").eq("tenant_id", b.tenant_id);
            for (const m of members ?? []) {
              await supabaseAdmin.from("notifications").insert({
                tenant_id: b.tenant_id,
                user_id: m.user_id,
                type: days <= 7 ? "critical" : "warning",
                title: `Expiring in ${days} days`,
                body: `Batch ${b.batch_no} expires on ${b.expiry_date}.`,
                data: { batch_id: b.id, product_id: b.product_id, kind: "expiry", days_left: days },
              });
              total++;
            }
          }
        }
        return Response.json({ ok: true, queued: total });
      },
    },
  },
});
