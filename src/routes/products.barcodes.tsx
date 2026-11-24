import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { listBarcodes, generateProductBarcode, listProductsForManagement } from "@/lib/api/product-management.functions";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { buildProductDisplayName } from "@/lib/product-display";

export const Route = createFileRoute("/products/barcodes")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Barcode Generate — SohojPharma" }, { name: "description", content: "Generate, preview, and print product barcodes." }] }),
  component: BarcodesPage,
});

type Row = { id: string; barcode: string; barcode_type: string; label_size: string | null; is_primary: boolean | null; status: string; products: { id: string; name: string; sku: string | null; retail_price: number | null; strength: string | null; medicine_type: string | null; volume: string | null; pack_size: number | null } | null };
const PAGE = 50;

function BarcodesPage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const list = useServerFn(listBarcodes);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "Code128" | "EAN13" | "QR">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [genOpen, setGenOpen] = useState(false);

  const q = useQuery({
    queryKey: ["barcodes", tenantId, search, type, page],
    enabled: !!tenantId,
    queryFn: () => list({ data: { tenantId, search: search || undefined, page, pageSize: PAGE, type: type === "all" ? undefined : type } }),
  });
  const rows = (q.data?.rows ?? []) as Row[];
  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function printSelected() {
    const items = rows.filter((r) => selected.has(r.id));
    if (!items.length) return toast.error(t("toast.selectRows"));
    const html = `<html><head><title>Barcodes</title><style>body{font-family:sans-serif;padding:12px}.lbl{display:inline-block;width:200px;border:1px solid #ddd;padding:8px;margin:4px;text-align:center;page-break-inside:avoid}.code{font-family:monospace;font-size:14px;font-weight:700;margin-top:6px}</style></head><body>${items.map((i) => `<div class="lbl"><div>${i.products ? buildProductDisplayName(i.products) : ""}</div><div class="code">${i.barcode}</div><div>৳ ${i.products?.retail_price ?? ""}</div></div>`).join("")}<script>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <AppShell variant="store" title={t("pinv.barcodesTitle")}>
      <PageHeader title={t("pinv.barcodesTitle")} description={t("pinv.barcodesCountTpl", { n: total })} actions={<div className="flex gap-2">
        <Button variant="outline" disabled={!selected.size} onClick={printSelected}><Printer className="mr-2 h-4 w-4" />{t("pinv.printSelTpl", { n: selected.size })}</Button>
        <Button onClick={() => setGenOpen(true)}><Plus className="mr-2 h-4 w-4" />{t("pinv.generateBtn")}</Button>
      </div>} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder={t("pinv.searchBarcodePh")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={type} onValueChange={(v) => { setType(v as never); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("pinv.typeAll")}</SelectItem>
                <SelectItem value="Code128">Code128</SelectItem>
                <SelectItem value="EAN13">EAN13</SelectItem>
                <SelectItem value="QR">{t("pinv.typeQR")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead className="w-10"></TableHead><TableHead>{t("pinv.colProduct")}</TableHead><TableHead>{t("pinv.colBarcode")}</TableHead><TableHead>{t("pinv.colType")}</TableHead><TableHead>{t("pinv.colLabel")}</TableHead><TableHead>{t("pinv.colStatus")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{t("pinv.noBarcodes")}</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} /></TableCell>
                    <TableCell className="font-medium">{r.products ? buildProductDisplayName(r.products) : "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{r.barcode}</TableCell>
                    <TableCell><Badge variant="outline">{r.barcode_type}</Badge></TableCell>
                    <TableCell>{r.label_size || "—"}</TableCell>
                    <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t("pinv.pageOf", { p: page, n: pages })}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("pinv.prev")}</Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("pinv.next")}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} tenantId={tenantId} onSaved={() => qc.invalidateQueries({ queryKey: ["barcodes"] })} />
    </AppShell>
  );
}

function GenerateDialog({ open, onOpenChange, tenantId, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const listProds = useServerFn(listProductsForManagement);
  const gen = useServerFn(generateProductBarcode);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"Code128" | "EAN13" | "QR">("Code128");
  const [label, setLabel] = useState("50x25mm");
  const [search, setSearch] = useState("");
  const prods = useQuery({
    queryKey: ["barcode-gen-products", tenantId, search],
    enabled: open && !!tenantId,
    queryFn: () => listProds({ data: { tenantId, search: search || undefined, page: 1, pageSize: 25 } }),
  });
  const m = useMutation({
    mutationFn: () => gen({ data: { tenantId, productId, barcodeType: type, labelSize: label || null } }),
    onSuccess: (r) => { toast.success(t("pinv.generatedTpl", { code: r.barcode })); onSaved(); onOpenChange(false); setProductId(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("dialog.generateBarcode")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label>{t("pinv.searchProductLbl")}</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pinv.typeProductPh")} /></div>
          <div className="space-y-1"><Label>{t("pinv.productStar")}</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder={t("pinv.selectProductPh")} /></SelectTrigger>
              <SelectContent>
                {(prods.data?.rows ?? []).map((p: { id: string; name: string; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null }) => <SelectItem key={p.id} value={p.id}>{buildProductDisplayName(p)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t("pinv.typeLbl")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Code128">Code128</SelectItem><SelectItem value="EAN13">EAN13</SelectItem><SelectItem value="QR">QR</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t("pinv.labelSizeLbl")}</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("pinv.cancelBtn")}</Button>
          <Button disabled={!productId || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("pinv.generateBtn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
