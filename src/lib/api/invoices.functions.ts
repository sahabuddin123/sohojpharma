import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const Kind = z.enum(["sale", "purchase"]);
const Status = z.enum(["draft", "pending", "paid", "partial", "due", "cancelled", "returned"]);
export type DerivedStatus = z.infer<typeof Status>;

export const InvoiceSettingsSchema = z.object({
  header: z.string().max(200).default(""),
  footer: z.string().max(400).default(""),
  thankYou: z.string().max(200).default("Thank you for shopping with us!"),
  terms: z.string().max(800).default(""),
  paper: z.enum(["38mm", "58mm", "80mm", "a4"]).default("80mm"),
  showLogo: z.boolean().default(true),
  pharmacyName: z.string().max(120).default(""),
  address: z.string().max(200).default(""),
  mobile: z.string().max(40).default(""),
  logoUrl: z.string().url().or(z.literal("")).default(""),
});
export type InvoiceSettings = z.infer<typeof InvoiceSettingsSchema>;

interface InvoiceRow {
  id: string;
  invoice_no: string;
  date: string;
  total: number;
  paid: number;
  due: number;
  status: string;
  is_return: boolean;
  derived_status: DerivedStatus;
  edit_count: number;
}

function derive(r: { status: string; paid: number; due: number; is_return: boolean }): DerivedStatus {
  if (r.is_return) return "returned";
  if (r.status === "void") return "cancelled";
  if (r.status === "draft") return "draft";
  if (r.due <= 0) return "paid";
  if (r.paid > 0 && r.due > 0) return "partial";
  if (r.paid === 0 && r.due > 0) return "due";
  return "pending";
}

export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    kind: Kind.default("sale"),
    search: z.string().max(80).optional(),
    status: Status.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }))
  .handler(async ({ data, context }): Promise<InvoiceRow[]> => {
    const rows: InvoiceRow[] = [];
    if (data.kind === "sale") {
      let q = context.supabase.from("sales")
        .select("id, invoice_no, sale_date, total, paid, due, status, is_return")
        .eq("tenant_id", data.tenantId)
        .order("sale_date", { ascending: false }).limit(data.limit);
      if (data.search) q = q.ilike("invoice_no", `%${data.search}%`);
      if (data.from) q = q.gte("sale_date", data.from);
      if (data.to) q = q.lte("sale_date", data.to);
      const { data: r, error } = await q;
      if (error) throw new Error(error.message);
      for (const s of r ?? []) {
        rows.push({
          id: s.id, invoice_no: s.invoice_no, date: s.sale_date,
          total: Number(s.total), paid: Number(s.paid), due: Number(s.due),
          status: s.status, is_return: s.is_return,
          derived_status: derive({ status: s.status, paid: Number(s.paid), due: Number(s.due), is_return: s.is_return }),
          edit_count: 0,
        });
      }
      // Attach edit counts for sale invoices
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const { data: edits } = await context.supabase
          .from("invoice_edit_history")
          .select("sale_id")
          .in("sale_id", ids);
        const counts = new Map<string, number>();
        for (const e of edits ?? []) {
          counts.set(e.sale_id as string, (counts.get(e.sale_id as string) ?? 0) + 1);
        }
        for (const r of rows) r.edit_count = counts.get(r.id) ?? 0;
      }
    } else {
      let q = context.supabase.from("purchases")
        .select("id, invoice_no, purchase_date, total, paid, due, status, is_return")
        .eq("tenant_id", data.tenantId)
        .order("purchase_date", { ascending: false }).limit(data.limit);
      if (data.search) q = q.ilike("invoice_no", `%${data.search}%`);
      if (data.from) q = q.gte("purchase_date", data.from);
      if (data.to) q = q.lte("purchase_date", data.to);
      const { data: r, error } = await q;
      if (error) throw new Error(error.message);
      for (const p of r ?? []) {
        rows.push({
          id: p.id, invoice_no: p.invoice_no, date: p.purchase_date,
          total: Number(p.total), paid: Number(p.paid), due: Number(p.due),
          status: p.status, is_return: p.is_return,
          derived_status: derive({ status: p.status, paid: Number(p.paid), due: Number(p.due), is_return: p.is_return }),
          edit_count: 0,
        });
      }
    }
    return data.status ? rows.filter((r) => r.derived_status === data.status) : rows;
  });

