/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getResolvedMasterId, resolveMasterIds } from "@/lib/api/master-resolver";

/* ------------------------------------------------------------------ */
/*  Master kind dispatch                                              */
/* ------------------------------------------------------------------ */

export const MASTER_KINDS = [
  "manufacturer",
  "generic",
  "category",
  "unit",
  "medicine_type",
  "dosage_form",
  "therapeutic_class",
  "country",
  "tax_class",
] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];

const TABLE_BY_KIND: Record<MasterKind, string> = {
  manufacturer: "manufacturers",
  generic: "generics",
  category: "categories",
  unit: "units",
  medicine_type: "medicine_types",
  dosage_form: "dosage_forms",
  therapeutic_class: "therapeutic_classes",
  country: "countries",
  tax_class: "tax_classes",
};

const KindZ = z.enum(MASTER_KINDS);

function table(kind: MasterKind) {
  return TABLE_BY_KIND[kind];
}

/* ------------------------------------------------------------------ */
/*  Role helpers                                                       */
/* ------------------------------------------------------------------ */

const WRITE_ROLES = ["owner", "corporate_admin", "manager"] as const;
type Ctx = { supabase: any; userId: string };

async function assertMember(ctx: Ctx, tenant_id: string) {
  const sb = ctx.supabase as any;
  const { data, error } = await sb
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function assertWrite(ctx: Ctx, tenant_id: string) {
  const sb = ctx.supabase as any;
  for (const r of WRITE_ROLES) {
    const { data } = await sb.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (data) return r;
  }
  throw new Error("Forbidden: write role required");
}

async function audit(
  ctx: Ctx,
  tenant_id: string,
  kind: MasterKind,
  master_id: string | null,
  action: "create" | "update" | "delete" | "restore" | "bulk_update" | "import",
  before: unknown,
  after: unknown,
) {
  const sb = ctx.supabase as any;
  await sb.from("master_audit_log").insert({
    tenant_id,
    master_kind: kind,
    master_id,
    action,
    before: before ?? null,
    after: after ?? null,
    actor: ctx.userId,
  });
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MasterRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  status: string;
  aliases: string[];
  description?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_by: string | null;
};

export type MasterListResult = { rows: MasterRow[]; total: number };

/* ------------------------------------------------------------------ */
/*  List                                                              */
/* ------------------------------------------------------------------ */

const ListInput = z.object({
  kind: KindZ,
  tenant_id: z.string().uuid(),
  search: z.string().optional(),
  status: z.enum(["all", "active", "inactive", "deleted"]).default("active"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});

export const listMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }): Promise<MasterListResult> => {
    await assertMember(context, data.tenant_id);
    const sb = (context as Ctx).supabase as any;
    const tbl = table(data.kind);
    let q = sb.from(tbl).select("*", { count: "exact" }).eq("tenant_id", data.tenant_id);

    const isSupplierOrCustomer = ["suppliers", "customers"].includes(tbl);
    if (!isSupplierOrCustomer) {
      if (data.status === "deleted") q = q.not("deleted_at", "is", null);
      else q = q.is("deleted_at", null);
    }
    if (data.status === "active") q = q.eq("status", "active");
    if (data.status === "inactive") q = q.neq("status", "active");

    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`name.ilike.${s},code.ilike.${s}`);
    }
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    q = q.order("name").range(from, to);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as MasterRow[], total: count ?? 0 };
  });

/* ------------------------------------------------------------------ */
/*  Create / Update                                                    */
/* ------------------------------------------------------------------ */

const UpsertInput = z.object({
  kind: KindZ,
  tenant_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  code: z.string().max(60).nullish(),
  description: z.string().max(1000).nullish(),
  status: z.enum(["active", "inactive"]).default("active"),
  aliases: z.array(z.string().min(1).max(120)).max(50).default([]),
});

export const upsertMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }): Promise<MasterRow> => {
    await assertWrite(context, data.tenant_id);
    const sb = (context as Ctx).supabase as any;
    const tbl = table(data.kind);
    const payload: Record<string, unknown> = {
      tenant_id: data.tenant_id,
      name: data.name,
      code: data.code ?? null,
      status: data.status,
      aliases: data.aliases ?? [],
      description: data.description ?? null,
    };

    let before = null;
    let targetId = data.id;
    if (targetId) {
      const beforeRes = await sb.from(tbl).select("*").eq("id", targetId).maybeSingle();
      before = beforeRes.data ?? null;
    } else {
      targetId = getResolvedMasterId(await resolveMasterIds({
        supabase: sb,
        tenantId: data.tenant_id,
        userId: context.userId,
        masters: [{ kind: data.kind, name: data.name, status: data.status }],
      }), data.kind, data.name) ?? undefined;
    }
    if (!targetId) throw new Error("Master could not be resolved");

    let res = await sb
      .from(tbl).update({ ...payload, updated_by: context.userId })
      .eq("id", targetId).eq("tenant_id", data.tenant_id)
      .select("*").single();
    if (res.error && String(res.error.message).includes("description")) {
      const { description: _d, ...slim } = payload;
      void _d;
      res = await sb
        .from(tbl).update({ ...slim, updated_by: context.userId })
        .eq("id", targetId).eq("tenant_id", data.tenant_id)
        .select("*").single();
    }
    if (res.error) throw new Error(res.error.message);
    const row = res.data as MasterRow;
    await audit(context, data.tenant_id, data.kind, row.id, data.id ? "update" : "create", before, row);
    return row;
  });

