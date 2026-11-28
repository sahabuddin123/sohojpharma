import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/api/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/daily-customer-greetings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const md = `-${mm}-${dd}`;

        const { data: custs, error } = await supabaseAdmin
          .from("customers")
          .select("id,tenant_id,name,date_of_birth,anniversary")
          .or(`date_of_birth.like.%${md},anniversary.like.%${md}`)
          .limit(5000);
        if (error) {
          console.error("[daily-customer-greetings] query failed:", error.message);
          return new Response(JSON.stringify({ ok: false, error: "database_error" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const byTenant = new Map<string, typeof custs>();
        for (const c of custs ?? []) {
          const arr = byTenant.get(c.tenant_id) ?? [];
          arr.push(c);
          byTenant.set(c.tenant_id, arr);
        }

        const tenantIds = [...byTenant.keys()];
        const { data: settingsRows } = await supabaseAdmin
          .from("tenant_settings")
          .select("tenant_id,customer")
          .in("tenant_id", tenantIds);
        const settingsMap = new Map(
          (settingsRows ?? []).map((r) => [r.tenant_id, (r.customer as Record<string, boolean>) ?? {}]),
        );

        const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
        const { data: sent } = await supabaseAdmin
          .from("customer_reminders")
          .select("customer_id,reminder_type")
          .gte("sent_at", startOfDay.toISOString())
          .in("reminder_type", ["birthday", "anniversary"]);
        const sentKey = new Set((sent ?? []).map((r) => `${r.customer_id}:${r.reminder_type}`));

        const reminderRows: Array<Record<string, unknown>> = [];

        for (const [tenantId, list] of byTenant) {
          const s = settingsMap.get(tenantId) ?? {};
          const birthdayOn = s.birthday_wishes_enabled !== false;
          const anniversaryOn = s.anniversary_wishes_enabled !== false;

          for (const c of list ?? []) {
            const dobMatch = c.date_of_birth?.endsWith(md);
            const annMatch = c.anniversary?.endsWith(md);

            if (dobMatch && birthdayOn && !sentKey.has(`${c.id}:birthday`)) {
              reminderRows.push({
                tenant_id: tenantId, customer_id: c.id, reminder_type: "birthday",
                channel: "in_app", status: "sent",
                message: `🎂 Happy birthday, ${c.name}! Wishing you health and happiness.`,
              });
            }
            if (annMatch && anniversaryOn && !sentKey.has(`${c.id}:anniversary`)) {
              reminderRows.push({
                tenant_id: tenantId, customer_id: c.id, reminder_type: "anniversary",
                channel: "in_app", status: "sent",
                message: `🎉 Happy anniversary, ${c.name}!`,
              });
            }
          }
        }

        if (reminderRows.length > 0) {
          await supabaseAdmin.from("customer_reminders").insert(reminderRows as never);
        }

        return new Response(
          JSON.stringify({
            ok: true,
            date: today.toISOString().slice(0, 10),
            tenants_checked: tenantIds.length,
            customers_matched: (custs ?? []).length,
            greetings_sent: reminderRows.length,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
