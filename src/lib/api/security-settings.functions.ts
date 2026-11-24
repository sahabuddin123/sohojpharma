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
    const { data } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (data) return;
  }
  throw new Error("Forbidden — requires owner, admin or manager role");
}
async function logAudit(ctx: { supabase: any }, args: { tenant_id: string; action: string; before?: unknown; after?: unknown }) {
  await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: args.tenant_id,
    _action: args.action,
    _entity_table: "tenant_settings",
    _before: (args.before as any) ?? undefined,
    _after: (args.after as any) ?? undefined,
  });
}

export type SecuritySettings = Record<string, boolean | number>;

const DEFAULTS: SecuritySettings = {
  require_2fa: false,
  password_min_length: 8,
  password_require_uppercase: true,
  password_require_lowercase: true,
  password_require_number: true,
  password_require_special: false,
  session_timeout_minutes: 60,
  max_failed_logins: 5,
  lockout_minutes: 15,
  allow_multiple_devices: true,
  max_devices_per_user: 3,
  ip_whitelist_enabled: false,
  login_alerts: true,
  role_change_alerts: true,
  permission_change_alerts: true,
  device_registration_required: true,
};

export const getSecuritySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SecuritySettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("security")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULTS, ...((row?.security as object) ?? {}) };
  });

export const updateSecuritySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      patch: z.record(z.string(), z.union([z.boolean(), z.number()])),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanWrite(context, data.tenant_id);
    const { data: cur } = await context.supabase
      .from("tenant_settings").select("security")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    const before = (cur?.security as object) ?? {};
    const after = { ...DEFAULTS, ...before, ...data.patch };
    const { error } = await context.supabase
      .from("tenant_settings")
      .upsert({ tenant_id: data.tenant_id, security: after, updated_by: context.userId }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "security_settings.updated", before, after });
    return after as SecuritySettings;
  });

export const validatePasswordPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), password: z.string().min(1).max(512) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: violations, error } = await context.supabase.rpc("validate_password_policy", {
      _tenant_id: data.tenant_id, _password: data.password,
    });
    if (error) throw new Error(error.message);
    return { valid: !violations || (violations as string[]).length === 0, violations: (violations as string[]) ?? [] };
  });

export const validateDevicePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("validate_device_policy", {
      _tenant_id: data.tenant_id, _user_id: data.user_id,
    });
    if (error) throw new Error(error.message);
    return result as { allowed: boolean; current: number; max: number };
  });

export const validateSessionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), last_activity_iso: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: row } = await context.supabase
      .from("tenant_settings").select("security")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    const timeoutMin = Number((row?.security as any)?.session_timeout_minutes ?? 60);
    const idleMs = Date.now() - new Date(data.last_activity_iso).getTime();
    return { expired: idleMs > timeoutMin * 60_000, timeout_minutes: timeoutMin };
  });

// IP whitelist CRUD
export const listAllowedIPs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("allowed_ips").select("id, ip_address, description, created_at")
      .eq("tenant_id", data.tenant_id).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows as { id: string; ip_address: string; description: string | null; created_at: string }[];
  });

export const addAllowedIP = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      ip_address: z.string().min(2).max(64),
      description: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanWrite(context, data.tenant_id);
    const { error } = await context.supabase.from("allowed_ips").insert({
      tenant_id: data.tenant_id,
      ip_address: data.ip_address,
      description: data.description ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "ip_whitelist.updated", after: { added: data.ip_address } });
    return { ok: true };
  });

export const removeAllowedIP = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanWrite(context, data.tenant_id);
    const { error } = await context.supabase
      .from("allowed_ips").delete()
      .eq("tenant_id", data.tenant_id).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "ip_whitelist.updated", after: { removed_id: data.id } });
    return { ok: true };
  });
