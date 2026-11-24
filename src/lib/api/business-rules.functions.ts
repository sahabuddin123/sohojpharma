import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type BusinessRules = {
  require_po_approval: boolean;
  require_grn_approval: boolean;
  require_transfer_approval: boolean;
  require_purchase_return_approval: boolean;
  allow_negative_stock: boolean;
  allow_backdated_entries: boolean;
  enable_fefo: boolean;
  enable_batch_tracking: boolean;
  enable_expiry_control: boolean;
  enable_supplier_ledger: boolean;
  enable_journal_posting: boolean;
  enable_clinical_safety: boolean;
  require_safety_ack: boolean;
};

export const DEFAULT_BUSINESS_RULES: BusinessRules = {
  require_po_approval: true,
  require_grn_approval: true,
  require_transfer_approval: true,
  require_purchase_return_approval: true,
  allow_negative_stock: false,
  allow_backdated_entries: false,
  enable_fefo: true,
  enable_batch_tracking: true,
  enable_expiry_control: true,
  enable_supplier_ledger: true,
  enable_journal_posting: true,
  enable_clinical_safety: true,
  require_safety_ack: true,
};

// ── Central runtime helper ──────────────────────────────────────
// Server-only callers (other createServerFn handlers) should use this
// instead of reading tenant_settings.business_rules directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadBusinessRules(supabase: any, tenantId: string): Promise<BusinessRules> {
  const { data } = await supabase
    .from("tenant_settings").select("business_rules").eq("tenant_id", tenantId).maybeSingle();
  return { ...DEFAULT_BUSINESS_RULES, ...((data?.business_rules ?? {}) as Partial<BusinessRules>) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertBusinessRule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, tenantId: string, flag: keyof BusinessRules,
): Promise<boolean> {
  const rules = await loadBusinessRules(supabase, tenantId);
  return !!rules[flag];
}

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

const RulesPatch = z.object({
  require_po_approval: z.boolean().optional(),
  require_grn_approval: z.boolean().optional(),
  require_transfer_approval: z.boolean().optional(),
  require_purchase_return_approval: z.boolean().optional(),
  allow_negative_stock: z.boolean().optional(),
  allow_backdated_entries: z.boolean().optional(),
  enable_fefo: z.boolean().optional(),
  enable_batch_tracking: z.boolean().optional(),
  enable_expiry_control: z.boolean().optional(),
  enable_supplier_ledger: z.boolean().optional(),
  enable_journal_posting: z.boolean().optional(),
  enable_clinical_safety: z.boolean().optional(),
  require_safety_ack: z.boolean().optional(),
});

export const getBusinessRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BusinessRules> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    if (!role) throw new Error("Forbidden: insufficient role (403)");
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("business_rules").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_BUSINESS_RULES, ...((row?.business_rules ?? {}) as Partial<BusinessRules>) };
  });

export const updateBusinessRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: RulesPatch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<BusinessRules> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin role required (403)");

    const { data: before } = await context.supabase
      .from("tenant_settings").select("business_rules").eq("tenant_id", data.tenant_id).maybeSingle();
    const prev = (before?.business_rules ?? {}) as Partial<BusinessRules>;
    const next: BusinessRules = { ...DEFAULT_BUSINESS_RULES, ...prev, ...data.patch };

    const { data: row, error } = await context.supabase
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, business_rules: next, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("business_rules").single();
    if (error) throw new Error(error.message);

    await context.supabase.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "business_rules.updated",
      _entity_table: "tenant_settings",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _before: prev as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _after: row?.business_rules as any,
    });

    return { ...DEFAULT_BUSINESS_RULES, ...((row?.business_rules ?? {}) as Partial<BusinessRules>) };
  });

// Member-readable rules for client-side runtime enforcement
// (POS, prescription UI, etc) — no role gate beyond tenant membership.
export const getActiveBusinessRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BusinessRules> => {
    await assertMember(context, data.tenant_id);
    return loadBusinessRules(context.supabase, data.tenant_id);
  });
