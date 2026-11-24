import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { getSystemHealth } from "@/lib/api/admin-ops.functions";

export const Route = createFileRoute("/admin/system-health")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "System Health" }] }),
  component: SystemHealth,
});

const statusColor = (s: string) =>
  s === "critical" ? "destructive" : s === "warning" ? "secondary" : "default";

function SystemHealth() {
  const { currentTenantId } = useAuth();
  const fetchFn = useServerFn(getSystemHealth);
  const q = useQuery({
    queryKey: ["system-health", currentTenantId],
    enabled: !!currentTenantId,
    refetchInterval: 30_000,
    queryFn: () => fetchFn({ data: { tenant_id: currentTenantId! } }),
  });
  const health: Record<string, any> = (q.data as any) ?? {};

  return (
    <AppShell variant="store" title="System Health">
      <PageHeader title="System Health Center" description="Live snapshot of database, sync, notifications, and recent errors" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(health).map(([k, v]: [string, any]) => (
          <Card key={k}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="capitalize text-base">{k.replace(/_/g, " ")}</CardTitle>
              <Badge variant={statusColor(v.status) as any}>{v.status}</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground font-mono">
                {Object.entries(v).filter(([key]) => key !== "status").map(([key, val]) => (
                  <div key={key}>{key}: {String(val)}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
