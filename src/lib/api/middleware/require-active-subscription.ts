/**
 * Subscription gate middleware.
 *
 * Apply via `.middleware([requireSupabaseAuth, requireActiveSubscription])` on
 * write-side server functions (POS, sales, purchase, inventory create/edit/delete).
 *
 * Throws HTTP 402 when the caller's tenant subscription is not in
 * { trial, active } and now > grace_until.
 *
 * SaaS app admins bypass the gate.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tenantFromInput } from "@/lib/api/middleware/tenant-input";

export const requireActiveSubscription = createMiddleware({ type: "function" })
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
    if (!tenant_id) return next(); // no tenant yet → let upstream auth/role gates decide

    const { data: subscriptionStatus } = await context.supabase.rpc("tenant_subscription_status", {
      _tenant: tenant_id,
    });
    const row = Array.isArray(subscriptionStatus) ? subscriptionStatus[0] : subscriptionStatus;
    if (!row) return next(); // no subscription row — handled by approval flow

    const ok =
      row.status === "trial" ||
      row.status === "active" ||
      (row.grace_until && new Date(row.grace_until) > new Date());
    if (!ok) {
      throw new Error("subscription_expired: Subscription expired. Please renew to continue.");
    }
    return next();
  });
