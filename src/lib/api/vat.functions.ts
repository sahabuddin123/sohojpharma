// Bangladesh MUSAK / VAT report server functions.
// All queries run under the caller (RLS-scoped to their tenant).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";

const RangeSchema = z.object({
  tenant_id: z.string().uuid(),
  from_date: z.string().optional(), // YYYY-MM-DD
  to_date: z.string().optional(),
});

const ComputeSchema = z.object({
  amount: z.number(),
  rate: z.number().min(0),
  mode: z.enum(["inclusive", "exclusive", "none"]).default("exclusive"),
});

/** Pure VAT calculator delegated to the DB function (single source of truth). */
export const computeVat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("accounting")])
  .inputValidator((d) => ComputeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("compute_vat", {
      _amount: data.amount,
      _rate: data.rate,
      _mode: data.mode,
    });
    if (error) throw new Error(error.message);
    const r = Array.isArray(rows) ? rows[0] : rows;
    return {
      net: Number(r?.net ?? 0),
      vat: Number(r?.vat ?? 0),
      gross: Number(r?.gross ?? 0),
    };
  });

/** Sales VAT register (MUSAK 6.3 style). */
export const getSalesVatRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("accounting")])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("v_sales_vat_register")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("invoice_date", { ascending: false })
      .order("invoice_no");
    if (data.from_date) q = q.gte("invoice_date", data.from_date);
    if (data.to_date) q = q.lte("invoice_date", data.to_date);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const totals = (rows ?? []).reduce(
      (a, r) => {
        a.net += Number(r.net);
        a.vat += Number(r.vat);
        a.gross += Number(r.gross);
        return a;
      },
      { net: 0, vat: 0, gross: 0 }
    );
    return { rows: rows ?? [], totals };
  });

/** Purchase VAT register (MUSAK 6.1 style). */
export const getPurchaseVatRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("accounting")])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("v_purchase_vat_register")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("receipt_date", { ascending: false })
      .order("grn_no");
    if (data.from_date) q = q.gte("receipt_date", data.from_date);
    if (data.to_date) q = q.lte("receipt_date", data.to_date);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const totals = (rows ?? []).reduce(
      (a, r) => {
        a.net += Number(r.net);
        a.vat += Number(r.vat);
        a.gross += Number(r.gross);
        return a;
      },
      { net: 0, vat: 0, gross: 0 }
    );
    return { rows: rows ?? [], totals };
  });

/** Monthly MUSAK summary: output VAT, input VAT, net payable. */
export const getMusakSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("accounting")])
  .inputValidator((d) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("v_musak_summary")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("period", { ascending: false });
    if (data.from_date) q = q.gte("period", data.from_date);
    if (data.to_date) q = q.lte("period", data.to_date);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
