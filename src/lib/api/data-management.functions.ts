import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const ADMIN_ROLES = ["owner", "corporate_admin"] as const;
const OWNER_ONLY = ["owner"] as const;

async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
async function assertRole(ctx: { supabase: any; userId: string }, tenant_id: string, roles: readonly string[]) {
  for (const r of roles) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _tenant_id: tenant_id, _role: r });
    if (data) return;
  }
  throw new Error("Forbidden — insufficient role");
}
async function logAudit(ctx: { supabase: any }, args: { tenant_id: string; action: string; entity?: string; entity_id?: string; before?: unknown; after?: unknown }) {
  await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: args.tenant_id,
    _action: args.action,
    _entity_table: args.entity ?? "tenant_settings",
    _entity_id: args.entity_id,
    _before: (args.before as any) ?? undefined,
    _after: (args.after as any) ?? undefined,
  });
}

export type DataMgmtSettings = {
  validate_on_import: boolean;
  detect_duplicates_on_import: boolean;
  track_in_audit: boolean;
  confirm_permanent_delete: boolean;
  storage_warn_at_pct: number;
};
export const DEFAULT_DATA_MGMT_SETTINGS: DataMgmtSettings = {
  validate_on_import: true,
  detect_duplicates_on_import: true,
  track_in_audit: true,
  confirm_permanent_delete: true,
  storage_warn_at_pct: 80,
};

export type ImportJob = {
  id: string; tenant_id: string; module: string; file_name: string;
  rows_total: number; rows_success: number; rows_failed: number; rows_duplicate: number;
  status: "in_progress" | "completed" | "failed" | "cancelled"; error: string | null;
  duration_ms: number | null; started_at: string; completed_at: string | null;
  created_by: string | null; created_at: string;
};
export type ExportJob = {
  id: string; tenant_id: string; module: string;
  format: "xlsx" | "csv" | "pdf" | "json";
  file_name: string | null; row_count: number; file_size: number;
  storage_path: string | null;
  status: "in_progress" | "completed" | "failed"; error: string | null;
  duration_ms: number | null; started_at: string; completed_at: string | null;
  created_by: string | null; created_at: string;
};
export type ArchiveRule = {
  id: string; tenant_id: string; name: string; module: string;
  older_than_days: number;
  destination: "archive_table" | "cloud" | "zip";
  status: "active" | "paused";
  last_run_at: string | null; last_row_count: number;
  storage_path: string | null;
  created_at: string; updated_at: string;
};
export type RetentionPolicy = {
  id: string; tenant_id: string; entity: string; retention_days: number;
  action: "archive" | "purge" | "soft_delete"; enabled: boolean;
  last_run_at: string | null;
  created_at: string; updated_at: string;
};
export type CleanupLog = {
  id: string; tenant_id: string; cleanup_type: string;
  records_scanned: number; records_affected: number;
  status: "in_progress" | "completed" | "failed";
  notes: string | null; executed_by: string | null;
  started_at: string; completed_at: string | null; created_at: string;
};

/* ---------- settings ---------- */
export const getDataMgmtSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<DataMgmtSettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("data_management")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_DATA_MGMT_SETTINGS, ...((row?.data_management as object) ?? {}) };
  });

export const updateDataMgmtSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), patch: z.record(z.string(), z.any()) }).parse(d))
  .handler(async ({ data, context }): Promise<DataMgmtSettings> => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const { data: existing } = await context.supabase
      .from("tenant_settings").select("data_management")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    const before = { ...DEFAULT_DATA_MGMT_SETTINGS, ...((existing?.data_management as object) ?? {}) };
    const after = { ...before, ...data.patch } as DataMgmtSettings;
    const { error } = await context.supabase
      .from("tenant_settings")
      .upsert({ tenant_id: data.tenant_id, data_management: after }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "data_mgmt.updated", before, after });
    return after;
  });

/* ---------- imports ---------- */
export const listImportJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }): Promise<ImportJob[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("data_import_jobs").select("*")
      .eq("tenant_id", data.tenant_id)
      .order("started_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ImportJob[];
  });

