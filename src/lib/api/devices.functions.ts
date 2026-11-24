// E18 — Device registration + sync audit server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const RegisterSchema = z.object({
  tenant_id: z.string().uuid(),
  device_id: z.string().min(1).max(128),
  device_name: z.string().max(120).optional(),
  platform: z.string().max(32).optional(),
  user_agent: z.string().max(280).optional(),
});

export const registerDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((data: unknown) => RegisterSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("registered_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("device_id", data.device_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("registered_devices")
        .update({
          last_seen: now,
          is_active: true,
          revoked_at: null,
          revoked_by: null,
          device_name: data.device_name ?? null,
          platform: data.platform ?? null,
          user_agent: data.user_agent ?? null,
        })
        .eq("id", existing.id);
      return { ok: true as const, id: existing.id, created: false };
    }

    const { data: ins, error } = await supabase
      .from("registered_devices")
      .insert({
        tenant_id: data.tenant_id,
        user_id: userId,
        device_id: data.device_id,
        device_name: data.device_name ?? null,
        platform: data.platform ?? null,
        user_agent: data.user_agent ?? null,
        last_seen: now,
      })
      .select("id")
      .single();
    if (error || !ins) throw new Error(error?.message ?? "register failed");
    return { ok: true as const, id: ins.id, created: true };
  });

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("registered_devices")
      .select("*")
      .eq("user_id", userId)
      .order("last_seen", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const revokeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("registered_devices")
      .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const LogBatchSchema = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  device_id: z.string().optional(),
  batch_size: z.number().int().min(0),
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  duplicates: z.number().int().min(0).optional().default(0),
  duration_ms: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export const logSyncBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => LogBatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.batch_size === 0) return { ok: true as const, skipped: true };
    const { error } = await supabase.from("sync_logs").insert({
      tenant_id: data.tenant_id ?? null,
      user_id: userId,
      device_id: data.device_id ?? null,
      batch_size: data.batch_size,
      succeeded: data.succeeded,
      failed: data.failed,
      duplicates: data.duplicates ?? 0,
      duration_ms: data.duration_ms ?? null,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("sync_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
