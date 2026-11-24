import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { listFeatureFlags, setFeatureFlag } from "@/lib/api/admin-ops.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/feature-flags")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Feature Flags" }] }),
  component: FlagsPage,
});

const LABELS: Record<string, string> = {
  clinical: "Clinical safety & prescriptions",
  accounting: "Double-entry accounting",
  warehouse: "Multi-warehouse",
  procurement: "Procurement & POs",
  bi: "Executive BI",
  mobile: "Mobile PWA",
};

function FlagsPage() {
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listFeatureFlags);
  const setFn = useServerFn(setFeatureFlag);
  const q = useQuery({
    queryKey: ["feature-flags", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => listFn({ data: { tenant_id: currentTenantId! } }),
  });
  const m = useMutation({
    mutationFn: (v: { flag_key: string; enabled: boolean }) =>
      setFn({ data: { tenant_id: currentTenantId!, ...v } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["feature-flags"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AppShell variant="store" title="Feature Flags">
      <PageHeader title="Feature Flags" description="Enable or disable modules for this tenant" />
      <Card>
        <CardHeader><CardTitle>Modules</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(q.data ?? []).map((f: any) => (
            <div key={f.flag_key} className="flex items-center justify-between border-b pb-3">
              <div>
                <div className="font-medium capitalize">{LABELS[f.flag_key] ?? f.flag_key}</div>
                <div className="text-xs text-muted-foreground font-mono">{f.flag_key}</div>
              </div>
              <Switch checked={f.enabled} onCheckedChange={(v) => m.mutate({ flag_key: f.flag_key, enabled: v })} />
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
