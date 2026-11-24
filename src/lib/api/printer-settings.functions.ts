import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const WRITE_ROLES = ["owner", "corporate_admin", "manager"] as const;

async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
async function assertCanWrite(ctx: { supabase: any; userId: string }, tenant_id: string) {
  for (const r of WRITE_ROLES) {
    const { data } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (data) return;
  }
  throw new Error("Forbidden — requires owner, admin or manager role");
}
async function logAudit(ctx: { supabase: any }, args: { tenant_id: string; action: string; entity?: string; before?: unknown; after?: unknown }) {
  await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: args.tenant_id,
    _action: args.action,
    _entity_table: args.entity ?? "tenant_settings",
    _before: (args.before as any) ?? undefined,
    _after: (args.after as any) ?? undefined,
  });
}

export type PrinterType = "thermal" | "a4" | "barcode" | "label" | "pdf";
export type ReceiptFormat = "38mm" | "58mm" | "80mm";

export type PrinterSettings = {
  default_receipt_printer: string | null;
  default_invoice_printer: string | null;
  default_barcode_printer: string | null;
  default_label_printer: string | null;
  auto_print_receipt: boolean;
  auto_print_invoice: boolean;
  auto_print_barcode: boolean;
  receipt_format: ReceiptFormat;
  invoice_format: "A4" | "Letter";
  barcode_format: string;
  thermal: { show_logo: boolean; show_footer: boolean; show_qr: boolean; show_tax_summary: boolean; show_cashier: boolean };
  a4: { show_header: boolean; show_footer: boolean; show_terms: boolean; show_signature: boolean; watermark: boolean };
  barcode: { symbology: "CODE128" | "EAN13" | "QR" | "DATAMATRIX"; label_size: string };
};

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  default_receipt_printer: null,
  default_invoice_printer: null,
  default_barcode_printer: null,
  default_label_printer: null,
  auto_print_receipt: false,
  auto_print_invoice: false,
  auto_print_barcode: false,
  receipt_format: "80mm",
  invoice_format: "A4",
  barcode_format: "standard",
  thermal: { show_logo: true, show_footer: true, show_qr: false, show_tax_summary: true, show_cashier: true },
  a4: { show_header: true, show_footer: true, show_terms: true, show_signature: true, watermark: false },
  barcode: { symbology: "CODE128", label_size: "40x20" },
};

export type PrinterProfile = {
  id: string; tenant_id: string; name: string;
  printer_type: PrinterType; driver: string | null; paper_size: string | null;
  status: "active" | "inactive";
  branch_id: string | null; warehouse_id: string | null;
  connection: Record<string, any>;
  created_at: string; updated_at: string;
};

export type PrintTemplate = {
  id: string; tenant_id: string; name: string;
  template_type: string; content: Record<string, any>;
  status: "active" | "inactive";
  created_at: string; updated_at: string;
};

export const getPrinterSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PrinterSettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("printers")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    const existing = (row?.printers as object) ?? {};
    return { ...DEFAULT_PRINTER_SETTINGS, ...existing } as PrinterSettings;
  });

export const updatePrinterSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), patch: z.record(z.string(), z.any()) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PrinterSettings> => {
    await assertCanWrite(context, data.tenant_id);
    const { data: existing } = await context.supabase
      .from("tenant_settings").select("printers")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    const before = { ...DEFAULT_PRINTER_SETTINGS, ...((existing?.printers as object) ?? {}) } as PrinterSettings;
    const after = { ...before, ...data.patch } as PrinterSettings;
    const { error } = await context.supabase
      .from("tenant_settings")
      .upsert({ tenant_id: data.tenant_id, printers: after }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "printer_settings.updated", before, after });
    return after;
  });

export const listPrinters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PrinterProfile[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("printer_profiles").select("*")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as PrinterProfile[];
  });

const PrinterInput = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  printer_type: z.enum(["thermal","a4","barcode","label","pdf"]),
  driver: z.string().max(80).nullable().optional(),
  paper_size: z.string().max(40).nullable().optional(),
  status: z.enum(["active","inactive"]).default("active"),
  branch_id: z.string().uuid().nullable().optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
  connection: z.record(z.string(), z.any()).default({}),
});

export const upsertPrinter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => PrinterInput.parse(d))
  .handler(async ({ data, context }): Promise<PrinterProfile> => {
    await assertCanWrite(context, data.tenant_id);
    const payload = {
      tenant_id: data.tenant_id,
      name: data.name,
      printer_type: data.printer_type,
      driver: data.driver ?? null,
      paper_size: data.paper_size ?? null,
      status: data.status ?? "active",
      branch_id: data.branch_id ?? null,
      warehouse_id: data.warehouse_id ?? null,
      connection: data.connection ?? {},
      ...(data.id ? { id: data.id } : { created_by: context.userId }),
    };
    const { data: row, error } = await context.supabase
      .from("printer_profiles").upsert(payload as any, { onConflict: "id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    await logAudit(context, {
      tenant_id: data.tenant_id,
      action: data.id ? "printer.updated" : "printer.created",
      entity: "printer_profiles", after: row,
    });
    return row as PrinterProfile;
  });

export const deletePrinter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanWrite(context, data.tenant_id);
    const { error } = await context.supabase
      .from("printer_profiles").delete()
      .eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "printer.deleted", entity: "printer_profiles", before: { id: data.id } });
    return { ok: true };
  });

export const testPrinter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; queued_at: string }> => {
    await assertCanWrite(context, data.tenant_id);
    const queued_at = new Date().toISOString();
    await logAudit(context, {
      tenant_id: data.tenant_id, action: "printer.tested",
      entity: "printer_profiles", after: { id: data.id, queued_at },
    });
    return { ok: true, queued_at };
  });

export const listPrintTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PrintTemplate[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("print_templates").select("*")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as PrintTemplate[];
  });
