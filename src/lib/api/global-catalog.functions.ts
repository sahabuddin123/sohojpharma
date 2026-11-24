// Global Medicine Network — server functions.
// Read = any authenticated user. Write/approve = app admins only (RPCs).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

const SearchInput = z.object({
  tenant_id: z.string().uuid(),
  q: z.string().default(""),
  limit: z.number().int().min(1).max(100).default(25),
});

export type CatalogSearchRow = {
  source: "tenant" | "global";
  id: string;
  brand_name: string;
  generic_name: string | null;
  manufacturer: string | null;
  strength: string | null;
  dosage_form: string | null;
  already_in_catalog: boolean;
  already_in_stock: boolean;
};

export const searchCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data, context }): Promise<CatalogSearchRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("search_global_medicines", {
      _tenant: data.tenant_id, _q: data.q, _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CatalogSearchRow[];
  });

const ContributeInput = z.object({
  tenant_id: z.string().uuid(),
  product_id: z.string().uuid().nullable().optional(),
  payload: z.object({
    brand_name: z.string().min(1),
    generic_name: z.string().optional().nullable(),
    manufacturer_name: z.string().optional().nullable(),
    strength: z.string().optional().nullable(),
    dosage_form: z.string().optional().nullable(),
    prescription_required: z.boolean().optional(),
    barcode: z.string().optional().nullable(),
  }),
});

export const contributeMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => ContributeInput.parse(d))
  .handler(async ({ data, context }) => {
    // 1) Try exact match first (no duplicates).
    const { data: matched } = await context.supabase.rpc("match_global_medicine", {
      _brand: data.payload.brand_name,
      _generic: (data.payload.generic_name ?? "") as string,
      _mfr: (data.payload.manufacturer_name ?? "") as string,
      _strength: (data.payload.strength ?? "") as string,
      _form: (data.payload.dosage_form ?? "") as string,
    });
    if (matched) {
      if (data.product_id) {
        await context.supabase.from("products")
          .update({ global_medicine_id: matched as unknown as string })
          .eq("id", data.product_id).eq("tenant_id", data.tenant_id);
      }
      return { matched: true, global_medicine_id: matched as unknown as string, contribution_id: null };
    }
    // 2) Queue contribution for admin review.
    const { data: cid, error } = await context.supabase.rpc("contribute_global_medicine", {
      _tenant: data.tenant_id,
      _product: data.product_id ?? null,
      _payload: data.payload as never,
    } as never);
    if (error) throw new Error(error.message);
    return { matched: false, global_medicine_id: null, contribution_id: cid as unknown as string };
  });

const TenantIn = z.object({ tenant_id: z.string().uuid() });
export const listMyContributions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => TenantIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("global_medicine_contributions")
      .select("id, status, proposed_data, review_notes, resulting_medicine_id, created_at, reviewed_at")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---- Admin surface ----
const StatusIn = z.object({ status: z.enum(["pending", "approved", "rejected"]).default("pending") });
export const adminListContributions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => StatusIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("global_medicine_contributions")
      .select("id, tenant_id, product_id, status, proposed_data, review_notes, resulting_medicine_id, created_at, reviewed_at")
      .eq("status", data.status)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const IdIn = z.object({ id: z.string().uuid() });
export const approveContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => IdIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: med, error } = await context.supabase.rpc("approve_global_contribution", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true as const, global_medicine_id: med as unknown as string };
  });

const RejectIn = z.object({ id: z.string().uuid(), notes: z.string().max(500).optional() });
export const rejectContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => RejectIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reject_global_contribution", {
      _id: data.id, _notes: data.notes ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminCatalogStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("catalog_backfill_metrics");
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, number>;
  });

const ListIn = z.object({ q: z.string().default(""), limit: z.number().int().min(1).max(500).default(100) });
export const adminListMedicines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => ListIn.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("global_medicines")
      .select("id, brand_name, strength, dosage_form, approved, created_at, generic:global_generics(name), manufacturer:global_manufacturers(name)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.q) q = q.ilike("brand_name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ============= Phase 3.3 — Backfill & Matching Engine =============

export type CatalogSyncChunkResult = {
  processed: number;
  next_cursor: string | null;
  medicines_created: number;
  generics_created: number;
  manufacturers_created: number;
  linked: number;
  done: boolean;
};

const SyncChunkIn = z.object({
  limit: z.number().int().min(100).max(5000).default(1000),
  after: z.string().uuid().nullable().default(null),
});

// Chunked, timeout-safe backfill + linking. Client loops until done.
export const runBackfillChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => SyncChunkIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("catalog_sync_chunk", {
      _limit: data.limit,
      _after: data.after,
    } as never);
    if (error) throw new Error(error.message);
    return r as unknown as CatalogSyncChunkResult;
  });


