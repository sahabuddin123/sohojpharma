import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, X, PackageCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { RouteErrorPanel } from "@/components/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { toast } from "sonner";
import { approveTransfer, rejectTransfer, receiveTransfer } from "@/lib/api/transfers.functions";

export const Route = createFileRoute("/inventory/transfers/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Transfer — SohojPharma" }] }),
  component: TransferDetailPage,
});

type Detail = {
  id: string; transfer_no: string; status: string; notes: string | null;
  requested_at: string | null; approved_at: string | null; shipped_at: string | null;
  received_at: string | null; rejected_at: string | null; rejection_reason: string | null;
  from_warehouse: { name: string } | null;
  to_warehouse: { name: string } | null;
  items: Array<{ id: string; product_id: string; batch_id: string | null; qty_requested: number; qty_sent: number; qty_received: number; products: { name: string } | null; batches: { batch_no: string } | null }>;
};

function TransferDetailPage() {
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const approve = useServerFn(approveTransfer);
  const reject = useServerFn(rejectTransfer);
  const receive = useServerFn(receiveTransfer);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: t, isLoading } = useQuery<Detail | null>({
    enabled: !!tenantId,
    queryKey: ["transfer-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`id, transfer_no, status, notes, requested_at, approved_at, shipped_at, received_at, rejected_at, rejection_reason,
                 from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name),
                 items:stock_transfer_items(id, product_id, batch_id, qty_requested, qty_sent, qty_received,
                       products:product_id(name), batches:batch_id(batch_no))`)
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as unknown as Detail;
    },
  });

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await fn(); toast.success(success); qc.invalidateQueries({ queryKey: ["transfer-detail", id] }); qc.invalidateQueries({ queryKey: ["stock-transfers"] }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  if (isLoading) return <AppShell variant="store" title="Transfer"><div className="p-6">Loading…</div></AppShell>;
  if (!t) return <AppShell variant="store" title="Transfer"><div className="p-6">Not found.</div></AppShell>;

  return (
    <AppShell variant="store" title={`Transfer ${t.transfer_no}`}>
      <PageHeader title={`Transfer ${t.transfer_no}`} description={`${t.from_warehouse?.name ?? "—"} → ${t.to_warehouse?.name ?? "—"}`} actions={
        <Link to="/inventory/transfers" className="text-sm text-primary underline flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Back</Link>
      } />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge>{t.status}</Badge>
        {t.requested_at && <span className="text-xs text-muted-foreground">Requested {new Date(t.requested_at).toLocaleString()}</span>}
        {t.approved_at && <span className="text-xs text-muted-foreground">Approved {new Date(t.approved_at).toLocaleString()}</span>}
        {t.received_at && <span className="text-xs text-muted-foreground">Received {new Date(t.received_at).toLocaleString()}</span>}
        {t.rejected_at && <span className="text-xs text-red-600">Rejected {new Date(t.rejected_at).toLocaleString()}{t.rejection_reason ? ` — ${t.rejection_reason}` : ""}</span>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>Requested</TableHead><TableHead>Sent</TableHead><TableHead>Received</TableHead></TableRow></TableHeader>
            <TableBody>
              {t.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.products?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{it.batches?.batch_no ?? "—"}</TableCell>
                  <TableCell>{it.qty_requested}</TableCell>
                  <TableCell>{it.qty_sent}</TableCell>
                  <TableCell>{it.qty_received}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
        {t.status === "requested" && (
          <>
            <Input className="w-64" placeholder="Rejection reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="outline" disabled={busy || !branchId} onClick={() => run(() => reject({ data: { tenant_id: tenantId, branch_id: branchId!, transfer_id: t.id, reason: reason || undefined } }), "Transfer rejected")}>
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button disabled={busy || !branchId} onClick={() => run(() => approve({ data: { tenant_id: tenantId, branch_id: branchId!, transfer_id: t.id } }), "Transfer approved")}>
              <Check className="h-4 w-4 mr-1" /> Approve & Ship
            </Button>
          </>
        )}
        {t.status === "in_transit" && (
          <Button disabled={busy || !branchId} onClick={() => run(() => receive({ data: { tenant_id: tenantId, branch_id: branchId!, transfer_id: t.id } }), "Transfer received")}>
            <PackageCheck className="h-4 w-4 mr-1" /> Receive
          </Button>
        )}
      </div>
    </AppShell>
  );
}
