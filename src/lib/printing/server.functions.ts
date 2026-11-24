// ============================================================
// Phase 2 — Enterprise Printing server functions.
// All RPCs are tenant-scoped and require authentication.
// Additive: existing print path is unaffected.
// ============================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Shared schema fragments ----------
const tenantInput = z.object({
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
});

const engineEnum = z.enum(["chrome", "qz", "auto"]);
const languageEnum = z.enum(["ZPL", "TSPL", "EPL", "ESCPOS"]);
const roleEnum = z.enum(["barcode", "receipt", "a4", "other"]);
const kindEnum = z.enum(["medicine", "shelf", "price", "batch", "expiry", "qr"]);
const statusEnum = z.enum(["pending", "printing", "completed", "failed", "cancelled"]);
const healthEnum = z.enum(["connected", "offline", "busy", "paused", "error"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(ctx: { supabase: any }, userId: string, tenantId: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Tenant membership check failed");
  if (!data) throw new Error("Forbidden: not a tenant member");
}

// ===================== Printing Settings =====================
export const getPrintingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tenantInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const q = context.supabase
      .from("printing_settings")
      .select("*")
      .eq("tenant_id", data.tenant_id);
    const filtered = data.branch_id ? q.eq("branch_id", data.branch_id) : q.is("branch_id", null);
    const { data: row, error } = await filtered.maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const upsertPrintingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    tenantInput.extend({
      engine: engineEnum.optional(),
      paper_width_mm: z.number().int().min(20).max(300).optional(),
      printer_language: languageEnum.optional(),
      auto_connect: z.boolean().optional(),
      copies: z.number().int().min(1).max(10).optional(),
      auto_print: z.boolean().optional(),
      silent_print: z.boolean().optional(),
      fallback_enabled: z.boolean().optional(),
      printing_v2_enabled: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const payload = { ...data, branch_id: data.branch_id ?? null };
    const { data: row, error } = await context.supabase
      .from("printing_settings")
      .upsert(payload, { onConflict: "tenant_id,branch_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ===================== Printer Profiles =====================
export const listPrinterProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tenantInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const q = context.supabase
      .from("printing_printer_profiles")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("printer_role", { ascending: true })
      .order("name", { ascending: true });
    const final = data.branch_id ? q.eq("branch_id", data.branch_id) : q;
    const { data: rows, error } = await final;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertPrinterProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    tenantInput.extend({
      id: z.string().uuid().optional(),
      printer_role: roleEnum,
      name: z.string().min(1).max(200),
      language: languageEnum.default("ZPL"),
      paper_width_mm: z.number().int().min(20).max(300).default(80),
      is_default: z.boolean().default(false),
      auto_detected: z.boolean().default(false),
      notes: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const payload = { ...data, branch_id: data.branch_id ?? null };
    const { data: row, error } = await context.supabase
      .from("printing_printer_profiles")
      .upsert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePrinterProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const { error } = await context.supabase
      .from("printing_printer_profiles")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== Print Jobs (queue + history) =====================
export const enqueuePrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    tenantInput.extend({
      document_type: z.string().min(1).max(64),
      document_id: z.string().max(128).nullable().optional(),
      printer_profile_id: z.string().uuid().nullable().optional(),
      printer_name: z.string().max(200).nullable().optional(),
      engine: z.enum(["chrome", "qz"]),
      paper_width_mm: z.number().int().min(20).max(300).default(80),
      copies: z.number().int().min(1).max(10).default(1),
      dedupe_key: z.string().max(200).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);

    // Dedupe: if a pending/printing job exists with the same key, return it.
    if (data.dedupe_key) {
      const { data: existing } = await context.supabase
        .from("print_jobs")
        .select("*")
        .eq("tenant_id", data.tenant_id)
        .eq("dedupe_key", data.dedupe_key)
        .in("status", ["pending", "printing"])
        .maybeSingle();
      if (existing) return existing;
    }

    const payload = {
      ...data,
      branch_id: data.branch_id ?? null,
      user_id: context.userId,
      status: "pending" as const,
      attempts: 0,
    };
    const { data: row, error } = await context.supabase
      .from("print_jobs")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateJobStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      id: z.string().uuid(),
      status: statusEnum,
      attempts: z.number().int().min(0).optional(),
      failure_reason: z.string().max(1000).nullable().optional(),
      started_at: z.string().nullable().optional(),
      completed_at: z.string().nullable().optional(),
      duration_ms: z.number().int().min(0).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const { id, tenant_id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("print_jobs")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenant_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listPrintJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    tenantInput.extend({
      status: statusEnum.optional(),
      document_type: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    let q = context.supabase
      .from("print_jobs")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.document_type) q = q.eq("document_type", data.document_type);
    if (data.search) q = q.or(`printer_name.ilike.%${data.search}%,document_id.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const cancelPrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const { error } = await context.supabase
      .from("print_jobs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("tenant_id", data.tenant_id)
      .in("status", ["pending", "printing"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== Label Templates =====================
export const listLabelTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      kind: kindEnum.optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    let q = context.supabase
      .from("printing_label_templates")
      .select("*")
      .or(`is_system.eq.true,tenant_id.eq.${data.tenant_id}`)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });
    if (data.kind) q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertLabelTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    tenantInput.extend({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(200),
      kind: kindEnum,
      language: languageEnum.default("ZPL"),
      paper_width_mm: z.number().int().min(20).max(300).default(40),
      paper_height_mm: z.number().int().min(10).max(300).default(25),
      body: z.string().min(1).max(20000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const payload = { ...data, branch_id: data.branch_id ?? null, is_system: false };
    const { data: row, error } = await context.supabase
      .from("printing_label_templates")
      .upsert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ===================== Health =====================
export const recordPrinterHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    tenantInput.extend({
      printer_name: z.string().min(1).max(200),
      status: healthEnum,
      latency_ms: z.number().int().min(0).nullable().optional(),
      detail: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const { error } = await context.supabase
      .from("print_health_log")
      .insert({ ...data, branch_id: data.branch_id ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPrinterHealthSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tenantInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, context.userId, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("print_health_log")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("recorded_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
