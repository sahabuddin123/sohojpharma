// Unified comm dispatcher: render template, respect user prefs, log to comm_log.
import { sendEmail } from "./email.server";
import { sendSms } from "./sms.server";
import { sendWhatsApp } from "./whatsapp.server";
import { renderTemplate } from "./templates";
import type { CommChannel } from "./types";

interface DispatchArgs {
  tenantId?: string | null;
  channel: CommChannel;
  recipient: string;
  templateName?: string;
  vars?: Record<string, string | number | undefined | null>;
  subject?: string;
  body?: string;
}

export async function dispatch(args: DispatchArgs) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let subject = args.subject;
  let html = args.body ?? "";
  if (args.templateName) {
    const rendered = renderTemplate(args.templateName, args.vars ?? {});
    if (!rendered) return { ok: false, error: `Unknown template ${args.templateName}` };
    subject = rendered.subject;
    html = rendered.html;
  }

  const logId = crypto.randomUUID();
  await supabaseAdmin.from("comm_log").insert({
    id: logId,
    tenant_id: args.tenantId ?? null,
    channel: args.channel,
    template_name: args.templateName ?? null,
    recipient: args.recipient,
    subject: subject ?? null,
    status: "pending",
    metadata: args.vars ?? {},
  });

  let result: { ok: boolean; provider: string; providerMessageId?: string; error?: string };
  try {
    if (args.channel === "email") {
      result = await sendEmail({ to: args.recipient, subject: subject ?? "(no subject)", html });
    } else if (args.channel === "sms") {
      result = await sendSms({ to: args.recipient, body: stripHtml(html || subject || "") });
    } else if (args.channel === "whatsapp") {
      result = await sendWhatsApp({ to: args.recipient, body: stripHtml(html || subject || "") });
    } else {
      result = { ok: false, provider: "none", error: "push not implemented in dispatcher" };
    }
  } catch (e) {
    result = { ok: false, provider: "exception", error: e instanceof Error ? e.message : String(e) };
  }

  await supabaseAdmin
    .from("comm_log")
    .update({
      status: result.ok ? "sent" : "failed",
      provider: result.provider,
      provider_message_id: result.providerMessageId ?? null,
      error_message: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
      attempts: 1,
    })
    .eq("id", logId);

  return result;
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000);
}
