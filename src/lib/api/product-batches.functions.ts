import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const T = z.object({ tenantId: z.string().uuid(), productId: z.string().uuid() });

export type ProductBatchRow = {
  id: string;
  batch_no: string;
  expiry_date: string;
  mfg_date: string | null;
  qty_on_hand: number;
  purchase_price: number;
  mrp: number | null;
  status: string;
  warehouse_id: string | null;
  supplier_id: string | null;
  warehouse_name: string | null;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
};

export const listProductBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T)
  .handler(async ({ data, context }): Promise<ProductBatchRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("batches")
      .select("id,batch_no,expiry_date,mfg_date,qty_on_hand,purchase_price,mrp,status,warehouse_id,supplier_id,created_at,updated_at,warehouses(name),suppliers(name)")
      .eq("tenant_id", data.tenantId)
      .eq("product_id", data.productId)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: {
      id: string; batch_no: string; expiry_date: string; mfg_date: string | null;
      qty_on_hand: number; purchase_price: number; mrp: number | null; status: string;
      warehouse_id: string | null; supplier_id: string | null;
      created_at: string; updated_at: string;
      warehouses: { name: string } | { name: string }[] | null;
      suppliers: { name: string } | { name: string }[] | null;
    }) => {
      const wh = Array.isArray(r.warehouses) ? r.warehouses[0] : r.warehouses;
      const sp = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers;
      return {
        id: r.id, batch_no: r.batch_no, expiry_date: r.expiry_date, mfg_date: r.mfg_date,
        qty_on_hand: Number(r.qty_on_hand), purchase_price: Number(r.purchase_price),
        mrp: r.mrp == null ? null : Number(r.mrp), status: r.status,
        warehouse_id: r.warehouse_id, supplier_id: r.supplier_id,
        warehouse_name: wh?.name ?? null, supplier_name: sp?.name ?? null,
        created_at: r.created_at, updated_at: r.updated_at,
      };
    });
  });

export const updateBatchExpiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    batchId: z.string().uuid(),
    newExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    reason: z.string().trim().max(500).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: readErr } = await supabase
      .from("batches").select("id,expiry_date,mfg_date,tenant_id")
      .eq("id", data.batchId).eq("tenant_id", data.tenantId).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing) throw new Error("Batch not found");
    if (existing.mfg_date && data.newExpiry < existing.mfg_date) {
      throw new Error("Expiry date cannot be before manufacture date");
    }
    const { error } = await supabase
      .from("batches")
      .update({ expiry_date: data.newExpiry, updated_by: userId })
      .eq("id", data.batchId).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId, user_id: userId,
      action: "batch_expiry_updated", entity_table: "batches", entity_id: data.batchId,
      before_data: { expiry_date: existing.expiry_date },
      after_data: { expiry_date: data.newExpiry, reason: data.reason ?? null },
    });
    return { ok: true };
  });

export const setBatchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    batchId: z.string().uuid(),
    status: z.enum(["active", "locked"]),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await context.supabase
      .from("batches")
      .update({ status: data.status, updated_by: userId })
      .eq("id", data.batchId).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId, user_id: userId,
      action: `batch_${data.status === "locked" ? "locked" : "unlocked"}`,
      entity_table: "batches", entity_id: data.batchId,
    });
    return { ok: true };
  });

export const softDeleteBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({ tenantId: z.string().uuid(), batchId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: b, error: readErr } = await supabase
      .from("batches").select("qty_on_hand").eq("id", data.batchId).eq("tenant_id", data.tenantId).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!b) throw new Error("Batch not found");
    if (Number(b.qty_on_hand) > 0) throw new Error("Cannot delete a batch with stock on hand");
    const { error } = await supabase
      .from("batches")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", data.batchId).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId, user_id: userId,
      action: "batch_deleted", entity_table: "batches", entity_id: data.batchId,
    });
    return { ok: true };
  });
