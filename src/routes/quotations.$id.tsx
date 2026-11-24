import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel, RouteNotFoundPanel } from "@/components/route-error";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Plus, Star, Truck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { supabase } from "@/integrations/supabase/client";
import { getQuotation, compareQuotation, selectQuotationSupplier, poFromQuotation } from "@/lib/api/quotations.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/quotations/$id")({
  head: () => ({ meta: [{ title: "Compare quotation — SohojPharma" }] }),
  component: QuotationDetail,
  errorComponent: (props) => <RouteErrorPanel {...props} />,
  notFoundComponent: () => <RouteNotFoundPanel label="Quotation" />,
});

function QuotationDetail() {
  const { t } = useTranslation();
  const { id } = useParams({ from: "/quotations/$id" });
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getQuotation);
  const cmpFn = useServerFn(compareQuotation);
  const selFn = useServerFn(selectQuotationSupplier);
  const poFn = useServerFn(poFromQuotation);

  const { data: q } = useQuery({ queryKey: ["q", id], queryFn: () => getFn({ data: { id } }) });
  const { data: cmp } = useQuery({ queryKey: ["q-cmp", id], queryFn: () => cmpFn({ data: { id } }) });

  const select = useMutation({
    mutationFn: selFn,
    onSuccess: () => { toast.success(t("ops.quot.supplierSelected")); qc.invalidateQueries({ queryKey: ["q", id] }); },
  });
  const genPO = useMutation({
    mutationFn: poFn,
    onSuccess: (r) => { toast.success(t("ops.quot.poDrafted")); navigate({ to: "/procurement/$id", params: { id: r.po_id } }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("ops.quot.failed")),
  });

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/quotations"><Button variant="ghost"><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("ops.quot.back")}</Button></Link>
        <Badge>{q?.quotation?.status}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{q?.quotation?.rfq_number}</span>
            <AddQuoteDialog quotationId={id} tenantId={tenantId} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{q?.quotation?.title ?? "—"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("ops.quot.comparison")}</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {(cmp ?? []).map((g) => (
            <div key={g.product_id}>
              <p className="mb-2 font-medium">{g.product?.name ?? "Product"} <span className="text-xs text-muted-foreground">{g.product?.sku}</span></p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ops.quot.colSupplier")}</TableHead>
                    <TableHead className="text-right">{t("ops.quot.qtyLabel")}</TableHead>
                    <TableHead className="text-right">{t("ops.quot.available")}</TableHead>
                    <TableHead className="text-right">{t("ops.quot.unitPrice")}</TableHead>
                    <TableHead>{t("ops.quot.deliveryDays")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rows.map((r) => (
                    <TableRow key={r.id} className={r.is_best_price ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}>
                      <TableCell>{(r.suppliers as { name?: string } | null)?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.qty)}</TableCell>
                      <TableCell className="text-right">{r.available_qty ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {Number(r.unit_price).toLocaleString()}
                        {r.is_best_price && <Badge variant="outline" className="ml-2 border-emerald-500 text-emerald-700">{t("ops.quot.bestPrice")}</Badge>}
                      </TableCell>
                      <TableCell>
                        {r.delivery_days ?? "—"}d
                        {r.is_fastest && <Badge variant="outline" className="ml-2 border-blue-500 text-blue-700">{t("ops.quot.fastest")}</Badge>}
                      </TableCell>
                      <TableCell>
                        {r.supplier_id && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => select.mutate({ data: { id, supplier_id: r.supplier_id! } })}>
                              <Star className="mr-1 h-3.5 w-3.5" /> {t("ops.quot.select")}
                            </Button>
                            <Button size="sm" variant="ghost" disabled={!branchId} onClick={() => {
                              if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
                              genPO.mutate({ data: { quotation_id: id, branch_id: branchId, supplier_id: r.supplier_id! } });
                            }}>
                              <FileText className="mr-1 h-3.5 w-3.5" /> {t("ops.quot.poBtn")}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
          {(!cmp || cmp.length === 0) && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("ops.quot.noQuotes")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddQuoteDialog({ quotationId, tenantId }: { quotationId: string; tenantId: string }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("0");
  const [days, setDays] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  async function load() {
    const { data: s } = await supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).limit(100);
    const { data: p } = await supabase.from("products").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).limit(100);
    setSuppliers(s ?? []); setProducts(p ?? []);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) void load(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> {t("ops.quot.addQuote")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("ops.quot.addSupplierQuote")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("ops.quot.supplier")}</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{t("ops.quot.selectOption")}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <Label>{t("ops.quot.product")}</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{t("ops.quot.selectOption")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>{t("ops.quot.qtyLabel")}</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><Label>{t("ops.quot.unitPrice")}</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div><Label>{t("ops.quot.deliveryDays")}</Label><Input type="number" value={days} onChange={(e) => setDays(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("ops.quot.cancel")}</Button>
          <Button
            disabled={!supplierId || !productId || !branchId}
            onClick={async () => {
              if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
              const { error } = await supabase.from("quotation_items").insert({
                tenant_id: tenantId,
                branch_id: branchId,
                quotation_id: quotationId,
                supplier_id: supplierId,
                product_id: productId,
                qty: Number(qty),
                unit_price: Number(price),
                delivery_days: days ? Number(days) : null,
              });
              if (error) { toast.error(error.message); return; }
              toast.success(t("ops.quot.quoteAdded"));
              qc.invalidateQueries({ queryKey: ["q-cmp", quotationId] });
              setOpen(false);
            }}
          >{t("ops.quot.addBtn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
