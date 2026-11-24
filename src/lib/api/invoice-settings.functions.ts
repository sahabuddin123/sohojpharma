import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export const PRINT_FORMATS = ["38mm", "58mm", "80mm", "A4"] as const;
export type PrintFormat = (typeof PRINT_FORMATS)[number];

export type InvoiceSettingsRow = {
  invoice_prefix: string;
  starting_number: number;
  receipt_prefix: string;
  print_format: PrintFormat;
  footer_message: string;
  terms_conditions: string;
  drug_license: string;
  show_logo: boolean;
  show_qr: boolean;
  show_bin: boolean;
  show_tin: boolean;
  show_drug_license: boolean;
  show_signature: boolean;
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettingsRow = {
  invoice_prefix: "INV-",
  starting_number: 1000,
  receipt_prefix: "POS-",
  print_format: "A4",
  footer_message: "Thank you for your purchase!",
  terms_conditions: "",
  drug_license: "",
  show_logo: true,
  show_qr: true,
  show_bin: true,
  show_tin: true,
  show_drug_license: true,
  show_signature: false,
};

const WRITE_ROLES = ["owner", "corporate_admin"] as const;
const READ_ROLES = ["owner", "corporate_admin", "manager", "auditor"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasAnyRole(ctx: { supabase: any; userId: string }, tenant_id: string, roles: readonly string[]) {
  for (const r of roles) {
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (error) throw new Error(error.message);
    if (data) return r;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const SETTINGS_COLS =
  "invoice_prefix, starting_number, receipt_prefix, print_format, footer_message, terms_conditions, drug_license, show_logo, show_qr, show_bin, show_tin, show_drug_license, show_signature";

const Patch = z.object({
  invoice_prefix: z.string().min(1).max(10).optional(),
  starting_number: z.number().int().nonnegative().optional(),
  receipt_prefix: z.string().min(1).max(10).optional(),
  print_format: z.enum(PRINT_FORMATS).optional(),
  footer_message: z.string().max(5000).optional(),
  terms_conditions: z.string().max(10000).optional(),
  drug_license: z.string().max(120).optional(),
  show_logo: z.boolean().optional(),
  show_qr: z.boolean().optional(),
  show_bin: z.boolean().optional(),
  show_tin: z.boolean().optional(),
  show_drug_license: z.boolean().optional(),
  show_signature: z.boolean().optional(),
});

function merge(row: Partial<InvoiceSettingsRow> | null | undefined): InvoiceSettingsRow {
  return { ...DEFAULT_INVOICE_SETTINGS, ...((row ?? {}) as Partial<InvoiceSettingsRow>) };
}

export const getInvoiceSettingsRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<InvoiceSettingsRow> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    if (!role) throw new Error("Forbidden: insufficient role (403)");
    const { data: row, error } = await context.supabase
      .from("invoice_settings").select(SETTINGS_COLS)
      .eq("tenant_id", data.tenant_id).is("branch_id", null).maybeSingle();
    if (error) throw new Error(error.message);
    return merge(row as Partial<InvoiceSettingsRow> | null);
  });

export const updateInvoiceSettingsRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: Patch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<InvoiceSettingsRow> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin role required (403)");

    const { data: before } = await context.supabase
      .from("invoice_settings").select(SETTINGS_COLS)
      .eq("tenant_id", data.tenant_id).is("branch_id", null).maybeSingle();
    const prev = merge(before as Partial<InvoiceSettingsRow> | null);

    const payload = {
      tenant_id: data.tenant_id,
      branch_id: null,
      // company_name is NOT NULL on invoice_settings; ensure a value exists on first insert.
      company_name: "",
      ...prev,
      ...data.patch,
    };

    const { data: row, error } = await context.supabase
      .from("invoice_settings")
      .upsert(payload, { onConflict: "tenant_id,branch_id" })
      .select(SETTINGS_COLS)
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "invoice_settings.updated",
      _entity_table: "invoice_settings",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _before: prev as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _after: row as any,
    });

    return merge(row as Partial<InvoiceSettingsRow>);
  });

export const previewNextInvoiceNo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ next: string }> => {
    await assertMember(context, data.tenant_id);
    const { data: row } = await context.supabase
      .from("invoice_settings")
      .select("invoice_prefix, starting_number")
      .eq("tenant_id", data.tenant_id).is("branch_id", null).maybeSingle();
    const prefix = (row?.invoice_prefix as string) || "INV-";
    const start = Number(row?.starting_number ?? 1000);
    const month = new Date().toISOString().slice(0, 7).replace("-", "");
    const fullPrefix = `${prefix}${month}-`;

    const { data: sales } = await context.supabase
      .from("sales").select("invoice_no")
      .eq("tenant_id", data.tenant_id)
      .like("invoice_no", `${fullPrefix}%`);
    let maxSeq = 0;
    for (const s of (sales ?? []) as Array<{ invoice_no: string }>) {
      const m = s.invoice_no.match(new RegExp(`^${fullPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\d+)$`));
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
    }
    const next = Math.max(maxSeq + 1, start + 1);
    return { next: `${fullPrefix}${String(next).padStart(6, "0")}` };
  });
