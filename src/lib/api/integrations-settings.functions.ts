import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const WRITE_ROLES = ["owner", "corporate_admin", "manager"] as const;
const SECRET_KEYS = new Set([
  "api_key", "api_secret", "secret", "token", "bot_token",
  "smtp_password", "password", "auth_token", "private_key",
]);

async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
async function assertCanWrite(ctx: { supabase: any; userId: string }, tenant_id: string) {
  for (const r of WRITE_ROLES) {
    const { data } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (data) return;
  }
  throw new Error("Forbidden — requires owner, admin or manager role");
}
async function logAudit(ctx: { supabase: any }, args: { tenant_id: string; action: string; entity?: string; before?: unknown; after?: unknown }) {
  await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: args.tenant_id,
    _action: args.action,
    _entity_table: args.entity ?? "integration_providers",
    _before: (args.before as any) ?? undefined,
    _after: (args.after as any) ?? undefined,
  });
}

function maskConfig(cfg: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(cfg ?? {})) {
    out[k] = SECRET_KEYS.has(k) && typeof v === "string" && v.length > 0 ? "••••••••" : v;
  }
  return out;
}

export type IntegrationToggles = {
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  telegram_enabled: boolean;
  facebook_pixel_enabled: boolean;
  google_analytics_enabled: boolean;
  google_drive_enabled: boolean;
  webhooks_enabled: boolean;
  api_access_enabled: boolean;
};

export const DEFAULT_INTEGRATIONS: IntegrationToggles = {
  email_enabled: true,
  sms_enabled: false,
  whatsapp_enabled: false,
  telegram_enabled: false,
  facebook_pixel_enabled: false,
  google_analytics_enabled: false,
  google_drive_enabled: false,
  webhooks_enabled: true,
  api_access_enabled: false,
};

export type IntegrationCategory =
  | "email" | "sms" | "whatsapp" | "telegram" | "analytics" | "pixel" | "drive";

export type IntegrationProvider = {
  id: string;
  tenant_id: string;
  category: IntegrationCategory;
  provider: string;
  status: "active" | "inactive";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export const getIntegrationToggles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<IntegrationToggles> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("integrations")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_INTEGRATIONS, ...((row?.integrations as object) ?? {}) };
  });

export const updateIntegrationToggles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), patch: z.record(z.string(), z.boolean()) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<IntegrationToggles> => {
    await assertCanWrite(context, data.tenant_id);
    const { data: existing } = await context.supabase
      .from("tenant_settings").select("integrations")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    const before = { ...DEFAULT_INTEGRATIONS, ...((existing?.integrations as object) ?? {}) };
    const after = { ...before, ...data.patch } as IntegrationToggles;
    const { error } = await context.supabase
      .from("tenant_settings")
      .upsert({ tenant_id: data.tenant_id, integrations: after }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "integration.updated", entity: "tenant_settings", before, after });
    return after;
  });

export const listIntegrationProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<IntegrationProvider[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("integration_providers").select("*")
      .eq("tenant_id", data.tenant_id)
      .order("category", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({ ...r, config: maskConfig(r.config) })) as IntegrationProvider[];
  });

const ProviderInput = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  category: z.enum(["email","sms","whatsapp","telegram","analytics","pixel","drive"]),
  provider: z.string().min(1).max(40),
  status: z.enum(["active","inactive"]).default("inactive"),
  config: z.record(z.string(), z.any()).default({}),
});

export const upsertIntegrationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => ProviderInput.parse(d))
  .handler(async ({ data, context }): Promise<IntegrationProvider> => {
    await assertCanWrite(context, data.tenant_id);

    // Merge: if the user submits the masked value, keep stored secret intact.
    let existingConfig: Record<string, any> = {};
    if (data.id) {
      const { data: ex } = await context.supabase
        .from("integration_providers").select("config")
        .eq("id", data.id).eq("tenant_id", data.tenant_id).maybeSingle();
      existingConfig = (ex?.config as any) ?? {};
    }
    const mergedConfig: Record<string, any> = { ...existingConfig };
    for (const [k, v] of Object.entries(data.config)) {
      if (SECRET_KEYS.has(k) && v === "••••••••") continue;
      mergedConfig[k] = v;
    }

    const payload = {
      tenant_id: data.tenant_id,
      category: data.category,
      provider: data.provider,
      status: data.status,
      config: mergedConfig,
      ...(data.id ? { id: data.id } : { created_by: context.userId }),
    };

    const { data: row, error } = await context.supabase
      .from("integration_providers")
      .upsert(payload as any, { onConflict: "tenant_id,category,provider" })
      .select("*").single();
    if (error) throw new Error(error.message);

    await logAudit(context, {
      tenant_id: data.tenant_id,
      action: data.id ? "integration.updated" : "integration.created",
      after: { ...row, config: maskConfig((row as any).config) },
    });
    return { ...(row as any), config: maskConfig((row as any).config) } as IntegrationProvider;
  });

