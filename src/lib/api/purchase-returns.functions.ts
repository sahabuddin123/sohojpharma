import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { loadBusinessRules } from "@/lib/api/business-rules.functions";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const T = z.object({ tenantId: z.string().uuid() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nextReturnNo(supabase: any, tenantId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_next_number", {
    _tenant_id: tenantId, _doc_type: "purchase_return",
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function approvalRequired(supabase: any, tenantId: string): Promise<boolean> {
  const rules = await loadBusinessRules(supabase, tenantId);
  return rules.require_purchase_return_approval;
}

// ── KPIs ─────────────────────────────────────────────────────
export const purchaseReturnKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T)
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const [day, month, count, qty, pending] = await Promise.all([
      s.from("purchase_returns").select("total_value").eq("tenant_id", data.tenantId).eq("status", "approved").gte("return_date", dayStart),
      s.from("purchase_returns").select("total_value").eq("tenant_id", data.tenantId).eq("status", "approved").gte("return_date", monthStart),
      s.from("purchase_returns").select("id", { count: "exact", head: true }).eq("tenant_id", data.tenantId).eq("status", "approved"),
      s.from("purchase_return_items").select("qty").eq("tenant_id", data.tenantId).gte("created_at", monthStart),
      s.from("purchase_returns").select("id", { count: "exact", head: true }).eq("tenant_id", data.tenantId).in("status", ["draft", "submitted"]),
    ]);
    const sum = (rows: Array<{ total_value?: number | string | null }> | null) =>
      (rows ?? []).reduce((a, r) => a + Number(r.total_value ?? 0), 0);
    const sumQty = (rows: Array<{ qty?: number | string | null }> | null) =>
      (rows ?? []).reduce((a, r) => a + Number(r.qty ?? 0), 0);
    return {
      today: sum(day.data),
      month: sum(month.data),
      totalCount: count.count ?? 0,
      qtyMonth: sumQty(qty.data),
      pendingCount: pending.count ?? 0,
    };
  });

