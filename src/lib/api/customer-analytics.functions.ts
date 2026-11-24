import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const TenantInput = z.object({ tenantId: z.string().uuid() });

type SaleRow = {
  id: string;
  customer_id: string | null;
  sale_date: string;
  total: number | null;
  due: number | null;
  paid: number | null;
};
type CustRow = {
  id: string;
  name: string;
  phone: string | null;
  type: string | null;
  due_balance: number | null;
  credit_limit: number | null;
  is_active: boolean | null;
  created_at: string;
  date_of_birth: string | null;
  anniversary: string | null;
};

const monthKey = (d: string) => d.slice(0, 7);
const daysAgo = (n: number) => {
  const t = new Date();
  t.setDate(t.getDate() - n);
  return t.toISOString();
};

/* ─────────────────────────────── ANALYTICS ─────────────────────────────── */
export const customerAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((i: z.input<typeof TenantInput>) => TenantInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const since = daysAgo(365);

    const [{ data: customers }, { data: sales }] = await Promise.all([
      supabase
        .from("v_customer_due")
        .select("id,name,phone,type,due_balance,credit_limit,is_active,created_at,date_of_birth,anniversary")
        .eq("tenant_id", data.tenantId),
      supabase
        .from("sales")
        .select("id,customer_id,sale_date,total,due,paid")
        .eq("tenant_id", data.tenantId)
        .eq("is_return", false)
        .gte("sale_date", since)
        .limit(50000),
    ]);

    const custs = (customers ?? []) as CustRow[];
    const sx = (sales ?? []) as SaleRow[];
    const byCust = new Map<string, { total: number; count: number; last: string }>();
    for (const s of sx) {
      if (!s.customer_id) continue;
      const cur = byCust.get(s.customer_id) ?? { total: 0, count: 0, last: "" };
      cur.total += Number(s.total ?? 0);
      cur.count += 1;
      if (s.sale_date > cur.last) cur.last = s.sale_date;
      byCust.set(s.customer_id, cur);
    }

    const enriched = custs.map((c) => {
      const m = byCust.get(c.id) ?? { total: 0, count: 0, last: "" };
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        type: c.type ?? "retail",
        due_balance: Number(c.due_balance ?? 0),
        credit_limit: Number(c.credit_limit ?? 0),
        is_active: c.is_active ?? true,
        created_at: c.created_at,
        total_sales: m.total,
        order_count: m.count,
        last_purchase: m.last || null,
        avg_basket: m.count > 0 ? m.total / m.count : 0,
      };
    });

    const now = Date.now();
    const D = (d: string | null) => (d ? (now - new Date(d).getTime()) / 86400000 : Infinity);

    const top = [...enriched].sort((a, b) => b.total_sales - a.total_sales).slice(0, 20);
    const repeat = enriched.filter((c) => c.order_count >= 3).length;
    const inactive = enriched.filter((c) => D(c.last_purchase) > 90).length;
    const newThisMonth = enriched.filter((c) => D(c.created_at) <= 30).length;
    const totalOrders = sx.length;
    const totalRevenue = sx.reduce((a, s) => a + Number(s.total ?? 0), 0);
    const avgBasket = totalOrders ? totalRevenue / totalOrders : 0;
    const activeBuyers = enriched.filter((c) => c.order_count > 0).length;
    const avgFreq = activeBuyers ? totalOrders / activeBuyers : 0;
    const ltv = activeBuyers ? totalRevenue / activeBuyers : 0;

    // monthly buckets
    const months = new Map<string, number>();
    for (const s of sx) {
      const k = monthKey(s.sale_date);
      months.set(k, (months.get(k) ?? 0) + Number(s.total ?? 0));
    }
    const monthlySales = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }));

    // growth: customers created per month
    const growthMap = new Map<string, number>();
    for (const c of custs) {
      const k = monthKey(c.created_at);
      growthMap.set(k, (growthMap.get(k) ?? 0) + 1);
    }
    const growth = [...growthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // segments
    const segment = (c: typeof enriched[number]): string => {
      if (c.due_balance > c.credit_limit && c.credit_limit > 0) return "High Risk";
      if (c.type === "wholesale") return "Wholesale";
      if (c.type === "dealer") return "Dealer";
      if (D(c.last_purchase) > 90) return "Inactive";
      if (c.total_sales >= 50000 || c.order_count >= 20) return "VIP";
      return "Regular";
    };
    const segs = new Map<string, number>();
    enriched.forEach((c) => segs.set(segment(c), (segs.get(segment(c)) ?? 0) + 1));

    return {
      kpis: {
        total: enriched.length,
        repeat,
        inactive,
        newThisMonth,
        avgBasket,
        avgFreq,
        ltv,
        activeBuyers,
        totalRevenue,
      },
      top,
      monthlySales,
      growth,
      segments: [...segs.entries()].map(([name, count]) => ({ name, count })),
      customers: enriched,
    };
  });

