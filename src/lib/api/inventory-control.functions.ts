import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const TenantInput = z.object({ tenantId: z.string().uuid() });

// ─────────────────────────────────────────────────────────────
// BATCHES — list with optional product search + expiry filter
// ─────────────────────────────────────────────────────────────
export const listBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator(
    TenantInput.extend({
      search: z.string().trim().max(100).optional(),
      maxDaysToExpiry: z.number().int().min(0).max(3650).optional(),
      onlyInStock: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("batches")
      .select("id,batch_no,expiry_date,qty_on_hand,purchase_price,products(id,name,sku,retail_price,strength,medicine_type,volume,pack_size)")
      .eq("tenant_id", data.tenantId)
      .order("expiry_date", { ascending: true })
      .limit(200);
    if (data.onlyInStock) q = q.gt("qty_on_hand", 0);
    if (data.maxDaysToExpiry !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + data.maxDaysToExpiry);
      q = q.lte("expiry_date", cutoff.toISOString().slice(0, 10));
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const filtered = data.search
      ? rows?.filter((r) => {
          const p = r.products as { name?: string; sku?: string } | null;
          const s = data.search!.toLowerCase();
          return (p?.name ?? "").toLowerCase().includes(s) || (p?.sku ?? "").toLowerCase().includes(s);
        })
      : rows;
    return filtered ?? [];
  });

// ─────────────────────────────────────────────────────────────
// EXPIRY DASHBOARD — bucketed counts + value
// ─────────────────────────────────────────────────────────────
export const expirySummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("batches")
      .select("expiry_date,qty_on_hand,purchase_price")
      .eq("tenant_id", data.tenantId)
      .gt("qty_on_hand", 0);
    if (error) throw new Error(error.message);
    const buckets = [7, 15, 30, 60, 90, 180];
    const today = new Date();
    const summary = {
      expired: { qty: 0, value: 0 },
      ...Object.fromEntries(buckets.map((d) => [`d${d}`, { qty: 0, value: 0 }])),
      safe: { qty: 0, value: 0 },
    } as Record<string, { qty: number; value: number }>;
    for (const r of rows ?? []) {
      const days = Math.floor((new Date(r.expiry_date).getTime() - today.getTime()) / 86400000);
      const qty = Number(r.qty_on_hand);
      const value = qty * Number(r.purchase_price);
      let key = "safe";
      if (days < 0) key = "expired";
      else for (const b of buckets) if (days <= b) { key = `d${b}`; break; }
      summary[key].qty += qty;
      summary[key].value += value;
    }
    return summary;
  });

// ─────────────────────────────────────────────────────────────
// DAMAGE ENTRY — decrement batch, append movement, audit log
// ─────────────────────────────────────────────────────────────
const DamageReason = z.enum(["broken", "expired", "water_damage", "packaging", "supplier_defect", "other"]);

export const createDamageEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator(
    TenantInput.extend({
      branch_id: z.string().uuid().optional(),
      batchId: z.string().uuid(),
      qty: z.number().positive().max(1_000_000),
      reason: DamageReason,
      notes: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.branch_id) await assertBranchWrite(supabase, data.tenantId, data.branch_id);
    const { data: batch, error: bErr } = await supabase
      .from("batches")
      .select("id,product_id,qty_on_hand,purchase_price,batch_no")
      .eq("id", data.batchId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!batch) throw new Error("Batch not found");
    const onHand = Number(batch.qty_on_hand);
    if (data.qty > onHand) throw new Error(`Only ${onHand} units available`);
    const newQty = onHand - data.qty;

    const { error: uErr } = await supabase
      .from("batches")
      .update({ qty_on_hand: newQty })
      .eq("id", batch.id)
      .eq("tenant_id", data.tenantId);
    if (uErr) throw new Error(uErr.message);

    const { error: mErr } = await supabase.from("stock_movements").insert({
      tenant_id: data.tenantId,
      product_id: batch.product_id,
      batch_id: batch.id,
      movement_type: "damage",
      qty_change: -data.qty,
      qty_after: newQty,
      reference_table: "damage_entry",
      reference_no: `DMG-${Date.now()}`,
      user_id: userId,
      notes: `${data.reason}${data.notes ? ` — ${data.notes}` : ""}`,
    });
    if (mErr) throw new Error(mErr.message);

    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      branch_id: data.branch_id ?? null,
      user_id: userId,
      action: "damage_entry.created",
      entity_table: "batches",
      entity_id: batch.id,
      after_data: { qty: data.qty, reason: data.reason, value: data.qty * Number(batch.purchase_price) },
    });
    return { ok: true, lossValue: data.qty * Number(batch.purchase_price) };
  });

// ─────────────────────────────────────────────────────────────
// SUPPLIER RETURN — decrement batch, append movement, credit note
// ─────────────────────────────────────────────────────────────
const ReturnReason = z.enum(["expired", "near_expiry", "damaged", "wrong_product"]);

