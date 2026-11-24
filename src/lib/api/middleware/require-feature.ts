/**
 * Server-side feature flag enforcement.
 *
 * Resolves enabled SaaS features for the caller's tenant through
 * `public.tenant_features(_tenant)` and 403s when the required flag is off.
 * SaaS app admins bypass.
 *
 * Supported flags:
 *   pos | inventory | purchase | sales | crm | accounting | reports
 *   prescription | sms | mobile_app | api_access
 *
 * Legacy aliases accepted: "sms_enabled" -> "sms", "api_enabled" -> "api_access".
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tenantFromInput } from "@/lib/api/middleware/tenant-input";

export const PLAN_FEATURES = [
  "pos","inventory","purchase","sales","crm","accounting","reports",
  "prescription","sms","mobile_app","api_access",
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

type FeatureArg = PlanFeature | "sms_enabled" | "api_enabled";

function normalize(flag: FeatureArg): PlanFeature {
  if (flag === "sms_enabled") return "sms";
  if (flag === "api_enabled") return "api_access";
  return flag;
}

export function requireFeature(flag: FeatureArg) {
  const feature = normalize(flag);
  return createMiddleware({ type: "function" })
    .middleware([requireSupabaseAuth])
    .server(async ({ next, context, data }) => {
      const { data: isAdmin } = await context.supabase.rpc("is_app_admin", {
        _user_id: context.userId,
      });
      if (isAdmin) return next();

      const tenant_id = tenantFromInput(data) ?? await (async () => {
        const { data: member } = await context.supabase
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", context.userId)
          .limit(1)
          .maybeSingle();
        return (member as { tenant_id?: string } | null)?.tenant_id;
      })();
      if (!tenant_id) {
        throw new Error(`no_tenant: No tenant membership found for feature "${feature}".`);
      }

      const { data: enabled, error } = await context.supabase.rpc("has_tenant_feature", {
        _tenant: tenant_id, _feature: feature,
      });
      if (error) throw new Error(`feature_check_failed: ${error.message}`);
      if (enabled !== true) {
        throw new Error(
          `feature_disabled: The "${feature}" feature is not enabled on your subscription. Please upgrade to access this feature.`,
        );
      }
      return next();
    });
}
