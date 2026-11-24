// Phase 3 — Server functions for the Enterprise Import Engine.
// Thin wrappers; heavy work in import-v2.server.ts and Postgres RPCs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { getResolvedMasterId, resolveMasterIds } from "@/lib/api/master-resolver";

const TenantInput = z.object({ tenant_id: z.string().uuid() });

const CreateJobInput = TenantInput.extend({
  file_path: z.string().min(1),
  file_name: z.string().min(1),
  vendor: z.string().nullable().optional(),
  mapping: z.record(z.string(), z.string()).default({}),
});

export const createImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => CreateJobInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("import_jobs_v2")
      .insert({
        tenant_id: data.tenant_id,
        file_path: data.file_path,
        file_name: data.file_name,
        vendor: data.vendor ?? null,
        mapping: data.mapping,
        status: "uploaded",
        created_by: context.userId,
      } as never)
      .select("id, batch_id")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("import_audit").insert({
      job_id: (row as { id: string }).id,
      tenant_id: data.tenant_id,
      from_status: null, to_status: "uploaded",
      actor: context.userId,
    } as never);
    return row as { id: string; batch_id: string };
  });

const AnalyzeInput = TenantInput.extend({
  job_id: z.string().uuid(),
  mapping: z.record(z.string(), z.string()),
});

export const analyzeImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => AnalyzeInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("import_jobs_v2")
      .update({ status: "analyzing", mapping: data.mapping } as never)
      .eq("id", data.job_id);

    const { data: job, error: jobErr } = await context.supabase
      .from("import_jobs_v2").select("file_path").eq("id", data.job_id).single();
    if (jobErr || !job) throw new Error(jobErr?.message ?? "job not found");

    const { analyzeFile } = await import("./import-v2.server");
    const res = await analyzeFile({
      supabase: context.supabase as never,
      jobId: data.job_id,
      tenantId: data.tenant_id,
      filePath: (job as { file_path: string }).file_path,
      mapping: data.mapping as never,
    });

    await context.supabase.from("import_audit").insert({
      job_id: data.job_id, tenant_id: data.tenant_id,
      from_status: "analyzing", to_status: "analyzed",
      actor: context.userId, detail: res.quality as never,
    } as never);

    return res;
  });

const JobIdInput = z.object({ job_id: z.string().uuid() });

export const getImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("import_jobs_v2").select("*").eq("id", data.job_id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

const MasterDiffInput = JobIdInput.extend({
  kind: z.enum([
    "manufacturer","generic","category","unit",
    "medicine_type","dosage_form","country","tax_class","therapeutic_class",
  ]),
});
export const getMasterDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => MasterDiffInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("import_master_diff").select("*")
      .eq("job_id", data.job_id).eq("kind", data.kind)
      .order("occurrences", { ascending: false }).limit(2000);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ApproveInput = JobIdInput.extend({
  decisions: z.array(z.object({ id: z.number(), approved: z.boolean() })),
});
export const approveMasterDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => ApproveInput.parse(d))
  .handler(async ({ data, context }) => {
    for (const d of data.decisions) {
      await context.supabase.from("import_master_diff")
        .update({ approved: d.approved } as never).eq("id", d.id);
    }
    return { ok: true };
  });

