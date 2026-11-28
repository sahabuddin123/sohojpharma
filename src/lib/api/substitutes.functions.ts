import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { sanitizePostgrestSearch } from "@/lib/security/postgrest";

// Find substitutes (same generic) for a given product. Returns brand,
// generic, manufacturer, retail price, and in-stock qty across active batches.
export const findAlternatives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    product_id: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { data: src } = await context.supabase
      .from("products")
      .select("id, generic_id, generics(name)")
      .eq("id", data.product_id)
      .single();
    if (!src?.generic_id) return { generic: null, alternatives: [] };

    const { data: alts } = await context.supabase
      .from("products")
      .select("id,name,name_bn,sku,retail_price,manufacturers(name)")
      .eq("tenant_id", data.tenantId)
      .eq("generic_id", src.generic_id)
      .eq("is_active", true)
      .neq("id", data.product_id)
      .limit(50);

    // Stock per product
    const ids = (alts ?? []).map((a) => a.id);
    let stockByProduct = new Map<string, number>();
    if (ids.length > 0) {
      const { data: batches } = await context.supabase
        .from("batches")
        .select("product_id, qty_on_hand")
        .eq("tenant_id", data.tenantId)
        .in("product_id", ids)
        .gt("qty_on_hand", 0);
      stockByProduct = new Map<string, number>();
      (batches ?? []).forEach((b) => {
        stockByProduct.set(
          b.product_id as string,
          (stockByProduct.get(b.product_id as string) ?? 0) + Number(b.qty_on_hand),
        );
      });
    }

    return {
      generic: (src.generics as { name?: string } | null)?.name ?? null,
      alternatives: (alts ?? []).map((a) => ({
        id: a.id, name: a.name, name_bn: a.name_bn, sku: a.sku,
        retail_price: Number(a.retail_price),
        manufacturer: (a.manufacturers as { name?: string } | null)?.name ?? null,
        stock: stockByProduct.get(a.id) ?? 0,
      })).sort((a, b) => b.stock - a.stock),
    };
  });

// Search by generic / manufacturer name (standalone alternatives screen)
export const searchByGeneric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({ tenantId: z.string().uuid(), query: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const safeQuery = sanitizePostgrestSearch(data.query);
    if (!safeQuery) return [];
    const { data: rows } = await context.supabase
      .from("products")
      .select("id,name,sku,retail_price, generics(name), manufacturers(name)")
      .eq("tenant_id", data.tenantId)
      .or(`name.ilike.%${safeQuery}%,sku.ilike.%${safeQuery}%`)
      .limit(50);
    return rows ?? [];
  });
