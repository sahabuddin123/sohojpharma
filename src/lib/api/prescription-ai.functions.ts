// B12 — AI Prescription Intelligence: job persistence, review, analytics.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const ConfidenceTier = (c: number) =>
  c >= 95 ? "auto" : c >= 80 ? "review" : "manual";

/* ---------- Create / persist an OCR job ---------- */
export const createOcrJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    image_url: z.string().nullish(),
    source: z.enum(["camera", "upload", "pdf", "mobile"]).default("upload"),
    provider: z.enum(["gemini", "google_vision", "azure", "manual"]).default("gemini"),
    language: z.string().default("en"),
    prescription_id: z.string().uuid().nullish(),
    doctor_id: z.string().uuid().nullish(),
    patient_id: z.string().uuid().nullish(),
    raw_text: z.string().nullish(),
    parsed_json: z.record(z.string(), z.any()).optional(),
    detected_medicines: z.array(z.any()).default([]),
    matched_medicines: z.array(z.any()).default([]),
    warnings: z.array(z.any()).default([]),
    confidence: z.number().min(0).max(100).default(0),
    processing_ms: z.number().int().nullish(),
    status: z.enum(["queued", "processing", "completed", "failed", "review_required"]).default("completed"),
    error_message: z.string().nullish(),
  }))
  .handler(async ({ data, context }) => {
    const tier = ConfidenceTier(data.confidence);
    const review = tier === "auto" ? "pending" : "pending";
    const { data: job, error } = await context.supabase
      .from("prescription_ocr_jobs")
      .insert({
        tenant_id: data.tenantId,
        prescription_id: data.prescription_id ?? null,
        image_url: data.image_url ?? null,
        source: data.source,
        provider: data.provider,
        language: data.language,
        doctor_id: data.doctor_id ?? null,
        patient_id: data.patient_id ?? null,
        raw_text: data.raw_text ?? null,
        parsed_json: data.parsed_json ?? {},
        detected_medicines: data.detected_medicines,
        matched_medicines: data.matched_medicines,
        warnings: data.warnings,
        confidence: data.confidence,
        processing_ms: data.processing_ms ?? null,
        status: data.status,
        error_message: data.error_message ?? null,
        pharmacist_review_status: review,
        created_by: context.userId,
      })
      .select("id, confidence, pharmacist_review_status")
      .single();
    if (error || !job) throw error ?? new Error("Failed to persist OCR job");

    await context.supabase.from("ai_metrics").insert({
      tenant_id: data.tenantId,
      metric_type: "ocr_confidence",
      doctor_id: data.doctor_id ?? null,
      ocr_job_id: job.id,
      value: data.confidence,
      details: { provider: data.provider, tier },
    });

    // Update doctor writing profile (running average)
    if (data.doctor_id) {
      const { data: prof } = await context.supabase
        .from("doctor_writing_profiles")
        .select("id, ocr_samples, avg_confidence, common_medicines")
        .eq("tenant_id", data.tenantId).eq("doctor_id", data.doctor_id).maybeSingle();
      const samples = (prof?.ocr_samples ?? 0) + 1;
      const avg = prof?.avg_confidence
        ? Number(((Number(prof.avg_confidence) * (samples - 1) + data.confidence) / samples).toFixed(2))
        : data.confidence;
      const meds = Array.isArray(prof?.common_medicines) ? prof!.common_medicines as unknown[] : [];
      const names = new Set<string>(meds.filter((x): x is string => typeof x === "string"));
      for (const m of data.detected_medicines as Array<{ brand_name?: string }>)
        if (m?.brand_name) names.add(m.brand_name);
      const payload = {
        tenant_id: data.tenantId,
        doctor_id: data.doctor_id,
        ocr_samples: samples,
        avg_confidence: avg,
        common_medicines: [...names].slice(0, 200),
        last_seen_at: new Date().toISOString(),
      };
      if (prof) await context.supabase.from("doctor_writing_profiles").update(payload).eq("id", prof.id);
      else      await context.supabase.from("doctor_writing_profiles").insert(payload);
    }

    return { id: job.id, tier, confidence: data.confidence };
  });

/* ---------- Pharmacist review (approve/reject/modify) ---------- */
export const reviewOcrJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    id: z.string().uuid(),
    decision: z.enum(["approved", "rejected", "modified"]),
    modifications: z.record(z.string(), z.any()).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("prescription_ocr_jobs")
      .update({
        pharmacist_review_status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        ...(data.modifications?.matched_medicines
          ? { matched_medicines: data.modifications.matched_medicines as never }
          : {}),
      })
      .eq("tenant_id", data.tenantId).eq("id", data.id);
    if (error) throw error;
    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      user_id: context.userId,
      action: `prescription_ocr_jobs.${data.decision}`,
      entity_table: "prescription_ocr_jobs",
      entity_id: data.id,
      after_data: { decision: data.decision, modifications: data.modifications ?? null },
    });
    return { ok: true };
  });

/* ---------- List / get OCR jobs ---------- */
export const listOcrJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({ tenantId: z.string().uuid(), limit: z.number().int().max(200).default(50) }))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("prescription_ocr_jobs")
      .select("id, source, provider, status, confidence, pharmacist_review_status, doctor_id, patient_id, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });

/* ---------- AI analytics rollup ---------- */
export const aiAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({ tenantId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: rollup } = await context.supabase
      .from("v_ai_accuracy").select("*").eq("tenant_id", data.tenantId).maybeSingle();
    const { data: byDoctor } = await context.supabase
      .from("doctor_writing_profiles")
      .select("doctor_id, ocr_samples, avg_confidence, doctors(name)")
      .eq("tenant_id", data.tenantId)
      .order("ocr_samples", { ascending: false })
      .limit(20);
    return { rollup: rollup ?? null, by_doctor: byDoctor ?? [] };
  });

/* ---------- Patient medication timeline ---------- */
export const patientTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({ tenantId: z.string().uuid(), patient_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const [{ data: rx }, { data: jobs }, { data: sales }] = await Promise.all([
      context.supabase.from("prescriptions")
        .select("id, doctor_name, prescription_date, status, created_at")
        .eq("tenant_id", data.tenantId).order("created_at", { ascending: false }).limit(50),
      context.supabase.from("prescription_ocr_jobs")
        .select("id, confidence, pharmacist_review_status, created_at, warnings")
        .eq("tenant_id", data.tenantId).eq("patient_id", data.patient_id)
        .order("created_at", { ascending: false }).limit(50),
      context.supabase.from("sale_items")
        .select("product_id, qty, products(name), created_at")
        .eq("tenant_id", data.tenantId).order("created_at", { ascending: false }).limit(100),
    ]);
    return { prescriptions: rx ?? [], ocr_jobs: jobs ?? [], purchases: sales ?? [] };
  });
