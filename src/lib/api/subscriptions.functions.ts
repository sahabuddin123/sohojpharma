import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { mapPgError } from "@/lib/api/errors";

const BILLING = ["monthly", "quarterly", "half_yearly", "yearly", "lifetime"] as const;
const SUB_STATUS = ["trial", "active", "past_due", "grace_period", "expired", "cancelled", "suspended"] as const;
const FEATURE_KEYS = [
  "pos","inventory","purchase","sales","accounting","prescription",
  "crm","reports","sms","whatsapp_invoice","mobile_app","ai_features",
] as const;
const PROVIDERS = ["bkash", "nagad", "sslcommerz", "manual"] as const;
const SMS_CODES = ["otp", "approval", "payment_success", "subscription_expiry", "due_reminder"] as const;

async function assertAppAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_app_admin", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: SaaS Admin only");
}

async function myTenantId(ctx: { supabase: any; userId: string }): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", ctx.userId)
    .limit(1)
    .maybeSingle();
  return (data as any)?.tenant_id ?? null;
}

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant_id = await myTenantId(context);
    if (!tenant_id) return null;
    const { data, error } = await context.supabase.rpc("tenant_subscription_status", { _tenant: tenant_id });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return row ?? null;
  });

export const listPlansPublic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plans")
      .select("id,code,name,price_bdt,price_yearly_bdt,billing_interval,max_branches,max_warehouses,max_users,max_products,sms_enabled,api_enabled,is_unlimited,features,trial_days,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const changePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      plan_id: z.string().uuid(),
      billing_cycle: z.enum(BILLING).default("monthly"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { error } = await context.supabase
      .from("subscriptions")
      .update({ plan_id: data.plan_id, billing_cycle: data.billing_cycle, updated_at: new Date().toISOString() })
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const extendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      expires_at: z.string(),
      grace_until: z.string().optional(),
      status: z.enum(["trial", "active", "past_due", "expired", "cancelled"]).default("active"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const patch: {
      expires_at: string;
      status: typeof data.status;
      updated_at: string;
      grace_until?: string;
    } = {
      expires_at: data.expires_at,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.grace_until) patch.grace_until = data.grace_until;
    const { error } = await context.supabase
      .from("subscriptions")
      .update(patch)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      subscription_id: z.string().uuid().optional(),
      plan_id: z.string().uuid().optional(),
      amount: z.number().positive(),
      currency: z.string().default("BDT"),
      provider: z.enum(PROVIDERS),
      provider_txn_id: z.string().optional(),
      status: z.enum(["pending", "success", "failed", "refunded"]).default("success"),
      metadata: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { data: row, error } = await context.supabase
      .from("payment_transactions")
      .insert({
        ...data,
        paid_at: data.status === "success" ? new Date().toISOString() : null,
        metadata: data.metadata ?? {},
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("payment_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.tenant_id) q = q.eq("tenant_id", data.tenant_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saasMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context);
    const { data: subs } = await context.supabase
      .from("subscriptions")
      .select("status, billing_cycle, plan:plans(price_bdt, price_yearly_bdt)");
    // === Audited MRR formula (Phase 2.2) ===
    // MRR = Σ over subscriptions where status = 'active':
    //   billing_cycle = 'monthly' -> plan.price_bdt
    //   billing_cycle = 'yearly'  -> COALESCE(plan.price_yearly_bdt, plan.price_bdt*12) / 12
    // ARR = MRR * 12
    // Trial subscriptions are tracked separately as trial_mrr / trial_stores — they
    // are NOT included in MRR because trials are not yet paying.
    let mrr = 0, trial_mrr = 0, active = 0, trial = 0, expired = 0;
    for (const s of (subs ?? []) as any[]) {
      const plan = s.plan ?? {};
      const monthly = Number(plan.price_bdt ?? 0);
      const yearly = Number(plan.price_yearly_bdt ?? monthly * 12);
      const monthlyEquiv = s.billing_cycle === "yearly" ? yearly / 12 : monthly;
      if (s.status === "active") { active++; mrr += monthlyEquiv; }
      else if (s.status === "trial") { trial++; trial_mrr += monthlyEquiv; }
      else if (s.status === "expired" || s.status === "cancelled") expired++;
    }
    const { data: rev } = await context.supabase
      .from("payment_transactions")
      .select("amount")
      .eq("status", "success");
    const revenue = (rev ?? []).reduce((a: number, r: any) => a + Number(r.amount ?? 0), 0);
    return {
      mrr, arr: mrr * 12,
      active_stores: active, expired_stores: expired,
      trial_stores: trial, trial_mrr, trial_revenue: trial_mrr,
      revenue,
    };
  });

// FIX 7: Tenant-owner-or-admin self-service renew (DB RPC enforces caller)
export const renewSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), months: z.number().int().min(1).max(36) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("renew_subscription", {
      _tenant: data.tenant_id, _months: data.months,
    });
    if (error) mapPgError(error);
    return { ok: true };
  });

// FIX 7: Tenant-owner-or-admin self-service downgrade (usage validated in RPC)
export const downgradePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), plan_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("downgrade_plan", {
      _tenant: data.tenant_id, _plan: data.plan_id,
    });
    if (error) mapPgError(error);
    return { ok: true };
  });

