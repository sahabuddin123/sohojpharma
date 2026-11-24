import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { importProductsFromExcel, getTenantProductCapacity } from "@/lib/api/product-management.functions";

type RawCell = string | number | boolean | null;
type RawRow = Record<string, RawCell>;
type ParsedRow = {
  rowNumber: number;
  productName: string;
  genericName: string;
  companyName: string;
  categoryName: string;
  medicineType: string;
  strength: string;
  volume: string;
  unitType: string;
  quantityPerBox: number;
  purchasePrice: number;
  salePrice: number;
  barcode: string;
  countryOfOrigin: string;
  openingStock: number;
  reorderLevel: number;
  status: "active" | "inactive";
  raw: RawRow;
  importStatus: "ready" | "invalid";
  error?: string;
};

const TEMPLATE_HEADERS = [
  "Product Name", "Generic Name", "Company Name", "Category", "Medicine Type", "Strength", "Volume", "Unit Type",
  "Quantity Per Box", "Purchase Price", "Sale Price", "Barcode", "Country Of Origin", "Opening Stock", "Reorder Level", "Status",
];

const REQUIRED_HEADERS = ["Product Name", "Company Name"];
const HEADER_ALIASES: Record<string, string[]> = {
  "Product Name": ["product name", "product", "item name", "medicine name", "name", "brand name"],
  "Generic Name": ["generic name", "generic", "molecule", "salt"],
  "Company Name": ["company name", "company", "manufacturer", "brand", "mfg", "maker"],
  "Category": ["category", "product category", "categories", "cat"],
  "Medicine Type": ["medicine type", "type", "dosage form", "form"],
  "Strength": ["strength", "potency", "dose"],
  "Volume": ["volume", "size", "pack size"],
  "Unit Type": ["unit type", "unit", "uom", "pack"],
  "Quantity Per Box": ["quantity per box", "qty per box", "qty/box", "quantity/box", "box qty", "pcs per box", "pcs/box", "pack qty"],
  "Purchase Price": ["purchase price", "average purchase price", "avg purchase price", "avg cost", "cost price", "cost/box", "cost", "purchase rate", "buy price", "tp", "trade price"],
  "Sale Price": ["sale price", "selling price", "mrp", "sale rate", "sell price", "retail price", "price"],
  "Barcode": ["barcode", "ean", "ean13", "upc", "qr", "code"],
  "Country Of Origin": ["country of origin", "country", "origin", "made in"],
  "Opening Stock": ["opening stock", "initial stock", "stock", "opening qty", "current stock", "qty", "quantity"],
  "Reorder Level": ["reorder level", "reorder qty", "minimum stock", "alert qty", "min stock", "min qty", "reorder"],
  "Status": ["status", "active", "is active", "is_active", "state"],
};

const toKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const ALIAS_KEYS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([canonical, aliases]) => [canonical, new Set([canonical, ...aliases].map(toKey))]),
);
const headerLookup = (row: RawRow, wanted: string) => {
  const keys = ALIAS_KEYS[wanted] ?? new Set([toKey(wanted)]);
  const hit = Object.keys(row).find((k) => keys.has(toKey(k)));
  return hit ? row[hit] : "";
};
const text = (v: unknown) => String(v ?? "").trim();
const numOpt = (v: unknown, dflt = 0) => {
  const s = String(v ?? "").trim();
  if (!s) return dflt;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
};
const parseStatus = (v: unknown): "active" | "inactive" => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "active";
  if (["inactive", "0", "false", "no", "off", "disabled"].includes(s)) return "inactive";
  return "active";
};
const autoBarcode = () => "880" + Math.floor(1000000000 + Math.random() * 8999999999).toString();

export function downloadSampleTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ["Napa 500", "Paracetamol", "Beximco", "Pain Relief", "Tablet", "500mg", "10x10", "Box", 100, 80, 120, "8941234567890", "Bangladesh", 250, 20, "Active"],

  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.writeFile(wb, "product-import-template.xlsx");
}

type ImportErr = { rowNumber: number; productName?: string; companyName?: string; barcode?: string; sku?: string; error: string; kind?: "error" | "duplicate" };

function downloadErrorReport(rows: ImportErr[]) {
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
    "Row Number": r.rowNumber,
    "Product Name": r.productName ?? "",
    "Company Name": r.companyName ?? "",
    Barcode: r.barcode ?? "",
    Error: r.error,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Import Errors");
  XLSX.writeFile(wb, `product-import-errors-${Date.now()}.xlsx`);
}

