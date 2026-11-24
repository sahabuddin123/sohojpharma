import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { getImportDashboard } from "@/lib/api/import/import-v2.functions";

export const Route = createFileRoute("/inventory/import-dashboard")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Import Dashboard — SohojPharma" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { currentTenantId } = useAuth();
  const fn = useServerFn(getImportDashboard);
  const q = useQuery({
    queryKey: ["import-dashboard-v2", currentTenantId],
    queryFn: () => fn({ data: { tenant_id: currentTenantId! } }),
    enabled: !!currentTenantId,
  });
  const d = q.data;

  return (
    <AppShell variant="store">
      <PageHeader
        title="Import Dashboard"
        description="Health of the medicine import pipeline."
        actions={<Button asChild><Link to="/inventory/import-v2">New import</Link></Button>}
      />
      <div className="px-4 lg:px-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Running" value={d?.running ?? 0} />
          <Stat label="Completed" value={d?.completed ?? 0} />
          <Stat label="Failed" value={d?.failed ?? 0} />
          <Stat label="Avg rows/sec" value={d?.avg_rows_per_sec ?? 0} />
          <Stat label="Total imported" value={d?.total_imported ?? 0} />
          <Stat label="Total failed" value={d?.total_failed ?? 0} />
        </div>
        <Card>
          <CardHeader><CardTitle>Recent imports</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Imported</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(d?.recent ?? []).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={r.status === "completed" ? "secondary" : r.status === "failed" ? "destructive" : "default"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">{r.total_rows}</TableCell>
                    <TableCell className="text-right">{r.imported_rows}</TableCell>
                    <TableCell className="text-right">{r.failed_rows}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
