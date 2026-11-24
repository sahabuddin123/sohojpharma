// Phase 3.4 — Clinical Intelligence Layer.
// Reads: any authenticated tenant user. Writes: app admins only (RLS-enforced).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

const MedIn = z.object({ medicine_id: z.string().uuid() });
const IdIn = z.object({ id: z.string().uuid() });
const PairIn = z.object({ medicine_ids: z.array(z.string().uuid()).min(1).max(50) });

// ============= READ APIs (Module 13) =============

export const searchClinicalMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")])
  .inputValidator((d: unknown) => z.object({ q: z.string().default(""), limit: z.number().int().min(1).max(100).default(25) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("global_medicines")
      .select("id, brand_name, strength, dosage_form, prescription_required, otc_allowed, generic:global_generics(name), manufacturer:global_manufacturers(name), classes:global_medicine_therapeutic_classes(therapeutic_class:global_therapeutic_classes(id,name,code))")
      .order("brand_name").limit(data.limit);
    if (data.q) q = q.ilike("brand_name", `%${data.q}%`);
    const { data: meds, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (meds ?? []).map((m) => m.id);
    if (!ids.length) return [];
    const [altCounts, ixCounts] = await Promise.all([
      context.supabase.from("global_medicine_alternatives").select("source_medicine_id").in("source_medicine_id", ids).eq("approved", true),
      context.supabase.from("global_drug_interactions").select("medicine_a, medicine_b").or(`medicine_a.in.(${ids.join(",")}),medicine_b.in.(${ids.join(",")})`),
    ]);
    const altMap = new Map<string, number>();
    (altCounts.data ?? []).forEach((r: { source_medicine_id: string }) => altMap.set(r.source_medicine_id, (altMap.get(r.source_medicine_id) ?? 0) + 1));
    const ixMap = new Map<string, number>();
    (ixCounts.data ?? []).forEach((r: { medicine_a: string; medicine_b: string }) => {
      if (ids.includes(r.medicine_a)) ixMap.set(r.medicine_a, (ixMap.get(r.medicine_a) ?? 0) + 1);
      if (ids.includes(r.medicine_b)) ixMap.set(r.medicine_b, (ixMap.get(r.medicine_b) ?? 0) + 1);
    });
    return (meds ?? []).map((m) => ({
      id: m.id, brand_name: m.brand_name, strength: m.strength, dosage_form: m.dosage_form,
      prescription_required: m.prescription_required, otc_allowed: m.otc_allowed,
      generic_name: (m.generic as { name?: string } | null)?.name ?? null,
      manufacturer_name: (m.manufacturer as { name?: string } | null)?.name ?? null,
      therapeutic_classes: (m.classes as Array<{ therapeutic_class: { id: string; name: string; code: string | null } | null }> | null ?? [])
        .map((c) => c.therapeutic_class).filter(Boolean),
      alternatives_count: altMap.get(m.id) ?? 0,
      interactions_count: ixMap.get(m.id) ?? 0,
    }));
  });

export const getMedicineDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => MedIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: med, error } = await context.supabase.from("global_medicines")
      .select("id, brand_name, strength, dosage_form, route, description, prescription_required, otc_allowed, pregnancy_category, lactation_warning, pediatric_warning, geriatric_warning, atc_code, generic:global_generics(id,name), manufacturer:global_manufacturers(id,name)")
      .eq("id", data.medicine_id).maybeSingle();
    if (error) throw new Error(error.message);
    return med;
  });

export const getTherapeuticClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => MedIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("global_medicine_therapeutic_classes")
      .select("therapeutic_class:global_therapeutic_classes(id,name,code,description)")
      .eq("medicine_id", data.medicine_id);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => r.therapeutic_class).filter(Boolean);
  });

