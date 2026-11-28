import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import type { Database, Json } from "@/integrations/supabase/types";
import { getResolvedMasterId, resolveMasterIds } from "@/lib/api/master-resolver";
import { sanitizePostgrestSearch } from "@/lib/security/postgrest";

const TenantInput = z.object({ tenantId: z.string().uuid(), branchId: z.string().uuid().nullable().optional() });
const PageInput = TenantInput.extend({ search: z.string().trim().max(120).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(10).max(100).default(25) });
const Status = z.enum(["active", "inactive"]);
const ProductImportStatus = z.enum(["active", "inactive"]);

const CompanyInput = TenantInput.extend({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(180),
  code: z.string().trim().max(50).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(180).optional().nullable().or(z.literal("")),
  status: Status.default("active"),
});

const GenericInput = TenantInput.extend({
  id: z.string().uuid().optional(),
  generic_name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(500).optional().nullable(),
  status: Status.default("active"),
});

const ImportRow = z.object({
  rowNumber: z.number().int().min(2),
  productName: z.string(),
  genericName: z.string().optional().nullable(),
  companyName: z.string(),
  categoryName: z.string().optional().nullable(),

  medicineType: z.string().optional().nullable(),
  strength: z.string().optional().nullable(),
  volume: z.string().optional().nullable(),
  unitType: z.string().optional().nullable(),
  quantityPerBox: z.number(),
  purchasePrice: z.number(),
  salePrice: z.number(),
  barcode: z.string().optional().nullable(),
  countryOfOrigin: z.string().optional().nullable(),
  openingStock: z.number(),
  reorderLevel: z.number(),
  status: ProductImportStatus.default("active"),
  raw: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

const ProductInput = TenantInput.extend({
  id: z.string().uuid().optional(),
  productName: z.string().trim().min(1).max(180),
  genericName: z.string().trim().max(180).optional().nullable(),
  companyName: z.string().trim().min(1).max(180),
  medicineType: z.string().trim().max(80).optional().nullable(),
  strength: z.string().trim().max(80).optional().nullable(),
  volume: z.string().trim().max(80).optional().nullable(),
  unitType: z.string().trim().max(50).optional().nullable(),
  quantityPerBox: z.number().nonnegative().default(1),
  purchasePrice: z.number().nonnegative().default(0),
  salePrice: z.number().nonnegative().default(0),
  barcode: z.string().trim().max(80).optional().nullable(),
  countryOfOrigin: z.string().trim().max(80).optional().nullable(),
  openingStock: z.number().nonnegative().default(0),
  reorderLevel: z.number().nonnegative().default(0),
  status: ProductImportStatus.default("active"),
});

const ReqItem = z.object({ productId: z.string().uuid(), requestedQty: z.number().positive(), notes: z.string().trim().max(300).optional().nullable() });
const ReqInput = TenantInput.extend({
  id: z.string().uuid().optional(),
  fromBranchId: z.string().uuid().nullable().optional(),
  toBranchId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(ReqItem).min(1).max(100),
});

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
type RequisitionUpdate = Database["public"]["Tables"]["requisitions"]["Update"];
type ImportErrorRow = { rowNumber: number; productName?: string; companyName?: string; barcode?: string; sku?: string; error: string; kind: "error" | "duplicate"; raw?: Json };
type ImportCleanRow = z.infer<typeof ImportRow>;

const norm = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => norm(v).toLowerCase();
const chunk = <T,>(arr: T[], size = 500) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
const cleanNull = (v: unknown) => {
  const s = norm(v);
  return s ? s : null;
};
const skuFor = (name: string, barcode: string | null | undefined, rowNumber: number) =>
  (barcode && barcode.trim()) || `IMP-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 24).toUpperCase()}-${Date.now().toString(36)}-${rowNumber}`;

async function ensureReferenceData(supabase: any, tenantId: string, branchId: string | null | undefined, rows: ImportCleanRow[], userId: string) {
  const companies = [...new Set(rows.map((r) => norm(r.companyName)).filter(Boolean))];
  const generics = [...new Set(rows.map((r) => norm(r.genericName)).filter(Boolean))];
  const categories = [...new Set(rows.map((r) => norm(r.categoryName)).filter(Boolean))];
  const units = [...new Set(rows.map((r) => norm(r.unitType || "Box")).filter(Boolean))];

  const resolved = await resolveMasterIds({
    supabase,
    tenantId,
    userId,
    masters: [
      ...companies.map((name) => ({ kind: "manufacturer" as const, name, branchId: branchId ?? null })),
      ...generics.map((name) => ({ kind: "generic" as const, name, branchId: branchId ?? null })),
      ...units.map((name) => ({ kind: "unit" as const, name })),
      ...categories.map((name) => ({ kind: "category" as const, name })),
    ],
  });

  const manufacturerMap = new Map<string, string>();
  const genericMap = new Map<string, string>();
  const unitMap = new Map<string, string>();
  const categoryMap = new Map<string, string>();
  for (const name of companies) {
    const id = getResolvedMasterId(resolved, "manufacturer", name);
    if (id) manufacturerMap.set(key(name), id);
  }
  for (const name of generics) {
    const id = getResolvedMasterId(resolved, "generic", name);
    if (id) genericMap.set(key(name), id);
  }
  for (const name of units) {
    const id = getResolvedMasterId(resolved, "unit", name);
    if (id) unitMap.set(key(name), id);
  }
  for (const name of categories) {
    const id = getResolvedMasterId(resolved, "category", name);
    if (id) categoryMap.set(key(name), id);
  }
  return { manufacturerMap, genericMap, unitMap, categoryMap };
}


async function saveOpeningBatches(supabase: any, tenantId: string, branchId: string | null | undefined, rows: { productId: string; stock: number; price: number; userId: string }[], importBatchId?: string | null) {
  const merged = new Map<string, { productId: string; stock: number; price: number; userId: string }>();
  for (const r of rows) {
    if (r.stock >= 0) merged.set(r.productId, r);
  }
  const valid = [...merged.values()];
  if (!valid.length) return;
  // Resolve tenant default warehouse so batches never land with warehouse_id = NULL
  const { data: defWh } = await supabase.from("warehouses").select("id").eq("tenant_id", tenantId).eq("is_default", true).maybeSingle();
  const defaultWarehouseId: string | null = defWh?.id ?? null;
  if (!defaultWarehouseId) throw new Error("No default warehouse configured for tenant — cannot create opening stock batches");
  const ids = valid.map((r) => r.productId);
  const existing: any[] = [];
  for (const part of chunk(ids, 500)) {
    const { data, error } = await supabase.from("batches").select("id,product_id,qty_on_hand,deleted_at").eq("tenant_id", tenantId).eq("is_opening", true).in("product_id", part).order("deleted_at", { ascending: true, nullsFirst: true }).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    existing.push(...(data ?? []));
  }
  const existingMap = new Map(existing.map((b) => [b.product_id, b]));
  const toInsert: any[] = [];
  const movements: any[] = [];

  for (const r of valid) {
    const ex = existingMap.get(r.productId);
    if (ex) {
      // Preserve existing branch_id; only override when caller provides a non-null one.
      // Cost lock: purchase_price / unit_cost are immutable on opening batches with stock.
      // Only mutate quantity + non-cost metadata. Retry-safe and trigger-compliant.
      const updatePayload: Record<string, unknown> = { qty_on_hand: r.stock, status: "active", deleted_at: null, deleted_by: null, updated_by: r.userId, ...(importBatchId ? { import_batch_id: importBatchId } : {}) };
      if (branchId) updatePayload.branch_id = branchId;
      if (defaultWarehouseId) updatePayload.warehouse_id = defaultWarehouseId;
      const { error } = await supabase.from("batches").update(updatePayload).eq("id", ex.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      movements.push({ tenant_id: tenantId, product_id: r.productId, batch_id: ex.id, movement_type: "opening", qty_change: r.stock, qty_after: r.stock, reference_table: "product_import_logs", reference_no: importBatchId ?? null, user_id: r.userId, notes: "Opening Stock Import" });
    } else if (r.stock > 0) {
      if (!branchId) throw new Error("No branch resolved for opening stock — please select a branch or create one in Settings → Branches.");
      toInsert.push({ tenant_id: tenantId, branch_id: branchId, warehouse_id: defaultWarehouseId, product_id: r.productId, batch_no: "OPENING", is_opening: true, expiry_date: "2099-12-31", purchase_price: r.price, qty_on_hand: r.stock, created_by: r.userId, updated_by: r.userId, ...(importBatchId ? { import_batch_id: importBatchId } : {}), _stock: r.stock, _userId: r.userId });
    }
  }
  for (const part of chunk(toInsert, 500)) {
    const payload = part.map(({ _stock: _s, _userId: _u, ...rest }) => rest);
    const { data: made, error } = await supabase.from("batches").insert(payload).select("id,product_id");
    if (error) throw new Error(error.message);
    (made ?? []).forEach((b: any, idx: number) => {
      const src = part[idx];
      movements.push({ tenant_id: tenantId, product_id: b.product_id, batch_id: b.id, movement_type: "opening", qty_change: src._stock, qty_after: src._stock, reference_table: "product_import_logs", reference_no: importBatchId ?? null, user_id: src._userId, notes: "Opening Stock Import" });
    });
  }
  for (const movement of movements) {
    const { data: existingMove, error: moveLookupErr } = await supabase
      .from("stock_movements")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("batch_id", movement.batch_id)
      .eq("movement_type", "opening")
      .maybeSingle();
    if (moveLookupErr) throw new Error(moveLookupErr.message);
    if (existingMove?.id) {
      const { error } = await supabase.from("stock_movements").update({ product_id: movement.product_id, qty_change: movement.qty_change, qty_after: movement.qty_after, reference_table: movement.reference_table, reference_no: movement.reference_no, branch_id: movement.branch_id ?? branchId ?? null, warehouse_id: defaultWarehouseId, user_id: movement.user_id, notes: movement.notes }).eq("id", existingMove.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("stock_movements").insert({ ...movement, branch_id: movement.branch_id ?? branchId ?? null, warehouse_id: defaultWarehouseId });
      if (error) throw new Error(error.message);
    }
  }
}

async function saveBarcodes(supabase: any, tenantId: string, branchId: string | null | undefined, rows: { productId: string; barcode: string; userId: string }[], importBatchId?: string | null): Promise<{ skipped: number }> {
  const clean = rows.filter((r) => r.barcode);
  if (!clean.length) return { skipped: 0 };
  // Dedupe within this chunk
  const seenLocal = new Set<string>();
  const unique = clean.filter((r) => { const k = key(r.barcode); if (seenLocal.has(k)) return false; seenLocal.add(k); return true; });
  let skipped = clean.length - unique.length;
  const payload = unique.map((r) => ({ tenant_id: tenantId, branch_id: branchId ?? null, product_id: r.productId, barcode: r.barcode, barcode_type: r.barcode.length === 13 ? "EAN13" : "Code128", is_primary: true, status: "active", created_by: r.userId, updated_by: r.userId, ...(importBatchId ? { import_batch_id: importBatchId } : {}) }));
  for (const part of chunk(payload, 500)) {
    const { data: ins, error } = await supabase.rpc("upsert_product_barcodes", { _rows: part as any });
    if (error) throw new Error(error.message);
    skipped += part.length - ((ins as any[] | null)?.length ?? 0);
  }
  return { skipped };
}

type ProductResolveResult = { id: string; action: "inserted" | "updated" | "revived" };

async function resolveProductReviveFirst(supabase: any, payload: ProductInsert & Record<string, unknown>): Promise<ProductResolveResult> {
  const { data, error } = await supabase.rpc("resolve_product_revive_first" as any, { _payload: payload as any });
  if (error) throw new Error(error.message);
  const result = data as ProductResolveResult | null;
  if (!result?.id) throw new Error("Product could not be resolved");
  return result;
}

export const importProductsFromExcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(TenantInput.extend({ fileName: z.string().trim().max(220), importBatchId: z.string().uuid().optional(), rows: z.array(ImportRow).max(50000) }))
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const { supabase, userId } = context;
    // Branch resolution: explicit → user's default → tenant primary/single active branch.
    let branchId: string | null = data.branchId ?? null;
    if (!branchId) {
      const { data: rb } = await supabase.rpc("resolve_user_branch", { _tenant_id: data.tenantId, _user_id: userId });
      branchId = (rb as string | null) ?? null;
    }
    if (!branchId) {
      const { data: b } = await supabase
        .from("branches").select("id, is_main, branch_role")
        .eq("tenant_id", data.tenantId).is("deleted_at", null).eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("branch_role", { ascending: true })
        .limit(1).maybeSingle();
      branchId = (b as { id: string } | null)?.id ?? null;
    }
    const hasOpeningStock = data.rows.some((r) => Number(r.openingStock) > 0);
    if (!branchId && hasOpeningStock) {
      throw new Error("Please select a branch — opening stock requires a branch. Create one in Settings → Branches or pick one in the Import Wizard.");
    }
    const importBatchId = data.importBatchId ?? crypto.randomUUID();
    const errors: ImportErrorRow[] = [];
    const seen = new Set<string>();
    const cleanRows: ImportCleanRow[] = [];

    for (const r of data.rows) {
      const productName = norm(r.productName);
      const companyName = norm(r.companyName);
      const barcode = norm(r.barcode);
      const sku = skuFor(productName, barcode, r.rowNumber);
      if (!productName) errors.push({ rowNumber: r.rowNumber, productName, companyName, barcode, sku, error: "Product Name is required", kind: "error", raw: r.raw });
      else if (!companyName) errors.push({ rowNumber: r.rowNumber, productName, companyName, barcode, sku, error: "Company Name is required", kind: "error", raw: r.raw });
      else if ([r.quantityPerBox, r.purchasePrice, r.salePrice, r.openingStock, r.reorderLevel].some((n) => Number.isNaN(n) || n < 0)) errors.push({ rowNumber: r.rowNumber, productName, companyName, barcode, sku, error: "Numeric columns must be valid non-negative numbers", kind: "error", raw: r.raw });
      else {
        const unique = barcode ? `b:${key(barcode)}` : `n:${key(productName)}|${key(companyName)}`;
        if (seen.has(unique)) errors.push({ rowNumber: r.rowNumber, productName, companyName, barcode, sku, error: barcode ? "Duplicate Barcode (in file)" : "Duplicate Product (in file)", kind: "duplicate", raw: r.raw });
        else { seen.add(unique); cleanRows.push({ ...r, productName, companyName, barcode, quantityPerBox: r.quantityPerBox || 1 }); }
      }
    }

    const { data: log, error: logErr } = await supabase.from("product_import_logs").insert({ tenant_id: data.tenantId, branch_id: branchId, file_name: data.fileName, total_rows: data.rows.length, failed_rows: errors.length, status: "processing", import_batch_id: importBatchId, started_at: new Date(startedAt).toISOString(), created_by: userId, updated_by: userId }).select("id").single();
    if (logErr) throw new Error(logErr.message);

    const ref = await ensureReferenceData(supabase, data.tenantId, branchId, cleanRows, userId);

    let importedRows = 0, updatedRows = 0, skippedRows = 0;
    const stockRows: { productId: string; stock: number; price: number; userId: string }[] = [];
    const barcodeRows: { productId: string; barcode: string; userId: string }[] = [];

    for (const r of cleanRows) {
      const mfrId = ref.manufacturerMap.get(key(r.companyName)) ?? null;
      const genericId = r.genericName ? ref.genericMap.get(key(r.genericName)) ?? null : null;
      const unitType = norm(r.unitType || "Box") || "Box";
      const unitId = ref.unitMap.get(key(unitType)) ?? null;
      const categoryName = norm(r.categoryName);
      const categoryId = categoryName ? ref.categoryMap.get(key(categoryName)) ?? null : null;
      void unitId;
      const payload: ProductInsert = {
        tenant_id: data.tenantId, branch_id: branchId, name: r.productName, sku: skuFor(r.productName, r.barcode, r.rowNumber), barcode: r.barcode || null,
        manufacturer_id: mfrId, generic_id: genericId,
        category_id: categoryId,
        medicine_type: cleanNull(r.medicineType), strength: cleanNull(r.strength), volume: cleanNull(r.volume), country_of_origin: cleanNull(r.countryOfOrigin),
        unit: unitType, base_unit: unitType, purchase_unit: unitType, sale_unit: unitType, pack_size: Math.max(1, Math.round(r.quantityPerBox || 1)), qty_per_box: r.quantityPerBox || 1,
        purchase_price: r.purchasePrice, retail_price: r.salePrice, reorder_level: r.reorderLevel, status: r.status, is_active: r.status === "active", updated_by: userId,
        import_batch_id: importBatchId,
      };

      try {
        const resolved = await resolveProductReviveFirst(supabase, { ...payload, created_by: userId });
        if (resolved.action === "inserted") importedRows++;
        else updatedRows++;
        stockRows.push({ productId: resolved.id, stock: r.openingStock, price: r.purchasePrice, userId });
        if (r.barcode) barcodeRows.push({ productId: resolved.id, barcode: r.barcode, userId });
      } catch (err) {
        errors.push({ rowNumber: r.rowNumber, productName: r.productName, companyName: r.companyName, barcode: r.barcode ?? "", sku: payload.sku ?? "", error: err instanceof Error ? err.message : "Product resolve failed", kind: "error", raw: r.raw });
      }
    }

    await saveOpeningBatches(supabase, data.tenantId, branchId, stockRows, importBatchId);
    const bcRes = await saveBarcodes(supabase, data.tenantId, branchId, barcodeRows, importBatchId);
    skippedRows += bcRes.skipped;

    if (errors.length) {
      for (const part of chunk(errors, 500)) {
        const { error } = await supabase.from("product_import_errors").insert(part.map((e) => ({ tenant_id: data.tenantId, branch_id: branchId, import_log_id: log.id, row_number: e.rowNumber, product_name: e.productName ?? null, company_name: e.companyName ?? null, barcode: e.barcode ?? null, error_message: e.error, raw_data: e.raw ?? {}, created_by: userId })));
        if (error) throw new Error(error.message);
      }
    }
    const failedRows = errors.length - skippedRows;
    const finishedAt = Date.now();
    const { error: doneErr } = await supabase.from("product_import_logs").update({ imported_rows: importedRows, updated_rows: updatedRows, failed_rows: Math.max(0, failedRows), skipped_rows: skippedRows, status: "completed", finished_at: new Date(finishedAt).toISOString(), duration_ms: finishedAt - startedAt, updated_by: userId }).eq("id", log.id);
    if (doneErr) throw new Error(doneErr.message);
    return { importLogId: log.id as string, importBatchId, totalRows: data.rows.length, importedRows, updatedRows, failedRows: Math.max(0, failedRows), skippedRows, errors };
  });


export const listProductCompanies = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(PageInput).handler(async ({ data, context }) => {
  let q = context.supabase.from("manufacturers").select("id,name,code,country,address,phone,email,status,created_at", { count: "exact" }).eq("tenant_id", data.tenantId).is("deleted_at", null).order("name", { ascending: true });
  const safeSearch = sanitizePostgrestSearch(data.search);
  if (safeSearch) q = q.or(`name.ilike.%${safeSearch}%,code.ilike.%${safeSearch}%,country.ilike.%${safeSearch}%`);
  const from = (data.page - 1) * data.pageSize;
  const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: rows ?? [], count: count ?? 0 };
});

export const upsertProductCompany = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(CompanyInput).handler(async ({ data, context }) => {
  const payload = { tenant_id: data.tenantId, branch_id: data.branchId ?? null, name: data.name, code: data.code || null, country: data.country || null, address: data.address || null, phone: data.phone || null, email: data.email || null, status: data.status, updated_by: context.userId };
  const targetId = data.id ?? getResolvedMasterId(await resolveMasterIds({
    supabase: context.supabase,
    tenantId: data.tenantId,
    userId: context.userId,
    masters: [{ kind: "manufacturer", name: data.name, branchId: data.branchId ?? null, status: data.status }],
  }), "manufacturer", data.name);
  if (!targetId) throw new Error("Manufacturer could not be resolved");
  const { error } = await context.supabase.from("manufacturers").update(payload).eq("id", targetId).eq("tenant_id", data.tenantId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const deleteProductCompany = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(TenantInput.extend({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  const { error } = await context.supabase.from("manufacturers").update({ deleted_at: new Date().toISOString(), deleted_by: context.userId }).eq("id", data.id).eq("tenant_id", data.tenantId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const listProductGenerics = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(PageInput).handler(async ({ data, context }) => {
  let q = context.supabase.from("generics").select("id,name,description,status,created_at", { count: "exact" }).eq("tenant_id", data.tenantId).is("deleted_at", null).order("name", { ascending: true });
  const safeSearch = sanitizePostgrestSearch(data.search);
  if (safeSearch) q = q.or(`name.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
  const from = (data.page - 1) * data.pageSize;
  const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: rows ?? [], count: count ?? 0 };
});

export const upsertProductGeneric = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(GenericInput).handler(async ({ data, context }) => {
  const payload = { tenant_id: data.tenantId, branch_id: data.branchId ?? null, name: data.generic_name, description: data.description || null, status: data.status, updated_by: context.userId };
  const targetId = data.id ?? getResolvedMasterId(await resolveMasterIds({
    supabase: context.supabase,
    tenantId: data.tenantId,
    userId: context.userId,
    masters: [{ kind: "generic", name: data.generic_name, branchId: data.branchId ?? null, status: data.status }],
  }), "generic", data.generic_name);
  if (!targetId) throw new Error("Generic could not be resolved");
  const { error } = await context.supabase.from("generics").update(payload).eq("id", targetId).eq("tenant_id", data.tenantId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const deleteProductGeneric = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(TenantInput.extend({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  const { error } = await context.supabase.from("generics").update({ deleted_at: new Date().toISOString(), deleted_by: context.userId }).eq("id", data.id).eq("tenant_id", data.tenantId);
  if (error) throw new Error(error.message);
  return { ok: true };
});


type ProductListRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  retail_price: number | null;
  purchase_price: number | null;
  is_active: boolean | null;
  reorder_level: number | null;
  medicine_type: string | null;
  strength: string | null;
  volume: string | null;
  country_of_origin: string | null;
  status: string | null;
  qty_per_box: number | null;
  branch_id: string | null;
  generic_id: string | null;
  manufacturer_id: string | null;
  category_id: string | null;
  generics: { name: string } | null;
  manufacturers: { name: string } | null;
  categories: { name: string } | null;
  batches: { qty_on_hand: number }[];
};

type ProductManagementRpcRow = Omit<ProductListRow, "generics" | "manufacturers" | "categories" | "batches"> & {
  generic_name: string | null;
  manufacturer_name: string | null;
  category_name: string | null;
  stock: number | string | null;
  total_count: number | string | null;
};

export type ProductSearchScope = "all" | "name" | "company" | "generic" | "category" | "barcode";

export type ProductFilterOption = { id: string; name: string };
export type ProductFilterOptionsResult = {
  manufacturers: ProductFilterOption[];
  generics: ProductFilterOption[];
  categories: ProductFilterOption[];
};

export const listProductsForManagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    PageInput.extend({
      barcode: z.string().trim().max(80).optional(),
      statusFilter: z.enum(["in", "low", "out", "neg"]).optional(),
      withCount: z.boolean().default(true),
      pageSize: z.number().int().min(10).max(200).default(50),
      manufacturerId: z.string().uuid().optional(),
      genericId: z.string().uuid().optional(),
      categoryId: z.string().uuid().optional(),
      searchBy: z.enum(["all", "name", "company", "generic", "category", "barcode"]).default("all"),
    }),
  )
  .handler(async ({ data, context }): Promise<{ rows: ProductListRow[]; count: number | null }> => {
    const { data: rows, error } = await context.supabase.rpc("list_products_for_management" as any, {
      p_tenant_id: data.tenantId,
      p_search: data.search || undefined,
      p_barcode: data.barcode || undefined,
      p_page: data.page,
      p_page_size: data.pageSize,
      p_status_filter: data.statusFilter ?? undefined,
      p_with_count: data.withCount,
      p_manufacturer_id: data.manufacturerId ?? undefined,
      p_generic_id: data.genericId ?? undefined,
      p_category_id: data.categoryId ?? undefined,
      p_search_by: data.searchBy ?? "all",
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as ProductManagementRpcRow[];
    const enriched: ProductListRow[] = list.map((r) => ({
      id: r.id, name: r.name, sku: r.sku, barcode: r.barcode,
      retail_price: r.retail_price, purchase_price: r.purchase_price,
      is_active: r.is_active, reorder_level: r.reorder_level,
      medicine_type: r.medicine_type, strength: r.strength, volume: r.volume,
      country_of_origin: r.country_of_origin, status: r.status,
      qty_per_box: r.qty_per_box, branch_id: r.branch_id,
      generic_id: r.generic_id ?? null,
      manufacturer_id: r.manufacturer_id ?? null,
      category_id: r.category_id ?? null,
      generics: r.generic_name ? { name: r.generic_name } : null,
      manufacturers: r.manufacturer_name ? { name: r.manufacturer_name } : null,
      categories: r.category_name ? { name: r.category_name } : null,
      batches: [{ qty_on_hand: Number(r.stock ?? 0) }],
    }));
    const raw = list[0]?.total_count;
    const count = raw == null ? null : Number(raw);
    return { rows: enriched, count };
  });

export const getProductFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }): Promise<ProductFilterOptionsResult> => {
    const { data: res, error } = await context.supabase.rpc("get_product_filter_options" as any, {
      p_tenant_id: data.tenantId,
    });
    if (error) throw new Error(error.message);
    const obj = (res ?? {}) as Partial<ProductFilterOptionsResult>;
    return {
      manufacturers: Array.isArray(obj.manufacturers) ? obj.manufacturers : [],
      generics: Array.isArray(obj.generics) ? obj.generics : [],
      categories: Array.isArray(obj.categories) ? obj.categories : [],
    };
  });


export const updateProductPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator(TenantInput.extend({
    id: z.string().uuid(),
    purchase_price: z.number().nonnegative(),
    retail_price: z.number().nonnegative(),
    unit: z.string().trim().max(50).optional().nullable(),
  }))
  .handler(async ({ data, context }) => {
    const nextUnit = data.unit?.trim();
    const payload: ProductUpdate = {
      purchase_price: data.purchase_price,
      retail_price: data.retail_price,
    };

    if (nextUnit) {
      payload.unit = nextUnit;
      payload.base_unit = nextUnit;
      payload.purchase_unit = nextUnit;
      payload.sale_unit = nextUnit;
    }

    const { error } = await context.supabase
      .from("products")
      .update(payload)
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const getProductForEdit = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(TenantInput.extend({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  const { data: row, error } = await context.supabase.from("products").select("*,generics(name),manufacturers(name),batches(qty_on_hand)").eq("id", data.id).eq("tenant_id", data.tenantId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Product not found");
  return row;
});

export const saveProduct = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(ProductInput).handler(async ({ data, context }) => {
  // Resolve branch: explicit > user's assigned branch > tenant head office / first branch.
  let branchId: string | null = data.branchId ?? null;
  if (!branchId) {
    const { data: rb } = await context.supabase.rpc("resolve_user_branch", { _tenant_id: data.tenantId, _user_id: context.userId });
    branchId = (rb as string | null) ?? null;
  }
  if (!branchId) {
    const { data: b } = await context.supabase
      .from("branches").select("id").eq("tenant_id", data.tenantId).is("deleted_at", null).eq("is_active", true)
      .order("is_main", { ascending: false }).limit(1).maybeSingle();
    branchId = (b as { id: string } | null)?.id ?? null;
  }
  if (!branchId) throw new Error("No branch available for this tenant. Please create a branch in Settings → Branches first.");
  const row: ImportCleanRow = { rowNumber: 2, productName: data.productName, genericName: data.genericName ?? "", companyName: data.companyName, medicineType: data.medicineType ?? "", strength: data.strength ?? "", volume: data.volume ?? "", unitType: data.unitType ?? "Box", quantityPerBox: data.quantityPerBox || 1, purchasePrice: data.purchasePrice, salePrice: data.salePrice, barcode: data.barcode ?? "", countryOfOrigin: data.countryOfOrigin ?? "", openingStock: data.openingStock, reorderLevel: data.reorderLevel, status: data.status, raw: {} };
  const ref = await ensureReferenceData(context.supabase, data.tenantId, branchId, [row], context.userId);
  const payload: ProductInsert = { tenant_id: data.tenantId, branch_id: branchId, name: row.productName, sku: skuFor(row.productName, row.barcode, 2), barcode: row.barcode || null, manufacturer_id: ref.manufacturerMap.get(key(row.companyName)) ?? null, generic_id: row.genericName ? ref.genericMap.get(key(row.genericName)) ?? null : null, medicine_type: cleanNull(row.medicineType), strength: cleanNull(row.strength), volume: cleanNull(row.volume), country_of_origin: cleanNull(row.countryOfOrigin), unit: row.unitType || "Box", base_unit: row.unitType || "Box", purchase_unit: row.unitType || "Box", sale_unit: row.unitType || "Box", pack_size: Math.max(1, Math.round(row.quantityPerBox || 1)), qty_per_box: row.quantityPerBox || 1, purchase_price: row.purchasePrice, retail_price: row.salePrice, reorder_level: row.reorderLevel, status: row.status, is_active: row.status === "active", updated_by: context.userId };

  let productId = data.id;
  if (data.id) {
    const { error } = await context.supabase.from("products").update(payload).eq("id", data.id).eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
  } else {
    const resolved = await resolveProductReviveFirst(context.supabase, { ...payload, created_by: context.userId });
    productId = resolved.id;
  }
  if (productId) {
    await saveOpeningBatches(context.supabase, data.tenantId, branchId, [{ productId, stock: data.openingStock, price: data.purchasePrice, userId: context.userId }]);
    if (data.barcode) await saveBarcodes(context.supabase, data.tenantId, branchId, [{ productId, barcode: data.barcode, userId: context.userId }]);
    // Phase 3.3A: Global Catalog auto-match / auto-contribute.
    // Best-effort: never block product save on global-catalog errors.
    try {
      const { data: matchId } = await context.supabase.rpc("match_global_medicine", {
        _brand: row.productName,
        _generic: (row.genericName ?? "") as string,
        _mfr: row.companyName,
        _strength: (row.strength ?? "") as string,
        _form: (row.medicineType ?? "") as string,
      });
      if (matchId) {
        await context.supabase.from("products")
          .update({ global_medicine_id: matchId as unknown as string })
          .eq("id", productId).eq("tenant_id", data.tenantId);
      } else {
        await context.supabase.rpc("contribute_global_medicine", {
          _tenant: data.tenantId,
          _product: productId,
          _payload: {
            brand_name: row.productName,
            generic_name: row.genericName ?? null,
            manufacturer_name: row.companyName,
            strength: row.strength ?? null,
            dosage_form: row.medicineType ?? null,
            barcode: row.barcode || null,
          } as never,
        } as never);
      }
    } catch { /* swallow — global catalog is non-blocking */ }
  }
  return { id: productId };
});

export const deleteProduct = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(TenantInput.extend({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  const { error } = await context.supabase.from("products").update({ deleted_at: new Date().toISOString(), deleted_by: context.userId, is_active: false }).eq("id", data.id).eq("tenant_id", data.tenantId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const listExpiryProducts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(PageInput.extend({ windowDays: z.number().int().min(-1).max(365).default(90) })).handler(async ({ data, context }) => {
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + data.windowDays);
  let q = context.supabase.from("batches").select("id,batch_no,expiry_date,qty_on_hand,purchase_price,products(id,name,sku,barcode,strength,medicine_type,volume,pack_size),branch_id", { count: "exact" }).eq("tenant_id", data.tenantId).is("deleted_at", null).gt("qty_on_hand", 0).order("expiry_date");
  if (data.windowDays >= 0) q = q.lte("expiry_date", cutoff.toISOString().slice(0, 10));
  else q = q.lt("expiry_date", today);
  const from = (data.page - 1) * data.pageSize;
  const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: rows ?? [], count: count ?? 0 };
});

export const listBarcodes = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(PageInput.extend({ type: z.enum(["Code128", "EAN13", "QR"]).optional() })).handler(async ({ data, context }) => {
  let q = context.supabase.from("product_barcodes").select("id,barcode,barcode_type,label_size,is_primary,status,products(id,name,sku,retail_price,strength,medicine_type,volume,pack_size)", { count: "exact" }).eq("tenant_id", data.tenantId).is("deleted_at", null).order("created_at", { ascending: false });
  if (data.type) q = q.eq("barcode_type", data.type);
  if (data.search) q = q.ilike("barcode", `%${data.search}%`);
  const from = (data.page - 1) * data.pageSize;
  const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: rows ?? [], count: count ?? 0 };
});

export const generateProductBarcode = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(TenantInput.extend({ productId: z.string().uuid(), barcodeType: z.enum(["Code128", "EAN13", "QR"]).default("Code128"), labelSize: z.string().trim().max(40).optional().nullable() })).handler(async ({ data, context }) => {
  const code = data.barcodeType === "EAN13" ? `880${Math.floor(100000000 + Math.random() * 899999999)}`.slice(0, 13) : data.barcodeType === "QR" ? `QR-${Date.now().toString(36).toUpperCase()}` : `BC-${Date.now().toString(36).toUpperCase()}`;
  const { error } = await context.supabase.from("product_barcodes").insert({ tenant_id: data.tenantId, branch_id: data.branchId ?? null, product_id: data.productId, barcode: code, barcode_type: data.barcodeType, label_size: data.labelSize ?? null, status: "active", is_primary: false, created_by: context.userId, updated_by: context.userId });
  if (error) throw new Error(error.message);
  await context.supabase.from("products").update({ barcode: code, updated_by: context.userId }).eq("id", data.productId).eq("tenant_id", data.tenantId);
  return { barcode: code };
});

export const listRequisitions = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(PageInput.extend({ status: z.string().optional(), from: z.string().optional(), to: z.string().optional() })).handler(async ({ data, context }) => {
  let q = context.supabase.from("requisitions").select("*,from_branch:branches!requisitions_from_branch_id_fkey(name),to_branch:branches!requisitions_to_branch_id_fkey(name),requisition_items(id,requested_qty,approved_qty,received_qty,products(name,sku))", { count: "exact" }).eq("tenant_id", data.tenantId).is("deleted_at", null).order("created_at", { ascending: false });
  if (data.status) q = q.eq("status", data.status);
  if (data.from) q = q.gte("created_at", data.from);
  if (data.to) q = q.lte("created_at", data.to);
  if (data.search) q = q.ilike("requisition_no", `%${data.search}%`);
  const from = (data.page - 1) * data.pageSize;
  const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: rows ?? [], count: count ?? 0 };
});

export const createRequisition = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(ReqInput).handler(async ({ data, context }) => {
  const no = `REQ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-5)}`;
  const { data: req, error } = await context.supabase.from("requisitions").insert({ tenant_id: data.tenantId, branch_id: data.branchId ?? data.fromBranchId ?? null, from_branch_id: data.fromBranchId ?? data.branchId ?? null, to_branch_id: data.toBranchId ?? null, requisition_no: no, status: "pending", notes: data.notes ?? null, created_by: context.userId, updated_by: context.userId }).select("id,status").single();
  if (error) throw new Error(error.message);
  const { error: itemErr } = await context.supabase.from("requisition_items").insert(data.items.map((it) => ({ tenant_id: data.tenantId, branch_id: data.branchId ?? data.fromBranchId ?? null, requisition_id: req.id, product_id: it.productId, requested_qty: it.requestedQty, notes: it.notes ?? null, created_by: context.userId, updated_by: context.userId })));
  if (itemErr) throw new Error(itemErr.message);
  await context.supabase.from("requisition_records").insert({ tenant_id: data.tenantId, branch_id: data.branchId ?? data.fromBranchId ?? null, requisition_id: req.id, action: "created", status_to: "pending", notes: data.notes ?? null, created_by: context.userId });
  return { id: req.id };
});

export const updateRequisitionStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(TenantInput.extend({ id: z.string().uuid(), status: z.enum(["approved", "rejected", "received", "cancelled"]), notes: z.string().trim().max(500).optional().nullable() })).handler(async ({ data, context }) => {
  const { data: old, error: oldErr } = await context.supabase.from("requisitions").select("id,status,branch_id").eq("id", data.id).eq("tenant_id", data.tenantId).single();
  if (oldErr) throw new Error(oldErr.message);
  const patch: RequisitionUpdate = { status: data.status, updated_by: context.userId };
  if (data.status === "approved") { patch.approved_by = context.userId; patch.approved_at = new Date().toISOString(); }
  if (data.status === "rejected") { patch.rejected_by = context.userId; patch.rejected_at = new Date().toISOString(); }
  if (data.status === "received") { patch.received_by = context.userId; patch.received_at = new Date().toISOString(); }
  const { error } = await context.supabase.from("requisitions").update(patch).eq("id", data.id).eq("tenant_id", data.tenantId);
  if (error) throw new Error(error.message);
  await context.supabase.from("requisition_records").insert({ tenant_id: data.tenantId, branch_id: old.branch_id, requisition_id: data.id, action: data.status, status_from: old.status, status_to: data.status, notes: data.notes ?? null, created_by: context.userId });
  return { ok: true };
});

export const listRequisitionRecords = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(PageInput.extend({ status: z.string().optional(), from: z.string().optional(), to: z.string().optional() })).handler(async ({ data, context }) => {
  let q = context.supabase.from("requisition_records").select("*,requisitions(requisition_no,status,from_branch_id,to_branch_id)", { count: "exact" }).eq("tenant_id", data.tenantId).order("created_at", { ascending: false });
  if (data.from) q = q.gte("created_at", data.from);
  if (data.to) q = q.lte("created_at", data.to);
  if (data.status) q = q.eq("status_to", data.status);
  const from = (data.page - 1) * data.pageSize;
  const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: rows ?? [], count: count ?? 0 };
});

export const listBranchesForProducts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(TenantInput).handler(async ({ data, context }) => {
  const { data: rows, error } = await context.supabase.from("branches").select("id,name,code,is_main").eq("tenant_id", data.tenantId).is("deleted_at", null).order("is_main", { ascending: false }).order("name");
  if (error) throw new Error(error.message);
  return rows ?? [];
});
export const getProductStats = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(TenantInput).handler(async ({ data, context }) => {
  const { data: rows, error } = await context.supabase.rpc("get_product_stats", { p_tenant_id: data.tenantId });
  if (error) throw new Error(error.message);
  const r = (Array.isArray(rows) ? rows[0] : rows) as { total: number; in_stock: number; low_stock: number; out_of_stock: number; negative: number; total_value: number } | null;
  return {
    total: Number(r?.total ?? 0),
    inStock: Number(r?.in_stock ?? 0),
    low: Number(r?.low_stock ?? 0),
    out: Number(r?.out_of_stock ?? 0),
    neg: Number(r?.negative ?? 0),
    value: Number(r?.total_value ?? 0),
  };
});

export const getTenantProductCapacity = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(TenantInput).handler(async ({ data, context }) => {
  const { data: rows, error } = await context.supabase.rpc("get_tenant_product_capacity", { p_tenant_id: data.tenantId });
  if (error) throw new Error(error.message);
  const r = (Array.isArray(rows) ? rows[0] : rows) as { used: number; max_products: number | null; plan_code: string | null } | null;
  return { used: Number(r?.used ?? 0), maxProducts: r?.max_products ?? null, planCode: r?.plan_code ?? null };
});

export const getRecentImports = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(TenantInput.extend({ limit: z.number().int().min(1).max(50).default(5) })).handler(async ({ data, context }) => {
  const { data: rows, error } = await context.supabase
    .from("product_import_logs")
    .select("id,file_name,total_rows,imported_rows,updated_rows,failed_rows,skipped_rows,status,created_at")
    .eq("tenant_id", data.tenantId)
    .order("created_at", { ascending: false })
    .limit(data.limit);
  if (error) throw new Error(error.message);
  return rows ?? [];
});

export const listImportHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(PageInput).handler(async ({ data, context }) => {
  const from = (data.page - 1) * data.pageSize;
  const { data: rows, error, count } = await context.supabase
    .from("product_import_logs")
    .select("id,file_name,import_batch_id,total_rows,imported_rows,updated_rows,failed_rows,skipped_rows,status,started_at,finished_at,duration_ms,rolled_back_at,created_at,created_by", { count: "exact" })
    .eq("tenant_id", data.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + data.pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: rows ?? [], count: count ?? 0 };
});

export const getImportErrors = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(TenantInput.extend({ importLogId: z.string().uuid() })).handler(async ({ data, context }) => {
  const { data: rows, error } = await context.supabase
    .from("product_import_errors")
    .select("row_number,product_name,company_name,barcode,error_message,raw_data,created_at")
    .eq("tenant_id", data.tenantId)
    .eq("import_log_id", data.importLogId)
    .order("row_number", { ascending: true });
  if (error) throw new Error(error.message);
  return rows ?? [];
});

export const rollbackProductImport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth, requireActiveSubscription]).inputValidator(TenantInput.extend({ importBatchId: z.string().uuid() })).handler(async ({ data, context }) => {
  const { data: log, error: logErr } = await context.supabase
    .from("product_import_logs").select("id,tenant_id").eq("tenant_id", data.tenantId).eq("import_batch_id", data.importBatchId).limit(1).maybeSingle();
  if (logErr) throw new Error(logErr.message);
  if (!log) throw new Error("Import not found");
  const { data: res, error } = await context.supabase.rpc("rollback_product_import", { p_batch_id: data.importBatchId });
  if (error) throw new Error(error.message);
  return res as { ok: boolean; products: number; batches: number; barcodes: number };
});

