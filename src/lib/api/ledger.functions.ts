import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const PartyType = z.enum(["customer", "supplier"]);
const EntryType = z.enum([
  "opening", "sale", "sales_return", "collection",
  "purchase", "purchase_return", "payment", "adjustment",
]);

const PostSchema = z.object({
  tenant_id: z.string().uuid(),
  party_type: PartyType,
  party_id: z.string().uuid(),
  entry_type: EntryType,
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  ref_table: z.string().optional(),
  ref_id: z.string().uuid().optional(),
  ref_no: z.string().optional(),
  notes: z.string().optional(),
});

export const postLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) => PostSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("post_ledger_entry", {
      _tenant_id: data.tenant_id,
      _party_type: data.party_type,
      _party_id: data.party_id,
      _entry_type: data.entry_type,
      _debit: data.debit,
      _credit: data.credit,
      _ref_table: data.ref_table,
      _ref_id: data.ref_id,
      _ref_no: data.ref_no,
      _notes: data.notes,
    });
    if (error) throw new Error(error.message);
    return row;
  });

const StatementSchema = z.object({
  tenant_id: z.string().uuid(),
  party_id: z.string().uuid(),
  from_date: z.string().optional(), // ISO date
  to_date: z.string().optional(),
});

export const getCustomerStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("accounting")])
  .inputValidator((i: unknown) => StatementSchema.parse(i))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("v_customer_ledger")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .eq("party_id", data.party_id)
      .order("entry_date", { ascending: true });
    if (data.from_date) q = q.gte("entry_date", data.from_date);
    if (data.to_date) q = q.lte("entry_date", data.to_date);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getSupplierStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("accounting")])
  .inputValidator((i: unknown) => StatementSchema.parse(i))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("v_supplier_ledger")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .eq("party_id", data.party_id)
      .order("entry_date", { ascending: true });
    if (data.from_date) q = q.gte("entry_date", data.from_date);
    if (data.to_date) q = q.lte("entry_date", data.to_date);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getOutstandingDues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      party_type: PartyType.optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("v_outstanding_dues")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("balance", { ascending: false });
    if (data.party_type) q = q.eq("party_type", data.party_type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
