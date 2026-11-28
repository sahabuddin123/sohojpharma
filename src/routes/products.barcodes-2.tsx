import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { listProductsForManagement } from "@/lib/api/product-management.functions";
import { getBarcodeBatchBulk, type BarcodeBatchInfo } from "@/lib/api/barcode-batches.functions";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { buildProductDisplayName } from "@/lib/product-display";
import { escapeHtml, safeMediaUrl } from "@/lib/security/html-escape";

export const Route = createFileRoute("/products/barcodes-2")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Barcode Generate 2 — SohojPharma" }, { name: "description", content: "RP400H thermal label printing with QR, DataMatrix, and bulk presets." }] }),
  component: BarcodesAdvancedPage,
});

type Row = { id: string; barcode: string; barcode_type: string; label_size: string | null; status: string; products: { id: string; name: string; sku: string | null; retail_price: number | null; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null } | null };

// RP400H thermal printer presets — 100mm paper width
const RP400H_PRESETS = {
  "50x25": { w: 50, h: 25, label: "RP400H 50×25mm", cols: 2 },
  "60x40": { w: 60, h: 40, label: "RP400H 60×40mm", cols: 1 },
  "70x50": { w: 70, h: 50, label: "RP400H 70×50mm", cols: 1 },
  "100x50": { w: 100, h: 50, label: "RP400H 100×50mm", cols: 1 },
  "100x75": { w: 100, h: 75, label: "RP400H 100×75mm", cols: 1 },
} as const;

type PresetKey = keyof typeof RP400H_PRESETS;

const BARCODE_TYPES = ["Code128", "EAN13", "EAN8", "QR", "DataMatrix"] as const;
const QUICK_QTY = [1, 5, 10, 20, 50, 100];
const PAGE = 100;

function barcodeImgSrc(value: string, type: string) {
  switch (type) {
    case "QR":
      return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(value)}`;
    case "DataMatrix":
      return `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(value)}&code=DataMatrix&dpi=200`;
    case "EAN13":
      return `https://barcodeapi.org/api/ean13/${encodeURIComponent(value)}`;
    case "EAN8":
      return `https://barcodeapi.org/api/ean8/${encodeURIComponent(value)}`;
    case "Code128":
    default:
      return `https://barcodeapi.org/api/code128/${encodeURIComponent(value)}`;
  }
}

function BarcodesAdvancedPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const list = useServerFn(listProductsForManagement);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "Code128" | "EAN13" | "QR" | "EAN8" | "DataMatrix">("Code128");

  // RP400H settings
  const [preset, setPreset] = useState<PresetKey>("50x25");
  const [copies, setCopies] = useState("1");

  // Label content toggles
  const [showName, setShowName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showBarcodeNum, setShowBarcodeNum] = useState(true);
  const [showMrp, setShowMrp] = useState(true);
  const [showBatchNo, setShowBatchNo] = useState(false);
  const [showExpiry, setShowExpiry] = useState(false);

  const [selectedMap, setSelectedMap] = useState<Map<string, Row>>(new Map());
  const selected = useMemo(() => new Set(selectedMap.keys()), [selectedMap]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const q = useQuery({
    queryKey: ["barcodes-2-products", tenantId, search],
    enabled: !!tenantId,
    queryFn: () => list({ data: { tenantId, search: search || undefined, page: 1, pageSize: PAGE } }),
  });
  const rows = useMemo<Row[]>(() => {
    const products = (q.data?.rows ?? []) as Array<{ id: string; name: string; sku: string | null; barcode: string | null; retail_price: number | null; strength: string | null; medicine_type: string | null; volume: string | null }>;
    return products.map((p) => ({
      id: p.id,
      barcode: p.barcode || p.sku || p.id.slice(0, 12).toUpperCase(),
      barcode_type: typeFilter === "all" ? "Code128" : typeFilter,
      label_size: null,
      status: "active",
      products: { id: p.id, name: p.name, sku: p.sku, retail_price: p.retail_price, strength: p.strength, medicine_type: p.medicine_type, volume: p.volume },
    }));
  }, [q.data, typeFilter]);

  // FEFO batch info per product (resolved via SECURITY DEFINER RPC; never queries batches directly)
  const fetchBulkBatches = useServerFn(getBarcodeBatchBulk);
  const selectedProductIds = useMemo(() => {
    const ids = new Set<string>();
    selectedMap.forEach((r) => { if (r.products?.id) ids.add(r.products.id); });
    return Array.from(ids).sort();
  }, [selectedMap]);
  const batchQ = useQuery({
    queryKey: ["barcode-batches", tenantId, selectedProductIds],
    enabled: !!tenantId && selectedProductIds.length > 0,
    queryFn: () => fetchBulkBatches({ data: { tenantId, productIds: selectedProductIds } }),
  });
  const batchMap = (batchQ.data ?? {}) as Record<string, BarcodeBatchInfo>;

  function fmtExpiry(d: string | null): string {
    if (!d) return "N/A";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "N/A";
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function toggle(row: Row) {
    setSelectedMap((m) => {
      const n = new Map(m);
      if (n.has(row.id)) n.delete(row.id); else n.set(row.id, row);
      return n;
    });
  }
  function toggleAll() {
    setSelectedMap((m) => {
      const allOnPage = rows.length > 0 && rows.every((r) => m.has(r.id));
      const n = new Map(m);
      if (allOnPage) rows.forEach((r) => n.delete(r.id));
      else rows.forEach((r) => n.set(r.id, r));
      return n;
    });
  }

  const selectedRows = useMemo(() => Array.from(selectedMap.values()), [selectedMap]);

  function buildLabels(): Row[] {
    const copyN = Math.max(1, parseInt(copies) || 1);
    const out: Row[] = [];
    selectedRows.forEach((it) => { for (let i = 0; i < copyN; i++) out.push(it); });
    return out;
  }

  function labelHtml(r: Row, cfg: typeof RP400H_PRESETS[PresetKey]) {
    const name = r.products ? buildProductDisplayName(r.products) : "";
    const sku = r.products?.sku ?? "";
    const mrp = r.products?.retail_price;
    const batch = (r.products?.id && batchMap[r.products.id]) || null;
    const batchNo = batch?.batch_no ?? "N/A";
    const expTxt = fmtExpiry(batch?.expiry_date ?? null);
    const imgMax = `max-width:${cfg.w - 4}mm;max-height:${cfg.h - 16}mm;object-fit:contain`;
    return `<div class="lbl">
      ${showName && name ? `<div class="name">${escapeHtml(name.slice(0, 40))}</div>` : ""}
      ${showSku && sku ? `<div class="sku">SKU: ${escapeHtml(sku)}</div>` : ""}
      <img class="bc" src="${escapeHtml(safeMediaUrl(barcodeImgSrc(r.barcode, r.barcode_type)))}" alt="${escapeHtml(r.barcode)}" style="${imgMax}" />
      ${showBarcodeNum ? `<div class="code">${escapeHtml(r.barcode)}</div>` : ""}
      ${showMrp && mrp != null ? `<div class="mrp">MRP ৳ ${escapeHtml(mrp)}</div>` : ""}
      ${showBatchNo ? `<div class="meta">Batch: ${escapeHtml(batchNo)}</div>` : ""}
      ${showExpiry ? `<div class="meta">Exp: ${escapeHtml(expTxt)}</div>` : ""}
    </div>`;
  }

  function printSheet() {
    const items = buildLabels();
    if (!items.length) return toast.error(t("toast.selectBarcode"));
    const cfg = RP400H_PRESETS[preset];
    const html = `<!doctype html><html><head><title>RP400H ${cfg.label}</title><style>
      @page { size: ${cfg.w}mm ${cfg.h}mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: ${cfg.w}mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: Arial, Helvetica, sans-serif; }
      .lbl { width: ${cfg.w}mm; height: ${cfg.h}mm; padding: 1.5mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; page-break-after: always; }
      .lbl:last-child { page-break-after: auto; }
      .name { font-size: 9pt; font-weight: 700; line-height: 1.1; margin-bottom: 0.5mm; }
      .sku { font-size: 7pt; color: #333; }
      .bc { margin: 0.5mm 0; }
      .code { font-family: monospace; font-size: 8pt; letter-spacing: 0.5px; }
      .mrp { font-size: 10pt; font-weight: 700; margin-top: 0.5mm; }
      .meta { font-size: 7pt; color: #444; }
      @media print { body { width: ${cfg.w}mm; } }
    </style></head><body>
      ${items.map((r) => labelHtml(r, cfg)).join("")}
      <script>window.addEventListener('load',()=>setTimeout(()=>{window.print();},400))</script>
    </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  const cfg = RP400H_PRESETS[preset];

  return (
    <AppShell variant="store" title={t("pinv.barcodes2Title")}>
      <PageHeader title={t("pinv.barcodes2Title")} description={`RP400H Thermal · ${cfg.label}`} actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!selected.size}><Eye className="mr-2 h-4 w-4" />Preview</Button>
          <Button onClick={printSheet} disabled={!selected.size}><Printer className="mr-2 h-4 w-4" />Print {selected.size * (parseInt(copies) || 1)}</Button>
        </div>
      } />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1">
              <Label>Printer Preset (RP400H · 100mm)</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(RP400H_PRESETS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Copies per product</Label>
              <div className="flex flex-wrap gap-1">
                {QUICK_QTY.map((n) => (
                  <Button key={n} type="button" size="sm" variant={String(n) === copies ? "default" : "outline"} onClick={() => setCopies(String(n))}>{n}</Button>
                ))}
              </div>
              <Input type="number" min="1" value={copies} onChange={(e) => setCopies(e.target.value)} />
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-semibold">Label Content</Label>
              {([
                ["Product Name", showName, setShowName],
                ["SKU", showSku, setShowSku],
                ["Barcode Number", showBarcodeNum, setShowBarcodeNum],
                ["MRP", showMrp, setShowMrp],
                ["Batch No", showBatchNo, setShowBatchNo],
                ["Expiry Date", showExpiry, setShowExpiry],
              ] as const).map(([lbl, val, set]) => (
                <div key={lbl} className="flex items-center gap-2">
                  <Checkbox id={`t-${lbl}`} checked={val} onCheckedChange={(v) => set(!!v)} />
                  <Label htmlFor={`t-${lbl}`} className="text-sm font-normal">{lbl}</Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap gap-2">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("pinv.searchBarcodePh")} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as never)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {BARCODE_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border max-h-[520px] overflow-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10"><Checkbox checked={rows.length > 0 && selected.size === rows.length} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>{t("pinv.colProduct")}</TableHead>
                  <TableHead>{t("pinv.colBarcode")}</TableHead>
                  <TableHead>{t("pinv.colType")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {q.isLoading ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">{t("pinv.noBarcodes2")}</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r)} /></TableCell>
                      <TableCell className="font-medium">{r.products ? buildProductDisplayName(r.products) : "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{r.barcode}</TableCell>
                      <TableCell><Badge variant="outline">{r.barcode_type}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Print Preview · {cfg.label}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded border bg-muted/30 p-4">
            <div className="flex flex-wrap gap-2">
              {selectedRows.slice(0, 12).map((r) => {
                const name = r.products ? buildProductDisplayName(r.products) : "";
                const batch = (r.products?.id && batchMap[r.products.id]) || null;
                return (
                  <div key={r.id} style={{ width: `${cfg.w * 3}px`, height: `${cfg.h * 3}px` }} className="flex flex-col items-center justify-center border bg-background p-2 text-center text-[10px]">
                    {showName && name && <div className="line-clamp-1 font-bold">{name}</div>}
                    {showSku && r.products?.sku && <div className="text-[8px] text-muted-foreground">SKU: {r.products.sku}</div>}
                    <img src={barcodeImgSrc(r.barcode, r.barcode_type)} alt={r.barcode} style={{ maxHeight: `${cfg.h * 1.5}px`, maxWidth: `${cfg.w * 2.5}px`, objectFit: "contain" }} />
                    {showBarcodeNum && <div className="font-mono text-[8px]">{r.barcode}</div>}
                    {showMrp && r.products?.retail_price != null && <div className="text-[10px] font-bold">৳ {r.products.retail_price}</div>}
                    {showBatchNo && <div className="text-[8px]">Batch: {batch?.batch_no ?? "N/A"}</div>}
                    {showExpiry && <div className="text-[8px]">Exp: {fmtExpiry(batch?.expiry_date ?? null)}</div>}
                  </div>
                );
              })}
            </div>
            {selectedRows.length > 12 && <p className="mt-3 text-center text-xs text-muted-foreground">+ {selectedRows.length - 12} more · {selectedRows.length * (parseInt(copies) || 1)} labels total</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button onClick={() => { setPreviewOpen(false); printSheet(); }}><Printer className="mr-2 h-4 w-4" />Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
