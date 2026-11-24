// Idempotent server handlers for offline-queued operations.
// Conflict resolution: client_op_id is UNIQUE on sales/purchases.
// If a row already exists for that id we treat the op as already-applied (server wins).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const SaleItemSchema = z.object({
  product_id: z.string().uuid(),
  batch_id: z.string().uuid().nullable().optional(),
  qty: z.number(),
  unit_price: z.number(),
  unit_cost: z.number().optional().default(0),
  discount: z.number().optional().default(0),
  vat: z.number().optional().default(0),
  line_total: z.number(),
});

const SaleSchema = z.object({
  client_op_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  invoice_no: z.string().optional(),
  subtotal: z.number(),
  discount: z.number().optional().default(0),
  vat: z.number().optional().default(0),
  total: z.number(),
  paid: z.number().optional().default(0),
  due: z.number().optional().default(0),
  payment_method: z.string().optional(),
  notes: z.string().optional(),
  client_ts: z.number(),
  items: z.array(SaleItemSchema),
});

export const syncSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((data: unknown) => SaleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("sales")
      .select("id")
      .eq("client_op_id", data.client_op_id)
      .maybeSingle();
    if (existing) return { ok: true as const, sale_id: existing.id, duplicate: true };

    let invoiceNo = data.invoice_no;
    if (!invoiceNo) {
      const { data: n, error: nErr } = await supabase.rpc("generate_next_number", {
        _tenant_id: data.tenant_id, _doc_type: "invoice",
      });
      if (nErr) throw new Error(nErr.message);
      invoiceNo = n as string;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("sales")
      .insert({
        client_op_id: data.client_op_id,
        tenant_id: data.tenant_id,
        branch_id: data.branch_id,
        customer_id: data.customer_id ?? null,
        invoice_no: invoiceNo,
        subtotal: data.subtotal,
        discount: data.discount ?? 0,
        vat: data.vat ?? 0,
        total: data.total,
        paid: data.paid ?? 0,
        due: data.due ?? 0,
        payment_method: data.payment_method ?? "cash",
        notes: data.notes ?? null,
        cashier_id: userId,
        sale_date: new Date(data.client_ts).toISOString(),
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "sale insert failed");

    if (data.items.length > 0) {
      const rows = data.items.map((it) => ({
        sale_id: inserted.id,
        tenant_id: data.tenant_id,
        branch_id: data.branch_id,
        product_id: it.product_id,
        batch_id: it.batch_id ?? null,
        qty: it.qty,
        unit_price: it.unit_price,
        unit_cost: it.unit_cost ?? 0,
        discount: it.discount ?? 0,
        vat: it.vat ?? 0,
        line_total: it.line_total,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(rows);
      if (itemsErr) throw new Error(itemsErr.message);
    }

    return { ok: true as const, sale_id: inserted.id, duplicate: false };
  });

const PurchaseItemSchema = z.object({
  product_id: z.string().uuid(),
  batch_id: z.string().uuid().nullable().optional(),
  qty: z.number(),
  unit_cost: z.number(),
  discount: z.number().optional().default(0),
  vat: z.number().optional().default(0),
  line_total: z.number(),
});

const PurchaseSchema = z.object({
  client_op_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  supplier_id: z.string().uuid().nullable().optional(),
  invoice_no: z.string().optional(),
  subtotal: z.number(),
  discount: z.number().optional().default(0),
  vat: z.number().optional().default(0),
  total: z.number(),
  paid: z.number().optional().default(0),
  due: z.number().optional().default(0),
  notes: z.string().optional(),
  client_ts: z.number(),
  items: z.array(PurchaseItemSchema),
});

export const syncPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((data: unknown) => PurchaseSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("purchases")
      .select("id")
      .eq("client_op_id", data.client_op_id)
      .maybeSingle();
    if (existing) return { ok: true as const, purchase_id: existing.id, duplicate: true };

    let invoiceNo = data.invoice_no;
    if (!invoiceNo) {
      const { data: n, error: nErr } = await supabase.rpc("generate_next_number", {
        _tenant_id: data.tenant_id, _doc_type: "purchase_order",
      });
      if (nErr) throw new Error(nErr.message);
      invoiceNo = n as string;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("purchases")
      .insert({
        client_op_id: data.client_op_id,
        tenant_id: data.tenant_id,
        branch_id: data.branch_id,
        supplier_id: data.supplier_id ?? null,
        invoice_no: invoiceNo,
        subtotal: data.subtotal,
        discount: data.discount ?? 0,
        vat: data.vat ?? 0,
        total: data.total,
        paid: data.paid ?? 0,
        due: data.due ?? 0,
        notes: data.notes ?? null,
        received_by: userId,
        purchase_date: new Date(data.client_ts).toISOString(),
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "purchase insert failed");

    if (data.items.length > 0) {
      const rows = data.items.map((it) => ({
        purchase_id: inserted.id,
        tenant_id: data.tenant_id,
        branch_id: data.branch_id,
        product_id: it.product_id,
        batch_id: it.batch_id ?? null,
        qty: it.qty,
        unit_cost: it.unit_cost,
        discount: it.discount ?? 0,
        vat: it.vat ?? 0,
        line_total: it.line_total,
      }));
      const { error: itemsErr } = await supabase.from("purchase_items").insert(rows);
      if (itemsErr) throw new Error(itemsErr.message);
    }
    return { ok: true as const, purchase_id: inserted.id, duplicate: false };
  });

const CollectionSchema = z.object({
  client_op_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  amount: z.number(),
  method: z.string().optional(),
  notes: z.string().optional(),
  client_ts: z.number(),
});

// Collection = a customer due payment. Recorded in audit_log (no dedicated
// collections table yet) and reduces customer due_balance.
export const syncCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((data: unknown) => CollectionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Idempotency via audit_log entity_id == client_op_id
    const { data: existing } = await supabase
      .from("audit_log")
      .select("id")
      .eq("entity_table", "collection")
      .eq("entity_id", data.client_op_id)
      .maybeSingle();
    if (existing) return { ok: true as const, duplicate: true };

    const { data: cust } = await supabase
      .from("customers")
      .select("id, due_balance")
      .eq("id", data.customer_id)
      .single();
    const currentDue = Number(cust?.due_balance ?? 0);
    const newDue = Math.max(0, currentDue - data.amount);

    const { error: updErr } = await supabase
      .from("customers")
      .update({ due_balance: newDue })
      .eq("id", data.customer_id);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("audit_log").insert({
      tenant_id: data.tenant_id,
      user_id: userId,
      action: "collection.create",
      entity_table: "collection",
      entity_id: data.client_op_id,
      after_data: {
        amount: data.amount,
        method: data.method ?? "cash",
        notes: data.notes ?? null,
        client_ts: data.client_ts,
      },
    });

    return { ok: true as const, duplicate: false };
  });
