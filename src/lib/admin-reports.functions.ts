// SaaS Reports & Analytics — server functions
// All endpoints are gated by is_app_admin and read live data.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- shared types & helpers ----------

const FilterSchema = z.object({
  from: z.string(),                // ISO date
  to: z.string(),                  // ISO date
  store_id: z.string().uuid().optional(),
  plan_id: z.string().uuid().optional(),
  status: z.string().optional(),
  district: z.string().optional(),
  payment_status: z.string().optional(),
  gateway: z.string().optional(),
});
export type ReportFilters = z.infer<typeof FilterSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(ctx: any) {
  const { data } = await ctx.supabase.rpc("is_app_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden");
}

function prevPeriod(from: string, to: string): { from: string; to: string } {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  const span = Math.max(1, b - a);
  return { from: new Date(a - span).toISOString(), to: new Date(a).toISOString() };
}

function growth(curr: number, prev: number): number {
  if (!prev) return curr > 0 ? 100 : 0;
  return Number((((curr - prev) / prev) * 100).toFixed(1));
}

// ---------- Section 1 — Executive KPIs ----------

export const getExecutiveKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const prev = prevPeriod(data.from, data.to);

    // Tenants by status (all-time + window)
    const [{ data: tenants = [] }, { data: payments = [] }, { data: prevPayments = [] }, { data: branches }, { data: users }, { data: meds }] = await Promise.all([
      supabase.from("tenants").select("id, status, created_at"),
      supabase.from("subscription_payments").select("amount, status, payment_status, created_at, verified_at").gte("created_at", data.from).lte("created_at", data.to),
      supabase.from("subscription_payments").select("amount, status, payment_status").gte("created_at", prev.from).lte("created_at", prev.to),
      supabase.from("branches").select("id", { count: "exact", head: true }),
      supabase.from("tenant_members").select("user_id", { count: "exact", head: true }),
      supabase.from("global_medicines").select("id", { count: "exact", head: true }),
    ]);

    const tList = (tenants as Array<{ id: string; status: string | null; created_at: string }>) ?? [];
    const byStatus = (s: string) => tList.filter((t) => (t.status ?? "").toLowerCase() === s).length;
    const newInWindow = tList.filter((t) => t.created_at >= data.from && t.created_at <= data.to).length;
    const newPrev = tList.filter((t) => t.created_at >= prev.from && t.created_at <= prev.to).length;

    const settled = (rows: Array<{ amount: number | null; payment_status: string | null }> | null) =>
      (rows ?? [])
        .filter((r) => {
          const v = (r.payment_status ?? "").toLowerCase();
          return v === "completed" || v === "success" || v === "verified";
        })
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const revenue = settled(payments as Array<{ amount: number | null; payment_status: string | null }>);
    const revenuePrev = settled(prevPayments as Array<{ amount: number | null; payment_status: string | null }>);

    // MRR: sum of monthly-equivalent revenue from active subscriptions
    const { data: activeSubs = [] } = await supabase
      .from("subscriptions")
      .select("plan_id, status")
      .eq("status", "active");
    const { data: plans = [] } = await supabase.from("plans").select("id, price_bdt, price_yearly_bdt, billing_interval");
    const planMap = new Map<string, { m: number }>();
    (plans as Array<{ id: string; price_bdt: number | null; price_yearly_bdt: number | null; billing_interval: string | null }>).forEach((p) => {
      const m = (p.billing_interval ?? "monthly") === "yearly"
        ? Number(p.price_yearly_bdt ?? 0) / 12
        : Number(p.price_bdt ?? 0);
      planMap.set(p.id, { m });
    });
    const mrr = (activeSubs as Array<{ plan_id: string | null }>).reduce(
      (s, sub) => s + (sub.plan_id ? (planMap.get(sub.plan_id)?.m ?? 0) : 0), 0,
    );
    const arr = mrr * 12;

    // Monthly + annual revenue (calendar)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const { data: monthPay = [] } = await supabase
      .from("subscription_payments")
      .select("amount, payment_status")
      .gte("created_at", monthStart);
    const { data: yearPay = [] } = await supabase
      .from("subscription_payments")
      .select("amount, payment_status")
      .gte("created_at", yearStart);

    return {
      kpis: {
        total_stores: { current: tList.length, previous: tList.length - newInWindow + newPrev, growth: growth(newInWindow, newPrev) },
        active_stores: { current: byStatus("active"), previous: 0, growth: 0 },
        pending_stores: { current: byStatus("pending"), previous: 0, growth: 0 },
        suspended_stores: { current: byStatus("suspended"), previous: 0, growth: 0 },
        expired_stores: { current: byStatus("expired"), previous: 0, growth: 0 },
        rejected_stores: { current: byStatus("rejected"), previous: 0, growth: 0 },
        total_revenue: { current: revenue, previous: revenuePrev, growth: growth(revenue, revenuePrev) },
        monthly_revenue: { current: settled(monthPay), previous: 0, growth: 0 },
        annual_revenue: { current: settled(yearPay), previous: 0, growth: 0 },
        mrr: { current: Number(mrr.toFixed(2)), previous: 0, growth: 0 },
        arr: { current: Number(arr.toFixed(2)), previous: 0, growth: 0 },
        total_branches: { current: (branches as unknown as { count?: number } | null)?.count ?? 0, previous: 0, growth: 0 },
        total_users: { current: (users as unknown as { count?: number } | null)?.count ?? 0, previous: 0, growth: 0 },
        total_medicines: { current: (meds as unknown as { count?: number } | null)?.count ?? 0, previous: 0, growth: 0 },
      },
    };
  });