export const getInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    kind: Kind.default("sale"),
    id: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    if (data.kind === "sale") {
      const { data: sale, error } = await context.supabase
        .from("sales")
        .select("*, customer:customers(name,phone,address), items:sale_items(*), payments:sale_payments(*)")
        .eq("tenant_id", data.tenantId).eq("id", data.id).maybeSingle();
      if (error || !sale) throw new Error(error?.message ?? "Invoice not found");
      return { kind: "sale" as const, invoice: sale };
    }
    const { data: pur, error } = await context.supabase
      .from("purchases")
      .select("*, supplier:suppliers(name,phone,address), items:purchase_items(*)")
      .eq("tenant_id", data.tenantId).eq("id", data.id).maybeSingle();
    if (error || !pur) throw new Error(error?.message ?? "Invoice not found");
    return { kind: "purchase" as const, invoice: pur };
  });

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    branchId: z.string().uuid(),
    id: z.string().uuid(),
    reason: z.string().trim().min(3, "Reason is required").max(400),
    reverseStock: z.boolean().default(true),
  }))
  .handler(async ({ data, context }) => {
    await assertBranchWrite(context.supabase, data.tenantId, data.branchId);
    const { error } = await context.supabase.rpc("cancel_sale_invoice", {
      _tenant_id: data.tenantId,
      _sale_id: data.id,
      _reason: data.reason,
      _reverse_stock: data.reverseStock,
    });
    if (error) throw new Error(error.message);
    await context.supabase.rpc("audit_log_event", {
      _action: "invoice.cancelled",
      _entity_type: "sales",
      _entity_id: data.id,
      _tenant_id: data.tenantId,
      _branch_id: data.branchId,
      _metadata: { reason: data.reason, reverseStock: data.reverseStock },
    });
    return { ok: true };
  });

const PaymentMethod = z.enum(["cash", "bkash", "nagad", "rocket", "bank", "card", "other"]);

export const addInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    branchId: z.string().uuid(),
    kind: Kind.default("sale"),
    id: z.string().uuid(),
    amount: z.number().positive(),
    method: PaymentMethod.default("cash"),
    reference: z.string().max(80).optional(),
  }))
  .handler(async ({ data, context }) => {
    if (data.kind !== "sale") throw new Error("Payments supported on sales only");
    await assertBranchWrite(context.supabase, data.tenantId, data.branchId);
    const { data: sale, error: sErr } = await context.supabase
      .from("sales").select("paid,due,total")
      .eq("tenant_id", data.tenantId).eq("id", data.id).maybeSingle();
    if (sErr || !sale) throw new Error(sErr?.message ?? "Invoice not found");
    if (data.amount > Number(sale.due) + 0.001) throw new Error("Amount exceeds due");
    const { data: inserted, error: pErr } = await context.supabase.from("sale_payments").insert({
      tenant_id: data.tenantId, branch_id: data.branchId, sale_id: data.id,
      amount: data.amount, method: data.method,
      reference: data.reference ?? null, created_by: context.userId,
    }).select("id").single();
    if (pErr) throw new Error(pErr.message);
    const newPaid = Number(sale.paid) + data.amount;
    const newDue = Math.max(0, Number(sale.total) - newPaid);
    const { error: uErr } = await context.supabase.from("sales")
      .update({ paid: newPaid, due: newDue, status: newDue <= 0 ? "completed" : "partial" })
      .eq("tenant_id", data.tenantId).eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    await context.supabase.rpc("audit_log_event", {
      _action: "invoice.payment_added",
      _entity_type: "sale_payments",
      _entity_id: inserted?.id ?? data.id,
      _tenant_id: data.tenantId,
      _branch_id: data.branchId,
      _metadata: { amount: data.amount, method: data.method, sale_id: data.id },
    });
    return { ok: true };
  });


