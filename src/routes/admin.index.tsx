import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Building2, DollarSign, Users, Package, ShoppingCart, Truck,
  CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAdminOverviewStats } from "@/lib/api/admin-overview.functions";

export const Route = createFileRoute("/admin/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Super Admin — SohojPharma" },
      { name: "description", content: "SohojPharma Super Admin control center — pharmacies, subscriptions, payments and platform health." },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { t } = useTranslation();
  const fetchStats = useServerFn(getAdminOverviewStats);
  const { data: stats, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => fetchStats(),
  });

  const recent = (stats?.tenants ?? [])
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  const fmt = (n: number | undefined) =>
    isLoading && n === undefined ? "…" : (n ?? 0).toLocaleString("en-IN");

  return (
    <AppShell variant="admin" title={t("app.portalAdmin")}>
      <PageHeader title={t("admin.overview.title")} description={t("admin.overview.desc")} />

      {isError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : t("common.error", "Failed to load statistics")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.overview.totalPharmacies")} value={fmt(stats?.tenants.length)} icon={Building2} tone="primary" />
        <StatCard label={t("common.active")} value={fmt(stats?.active)} icon={CheckCircle2} tone="success" />
        <StatCard label={t("admin.overview.trial")} value={fmt(stats?.trial)} icon={Clock} tone="warning" />
        <StatCard label={t("admin.overview.expired")} value={fmt(stats?.expired)} icon={AlertCircle} tone="secondary" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={t("admin.overview.totalRevenue")}
          value={isLoading && !stats ? "…" : `৳ ${Math.round(stats?.totalRevenue ?? 0).toLocaleString("en-IN")}`}
          icon={DollarSign}
          tone="success"
        />
        <StatCard label={t("admin.overview.totalUsers")} value={fmt(stats?.userCount)} icon={Users} tone="secondary" />
        <StatCard label={t("admin.overview.totalProducts")} value={fmt(stats?.productCount)} icon={Package} tone="primary" />
        <StatCard label={t("admin.overview.totalSales")} value={fmt(stats?.salesCount)} icon={ShoppingCart} tone="success" />
        <StatCard label={t("admin.overview.totalPurchases")} value={fmt(stats?.purchaseCount)} icon={Truck} tone="warning" />
      </div>

      <div className="mt-6">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> {t("admin.overview.recent")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {isLoading && !stats ? (
              <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin.overview.noRecent")}</p>
            ) : recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {(r.name ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                </div>
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{r.plan ?? "free"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