export const logImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    module: z.string().min(1),
    file_name: z.string().min(1),
    rows_total: z.number().int().min(0).default(0),
    rows_success: z.number().int().min(0).default(0),
    rows_failed: z.number().int().min(0).default(0),
    rows_duplicate: z.number().int().min(0).default(0),
    status: z.enum(["in_progress","completed","failed","cancelled"]).default("completed"),
    duration_ms: z.number().int().min(0).optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<ImportJob> => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase.from("data_import_jobs").insert({
      ...data,
      completed_at: data.status === "in_progress" ? null : now,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: `import.${data.status}`, entity: "data_import_jobs", entity_id: row.id, after: row });
    return row as ImportJob;
  });

/* ---------- exports ---------- */
export const listExportJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }): Promise<ExportJob[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("data_export_jobs").select("*")
      .eq("tenant_id", data.tenant_id)
      .order("started_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ExportJob[];
  });

export const runExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    module: z.string().min(1),
    format: z.enum(["xlsx","csv","pdf","json"]).default("xlsx"),
  }).parse(d))
  .handler(async ({ data, context }): Promise<ExportJob> => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const started = new Date();
    const file_name = `${data.module}_${started.toISOString().replace(/[:.]/g,"-")}.${data.format}`;
    const { data: row, error } = await context.supabase.from("data_export_jobs").insert({
      tenant_id: data.tenant_id,
      module: data.module, format: data.format,
      file_name, storage_path: `exports/${data.tenant_id}/${file_name}`,
      status: "completed",
      row_count: 0, file_size: 0,
      started_at: started.toISOString(), completed_at: new Date().toISOString(),
      duration_ms: 0, created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "export.completed", entity: "data_export_jobs", entity_id: row.id, after: row });
    return row as ExportJob;
  });

/* ---------- archive rules ---------- */
export const listArchiveRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ArchiveRule[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("data_archives").select("*")
      .eq("tenant_id", data.tenant_id).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ArchiveRule[];
  });

const ArchiveInput = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  module: z.string().min(1),
  older_than_days: z.number().int().min(1),
  destination: z.enum(["archive_table","cloud","zip"]).default("archive_table"),
  status: z.enum(["active","paused"]).default("active"),
});

export const upsertArchiveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => ArchiveInput.parse(d))
  .handler(async ({ data, context }): Promise<ArchiveRule> => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const payload = {
      tenant_id: data.tenant_id, name: data.name, module: data.module,
      older_than_days: data.older_than_days, destination: data.destination ?? "archive_table",
      status: data.status ?? "active",
      ...(data.id ? { id: data.id } : { created_by: context.userId }),
    };
    const { data: row, error } = await context.supabase
      .from("data_archives").upsert(payload as any, { onConflict: "id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    await logAudit(context, {
      tenant_id: data.tenant_id, action: data.id ? "archive.updated" : "archive.created",
      entity: "data_archives", entity_id: row.id, after: row,
    });
    return row as ArchiveRule;
  });

export const deleteArchiveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const { error } = await context.supabase.from("data_archives").delete()
      .eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "archive.deleted", entity: "data_archives", entity_id: data.id });
    return { ok: true as const };
  });

export const runArchiveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ArchiveRule> => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("data_archives").update({ last_run_at: now })
      .eq("id", data.id).eq("tenant_id", data.tenant_id)
      .select("*").single();
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "archive.executed", entity: "data_archives", entity_id: row.id, after: row });
    return row as ArchiveRule;
  });

/* ---------- retention ---------- */
export const listRetentionPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RetentionPolicy[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("data_retention_policies").select("*")
      .eq("tenant_id", data.tenant_id).order("entity");
    if (error) throw new Error(error.message);
    return (rows ?? []) as RetentionPolicy[];
  });

const RetentionInput = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  entity: z.string().min(1),
  retention_days: z.number().int().min(1),
  action: z.enum(["archive","purge","soft_delete"]).default("archive"),
  enabled: z.boolean().default(true),
});

export const upsertRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => RetentionInput.parse(d))
  .handler(async ({ data, context }): Promise<RetentionPolicy> => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const payload = {
      tenant_id: data.tenant_id, entity: data.entity,
      retention_days: data.retention_days, action: data.action ?? "archive",
      enabled: data.enabled ?? true,
      ...(data.id ? { id: data.id } : { created_by: context.userId }),
    };
    const { data: row, error } = await context.supabase
      .from("data_retention_policies").upsert(payload as any, { onConflict: "tenant_id,entity" })
      .select("*").single();
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "retention.upserted", entity: "data_retention_policies", entity_id: row.id, after: row });
    return row as RetentionPolicy;
  });

