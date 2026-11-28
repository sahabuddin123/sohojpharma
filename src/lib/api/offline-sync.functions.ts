// Idempotent server handlers for offline-queued operations & background snapshot sync.
// Conflict resolution: client_op_id is UNIQUE on sales/purchase_orders/customer_payments.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { loadBusinessRules } from "@/lib/api/business-rules.functions";
import { resolvePackConfig } from "@/lib/medicine-units";
import { buildProductDisplayName } from "@/lib/product-display";

async function resolveDefaultBranchId(supabase: any, tenantId: string, preferred?: string | null): Promise<string> {
  if (preferred) return preferred;
  const { data: branches } = await supabase
    .from("branches")
    .select("id, branch_role, is_main")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .limit(10);
  const list = (branches ?? []) as Array<{ id: string; branch_role?: string; is_main?: boolean }>;
  const pick =
    list.find((b) => b.branch_role === "head_office") ??
    list.find((b) => b.is_main) ??
    list[0];
  if (!pick?.id) throw new Error("No active branch found for tenant");
  return pick.id;
}

async function resolveDefaultWarehouse(
  supabase: any,
  tenantId: string,
  preferredWarehouseId?: string | null,
): Promise<{ id: string; branch_id: string | null }> {
  if (preferredWarehouseId) {
    const { data } = await supabase
      .from("warehouses")
      .select("id, branch_id")
      .eq("id", preferredWarehouseId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data?.id) return data as { id: string; branch_id: string | null };
  }
  const { data: list } = await supabase
    .from("warehouses")
    .select("id, branch_id, is_default")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .limit(5);
  const pick = (list ?? [])[0] as { id: string; branch_id: string | null } | undefined;
  if (!pick?.id) throw new Error("No warehouse configured for tenant");
  return pick;
}

