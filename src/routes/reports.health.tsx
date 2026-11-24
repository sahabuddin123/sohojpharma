import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/reports/health")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Business Health — SohojPharma" }] }),
  component: HealthPage,
});

function HealthPage() {
  const { t } = useTranslation();

  const factors = [
    { label: t("rpt.health.factor.salesGrowth"), score: 82 },
    { label: t("rpt.health.factor.profitGrowth"), score: 76 },
    { label: t("rpt.health.factor.stockHealth"), score: 88 },
    { label: t("rpt.health.factor.customerDue"), score: 64 },
    { label: t("rpt.health.factor.supplierDue"), score: 70 },
    { label: t("rpt.health.factor.expiredRatio"), score: 58 },
  ];

  function tier(s: number) {
    if (s >= 80) return { label: t("rpt.health.tier.excellent"), color: "bg-success text-success-foreground" };
    if (s >= 65) return { label: t("rpt.health.tier.good"), color: "bg-primary text-primary-foreground" };
    if (s >= 50) return { label: t("rpt.health.tier.average"), color: "bg-warning text-warning-foreground" };
    return { label: t("rpt.health.tier.critical"), color: "bg-destructive text-destructive-foreground" };
  }

  const overall = Math.round(factors.reduce((s, f) => s + f.score, 0) / factors.length);
  const tl = tier(overall);

  return (
    <>
      <PageHeader title={t("rpt.health.title")} description={t("rpt.health.desc")} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-1 bg-gradient-to-br from-primary/10 to-secondary/10">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("rpt.health.healthScore")}</p>
            <p className="my-3 text-6xl font-bold text-foreground">{overall}</p>
            <Badge className={tl.color}>{tl.label}</Badge>
          </CardContent>
        </Card>
        <Card className="shadow-card lg:col-span-2">
          <CardHeader><CardTitle className="text-base">{t("rpt.health.factors")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {factors.map((f) => (
              <div key={f.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-foreground">{f.label}</span>
                  <span className="font-semibold text-muted-foreground">{f.score}/100</span>
                </div>
                <Progress value={f.score} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
