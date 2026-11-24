import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type SubscriptionSettings = {
  plan_visibility: boolean;
  usage_warnings: boolean;
  renewal_reminders: boolean;
  grace_period_days: number;
  allow_overage: boolean;
};

const DEFAULTS: SubscriptionSettings = {
  plan_visibility: true,
  usage_warnings: true,
  renewal_reminders: true,
  grace_period_days: 7,
  allow_overage: false,
};

export const getSubscriptionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SubscriptionSettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("subscription")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULTS, ...((row?.subscription as object) ?? {}) };
  });

export const updateSubscriptionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      patch: z.record(z.string(), z.union([z.boolean(), z.number()])),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanWrite(context, data.tenant_id);
    const { data: cur } = await context.supabase
      .from("tenant_settings").select("subscription")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    const before = (cur?.subscription as object) ?? {};
    const after = { ...DEFAULTS, ...before, ...data.patch };
    const { error } = await context.supabase
      .from("tenant_settings")
      .upsert({ tenant_id: data.tenant_id, subscription: after, updated_by: context.userId }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "subscription.updated", before, after });
    return after as SubscriptionSettings;
  });

export const hasFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), feature: z.string().min(1).max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("has_feature", {
      _tenant_id: data.tenant_id, _feature_code: data.feature,
    });
    if (error) throw new Error(error.message);
    return { enabled: !!result };
  });

export type PlanLimitCheck = {
  resource: string;
  used: number;
  limit: number | null;
  allow_overage: boolean;
  over_limit: boolean;
  can_create: boolean;
};

type RpcResource = "branch" | "warehouse" | "user";
function mapResource(r: string): RpcResource | null {
  if (r === "branches") return "branch";
  if (r === "warehouses") return "warehouse";
  if (r === "users") return "user";
  return null;
}

export const checkPlanLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      resource: z.enum(["products","users","branches","warehouses","customers","suppliers","devices"]),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PlanLimitCheck> => {
    const rpcRes = mapResource(data.resource);
    if (!rpcRes) {
      return { resource: data.resource, used: 0, limit: null, allow_overage: true, over_limit: false, can_create: true };
    }
    const { data: ok, error } = await context.supabase.rpc("check_plan_limit", {
      _tenant: data.tenant_id, _resource: rpcRes,
    });
    if (error) throw new Error(error.message);
    return { resource: data.resource, used: 0, limit: null, allow_overage: !!ok, over_limit: !ok, can_create: !!ok };
  });

export const getSubscriptionOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const resources = ["products","users","branches","warehouses","customers","suppliers","devices"] as const;
    const usage: PlanLimitCheck[] = await Promise.all(resources.map(async (r): Promise<PlanLimitCheck> => {
      const rpcRes = mapResource(r);
      if (!rpcRes) return { resource: r, used: 0, limit: null, allow_overage: true, over_limit: false, can_create: true };
      const { data: ok } = await context.supabase.rpc("check_plan_limit", {
        _tenant: data.tenant_id, _resource: rpcRes,
      });
      return { resource: r, used: 0, limit: null, allow_overage: !!ok, over_limit: !ok, can_create: !!ok };
    }));
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("id, status, current_period_start, current_period_end, trial_ends_at, grace_period_ends_at, billing_cycle, plan:plans(id, code, name, price_bdt, max_products, max_users, max_branches, features)")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    return { subscription: sub, usage };
  });
