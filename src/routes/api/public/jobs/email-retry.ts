// B9.12 — retry failed comm_log entries (max 3 attempts).
import { createFileRoute } from "@tanstack/react-router";
import { dispatch } from "@/lib/comms/dispatch.server";
import { verifyCronRequest } from "@/lib/api/cron-auth.server";

export const Route = createFileRoute("/api/public/jobs/email-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = verifyCronRequest(request);
        if (unauth) return unauth;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows } = await supabaseAdmin
          .from("comm_log")
          .select("id, tenant_id, channel, template_name, recipient, subject, metadata, attempts")
          .eq("status", "failed")
          .lt("attempts", 3)
          .order("created_at", { ascending: true })
          .limit(50);
        let retried = 0;
        for (const r of rows ?? []) {
          await supabaseAdmin.from("comm_log").update({ attempts: (r.attempts ?? 0) + 1 }).eq("id", r.id);
          await dispatch({
            tenantId: r.tenant_id,
            channel: r.channel as "email" | "sms" | "whatsapp" | "push",
            recipient: r.recipient,
            templateName: r.template_name ?? undefined,
            vars: (r.metadata as Record<string, string | number> | null) ?? undefined,
            subject: r.subject ?? undefined,
          });
          retried++;
        }
        return Response.json({ ok: true, retried });
      },
    },
  },
});
