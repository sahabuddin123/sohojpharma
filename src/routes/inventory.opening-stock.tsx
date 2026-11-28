import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, FileSpreadsheet,
  UploadCloud, Wallet, PackagePlus, Loader2, Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { RouteErrorPanel } from "@/components/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/inventory/opening-stock")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Opening Stock Wizard — SohojPharma" },
      { name: "description", content: "Initialize opening stock, batches and inventory valuation for every product." },
    ],
  }),
  component: OpeningStockWizard,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  purchase_price: number | null;
  retail_price: number | null;
  has_batch: boolean;
  has_opening: boolean;
  total_qty: number;
};

type DraftRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  qty: number;
  unit_cost: number;
  mrp: number | null;
  batch_no: string;
  mfg_date: string;
  expiry_date: string;
  supplier_id?: string | null;
  warehouse_id?: string | null;
  branch_id?: string | null;
};

type FilterKey = "all" | "no_batch" | "no_cost" | "no_opening";

function todayPlus(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function OpeningStockWizard() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [filter, setFilter] = useState<FilterKey>("no_opening");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedCache, setSelectedCache] = useState<Record<string, ProductRow>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [committedSummary, setCommittedSummary] = useState<{
    count: number; total_qty: number; total_value: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["opening-stock-products", tenantId, filter, search, page],
    enabled: !!tenantId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("get_opening_stock_products", {
        _tenant_id: tenantId,
        _filter: filter,
        _search: search,
        _page: page,
        _page_size: PAGE_SIZE,
      });
      if (error) throw error;
      return data as {
        rows: ProductRow[];
        totalCount: number;
        page: number;
        pageSize: number;
        counts: { all: number; no_opening: number; no_batch: number; no_cost: number };
      };
    },
  });

  const rows: ProductRow[] = pageData?.rows ?? [];
  const totalCount = pageData?.totalCount ?? 0;
  const counts = pageData?.counts ?? { all: 0, no_opening: 0, no_batch: 0, no_cost: 0 };
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Reset to page 1 when filter or search changes
  const filterKey = `${filter}::${search}`;
  const lastFilterKey = useRef(filterKey);
  if (lastFilterKey.current !== filterKey) {
    lastFilterKey.current = filterKey;
    if (page !== 1) setPage(1);
  }

  const selectedRows = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]).map((id) => selectedCache[id]).filter(Boolean) as ProductRow[],
    [selected, selectedCache],
  );

  const totals = useMemo(() => {
    const list = Object.values(drafts);
    return {
      count: list.length,
      qty: list.reduce((s, r) => s + Number(r.qty || 0), 0),
      value: list.reduce((s, r) => s + Number(r.qty || 0) * Number(r.unit_cost || 0), 0),
    };
  }, [drafts]);

  function setRowSelected(p: ProductRow, on: boolean) {
    setSelected((s) => ({ ...s, [p.id]: on }));
    setSelectedCache((c) => ({ ...c, [p.id]: p }));
  }

  function toggleAll(rows: ProductRow[], on: boolean) {
    const nextSel = { ...selected };
    const nextCache = { ...selectedCache };
    rows.forEach((r) => { nextSel[r.id] = on; nextCache[r.id] = r; });
    setSelected(nextSel);
    setSelectedCache(nextCache);
  }

  function goToStep2() {
    if (selectedRows.length === 0) {
      toast.error(t("toast.selectProduct"));
      return;
    }
    const next = { ...drafts };
    selectedRows.forEach((p) => {
      if (!next[p.id]) {
        next[p.id] = {
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          qty: 0,
          unit_cost: Number(p.purchase_price ?? 0),
          mrp: p.retail_price != null ? Number(p.retail_price) : null,
          batch_no: `OPN-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
          mfg_date: "",
          expiry_date: todayPlus(2),
        };
      }
    });
    // remove unselected
    Object.keys(next).forEach((k) => { if (!selected[k]) delete next[k]; });
    setDrafts(next);
    setStep(2);
  }

  function validateAll(): string | null {
    const list = Object.values(drafts);
    if (list.length === 0) return t("pinv.noProductsToCommit");
    for (const r of list) {
      if (!(r.qty > 0)) return t("pinv.qtyMustBePositiveTpl", { name: r.product_name });
      if (r.unit_cost < 0) return t("pinv.costMustBeNonNegTpl", { name: r.product_name });
      if (!r.batch_no.trim()) return t("pinv.batchRequiredTpl", { name: r.product_name });
      if (!r.expiry_date) return t("pinv.expiryRequiredTpl", { name: r.product_name });
    }
    return null;
  }

  function goToStep3() {
    const err = validateAll();
    if (err) { toast.error(err); return; }
    setStep(3);
  }

  const commit = useMutation({
    mutationFn: async () => {
      const items = Object.values(drafts).map((d) => ({
        product_id: d.product_id,
        qty: d.qty,
        unit_cost: d.unit_cost,
        mrp: d.mrp,
        batch_no: d.batch_no.trim(),
        mfg_date: d.mfg_date || null,
        expiry_date: d.expiry_date,
        supplier_id: d.supplier_id ?? null,
        warehouse_id: d.warehouse_id ?? null,
        branch_id: d.branch_id ?? null,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("commit_opening_stock", {
        _tenant_id: tenantId,
        _items: items,
      });
      if (error) throw error;
      return data as { count: number; total_qty: number; total_value: number };
    },
    onSuccess: (res) => {
      setCommittedSummary({
        count: Number(res.count ?? 0),
        total_qty: Number(res.total_qty ?? 0),
        total_value: Number(res.total_value ?? 0),
      });
      setStep(4);
      qc.invalidateQueries({ queryKey: ["opening-stock-products"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
      toast.success(t("pinv.openingCommittedTpl", { n: res.count }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function importExcel(file: File) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const sheetRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // Collect lookup keys from sheet
        const codes = new Set<string>();
        const names = new Set<string>();
        sheetRows.forEach((row) => {
          const code = String(row["Product Code"] ?? row["SKU"] ?? row["Barcode"] ?? "").trim();
          const name = String(row["Product Name"] ?? row["Name"] ?? "").trim();
          if (code) codes.add(code);
          if (name) names.add(name);
        });

        // Fetch only the products referenced in the sheet (tenant-scoped via parameterized .in() filters)
        const codeList = Array.from(codes);
        const nameList = Array.from(names);
        type LookupRow = { id: string; name: string; sku: string | null; barcode: string | null; purchase_price: number | null; retail_price: number | null };
        const lookupMap = new Map<string, LookupRow>();
        const fetchChunked = async (col: "sku" | "barcode" | "name", vals: string[]) => {
          for (let i = 0; i < vals.length; i += 200) {
            const slice = vals.slice(i, i + 200);
            const { data, error } = await supabase
              .from("products")
              .select("id,name,sku,barcode,purchase_price,retail_price")
              .eq("tenant_id", tenantId)
              .is("deleted_at", null)
              .in(col, slice);
            if (error) throw error;
            for (const item of data ?? []) lookupMap.set(item.id, item as LookupRow);
          }
        };
        await Promise.all([
          codeList.length ? fetchChunked("sku", codeList) : Promise.resolve(),
          codeList.length ? fetchChunked("barcode", codeList) : Promise.resolve(),
          nameList.length ? fetchChunked("name", nameList) : Promise.resolve(),
        ]);
        const lookup = Array.from(lookupMap.values());

        // Check has_opening status for matched products
        const ids = lookup.map((p) => p.id);
        const openingSet = new Set<string>();
        if (ids.length) {
          const { data: bdata } = await supabase
            .from("batches")
            .select("product_id")
            .eq("tenant_id", tenantId)
            .eq("is_opening", true)
            .is("deleted_at", null)
            .in("product_id", ids);
          (bdata ?? []).forEach((b) => openingSet.add(b.product_id));
        }

        const byCode = new Map<string, typeof lookup[number]>();
        const byName = new Map<string, typeof lookup[number]>();
        lookup.forEach((p) => {
          if (p.sku) byCode.set(p.sku.toLowerCase(), p);
          if (p.barcode) byCode.set(p.barcode.toLowerCase(), p);
          byName.set(p.name.toLowerCase(), p);
        });

        const nextSel: Record<string, boolean> = { ...selected };
        const nextDrafts: Record<string, DraftRow> = { ...drafts };
        let matched = 0, missed = 0;
        sheetRows.forEach((row) => {
          const code = String(row["Product Code"] ?? row["SKU"] ?? row["Barcode"] ?? "").trim().toLowerCase();
          const name = String(row["Product Name"] ?? row["Name"] ?? "").trim().toLowerCase();
          const product = (code && byCode.get(code)) || (name && byName.get(name));
          if (!product) { missed++; return; }
          if (openingSet.has(product.id)) { missed++; return; }
          matched++;
          nextSel[product.id] = true;
          nextDrafts[product.id] = {
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            qty: Number(row["Opening Qty"] ?? row["Qty"] ?? 0),
            unit_cost: Number(row["Cost Price"] ?? row["Cost"] ?? product.purchase_price ?? 0),
            mrp: row["MRP"] != null && row["MRP"] !== "" ? Number(row["MRP"]) : null,
            batch_no: String(row["Batch"] ?? row["Batch No"] ?? `OPN-${Date.now()}`).trim(),
            mfg_date: row["Mfg Date"] ? String(row["Mfg Date"]).slice(0, 10) : "",
            expiry_date: row["Expiry Date"] ? String(row["Expiry Date"]).slice(0, 10) : todayPlus(2),
          };
        });
        setSelected(nextSel);
        setDrafts(nextDrafts);
        toast.success(t("pinv.importedSkippedTpl", { m: matched, s: missed }));
        if (matched > 0) setStep(2);
      } catch (e) {
        toast.error(t("toast.parseFileFailed", { msg: (e as Error).message }));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadTemplate() {
    const headers = [["Product Code", "Product Name", "Opening Qty", "Cost Price", "MRP", "Batch", "Mfg Date", "Expiry Date"]];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opening Stock");
    XLSX.writeFile(wb, "opening-stock-template.xlsx");
  }

  function resetWizard() {
    setSelected({});
    setSelectedCache({});
    setDrafts({});
    setCommittedSummary(null);
    setStep(1);
  }

  return (
    <AppShell variant="store" title={t("pinv.openingStockTitle")}>
      <PageHeader
        title={t("pinv.openingStockTitle")}
        description={t("pinv.openingStockDesc")}
        actions={
          <Button variant="outline" asChild>
            <Link to="/inventory"><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("pinv.backBtn")}</Link>
          </Button>
        }
      />

      <Stepper step={step} />

      {step === 1 && (
        <Card className="mt-4 shadow-card">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">{t("pinv.step1Title")}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" /> {t("pinv.templateBtn")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <UploadCloud className="mr-1.5 h-4 w-4" /> {t("pinv.importExcelBtn")}
              </Button>
              <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = ""; }} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input placeholder={t("pinv.searchProductsPh")} value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
              <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
                <TabsList>
                  <TabsTrigger value="all">{t("pinv.filterAll", { n: counts.all })}</TabsTrigger>
                  <TabsTrigger value="no_opening">{t("pinv.filterNoOpening")} ({counts.no_opening})</TabsTrigger>
                  <TabsTrigger value="no_batch">{t("pinv.filterNoBatch")} ({counts.no_batch})</TabsTrigger>
                  <TabsTrigger value="no_cost">{t("pinv.filterNoCost")} ({counts.no_cost})</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="ms-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggleAll(rows, true)}>{t("pinv.selectAllVisible")}</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleAll(rows, false)}>{t("pinv.clearBtn")}</Button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("pinv.loadingProducts")}</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>{t("pinv.colProduct")}</TableHead>
                      <TableHead>{t("pinv.colSkuBarcode")}</TableHead>
                      <TableHead className="text-right">{t("pinv.colQty")}</TableHead>
                      <TableHead className="text-right">{t("pinv.colCost")}</TableHead>
                      <TableHead>{t("pinv.colStatus")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id} className={p.has_opening ? "opacity-60" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={!!selected[p.id]}
                            disabled={p.has_opening}
                            onCheckedChange={(v) => setRowSelected(p, !!v)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.sku ?? "-"} / {p.barcode ?? "-"}</TableCell>
                        <TableCell className="text-right">{p.total_qty}</TableCell>
                        <TableCell className="text-right">{p.purchase_price ? `৳${Number(p.purchase_price).toFixed(2)}` : "-"}</TableCell>
                        <TableCell>
                          {p.has_opening ? <Badge variant="success">{t("pinv.initialized")}</Badge>
                            : !p.has_batch ? <Badge variant="warning">{t("pinv.noBatchBadge")}</Badge>
                            : <Badge variant="outline">{t("pinv.ready")}</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">{t("pinv.noMatchingProducts")}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    {t("pinv.filterAll", { n: totalCount })} · Page {page} / {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">{t("pinv.selectedCountTpl", { n: selectedRows.length })}</span>
              <Button onClick={goToStep2} disabled={selectedRows.length === 0}>
                {t("pinv.nextBtn")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="mt-4 shadow-card">
          <CardHeader><CardTitle className="text-base">{t("pinv.step2TitleTpl", { n: Object.keys(drafts).length })}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pinv.colProduct")}</TableHead>
                    <TableHead className="w-24">{t("pinv.thQtyStar")}</TableHead>
                    <TableHead className="w-28">{t("pinv.thUnitCostStar")}</TableHead>
                    <TableHead className="w-24">{t("pinv.thMrp")}</TableHead>
                    <TableHead className="w-40">{t("pinv.thBatchNoStar")}</TableHead>
                    <TableHead className="w-40">{t("pinv.thMfgDate")}</TableHead>
                    <TableHead className="w-40">{t("pinv.thExpiryStar")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.values(drafts).map((d) => (
                    <TableRow key={d.product_id}>
                      <TableCell className="font-medium">{d.product_name}<div className="text-xs text-muted-foreground">{d.sku}</div></TableCell>
                      <TableCell><Input type="number" min={0} step="0.01" value={d.qty || ""} onChange={(e) => setDrafts({ ...drafts, [d.product_id]: { ...d, qty: Number(e.target.value) } })} /></TableCell>
                      <TableCell><Input type="number" min={0} step="0.01" value={d.unit_cost || ""} onChange={(e) => setDrafts({ ...drafts, [d.product_id]: { ...d, unit_cost: Number(e.target.value) } })} /></TableCell>
                      <TableCell><Input type="number" min={0} step="0.01" value={d.mrp ?? ""} onChange={(e) => setDrafts({ ...drafts, [d.product_id]: { ...d, mrp: e.target.value === "" ? null : Number(e.target.value) } })} /></TableCell>
                      <TableCell><Input value={d.batch_no} onChange={(e) => setDrafts({ ...drafts, [d.product_id]: { ...d, batch_no: e.target.value } })} /></TableCell>
                      <TableCell><Input type="date" value={d.mfg_date} onChange={(e) => setDrafts({ ...drafts, [d.product_id]: { ...d, mfg_date: e.target.value } })} /></TableCell>
                      <TableCell><Input type="date" value={d.expiry_date} onChange={(e) => setDrafts({ ...drafts, [d.product_id]: { ...d, expiry_date: e.target.value } })} /></TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => { const n = { ...drafts }; delete n[d.product_id]; setDrafts(n); const s = { ...selected }; delete s[d.product_id]; setSelected(s); }}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("pinv.backBtn")}</Button>
              <Button onClick={goToStep3}>{t("pinv.previewBtn")} <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t("pinv.kpiProducts")} value={String(totals.count)} icon={PackagePlus} tone="primary" />
            <StatCard label={t("pinv.kpiTotalQty")} value={totals.qty.toLocaleString()} icon={PackagePlus} tone="secondary" />
            <StatCard label={t("pinv.kpiInvValue")} value={`৳ ${totals.value.toFixed(2)}`} icon={Wallet} tone="success" />
          </div>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t("pinv.journalPreview")}</CardTitle></CardHeader>
            <CardContent>
              <Alert className="mb-3">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>{t("pinv.balancedTitle")}</AlertTitle>
                <AlertDescription>{t("pinv.balancedDescTpl", { val: totals.value.toFixed(2) })}</AlertDescription>
              </Alert>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("pinv.colProduct")}</TableHead>
                      <TableHead>{t("pinv.colBatch")}</TableHead>
                      <TableHead className="text-right">{t("pinv.thQtyCost")}</TableHead>
                      <TableHead className="text-right">{t("pinv.thDr1200")}</TableHead>
                      <TableHead className="text-right">{t("pinv.thCr3100")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(drafts).map((d) => {
                      const v = Number(d.qty) * Number(d.unit_cost);
                      return (
                        <TableRow key={d.product_id}>
                          <TableCell className="font-medium">{d.product_name}</TableCell>
                          <TableCell className="font-mono text-xs">{d.batch_no}</TableCell>
                          <TableCell className="text-right">{d.qty} × ৳{d.unit_cost.toFixed(2)}</TableCell>
                          <TableCell className="text-right">৳{v.toFixed(2)}</TableCell>
                          <TableCell className="text-right">৳{v.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("pinv.backBtn")}</Button>
            <Button onClick={() => commit.mutate()} disabled={commit.isPending}>
              {commit.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              {t("pinv.commitBtn")}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && committedSummary && (
        <Card className="mt-4 shadow-card">
          <CardContent className="pt-6 space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>{t("pinv.committedTitle")}</AlertTitle>
              <AlertDescription>
                {t("pinv.committedDescTpl", { count: committedSummary.count, qty: committedSummary.total_qty.toLocaleString(), val: committedSummary.total_value.toFixed(2) })}
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button onClick={resetWizard}>{t("pinv.initMoreBtn")}</Button>
              <Button variant="outline" asChild><Link to="/inventory">{t("pinv.backToInventory")}</Link></Button>
              <Button variant="outline" asChild><Link to="/accounts/ledger">{t("pinv.viewLedger")}</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  const { t } = useTranslation();
  const steps = [t("pinv.stepSelect"), t("pinv.stepEnter"), t("pinv.stepPreview"), t("pinv.stepCommit")];
  return (
    <div className="mt-4 flex items-center gap-2">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
              done ? "bg-success text-success-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>{done ? "✓" : n}</div>
            <span className={`text-sm ${active ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
            {i < steps.length - 1 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
