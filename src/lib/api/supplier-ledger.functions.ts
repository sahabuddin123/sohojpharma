import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { loadBusinessRules } from "@/lib/api/business-rules.functions";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const TenantInput = z.object({ tenantId: z.string().uuid() });

// Record a supplier payment + post ledger entry + decrement supplier due
export const recordSupplierPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator(
    TenantInput.extend({
      supplierId: z.string().uuid(),
      amount: z.number().positive(),
      method: z.enum(["cash", "bank", "bkash", "nagad", "rocket", "card", "other"]).default("cash"),
      reference: z.string().max(120).optional(),
      payment_date: z.string().optional(),
      purchase_id: z.string().uuid().optional(),
      branch_id: z.string().uuid().optional(),
      notes: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const refNo = data.reference ?? `SPAY-${Date.now()}`;

    const { data: pay, error } = await supabase
      .from("supplier_payments")
      .insert({
        tenant_id: data.tenantId,
        supplier_id: data.supplierId,
        purchase_id: data.purchase_id ?? null,
        amount: data.amount,
        method: data.method,
        reference: refNo,
        notes: data.notes ?? null,
        payment_date: data.payment_date ?? new Date().toISOString().slice(0, 10),
        paid_by: userId,
        branch_id: data.branch_id ?? null,
      } as never)
      .select("id")
      .single();
    if (error || !pay) throw new Error(error?.message ?? "payment insert failed");

    const rules = await loadBusinessRules(supabase, data.tenantId);
    if (rules.enable_supplier_ledger) {
      await supabase.rpc("post_supplier_ledger_idempotent", {
        _tenant_id: data.tenantId,
        _supplier_id: data.supplierId,
        _entry_type: "payment",
        _debit: data.amount,
        _credit: 0,
        _ref_table: "supplier_payments",
        _ref_id: (pay as { id: string }).id,
        _ref_no: refNo,
        _notes: data.notes ?? `Payment via ${data.method}`,
      } as never);

      const { data: sup } = await supabase
        .from("suppliers").select("due_balance").eq("id", data.supplierId).maybeSingle();
      if (sup) {
        await supabase.from("suppliers")
          .update({ due_balance: Number(sup.due_balance ?? 0) - data.amount })
          .eq("id", data.supplierId);
      }
    } else {
      await supabase.from("audit_log").insert({
        tenant_id: data.tenantId, user_id: userId,
        action: "supplier_ledger.skipped_by_rule",
        entity_table: "supplier_payments", entity_id: (pay as { id: string }).id,
        after_data: { reason: "enable_supplier_ledger=false", amount: data.amount },
      });
    }

    if (rules.enable_journal_posting) {
      await supabase.rpc("post_supplier_payment_journal", {
        _tenant_id: data.tenantId,
        _payment_id: (pay as { id: string }).id,
      } as never);
    } else {
      await supabase.from("audit_log").insert({
        tenant_id: data.tenantId, user_id: userId,
        action: "journal.skipped_by_rule",
        entity_table: "supplier_payments", entity_id: (pay as { id: string }).id,
        after_data: { reason: "enable_journal_posting=false", source: "supplier_payment" },
      });
    }
    return { ok: true, id: (pay as { id: string }).id, refNo };
  });


// List supplier payments
export const listSupplierPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator(TenantInput.extend({ supplierId: z.string().uuid().optional() }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("supplier_payments")
      .select("id,supplier_id,amount,method,reference,payment_date,notes,created_at,suppliers(name)")
      .eq("tenant_id", data.tenantId)
      .order("payment_date", { ascending: false })
      .limit(200);
    if (data.supplierId) q = q.eq("supplier_id", data.supplierId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// AP reconciliation: supplier ledger vs AP (2000) journal
export const getAPReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("v_supplier_ap_recon")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const supplier_ledger_due = Number((row as { supplier_ledger_due?: number } | null)?.supplier_ledger_due ?? 0);
    const ap_account_due = Number((row as { ap_account_due?: number } | null)?.ap_account_due ?? 0);
    return {
      supplier_ledger_due,
      ap_account_due,
      variance: supplier_ledger_due - ap_account_due,
      reconciled: Math.abs(supplier_ledger_due - ap_account_due) < 0.01,
    };
  });

// Backfill ledger for this tenant
export const backfillSupplierLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("backfill_supplier_ledger", {
      _tenant_id: data.tenantId,
    });
    if (error) throw new Error(error.message);
    return result as { opening: number; purchase: number; payment: number; return: number };
  });

