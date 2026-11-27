// Public helpers callers use from POS / Customers / Purchases / Collections screens.
// These write BOTH to the durable IndexedDB outbox AND optimistically to local read caches.
import {
  adjustCachedCustomerDue,
  adjustCachedProductStock,
  enqueueOp,
  newOpId,
  putCachedCustomer,
  putCachedPurchase,
  putCachedSale,
} from "./db";
import { flushNow } from "./sync";

export type OfflineSaleItem = {
  product_id: string;
  name?: string;
  batch_id?: string | null;
  qty: number;
  unit_price: number;
  unit_cost?: number;
  discount?: number;
  tax?: number;
  vat?: number;
  line_total: number;
};

export async function queueSale(input: {
  tenant_id: string;
  branch_id?: string | null;
  warehouse_id?: string | null;
  register_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  invoice_no?: string;
  subtotal: number;
  discount?: number;
  tax?: number;
  vat?: number;
  total: number;
  paid?: number;
  due?: number;
  payment_method?: string;
  notes?: string;
  items: OfflineSaleItem[];
}) {
  const client_op_id = newOpId();
  const client_ts = Date.now();
  const offlineInv = input.invoice_no || `OFFLINE-${client_op_id.slice(0, 6).toUpperCase()}`;

  const payload = {
    client_op_id,
    client_ts,
    tenant_id: input.tenant_id,
    branch_id: input.branch_id ?? null,
    warehouse_id: input.warehouse_id ?? null,
    register_id: input.register_id ?? null,
    customer_id: input.customer_id ?? null,
    invoice_no: offlineInv,
    subtotal: input.subtotal,
    discount: input.discount ?? 0,
    vat: input.vat ?? input.tax ?? 0,
    total: input.total,
    paid: input.paid ?? 0,
    due: input.due ?? 0,
    payment_method: input.payment_method ?? "cash",
    notes: input.notes,
    items: input.items.map((it) => ({
      product_id: it.product_id,
      batch_id: it.batch_id ?? null,
      qty: it.qty,
      unit_price: it.unit_price,
      unit_cost: it.unit_cost ?? 0,
      discount: it.discount ?? 0,
      vat: it.vat ?? it.tax ?? 0,
      line_total: it.line_total,
    })),
  };

  const op = await enqueueOp("sale", payload, client_op_id);

  // Optimistic local state updates so stock, sales list, customer due, & 58mm/A4 invoices reflect immediately
  const nowIso = new Date(client_ts).toISOString();
  await Promise.all([
    adjustCachedProductStock(
      input.tenant_id,
      input.items.map((it) => ({ product_id: it.product_id, delta: -Math.abs(it.qty) })),
    ).catch(() => {}),
    input.customer_id && (input.due ?? 0) > 0
      ? adjustCachedCustomerDue(input.tenant_id, input.customer_id, Number(input.due)).catch(() => {})
      : Promise.resolve(),
    putCachedSale(input.tenant_id, {
      id: client_op_id,
      invoice_no: offlineInv,
      sale_date: nowIso,
      created_at: nowIso,
      subtotal: input.subtotal,
      discount: input.discount ?? 0,
      vat: input.vat ?? input.tax ?? 0,
      total: input.total,
      paid: input.paid ?? 0,
      due: input.due ?? 0,
      payment_method: input.payment_method ?? "cash",
      status: (input.due ?? 0) > 0.01 ? "partial" : "completed",
      customer_id: input.customer_id ?? null,
      customer_name: input.customer_name ?? null,
      customer_phone: input.customer_phone ?? null,
      items: input.items.map((it) => ({
        product_id: it.product_id,
        name: it.name || "Product",
        qty: it.qty,
        unit_price: it.unit_price,
        discount: it.discount ?? 0,
        vat: it.vat ?? it.tax ?? 0,
        line_total: it.line_total,
      })),
      pendingSync: true,
    }).catch(() => {}),
  ]);

  void flushNow();
  return op;
}

export type OfflinePurchaseItem = {
  product_id: string;
  name?: string;
  batch_no?: string;
  expiry_date?: string;
  qty: number;
  bonus_qty?: number;
  unit_cost: number;
  sale_price?: number;
  discount?: number;
  vat?: number;
  line_total: number;
  pcs_per_strip?: number;
  pcs_per_box?: number;
};

