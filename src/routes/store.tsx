import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RouteErrorPanel } from "@/components/route-error";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  ShoppingCart, Package, AlertTriangle, Users, Plus, TrendingUp, Wallet, Building2,
  CalendarX, Loader2, Banknote, ArrowUpRight, ArrowRight,
  ShieldAlert, Truck, ClipboardList, FileCheck2, PackageSearch, UserPlus,
  Boxes, RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { getStoreDashboard, type StoreDashboardData } from "@/lib/api/dashboard.functions";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { StoreSetupBanner } from "@/components/store/store-setup-banner";

export const Route = createFileRoute("/store")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Owner Dashboard — SohojPharma" },
      { name: "description", content: "Pharmacy owner dashboard — sales, profit, dues, inventory and alerts at a glance." },
    ],
  }),
  component: StoreDashboard,
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

const PIE_COLORS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-destructive)",
  "var(--color-accent)",
  "var(--color-muted-foreground)",
  "var(--color-secondary-foreground)",
  "var(--color-ring)",
];

function EmptyState({ label }: { label?: string }) {
  const { t } = useTranslation();
  const text = label ?? t("dashboard.noData");
  return (
    <div className="grid h-full min-h-[120px] place-items-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function KpiTile({
  label, value, sub, icon: Icon, tone = "primary", to,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: typeof Wallet;
  tone?: "primary" | "success" | "warning" | "destructive" | "muted";
  to?: string;
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  } as const;
  const body = (
    <Card className="group h-full overflow-hidden border-border/60 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated">
      <CardContent className="flex h-full flex-col gap-2 p-3 sm:gap-3 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-[10px] font-medium uppercase leading-tight tracking-wider text-muted-foreground sm:text-[11px]">{label}</span>
          <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl ${toneMap[tone]}`}>
            <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-foreground sm:text-2xl">{value}</p>
          {sub != null && <p className="mt-1 truncate text-[10px] text-muted-foreground sm:text-xs">{sub}</p>}
        </div>

      </CardContent>
    </Card>
  );
  return to ? <Link to={to as never} className="block h-full">{body}</Link> : body;
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">{title}</h2>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function ChartCard({ title, hint, children, height = 240 }: { title: string; hint?: string; children: React.ReactNode; height?: number }) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height }}>{children}</div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: typeof Plus; label: string }) {
  return (
    <Link
      to={to as never}
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card"
    >
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-medium leading-tight">{label}</span>
    </Link>
  );
}

function AlertChip({
  label, count, tone, to, icon: Icon,
}: { label: string; count: number; tone: "destructive" | "warning" | "primary" | "muted"; to?: string; icon: typeof AlertTriangle }) {
  const toneMap = {
    destructive: "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10",
    warning: "border-warning/30 bg-warning/5 text-warning hover:bg-warning/10",
    primary: "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
    muted: "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50",
  };
  const inner = (
    <div className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${toneMap[tone]}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs font-medium">{label}</span>
      </div>
      <span className="shrink-0 text-base font-bold tabular-nums">{num(count)}</span>
    </div>
  );
  return to ? <Link to={to as never}>{inner}</Link> : inner;
}

function PeriodCard({
  label, stat,
}: { label: string; stat: StoreDashboardData["sales"]["today"] }) {
  const empty = stat.amount === 0 && stat.invoices === 0;
  return (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {empty ? (
          <p className="mt-2 text-sm text-muted-foreground">No data available</p>
        ) : (
          <>
            <p className="mt-1 text-xl font-bold text-foreground sm:text-2xl">{bdt(stat.amount)}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{num(stat.invoices)} invoices</span>
              <span>{num(stat.customers)} customers</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StoreDashboard() {
  const { currentTenantId, setCurrentTenantId, memberships, adminTenants, isAppAdmin, user } = useAuth();
  const { t } = useTranslation();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenantId) {
      const pool = isAppAdmin ? adminTenants : memberships;
      if (pool.length > 0 && pool[0]?.tenant_id) {
        setCurrentTenantId(pool[0].tenant_id);
      }
    }
  }, [currentTenantId, memberships, adminTenants, isAppAdmin, setCurrentTenantId]);
  const fetchDashboard = useServerFn(getStoreDashboard);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["store-dashboard", currentTenantId, warehouseId ?? "all"],
    enabled: !!currentTenantId,
    queryFn: () => fetchDashboard({ data: { tenant_id: currentTenantId!, warehouse_id: warehouseId } }),
    staleTime: 60_000,
  });

  if (!currentTenantId) {
    return (
      <AppShell variant="store" title={t("nav.dashboard")}>
        <PageHeader title={t("dashboard.noPharmacy")} description={t("dashboard.pickPharmacy")} />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell variant="store" title={t("nav.dashboard")}>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell variant="store" title={t("nav.dashboard")}>
        <Card className="border-destructive/40">
          <CardHeader><CardTitle className="text-base text-destructive">Failed to load dashboard</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
            <Button size="sm" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const k = data.kpi;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t("dashboard.greetingMorning");
    if (h < 18) return t("dashboard.greetingAfternoon");
    return t("dashboard.greetingEvening");
  })();
  const displayName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name
    ?? user?.email?.split("@")[0]
    ?? t("dashboard.fallbackOwner");

  return (
    <AppShell variant="store" title={t("nav.dashboard")}>
      <div className="space-y-8 pb-10">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {data.tenantName ?? t("dashboard.fallbackTenant")}
            </p>
            <h1 className="mt-1 truncate text-lg font-bold tracking-tight sm:text-2xl">
              {greeting}, {displayName}
            </h1>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
            <WarehouseFilter value={warehouseId} onChange={setWarehouseId} className="min-w-0 flex-1 sm:w-[200px] sm:flex-none" />
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">{t("dashboard.refresh")}</span>
            </Button>
          </div>
        </header>


        <StoreSetupBanner />
        <OnboardingChecklist />

        {/* SECTION 1 — Owner Overview */}
        <section>
          <SectionTitle title={t("dashboard.sectionOwnerOverview")} hint={t("dashboard.sectionOwnerOverviewHint")} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiTile label={t("dashboard.kpiTodaySales")} value={bdt(k.todaySales)} icon={ShoppingCart} tone="primary" to="/sales" />
            <KpiTile label={t("dashboard.kpiTodayProfit")} value={bdt(k.todayProfit)} icon={TrendingUp} tone="success" />
            <KpiTile label={t("dashboard.kpiCustomerDue")} value={bdt(k.customerDueTotal)} sub={t("dashboard.subCustomers", { count: data.customerDueTop.length })} icon={Wallet} tone="warning" to="/customers" />
            <KpiTile label={t("dashboard.kpiSupplierDue")} value={bdt(k.supplierDueTotal)} sub={t("dashboard.subSuppliers", { count: data.supplierDueTop.length })} icon={Building2} tone="warning" to="/suppliers" />
            <KpiTile label={t("dashboard.kpiLowStock")} value={num(k.lowStock)} sub={t("dashboard.subBelowReorder")} icon={Package} tone={k.lowStock > 0 ? "destructive" : "muted"} to="/inventory" />
            <KpiTile label={t("dashboard.kpiExpired")} value={num(k.expired)} sub={t("dashboard.subPastExpiry")} icon={CalendarX} tone={k.expired > 0 ? "destructive" : "muted"} to="/inventory" />
          </div>
        </section>

        {/* SECTION 2 — Sales overview */}
        <section>
          <SectionTitle title={t("dashboard.sectionSalesOverview")} hint={t("dashboard.sectionSalesOverviewHint")} action={<Link to="/sales" className="inline-flex items-center text-xs font-medium text-primary hover:underline">{t("dashboard.viewAll")} <ArrowRight className="ml-1 h-3 w-3" /></Link>} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PeriodCard label={t("dashboard.periodToday")} stat={data.sales.today} />
            <PeriodCard label={t("dashboard.periodYesterday")} stat={data.sales.yesterday} />
            <PeriodCard label={t("dashboard.periodLast7")} stat={data.sales.last7} />
            <PeriodCard label={t("dashboard.periodThisMonth")} stat={data.sales.mtd} />
          </div>
        </section>

        {/* SECTION 3 — Financial summary */}
        <section>
          <SectionTitle title={t("dashboard.sectionFinancial")} hint={t("dashboard.sectionFinancialHint")} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiTile label={t("dashboard.kpiCashInHand")} value={bdt(k.cashInHand)} sub={t("dashboard.subTodayLower")} icon={Banknote} tone="success" to="/accounts/cashbook" />
            <KpiTile label={t("dashboard.kpiBankBalance")} value={bdt(k.bankBalance)} icon={Building2} tone="secondary" to="/accounts/banks" />
            <KpiTile label={t("dashboard.kpiReceivable")} value={bdt(k.customerDueTotal)} icon={ArrowUpRight} tone="warning" />
            <KpiTile label={t("dashboard.kpiPayable")} value={bdt(k.supplierDueTotal)} icon={ArrowUpRight} tone="warning" />
            <KpiTile label={t("dashboard.kpiInventoryValue")} value={bdt(k.inventoryValue)} sub={t("dashboard.subAtCost")} icon={Boxes} tone="primary" to="/inventory" />
            <KpiTile label={t("dashboard.kpiNetProfitMtd")} value={bdt(data.monthly[data.monthly.length - 1]?.profit ?? 0)} icon={TrendingUp} tone="success" />
          </div>
        </section>

        {/* SECTION 4 — Alert center */}
        <section>
          <SectionTitle title={t("dashboard.sectionAlerts")} hint={t("dashboard.sectionAlertsHint")} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AlertChip label={t("dashboard.alertLowStock")} count={k.lowStock} tone={k.lowStock > 0 ? "warning" : "muted"} to="/inventory" icon={Package} />
            <AlertChip label={t("dashboard.alertNearExpiry")} count={k.nearExpiry} tone={k.nearExpiry > 0 ? "warning" : "muted"} to="/inventory" icon={CalendarX} />
            <AlertChip label={t("dashboard.alertExpired")} count={k.expired} tone={k.expired > 0 ? "destructive" : "muted"} to="/inventory" icon={ShieldAlert} />
            <AlertChip label={t("dashboard.alertRecalled")} count={k.recalledCount} tone={k.recalledCount > 0 ? "destructive" : "muted"} to="/inventory/batch-control" icon={ShieldAlert} />
            <AlertChip label={t("dashboard.alertPendingTransfers")} count={k.pendingTransfers} tone={k.pendingTransfers > 0 ? "primary" : "muted"} to="/inventory" icon={Truck} />
            <AlertChip label={t("dashboard.alertPendingPOs")} count={k.pendingPOs} tone={k.pendingPOs > 0 ? "primary" : "muted"} to="/procurement" icon={ClipboardList} />
            <AlertChip label={t("dashboard.alertPendingGRNs")} count={k.pendingGRNs} tone={k.pendingGRNs > 0 ? "primary" : "muted"} to="/procurement" icon={FileCheck2} />
            <AlertChip label={t("dashboard.alertCancelled")} count={k.cancelledCount} tone={k.cancelledCount > 0 ? "warning" : "muted"} to="/sales" icon={AlertTriangle} />
          </div>
        </section>

        {/* SECTION 5 — Business analytics */}
        <section>
          <SectionTitle title={t("dashboard.sectionAnalytics")} hint={t("dashboard.sectionAnalyticsHint")} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title={t("dashboard.chartSalesTrend")}>
              {data.dailySales.some((d) => d.sales > 0) ? (
                <ResponsiveContainer>
                  <AreaChart data={data.dailySales} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => bdt(v)} />
                    <Area type="monotone" dataKey="sales" stroke="var(--color-primary)" fill="url(#gSales)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyState />}
            </ChartCard>
            <ChartCard title={t("dashboard.chartProfitTrend")}>
              {data.dailySales.some((d) => d.profit > 0) ? (
                <ResponsiveContainer>
                  <AreaChart data={data.dailySales} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => bdt(v)} />
                    <Area type="monotone" dataKey="profit" stroke="var(--color-success)" fill="url(#gProfit)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyState />}
            </ChartCard>
            <ChartCard title={t("dashboard.chartTopProducts")}>
              {data.topMedicines.length > 0 ? (
                <ResponsiveContainer>
                  <BarChart data={data.topMedicines} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
                    <YAxis type="category" dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} width={120} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => bdt(v)} />
                    <Bar dataKey="revenue" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState />}
            </ChartCard>
            <ChartCard title={t("dashboard.chartCategoryInventory")}>
              {data.categoryInventory.length > 0 ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={data.categoryInventory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                      {data.categoryInventory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => bdt(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyState />}
            </ChartCard>
          </div>
        </section>




        {/* SECTION 7 — Quick actions */}
        <section>
          <SectionTitle title={t("dashboard.sectionQuickActions")} hint={t("dashboard.sectionQuickActionsHint")} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <QuickAction to="/sales/pos" icon={ShoppingCart} label={t("dashboard.quickNewSale")} />
            <QuickAction to="/purchases" icon={Truck} label={t("dashboard.quickNewPurchase")} />
            <QuickAction to="/products" icon={Plus} label={t("dashboard.quickAddProduct")} />
            <QuickAction to="/customers" icon={UserPlus} label={t("dashboard.quickAddCustomer")} />
            <QuickAction to="/suppliers" icon={Building2} label={t("dashboard.quickAddSupplier")} />
            <QuickAction to="/inventory" icon={PackageSearch} label={t("dashboard.quickStockCount")} />
          </div>
        </section>

        {/* SECTION 8 — Today's tasks */}
        <section>
          <SectionTitle title={t("dashboard.sectionTasks")} hint={t("dashboard.sectionTasksHint")} />
          <Card className="shadow-card">
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <TaskTile label={t("dashboard.taskPOApprovals")} count={k.pendingPOs} to="/procurement" />
                <TaskTile label={t("dashboard.taskTransferApprovals")} count={k.pendingTransfers} to="/inventory" />
                <TaskTile label={t("dashboard.taskGRNApprovals")} count={k.pendingGRNs} to="/procurement" />
                <TaskTile label={t("dashboard.taskSupplierPayments")} count={data.supplierDueTop.length} to="/suppliers" />
                <TaskTile label={t("dashboard.taskExpiryReviews")} count={k.nearExpiry + k.expired} to="/inventory" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Top dues row */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{t("dashboard.topCustomerDues")}</CardTitle></CardHeader>
            <CardContent>
              {data.customerDueTop.length === 0 ? <EmptyState /> : (
                <ul className="divide-y divide-border">
                  {data.customerDueTop.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="truncate text-sm">{d.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-warning">{bdt(d.due)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{t("dashboard.topSupplierDues")}</CardTitle></CardHeader>
            <CardContent>
              {data.supplierDueTop.length === 0 ? <EmptyState /> : (
                <ul className="divide-y divide-border">
                  {data.supplierDueTop.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="truncate text-sm">{d.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-warning">{bdt(d.due)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <footer className="pt-2 text-center text-xs text-muted-foreground">
          {t("dashboard.footerRefreshed", { tenant: data.tenantName ?? "—", time: new Date().toLocaleTimeString() })}
        </footer>
      </div>
    </AppShell>
  );
}

function TaskTile({ label, count, to }: { label: string; count: number; to: string }) {
  const empty = count === 0;
  return (
    <Link
      to={to as never}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 transition-colors ${
        empty
          ? "border-border bg-muted/20 text-muted-foreground hover:bg-muted/30"
          : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
      }`}
    >
      <span className="text-2xl font-bold tabular-nums">{num(count)}</span>
      <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
    </Link>
  );
}
