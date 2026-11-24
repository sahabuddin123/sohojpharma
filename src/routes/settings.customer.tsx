import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { getCustomerSettings, saveCustomerSettings, type CustomerSettings } from "@/lib/api/customer-settings.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/settings/customer")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Settings — SohojPharma" }] }),
  component: Page,
});

function Page() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const getFn = useServerFn(getCustomerSettings);
  const saveFn = useServerFn(saveCustomerSettings);

  const q = useQuery({
    queryKey: ["customer-settings", tenantId],
    queryFn: () => getFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  const [s, setS] = useState<CustomerSettings | null>(null);
  useEffect(() => { if (q.data && !s) setS(q.data); }, [q.data, s]);

  const mut = useMutation({
    mutationFn: () => saveFn({ data: { tenantId, settings: s! } }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["customer-settings", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!s)
    return (
      <AppShell variant="store">
        <PageHeader title="Customer Settings" />
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </AppShell>
    );

  const upd = <K extends keyof CustomerSettings>(k: K, v: CustomerSettings[K]) =>
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));

  return (
    <AppShell variant="store">
      <PageHeader
        title="Customer Settings"
        description="Loyalty rules, credit control and customer communication toggles"
        actions={
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Loyalty Program</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row label="Enable loyalty"><Switch checked={s.loyalty_enabled} onCheckedChange={(v) => upd("loyalty_enabled", v)} /></Row>
            <NumRow label="Points per ৳1" value={s.points_per_taka} onChange={(v) => upd("points_per_taka", v)} step={0.1} />
            <NumRow label="Minimum purchase (৳)" value={s.minimum_purchase} onChange={(v) => upd("minimum_purchase", v)} />
            <NumRow label="Max points per sale" value={s.maximum_points_per_sale} onChange={(v) => upd("maximum_points_per_sale", v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Credit Control</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row label="Enforce credit limit"><Switch checked={s.credit_control_enabled} onCheckedChange={(v) => upd("credit_control_enabled", v)} /></Row>
            <NumRow label="Warning threshold (%)" value={s.credit_warn_pct} onChange={(v) => upd("credit_warn_pct", v)} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Customer Communication</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Row label="Birthday wishes"><Switch checked={s.birthday_wishes_enabled} onCheckedChange={(v) => upd("birthday_wishes_enabled", v)} /></Row>
            <Row label="Anniversary wishes"><Switch checked={s.anniversary_wishes_enabled} onCheckedChange={(v) => upd("anniversary_wishes_enabled", v)} /></Row>
            <Row label="Due reminders"><Switch checked={s.due_reminders_enabled} onCheckedChange={(v) => upd("due_reminders_enabled", v)} /></Row>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between"><Label className="font-normal">{label}</Label>{children}</div>;
}
function NumRow({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="grid grid-cols-2 items-center gap-3">
      <Label className="font-normal">{label}</Label>
      <Input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