// FIX 7: Tenant-owner-or-admin self-service upgrade
export const upgradePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), plan_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("upgrade_plan", {
      _tenant: data.tenant_id, _plan: data.plan_id,
    });
    if (error) mapPgError(error);
    return { ok: true };
  });

export const enqueueSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("sms_enabled")])
  .inputValidator((d: unknown) =>
    z.object({
      template_code: z.enum(SMS_CODES),
      to_number: z.string().min(6),
      tenant_id: z.string().uuid().optional(),
      payload: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const tenant_id = data.tenant_id ?? (await myTenantId(context));
    // FIX 7: SMS retry policy — initialize max_attempts and next_retry_at
    const { data: ins, error } = await context.supabase
      .from("sms_queue")
      .insert({
        template_code: data.template_code,
        to_number: data.to_number,
        tenant_id: tenant_id ?? null,
        payload: data.payload ?? {},
        max_attempts: 3,
        next_retry_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return ins;
  });

export const listSmsTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sms_templates")
      .select("*")
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// =====================================================================
// Phase 2 — SaaS Admin Subscription Management
// =====================================================================

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const PlanInputSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(64),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().optional().nullable(),
  billing_interval: z.enum(BILLING).default("monthly"),
  price_bdt: z.number().nonnegative(),
  price_yearly_bdt: z.number().nonnegative().nullable().optional(),
  trial_days: z.number().int().min(0).max(365).default(14),
  sort_order: z.number().int().default(100),
  is_active: z.boolean().default(true),
  is_unlimited: z.boolean().default(false),
  max_products: z.number().int().nullable().optional(),
  max_users: z.number().int().nullable().optional(),
  max_branches: z.number().int().nullable().optional(),
  max_warehouses: z.number().int().nullable().optional(),
  max_storage_mb: z.number().int().nullable().optional(),
  max_api_requests_per_month: z.number().int().nullable().optional(),
  sms_enabled: z.boolean().default(false),
  api_enabled: z.boolean().default(false),
  features: z.record(z.string(), z.boolean()).default({}),
  payment_methods: z.array(z.string()).default([]),
});

export const adminListPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context);
    const { data, error } = await context.supabase
      .from("plans").select("*").order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlanInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    // unique name (case-insensitive) + slug — pre-check
    const { data: clash } = await context.supabase
      .from("plans")
      .select("id,name,slug")
      .or(`slug.eq.${data.slug},name.ilike.${data.name}`)
      .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    if ((clash ?? []).length > 0) {
      throw new Error("Plan name or slug already exists");
    }
    const row = {
      ...data,
      features: data.features as Record<string, boolean>,
      payment_methods: data.payment_methods,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("plans").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("plans").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (ins as { id: string }).id };
  });

