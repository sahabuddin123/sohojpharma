// Background offline catalog & operational data pre-sync.
// Keeps IndexedDB warm with all products, customers, suppliers, recent invoices/purchases,
// and shop/branch metadata so POS, Sales, Customers, Purchases, Products & Invoices work 100% offline.
import {
  cacheCustomers,
  cacheProducts,
  cachePurchases,
  cacheSales,
  cacheSuppliers,
  countCachedProducts,
  getOfflineMeta,
  listCachedCustomers,
  listCachedProducts,
  listCachedPurchases,
  listCachedSales,
  listCachedSuppliers,
  setOfflineMeta,
} from "./db";
import type { StoreDashboardData } from "@/lib/api/dashboard.functions";
import {
  fetchOfflineCatalogChunk,
  fetchOfflineOperationalSnapshot,
} from "@/lib/api/offline-sync.functions";

const CATALOG_STALE_MS = 20 * 60_000; // 20 min automatic refresh window
const OPS_STALE_MS = 3 * 60_000; // 3 min operational refresh window
const CHUNK_SIZE = 1000;

export type WarmStatus = {
  syncingCatalog: boolean;
  cachedProducts: number;
  totalProducts: number;
  lastSyncedAt: number | null;
};

const warmState: WarmStatus = {
  syncingCatalog: false,
  cachedProducts: 0,
  totalProducts: 0,
  lastSyncedAt: null,
};
const warmListeners = new Set<(s: WarmStatus) => void>();

export function subscribeWarmStatus(fn: (s: WarmStatus) => void) {
  warmListeners.add(fn);
  fn({ ...warmState });
  return () => warmListeners.delete(fn);
}

function emitWarm() {
  warmListeners.forEach((fn) => {
    try { fn({ ...warmState }); } catch { /* ignore */ }
  });
}

const activeRuns = new Map<string, Promise<void>>();

export function isOfflineNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|network|offline|internet|load failed|err_internet_disconnected|timeout|aborted/i.test(
    msg,
  );
}

export async function warmOperationalSnapshot(tenantId: string, force = false): Promise<void> {
  if (!tenantId || typeof navigator === "undefined" || !navigator.onLine) return;

  const metaKey = `opsSync:${tenantId}`;
  const last = (await getOfflineMeta<number>(metaKey)) ?? 0;
  if (!force && Date.now() - last < OPS_STALE_MS) return;

  try {
    const snap = await fetchOfflineOperationalSnapshot({ data: { tenantId } });
    await Promise.all([
      setOfflineMeta(`shopInfo:${tenantId}`, snap.shopInfo),
      setOfflineMeta(`branches:${tenantId}`, snap.branches),
      setOfflineMeta(`warehouses:${tenantId}`, snap.warehouses),
      setOfflineMeta(`openRegister:${tenantId}`, snap.openRegisterId),
      cacheCustomers(
        tenantId,
        (snap.customers as any[]).map((c) => ({
          id: c.id,
          customer_code: c.customer_code ?? null,
          name: c.name,
          phone: c.phone ?? null,
          email: c.email ?? null,
          type: c.type ?? "retail",
          address: c.address ?? null,
          due_balance: Number(c.due_balance ?? 0),
          credit_limit: c.credit_limit != null ? Number(c.credit_limit) : null,
        })),
      ),
      cacheSuppliers(
        tenantId,
        (snap.suppliers as any[]).map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone ?? null,
          due_balance: Number(s.due_balance ?? 0),
        })),
      ),
      cacheSales(
        tenantId,
        (snap.sales as any[]).map((s) => ({
          id: s.id,
          invoice_no: s.invoice_no ?? "",
          sale_date: s.sale_date ?? s.created_at,
          created_at: s.created_at,
          subtotal: Number(s.subtotal ?? 0),
          discount: Number(s.discount ?? 0),
          vat: Number(s.vat ?? 0),
          total: Number(s.total ?? 0),
          paid: Number(s.paid ?? 0),
          due: Number(s.due ?? 0),
          payment_method: s.payment_method ?? "cash",
          status: s.status ?? "completed",
          is_return: Boolean(s.is_return),
          customer_id: s.customer_id ?? null,
          customer_name: s.customers?.name ?? null,
          customer_phone: s.customers?.phone ?? null,
          items: Array.isArray(s.sale_items)
            ? s.sale_items.map((it: any) => ({
                product_id: it.product_id,
                name: it.products?.name ?? "Product",
                qty: Number(it.qty ?? 0),
                unit_price: Number(it.unit_price ?? 0),
                discount: Number(it.discount ?? 0),
                vat: Number(it.vat ?? 0),
                line_total: Number(it.line_total ?? 0),
              }))
            : [],
          pendingSync: false,
        })),
      ),
      cachePurchases(
        tenantId,
        (snap.purchases as any[]).map((po) => ({
          id: po.id,
          po_number: po.po_number ?? "",
          status: po.status ?? "draft",
          order_date: po.order_date ?? po.created_at,
          created_at: po.created_at,
          total: Number(po.total ?? 0),
          supplier_id: po.supplier_id ?? null,
          supplier_name: po.suppliers?.name ?? null,
          items: Array.isArray(po.purchase_order_items)
            ? po.purchase_order_items.map((it: any) => ({
                product_id: it.product_id,
                name: it.products?.name ?? "Product",
                qty: Number(it.qty_ordered ?? 0),
                unit_cost: Number(it.unit_cost ?? 0),
                line_total: Number(it.line_total ?? 0),
              }))
            : [],
          pendingSync: false,
        })),
      ),
    ]);
    await setOfflineMeta(metaKey, Date.now());
  } catch {
    // Non-fatal: background snapshot warmup ignores transient errors
  }
}

