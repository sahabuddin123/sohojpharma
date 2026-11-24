import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, CartesianGrid,
} from "recharts";
import {
  ShoppingCart, Package, TrendingUp, Wallet, Users, Truck, Boxes, CalendarX,
  AlertTriangle, PackageX, Loader2, Banknote,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import {
  getBranchDashboard, type BranchDashboardData,
} from "@/lib/api/branch-dashboard.functions";

export const Route = createFileRoute("/branch-dashboard")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Branch Dashboard — SohojPharma" }] }),
  component: BranchDashboardPage,
});

const bdt = (n: number) =>
  "৳ " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const num = (n: number) => new Intl.NumberFormat("en-IN").format(n || 0);

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-foreground)",
};

function BranchDashboardPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branchId, selected } = useActiveBranch();
  const fetchDashboard = useServerFn(getBranchDashboard);

  const enabled = !!currentTenantId && !!branchId;
  const { data, isLoading, error } = useQuery<BranchDashboardData>({
    enabled,
    queryKey: ["branch-dashboard", currentTenantId, branchId],
    queryFn: () => fetchDashboard({ data: { tenant_id: currentTenantId!, branch_id: branchId! } }),
    staleTime: 60_000,
  });

  return (
    <AppShell variant="store" title={t("branchDashboard.title", "Branch Dashboard")}>
      <PageHeader
        title={t("branchDashboard.title", "Branch Dashboard")}
        description={selected
          ? t("branchDashboard.subtitleForBranch", { defaultValue: "Live metrics for {{name}}", name: selected.name })
          : t("branchDashboard.selectBranch", "Select a branch to view metrics")}
      />

      {!enabled && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          {t("branchDashboard.noBranch", "Pick a branch from the switcher above to load metrics.")}
        </CardContent></Card>
      )}

      {enabled && isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("common.loading", "Loading…")}
        </div>
      )}

      {enabled && error && (
        <Card><CardContent className="p-6 text-destructive">{(error as Error).message}</CardContent></Card>
      )}

      {enabled && data && (
        <div className="space-y-6">
          {/* KPI grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("branchDashboard.kpi.todaySales", "Today's Sales")} value={bdt(data.kpi.todaySales)} icon={ShoppingCart} tone="primary" />
            <StatCard label={t("branchDashboard.kpi.todayPurchase", "Today's Purchases")} value={bdt(data.kpi.todayPurchase)} icon={Truck} tone="secondary" />
            <StatCard label={t("branchDashboard.kpi.grossProfit", "Gross Profit")} value={bdt(data.kpi.grossProfit)} icon={TrendingUp} tone="success" />
            <StatCard label={t("branchDashboard.kpi.netProfit", "Net Profit")} value={bdt(data.kpi.netProfit)} icon={TrendingUp} tone="success" />
            <StatCard label={t("branchDashboard.kpi.cashCollection", "Cash Collection")} value={bdt(data.kpi.cashCollection)} icon={Banknote} tone="success" />
            <StatCard label={t("branchDashboard.kpi.dueCollection", "Due Collection")} value={bdt(data.kpi.dueCollection)} icon={Wallet} tone="warning" />
            <StatCard label={t("branchDashboard.kpi.customers", "Total Customers")} value={num(data.kpi.totalCustomers)} icon={Users} tone="primary" />
            <StatCard label={t("branchDashboard.kpi.suppliers", "Total Suppliers")} value={num(data.kpi.totalSuppliers)} icon={Truck} tone="primary" />
            <StatCard label={t("branchDashboard.kpi.inventoryValue", "Inventory Value")} value={bdt(data.kpi.inventoryValue)} icon={Boxes} tone="primary" />
            <StatCard label={t("branchDashboard.kpi.expiring30", "Expiring (30d)")} value={num(data.kpi.expiring30)} icon={CalendarX} tone="warning" />
            <StatCard label={t("branchDashboard.kpi.lowStock", "Low Stock")} value={num(data.kpi.lowStock)} icon={AlertTriangle} tone="warning" />
            <StatCard label={t("branchDashboard.kpi.outOfStock", "Out of Stock")} value={num(data.kpi.outOfStock)} icon={PackageX} tone="warning" />
          </div>

          {/* Trends */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{t("branchDashboard.trend7", "Sales — Last 7 Days")}</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend7}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="sales" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("branchDashboard.trend30", "Sales — Last 30 Days")}</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend30}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="sales" fill="var(--color-primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top tables */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankList title={t("branchDashboard.topMedicines", "Top Medicines")} rows={data.topMedicines.map(r => ({ name: r.name, value: bdt(r.revenue), sub: `${num(r.qty)} ${t("common.units", "units")}` }))} />
            <RankList title={t("branchDashboard.topCategories", "Top Categories")} rows={data.topCategories.map(r => ({ name: r.name, value: bdt(r.revenue) }))} />
            <RankList title={t("branchDashboard.topCustomers", "Top Customers")} rows={data.topCustomers.map(r => ({ name: r.name, value: bdt(r.revenue) }))} />
            <RankList title={t("branchDashboard.topCashiers", "Top Cashiers")} rows={data.topCashiers.map(r => ({ name: r.name, value: bdt(r.revenue), sub: `${num(r.invoices)} ${t("branchDashboard.invoices", "invoices")}` }))} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function RankList({ title, rows }: { title: string; rows: { name: string; value: string; sub?: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i + 1}. {r.name}</p>
                  {r.sub && <p className="text-xs text-muted-foreground">{r.sub}</p>}
                </div>
                <p className="ml-3 font-semibold tabular-nums">{r.value}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
