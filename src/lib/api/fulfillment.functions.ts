// E17.3 — Fulfillment + Refill Intelligence + Clinical Dashboard server fns
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

/** Doses/day inference, mirrors prescriptions.functions.ts */
function dosesPerDay(freq?: string | null): number {
  if (!freq) return 0;
  const f = freq.toUpperCase().replace(/\s+/g, "");
  const m = f.match(/^(\d+)\+(\d+)\+(\d+)(?:\+(\d+))?$/);
  if (m) return m.slice(1).filter(Boolean).map(Number).reduce((a, b) => a + b, 0);
  if (/^OD$|^QD$/.test(f)) return 1;
  if (/^BD$|^BID$/.test(f)) return 2;
  if (/^TDS$|^TID$/.test(f)) return 3;
  if (/^QID$|^QDS$/.test(f)) return 4;
  if (/^SOS$|^PRN$/.test(f)) return 1;
  return 0;
}

/** Mark fulfillment status (auto-called from POS or manual). */
export const markPrescriptionFulfillment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    prescription_id: z.string().uuid(),
    status: z.enum(["new","reviewed","fulfilled","partially_fulfilled","cancelled"]),
    sale_id: z.string().uuid().nullish(),
    fulfilled_items: z.array(z.object({
      item_id: z.string().uuid(),
      qty: z.number(),
    })).default([]),
  }))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const isFulfilled = data.status === "fulfilled" || data.status === "partially_fulfilled";

    // Update per-item fulfilled qty
    for (const f of data.fulfilled_items) {
      await context.supabase
        .from("prescription_items")
        .update({ fulfilled_qty: f.qty })
        .eq("tenant_id", data.tenantId)
        .eq("id", f.item_id);
    }

    // Compute refill date if fulfilled
    let expected_refill_date: string | null = null;
    if (isFulfilled) {
      const { data: items } = await context.supabase
        .from("prescription_items")
        .select("frequency,duration_days,quantity,fulfilled_qty")
        .eq("prescription_id", data.prescription_id);
      // longest "days of supply" across items
      let maxDays = 0;
      for (const it of items ?? []) {
        const supplied = Number(it.fulfilled_qty) || Number(it.quantity) || 0;
        const per = dosesPerDay(it.frequency as string | null);
        const days = per > 0 ? Math.floor(supplied / per) : (Number(it.duration_days) || 0);
        if (days > maxDays) maxDays = days;
      }
      if (maxDays > 0) {
        const d = new Date();
        d.setDate(d.getDate() + maxDays);
        expected_refill_date = d.toISOString().slice(0, 10);
      }
    }

    const { error } = await context.supabase
      .from("prescriptions")
      .update({
        fulfillment_status: data.status,
        fulfilled_by: isFulfilled ? context.userId : null,
        fulfilled_at: isFulfilled ? now : null,
        fulfilled_sale_id: data.sale_id ?? null,
        expected_refill_date,
      })
      .eq("tenant_id", data.tenantId)
      .eq("id", data.prescription_id);
    if (error) throw error;

    // Upsert refill record
    if (expected_refill_date) {
      const { data: rx } = await context.supabase
        .from("prescriptions").select("customer_id")
        .eq("id", data.prescription_id).single();
      await context.supabase.from("prescription_refills").insert({
        tenant_id: data.tenantId,
        prescription_id: data.prescription_id,
        customer_id: rx?.customer_id ?? null,
        expected_date: expected_refill_date,
        status: "pending",
      });
    }

    // Audit
    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      user_id: context.userId,
      action: data.status === "fulfilled"
        ? "prescription.fulfilled"
        : data.status === "partially_fulfilled"
          ? "prescription.partial"
          : `prescription.${data.status}`,
      entity_table: "prescriptions",
      entity_id: data.prescription_id,
      after_data: { status: data.status, sale_id: data.sale_id ?? null, expected_refill_date },
    });

    return { ok: true, expected_refill_date };
  });

