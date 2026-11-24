import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRightLeft, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/inventory/transfers")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Stock Transfers — SohojPharma" }, { name: "description", content: "Inter-warehouse stock transfers: request, approve, ship and receive." }] }),
  component: TransfersListPage,
});

type Row = {
  id: string; transfer_no: string; status: string;
  requested_at: string | null; approved_at: string | null; received_at: string | null;
  from_warehouse: { name: string } | null;
  to_warehouse: { name: string } | null;
};

const TAB_STATUSES: Record<string, string[]> = {
  pending: ["requested"],
  in_transit: ["in_transit", "approved"],
  received: ["received"],
  rejected: ["rejected", "cancelled"],
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    requested: "bg-yellow-100 text-yellow-800",
    approved: "bg-blue-100 text-blue-800",
    in_transit: "bg-blue-100 text-blue-800",
    received: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-800",
  };
  return <Badge className={map[s] ?? ""}>{s}</Badge>;
}

function TransfersListPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [tab, setTab] = useState<keyof typeof TAB_STATUSES>("pending");

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    enabled: !!tenantId,
    queryKey: ["stock-transfers", tenantId, tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select("id, transfer_no, status, requested_at, approved_at, received_at, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name)")
        .eq("tenant_id", tenantId)
        .in("status", TAB_STATUSES[tab] as never)
        .order("requested_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <AppShell variant="store" title="Transfers">
      <PageHeader title="Stock Transfers" description="Move stock between warehouses with full audit trail." actions={
        <Button asChild><Link to="/inventory/transfers/new"><Plus className="h-4 w-4 mr-1" /> New Transfer</Link></Button>
      } />

      <Tabs value={tab} onValueChange={(v) => setTab(v as keyof typeof TAB_STATUSES)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="in_transit">In Transit</TabsTrigger>
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer #</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No transfers.</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.transfer_no}</TableCell>
                      <TableCell>{r.from_warehouse?.name ?? "—"}</TableCell>
                      <TableCell className="flex items-center gap-1"><ArrowRightLeft className="h-3 w-3" /> {r.to_warehouse?.name ?? "—"}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.requested_at ? new Date(r.requested_at).toLocaleString() : "—"}</TableCell>
                      <TableCell><Link to="/inventory/transfers/$id" params={{ id: r.id }} className="text-primary underline text-sm">Open</Link></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