/* ------------------------------------------------------------------ */
/*  Soft delete / Restore / Activate / Deactivate                      */
/* ------------------------------------------------------------------ */

const SetActiveInput = z.object({
  kind: KindZ,
  tenant_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(500),
  op: z.enum(["delete", "restore", "activate", "deactivate"]),
});

export const setMasterActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetActiveInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertWrite(context, data.tenant_id);
    const sb = (context as Ctx).supabase as any;
    const tbl = table(data.kind);
    const patch: Record<string, unknown> = {};
    if (data.op === "delete") {
      patch.deleted_at = new Date().toISOString();
      patch.deleted_by = context.userId;
      patch.status = "deleted";
    } else if (data.op === "restore") {
      patch.deleted_at = null;
      patch.deleted_by = null;
      patch.status = "active";
    } else if (data.op === "activate") {
      patch.status = "active";
    } else {
      patch.status = "inactive";
    }
    const { data: rows, error } = await sb
      .from(tbl).update(patch)
      .in("id", data.ids).eq("tenant_id", data.tenant_id)
      .select("id");
    if (error) throw new Error(error.message);
    const action = data.op === "delete" ? "delete" : data.op === "restore" ? "restore" : "bulk_update";
    for (const r of (rows ?? []) as { id: string }[]) {
      await audit(context, data.tenant_id, data.kind, r.id, action, null, patch);
    }
    return { updated: rows?.length ?? 0 };
  });

/* ------------------------------------------------------------------ */
/*  Merge                                                              */
/* ------------------------------------------------------------------ */

const MergeInput = z.object({
  kind: KindZ,
  tenant_id: z.string().uuid(),
  source_ids: z.array(z.string().uuid()).min(1).max(200),
  target_id: z.string().uuid(),
});

export const mergeMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MergeInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertWrite(context, data.tenant_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await (supabaseAdmin as any).rpc("master_merge_server", {
      _kind: data.kind,
      _source_ids: data.source_ids,
      _target_id: data.target_id,
      _actor: (context as Ctx).userId,
    });
    if (error) throw new Error(error.message);
    return res as { affected_products: number; merged_sources: number };
  });

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

export type MasterStats = { total: number; active: number; inactive: number; deleted: number; duplicates: number };

async function computeMasterStats(sb: any, kind: MasterKind, tenantId: string): Promise<MasterStats> {
  const tbl = table(kind);

  // Try fetching with deleted_at column first (most master tables have it)
  let res = await sb
    .from(tbl)
    .select("name, status, deleted_at")
    .eq("tenant_id", tenantId)
    .limit(10000);

  const hasDeletedAt = !res.error;

  if (!hasDeletedAt) {
    // Fallback: table doesn't have deleted_at column
    res = await sb
      .from(tbl)
      .select("name, status")
      .eq("tenant_id", tenantId)
      .limit(10000);
  }

  if (res.error) {
    // Last resort: just count rows without tenant_id filter (some tables may not have it)
    const res2 = await sb.from(tbl).select("name", { count: "exact", head: true });
    return { total: res2.count ?? 0, active: res2.count ?? 0, inactive: 0, deleted: 0, duplicates: 0 };
  }

  const rows = (res.data ?? []) as Array<{ name?: string | null; status?: string | null; deleted_at?: string | null }>;
  let total = 0;
  let active = 0;
  let inactive = 0;
  let deleted = 0;
  const seen = new Map<string, number>();

  for (const r of rows) {
    if (hasDeletedAt && r.deleted_at) {
      deleted++;
      continue;
    }
    total++;
    const st = (r.status ?? "active").toLowerCase();
    if (st === "active") active++;
    else inactive++;

    const key = (r.name ?? "").trim().toLowerCase();
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  let duplicates = 0;
  for (const count of seen.values()) {
    if (count > 1) duplicates += count - 1;
  }

  return { total, active, inactive, deleted, duplicates };
}

export const getMasterStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind: KindZ, tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MasterStats> => {
    await assertMember(context, data.tenant_id);
    const sb = (context as Ctx).supabase as any;
    return computeMasterStats(sb, data.kind, data.tenant_id);
  });

