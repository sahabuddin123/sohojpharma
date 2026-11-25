import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  tenant_id: z.string().uuid(),
  warehouse_id: z.string().uuid().nullable().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

type DayBucket = { day: string; sales: number; profit: number };
type MonthBucket = { m: string; sales: number; purchase: number; profit: number };
type LowStockRow = { name: string; sku: string; stock: number; reorder: number };
type ExpiringRow = { name: string; batch: string; days: number };
type RecentSaleRow = { id: string; invoice: string; customer: string; total: number; paid: number; at: string };
type RecentPurchaseRow = { id: string; invoice: string; supplier: string; total: number; at: string };
type TopMedicineRow = { name: string; qty: number; revenue: number };
type TopCompanyRow = { name: string; revenue: number };
type DueRow = { id: string; name: string; due: number };
type PeriodStat = { amount: number; invoices: number; customers: number };
type CategoryRow = { name: string; value: number };
type NotificationRow = {
  id: string; type: string; title: string; body: string | null;
  link: string | null; created_at: string; read: boolean;
};

export interface StoreDashboardData {
  kpi: {
    todaySales: number; todayPurchase: number; todayProfit: number; todayExpense?: number;
    todayCashSale?: number; todayDueSale?: number; todayReturn?: number; dailyCashInHand?: number;
    cashInHand: number; bankBalance: number; dueCollection: number;
    totalCustomers: number; totalSuppliers: number; totalProducts: number;
    lowStock: number; expired: number; nearExpiry: number;
    cancelledCount: number; cancelledAmount: number;
    customerDueTotal: number; supplierDueTotal: number;
    inventoryValue: number; recalledCount: number;
    pendingPOs: number; pendingGRNs: number; pendingTransfers: number;
  };
  sales: { today: PeriodStat; yesterday: PeriodStat; last7: PeriodStat; mtd: PeriodStat };
  dailySales: DayBucket[];
  monthly: MonthBucket[];
  lowStockTop: LowStockRow[];
  expiringTop: ExpiringRow[];
  recentSales: RecentSaleRow[];
  recentPurchases: RecentPurchaseRow[];
  topMedicines: TopMedicineRow[];
  topCompanies: TopCompanyRow[];
  categoryInventory: CategoryRow[];
  customerDueTop: DueRow[];
  supplierDueTop: DueRow[];
  notifications: { unread: number; items: NotificationRow[] };
  tenantName: string | null;
}

const EMPTY: StoreDashboardData = {
  kpi: {
    todaySales: 0, todayPurchase: 0, todayProfit: 0,
    cashInHand: 0, bankBalance: 0, dueCollection: 0,
    totalCustomers: 0, totalSuppliers: 0, totalProducts: 0,
    lowStock: 0, expired: 0, nearExpiry: 0,
    cancelledCount: 0, cancelledAmount: 0,
    customerDueTotal: 0, supplierDueTotal: 0,
    inventoryValue: 0, recalledCount: 0,
    pendingPOs: 0, pendingGRNs: 0, pendingTransfers: 0,
  },
  sales: {
    today: { amount: 0, invoices: 0, customers: 0 },
    yesterday: { amount: 0, invoices: 0, customers: 0 },
    last7: { amount: 0, invoices: 0, customers: 0 },
    mtd: { amount: 0, invoices: 0, customers: 0 },
  },
  dailySales: [], monthly: [],
  lowStockTop: [], expiringTop: [],
  recentSales: [], recentPurchases: [],
  topMedicines: [], topCompanies: [],
  categoryInventory: [], customerDueTop: [], supplierDueTop: [],
  notifications: { unread: 0, items: [] },
  tenantName: null,
};

const num = (v: unknown): number => Number(v ?? 0) || 0;

