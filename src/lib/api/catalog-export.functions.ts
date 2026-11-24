/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ExportInput = z.object({
  tenantId: z.string().uuid(),
  kind: z.enum(["products", "generics", "companies", "categories"]),
});

const PAGE = 1000;
const MAX_ROWS = 100_000;

// Keyset pagination on id (indexed PK) — avoids OFFSET + ORDER BY name scans
// that hit statement timeouts on large catalogs.
async function fetchAll(sb: any, table: string, select: string, tenantId: string, _orderCol = "name") {
  const out: any[] = [];
  let lastId: string | null = null;
  while (out.length < MAX_ROWS) {
    let q = sb
      .from(table)
      .select(select)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    lastId = rows[rows.length - 1].id;
  }
  if (_orderCol === "name") out.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
  return out;
}

export const exportCatalogData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(ExportInput)
  .handler(async ({ data, context }): Promise<{ header: string[]; rows: string[][] }> => {
    const sb = context.supabase as any;
    const tenantId = data.tenantId;

    if (data.kind === "generics") {
      const rows = await fetchAll(sb, "generics", "id,name,description,status", tenantId);
      return {
        header: ["name", "description", "status"],
        rows: rows.map((r) => [r.name ?? "", r.description ?? "", r.status ?? ""]),
      };
    }

    if (data.kind === "companies") {
      const rows = await fetchAll(sb, "manufacturers", "id,name,code,country,address,phone,email,status", tenantId);
      return {
        header: ["name", "code", "country", "address", "phone", "email", "status"],
        rows: rows.map((r) => [r.name ?? "", r.code ?? "", r.country ?? "", r.address ?? "", r.phone ?? "", r.email ?? "", r.status ?? ""]),
      };
    }

    if (data.kind === "categories") {
      const rows = await fetchAll(sb, "categories", "id,name,code,description,status", tenantId);
      return {
        header: ["name", "code", "description", "status"],
        rows: rows.map((r) => [r.name ?? "", r.code ?? "", r.description ?? "", r.status ?? ""]),
      };
    }

    // products — join master names client-side to avoid FK-name coupling
    const [products, generics, manufacturers, categories] = await Promise.all([
      fetchAll(sb, "products", "id,name,sku,barcode,medicine_type,strength,volume,retail_price,purchase_price,reorder_level,status,is_active,generic_id,manufacturer_id,category_id", tenantId),
      fetchAll(sb, "generics", "id,name", tenantId),
      fetchAll(sb, "manufacturers", "id,name", tenantId),
      fetchAll(sb, "categories", "id,name", tenantId),
    ]);
    const gMap = new Map(generics.map((g: any) => [g.id, g.name]));
    const mMap = new Map(manufacturers.map((m: any) => [m.id, m.name]));
    const cMap = new Map(categories.map((c: any) => [c.id, c.name]));

    return {
      header: ["name", "sku", "barcode", "generic", "company", "category", "medicine_type", "strength", "volume", "retail_price", "purchase_price", "reorder_level", "status"],
      rows: products.map((p) => [
        p.name ?? "",
        p.sku ?? "",
        p.barcode ?? "",
        (p.generic_id && gMap.get(p.generic_id)) || "",
        (p.manufacturer_id && mMap.get(p.manufacturer_id)) || "",
        (p.category_id && cMap.get(p.category_id)) || "",
        p.medicine_type ?? "",
        p.strength ?? "",
        p.volume ?? "",
        p.retail_price != null ? String(p.retail_price) : "",
        p.purchase_price != null ? String(p.purchase_price) : "",
        p.reorder_level != null ? String(p.reorder_level) : "",
        p.is_active === false ? "inactive" : (p.status ?? "active"),
      ]),
    };
  });
