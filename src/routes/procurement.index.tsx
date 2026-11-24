import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, FileText, Truck } from "lucide-react";
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
import { listPurchaseOrders, createPurchaseOrder, poStats } from "@/lib/api/procurement.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/procurement/")({
  head: () => ({ meta: [{ title: "Purchase Orders — SohojPharma" }] }),
  component: PODashboard,
  errorComponent: (props) => <RouteErrorPanel {...props} />,
});

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-foreground",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  partially_received: "bg-amber-100 text-amber-700",
  received: "bg-emerald-200 text-emerald-800",
  cancelled: "bg-destructive/20 text-destructive",
};

function PODashboard() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const list = useServerFn(listPurchaseOrders);
  const stats = useServerFn(poStats);

  const { data: posResp } = useQuery({
    queryKey: ["pos", tenantId],
    queryFn: () => list({ data: { tenantId } }),
    enabled: !!tenantId,
  });
  const pos = posResp?.rows;
  const { data: s } = useQuery({
    queryKey: ["po-stats", tenantId],
    queryFn: () => stats({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('ops.proc.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('ops.proc.desc')}</p>
        </div>
        <NewPODialog tenantId={tenantId} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {(["draft","sent","approved","partially_received","received","cancelled"] as const).map((k) => (
          <Card key={k}>
            <CardContent className="py-4">
              <p className="text-xs uppercase text-muted-foreground">{k.replace("_"," ")}</p>
              <p className="text-2xl font-bold">{s?.counts?.[k] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>{t('ops.proc.allPOs')}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('ops.proc.colPoNumber')}</TableHead>
                <TableHead>{t('ops.proc.colSupplier')}</TableHead>
                <TableHead>{t('ops.proc.colOrderDate')}</TableHead>
                <TableHead>{t('ops.proc.colExpected')}</TableHead>
                <TableHead className="text-right">{t('ops.proc.colTotal')}</TableHead>
                <TableHead>{t('ops.proc.colStatus')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pos ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.po_number}</TableCell>
                  <TableCell>{(p.suppliers as { name?: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell>{p.order_date}</TableCell>
                  <TableCell>{p.expected_delivery_date ?? "—"}</TableCell>
                  <TableCell className="text-right">{Number(p.total).toLocaleString()}</TableCell>
                  <TableCell><Badge className={STATUS_COLORS[p.status]} variant="outline">{p.status}</Badge></TableCell>
                  <TableCell>
                    <Link to="/procurement/$id" params={{ id: p.id }}>
                      <Button size="sm" variant="ghost">{t('ops.proc.open')}</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {(!pos || pos.length === 0) && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{t('ops.proc.noPOs')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NewPODialog({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("0");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  const createFn = useServerFn(createPurchaseOrder);
  const mut = useMutation({
    mutationFn: createFn,
    onSuccess: (res) => {
      toast.success(t('ops.proc.poCreated'));
      qc.invalidateQueries({ queryKey: ["pos"] });
      qc.invalidateQueries({ queryKey: ["po-stats"] });
      setOpen(false);
      navigate({ to: "/procurement/$id", params: { id: res.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('ops.proc.failed')),
  });

  async function loadOptions() {
    const { data: sup } = await supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).limit(100);
    const { data: prod } = await supabase.from("products").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).limit(100);
    setSuppliers(sup ?? []);
    setProducts(prod ?? []);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) void loadOptions(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1.5 h-4 w-4" /> {t('ops.proc.newPO')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('ops.proc.createPO')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t('ops.proc.supplier')}</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{t('ops.proc.selectSupplier')}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <Label>{t('ops.proc.expectedDelivery')}</Label>
            <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
          <div className="rounded border p-3">
            <p className="mb-2 text-sm font-medium">{t('ops.proc.firstLineItem')}</p>
            <Label>{t('ops.proc.product')}</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{t('ops.proc.selectProduct')}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><Label>{t('ops.proc.qty')}</Label><Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" /></div>
              <div><Label>{t('ops.proc.unitCost')}</Label><Input value={cost} onChange={(e) => setCost(e.target.value)} type="number" /></div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('ops.proc.cancel')}</Button>
          <Button
            disabled={!productId || !branchId || mut.isPending}
            onClick={() => {
              if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
              mut.mutate({
                data: {
                  tenantId,
                  branch_id: branchId,
                  supplier_id: supplierId || null,
                  expected_delivery_date: expected || undefined,
                  items: [{
                    product_id: productId,
                    qty_ordered: Number(qty),
                    unit_cost: Number(cost),
                  }],
                },
              });
            }}
          >
            <FileText className="mr-1.5 h-4 w-4" /> {t('ops.proc.createDraft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