export const adminDeletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { count, error: cErr } = await context.supabase
      .from("subscriptions").select("id", { head: true, count: "exact" }).eq("plan_id", data.id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) throw new Error("Cannot delete: subscriptions exist on this plan");
    const { error } = await context.supabase.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminTogglePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { error } = await context.supabase
      .from("plans").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.enum(SUB_STATUS).optional(),
    plan_id: z.string().uuid().optional(),
    billing_cycle: z.enum(BILLING).optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    let q = context.supabase
      .from("subscriptions")
      .select(`
        id, tenant_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end, trial_ends_at,
        cancelled_at, last_payment_at, expires_at, notes,
        scheduled_plan_id, scheduled_cycle, scheduled_change_at,
        created_at, updated_at,
        tenant:tenants ( id, name, email, status ),
        plan:plans ( id, name, code, price_bdt, price_yearly_bdt )
      `)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.plan_id) q = q.eq("plan_id", data.plan_id);
    if (data.billing_cycle) q = q.eq("billing_cycle", data.billing_cycle);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as Array<{ tenant?: { name?: string; email?: string } | null }>;
    const term = (data.search ?? "").trim().toLowerCase();
    return term
      ? list.filter((r) =>
          (r.tenant?.name ?? "").toLowerCase().includes(term) ||
          (r.tenant?.email ?? "").toLowerCase().includes(term))
      : list;
  });

export const adminAssignPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    billing_cycle: z.enum(BILLING).default("monthly"),
    trial_days: z.number().int().min(0).max(365).default(0),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_assign_plan", {
      p_tenant: data.tenant_id, p_plan: data.plan_id,
      p_cycle: data.billing_cycle, p_trial_days: data.trial_days,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminChangePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    subscription_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    billing_cycle: z.enum(BILLING),
    mode: z.enum(["auto", "force_upgrade", "force_downgrade"]).default("auto"),
    waive_fees: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("admin_change_plan", {
      p_subscription: data.subscription_id, p_new_plan: data.plan_id, p_cycle: data.billing_cycle,
      p_mode: data.mode, p_waive_fees: data.waive_fees,
    });
    if (error) throw new Error(error.message);
    return res as {
      ok: true; action: "upgrade" | "downgrade" | "downgrade_scheduled";
      credit?: number; charge?: number; waived?: boolean;
      current_price?: number; new_price?: number;
      effective_at?: string; payment_id?: string | null;
    };
  });

export const adminCancelScheduledChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subscription_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_cancel_scheduled_change", {
      p_subscription: data.subscription_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRenewSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subscription_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_renew_subscription", {
      p_subscription: data.subscription_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    subscription_id: z.string().uuid(),
    status: z.enum(SUB_STATUS),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_subscription_status", {
      p_subscription: data.subscription_id, p_status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminConvertTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subscription_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_convert_trial", {
      p_subscription: data.subscription_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminPlanAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_plan_analytics");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      plan_id: string; plan_name: string; plan_code: string;
      active_count: number; trial_count: number; expired_count: number; suspended_count: number;
      mrr: number; revenue_last_30d: number;
    }>;
  });

export const adminExpiryWidgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_expiry_widgets");
    if (error) throw new Error(error.message);
    return (data ?? { expiring_today: 0, expiring_this_week: 0, in_grace_period: 0, suspended_stores: 0 }) as {
      expiring_today: number;
      expiring_this_week: number;
      in_grace_period: number;
      suspended_stores: number;
    };
  });

export const adminListTenantsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context);
    const { data, error } = await context.supabase
      .from("tenants").select("id,name,email,status").order("name").limit(1000);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// =====================================================================
// Plan Pricing Matrix
// =====================================================================

const CYCLE_DAYS: Record<(typeof BILLING)[number], number> = {
  monthly: 30, quarterly: 90, half_yearly: 180, yearly: 365, lifetime: 36500,
};

const PricingInputSchema = z.object({
  id: z.string().uuid().optional(),
  plan_id: z.string().uuid(),
  billing_cycle: z.enum(BILLING),
  duration_days: z.number().int().positive().optional(),
  price_bdt: z.number().nonnegative(),
  discount_percent: z.number().min(0).max(100).default(0),
  is_active: z.boolean().default(true),
});

