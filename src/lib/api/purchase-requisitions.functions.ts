import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const T = z.object({ tenantId: z.string().uuid() });

const ItemSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  product_name: z.string(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  generic_name: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  current_stock: z.number().default(0),
  reorder_level: z.number().default(0),
  requested_qty: z.number().min(0).default(1),
  last_purchase_price: z.number().default(0),
  remarks: z.string().nullable().optional(),
});

export type PurchaseRequisitionItemInput = z.infer<typeof ItemSchema>;

export const resolveDefaultSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(T)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "resolve_default_supplier" as never,
      { _tenant_id: data.tenantId } as never,
    );
    if (error) throw new Error(error.message);
    const first = ((rows ?? []) as Array<{ id: string; name: string }>)[0];
    return first ?? null;
  });

export const savePurchaseRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string().uuid().nullable().optional(),
    tenantId: z.string().uuid(),
    warehouse_id: z.string().uuid().nullable().optional(),
    supplier_id: z.string().uuid().nullable().optional(),
    requisition_date: z.string().nullable().optional(),
    expected_date: z.string().nullable().optional(),
    remarks: z.string().nullable().optional(),
    status: z.enum(["draft", "pending"]).default("pending"),
    items: z.array(ItemSchema).min(1),
  }))
  .handler(async ({ data, context }) => {
    const payload = {
      id: data.id ?? null,
      tenant_id: data.tenantId,
      warehouse_id: data.warehouse_id ?? null,
      supplier_id: data.supplier_id ?? null,
      requisition_date: data.requisition_date ?? null,
      expected_date: data.expected_date ?? null,
      remarks: data.remarks ?? null,
      status: data.status,
      items: data.items,
    };
    const { data: row, error } = await context.supabase.rpc(
      "save_purchase_requisition" as never,
      { payload } as never,
    );
    if (error) throw new Error(error.message);
    return row as unknown as { id: string; pr_number: string; status: string };
  });

export const listPurchaseRequisitions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(T.extend({
    search: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    supplier_id: z.string().uuid().nullable().optional(),
    warehouse_id: z.string().uuid().nullable().optional(),
    date_from: z.string().nullable().optional(),
    date_to: z.string().nullable().optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "list_purchase_requisitions" as never,
      {
        _tenant_id: data.tenantId,
        _search: data.search ?? null,
        _status: data.status ?? null,
        _supplier_id: data.supplier_id ?? null,
        _warehouse_id: data.warehouse_id ?? null,
        _date_from: data.date_from ?? null,
        _date_to: data.date_to ?? null,
        _limit: data.limit,
        _offset: data.offset,
      } as never,
    );
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string; pr_number: string; requisition_date: string; expected_date: string | null;
      supplier_id: string | null; supplier_name: string | null;
      warehouse_id: string | null; warehouse_name: string | null;
      status: string; total_items: number; total_qty: number; estimated_amount: number;
      remarks: string | null; created_by: string | null; created_by_email: string | null;
      created_at: string; total_count: number;
    }>;
    const total = list[0]?.total_count ?? 0;
    return { rows: list, total: Number(total) };
  });

export const getPurchaseRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(T.extend({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: header, error } = await context.supabase
      .from("purchase_requisitions")
      .select("*, suppliers(name), warehouses(name)")
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!header) throw new Error("Not found");
    const { data: items, error: iErr } = await context.supabase
      .from("purchase_requisition_items")
      .select("*, products(strength, volume)")
      .eq("requisition_id", data.id)
      .order("created_at", { ascending: true });
    if (iErr) throw new Error(iErr.message);
    return { header, items: items ?? [] };
  });

export const setRequisitionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(T.extend({
    id: z.string().uuid(),
    status: z.enum(["draft", "pending", "approved", "rejected", "completed", "cancelled"]),
    reason: z.string().nullable().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc(
      "set_purchase_requisition_status" as never,
      { _id: data.id, _tenant_id: data.tenantId, _status: data.status, _reason: data.reason ?? null } as never,
    );
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePurchaseRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(T.extend({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("purchase_requisitions")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
