// Public helpers callers use from the POS / Collections / Purchases screens.
// These ALWAYS write to the local outbox first. Sync engine drains them.
import { enqueueOp, newOpId } from "./db";
import { flushNow } from "./sync";

type SaleItem = {
  product_id: string;
  batch_id?: string | null;
  qty: number;
  unit_price: number;
  discount?: number;
  tax?: number;
  line_total: number;
};

export async function queueSale(input: {
  tenant_id: string;
  customer_id?: string | null;
  invoice_no?: string;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paid?: number;
  due?: number;
  payment_method?: string;
  notes?: string;
  items: SaleItem[];
}) {
  const payload = {
    client_op_id: newOpId(),
    client_ts: Date.now(),
    ...input,
  };
  const op = await enqueueOp("sale", payload);
  void flushNow(); // fire-and-forget; will no-op if offline
  return op;
}

type PurchaseItem = {
  product_id: string;
  batch_id?: string | null;
  qty: number;
  unit_cost: number;
  line_total: number;
};

export async function queuePurchase(input: {
  tenant_id: string;
  supplier_id?: string | null;
  invoice_no?: string;
  subtotal: number;
  total: number;
  paid?: number;
  due?: number;
  notes?: string;
  items: PurchaseItem[];
}) {
  const payload = { client_op_id: newOpId(), client_ts: Date.now(), ...input };
  const op = await enqueueOp("purchase", payload);
  void flushNow();
  return op;
}

export async function queueCollection(input: {
  tenant_id: string;
  customer_id: string;
  amount: number;
  method?: string;
  notes?: string;
}) {
  const payload = { client_op_id: newOpId(), client_ts: Date.now(), ...input };
  const op = await enqueueOp("collection", payload);
  void flushNow();
  return op;
}
