import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type MedicineSearchResult = {
  id: string;
  brand_name: string;
  generic_name: string;
  strength: string | null;
  dosage_form: string | null;
  manufacturer: string | null;
  pack_size: string | null;
  mrp: number | null;
  is_prescription_required: boolean;
  rank: number;
};

// Phase 5C: legacy medicine_master stack removed. Search now goes through the
// canonical `products` table via `unified_medicine_search`. This wrapper keeps
// the existing call sites alive while returning the unified shape mapped onto
// MedicineSearchResult.
export const searchMedicines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: { q: string; limit?: number; tenant_id?: string }) => d)
  .handler(async ({ data, context }): Promise<MedicineSearchResult[]> => {
    if (!data.tenant_id) return [];
    const { data: rows, error } = await context.supabase.rpc("unified_medicine_search", {
      _tenant: data.tenant_id,
      _q: data.q ?? "",
      _limit: data.limit ?? 50,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<{
      product_id: string;
      brand_name: string;
      generic_name: string | null;
      manufacturer_name: string | null;
      strength: string | null;
      dosage_form: string | null;
      prescription_required: boolean | null;
      score: number | null;
    }>).map((r) => ({
      id: r.product_id,
      brand_name: r.brand_name,
      generic_name: r.generic_name ?? "",
      strength: r.strength,
      dosage_form: r.dosage_form,
      manufacturer: r.manufacturer_name,
      pack_size: null,
      mrp: null,
      is_prescription_required: !!r.prescription_required,
      rank: r.score ?? 0,
    }));
  });

export const getMedicineAlternatives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: { medicine_id: string }) => d)
  .handler(async ({ data: _data }) => {
    // Global medicine library removed during Phase 5C canonicalization.
    return [] as Array<{ alternative: null; reason: string | null }>;
  });

export const createProductFromMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: {
    tenant_id: string;
    medicine_id: string;
    purchase_price?: number;
    retail_price?: number;
    sku?: string;
  }) => d)
  .handler(async () => {
    // Phase 5C: legacy `create_product_from_medicine` RPC removed. Products
    // are now created directly through the normalized catalog flow.
    throw new Error(
      "createProductFromMedicine is no longer supported. Create products through the normalized product catalog.",
    );
  });
