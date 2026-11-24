import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type DocType =
  | "invoice" | "receipt" | "customer_receipt" | "purchase_order" | "goods_receipt"
  | "purchase_return" | "sales_return" | "transfer"
  | "prescription" | "customer" | "supplier" | "product";

export const DOC_TYPES: DocType[] = [
  "invoice", "receipt", "customer_receipt", "purchase_order", "goods_receipt",
  "purchase_return", "sales_return", "transfer",
  "prescription", "customer", "supplier", "product",
];

export type SeriesEntry = { prefix: string; start: number };
export type NumberSeries = Record<DocType, SeriesEntry>;

export const DEFAULT_NUMBER_SERIES: NumberSeries = {
  invoice:          { prefix: "INV", start: 1000 },
  receipt:          { prefix: "POS", start: 1000 },
  customer_receipt: { prefix: "RCP", start: 202600001 },
  purchase_order:   { prefix: "PO",  start: 1000 },
  goods_receipt:    { prefix: "GRN", start: 1000 },
  purchase_return:  { prefix: "PR",  start: 1000 },
  sales_return:     { prefix: "SR",  start: 1000 },
  transfer:         { prefix: "TRF", start: 1000 },
  prescription:     { prefix: "RX",  start: 1000 },
  customer:         { prefix: "CUS", start: 1000 },
  supplier:         { prefix: "SUP", start: 1000 },
  product:          { prefix: "MED", start: 1000 },
};


const WRITE_ROLES = ["owner", "corporate_admin"] as const;
const READ_ROLES = ["owner", "corporate_admin", "manager", "auditor"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasAnyRole(ctx: { supabase: any; userId: string }, tenant_id: string, roles: readonly string[]) {
  for (const r of roles) {
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (error) throw new Error(error.message);
    if (data) return r;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const PrefixRe = /^[A-Za-z0-9_-]{1,12}$/;

const EntrySchema = z.object({
  prefix: z.string().regex(PrefixRe, "Prefix must be 1–12 of A-Z, 0-9, _ or -"),
  start: z.number().int().min(1).max(99_999_999),
});

const DocTypeSchema = z.enum([
  "invoice", "receipt", "customer_receipt", "purchase_order", "goods_receipt",
  "purchase_return", "sales_return", "transfer",
  "prescription", "customer", "supplier", "product",
]);

function mergeDefaults(raw: unknown): NumberSeries {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<DocType, Partial<SeriesEntry>>>;
  const out = { ...DEFAULT_NUMBER_SERIES };
  for (const k of DOC_TYPES) {
    const cur = obj[k] ?? {};
    out[k] = {
      prefix: typeof cur.prefix === "string" && cur.prefix ? cur.prefix : DEFAULT_NUMBER_SERIES[k].prefix,
      start: typeof cur.start === "number" && cur.start > 0 ? cur.start : DEFAULT_NUMBER_SERIES[k].start,
    };
  }
  return out;
}

export const getNumberSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, READ_ROLES);
    if (!role) throw new Error("Forbidden: insufficient role (403)");
    const sb = context.supabase;
    const { data: row, error } = await sb
      .from("tenant_settings").select("number_series").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    const series = mergeDefaults(row?.number_series);

    const { data: counters, error: cErr } = await sb
      .from("number_series_counters")
      .select("doc_type, current_value")
      .eq("tenant_id", data.tenant_id);
    if (cErr) throw new Error(cErr.message);
    const map: Record<string, number> = {};
    for (const c of (counters ?? [])) map[c.doc_type as string] = Number(c.current_value);

    return { series, counters: map };
  });

export const updateNumberSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: z.record(DocTypeSchema, EntrySchema.partial()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const role = await hasAnyRole(context, data.tenant_id, WRITE_ROLES);
    if (!role) throw new Error("Forbidden: owner or corporate_admin role required (403)");

    const sb = context.supabase;
    const { data: before } = await sb
      .from("tenant_settings").select("number_series").eq("tenant_id", data.tenant_id).maybeSingle();
    const prev = mergeDefaults(before?.number_series);

    // Validate start >= current_value+1 per doc_type
    const { data: counters } = await sb
      .from("number_series_counters")
      .select("doc_type, current_value")
      .eq("tenant_id", data.tenant_id);
    const curMap: Record<string, number> = {};
    for (const c of (counters ?? [])) curMap[c.doc_type as string] = Number(c.current_value);

    const next = { ...prev };
    for (const [k, v] of Object.entries(data.patch) as [DocType, Partial<SeriesEntry>][]) {
      const merged: SeriesEntry = {
        prefix: v.prefix ?? prev[k].prefix,
        start:  v.start  ?? prev[k].start,
      };
      const current = curMap[k] ?? 0;
      if (merged.start <= current) {
        throw new Error(`Cannot lower start for ${k} below current usage (${current + 1}).`);
      }
      next[k] = merged;
    }

    const { data: row, error } = await sb
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, number_series: next, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("number_series").single();
    if (error) throw new Error(error.message);

    await sb.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "number_series.updated",
      _entity_table: "tenant_settings",
      _before: prev,
      _after: row?.number_series,
    });

    return mergeDefaults(row?.number_series);
  });

export const previewNumberSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Record<DocType, string>> => {
    await assertMember(context, data.tenant_id);
    const sb = context.supabase;
    const { data: row } = await sb
      .from("tenant_settings").select("number_series").eq("tenant_id", data.tenant_id).maybeSingle();
    const series = mergeDefaults(row?.number_series);
    const { data: counters } = await sb
      .from("number_series_counters").select("doc_type, current_value")
      .eq("tenant_id", data.tenant_id);
    const cur: Record<string, number> = {};
    for (const c of (counters ?? [])) cur[c.doc_type as string] = Number(c.current_value);
    const out = {} as Record<DocType, string>;
    for (const k of DOC_TYPES) {
      const nextNum = Math.max(cur[k] ?? 0, series[k].start - 1) + 1;
      out[k] = `${series[k].prefix}-${nextNum}`;
    }
    return out;
  });

export const generateNextNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    doc_type: DocTypeSchema,
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ number: string }> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase.rpc("generate_next_number", {
      _tenant_id: data.tenant_id, _doc_type: data.doc_type,
    });
    if (error) throw new Error(error.message);
    return { number: row as string };
  });