/* ─────────────────────────────── DASHBOARD ─────────────────────────────── */
export const customerDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((i: z.input<typeof TenantInput>) => TenantInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [{ data: customers }, { data: monthSales }, { data: monthPayments }] = await Promise.all([
      supabase
        .from("v_customer_due")
        .select("id,name,type,due_balance,is_active,created_at")
        .eq("tenant_id", data.tenantId),
      supabase
        .from("sales")
        .select("customer_id,total,sale_date")
        .eq("tenant_id", data.tenantId)
        .eq("is_return", false)
        .gte("sale_date", monthStart.toISOString())
        .limit(50000),
      supabase
        .from("customer_payments")
        .select("amount,payment_date")
        .eq("tenant_id", data.tenantId)
        .gte("payment_date", monthStart.toISOString().slice(0, 10))
        .limit(50000),
    ]);

    const cs = (customers ?? []) as Array<{
      id: string; name: string; type: string | null; due_balance: number | null;
      is_active: boolean | null; created_at: string;
    }>;
    const ms = (monthSales ?? []) as Array<{ customer_id: string | null; total: number | null; sale_date: string }>;
    const mp = (monthPayments ?? []) as Array<{ amount: number | null; payment_date: string }>;

    const now = Date.now();
    const isNew = (d: string) => now - new Date(d).getTime() <= 30 * 86400000;

    const salesByCustomer = new Map<string, number>();
    for (const s of ms) {
      if (!s.customer_id) continue;
      salesByCustomer.set(s.customer_id, (salesByCustomer.get(s.customer_id) ?? 0) + Number(s.total ?? 0));
    }
    const top = cs
      .map((c) => ({ id: c.id, name: c.name, total: salesByCustomer.get(c.id) ?? 0 }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const typeDist = new Map<string, number>();
    cs.forEach((c) => {
      const k = c.type ?? "retail";
      typeDist.set(k, (typeDist.get(k) ?? 0) + 1);
    });

    // last 6 month growth
    const growthMap = new Map<string, number>();
    for (const c of cs) {
      const k = c.created_at.slice(0, 7);
      growthMap.set(k, (growthMap.get(k) ?? 0) + 1);
    }
    const growth = [...growthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);

    return {
      kpis: {
        total: cs.length,
        newThisMonth: cs.filter((c) => isNew(c.created_at)).length,
        active: cs.filter((c) => c.is_active !== false).length,
        inactive: cs.filter((c) => c.is_active === false).length,
        totalDue: cs.reduce((a, c) => a + Number(c.due_balance ?? 0), 0),
        monthRevenue: ms.reduce((a, s) => a + Number(s.total ?? 0), 0),
        monthCollections: mp.reduce((a, p) => a + Number(p.amount ?? 0), 0),
      },
      top,
      typeDist: [...typeDist.entries()].map(([name, count]) => ({ name, count })),
      growth: growth.map(([month, count]) => ({ month, count })),
    };
  });

/* ─────────────────────────────── LOYALTY ─────────────────────────────── */
const PointsInput = z.object({
  tenantId: z.string().uuid(),
  customerId: z.string().uuid(),
  earned: z.number().min(0).default(0),
  used: z.number().min(0).default(0),
  saleId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
  expiryDate: z.string().optional(),
});

export const customerPointsList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((i: { tenantId: string; customerId: string }) =>
    z.object({ tenantId: z.string().uuid(), customerId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("customer_points")
      .select("id,points_earned,points_used,balance,expiry_date,note,sale_id,created_at")
      .eq("tenant_id", data.tenantId)
      .eq("customer_id", data.customerId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const all = rows ?? [];
    const totalEarned = all.reduce((a, r) => a + Number(r.points_earned ?? 0), 0);
    const totalUsed = all.reduce((a, r) => a + Number(r.points_used ?? 0), 0);
    return { rows: all, balance: totalEarned - totalUsed, totalEarned, totalUsed };
  });

export const recordCustomerPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((i: z.input<typeof PointsInput>) => PointsInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.earned === 0 && data.used === 0) throw new Error("Earned or used must be > 0");

    // recompute running balance
    const { data: agg } = await supabase
      .from("customer_points")
      .select("points_earned,points_used")
      .eq("tenant_id", data.tenantId)
      .eq("customer_id", data.customerId);
    const prev = (agg ?? []).reduce(
      (a, r) => a + Number(r.points_earned ?? 0) - Number(r.points_used ?? 0),
      0,
    );
    const newBalance = prev + data.earned - data.used;
    if (newBalance < 0) throw new Error("Insufficient loyalty balance");

    const { data: inserted, error } = await supabase
      .from("customer_points")
      .insert({
        tenant_id: data.tenantId,
        customer_id: data.customerId,
        sale_id: data.saleId ?? null,
        points_earned: data.earned,
        points_used: data.used,
        balance: newBalance,
        expiry_date: data.expiryDate ?? null,
        note: data.note ?? null,
      })
      .select("id,balance")
      .single();
    if (error) throw error;

    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenantId,
      _action: data.earned > 0 ? "customer.points.earned" : "customer.points.redeemed",
      _entity_table: "customer_points",
      _entity_id: inserted.id,
      _after: inserted as never,
    });
    return inserted;
  });

