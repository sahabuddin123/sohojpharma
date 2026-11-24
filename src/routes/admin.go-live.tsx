import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { runGoLiveCheck } from "@/lib/api/admin-ops.functions";
import { CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/admin/go-live")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Go-Live Checklist" }] }),
  component: GoLivePage,
});

function GoLivePage() {
  const { currentTenantId } = useAuth();
  const runFn = useServerFn(runGoLiveCheck);
  const q = useQuery({
    queryKey: ["go-live", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => runFn({ data: { tenant_id: currentTenantId! } }),
  });
  const checks: Record<string, any> = (q.data as any) ?? {};
  const entries = Object.entries(checks);
  const allOk = entries.length > 0 && entries.every(([, v]: any) => v.ok);

  return (
    <AppShell variant="store" title="Go-Live">
      <PageHeader
        title="Go-Live Checklist"
        description="Automatic readiness validation"
        actions={<Button onClick={() => q.refetch()} disabled={q.isFetching}>Re-run</Button>}
      />
      <Card className="mb-4">
        <CardContent className="pt-6 flex items-center justify-between">
          <div className="text-lg font-medium">Overall</div>
          <Badge variant={allOk ? "default" : "destructive"} className="text-base">
            {allOk ? "READY" : "NOT READY"}
          </Badge>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {entries.map(([k, v]: any) => (
          <Card key={k}>
            <CardContent className="flex items-center justify-between pt-6">
              <div className="flex items-center gap-2">
                {v.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                <div>
                  <div className="font-medium capitalize">{k}</div>
                  {v.count !== undefined && <div className="text-xs text-muted-foreground">count: {v.count}</div>}
                </div>
              </div>
              <Badge variant={v.ok ? "default" : "destructive"}>{v.ok ? "OK" : "FAIL"}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