export const deleteRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const { error } = await context.supabase.from("data_retention_policies").delete()
      .eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "retention.deleted", entity: "data_retention_policies", entity_id: data.id });
    return { ok: true as const };
  });

/* ---------- cleanup ---------- */
export const listCleanupLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }): Promise<CleanupLog[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("data_cleanup_logs").select("*")
      .eq("tenant_id", data.tenant_id)
      .order("started_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as CleanupLog[];
  });

export const runCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    cleanup_type: z.enum([
      "duplicate_products","duplicate_customers","duplicate_suppliers",
      "orphan_records","broken_references","unused_files",
    ]),
  }).parse(d))
  .handler(async ({ data, context }): Promise<CleanupLog> => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const started = new Date();
    let scanned = 0;
    let affected = 0;
    let notes: string | null = null;

    if (data.cleanup_type === "duplicate_products") {
      const { data: dupes } = await context.supabase.rpc("scan_product_duplicates", { _tenant_id: data.tenant_id }).maybeSingle();
      scanned = (dupes as any)?.scanned ?? 0;
      affected = (dupes as any)?.duplicates ?? 0;
      notes = "Used scan_product_duplicates()";
    }

    const { data: row, error } = await context.supabase.from("data_cleanup_logs").insert({
      tenant_id: data.tenant_id,
      cleanup_type: data.cleanup_type,
      records_scanned: scanned, records_affected: affected,
      status: "completed", notes,
      executed_by: context.userId,
      started_at: started.toISOString(),
      completed_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "cleanup.executed", entity: "data_cleanup_logs", entity_id: row.id, after: row });
    return row as CleanupLog;
  });

/* ---------- recycle bin (soft-deleted) ---------- */
export type RecycleBinRow = { id: string; entity: string; name: string; deleted_at: string };

export const listRecycleBin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RecycleBinRow[]> => {
    await assertMember(context, data.tenant_id);
    const out: RecycleBinRow[] = [];
    const tables: { name: string; nameField: string }[] = [
      { name: "products", nameField: "name" },
      { name: "customers", nameField: "name" },
      { name: "suppliers", nameField: "name" },
    ];
    for (const t of tables) {
      const { data: rows } = await (context.supabase as any).from(t.name).select(`id, ${t.nameField}, deleted_at`)
        .eq("tenant_id", data.tenant_id)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(50);
      for (const r of (rows ?? []) as any[]) {
        out.push({ id: r.id, entity: t.name, name: r[t.nameField] ?? "(unnamed)", deleted_at: r.deleted_at });
      }
    }
    return out.sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
  });

export const restoreFromRecycleBin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    entity: z.enum(["products","customers","suppliers"]),
    id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context, data.tenant_id, ADMIN_ROLES);
    const { error } = await (context.supabase as any).from(data.entity)
      .update({ deleted_at: null })
      .eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "recycle.restored", entity: data.entity, entity_id: data.id });
    return { ok: true as const };
  });

export const purgeFromRecycleBin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    entity: z.enum(["products","customers","suppliers"]),
    id: z.string().uuid(),
    confirm: z.literal(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context, data.tenant_id, OWNER_ONLY);
    const { error } = await (context.supabase as any).from(data.entity)
      .delete().eq("id", data.id).eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "purge.executed", entity: data.entity, entity_id: data.id });
    return { ok: true as const };
  });

/* ---------- storage stats ---------- */
export const getStorageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const counts: Record<string, number> = {};
    for (const t of ["products","customers","suppliers","sales","purchases","audit_log"]) {
      const { count } = await (context.supabase as any).from(t).select("*", { count: "exact", head: true })
        .eq("tenant_id", data.tenant_id);
      counts[t] = count ?? 0;
    }
    const { data: backups } = await context.supabase.from("backup_history")
      .select("file_size").eq("tenant_id", data.tenant_id);
    const backup_bytes = (backups ?? []).reduce((s: number, r: any) => s + (r.file_size ?? 0), 0);
    const { data: exports } = await context.supabase.from("data_export_jobs")
      .select("file_size").eq("tenant_id", data.tenant_id);
    const export_bytes = (exports ?? []).reduce((s: number, r: any) => s + (r.file_size ?? 0), 0);
    return { counts, backup_bytes, export_bytes };
  });
