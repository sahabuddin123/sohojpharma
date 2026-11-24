// E19 — Business Intelligence server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const TenantInput = z.object({
  tenant_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
});

function range(input: z.infer<typeof TenantInput>) {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * 86400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ============ Executive KPIs ============
export const executiveKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { from, to } = range(data);

    let salesQ = supabase
      .from("v_bi_sales_daily")
      .select("revenue, gross_profit, txn_count, avg_basket")
      .eq("tenant_id", data.tenant_id)
      .gte("day", from.slice(0, 10))
      .lte("day", to.slice(0, 10));
    if (data.warehouse_id) salesQ = salesQ.eq("warehouse_id", data.warehouse_id);
    const { data: salesRows } = await salesQ;

    const revenue = (salesRows ?? []).reduce((s, r) => s + Number(r.revenue ?? 0), 0);
    const grossProfit = (salesRows ?? []).reduce((s, r) => s + Number(r.gross_profit ?? 0), 0);
    const txnCount = (salesRows ?? []).reduce((s, r) => s + Number(r.txn_count ?? 0), 0);
    const avgBasket = txnCount ? revenue / txnCount : 0;

    const [invRes, custRes, supRes] = await Promise.all([
      supabase.from("v_stock_valuation").select("*").eq("tenant_id", data.tenant_id).limit(1),
      supabase.from("customers").select("id, created_at").eq("tenant_id", data.tenant_id),
      supabase.from("v_bi_supplier_stats").select("due_exposure").eq("tenant_id", data.tenant_id),
    ]);

    const invRow = (invRes.data?.[0] ?? null) as Record<string, unknown> | null;
    const inventoryValue = Number(invRow?.total_value ?? invRow?.stock_value ?? 0);
    const supStats = supRes.data as Array<{ due_exposure: number | null }> | null;
    const supplierExposure = (supStats ?? []).reduce((s, r) => s + Number(r.due_exposure ?? 0), 0);
    const custStats = custRes.data as Array<{ created_at: string }> | null;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const newCustomers = (custStats ?? []).filter((c) => c.created_at >= thirtyDaysAgo).length;

    // Stock turnover = COGS / avg inventory; simplified as revenue/inventory for the period
    const stockTurnover = inventoryValue > 0 ? revenue / inventoryValue : 0;
    const netProfit = grossProfit; // expenses subtracted elsewhere; leave as gross for now
    const cogs = revenue - grossProfit;

    return {
      revenue, grossProfit, netProfit, cogs,
      inventoryValue, stockTurnover,
      avgBasket, txnCount,
      customerGrowth: newCustomers,
      supplierExposure,
    };
  });

// ============ Sales analytics (daily series) ============
export const salesSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { from, to } = range(data);
    let q = context.supabase
      .from("v_bi_sales_daily")
      .select("day, revenue, gross_profit, txn_count, avg_basket")
      .eq("tenant_id", data.tenant_id)
      .gte("day", from.slice(0, 10))
      .lte("day", to.slice(0, 10))
      .order("day");
    if (data.warehouse_id) q = q.eq("warehouse_id", data.warehouse_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // Aggregate per day across warehouses if no warehouse filter
    const map = new Map<string, { day: string; revenue: number; gross_profit: number; txn_count: number }>();
    for (const r of rows ?? []) {
      const key = String(r.day);
      const prev = map.get(key) ?? { day: key, revenue: 0, gross_profit: 0, txn_count: 0 };
      prev.revenue += Number(r.revenue ?? 0);
      prev.gross_profit += Number(r.gross_profit ?? 0);
      prev.txn_count += Number(r.txn_count ?? 0);
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  });

