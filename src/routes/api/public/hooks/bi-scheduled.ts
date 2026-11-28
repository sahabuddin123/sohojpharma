// Cron-triggered scheduler for BI tasks: detect executive alerts + advance scheduled reports.
// Called by pg_cron via the /api/public/* prefix; verified via timing-safe CRON_SECRET header.
import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/api/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/bi-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const out: Record<string, unknown> = { detected: 0, advanced: 0 };

        // 1. Detect sales/margin drop alerts per tenant.
        const { data: tenants } = await supabaseAdmin.from("tenants").select("id");
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
        let detected = 0;
        for (const t of tenants ?? []) {
          const { data: rows } = await supabaseAdmin
            .from("v_bi_sales_daily")
            .select("day, revenue, gross_profit")
            .eq("tenant_id", t.id)
            .in("day", [today, yesterday]);
          const tRow = (rows ?? []).find((r) => String(r.day) === today);
          const yRow = (rows ?? []).find((r) => String(r.day) === yesterday);
          const tv = Number(tRow?.revenue ?? 0);
          const yv = Number(yRow?.revenue ?? 0);
          if (yv > 0 && tv < yv * 0.7) {
            await supabaseAdmin.from("executive_alerts").insert({
              tenant_id: t.id, alert_type: "sales_drop", severity: "warning",
              title: "Sales dropped vs yesterday",
              message: `Today ৳${tv.toFixed(0)} vs yesterday ৳${yv.toFixed(0)}`,
              payload: { today: tv, yesterday: yv },
            });
            detected++;
          }
        }
        out.detected = detected;

        // 2. Advance scheduled reports whose next_run_at is past.
        const { data: due } = await supabaseAdmin
          .from("scheduled_reports")
          .select("id, frequency")
          .eq("is_active", true)
          .lte("next_run_at", new Date().toISOString());
        let advanced = 0;
        for (const r of due ?? []) {
          const next = new Date();
          if (r.frequency === "daily") next.setDate(next.getDate() + 1);
          else if (r.frequency === "weekly") next.setDate(next.getDate() + 7);
          else next.setMonth(next.getMonth() + 1);
          next.setHours(6, 0, 0, 0);
          await supabaseAdmin.from("scheduled_reports").update({
            last_run_at: new Date().toISOString(),
            last_status: "queued",
            next_run_at: next.toISOString(),
          }).eq("id", r.id);
          advanced++;
        }
        out.advanced = advanced;

        return Response.json({ ok: true, ...out });
      },
    },
  },
});
