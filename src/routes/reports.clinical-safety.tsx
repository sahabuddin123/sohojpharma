import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Pill, AlertTriangle, ShieldCheck, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { getClinicalSafetyReport } from "@/lib/api/clinical-safety.functions";

export const Route = createFileRoute("/reports/clinical-safety")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Clinical Safety Report — SohojPharma" }] }),
  component: ClinicalSafetyReport,
});

function ClinicalSafetyReport() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const [days, setDays] = useState(30);
  const fn = useServerFn(getClinicalSafetyReport);

  const q = useQuery({
    queryKey: ["clinical-safety-report", currentTenantId, days],
    enabled: !!currentTenantId,
    queryFn: () => fn({ data: { tenantId: currentTenantId!, days } }),
  });

  const k = q.data?.kpis;

  return (
    <AppShell variant="store" title="Clinical Safety">
      <PageHeader
        title={t("clinical.report.title", "Clinical Safety Report")}
        description={t("clinical.report.desc", "Interaction, allergy and dosage warnings across prescriptions")}
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t("clinical.kpi.interactions", "Interaction alerts")} value={String(k?.interactionAlerts ?? 0)} icon={Pill} />
        <StatCard label={t("clinical.kpi.allergies", "Allergy alerts")} value={String(k?.allergyAlerts ?? 0)} icon={AlertTriangle} />
        <StatCard label={t("clinical.kpi.dosage", "Dosage warnings")} value={String(k?.dosageAlerts ?? 0)} icon={Activity} />
        <StatCard label={t("clinical.kpi.acked", "Acknowledged")} value={String(k?.acknowledged ?? 0)} icon={ShieldCheck} />
        <StatCard label={t("clinical.kpi.highRisk", "High-risk Rx")} value={String(k?.highRiskRx ?? 0)} icon={ShieldAlert} />
      </div>

      <Card className="mt-6 shadow-card">
        <CardHeader><CardTitle className="text-base">{t("clinical.report.recent", "Recent safety events")}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Prescription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.events ?? []).map((e, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at!).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{e.warning_type}</TableCell>
                    <TableCell>
                      <Badge variant={["major", "contraindicated", "critical"].includes((e.severity ?? "").toLowerCase()) ? "destructive" : "secondary"} className="capitalize">
                        {e.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{e.action_taken}</TableCell>
                    <TableCell>
                      {e.prescription_id && (
                        <Link to="/prescriptions/$id" params={{ id: e.prescription_id }} className="text-xs text-primary underline">Open</Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!q.isLoading && (q.data?.events ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No safety events recorded.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
