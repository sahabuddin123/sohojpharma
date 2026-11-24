// B9.11 — subscription / trial expiring reminders.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/subscription-reminder")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const in7 = new Date(now.getTime() + 7 * 86400_000).toISOString();
        const { data } = await supabaseAdmin
          .from("subscriptions")
          .select("id, tenant_id, status, current_period_end, trial_ends_at")
          .or(`current_period_end.lte.${in7},trial_ends_at.lte.${in7}`)
          .limit(500);
        let queued = 0;
        for (const s of data ?? []) {
          const { data: members } = await supabaseAdmin
            .from("tenant_members").select("user_id").eq("tenant_id", s.tenant_id);
          for (const m of members ?? []) {
            await supabaseAdmin.from("notifications").insert({
              tenant_id: s.tenant_id,
              user_id: m.user_id,
              type: "warning",
              title: "Subscription ending soon",
              body: `Your subscription ends on ${s.current_period_end ?? s.trial_ends_at}.`,
              data: { subscription_id: s.id, kind: "subscription_reminder" },
            });
            queued++;
          }
        }
        return Response.json({ ok: true, queued });
      },
    },
  },
});
