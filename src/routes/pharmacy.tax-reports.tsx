import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { vatReport } from "@/lib/api/pharmacy.functions";

export const Route = createFileRoute("/pharmacy/tax-reports")({
  head: () => ({ meta: [{ title: "Tax Reports — SohojPharma" }] }),
  errorComponent: (props) => <RouteErrorPanel error={props.error as Error} reset={props.reset} />,
  component: TaxReports,
});

function TaxReports() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const fn = useServerFn(vatReport);
  const { data } = useQuery({
    queryKey: ["pharmacy-vat-report", tenantId, from, to],
    queryFn: () => fn({ data: { tenantId, from, to } }),
    enabled: !!tenantId,
  });

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tax Reports</h1>
          <p className="text-sm text-muted-foreground">Sales VAT, purchase VAT and net liability.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Sales VAT (collected)" value={data?.salesVat ?? 0} subtitle={`${data?.salesCount ?? 0} sales`} accent="success" />
        <Stat label="Purchase VAT (paid)" value={data?.purchaseVat ?? 0} subtitle={`${data?.purchaseCount ?? 0} purchases`} />
        <Stat label="Net VAT liability" value={data?.liability ?? 0} accent={(data?.liability ?? 0) >= 0 ? "warning" : "success"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• Net liability = Sales VAT − Purchase VAT.</p>
          <p>• Positive = owed to authority; negative = recoverable.</p>
          <p>• VAT amounts use the line-level <code>vat</code> column on sales and purchases.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, subtitle, accent }: { label: string; value: number; subtitle?: string; accent?: "success" | "warning" }) {
  const cls = accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${cls}`}>৳ {Number(value).toFixed(2)}</div>
        {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}
