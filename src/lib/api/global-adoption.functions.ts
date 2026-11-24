// Global Catalog → Store Catalog Adoption Layer (Phase 3.6)
// Tenant-scoped reads/writes via authenticated Supabase client (RLS).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

const BrowseInput = z.object({
  tenant_id: z.string().uuid(),
  q: z.string().default(""),
  generic_id: z.string().uuid().nullable().optional(),
  manufacturer_id: z.string().uuid().nullable().optional(),
  dosage_form: z.string().nullable().optional(),
  therapeutic_class_id: z.string().uuid().nullable().optional(),
  prescription_only: z.boolean().nullable().optional(),
  otc_only: z.boolean().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type BrowseRow = {
  id: string;
  brand_name: string;
  generic_name: string | null;
  manufacturer_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  prescription_required: boolean;
  otc_allowed: boolean;
  already_in_catalog: boolean;
  total_count: number;
};

export const browseGlobalCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => BrowseInput.parse(d))
  .handler(async ({ data, context }): Promise<BrowseRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("browse_global_catalog", {
      _tenant: data.tenant_id,
      _q: data.q,
      _generic_id: data.generic_id ?? null,
      _manufacturer_id: data.manufacturer_id ?? null,
      _dosage_form: data.dosage_form ?? null,
      _therapeutic_class_id: data.therapeutic_class_id ?? null,
      _prescription_only: data.prescription_only ?? null,
      _otc_only: data.otc_only ?? null,
      _limit: data.limit,
      _offset: data.offset,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as BrowseRow[];
  });

const AdoptInput = z.object({
  tenant_id: z.string().uuid(),
  global_medicine_ids: z.array(z.string().uuid()).min(1).max(500),
});

export const bulkAdoptGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => AdoptInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("bulk_adopt_global", {
      _tenant: data.tenant_id,
      _ids: data.global_medicine_ids,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row ?? { created_count: 0, skipped_count: 0, created_product_ids: [] }) as {
      created_count: number; skipped_count: number; created_product_ids: string[];
    };
  });

const BulkLinkInput = z.object({
  tenant_id: z.string().uuid(),
  limit: z.number().int().min(1).max(5000).default(1000),
});

export const bulkLinkLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => BulkLinkInput.parse(d))
  .handler(async (_args) => {
    // Phase 5C: `bulk_link_local_products` RPC removed. Local products are
    // already canonical; no linking step is required.
    return { matched_count: 0, unmatched_count: 0, scanned_count: 0 };
  });

const BarcodeInput = z.object({ barcode: z.string().min(1) });
export const barcodeLookupGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => BarcodeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("barcode_lookup_global", {
      _barcode: data.barcode,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row ?? null) as null | {
      global_medicine_id: string; brand_name: string; generic_name: string | null;
      manufacturer_name: string | null; strength: string | null; dosage_form: string | null;
    };
  });

const TenantIn = z.object({ tenant_id: z.string().uuid() });
export const tenantCatalogHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => TenantIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("tenant_catalog_health", {
      _tenant: data.tenant_id,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return (row ?? { total: 0, linked: 0, unlinked: 0, coverage_pct: 0 }) as {
      total: number; linked: number; unlinked: number; coverage_pct: number;
    };
  });

// ---- Add opening stock (creates a product_batch row) ----
const OpeningStockInput = z.object({
  tenant_id: z.string().uuid(),
  product_id: z.string().uuid(),
  warehouse_id: z.string().uuid().nullable().optional(),
  batch_no: z.string().min(1),
  expiry_date: z.string().min(1),
  purchase_price: z.number().nonnegative(),
  sale_price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
});

export const addOpeningStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => OpeningStockInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error: bErr } = await context.supabase.from("batches").insert({
      tenant_id: data.tenant_id,
      product_id: data.product_id,
      branch_id: data.warehouse_id ?? null,
      batch_no: data.batch_no,
      expiry_date: data.expiry_date,
      purchase_price: data.purchase_price,
      sale_price: data.sale_price,
      opening_stock: data.quantity,
      qty_on_hand: data.quantity,
    } as never);
    if (bErr) throw new Error(bErr.message);
    // Update products pricing as opening defaults (non-breaking).
    await context.supabase.from("products").update({
      purchase_price: data.purchase_price,
      retail_price: data.sale_price,
    }).eq("id", data.product_id).eq("tenant_id", data.tenant_id);
    return { ok: true };
  });

// ---- Admin adoption analytics ----
export const adminAdoptionAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_adoption_analytics" as never);
    if (error) throw new Error(error.message);
    return data as unknown as {
      total_global_medicines: number;
      total_linked_products: number;
      total_products: number;
      total_pending_contributions: number;
      adoption_pct: number;
      most_added_medicines: Array<{ id: string; brand_name: string; adoption_count: number }>;
      most_linked_stores: Array<{ id: string; name: string; linked_count: number }>;
    };
  });

// ---- Unified search (tenant catalog + global catalog) ----
const UnifiedSearchInput = z.object({
  tenant_id: z.string().uuid(),
  q: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(25),
});

export type UnifiedSearchRow = {
  result_type: "in_catalog" | "available_globally";
  product_id: string | null;
  global_medicine_id: string | null;
  brand_name: string;
  generic_name: string | null;
  manufacturer_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  prescription_required: boolean;
  already_in_stock: boolean;
  score: number;
};


export const unifiedMedicineSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => UnifiedSearchInput.parse(d))
  .handler(async ({ data, context }): Promise<UnifiedSearchRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("unified_medicine_search", {
      _tenant: data.tenant_id,
      _q: data.q,
      _limit: data.limit,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as UnifiedSearchRow[];
  });

// ---- One-click adopt single medicine ----
const SingleAdoptInput = z.object({
  tenant_id: z.string().uuid(),
  global_medicine_id: z.string().uuid(),
});

export const adoptGlobalMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => SingleAdoptInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("bulk_adopt_global", {
      _tenant: data.tenant_id,
      _ids: [data.global_medicine_id],
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    const productId = (row as { created_product_ids?: string[] } | null)?.created_product_ids?.[0] ?? null;
    return { product_id: productId, created: !!productId };
  });

// ---- Adoption suggestions ----
const SuggestInput = z.object({
  tenant_id: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const adoptionSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => SuggestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("adoption_suggestions", {
      _tenant: data.tenant_id,
      _limit: data.limit,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      global_medicine_id: string; brand_name: string; generic_name: string | null;
      manufacturer_name: string | null; strength: string | null; dosage_form: string | null;
      adoption_count: number;
    }>;
  });

// ---- Admin: top adopted breakdown ----
export const topAdoptedBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("top_adopted_breakdown" as never, { _limit: 10 } as never);
    if (error) throw new Error(error.message);
    return data as {
      medicines: Array<{ id: string; brand_name: string; adoptions: number }>;
      generics: Array<{ generic_name: string; adoptions: number }>;
      manufacturers: Array<{ manufacturer_name: string; adoptions: number }>;
    };
  });