function coerce(raw: unknown): StoreDashboardData {
  if (!raw || typeof raw !== "object") return EMPTY;
  const r = raw as Record<string, unknown>;
  const kpiRaw = (r.kpi ?? {}) as Record<string, unknown>;
  const salesRaw = (r.sales ?? {}) as Record<string, unknown>;
  const period = (p: unknown): PeriodStat => {
    const o = (p ?? {}) as Record<string, unknown>;
    return { amount: num(o.amount), invoices: num(o.invoices), customers: num(o.customers) };
  };
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const notifRaw = (r.notifications ?? {}) as Record<string, unknown>;
  return {
    kpi: {
      todaySales: num(kpiRaw.todaySales),
      todayPurchase: num(kpiRaw.todayPurchase),
      todayProfit: num(kpiRaw.todayProfit),
      cashInHand: num(kpiRaw.cashInHand),
      bankBalance: num(kpiRaw.bankBalance),
      dueCollection: num(kpiRaw.dueCollection),
      totalCustomers: num(kpiRaw.totalCustomers),
      totalSuppliers: num(kpiRaw.totalSuppliers),
      totalProducts: num(kpiRaw.totalProducts),
      lowStock: num(kpiRaw.lowStock),
      expired: num(kpiRaw.expired),
      nearExpiry: num(kpiRaw.nearExpiry),
      cancelledCount: num(kpiRaw.cancelledCount),
      cancelledAmount: num(kpiRaw.cancelledAmount),
      customerDueTotal: num(kpiRaw.customerDueTotal),
      supplierDueTotal: num(kpiRaw.supplierDueTotal),
      inventoryValue: num(kpiRaw.inventoryValue),
      recalledCount: num(kpiRaw.recalledCount),
      pendingPOs: num(kpiRaw.pendingPOs),
      pendingGRNs: num(kpiRaw.pendingGRNs),
      pendingTransfers: num(kpiRaw.pendingTransfers),
    },
    sales: {
      today: period(salesRaw.today),
      yesterday: period(salesRaw.yesterday),
      last7: period(salesRaw.last7),
      mtd: period(salesRaw.mtd),
    },
    dailySales: arr<DayBucket>(r.dailySales),
    monthly: arr<MonthBucket>(r.monthly),
    lowStockTop: arr<LowStockRow>(r.lowStockTop),
    expiringTop: arr<ExpiringRow>(r.expiringTop),
    recentSales: arr<RecentSaleRow>(r.recentSales),
    recentPurchases: arr<RecentPurchaseRow>(r.recentPurchases),
    topMedicines: arr<TopMedicineRow>(r.topMedicines),
    topCompanies: arr<TopCompanyRow>(r.topCompanies),
    categoryInventory: arr<CategoryRow>(r.categoryInventory),
    customerDueTop: arr<DueRow>(r.customerDueTop),
    supplierDueTop: arr<DueRow>(r.supplierDueTop),
    notifications: {
      unread: num(notifRaw.unread),
      items: arr<NotificationRow>(notifRaw.items),
    },
    tenantName: typeof r.tenantName === "string" ? r.tenantName : null,
  };
}

