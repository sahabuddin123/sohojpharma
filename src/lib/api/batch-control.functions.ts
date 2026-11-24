import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const T = z.object({ tenantId: z.string().uuid() });

// ── Dashboard KPIs ────────────────────────────────────────────
export const batchControlKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const sinceISO = new Date(Date.now() - 30 * 86400000).toISOString();
    const [recalled, locked, adj, tr] = await Promise.all([
      supabase.from("batches").select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId).eq("status", "recalled"),
      supabase.from("batches").select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId).eq("status", "locked"),
      supabase.from("stock_movements").select("qty_change", { count: "exact" })
        .eq("tenant_id", data.tenantId).eq("movement_type", "adjustment").gte("created_at", sinceISO),
      supabase.from("stock_movements").select("qty_change", { count: "exact" })
        .eq("tenant_id", data.tenantId).in("movement_type", ["transfer_in", "transfer_out"]).gte("created_at", sinceISO),
    ]);
    const adjQty = (adj.data ?? []).reduce((s, r) => s + Math.abs(Number(r.qty_change)), 0);
    const trQty = (tr.data ?? []).reduce((s, r) => s + (Number(r.qty_change) > 0 ? Number(r.qty_change) : 0), 0);
    return {
      recalledBatches: recalled.count ?? 0,
      lockedBatches: locked.count ?? 0,
      adjustedUnits30d: adjQty,
      transferredUnits30d: trQty,
    };
  });

// ── Paginated / searchable / sortable batch listing ───────────
export const listActionableBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(
    T.extend({
      search: z.string().trim().max(100).optional(),
      sort: z.enum(["nearest_expiry", "latest_expiry", "stock_desc", "stock_asc", "newest", "oldest"]).default("nearest_expiry"),
      page: z.number().int().min(1).default(1),
      pageSize: z.union([z.literal(50), z.literal(100), z.literal(250), z.literal(500)]).default(50),
    })
  )
  .handler(async ({ data, context }) => {
    const { data: json, error } = await context.supabase.rpc("list_batch_control_batches" as never, {
      _tenant_id: data.tenantId,
      _search: data.search ?? null,
      _sort: data.sort,
      _page: data.page,
      _page_size: data.pageSize,
    } as never);
    if (error) throw new Error(error.message);
    type BatchRow = {
      id: string; batch_no: string; expiry_date: string; mfg_date: string | null;
      qty_on_hand: number; purchase_price: number; mrp: number | null; status: string;
      branch_id: string | null; supplier_id: string | null; warehouse_id: string | null;
      product_id: string; created_at: string; updated_at: string;
      warehouse_name: string | null; supplier_name: string | null;
      products: { name?: string; sku?: string; barcode?: string; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null; sale_price?: number | null; generic_name?: string | null; manufacturer_name?: string | null } | null;
    };

    const p = (json ?? {}) as { rows?: BatchRow[]; total_count?: number; page?: number; page_size?: number; total_pages?: number };
    return {
      rows: (p.rows ?? []) as BatchRow[],
      totalCount: p.total_count ?? 0,
      page: p.page ?? 1,
      pageSize: p.page_size ?? 50,
      totalPages: p.total_pages ?? 0,
    };
  });

// ── Single-batch expiry update (audited) ──────────────────────
export const updateBatchExpiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(
    T.extend({
      batchId: z.string().uuid(),
      newExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid date"),
      reason: z.string().trim().max(300).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("update_batch_expiry" as never, {
      _tenant_id: data.tenantId,
      _batch_id: data.batchId,
      _new_expiry: data.newExpiry,
      _reason: data.reason ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return res as { id: string; old_expiry: string; new_expiry: string };
  });


// ── Recent recalls ───────────────────────────────────────────
export const listRecalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("batch_recalls")
      .select("id,recall_date,recall_reason,recall_source,qty_locked,status,batches(batch_no,products(name,strength,medicine_type,volume,pack_size))")
      .eq("tenant_id", data.tenantId)
      .order("recall_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── RPC wrappers ─────────────────────────────────────────────
export const transferBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T.extend({
    batchId: z.string().uuid(),
    qty: z.number().positive(),
    fromBranchId: z.string().uuid().nullable(),
    toBranchId: z.string().uuid().nullable(),
    notes: z.string().trim().max(500).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error, data: id } = await context.supabase.rpc("batch_transfer", {
      _tenant_id: data.tenantId, _batch_id: data.batchId, _qty: data.qty,
      _from_branch: data.fromBranchId, _to_branch: data.toBranchId, _notes: data.notes ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { transferId: id };
  });

export const adjustBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T.extend({
    batchId: z.string().uuid(),
    delta: z.number(),
    reason: z.enum(["damage", "shrinkage", "found", "manual"]),
    notes: z.string().trim().max(500).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error, data: id } = await context.supabase.rpc("batch_adjust", {
      _tenant_id: data.tenantId, _batch_id: data.batchId, _delta: data.delta,
      _reason: data.reason, _notes: data.notes ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { movementId: id };
  });

export const mergeBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T.extend({ srcBatchId: z.string().uuid(), dstBatchId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error, data: id } = await context.supabase.rpc("batch_merge", {
      _tenant_id: data.tenantId, _src_batch_id: data.srcBatchId, _dst_batch_id: data.dstBatchId,
    } as never);
    if (error) throw new Error(error.message);
    return { batchId: id };
  });

export const splitBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T.extend({
    batchId: z.string().uuid(), qty: z.number().positive(),
    newBatchNo: z.string().trim().max(80).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error, data: id } = await context.supabase.rpc("batch_split", {
      _tenant_id: data.tenantId, _batch_id: data.batchId, _qty: data.qty,
      _new_batch_no: data.newBatchNo ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { newBatchId: id };
  });

export const recallBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T.extend({
    batchId: z.string().uuid(),
    reason: z.string().trim().min(2).max(500),
    source: z.enum(["manufacturer", "supplier", "regulator", "internal", "other"]),
    notes: z.string().trim().max(500).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error, data: id } = await context.supabase.rpc("batch_recall", {
      _tenant_id: data.tenantId, _batch_id: data.batchId, _reason: data.reason,
      _source: data.source, _notes: data.notes ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { recallId: id };
  });

export const recallSupplierBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(T.extend({
    supplierId: z.string().uuid(),
    reason: z.string().trim().min(2).max(500),
    source: z.enum(["manufacturer", "supplier", "regulator", "internal", "other"]).default("supplier"),
    notes: z.string().trim().max(500).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error, data: count } = await context.supabase.rpc("supplier_recall", {
      _tenant_id: data.tenantId, _supplier_id: data.supplierId, _reason: data.reason,
      _source: data.source, _notes: data.notes ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { recalled: count ?? 0 };
  });
