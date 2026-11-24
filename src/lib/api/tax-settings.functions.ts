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

export type RoundingMethod = "nearest" | "up" | "down" | "bankers";
export type TaxProfileType = "standard" | "zero" | "exempt" | "reduced";

export type TaxSettings = {
  vat_enabled: boolean;
  default_sales_vat: number;
  default_purchase_vat: number;
  price_includes_vat: boolean;
  show_vat_on_invoice: boolean;
  show_vat_registration: boolean;
  show_bin: boolean;
  enable_multi_tax: boolean;
  rounding_method: RoundingMethod;
  tax_exempt_sales: boolean;
  tax_exempt_purchases: boolean;
};

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  vat_enabled: true,
  default_sales_vat: 15,
  default_purchase_vat: 15,
  price_includes_vat: false,
  show_vat_on_invoice: true,
  show_vat_registration: true,
  show_bin: true,
  enable_multi_tax: false,
  rounding_method: "nearest",
  tax_exempt_sales: false,
  tax_exempt_purchases: false,
};

export type TaxProfile = {
  id: string;
  tenant_id: string;
  name: string;
  rate: number;
  type: TaxProfileType;
  status: "active" | "inactive";
  description: string | null;
  created_at: string;
  updated_at: string;
};

export const getTaxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TaxSettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("tax")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_TAX_SETTINGS, ...((row?.tax as object) ?? {}) };
  });

export const updateTaxSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      patch: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<TaxSettings> => {
    await assertCanWrite(context, data.tenant_id);
    const { data: existing } = await context.supabase
      .from("tenant_settings").select("tax")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    const before = { ...DEFAULT_TAX_SETTINGS, ...((existing?.tax as object) ?? {}) };
    const after = { ...before, ...data.patch } as TaxSettings;
    const { error } = await context.supabase
      .from("tenant_settings")
      .upsert({ tenant_id: data.tenant_id, tax: after }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "tax_settings.updated", before, after });
    return after;
  });

export const listTaxProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TaxProfile[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("tax_profiles").select("*")
      .eq("tenant_id", data.tenant_id)
      .order("rate", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TaxProfile[];
  });

const ProfileInput = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  rate: z.number().min(0).max(100),
  type: z.enum(["standard", "zero", "exempt", "reduced"]),
  status: z.enum(["active", "inactive"]).default("active"),
  description: z.string().max(500).nullable().optional(),
});

export const upsertTaxProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => ProfileInput.parse(d))
  .handler(async ({ data, context }): Promise<TaxProfile> => {
    await assertCanWrite(context, data.tenant_id);
    const payload = {
      tenant_id: data.tenant_id,
      name: data.name,
      rate: data.rate,
      type: data.type,
      status: data.status ?? "active",
      description: data.description ?? null,
      ...(data.id ? { id: data.id } : { created_by: context.userId }),
    };

    const { data: row, error } = await context.supabase
      .from("tax_profiles").upsert(payload as any, { onConflict: "id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    await logAudit(context, {
      tenant_id: data.tenant_id,
      action: data.id ? "tax_profile.updated" : "tax_profile.created",
      entity: "tax_profiles",
      after: row,
    });
    return row as TaxProfile;
  });

export const deleteTaxProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanWrite(context, data.tenant_id);
    const { error } = await context.supabase
      .from("tax_profiles").delete()
      .eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, {
      tenant_id: data.tenant_id, action: "tax_profile.deleted",
      entity: "tax_profiles", before: { id: data.id },
    });
    return { ok: true };
  });
