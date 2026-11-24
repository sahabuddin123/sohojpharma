import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const USAGE_METRICS = [
  "products","users","branches","warehouses","storage_mb","api_requests",
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export interface UsageRow {
  metric: UsageMetric;
  current_usage: number;
  limit_value: number | null;
  usage_percent: number;
  status: "ok" | "warn" | "critical" | "blocked" | "unlimited";
}

function statusFor(limit: number | null, percent: number): UsageRow["status"] {
  if (limit === null) return "unlimited";
  if (percent >= 100) return "blocked";
  if (percent >= 90) return "critical";
  if (percent >= 80) return "warn";
  return "ok";
}

async function tenantIdFor(ctx: { supabase: any; userId: string }, override?: string) {
  if (override) return override;
  const { data } = await ctx.supabase
    .from("tenant_members").select("tenant_id")
    .eq("user_id", ctx.userId).limit(1).maybeSingle();
  return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
}

/** Current tenant usage vs. plan limits. */
export const getUsageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<UsageRow[]> => {
    const tenant_id = await tenantIdFor(context, data.tenant_id);
    if (!tenant_id) return [];
    const { data: rows, error } = await context.supabase
      .rpc("tenant_usage_summary", { _tenant: tenant_id });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<{
      metric: UsageMetric; current_usage: number;
      limit_value: number | null; usage_percent: number;
    }>).map((r) => ({
      metric: r.metric,
      current_usage: Number(r.current_usage),
      limit_value: r.limit_value === null ? null : Number(r.limit_value),
      usage_percent: Number(r.usage_percent),
      status: statusFor(r.limit_value === null ? null : Number(r.limit_value), Number(r.usage_percent)),
    }));
  });

/** Record API requests for the caller's tenant; throws when over limit. */
export const recordApiRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ n: z.number().int().min(1).max(1000).default(1) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const tenant_id = await tenantIdFor(context);
    if (!tenant_id) throw new Error("No tenant");
    const { data: res, error } = await context.supabase
      .rpc("record_api_request", { _tenant: tenant_id, _n: data.n });
    if (error) throw new Error(error.message);
    return res;
  });