/** Compute KPIs for the Clinical Dashboard. */
export const clinicalDashboardKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    days: z.number().int().min(1).max(365).default(30),
  }))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: rx }, { data: jobs }, { data: refills }] = await Promise.all([
      context.supabase.from("prescriptions")
        .select("id,fulfillment_status,unmatched_count,confidence_score,created_at")
        .eq("tenant_id", data.tenantId)
        .gte("created_at", since),
      context.supabase.from("prescription_ocr_jobs")
        .select("id,status,confidence,pharmacist_review_status,created_at")
        .eq("tenant_id", data.tenantId)
        .gte("created_at", since),
      context.supabase.from("prescription_refills")
        .select("id,status,expected_date,completed_at")
        .eq("tenant_id", data.tenantId)
        .gte("created_at", since),
    ]);

    const rxRows = rx ?? [];
    const total = rxRows.length;
    const fulfilled = rxRows.filter((r) => r.fulfillment_status === "fulfilled").length;
    const partial = rxRows.filter((r) => r.fulfillment_status === "partially_fulfilled").length;
    const cancelled = rxRows.filter((r) => r.fulfillment_status === "cancelled").length;

    const ocrTotal = (jobs ?? []).length;
    const ocrOk = (jobs ?? []).filter((j) => j.status === "completed").length;
    const manualCorr = (jobs ?? []).filter((j) => j.pharmacist_review_status === "modified" || j.pharmacist_review_status === "rejected").length;
    const avgConfidence = ocrTotal
      ? Math.round((jobs ?? []).reduce((s, j) => s + Number(j.confidence || 0), 0) / ocrTotal)
      : 0;

    const refillsAll = refills ?? [];
    const refillDue = refillsAll.filter((r) => r.status !== "completed" && r.expected_date <= today).length;
    const refillCompleted = refillsAll.filter((r) => r.status === "completed").length;

    return {
      window_days: data.days,
      prescriptions: { total, fulfilled, partial, cancelled, fulfillment_rate: total ? Math.round((fulfilled / total) * 100) : 0, partial_rate: total ? Math.round((partial / total) * 100) : 0 },
      ocr: { total: ocrTotal, success: ocrOk, success_rate: ocrTotal ? Math.round((ocrOk / ocrTotal) * 100) : 0, manual_correction_rate: ocrTotal ? Math.round((manualCorr / ocrTotal) * 100) : 0, avg_confidence: avgConfidence },
      refills: { total: refillsAll.length, due: refillDue, completed: refillCompleted },
    };
  });

/** List upcoming/overdue refills for the dashboard feed. */
export const listRefills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    status: z.enum(["pending","due","notified","completed","skipped","all"]).default("all"),
    limit: z.number().int().max(200).default(50),
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("prescription_refills")
      .select("id,expected_date,status,notified_at,completed_at,notes,prescription_id,customer_id,prescriptions(patient_name,doctor_name), customers(name,phone)")
      .eq("tenant_id", data.tenantId)
      .order("expected_date", { ascending: true })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;
    return rows ?? [];
  });

/** Mark refill completed/notified/skipped. */
export const updateRefillStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    id: z.string().uuid(),
    status: z.enum(["pending","due","notified","completed","skipped"]),
    notes: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const patch = {
      status: data.status,
      notes: data.notes ?? null,
      completed_at: data.status === "completed" ? now : null,
      completed_by: data.status === "completed" ? context.userId : null,
      notified_at: data.status === "notified" ? now : null,
    };
    const { error } = await context.supabase
      .from("prescription_refills")
      .update(patch)
      .eq("tenant_id", data.tenantId).eq("id", data.id);
    if (error) throw error;

    if (data.status === "completed") {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenantId,
        user_id: context.userId,
        action: "prescription.refill_completed",
        entity_table: "prescription_refills",
        entity_id: data.id,
      });
    }
    return { ok: true };
  });