export async function warmFullCatalog(tenantId: string, force = false): Promise<void> {
  if (!tenantId || typeof navigator === "undefined" || !navigator.onLine) return;
  const inflight = activeRuns.get(tenantId);
  if (inflight) return inflight;

  const run = (async () => {
    const syncAtKey = `catalogSyncAt:${tenantId}`;
    const cursorKey = `catalogCursor:${tenantId}`;
    const existingCount = await countCachedProducts(tenantId).catch(() => 0);
    const lastSyncAt = (await getOfflineMeta<number>(syncAtKey)) ?? 0;

    warmState.cachedProducts = existingCount;
    warmState.lastSyncedAt = lastSyncAt || null;
    emitWarm();

    if (!force && lastSyncAt > 0 && Date.now() - lastSyncAt < CATALOG_STALE_MS && existingCount > 0) {
      await warmOperationalSnapshot(tenantId, false);
      return;
    }

    warmState.syncingCatalog = true;
    emitWarm();

    try {
      await warmOperationalSnapshot(tenantId, force);

      let offset = force ? 0 : ((await getOfflineMeta<number>(cursorKey)) ?? 0);
      let loaded = offset;

      while (true) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        const res = await fetchOfflineCatalogChunk({
          data: { tenantId, offset, limit: CHUNK_SIZE },
        });
        warmState.totalProducts = res.total;
        if (res.rows.length > 0) {
          await cacheProducts(tenantId, res.rows);
          loaded += res.rows.length;
          warmState.cachedProducts = Math.max(existingCount, loaded);
          emitWarm();
        }
        offset += res.rows.length;
        await setOfflineMeta(cursorKey, offset);

        if (res.rows.length < CHUNK_SIZE || offset >= res.total) {
          await setOfflineMeta(cursorKey, 0);
          const doneAt = Date.now();
          await setOfflineMeta(syncAtKey, doneAt);
          warmState.lastSyncedAt = doneAt;
          warmState.cachedProducts = await countCachedProducts(tenantId).catch(() => res.total);
          break;
        }
        // Yield briefly so UI typing/scrolling remains 60fps during background download
        await new Promise((r) => setTimeout(r, 25));
      }
    } catch {
      // Partial progress saved via catalogCursor — next online cycle resumes seamlessly
    } finally {
      warmState.syncingCatalog = false;
      emitWarm();
      activeRuns.delete(tenantId);
    }
  })();

  activeRuns.set(tenantId, run);
  return run;
}

