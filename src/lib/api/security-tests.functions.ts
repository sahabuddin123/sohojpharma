// Tenant isolation test suite runner.
// Authorized to tenant owners only; uses the service-role client to invoke the
// `test_tenant_isolation` SQL function (which requires service_role).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

const Input = z.object({ tenant_id: z.string().uuid() });

export type TenantIsolationResult = {
  test_name: string;
  passed: boolean;
  detail: string | null;
};

export const runTenantIsolationTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{
    passed: number;
    failed: number;
    total: number;
    results: TenantIsolationResult[];
  }> => {
    // Caller must be an owner of the tenant they're testing from.
    const { data: isOwner, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _tenant_id: data.tenant_id,
      _role: "owner",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isOwner) throw new Error("Forbidden: tenant owner role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("test_tenant_isolation");
    if (error) throw new Error(error.message);

    const results = (rows ?? []) as TenantIsolationResult[];
    const passed = results.filter((r) => r.passed).length;
    return {
      passed,
      failed: results.length - passed,
      total: results.length,
      results,
    };
  });
