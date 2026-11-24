import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ tenant_id: z.string().uuid(), warehouse_id: z.string().uuid().nullable().optional() });

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
    todaySales: number; todayPurchase: number; todayProfit: number;
    cashInHand: number; dueCollection: number;
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
    cashInHand: 0, dueCollection: 0,
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
    return result;
  });