/** Compute an offline dashboard KPI snapshot from local IndexedDB caches across [fromDate, toDate]. */
export async function buildOfflineStoreDashboard(
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<StoreDashboardData> {
  const [prodRes, rangeSales, allSales, rangePurchases, customers, suppliers, shopInfo] =
    await Promise.all([
      listCachedProducts(tenantId, { page: 1, pageSize: 1 }),
      listCachedSales(tenantId, { from: fromDate, to: toDate }),
      listCachedSales(tenantId),
      listCachedPurchases(tenantId, { from: fromDate, to: toDate }),
      listCachedCustomers(tenantId),
      listCachedSuppliers(tenantId),
      getOfflineMeta<{ name?: string | null }>(`shopInfo:${tenantId}`),
    ]);

  let todaySales = 0;
  let todayCashSale = 0;
  let todayDueSale = 0;
  let todayReturn = 0;

  for (const s of rangeSales) {
    if (s.status === "cancelled") continue;
    const total = Number(s.total ?? 0);
    const paid = Number(s.paid ?? 0);
    const due = Number(s.due ?? Math.max(0, total - paid));
    if (s.is_return) {
      todayReturn += Math.abs(total);
      continue;
    }
    todaySales += total;
    todayCashSale += paid;
    todayDueSale += due;
  }

  const todayPurchase = rangePurchases.reduce((sum, p) => sum + Number(p.total ?? 0), 0);
  const customerDueTotal = customers.reduce((sum, c) => sum + Number(c.due_balance ?? 0), 0);
  const supplierDueTotal = suppliers.reduce((sum, s) => sum + Number(s.due_balance ?? 0), 0);

  const summarizeDay = (ymd: string) => {
    const daySales = allSales.filter(
      (s) => !s.is_return && s.status !== "cancelled" && (s.sale_date || s.created_at || "").slice(0, 10) === ymd,
    );
    const customerSet = new Set(daySales.map((s) => s.customer_id).filter(Boolean));
    return {
      amount: daySales.reduce((acc, s) => acc + Number(s.total ?? 0), 0),
      invoices: daySales.length,
      customers: customerSet.size,
    };
  };

  const now = new Date();
  const ymdOffset = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const todayYmd = ymdOffset(0);
  const yesterdayYmd = ymdOffset(1);
  const last7From = ymdOffset(6);
  const monthFrom = `${todayYmd.slice(0, 7)}-01`;

  const summarizeRange = (startYmd: string, endYmd: string) => {
    const matched = allSales.filter((s) => {
      if (s.is_return || s.status === "cancelled") return false;
      const ymd = (s.sale_date || s.created_at || "").slice(0, 10);
      return (!startYmd || ymd >= startYmd) && (!endYmd || ymd <= endYmd);
    });
    const custs = new Set(matched.map((s) => s.customer_id).filter(Boolean));
    return {
      amount: matched.reduce((acc, s) => acc + Number(s.total ?? 0), 0),
      invoices: matched.length,
      customers: custs.size,
    };
  };

  const lowStockRows = (
    await listCachedProducts(tenantId, { filter: "low", page: 1, pageSize: 10 })
  ).rows;

  return {
    kpi: {
      todaySales: Math.round(todaySales),
      todayPurchase: Math.round(todayPurchase),
      todayProfit: 0,
      todayExpense: 0,
      todayCashSale: Math.round(todayCashSale),
      todayDueSale: Math.round(todayDueSale),
      todayReturn: Math.round(todayReturn),
      dailyCashInHand: Math.round(todayCashSale),
      cashInHand: Math.round(todayCashSale),
      bankBalance: 0,
      dueCollection: 0,
      totalCustomers: customers.length,
      totalSuppliers: suppliers.length,
      totalProducts: prodRes.stats.totalProducts,
      lowStock: prodRes.stats.lowStock,
      expired: 0,
      nearExpiry: 0,
      cancelledCount: 0,
      cancelledAmount: 0,
      customerDueTotal: Math.round(customerDueTotal),
      supplierDueTotal: Math.round(supplierDueTotal),
      inventoryValue: Math.round(prodRes.stats.stockValue),
      recalledCount: 0,
      pendingPOs: 0,
      pendingGRNs: 0,
      pendingTransfers: 0,
    },
    sales: {
      today: summarizeDay(todayYmd),
      yesterday: summarizeDay(yesterdayYmd),
      last7: summarizeRange(last7From, todayYmd),
      mtd: summarizeRange(monthFrom, todayYmd),
    },
    dailySales: [],
    monthly: [],
    lowStockTop: lowStockRows.map((p) => ({
      name: p.name,
      sku: p.sku ?? "",
      stock: p.stock,
      reorder: p.reorder_level ?? 20,
    })),
    expiringTop: [],
    recentSales: allSales.slice(0, 10).map((s) => ({
      id: s.id,
      invoice: s.invoice_no,
      customer: s.customer_name || "Walk-in",
      total: Number(s.total ?? 0),
      paid: Number(s.paid ?? 0),
      at: s.created_at,
    })),
    recentPurchases: rangePurchases.slice(0, 10).map((p) => ({
      id: p.id,
      invoice: p.po_number,
      supplier: p.supplier_name || "সাপ্লায়ার",
      total: Number(p.total ?? 0),
      at: p.created_at,
    })),
    topMedicines: [],
    topCompanies: [],
    categoryInventory: [],
    customerDueTop: customers
      .filter((c) => Number(c.due_balance ?? 0) > 0)
      .slice(0, 8)
      .map((c) => ({ id: c.id, name: c.name, due: Number(c.due_balance ?? 0) })),
    supplierDueTop: suppliers
      .filter((s) => Number(s.due_balance ?? 0) > 0)
      .slice(0, 8)
      .map((s) => ({ id: s.id, name: s.name, due: Number(s.due_balance ?? 0) })),
    notifications: { unread: 0, items: [] },
    tenantName: shopInfo?.name ?? null,
  };
}