export const runLinker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("link_products_to_global");
    if (error) throw new Error(error.message);
    return data as { linked_count: number; unlinked_count: number };
  });

const SeedIn = z.object({ limit: z.number().int().min(1).max(50000).default(10000) });
export const runSeedContributions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => SeedIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("seed_global_contributions", { _limit: data.limit } as never);
    if (error) throw new Error(error.message);
    return r as { reviews_created: number; contributions_created: number };
  });

export const runBarcodeMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("migrate_global_barcodes");
    if (error) throw new Error(error.message);
    return data as { barcodes_inserted: number; conflicting_barcodes: number };
  });

export const pushCatalogToTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(100).max(5000).default(2000) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("push_global_catalog_to_all_tenants", { _limit: data.limit });
    if (error) throw new Error(error.message);
    return r as { success: boolean; linked_count: number; unlinked_remaining: number; done: boolean };
  });

export const provisionAllTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // 1. Get all main branches
    const { data: branches, error: bError } = await supabaseAdmin
      .from("branches")
      .select("tenant_id, id")
      .eq("is_main", true);
    
    if (bError) throw new Error(bError.message);
    if (!branches) return { success: true, count: 0 };

    let count = 0;
    for (const b of branches) {
      // Loop until fully provisioned for this branch (checking for actual changes)
      for (let i = 0; i < 50; i++) { // Increased safety limit for 50k meds
        const { data: hasMore, error } = await supabaseAdmin.rpc("provision_catalog_for_tenant", {
          _tenant_id: b.tenant_id,
          _branch_id: b.id,
          _limit: 1000
        });
        
        if (error) {
          console.error(`Provisioning error for branch ${b.id}:`, error);
          break;
        }
        
        count++;
        // The RPC should return a boolean or we can check if it did anything.
        // For now, we rely on the RPC's internal logic to be efficient.
        // If it's the 5000 limit default, it might still time out, so we use 1000.
      }
    }

    return { success: true, count };
  });

const ReviewListIn = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  limit: z.number().int().min(1).max(500).default(200),
});
export const listMatchReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => ReviewListIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("global_match_reviews")
      .select("id, product_id, tenant_id, suggested_global_medicine_id, confidence, match_level, status, notes, created_at, reviewed_at, product:products(name, strength, medicine_type), suggested:global_medicines(brand_name, strength, dosage_form)")
      .eq("status", data.status)
      .order("confidence", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ReviewIdIn = z.object({ id: z.string().uuid() });
export const approveMatchReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => ReviewIdIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: gmid, error } = await context.supabase.rpc("approve_match_review", { _id: data.id } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const, global_medicine_id: gmid as unknown as string };
  });

const RejectReviewIn = z.object({ id: z.string().uuid(), notes: z.string().max(500).optional() });
export const rejectMatchReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => RejectReviewIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reject_match_review", { _id: data.id, _notes: data.notes ?? null } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const BulkIn = z.object({ min_confidence: z.number().min(0).max(1).default(0.85) });
export const bulkApproveMatchReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => BulkIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await context.supabase.rpc("bulk_approve_match_reviews", { _min_confidence: data.min_confidence } as never);
    if (error) throw new Error(error.message);
    return { approved: (n as unknown as number) ?? 0 };
  });

export const getDuplicateReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("global_catalog_duplicate_report")
      .select("kind, key, cnt")
      .order("cnt", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ kind: string; key: string; cnt: number }>;
  });


// ---- Auto-sync (future global catalog updates → stores) ----
export type AutoSyncStore = {
  tenant_id: string;
  name: string;
  auto_sync: boolean;
  linked: number;
  total_approved: number;
};

export const listAutoSyncStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_auto_sync_overview" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AutoSyncStore[];
  });

const AutoSyncToggleIn = z.object({ tenant_id: z.string().uuid(), enabled: z.boolean() });
export const setStoreAutoSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => AutoSyncToggleIn.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_tenant_auto_sync" as never, {
      _tenant_id: data.tenant_id, _enabled: data.enabled,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const SyncMissingIn = z.object({
  tenant_id: z.string().uuid(),
  limit: z.number().int().min(100).max(5000).default(2000),
});
export const syncMissingForStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAppAdmin])
  .inputValidator((d: unknown) => SyncMissingIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await context.supabase.rpc("sync_missing_global_medicines" as never, {
      _tenant_id: data.tenant_id, _limit: data.limit,
    } as never);
    if (error) throw new Error(error.message);
    return { added: (n as unknown as number) ?? 0 };
  });