// ── List ─────────────────────────────────────────────────────
export const listPurchaseReturns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({
    limit: z.number().int().positive().max(500).optional(),
    status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("purchase_returns")
      .select("id,return_no,return_date,reason,total_value,status,supplier_id,suppliers(name,phone)")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── Pending returns (for approval dashboard) ─────────────────
export const listPendingPurchaseReturns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("purchase_returns")
      .select("id,return_no,return_date,reason,total_value,status,supplier_id,submitted_at,suppliers(name)")
      .eq("tenant_id", data.tenantId)
      .in("status", ["draft", "submitted"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── Get a single purchase return (detail/PDF) ────────────────
export const getPurchaseReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const { data: header, error: hErr } = await s
      .from("purchase_returns")
      .select(`
        id, return_no, return_date, reason, notes, total_value, status,
        grn_id, supplier_id,
        submitted_at, submitted_by, approved_at, approved_by,
        rejected_at, rejected_by, rejection_reason, created_at, created_by,
        suppliers(name, phone, address)
      `)
      .eq("tenant_id", data.tenantId)
      .eq("id", data.id)
      .single();
    if (hErr || !header) throw new Error("Purchase return not found");

    const { data: items } = await s
      .from("purchase_return_items")
      .select(`
        id, qty, unit_cost, line_total, reason, batch_id, product_id,
        products(name, sku, strength, medicine_type, volume, pack_size),
        batches(batch_no, expiry_date)
      `)
      .eq("return_id", data.id)
      .eq("tenant_id", data.tenantId);

    // Resolve preparer / approver display names
    const userIds = [header.created_by, header.approved_by, header.rejected_by, header.submitted_by].filter(Boolean) as string[];
    const profiles = userIds.length
      ? (await s.from("profiles").select("id, full_name").in("id", userIds)).data ?? []
      : [];
    const profMap = new Map(profiles.map((p) => [p.id, p.full_name || ""]));

    return {
      header,
      items: items ?? [],
      preparedBy: header.created_by ? (profMap.get(header.created_by) ?? "") : "",
      approvedBy: header.approved_by ? (profMap.get(header.approved_by) ?? "") : "",
    };
  });

// ── Returnable lines for a PO ────────────────────────────────
export const getReturnableLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({ poId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const { data: po, error: poErr } = await s
      .from("purchase_orders")
      .select("id,po_number,supplier_id,status,order_date,received_at,suppliers(name,phone,due_balance)")
      .eq("id", data.poId)
      .eq("tenant_id", data.tenantId)
      .single();
    if (poErr || !po) throw new Error("Purchase order not found");

    const { data: items } = await s
      .from("purchase_order_items")
      .select("id,product_id,qty_received,unit_cost,products(name,sku,barcode,strength,medicine_type,volume,pack_size,manufacturers(name),generics(name))")
      .eq("purchase_order_id", data.poId);

    const productIds = Array.from(new Set((items ?? []).map((i) => i.product_id)));
    if (!productIds.length) return { po, lines: [] };

    const { data: batches } = await s
      .from("batches")
      .select("id,product_id,batch_no,expiry_date,purchase_price,qty_on_hand")
      .eq("tenant_id", data.tenantId)
      .in("product_id", productIds);

    const batchIds = (batches ?? []).map((b) => b.id);

    const { data: recalls } = batchIds.length
      ? await s
          .from("batch_recalls")
          .select("batch_id")
          .eq("tenant_id", data.tenantId)
          .eq("status", "open")
          .in("batch_id", batchIds)
      : { data: [] };
    const recalled = new Set((recalls ?? []).map((r) => (r as { batch_id: string }).batch_id));

    const { data: priors } = batchIds.length
      ? await s
          .from("purchase_return_items")
          .select("batch_id,qty")
          .eq("tenant_id", data.tenantId)
          .in("batch_id", batchIds)
      : { data: [] };
    const returnedByBatch = new Map<string, number>();
    for (const r of priors ?? []) {
      const k = (r as { batch_id: string | null }).batch_id;
      if (k) returnedByBatch.set(k, (returnedByBatch.get(k) ?? 0) + Number((r as { qty: number | string }).qty ?? 0));
    }

    const itemByProduct = new Map((items ?? []).map((i) => [i.product_id, i]));
    const lines = (batches ?? []).map((b) => {
      const it = itemByProduct.get(b.product_id);
      const returned = returnedByBatch.get(b.id) ?? 0;
      return {
        batch_id: b.id,
        product_id: b.product_id,
        item_id: it?.id ?? null,
        product: it?.products ?? null,
        batch_no: b.batch_no,
        expiry_date: b.expiry_date,
        is_recalled: recalled.has(b.id),
        unit_cost: Number(it?.unit_cost ?? b.purchase_price ?? 0),
        qty_on_hand: Number(b.qty_on_hand ?? 0),
        qty_returned: returned,
        qty_available: Math.max(0, Number(b.qty_on_hand ?? 0)),
      };
    });

    return { po, lines };
  });

// ── Create purchase return (status depends on approval setting) ──
export const createPurchaseReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(
    T.extend({
      branch_id: z.string().uuid().optional(),
      supplierId: z.string().uuid(),
      poId: z.string().uuid().optional(),
      grnId: z.string().uuid().optional(),
      returnDate: z.string().optional(),
      reason: z.string().trim().max(200).optional(),
      notes: z.string().trim().max(1000).optional(),
      allowExpired: z.boolean().optional().default(false),
      lines: z.array(z.object({
        batch_id: z.string().uuid(),
        product_id: z.string().uuid(),
        qty: z.number().positive(),
        unit_cost: z.number().nonnegative(),
        reason: z.string().max(200).optional(),
      })).min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    void claims;
    if (data.branch_id) await assertBranchWrite(supabase, data.tenantId, data.branch_id);

    // Validate lines
    const seen = new Set<string>();
    const today = new Date().toISOString().slice(0, 10);
    for (const ln of data.lines) {
      if (seen.has(ln.batch_id)) throw new Error("Duplicate batch rows not allowed");
      seen.add(ln.batch_id);
      if (ln.qty <= 0) throw new Error("Quantity must be positive");
    }
    const batchIds = data.lines.map((l) => l.batch_id);
    const { data: batches, error: bErr } = await supabase
      .from("batches")
      .select("id,product_id,qty_on_hand,purchase_price,expiry_date")
      .eq("tenant_id", data.tenantId)
      .in("id", batchIds);
    if (bErr) throw new Error(bErr.message);
    const { data: openRecalls } = await supabase
      .from("batch_recalls")
      .select("batch_id")
      .eq("tenant_id", data.tenantId)
      .eq("status", "open")
      .in("batch_id", batchIds);
    const recalledSet = new Set((openRecalls ?? []).map((r) => (r as { batch_id: string }).batch_id));
    const byId = new Map((batches ?? []).map((b) => [b.id, b]));
    for (const ln of data.lines) {
      const b = byId.get(ln.batch_id);
      if (!b) throw new Error("Batch not found in this tenant");
      if (recalledSet.has(b.id)) throw new Error(`Batch is recalled — cannot return`);
      if (!data.allowExpired && b.expiry_date && b.expiry_date < today) {
        throw new Error(`Batch is expired — enable "allow expired" to override`);
      }
      if (ln.qty > Number(b.qty_on_hand)) {
        throw new Error("Return quantity exceeds available stock.");
      }
    }

    const totalValue = data.lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
    const returnNo = await nextReturnNo(supabase, data.tenantId);
    const needsApproval = await approvalRequired(supabase as never, data.tenantId);
    const initialStatus = needsApproval ? "submitted" : "approved";
    const nowIso = new Date().toISOString();

    // 1) Insert header
    const { data: pr, error: prErr } = await supabase
      .from("purchase_returns")
      .insert({
        tenant_id: data.tenantId,
        branch_id: data.branch_id!,
        return_no: returnNo,
        supplier_id: data.supplierId,
        grn_id: data.grnId ?? null,
        return_date: data.returnDate ?? today,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        total_value: totalValue,
        created_by: userId,
        status: initialStatus,
        submitted_at: needsApproval ? nowIso : null,
        submitted_by: needsApproval ? userId : null,
        approved_at: needsApproval ? null : nowIso,
        approved_by: needsApproval ? null : userId,
      } as never)
      .select("id")
      .single();
    if (prErr || !pr) throw new Error(prErr?.message ?? "Failed to create return");

    // 2) Insert line items
    const itemRows = data.lines.map((l) => ({
      tenant_id: data.tenantId,
      branch_id: data.branch_id!,
      return_id: pr.id,
      product_id: l.product_id,
      batch_id: l.batch_id,
      qty: l.qty,
      unit_cost: l.unit_cost,
      line_total: l.qty * l.unit_cost,
      reason: l.reason ?? null,
    }));
    const { error: itErr } = await supabase.from("purchase_return_items").insert(itemRows);
    if (itErr) throw new Error(itErr.message);

    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId, branch_id: data.branch_id!, user_id: userId,
      action: needsApproval ? "purchase_return.submitted" : "purchase_return.created",
      entity_table: "purchase_returns", entity_id: pr.id,
      after_data: { return_no: returnNo, total_value: totalValue, lines: data.lines.length, status: initialStatus, supplier_id: data.supplierId, po_id: data.poId ?? null },
    });

    // 3) If auto-approve, do stock/ledger/journal in-line (preserve current behavior)
    if (!needsApproval) {
      for (const ln of data.lines) {
        const b = byId.get(ln.batch_id)!;
        const newQty = Number(b.qty_on_hand) - ln.qty;
        await supabase.from("batches").update({ qty_on_hand: newQty }).eq("id", b.id).eq("tenant_id", data.tenantId);
        await supabase.from("stock_movements").insert({
          tenant_id: data.tenantId,
          product_id: b.product_id,
          batch_id: b.id,
          movement_type: "purchase_return",
          qty_change: -ln.qty,
          qty_after: newQty,
          reference_table: "purchase_returns",
          reference_id: pr.id,
          reference_no: returnNo,
          user_id: userId,
          notes: ln.reason ?? data.reason ?? null,
        } as never);
      }

      if (totalValue > 0) {
        const rules = await loadBusinessRules(supabase, data.tenantId);
        if (rules.enable_supplier_ledger) {
          await supabase.rpc("post_supplier_ledger_idempotent", {
            _tenant_id: data.tenantId,
            _supplier_id: data.supplierId,
            _entry_type: "purchase_return",
            _debit: totalValue,
            _credit: 0,
            _ref_table: "purchase_returns",
            _ref_id: pr.id,
            _ref_no: returnNo,
            _notes: data.reason ?? `Purchase return ${returnNo}`,
          } as never);

          const { data: sup } = await supabase
            .from("suppliers").select("due_balance").eq("id", data.supplierId).eq("tenant_id", data.tenantId).maybeSingle();
          if (sup) {
            await supabase.from("suppliers")
              .update({ due_balance: Number(sup.due_balance ?? 0) - totalValue })
              .eq("id", data.supplierId).eq("tenant_id", data.tenantId);
          }
        } else {
          await supabase.from("audit_log").insert({
            tenant_id: data.tenantId, user_id: userId,
            action: "supplier_ledger.skipped_by_rule",
            entity_table: "purchase_returns", entity_id: pr.id,
            after_data: { reason: "enable_supplier_ledger=false", total: totalValue },
          });
        }

        if (rules.enable_journal_posting) {
          await supabase.rpc("post_purchase_return_journal", {
            _tenant_id: data.tenantId,
            _return_id: pr.id,
          } as never);
        } else {
          await supabase.from("audit_log").insert({
            tenant_id: data.tenantId, user_id: userId,
            action: "journal.skipped_by_rule",
            entity_table: "purchase_returns", entity_id: pr.id,
            after_data: { reason: "enable_journal_posting=false", source: "purchase_return" },
          });
        }
      }

      if (!needsApproval) {
        await supabase.from("audit_log").insert({
          tenant_id: data.tenantId, user_id: userId,
          action: "purchase_return.auto_approved",
          entity_table: "purchase_returns", entity_id: pr.id,
          after_data: { reason: "require_purchase_return_approval=false", return_no: returnNo },
        });
      }
    }

    return { ok: true, id: pr.id, returnNo, totalValue, status: initialStatus, needsApproval };
  });

// ── Approve ──────────────────────────────────────────────────
export const approvePurchaseReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({ id: z.string().uuid(), branch_id: z.string().uuid().optional() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.branch_id) await assertBranchWrite(supabase, data.tenantId, data.branch_id);
    const { data: res, error } = await supabase.rpc("approve_purchase_return", {
      _tenant_id: data.tenantId,
      _return_id: data.id,
    } as never);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId, branch_id: data.branch_id!, user_id: userId,
      action: "purchase_return.approved",
      entity_table: "purchase_returns", entity_id: data.id,
      after_data: (res as never) ?? {},
    });
    return { ok: true };
  });