// Backfill journal entries (purchases / payments / openings) — idempotent
export const backfillSupplierJournals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    // Ensure ledger is up-to-date first
    await context.supabase.rpc("backfill_supplier_ledger", { _tenant_id: data.tenantId });
    const { data: result, error } = await context.supabase.rpc("backfill_supplier_journals", {
      _tenant_id: data.tenantId,
    });
    if (error) throw new Error(error.message);
    return result as { opening: number; purchase: number; payment: number };
  });

// Get supplier info + ledger rows for the statement page
export const getSupplierProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator(TenantInput.extend({ supplierId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: supplier } = await context.supabase
      .from("suppliers")
      .select("id,name,phone,email,address,opening_balance,due_balance,vat_no,bin_no")
      .eq("tenant_id", data.tenantId)
      .eq("id", data.supplierId)
      .maybeSingle();
    if (!supplier) throw new Error("Supplier not found");

    const { data: rows } = await context.supabase
      .from("v_supplier_ledger")
      .select("entry_date,entry_type,debit,credit,ref_table,ref_no,notes,running_balance")
      .eq("tenant_id", data.tenantId)
      .eq("party_id", data.supplierId)
      .order("entry_date", { ascending: true });

    return { supplier, ledger: rows ?? [] };
  });

// Aging report — bucket open supplier dues by age of oldest unpaid purchase
export const supplierAgingReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    // Pull all supplier ledger rows; compute oldest unpaid purchase age & bucket the running due
    const { data: suppliers } = await context.supabase
      .from("suppliers")
      .select("id,name,due_balance")
      .eq("tenant_id", data.tenantId)
      .eq("is_active", true);

    const { data: ledger } = await context.supabase
      .from("party_ledger")
      .select("party_id,entry_date,debit,credit,entry_type")
      .eq("tenant_id", data.tenantId)
      .eq("party_type", "supplier")
      .order("entry_date", { ascending: true });

    const today = new Date();
    const ageDays = (iso: string) =>
      Math.floor((today.getTime() - new Date(iso).getTime()) / 86400000);

    type Row = {
      supplier_id: string;
      supplier_name: string;
      current: number; d_1_30: number; d_31_60: number; d_61_90: number; d_90_plus: number;
      total_due: number; overdue: number;
    };
    const out: Row[] = [];
    const map = new Map((suppliers ?? []).map((s) => [s.id, s]));

    // Group ledger by supplier
    const bySup = new Map<string, { entry_date: string; net: number }[]>();
    for (const l of ledger ?? []) {
      if (!bySup.has(l.party_id)) bySup.set(l.party_id, []);
      bySup.get(l.party_id)!.push({
        entry_date: l.entry_date,
        net: Number(l.credit ?? 0) - Number(l.debit ?? 0),
      });
    }

    for (const [supId, entries] of bySup.entries()) {
      const sup = map.get(supId);
      if (!sup) continue;
      const buckets = { current: 0, d_1_30: 0, d_31_60: 0, d_61_90: 0, d_90_plus: 0 };
      // FIFO: payments offset oldest purchases
      const queue: { entry_date: string; remaining: number }[] = [];
      let payments = 0;
      for (const e of entries) {
        if (e.net > 0) queue.push({ entry_date: e.entry_date, remaining: e.net });
        else payments += -e.net;
      }
      // apply payments
      for (const item of queue) {
        if (payments <= 0) break;
        const take = Math.min(payments, item.remaining);
        item.remaining -= take; payments -= take;
      }
      for (const item of queue) {
        if (item.remaining <= 0) continue;
        const age = ageDays(item.entry_date);
        if (age <= 0) buckets.current += item.remaining;
        else if (age <= 30) buckets.d_1_30 += item.remaining;
        else if (age <= 60) buckets.d_31_60 += item.remaining;
        else if (age <= 90) buckets.d_61_90 += item.remaining;
        else buckets.d_90_plus += item.remaining;
      }
      const total_due = buckets.current + buckets.d_1_30 + buckets.d_31_60 + buckets.d_61_90 + buckets.d_90_plus;
      const overdue = buckets.d_1_30 + buckets.d_31_60 + buckets.d_61_90 + buckets.d_90_plus;
      if (total_due > 0.01) {
        out.push({
          supplier_id: supId, supplier_name: sup.name,
          ...buckets, total_due, overdue,
        });
      }
    }
    out.sort((a, b) => b.total_due - a.total_due);
    return out;
  });

