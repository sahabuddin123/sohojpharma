import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { listAuditEvents } from "@/lib/api/admin-ops.functions";

export const Route = createFileRoute("/admin/audit-center")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Audit Center" }] }),
  component: AuditCenter,
});

function AuditCenter() {
  const { currentTenantId } = useAuth();
  const fetchFn = useServerFn(listAuditEvents);
  const [module, setModule] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const q = useQuery({
    queryKey: ["audit-events", currentTenantId, module, from, to],
    enabled: !!currentTenantId,
    queryFn: () => fetchFn({ data: {
      tenant_id: currentTenantId!,
      module: module || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: 200,
    } }),
  });

  return (
    <AppShell variant="store" title="Audit Center">
      <PageHeader title="Audit Center" description="User, security, inventory, financial, and clinical activity" />
      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div><Label>Module / Table</Label><Input value={module} onChange={(e) => setModule(e.target.value)} placeholder="e.g. sales, products" /></div>
          <div><Label>From</Label><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader><CardTitle>Events ({q.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> :
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {(q.data ?? []).map((row: any) => (
                <div key={row.id} className="flex items-center justify-between border-b pb-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{row.action}</Badge>
                    <span className="font-mono text-xs">{row.entity_table}</span>
                    <span className="text-muted-foreground">{row.user_role}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</div>
                </div>
              ))}
              {q.data?.length === 0 && <div className="text-sm text-muted-foreground">No events</div>}
            </div>}
        </CardContent>
      </Card>
    </AppShell>
  );
}