/* ─────────────────────────────── CREDIT CONTROL ─────────────────────────────── */
const CreditInput = z.object({
  tenantId: z.string().uuid(),
  customerId: z.string().uuid(),
  newSaleDue: z.number().min(0).default(0),
});
export const checkCustomerCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((i: z.input<typeof CreditInput>) => CreditInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: cust }, { data: ts }] = await Promise.all([
      supabase
        .from("v_customer_due")
        .select("id,name,credit_limit,due_balance")
        .eq("tenant_id", data.tenantId)
        .eq("customer_id", data.customerId)
        .single(),
      supabase
        .from("tenant_settings")
        .select("customer,business_rules")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
    ]);
    if (!cust) throw new Error("Customer not found");

    const cset = (ts?.customer as Record<string, unknown> | null) ?? {};
    const brules = (ts?.business_rules as Record<string, unknown> | null) ?? {};
    const enforce =
      (cset.credit_control_enabled as boolean | undefined) ??
      (brules.enforce_credit_limit as boolean | undefined) ?? true;
    const warnPct = Number((cset.credit_warn_pct as number | undefined) ?? (brules.credit_warn_pct as number | undefined) ?? 80);

    const newDue = Number(cust.due_balance ?? 0) + Number(data.newSaleDue ?? 0);
    const limit = Number(cust.credit_limit ?? 0);
    const pct = limit > 0 ? (newDue / limit) * 100 : 0;
    const blocked = enforce && limit > 0 && newDue > limit;
    const warning = enforce && limit > 0 && pct >= warnPct && !blocked;

    if (blocked || warning) {
      await supabase.rpc("audit_log_event", {
        _tenant_id: data.tenantId,
        _action: blocked ? "customer.credit.blocked" : "customer.credit.warning",
        _entity_table: "customers",
        _entity_id: data.customerId,
        _after: { newDue, limit, pct } as never,
      });
    }
    return {
      customer: cust,
      newDue,
      limit,
      pct,
      blocked,
      warning,
      enforced: enforce,
    };
  });

