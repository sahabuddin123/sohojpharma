// Phase 5O — Streaming Server helpers for the import engine.
// Refactored to process Excel files row-by-row to avoid Worker OOM.
// Peak memory target < 40 MB on 50k+ row workbooks.

import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMedicine } from "@/lib/import/medicine-parser";
import {
  normalizeBarcode, normalizeGeneric, normalizeManufacturer,
  normalizeType, normalizeUnit, slugifyName, titleCase,
} from "@/lib/import/normalizer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface ColumnMapping {
  name?: string;
  name_bn?: string;
  barcode?: string;
  sku?: string;
  manufacturer?: string;
  generic?: string;
  category?: string;
  unit?: string;
  medicine_type?: string;
  dosage_form?: string;
  country?: string;
  tax_class?: string;
  therapeutic_class?: string;
  strength?: string;
  volume?: string;
  purchase_price?: string;
  retail_price?: string;
  mrp?: string;
  opening_stock?: string;
  is_prescription_required?: string;
}

type StagingInsert = {
  job_id: string;
  tenant_id: string;
  row_number: number;
  raw: Json;
  parsed: Json;
  normalized: Json;
  field_errors: Array<{ field: string; message: string }>;
  status: "pending" | "ready" | "skipped";
};

const MASTER_KINDS = [
  "manufacturer", "generic", "category", "unit",
  "medicine_type", "dosage_form", "country", "tax_class", "therapeutic_class",
] as const;
type MasterKind = (typeof MASTER_KINDS)[number];

type MasterCollector = Map<MasterKind, Map<string, { raw: string; occurrences: number }>>;

const FLUSH_SIZE = 500;

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNumber(v: string): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function analyzeFile(opts: {
  supabase: SupabaseClient;
  jobId: string;
  tenantId: string;
  filePath: string;
  mapping: ColumnMapping;
}): Promise<{ totalRows: number; quality: Json }> {
  const { supabase, jobId, tenantId, filePath, mapping } = opts;
  const t0 = Date.now();

  // 1. Download + parse workbook
  const dl = await supabase.storage.from("imports").download(filePath);
  if (dl.error || !dl.data) throw new Error(`Download failed: ${dl.error?.message}`);
  const buf = await dl.data.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellHTML: false, cellFormula: false });
  console.log(`[import-v2] file=${filePath} bytes=${buf.byteLength} sheets=${JSON.stringify(wb.SheetNames)}`);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) throw new Error(`Empty worksheet "${sheetName}" — no !ref`);

  // Unified worksheet reader — IDENTICAL to Mapping stage (sheet_to_json header:1).
  // Mapping uses XLSX.utils.sheet_to_json on a non-dense workbook; Analyze must too,
  // otherwise the two stages disagree on whether headers exist.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
  const headerRow = (aoa[0] ?? []) as unknown[];
  const headers = headerRow.map((h) => cellToString(h));
  const range = XLSX.utils.decode_range(ws["!ref"]);
  console.log(`[import-v2] ref=${ws["!ref"]} A1=${JSON.stringify((ws as Record<string, unknown>)["A1"])} dense_flag=false !data=${!!(ws as Record<string, unknown>)["!data"]}`);
  console.log(`[import-v2] first10_cells=${JSON.stringify(headerRow.slice(0, 10))}`);
  console.log(`[import-v2] headers(${headers.filter(Boolean).length})=${JSON.stringify(headers)}`);
  console.log(`[import-v2] mapping=${JSON.stringify(mapping)}`);

  const headerIdx = new Map<string, number>();
  headers.forEach((name, c) => { if (name) headerIdx.set(name, c); });
  if (headerIdx.size === 0) {
    throw new Error(
      `No headers detected in row 1 of sheet "${sheetName}". ` +
      `A1=${JSON.stringify((ws as Record<string, unknown>)["A1"])} ` +
      `first10=${JSON.stringify(headerRow.slice(0, 10))} ref=${ws["!ref"]}`
    );
  }

  const getCell = (r: number, c: number): unknown => {
    const row = aoa[r - range.s.r];
    return row?.[c];
  };

  // Sample first 3 data rows
  const sample = aoa.slice(1, 4);
  console.log(`[import-v2] sample_rows=${JSON.stringify(sample).slice(0, 1000)}`);


  const colIdx = (key?: string) => (key && headerIdx.has(key) ? headerIdx.get(key)! : -1);
  const ci = {
    name: colIdx(mapping.name),
    name_bn: colIdx(mapping.name_bn),
    barcode: colIdx(mapping.barcode),
    sku: colIdx(mapping.sku),
    manufacturer: colIdx(mapping.manufacturer),
    generic: colIdx(mapping.generic),
    category: colIdx(mapping.category),
    unit: colIdx(mapping.unit),
    medicine_type: colIdx(mapping.medicine_type),
    dosage_form: colIdx(mapping.dosage_form),
    country: colIdx(mapping.country),
    tax_class: colIdx(mapping.tax_class),
    therapeutic_class: colIdx(mapping.therapeutic_class),
    strength: colIdx(mapping.strength),
    volume: colIdx(mapping.volume),
    purchase_price: colIdx(mapping.purchase_price),
    retail_price: colIdx(mapping.retail_price),
    mrp: colIdx(mapping.mrp),
    opening_stock: colIdx(mapping.opening_stock),
    is_prescription_required: colIdx(mapping.is_prescription_required),
  };
  console.log(`[import-v2] resolved_column_indices=${JSON.stringify(ci)}`);
  if (ci.name < 0) {
    throw new Error(
      `Mapping resolution failed: "name" column not found. ` +
      `mapping.name="${mapping.name ?? ""}" but headers are: ${JSON.stringify(Array.from(headerIdx.keys()))}. ` +
      `Header label must match exactly (case + spacing).`
    );
  }

  // 3. Master collector + dedup sets
  const collector: MasterCollector = new Map();
  MASTER_KINDS.forEach((k) => collector.set(k, new Map()));
  const seenBarcodes = new Set<string>();
  const seenSlugs = new Set<string>();

  let missingBarcode = 0, missingGeneric = 0, missingCompany = 0, missingStrength = 0, missingType = 0;
  let duplicateBarcode = 0, duplicateProduct = 0;
  let invalidPrice = 0, invalidQty = 0;

  const totalDataRows = Math.max(0, range.e.r - range.s.r);
  let processed = 0;
  let skippedEmpty = 0;
  let flushCount = 0;
  let buffer: StagingInsert[] = [];

  const flush = async () => {
    if (buffer.length === 0) return;
    const slice = buffer;
    buffer = [];
    const { error } = await supabase.from("import_staging_rows").insert(slice as never);
    if (error) throw new Error(`Staging insert failed at flush #${flushCount}: ${error.message}`);
    flushCount++;
    await supabase.from("import_jobs_v2").update({
      parsed_rows: processed,
      updated_at: new Date().toISOString(),
    } as never).eq("id", jobId);
    if (typeof console !== "undefined") {
      console.log(`[import-v2] flush #${flushCount} rows=${processed}/${totalDataRows} elapsed=${Date.now() - t0}ms`);
    }
  };

  const addMaster = (kind: MasterKind, raw: string) => {
    const v = raw.trim();
    if (!v) return;
    const bucket = collector.get(kind)!;
    const prev = bucket.get(v);
    if (prev) prev.occurrences++;
    else bucket.set(v, { raw: v, occurrences: 1 });
  };

  // 4. Stream rows — header at range.s.r, data starts at range.s.r + 1
  const firstDataRowIdx = range.s.r + 1;
  console.log(`[import-v2] header_row=${range.s.r + 1} first_data_row=${firstDataRowIdx + 1} total_data_rows=${totalDataRows}`);
  let candidate = 0;
  let firstRowSnapshot: Record<string, unknown> | null = null;
  let firstSkipReason: string | null = null;

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const pick = (idx: number) => (idx < 0 ? "" : cellToString(getCell(r, idx)));
    const rawName = pick(ci.name);
    const rawBarcode = pick(ci.barcode);
    const rawGeneric = pick(ci.generic);
    const rawManu = pick(ci.manufacturer);
    const debugRow = r - range.s.r;
    const shouldLog = debugRow <= 20;

    if (!rawName && !rawBarcode && !rawGeneric && !rawManu) {
      skippedEmpty++;
      if (shouldLog) console.log(`[import-v2] Row ${r + 1} accepted=false reason="all key cols empty"`);
      if (!firstSkipReason) firstSkipReason = `Row ${r + 1}: all key cols empty`;
      continue;
    }
    candidate++;
    if (!firstRowSnapshot) {
      firstRowSnapshot = {};
      for (const [h, idx] of headerIdx.entries()) firstRowSnapshot[h] = getCell(r, idx);
    }

    const rowNumber = r + 1; // 1-indexed for users (header = row 1)
    const fieldErrors: Array<{ field: string; message: string }> = [];

    const parsed = rawName ? parseMedicine(rawName) : { name: "", type: "", strength: "", volume: "", pack: "", confidence: 0 };

    const manufacturer = normalizeManufacturer(pick(ci.manufacturer));
    const generic = normalizeGeneric(pick(ci.generic));
    const category = titleCase(pick(ci.category));
    const unit = normalizeUnit(pick(ci.unit));
    const medType = normalizeType(pick(ci.medicine_type) || parsed.type);
    const dosageForm = titleCase(pick(ci.dosage_form));
    const country = titleCase(pick(ci.country));
    const taxClass = pick(ci.tax_class);
    const therapeutic = titleCase(pick(ci.therapeutic_class));

    const strength = pick(ci.strength) || parsed.strength;
    const volume = pick(ci.volume) || parsed.volume;
    const name = parsed.name || rawName;
    const nameBn = pick(ci.name_bn);
    const sku = pick(ci.sku);
    const barcode = normalizeBarcode(pick(ci.barcode));
    const purchasePrice = toNumber(pick(ci.purchase_price));
    const retailPrice = toNumber(pick(ci.retail_price));
    const mrp = toNumber(pick(ci.mrp));
    const opening = toNumber(pick(ci.opening_stock));
    const rxRaw = pick(ci.is_prescription_required).toLowerCase();
    const rx = rxRaw === "true" || rxRaw === "yes" || rxRaw === "1" || rxRaw === "y";

    if (!name) fieldErrors.push({ field: "name", message: "Required" });
    if (!barcode) missingBarcode++;
    if (!generic) missingGeneric++;
    if (!manufacturer) missingCompany++;
    if (!strength) missingStrength++;
    if (!medType) missingType++;
    if (purchasePrice !== null && purchasePrice < 0) { invalidPrice++; fieldErrors.push({ field: "purchase_price", message: "Negative" }); }
    if (retailPrice !== null && retailPrice < 0) { invalidPrice++; fieldErrors.push({ field: "retail_price", message: "Negative" }); }
    if (opening !== null && opening < 0) { invalidQty++; fieldErrors.push({ field: "opening_stock", message: "Negative" }); }

    if (barcode) {
      if (seenBarcodes.has(barcode)) { duplicateBarcode++; fieldErrors.push({ field: "barcode", message: "Duplicate in file" }); }
      else seenBarcodes.add(barcode);
    }
    const slug = slugifyName(`${name}|${generic}|${manufacturer}|${strength}`);
    if (slug) {
      if (seenSlugs.has(slug)) { duplicateProduct++; fieldErrors.push({ field: "name", message: "Duplicate product in file" }); }
      else seenSlugs.add(slug);
    }

    addMaster("manufacturer", manufacturer);
    addMaster("generic", generic);
    addMaster("category", category);
    addMaster("unit", unit);
    addMaster("medicine_type", medType);
    addMaster("dosage_form", dosageForm);
    addMaster("country", country);
    addMaster("tax_class", taxClass);
    addMaster("therapeutic_class", therapeutic);

    // Build minimal raw payload (only mapped columns) to keep memory small.
    const rawCompact: Json = {};
    for (const [col, idx] of headerIdx.entries()) {
      const v = getCell(r, idx);
      if (v !== undefined && v !== null && v !== "") rawCompact[col] = v;
    }

    buffer.push({
      job_id: jobId,
      tenant_id: tenantId,
      row_number: rowNumber,
      raw: rawCompact,
      parsed: parsed as unknown as Json,
      normalized: {
        name, name_bn: nameBn || null, sku, barcode,
        manufacturer, generic, category, unit,
        medicine_type: medType, dosage_form: dosageForm, country, tax_class: taxClass,
        therapeutic_class: therapeutic,
        strength, volume,
        purchase_price: purchasePrice ?? 0,
        retail_price: retailPrice ?? 0,
        mrp: mrp ?? retailPrice ?? 0,
        opening_stock: opening ?? 0,
        is_prescription_required: rx,
      },
      field_errors: fieldErrors,
      status: fieldErrors.find((e) => e.field === "name") ? "skipped" : "ready",
    });
    processed++;
    if (shouldLog) {
      const accepted = !fieldErrors.find((e) => e.field === "name");
      console.log(
        `[import-v2] Row ${r + 1} accepted=${accepted}` +
        ` name="${name}" barcode="${barcode}" generic="${generic}" manufacturer="${manufacturer}" opening_stock=${opening ?? 0}` +
        (accepted ? "" : ` reason="${fieldErrors.map((e) => `${e.field}:${e.message}`).join(",")}"`)
      );
      if (!accepted && !firstSkipReason) firstSkipReason = `Row ${r + 1}: ${fieldErrors.map((e) => `${e.field}:${e.message}`).join(",")}`;
    }

    if (buffer.length >= FLUSH_SIZE) {
      await flush();
    }
  }
  await flush();

  console.log(`[import-v2] SUMMARY worksheet_rows=${totalDataRows} candidate_rows=${candidate} processed_rows=${processed} skipped_empty=${skippedEmpty} staging_inserted=${processed}`);

  // Abort hard when worksheet has data but nothing was processed.
  if (totalDataRows > 0 && processed === 0) {
    const firstWorksheetRow: Record<string, unknown> = {};
    for (const [h, idx] of headerIdx.entries()) firstWorksheetRow[h] = getCell(range.s.r + 1, idx);
    throw new Error(
      `All rows were discarded. worksheet_rows=${totalDataRows} candidate=${candidate} processed=0 skipped_empty=${skippedEmpty}. ` +
      `First worksheet row: ${JSON.stringify(firstWorksheetRow).slice(0, 500)}. ` +
      `First parsed row: ${JSON.stringify(firstRowSnapshot).slice(0, 500)}. ` +
      `First skip reason: ${firstSkipReason ?? "n/a"}. ` +
      `Resolved indices: name=${ci.name} barcode=${ci.barcode} generic=${ci.generic} manufacturer=${ci.manufacturer} opening_stock=${ci.opening_stock}.`
    );
  }

  // 4b. Log per-master extraction counts
  const extractionCounts: Record<string, number> = {};
  for (const k of MASTER_KINDS) extractionCounts[k] = collector.get(k)!.size;
  console.log(`[import-v2] staging=${processed} extracted=${JSON.stringify(extractionCounts)}`);

  // 5. Resolve masters against existing DB rows + insert master_diff
  const diffInserted = await resolveAndInsertMasters(supabase, jobId, tenantId, collector);
  if (typeof console !== "undefined") {
    console.log(`[import-v2] master_diff inserted=${diffInserted} job=${jobId}`);
  }
  if (processed > 0 && diffInserted === 0) {
    const totalExtracted = Object.values(extractionCounts).reduce((a, b) => a + b, 0);
    throw new Error(
      `Master extraction produced 0 rows for ${processed} staging rows. ` +
      `Extracted per kind: ${JSON.stringify(extractionCounts)}. ` +
      (totalExtracted === 0
        ? "Check column mapping — none of manufacturer/generic/category/unit/medicine_type/dosage_form/country/tax_class/therapeutic_class produced any values."
        : "master_diff insert returned no rows.")
    );
  }


  // 6. Quality score
  const total = processed;
  const penalties =
    missingBarcode * 1 + missingGeneric * 0.5 + missingCompany * 0.5 +
    missingStrength * 0.3 + missingType * 0.3 +
    duplicateBarcode * 5 + duplicateProduct * 3 +
    invalidPrice * 2 + invalidQty * 1;
  const score = total === 0 ? 0 : Math.max(0, Math.min(100, 100 - (penalties / total) * 10));

  const quality: Json = {
    total_rows: total,
    missing_barcode: missingBarcode,
    missing_generic: missingGeneric,
    missing_company: missingCompany,
    missing_strength: missingStrength,
    missing_type: missingType,
    duplicate_barcode: duplicateBarcode,
    duplicate_product: duplicateProduct,
    invalid_price: invalidPrice,
    invalid_quantity: invalidQty,
    score: Math.round(score * 10) / 10,
    flush_count: flushCount,
    elapsed_ms: Date.now() - t0,
  };

  await supabase.from("import_jobs_v2").update({
    total_rows: total, parsed_rows: total,
    quality_report: quality, status: "analyzed",
    mapping: mapping as unknown as never,
  }).eq("id", jobId);

  if (typeof console !== "undefined") {
    console.log(`[import-v2] analyze complete rows=${total} flushes=${flushCount} elapsed=${Date.now() - t0}ms`);
  }

  return { totalRows: total, quality };
}

async function resolveAndInsertMasters(
  supabase: SupabaseClient, jobId: string, tenantId: string, collector: MasterCollector,
): Promise<number> {
  const tableByKind: Record<MasterKind, { table: string; col: string }> = {
    manufacturer: { table: "manufacturers", col: "name" },
    generic: { table: "generics", col: "name" },
    category: { table: "categories", col: "name" },
    unit: { table: "units", col: "name" },
    medicine_type: { table: "medicine_types", col: "name" },
    dosage_form: { table: "dosage_forms", col: "name" },
    country: { table: "countries", col: "name" },
    tax_class: { table: "tax_classes", col: "name" },
    therapeutic_class: { table: "therapeutic_classes", col: "name" },
  };

  const diffRows: Array<Json> = [];
  for (const kind of MASTER_KINDS) {
    const bucket = collector.get(kind)!;
    if (bucket.size === 0) continue;
    const { table, col } = tableByKind[kind];
    const values = Array.from(bucket.keys());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const existingMap = new Map<string, string>();
    // Paginate lookups in 500-value chunks to keep query size sane
    for (let i = 0; i < values.length; i += 500) {
      const slice = values.slice(i, i + 500);
      const { data: existing } = await sb
        .from(table)
        .select(`id, ${col}`)
        .eq("tenant_id", tenantId)
        .in(col, slice);
      (existing ?? []).forEach((r: Json) => existingMap.set(String(r[col]).toLowerCase(), String(r.id)));
    }

    for (const [norm, info] of bucket.entries()) {
      const matched = existingMap.get(norm.toLowerCase());
      diffRows.push({
        job_id: jobId, tenant_id: tenantId, kind,
        raw_value: info.raw, normalized_value: norm,
        match_status: matched ? "existing" : "new",
        target_id: matched ?? null,
        occurrences: info.occurrences,
        // Phase 5R: auto-approve new masters so manufacturer/generic always link.
        approved: true,
      });
    }
  }

  for (let i = 0; i < diffRows.length; i += 500) {
    const slice = diffRows.slice(i, i + 500);
    const { error } = await supabase.from("import_master_diff").insert(slice as never);
    if (error) throw new Error(`master_diff insert failed: ${error.message}`);
  }
  return diffRows.length;
}

