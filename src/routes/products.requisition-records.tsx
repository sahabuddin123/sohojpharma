import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { listRequisitionRecords } from "@/lib/api/product-management.functions";
import { RouteErrorPanel } from "@/components/route-error";

export const Route = createFileRoute("/products/requisition-records")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Requisition Records — SohojPharma" }, { name: "description", content: "Audit trail of requisition status changes." }] }),
  component: Page,
});

type Row = { id: string; action: string; status_from: string | null; status_to: string | null; notes: string | null; created_at: string; requisitions: { requisition_no: string; status: string } | null };
const PAGE = 50;

function Page() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const list = useServerFn(listRequisitionRecords);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["requisition-records", tenantId, from, to, status, page],
    enabled: !!tenantId,
    queryFn: () => list({ data: { tenantId, from: from || undefined, to: to || undefined, status: status === "all" ? undefined : status, page, pageSize: PAGE } }),
  });
  const rows = (q.data?.rows ?? []) as Row[];
  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <AppShell variant="store" title="Requisition Records">
      <PageHeader title="Requisition Records" description={`${total} audit entries`} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            <div className="space-y-1"><label className="text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>Req No</TableHead><TableHead>Action</TableHead><TableHead>From → To</TableHead><TableHead>Notes</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No records</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.requisitions?.requisition_no ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                    <TableCell className="text-sm">{r.status_from ?? "—"} → {r.status_to ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{r.notes ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
