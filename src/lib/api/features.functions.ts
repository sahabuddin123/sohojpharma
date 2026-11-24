import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLAN_FEATURES, type PlanFeature } from "@/lib/api/middleware/require-feature";

export type TenantFeatureMap = Record<PlanFeature, boolean>;

const EMPTY: TenantFeatureMap = Object.fromEntries(
  PLAN_FEATURES.map((k) => [k, false]),
) as TenantFeatureMap;

/** Returns the current user's tenant feature flags. Empty map if no tenant. */
export const getTenantFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TenantFeatureMap> => {
    const { data: isAdmin } = await context.supabase.rpc("is_app_admin", {
      _user_id: context.userId,
    });
    // Admins see everything as enabled (admin console isn't gated).
    if (isAdmin) {
      return Object.fromEntries(PLAN_FEATURES.map((k) => [k, true])) as TenantFeatureMap;
    }

    const { data: member } = await context.supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    const tenant_id = (member as { tenant_id?: string } | null)?.tenant_id;
    if (!tenant_id) return { ...EMPTY };

    const { data, error } = await context.supabase.rpc("tenant_features", {
      _tenant: tenant_id,
    });
    if (error) throw new Error(error.message);
    const map = (data ?? {}) as Record<string, boolean>;
    return Object.fromEntries(
      PLAN_FEATURES.map((k) => [k, Boolean(map[k])]),
    ) as TenantFeatureMap;
  });