async function findOpenRegisterId(
  supabase: any,
  tenantId: string,
  userId: string,
  preferredRegisterId?: string | null,
): Promise<string | null> {
  if (preferredRegisterId) {
    const { data } = await supabase
      .from("cash_registers")
      .select("id, status")
      .eq("id", preferredRegisterId)
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data: ownOpen } = await supabase
    .from("cash_registers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ownOpen?.id) return ownOpen.id as string;

  const { data: anyOpen } = await supabase
    .from("cash_registers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (anyOpen?.id as string | undefined) ?? null;
}

const SaleItemSchema = z.object({
  product_id: z.string().uuid(),
  batch_id: z.string().uuid().nullable().optional(),
  qty: z.number().positive(),
  unit_price: z.number().nonnegative(),
  unit_cost: z.number().optional().default(0),
  discount: z.number().optional().default(0),
  vat: z.number().optional().default(0),
  line_total: z.number(),
});

const SaleSchema = z.object({
  client_op_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
  register_id: z.string().uuid().nullable().optional(),
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
  items: z.array(SaleItemSchema).min(1),
});

export const syncSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((data: unknown) => SaleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("sales")
      .select("id, invoice_no")
      .eq("client_op_id", data.client_op_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (existing) {
      return {
        ok: true as const,
        sale_id: existing.id as string,
        invoice_no: existing.invoice_no as string,
        duplicate: true,
      };
    }

    const wh = await resolveDefaultWarehouse(supabase, data.tenant_id, data.warehouse_id);
    const openRegisterId = await findOpenRegisterId(supabase, data.tenant_id, userId, data.register_id);

    const paidAmount = Math.max(0, Number(data.paid ?? 0));
    const dueAmount = Math.max(0, Number(data.due ?? 0));
    const method = (data.payment_method || "cash").toLowerCase();
    const payments: Array<{ method: string; amount: number }> = [];
    if (paidAmount > 0) payments.push({ method: method === "due" ? "cash" : method, amount: paidAmount });
    if (dueAmount > 0 && data.customer_id) payments.push({ method: "due", amount: dueAmount });

    // Preferred path: atomic Postgres `pos_checkout` RPC when an open register exists
    if (openRegisterId) {
      const rpcItems = data.items.map((it) => ({
        product_id: it.product_id,
        qty: it.qty,
        unit_price: it.unit_price,
        discount: it.discount ?? 0,
        vat: it.vat ?? 0,
        allow_stock_override: true,
      }));
      const { data: rpcSale, error: rpcErr } = await supabase.rpc("pos_checkout", {
        _tenant_id: data.tenant_id,
        _customer_id: (data.customer_id ?? null) as unknown as string,
        _cashier_id: userId,
        _invoice_no: null as unknown as string,
        _discount: data.discount ?? 0,
        _notes: data.notes
          ? `${data.notes} [Offline: ${data.invoice_no ?? ""}]`
          : `Offline POS sync${data.invoice_no ? ` (${data.invoice_no})` : ""}`,
        _client_op_id: data.client_op_id,
        _items: rpcItems as never,
        _payments: payments as never,
        _register_id: openRegisterId,
        _warehouse_id: wh.id,
      } as never);

      if (!rpcErr && rpcSale) {
        const s = rpcSale as unknown as { id: string; invoice_no: string };
        return {
          ok: true as const,
          sale_id: s.id,
          invoice_no: s.invoice_no,
          duplicate: false,
        };
      }
      // Fall through only if register ownership/closed raced; otherwise throw real error
      const errMsg = rpcErr?.message ?? "";
      if (!/register/i.test(errMsg)) {
        throw new Error(errMsg || "pos_checkout offline sync failed");
      }
    }

    // Fallback path when no open register exists (e.g. synced after shift closed)
    const branchId = await resolveDefaultBranchId(supabase, data.tenant_id, data.branch_id ?? wh.branch_id);
    const { data: n, error: nErr } = await supabase.rpc("generate_next_number", {
      _tenant_id: data.tenant_id,
      _doc_type: "invoice",
    });
    const invoiceNo = !nErr && typeof n === "string" && n ? n : data.invoice_no || `INV-${Date.now()}`;
    const safeDue = data.customer_id ? dueAmount : 0;
    const status = safeDue > 0.01 ? "partial" : "completed";

    const { data: inserted, error: insErr } = await supabase
      .from("sales")
      .insert({
        client_op_id: data.client_op_id,
        tenant_id: data.tenant_id,
        branch_id: branchId,
        warehouse_id: wh.id,
        customer_id: data.customer_id ?? null,
        invoice_no: invoiceNo,
        subtotal: data.subtotal,
        discount: data.discount ?? 0,
        vat: data.vat ?? 0,
        total: data.total,
        paid: paidAmount,
        due: safeDue,
        payment_method: (method === "due" && paidAmount === 0 ? "due" : method) as never,
        status: status as never,
        notes: data.notes
          ? `${data.notes} [Offline: ${data.invoice_no ?? ""}]`
          : `Offline POS sync${data.invoice_no ? ` (${data.invoice_no})` : ""}`,
        cashier_id: userId,
        sale_date: new Date(data.client_ts).toISOString(),
      })
      .select("id, invoice_no")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "sale insert failed");

    const saleId = inserted.id as string;
    const todayIso = new Date().toISOString().slice(0, 10);

    for (const it of data.items) {
      let needQty = it.qty;
      const { data: batches } = await supabase
        .from("batches")
        .select("id, qty_on_hand, purchase_price, expiry_date")
        .eq("tenant_id", data.tenant_id)
        .eq("product_id", it.product_id)
        .gt("qty_on_hand", 0)
        .gte("expiry_date", todayIso)
        .order("expiry_date", { ascending: true })
        .limit(20);

      for (const b of (batches ?? []) as Array<{ id: string; qty_on_hand: number; purchase_price: number }>) {
        if (needQty <= 0) break;
        const avail = Number(b.qty_on_hand ?? 0);
        const take = Math.min(avail, needQty);
        if (take <= 0) continue;

        await supabase.from("batches").update({ qty_on_hand: avail - take }).eq("id", b.id);
        const ratio = it.qty > 0 ? take / it.qty : 1;
        await supabase.from("sale_items").insert({
          sale_id: saleId,
          tenant_id: data.tenant_id,
          branch_id: branchId,
          product_id: it.product_id,
          batch_id: b.id,
          qty: take,
          unit_price: it.unit_price,
          unit_cost: Number(b.purchase_price ?? it.unit_cost ?? 0),
          discount: Math.round((it.discount ?? 0) * ratio * 100) / 100,
          vat: Math.round((it.vat ?? 0) * ratio * 100) / 100,
          line_total: Math.round(it.line_total * ratio * 100) / 100,
        });
        await supabase.from("stock_movements").insert({
          tenant_id: data.tenant_id,
          branch_id: branchId,
          product_id: it.product_id,
          batch_id: b.id,
          warehouse_id: wh.id,
          movement_type: "sale",
          qty_change: -take,
          qty_after: avail - take,
          reference_table: "sales",
          reference_id: saleId,
          reference_no: invoiceNo,
          user_id: userId,
          notes: "Offline POS sync",
        } as never);
        needQty -= take;
      }

      if (needQty > 0) {
        const ratio = it.qty > 0 ? needQty / it.qty : 1;
        await supabase.from("sale_items").insert({
          sale_id: saleId,
          tenant_id: data.tenant_id,
          branch_id: branchId,
          product_id: it.product_id,
          batch_id: null,
          qty: needQty,
          unit_price: it.unit_price,
          unit_cost: it.unit_cost ?? 0,
          discount: Math.round((it.discount ?? 0) * ratio * 100) / 100,
          vat: Math.round((it.vat ?? 0) * ratio * 100) / 100,
          line_total: Math.round(it.line_total * ratio * 100) / 100,
        });
        await supabase.from("stock_movements").insert({
          tenant_id: data.tenant_id,
          branch_id: branchId,
          product_id: it.product_id,
          batch_id: null,
          warehouse_id: wh.id,
          movement_type: "sale",
          qty_change: -needQty,
          reference_table: "sales",
          reference_id: saleId,
          reference_no: invoiceNo,
          user_id: userId,
          notes: "Offline POS sync (stock override)",
        } as never);
      }
    }

    if (paidAmount > 0) {
      await supabase.from("sale_payments").insert({
        tenant_id: data.tenant_id,
        branch_id: branchId,
        sale_id: saleId,
        method: (method === "due" ? "cash" : method) as never,
        amount: paidAmount,
        created_by: userId,
      });
    }

    return { ok: true as const, sale_id: saleId, invoice_no: invoiceNo, duplicate: false };
  });

const PurchaseItemSchema = z.object({
  product_id: z.string().uuid(),
  batch_no: z.string().optional(),
  expiry_date: z.string().optional(),
  qty: z.number().positive(),
  bonus_qty: z.number().nonnegative().optional().default(0),
  unit_cost: z.number().nonnegative(),
  sale_price: z.number().nonnegative().optional(),
  discount: z.number().optional().default(0),
  vat: z.number().optional().default(0),
  line_total: z.number(),
  pcs_per_strip: z.number().optional(),
  pcs_per_box: z.number().optional(),
});

const PurchaseSchema = z.object({
  client_op_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  invoice_no: z.string().optional(),
  due_date: z.string().optional(),
  subtotal: z.number(),
  discount: z.number().optional().default(0),
  vat: z.number().optional().default(0),
  total: z.number(),
  paid: z.number().optional().default(0),
  due: z.number().optional().default(0),
  payment_method: z.string().optional(),
  notes: z.string().optional(),
  client_ts: z.number(),
  items: z.array(PurchaseItemSchema).min(1),
});

export const syncPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((data: unknown) => PurchaseSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("purchase_orders")
      .select("id, po_number")
      .eq("client_op_id" as never, data.client_op_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (existing) {
      return {
        ok: true as const,
        purchase_id: existing.id as string,
        po_number: existing.po_number as string,
        duplicate: true,
      };
    }

    const wh = await resolveDefaultWarehouse(supabase, data.tenant_id, null);
    const branchId = await resolveDefaultBranchId(supabase, data.tenant_id, data.branch_id ?? wh.branch_id);
    const d = new Date(data.client_ts);
    const poNo = `PO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${data.client_op_id.slice(0, 6).toUpperCase()}`;
    const orderIso = new Date(data.client_ts).toISOString();

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        client_op_id: data.client_op_id,
        tenant_id: data.tenant_id,
        branch_id: branchId,
        po_number: poNo,
        supplier_id: data.supplier_id ?? null,
        status: "received",
        order_date: orderIso.slice(0, 10),
        expected_delivery_date: data.due_date || null,
        received_at: orderIso,
        subtotal: data.subtotal,
        discount: data.discount ?? 0,
        vat: data.vat ?? 0,
        total: data.total,
        notes: [data.invoice_no ? `Invoice: ${data.invoice_no}` : "", data.notes ?? "", "[Offline sync]"]
          .filter(Boolean)
          .join(" — "),
        created_by: userId,
        approved_by: userId,
        approved_at: orderIso,
      } as never)
      .select("id, po_number")
      .single();
    if (poErr || !po) throw new Error(poErr?.message ?? "purchase_orders insert failed");

    const poId = po.id as string;
    const defaultExpiry = new Date(Date.now() + 730 * 86_400_000).toISOString().slice(0, 10);

    for (const it of data.items) {
      const totalPcs = it.qty + (it.bonus_qty ?? 0);
      await supabase.from("purchase_order_items").insert({
        tenant_id: data.tenant_id,
        branch_id: branchId,
        purchase_order_id: poId,
        product_id: it.product_id,
        qty_ordered: totalPcs,
        qty_received: totalPcs,
        unit_cost: it.unit_cost,
        discount: it.discount ?? 0,
        vat: it.vat ?? 0,
        line_total: it.line_total,
        notes: it.bonus_qty ? `Bonus: ${it.bonus_qty} pcs` : null,
      });

      const batchNo = (it.batch_no || "").trim() || `OFF-${poNo.slice(-6)}`;
      const expiryDate = it.expiry_date || defaultExpiry;
      const { data: batch, error: bErr } = await supabase
        .from("batches")
        .insert({
          tenant_id: data.tenant_id,
          branch_id: branchId,
          warehouse_id: wh.id,
          product_id: it.product_id,
          batch_no: batchNo,
          expiry_date: expiryDate,
          purchase_price: it.unit_cost,
          qty_on_hand: totalPcs,
        })
        .select("id")
        .single();
      if (bErr || !batch) throw new Error(bErr?.message ?? "batch insert failed");

      await supabase.from("stock_movements").insert({
        tenant_id: data.tenant_id,
        branch_id: branchId,
        product_id: it.product_id,
        batch_id: batch.id,
        warehouse_id: wh.id,
        movement_type: "purchase",
        qty_change: totalPcs,
        reference_table: "purchase_orders",
        reference_id: poId,
        reference_no: poNo,
        user_id: userId,
        notes: `Offline GRN for ${poNo}`,
      } as never);

      if (it.sale_price != null || it.unit_cost > 0 || it.pcs_per_strip || it.pcs_per_box) {
        const patch: Record<string, number> = { purchase_price: it.unit_cost };
        if (it.sale_price != null && it.sale_price > 0) patch.retail_price = it.sale_price;
        if (it.pcs_per_strip && it.pcs_per_strip > 0) patch.pack_size = it.pcs_per_strip;
        if (it.pcs_per_box && it.pcs_per_box > 0) patch.qty_per_box = it.pcs_per_box;
        await supabase.from("products").update(patch as never).eq("id", it.product_id).eq("tenant_id", data.tenant_id);
      }
    }

    if (data.supplier_id && Number(data.total) > 0) {
      const rules = await loadBusinessRules(supabase, data.tenant_id);
      if (rules.enable_supplier_ledger) {
        await supabase.rpc("post_supplier_ledger_idempotent", {
          _tenant_id: data.tenant_id,
          _supplier_id: data.supplier_id,
          _entry_type: "purchase",
          _debit: 0,
          _credit: Number(data.total),
          _ref_table: "purchase_orders",
          _ref_id: poId,
          _ref_no: poNo,
          _notes: `Offline purchase received PO ${poNo}`,
        } as never);
        await supabase.rpc("increment_supplier_due_balance", {
          _supplier_id: data.supplier_id,
          _amount: Number(data.total),
        } as never);
      }
      if (rules.enable_journal_posting) {
        await supabase.rpc("post_po_journal", {
          _tenant_id: data.tenant_id,
          _po_id: poId,
        } as never);
      }
      const paidAmt = Number(data.paid ?? 0);
      if (paidAmt > 0) {
        const refNo = data.invoice_no || `SPAY-${poNo}`;
        const { data: spay } = await supabase
          .from("supplier_payments")
          .insert({
            tenant_id: data.tenant_id,
            supplier_id: data.supplier_id,
            purchase_id: poId,
            amount: paidAmt,
            method: (data.payment_method || "cash") as never,
            reference: refNo,
            notes: `Offline payment on PO ${poNo}`,
            payment_date: orderIso.slice(0, 10),
            paid_by: userId,
            branch_id: branchId,
          } as never)
          .select("id")
          .single();
        if (spay?.id && rules.enable_supplier_ledger) {
          await supabase.rpc("post_supplier_ledger_idempotent", {
            _tenant_id: data.tenant_id,
            _supplier_id: data.supplier_id,
            _entry_type: "payment",
            _debit: paidAmt,
            _credit: 0,
            _ref_table: "supplier_payments",
            _ref_id: spay.id,
            _ref_no: refNo,
            _notes: `Offline payment via ${data.payment_method || "cash"}`,
          } as never);
          const { data: sup } = await supabase.from("suppliers").select("due_balance").eq("id", data.supplier_id).maybeSingle();
          if (sup) {
            await supabase
              .from("suppliers")
              .update({ due_balance: Number(sup.due_balance ?? 0) - paidAmt })
              .eq("id", data.supplier_id);
          }
        }
        if (spay?.id && rules.enable_journal_posting) {
          await supabase.rpc("post_supplier_payment_journal", {
            _tenant_id: data.tenant_id,
            _payment_id: spay.id,
          } as never);
        }
      }
    }

    return { ok: true as const, purchase_id: poId, po_number: poNo, duplicate: false };
  });

