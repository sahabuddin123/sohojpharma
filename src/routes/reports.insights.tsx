import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, AlertTriangle, Lightbulb, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/reports/insights")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "AI Insights — SohojPharma" }] }),
  component: InsightsPage,
});

type Insight = { icon: LucideIcon; tone: "success" | "warning" | "destructive" | "primary"; text: string; tag: string };

const toneCls = {
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  primary: "bg-primary/10 text-primary border-primary/30",
};

function InsightsPage() {
  const { t } = useTranslation();

  const alerts: Insight[] = [
    { icon: AlertTriangle, tone: "destructive", text: t("rpt.insights.alerts.nearExpiry"), tag: t("rpt.insights.tags.expiry") },
    { icon: TrendingDown, tone: "warning", text: t("rpt.insights.alerts.invDecreased"), tag: t("rpt.insights.tags.stock") },
    { icon: AlertTriangle, tone: "warning", text: t("rpt.insights.alerts.dueIncreased"), tag: t("rpt.insights.tags.due") },
  ];
  const wins: Insight[] = [
    { icon: TrendingUp, tone: "success", text: t("rpt.insights.wins.salesUp"), tag: t("rpt.insights.tags.sales") },
    { icon: TrendingUp, tone: "success", text: t("rpt.insights.wins.marginUp"), tag: t("rpt.insights.tags.profit") },
  ];
  const recs: Insight[] = [
    { icon: Lightbulb, tone: "primary", text: t("rpt.insights.recs.reorderParacetamol"), tag: t("rpt.insights.tags.reorder") },
    { icon: Lightbulb, tone: "primary", text: t("rpt.insights.recs.promoVitC"), tag: t("rpt.insights.tags.promo") },
    { icon: Lightbulb, tone: "primary", text: t("rpt.insights.recs.collectDue"), tag: t("rpt.insights.tags.collection") },
  ];

  return (
    <>
      <PageHeader title={t("rpt.insights.title")} description={t("rpt.insights.desc")} />
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5 p-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <p className="text-sm text-foreground">{t("rpt.insights.updatedNote")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <InsightSection title={t("rpt.insights.sections.alerts")} items={alerts} />
        <InsightSection title={t("rpt.insights.sections.wins")} items={wins} />
        <InsightSection title={t("rpt.insights.sections.recommendations")} items={recs} />
      </div>
    </>
  );
}

function InsightSection({ title, items }: { title: string; items: Insight[] }) {
  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div key={i} className={`flex gap-3 rounded-lg border p-3 ${toneCls[it.tone]}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <Badge variant="outline" className="mb-1 text-[10px]">{it.tag}</Badge>
                <p className="text-sm text-foreground">{it.text}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
