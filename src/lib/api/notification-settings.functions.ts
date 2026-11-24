import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const WRITE_ROLES = ["owner", "corporate_admin", "manager"] as const;

async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function assertCanWrite(ctx: { supabase: any; userId: string }, tenant_id: string) {
  for (const r of WRITE_ROLES) {
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (error) throw new Error(error.message);
    if (data) return;
  }
  throw new Error("Forbidden — requires owner, admin or manager role");
}

async function logAudit(
  ctx: { supabase: any },
  args: { tenant_id: string; action: string; before?: unknown; after?: unknown },
) {
  const res = await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: args.tenant_id,
    _action: args.action,
    _entity_table: "tenant_settings",
    _before: (args.before as any) ?? undefined,
    _after: (args.after as any) ?? undefined,
  });
  if (res.error) console.error("audit failed", res.error.message);
}

export type NotificationSettings = Record<string, boolean | string>;

const DEFAULTS: NotificationSettings = {
  email: true, push: true, sms: false,
  low_stock: true, out_of_stock: true, expiry: true, batch_recall: true,
  sales: true, large_sale: true, refund: true, discount_override: true,
  purchase: true, po_approved: true, grn_approved: true, transfer_approved: true, returns: true,
  clinical_alerts: true, interaction: true, allergy: true, critical_prescription: true,
  security: true, login_alerts: true, failed_login: true, permission_change: true, role_change: true,
  executive_alerts: true,
  daily_digest: true, daily_digest_time: "08:00",
  weekly_digest: true, weekly_digest_day: "monday", weekly_digest_time: "08:00",
};

export const getNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<NotificationSettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("notifications")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULTS, ...((row?.notifications as object) ?? {}) };
  });

export const updateNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      patch: z.record(z.string(), z.union([z.boolean(), z.string()])),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanWrite(context, data.tenant_id);
    const { data: cur, error: e1 } = await context.supabase
      .from("tenant_settings").select("notifications")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (e1) throw new Error(e1.message);

    const before = (cur?.notifications as object) ?? {};
    const after = { ...DEFAULTS, ...before, ...data.patch };

    const { error: e2 } = await context.supabase
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, notifications: after, updated_by: context.userId },
        { onConflict: "tenant_id" },
      );
    if (e2) throw new Error(e2.message);

    await logAudit(context, {
      tenant_id: data.tenant_id,
      action: "notifications.updated",
      before, after,
    });

    return after as NotificationSettings;
  });

export type UserNotificationPrefs = {
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  digest_enabled: boolean;
  categories: Record<string, boolean>;
};

const USER_DEFAULTS: UserNotificationPrefs = {
  email_enabled: true, push_enabled: true, sms_enabled: false,
  whatsapp_enabled: false, digest_enabled: true, categories: {},
};

export const getUserNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .handler(async ({ context }): Promise<UserNotificationPrefs> => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("email_enabled, push_enabled, sms_enabled, whatsapp_enabled, digest_enabled, categories")
      .eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...USER_DEFAULTS, ...((data as object) ?? {}) } as UserNotificationPrefs;
  });

export const updateUserNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid().optional(),
      patch: z.object({
        email_enabled: z.boolean().optional(),
        push_enabled: z.boolean().optional(),
        sms_enabled: z.boolean().optional(),
        whatsapp_enabled: z.boolean().optional(),
        digest_enabled: z.boolean().optional(),
        categories: z.record(z.string(), z.boolean()).optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: cur } = await context.supabase
      .from("notification_preferences")
      .select("email_enabled, push_enabled, sms_enabled, whatsapp_enabled, digest_enabled, categories")
      .eq("user_id", context.userId).maybeSingle();
    const before = (cur as object) ?? {};
    const after = { ...USER_DEFAULTS, ...before, ...data.patch };

    const { error } = await context.supabase
      .from("notification_preferences")
      .upsert({ user_id: context.userId, ...after }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    if (data.tenant_id) {
      await logAudit(context, {
        tenant_id: data.tenant_id,
        action: "notification.preference.updated",
        before, after,
      });
    }
    return after as UserNotificationPrefs;
  });

/** Delivery gate — call before dispatching any notification. */
export const shouldDeliverNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      user_id: z.string().uuid(),
      alert_type: z.string(),
      channel: z.enum(["email", "push", "sms", "whatsapp"]).default("push"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("notification_should_deliver", {
      _tenant_id: data.tenant_id,
      _user_id: data.user_id,
      _alert_type: data.alert_type,
      _channel: data.channel,
    });
    if (error) throw new Error(error.message);
    return { deliver: !!ok };
  });