const CustomerCreateSchema = z.object({
  client_op_id: z.string().uuid(),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string().trim().min(1).max(150),
  phone: z.string().trim().min(1).max(40),
  email: z.string().nullable().optional(),
  type: z.enum(["retail", "dealer", "wholesale"]).default("retail"),
  opening_balance: z.number().min(0).default(0),
  credit_limit: z.number().min(0).default(0),
  address: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  client_ts: z.number(),
});

export const syncCustomerCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((data: unknown) => CustomerCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: existingId } = await supabase
      .from("customers")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (existingId) return { ok: true as const, customer_id: existingId.id as string, duplicate: true };

    const { data: existingPhone } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .eq("phone", data.phone)
      .maybeSingle();
    if (existingPhone) {
      return { ok: true as const, customer_id: existingPhone.id as string, duplicate: true };
    }

    const { data: inserted, error } = await supabase
      .from("customers")
      .insert({
        id: data.id,
        tenant_id: data.tenant_id,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        type: data.type,
        opening_balance: data.opening_balance,
        due_balance: data.opening_balance,
        credit_limit: data.credit_limit,
        address: data.address || null,
        area: data.area || null,
        district: data.district || null,
        notes: data.notes || null,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "customer insert failed");

    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "customer.created",
      _entity_table: "customers",
      _entity_id: inserted.id,
      _after: inserted as never,
    });

    return { ok: true as const, customer_id: inserted.id as string, duplicate: false };
  });

