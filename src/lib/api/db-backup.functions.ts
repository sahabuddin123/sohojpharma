import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tables a store owner may never overwrite via restore (privilege / billing / identity).
const RESTORE_DENY = new Set([
  "tenants", "tenant_members", "user_roles", "app_admins", "subscriptions",
  "tenant_subscriptions", "subscription_invoices", "feature_flags", "plans",
  "audit_log", "admin_audit_log", "payments", "payment_transactions", "usage_counters",
  "api_keys", "public_api_keys", "backup_runs",
]);

export type CatalogTable = {
  table_name: string;
  has_tenant_id: boolean;
  has_id: boolean;
  columns: Array<{ name: string; type: string; udt: string; nullable: boolean }>;
};

const Scope = z.object({
  scope: z.enum(["full", "tenant"]),
  tenant_id: z.string().uuid().optional(),
});

async function authorize(ctx: { supabase: any; userId: string }, scope: "full" | "tenant", tenant_id?: string) {
  const { data: isAdmin } = await ctx.supabase.rpc("is_app_admin", { _user_id: ctx.userId });
  if (scope === "full") {
    if (!isAdmin) throw new Error("Forbidden: super admin only");
    return;
  }
  if (!tenant_id) throw new Error("tenant_id required");
  if (isAdmin) return;
  const { data: owner } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId, _tenant_id: tenant_id, _role: "owner",
  });
  if (!owner) throw new Error("Forbidden: store owner only");
}

async function loadCatalog(): Promise<CatalogTable[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.rpc as any)("backup_table_catalog");
  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogTable[];
}

export const getBackupCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Scope.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context, data.scope, data.tenant_id);
    const all = await loadCatalog();
    const tables = data.scope === "full" ? all : all.filter((t) => t.has_tenant_id);
    return tables.map((t) => ({ ...t, restorable: data.scope === "tenant" && !RESTORE_DENY.has(t.table_name) }));
  });

export const exportTableChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    Scope.extend({
      table: z.string().regex(/^[a-z0-9_]+$/),
      offset: z.number().int().min(0),
      limit: z.number().int().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await authorize(context, data.scope, data.tenant_id);
    const cat = (await loadCatalog()).find((t) => t.table_name === data.table);
    if (!cat) throw new Error("Unknown table");
    if (data.scope === "tenant" && !cat.has_tenant_id) throw new Error("Table not tenant-scoped");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin.from as any)(data.table).select("*");
    if (data.scope === "tenant") q = q.eq("tenant_id", data.tenant_id);
    if (cat.has_id) q = q.order("id", { ascending: true });
    const { data: rows, error } = await q.range(data.offset, data.offset + data.limit - 1);
    if (error) return { rows: [] as any[], error: error.message };
    return { rows: (rows ?? []) as any[], error: null as string | null };
  });

export const restoreTableChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      table: z.string().regex(/^[a-z0-9_]+$/),
      rows: z.array(z.record(z.string(), z.any())).max(1000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await authorize(context, "tenant", data.tenant_id);
    if (RESTORE_DENY.has(data.table)) return { restored: 0, skipped: data.rows.length, error: null };
    const cat = (await loadCatalog()).find((t) => t.table_name === data.table);
    if (!cat || !cat.has_tenant_id || !cat.has_id) return { restored: 0, skipped: data.rows.length, error: "not restorable" };
    const cols = new Set(cat.columns.map((c) => c.name));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Force tenant, drop unknown columns.
    let rows = data.rows
      .filter((r) => r.id != null)
      .map((r) => {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) if (cols.has(k)) o[k] = v;
        o.tenant_id = data.tenant_id;
        return o;
      });

    // Never overwrite rows that belong to another tenant.
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: foreign } = await (supabaseAdmin.from as any)(data.table)
        .select("id").in("id", ids).neq("tenant_id", data.tenant_id);
      const bad = new Set((foreign ?? []).map((f: any) => String(f.id)));
      rows = rows.filter((r) => !bad.has(String(r.id)));
    }
    if (!rows.length) return { restored: 0, skipped: data.rows.length, error: null };
    const { error } = await (supabaseAdmin.from as any)(data.table).upsert(rows, { onConflict: "id" });
    if (error) return { restored: 0, skipped: data.rows.length, error: error.message };
    return { restored: rows.length, skipped: data.rows.length - rows.length, error: null };
  });
