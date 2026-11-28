import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertSafeOutboundUrl } from "@/lib/security/ssrf-guard.server";
import { loadBusinessRules } from "./business-rules.functions";

type ExtractedItem = {
  raw_text: string;
  brand_name?: string | null;
  generic_name?: string | null;
  strength?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  duration_days?: number | null;
  quantity?: number | null;
  interpreted_notes?: string | null;
};

type ExtractResult = {
  patient_name?: string | null;
  doctor_name?: string | null;
  prescription_date?: string | null;
  ocr_text?: string;
  items: ExtractedItem[];
  fallbackToClientOcr?: boolean;
};

/* ---------- Frequency → doses/day ---------- */
function dosesPerDay(freq?: string | null): number {
  if (!freq) return 0;
  const f = freq.toUpperCase().replace(/\s+/g, "");
  // pattern like 1+1+1 or 1+0+1
  const m = f.match(/^(\d+)\+(\d+)\+(\d+)(?:\+(\d+))?$/);
  if (m) return m.slice(1).filter(Boolean).map(Number).reduce((a, b) => a + b, 0);
  if (/^OD$|^QD$/.test(f)) return 1;
  if (/^BD$|^BID$/.test(f)) return 2;
  if (/^TDS$|^TID$/.test(f)) return 3;
  if (/^QID$|^QDS$/.test(f)) return 4;
  if (/^SOS$|^PRN$/.test(f)) return 1; // as-needed → 1 unit suggestion
  return 0;
}

function computeQty(item: ExtractedItem): number {
  if (item.quantity && item.quantity > 0) return item.quantity;
  const per = dosesPerDay(item.frequency);
  const days = item.duration_days ?? 0;
  if (per > 0 && days > 0) return per * days;
  return 1;
}

/* ---------- OCR + medicine extraction ---------- */
const RX_SYSTEM_PROMPT =
  "You are a pharmacy assistant that extracts structured medicine data from prescription images " +
  "(English or Bangla, printed or handwritten). " +
  "Return STRICT JSON matching the schema. Do not invent medicines; only list ones written. " +
  "For each medicine, capture frequency exactly as written (e.g. '1+1+1', '1-0-1', 'OD', 'BD', 'TDS', 'QID', 'SOS') " +
  "and duration in days as an integer. If quantity is explicitly written use it; otherwise leave quantity null " +
  "and the system will compute it.";

const RX_USER_PROMPT =
  "Extract the prescription. Schema:\n" +
  '{ "patient_name": string|null, "doctor_name": string|null, ' +
  '"prescription_date": "YYYY-MM-DD"|null, "ocr_text": string, ' +
  '"items": [{ "raw_text": string, "brand_name": string|null, ' +
  '"generic_name": string|null, "strength": string|null, ' +
  '"dosage": string|null, "frequency": string|null, "duration_days": number|null, ' +
  '"quantity": number|null, "interpreted_notes": string|null }] }';

export const extractPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    imageUrl: z.string().min(10).max(12_000_000),
  }))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const trimmedUrl = data.imageUrl.trim();
    const dataUrlMatch = trimmedUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!dataUrlMatch) {
      const parsed = await assertSafeOutboundUrl(trimmedUrl, { allowHttp: false });
      if (parsed.protocol !== "https:") {
        throw new Error("Only https image URLs or JPEG/PNG/WebP data URLs are allowed");
      }
    }

    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();

    let text = "";

    if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: RX_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: RX_USER_PROMPT },
                { type: "image_url", image_url: { url: trimmedUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) throw new Error(`Vision API error: ${res.status}`);
      const json = await res.json();
      text = json?.choices?.[0]?.message?.content ?? "{}";
    } else if (geminiKey) {
      if (!dataUrlMatch) {
        throw new Error("Gemini vision extraction requires a base64 JPEG/PNG/WebP image");
      }
      const mimeType = dataUrlMatch[1];
      const base64Data = dataUrlMatch[2];
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `${RX_SYSTEM_PROMPT}\n\n${RX_USER_PROMPT}` },
                { inline_data: { mime_type: mimeType, data: base64Data } },
              ],
            }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini Vision error: ${res.status}`);
      const json = await res.json();
      text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    } else {
      return {
        patient_name: null,
        doctor_name: null,
        prescription_date: null,
        ocr_text: "",
        items: [],
        fallbackToClientOcr: true,
      };
    }

    let parsed: ExtractResult;
    try { parsed = JSON.parse(text); }
    catch { parsed = { items: [], ocr_text: text }; }
    if (!Array.isArray(parsed.items)) parsed.items = [];

    // server-side quantity computation
    parsed.items = parsed.items.map((it) => ({
      ...it,
      quantity: computeQty(it),
    }));
    return parsed;
  });

/* ---------- Match items against product database ---------- */
function score(target: string, candidate: string): number {
  const a = target.toLowerCase().trim();
  const b = candidate.toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 90;
  const tokensA = new Set(a.split(/\s+/));
  const tokensB = new Set(b.split(/\s+/));
  const inter = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union ? Math.round((inter / union) * 85) : 0;
}

export const matchPrescriptionItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    items: z.array(z.object({
      raw_text: z.string(),
      brand_name: z.string().nullish(),
      generic_name: z.string().nullish(),
      strength: z.string().nullish(),
    })),
  }))
  .handler(async ({ data, context }) => {
    const { data: products } = await context.supabase
      .from("products")
      .select("id,name,name_bn,sku,retail_price,generic_id,generics(name)")
      .eq("tenant_id", data.tenantId)
      .eq("is_active", true)
      .limit(2000);

    return data.items.map((it) => {
      const target = [it.brand_name, it.generic_name, it.strength]
        .filter(Boolean).join(" ") || it.raw_text;

      let best = {
        product_id: null as string | null,
        name: "",
        confidence: 0,
        generic_id: null as string | null,
        generic_name: null as string | null,
      };
      for (const p of products ?? []) {
        const genericName = (p.generics as { name?: string } | null)?.name ?? null;
        const candidate = [p.name, genericName].filter(Boolean).join(" ");
        const s = score(target, candidate);
        if (s > best.confidence) {
          best = { product_id: p.id, name: p.name, confidence: s, generic_id: p.generic_id, generic_name: genericName };
        }
      }
      const status: "auto" | "review" | "manual" =
        best.confidence >= 95 ? "auto" : best.confidence >= 80 ? "review" : "manual";
      return { ...it, ...best, status };
    });
  });

/* ---------- Alternatives (same generic) ---------- */
export const findAlternatives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    generic_id: z.string().uuid().nullable(),
    exclude_product_id: z.string().uuid().nullable().optional(),
  }))
  .handler(async ({ data, context }) => {
    if (!data.generic_id) return [];
    let q = context.supabase
      .from("products")
      .select("id,name,retail_price,reorder_level")
      .eq("tenant_id", data.tenantId)
      .eq("is_active", true)
      .eq("generic_id", data.generic_id)
      .limit(12);
    if (data.exclude_product_id) q = q.neq("id", data.exclude_product_id);
    const { data: rows } = await q;
    if (!rows?.length) return [];
    const ids = rows.map((r) => r.id);
    const { data: bats } = await context.supabase
      .from("batches").select("product_id,qty_on_hand").in("product_id", ids);
    const stock = new Map<string, number>();
    for (const b of bats ?? []) stock.set(b.product_id, (stock.get(b.product_id) ?? 0) + Number(b.qty_on_hand || 0));
    return rows
      .map((r) => ({ ...r, stock_qty: stock.get(r.id) ?? 0 }))
      .sort((a, b) => b.stock_qty - a.stock_qty);
  });

/* ---------- Customer history + allergies ---------- */
export const getCustomerHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({ tenantId: z.string().uuid(), customer_id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const [{ data: customer }, { data: rx }, { data: sales }] = await Promise.all([
      context.supabase.from("customers").select("id,name,phone,allergies").eq("id", data.customer_id).single(),
      context.supabase.from("prescriptions")
        .select("id,doctor_name,prescription_date,created_at,status")
        .eq("tenant_id", data.tenantId).eq("customer_id", data.customer_id)
        .order("created_at", { ascending: false }).limit(10),
      context.supabase.from("sale_items")
        .select("product_id,qty,products(name)")
        .eq("tenant_id", data.tenantId)
        .order("created_at", { ascending: false }).limit(50),
    ]);
    // aggregate frequent medicines
    const freq = new Map<string, { name: string; count: number }>();
    for (const s of sales ?? []) {
      const id = s.product_id as string | null;
      const name = (s.products as { name?: string } | null)?.name ?? "Unknown";
      if (!id) continue;
      const cur = freq.get(id) ?? { name, count: 0 };
      cur.count += Number(s.qty) || 1;
      freq.set(id, cur);
    }
    const frequent = [...freq.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    return { customer, prescriptions: rx ?? [], frequent };
  });

/* ---------- Prescription Summary (markdown) ---------- */
export const summarizePrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: rx } = await context.supabase
      .from("prescriptions")
      .select("patient_name,doctor_name,prescription_date,ocr_text,customer_id")
      .eq("tenant_id", data.tenantId).eq("id", data.id).single();
    const { data: items } = await context.supabase
      .from("prescription_items")
      .select("brand_name,generic_name,strength,dosage,frequency,duration_days,quantity,products(name)")
      .eq("prescription_id", data.id);

    let allergies: string | null = null;
    if (rx?.customer_id) {
      const { data: c } = await context.supabase
        .from("customers").select("allergies").eq("id", rx.customer_id).single();
      allergies = c?.allergies ?? null;
    }

    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (openaiKey) {
      const payload = { prescription: rx, items: items ?? [], patient_allergies: allergies };
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content:
              "You are a pharmacist assistant. Given a prescription, write a concise markdown summary with sections: " +
              "**Medicines** (bullet per medicine with dose/frequency/duration), " +
              "**Duplicate generics** (flag any), **Allergy risk** (check medicines vs patient allergies), " +
              "**General notes**. Keep it under 200 words. Do not provide medical advice; flag risks for the pharmacist." },
            { role: "user", content: JSON.stringify(payload) },
          ],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const summary: string = json?.choices?.[0]?.message?.content ?? "";
        await context.supabase.from("prescriptions")
          .update({ ai_summary: summary }).eq("tenant_id", data.tenantId).eq("id", data.id);
        return { summary };
      }
    }

    // Deterministic summary without external AI
    const lines = (items ?? []).map((it: any) => {
      const name = it.products?.name || it.brand_name || it.generic_name || "Medicine";
      const details = [it.strength, it.dosage || it.frequency, it.duration_days ? `${it.duration_days}d` : null, `Qty: ${it.quantity ?? 1}`]
        .filter(Boolean).join(" · ");
      return `- **${name}** (${details})`;
    });
    const genericCounts = new Map<string, number>();
    for (const it of items ?? []) {
      const g = (it as any).generic_name?.toLowerCase()?.trim();
      if (g) genericCounts.set(g, (genericCounts.get(g) ?? 0) + 1);
    }
    const dups = [...genericCounts.entries()].filter(([, c]) => c > 1).map(([g]) => g);
    const summary = [
      `**Medicines (${lines.length})**`,
      lines.length ? lines.join("\n") : "- No medicines recorded.",
      "",
      `**Duplicate generics:** ${dups.length ? dups.join(", ") : "None detected"}`,
      `**Patient allergies:** ${allergies || "None recorded"}`,
    ].join("\n");

    await context.supabase.from("prescriptions")
      .update({ ai_summary: summary }).eq("tenant_id", data.tenantId).eq("id", data.id);
    return { summary };
  });

/* ---------- Persist a new prescription with items ---------- */
export const createPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    branch_id: z.string().uuid(),
    image_path: z.string().nullable(),
    file_kind: z.enum(["image", "pdf"]).default("image"),
    customer_id: z.string().uuid().nullable().optional(),
    doctor_id: z.string().uuid().nullable().optional(),
    patient_name: z.string().nullish(),
    doctor_name: z.string().nullish(),
    prescription_date: z.string().nullish(),
    ocr_text: z.string().nullish(),
    items: z.array(z.object({
      raw_text: z.string(),
      brand_name: z.string().nullish(),
      generic_name: z.string().nullish(),
      strength: z.string().nullish(),
      dosage: z.string().nullish(),
      frequency: z.string().nullish(),
      duration_days: z.number().nullish(),
      quantity: z.number().nullish(),
      interpreted_notes: z.string().nullish(),
      matched_product_id: z.string().uuid().nullable().optional(),
      confidence: z.number().default(0),
      status: z.enum(["auto", "review", "manual", "unmatched", "approved", "rejected"]).default("manual"),
    })),
  }))
  .handler(async ({ data, context }) => {
    const { data: rx, error } = await context.supabase
      .from("prescriptions")
      .insert({
        tenant_id: data.tenantId,
        branch_id: data.branch_id,
        image_path: data.image_path,
        file_kind: data.file_kind,
        customer_id: data.customer_id ?? null,
        doctor_id: data.doctor_id ?? null,
        patient_name: data.patient_name ?? null,
        doctor_name: data.doctor_name ?? null,
        prescription_date: data.prescription_date ?? null,
        ocr_text: data.ocr_text ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !rx) throw error ?? new Error("Failed to save prescription");

    if (data.items.length) {
      const { error: e2 } = await context.supabase.from("prescription_items").insert(
        data.items.map((i) => ({
          tenant_id: data.tenantId,
          branch_id: data.branch_id,
          prescription_id: rx.id,
          raw_text: i.raw_text,
          brand_name: i.brand_name ?? null,
          generic_name: i.generic_name ?? null,
          strength: i.strength ?? null,
          dosage: i.dosage ?? null,
          frequency: i.frequency ?? null,
          duration_days: i.duration_days ?? null,
          quantity: i.quantity ?? 1,
          interpreted_notes: i.interpreted_notes ?? null,
          matched_product_id: i.matched_product_id ?? null,
          confidence: i.confidence,
          status: i.status,
        })),
      );
      if (e2) throw e2;
    }
    return { id: rx.id };
  });

/* ---------- List / get ---------- */
export const listPrescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({ tenantId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("prescriptions")
      .select("id, patient_name, doctor_name, doctor_id, prescription_date, status, created_at, customer_id, customers(name), doctors(id,full_name,speciality)")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    return rows ?? [];
  });

export const getPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({ tenantId: z.string().uuid(), id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const [{ data: rx }, { data: items }] = await Promise.all([
      context.supabase.from("prescriptions").select("*, customers(id,name,allergies), doctors(id,full_name,speciality,bmdc_no)").eq("tenant_id", data.tenantId).eq("id", data.id).single(),
      context.supabase.from("prescription_items")
        .select("*, products(id,name,retail_price,generic_id,generics(id,name))")
        .eq("prescription_id", data.id),
    ]);
    return { prescription: rx, items: items ?? [] };
  });

export const verifyPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    id: z.string().uuid(),
    status: z.enum(["verified", "rejected", "converted"]),
  }))
  .handler(async ({ data, context }) => {
    // Enforce safety acknowledgement on Send-to-POS / dispense actions
    if (data.status === "converted") {
      const rules = await loadBusinessRules(context.supabase, data.tenantId);
      if (rules.require_safety_ack) {
        const { data: rx } = await context.supabase
          .from("prescriptions")
          .select("safety_ack_at, safety_ack_severity")
          .eq("tenant_id", data.tenantId).eq("id", data.id).maybeSingle();
        const highSeverity = await context.supabase
          .from("clinical_audit")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", data.tenantId)
          .eq("prescription_id", data.id)
          .eq("action_taken", "surfaced")
          .in("severity", ["major", "contraindicated", "critical"]);
        const needsAck = (highSeverity.count ?? 0) > 0;
        if (needsAck && !rx?.safety_ack_at) {
          await context.supabase.rpc("audit_log_event", {
            _tenant_id: data.tenantId,
            _action: "clinical_dispense_blocked",
            _entity_table: "prescriptions",
            _entity_id: data.id,
          });
          throw new Error("Clinical safety acknowledgement required before dispensing.");
        }
      }
    }
    const { error } = await context.supabase
      .from("prescriptions")
      .update({
        status: data.status,
        verified_by: context.userId,
        verified_at: new Date().toISOString(),
      })
      .eq("tenant_id", data.tenantId)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const signedPrescriptionUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("prescription")])
  .inputValidator(z.object({ path: z.string() }))
  .handler(async ({ data, context }) => {
    const { data: signed } = await context.supabase.storage.from("prescriptions").createSignedUrl(data.path, 3600);
    return { url: signed?.signedUrl ?? null };
  });
