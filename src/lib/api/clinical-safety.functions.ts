import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { loadBusinessRules } from "@/lib/api/business-rules.functions";
import type { Json } from "@/integrations/supabase/types";

/* ---------- Types ---------- */
export type Severity = "minor" | "moderate" | "major" | "contraindicated";
export type AlertLevel = "info" | "warning" | "critical";

export type InteractionAlert = {
  severity: Severity;
  level: AlertLevel;
  generic_a: string;
  generic_b: string;
  effect: string | null;
  management: string | null;
  clinical_note: string | null;
};

export type AllergyAlert = {
  level: AlertLevel;
  allergy: string;
  medicine: string;
  generic: string | null;
  note: string;
};

export type DosageAlert = {
  level: AlertLevel;
  medicine: string;
  generic: string | null;
  reason: string;
  note: string | null;
};

const severityToLevel: Record<Severity, AlertLevel> = {
  minor: "info",
  moderate: "warning",
  major: "critical",
  contraindicated: "critical",
};

/* ---------- 1. Interactions ---------- */
export const checkPrescriptionInteractions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    generic_ids: z.array(z.string().uuid()).default([]),
    generic_names: z.array(z.string()).default([]),
  }))
  .handler(async ({ data, context }): Promise<InteractionAlert[]> => {
    const rules = await loadBusinessRules(context.supabase, data.tenantId);
    if (!rules.enable_clinical_safety) return [];
    const ids = [...new Set(data.generic_ids.filter(Boolean))];
    const names = [...new Set(data.generic_names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
    if (ids.length + names.length < 2) return [];

    const ors: string[] = [];
    if (ids.length) {
      ors.push(`generic_a_id.in.(${ids.join(",")})`);
      ors.push(`generic_b_id.in.(${ids.join(",")})`);
    }
    if (names.length) {
      const quoted = names.map((n) => `"${n.replace(/"/g, "")}"`).join(",");
      ors.push(`generic_a.in.(${quoted})`);
      ors.push(`generic_b.in.(${quoted})`);
    }
    const { data: rows } = await context.supabase
      .from("drug_interactions")
      .select("severity,generic_a,generic_b,generic_a_id,generic_b_id,effect,management,clinical_note,tenant_id")
      .or(ors.join(","))
      .limit(500);

    const idSet = new Set(ids);
    const nameSet = new Set(names);
    const out: InteractionAlert[] = [];
    for (const r of rows ?? []) {
      if (r.tenant_id && r.tenant_id !== data.tenantId) continue;
      const aMatches = (r.generic_a_id && idSet.has(r.generic_a_id)) || (r.generic_a && nameSet.has(r.generic_a.toLowerCase()));
      const bMatches = (r.generic_b_id && idSet.has(r.generic_b_id)) || (r.generic_b && nameSet.has(r.generic_b.toLowerCase()));
      if (!aMatches || !bMatches) continue;
      const sev = (r.severity ?? "moderate") as Severity;
      out.push({
        severity: sev,
        level: severityToLevel[sev] ?? "warning",
        generic_a: r.generic_a ?? "",
        generic_b: r.generic_b ?? "",
        effect: r.effect ?? null,
        management: r.management ?? null,
        clinical_note: r.clinical_note ?? null,
      });
    }
    return out;
  });

/* ---------- 2. Allergies ---------- */
export const checkPrescriptionAllergies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    customer_id: z.string().uuid().nullable(),
    items: z.array(z.object({
      medicine: z.string(),
      generic: z.string().nullish(),
    })),
  }))
  .handler(async ({ data, context }): Promise<AllergyAlert[]> => {
    const rules = await loadBusinessRules(context.supabase, data.tenantId);
    if (!rules.enable_clinical_safety) return [];
    if (!data.customer_id) return [];
    const [{ data: cust }, { data: pat }] = await Promise.all([
      context.supabase.from("customers").select("allergies").eq("id", data.customer_id).eq("tenant_id", data.tenantId).maybeSingle(),
      context.supabase.from("patients").select("allergies").eq("linked_customer_id", data.customer_id).eq("tenant_id", data.tenantId).maybeSingle(),
    ]);
    const blob = [cust?.allergies, pat?.allergies].filter(Boolean).join(",");
    const allergies = blob.toLowerCase().split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!allergies.length) return [];

    const hits: AllergyAlert[] = [];
    for (const it of data.items) {
      const txt = [it.medicine, it.generic].filter(Boolean).join(" ").toLowerCase();
      for (const a of allergies) {
        if (a.length >= 3 && txt.includes(a)) {
          hits.push({
            level: "critical",
            allergy: a,
            medicine: it.medicine,
            generic: it.generic ?? null,
            note: `Patient allergy to "${a}" matches this medicine.`,
          });
        }
      }
    }
    return hits;
  });

