import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const TenantInput = z.object({ tenantId: z.string().uuid() });

// LIST products with packaging + vat config
export const listProductsPackaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("id,sku,name,name_bn,base_unit,purchase_unit,sale_unit,units_per_purchase,units_per_sale,vat_rate,vat_mode,retail_price,purchase_price")
      .eq("tenant_id", data.tenantId)
      .is("deleted_at", null)
      .order("name")
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Update packaging for a product
export const updateProductPackaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    productId: z.string().uuid(),
    base_unit: z.string().min(1),
    purchase_unit: z.string().min(1),
    sale_unit: z.string().min(1),
    units_per_purchase: z.number().positive(),
    units_per_sale: z.number().positive(),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("products")
      .update({
        base_unit: data.base_unit,
        purchase_unit: data.purchase_unit,
        sale_unit: data.sale_unit,
        units_per_purchase: data.units_per_purchase,
        units_per_sale: data.units_per_sale,
      })
      .eq("id", data.productId)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId, user_id: context.userId,
      action: "product.packaging.update", entity_table: "products", entity_id: data.productId,
      after_data: data as never,
    });
    return { ok: true };
  });

// Update VAT for a product
export const updateProductVat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(z.object({
    tenantId: z.string().uuid(),
    productId: z.string().uuid(),
    vat_rate: z.number().min(0).max(100),
    vat_mode: z.enum(["inclusive", "exclusive", "none"]),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("products")
      .update({ vat_rate: data.vat_rate, vat_mode: data.vat_mode })
      .eq("id", data.productId)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId, user_id: context.userId,
      action: "product.vat.update", entity_table: "products", entity_id: data.productId,
      after_data: { vat_rate: data.vat_rate, vat_mode: data.vat_mode } as never,
    });
    return { ok: true };
  });

// Bonus purchases report
export const bonusReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("purchase_items")
      .select("id,qty,bonus_qty,unit_cost,line_total,product_id,products(name,sku,strength,medicine_type,volume,pack_size),purchase_id,purchases(invoice_no,supplier_id,suppliers(name),purchase_date)")
      .eq("tenant_id", data.tenantId)
      .gt("bonus_qty", 0)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// VAT collection report
export const vatReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(TenantInput.extend({ from: z.string().optional(), to: z.string().optional() }))
  .handler(async ({ data, context }) => {
    let salesQ = context.supabase
      .from("sales")
      .select("vat,sale_date,total")
      .eq("tenant_id", data.tenantId);
    if (data.from) salesQ = salesQ.gte("sale_date", data.from);
    if (data.to) salesQ = salesQ.lte("sale_date", data.to);
    const { data: sales, error: e1 } = await salesQ;
    if (e1) throw new Error(e1.message);

    let purQ = context.supabase
      .from("purchases")
      .select("vat,purchase_date,total")
      .eq("tenant_id", data.tenantId);
    if (data.from) purQ = purQ.gte("purchase_date", data.from);
    if (data.to) purQ = purQ.lte("purchase_date", data.to);
    const { data: purchases, error: e2 } = await purQ;
    if (e2) throw new Error(e2.message);

    const salesVat = (sales ?? []).reduce((s, r) => s + Number(r.vat ?? 0), 0);
    const purchaseVat = (purchases ?? []).reduce((s, r) => s + Number(r.vat ?? 0), 0);
    return {
      salesVat, purchaseVat, liability: salesVat - purchaseVat,
      salesCount: sales?.length ?? 0, purchaseCount: purchases?.length ?? 0,
    };
  });