export const getAllMasterStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Record<MasterKind, MasterStats>> => {
    await assertMember(context, data.tenant_id);
    const sb = (context as Ctx).supabase as any;
    const entries = await Promise.all(
      MASTER_KINDS.map(async (kind) => [kind, await computeMasterStats(sb, kind, data.tenant_id)] as const),
    );
    return Object.fromEntries(entries) as Record<MasterKind, MasterStats>;
  });

/* ------------------------------------------------------------------ */
/*  Audit list                                                          */
/* ------------------------------------------------------------------ */

export const listMasterAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: KindZ, tenant_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const sb = (context as Ctx).supabase as any;
    const { data: rows, error } = await sb
      .from("master_audit_log")
      .select("id, master_id, action, before, after, actor, occurred_at")
      .eq("tenant_id", data.tenant_id).eq("master_kind", data.kind)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: number; master_id: string | null; action: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      before: any; after: any; actor: string | null; occurred_at: string;
    }>;
  });

/* ------------------------------------------------------------------ */
/*  Import preview + commit (rows passed in by caller after Excel parse) */
/* ------------------------------------------------------------------ */

const ImportPreviewInput = z.object({
  kind: KindZ,
  tenant_id: z.string().uuid(),
  rows: z.array(z.object({
    name: z.string(),
    code: z.string().nullish(),
    aliases: z.array(z.string()).optional(),
    description: z.string().nullish(),
  })).max(5000),
});

export type ImportPreviewRow = {
  index: number;
  name: string;
  code: string | null;
  status: "new" | "duplicate_in_db" | "duplicate_in_file" | "invalid";
  reason?: string;
  existing_id?: string;
};

export const previewMasterImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportPreviewInput.parse(d))
  .handler(async ({ data, context }): Promise<ImportPreviewRow[]> => {
    await assertMember(context, data.tenant_id);
    const sb = (context as Ctx).supabase as any;
    const tbl = table(data.kind);
    const names = data.rows.map((r) => (r.name ?? "").trim()).filter(Boolean);
    const { data: existing } = await sb
      .from(tbl).select("id, name")
      .eq("tenant_id", data.tenant_id).is("deleted_at", null)
      .in("name", names);
    const exMap = new Map<string, string>();
    for (const e of (existing ?? []) as { id: string; name: string }[]) {
      exMap.set(e.name.toLowerCase(), e.id);
    }
    const seenInFile = new Map<string, number>();
    return data.rows.map((r, i) => {
      const name = (r.name ?? "").trim();
      if (!name) return { index: i, name, code: r.code ?? null, status: "invalid" as const, reason: "Empty name" };
      // eslint-disable-next-line no-control-regex
      if (/[\x00-\x1F\x7F]/.test(name)) return { index: i, name, code: r.code ?? null, status: "invalid" as const, reason: "Invalid characters" };
      const lower = name.toLowerCase();
      if (seenInFile.has(lower)) return { index: i, name, code: r.code ?? null, status: "duplicate_in_file" as const, reason: `Row ${seenInFile.get(lower)! + 1}` };
      seenInFile.set(lower, i);
      const existId = exMap.get(lower);
      if (existId) return { index: i, name, code: r.code ?? null, status: "duplicate_in_db" as const, existing_id: existId };
      return { index: i, name, code: r.code ?? null, status: "new" as const };
    });
  });

export const commitMasterImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportPreviewInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertWrite(context, data.tenant_id);
    const sb = (context as Ctx).supabase as any;
    const tbl = table(data.kind);
    const payload = data.rows.map((r) => ({ ...r, name: (r.name ?? "").trim() })).filter((r) => r.name.length > 0);
    if (payload.length === 0) return { inserted: 0, skipped: 0 };
    const before = await sb.from(tbl).select("id", { count: "exact", head: true }).eq("tenant_id", data.tenant_id).is("deleted_at", null);
    await resolveMasterIds({
      supabase: sb,
      tenantId: data.tenant_id,
      userId: context.userId,
      masters: payload.map((r) => ({ kind: data.kind, name: r.name, status: "active" })),
    });
    const after = await sb.from(tbl).select("id", { count: "exact", head: true }).eq("tenant_id", data.tenant_id).is("deleted_at", null);
    const inserted = Math.max(0, Number(after.count ?? 0) - Number(before.count ?? 0));
    await audit(context, data.tenant_id, data.kind, null, "import", null, { inserted });
    return { inserted, skipped: payload.length - inserted };
  });
