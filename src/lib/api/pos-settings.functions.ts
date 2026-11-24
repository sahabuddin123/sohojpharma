import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type PosSettings = {
  default_warehouse_id: string | null;
  default_customer_id: string | null;
  barcode_auto_search: boolean;
  barcode_auto_add: boolean;
  customer_required: boolean;
  auto_print_receipt: boolean;
  allow_discount: boolean;
  allow_manual_price: boolean;
  show_profit_margin: boolean;
  enable_hold_sale: boolean;
  enable_split_payment: boolean;
  cash_drawer_enabled: boolean;
};

export const DEFAULT_POS_SETTINGS: PosSettings = {
  default_warehouse_id: null,
  default_customer_id: null,
  barcode_auto_search: true,
  barcode_auto_add: true,
  customer_required: false,
  auto_print_receipt: false,
  allow_discount: true,
  allow_manual_price: false,
  show_profit_margin: false,
  enable_hold_sale: true,
  enable_split_payment: true,
  cash_drawer_enabled: false,
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

const PosPatch = z.object({
  default_warehouse_id: z.string().uuid().nullable().optional(),
  default_customer_id: z.string().uuid().nullable().optional(),
  barcode_auto_search: z.boolean().optional(),
  barcode_auto_add: z.boolean().optional(),
  customer_required: z.boolean().optional(),
  auto_print_receipt: z.boolean().optional(),
  allow_discount: z.boolean().optional(),
  allow_manual_price: z.boolean().optional(),
  show_profit_margin: z.boolean().optional(),
  enable_hold_sale: z.boolean().optional(),
  enable_split_payment: z.boolean().optional(),
  cash_drawer_enabled: z.boolean().optional(),
});

export const getPosSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PosSettings> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    if (!role) throw new Error("Forbidden: insufficient role (403)");
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("pos").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_POS_SETTINGS, ...((row?.pos ?? {}) as Partial<PosSettings>) };
  });

export const updatePosSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: PosPatch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<PosSettings> => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin role required (403)");

    const { data: before } = await context.supabase
      .from("tenant_settings").select("pos").eq("tenant_id", data.tenant_id).maybeSingle();
    const prev = (before?.pos ?? {}) as Partial<PosSettings>;
    const next: PosSettings = { ...DEFAULT_POS_SETTINGS, ...prev, ...data.patch };

    const { data: row, error } = await context.supabase
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, pos: next, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("pos").single();
    if (error) throw new Error(error.message);

    await context.supabase.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "pos_settings.updated",
      _entity_table: "tenant_settings",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _before: prev as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _after: row?.pos as any,
    });

    return { ...DEFAULT_POS_SETTINGS, ...((row?.pos ?? {}) as Partial<PosSettings>) };
  });