function downloadDuplicateReport(rows: ImportErr[]) {
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
    "Product Name": r.productName ?? "",
    Barcode: r.barcode ?? "",
    SKU: r.sku ?? "",
    Reason: r.error,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Duplicates");
  XLSX.writeFile(wb, `product-import-duplicates-${Date.now()}.xlsx`);
}

const CHUNK_SIZE = 1000;

type CleanRow = Omit<ParsedRow, "importStatus" | "error">;
type ImportRes = { totalRows: number; importedRows: number; updatedRows: number; failedRows: number; skippedRows: number; errors: ImportErr[] };

export function ImportProductsDialog({
  open, onOpenChange, tenantId, branchId, onDone,
}: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; branchId?: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const importFn = useServerFn(importProductsFromExcel);
  const capacityFn = useServerFn(getTenantProductCapacity);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "error" | "done">("upload");
  const [progress, setProgress] = useState(0);
  const [chunkIdx, setChunkIdx] = useState(0);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [result, setResult] = useState<ImportRes>({ totalRows: 0, importedRows: 0, updatedRows: 0, failedRows: 0, skippedRows: 0, errors: [] });
  const [isDragging, setDragging] = useState(false);

  const reset = () => {
    setFileName(""); setRows([]); setMissingHeaders([]); setStep("upload"); setProgress(0);
    setChunkIdx(0); setChunkTotal(0); setErrorMsg("");
    setResult({ totalRows: 0, importedRows: 0, updatedRows: 0, failedRows: 0, skippedRows: 0, errors: [] });
  };

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast.error(t("toast.fileTooLarge")); return; }
    setFileName(file.name);
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<RawCell[]>(ws, { header: 1, defval: "" });
    const headers = (matrix[0] ?? []).map((h) => text(h));
    const missing = REQUIRED_HEADERS.filter((h) => !headers.some((x) => toKey(x) === toKey(h)));
    setMissingHeaders(missing);

    const raw = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "" });
    const seen = new Set<string>();
    const parsed = raw.map((r, i): ParsedRow => {
      const row: ParsedRow = {
        rowNumber: i + 2,
        productName: text(headerLookup(r, "Product Name")),
        genericName: text(headerLookup(r, "Generic Name")),
        companyName: text(headerLookup(r, "Company Name")),
        categoryName: text(headerLookup(r, "Category")),

        medicineType: text(headerLookup(r, "Medicine Type")),
        strength: text(headerLookup(r, "Strength")),
        volume: text(headerLookup(r, "Volume")),
        unitType: text(headerLookup(r, "Unit Type")) || "Box",
        quantityPerBox: numOpt(headerLookup(r, "Quantity Per Box"), 1),
        purchasePrice: numOpt(headerLookup(r, "Purchase Price"), 0),
        salePrice: numOpt(headerLookup(r, "Sale Price"), 0),
        barcode: text(headerLookup(r, "Barcode")) || autoBarcode(),
        countryOfOrigin: text(headerLookup(r, "Country Of Origin")),
        openingStock: numOpt(headerLookup(r, "Opening Stock"), 0),
        reorderLevel: numOpt(headerLookup(r, "Reorder Level"), 0),
        status: parseStatus(headerLookup(r, "Status")),
        raw: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "undefined" ? null : v])) as RawRow,
        importStatus: "ready",
      };
      const unique = row.barcode ? `b:${row.barcode.toLowerCase()}` : `n:${row.productName.toLowerCase()}|${row.companyName.toLowerCase()}`;
      if (missing.length) row.error = t("pinv.missingReqColTpl", { cols: missing.join(", ") });
      else if (!row.productName) row.error = t("pinv.productNameReq");
      else if (!row.companyName) row.error = t("pinv.companyNameReq");
      else if ([row.quantityPerBox, row.purchasePrice, row.salePrice, row.openingStock, row.reorderLevel].some((n) => Number.isNaN(n) || n < 0)) row.error = t("pinv.numericCols");
      else if (seen.has(unique)) row.error = t("pinv.duplicateInFile");
      if (row.error) row.importStatus = "invalid"; else seen.add(unique);
      return row;
    }).filter((r) => Object.values(r.raw).some((v) => text(v)));
    setRows(parsed);
    setStep("preview");
  };

  const summary = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((r) => r.importStatus === "ready").length,
    invalid: rows.filter((r) => r.importStatus === "invalid").length,
  }), [rows]);

  const validRowsRef = useRef<CleanRow[]>([]);
  const aggRef = useRef<ImportRes>({ totalRows: 0, importedRows: 0, updatedRows: 0, failedRows: 0, skippedRows: 0, errors: [] });

  const batchIdRef = useRef<string>("");

  const runChunks = async (startChunk: number, totalChunks: number) => {
    const valid = validRowsRef.current;
    const importBatchId = batchIdRef.current;
    for (let i = startChunk; i < totalChunks; i++) {
      const slice = valid.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      setChunkIdx(i);
      try {
        const res = await importFn({ data: { tenantId, branchId: branchId ?? null, fileName: `${fileName} [${i + 1}/${totalChunks}]`, importBatchId, rows: slice } });
        if (!res || typeof res !== "object") {
          throw new Error(`Import chunk ${i + 1}/${totalChunks} returned no response from the server. Please retry the failed chunk.`);
        }
        const agg = aggRef.current;
        agg.importedRows += res.importedRows ?? 0;
        agg.updatedRows += res.updatedRows ?? 0;
        agg.failedRows += res.failedRows ?? 0;
        agg.skippedRows += res.skippedRows ?? 0;
        if (Array.isArray(res.errors)) agg.errors.push(...res.errors);
        setProgress(Math.round(((i + 1) / totalChunks) * 100));

      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : t("pinv.importFailed"));
        setStep("error");
        return;
      }
    }
    // Done
    const dupMsg = t("pinv.duplicateInFile");
    const localErrors: ImportErr[] = rows.filter((r) => r.importStatus === "invalid").map((r) => ({ rowNumber: r.rowNumber, productName: r.productName, companyName: r.companyName, barcode: r.barcode, sku: r.barcode || `IMP-${r.rowNumber}`, error: r.error ?? t("pinv.invalidRow"), kind: r.error === dupMsg ? "duplicate" : "error" }));
    const agg = aggRef.current;
    setResult({
      totalRows: rows.length,
      importedRows: agg.importedRows,
      updatedRows: agg.updatedRows,
      failedRows: agg.failedRows + localErrors.length,
      skippedRows: agg.skippedRows,
      errors: [...localErrors, ...agg.errors],
    });
    setStep("done");
    onDone();
  };

  const runImport = async () => {
    const valid = rows.filter((r) => r.importStatus === "ready").map(({ importStatus: _s, error: _e, ...r }) => r);
    if (!valid.length) return;
    // PRE-FLIGHT PLAN-LIMIT CHECK — block before any chunk runs
    try {
      const cap = await capacityFn({ data: { tenantId } });
      if (cap.maxProducts != null) {
        const available = Math.max(0, Number(cap.maxProducts) - Number(cap.used));
        if (valid.length > available) {
          setErrorMsg(
            `Plan limit exceeded.\n\nPlan: ${cap.planCode ?? "current"}\nCurrent: ${cap.used.toLocaleString()}\nLimit: ${Number(cap.maxProducts).toLocaleString()}\nAvailable: ${available.toLocaleString()}\nAttempted Import: ${valid.length.toLocaleString()}\n\nUpgrade your plan or reduce the file size.`,
          );
          setChunkIdx(0); setChunkTotal(0);
          setStep("error");
          return;
        }
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to verify plan limit");
      setStep("error");
      return;
    }
    validRowsRef.current = valid;
    aggRef.current = { totalRows: 0, importedRows: 0, updatedRows: 0, failedRows: 0, skippedRows: 0, errors: [] };
    batchIdRef.current = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const total = Math.ceil(valid.length / CHUNK_SIZE);
    setChunkTotal(total);
    setChunkIdx(0);
    setProgress(0);
    setStep("importing");
    await runChunks(0, total);
  };


  const retryFromFailed = async () => {
    setErrorMsg("");
    setStep("importing");
    await runChunks(chunkIdx, chunkTotal);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("pages.products.import.title")}</DialogTitle>
          <DialogDescription>{t("pages.products.import.desc")}</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }} onClick={() => fileRef.current?.click()} className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/40"}`}>
              <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">{t("pages.products.import.drop")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("pages.products.import.formats")}</p>
              <input ref={fileRef} type="file" hidden accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={downloadSampleTemplate}><Download className="mr-1.5 h-4 w-4" /> {t("pages.products.import.sample")}</Button>
              <Button onClick={() => fileRef.current?.click()}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> {t("pages.products.import.browse")}</Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {missingHeaders.length > 0 && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{t("pinv.missingColsTpl", { cols: missingHeaders.join(", ") })}</div>}
            <div className="grid grid-cols-3 gap-2">
              <Metric label={t("pages.products.import.totalRows")} value={summary.total} />
              <Metric label={t("pages.products.import.ready")} value={summary.ready} tone="text-success" />
              <Metric label={t("pages.products.import.failed")} value={summary.invalid} tone="text-destructive" />
            </div>
            <div className="max-h-96 overflow-auto rounded-xl border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur"><TableRow><TableHead>#</TableHead><TableHead>Product Name</TableHead><TableHead>Company Name</TableHead><TableHead>Barcode</TableHead><TableHead className="text-right">Stock</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{rows.slice(0, 300).map((r) => <TableRow key={r.rowNumber}><TableCell>{r.rowNumber}</TableCell><TableCell><div className="font-medium">{r.productName || "—"}</div><div className="text-xs text-muted-foreground">{[r.genericName, r.strength, r.medicineType].filter(Boolean).join(" · ")}</div></TableCell><TableCell>{r.companyName || "—"}</TableCell><TableCell className="font-mono text-xs">{r.barcode || "—"}</TableCell><TableCell className="text-right">{Number.isNaN(r.openingStock) ? "—" : r.openingStock}</TableCell><TableCell><Badge variant="outline" className={r.importStatus === "ready" ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}>{r.importStatus === "ready" ? t("pages.products.import.ready") : r.error}</Badge></TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
            <DialogFooter><Button variant="outline" onClick={reset}>{t("pages.products.import.cancel")}</Button><Button onClick={runImport} disabled={!summary.ready}>{t("pages.products.import.cta")} ({summary.ready})</Button></DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-4 py-6">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("pages.products.import.importing")}… {progress}%
            </div>
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              Chunk {Math.min(chunkIdx + 1, chunkTotal)} / {chunkTotal} · {Math.min((chunkIdx + 1) * CHUNK_SIZE, validRowsRef.current.length)} / {validRowsRef.current.length} rows
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <p className="font-semibold text-destructive">{chunkTotal === 0 ? "Plan limit exceeded" : "Import failed"}</p>
              <p className="mt-1 whitespace-pre-line text-destructive/90 break-words">{errorMsg}</p>
              {chunkTotal > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-foreground">
                  <div><span className="text-muted-foreground">Failed chunk:</span> {chunkIdx + 1} / {chunkTotal}</div>
                  <div><span className="text-muted-foreground">Imported so far:</span> {aggRef.current.importedRows + aggRef.current.updatedRows}</div>
                  <div><span className="text-muted-foreground">Remaining:</span> {Math.max(0, validRowsRef.current.length - chunkIdx * CHUNK_SIZE)}</div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>{chunkTotal === 0 ? "Close" : "Cancel Import"}</Button>
              {chunkTotal > 0 && <Button onClick={retryFromFailed}>Retry Failed Chunk</Button>}
            </DialogFooter>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm font-medium text-success">Import Complete</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Metric label={t("pages.products.import.totalRows")} value={result.totalRows} />
              <Metric label={t("pages.products.import.importedRows")} value={result.importedRows} tone="text-success" />
              <Metric label={t("pages.products.import.updatedRows")} value={result.updatedRows} tone="text-warning" />
              <Metric label={t("pages.products.import.skipped")} value={result.skippedRows} />
              <Metric label={t("pages.products.import.failedRows")} value={result.failedRows} tone="text-destructive" />
            </div>
            {(() => {
              const dups = result.errors.filter((e) => e.kind === "duplicate");
              const errs = result.errors.filter((e) => e.kind !== "duplicate");
              return (
                <div className="flex flex-wrap gap-2">
                  {errs.length > 0 && <Button variant="outline" onClick={() => downloadErrorReport(errs)}><Download className="mr-1.5 h-4 w-4" /> Error Report ({errs.length})</Button>}
                  {dups.length > 0 && <Button variant="outline" onClick={() => downloadDuplicateReport(dups)}><Download className="mr-1.5 h-4 w-4" /> Duplicate Report ({dups.length})</Button>}
                </div>
              );
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Import More</Button>
              <Button onClick={() => onOpenChange(false)}>View Products</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-bold ${tone ?? ""}`}>{value}</p></div>;
}