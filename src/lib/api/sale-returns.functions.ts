import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ReturnItemInput = z.object({
  sale_item_id: z.string().uuid(),
  qty: z.number().positive(),
});

const ProcessReturnInput = z.object({
  tenantId: z.string().uuid(),
  saleId: z.string().uuid(),
  items: z.array(ReturnItemInput).min(1),
  reason: z.string().optional(),
  refundMethod: z.string().default("cash"),
  refundAmount: z.number().nonnegative(),
  clientOpId: z.string().optional(),
});

export const processSaleReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProcessReturnInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    const { data: retData, error: retErr } = await sb.rpc("pos_return", {
      _tenant_id: data.tenantId,
      _sale_id: data.saleId,
      _items: data.items as never,
      _reason: data.reason || undefined,
      _refund_method: data.refundMethod,
      _refund_amount: data.refundAmount,
      _client_op_id: data.clientOpId || crypto.randomUUID(),
    } as never);

    if (retErr) throw new Error(retErr.message);

    const res = retData as {
      return_no: string;
      total: number;
      refunded_amount: number;
      refund_method: string;
    };

    // Automatically record monetary refund as an expense so cash/expense accounting stays exact
    const actualRefund = Number(res.refunded_amount ?? data.refundAmount ?? 0);
    if (
      actualRefund > 0 &&
      data.refundMethod !== "due" &&
      data.refundMethod !== "store_credit"
    ) {
      try {
        const [{ data: saleRow }, { data: expAcc }] = await Promise.all([
          sb
            .from("sales")
            .select("branch_id, invoice_no")
            .eq("id", data.saleId)
            .maybeSingle(),
          sb
            .from("chart_of_accounts")
            .select("id")
            .eq("tenant_id", data.tenantId)
            .eq("type", "expense")
            .eq("is_active", true)
            .order("code")
            .limit(1)
            .maybeSingle(),
        ]);

        if (saleRow?.branch_id && expAcc?.id) {
          const validMethods = new Set(["cash", "bkash", "nagad", "rocket", "bank", "card", "other"]);
          const payMethod = validMethods.has(data.refundMethod) ? data.refundMethod : "cash";

          await sb.from("expenses").insert({
            tenant_id: data.tenantId,
            branch_id: saleRow.branch_id,
            account_id: expAcc.id,
            expense_no: `RET-EXP-${Date.now().toString(36).toUpperCase()}`,
            expense_date: new Date().toISOString().slice(0, 10),
            amount: actualRefund,
            payment_method: payMethod as any,
            reference_no: res.return_no,
            notes: `Sale Return (${res.return_no}${saleRow.invoice_no ? ` / ${saleRow.invoice_no}` : ""}${data.reason ? ` — ${data.reason}` : ""})`,
            created_by: context.userId,
          });
        }
      } catch (expErr) {
        console.error("[SaleReturn] auto-expense insert failed:", expErr);
      }
    }

    return res;
  });
