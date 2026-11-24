import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { listBackupRuns } from "@/lib/api/admin-ops.functions";

export const Route = createFileRoute("/admin/backup-monitor")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Backup Monitor" }] }),
  component: BackupMonitor,
});

function BackupMonitor() {
  const { currentTenantId } = useAuth();
  const fetchFn = useServerFn(listBackupRuns);
  const q = useQuery({
    queryKey: ["backups", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => fetchFn({ data: { tenant_id: currentTenantId! } }),
  });
  const runs = q.data ?? [];
  const last = runs.find((r: any) => r.status === "success");
  const ageHrs = last?.finished_at ? Math.floor((Date.now() - new Date(last.finished_at).getTime()) / 3_600_000) : null;
  const stale = ageHrs === null || ageHrs > 24;

  return (
    <AppShell variant="store" title="Backup Monitor">
      <PageHeader title="Backup Monitor" description="Database backup history and freshness" />
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card><CardHeader><CardTitle className="text-sm">Last Backup</CardTitle></CardHeader>
          <CardContent>{last?.finished_at ? new Date(String(last.finished_at)).toLocaleString() : "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Age</CardTitle></CardHeader>
          <CardContent><Badge variant={stale ? "destructive" : "default"}>{ageHrs ?? "—"} h</Badge></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
          <CardContent>{stale ? <Badge variant="destructive">Backup older than 24h</Badge> : <Badge>OK</Badge>}</CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {runs.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between text-sm border-b pb-2">
              <span>{r.kind}</span>
              <Badge variant={r.status === "success" ? "default" : "destructive"}>{r.status}</Badge>
              <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
            </div>
          ))}
          {runs.length === 0 && <div className="text-sm text-muted-foreground">No backup runs recorded yet.</div>}
        </CardContent>
      </Card>
    </AppShell>
  );
}
