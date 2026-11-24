import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TenantInput = z.object({ tenant_id: z.string().uuid() });

async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenant_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function assertOwner(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId, _tenant_id: tenant_id, _role: "owner",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: owner role required");
}

/* ---------- Feature flags ---------- */
const DEFAULT_FLAGS = ["clinical", "accounting", "warehouse", "procurement", "bi", "mobile"];

export const listFeatureFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("feature_flags").select("*").eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    const map = new Map((rows ?? []).map((r: any) => [r.flag_key, r]));
    return DEFAULT_FLAGS.map((k) => map.get(k) ?? { flag_key: k, enabled: true, tenant_id: data.tenant_id });
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(), flag_key: z.string().min(1), enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context, data.tenant_id);
    const { error } = await context.supabase
      .from("feature_flags")
      .upsert({ tenant_id: data.tenant_id, flag_key: data.flag_key, enabled: data.enabled }, { onConflict: "tenant_id,flag_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Onboarding ---------- */
const STEPS = ["step_company","step_branches","step_warehouses","step_suppliers","step_products","step_opening_stock"] as const;

export const getOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: row } = await context.supabase
      .from("tenant_onboarding_progress").select("*").eq("tenant_id", data.tenant_id).maybeSingle();
    const r: any = row ?? { tenant_id: data.tenant_id, ...Object.fromEntries(STEPS.map((s) => [s, false])) };
    const done = STEPS.filter((s) => r[s]).length;
    return { ...r, completion_pct: Math.round((done / STEPS.length) * 100) };
  });

export const setOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(), step: z.enum(STEPS), value: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context, data.tenant_id);
    const payload = { tenant_id: data.tenant_id, [data.step]: data.value } as any;
    const { error } = await context.supabase
      .from("tenant_onboarding_progress").upsert(payload, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- System health + backups ---------- */
export const getSystemHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("get_system_health", { _tenant_id: data.tenant_id });
    if (error) throw new Error(error.message);
    return row;
  });

export const listBackupRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("backup_runs").select("*")
      .or(`tenant_id.eq.${data.tenant_id},tenant_id.is.null`)
      .order("started_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------- Go-live ---------- */
export const runGoLiveCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("run_go_live_check", { _tenant_id: data.tenant_id });
    if (error) throw new Error(error.message);
    return row as Record<string, { ok: boolean; count?: number }>;
  });

/* ---------- Audit center ---------- */
export const listAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    user_id: z.string().uuid().optional(),
    module: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().positive().max(500).default(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    let q = context.supabase
      .from("audit_log").select("id,action,entity_table,entity_id,user_id,user_role,branch_id,ip_address,user_agent,device,browser,created_at")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    if (data.module) q = q.eq("entity_table", data.module);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<Record<string, any>>;
  });