export const getStoreDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }): Promise<StoreDashboardData> => {
    const { data: raw, error } = await context.supabase.rpc(
      "get_store_dashboard_v2" as never,
      { _tenant_id: data.tenant_id } as never,
    );
    if (error) throw new Error(error.message);
    const result = coerce(raw);

    if (data.warehouse_id) {
      // Server-side access check — never trust UI
      const { data: canAccess } = await context.supabase.rpc(
        "can_access_warehouse" as never,
        { _user_id: context.userId, _tenant_id: data.tenant_id, _warehouse_id: data.warehouse_id } as never,
      );
      if (canAccess === false) throw new Error("forbidden: warehouse access denied");

      const { data: wk, error: wkErr } = await context.supabase.rpc(
        "warehouse_kpis" as never,
        { _tenant_id: data.tenant_id, _warehouse_id: data.warehouse_id } as never,
      );
      if (wkErr) throw new Error(wkErr.message);
      const row = Array.isArray(wk) ? (wk[0] as Record<string, unknown> | undefined) : (wk as Record<string, unknown> | null);
      if (row) {
        result.kpi.todaySales = num(row.sales_today);
        result.kpi.inventoryValue = num(row.stock_value);
        result.kpi.totalProducts = num(row.total_products);
        result.kpi.lowStock = num(row.low_stock_count);
        result.kpi.nearExpiry = num(row.expiring_count);
        result.sales.today.amount = num(row.sales_today);
        result.sales.mtd.amount = num(row.sales_this_month);
      }
    }

    // Sync live Cash in Hand (1000) & Bank/Mobile Balances (1010..1099) from journal_lines
    const { data: cashAccs } = await context.supabase
      .from("chart_of_accounts")
      .select("id, code")
      .eq("tenant_id", data.tenant_id)
      .eq("type", "asset")
      .eq("is_active", true);
    const cashLike = (cashAccs ?? []).filter((a) => /^10\d{2}$/.test(a.code));
    if (cashLike.length > 0) {
      const { data: jLines } = await context.supabase
        .from("journal_lines")
        .select("account_id, debit, credit")
        .eq("tenant_id", data.tenant_id)
        .in("account_id", cashLike.map((a) => a.id));
      const balByAcc = new Map<string, number>();
      for (const l of jLines ?? []) {
        balByAcc.set(l.account_id, (balByAcc.get(l.account_id) ?? 0) + Number(l.debit ?? 0) - Number(l.credit ?? 0));
      }
      let cashBal = 0;
      let bankBal = 0;
      for (const a of cashLike) {
        const b = balByAcc.get(a.id) ?? 0;
        if (a.code === "1000") cashBal += b;
        else bankBal += b;
      }
      result.kpi.cashInHand = Number(cashBal.toFixed(2));
      result.kpi.bankBalance = Number(bankBal.toFixed(2));
    }

    // Use Bangladesh Standard Time (UTC+6) so 12:00 AM – 6:00 AM BD sales fall on the right local day
    const bdTodayStr = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fromDate = data.from_date ?? bdTodayStr;
    const toDate = data.to_date ?? fromDate;

    const [{ data: expRows }, { data: todaySaleItems }, { data: todaySalesRows }, { data: duePayRows }, { data: returnRows }] = await Promise.all([
      context.supabase
        .from("expenses")
        .select("amount")
        .eq("tenant_id", data.tenant_id)
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate),
      context.supabase
        .from("sale_items")
        .select("qty, returned_qty, unit_cost, line_total, product:products(purchase_price), sale:sales!inner(status)")
        .eq("tenant_id", data.tenant_id)
        .gte("created_at", `${fromDate}T00:00:00+06:00`)
        .lte("created_at", `${toDate}T23:59:59.999+06:00`)
        .neq("sale.status", "void"),
      context.supabase
        .from("sales")
        .select("total, paid, due")
        .eq("tenant_id", data.tenant_id)
        .gte("created_at", `${fromDate}T00:00:00+06:00`)
        .lte("created_at", `${toDate}T23:59:59.999+06:00`)
        .neq("status", "void"),
      context.supabase
        .from("customer_payments")
        .select("amount")
        .eq("tenant_id", data.tenant_id)
        .gte("payment_date", fromDate)
        .lte("payment_date", toDate),
      context.supabase
        .from("sales_returns")
        .select("refunded_amount, total")
        .eq("tenant_id", data.tenant_id)
        .gte("created_at", `${fromDate}T00:00:00+06:00`)
        .lte("created_at", `${toDate}T23:59:59.999+06:00`),
    ]);

    let rangeTotalSales = 0;
    let todayCashSale = 0;
    let todayDueSale = 0;
    for (const s of todaySalesRows ?? []) {
      rangeTotalSales += Number(s.total ?? 0);
      todayCashSale += Number(s.paid ?? 0);
      todayDueSale += Number(s.due ?? 0);
    }
    const dueCollection = Number(
      (duePayRows ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0).toFixed(2),
    );
    const todayReturn = Number(
      (returnRows ?? []).reduce((sum, r) => sum + Number(r.refunded_amount ?? r.total ?? 0), 0).toFixed(2),
    );
    result.kpi.todaySales = Number(rangeTotalSales.toFixed(2));
    result.kpi.todayCashSale = Number(todayCashSale.toFixed(2));
    result.kpi.todayDueSale = Number(todayDueSale.toFixed(2));
    result.kpi.dueCollection = dueCollection;
    result.kpi.todayReturn = todayReturn;

    const todayExpense = Number(
      (expRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0).toFixed(2),
    );
    result.kpi.todayExpense = todayExpense;
    result.kpi.dailyCashInHand = Number((todayCashSale + dueCollection - todayExpense).toFixed(2));

    // Recompute profit accurately for the selected range:
    // Use net billed revenue (sales.total, after bill-level discounts) minus COGS
    // (using netQty = qty - returned_qty), then subtract operating expenses.
    let todayCogs = 0;
    for (const item of (todaySaleItems ?? []) as any[]) {
      const netQty = Math.max(0, Number(item.qty ?? 0) - Number(item.returned_qty ?? 0));
      const unitCost =
        Number(item.unit_cost ?? 0) > 0
          ? Number(item.unit_cost)
          : Number(item.product?.purchase_price ?? 0);
      todayCogs += netQty * unitCost;
    }
    const grossProfitToday = rangeTotalSales - todayCogs;
    result.kpi.todayProfit = Number((grossProfitToday - todayExpense).toFixed(2));

    return result;
  });
