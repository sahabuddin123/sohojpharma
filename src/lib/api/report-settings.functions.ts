import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type DateRange = "7d" | "30d" | "90d" | "365d";
export type ExportFormat = "xlsx" | "pdf" | "csv";

export type ReportSettings = {
  default_date_range: DateRange;
  default_export_format: ExportFormat;

  show_profit_reports: boolean;
  show_margin_reports: boolean;
  show_cost_price: boolean;

  enable_executive_reports: boolean;
  enable_clinical_reports: boolean;
  enable_financial_reports: boolean;
  enable_inventory_reports: boolean;
  enable_procurement_reports: boolean;

  enable_auto_refresh: boolean;
  report_refresh_interval: number;

  show_logo_in_exports: boolean;
  show_signature_in_exports: boolean;

  enable_scheduled_reports: boolean;
};

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  default_date_range: "30d",
  default_export_format: "xlsx",
  show_profit_reports: true,
  show_margin_reports: true,
  show_cost_price: true,
  enable_executive_reports: true,
  enable_clinical_reports: true,
  enable_financial_reports: true,
  enable_inventory_reports: true,
  enable_procurement_reports: true,
  enable_auto_refresh: true,
  report_refresh_interval: 300,
  show_logo_in_exports: true,
  show_signature_in_exports: false,
  enable_scheduled_reports: true,
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

const ReportPatch = z.object({
  default_date_range: z.enum(["7d", "30d", "90d", "365d"]).optional(),
  default_export_format: z.enum(["xlsx", "pdf", "csv"]).optional(),
  show_profit_reports: z.boolean().optional(),
  show_margin_reports: z.boolean().optional(),
  show_cost_price: z.boolean().optional(),
  enable_executive_reports: z.boolean().optional(),
  enable_clinical_reports: z.boolean().optional(),
  enable_financial_reports: z.boolean().optional(),
  enable_inventory_reports: z.boolean().optional(),
  enable_procurement_reports: z.boolean().optional(),
  enable_auto_refresh: z.boolean().optional(),
  report_refresh_interval: z.union([z.literal(60), z.literal(120), z.literal(300), z.literal(600)]).optional(),
  show_logo_in_exports: z.boolean().optional(),
  show_signature_in_exports: z.boolean().optional(),
  enable_scheduled_reports: z.boolean().optional(),
});

export const getReportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ReportSettings> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    if (!role) throw new Error("Forbidden: insufficient role (403)");
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("reports").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_REPORT_SETTINGS, ...((row?.reports ?? {}) as Partial<ReportSettings>) };
  });

export const updateReportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: ReportPatch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<ReportSettings> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin role required (403)");

    const sb = context.supabase;
    const { data: before } = await sb
      .from("tenant_settings").select("reports").eq("tenant_id", data.tenant_id).maybeSingle();
    const prev = (before?.reports ?? {}) as Partial<ReportSettings>;
    const next: ReportSettings = { ...DEFAULT_REPORT_SETTINGS, ...prev, ...data.patch };

    const { data: row, error } = await sb
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, reports: next, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("reports").single();
    if (error) throw new Error(error.message);

    await sb.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "reports_settings.updated",
      _entity_table: "tenant_settings",
      _before: prev,
      _after: row?.reports,
    });

    return { ...DEFAULT_REPORT_SETTINGS, ...((row?.reports ?? {}) as Partial<ReportSettings>) };
  });