// ============ Product analytics ============
export const productAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("v_bi_product_perf_30d")
      .select("*")
      .eq("tenant_id", data.tenant_id);
    const list = (rows ?? []) as Array<{
      product_id: string; name: string; sku: string;
      qty_sold_30d: number; revenue_30d: number; profit_30d: number; margin_pct: number;
      last_sold_at: string | null;
    }>;
    const byRevenue = [...list].sort((a, b) => Number(b.revenue_30d) - Number(a.revenue_30d));
    const byMargin = [...list].filter((p) => Number(p.revenue_30d) > 0).sort((a, b) => Number(b.margin_pct) - Number(a.margin_pct));
    const cutoff = Date.now() - 60 * 86400_000;
    const deadStock = list.filter((p) => !p.last_sold_at || new Date(p.last_sold_at).getTime() < cutoff);
    return {
      topSellers: byRevenue.slice(0, 20),
      slowMovers: byRevenue.filter((p) => Number(p.qty_sold_30d) > 0 && Number(p.qty_sold_30d) < 5).slice(0, 20),
      deadStock: deadStock.slice(0, 20),
      highMargin: byMargin.slice(0, 20),
      lowMargin: byMargin.slice(-20).reverse(),
    };
  });

// ============ Inventory aging ============
export const inventoryAging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("v_bi_inventory_aging")
      .select("*")
      .eq("tenant_id", data.tenant_id);
    const totals = (rows ?? []).reduce(
      (acc, r) => {
        acc.aging_0_30 += Number(r.aging_0_30 ?? 0);
        acc.aging_31_60 += Number(r.aging_31_60 ?? 0);
        acc.aging_61_90 += Number(r.aging_61_90 ?? 0);
        acc.aging_90_plus += Number(r.aging_90_plus ?? 0);
        return acc;
      },
      { aging_0_30: 0, aging_31_60: 0, aging_61_90: 0, aging_90_plus: 0 },
    );
    return { totals, byProduct: rows ?? [] };
  });

// ============ Customer + supplier analytics ============
export const customerAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("v_bi_customer_stats")
      .select("*")
      .eq("tenant_id", data.tenant_id);
    const list = (rows ?? []) as Array<{
      customer_id: string; name: string; purchase_count: number;
      total_spent: number; avg_order_value: number; last_purchase_at: string | null; due_balance: number;
    }>;
    const top = [...list].sort((a, b) => Number(b.total_spent) - Number(a.total_spent)).slice(0, 20);
    const repeats = list.filter((c) => Number(c.purchase_count) >= 2).length;
    const repeatRate = list.length ? (repeats / list.length) * 100 : 0;
    const ltv = list.length ? list.reduce((s, c) => s + Number(c.total_spent), 0) / list.length : 0;
    return { topCustomers: top, repeatRate, ltv, totalCustomers: list.length };
  });

export const supplierAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("v_bi_supplier_stats")
      .select("*")
      .eq("tenant_id", data.tenant_id);
    const list = (rows ?? []) as Array<{
      supplier_id: string; name: string; purchase_count: number;
      total_purchased: number; due_exposure: number; last_purchase_at: string | null;
    }>;
    const top = [...list].sort((a, b) => Number(b.total_purchased) - Number(a.total_purchased)).slice(0, 20);
    const totalPurchased = list.reduce((s, x) => s + Number(x.total_purchased), 0);
    const concentration = top.slice(0, 5).reduce((s, x) => s + Number(x.total_purchased), 0);
    const concentrationPct = totalPurchased ? (concentration / totalPurchased) * 100 : 0;
    return { topSuppliers: top, totalPurchased, top5ConcentrationPct: concentrationPct };
  });

// ============ Clinical analytics ============
export const clinicalAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rx } = await context.supabase
      .from("prescriptions")
      .select("id, doctor_id, created_at")
      .eq("tenant_id", data.tenant_id)
      .gte("created_at", new Date(Date.now() - 90 * 86400_000).toISOString())
      .limit(2000);
    const list = (rx ?? []) as unknown as Array<{ doctor_id: string | null }>;
    const doctorCounts = new Map<string, number>();
    for (const r of list) {
      if (r.doctor_id) doctorCounts.set(r.doctor_id, (doctorCounts.get(r.doctor_id) ?? 0) + 1);
    }
    const topDoctors = Array.from(doctorCounts.entries()).map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    const topDiagnoses: Array<{ name: string; count: number }> = [];
    return { topDoctors, topDiagnoses, totalPrescriptions: list.length };
  });