export async function queuePurchase(input: {
  tenant_id: string;
  branch_id?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  invoice_no?: string;
  due_date?: string;
  subtotal: number;
  discount?: number;
  vat?: number;
  total: number;
  paid?: number;
  due?: number;
  payment_method?: string;
  notes?: string;
  items: OfflinePurchaseItem[];
}) {
  const client_op_id = newOpId();
  const client_ts = Date.now();
  const offlinePo = `OFF-PO-${client_op_id.slice(0, 6).toUpperCase()}`;

  const payload = {
    client_op_id,
    client_ts,
    tenant_id: input.tenant_id,
    branch_id: input.branch_id ?? null,
    supplier_id: input.supplier_id ?? null,
    invoice_no: input.invoice_no,
    due_date: input.due_date,
    subtotal: input.subtotal,
    discount: input.discount ?? 0,
    vat: input.vat ?? 0,
    total: input.total,
    paid: input.paid ?? 0,
    due: input.due ?? 0,
    payment_method: input.payment_method ?? "cash",
    notes: input.notes,
    items: input.items.map(({ name: _n, ...rest }) => rest),
  };

  const op = await enqueueOp("purchase", payload, client_op_id);
  const nowIso = new Date(client_ts).toISOString();

  await Promise.all([
    adjustCachedProductStock(
      input.tenant_id,
      input.items.map((it) => ({
        product_id: it.product_id,
        delta: Math.abs(it.qty) + Math.abs(it.bonus_qty ?? 0),
        cost: it.unit_cost > 0 ? it.unit_cost : undefined,
        price: it.sale_price && it.sale_price > 0 ? it.sale_price : undefined,
        pcsPerStrip: it.pcs_per_strip,
        pcsPerBox: it.pcs_per_box,
      })),
    ).catch(() => {}),
    putCachedPurchase(input.tenant_id, {
      id: client_op_id,
      po_number: offlinePo,
      status: "received",
      order_date: nowIso.slice(0, 10),
      created_at: nowIso,
      total: input.total,
      paid: input.paid ?? 0,
      due: input.due ?? 0,
      supplier_id: input.supplier_id ?? null,
      supplier_name: input.supplier_name ?? null,
      items: input.items.map((it) => ({
        product_id: it.product_id,
        name: it.name || "Product",
        qty: it.qty + (it.bonus_qty ?? 0),
        unit_cost: it.unit_cost,
        batch_no: it.batch_no,
        expiry_date: it.expiry_date,
        line_total: it.line_total,
      })),
      pendingSync: true,
    }).catch(() => {}),
  ]);

  void flushNow();
  return op;
}

export async function queueCustomerCreate(input: {
  tenant_id: string;
  name: string;
  phone: string;
  email?: string | null;
  type?: "retail" | "dealer" | "wholesale";
  opening_balance?: number;
  credit_limit?: number;
  address?: string | null;
  area?: string | null;
  district?: string | null;
  notes?: string | null;
}) {
  const client_op_id = newOpId();
  const id = newOpId();
  const payload = {
    client_op_id,
    id,
    client_ts: Date.now(),
    tenant_id: input.tenant_id,
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    type: input.type ?? "retail",
    opening_balance: input.opening_balance ?? 0,
    credit_limit: input.credit_limit ?? 0,
    address: input.address ?? null,
    area: input.area ?? null,
    district: input.district ?? null,
    notes: input.notes ?? null,
  };

  await enqueueOp("customer_create", payload, client_op_id);
  await putCachedCustomer(input.tenant_id, {
    id,
    customer_code: `OFF-${id.slice(0, 5).toUpperCase()}`,
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    type: input.type ?? "retail",
    address: input.address ?? null,
    due_balance: input.opening_balance ?? 0,
    credit_limit: input.credit_limit ?? 0,
    pendingSync: true,
  }).catch(() => {});

  void flushNow();
  return {
    id,
    name: input.name,
    phone: input.phone,
    due_balance: input.opening_balance ?? 0,
    type: input.type ?? "retail",
    pendingSync: true,
  };
}

export async function queueCollection(input: {
  tenant_id: string;
  customer_id: string;
  sale_id?: string | null;
  amount: number;
  method?: string;
  notes?: string;
}) {
  const client_op_id = newOpId();
  const payload = {
    client_op_id,
    client_ts: Date.now(),
    tenant_id: input.tenant_id,
    customer_id: input.customer_id,
    sale_id: input.sale_id ?? null,
    amount: input.amount,
    method: input.method ?? "cash",
    notes: input.notes,
  };
  const op = await enqueueOp("collection", payload, client_op_id);
  await adjustCachedCustomerDue(input.tenant_id, input.customer_id, -Math.abs(input.amount)).catch(() => {});
  void flushNow();
  return op;
}