// ---------- Section 2 — Revenue Analytics ----------

export const getRevenueAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.extend({
    granularity: z.enum(["day", "week", "month"]).default("day"),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    let q = supabase
      .from("subscription_payments")
      .select("id, amount, created_at, payment_status, status, gateway, plan_id, tenant_id")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (data.gateway) q = q.eq("gateway", data.gateway);
    if (data.payment_status) q = q.eq("payment_status", data.payment_status);
    if (data.store_id) q = q.eq("tenant_id", data.store_id);
    if (data.plan_id) q = q.eq("plan_id", data.plan_id);

    const { data: rows = [] } = await q;
    const list = (rows as Array<{ amount: number | null; created_at: string; payment_status: string | null; gateway: string | null; plan_id: string | null }>);

    const isSettled = (s: string | null) => {
      const v = (s ?? "").toLowerCase();
      return v === "completed" || v === "success" || v === "verified";
    };

    const bucketKey = (d: Date): string => {
      if (data.granularity === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (data.granularity === "week") {
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
      }
      return d.toISOString().slice(0, 10);
    };

    const trendMap = new Map<string, number>();
    list.forEach((r) => {
      if (!isSettled(r.payment_status)) return;
      const k = bucketKey(new Date(r.created_at));
      trendMap.set(k, (trendMap.get(k) ?? 0) + Number(r.amount ?? 0));
    });
    const trend = Array.from(trendMap, ([bucket, revenue]) => ({ bucket, revenue })).sort((a, b) => a.bucket.localeCompare(b.bucket));

    // By plan
    const { data: plans = [] } = await supabase.from("plans").select("id, name, code");
    const planNames = new Map((plans as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
    const planAgg = new Map<string, { name: string; count: number; revenue: number }>();
    list.forEach((r) => {
      const name = r.plan_id ? (planNames.get(r.plan_id) ?? "Unknown") : "Unknown";
      const cur = planAgg.get(name) ?? { name, count: 0, revenue: 0 };
      cur.count += 1;
      if (isSettled(r.payment_status)) cur.revenue += Number(r.amount ?? 0);
      planAgg.set(name, cur);
    });
    const totalPlanRevenue = Array.from(planAgg.values()).reduce((s, p) => s + p.revenue, 0) || 1;
    const byPlan = Array.from(planAgg.values()).map((p) => ({
      ...p, percentage: Number(((p.revenue / totalPlanRevenue) * 100).toFixed(1)),
    }));

    // By gateway
    const gwAgg = new Map<string, { gateway: string; transactions: number; successful: number; failed: number; revenue: number }>();
    list.forEach((r) => {
      const g = r.gateway ?? "unknown";
      const cur = gwAgg.get(g) ?? { gateway: g, transactions: 0, successful: 0, failed: 0, revenue: 0 };
      cur.transactions += 1;
      if (isSettled(r.payment_status)) { cur.successful += 1; cur.revenue += Number(r.amount ?? 0); }
      else if ((r.payment_status ?? "").toLowerCase() === "failed") cur.failed += 1;
      gwAgg.set(g, cur);
    });

    return { trend, by_plan: byPlan, by_gateway: Array.from(gwAgg.values()) };
  });

// ---------- Section 3 — Store Analytics ----------

export const getStoreAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    let q = supabase.from("tenants").select("id, name, plan, status, district, created_at");
    if (data.status) q = q.eq("status", data.status);
    if (data.district) q = q.eq("district", data.district);

    const { data: tenants = [] } = await q;
    const list = tenants as Array<{ id: string; name: string; plan: string | null; status: string | null; district: string | null; created_at: string }>;

    // Growth trend (monthly registrations)
    const growthMap = new Map<string, number>();
    list.forEach((t) => {
      const d = new Date(t.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      growthMap.set(k, (growthMap.get(k) ?? 0) + 1);
    });
    const trend = Array.from(growthMap, ([bucket, count]) => ({ bucket, count })).sort((a, b) => a.bucket.localeCompare(b.bucket));

    // Status distribution
    const statusMap = new Map<string, number>();
    list.forEach((t) => {
      const s = (t.status ?? "unknown").toLowerCase();
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    });
    const status_distribution = Array.from(statusMap, ([name, value]) => ({ name, value }));

    // Top stores — join branches count, user count, revenue
    const ids = list.map((t) => t.id);
    const [{ data: brs = [] }, { data: members = [] }, { data: pays = [] }] = await Promise.all([
      ids.length ? supabase.from("branches").select("tenant_id").in("tenant_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("tenant_members").select("tenant_id, user_id").in("tenant_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("subscription_payments").select("tenant_id, amount, payment_status").in("tenant_id", ids) : Promise.resolve({ data: [] }),
    ]);
    const branchesByT = new Map<string, number>();
    (brs as Array<{ tenant_id: string }>).forEach((b) => branchesByT.set(b.tenant_id, (branchesByT.get(b.tenant_id) ?? 0) + 1));
    const usersByT = new Map<string, number>();
    (members as Array<{ tenant_id: string }>).forEach((m) => usersByT.set(m.tenant_id, (usersByT.get(m.tenant_id) ?? 0) + 1));
    const revByT = new Map<string, number>();
    (pays as Array<{ tenant_id: string; amount: number | null; payment_status: string | null }>).forEach((p) => {
      const s = (p.payment_status ?? "").toLowerCase();
      if (s === "completed" || s === "success" || s === "verified") {
        revByT.set(p.tenant_id, (revByT.get(p.tenant_id) ?? 0) + Number(p.amount ?? 0));
      }
    });

    const top_stores = list
      .map((t) => ({
        id: t.id, name: t.name, plan: t.plan, status: t.status, created_at: t.created_at,
        users: usersByT.get(t.id) ?? 0,
        branches: branchesByT.get(t.id) ?? 0,
        revenue: revByT.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return { trend, status_distribution, top_stores };
  });

// ---------- Section 4 — Subscription Analytics ----------

export const getSubscriptionAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const { data: subs = [] } = await supabase
      .from("subscriptions")
      .select("id, tenant_id, plan_id, status, current_period_end, trial_ends_at, created_at");
    const list = subs as Array<{ id: string; tenant_id: string; plan_id: string | null; status: string | null; current_period_end: string | null; trial_ends_at: string | null; created_at: string }>;

    const counts = {
      active: list.filter((s) => s.status === "active").length,
      trial: list.filter((s) => s.status === "trial").length,
      expired: list.filter((s) => s.status === "expired").length,
      renewed: list.filter((s) => s.status === "renewed").length,
    };

    const { data: plans = [] } = await supabase.from("plans").select("id, name");
    const planNames = new Map((plans as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
    const planMap = new Map<string, number>();
    list.forEach((s) => {
      const n = s.plan_id ? (planNames.get(s.plan_id) ?? "Unknown") : "Unknown";
      planMap.set(n, (planMap.get(n) ?? 0) + 1);
    });
    const plan_distribution = Array.from(planMap, ([name, value]) => ({ name, value }));

    const trendMap = new Map<string, number>();
    list.forEach((s) => {
      const d = new Date(s.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
    });
    const trend = Array.from(trendMap, ([bucket, count]) => ({ bucket, count })).sort((a, b) => a.bucket.localeCompare(b.bucket));

    // Expiry buckets
    const now = Date.now();
    const days = (ms: number) => Math.floor(ms / 86400000);
    const expiring = list
      .filter((s) => s.current_period_end)
      .map((s) => ({
        id: s.id,
        tenant_id: s.tenant_id,
        plan_id: s.plan_id,
        expiry: s.current_period_end!,
        days_remaining: days(new Date(s.current_period_end!).getTime() - now),
      }));
    const expiry = {
      today: expiring.filter((e) => e.days_remaining === 0).length,
      in_7: expiring.filter((e) => e.days_remaining > 0 && e.days_remaining <= 7).length,
      in_30: expiring.filter((e) => e.days_remaining > 0 && e.days_remaining <= 30).length,
      expired: expiring.filter((e) => e.days_remaining < 0).length,
    };

    const tIds = Array.from(new Set(expiring.map((e) => e.tenant_id)));
    const { data: tenants = [] } = tIds.length
      ? await supabase.from("tenants").select("id, name").in("id", tIds)
      : { data: [] };
    const nameMap = new Map((tenants as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));

    const expiry_list = expiring
      .filter((e) => e.days_remaining <= 30)
      .sort((a, b) => a.days_remaining - b.days_remaining)
      .map((e) => ({
        store: nameMap.get(e.tenant_id) ?? "—",
        plan: e.plan_id ? (planNames.get(e.plan_id) ?? "—") : "—",
        expiry: e.expiry,
        days_remaining: e.days_remaining,
      }));

    return { counts, plan_distribution, trend, expiry, expiry_list };
  });

// ---------- Section 5 — Payment Analytics ----------

export const getPaymentAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    let q = supabase
      .from("subscription_payments")
      .select("id, tenant_id, gateway, amount, payment_status, status, gateway_error, created_at")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (data.gateway) q = q.eq("gateway", data.gateway);
    if (data.payment_status) q = q.eq("payment_status", data.payment_status);

    const { data: rows = [] } = await q;
    const list = rows as Array<{ id: string; tenant_id: string; gateway: string | null; amount: number | null; payment_status: string | null; status: string | null; gateway_error: string | null; created_at: string }>;

    const norm = (s: string | null) => (s ?? "").toLowerCase();
    const kpis = {
      total: list.length,
      successful: list.filter((r) => ["completed", "success", "verified"].includes(norm(r.payment_status))).length,
      failed: list.filter((r) => norm(r.payment_status) === "failed").length,
      pending: list.filter((r) => ["pending", "pending_review", "processing"].includes(norm(r.payment_status))).length,
      refunded: list.filter((r) => norm(r.payment_status) === "refunded").length,
    };

    const gwMap = new Map<string, { gateway: string; total: number; success: number; failed: number; revenue: number }>();
    list.forEach((r) => {
      const g = r.gateway ?? "unknown";
      const cur = gwMap.get(g) ?? { gateway: g, total: 0, success: 0, failed: 0, revenue: 0 };
      cur.total += 1;
      const s = norm(r.payment_status);
      if (["completed", "success", "verified"].includes(s)) { cur.success += 1; cur.revenue += Number(r.amount ?? 0); }
      else if (s === "failed") cur.failed += 1;
      gwMap.set(g, cur);
    });
    const gateway_performance = Array.from(gwMap.values()).map((g) => ({
      ...g,
      success_rate: g.total ? Number(((g.success / g.total) * 100).toFixed(1)) : 0,
      failure_rate: g.total ? Number(((g.failed / g.total) * 100).toFixed(1)) : 0,
    }));

    const failedRows = list.filter((r) => norm(r.payment_status) === "failed");
    const tIds = Array.from(new Set(failedRows.map((r) => r.tenant_id)));
    const { data: tenants = [] } = tIds.length
      ? await supabase.from("tenants").select("id, name").in("id", tIds)
      : { data: [] };
    const nameMap = new Map((tenants as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));
    const failed_payments = failedRows.map((r) => ({
      store: nameMap.get(r.tenant_id) ?? "—",
      gateway: r.gateway ?? "—",
      amount: Number(r.amount ?? 0),
      reason: r.gateway_error ?? "—",
      date: r.created_at,
    }));

    return { kpis, gateway_performance, failed_payments };
  });

// ---------- Section 9 — Financial Health ----------

export const getFinancialHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const { data: activeSubs = [] } = await supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("status", "active");
    const { data: plans = [] } = await supabase.from("plans").select("id, price_bdt, price_yearly_bdt, billing_interval");
    const planMap = new Map<string, number>();
    (plans as Array<{ id: string; price_bdt: number | null; price_yearly_bdt: number | null; billing_interval: string | null }>).forEach((p) => {
      const m = (p.billing_interval ?? "monthly") === "yearly"
        ? Number(p.price_yearly_bdt ?? 0) / 12
        : Number(p.price_bdt ?? 0);
      planMap.set(p.id, m);
    });
    const mrr = (activeSubs as Array<{ plan_id: string | null }>).reduce(
      (s, sub) => s + (sub.plan_id ? (planMap.get(sub.plan_id) ?? 0) : 0), 0,
    );

    const { data: allTenants } = await supabase.from("tenants").select("id, status");
    const tenantsArr = (allTenants ?? []) as Array<{ status: string | null }>;
    const total = tenantsArr.length || 1;
    const lost = tenantsArr.filter((t) => ["expired", "suspended", "rejected"].includes((t.status ?? "").toLowerCase())).length;
    const churn_rate = Number(((lost / total) * 100).toFixed(1));

    const { data: expiringWindow = [] } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .gte("current_period_end", data.from)
      .lte("current_period_end", data.to);
    const expWin = expiringWindow as Array<{ status: string | null }>;
    const renewed = expWin.filter((s) => (s.status ?? "") === "active" || (s.status ?? "") === "renewed").length;
    const renewal_rate = expWin.length ? Number(((renewed / expWin.length) * 100).toFixed(1)) : 0;

    const { data: invoiced = [] } = await supabase
      .from("subscription_payments")
      .select("amount, payment_status")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    const invoicedAmount = (invoiced as Array<{ amount: number | null }>).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const collected = (invoiced as Array<{ amount: number | null; payment_status: string | null }>)
      .filter((r) => ["completed", "success", "verified"].includes((r.payment_status ?? "").toLowerCase()))
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const collection_rate = invoicedAmount ? Number(((collected / invoicedAmount) * 100).toFixed(1)) : 0;

    return {
      mrr: Number(mrr.toFixed(2)),
      arr: Number((mrr * 12).toFixed(2)),
      churn_rate,
      renewal_rate,
      collection_rate,
      collected,
      invoiced: invoicedAmount,
    };
  });

// ---------- Filter dropdown data ----------

export const getReportFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const [{ data: stores = [] }, { data: plans = [] }, { data: tenants = [] }] = await Promise.all([
      supabase.from("tenants").select("id, name").order("name"),
      supabase.from("plans").select("id, name, code").order("sort_order"),
      supabase.from("tenants").select("district").not("district", "is", null),
    ]);
    const districts = Array.from(new Set((tenants as Array<{ district: string | null }>).map((t) => t.district).filter(Boolean) as string[])).sort();
    return {
      stores: stores as Array<{ id: string; name: string }>,
      plans: plans as Array<{ id: string; name: string; code: string }>,
      districts,
    };
  });

// ============================================================
// PHASE 2 — Branch / User / Medicine / Audit / Security
// ============================================================

// ---------- Section 7 — Branch Analytics ----------

export const getBranchAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    let q = supabase.from("branches").select("id, tenant_id, is_main, is_active, address, created_at");
    if (data.store_id) q = q.eq("tenant_id", data.store_id);
    const { data: rows = [] } = await q;
    const list = rows as Array<{ id: string; tenant_id: string; is_main: boolean | null; is_active: boolean | null; address: string | null; created_at: string }>;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const kpis = {
      total: list.length,
      hq: list.filter((b) => b.is_main).length,
      active: list.filter((b) => b.is_active !== false).length,
      inactive: list.filter((b) => b.is_active === false).length,
      new_this_month: list.filter((b) => b.created_at >= monthStart).length,
    };

    const trendMap = new Map<string, number>();
    list.forEach((b) => {
      const d = new Date(b.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
    });
    const trend = Array.from(trendMap, ([bucket, count]) => ({ bucket, count })).sort((a, b) => a.bucket.localeCompare(b.bucket));

    const status_distribution = [
      { name: "Active", value: kpis.active },
      { name: "Inactive", value: kpis.inactive },
      { name: "HQ", value: kpis.hq },
    ];

    // District distribution — pull from tenants
    const tIds = Array.from(new Set(list.map((b) => b.tenant_id)));
    const { data: tenants = [] } = tIds.length
      ? await supabase.from("tenants").select("id, name, plan, district").in("id", tIds)
      : { data: [] };
    const tMap = new Map((tenants as Array<{ id: string; name: string; plan: string | null; district: string | null }>).map((t) => [t.id, t]));
    const distMap = new Map<string, number>();
    list.forEach((b) => {
      const d = tMap.get(b.tenant_id)?.district ?? "Unknown";
      distMap.set(d, (distMap.get(d) ?? 0) + 1);
    });
    const district_distribution = Array.from(distMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    // Top stores by branch count
    const byTenant = new Map<string, { total: number; hq: number; active: number }>();
    list.forEach((b) => {
      const cur = byTenant.get(b.tenant_id) ?? { total: 0, hq: 0, active: 0 };
      cur.total += 1;
      if (b.is_main) cur.hq += 1;
      if (b.is_active !== false) cur.active += 1;
      byTenant.set(b.tenant_id, cur);
    });
    const top_stores = Array.from(byTenant, ([tid, v]) => ({
      id: tid,
      name: tMap.get(tid)?.name ?? "—",
      plan: tMap.get(tid)?.plan ?? null,
      ...v,
      created_at: tMap.get(tid) ? "" : "",
    })).sort((a, b) => b.total - a.total).slice(0, 25);

    return { kpis, trend, status_distribution, district_distribution, top_stores };
  });

// ---------- Section 8 — User Analytics ----------

export const getUserAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    let memQ = supabase.from("tenant_members").select("user_id, tenant_id, created_at");
    if (data.store_id) memQ = memQ.eq("tenant_id", data.store_id);
    const [{ data: members = [] }, { data: roles = [] }] = await Promise.all([
      memQ,
      supabase.from("user_roles").select("user_id, tenant_id, role"),
    ]);
    const m = members as Array<{ user_id: string; tenant_id: string; created_at: string }>;
    const r = roles as Array<{ user_id: string; tenant_id: string; role: string }>;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const uniqueUsers = new Set(m.map((x) => x.user_id));
    const kpis = {
      total: uniqueUsers.size,
      active: uniqueUsers.size,
      new_this_month: new Set(m.filter((x) => x.created_at >= monthStart).map((x) => x.user_id)).size,
      disabled: 0,
    };

    const roleMap = new Map<string, number>();
    r.forEach((x) => {
      const k = x.role.toLowerCase();
      roleMap.set(k, (roleMap.get(k) ?? 0) + 1);
    });
    const role_distribution = Array.from(roleMap, ([name, value]) => ({ name, value }));

    const trendMap = new Map<string, number>();
    m.forEach((x) => {
      const d = new Date(x.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
    });
    const trend = Array.from(trendMap, ([bucket, count]) => ({ bucket, count })).sort((a, b) => a.bucket.localeCompare(b.bucket));

    // Top stores by users
    const tIds = Array.from(new Set(m.map((x) => x.tenant_id)));
    const { data: tenants = [] } = tIds.length
      ? await supabase.from("tenants").select("id, name").in("id", tIds)
      : { data: [] };
    const tName = new Map((tenants as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));

    const byTenant = new Map<string, { users: Set<string>; owners: number; managers: number; staff: number }>();
    m.forEach((x) => {
      const cur = byTenant.get(x.tenant_id) ?? { users: new Set(), owners: 0, managers: 0, staff: 0 };
      cur.users.add(x.user_id);
      byTenant.set(x.tenant_id, cur);
    });
    r.forEach((x) => {
      const cur = byTenant.get(x.tenant_id);
      if (!cur) return;
      const role = x.role.toLowerCase();
      if (role === "owner") cur.owners += 1;
      else if (role === "manager") cur.managers += 1;
      else cur.staff += 1;
    });
    const top_stores = Array.from(byTenant, ([tid, v]) => ({
      id: tid,
      name: tName.get(tid) ?? "—",
      users: v.users.size,
      owners: v.owners,
      managers: v.managers,
      staff: v.staff,
    })).sort((a, b) => b.users - a.users).slice(0, 25);

    void data;
    return { kpis, role_distribution, trend, top_stores };
  });

