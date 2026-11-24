import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Building2, TrendingUp, TrendingDown, Trophy, Wallet, Boxes, ShoppingCart, Truck, Users,
  AlertTriangle, CalendarX, Loader2, ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import {
  getCorporateDashboard, type CorporateDashboardData,
} from "@/lib/api/corporate-dashboard.functions";

export const Route = createFileRoute("/corporate-dashboard")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Corporate Dashboard — SohojPharma" }] }),
  component: CorporateDashboardPage,
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

function CorporateDashboardPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const fetchDashboard = useServerFn(getCorporateDashboard);
  const [lowFilter, setLowFilter] = useState("");
  const [expBranch, setExpBranch] = useState<string>("all");

  const enabled = !!currentTenantId;
  const { data, isLoading, error } = useQuery<CorporateDashboardData>({
    enabled,
    queryKey: ["corporate-dashboard", currentTenantId],
    queryFn: () => fetchDashboard({ data: { tenant_id: currentTenantId! } }),
    staleTime: 60_000,
    retry: false,
  });

  const forbidden = error && /forbidden/i.test((error as Error).message);

  const ranked = useMemo(() => {
    if (!data) return null;
    const rows = [...data.branches];
    const bySales = [...rows].sort((a, b) => b.sales - a.sales);
    const byProfit = [...rows].sort((a, b) => b.profit - a.profit);
    const top = bySales[0];
    const bottom = bySales[bySales.length - 1];
    const topProfit = byProfit[0];
    const highestDue = rows
      .map((r) => ({ ...r, due: Math.max(r.sales - r.collections, 0) }))
      .sort((a, b) => b.due - a.due)[0];
    // Fastest growing = highest profit margin
    const growing = [...rows]
      .map((r) => ({ ...r, margin: r.sales > 0 ? r.profit / r.sales : 0 }))
      .sort((a, b) => b.margin - a.margin)[0];
    return { top, bottom, topProfit, highestDue, growing };
  }, [data]);

  const expiryRows = useMemo(() => {
    if (!data) return [];
    return expBranch === "all"
      ? data.expiry
      : data.expiry.filter((r) => r.branch === expBranch);
  }, [data, expBranch]);

  const lowRows = useMemo(() => {
    if (!data) return [];
    const q = lowFilter.trim().toLowerCase();
    if (!q) return data.lowStock;
    return data.lowStock.filter(
      (r) => r.product.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q),
    );
  }, [data, lowFilter]);

  const branchNames = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.expiry.map((r) => r.branch).filter(Boolean))) as string[];
  }, [data]);

  return (
    <AppShell variant="store" title={t("corporateDashboard.title", "Corporate Dashboard")}>
      <PageHeader
        title={t("corporateDashboard.title", "Corporate Dashboard")}
        description={t("corporateDashboard.subtitle", "Aggregated performance across all branches (last 30 days)")}
      />

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t("common.loading", "Loading…")}
        </div>
      )}

      {forbidden && (
        <Card><CardContent className="flex items-center gap-3 p-6 text-warning">
          <ShieldAlert className="h-5 w-5" />
          <span>{t("corporateDashboard.forbidden", "Owner or Corporate Admin role required to view this dashboard.")}</span>
        </CardContent></Card>
      )}

      {error && !forbidden && (
        <Card><CardContent className="p-6 text-destructive">{(error as Error).message}</CardContent></Card>
      )}

      {data && (
        <div className="space-y-6">
          {/* Total KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("corporateDashboard.kpi.totalSales", "Total Sales")} value={bdt(data.kpi.totalSales)} icon={ShoppingCart} tone="primary" />
            <StatCard label={t("corporateDashboard.kpi.totalPurchase", "Total Purchases")} value={bdt(data.kpi.totalPurchase)} icon={Truck} tone="secondary" />
            <StatCard label={t("corporateDashboard.kpi.totalProfit", "Total Profit")} value={bdt(data.kpi.totalProfit)} icon={TrendingUp} tone="success" />
            <StatCard label={t("corporateDashboard.kpi.totalInventory", "Total Inventory")} value={bdt(data.kpi.totalInventory)} icon={Boxes} tone="primary" />
            <StatCard label={t("corporateDashboard.kpi.totalDue", "Total Due")} value={bdt(data.kpi.totalDue)} icon={Wallet} tone="warning" />
            <StatCard label={t("corporateDashboard.kpi.totalCollections", "Total Collections")} value={bdt(data.kpi.totalCollections)} icon={Wallet} tone="success" />
            <StatCard label={t("corporateDashboard.kpi.activeCustomers", "Active Customers")} value={num(data.kpi.activeCustomers)} icon={Users} tone="primary" />
            <StatCard label={t("corporateDashboard.kpi.activeSuppliers", "Active Suppliers")} value={num(data.kpi.activeSuppliers)} icon={Truck} tone="primary" />
          </div>

          {/* Executive KPI cards */}
          {ranked && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <ExecKpi icon={Trophy} tone="success" label={t("corporateDashboard.exec.best", "Best Branch")} name={ranked.top?.branch_name} value={bdt(ranked.top?.sales ?? 0)} />
              <ExecKpi icon={TrendingDown} tone="warning" label={t("corporateDashboard.exec.worst", "Worst Branch")} name={ranked.bottom?.branch_name} value={bdt(ranked.bottom?.sales ?? 0)} />
              <ExecKpi icon={TrendingUp} tone="success" label={t("corporateDashboard.exec.fastest", "Fastest Growing")} name={ranked.growing?.branch_name} value={`${Math.round((ranked.growing?.margin ?? 0) * 100)}% ${t("corporateDashboard.exec.margin", "margin")}`} />
              <ExecKpi icon={TrendingUp} tone="success" label={t("corporateDashboard.exec.highestProfit", "Highest Profit")} name={ranked.topProfit?.branch_name} value={bdt(ranked.topProfit?.profit ?? 0)} />
              <ExecKpi icon={Wallet} tone="warning" label={t("corporateDashboard.exec.highestDue", "Highest Due")} name={ranked.highestDue?.branch_name} value={bdt(ranked.highestDue?.due ?? 0)} />
            </div>
          )}

          {/* Branch comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {t("corporateDashboard.comparison", "Branch Comparison")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.branches}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="branch_name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="sales" fill="var(--color-primary)" name={t("corporateDashboard.col.sales", "Sales")} />
                    <Bar dataKey="profit" fill="var(--color-success)" name={t("corporateDashboard.col.profit", "Profit")} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("corporateDashboard.col.branch", "Branch")}</TableHead>
                    <TableHead>{t("corporateDashboard.col.role", "Role")}</TableHead>
                    <TableHead className="text-right">{t("corporateDashboard.col.sales", "Sales")}</TableHead>
                    <TableHead className="text-right">{t("corporateDashboard.col.profit", "Profit")}</TableHead>
                    <TableHead className="text-right">{t("corporateDashboard.col.collections", "Collections")}</TableHead>
                    <TableHead className="text-right">{t("corporateDashboard.col.inventory", "Inventory")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.branches.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">—</TableCell></TableRow>
                  )}
                  {data.branches.map((b) => (
                    <TableRow key={b.branch_id}>
                      <TableCell className="font-medium">{b.branch_name}</TableCell>
                      <TableCell><Badge variant="secondary">{b.branch_role}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{bdt(b.sales)}</TableCell>
                      <TableCell className="text-right tabular-nums">{bdt(b.profit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{bdt(b.collections)}</TableCell>
                      <TableCell className="text-right tabular-nums">{bdt(b.inventory_value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Monitors */}
          <Tabs defaultValue="low">
            <TabsList>
              <TabsTrigger value="low">
                <AlertTriangle className="mr-2 h-4 w-4" />
                {t("corporateDashboard.lowStockMonitor", "Low Stock Monitor")}
              </TabsTrigger>
              <TabsTrigger value="expiry">
                <CalendarX className="mr-2 h-4 w-4" />
                {t("corporateDashboard.expiryMonitor", "Expiry Monitor")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="low">
              <Card>
                <CardHeader>
                  <Input
                    value={lowFilter}
                    onChange={(e) => setLowFilter(e.target.value)}
                    placeholder={t("corporateDashboard.filterLow", "Filter by product or branch")}
                    className="max-w-sm"
                  />
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("corporateDashboard.col.medicine", "Medicine")}</TableHead>
                        <TableHead>{t("corporateDashboard.col.branch", "Branch")}</TableHead>
                        <TableHead className="text-right">{t("corporateDashboard.col.qty", "Qty")}</TableHead>
                        <TableHead className="text-right">{t("corporateDashboard.col.reorder", "Reorder")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowRows.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">—</TableCell></TableRow>
                      )}
                      {lowRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.product}</TableCell>
                          <TableCell>{r.branch}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(r.qty)}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(r.reorder)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="expiry">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center gap-2">
                  <select
                    value={expBranch}
                    onChange={(e) => setExpBranch(e.target.value)}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="all">{t("corporateDashboard.allBranches", "All Branches")}</option>
                    {branchNames.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <div className="ml-auto flex flex-wrap gap-2 text-xs">
                    <Badge variant="destructive">{t("corporateDashboard.bucket.expired", "Expired")}: {data.expiry.filter(e => e.bucket === "expired").length}</Badge>
                    <Badge variant="outline">{t("corporateDashboard.bucket.7d", "≤ 7 Days")}: {data.expiry.filter(e => e.bucket === "7d").length}</Badge>
                    <Badge variant="outline">{t("corporateDashboard.bucket.30d", "≤ 30 Days")}: {data.expiry.filter(e => e.bucket === "30d").length}</Badge>
                    <Badge variant="outline">{t("corporateDashboard.bucket.90d", "≤ 90 Days")}: {data.expiry.filter(e => e.bucket === "90d").length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("corporateDashboard.col.medicine", "Medicine")}</TableHead>
                        <TableHead>{t("corporateDashboard.col.branch", "Branch")}</TableHead>
                        <TableHead>{t("corporateDashboard.col.batch", "Batch")}</TableHead>
                        <TableHead>{t("corporateDashboard.col.expiry", "Expiry")}</TableHead>
                        <TableHead className="text-right">{t("corporateDashboard.col.qty", "Qty")}</TableHead>
                        <TableHead>{t("corporateDashboard.col.bucket", "Bucket")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expiryRows.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">—</TableCell></TableRow>
                      )}
                      {expiryRows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.product}</TableCell>
                          <TableCell>{r.branch ?? "—"}</TableCell>
                          <TableCell>{r.batch_no}</TableCell>
                          <TableCell>{r.expiry_date}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(r.qty_on_hand)}</TableCell>
                          <TableCell>
                            <Badge variant={r.bucket === "expired" ? "destructive" : "outline"}>{r.bucket}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AppShell>
  );
}

function ExecKpi({
  icon: Icon, label, name, value, tone,
}: {
  icon: typeof Trophy;
  label: string;
  name?: string;
  value: string;
  tone: "success" | "warning";
}) {
  const toneCls = tone === "success" ? "text-success bg-success/10" : "text-warning bg-warning/15";
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className={`flex h-10 w-10 items-center justify-center rounded-md ${toneCls}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate font-semibold">{name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