export const deleteIntegrationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanWrite(context, data.tenant_id);
    const { error } = await context.supabase
      .from("integration_providers").delete()
      .eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "integration.deleted", before: { id: data.id } });
    return { ok: true };
  });

export const testIntegrationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; tested_at: string }> => {
    await assertCanWrite(context, data.tenant_id);
    const tested_at = new Date().toISOString();
    await logAudit(context, { tenant_id: data.tenant_id, action: "integration.tested", after: { id: data.id, tested_at } });
    return { ok: true, tested_at };
  });

/* ---------------- Webhooks (existing table) ---------------- */

export type WebhookRow = {
  id: string;
  tenant_id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
};

export const listWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<WebhookRow[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("webhooks").select("id, tenant_id, url, events, active, created_at")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as WebhookRow[];
  });

export const upsertWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    tenant_id: z.string().uuid(),
    url: z.string().url().max(2048),
    events: z.array(z.string()).min(1).max(50),
    secret: z.string().min(8).max(200).optional(),
    active: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }): Promise<WebhookRow> => {
    await assertCanWrite(context, data.tenant_id);
    const { assertSafeOutboundUrl } = await import("@/lib/security/ssrf-guard.server");
    const safeUrl = await assertSafeOutboundUrl(data.url);
    const payload: Record<string, any> = {
      tenant_id: data.tenant_id,
      url: safeUrl.toString(),
      events: data.events,
      active: data.active,
    };
    if (data.secret) payload.secret = data.secret;
    if (data.id) payload.id = data.id;
    else payload.created_by = context.userId;

    const { data: row, error } = await context.supabase
      .from("webhooks").upsert(payload as any, { onConflict: "id" })
      .select("id, tenant_id, url, events, active, created_at").single();
    if (error) throw new Error(error.message);
    await logAudit(context, {
      tenant_id: data.tenant_id,
      action: data.id ? "webhook.updated" : "webhook.created",
      entity: "webhooks", after: row,
    });
    return row as WebhookRow;
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanWrite(context, data.tenant_id);
    const { error } = await context.supabase
      .from("webhooks").delete()
      .eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "webhook.deleted", entity: "webhooks", before: { id: data.id } });
    return { ok: true };
  });

/* ---------------- API Keys (existing table) ---------------- */

export type ApiKeyRow = {
  id: string;
  tenant_id: string;
  name: string;
  prefix: string;
  scope: "read" | "read_write" | "full";
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ApiKeyRow[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("api_keys")
      .select("id, tenant_id, name, prefix, scope, last_used_at, revoked_at, created_at")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ApiKeyRow[];
  });

function randomToken(len = 32): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    name: z.string().min(1).max(80),
    scope: z.enum(["read","read_write","full"]).default("read"),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ row: ApiKeyRow; plaintext: string }> => {
    await assertCanWrite(context, data.tenant_id);
    const raw = randomToken(24);
    const prefix = `pc_live_${raw.slice(0, 6)}`;
    const plaintext = `${prefix}_${raw}`;
    const hash = await sha256Hex(plaintext);

    const { data: row, error } = await context.supabase
      .from("api_keys")
      .insert({
        tenant_id: data.tenant_id, name: data.name, prefix, hash,
        scope: data.scope, created_by: context.userId,
      })
      .select("id, tenant_id, name, prefix, scope, last_used_at, revoked_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "api_key.created", entity: "api_keys", after: row });
    return { row: row as ApiKeyRow, plaintext };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertCanWrite(context, data.tenant_id);
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "api_key.revoked", entity: "api_keys", before: { id: data.id } });
    return { ok: true };
  });