// ---------- Section 9 — Medicine Analytics ----------

export const getMedicineAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    const [{ data: meds = [] }, { data: adoptions = [] }] = await Promise.all([
      supabase.from("global_medicines").select("id, brand_name, generic_name_cached, manufacturer_name_cached, approved, created_at"),
      supabase.from("global_medicine_adoptions").select("global_medicine_id, tenant_id, adopted_at"),
    ]);
    const list = meds as Array<{ id: string; brand_name: string; generic_name_cached: string | null; manufacturer_name_cached: string | null; approved: boolean | null; created_at: string }>;
    const adop = adoptions as Array<{ global_medicine_id: string; tenant_id: string; adopted_at: string }>;

    const kpis = {
      total: list.length,
      active: list.filter((m) => m.approved === true).length,
      pending: list.filter((m) => m.approved === null || m.approved === false).length,
      rejected: 0,
    };

    const trendMap = new Map<string, number>();
    list.forEach((m) => {
      const d = new Date(m.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
    });
    const trend = Array.from(trendMap, ([bucket, count]) => ({ bucket, count })).sort((a, b) => a.bucket.localeCompare(b.bucket));

    const mfgMap = new Map<string, number>();
    list.forEach((m) => {
      const n = m.manufacturer_name_cached ?? "Unknown";
      mfgMap.set(n, (mfgMap.get(n) ?? 0) + 1);
    });
    const top_manufacturers = Array.from(mfgMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    const genMap = new Map<string, number>();
    list.forEach((m) => {
      const n = m.generic_name_cached ?? "Unknown";
      genMap.set(n, (genMap.get(n) ?? 0) + 1);
    });
    const top_categories = Array.from(genMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    const usageMap = new Map<string, number>();
    adop.forEach((a) => usageMap.set(a.global_medicine_id, (usageMap.get(a.global_medicine_id) ?? 0) + 1));

    const most_adopted = list
      .map((m) => ({
        id: m.id,
        name: m.brand_name,
        generic: m.generic_name_cached ?? "—",
        manufacturer: m.manufacturer_name_cached ?? "—",
        stores_using: usageMap.get(m.id) ?? 0,
        status: m.approved ? "approved" : "pending",
      }))
      .sort((a, b) => b.stores_using - a.stores_using)
      .slice(0, 50);

    void data;
    return { kpis, trend, top_manufacturers, top_categories, most_adopted };
  });

// ---------- Section 10 — Audit Reports ----------

export const getAuditReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    let q = supabase
      .from("audit_log")
      .select("id, tenant_id, user_id, action, entity_table, ip_address, created_at, user_role")
      .gte("created_at", data.from)
      .lte("created_at", data.to)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.store_id) q = q.eq("tenant_id", data.store_id);
    const { data: rows = [] } = await q;
    const list = rows as Array<{ id: string; tenant_id: string | null; user_id: string | null; action: string | null; entity_table: string | null; ip_address: string | null; created_at: string; user_role: string | null }>;

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const kpis = {
      total: list.length,
      today: list.filter((r) => new Date(r.created_at) >= todayStart).length,
      admin: list.filter((r) => (r.user_role ?? "").toLowerCase().includes("admin")).length,
      store: list.filter((r) => !(r.user_role ?? "").toLowerCase().includes("admin")).length,
    };

    const dayMap = new Map<string, number>();
    list.forEach((r) => {
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
    });
    const timeline = Array.from(dayMap, ([bucket, count]) => ({ bucket, count })).sort((a, b) => a.bucket.localeCompare(b.bucket));

    const actMap = new Map<string, number>();
    list.forEach((r) => {
      const k = (r.action ?? "unknown").toLowerCase();
      actMap.set(k, (actMap.get(k) ?? 0) + 1);
    });
    const actions = Array.from(actMap, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 12);

    const tIds = Array.from(new Set(list.map((r) => r.tenant_id).filter(Boolean) as string[]));
    const { data: tenants = [] } = tIds.length
      ? await supabase.from("tenants").select("id, name").in("id", tIds)
      : { data: [] };
    const tMap = new Map((tenants as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));

    const recent = list.slice(0, 100).map((r) => ({
      time: r.created_at,
      user: r.user_id ?? "—",
      action: r.action ?? "—",
      store: r.tenant_id ? (tMap.get(r.tenant_id) ?? "—") : "—",
      ip: r.ip_address ?? "—",
      result: r.entity_table ?? "—",
    }));

    return { kpis, timeline, actions, recent };
  });

