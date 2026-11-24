import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateFilter } from "@/components/reports/date-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";

export const Route = createFileRoute("/reports/analytics")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Advanced Analytics — SohojPharma" }] }),
  component: AnalyticsPage,
});

const data = Array.from({ length: 12 }, (_, i) => ({
  m: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i],
  sales: 12000 + Math.round(Math.random() * 8000),
  profit: 3000 + Math.round(Math.random() * 2500),
  purchase: 7000 + Math.round(Math.random() * 5000),
  expense: 1000 + Math.round(Math.random() * 800),
}));

const axis = { fontSize: 11 };
const tooltipStyle = { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 };

function AnalyticsPage() {
  const { t } = useTranslation();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  const comparisons = [
    { label: t("rpt.analytics.comparisons.todayVsYesterday"), a: "৳ 64,200", b: "৳ 58,400", delta: "+9.9%" },
    { label: t("rpt.analytics.comparisons.monthVsLastMonth"), a: "৳ 18,42,500", b: "৳ 16,84,000", delta: "+9.4%" },
    { label: t("rpt.analytics.comparisons.yearVsLastYear"), a: "৳ 1.84 Cr", b: "৳ 1.52 Cr", delta: "+21%" },
  ];

  return (
    <>
      <PageHeader
        title={t("rpt.analytics.title")}
        description={t("rpt.analytics.desc")}
        actions={<WarehouseFilter value={warehouseId} onChange={setWarehouseId} className="w-[220px]" />}
      />
      <DateFilter />
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        {comparisons.map((c) => (
          <Card key={c.label} className="shadow-card">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</p>
              <p className="mt-2 text-xl font-bold text-foreground">{c.a}</p>
              <p className="text-xs text-muted-foreground">{t("rpt.analytics.comparisons.vs")} {c.b} <span className="ml-1 font-semibold text-success">{c.delta}</span></p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("rpt.analytics.charts.salesTrend")}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="m" tick={axis} /><YAxis tick={axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="sales" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
          </AreaChart>
        </ChartCard>
        <ChartCard title={t("rpt.analytics.charts.profitTrend")}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="m" tick={axis} /><YAxis tick={axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="profit" stroke="var(--color-success)" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ChartCard>
        <ChartCard title={t("rpt.analytics.charts.purchaseTrend")}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="m" tick={axis} /><YAxis tick={axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="purchase" fill="var(--color-secondary)" radius={[6,6,0,0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title={t("rpt.analytics.charts.expenseTrend")}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="m" tick={axis} /><YAxis tick={axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="expense" fill="var(--color-warning)" radius={[6,6,0,0]} />
          </BarChart>
        </ChartCard>
      </div>
    </>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
