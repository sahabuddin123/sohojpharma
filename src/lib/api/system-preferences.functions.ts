import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type SystemPreferences = {
  default_branch_id: string | null;
  default_warehouse_id: string | null;
  landing_page: string;
  dashboard_refresh_interval: number;
  auto_logout_minutes: number;
  remember_last_branch: boolean;
  remember_last_warehouse: boolean;
  enable_dark_mode: boolean;
  compact_mode: boolean;
};

export const DEFAULT_SYSTEM_PREFERENCES: SystemPreferences = {
  default_branch_id: null,
  default_warehouse_id: null,
  landing_page: "/store",
  dashboard_refresh_interval: 60,
  auto_logout_minutes: 30,
  remember_last_branch: true,
  remember_last_warehouse: true,
  enable_dark_mode: false,
  compact_mode: false,
};

export const LANDING_PAGE_OPTIONS = [
  "/store",
  "/sales/pos",
  "/inventory",
  "/procurement/dashboard",
  "/executive",
] as const;

export const REFRESH_OPTIONS = [30, 60, 120, 300] as const;
export const LOGOUT_OPTIONS = [15, 30, 60, 120] as const;

const WRITE_ROLES = ["owner", "corporate_admin"] as const;
const READ_ROLES = ["owner", "corporate_admin", "manager", "auditor"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasAnyRole(ctx: { supabase: any; userId: string }, tenant_id: string, roles: readonly string[]) {
  for (const r of roles) {
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (error) throw new Error(error.message);
    if (data) return r;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const PrefsPatch = z.object({
  default_branch_id: z.string().uuid().nullable().optional(),
  default_warehouse_id: z.string().uuid().nullable().optional(),
  landing_page: z.enum(LANDING_PAGE_OPTIONS).optional(),
  dashboard_refresh_interval: z.number().int().positive().optional(),
  auto_logout_minutes: z.number().int().positive().optional(),
  remember_last_branch: z.boolean().optional(),
  remember_last_warehouse: z.boolean().optional(),
  enable_dark_mode: z.boolean().optional(),
  compact_mode: z.boolean().optional(),
});

export const getSystemPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SystemPreferences> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    if (!role) throw new Error("Forbidden: insufficient role (403)");
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("system").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_SYSTEM_PREFERENCES, ...((row?.system ?? {}) as Partial<SystemPreferences>) };
  });

export const updateSystemPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: PrefsPatch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<SystemPreferences> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin role required (403)");

    const { data: before } = await context.supabase
      .from("tenant_settings").select("system").eq("tenant_id", data.tenant_id).maybeSingle();
    const prev = (before?.system ?? {}) as Partial<SystemPreferences>;
    const next: SystemPreferences = { ...DEFAULT_SYSTEM_PREFERENCES, ...prev, ...data.patch };

    const { data: row, error } = await context.supabase
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, system: next, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("system").single();
    if (error) throw new Error(error.message);

    await context.supabase.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "system_preferences.updated",
      _entity_table: "tenant_settings",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _before: prev as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _after: row?.system as any,
    });

    return { ...DEFAULT_SYSTEM_PREFERENCES, ...((row?.system ?? {}) as Partial<SystemPreferences>) };
  });