export const adminListPlanPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ plan_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    let q = context.supabase
      .from("plan_pricing")
      .select("id, plan_id, billing_cycle, duration_days, price_bdt, discount_percent, is_active, created_at, updated_at")
      .order("plan_id", { ascending: true })
      .order("duration_days", { ascending: true });
    if (data.plan_id) q = q.eq("plan_id", data.plan_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminUpsertPlanPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PricingInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const duration = data.duration_days ?? CYCLE_DAYS[data.billing_cycle];
    const row = {
      plan_id: data.plan_id,
      billing_cycle: data.billing_cycle,
      duration_days: duration,
      price_bdt: data.price_bdt,
      discount_percent: data.discount_percent,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("plan_pricing").update(row).eq("id", data.id);
      if (error) mapPgError(error);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("plan_pricing")
      .upsert(row, { onConflict: "plan_id,billing_cycle" })
      .select("id").single();
    if (error) mapPgError(error);
    return { ok: true, id: (ins as { id: string }).id };
  });

export const adminTogglePlanPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { error } = await context.supabase
      .from("plan_pricing").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeletePlanPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { error } = await context.supabase
      .from("plan_pricing").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: pricing options visible to any signed-in user (active plan + active row). */
export const getPlanPricingOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ plan_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("plan_pricing")
      .select("id, billing_cycle, duration_days, price_bdt, discount_percent")
      .eq("plan_id", data.plan_id)
      .eq("is_active", true)
      .order("duration_days", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: {
      id: string; billing_cycle: string; duration_days: number;
      price_bdt: number; discount_percent: number;
    }) => ({
      ...r,
      net_price: Math.round(Number(r.price_bdt) * (1 - Number(r.discount_percent) / 100) * 100) / 100,
    }));
  });

// =====================================================================
// Lifecycle history (timeline)
// =====================================================================

export const adminGetSubscriptionHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ subscription_id: z.string().uuid(), limit: z.number().int().min(1).max(500).default(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("subscription_history")
      .select("id, subscription_id, tenant_id, plan_id, from_status, to_status, event, actor_user_id, metadata, created_at")
      .eq("subscription_id", data.subscription_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// =====================================================================
// Billing — invoices
// =====================================================================

const INVOICE_STATUS = ["draft","unpaid","paid","overdue","cancelled","refunded"] as const;
const INVOICE_KIND = ["new","renewal","upgrade","downgrade","manual","adjustment"] as const;

export const adminListInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.enum(INVOICE_STATUS).optional(),
    kind: z.enum(INVOICE_KIND).optional(),
    tenant_id: z.string().uuid().optional(),
    search: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().min(1).max(1000).default(300),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    let q = context.supabase
      .from("subscription_invoices")
      .select(`
        id, invoice_no, tenant_id, subscription_id, plan_id, plan_name,
        billing_cycle, duration_days, period_start, period_end,
        kind, amount, discount, vat_percent, vat, grand_total,
        currency, status, payment_id, paid_at, due_at, notes, created_at,
        tenant:tenants ( id, name, email )
      `)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.tenant_id) q = q.eq("tenant_id", data.tenant_id);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const term = (data.search ?? "").trim().toLowerCase();
    const list = (rows ?? []) as unknown as Array<{
      invoice_no: string; tenant?: { name?: string; email?: string } | null;
    }>;
    return term
      ? list.filter((r) =>
          r.invoice_no.toLowerCase().includes(term) ||
          (r.tenant?.name ?? "").toLowerCase().includes(term) ||
          (r.tenant?.email ?? "").toLowerCase().includes(term))
      : list;
  });

export const adminGetInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { data: inv, error } = await context.supabase
      .from("subscription_invoices")
      .select(`*, tenant:tenants ( id, name, email, phone ),
               items:subscription_invoice_items ( id, description, quantity, unit_price, amount )`)
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);
    return inv;
  });

export const adminCreateManualInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    subscription_id: z.string().uuid(),
    amount: z.number().min(0),
    discount: z.number().min(0).default(0),
    vat_percent: z.number().min(0).max(100).default(0),
    notes: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { data: id, error } = await context.supabase.rpc("admin_create_manual_invoice", {
      p_subscription_id: data.subscription_id,
      p_amount: data.amount,
      p_discount: data.discount,
      p_vat_percent: data.vat_percent,
      p_notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true, id };
  });

