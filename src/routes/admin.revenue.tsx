import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DollarSign, TrendingUp, Users, Clock, AlertTriangle, Activity } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/revenue")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Revenue Analytics — Super Admin" }] }),
  component: RevenuePage,
});

type Plan = {
  id: string;
  code: string;
  name: string;
  price_bdt: number | null;
  price_yearly_bdt: number | null;
};
type Sub = {
  id: string;
  tenant_id: string;
  plan_id: string | null;
  status: string | null;
  billing_cycle: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  created_at: string;
};
type Event = {
  id: string;
  event_type: string;
  amount: number | null;
  status: string | null;
  created_at: string;
};

const bdt = (n: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(n);

function RevenuePage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "revenue-analytics"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [plansRes, subsRes, eventsRes] = await Promise.all([
        supabase.from("plans").select("id,code,name,price_bdt,price_yearly_bdt"),
        supabase
          .from("subscriptions")
          .select(
            "id,tenant_id,plan_id,status,billing_cycle,current_period_end,trial_ends_at,created_at",
          ),
        supabase
          .from("billing_events")
          .select("id,event_type,amount,status,created_at")
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false }),
      ]);
      const plans = (plansRes.data ?? []) as unknown as Plan[];
      const subs = (subsRes.data ?? []) as unknown as Sub[];
      const events = (eventsRes.data ?? []) as unknown as Event[];

      const planMap = new Map(plans.map((p) => [p.id, p]));

      let mrr = 0;
      let activeCount = 0;
      let trialCount = 0;
      let pastDueCount = 0;
      let cancelledCount = 0;

      for (const s of subs) {
        if (s.status === "active") activeCount++;
        else if (s.status === "trial") trialCount++;
        else if (s.status === "past_due") pastDueCount++;
        else if (s.status === "cancelled" || s.status === "canceled") cancelledCount++;

        if (s.status === "active" || s.status === "past_due") {
          const p = s.plan_id ? planMap.get(s.plan_id) : null;
          if (!p) continue;
          if (s.billing_cycle === "yearly") {
            mrr += Number(p.price_yearly_bdt ?? 0) / 12;
          } else {
            mrr += Number(p.price_bdt ?? 0);
          }
        }
      }

      const arr = mrr * 12;
      const totalPaying = activeCount + pastDueCount;
      const denom = totalPaying + cancelledCount;
      const churn30 = denom > 0 ? (cancelledCount / denom) * 100 : 0;

      const failedPayments = events.filter(
        (e) => e.event_type === "invoice.payment_failed" || e.status === "failed",
      );
      const succeededRevenue = events
        .filter(
          (e) => e.event_type === "invoice.payment_succeeded" || e.status === "succeeded",
        )
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);

      return {
        mrr, arr, churn30,
        activeCount, trialCount, pastDueCount, cancelledCount,
        failedPayments, succeededRevenue, events,
      };
    },
  });

  return (
    <AppShell variant="admin">
      <PageHeader title={t("admin.revenue.title")} description={t("admin.revenue.desc")} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.revenue.mrr")} value={isLoading ? "—" : bdt(data?.mrr ?? 0)} icon={DollarSign} />
        <StatCard label={t("admin.revenue.arr")} value={isLoading ? "—" : bdt(data?.arr ?? 0)} icon={TrendingUp} />
        <StatCard label={t("admin.revenue.churn30")} value={isLoading ? "—" : `${(data?.churn30 ?? 0).toFixed(1)}%`} icon={Activity} tone="warning" />
        <StatCard label={t("admin.revenue.revenue30")} value={isLoading ? "—" : bdt(data?.succeededRevenue ?? 0)} icon={DollarSign} tone="success" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.revenue.activeSubs")} value={isLoading ? "—" : String(data?.activeCount ?? 0)} icon={Users} tone="success" />
        <StatCard label={t("admin.revenue.trialUsers")} value={isLoading ? "—" : String(data?.trialCount ?? 0)} icon={Clock} tone="secondary" />
        <StatCard label={t("admin.revenue.pastDue")} value={isLoading ? "—" : String(data?.pastDueCount ?? 0)} icon={AlertTriangle} tone="warning" />
        <StatCard label={t("admin.revenue.failed30")} value={isLoading ? "—" : String(data?.failedPayments.length ?? 0)} icon={AlertTriangle} tone="warning" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("admin.revenue.recentEvents")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("admin.revenue.loading")}</p>
          ) : (data?.events.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.revenue.noEvents")}</p>
          ) : (
            <div className="divide-y">
              {data!.events.slice(0, 20).map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{e.event_type}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {e.amount != null && (
                      <span className="font-mono">{bdt(Number(e.amount))}</span>
                    )}
                    <Badge
                      variant={
                        e.status === "succeeded" ? "default"
                          : e.status === "failed" ? "destructive"
                          : "secondary"
                      }
                    >
                      {e.status ?? "—"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
