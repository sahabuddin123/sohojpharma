import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MobileProductsInput = z.object({
  tenantId: z.string().uuid(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  mode: z.enum(["sales", "profit", "qty", "stuck"]).default("sales"),
  search: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(100).default(30),
});

export interface MobileProductSalesRow {
  id: string;
  name: string;
  strength: string | null;
  medicine_type: string | null;
  manufacturer_name: string | null;
  generic_name: string | null;
  qty_per_box: number;
  unit: string | null;
  sold_qty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
  stock_qty: number;
  days_left: number | null;
}

export interface MobileProductStuckRow {
  id: string;
  name: string;
  strength: string | null;
  medicine_type: string | null;
  manufacturer_name: string | null;
  generic_name: string | null;
  qty_per_box: number;
  unit: string | null;
  stock_qty: number;
  stuck_value: number;
  earliest_expiry: string | null;
  days_to_expiry: number | null;
}

export const getMobileProductAccounting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MobileProductsInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // 1. Fetch sale_items within date range
    let salesQ = sb
      .from("sale_items")
      .select(
        "product_id, qty, returned_qty, unit_cost, line_total, created_at, product:products(id, name, strength, medicine_type, qty_per_box, purchase_price, retail_price, unit, sale_unit, manufacturers(name), generics(name))",
      )
      .eq("tenant_id", data.tenantId);

    if (data.dateFrom) {
      salesQ = salesQ.gte("created_at", `${data.dateFrom}T00:00:00`);
    }
    if (data.dateTo) {
      salesQ = salesQ.lte("created_at", `${data.dateTo}T23:59:59.999`);
    }

    const { data: saleRows, error: saleErr } = await salesQ.limit(5000);
    if (saleErr) throw new Error(saleErr.message);

    // Aggregate sales per product
    const salesMap = new Map<
      string,
      {
        id: string;
        name: string;
        strength: string | null;
        medicine_type: string | null;
        manufacturer_name: string | null;
        generic_name: string | null;
        qty_per_box: number;
        unit: string | null;
        purchase_price: number;
        sold_qty: number;
        revenue: number;
        cost: number;
      }
    >();

    for (const r of (saleRows ?? []) as any[]) {
      const p = r.product;
      if (!p?.id) continue;
      const netQty = Math.max(0, Number(r.qty ?? 0) - Number(r.returned_qty ?? 0));
      const rev = Number(r.line_total ?? 0);
      const unitCost = Number(r.unit_cost ?? 0) || Number(p.purchase_price ?? 0);
      const rowCost = netQty * unitCost;

      const existing = salesMap.get(p.id);
      if (existing) {
        existing.sold_qty += netQty;
        existing.revenue += rev;
        existing.cost += rowCost;
      } else {
        salesMap.set(p.id, {
          id: p.id,
          name: p.name,
          strength: p.strength ?? null,
          medicine_type: p.medicine_type ?? null,
          manufacturer_name: p.manufacturers?.name ?? null,
          generic_name: p.generics?.name ?? null,
          qty_per_box: Number(p.qty_per_box ?? 1) || 1,
          unit: p.sale_unit || p.unit || "পিস",
          purchase_price: Number(p.purchase_price ?? 0),
          sold_qty: netQty,
          revenue: rev,
          cost: rowCost,
        });
      }
    }

    // 2. Fetch positive batches for current stock & stuck/dead stock calculation
    const { data: batchRows, error: batchErr } = await sb
      .from("batches")
      .select(
        "product_id, qty_on_hand, purchase_price, expiry_date, product:products(id, name, strength, medicine_type, qty_per_box, purchase_price, unit, sale_unit, manufacturers(name), generics(name))",
      )
      .eq("tenant_id", data.tenantId)
      .is("deleted_at", null)
      .gt("qty_on_hand", 0)
      .limit(5000);

    if (batchErr) throw new Error(batchErr.message);

    const stockByProduct = new Map<
      string,
      {
        qty: number;
        value: number;
        earliest_expiry: string | null;
        product: any;
      }
    >();

    for (const b of (batchRows ?? []) as any[]) {
      const pid = b.product_id;
      if (!pid) continue;
      const qty = Number(b.qty_on_hand ?? 0);
      const unitCost = Number(b.purchase_price ?? 0) || Number(b.product?.purchase_price ?? 0);
      const val = qty * unitCost;
      const exp = b.expiry_date ? String(b.expiry_date) : null;

      const prev = stockByProduct.get(pid);
      if (prev) {
        prev.qty += qty;
        prev.value += val;
        if (exp && (!prev.earliest_expiry || exp < prev.earliest_expiry)) {
          prev.earliest_expiry = exp;
        }
      } else {
        stockByProduct.set(pid, {
          qty,
          value: val,
          earliest_expiry: exp,
          product: b.product,
        });
      }
    }

    // Period days for velocity/days-left estimation
    let periodDays = 30;
    if (data.dateFrom && data.dateTo) {
      const diff = Math.round(
        (new Date(data.dateTo).getTime() - new Date(data.dateFrom).getTime()) / 86400_000,
      );
      periodDays = Math.max(1, diff + 1);
    }

    const searchLower = data.search?.toLowerCase() ?? "";
    const matchesSearch = (item: {
      name: string;
      generic_name: string | null;
      manufacturer_name: string | null;
    }) => {
      if (!searchLower) return true;
      return (
        item.name.toLowerCase().includes(searchLower) ||
        (item.generic_name?.toLowerCase().includes(searchLower) ?? false) ||
        (item.manufacturer_name?.toLowerCase().includes(searchLower) ?? false)
      );
    };

    // Build sales rows
    const allSalesRows: MobileProductSalesRow[] = Array.from(salesMap.values()).map((item) => {
      const profit = item.revenue - item.cost;
      const margin_pct = item.revenue > 0 ? Math.round((profit / item.revenue) * 100) : 0;
      const stockInfo = stockByProduct.get(item.id);
      const stock_qty = stockInfo?.qty ?? 0;
      const velocity = item.sold_qty / periodDays;
      const days_left =
        stock_qty <= 0 ? 0 : velocity > 0 ? Math.round(stock_qty / velocity) : null;

      return {
        id: item.id,
        name: item.name,
        strength: item.strength,
        medicine_type: item.medicine_type,
        manufacturer_name: item.manufacturer_name,
        generic_name: item.generic_name,
        qty_per_box: item.qty_per_box,
        unit: item.unit,
        sold_qty: item.sold_qty,
        revenue: Math.round(item.revenue),
        cost: Math.round(item.cost),
        profit: Math.round(profit),
        margin_pct,
        stock_qty,
        days_left,
      };
    });

    // Build stuck rows (products in stock with 0 sales in this period)
    const nowMs = Date.now();
    const allStuckRows: MobileProductStuckRow[] = [];
    for (const [pid, info] of stockByProduct.entries()) {
      if (salesMap.has(pid)) continue; // sold in period -> not stuck
      const p = info.product;
      if (!p) continue;
      const days_to_expiry = info.earliest_expiry
        ? Math.ceil((new Date(info.earliest_expiry).getTime() - nowMs) / 86400_000)
        : null;
      allStuckRows.push({
        id: pid,
        name: p.name,
        strength: p.strength ?? null,
        medicine_type: p.medicine_type ?? null,
        manufacturer_name: p.manufacturers?.name ?? null,
        generic_name: p.generics?.name ?? null,
        qty_per_box: Number(p.qty_per_box ?? 1) || 1,
        unit: p.sale_unit || p.unit || "পিস",
        stock_qty: info.qty,
        stuck_value: Math.round(info.value),
        earliest_expiry: info.earliest_expiry,
        days_to_expiry,
      });
    }

    const totalRevenue = allSalesRows.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = allSalesRows.reduce((s, r) => s + r.profit, 0);
    const totalSoldQty = allSalesRows.reduce((s, r) => s + r.sold_qty, 0);
    const soldBrandCount = allSalesRows.length;

    const totalStuckValue = allStuckRows.reduce((s, r) => s + r.stuck_value, 0);
    const stuckBrandCount = allStuckRows.length;
    const nextExpiry =
      allStuckRows
        .map((r) => r.earliest_expiry)
        .filter((e): e is string => !!e)
        .sort()[0] ?? null;

    if (data.mode === "stuck") {
      const filtered = allStuckRows
        .filter(matchesSearch)
        .sort((a, b) => b.stuck_value - a.stuck_value);
      const start = (data.page - 1) * data.pageSize;
      return {
        mode: data.mode,
        summary: {
          soldBrandCount,
          totalRevenue,
          totalProfit,
          totalSoldQty,
          stuckBrandCount,
          totalStuckValue,
          nextExpiry,
        },
        rows: filtered.slice(start, start + data.pageSize),
        totalCount: filtered.length,
      };
    }

    const filteredSales = allSalesRows.filter(matchesSearch).sort((a, b) => {
      if (data.mode === "profit") return b.profit - a.profit;
      if (data.mode === "qty") return b.sold_qty - a.sold_qty;
      return b.revenue - a.revenue;
    });

    const start = (data.page - 1) * data.pageSize;
    return {
      mode: data.mode,
      summary: {
        soldBrandCount,
        totalRevenue,
        totalProfit,
        totalSoldQty,
        stuckBrandCount,
        totalStuckValue,
        nextExpiry,
      },
      rows: filteredSales.slice(start, start + data.pageSize),
      totalCount: filteredSales.length,
    };
  });