export const adminSetInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(INVOICE_STATUS),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const patch: { status: typeof data.status; paid_at?: string } = { status: data.status };
    if (data.status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("subscription_invoices").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Tenant-scoped: signed-in user fetches own invoice history. */
export const getMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenant_id = await myTenantId(context);
    if (!tenant_id) return [];
    const { data, error } = await context.supabase
      .from("subscription_invoices")
      .select("id, invoice_no, plan_name, billing_cycle, amount, vat, discount, grand_total, currency, status, kind, period_start, period_end, due_at, paid_at, created_at")
      .eq("tenant_id", tenant_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// =====================================================================
// Subscription Analytics (admin)
// =====================================================================

const ANALYTICS_INPUT = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  plan_id: z.string().uuid().optional(),
  status: z.enum(SUB_STATUS).optional(),
});

function monthlyNormalize(price: number, cycle: string): number {
  switch (cycle) {
    case "monthly": return price;
    case "quarterly": return price / 3;
    case "half_yearly": return price / 6;
    case "yearly": return price / 12;
    case "lifetime": return price / 36;
    default: return price;
  }
}

function dayKey(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export const adminSubscriptionAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ANALYTICS_INPUT.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const to = data.to ? new Date(data.to) : new Date();
    const from = data.from ? new Date(data.from) : new Date(to.getTime() - 29 * 86400000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    // Subscriptions + plans
    let subQ = context.supabase
      .from("subscriptions")
      .select("id, tenant_id, plan_id, status, billing_cycle, created_at, cancelled_at, trial_ends_at, current_period_start, current_period_end, plan:plans(id,name,code,price_bdt,price_yearly_bdt)")
      .limit(5000);
    if (data.plan_id) subQ = subQ.eq("plan_id", data.plan_id);
    if (data.status) subQ = subQ.eq("status", data.status);
    const { data: subs, error: subErr } = await subQ;
    if (subErr) throw new Error(subErr.message);
    const subRows = (subs ?? []) as any[];

    // Invoices (paid) for revenue trend
    let invQ = context.supabase
      .from("subscription_invoices")
      .select("id, tenant_id, plan_id, plan_name, billing_cycle, grand_total, kind, status, paid_at, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(10000);
    if (data.plan_id) invQ = invQ.eq("plan_id", data.plan_id);
    const { data: invs, error: invErr } = await invQ;
    if (invErr) throw new Error(invErr.message);
    const invRows = (invs ?? []) as any[];

    // History events for churn/upgrade/downgrade trends
    let hQ = context.supabase
      .from("subscription_history")
      .select("id, subscription_id, tenant_id, plan_id, event, from_status, to_status, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .limit(10000);
    if (data.plan_id) hQ = hQ.eq("plan_id", data.plan_id);
    const { data: hist, error: hErr } = await hQ;
    if (hErr) throw new Error(hErr.message);
    const histRows = (hist ?? []) as any[];

    // KPIs
    const active = subRows.filter((s) => s.status === "active" || s.status === "trial" || s.status === "grace_period");
    const activeSubscribers = active.filter((s) => s.status !== "trial").length;
    let mrr = 0;
    for (const s of active) {
      const price = Number(s.plan?.price_bdt ?? 0);
      mrr += monthlyNormalize(price, s.billing_cycle ?? "monthly");
    }
    const arr = mrr * 12;
    const arpu = activeSubscribers > 0 ? mrr / activeSubscribers : 0;

    // Trial conversion (in window): trials started vs trial_converted events
    const trialsStarted = subRows.filter(
      (s) => s.trial_ends_at && new Date(s.created_at) >= from && new Date(s.created_at) <= to,
    ).length;
    const trialConverted = histRows.filter((h) => h.event === "trial_converted").length;
    const trialConversionRate = trialsStarted > 0 ? (trialConverted / trialsStarted) * 100 : 0;

    // Churn rate: cancelled/expired in window / active at window start
    const churned = histRows.filter((h) => h.event === "cancelled" || h.event === "expired").length;
    const activeAtStart = subRows.filter(
      (s) =>
        new Date(s.created_at) <= from &&
        (!s.cancelled_at || new Date(s.cancelled_at) > from),
    ).length;
    const churnRate = activeAtStart > 0 ? (churned / activeAtStart) * 100 : 0;

    // LTV ~= ARPU / churn (monthly fraction); guard against zero
    const monthlyChurnFrac = churnRate / 100;
    const ltv = monthlyChurnFrac > 0 ? arpu / monthlyChurnFrac : arpu * 24;

    // Revenue Growth: this window vs equal previous window
    const winMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - winMs).toISOString();
    const prevTo = fromIso;
    const { data: prevInvs } = await context.supabase
      .from("subscription_invoices")
      .select("grand_total, status, created_at")
      .gte("created_at", prevFrom)
      .lt("created_at", prevTo)
      .eq("status", "paid")
      .limit(10000);
    const currentRevenue = invRows
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + Number(i.grand_total ?? 0), 0);
    const prevRevenue = (prevInvs ?? []).reduce((sum: number, i: any) => sum + Number(i.grand_total ?? 0), 0);
    const revenueGrowth = prevRevenue > 0
      ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
      : currentRevenue > 0 ? 100 : 0;

    // Build day buckets
    const dayCount = Math.max(1, Math.ceil(winMs / 86400000) + 1);
    const days: string[] = [];
    for (let i = 0; i < dayCount; i++) {
      days.push(new Date(from.getTime() + i * 86400000).toISOString().slice(0, 10));
    }
    const emptyMap = () => Object.fromEntries(days.map((d) => [d, 0])) as Record<string, number>;

    // Revenue trend
    const revenueMap = emptyMap();
    for (const i of invRows) {
      if (i.status !== "paid") continue;
      const k = dayKey(i.paid_at ?? i.created_at);
      if (k in revenueMap) revenueMap[k] += Number(i.grand_total ?? 0);
    }
    const revenueTrend = days.map((d) => ({ date: d, value: Math.round(revenueMap[d] * 100) / 100 }));

    // Subscription trend (new subs per day, in-window)
    const newSubMap = emptyMap();
    for (const s of subRows) {
      const k = dayKey(s.created_at);
      if (k in newSubMap) newSubMap[k] += 1;
    }
    const subscriptionTrend = days.map((d) => ({ date: d, value: newSubMap[d] }));

    // Churn trend
    const churnMap = emptyMap();
    for (const h of histRows) {
      if (h.event !== "cancelled" && h.event !== "expired") continue;
      const k = dayKey(h.created_at);
      if (k in churnMap) churnMap[k] += 1;
    }
    const churnTrend = days.map((d) => ({ date: d, value: churnMap[d] }));

    // Upgrade / Downgrade trend
    const upMap = emptyMap();
    const downMap = emptyMap();
    for (const h of histRows) {
      const k = dayKey(h.created_at);
      if (!(k in upMap)) continue;
      if (h.event === "upgraded") upMap[k] += 1;
      else if (h.event === "downgraded") downMap[k] += 1;
    }
    const upgradeDowngradeTrend = days.map((d) => ({
      date: d,
      upgrades: upMap[d],
      downgrades: downMap[d],
    }));

    // Plan distribution (active subscribers per plan)
    const planDistMap: Record<string, { plan_id: string; name: string; count: number; mrr: number }> = {};
    for (const s of active) {
      const id = s.plan?.id ?? s.plan_id ?? "unknown";
      const name = s.plan?.name ?? "Unknown";
      if (!planDistMap[id]) planDistMap[id] = { plan_id: id, name, count: 0, mrr: 0 };
      planDistMap[id].count += 1;
      planDistMap[id].mrr += monthlyNormalize(Number(s.plan?.price_bdt ?? 0), s.billing_cycle ?? "monthly");
    }
    const planDistribution = Object.values(planDistMap).sort((a, b) => b.count - a.count);

    return {
      window: { from: fromIso, to: toIso },
      kpis: {
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        activeSubscribers,
        trialConversionRate: Math.round(trialConversionRate * 100) / 100,
        churnRate: Math.round(churnRate * 100) / 100,
        revenueGrowth: Math.round(revenueGrowth * 100) / 100,
        ltv: Math.round(ltv * 100) / 100,
        arpu: Math.round(arpu * 100) / 100,
      },
      charts: {
        revenueTrend,
        subscriptionTrend,
        churnTrend,
        upgradeDowngradeTrend,
        planDistribution,
      },
      totals: {
        currentRevenue: Math.round(currentRevenue * 100) / 100,
        previousRevenue: Math.round(prevRevenue * 100) / 100,
        newSubscriptions: subRows.filter((s) => {
          const t = new Date(s.created_at).getTime();
          return t >= from.getTime() && t <= to.getTime();
        }).length,
        churned,
      },
    };
  });