/* ---------- 3. Dosage ---------- */
function dosesPerDay(freq?: string | null): number {
  if (!freq) return 0;
  const f = freq.toUpperCase().replace(/\s+/g, "");
  const m = f.match(/^(\d+)\+(\d+)\+(\d+)(?:\+(\d+))?$/);
  if (m) return m.slice(1).filter(Boolean).map(Number).reduce((a, b) => a + b, 0);
  if (/^OD$|^QD$/.test(f)) return 1;
  if (/^BD$|^BID$/.test(f)) return 2;
  if (/^TDS$|^TID$/.test(f)) return 3;
  if (/^QID$|^QDS$/.test(f)) return 4;
  return 0;
}

export const validatePrescriptionDosage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    customer_id: z.string().uuid().nullable(),
    items: z.array(z.object({
      medicine: z.string(),
      generic: z.string().nullish(),
      generic_id: z.string().uuid().nullish(),
      strength: z.string().nullish(),
      frequency: z.string().nullish(),
      duration_days: z.number().nullish(),
    })),
  }))
  .handler(async ({ data, context }): Promise<DosageAlert[]> => {
    const businessRules = await loadBusinessRules(context.supabase, data.tenantId);
    if (!businessRules.enable_clinical_safety) return [];
    const out: DosageAlert[] = [];
    let patientWeight: number | null = null;
    let pregnant = false;
    if (data.customer_id) {
      const { data: p } = await context.supabase
        .from("patients")
        .select("weight_kg,is_pregnant,dob")
        .eq("linked_customer_id", data.customer_id)
        .eq("tenant_id", data.tenantId)
        .maybeSingle();
      patientWeight = p?.weight_kg ? Number(p.weight_kg) : null;
      pregnant = !!p?.is_pregnant;
    }

    const gids = [...new Set(data.items.map((i) => i.generic_id).filter((v): v is string => !!v))];
    const gnames = [...new Set(data.items.map((i) => i.generic?.toLowerCase()).filter((v): v is string => !!v))];
    if (!gids.length && !gnames.length) return out;

    const ors: string[] = [];
    if (gids.length) ors.push(`generic_id.in.(${gids.join(",")})`);
    if (gnames.length) {
      const quoted = gnames.map((n) => `"${n.replace(/"/g, "")}"`).join(",");
      ors.push(`generic_name.in.(${quoted})`);
    }
    const { data: rules } = await context.supabase
      .from("dosage_rules")
      .select("*")
      .or(ors.join(","))
      .limit(500);

    for (const it of data.items) {
      const rule = (rules ?? []).find((r) =>
        (it.generic_id && r.generic_id === it.generic_id) ||
        (it.generic && r.generic_name && r.generic_name.toLowerCase() === it.generic.toLowerCase()),
      );
      if (!rule) continue;
      const per = dosesPerDay(it.frequency);
      const strengthNum = it.strength ? parseFloat(it.strength.replace(/[^0-9.]/g, "")) : 0;
      const dailyDose = per * strengthNum;

      if (rule.max_daily_dose && dailyDose > Number(rule.max_daily_dose)) {
        out.push({ level: "critical", medicine: it.medicine, generic: it.generic ?? null, reason: `Daily dose ${dailyDose}${rule.dose_unit ?? ""} exceeds max ${rule.max_daily_dose}${rule.dose_unit ?? ""}`, note: rule.notes });
      } else if (rule.min_daily_dose && dailyDose && dailyDose < Number(rule.min_daily_dose)) {
        out.push({ level: "warning", medicine: it.medicine, generic: it.generic ?? null, reason: `Daily dose ${dailyDose}${rule.dose_unit ?? ""} below min ${rule.min_daily_dose}${rule.dose_unit ?? ""}`, note: rule.notes });
      }
      if (rule.max_duration_days && it.duration_days && it.duration_days > rule.max_duration_days) {
        out.push({ level: "warning", medicine: it.medicine, generic: it.generic ?? null, reason: `Duration ${it.duration_days}d exceeds max ${rule.max_duration_days}d`, note: rule.notes });
      }
      if (rule.child_weight_required && !patientWeight) {
        out.push({ level: "warning", medicine: it.medicine, generic: it.generic ?? null, reason: "Weight-based dosing required but patient weight is missing", note: rule.notes });
      }
      if (rule.pregnancy_warning && pregnant) {
        out.push({ level: "critical", medicine: it.medicine, generic: it.generic ?? null, reason: "Contraindicated in pregnancy", note: rule.notes });
      }
    }
    return out;
  });