// ── Reject ───────────────────────────────────────────────────
export const rejectPurchaseReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({ id: z.string().uuid(), branch_id: z.string().uuid().optional(), reason: z.string().trim().min(1).max(200) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.branch_id) await assertBranchWrite(supabase, data.tenantId, data.branch_id);
    const { error } = await supabase.rpc("reject_purchase_return", {
      _tenant_id: data.tenantId,
      _return_id: data.id,
      _reason: data.reason,
    } as never);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({
      tenant_id: data.tenantId, branch_id: data.branch_id!, user_id: userId,
      action: "purchase_return.rejected",
      entity_table: "purchase_returns", entity_id: data.id,
      after_data: { reason: data.reason },
    });
    return { ok: true };
  });

// ── Report data ──────────────────────────────────────────────
export const purchaseReturnReportData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator(T.extend({
    from: z.string().optional(),
    to: z.string().optional(),
    supplierId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    batchId: z.string().uuid().optional(),
  }))
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10);
    const from = data.from ?? defaultFrom;
    const to = data.to ?? now.toISOString().slice(0, 10);

    // Headers (approved only contribute to value)
    let hq = s.from("purchase_returns")
      .select("id,return_no,return_date,total_value,status,supplier_id,suppliers(name)")
      .eq("tenant_id", data.tenantId)
      .eq("status", "approved")
      .gte("return_date", from).lte("return_date", to)
      .order("return_date", { ascending: false })
      .limit(1000);
    if (data.supplierId) hq = hq.eq("supplier_id", data.supplierId);
    const { data: headers = [], error: hErr } = await hq;
    if (hErr) throw new Error(hErr.message);

    const headerIds = (headers ?? []).map((h) => h.id);

    let iq = s.from("purchase_return_items")
      .select("return_id,product_id,batch_id,qty,unit_cost,line_total,products(name,sku,strength,medicine_type,volume),batches(batch_no)")
      .eq("tenant_id", data.tenantId);
    if (headerIds.length) iq = iq.in("return_id", headerIds);
    if (data.productId) iq = iq.eq("product_id", data.productId);
    if (data.batchId) iq = iq.eq("batch_id", data.batchId);
    const { data: items = [] } = headerIds.length ? await iq : { data: [] };

    // KPIs
    const dayStart = now.toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const totalValue = (headers ?? []).reduce((a, r) => a + Number(r.total_value ?? 0), 0);
    const todayValue = (headers ?? []).filter((r) => r.return_date >= dayStart).reduce((a, r) => a + Number(r.total_value ?? 0), 0);
    const monthValue = (headers ?? []).filter((r) => r.return_date >= monthStart).reduce((a, r) => a + Number(r.total_value ?? 0), 0);
    const totalQty = (items ?? []).reduce((a, r) => a + Number((r as { qty: number | string }).qty ?? 0), 0);

    // Trend by day
    const trendMap = new Map<string, number>();
    for (const h of headers ?? []) {
      trendMap.set(h.return_date, (trendMap.get(h.return_date) ?? 0) + Number(h.total_value ?? 0));
    }
    const trend = Array.from(trendMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));

    // Top products (by value)
    const prodMap = new Map<string, { name: string; qty: number; value: number }>();
    for (const it of items ?? []) {
      const i = it as { product_id: string; qty: number | string; line_total: number | string; products?: { name?: string } | null };
      const key = i.product_id;
      const cur = prodMap.get(key) ?? { name: i.products?.name ?? "—", qty: 0, value: 0 };
      cur.qty += Number(i.qty ?? 0);
      cur.value += Number(i.line_total ?? 0);
      prodMap.set(key, cur);
    }
    const topProducts = Array.from(prodMap.values()).sort((a, b) => b.value - a.value).slice(0, 5);

    // Top suppliers
    const supMap = new Map<string, { name: string; value: number; count: number }>();
    for (const h of headers ?? []) {
      const key = h.supplier_id ?? "—";
      const name = (h as { suppliers?: { name?: string } | null }).suppliers?.name ?? "—";
      const cur = supMap.get(key) ?? { name, value: 0, count: 0 };
      cur.value += Number(h.total_value ?? 0);
      cur.count += 1;
      supMap.set(key, cur);
    }
    const topSuppliers = Array.from(supMap.values()).sort((a, b) => b.value - a.value).slice(0, 5);

    return {
      from, to,
      kpis: { todayValue, monthValue, totalValue, totalQty, count: (headers ?? []).length },
      trend,
      topProducts,
      topSuppliers,
      headers: headers ?? [],
      items: items ?? [],
    };
  });