const CollectionSchema = z.object({
  client_op_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  sale_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  method: z.string().optional(),
  notes: z.string().optional(),
  client_ts: z.number(),
});

export const syncCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((data: unknown) => CollectionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("customer_payments")
      .select("id")
      .eq("client_op_id", data.client_op_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    if (existing) return { ok: true as const, duplicate: true };

    const openRegisterId = await findOpenRegisterId(supabase, data.tenant_id, userId, null);

    const { error } = await supabase.rpc("collect_customer_due", {
      _tenant_id: data.tenant_id,
      _customer_id: data.customer_id,
      _amount: data.amount,
      _method: data.method ?? "cash",
      _reference: null as unknown as string,
      _notes: data.notes ?? "Offline due collection",
      _payment_date: new Date(data.client_ts + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
      _sale_id: (data.sale_id ?? null) as unknown as string,
      _register_id: (openRegisterId ?? null) as unknown as string,
      _client_op_id: data.client_op_id,
    } as never);
    if (error) throw new Error(error.message);

    return { ok: true as const, duplicate: false };
  });

// --- Background Offline Snapshot & Chunked Catalog Download ---

export const fetchOfflineOperationalSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({ tenantId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const tid = data.tenantId;

    const [tenantRes, custRes, supRes, salesRes, poRes, branchRes, whRes, regRes] = await Promise.all([
      supabase
        .from("tenants")
        .select("name, owner_name, address_line, area, district, phone, mobile")
        .eq("id", tid)
        .maybeSingle(),
      supabase
        .from("customers")
        .select("id, customer_code, name, phone, email, type, address, due_balance, credit_limit")
        .eq("tenant_id", tid)
        .eq("is_active", true)
        .order("due_balance", { ascending: false })
        .limit(1000),
      supabase
        .from("suppliers")
        .select("id, name, phone, due_balance")
        .eq("tenant_id", tid)
        .eq("is_active", true)
        .order("name")
        .limit(1000),
      supabase
        .from("sales")
        .select(
          "id, invoice_no, sale_date, created_at, subtotal, discount, vat, total, paid, due, payment_method, status, is_return, customer_id, customers(name, phone), sale_items(product_id, qty, unit_price, discount, vat, line_total, products(name))",
        )
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("purchase_orders")
        .select(
          "id, po_number, status, order_date, created_at, total, supplier_id, suppliers(name), purchase_order_items(product_id, qty_ordered, unit_cost, line_total, products(name))",
        )
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("branches")
        .select("id, name, code, branch_role, is_main")
        .eq("tenant_id", tid)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("is_main", { ascending: false }),
      supabase
        .from("warehouses")
        .select("id, name, branch_id, is_default")
        .eq("tenant_id", tid)
        .is("deleted_at", null)
        .order("is_default", { ascending: false }),
      supabase
        .from("cash_registers")
        .select("id")
        .eq("tenant_id", tid)
        .eq("user_id", context.userId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      shopInfo: tenantRes.data ?? null,
      customers: custRes.data ?? [],
      suppliers: supRes.data ?? [],
      sales: salesRes.data ?? [],
      purchases: poRes.data ?? [],
      branches: branchRes.data ?? [],
      warehouses: whRes.data ?? [],
      openRegisterId: (regRes.data?.id as string | undefined) ?? null,
    };
  });

export const fetchOfflineCatalogChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(
    z.object({
      tenantId: z.string().uuid(),
      offset: z.number().int().min(0),
      limit: z.number().int().min(100).max(1000).default(1000),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error, count } = await supabase
      .from("products")
      .select(
        "id, name, sku, barcode, retail_price, purchase_price, vat_rate, strength, medicine_type, volume, pack_size, qty_per_box, reorder_level, unit, is_active, generic_id, manufacturer_id, category_id, generics(name), manufacturers(name), categories(name), batches(qty_on_hand)",
        { count: "exact" },
      )
      .eq("tenant_id", data.tenantId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(data.offset, data.offset + data.limit - 1);

    if (error) throw new Error(error.message);

    const mapped = ((rows ?? []) as any[]).map((p) => {
      const cfg = resolvePackConfig({
        medicine_type: p.medicine_type,
        name: p.name,
        pack_size: p.pack_size,
        qty_per_box: p.qty_per_box,
      });
      const stock = Array.isArray(p.batches)
        ? p.batches.reduce((s: number, b: any) => s + Number(b.qty_on_hand ?? 0), 0)
        : 0;
      return {
        id: p.id as string,
        name: p.name as string,
        displayName: buildProductDisplayName(p),
        form: (p.medicine_type as string | null) ?? null,
        strength: (p.strength as string | null) ?? null,
        generic_id: (p.generic_id as string | null) ?? null,
        manufacturer_id: (p.manufacturer_id as string | null) ?? null,
        category_id: (p.category_id as string | null) ?? null,
        generic_name: (p.generics?.name as string | null) ?? null,
        company_name: (p.manufacturers?.name as string | null) ?? null,
        category_name: (p.categories?.name as string | null) ?? null,
        sku: (p.sku as string | null) ?? null,
        barcode: (p.barcode as string | null) ?? null,
        unit: (p.unit as string | null) ?? null,
        reorder_level: p.reorder_level != null ? Number(p.reorder_level) : null,
        is_active: p.is_active !== false,
        cost: Number(p.purchase_price ?? 0),
        price: Number(p.retail_price ?? 0),
        vat_rate: Number(p.vat_rate ?? 0),
        stock,
        hasStrip: cfg.hasStrip,
        pcsPerStrip: cfg.pcsPerStrip,
        pcsPerBox: cfg.pcsPerBox,
      };
    });

    return {
      rows: mapped,
      total: count ?? mapped.length,
    };
  });