export const getMedicineAlternatives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => MedIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("global_medicine_alternatives")
      .select("id, strength_match, generic_match, therapeutic_match, notes, approved, alternative:global_medicines!global_medicine_alternatives_alternative_medicine_id_fkey(id,brand_name,strength,dosage_form,generic:global_generics(name),manufacturer:global_manufacturers(name))")
      .eq("source_medicine_id", data.medicine_id).eq("approved", true);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDrugInteractions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => MedIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("global_drug_interactions")
      .select("id, severity, description, clinical_effect, recommendation, medicine_a, medicine_b, a:global_medicines!global_drug_interactions_medicine_a_fkey(id,brand_name), b:global_medicines!global_drug_interactions_medicine_b_fkey(id,brand_name)")
      .or(`medicine_a.eq.${data.medicine_id},medicine_b.eq.${data.medicine_id}`)
      .order("severity", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDosageGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => MedIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("global_dosage_guides")
      .select("*").eq("medicine_id", data.medicine_id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const getContraindications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => MedIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("global_contraindications")
      .select("id, condition, severity, notes").eq("medicine_id", data.medicine_id)
      .order("severity", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Module 11 — POS pairwise interaction lookup (READ ONLY, non-blocking)
export const getBasketInteractions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => PairIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_basket_interactions", { _medicine_ids: data.medicine_ids } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      medicine_a: string; medicine_b: string;
      severity: "minor" | "moderate" | "major";
      description: string | null; clinical_effect: string | null; recommendation: string | null;
      a_name: string; b_name: string;
    }>;
  });

// ============= ADMIN CRUD (Module 9, 14) =============

