import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const optStr = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).or(z.null());

const CustomerInput = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(1).max(150),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(150).optional().or(z.literal("")).or(z.null()),
  type: z.enum(["retail", "dealer", "wholesale"]).default("retail"),
  // Financial
  credit_limit: z.number().min(0).default(0),
  opening_balance: z.number().min(0).default(0),
  payment_terms_days: z.number().int().min(0).default(0),
  // Address
  address: optStr(500),
  area: optStr(100),
  district: optStr(100),
  division: optStr(100),
  postal_code: optStr(20),
  country: optStr(100),
  // Pharmacy / Medical
  date_of_birth: z.string().optional().or(z.literal("")).or(z.null()),
  gender: optStr(20),
  blood_group: optStr(10),
  allergies: optStr(1000),
  chronic_diseases: optStr(1000),
  doctor_reference: optStr(150),
  // Additional
  nid_passport: optStr(50),
  notes: optStr(1000),
  is_active: z.boolean().default(true),
});

const empty = (v: string | null | undefined) =>
  v && v.trim().length > 0 ? v.trim() : null;

const buildPayload = (data: z.output<typeof CustomerInput>) => ({
  name: data.name,
  phone: data.phone,
  email: empty(data.email ?? null),
  type: data.type,
  credit_limit: data.credit_limit,
  payment_terms_days: data.payment_terms_days,
  address: empty(data.address ?? null),
  area: empty(data.area ?? null),
  district: empty(data.district ?? null),
  division: empty(data.division ?? null),
  postal_code: empty(data.postal_code ?? null),
  country: empty(data.country ?? null),
  date_of_birth: empty(data.date_of_birth ?? null),
  gender: empty(data.gender ?? null),
  blood_group: empty(data.blood_group ?? null),
  allergies: empty(data.allergies ?? null),
  chronic_diseases: empty(data.chronic_diseases ?? null),
  doctor_reference: empty(data.doctor_reference ?? null),
  nid_passport: empty(data.nid_passport ?? null),
  notes: empty(data.notes ?? null),
  is_active: data.is_active,
});

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((input: z.input<typeof CustomerInput>) => CustomerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: dup } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", data.tenantId)
      .eq("phone", data.phone)
      .maybeSingle();
    if (dup) throw new Error("A customer with this mobile already exists.");

    const { data: inserted, error } = await supabase
      .from("customers")
      .insert({
        tenant_id: data.tenantId,
        ...buildPayload(data),
        opening_balance: data.opening_balance,
        due_balance: data.opening_balance,
      })
      .select("*")
      .single();
    if (error) throw error;

    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenantId,
      _action: "customer.created",
      _entity_table: "customers",
      _entity_id: inserted.id,
      _after: inserted as never,
    });

    return inserted;
  });

const UpdateInput = CustomerInput.extend({ id: z.string().uuid() });

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((input: z.input<typeof UpdateInput>) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: before } = await supabase
      .from("customers").select("*")
      .eq("tenant_id", data.tenantId).eq("id", data.id).maybeSingle();
    if (!before) throw new Error("Customer not found.");

    if (before.phone !== data.phone) {
      const { data: dup } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", data.tenantId)
        .eq("phone", data.phone)
        .neq("id", data.id)
        .maybeSingle();
      if (dup) throw new Error("Another customer already uses this mobile.");
    }

    const { data: after, error } = await supabase
      .from("customers")
      .update(buildPayload(data))
      .eq("tenant_id", data.tenantId)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;

    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenantId,
      _action: "customer.updated",
      _entity_table: "customers",
      _entity_id: data.id,
      _before: before as never,
      _after: after as never,
    });

    return after;
  });

const StatementInput = z.object({
  tenantId: z.string().uuid(),
  customerId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
});

export const customerStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((input: z.input<typeof StatementInput>) => StatementInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { buildCustomerLedger } = await import("./customer-ledger-unified");

    const { data: customer } = await supabase
      .from("customers")
      .select("id,customer_code,name,phone,email,address,credit_limit,opening_balance,due_balance")
      .eq("tenant_id", data.tenantId).eq("id", data.customerId).maybeSingle();
    if (!customer) throw new Error("Customer not found.");

    const [{ data: sales }, { data: payments }, { data: returns }] = await Promise.all([
      supabase.from("sales")
        .select("id,sale_date,invoice_no,total,paid,status")
        .eq("tenant_id", data.tenantId).eq("customer_id", data.customerId),
      supabase.from("customer_payments")
        .select("id,payment_date,amount,reference,sale_id")
        .eq("tenant_id", data.tenantId).eq("customer_id", data.customerId),
      supabase.from("sales_returns")
        .select("id,return_date,return_no,total")
        .eq("tenant_id", data.tenantId).eq("customer_id", data.customerId),
    ]);

    const { opening, entries, closing } = buildCustomerLedger({
      opening_balance: Number(customer.opening_balance ?? 0),
      sales: sales ?? [],
      payments: payments ?? [],
      returns: returns ?? [],
      from: data.from,
      to: data.to,
    });
    const { data: summaryDue } = await supabase.rpc("customer_due_summary", { p_customer_id: data.customerId });
    const authoritativeDue = Number(summaryDue ?? closing);

    const inWindow = entries.filter((e) => e.entry_type !== "opening");
    const sales_sum = inWindow.filter((e) => e.entry_type === "sale").reduce((s, e) => s + e.debit, 0);
    const payments_sum = inWindow.filter((e) => e.entry_type === "sale").reduce((s, e) => s + e.credit, 0)
      + inWindow.filter((e) => e.entry_type === "collection").reduce((s, e) => s + e.credit, 0);
    const returns_sum = inWindow.filter((e) => e.entry_type === "sales_return").reduce((s, e) => s + e.credit, 0);

    return {
      customer: { ...customer, due_balance: authoritativeDue },
      from: data.from,
      to: data.to,
      opening,
      closing: authoritativeDue,
      summary: { sales: sales_sum, payments: payments_sum, returns: returns_sum },
      entries: entries.map((e) => ({
        id: e.id,
        entry_date: e.entry_date,
        entry_type: e.entry_type,
        ref_no: e.ref_no,
        debit: e.debit,
        credit: e.credit,
        balance: e.balance,
        notes: null as string | null,
      })),
    };
  });
