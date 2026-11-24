// Phase 10.5/10.10 — Alert settings get/update
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAlertSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("alert_settings")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    return row ?? {
      tenant_id: data.tenant_id,
      low_stock_enabled: true,
      expiry_enabled: true,
      expiry_days: [90, 60, 30, 7],
      due_reminder_enabled: true,
      due_reminder_days: [7, 3, 1],
    };
  });

export const updateAlertSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      low_stock_enabled: z.boolean(),
      expiry_enabled: z.boolean(),
      expiry_days: z.array(z.number().int().min(1).max(365)).min(1).max(8),
      due_reminder_enabled: z.boolean(),
      due_reminder_days: z.array(z.number().int().min(1).max(90)).min(1).max(8),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("alert_settings")
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