export const createSupplierReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator(
    TenantInput.extend({
      branch_id: z.string().uuid().optional(),
      batchId: z.string().uuid(),
      supplierId: z.string().uuid(),
      qty: z.number().positive(),
      reason: ReturnReason,
      notes: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.branch_id) await assertBranchWrite(supabase, data.tenantId, data.branch_id);
    const { data: batch, error: bErr } = await supabase
      .from("batches")
      .select("id,product_id,qty_on_hand,purchase_price")
      .eq("id", data.batchId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!batch) throw new Error("Batch not found");
    const onHand = Number(batch.qty_on_hand);
    if (data.qty > onHand) throw new Error(`Only ${onHand} units available`);
    const newQty = onHand - data.qty;
    const returnValue = data.qty * Number(batch.purchase_price);

    await supabase.from("batches").update({ qty_on_hand: newQty }).eq("id", batch.id).eq("tenant_id", data.tenantId);

    const refNo = `SRET-${Date.now()}`;
    await supabase.from("stock_movements").insert({
      tenant_id: data.tenantId,
      product_id: batch.product_id,
      batch_id: batch.id,
      movement_type: "purchase_return",
      qty_change: -data.qty,
      qty_after: newQty,
      reference_table: "supplier_return",
      reference_no: refNo,
      user_id: userId,
      notes: `${data.reason}${data.notes ? ` — ${data.notes}` : ""}`,
    });

    // Credit note: adjust supplier due (reduce what we owe by returnValue)
    const { data: sup } = await supabase
      .from("suppliers").select("due_balance").eq("id", data.supplierId).eq("tenant_id", data.tenantId).maybeSingle();
    if (sup) {
      await supabase.from("suppliers")
        .update({ due_balance: Number(sup.due_balance) - returnValue })
        .eq("id", data.supplierId).eq("tenant_id", data.tenantId);
    }

    // Supplier ledger posting (debit supplier — decreases what we owe)
    await supabase.rpc("post_ledger_entry", {
      _tenant_id: data.tenantId,
      _party_type: "supplier",
      _party_id: data.supplierId,
      _entry_type: "purchase_return",
      _debit: returnValue,
      _credit: 0,
      _ref_table: "stock_movements",
      _ref_id: null,
      _ref_no: refNo,
      _notes: `Purchase return ${data.reason}`,
    } as never);

    // Double-entry journal (DR 2000 / CR 1200) — idempotent by refNo
    await supabase.rpc("post_supplier_return_adhoc_journal", {
      _tenant_id: data.tenantId,
      _ref_no: refNo,
      _value: returnValue,
      _date: new Date().toISOString().slice(0, 10),
    } as never);



    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      branch_id: data.branch_id ?? null,
      user_id: userId,
      action: "supplier_return.created",
      entity_table: "stock_movements",
      after_data: { ref: refNo, qty: data.qty, value: returnValue, reason: data.reason, supplier_id: data.supplierId },
    });
    return { ok: true, refNo, returnValue };
  });

// ─────────────────────────────────────────────────────────────
// MOVEMENT TIMELINE
// ─────────────────────────────────────────────────────────────
const MovementType = z.enum([
  "purchase","sale","sales_return","purchase_return","damage","expiry","adjustment","transfer_in","transfer_out","opening",
]);

export const listMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator(
    TenantInput.extend({
      productId: z.string().uuid().optional(),
      types: z.array(MovementType).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("stock_movements")
      .select("id,created_at,movement_type,qty_change,qty_after,reference_no,notes,products(name,sku,strength,medicine_type,volume,pack_size)")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.productId) q = q.eq("product_id", data.productId);
    if (data.types?.length) q = q.in("movement_type", data.types);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ─────────────────────────────────────────────────────────────
// FEFO picker — returns batches in expiry-first order to fulfil qty
// ─────────────────────────────────────────────────────────────
export const pickBatchesFEFO = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("inventory")])
  .inputValidator(TenantInput.extend({ productId: z.string().uuid(), qty: z.number().positive() }))
  .handler(async ({ data, context }) => {
    const { data: batches, error } = await context.supabase
      .from("batches")
      .select("id,batch_no,expiry_date,qty_on_hand,purchase_price,status")
      .eq("tenant_id", data.tenantId)
      .eq("product_id", data.productId)
      .eq("status", "active")
      .gt("qty_on_hand", 0)
      .gte("expiry_date", new Date().toISOString().slice(0, 10))
      .order("expiry_date", { ascending: true });
    if (error) throw new Error(error.message);
    let remaining = data.qty;
    const picks: { batchId: string; batch_no: string; qty: number; expiry_date: string; purchase_price: number }[] = [];
    for (const b of batches ?? []) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.qty_on_hand));
      picks.push({ batchId: b.id, batch_no: b.batch_no, qty: take, expiry_date: b.expiry_date, purchase_price: Number(b.purchase_price) });
      remaining -= take;
    }
    return { picks, shortfall: remaining };
  });
