import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { buildProductDisplayName } from "@/lib/product-display";
import {
  getPurchaseReturn,
  approvePurchaseReturn,
  rejectPurchaseReturn,
} from "@/lib/api/purchase-returns.functions";

export const Route = createFileRoute("/purchases/returns/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-8 text-center text-muted-foreground">Return not found</div>,
  head: () => ({ meta: [{ title: "Purchase Return — SohojPharma" }] }),
  component: PurchaseReturnDetail,
});

const fmt = (n: number) => `৳ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-foreground" },
  submitted: { label: "Submitted", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-800 border-red-300" },
};

function PurchaseReturnDetail() {
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getFn = useServerFn(getPurchaseReturn);
  const approveFn = useServerFn(approvePurchaseReturn);
  const rejectFn = useServerFn(rejectPurchaseReturn);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["pr-detail", tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: () => getFn({ data: { tenantId, id } }),
  });

  const mApprove = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।");
      return approveFn({ data: { tenantId, branch_id: branchId, id } });
    },
    onSuccess: () => {
      toast.success("Return approved — stock, ledger & journal posted");
      qc.invalidateQueries({ queryKey: ["pr-detail"] });
      qc.invalidateQueries({ queryKey: ["pr-list"] });
      qc.invalidateQueries({ queryKey: ["pr-kpis"] });
      qc.invalidateQueries({ queryKey: ["pr-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mReject = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।");
      return rejectFn({ data: { tenantId, branch_id: branchId, id, reason: reason.trim() } });
    },
    onSuccess: () => {
      toast.success("Return rejected");
      setRejectOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["pr-detail"] });
      qc.invalidateQueries({ queryKey: ["pr-list"] });
      qc.invalidateQueries({ queryKey: ["pr-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <AppShell variant="store" title="Purchase return">
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }

  const { header, items, preparedBy, approvedBy } = data;
  const supplier = (header as { suppliers?: { name?: string; phone?: string; address?: string } | null }).suppliers ?? null;
  const status = header.status ?? "approved";
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.approved;
  const isPending = status === "submitted" || status === "draft";

  return (
    <AppShell variant="store" title={`Return ${header.return_no}`}>
      <div className="print:hidden">
        <PageHeader
          title={`Return ${header.return_no}`}
          description={supplier?.name ?? "Purchase return detail"}
          actions={
            <>
              <Button variant="outline" onClick={() => navigate({ to: "/purchases/returns" })}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" /> Print / PDF
              </Button>
              {isPending && (
                <>
                  <Button onClick={() => mApprove.mutate()} disabled={mApprove.isPending || !branchId}>
                    <Check className="mr-1.5 h-4 w-4" /> Approve
                  </Button>
                  <Button variant="destructive" onClick={() => setRejectOpen(true)}>
                    <X className="mr-1.5 h-4 w-4" /> Reject
                  </Button>
                </>
              )}
            </>
          }
        />
      </div>

      {/* Print-friendly note */}
      <div className="bg-white text-slate-900 print:p-0">
        <Card className="shadow-card print:border-0 print:shadow-none">
          <CardContent className="p-6 print:p-0">
            {/* Header band */}
            <div className="flex items-start justify-between border-b pb-4 mb-4">
              <div>
                <div className="text-2xl font-bold tracking-tight">Purchase Return Note</div>
                <div className="text-sm text-muted-foreground">ক্রয় ফেরত নোট</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg">{header.return_no}</div>
                <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
              <div><div className="text-xs text-muted-foreground">Supplier</div><div className="font-medium">{supplier?.name ?? "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Phone</div><div>{supplier?.phone ?? "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Return date</div><div>{header.return_date}</div></div>
              <div><div className="text-xs text-muted-foreground">Reason</div><div>{header.reason ?? "—"}</div></div>
              {header.grn_id && <div><div className="text-xs text-muted-foreground">GRN ref</div><div className="font-mono text-xs">{header.grn_id.slice(0, 8)}…</div></div>}
              {header.notes && <div className="col-span-2 sm:col-span-4"><div className="text-xs text-muted-foreground">Notes</div><div>{header.notes}</div></div>}
            </div>

            {/* Body — items */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => {
                  const p = (it as { products?: { name: string; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null } | null }).products;
                  const b = (it as { batches?: { batch_no?: string | null; expiry_date?: string | null } | null }).batches;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{p ? buildProductDisplayName(p) : "—"}</div>
                        {it.reason && <div className="text-xs text-muted-foreground">{it.reason}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b?.batch_no ?? "—"}</TableCell>
                      <TableCell className="text-xs">{b?.expiry_date ?? "—"}</TableCell>
                      <TableCell className="text-right">{it.qty}</TableCell>
                      <TableCell className="text-right">{fmt(Number(it.unit_cost))}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(Number(it.line_total))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Footer band */}
            <div className="mt-6 flex items-end justify-between">
              <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-sm">
                <div>
                  <div className="border-t border-slate-300 pt-1 w-44 text-center text-xs text-muted-foreground">Prepared by</div>
                  <div className="text-center font-medium">{preparedBy || "—"}</div>
                </div>
                <div>
                  <div className="border-t border-slate-300 pt-1 w-44 text-center text-xs text-muted-foreground">Approved by</div>
                  <div className="text-center font-medium">{approvedBy || (isPending ? "(pending)" : "—")}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total amount</div>
                <div className="text-2xl font-bold">{fmt(Number(header.total_value))}</div>
              </div>
            </div>

            {header.rejection_reason && (
              <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                <span className="font-medium">Rejected:</span> {header.rejection_reason}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject purchase return</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason for rejection (required)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason.trim() || mReject.isPending || !branchId} onClick={() => mReject.mutate()}>
              Confirm reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          body { background: #fff !important; }
          [data-app-shell-chrome], aside, header.app-header, nav { display: none !important; }
        }
      `}</style>
    </AppShell>
  );
}