/* ─────────────────────────────── REMINDER ENGINE ─────────────────────────────── */
type DueBucket = "due_7" | "due_15" | "due_30" | "due_60";
const dueAge = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const bucketFor = (age: number): DueBucket | null => {
  if (age >= 60) return "due_60";
  if (age >= 30) return "due_30";
  if (age >= 15) return "due_15";
  if (age >= 7) return "due_7";
  return null;
};

export const dueRemindersPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((i: z.input<typeof TenantInput>) => TenantInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sales } = await supabase
      .from("sales")
      .select("id,customer_id,due,sale_date")
      .eq("tenant_id", data.tenantId)
      .eq("is_return", false)
      .gt("due", 0)
      .limit(5000);
    const { data: custs } = await supabase
      .from("customers")
      .select("id,name,phone,due_balance")
      .eq("tenant_id", data.tenantId);

    const cMap = new Map((custs ?? []).map((c) => [c.id, c]));
    const items: Array<{
      customer_id: string;
      customer_name: string;
      phone: string | null;
      bucket: DueBucket;
      age_days: number;
      due_amount: number;
      sale_id: string;
    }> = [];
    for (const s of sales ?? []) {
      if (!s.customer_id) continue;
      const age = dueAge(s.sale_date);
      const b = bucketFor(age);
      if (!b) continue;
      const c = cMap.get(s.customer_id);
      if (!c) continue;
      items.push({
        customer_id: c.id,
        customer_name: c.name,
        phone: c.phone,
        bucket: b,
        age_days: age,
        due_amount: Number(s.due ?? 0),
        sale_id: s.id,
      });
    }
    items.sort((a, b) => b.age_days - a.age_days);
    return items.slice(0, 500);
  });

const SendInput = z.object({
  tenantId: z.string().uuid(),
  items: z.array(
    z.object({
      customerId: z.string().uuid(),
      bucket: z.enum(["due_7", "due_15", "due_30", "due_60"]),
      dueAmount: z.number(),
      ageDays: z.number(),
    }),
  ).min(1).max(500),
});

export const sendDueReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((i: z.input<typeof SendInput>) => SendInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.items.map((it) => ({
      tenant_id: data.tenantId,
      customer_id: it.customerId,
      reminder_type: it.bucket,
      channel: "in_app",
      status: "sent",
      due_days: it.ageDays,
      amount: it.dueAmount,
      message: `Reminder: outstanding due of ${it.dueAmount.toFixed(2)} is ${it.ageDays} days old.`,
    }));
    const { error } = await supabase.from("customer_reminders").insert(rows);
    if (error) throw error;

    // also mirror to in-app notifications table
    const notes = data.items.map((it) => ({
      tenant_id: data.tenantId,
      user_id: userId,
      type: "customer_due_reminder",
      title: `Due reminder: ${it.ageDays}d overdue`,
      body: `Outstanding due ${it.dueAmount.toFixed(2)} on customer ${it.customerId.slice(0, 8)}`,
      severity: it.ageDays >= 60 ? "high" : it.ageDays >= 30 ? "medium" : "low",
    }));
    await supabase.from("notifications").insert(notes);

    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenantId,
      _action: "customer.reminder.sent",
      _entity_table: "customer_reminders",
      _after: { count: rows.length } as never,
    });

    return { count: rows.length };
  });

export const reminderHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("reports")])
  .inputValidator((i: z.input<typeof TenantInput>) => TenantInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("customer_reminders")
      .select("id,customer_id,reminder_type,channel,status,due_days,amount,message,sent_at")
      .eq("tenant_id", data.tenantId)
      .order("sent_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });
