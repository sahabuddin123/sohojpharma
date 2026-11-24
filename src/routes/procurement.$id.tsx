import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { RouteErrorPanel, RouteNotFoundPanel } from "@/components/route-error";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, Send, X, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getPurchaseOrder, updatePOStatus, receivePurchaseOrder } from "@/lib/api/procurement.functions";
import { buildProductDisplayName } from "@/lib/product-display";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/procurement/$id")({
  head: () => ({ meta: [{ title: "PO — SohojPharma" }] }),
  component: PODetail,
  errorComponent: (props) => <RouteErrorPanel {...props} />,
  notFoundComponent: () => <RouteNotFoundPanel label="Purchase order" />,
});

function PODetail() {
  const { t } = useTranslation();
  const { id } = useParams({ from: "/procurement/$id" });
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const getFn = useServerFn(getPurchaseOrder);
  const updateFn = useServerFn(updatePOStatus);

  const { data } = useQuery({
    queryKey: ["po", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const status = useMutation({
    mutationFn: updateFn,
    onSuccess: () => { toast.success(t("ops.proc.updated")); qc.invalidateQueries({ queryKey: ["po", id] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("ops.proc.failed")),
  });

  if (!data) return <div className="p-6">{t("ops.proc.loading")}</div>;
  const { po, items } = data;
  const supplier = po.suppliers as { name?: string; phone?: string } | null;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/procurement"><Button variant="ghost"><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("ops.proc.back")}</Button></Link>
        <Badge>{po.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{po.po_number}</span>
            <div className="flex gap-2">
              {po.status === "draft" && (
                <Button size="sm" variant="outline" disabled={!branchId} onClick={() => status.mutate({ data: { id, action: "send", branch_id: branchId ?? undefined } })}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> {t("ops.proc.send")}
                </Button>
              )}
              {(po.status === "draft" || po.status === "sent") && (
                <Button size="sm" disabled={!branchId} onClick={() => status.mutate({ data: { id, action: "approve", branch_id: branchId ?? undefined } })}>
                  <Check className="mr-1.5 h-3.5 w-3.5" /> {t("ops.proc.approve")}
                </Button>
              )}
              {po.status !== "cancelled" && po.status !== "received" && (
                <Button size="sm" variant="destructive" disabled={!branchId} onClick={() => status.mutate({ data: { id, action: "cancel", branch_id: branchId ?? undefined } })}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> {t("ops.proc.cancelAction")}
                </Button>
              )}
              {(po.status === "approved" || po.status === "partially_received") && (
                <ReceiveDialog poId={id} items={items} branchId={branchId} />
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">{t("ops.proc.supplierLabel")}</p><p>{supplier?.name ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("ops.proc.orderDateLabel")}</p><p>{po.order_date}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("ops.proc.expectedLabel")}</p><p>{po.expected_delivery_date ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("ops.proc.totalLabel")}</p><p className="font-semibold">{Number(po.total).toLocaleString()}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("ops.proc.lineItems")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ops.proc.colProduct")}</TableHead>
                <TableHead className="text-right">{t("ops.proc.colOrdered")}</TableHead>
                <TableHead className="text-right">{t("ops.proc.colReceived")}</TableHead>
                <TableHead className="text-right">{t("ops.proc.colUnitCost")}</TableHead>
                <TableHead className="text-right">{t("ops.proc.colLineTotal")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const prod = it.products as { name?: string; sku?: string } | null;
                return (
                  <TableRow key={it.id}>
                    <TableCell>{prod?.name ?? it.product_id.slice(0, 8)} <span className="text-xs text-muted-foreground">{prod?.sku}</span></TableCell>
                    <TableCell className="text-right">{Number(it.qty_ordered)}</TableCell>
                    <TableCell className="text-right">{Number(it.qty_received)}</TableCell>
                    <TableCell className="text-right">{Number(it.unit_cost).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(it.line_total).toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

type Item = {
  id: string; product_id: string; qty_ordered: number; qty_received: number;
  products?: { name?: string } | null;
};

function ReceiveDialog({ poId, items, branchId }: { poId: string; items: Item[]; branchId: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const receiveFn = useServerFn(receivePurchaseOrder);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, { qty: string; batch: string; expiry: string }>>({});

  const mut = useMutation({
    mutationFn: receiveFn,
    onSuccess: () => {
      toast.success(t("ops.proc.stockReceived"));
      qc.invalidateQueries({ queryKey: ["po", poId] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("ops.proc.failed")),
  });

  const pending = items.filter((i) => Number(i.qty_received) < Number(i.qty_ordered));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default"><Truck className="mr-1.5 h-3.5 w-3.5" /> {t("ops.proc.receive")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("ops.proc.receiveGRN")}</DialogTitle></DialogHeader>
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {pending.map((it) => {
            const r = rows[it.id] ?? { qty: "", batch: "", expiry: "" };
            const remaining = Number(it.qty_ordered) - Number(it.qty_received);
            return (
              <div key={it.id} className="rounded border p-3">
                <p className="text-sm font-medium">{it.products?.name ? buildProductDisplayName({ ...it.products, name: it.products.name }) : it.product_id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">{t("ops.proc.remaining", { n: remaining })}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div><Label>{t("ops.proc.qty")}</Label><Input type="number" value={r.qty} onChange={(e) => setRows({ ...rows, [it.id]: { ...r, qty: e.target.value } })} /></div>
                  <div><Label>{t("ops.proc.batchNo")}</Label><Input value={r.batch} onChange={(e) => setRows({ ...rows, [it.id]: { ...r, batch: e.target.value } })} /></div>
                  <div><Label>{t("ops.proc.expiry")}</Label><Input type="date" value={r.expiry} onChange={(e) => setRows({ ...rows, [it.id]: { ...r, expiry: e.target.value } })} /></div>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("ops.proc.cancel")}</Button>
          <Button
            disabled={mut.isPending || !branchId}
            onClick={() => {
              const lines = Object.entries(rows)
                .filter(([, r]) => Number(r.qty) > 0 && r.batch && r.expiry)
                .map(([item_id, r]) => ({
                  item_id, qty: Number(r.qty), batch_no: r.batch, expiry_date: r.expiry,
                }));
              if (lines.length === 0) { toast.error(t("ops.proc.fillOneLine")); return; }
              if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
              mut.mutate({ data: { id: poId, branch_id: branchId, lines } });
            }}
          >{t("ops.proc.confirmReceive")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