// Materialize approved masters (insert new rows, fill target_id, link staging FKs).
export const materializeApprovedMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.extend({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase
      .from("import_jobs_v2").select("tenant_id").eq("id", data.job_id).single();
    if (!job) throw new Error("job not found");
    const tenantId = (job as { tenant_id: string }).tenant_id;

    const { data: pending } = await context.supabase
      .from("import_master_diff").select("*")
      .eq("job_id", data.job_id).eq("approved", true).eq("match_status", "new");

    type Pending = { id: number; kind: string; normalized_value: string };
    const pendingRows = (pending ?? []) as Array<Pending>;

    const allowedKinds = new Set(["manufacturer", "generic", "category", "unit", "medicine_type", "dosage_form", "country", "tax_class", "therapeutic_class"]);
    const groups = new Map<string, { kind: string; name: string; diffIds: number[] }>();
    for (const m of pendingRows) {
      if (!allowedKinds.has(m.kind)) continue;
      const key = `${m.kind}|${m.normalized_value.toLowerCase()}`;
      const g = groups.get(key);
      if (g) g.diffIds.push(m.id);
      else groups.set(key, { kind: m.kind, name: m.normalized_value, diffIds: [m.id] });
    }

    const resolved = await resolveMasterIds({
      supabase: context.supabase,
      tenantId,
      userId: context.userId,
      masters: Array.from(groups.values()).map((g) => ({ kind: g.kind as never, name: g.name })),
    });

    for (const g of groups.values()) {
      const targetId = getResolvedMasterId(resolved, g.kind as never, g.name);
      if (!targetId) throw new Error(`master resolve failed (${g.kind}/${g.name})`);

      // Stamp every diff row in this group with the resolved id.
      for (const diffId of g.diffIds) {
        await context.supabase.from("import_master_diff")
          .update({ target_id: targetId, match_status: "existing" } as never)
          .eq("id", diffId);
      }
    }

    // Link staging rows: stamp <kind>_id from master_diff matched by normalized value.
    const { data: allMasters } = await context.supabase
      .from("import_master_diff").select("kind, normalized_value, target_id")
      .eq("job_id", data.job_id).not("target_id", "is", null);

    const lookup = new Map<string, string>();
    (allMasters ?? []).forEach((m: { kind: string; normalized_value: string; target_id: string }) =>
      lookup.set(`${m.kind}|${m.normalized_value.toLowerCase()}`, m.target_id));

    // Paginate staging rows in 1000-row pages and patch normalized.<kind>_id
    const PAGE = 1000;
    const map: Array<[string, string]> = [
      ["manufacturer", "manufacturer_id"], ["generic", "generic_id"],
      ["category", "category_id"], ["unit", "unit_id"],
      ["medicine_type", "medicine_type_id"], ["dosage_form", "dosage_form_id"],
      ["country", "country_id"], ["tax_class", "tax_class_id"],
      ["therapeutic_class", "therapeutic_class_id"],
    ];
    let lastId = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: page, error: pageErr } = await context.supabase
        .from("import_staging_rows").select("id, normalized")
        .eq("job_id", data.job_id).eq("status", "ready")
        .gt("id", lastId).order("id", { ascending: true }).limit(PAGE);
      if (pageErr) throw new Error(pageErr.message);
      const rows = (page ?? []) as Array<{ id: number; normalized: Record<string, unknown> }>;
      if (rows.length === 0) break;
      for (const r of rows) {
        const n = { ...r.normalized };
        for (const [kind, idField] of map) {
          const v = (n[kind] as string | undefined) ?? "";
          if (!v) continue;
          const tid = lookup.get(`${kind}|${v.toLowerCase()}`);
          if (tid) n[idField] = tid;
        }
        await context.supabase.from("import_staging_rows")
          .update({ normalized: n } as never).eq("id", r.id);
        lastId = r.id;
      }
      if (rows.length < PAGE) break;
    }

    await context.supabase.from("import_jobs_v2")
      .update({ status: "masters_approved" } as never).eq("id", data.job_id);
    return { ok: true };
  });


export const startImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("import_jobs_v2")
      .update({ status: "running", started_at: new Date().toISOString() } as never)
      .eq("id", data.job_id);
    return { ok: true };
  });

const ChunkInput = JobIdInput.extend({ batch: z.number().int().min(1).max(2000).default(500) });
export const processImportV2Chunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => ChunkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("process_product_import_chunk_v2", {
      _job: data.job_id, _batch: data.batch,
    } as never);
    if (error) throw new Error(error.message);
    return res as { processed: number; imported: number; failed: number; skipped: number; has_more: boolean };
  });

export const pauseImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("import_jobs_v2")
      .update({ status: "paused" } as never).eq("id", data.job_id);
    return { ok: true };
  });

export const resumeImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("import_jobs_v2")
      .update({ status: "running" } as never).eq("id", data.job_id);
    return { ok: true };
  });

export const cancelImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("import_jobs_v2")
      .update({ status: "cancelled", finished_at: new Date().toISOString() } as never)
      .eq("id", data.job_id);
    return { ok: true };
  });

export const retryFailedRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("import_staging_rows")
      .update({ status: "ready" } as never)
      .eq("job_id", data.job_id).eq("status", "error");
    await context.supabase.from("import_jobs_v2")
      .update({ status: "running" } as never).eq("id", data.job_id);
    return { ok: true };
  });

export const rollbackImportV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase
      .rpc("rollback_product_import_v2", { _job: data.job_id } as never);
    if (error) throw new Error(error.message);
    return res as { products: number; batches: number; barcodes: number };
  });

export const downloadErrorReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("import_errors_v2").select("row_number, column_name, product_name, error_code, error_message, reason, suggested_fix")
      .eq("job_id", data.job_id).order("row_number");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ListInput = TenantInput.extend({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) });
export const listImportJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, count, error } = await context.supabase
      .from("import_jobs_v2").select("*", { count: "exact" })
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], count: count ?? 0 };
  });

export const getImportDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => TenantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("import_jobs_v2")
      .select("status, total_rows, imported_rows, failed_rows, duration_ms, finished_at, created_at")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false }).limit(100);
    const list = (rows ?? []) as Array<{ status: string; total_rows: number; imported_rows: number; failed_rows: number; duration_ms: number | null; finished_at: string | null; created_at: string }>;
    const completed = list.filter((r) => r.status === "completed");
    const running = list.filter((r) => r.status === "running" || r.status === "paused").length;
    const failed = list.filter((r) => r.status === "failed").length;
    const avgRowsPerSec = completed.length
      ? completed.reduce((s, r) => s + (r.duration_ms ? (r.imported_rows / (r.duration_ms / 1000)) : 0), 0) / completed.length
      : 0;
    return {
      last_import: list[0] ?? null,
      running, failed,
      completed: completed.length,
      avg_rows_per_sec: Math.round(avgRowsPerSec * 10) / 10,
      total_imported: completed.reduce((s, r) => s + (r.imported_rows ?? 0), 0),
      total_failed: completed.reduce((s, r) => s + (r.failed_rows ?? 0), 0),
      recent: list.slice(0, 10),
    };
  });
