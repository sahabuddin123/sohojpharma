import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const TenantInput = z.object({ tenantId: z.string().uuid() });

function rfqNumber() {
  const d = new Date();
  return `RFQ-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export const listQuotations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("quotations")
      .select("id,rfq_number,title,status,request_date,valid_until,selected_supplier_id,suppliers:selected_supplier_id(name)")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: q, error } = await context.supabase
      .from("quotations").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { data: items } = await context.supabase
      .from("quotation_items")
      .select("*, products(name,sku), suppliers(name)")
      .eq("quotation_id", data.id);
    return { quotation: q, items: items ?? [] };
  });

const QItem = z.object({
  product_id: z.string().uuid(),
  supplier_id: z.string().uuid().nullable().optional(),
  qty: z.number().positive(),
  unit_price: z.number().nonnegative(),
  delivery_days: z.number().int().nonnegative().optional(),
  available_qty: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const createQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(
    TenantInput.extend({
      branch_id: z.string().uuid().optional(),
      title: z.string().optional(),
      valid_until: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(QItem).min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenantId, data.branch_id);
    const { data: quot, error } = await context.supabase
      .from("quotations")
      .insert({
        tenant_id: data.tenantId,
        branch_id: data.branch_id!,
        rfq_number: rfqNumber(),
        title: data.title ?? null,
        valid_until: data.valid_until ?? null,
        notes: data.notes ?? null,
        status: "open",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !quot) throw new Error(error?.message ?? "quotation insert failed");

    const rows = data.items.map((it) => ({
      tenant_id: data.tenantId,
      branch_id: data.branch_id!,
      quotation_id: quot.id,
      supplier_id: it.supplier_id ?? null,
      product_id: it.product_id,
      qty: it.qty,
      unit_price: it.unit_price,
      delivery_days: it.delivery_days ?? null,
      available_qty: it.available_qty ?? null,
      notes: it.notes ?? null,
    }));
    const { error: itErr } = await context.supabase.from("quotation_items").insert(rows);
    if (itErr) throw new Error(itErr.message);

    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId, branch_id: data.branch_id!, user_id: context.userId,
      action: "quotation.create", entity_table: "quotations", entity_id: quot.id,
    });
    return { id: quot.id };
  });

// Comparison: returns items grouped by product with best-of flags
export const compareQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: items } = await context.supabase
      .from("quotation_items")
      .select("id,product_id,supplier_id,qty,unit_price,delivery_days,available_qty, products(name,sku), suppliers(name)")
      .eq("quotation_id", data.id);

    type QItemRow = NonNullable<typeof items>[number];
    type ProductRef = { name: string; sku: string } | null;
    const groups: Record<string, { product: ProductRef; rows: QItemRow[] }> = {};
    (items ?? []).forEach((it) => {
      const k = it.product_id as string;
      if (!groups[k]) groups[k] = { product: (it.products as ProductRef) ?? null, rows: [] };
      groups[k].rows.push(it);
    });

    const result = Object.entries(groups).map(([product_id, g]) => {
      const rows = g.rows;
      const minPrice = Math.min(...rows.map((r) => Number(r.unit_price)));
      const fastest = Math.min(...rows.map((r) => Number(r.delivery_days ?? Infinity)));
      return {
        product_id,
        product: g.product,
        rows: rows.map((r) => ({
          ...r,
          is_best_price: Number(r.unit_price) === minPrice,
          is_fastest: Number(r.delivery_days ?? Infinity) === fastest,
        })),
      };
    });
    return result;
  });

export const selectQuotationSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({ id: z.string().uuid(), supplier_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quotations")
      .update({ selected_supplier_id: data.supplier_id, status: "selected" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Generate PO from a selected supplier's quotation lines
export const poFromQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    quotation_id: z.string().uuid(),
    supplier_id: z.string().uuid(),
    branch_id: z.string().uuid().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { data: q } = await context.supabase
      .from("quotations").select("tenant_id, branch_id").eq("id", data.quotation_id).single();
    if (!q) throw new Error("Quotation not found");
    const branchId = (data.branch_id ?? (q.branch_id as string | null)) as string | null;
    if (!branchId) throw new Error("branch_required");
    if (data.branch_id) await assertBranchWrite(context.supabase, q.tenant_id, data.branch_id);
    const { data: items } = await context.supabase
      .from("quotation_items")
      .select("product_id,qty,unit_price")
      .eq("quotation_id", data.quotation_id)
      .eq("supplier_id", data.supplier_id);
    if (!items || items.length === 0) throw new Error("No quoted items for this supplier");

    const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.unit_price), 0);
    const { data: poNo, error: poNoErr } = await context.supabase.rpc("generate_next_number", {
      _tenant_id: q.tenant_id, _doc_type: "purchase_order",
    });
    if (poNoErr) throw new Error(poNoErr.message);
    const poNumber = poNo as string;
    const { data: po, error } = await context.supabase
      .from("purchase_orders")
      .insert({
        tenant_id: q.tenant_id,
        branch_id: branchId,
        po_number: poNumber,
        supplier_id: data.supplier_id,
        status: "draft",
        subtotal, total: subtotal,
        source_quotation_id: data.quotation_id,
        created_by: context.userId,
      })
      .select("id").single();
    if (error || !po) throw new Error(error?.message ?? "PO insert failed");

    await context.supabase.from("purchase_order_items").insert(items.map((it) => ({
      tenant_id: q.tenant_id,
      branch_id: branchId,
      purchase_order_id: po.id,
      product_id: it.product_id,
      qty_ordered: it.qty,
      qty_received: 0,
      unit_cost: it.unit_price,
      line_total: Number(it.qty) * Number(it.unit_price),
    })));
    return { po_id: po.id };
  });

// Supplier performance score (1–5) based on PO delivery + return rate + volume
export const supplierScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: suppliers } = await context.supabase
      .from("suppliers")
      .select("id,name")
      .eq("tenant_id", data.tenantId);

    const { data: pos } = await context.supabase
      .from("purchase_orders")
      .select("supplier_id,status,order_date,received_at,expected_delivery_date,total")
      .eq("tenant_id", data.tenantId);

    const out = (suppliers ?? []).map((s) => {
      const sPos = (pos ?? []).filter((p) => p.supplier_id === s.id);
      const completed = sPos.filter((p) => p.status === "received" && p.received_at);
      const onTime = completed.filter((p) =>
        !p.expected_delivery_date ||
        new Date(p.received_at as string) <= new Date(p.expected_delivery_date as string),
      ).length;
      const onTimePct = completed.length ? onTime / completed.length : 0;
      const volume = sPos.reduce((sum, p) => sum + Number(p.total ?? 0), 0);
      const volumeFactor = Math.min(1, volume / 100_000); // 1.0 at >= 100k
      const score = Math.max(1, Math.round((onTimePct * 0.6 + volumeFactor * 0.4) * 5));
      return {
        supplier_id: s.id, name: s.name,
        po_count: sPos.length, completed: completed.length,
        on_time_pct: Math.round(onTimePct * 100),
        volume, score,
      };
    });
    return out.sort((a, b) => b.score - a.score);
  });
