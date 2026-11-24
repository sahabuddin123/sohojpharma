import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { supabase } from "@/integrations/supabase/client";
import { listQuotations, createQuotation } from "@/lib/api/quotations.functions";
import { supplierScores } from "@/lib/api/quotations.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/quotations/")({
  head: () => ({ meta: [{ title: "Quotations — SohojPharma" }] }),
  component: QuotationsPage,
  errorComponent: (props) => <RouteErrorPanel {...props} />,
});

function QuotationsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listQuotations);
  const scoresFn = useServerFn(supplierScores);

  const { data: rfqs } = useQuery({
    queryKey: ["quotations", tenantId],
    queryFn: () => listFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });
  const { data: scores } = useQuery({
    queryKey: ["supplier-scores", tenantId],
    queryFn: () => scoresFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("ops.quot.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("ops.quot.desc")}</p>
        </div>
        <NewRFQDialog tenantId={tenantId} />
      </div>

      <Tabs defaultValue="rfqs">
        <TabsList>
          <TabsTrigger value="rfqs">{t("ops.quot.tabRFQs")}</TabsTrigger>
          <TabsTrigger value="scores">{t("ops.quot.tabScores")}</TabsTrigger>
        </TabsList>
        <TabsContent value="rfqs">
          <Card>
            <CardHeader><CardTitle>{t("ops.quot.allRFQs")}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ops.quot.colRFQ")}</TableHead>
                    <TableHead>{t("ops.quot.colTitle")}</TableHead>
                    <TableHead>{t("ops.quot.colDate")}</TableHead>
                    <TableHead>{t("ops.quot.colValidUntil")}</TableHead>
                    <TableHead>{t("ops.quot.colStatus")}</TableHead>
                    <TableHead>{t("ops.quot.colSelectedSupplier")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rfqs ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.rfq_number}</TableCell>
                      <TableCell>{r.title ?? "—"}</TableCell>
                      <TableCell>{r.request_date}</TableCell>
                      <TableCell>{r.valid_until ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                      <TableCell>{(r.suppliers as { name?: string } | null)?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Link to="/quotations/$id" params={{ id: r.id }}>
                          <Button size="sm" variant="ghost">{t("ops.quot.compare")}</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!rfqs || rfqs.length === 0) && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{t("ops.quot.noRFQs")}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="scores">
          <Card>
            <CardHeader><CardTitle>{t("ops.quot.supplierPerf")}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ops.quot.colSupplier")}</TableHead>
                    <TableHead>{t("ops.quot.colPOs")}</TableHead>
                    <TableHead>{t("ops.quot.colCompleted")}</TableHead>
                    <TableHead>{t("ops.quot.colOnTime")}</TableHead>
                    <TableHead className="text-right">{t("ops.quot.colVolume")}</TableHead>
                    <TableHead>{t("ops.quot.colScore")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(scores ?? []).map((s) => (
                    <TableRow key={s.supplier_id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.po_count}</TableCell>
                      <TableCell>{s.completed}</TableCell>
                      <TableCell>{s.on_time_pct}%</TableCell>
                      <TableCell className="text-right">{Number(s.volume).toLocaleString()}</TableCell>
                      <TableCell>
                        <span className="flex">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-4 w-4 ${i < s.score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NewRFQDialog({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const createFn = useServerFn(createQuotation);
  const mut = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success(t("ops.quot.rfqCreated"));
      qc.invalidateQueries({ queryKey: ["quotations"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("ops.quot.failed")),
  });

  async function loadProducts() {
    const { data } = await supabase.from("products").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).limit(100);
    setProducts(data ?? []);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) void loadProducts(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1.5 h-4 w-4" /> {t("ops.quot.newRFQ")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("ops.quot.requestForQuotation")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("ops.quot.titleLabel")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div>
            <Label>{t("ops.quot.productLabel")}</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{t("ops.quot.selectOption")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><Label>{t("ops.quot.qtyNeeded")}</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("ops.quot.cancel")}</Button>
          <Button
            disabled={!productId || !branchId || mut.isPending}
            onClick={() => {
              if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
              mut.mutate({ data: {
                tenantId, branch_id: branchId, title: title || undefined,
                items: [{ product_id: productId, qty: Number(qty), unit_price: 0 }],
              } });
            }}
          >{t("ops.quot.createRFQ")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