export const updateSaleInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    branchId: z.string().uuid(),
    id: z.string().uuid(),
    customer_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    items: z.array(z.object({
      id: z.string().uuid(),
      qty: z.number().min(0),
      unit_price: z.number().min(0),
      discount: z.number().min(0).default(0),
      vat: z.number().min(0).default(0),
    })).min(1),
  }))
  .handler(async ({ data, context }) => {
    // Role gate: manager or owner
    const { data: allowed, error: rErr } = await context.supabase
      .rpc("is_manager_or_owner", { _user_id: context.userId, _tenant_id: data.tenantId });
    if (rErr) throw new Error(rErr.message);
    if (!allowed) throw new Error("Forbidden: manager or admin only");

    // Load current sale to validate editability
    const { data: sale, error: sErr } = await context.supabase
      .from("sales").select("status,is_return,paid,total,customer_id,notes")
      .eq("tenant_id", data.tenantId).eq("id", data.id).maybeSingle();
    if (sErr || !sale) throw new Error(sErr?.message ?? "Invoice not found");
    if (sale.is_return) throw new Error("Returned invoice cannot be edited");
    if (sale.status === "void") throw new Error("Cancelled invoice cannot be edited");
    if (sale.status === "completed" && Number(sale.paid) >= Number(sale.total))
      throw new Error("Fully paid invoice is locked");

    // Recalculate totals
    let subtotal = 0, discount = 0, vat = 0;
    const lines = data.items.map((it) => {
      const gross = it.qty * it.unit_price;
      const lineTotal = Math.max(0, gross - it.discount + it.vat);
      subtotal += gross;
      discount += it.discount;
      vat += it.vat;
      return { ...it, line_total: lineTotal };
    });
    const total = Math.max(0, subtotal - discount + vat);
    const paid = Number(sale.paid);
    const due = Math.max(0, total - paid);
    const newStatus = due <= 0 ? "completed" : paid > 0 ? "partial" : "completed";

    // Update line items
    for (const ln of lines) {
      const { error } = await context.supabase.from("sale_items")
        .update({ qty: ln.qty, unit_price: ln.unit_price, discount: ln.discount, vat: ln.vat, line_total: ln.line_total })
        .eq("tenant_id", data.tenantId).eq("id", ln.id);
      if (error) throw new Error(error.message);
    }

    const headerPatch: Record<string, unknown> = {
      subtotal, discount, vat, total, due, status: newStatus,
    };
    if (data.customer_id !== undefined) headerPatch.customer_id = data.customer_id;
    if (data.notes !== undefined) headerPatch.notes = data.notes;

    const { error: uErr } = await context.supabase.from("sales")
      .update(headerPatch as never).eq("tenant_id", data.tenantId).eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId, branch_id: data.branchId, user_id: context.userId,
      action: "invoice.edited", entity_table: "sales", entity_id: data.id,
      before_data: { customer_id: sale.customer_id, notes: sale.notes, total: sale.total } as never,
      after_data: { customer_id: headerPatch.customer_id ?? sale.customer_id, notes: headerPatch.notes ?? sale.notes, total } as never,
    });

    return { ok: true, total, due, status: newStatus };
  });

