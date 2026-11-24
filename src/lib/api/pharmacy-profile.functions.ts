import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export const PROFILE_FIELDS = [
  "name", "business_type", "trade_license_no", "drug_license_no", "bin", "tin",
  "phone", "mobile", "email", "website",
  "address_line", "area", "district", "division", "postal_code", "country",
  "owner_name", "manager_name", "opening_date",
  "logo_url", "receipt_logo_url",
  "profile_updated_at", "profile_updated_by",
] as const;

export type PharmacyProfile = {
  id: string;
  name: string;
  business_type: string | null;
  trade_license_no: string | null;
  drug_license_no: string | null;
  bin: string | null;
  tin: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  address_line: string | null;
  area: string | null;
  district: string | null;
  division: string | null;
  postal_code: string | null;
  country: string | null;
  owner_name: string | null;
  manager_name: string | null;
  opening_date: string | null;
  logo_url: string | null;
  receipt_logo_url: string | null;
  profile_updated_at: string | null;
  profile_updated_by: string | null;
};

const WRITE_ROLES = ["owner", "corporate_admin"] as const;

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
  const { data, error } = await ctx.supabase.rpc("is_tenant_member", {
    _user_id: ctx.userId, _tenant_id: tenant_id,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const SELECT_COLS = PROFILE_FIELDS.join(",") + ",id";

export const getPharmacyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenants").select(SELECT_COLS).eq("id", data.tenant_id).single();
    if (error) throw new Error(error.message);
    return row as unknown as PharmacyProfile;
  });

const ProfilePatch = z.object({
  name: z.string().trim().min(1, "Pharmacy name is required").max(200),
  business_type: z.string().trim().max(100).nullish(),
  trade_license_no: z.string().trim().max(100).nullish(),
  drug_license_no: z.string().trim().max(100).nullish(),
  bin: z.string().trim().regex(/^\d*$/, "BIN must be numeric").max(30).nullish(),
  tin: z.string().trim().regex(/^\d*$/, "TIN must be numeric").max(30).nullish(),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  mobile: z.string().trim().max(40).nullish(),
  email: z.union([z.literal(""), z.string().email("Invalid email")]).nullish(),
  website: z.union([z.literal(""), z.string().url("Invalid website URL")]).nullish(),
  address_line: z.string().trim().max(300).nullish(),
  area: z.string().trim().max(100).nullish(),
  district: z.string().trim().max(100).nullish(),
  division: z.string().trim().max(100).nullish(),
  postal_code: z.string().trim().max(20).nullish(),
  country: z.string().trim().max(100).nullish(),
  owner_name: z.string().trim().max(150).nullish(),
  manager_name: z.string().trim().max(150).nullish(),
  opening_date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")]).nullish(),
  logo_url: z.string().trim().max(1000).nullish(),
  receipt_logo_url: z.string().trim().max(1000).nullish(),
});

export const updatePharmacyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: ProfilePatch,
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin required (403)");

    const { data: before, error: bErr } = await context.supabase
      .from("tenants").select(SELECT_COLS).eq("id", data.tenant_id).single();
    if (bErr) throw new Error(bErr.message);

    const patch = data.patch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" ) update[k] = null;
      else if (v !== undefined) update[k] = v;
    }
    update.profile_updated_at = new Date().toISOString();
    update.profile_updated_by = context.userId;

    const { data: after, error } = await context.supabase
      .from("tenants").update(update as never).eq("id", data.tenant_id).select(SELECT_COLS).single();
    if (error) throw new Error(error.message);

    const audit = await context.supabase.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "pharmacy_profile.updated",
      _entity_table: "tenants",
      _entity_id: data.tenant_id,
      _before: before as never,
      _after: after as never,
    });
    if (audit.error) console.error("audit failed", audit.error.message);

    return after as unknown as PharmacyProfile;
  });
