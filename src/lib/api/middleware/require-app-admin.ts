/**
 * SaaS admin gate middleware.
 *
 * Apply via `.middleware([requireSupabaseAuth, requireAppAdmin])` on server
 * functions that must be callable only by platform operators (demo seeding,
 * security test harnesses, example endpoints, etc.).
 *
 * Throws HTTP 403 when the caller is not in `app_admins`.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireAppAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_app_admin", {
      _user_id: context.userId,
    });
    if (!isAdmin) {
      throw new Error("forbidden: app admin only");
    }
    return next();
  });
