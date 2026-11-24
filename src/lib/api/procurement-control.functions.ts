import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const T = z.object({ tenantId: z.string().uuid() });
const TW = T.extend({ warehouseId: z.string().uuid().nullable().optional() });

// ── Dashboard KPIs ───────────────────────────────────────────
export const procurementKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(TW)
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    let trQ = s.from("stock_transfers").select("id", { count: "exact", head: true })
      .eq("tenant_id", data.tenantId).eq("status", "requested");
    if (data.warehouseId) {
      trQ = trQ.or(`from_warehouse_id.eq.${data.warehouseId},to_warehouse_id.eq.${data.warehouseId}`);
    }
    const [po, tr, grn, ret] = await Promise.all([
      s.from("purchase_orders").select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId).in("status", ["draft", "sent"]),
      trQ,
      s.from("goods_receipts").select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId).in("status", ["pending", "received"]),
      s.from("purchase_returns").select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .gte("return_date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
    ]);
    return {
      pendingPO: po.count ?? 0,
      pendingTransfers: tr.count ?? 0,
      pendingGRN: grn.count ?? 0,
      pendingReturns: ret.count ?? 0,
    };
  });

// ── Pending lists ────────────────────────────────────────────
export const pendingTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(TW)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("stock_transfers")
      .select("id,transfer_no,status,requested_at,notes,from_branch_id,to_branch_id,stock_transfer_items(qty_requested,batch_id,product_id)")
      .eq("tenant_id", data.tenantId)
      .eq("status", "requested");
    if (data.warehouseId) {
      q = q.or(`from_warehouse_id.eq.${data.warehouseId},to_warehouse_id.eq.${data.warehouseId}`);
    }
    const { data: rows, error } = await q.order("requested_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const pendingPOs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("purchase_orders")
      .select("id,po_number,status,order_date,total,suppliers(name)")
      .eq("tenant_id", data.tenantId)
      .in("status", ["draft", "sent"])
      .order("order_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── Action wrappers ──────────────────────────────────────────
export const requestTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({
    batchId: z.string().uuid(), qty: z.number().positive(),
    fromBranchId: z.string().uuid().nullable(), toBranchId: z.string().uuid().nullable(),
    notes: z.string().trim().max(500).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error, data: id } = await context.supabase.rpc("batch_transfer_request", {
      _tenant_id: data.tenantId, _batch_id: data.batchId, _qty: data.qty,
      _from_branch: data.fromBranchId, _to_branch: data.toBranchId, _notes: data.notes ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { transferId: id };
  });

export const approveTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({
    transferId: z.string().uuid(), approve: z.boolean(), reason: z.string().max(500).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("batch_transfer_approve", {
      _tenant_id: data.tenantId, _transfer_id: data.transferId, _approve: data.approve,
      _reject_reason: data.reason ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitPO = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({ poId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("po_submit", { _tenant_id: data.tenantId, _po_id: data.poId } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approvePO = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({ poId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("po_approve", { _tenant_id: data.tenantId, _po_id: data.poId } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectPO = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({ poId: z.string().uuid(), reason: z.string().max(500).optional() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("po_reject", {
      _tenant_id: data.tenantId, _po_id: data.poId, _reason: data.reason ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveGRN = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({ grnId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("grn_approve", { _tenant_id: data.tenantId, _grn_id: data.grnId } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Tenant procurement settings ──────────────────────────────
export const getProcurementSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("tenants").select("procurement_settings").eq("id", data.tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    return (row?.procurement_settings as Record<string, boolean>) ?? {};
  });

export const updateProcurementSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({
    requirePOApproval: z.boolean().optional(),
    requireTransferApproval: z.boolean().optional(),
    requireGRNApproval: z.boolean().optional(),
    requirePurchaseReturnApproval: z.boolean().optional(),
  }))
  .handler(async ({ data, context }) => {
    const next: Record<string, boolean> = {};
    if (data.requirePOApproval !== undefined) next.require_po_approval = data.requirePOApproval;
    if (data.requireTransferApproval !== undefined) next.require_transfer_approval = data.requireTransferApproval;
    if (data.requireGRNApproval !== undefined) next.require_grn_approval = data.requireGRNApproval;
    if (data.requirePurchaseReturnApproval !== undefined) next.require_purchase_return_approval = data.requirePurchaseReturnApproval;
    const { data: cur } = await context.supabase
      .from("tenants").select("procurement_settings").eq("id", data.tenantId).maybeSingle();
    const merged = { ...((cur?.procurement_settings as object) ?? {}), ...next };
    const { error } = await context.supabase.from("tenants")
      .update({ procurement_settings: merged }).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return merged;
  });
