import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import type { Json } from "@/integrations/supabase/types";

const SECTIONS = ["branding", "business_rules", "pos", "inventory", "clinical", "reports", "system"] as const;

export type TenantSettings = {
  tenant_id: string;
  branding: Json;
  business_rules: Json;
  pos: Json;
  inventory: Json;
  clinical: Json;
  reports: Json;
  system: Json;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

function emptyRow(tenant_id: string): TenantSettings {
  return {
    tenant_id,
    branding: {}, business_rules: {}, pos: {}, inventory: {},
    clinical: {}, reports: {}, system: {},
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const WRITE_ROLES = ["owner", "corporate_admin"] as const;
const READ_ROLES = ["owner", "corporate_admin", "manager", "auditor"] as const;

async function hasAnyRole(
  ctx: { supabase: any; userId: string },
  tenant_id: string,
  roles: readonly string[],
): Promise<string | null> {
  for (const r of roles) {
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (error) throw new Error(error.message);
    if (data) return r;
  }
  return null;
}

async function logAudit(
  ctx: { supabase: any },
  args: { tenant_id: string; action: string; before?: unknown; after?: unknown },
) {
  const res = await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: args.tenant_id,
    _action: args.action,
    _entity_table: "tenant_settings",
    _before: (args.before as any) ?? undefined,
    _after: (args.after as any) ?? undefined,
  });
  if (res.error) console.error("audit failed", res.error.message);
}

export const getSettingsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    const canView = !!role;
    const canEdit = role === "owner" || role === "corporate_admin";
    await logAudit(context, {
      tenant_id: data.tenant_id,
      action: canView ? "settings.access.granted" : "settings.access.denied",
    });
    return { role, canView, canEdit, readOnly: canView && !canEdit };
  });

const JsonRecord = z.record(z.any());
const SectionPatch = z.object({
  branding: JsonRecord.optional(),
  business_rules: JsonRecord.optional(),
  pos: JsonRecord.optional(),
  inventory: JsonRecord.optional(),
  clinical: JsonRecord.optional(),
  reports: JsonRecord.optional(),
  system: JsonRecord.optional(),
});

export const getTenantSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("*").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? emptyRow(data.tenant_id)) as TenantSettings;
  });

export const updateTenantSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: SectionPatch,
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);

    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) {
      await logAudit(context, { tenant_id: data.tenant_id, action: "settings.access.denied" });
      throw new Error("Forbidden: owner or corporate_admin role required (403)");
    }

    const { data: before } = await context.supabase
      .from("tenant_settings").select("*").eq("tenant_id", data.tenant_id).maybeSingle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: any = { tenant_id: data.tenant_id, updated_by: context.userId };
    for (const s of SECTIONS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (before as any)?.[s] ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = (data.patch as any)[s];
      merged[s] = next ? { ...prev, ...next } : prev;
    }

    const { data: row, error } = await context.supabase
      .from("tenant_settings")
      .upsert(merged, { onConflict: "tenant_id" })
      .select("*").single();
    if (error) throw new Error(error.message);

    await logAudit(context, {
      tenant_id: data.tenant_id, action: "settings.updated",
      before: before ?? undefined, after: row ?? undefined,
    });

    return row as TenantSettings;
  });
