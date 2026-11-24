import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type MedicineStatus = "active" | "inactive" | "draft";

export type MedicineSettings = {
  require_generic: boolean;
  require_manufacturer: boolean;
  require_strength: boolean;
  require_medicine_type: boolean;
  require_pack_size: boolean;

  enable_alternative_medicine: boolean;
  enable_drug_interaction: boolean;
  enable_allergy_check: boolean;
  enable_dosage_validation: boolean;

  default_medicine_status: MedicineStatus;
  allow_duplicate_barcode: boolean;
  allow_duplicate_sku: boolean;

  auto_generate_sku: boolean;
  sku_prefix: string;
};

export const DEFAULT_MEDICINE_SETTINGS: MedicineSettings = {
  require_generic: true,
  require_manufacturer: true,
  require_strength: true,
  require_medicine_type: true,
  require_pack_size: false,

  enable_alternative_medicine: true,
  enable_drug_interaction: true,
  enable_allergy_check: true,
  enable_dosage_validation: true,

  default_medicine_status: "active",
  allow_duplicate_barcode: false,
  allow_duplicate_sku: false,

  auto_generate_sku: true,
  sku_prefix: "MED",
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

const MedPatch = z.object({
  require_generic: z.boolean().optional(),
  require_manufacturer: z.boolean().optional(),
  require_strength: z.boolean().optional(),
  require_medicine_type: z.boolean().optional(),
  require_pack_size: z.boolean().optional(),
  enable_alternative_medicine: z.boolean().optional(),
  enable_drug_interaction: z.boolean().optional(),
  enable_allergy_check: z.boolean().optional(),
  enable_dosage_validation: z.boolean().optional(),
  default_medicine_status: z.enum(["active", "inactive", "draft"]).optional(),
  allow_duplicate_barcode: z.boolean().optional(),
  allow_duplicate_sku: z.boolean().optional(),
  auto_generate_sku: z.boolean().optional(),
  sku_prefix: z.string().trim().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export const getMedicineSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MedicineSettings> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    if (!role) throw new Error("Forbidden: insufficient role (403)");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase as any)
      .from("tenant_settings").select("medicine").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_MEDICINE_SETTINGS, ...((row?.medicine ?? {}) as Partial<MedicineSettings>) };
  });

export const updateMedicineSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: MedPatch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<MedicineSettings> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin role required (403)");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: before } = await sb
      .from("tenant_settings").select("medicine").eq("tenant_id", data.tenant_id).maybeSingle();
    const prev = (before?.medicine ?? {}) as Partial<MedicineSettings>;
    const next: MedicineSettings = { ...DEFAULT_MEDICINE_SETTINGS, ...prev, ...data.patch };

    const { data: row, error } = await sb
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, medicine: next, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("medicine").single();
    if (error) throw new Error(error.message);

    await sb.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "medicine_settings.updated",
      _entity_table: "tenant_settings",
      _before: prev,
      _after: row?.medicine,
    });

    return { ...DEFAULT_MEDICINE_SETTINGS, ...((row?.medicine ?? {}) as Partial<MedicineSettings>) };
  });
