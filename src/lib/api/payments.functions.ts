import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const Method = z.enum(["cash", "bkash", "nagad", "rocket", "bank", "card", "other"]);

const PaymentLine = z.object({
  method: Method,
  amount: z.number().nonnegative(),
  reference: z.string().max(120).optional(),
  mobile_no: z.string().max(40).optional(),
});

// Record split payments against an existing sale.
// Validates: sum(payments) + due == sale.total
export const recordSalePayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    saleId: z.string().uuid(),
    payments: z.array(PaymentLine).min(1).max(8),
    due: z.number().nonnegative().default(0),
  }))
  .handler(async ({ data, context }) => {
    const { data: sale, error: e0 } = await context.supabase
      .from("sales").select("id,total,customer_id,branch_id")
      .eq("id", data.saleId).eq("tenant_id", data.tenantId).maybeSingle();
    if (e0 || !sale) throw new Error("Sale not found");
    if (!sale.branch_id) throw new Error("branch_required");

    const paid = data.payments.reduce((s, p) => s + p.amount, 0);
    const total = Number(sale.total);
    if (Math.abs(paid + data.due - total) > 0.01) {
      throw new Error(`Payments (${paid}) + due (${data.due}) must equal total (${total})`);
    }
    if (data.due > 0 && !sale.customer_id) {
      throw new Error("A customer is required for due sales");
    }

    const rows = data.payments
      .filter((p) => p.amount > 0)
      .map((p) => ({
        tenant_id: data.tenantId,
        branch_id: sale.branch_id as string,
        sale_id: data.saleId,
        method: p.method,
        amount: p.amount,
        reference: p.reference ?? null,
        mobile_no: p.mobile_no ?? null,
        created_by: context.userId,
      }));
    if (rows.length) {
      const { error: e1 } = await context.supabase.from("sale_payments").insert(rows);
      if (e1) throw new Error(e1.message);

      // P3: mirror non-due payments into the cash drawer of the cashier's open register
      const { data: reg } = await context.supabase
        .from("cash_registers")
        .select("id")
        .eq("tenant_id", data.tenantId)
        .eq("user_id", context.userId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!reg?.id) {
        throw new Error("register_required: open a cash register before recording payments");
      }
      const txns = rows.map((p) => ({
        tenant_id: data.tenantId,
        branch_id: sale.branch_id as string,
        register_id: reg.id,
        transaction_type: "sale" as const,
        amount: p.amount,
        payment_method: p.method,
        notes: `Payment for sale ${data.saleId}`,
        reference_table: "sales",
        reference_id: data.saleId,
        created_by: context.userId,
      }));
      const { error: e1b } = await context.supabase.from("cash_register_transactions").insert(txns);
      if (e1b) throw new Error(e1b.message);
    }

    const primary = data.payments.reduce((a, b) => (b.amount > a.amount ? b : a)).method;
    const { error: e2 } = await context.supabase
      .from("sales")
      .update({ paid, due: data.due, payment_method: data.payments.length > 1 ? "other" : primary })
      .eq("id", data.saleId).eq("tenant_id", data.tenantId);
    if (e2) throw new Error(e2.message);

    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId, user_id: context.userId,
      action: "sale.payments.record", entity_table: "sales", entity_id: data.saleId,
      after_data: { paid, due: data.due, lines: rows.length } as never,
    });

    return { ok: true, paid, due: data.due };
  });

// List payments for a sale
export const listSalePayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({ tenantId: z.string().uuid(), saleId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sale_payments")
      .select("id,method,amount,reference,mobile_no,paid_at")
      .eq("tenant_id", data.tenantId).eq("sale_id", data.saleId)
      .order("paid_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Payment method report: totals per method in a date range
export const paymentMethodReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    from: z.string().optional(),
    to: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sale_payments")
      .select("method,amount,paid_at")
      .eq("tenant_id", data.tenantId);
    if (data.from) q = q.gte("paid_at", data.from);
    if (data.to) q = q.lte("paid_at", data.to + "T23:59:59");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const totals: Record<string, { method: string; amount: number; count: number }> = {};
    let grand = 0;
    for (const r of rows ?? []) {
      const k = r.method;
      totals[k] ??= { method: k, amount: 0, count: 0 };
      totals[k].amount += Number(r.amount);
      totals[k].count += 1;
      grand += Number(r.amount);
    }

    // Due totals from sales
    let sq = context.supabase.from("sales").select("due,sale_date").eq("tenant_id", data.tenantId).gt("due", 0);
    if (data.from) sq = sq.gte("sale_date", data.from);
    if (data.to) sq = sq.lte("sale_date", data.to + "T23:59:59");
    const { data: dueRows } = await sq;
    const dueTotal = (dueRows ?? []).reduce((s, r) => s + Number(r.due), 0);

    return {
      methods: Object.values(totals).sort((a, b) => b.amount - a.amount),
      grandTotal: grand,
      dueTotal,
    };
  });
