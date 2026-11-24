import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type BrandingSettings = {
  logo_url?: string | null;
  receipt_logo_url?: string | null;
  favicon_url?: string | null;
  signature_url?: string | null;
  logo_path?: string | null;
  receipt_logo_path?: string | null;
  favicon_path?: string | null;
  signature_path?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  invoice_footer?: string | null;
  receipt_footer?: string | null;
};

export const BRANDING_ASSETS = ["logo", "receipt_logo", "favicon", "signature"] as const;
export type BrandingAsset = (typeof BRANDING_ASSETS)[number];

const WRITE_ROLES = ["owner", "corporate_admin"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertWrite(ctx: { supabase: any; userId: string }, tenant_id: string) {
  for (const r of WRITE_ROLES) {
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (error) throw new Error(error.message);
    if (data) return r;
  }
  throw new Error("Forbidden: owner or corporate_admin role required (403)");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function audit(ctx: { supabase: any }, args: { tenant_id: string; action: string; before?: unknown; after?: unknown }) {
  const res = await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: args.tenant_id,
    _action: args.action,
    _entity_table: "tenant_settings",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _before: (args.before as any) ?? undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _after: (args.after as any) ?? undefined,
  });
  if (res.error) console.error("audit failed", res.error.message);
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BrandingPatch = z.object({
  logo_url: z.string().trim().max(2000).nullish(),
  receipt_logo_url: z.string().trim().max(2000).nullish(),
  favicon_url: z.string().trim().max(2000).nullish(),
  signature_url: z.string().trim().max(2000).nullish(),
  logo_path: z.string().trim().max(500).nullish(),
  receipt_logo_path: z.string().trim().max(500).nullish(),
  favicon_path: z.string().trim().max(500).nullish(),
  signature_path: z.string().trim().max(500).nullish(),
  primary_color: z.string().trim().regex(HEX, "Invalid color").nullish(),
  secondary_color: z.string().trim().regex(HEX, "Invalid color").nullish(),
  invoice_footer: z.string().trim().max(1000).nullish(),
  receipt_footer: z.string().trim().max(1000).nullish(),
});

export const getBrandingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BrandingSettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("branding").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return ((row?.branding ?? {}) as BrandingSettings);
  });

export const updateBrandingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: BrandingPatch,
    action: z.enum(["branding.updated", "branding.asset_uploaded", "branding.asset_deleted"]).default("branding.updated"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    await assertWrite(context, data.tenant_id);

    const { data: before } = await context.supabase
      .from("tenant_settings").select("branding").eq("tenant_id", data.tenant_id).maybeSingle();
    const prevBranding = ((before?.branding ?? {}) as Record<string, unknown>);
    const nextBranding = { ...prevBranding, ...data.patch };

    const { data: row, error } = await context.supabase
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, branding: nextBranding, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("branding").single();
    if (error) throw new Error(error.message);

    await audit(context, {
      tenant_id: data.tenant_id, action: data.action,
      before: prevBranding, after: row?.branding,
    });

    return (row?.branding ?? {}) as BrandingSettings;
  });
