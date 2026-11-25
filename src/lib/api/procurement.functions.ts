import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { loadBusinessRules } from "@/lib/api/business-rules.functions";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const TenantInput = z.object({ tenantId: z.string().uuid() });

const POItem = z.object({
  product_id: z.string().uuid(),
  qty_ordered: z.number().positive(),
  unit_cost: z.number().nonnegative(),
  discount: z.number().nonnegative().optional().default(0),
  vat: z.number().nonnegative().optional().default(0),
  notes: z.string().optional(),
});

function nextNumber(prefix: string) {
  const d = new Date();
  return `${prefix}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// LIST
export const listPurchaseOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(TenantInput.extend({
    status: z.string().optional(),
    search: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().positive().max(500).optional().default(100),
    offset: z.number().int().nonnegative().optional().default(0),
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("purchase_orders")
      .select("id,po_number,status,order_date,expected_delivery_date,received_at,total,supplier_id,suppliers!supplier_id(name)", { count: "exact" })
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.status) q = q.eq("status", data.status as never);
    if (data.search) q = q.ilike("po_number", `%${data.search}%`);
    if (data.from) q = q.gte("order_date", data.from);
    if (data.to) q = q.lte("order_date", data.to);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], count: count ?? 0 };
  });

// GET one + items
export const getPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: po, error } = await context.supabase
      .from("purchase_orders")
      .select("*, suppliers(name,phone,email)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: items } = await context.supabase
      .from("purchase_order_items")
      .select("*, products(name,sku,unit,strength,medicine_type,volume,pack_size)")
      .eq("purchase_order_id", data.id);
    return { po, items: items ?? [] };
  });

// CREATE (Draft)
export const createPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(
    TenantInput.extend({
      branch_id: z.string().uuid(),
      supplier_id: z.string().uuid().nullable().optional(),
      expected_delivery_date: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(POItem).min(1),
      source_quotation_id: z.string().uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenantId, data.branch_id);
    const subtotal = data.items.reduce((s, it) => s + it.qty_ordered * it.unit_cost, 0);
    const discount = data.items.reduce((s, it) => s + (it.discount ?? 0), 0);
    const vat = data.items.reduce((s, it) => s + (it.vat ?? 0), 0);
    const total = subtotal - discount + vat;

    const { data: po, error } = await context.supabase
      .from("purchase_orders")
      .insert({
        tenant_id: data.tenantId,
        branch_id: data.branch_id!,
        po_number: nextNumber("PO"),
        supplier_id: data.supplier_id ?? null,
        status: "draft",
        expected_delivery_date: data.expected_delivery_date ?? null,
        subtotal, discount, vat, total,
        notes: data.notes ?? null,
        created_by: context.userId,
        source_quotation_id: data.source_quotation_id ?? null,
      })
      .select("id")
      .single();
    if (error || !po) throw new Error(error?.message ?? "PO insert failed");

    const rows = data.items.map((it) => ({
      tenant_id: data.tenantId,
      branch_id: data.branch_id!,
      purchase_order_id: po.id,
      product_id: it.product_id,
      qty_ordered: it.qty_ordered,
      qty_received: 0,
      unit_cost: it.unit_cost,
      discount: it.discount ?? 0,
      vat: it.vat ?? 0,
      line_total: it.qty_ordered * it.unit_cost - (it.discount ?? 0) + (it.vat ?? 0),
      notes: it.notes ?? null,
    }));
    const { error: itErr } = await context.supabase.from("purchase_order_items").insert(rows);
    if (itErr) throw new Error(itErr.message);

    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId, branch_id: data.branch_id!, user_id: context.userId,
      action: "po.create", entity_table: "purchase_orders", entity_id: po.id,
    });

    return { id: po.id };
  });

// UPDATE (draft/sent/approved, nothing received yet) — replaces header fields + items
export const updatePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      supplier_id: z.string().uuid().nullable().optional(),
      expected_delivery_date: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(POItem).min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: po, error: poErr } = await context.supabase
      .from("purchase_orders")
      .select("id, tenant_id, branch_id, status")
      .eq("id", data.id)
      .single();
    if (poErr || !po) throw new Error(poErr?.message ?? "PO not found");
    if (["received", "partially_received", "cancelled"].includes(po.status as string)) {
      throw new Error(`Cannot edit a ${po.status} purchase`);
    }
    if (po.branch_id) await assertBranchWrite(context.supabase, po.tenant_id, po.branch_id as string);

    const subtotal = data.items.reduce((s, it) => s + it.qty_ordered * it.unit_cost, 0);
    const discount = data.items.reduce((s, it) => s + (it.discount ?? 0), 0);
    const vat = data.items.reduce((s, it) => s + (it.vat ?? 0), 0);

    const { error: upErr } = await context.supabase
      .from("purchase_orders")
      .update({
        supplier_id: data.supplier_id ?? null,
        expected_delivery_date: data.expected_delivery_date ?? null,
        notes: data.notes ?? null,
        subtotal, discount, vat, total: subtotal - discount + vat,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    const { error: delErr } = await context.supabase
      .from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", data.id);
    if (delErr) throw new Error(delErr.message);

    const rows = data.items.map((it) => ({
      tenant_id: po.tenant_id,
      branch_id: po.branch_id as string,
      purchase_order_id: data.id,
      product_id: it.product_id,
      qty_ordered: it.qty_ordered,
      qty_received: 0,
      unit_cost: it.unit_cost,
      discount: it.discount ?? 0,
      vat: it.vat ?? 0,
      line_total: it.qty_ordered * it.unit_cost - (it.discount ?? 0) + (it.vat ?? 0),
      notes: it.notes ?? null,
    }));
    const { error: insErr } = await context.supabase.from("purchase_order_items").insert(rows);
    if (insErr) throw new Error(insErr.message);

    await context.supabase.from("audit_log").insert({
      tenant_id: po.tenant_id, branch_id: po.branch_id, user_id: context.userId,
      action: "po.update", entity_table: "purchase_orders", entity_id: data.id,
    });

    return { id: data.id };
  });

// STATUS TRANSITIONS

export const updatePOStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(z.object({
    id: z.string().uuid(),
    branch_id: z.string().uuid().optional(),
    action: z.enum(["send", "approve", "cancel"]),
  }))
  .handler(async ({ data, context }) => {
    // Look up tenant + branch for the PO so we can read business rules
    const { data: poRow } = await context.supabase
      .from("purchase_orders").select("tenant_id, branch_id").eq("id", data.id).single();
    const tenantId = poRow?.tenant_id as string | undefined;
    const branchId = (data.branch_id ?? (poRow?.branch_id as string | null) ?? null) as string | null;
    if (tenantId && data.branch_id) await assertBranchWrite(context.supabase, tenantId, data.branch_id);
    const rules = tenantId ? await loadBusinessRules(context.supabase, tenantId) : null;

    const patch: {
      status?: "sent" | "approved" | "cancelled";
      approved_by?: string;
      approved_at?: string;
      cancelled_at?: string;
    } = {};
    let auditAction = `po.${data.action}`;

    if (data.action === "send") {
      if (rules && !rules.require_po_approval) {
        patch.status = "approved";
        patch.approved_by = context.userId;
        patch.approved_at = new Date().toISOString();
        auditAction = "po.auto_approved";
      } else {
        patch.status = "sent";
      }
    }
    if (data.action === "approve") {
      patch.status = "approved";
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
    }
    if (data.action === "cancel") {
      patch.status = "cancelled";
      patch.cancelled_at = new Date().toISOString();
    }
    const { error } = await context.supabase.from("purchase_orders").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      tenant_id: tenantId, branch_id: branchId, user_id: context.userId, action: auditAction,
      entity_table: "purchase_orders", entity_id: data.id,
    });
    return { ok: true };
  });

export const deletePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: poRow, error: fErr } = await context.supabase
      .from("purchase_orders")
      .select("id, tenant_id, branch_id, status, po_number")
      .eq("id", data.id)
      .single();
    if (fErr || !poRow) throw new Error("Purchase order not found");
    if (poRow.branch_id) await assertBranchWrite(context.supabase, poRow.tenant_id, poRow.branch_id);
    if (["received", "partially_received"].includes(poRow.status ?? "")) {
      throw new Error("রিসিভ হওয়া ক্রয় মুছে ফেলা যাবে না — প্রয়োজনে ক্রয় রিটার্ন করুন");
    }

    const { error: iErr } = await context.supabase
      .from("purchase_order_items")
      .delete()
      .eq("purchase_order_id", data.id);
    if (iErr) throw new Error(iErr.message);

    const { error: dErr } = await context.supabase
      .from("purchase_orders")
      .delete()
      .eq("id", data.id);
    if (dErr) throw new Error(dErr.message);

    await context.supabase.from("audit_log").insert({
      tenant_id: poRow.tenant_id,
      branch_id: poRow.branch_id ?? null,
      user_id: context.userId,
      action: "po.delete",
      entity_table: "purchase_orders",
      entity_id: data.id,
      before_data: { po_number: poRow.po_number, status: poRow.status },
    });
    return { ok: true };
  });

// RECEIVE (full or partial) — creates batches + stock_movements + GRN
export const receivePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(z.object({
    id: z.string().uuid(),
    branch_id: z.string().uuid().optional(),
    lines: z.array(z.object({
      item_id: z.string().uuid(),
      qty: z.number().positive(),
      batch_no: z.string().min(1),
      expiry_date: z.string(),
      mfg_date: z.string().optional(),
    })),
  }))
  .handler(async ({ data, context }) => {
    const { data: po } = await context.supabase
      .from("purchase_orders")
      .select("id, tenant_id, branch_id, status")
      .eq("id", data.id)
      .single();
    if (!po) throw new Error("PO not found");
    if (po.status === "cancelled" || po.status === "received") {
      throw new Error(`Cannot receive a ${po.status} PO`);
    }
    // PO approval workflow is intentionally disabled for now — will be added later.

    const branchId = (data.branch_id ?? (po.branch_id as string | null) ?? null) as string | null;
    if (data.branch_id) await assertBranchWrite(context.supabase, po.tenant_id, data.branch_id);

    const { data: items } = await context.supabase
      .from("purchase_order_items")
      .select("id, product_id, qty_ordered, qty_received, unit_cost")
      .eq("purchase_order_id", data.id);
    const itemMap = new Map((items ?? []).map((i) => [i.id, i]));

    // Resolve tenant default warehouse so GRN batches never land with warehouse_id = NULL
    const { data: defWh } = await context.supabase.from("warehouses").select("id, branch_id").eq("tenant_id", po.tenant_id).eq("is_default", true).maybeSingle();
    const defaultWarehouseId: string | null = (defWh as { id?: string } | null)?.id ?? null;
    const defaultWarehouseBranch: string | null = (defWh as { branch_id?: string | null } | null)?.branch_id ?? null;
    if (!defaultWarehouseId) throw new Error("No default warehouse configured for tenant — cannot receive PO");
    // batches.branch_id is NOT NULL — derive from PO, then warehouse
    const batchBranchId = branchId ?? defaultWarehouseBranch;
    if (!batchBranchId) throw new Error("Cannot resolve branch for GRN batch (set PO branch or warehouse branch)");

    for (const ln of data.lines) {
      const it = itemMap.get(ln.item_id);
      if (!it) throw new Error(`Unknown line ${ln.item_id}`);

      // create batch
      const { data: batch, error: bErr } = await context.supabase
        .from("batches")
        .insert({
          tenant_id: po.tenant_id,
          branch_id: batchBranchId,
          warehouse_id: defaultWarehouseId,
          product_id: it.product_id,
          batch_no: ln.batch_no,
          expiry_date: ln.expiry_date,
          mfg_date: ln.mfg_date ?? null,
          purchase_price: it.unit_cost,
          qty_on_hand: ln.qty,
        })
        .select("id")
        .single();
      if (bErr || !batch) throw new Error(bErr?.message ?? "batch insert failed");


      // stock movement
      await context.supabase.from("stock_movements").insert({
        tenant_id: po.tenant_id,
        product_id: it.product_id,
        batch_id: batch.id,
        movement_type: "purchase",
        qty_change: ln.qty,
        reference_table: "purchase_orders",
        reference_id: po.id,
        notes: `GRN for PO ${po.id}`,
      } as never);

      // update qty_received
      const newReceived = Number(it.qty_received) + ln.qty;
      await context.supabase
        .from("purchase_order_items")
        .update({ qty_received: newReceived })
        .eq("id", it.id);
    }

    // recompute PO status
    const { data: refreshed } = await context.supabase
      .from("purchase_order_items")
      .select("qty_ordered, qty_received")
      .eq("purchase_order_id", data.id);
    const fullyReceived = (refreshed ?? []).every((r) => Number(r.qty_received) >= Number(r.qty_ordered));
    const anyReceived = (refreshed ?? []).some((r) => Number(r.qty_received) > 0);
    const status = fullyReceived ? "received" : anyReceived ? "partially_received" : "approved";
    await context.supabase
      .from("purchase_orders")
      .update({ status, received_at: fullyReceived ? new Date().toISOString() : null })
      .eq("id", data.id);

    // Supplier ledger posting (idempotent) — only when fully received and supplier known
    const { data: poFull } = await context.supabase
      .from("purchase_orders")
      .select("id, tenant_id, supplier_id, po_number, total")
      .eq("id", data.id)
      .single();
    if (poFull?.supplier_id && fullyReceived && Number(poFull.total) > 0) {
      const rules = await loadBusinessRules(context.supabase, poFull.tenant_id);
      if (rules.enable_supplier_ledger) {
        await context.supabase.rpc("post_supplier_ledger_idempotent", {
          _tenant_id: poFull.tenant_id,
          _supplier_id: poFull.supplier_id,
          _entry_type: "purchase",
          _debit: 0,
          _credit: Number(poFull.total),
          _ref_table: "purchase_orders",
          _ref_id: poFull.id,
          _ref_no: poFull.po_number,
          _notes: `Purchase received PO ${poFull.po_number}`,
        } as never);
        await context.supabase.rpc("increment_supplier_due_balance", {
          _supplier_id: poFull.supplier_id,
          _amount: Number(poFull.total),
        } as never);
      } else {
        await context.supabase.from("audit_log").insert({
          tenant_id: poFull.tenant_id, user_id: context.userId,
          action: "supplier_ledger.skipped_by_rule",
          entity_table: "purchase_orders", entity_id: poFull.id,
          after_data: { reason: "enable_supplier_ledger=false", total: Number(poFull.total) },
        });
      }
      if (rules.enable_journal_posting) {
        await context.supabase.rpc("post_po_journal", {
          _tenant_id: poFull.tenant_id,
          _po_id: poFull.id,
        } as never);
      } else {
        await context.supabase.from("audit_log").insert({
          tenant_id: poFull.tenant_id, user_id: context.userId,
          action: "journal.skipped_by_rule",
          entity_table: "purchase_orders", entity_id: poFull.id,
          after_data: { reason: "enable_journal_posting=false", source: "po_receive" },
        });
      }
    }




    await context.supabase.from("audit_log").insert({
      tenant_id: po.tenant_id, branch_id: branchId, user_id: context.userId,
      action: "po.receive", entity_table: "purchase_orders", entity_id: data.id,
      after_data: { status, lines: data.lines.length },
    });

    return { ok: true, status };
  });

// PO DASHBOARD COUNTS
export const poStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("purchase_orders")
      .select("status,total")
      .eq("tenant_id", data.tenantId);
    const counts: Record<string, number> = { draft: 0, sent: 0, approved: 0, partially_received: 0, received: 0, cancelled: 0 };
    let totalValue = 0;
    (rows ?? []).forEach((r) => {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      totalValue += Number(r.total ?? 0);
    });
    return { counts, totalValue, totalPOs: rows?.length ?? 0 };
  });
