import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorPanel } from "@/components/route-error";
import { Activity, AlertTriangle, Pill, Repeat, ShieldAlert, Stethoscope } from "lucide-react";
import { getClinicalDashboard } from "@/lib/api/clinical.functions";

export const Route = createFileRoute("/admin/clinical-dashboard")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Clinical Dashboard — SohojPharma Admin" }] }),
  component: ClinicalDashboardPage,
});

function ClinicalDashboardPage() {
  const { t } = useTranslation();
  const fn = useServerFn(getClinicalDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["clinical", "dashboard"],
    queryFn: () => fn({ data: {} as never }),
    staleTime: 60_000,
  });

  return (
    <AppShell variant="admin">
      <PageHeader title={t("clinicalDashboard.title", "Clinical Dashboard")} description={t("clinicalDashboard.subtitle", "Global clinical intelligence metrics")} />
      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Stat icon={Pill} label={t("clinicalDashboard.totalMedicines", "Total Medicines")} value={data.total_medicines} />
            <Stat icon={Stethoscope} label={t("clinicalDashboard.prescription", "Prescription")} value={data.prescription_medicines} />
            <Stat icon={Pill} label={t("clinicalDashboard.otc", "OTC")} value={data.otc_medicines} />
            <Stat icon={ShieldAlert} label={t("clinicalDashboard.pregnancyRisk", "Pregnancy Risk")} value={data.pregnancy_risk_medicines} accent="destructive" />
            <Stat icon={Repeat} label={t("clinicalDashboard.alternatives", "Alternatives")} value={data.total_alternatives} />
            <Stat icon={AlertTriangle} label={t("clinicalDashboard.interactions", "Interactions")} value={data.total_interactions} />
            <Stat icon={ShieldAlert} label={t("clinicalDashboard.contraindications", "Contraindications")} value={data.total_contraindications} />
            <Stat icon={Activity} label={t("clinicalDashboard.coverage", "Clinical Coverage %")} value={`${data.clinical_coverage_pct ?? 0}%`} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ListCard title={t("clinicalDashboard.topInteracted", "Most Interacted Medicines")}
              rows={data.top_interacted} valueKey="interaction_count" />
            <ListCard title={t("clinicalDashboard.topAlternatives", "Top Alternatives")}
              rows={data.top_alternatives} valueKey="alt_count" />
          </div>

          <Card className="mt-4">
            <CardHeader><CardTitle>{t("clinicalDashboard.highRisk", "High Risk Medicines")}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>{t("common.medicine", "Medicine")}</TableHead><TableHead>{t("clinicalDashboard.pregnancyCat", "Pregnancy")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(data.high_risk ?? []).map((r) => (
                    <TableRow key={r.id}><TableCell>{r.brand_name}</TableCell><TableCell><Badge variant="destructive">{r.pregnancy_category ?? "—"}</Badge></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; accent?: "destructive" }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-8 w-8 ${accent === "destructive" ? "text-destructive" : "text-muted-foreground"}`} />
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ListCard({ title, rows, valueKey }: { title: string; rows: Array<Record<string, unknown>>; valueKey: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {(rows ?? []).map((r) => (
              <TableRow key={String(r.id)}>
                <TableCell>{String(r.brand_name)}</TableCell>
                <TableCell className="text-right font-mono">{String(r[valueKey] ?? 0)}</TableCell>
              </TableRow>
            ))}
            {(!rows || rows.length === 0) && <TableRow><TableCell className="text-muted-foreground text-sm">No data</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
