import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const ItemSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
  discount: z.number().min(0).default(0),
  vat: z.number().min(0).default(0),
});

const PaymentSchema = z.object({
  method: z.enum(["cash", "card", "bkash", "nagad", "rocket", "bank", "due", "split"]),
  amount: z.number().min(0),
  reference: z.string().optional(),
  mobile_no: z.string().optional(),
});

const CheckoutSchema = z.object({
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  invoice_no: z.string().min(1),
  discount: z.number().min(0).default(0),
  notes: z.string().optional(),
  client_op_id: z.string().uuid().optional(),
  items: z.array(ItemSchema).min(1),
  payments: z.array(PaymentSchema).default([]),
});

export const posCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("pos")])
  .inputValidator((input: unknown) => CheckoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Branch-write guard — Phase 4B-2 enforcement
    await assertBranchWrite(supabase, data.tenant_id, data.branch_id);

    const { data: sale, error } = await supabase.rpc("pos_checkout", {
      _tenant_id: data.tenant_id,
      _customer_id: data.customer_id as string,
      _cashier_id: userId,
      _invoice_no: data.invoice_no,
      _discount: data.discount,
      _notes: data.notes,
      _client_op_id: data.client_op_id,
      _items: data.items,
      _payments: data.payments,
    });

    if (error) throw new Error(error.message);

    // Explicit branch stamping — do not rely on auto-derive triggers
    const saleId = (sale as { id?: string } | null)?.id;
    if (saleId) {
      await supabase.from("sales")
        .update({ branch_id: data.branch_id })
        .eq("tenant_id", data.tenant_id).eq("id", saleId);
      await supabase.from("sale_items")
        .update({ branch_id: data.branch_id })
        .eq("tenant_id", data.tenant_id).eq("sale_id", saleId);
      await supabase.from("sale_payments")
        .update({ branch_id: data.branch_id })
        .eq("tenant_id", data.tenant_id).eq("sale_id", saleId);

      await supabase.rpc("audit_log_event", {
        _action: "pos.checkout",
        _entity_type: "sales",
        _entity_id: saleId,
        _tenant_id: data.tenant_id,
        _branch_id: data.branch_id,
        _metadata: { invoice_no: data.invoice_no, items: data.items.length },
      });
    }
    return sale;
  });