// ============ Alerts ============
const AckSchema = z.object({ id: z.string().uuid() });

export const listExecutiveAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("executive_alerts")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const acknowledgeAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((d: unknown) => AckSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("executive_alerts")
      .update({ acknowledged: true, acknowledged_by: context.userId, acknowledged_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Detection: scan recent data and insert alerts for executive thresholds.
export const detectExecutiveAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

    const { data: rows } = await supabase
      .from("v_bi_sales_daily")
      .select("day, revenue, gross_profit")
      .eq("tenant_id", data.tenant_id)
      .in("day", [today, yesterday]);

    const tRow = (rows ?? []).find((r) => String(r.day) === today);
    const yRow = (rows ?? []).find((r) => String(r.day) === yesterday);
    type AlertInsert = {
      tenant_id: string; alert_type: string; severity: string;
      title: string; message: string; payload: Record<string, number>;
    };
    const inserts: AlertInsert[] = [];
    const t = Number(tRow?.revenue ?? 0);
    const y = Number(yRow?.revenue ?? 0);
    if (y > 0 && t < y * 0.7) {
      inserts.push({
        tenant_id: data.tenant_id,
        alert_type: "sales_drop",
        severity: "warning",
        title: "Sales dropped vs yesterday",
        message: `Today ৳${t.toFixed(0)} vs yesterday ৳${y.toFixed(0)} (${(((t - y) / y) * 100).toFixed(1)}%)`,
        payload: { today: t, yesterday: y },
      });
    }
    const tm = Number(tRow?.gross_profit ?? 0);
    const ym = Number(yRow?.gross_profit ?? 0);
    if (y > 0 && t > 0 && tm / t < (ym && y ? ym / y : 1) * 0.7) {
      inserts.push({
        tenant_id: data.tenant_id,
        alert_type: "margin_drop",
        severity: "warning",
        title: "Margin dropped vs yesterday",
        message: "Margin slipped today vs yesterday",
        payload: { today_margin: tm, yesterday_margin: ym },
      });
    }

    if (inserts.length > 0) {
      await supabase.from("executive_alerts").insert(inserts);
    }
    return { created: inserts.length };
  });

// ============ Scheduled reports CRUD ============
const ScheduledReportSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  report_type: z.string().min(1),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.string().email()),
  filters: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional().default(true),
});

export const upsertScheduledReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((d: unknown) => ScheduledReportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nextRun = (() => {
      const d = new Date();
      if (data.frequency === "daily") d.setDate(d.getDate() + 1);
      else if (data.frequency === "weekly") d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
      d.setHours(6, 0, 0, 0);
      return d.toISOString();
    })();

    if (data.id) {
      const { error } = await supabase
        .from("scheduled_reports")
        .update({
          report_type: data.report_type,
          frequency: data.frequency,
          recipients: data.recipients,
          filters: (data.filters ?? null) as never,
          is_active: data.is_active ?? true,
          next_run_at: nextRun,
        })
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { ok: true as const, id: data.id };
    }

    const { data: ins, error } = await supabase
      .from("scheduled_reports")
      .insert({
        tenant_id: data.tenant_id,
        user_id: userId,
        report_type: data.report_type,
        frequency: data.frequency,
        recipients: data.recipients,
        filters: (data.filters ?? null) as never,
        is_active: data.is_active ?? true,
        next_run_at: nextRun,
      })
      .select("id")
      .single();
    if (error || !ins) throw new Error(error?.message ?? "create failed");
    return { ok: true as const, id: ins.id };
  });

export const listScheduledReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("reports")])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scheduled_reports")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteScheduledReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scheduled_reports")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
