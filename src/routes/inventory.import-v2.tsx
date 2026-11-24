import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Loader2, Upload, FileSpreadsheet, Play, Pause, Square, RefreshCw, Undo2, Download } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  createImportJob, analyzeImportJob, getImportJob, getMasterDiff,
  approveMasterDecisions, materializeApprovedMasters, startImport,
  processImportV2Chunk, pauseImport, resumeImport, cancelImport,
  retryFailedRows, rollbackImportV2, downloadErrorReport,
} from "@/lib/api/import/import-v2.functions";

export const Route = createFileRoute("/inventory/import-v2")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Import Medicines — SohojPharma" }] }),
  component: ImportV2Page,
});

type Step = "upload" | "mapping" | "analyze" | "masters" | "preview" | "running" | "done";

const TARGET_FIELDS = [
  "name","name_bn","barcode","sku","manufacturer","generic","category","unit",
  "medicine_type","dosage_form","country","tax_class","therapeutic_class",
  "strength","volume","purchase_price","retail_price","mrp","opening_stock","is_prescription_required",
] as const;

const MASTER_KINDS = [
  "manufacturer","generic","category","unit","medicine_type",
  "dosage_form","country","tax_class","therapeutic_class",
] as const;

const SYNONYMS: Record<(typeof TARGET_FIELDS)[number], string[]> = {
  name: ["name", "productname", "medicinename", "itemname", "drugname"],
  name_bn: ["namebn", "banglaname", "productnamebangla", "bnname", "bangla"],
  barcode: ["barcode", "ean", "ean13", "upc"],
  sku: ["sku", "skucode", "itemcode", "productcode"],
  manufacturer: ["manufacturer", "company", "companyname", "brand", "brandname", "maker"],
  generic: ["generic", "genericname", "molecule", "salt"],
  category: ["category", "categoryname", "group"],
  unit: ["unit", "unittype", "uom", "measure"],
  medicine_type: ["medicinetype", "type", "dosagetype", "form"],
  dosage_form: ["dosageform", "dosage"],
  country: ["country", "origin", "countryoforigin"],
  tax_class: ["taxclass", "tax", "vat", "gst"],
  therapeutic_class: ["therapeuticclass", "therapeutic", "therapyclass"],
  strength: ["strength", "potency", "mg", "dose"],
  volume: ["volume", "packsize", "size", "ml"],
  purchase_price: ["purchaseprice", "averagepurchaseprice", "costprice", "cost", "buyprice", "tp", "tradeprice"],
  retail_price: ["retailprice", "saleprice", "sellingprice", "mrpprice", "price"],
  mrp: ["mrp", "maxretailprice"],
  opening_stock: ["openingstock", "stock", "qty", "quantity", "openingqty", "stockqty"],
  is_prescription_required: ["isprescriptionrequired", "prescriptionrequired", "rx", "prescription"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMapColumns(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const t of TARGET_FIELDS) {
    const syns = SYNONYMS[t] ?? [];
    const hit = normalized.find((h) => !used.has(h.raw) && syns.includes(h.n));
    if (hit) { out[t] = hit.raw; used.add(hit.raw); }
  }
  return out;
}

function ImportV2Page() {



  const { currentTenantId } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [activeKind, setActiveKind] = useState<(typeof MASTER_KINDS)[number]>("manufacturer");
  const [diff, setDiff] = useState<Array<{ id: number; raw_value: string; normalized_value: string; occurrences: number; match_status: string; approved: boolean }>>([]);
  const [progress, setProgress] = useState({ imported: 0, failed: 0, skipped: 0, processed: 0 });
  const stopRef = useRef(false);

  const fnCreate = useServerFn(createImportJob);
  const fnAnalyze = useServerFn(analyzeImportJob);
  const fnGetJob = useServerFn(getImportJob);
  const fnGetDiff = useServerFn(getMasterDiff);
  const fnApprove = useServerFn(approveMasterDecisions);
  const fnMaterialize = useServerFn(materializeApprovedMasters);
  const fnStart = useServerFn(startImport);
  const fnChunk = useServerFn(processImportV2Chunk);
  const fnPause = useServerFn(pauseImport);
  const fnResume = useServerFn(resumeImport);
  const fnCancel = useServerFn(cancelImport);
  const fnRetry = useServerFn(retryFailedRows);
  const fnRollback = useServerFn(rollbackImportV2);
  const fnErrors = useServerFn(downloadErrorReport);

  async function handleFile(f: File) {
    setFile(f);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const h = rows.length ? Object.keys(rows[0]) : [];
    setHeaders(h);
    const guess = autoMapColumns(h);
    setMapping(guess);
    const matched = Object.keys(guess).length;
    toast.success(`Auto mapped ${matched} of ${TARGET_FIELDS.length} fields`);
    setStep("mapping");
  }

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file || !currentTenantId) throw new Error("Missing file/tenant");
      const path = `${currentTenantId}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("imports").upload(path, file, { upsert: false });
      if (up.error) throw new Error(up.error.message);
      const job = await fnCreate({ data: {
        tenant_id: currentTenantId, file_path: path, file_name: file.name, mapping,
      }});
      setJobId(job.id);
      setStep("analyze");
      const res = await fnAnalyze({ data: { tenant_id: currentTenantId, job_id: job.id, mapping } });
      toast.success(`Analyzed ${res.totalRows} rows · score ${(res.quality as { score: number }).score}`);
      const j = await fnGetJob({ data: { job_id: job.id } });
      setJob(j as Record<string, unknown>);
      setStep("masters");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function loadDiff(kind: (typeof MASTER_KINDS)[number]) {
    if (!jobId) return;
    setActiveKind(kind);
    const rows = await fnGetDiff({ data: { job_id: jobId, kind } });
    setDiff(rows as never);
  }
  useEffect(() => { if (step === "masters") void loadDiff(activeKind); }, [step]); // eslint-disable-line

  async function toggleDecision(id: number, approved: boolean) {
    setDiff((d) => d.map((r) => r.id === id ? { ...r, approved } : r));
    await fnApprove({ data: { job_id: jobId!, decisions: [{ id, approved }] } });
  }

  const goPreviewMut = useMutation({
    mutationFn: async () => {
      if (!jobId || !currentTenantId) return;
      await fnMaterialize({ data: { job_id: jobId, tenant_id: currentTenantId } });
      const j = await fnGetJob({ data: { job_id: jobId } });
      setJob(j as Record<string, unknown>);
      setStep("preview");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function runLoop() {
    if (!jobId) return;
    setStep("running");
    stopRef.current = false;
    await fnStart({ data: { job_id: jobId } });
    let hasMore = true;
    while (hasMore && !stopRef.current) {
      // Phase 5Q: chunk size lowered from 500 → 100 to fit inside the 8s
      // authenticated statement_timeout. Each row performs ~6 indexed lookups
      // plus the resolve_product_revive_first RPC (~30-60ms per row at scale),
      // so 100 rows ≈ 4-6s and never trips the cancel-on-timeout boundary.
      const res = await fnChunk({ data: { job_id: jobId, batch: 100 } });
      setProgress((p) => ({
        processed: p.processed + res.processed,
        imported: p.imported + res.imported,
        failed: p.failed + res.failed,
        skipped: p.skipped + res.skipped,
      }));
      hasMore = res.has_more;
    }
    if (!stopRef.current) {
      setStep("done");
      toast.success("Import complete");
    }
  }

  async function exportErrors() {
    if (!jobId) return;
    const rows = await fnErrors({ data: { job_id: jobId } });
    const ws = XLSX.utils.json_to_sheet(rows as never);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "errors");
    XLSX.writeFile(wb, `import-errors-${jobId}.xlsx`);
  }

  const quality = (job?.quality_report ?? {}) as { score?: number; total_rows?: number; missing_barcode?: number; duplicate_barcode?: number; duplicate_product?: number };

  return (
    <AppShell variant="store">
      <PageHeader
        title="Enterprise Medicine Import"
        description="Upload an Excel file. We will parse, normalize, validate, and import safely with rollback support."
      />

      <div className="px-4 lg:px-6 space-y-4">
        <StepBar step={step} />

        {step === "upload" && (
          <Card>
            <CardHeader><CardTitle>1. Upload Excel file</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
              <p className="text-xs text-muted-foreground">Supported: .xlsx, .xls, .csv. File is uploaded to private storage; nothing is written to the catalog until you approve.</p>
            </CardContent>
          </Card>
        )}

        {step === "mapping" && (
          <Card>
            <CardHeader><CardTitle>2. Map columns</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              {TARGET_FIELDS.map((t) => (
                <div key={t} className="space-y-1">
                  <Label className="text-xs uppercase">{t}</Label>
                  <Select value={mapping[t] ?? "__none"} onValueChange={(v) => setMapping((m) => ({ ...m, [t]: v === "__none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="— skip —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— skip —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
                <Button onClick={() => uploadMut.mutate()} disabled={!mapping.name || uploadMut.isPending}>
                  {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="ml-2">Upload & Analyze</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "analyze" && (
          <Card><CardContent className="py-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            <p className="mt-2 text-sm text-muted-foreground">Parsing, normalizing, scoring quality…</p>
          </CardContent></Card>
        )}

        {step === "masters" && job && (
          <Card>
            <CardHeader>
              <CardTitle>3. Master data preview · Quality {quality.score ?? 0}%</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {MASTER_KINDS.map((k) => (
                  <Button key={k} size="sm" variant={k === activeKind ? "default" : "outline"} onClick={() => void loadDiff(k)}>{k}</Button>
                ))}
              </div>
              <div className="max-h-[420px] overflow-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Occurrences</TableHead>
                      <TableHead className="text-right">Approve</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                          No new master records found for "{activeKind}".
                        </TableCell>
                      </TableRow>
                    ) : diff.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.normalized_value}</TableCell>
                        <TableCell><Badge variant={r.match_status === "existing" ? "secondary" : "default"}>{r.match_status}</Badge></TableCell>
                        <TableCell className="text-right">{r.occurrences}</TableCell>
                        <TableCell className="text-right">
                          <input type="checkbox" checked={!!r.approved} onChange={(e) => void toggleDecision(r.id, e.target.checked)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>

                </Table>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep("mapping")}>Back</Button>
                <Button onClick={() => goPreviewMut.mutate()} disabled={goPreviewMut.isPending}>
                  {goPreviewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span className="ml-2">Approve & Preview</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "preview" && job && (
          <Card>
            <CardHeader><CardTitle>4. Final preview</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Metric label="Total rows" value={quality.total_rows ?? 0} />
                <Metric label="Quality score" value={`${quality.score ?? 0}%`} />
                <Metric label="Missing barcode" value={quality.missing_barcode ?? 0} />
                <Metric label="Duplicates" value={(quality.duplicate_barcode ?? 0) + (quality.duplicate_product ?? 0)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep("masters")}>Back</Button>
                <Button onClick={() => void runLoop()} disabled={(quality.score ?? 0) < 80}>
                  <Play className="h-4 w-4 mr-2" />Start Import
                </Button>
              </div>
              {(quality.score ?? 0) < 80 && (
                <p className="text-xs text-amber-600">Quality below 80%. Fix the source file or remap columns before importing.</p>
              )}
            </CardContent>
          </Card>
        )}

        {(step === "running" || step === "done") && jobId && (
          <Card>
            <CardHeader><CardTitle>{step === "done" ? "5. Completed" : "5. Importing…"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Progress value={quality.total_rows ? (progress.processed / quality.total_rows) * 100 : 0} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Metric label="Processed" value={progress.processed} />
                <Metric label="Imported" value={progress.imported} />
                <Metric label="Failed" value={progress.failed} />
                <Metric label="Skipped" value={progress.skipped} />
              </div>
              <div className="flex flex-wrap gap-2">
                {step === "running" && (
                  <>
                    <Button size="sm" variant="outline" onClick={async () => { stopRef.current = true; await fnPause({ data: { job_id: jobId } }); }}><Pause className="h-4 w-4 mr-1" />Pause</Button>
                    <Button size="sm" variant="outline" onClick={async () => { await fnResume({ data: { job_id: jobId } }); void runLoop(); }}><Play className="h-4 w-4 mr-1" />Resume</Button>
                    <Button size="sm" variant="destructive" onClick={async () => { stopRef.current = true; await fnCancel({ data: { job_id: jobId } }); setStep("done"); }}><Square className="h-4 w-4 mr-1" />Cancel</Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={async () => { await fnRetry({ data: { job_id: jobId } }); void runLoop(); }}><RefreshCw className="h-4 w-4 mr-1" />Retry failed</Button>
                <Button size="sm" variant="outline" onClick={() => void exportErrors()}><Download className="h-4 w-4 mr-1" />Error report</Button>
                <Button size="sm" variant="destructive" onClick={async () => { const r = await fnRollback({ data: { job_id: jobId } }); toast.success(`Rolled back ${r.products} products`); }}><Undo2 className="h-4 w-4 mr-1" />Rollback batch</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function StepBar({ step }: { step: Step }) {
  const labels: Array<[Step, string]> = [
    ["upload","Upload"], ["mapping","Map"], ["analyze","Analyze"],
    ["masters","Masters"], ["preview","Preview"], ["running","Run"], ["done","Done"],
  ];
  const idx = labels.findIndex(([s]) => s === step);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {labels.map(([s, l], i) => (
        <div key={s} className={`flex items-center gap-2 ${i <= idx ? "text-foreground" : ""}`}>
          <span className={`h-2 w-2 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`} />
          <span>{l}</span>
          {i < labels.length - 1 && <span className="opacity-30">›</span>}
        </div>
      ))}
      <FileSpreadsheet className="h-3 w-3 ml-auto opacity-50" />
    </div>
  );
}