// --- Therapeutic Classes ---
export const adminListClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("global_therapeutic_classes").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ClassIn = z.object({ id: z.string().uuid().optional(), name: z.string().min(1).max(120), code: z.string().max(40).optional().nullable(), description: z.string().max(500).optional().nullable() });
export const adminSaveClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => ClassIn.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { name: data.name, code: data.code ?? null, description: data.description ?? null };
    if (data.id) {
      const { error } = await context.supabase.from("global_therapeutic_classes").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("global_therapeutic_classes").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
export const adminDeleteClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => IdIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("global_therapeutic_classes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Alternatives ---
export const adminListAlternatives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => z.object({ approved: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("global_medicine_alternatives")
      .select("id, source_medicine_id, alternative_medicine_id, strength_match, generic_match, therapeutic_match, notes, approved, created_at, source:global_medicines!global_medicine_alternatives_source_medicine_id_fkey(brand_name), alternative:global_medicines!global_medicine_alternatives_alternative_medicine_id_fkey(brand_name)")
      .order("created_at", { ascending: false }).limit(500);
    if (typeof data.approved === "boolean") q = q.eq("approved", data.approved);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const AltIn = z.object({
  source_medicine_id: z.string().uuid(), alternative_medicine_id: z.string().uuid(),
  strength_match: z.boolean().default(true), generic_match: z.boolean().default(true), therapeutic_match: z.boolean().default(true),
  notes: z.string().max(500).optional().nullable(), approved: z.boolean().default(false),
});
export const adminSaveAlternative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => AltIn.parse(d))
  .handler(async ({ data, context }) => {
    if (data.source_medicine_id === data.alternative_medicine_id) throw new Error("Source and alternative must differ");
    const { error } = await context.supabase.from("global_medicine_alternatives").upsert({
      ...data, approved_by: data.approved ? context.userId : null, approved_at: data.approved ? new Date().toISOString() : null,
    }, { onConflict: "source_medicine_id,alternative_medicine_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const adminDeleteAlternative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => IdIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("global_medicine_alternatives").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Drug Interactions ---
export const adminListInteractions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("global_drug_interactions")
      .select("id, severity, description, clinical_effect, recommendation, medicine_a, medicine_b, a:global_medicines!global_drug_interactions_medicine_a_fkey(brand_name), b:global_medicines!global_drug_interactions_medicine_b_fkey(brand_name)")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const IxIn = z.object({
  id: z.string().uuid().optional(),
  medicine_a: z.string().uuid(), medicine_b: z.string().uuid(),
  severity: z.enum(["minor", "moderate", "major"]),
  description: z.string().max(1000).optional().nullable(),
  clinical_effect: z.string().max(1000).optional().nullable(),
  recommendation: z.string().max(1000).optional().nullable(),
});
export const adminSaveInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => IxIn.parse(d))
  .handler(async ({ data, context }) => {
    if (data.medicine_a === data.medicine_b) throw new Error("Pick two different medicines");
    const [a, b] = [data.medicine_a, data.medicine_b].sort();
    const payload = { medicine_a: a, medicine_b: b, severity: data.severity, description: data.description ?? null, clinical_effect: data.clinical_effect ?? null, recommendation: data.recommendation ?? null };
    if (data.id) {
      const { error } = await context.supabase.from("global_drug_interactions").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("global_drug_interactions").upsert(payload, { onConflict: "medicine_a,medicine_b" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
export const adminDeleteInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => IdIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("global_drug_interactions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Dosage Guides ---
const DoseIn = z.object({
  medicine_id: z.string().uuid(),
  adult_dose: z.string().max(500).optional().nullable(),
  child_dose: z.string().max(500).optional().nullable(),
  max_daily_dose: z.string().max(200).optional().nullable(),
  renal_adjustment: z.string().max(500).optional().nullable(),
  hepatic_adjustment: z.string().max(500).optional().nullable(),
  administration_notes: z.string().max(1000).optional().nullable(),
});
export const adminSaveDosageGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => DoseIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("global_dosage_guides").upsert(data, { onConflict: "medicine_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Contraindications ---
const ContraIn = z.object({
  id: z.string().uuid().optional(),
  medicine_id: z.string().uuid(),
  condition: z.string().min(1).max(200),
  severity: z.enum(["minor", "moderate", "major"]).default("moderate"),
  notes: z.string().max(500).optional().nullable(),
});
export const adminSaveContraindication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => ContraIn.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase.from("global_contraindications").update({
        condition: data.condition, severity: data.severity, notes: data.notes ?? null,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("global_contraindications").upsert({
        medicine_id: data.medicine_id, condition: data.condition, severity: data.severity, notes: data.notes ?? null,
      }, { onConflict: "medicine_id,condition" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
export const adminDeleteContraindication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => IdIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("global_contraindications").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Medicine flag updates (prescription/pregnancy/etc.) ---
const FlagsIn = z.object({
  medicine_id: z.string().uuid(),
  prescription_required: z.boolean().optional(),
  otc_allowed: z.boolean().optional(),
  pregnancy_category: z.string().max(40).optional().nullable(),
  lactation_warning: z.string().max(500).optional().nullable(),
  pediatric_warning: z.string().max(500).optional().nullable(),
  geriatric_warning: z.string().max(500).optional().nullable(),
});
export const adminUpdateMedicineFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => FlagsIn.parse(d))
  .handler(async ({ data, context }) => {
    const { medicine_id, ...rest } = data;
    const { error } = await context.supabase.from("global_medicines").update(rest).eq("id", medicine_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Therapeutic-class mapping ---
const MapIn = z.object({ medicine_id: z.string().uuid(), therapeutic_class_id: z.string().uuid() });
export const adminAttachClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => MapIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("global_medicine_therapeutic_classes").upsert(data, { onConflict: "medicine_id,therapeutic_class_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const adminDetachClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => MapIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("global_medicine_therapeutic_classes").delete()
      .eq("medicine_id", data.medicine_id).eq("therapeutic_class_id", data.therapeutic_class_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============= Phase 3.5 — Clinical Automation Layer =============

// Module 1 — Alternative Suggestion Engine
export const getAlternativeSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => MedIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_alternative_suggestions", { _medicine_id: data.medicine_id } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      alternative_id: string; brand_name: string; generic_name: string | null;
      manufacturer_name: string | null; strength: string | null; dosage_form: string | null;
      priority: number; confidence: number; reason: string;
    }>;
  });

// Module 3 — Drug Interaction Alert Engine (cart-level)
export const checkMedicineInteractions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => PairIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_basket_interactions", { _medicine_ids: data.medicine_ids } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      medicine_a: string; medicine_b: string;
      severity: "minor" | "moderate" | "major";
      description: string | null; clinical_effect: string | null; recommendation: string | null;
      a_name: string; b_name: string;
    }>;
  });

// Module 4 — Aggregate clinical warnings for cart medicines
export const getClinicalWarnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => PairIn.parse(d))
  .handler(async ({ data, context }) => {
    const [meds, contras, ix] = await Promise.all([
      context.supabase.from("global_medicines")
        .select("id, brand_name, prescription_required, pregnancy_category, pediatric_warning, geriatric_warning, lactation_warning")
        .in("id", data.medicine_ids),
      context.supabase.from("global_contraindications")
        .select("medicine_id, condition, severity, notes").in("medicine_id", data.medicine_ids),
      context.supabase.rpc("get_basket_interactions", { _medicine_ids: data.medicine_ids } as never),
    ]);
    if (meds.error) throw new Error(meds.error.message);
    if (contras.error) throw new Error(contras.error.message);
    if (ix.error) throw new Error(ix.error.message);
    return {
      medicines: meds.data ?? [],
      contraindications: contras.data ?? [],
      interactions: ix.data ?? [],
    };
  });

// Module 6 — Smart Medicine Search
export const smartMedicineSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")])
  .inputValidator((d: unknown) => z.object({ q: z.string().default(""), limit: z.number().int().min(1).max(100).default(25) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("smart_medicine_search", { _q: data.q, _limit: data.limit } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string; brand_name: string; generic_name: string | null; manufacturer_name: string | null;
      strength: string | null; dosage_form: string | null;
      prescription_required: boolean; otc_allowed: boolean;
      pregnancy_category: string | null; pediatric_warning: string | null; geriatric_warning: string | null;
      match_type: string; score: number;
    }>;
  });

// Module 7 — Medicine Insight Panel
export const getMedicineInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireFeature("prescription")]).inputValidator((d: unknown) => MedIn.parse(d))
  .handler(async ({ data, context }) => {
    const id = data.medicine_id;
    const [med, alts, contras, classes, dose, ix] = await Promise.all([
      context.supabase.from("global_medicines")
        .select("id, brand_name, prescription_required, otc_allowed, pregnancy_category, pediatric_warning, geriatric_warning, lactation_warning")
        .eq("id", id).maybeSingle(),
      context.supabase.from("global_medicine_alternatives").select("id", { count: "exact", head: true }).eq("source_medicine_id", id).eq("approved", true),
      context.supabase.from("global_contraindications").select("id", { count: "exact", head: true }).eq("medicine_id", id),
      context.supabase.from("global_medicine_therapeutic_classes")
        .select("therapeutic_class:global_therapeutic_classes(id,name,code)").eq("medicine_id", id),
      context.supabase.from("global_dosage_guides").select("adult_dose, child_dose, max_daily_dose").eq("medicine_id", id).maybeSingle(),
      context.supabase.from("global_drug_interactions").select("id", { count: "exact", head: true }).or(`medicine_a.eq.${id},medicine_b.eq.${id}`),
    ]);
    const m = med.data;
    const riskScore =
      (m?.pregnancy_category === "X" ? 40 : m?.pregnancy_category === "D" ? 25 : 0) +
      ((ix.count ?? 0) >= 5 ? 25 : (ix.count ?? 0) * 5) +
      ((contras.count ?? 0) >= 3 ? 20 : (contras.count ?? 0) * 5) +
      (m?.pediatric_warning ? 10 : 0) + (m?.geriatric_warning ? 5 : 0);
    const risk = riskScore >= 50 ? "high" : riskScore >= 20 ? "medium" : "low";
    return {
      medicine: m,
      alternative_count: alts.count ?? 0,
      interaction_count: ix.count ?? 0,
      contraindication_count: contras.count ?? 0,
      therapeutic_classes: (classes.data ?? []).map((r) => r.therapeutic_class).filter(Boolean),
      dosage_summary: dose.data,
      clinical_risk_level: risk,
      risk_score: riskScore,
    };
  });

// Module 8 — Clinical Dashboard
export const getClinicalDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_clinical_dashboard" as never);
    if (error) throw new Error(error.message);
    return data as {
      total_medicines: number; prescription_medicines: number; otc_medicines: number;
      pregnancy_risk_medicines: number; total_alternatives: number; total_interactions: number;
      total_contraindications: number; clinical_coverage_pct: number;
      top_interacted: Array<{ id: string; brand_name: string; interaction_count: number }>;
      top_alternatives: Array<{ id: string; brand_name: string; alt_count: number }>;
      high_risk: Array<{ id: string; brand_name: string; pregnancy_category: string | null }>;
    };
  });

// Module 10 — Contribution quality score
export const scoreContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin]).inputValidator((d: unknown) => IdIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: score, error } = await context.supabase.rpc("score_contribution_quality", { _contribution_id: data.id } as never);
    if (error) throw new Error(error.message);
    return { score: (score as number) ?? 0 };
  });
