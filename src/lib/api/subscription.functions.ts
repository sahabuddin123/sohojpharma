import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlanUsage = {
  plan: "free" | "starter" | "pro" | "enterprise";
  products_used: number;
  products_limit: number | null;
  products_over: boolean;
  users_used: number;
  users_limit: number | null;
  users_over: boolean;
};

export const getPlanUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string }) => d)
  .handler(async ({ data, context }): Promise<PlanUsage> => {
    const { data: rows, error } = await context.supabase
      .rpc("check_plan_usage", { _tenant_id: data.tenant_id });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("usage unavailable");
    return row as PlanUsage;
  });
