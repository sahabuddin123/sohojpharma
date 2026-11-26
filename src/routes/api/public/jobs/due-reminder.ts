// B9.10 — outstanding-balance reminders for customers.
import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/api/cron-auth.server";

export const Route = createFileRoute("/api/public/jobs/due-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = verifyCronRequest(request);
        if (unauth) return unauth;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: customers } = await supabaseAdmin
          .from("customers")
          .select("id, tenant_id, name, phone, email, due_balance")
          .gt("due_balance", 0)
          .limit(500);
        let queued = 0;
        for (const c of customers ?? []) {
          const { data: members } = await supabaseAdmin
            .from("tenant_members").select("user_id").eq("tenant_id", c.tenant_id);
          for (const m of members ?? []) {
            await supabaseAdmin.from("notifications").insert({
              tenant_id: c.tenant_id,
              user_id: m.user_id,
              type: "info",
              title: "Outstanding balance",
              body: `${c.name} has BDT ${c.due_balance} outstanding.`,
              data: { customer_id: c.id, kind: "due_reminder" },
            });
            queued++;
          }
        }
        return Response.json({ ok: true, queued });
      },
    },
  },
});
