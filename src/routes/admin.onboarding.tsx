import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { getOnboarding, setOnboardingStep } from "@/lib/api/admin-ops.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/onboarding")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Onboarding Wizard" }] }),
  component: OnboardingPage,
});

const STEPS: Array<{ key: any; label: string; desc: string }> = [
  { key: "step_company", label: "Company", desc: "Add company name, address, branding" },
  { key: "step_branches", label: "Branches", desc: "Create your branches" },
  { key: "step_warehouses", label: "Warehouses", desc: "Set up warehouses" },
  { key: "step_suppliers", label: "Suppliers", desc: "Add at least one supplier" },
  { key: "step_products", label: "Products", desc: "Import or add products" },
  { key: "step_opening_stock", label: "Opening Stock", desc: "Set opening stock balances" },
];

function OnboardingPage() {
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getOnboarding);
  const setFn = useServerFn(setOnboardingStep);
  const q = useQuery({
    queryKey: ["onboarding", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getFn({ data: { tenant_id: currentTenantId! } }),
  });
  const m = useMutation({
    mutationFn: (v: { step: any; value: boolean }) =>
      setFn({ data: { tenant_id: currentTenantId!, ...v } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["onboarding"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const data: any = q.data ?? {};
  return (
    <AppShell variant="store" title="Onboarding">
      <PageHeader title="Tenant Onboarding" description={`Setup completion: ${data.completion_pct ?? 0}%`} />
      <Card className="mb-4">
        <CardContent className="pt-6"><Progress value={data.completion_pct ?? 0} /></CardContent>
      </Card>
      <div className="grid gap-3">
        {STEPS.map((s, i) => (
          <Card key={s.key}>
            <CardContent className="flex items-center justify-between pt-6">
              <div className="flex items-center gap-3">
                <Checkbox checked={!!data[s.key]} onCheckedChange={(v) => m.mutate({ step: s.key, value: !!v })} />
                <div>
                  <div className="font-medium">{i + 1}. {s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
