import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const MovementType = z.enum([
  "purchase", "sale", "sales_return", "purchase_return",
  "damage", "expiry", "adjustment", "transfer_in", "transfer_out", "opening",
]);

const AdjustSchema = z.object({
  tenant_id: z.string().uuid(),
  product_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  qty_change: z.number().refine((n) => n !== 0, "qty_change cannot be 0"),
  movement_type: MovementType,
  reason: z.string().optional(),
  reference_no: z.string().optional(),
});

export const inventoryAdjust = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator((i: unknown) => AdjustSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: mv, error } = await context.supabase.rpc("inventory_adjust", {
      _tenant_id: data.tenant_id,
      _product_id: data.product_id,
      _batch_id: data.batch_id,
      _qty_change: data.qty_change,
      _movement_type: data.movement_type,
      _reason: data.reason,
      _reference_no: data.reference_no,
    });
    if (error) throw new Error(error.message);
    return mv;
  });

const PhysicalCountSchema = z.object({
  tenant_id: z.string().uuid(),
  product_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  counted_qty: z.number().min(0),
  reason: z.string().optional(),
});

export const inventoryPhysicalCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator((i: unknown) => PhysicalCountSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: mv, error } = await context.supabase.rpc("inventory_physical_count", {
      _tenant_id: data.tenant_id,
      _product_id: data.product_id,
      _batch_id: data.batch_id,
      _counted_qty: data.counted_qty,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return mv;
  });

export const inventoryExpireBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator((i: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await context.supabase.rpc("inventory_expire_batches", {
      _tenant_id: data.tenant_id,
    });
    if (error) throw new Error(error.message);
    return { expired: n ?? 0 };
  });

const InventoryListSchema = z.object({
  tenantId: z.string().uuid(),
  search: z.string().trim().max(120).optional().default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(25).max(500).default(50),
  sortBy: z.enum(["name", "sku", "manufacturer", "generic", "stock", "purchase_price", "retail_price", "mrp"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type InventoryInStockRow = {
  id: string;
  name: string;
  name_bn: string | null;
  sku: string | null;
  barcode: string | null;
  retail_price: number | null;
  purchase_price: number | null;
  mrp: number | null;
  stock: number;
  generic_name: string | null;
  manufacturer_name: string | null;
  category_name: string | null;
  medicine_type_name: string | null;
};

export type InventoryInStockSortBy = z.infer<typeof InventoryListSchema>["sortBy"];
export type InventoryInStockSortDir = z.infer<typeof InventoryListSchema>["sortDir"];

type InventoryInStockRpcResult = {
  rows: unknown;
  total_count: number | string | null;
  current_page: number | string | null;
  total_pages: number | string | null;
};

export const listInventoryInStockProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator((i: unknown) => InventoryListSchema.parse(i))
  .handler(async ({ data, context }): Promise<{ rows: InventoryInStockRow[]; totalCount: number; currentPage: number; totalPages: number }> => {
    const { data: rpcRows, error } = await context.supabase.rpc("list_inventory_in_stock_products" as never, {
      p_tenant_id: data.tenantId,
      p_search: data.search || null,
      p_page: data.page,
      p_page_size: data.pageSize,
      p_sort_by: data.sortBy,
      p_sort_dir: data.sortDir,
    } as never);
    if (error) throw new Error(error.message);

    const result = ((rpcRows as unknown as InventoryInStockRpcResult[] | null) ?? [])[0];
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    return {
      rows: rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          name: String(r.name ?? ""),
          name_bn: r.name_bn == null ? null : String(r.name_bn),
          sku: r.sku == null ? null : String(r.sku),
          barcode: r.barcode == null ? null : String(r.barcode),
          retail_price: r.retail_price == null ? null : Number(r.retail_price),
          purchase_price: r.purchase_price == null ? null : Number(r.purchase_price),
          mrp: r.mrp == null ? null : Number(r.mrp),
          stock: Number(r.stock ?? 0),
          generic_name: r.generic_name == null ? null : String(r.generic_name),
          manufacturer_name: r.manufacturer_name == null ? null : String(r.manufacturer_name),
          category_name: r.category_name == null ? null : String(r.category_name),
          medicine_type_name: r.medicine_type_name == null ? null : String(r.medicine_type_name),
        };
      }),
      totalCount: Number(result?.total_count ?? 0),
      currentPage: Number(result?.current_page ?? data.page),
      totalPages: Number(result?.total_pages ?? 1),
    };
  });
