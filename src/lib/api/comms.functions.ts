// B9.14 — admin communication dashboard data, and B9.13 preferences.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export const listCommLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sms")])
  .inputValidator((i: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      channel: z.enum(["email", "sms", "whatsapp", "push"]).optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("comm_log")
      .select("id, channel, provider, template_name, recipient, subject, status, error_message, sent_at, created_at")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const commStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sms")])
  .inputValidator((i: unknown) => z.object({ tenant_id: z.string().uuid(), days: z.number().int().min(1).max(90).default(30) }).parse(i))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("comm_log")
      .select("channel, status")
      .eq("tenant_id", data.tenant_id)
      .gte("created_at", since);
    if (error) throw new Error(error.message);
    const stats: Record<string, { sent: number; failed: number; total: number }> = {
      email: { sent: 0, failed: 0, total: 0 },
      sms: { sent: 0, failed: 0, total: 0 },
      whatsapp: { sent: 0, failed: 0, total: 0 },
      push: { sent: 0, failed: 0, total: 0 },
    };
    for (const r of rows ?? []) {
      const s = stats[r.channel] ?? (stats[r.channel] = { sent: 0, failed: 0, total: 0 });
      s.total++;
      if (r.status === "sent" || r.status === "delivered") s.sent++;
      else if (r.status === "failed" || r.status === "bounced") s.failed++;
    }
    return stats;
  });

export const getNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sms")])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { user_id: context.userId, email_enabled: true, sms_enabled: false, whatsapp_enabled: false, push_enabled: true, categories: {} };
  });

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sms")])
  .inputValidator((i: unknown) =>
    z.object({
      email_enabled: z.boolean().optional(),
      sms_enabled: z.boolean().optional(),
      whatsapp_enabled: z.boolean().optional(),
      push_enabled: z.boolean().optional(),
      categories: z.record(z.string(), z.boolean()).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_preferences")
      .upsert({ user_id: context.userId, ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendInvoiceSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      tenantId: z.string().uuid(),
      phone: z.string().trim().min(6, "সঠিক ফোন নম্বর দিন").max(30),
      message: z.string().trim().min(1).max(1000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { sendSms } = await import("@/lib/comms/sms.server");
    const res = await sendSms({ to: data.phone, body: data.message });
    if (!res.ok) {
      throw new Error(res.error || "SMS পাঠানো যায়নি");
    }
    try {
      await context.supabase.from("sms_logs").insert({
        tenant_id: data.tenantId,
        recipient: data.phone,
        message: data.message,
        provider: res.provider,
        status: "sent",
        provider_message_id: res.providerMessageId ?? null,
      } as never);
    } catch {
      // Non-fatal if sms_logs schema differs
    }
    return { ok: true, provider: res.provider };
  });