/* ---------- 4. Acknowledge ---------- */
export const acknowledgePrescriptionSafety = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    prescription_id: z.string().uuid(),
    severity: z.enum(["warning", "critical"]),
    note: z.string().min(3).max(1000),
    events: z.array(z.object({
      type: z.enum(["interaction", "allergy", "dosage"]),
      severity: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    })),
  }))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("prescriptions")
      .update({
        reviewed_by: context.userId,
        reviewed_at: now,
        override_reason: data.note,
        safety_ack_severity: data.severity,
        safety_ack_at: now,
      })
      .eq("tenant_id", data.tenantId)
      .eq("id", data.prescription_id);
    if (error) throw error;

    const { data: rx } = await context.supabase
      .from("prescriptions").select("customer_id, branch_id").eq("id", data.prescription_id).maybeSingle();

    if (data.events.length) {
      if (!rx?.branch_id) throw new Error("branch_required");
      await context.supabase.from("clinical_audit").insert(
        data.events.map((e) => ({
          tenant_id: data.tenantId,
          branch_id: rx.branch_id as string,
          prescription_id: data.prescription_id,
          patient_id: null,
          warning_type: `${e.type}.acknowledged`,
          severity: e.severity,
          details: { ...(e.details ?? {}), note: data.note, customer_id: rx?.customer_id ?? null } as Json,
          action_taken: "acknowledged",
          pharmacist_id: context.userId,
        })),
      );
    }
    return { ok: true };
  });

/* ---------- 5. Log warnings (called when alerts are surfaced) ---------- */
export const logSafetyWarnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    prescription_id: z.string().uuid(),
    events: z.array(z.object({
      type: z.enum(["interaction", "allergy", "dosage"]),
      severity: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    })),
  }))
  .handler(async ({ data, context }) => {
    if (!data.events.length) return { ok: true };
    const { data: rx } = await context.supabase
      .from("prescriptions").select("branch_id").eq("id", data.prescription_id).maybeSingle();
    if (!rx?.branch_id) throw new Error("branch_required");
    await context.supabase.from("clinical_audit").insert(
      data.events.map((e) => ({
        tenant_id: data.tenantId,
        branch_id: rx.branch_id as string,
        prescription_id: data.prescription_id,
        patient_id: null,
        warning_type: `${e.type}.warning`,
        severity: e.severity,
        details: (e.details ?? {}) as Json,
        action_taken: "surfaced",
        pharmacist_id: context.userId,
      })),
    );
    return { ok: true };
  });

/* ---------- 6. Clinical safety report ---------- */
export const getClinicalSafetyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    days: z.number().min(1).max(365).default(30),
  }))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const { data: events } = await context.supabase
      .from("clinical_audit")
      .select("warning_type,severity,prescription_id,created_at,action_taken")
      .eq("tenant_id", data.tenantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    const rows = events ?? [];
    const count = (pred: (e: typeof rows[number]) => boolean) => rows.filter(pred).length;
    const interactionAlerts = count((e) => e.warning_type?.startsWith("interaction.") && e.action_taken === "surfaced");
    const allergyAlerts = count((e) => e.warning_type?.startsWith("allergy.") && e.action_taken === "surfaced");
    const dosageAlerts = count((e) => e.warning_type?.startsWith("dosage.") && e.action_taken === "surfaced");
    const acknowledged = count((e) => e.action_taken === "acknowledged");
    const highRiskRx = new Set(
      rows.filter((e) => ["major", "contraindicated", "critical"].includes((e.severity ?? "").toLowerCase()))
        .map((e) => e.prescription_id).filter(Boolean),
    ).size;

    return {
      since,
      kpis: { interactionAlerts, allergyAlerts, dosageAlerts, acknowledged, highRiskRx },
      events: rows.slice(0, 200),
    };
  });
