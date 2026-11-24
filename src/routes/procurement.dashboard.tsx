import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, ArrowRightLeft, Boxes, Undo2, Loader2, Check, X } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";
import {
  procurementKpis, pendingPOs, pendingTransfers,
  approvePO, rejectPO, submitPO, approveTransfer,
  getProcurementSettings, updateProcurementSettings,
} from "@/lib/api/procurement-control.functions";
import { listPendingPurchaseReturns, approvePurchaseReturn, rejectPurchaseReturn } from "@/lib/api/purchase-returns.functions";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";
import { useState } from "react";

export const Route = createFileRoute("/procurement/dashboard")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Procurement Control — SohojPharma" },
      { name: "description", content: "Pending POs, transfers, GRNs and returns with approval workflow." },
    ],
  }),
  component: ProcurementDashboard,
});

function ProcurementDashboard() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  const kpis = useQuery({ queryKey: ["proc-kpis", tenantId, warehouseId ?? "all"], queryFn: () => procurementKpis({ data: { tenantId, warehouseId } }), enabled: !!tenantId });
  const pos = useQuery({ queryKey: ["proc-pos", tenantId], queryFn: () => pendingPOs({ data: { tenantId } }), enabled: !!tenantId });
  const trs = useQuery({ queryKey: ["proc-trs", tenantId, warehouseId ?? "all"], queryFn: () => pendingTransfers({ data: { tenantId, warehouseId } }), enabled: !!tenantId });
  const settings = useQuery({ queryKey: ["proc-settings", tenantId], queryFn: () => getProcurementSettings({ data: { tenantId } }), enabled: !!tenantId });
  const pendingReturns = useQuery({ queryKey: ["pr-pending", tenantId], queryFn: () => listPendingPurchaseReturns({ data: { tenantId } }), enabled: !!tenantId });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["proc-kpis"] });
    qc.invalidateQueries({ queryKey: ["proc-pos"] });
    qc.invalidateQueries({ queryKey: ["proc-trs"] });
    qc.invalidateQueries({ queryKey: ["pr-pending"] });
  };

  const submitFn = useServerFn(submitPO);
  const approvePOFn = useServerFn(approvePO);
  const rejectPOFn = useServerFn(rejectPO);
  const approveTrFn = useServerFn(approveTransfer);
  const updateSettingsFn = useServerFn(updateProcurementSettings);
  const approvePRFn = useServerFn(approvePurchaseReturn);
  const rejectPRFn = useServerFn(rejectPurchaseReturn);

  const mSubmit = useMutation({ mutationFn: (poId: string) => submitFn({ data: { tenantId, poId } }),
    onSuccess: () => { toast.success("Submitted"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mApprovePO = useMutation({ mutationFn: (poId: string) => approvePOFn({ data: { tenantId, poId } }),
    onSuccess: () => { toast.success("Approved"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mRejectPO = useMutation({ mutationFn: (poId: string) => rejectPOFn({ data: { tenantId, poId, reason: "rejected" } }),
    onSuccess: () => { toast.success("Rejected"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mApproveTr = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => approveTrFn({ data: { tenantId, transferId: v.id, approve: v.approve, reason: v.approve ? undefined : "rejected" } }),
    onSuccess: () => { toast.success("Done"); invalidate(); }, onError: (e: Error) => toast.error(e.message),
  });
  const mSettings = useMutation({
    mutationFn: (v: { key: "requirePOApproval" | "requireTransferApproval" | "requireGRNApproval" | "requirePurchaseReturnApproval"; value: boolean }) =>
      updateSettingsFn({ data: { tenantId, [v.key]: v.value } as never }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["proc-settings"] }); toast.success("Updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mApprovePR = useMutation({ mutationFn: (id: string) => approvePRFn({ data: { tenantId, id } }),
    onSuccess: () => { toast.success("Return approved"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mRejectPR = useMutation({ mutationFn: (id: string) => rejectPRFn({ data: { tenantId, id, reason: "rejected from dashboard" } }),
    onSuccess: () => { toast.success("Return rejected"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  const s = settings.data ?? {};

  return (
    <AppShell variant="store">
      <PageHeader
        title="Procurement Control"
        description="Multi-warehouse approvals & pending work"
        actions={<WarehouseFilter value={warehouseId} onChange={setWarehouseId} className="w-[220px]" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard icon={ClipboardList} label="Pending POs" value={String(kpis.data?.pendingPO ?? 0)} />
        <StatCard icon={ArrowRightLeft} label="Pending transfers" value={String(kpis.data?.pendingTransfers ?? 0)} />
        <StatCard icon={Boxes} label="Pending GRNs" value={String(kpis.data?.pendingGRN ?? 0)} />
        <StatCard icon={Undo2} label="Pending returns" value={String(pendingReturns.data?.length ?? 0)} />
        <StatCard icon={Undo2} label="Recent returns (30d)" value={String(kpis.data?.pendingReturns ?? 0)} />
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle>Approval policy</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center justify-between gap-3">
            <Label>Require PO approval</Label>
            <Switch checked={!!s.require_po_approval}
              onCheckedChange={(v) => mSettings.mutate({ key: "requirePOApproval", value: v })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label>Require transfer approval</Label>
            <Switch checked={!!s.require_transfer_approval}
              onCheckedChange={(v) => mSettings.mutate({ key: "requireTransferApproval", value: v })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label>Require GRN approval</Label>
            <Switch checked={!!s.require_grn_approval}
              onCheckedChange={(v) => mSettings.mutate({ key: "requireGRNApproval", value: v })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label>Require purchase return approval</Label>
            <Switch checked={!!s.require_purchase_return_approval}
              onCheckedChange={(v) => mSettings.mutate({ key: "requirePurchaseReturnApproval", value: v })} />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Pending Purchase Returns</CardTitle></CardHeader>
        <CardContent>
          {pendingReturns.isLoading ? <Loader2 className="animate-spin" /> : (pendingReturns.data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No pending returns.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Return #</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead>
                <TableHead className="text-right">Value</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pendingReturns.data?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link to="/purchases/returns/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.return_no}</Link>
                    </TableCell>
                    <TableCell>{(r as { suppliers?: { name?: string } | null }).suppliers?.name ?? "—"}</TableCell>
                    <TableCell>{r.return_date}</TableCell>
                    <TableCell className="text-right">৳ {Number(r.total_value ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" onClick={() => mApprovePR.mutate(r.id)}><Check className="w-3 h-3 mr-1" />Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => mRejectPR.mutate(r.id)}><X className="w-3 h-3 mr-1" />Reject</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Pending Purchase Orders</CardTitle></CardHeader>
        <CardContent>
          {pos.isLoading ? <Loader2 className="animate-spin" /> : (pos.data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No pending POs.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>PO #</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pos.data?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.po_number}</TableCell>
                    <TableCell>{(p.suppliers as { name?: string } | null)?.name ?? "—"}</TableCell>
                    <TableCell>{p.order_date}</TableCell>
                    <TableCell className="text-right">৳ {Number(p.total).toLocaleString()}</TableCell>
                    <TableCell><Badge>{p.status}</Badge></TableCell>
                    <TableCell className="text-right space-x-1">
                      {p.status === "draft" && <Button size="sm" variant="outline" onClick={() => mSubmit.mutate(p.id)}>Submit</Button>}
                      <Button size="sm" onClick={() => mApprovePO.mutate(p.id)}><Check className="w-3 h-3 mr-1" />Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => mRejectPO.mutate(p.id)}><X className="w-3 h-3 mr-1" />Reject</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pending Stock Transfers</CardTitle></CardHeader>
        <CardContent>
          {trs.isLoading ? <Loader2 className="animate-spin" /> : (trs.data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No pending transfers.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Transfer #</TableHead><TableHead>Requested</TableHead><TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {trs.data?.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono">{t.transfer_no}</TableCell>
                    <TableCell>{t.requested_at ? new Date(t.requested_at).toLocaleString() : "—"}</TableCell>
                    <TableCell>{t.notes ?? "—"}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" onClick={() => mApproveTr.mutate({ id: t.id, approve: true })}><Check className="w-3 h-3 mr-1" />Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => mApproveTr.mutate({ id: t.id, approve: false })}><X className="w-3 h-3 mr-1" />Reject</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
