import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type InventorySettings = {
  default_expiry_warning_days: number;
  default_low_stock_threshold: number;
  enable_batch_tracking: boolean;
  enable_expiry_tracking: boolean;
  enable_fefo: boolean;
  enable_stock_adjustment_reason: boolean;
  enable_negative_stock: boolean;
  auto_generate_batch_no: boolean;
  require_batch_on_purchase: boolean;
  require_expiry_on_purchase: boolean;
  allow_expired_transfer: boolean;
  allow_recalled_transfer: boolean;
};

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  default_expiry_warning_days: 90,
  default_low_stock_threshold: 10,
  enable_batch_tracking: true,
  enable_expiry_tracking: true,
  enable_fefo: true,
  enable_stock_adjustment_reason: true,
  enable_negative_stock: false,
  auto_generate_batch_no: true,
  require_batch_on_purchase: true,
  require_expiry_on_purchase: true,
  allow_expired_transfer: false,
  allow_recalled_transfer: false,
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

const InvPatch = z.object({
  default_expiry_warning_days: z.number().int().min(1).max(720).optional(),
  default_low_stock_threshold: z.number().int().min(0).max(100000).optional(),
  enable_batch_tracking: z.boolean().optional(),
  enable_expiry_tracking: z.boolean().optional(),
  enable_fefo: z.boolean().optional(),
  enable_stock_adjustment_reason: z.boolean().optional(),
  enable_negative_stock: z.boolean().optional(),
  auto_generate_batch_no: z.boolean().optional(),
  require_batch_on_purchase: z.boolean().optional(),
  require_expiry_on_purchase: z.boolean().optional(),
  allow_expired_transfer: z.boolean().optional(),
  allow_recalled_transfer: z.boolean().optional(),
});

export const getInventorySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<InventorySettings> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    if (!role) throw new Error("Forbidden: insufficient role (403)");
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("inventory").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_INVENTORY_SETTINGS, ...((row?.inventory ?? {}) as Partial<InventorySettings>) };
  });

export const updateInventorySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: InvPatch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<InventorySettings> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin role required (403)");

    const { data: before } = await context.supabase
      .from("tenant_settings").select("inventory").eq("tenant_id", data.tenant_id).maybeSingle();
    const prev = (before?.inventory ?? {}) as Partial<InventorySettings>;
    const next: InventorySettings = { ...DEFAULT_INVENTORY_SETTINGS, ...prev, ...data.patch };

    const { data: row, error } = await context.supabase
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, inventory: next, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("inventory").single();
    if (error) throw new Error(error.message);

    await context.supabase.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "inventory_settings.updated",
      _entity_table: "tenant_settings",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _before: prev as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _after: row?.inventory as any,
    });

    return { ...DEFAULT_INVENTORY_SETTINGS, ...((row?.inventory ?? {}) as Partial<InventorySettings>) };
  });