// ---------- Section 11 — Security Reports ----------

export const getSecurityReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    let q = supabase
      .from("security_events")
      .select("id, user_id, tenant_id, event_type, severity, detail, created_at")
      .gte("created_at", data.from)
      .lte("created_at", data.to)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.store_id) q = q.eq("tenant_id", data.store_id);
    const { data: rows = [] } = await q;
    const list = rows as Array<{ id: string; user_id: string | null; tenant_id: string | null; event_type: string | null; severity: string | null; detail: string | null; created_at: string }>;

    const sev = (s: string | null) => (s ?? "low").toLowerCase();
    const kpis = {
      total: list.length,
      failed_logins: list.filter((r) => (r.event_type ?? "").toLowerCase().includes("login")).length,
      alerts: list.filter((r) => ["high", "critical"].includes(sev(r.severity))).length,
      critical: list.filter((r) => sev(r.severity) === "critical").length,
    };

    const dayMap = new Map<string, number>();
    list.forEach((r) => {
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
    });
    const trend = Array.from(dayMap, ([bucket, count]) => ({ bucket, count })).sort((a, b) => a.bucket.localeCompare(b.bucket));

    const sevMap = new Map<string, number>();
    ["low", "medium", "high", "critical"].forEach((s) => sevMap.set(s, 0));
    list.forEach((r) => sevMap.set(sev(r.severity), (sevMap.get(sev(r.severity)) ?? 0) + 1));
    const severity_distribution = Array.from(sevMap, ([name, value]) => ({ name, value }));

    const tIds = Array.from(new Set(list.map((r) => r.tenant_id).filter(Boolean) as string[]));
    const { data: tenants = [] } = tIds.length
      ? await supabase.from("tenants").select("id, name").in("id", tIds)
      : { data: [] };
    const tMap = new Map((tenants as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));

    const recent = list.slice(0, 100).map((r) => ({
      time: r.created_at,
      user: r.user_id ?? "—",
      store: r.tenant_id ? (tMap.get(r.tenant_id) ?? "—") : "—",
      severity: r.severity ?? "low",
      message: r.detail ?? r.event_type ?? "—",
    }));

    return { kpis, trend, severity_distribution, recent };
  });