export const getInvoiceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({ tenantId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: t, error } = await context.supabase
      .from("tenants")
      .select("invoice_settings,name,address_line,area,district,division,country,postal_code,phone,mobile,logo_url,receipt_logo_url")
      .eq("id", data.tenantId).maybeSingle();
    if (error || !t) throw new Error(error?.message ?? "Tenant not found");
    const parsed = InvoiceSettingsSchema.safeParse(t.invoice_settings ?? {});
    const base = parsed.success ? parsed.data : InvoiceSettingsSchema.parse({});

    // Merge tenant-level invoice_settings row (Settings → Invoice page writes here)
    const { data: row } = await context.supabase
      .from("invoice_settings")
      .select("company_name,address,phone,logo_url,show_logo,footer_message,terms_conditions,thermal_width,print_format")
      .eq("tenant_id", data.tenantId).is("branch_id", null).maybeSingle();

    // Also merge tenant_settings.branding (Settings → Branding panel) as a secondary fallback.
    const { data: brandRow } = await context.supabase
      .from("tenant_settings").select("branding")
      .eq("tenant_id", data.tenantId).maybeSingle();
    const brand = ((brandRow?.branding ?? {}) as Record<string, unknown>);

    const r = (row ?? {}) as Record<string, unknown>;
    const paperRaw = (r.thermal_width as string | null) ?? (r.print_format as string | null) ?? base.paper;
    const paper = paperRaw === "58mm" || paperRaw === "80mm" || paperRaw === "a4" ? paperRaw : base.paper;

    // Build a fallback address from tenant store profile fields
    const tenantAddress = [t.address_line, t.area, t.district, t.division, t.postal_code, t.country]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(", ");
    const tenantPhone = (t.phone as string) || (t.mobile as string) || "";
    const tenantLogo = (t.receipt_logo_url as string) || (t.logo_url as string) || "";
    const brandFooter = (brand.invoice_footer as string) || (brand.receipt_footer as string) || "";

    return {
      ...base,
      pharmacyName: (r.company_name as string) || base.pharmacyName || t.name,
      address: (r.address as string) || base.address || tenantAddress,
      mobile: (r.phone as string) || base.mobile || tenantPhone,
      logoUrl: (r.logo_url as string) || base.logoUrl || tenantLogo,
      showLogo: typeof r.show_logo === "boolean" ? (r.show_logo as boolean) : base.showLogo,
      footer: (r.footer_message as string) || brandFooter || base.footer,
      terms: (r.terms_conditions as string) || base.terms,
      paper,
    };
  });


export const updateInvoiceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    settings: InvoiceSettingsSchema,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tenants").update({ invoice_settings: data.settings as never }).eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId, user_id: context.userId,
      action: "invoice.settings_updated", entity_table: "tenants", entity_id: data.tenantId,
    });
    return { ok: true };
  });

export interface HistoryItem {
  product_id: string;
  product_name: string | null;
  qty: number;
  unit_price: number;
  discount: number;
  vat: number;
  line_total: number;
}

export interface InvoiceEditHistoryRow {
  id: string;
  edited_at: string;
  edited_by: string | null;
  editor_name: string | null;
  old_total: number;
  new_total: number;
  old_paid: number;
  new_paid: number;
  old_due: number;
  new_due: number;
  old_items: HistoryItem[];
  new_items: HistoryItem[];
  reason: string | null;
}

export const getInvoiceHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("sales")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    saleId: z.string().uuid(),
  }))
  .handler(async ({ data, context }): Promise<InvoiceEditHistoryRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("invoice_edit_history")
      .select("id, edited_at, edited_by, old_total, new_total, old_paid, new_paid, old_due, new_due, old_items, new_items, reason")
      .eq("tenant_id", data.tenantId)
      .eq("sale_id", data.saleId)
      .order("edited_at", { ascending: true });
    if (error) throw new Error(error.message);
    const editorIds = Array.from(new Set((rows ?? []).map((r) => r.edited_by).filter(Boolean) as string[]));
    const nameMap = new Map<string, string>();
    if (editorIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", editorIds);
      for (const p of profs ?? []) {
        nameMap.set(p.id as string, (p.full_name as string) ?? "");
      }
    }
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      edited_at: r.edited_at as string,
      edited_by: (r.edited_by as string | null) ?? null,
      editor_name: r.edited_by ? (nameMap.get(r.edited_by as string) ?? null) : null,
      old_total: Number(r.old_total), new_total: Number(r.new_total),
      old_paid: Number(r.old_paid), new_paid: Number(r.new_paid),
      old_due: Number(r.old_due), new_due: Number(r.new_due),
      old_items: (Array.isArray(r.old_items) ? r.old_items : []) as unknown as HistoryItem[],
      new_items: (Array.isArray(r.new_items) ? r.new_items : []) as unknown as HistoryItem[],
      reason: (r.reason as string | null) ?? null,
    }));
  });
