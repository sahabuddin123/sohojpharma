import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const TenantInput = z.object({ tenantId: z.string().uuid() });

// Dashboard: total due, collected today, overdue customers, monthly collection
export const dueDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: customers } = await context.supabase
      .from("v_customer_due")
      .select("customer_id,name,phone,net_due,credit_limit")
      .eq("tenant_id", data.tenantId);

    const normalizedCustomers = (customers ?? []).map((c) => ({
      id: c.customer_id,
      name: c.name,
      phone: c.phone,
      credit_limit: c.credit_limit,
      due_balance: Number(c.net_due ?? 0),
    }));
    const totalDue = normalizedCustomers.reduce((s, c) => s + c.due_balance, 0);
    const overdue = (customers ?? [])
      .map((c) => ({
        id: c.customer_id,
        name: c.name,
        phone: c.phone,
        credit_limit: c.credit_limit,
        due_balance: Number(c.net_due ?? 0),
      }))
      .filter((c) => c.due_balance > 0)
      .sort((a, b) => b.due_balance - a.due_balance)
      .slice(0, 20);

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const { data: pays } = await context.supabase
      .from("customer_payments")
      .select("amount,payment_date,method")
      .eq("tenant_id", data.tenantId)
      .gte("payment_date", monthStart);

    const collectedToday = (pays ?? [])
      .filter((p) => p.payment_date === today)
      .reduce((s, p) => s + Number(p.amount), 0);
    const collectedThisMonth = (pays ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const byMethod: Record<string, number> = {};
    (pays ?? []).forEach((p) => {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
    });

    return {
      totalDue, collectedToday, collectedThisMonth,
      overdueCustomers: overdue, byMethod,
      totalCustomersWithDue: normalizedCustomers.filter((c) => c.due_balance > 0).length,
    };
  });

// Record a payment through the authoritative collection RPC.
export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    branchId: z.string().uuid(),
    customer_id: z.string().uuid(),
    sale_id: z.string().uuid().nullable().optional(),
    amount: z.number().positive(),
    method: z.enum(["cash", "bkash", "nagad", "rocket", "bank", "card", "other"]).default("cash"),
    reference: z.string().optional(),
    notes: z.string().optional(),
    payment_date: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    await assertBranchWrite(context.supabase, data.tenantId, data.branchId);
    const payloadAmount = Math.round(data.amount * 100) / 100;
    if (payloadAmount !== data.amount) throw new Error("Amount mismatch");

    const { data: beforeDue } = await context.supabase.rpc("customer_due_summary", { p_customer_id: data.customer_id });
    const { data: pay, error } = await context.supabase.rpc("collect_customer_due", {
      _tenant_id: data.tenantId,
      _customer_id: data.customer_id,
      _amount: payloadAmount,
      _method: data.method,
      _reference: data.reference || undefined,
      _notes: data.notes || undefined,
      _payment_date: data.payment_date ?? new Date().toISOString().slice(0, 10),
      _sale_id: data.sale_id || undefined,
      _register_id: undefined,
      _client_op_id: crypto.randomUUID(),
    });
    if (error || !pay) throw new Error(error?.message ?? "payment insert failed");

    // Explicit branch stamping — no reliance on auto-derive triggers
    await context.supabase.from("customer_payments")
      .update({ branch_id: data.branchId })
      .eq("tenant_id", data.tenantId).eq("id", pay.id);

    const { data: saved } = await context.supabase
      .from("customer_payments")
      .select("id,amount")
      .eq("id", pay.id)
      .single();
    const savedAmount = Number(saved?.amount ?? 0);
    if (Math.abs(savedAmount - payloadAmount) > 0.001) {
      throw new Error(`Amount mismatch: entered ৳${payloadAmount.toFixed(2)} but saved ৳${savedAmount.toFixed(2)}`);
    }

    const { data: afterDue } = await context.supabase.rpc("customer_due_summary", { p_customer_id: data.customer_id });
    const newDue = Number(afterDue ?? 0);

    await context.supabase.rpc("audit_log_event", {
      _action: "payment.create",
      _entity_type: "customer_payments",
      _entity_id: pay.id,
      _tenant_id: data.tenantId,
      _branch_id: data.branchId,
      _metadata: {
        entered_amount: payloadAmount,
        saved_amount: savedAmount,
        previous_due: Number(beforeDue ?? 0),
        remaining_due: newDue,
        method: data.method,
        customer_id: data.customer_id,
      },
    });
    return { id: pay.id, new_due: newDue };
  });

// Customer ledger: opening balance + sales + payments, running balance
export const customerLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({ tenantId: z.string().uuid(), customer_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: customer } = await context.supabase
      .from("customers").select("id,name,phone,due_balance,credit_limit,opening_balance")
      .eq("id", data.customer_id).single();

    const { data: sales } = await context.supabase
      .from("sales").select("id,invoice_no,sale_date,total,paid,status")
      .eq("tenant_id", data.tenantId).eq("customer_id", data.customer_id);

    const { data: pays } = await context.supabase
      .from("customer_payments")
      .select("id,payment_date,amount,method,reference,sale_id")
      .eq("tenant_id", data.tenantId).eq("customer_id", data.customer_id);

    const { data: returns } = await context.supabase
      .from("sales_returns")
      .select("id,return_date,return_no,total,refunded_amount")
      .eq("tenant_id", data.tenantId).eq("customer_id", data.customer_id);

    const { buildCustomerLedger } = await import("./customer-ledger-unified");
    const { entries, closing } = buildCustomerLedger({
      opening_balance: Number(customer?.opening_balance ?? 0),
      sales: sales ?? [],
      payments: pays ?? [],
      returns: returns ?? [],
    });
    const { data: summaryDue } = await context.supabase.rpc("customer_due_summary", { p_customer_id: data.customer_id });
    const authoritativeDue = Number(summaryDue ?? closing);
    const ledger = entries.map((e) => ({
      date: e.entry_date.slice(0, 10),
      ref: e.ref_no ?? e.id.replace(/^(sale|pay|ret):/, "").slice(0, 8),
      type: e.entry_type === "collection" ? "Payment" : e.entry_type === "sale" ? "Sale" : e.entry_type,
      debit: e.debit,
      credit: e.credit,
      balance: e.balance,
      payment_id: e.id.startsWith("pay:") ? e.id.slice(4) : null,
      created_at: e.entry_date,
      running_balance: e.balance,
    }));
    if (ledger.length) {
      ledger[ledger.length - 1].balance = authoritativeDue;
      ledger[ledger.length - 1].running_balance = authoritativeDue;
    }
    return { customer: customer ? { ...customer, due_balance: authoritativeDue } : customer, ledger, currentDue: authoritativeDue };
  });

// Installments for a single sale
export const saleInstallments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({ sale_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: sale } = await context.supabase
      .from("sales").select("id,invoice_no,total,paid,due,customer_id")
      .eq("id", data.sale_id).single();
    const { data: pays } = await context.supabase
      .from("customer_payments")
      .select("id,payment_date,amount,method,reference,notes")
      .eq("sale_id", data.sale_id)
      .order("payment_date", { ascending: true });
    return { sale, installments: pays ?? [] };
  });
