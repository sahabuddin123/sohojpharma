import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RotateCcw } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { listPurchaseReturns, purchaseReturnKpis } from "@/lib/api/purchase-returns.functions";

export const Route = createFileRoute("/purchases/returns/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Purchase Returns — SohojPharma" }] }),
  component: PurchaseReturnsPage,
});

const fmt = (n: number) => `৳ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

function PurchaseReturnsPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const kpisFn = useServerFn(purchaseReturnKpis);
  const listFn = useServerFn(listPurchaseReturns);

  const { data: kpis } = useQuery({
    queryKey: ["pr-kpis", tenantId], enabled: !!tenantId,
    queryFn: () => kpisFn({ data: { tenantId } }),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["pr-list", tenantId], enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenantId } }),
  });

  return (
    <AppShell variant="store" title="Purchase returns">
      <PageHeader
        title="Purchase returns"
        description="Track, approve, and post returns to suppliers. Stock, ledger and journal update automatically."
        actions={
          <Button asChild>
            <Link to="/purchases/returns/new"><Plus className="mr-1.5 h-4 w-4" /> New return</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { label: "Today's return value", value: fmt(kpis?.today ?? 0) },
          { label: "This month value", value: fmt(kpis?.month ?? 0) },
          { label: "Returned qty (month)", value: String(kpis?.qtyMonth ?? 0) },
          { label: "Return transactions", value: String(kpis?.totalCount ?? 0) },
        ].map((k) => (
          <Card key={k.label} className="shadow-card">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-xl font-bold">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    <RotateCcw className="inline h-5 w-5 mr-2 text-muted-foreground/60" />
                    No purchase returns yet
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const status = (r as { status?: string }).status ?? "approved";
                const variant: "default" | "secondary" | "destructive" | "outline" =
                  status === "approved" ? "default" : status === "rejected" ? "destructive" : status === "submitted" ? "secondary" : "outline";
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">
                      <Link to="/purchases/returns/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.return_no}</Link>
                    </TableCell>
                    <TableCell>{r.return_date}</TableCell>
                    <TableCell>{(r as { suppliers?: { name: string } | null }).suppliers?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant={variant}>{status}</Badge></TableCell>
                    <TableCell>{r.reason ? <Badge variant="outline">{r.reason}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(Number(r.total_value))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
