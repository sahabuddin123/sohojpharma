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
  Boxes, RefreshCw, HandCoins, ReceiptText, Undo2,
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
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { StoreSetupBanner } from "@/components/store/store-setup-banner";
import { ModernDateRangeFilter, useDateRangeFilter } from "@/components/common/date-range-filter";

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
  label, value, sub, icon: Icon, tone = "primary", to, featured = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: typeof Wallet;
  tone?: "primary" | "success" | "warning" | "destructive" | "muted";
  to?: string;
  featured?: boolean;
}) {
  const isV2 = useUIStore((s) => s.desktopUiVersion === "v2");
  const toneMap = {
    primary: "bg-emerald-50 text-[#0d5c46] dark:bg-emerald-950/50 dark:text-emerald-400",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    destructive: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400",
    muted: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  } as const;
  const v2ToneMap = {
    primary: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
    success: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
    warning: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
    destructive: "bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-300",
    muted: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300",
  } as const;

  const body = featured ? (
    <Card
      className={cn(
        "group h-full overflow-hidden border-0 text-white transition-all hover:-translate-y-0.5",
        isV2
          ? "sp-v2-featured-card"
          : "bg-gradient-to-br from-[#094735] to-[#0d5c46] shadow-[0_12px_28px_-10px_rgba(13,92,70,0.45)]",
      )}
    >
      <CardContent className="flex h-full flex-col justify-between gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <span className={cn("min-w-0 font-semibold text-teal-50/95", isV2 ? "text-[13px]" : "text-[11px] uppercase tracking-wider")}>
            {label}
          </span>
          <div className={cn("grid h-10 w-10 shrink-0 place-items-center bg-white/15 text-white", isV2 ? "rounded-full" : "rounded-xl")}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-2xl font-extrabold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
          {sub != null && <p className="mt-1 truncate text-xs font-medium text-teal-50/85">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  ) : isV2 ? (
    <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5">
      <CardContent className="flex h-full items-center gap-4 p-5">
        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full", v2ToneMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-slate-600 dark:text-slate-300">
            {label}
          </span>
          <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">
            {value}
          </p>
          {sub != null && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  ) : (
    <Card className="group h-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.03)] transition-all hover:-translate-y-0.5 hover:border-emerald-300/80 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="flex h-full flex-col justify-between gap-2.5 p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
            {label}
          </span>
          <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${toneMap[tone]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold tracking-tight text-slate-900 tabular-nums dark:text-white sm:text-xl">{value}</p>
          {sub != null && <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to as never} className="block h-full">{body}</Link> : body;
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  const isV2 = useUIStore((s) => s.desktopUiVersion === "v2");
  return (
    <div className="mb-3.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className={cn("truncate font-bold tracking-tight text-foreground", isV2 ? "text-base sm:text-lg" : "text-sm sm:text-base")}>{title}</h2>
        {hint && <p className={cn("truncate text-muted-foreground", isV2 ? "text-[13px]" : "text-xs")}>{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function ChartCard({ title, hint, children, height = 240 }: { title: string; hint?: string; children: React.ReactNode; height?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</CardTitle>
        {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </CardHeader>
      <CardContent>
        <div style={{ width: "100%", height }}>{children}</div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: typeof Plus; label: string }) {
  const isV2 = useUIStore((s) => s.desktopUiVersion === "v2");
  return (
    <Link
      to={to as never}
      className={cn(
        "group flex flex-col items-center justify-center gap-2.5 p-4 text-center transition-all",
        isV2
          ? "rounded-[22px] border border-white/85 bg-white/65 backdrop-blur-md shadow-[0_10px_30px_-10px_rgba(15,118,110,0.08)] hover:-translate-y-0.5 hover:bg-white/85 dark:border-white/10 dark:bg-[#122228]/65 dark:hover:bg-[#162b33]/80"
          : "rounded-2xl border border-slate-200/80 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-emerald-300/80 hover:bg-emerald-50/30 dark:border-slate-800/80 dark:hover:border-emerald-800/70 dark:hover:bg-emerald-950/20",
      )}
    >
      <div
        className={cn(
          "grid h-11 w-11 place-items-center transition-colors",
          isV2
            ? "rounded-full bg-teal-100 text-[#0d8590] group-hover:bg-gradient-to-br group-hover:from-[#0d8590] group-hover:to-[#1ba7ad] group-hover:text-white dark:bg-teal-500/20 dark:text-teal-300"
            : "rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 group-hover:bg-emerald-600 group-hover:text-white group-hover:ring-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800/60",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-medium leading-tight text-slate-700 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white">{label}</span>
    </Link>
  );
}

function AlertChip({
  label, count, tone, to, icon: Icon,
}: { label: string; count: number; tone: "destructive" | "warning" | "primary" | "muted"; to?: string; icon: typeof AlertTriangle }) {
  const toneMap = {
    destructive: "border-rose-200/80 bg-rose-50/60 text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300",
    warning: "border-amber-200/80 bg-amber-50/60 text-amber-800 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
    primary: "border-emerald-200/80 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
    muted: "border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
  };
  const inner = (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors ${toneMap[tone]}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs font-medium">{label}</span>
      </div>
      <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-sm font-bold tabular-nums shadow-2xs dark:bg-slate-900/80">{num(count)}</span>
    </div>
  );
  return to ? <Link to={to as never}>{inner}</Link> : inner;
}

function PeriodCard({
  label, stat,
}: { label: string; stat: StoreDashboardData["sales"]["today"] }) {
  const empty = stat.amount === 0 && stat.invoices === 0;
  return (
    <Card className="transition-colors hover:border-slate-300/90 dark:hover:border-slate-700">
      <CardContent className="p-4 sm:p-5">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {empty ? (
          <p className="mt-2.5 text-sm font-medium text-slate-400 dark:text-slate-500">কোনো তথ্য নেই</p>
        ) : (
          <>
            <p className="mt-1.5 text-xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white sm:text-2xl">{bdt(stat.amount)}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>{num(stat.invoices)}টি চালান</span>
              <span>· {num(stat.customers)} জন গ্রাহক</span>
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
  const isV2 = useUIStore((s) => s.desktopUiVersion === "v2");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const { preset, from, to, setPreset, setCustom } = useDateRangeFilter("today");

  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const effFrom = preset === "all" ? "2020-01-01" : (from ?? todayIso);
  const effTo = preset === "all" ? todayIso : (to ?? effFrom);

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
    queryKey: ["store-dashboard", currentTenantId, warehouseId ?? "all", effFrom, effTo],
    enabled: !!currentTenantId,
    queryFn: () =>
      fetchDashboard({
        data: {
          tenant_id: currentTenantId!,
          warehouse_id: warehouseId,
          from_date: effFrom,
          to_date: effTo,
        },
      }),
    placeholderData: (prev) => prev,
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
        {/* Executive Header Bar */}
        <header
          className={cn(
            "flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between",
            isV2
              ? "px-1 py-1"
              : "rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900",
          )}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-xs font-semibold uppercase tracking-wider",
                isV2 ? "text-[#0d8590] dark:text-teal-300" : "text-[#0d5c46] dark:text-emerald-400",
              )}
            >
              {data.tenantName ?? t("dashboard.fallbackTenant")}
            </p>
            <h1
              className={cn(
                "mt-0.5 font-extrabold tracking-tight text-slate-900 dark:text-white",
                isV2 ? "text-2xl sm:text-[30px] leading-tight" : "truncate text-xl sm:text-2xl",
              )}
            >
              {greeting}, {displayName}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-slate-500 dark:text-slate-400">
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            <ModernDateRangeFilter
              preset={preset}
              from={from}
              to={to}
              onPresetChange={setPreset}
              onCustomChange={setCustom}
            />
            <WarehouseFilter value={warehouseId} onChange={setWarehouseId} className="min-w-0 flex-1 sm:w-[190px] sm:flex-none" />
            <Button
              variant="outline"
              size="sm"
              className={cn("shrink-0", isV2 ? "rounded-full bg-white/70 dark:bg-white/10 border-white/80 dark:border-white/10" : "rounded-xl border-slate-200")}
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">{t("dashboard.refresh")}</span>
            </Button>
          </div>
        </header>


        <StoreSetupBanner />
        <OnboardingChecklist />

        {/* SECTION 1 — Owner Overview (2-Tier Executive Hierarchy) */}
        <section className={isFetching ? "space-y-3 opacity-70 transition-opacity" : "space-y-3 transition-opacity"}>
          <SectionTitle
            title={t("dashboard.sectionOwnerOverview")}
            hint={preset === "today" ? t("dashboard.sectionOwnerOverviewHint") : `${effFrom} → ${effTo}`}
          />
          {/* Primary 4 Hero KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              featured
              label={preset === "today" ? t("dashboard.kpiTodaySales") : "মোট বিক্রি"}
              value={bdt(k.todaySales)}
              sub={`নগদ: ${bdt(k.todayCashSale ?? 0)}`}
              icon={ShoppingCart}
              tone="primary"
              to="/sales"
            />
            <KpiTile
              label="দৈনিক হাতে ক্যাশ"
              value={bdt(k.dailyCashInHand ?? 0)}
              sub="নগদ + আদায় − খরচ"
              icon={Banknote}
              tone={(k.dailyCashInHand ?? 0) < 0 ? "destructive" : "success"}
              to="/accounts/cashbook"
            />
            <KpiTile
              label={preset === "today" ? t("dashboard.kpiTodayProfit") : "নিট মুনাফা"}
              value={bdt(k.todayProfit)}
              sub="বিক্রি ও ক্রয়মূল্যের পার্থক্য"
              icon={TrendingUp}
              tone={k.todayProfit < 0 ? "destructive" : "success"}
            />
            <KpiTile
              label="বাকি আদায়"
              value={bdt(k.dueCollection)}
              sub="কাস্টমার কালেকশন"
              icon={HandCoins}
              tone="success"
              to="/sales/due-collections"
            />
          </div>

          {/* Secondary 8 Operational KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="নগদ বিক্রি"
              value={bdt(k.todayCashSale ?? 0)}
              icon={Banknote}
              tone="success"
              to="/sales"
            />
            <KpiTile
              label="বাকি বিক্রি"
              value={bdt(k.todayDueSale ?? 0)}
              icon={Wallet}
              tone={(k.todayDueSale ?? 0) > 0 ? "warning" : "muted"}
              to="/sales/due-collections"
            />
            <KpiTile
              label={preset === "today" ? "আজকের খরচ" : "মোট খরচ"}
              value={bdt(k.todayExpense ?? 0)}
              icon={ReceiptText}
              tone={(k.todayExpense ?? 0) > 0 ? "destructive" : "muted"}
              to="/accounts/expenses"
            />
            <KpiTile
              label="বিক্রি রিটার্ন"
              value={bdt(k.todayReturn ?? 0)}
              icon={Undo2}
              tone={(k.todayReturn ?? 0) > 0 ? "warning" : "muted"}
              to="/sales/returns"
            />
            <KpiTile
              label={t("dashboard.kpiCustomerDue")}
              value={bdt(k.customerDueTotal)}
              sub={t("dashboard.subCustomers", { count: data.customerDueTop.length })}
              icon={Wallet}
              tone="warning"
              to="/customers"
            />
            <KpiTile
              label={t("dashboard.kpiSupplierDue")}
              value={bdt(k.supplierDueTotal)}
              sub={t("dashboard.subSuppliers", { count: data.supplierDueTop.length })}
              icon={Building2}
              tone="warning"
              to="/suppliers"
            />
            <KpiTile
              label={t("dashboard.kpiLowStock")}
              value={num(k.lowStock)}
              sub={t("dashboard.subBelowReorder")}
              icon={Package}
              tone={k.lowStock > 0 ? "destructive" : "muted"}
              to="/inventory"
            />
            <KpiTile
              label={t("dashboard.kpiExpired")}
              value={num(k.expired)}
              sub={t("dashboard.subPastExpiry")}
              icon={CalendarX}
              tone={k.expired > 0 ? "destructive" : "muted"}
              to="/inventory"
            />
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
            <KpiTile label={t("dashboard.kpiBankBalance")} value={bdt(k.bankBalance)} icon={Building2} tone="primary" to="/accounts/banks" />
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
