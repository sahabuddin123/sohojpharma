import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Download, FileSpreadsheet, FileText, FileType, TrendingUp, TrendingDown, Minus, RefreshCw, Calendar, Printer } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  getExecutiveKpis, getRevenueAnalytics, getStoreAnalytics,
  getSubscriptionAnalytics, getPaymentAnalytics, getFinancialHealth,
  getReportFilterOptions, getBranchAnalytics, getUserAnalytics,
  getMedicineAnalytics, getAuditReports, getSecurityReports,
} from "@/lib/admin-reports.functions";

export const Route = createFileRoute("/admin/reports")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Reports — Super Admin" }] }),
  component: AdminReportsPage,
});

// ---------- helpers ----------

type DateRangeKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "this_month" | "last_month" | "this_year" | "custom";

function rangeFor(k: DateRangeKey, custom?: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  switch (k) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = daysAgo(1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "7d": return { from: startOfDay(daysAgo(7)), to: endOfDay(now) };
    case "30d": return { from: startOfDay(daysAgo(30)), to: endOfDay(now) };
    case "90d": return { from: startOfDay(daysAgo(90)), to: endOfDay(now) };
    case "this_month": return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: endOfDay(now) };
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: f.toISOString(), to: t.toISOString() };
    }
    case "this_year": return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: endOfDay(now) };
    case "custom": return { from: custom?.from ?? startOfDay(daysAgo(30)), to: custom?.to ?? endOfDay(now) };
  }
}

const BDT = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
const fmtMoney = (n: number) => BDT.format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

// ---------- main ----------

function AdminReportsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rangeKey, setRangeKey] = useState<DateRangeKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [storeId, setStoreId] = useState<string>("all");
  const [planId, setPlanId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [district, setDistrict] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [gateway, setGateway] = useState<string>("all");
  const [refreshInterval, setRefreshInterval] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("executive");
  const reportRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => rangeFor(rangeKey, { from: customFrom, to: customTo }), [rangeKey, customFrom, customTo]);
  const filters = useMemo(() => ({
    from: range.from, to: range.to,
    store_id: storeId === "all" ? undefined : storeId,
    plan_id: planId === "all" ? undefined : planId,
    status: status === "all" ? undefined : status,
    district: district === "all" ? undefined : district,
    payment_status: paymentStatus === "all" ? undefined : paymentStatus,
    gateway: gateway === "all" ? undefined : gateway,
  }), [range, storeId, planId, status, district, paymentStatus, gateway]);

  const optionsFn = useServerFn(getReportFilterOptions);
  const { data: opts } = useQuery({
    queryKey: ["admin-reports", "filter-opts"],
    queryFn: () => optionsFn(),
    staleTime: 5 * 60_000,
  });

  // Realtime — invalidate report queries on live changes to key tables.
  useEffect(() => {
    const ch = supabase
      .channel("admin-reports-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants" },
        () => qc.invalidateQueries({ queryKey: ["admin-reports"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_payments" },
        () => qc.invalidateQueries({ queryKey: ["admin-reports"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" },
        () => qc.invalidateQueries({ queryKey: ["admin-reports"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <AppShell variant="admin" title={t("nav.reports")}>
      <PageHeader
        title={t("admin.reports.title", "Reports & Analytics")}
        description={t("admin.reports.desc", "Business intelligence and KPI dashboard")}
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
              <SelectTrigger className="w-[140px]"><RefreshCw className="mr-1.5 h-4 w-4" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Manual</SelectItem>
                <SelectItem value="30000">30 sec</SelectItem>
                <SelectItem value="60000">60 sec</SelectItem>
                <SelectItem value="300000">5 min</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="mr-1.5 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportPdf(reportRef, activeTab, filters)}><FileType className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportExcel(activeTab, filters, qc)}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCsv(activeTab, filters, qc)}><FileText className="mr-2 h-4 w-4" /> CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Filter bar */}
      <Card className="sticky top-0 z-20 mb-4 border-border/60 bg-card/95 backdrop-blur">
        <CardContent className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4 lg:grid-cols-8">
          <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as DateRangeKey)}>
            <SelectTrigger><Calendar className="mr-1.5 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {rangeKey === "custom" && (
            <>
              <Input type="date" value={customFrom.slice(0, 10)} onChange={(e) => setCustomFrom(new Date(e.target.value).toISOString())} />
              <Input type="date" value={customTo.slice(0, 10)} onChange={(e) => setCustomTo(new Date(e.target.value + "T23:59:59").toISOString())} />
            </>
          )}
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger><SelectValue placeholder="Store" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {opts?.stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              {opts?.plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={district} onValueChange={setDistrict}>
            <SelectTrigger><SelectValue placeholder="District" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Districts</SelectItem>
              {opts?.districts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentStatus} onValueChange={setPaymentStatus}>
            <SelectTrigger><SelectValue placeholder="Payment Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={gateway} onValueChange={setGateway}>
            <SelectTrigger><SelectValue placeholder="Gateway" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Gateways</SelectItem>
              <SelectItem value="bkash">bKash</SelectItem>
              <SelectItem value="nagad">Nagad</SelectItem>
              <SelectItem value="rocket">Rocket</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div ref={reportRef}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="executive">Executive</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="stores">Stores</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="medicines">Medicines</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="executive" className="mt-4"><ExecutiveSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="revenue" className="mt-4"><RevenueSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="stores" className="mt-4"><StoresSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="subscriptions" className="mt-4"><SubscriptionsSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="payments" className="mt-4"><PaymentsSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="financial" className="mt-4"><FinancialSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="branches" className="mt-4"><BranchSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="users" className="mt-4"><UserSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="medicines" className="mt-4"><MedicineSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditSection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
        <TabsContent value="security" className="mt-4"><SecuritySection filters={filters} refreshInterval={refreshInterval} /></TabsContent>
      </Tabs>
      </div>
    </AppShell>
  );
}

// ---------- Section components ----------

type Filters = {
  from: string; to: string;
  store_id?: string; plan_id?: string; status?: string;
  district?: string; payment_status?: string; gateway?: string;
};
type SecProps = { filters: Filters; refreshInterval: number };

function KpiCard({ label, value, growth, format = "num" }: { label: string; value: number; growth?: number; format?: "money" | "num" }) {
  const display = format === "money" ? fmtMoney(value) : fmtNum(value);
  const up = (growth ?? 0) > 0;
  const down = (growth ?? 0) < 0;
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{display}</div>
        {growth !== undefined && (
          <div className={`mt-1 flex items-center gap-1 text-xs ${up ? "text-green-600" : down ? "text-red-600" : "text-muted-foreground"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {growth}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExecutiveSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getExecutiveKpis);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "executive", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false,
    staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={3} />;
  const k = data.kpis;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
      <KpiCard label="Total Stores" value={k.total_stores.current} growth={k.total_stores.growth} />
      <KpiCard label="Active" value={k.active_stores.current} />
      <KpiCard label="Pending" value={k.pending_stores.current} />
      <KpiCard label="Suspended" value={k.suspended_stores.current} />
      <KpiCard label="Expired" value={k.expired_stores.current} />
      <KpiCard label="Rejected" value={k.rejected_stores.current} />
      <KpiCard label="Total Revenue" value={k.total_revenue.current} growth={k.total_revenue.growth} format="money" />
      <KpiCard label="Monthly Revenue" value={k.monthly_revenue.current} format="money" />
      <KpiCard label="Annual Revenue" value={k.annual_revenue.current} format="money" />
      <KpiCard label="MRR" value={k.mrr.current} format="money" />
      <KpiCard label="ARR" value={k.arr.current} format="money" />
      <KpiCard label="Total Branches" value={k.total_branches.current} />
      <KpiCard label="Total Users" value={k.total_users.current} />
      <KpiCard label="Total Medicines" value={k.total_medicines.current} />
    </div>
  );
}

function RevenueSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getRevenueAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "revenue", filters],
    queryFn: () => fn({ data: { ...filters, granularity: "day" } }),
    refetchInterval: refreshInterval || false,
    staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="shadow-card lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Revenue Trend</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend}>
              <defs>
                <linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS[0]} strokeWidth={2} fill="url(#rv)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Revenue by Plan</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.by_plan} dataKey="revenue" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label>
                {data.by_plan.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Revenue by Gateway</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.by_gateway}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="gateway" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="successful" fill={CHART_COLORS[1]} name="Successful" />
              <Bar dataKey="failed" fill={CHART_COLORS[3]} name="Failed" />
              <Bar dataKey="revenue" fill={CHART_COLORS[0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function StoresSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getStoreAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "stores", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false,
    staleTime: 60_000,
  });
  const [q, setQ] = useState("");
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  const top = data.top_stores.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Store Growth (monthly)</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.status_distribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label>
                {data.status_distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="shadow-card lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Top Stores</CardTitle>
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead><TableHead>Plan</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Branches</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Status</TableHead><TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.slice(0, 50).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.plan ?? "—"}</TableCell>
                  <TableCell className="text-right">{s.users}</TableCell>
                  <TableCell className="text-right">{s.branches}</TableCell>
                  <TableCell className="text-right">{fmtMoney(s.revenue)}</TableCell>
                  <TableCell><Badge variant="outline">{s.status ?? "—"}</Badge></TableCell>
                  <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {top.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No stores match the current filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SubscriptionsSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getSubscriptionAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "subs", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false,
    staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Active" value={data.counts.active} />
        <KpiCard label="Trial" value={data.counts.trial} />
        <KpiCard label="Expired" value={data.counts.expired} />
        <KpiCard label="Renewed" value={data.counts.renewed} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Expiring Today" value={data.expiry.today} />
        <KpiCard label="Expiring 7d" value={data.expiry.in_7} />
        <KpiCard label="Expiring 30d" value={data.expiry.in_30} />
        <KpiCard label="Expired" value={data.expiry.expired} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Plan Distribution</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.plan_distribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {data.plan_distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Subscription Trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Expiring Subscriptions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Store</TableHead><TableHead>Plan</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Days Remaining</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.expiry_list.slice(0, 50).map((e, i) => (
                <TableRow key={i}>
                  <TableCell>{e.store}</TableCell>
                  <TableCell>{e.plan}</TableCell>
                  <TableCell>{new Date(e.expiry).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{e.days_remaining}</TableCell>
                </TableRow>
              ))}
              {data.expiry_list.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No upcoming expirations.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentsSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getPaymentAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "payments", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false,
    staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Total" value={data.kpis.total} />
        <KpiCard label="Successful" value={data.kpis.successful} />
        <KpiCard label="Failed" value={data.kpis.failed} />
        <KpiCard label="Pending" value={data.kpis.pending} />
        <KpiCard label="Refunded" value={data.kpis.refunded} />
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Gateway Performance</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.gateway_performance}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="gateway" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="success" fill={CHART_COLORS[1]} name="Success" />
              <Bar dataKey="failed" fill={CHART_COLORS[3]} name="Failed" />
              <Bar dataKey="total" fill={CHART_COLORS[0]} name="Total" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Failed Payments</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Store</TableHead><TableHead>Gateway</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Reason</TableHead><TableHead>Date</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.failed_payments.slice(0, 50).map((f, i) => (
                <TableRow key={i}>
                  <TableCell>{f.store}</TableCell>
                  <TableCell>{f.gateway}</TableCell>
                  <TableCell className="text-right">{fmtMoney(f.amount)}</TableCell>
                  <TableCell className="max-w-xs truncate" title={f.reason}>{f.reason}</TableCell>
                  <TableCell>{new Date(f.date).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {data.failed_payments.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No failed payments in range.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getFinancialHealth);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "financial", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false,
    staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={1} />;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard label="MRR" value={data.mrr} format="money" />
      <KpiCard label="ARR" value={data.arr} format="money" />
      <KpiCard label="Churn Rate" value={data.churn_rate} />
      <KpiCard label="Renewal Rate" value={data.renewal_rate} />
      <KpiCard label="Collection Rate" value={data.collection_rate} />
      <Card className="shadow-card md:col-span-5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          <div>Invoiced: <span className="font-medium text-foreground">{fmtMoney(data.invoiced)}</span></div>
          <div>Collected: <span className="font-medium text-foreground">{fmtMoney(data.collected)}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
    </div>
  );
}

// ---------- Phase 2 sections ----------

function BranchSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getBranchAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "branches", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false, staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Total Branches" value={data.kpis.total} />
        <KpiCard label="HQ Branches" value={data.kpis.hq} />
        <KpiCard label="Active" value={data.kpis.active} />
        <KpiCard label="Inactive" value={data.kpis.inactive} />
        <KpiCard label="New This Month" value={data.kpis.new_this_month} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Branch Growth (monthly)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
                <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.status_distribution} dataKey="value" nameKey="name" outerRadius={90} label>
                  {data.status_distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">District Distribution</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.district_distribution} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} /><Tooltip />
              <Bar dataKey="value" fill={CHART_COLORS[1]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Top Stores by Branches</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Store</TableHead><TableHead>Plan</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">HQ</TableHead><TableHead className="text-right">Active</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.top_stores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.plan ?? "—"}</TableCell>
                  <TableCell className="text-right">{s.total}</TableCell>
                  <TableCell className="text-right">{s.hq}</TableCell>
                  <TableCell className="text-right">{s.active}</TableCell>
                </TableRow>
              ))}
              {data.top_stores.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No data.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function UserSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getUserAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "users", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false, staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total Users" value={data.kpis.total} />
        <KpiCard label="Active Users" value={data.kpis.active} />
        <KpiCard label="New This Month" value={data.kpis.new_this_month} />
        <KpiCard label="Disabled" value={data.kpis.disabled} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Role Distribution</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.role_distribution} dataKey="value" nameKey="name" outerRadius={90} label>
                  {data.role_distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">User Growth (monthly)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
                <Area type="monotone" dataKey="count" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Top Stores by Users</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Store</TableHead><TableHead className="text-right">Users</TableHead><TableHead className="text-right">Owners</TableHead><TableHead className="text-right">Managers</TableHead><TableHead className="text-right">Staff</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.top_stores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right">{s.users}</TableCell>
                  <TableCell className="text-right">{s.owners}</TableCell>
                  <TableCell className="text-right">{s.managers}</TableCell>
                  <TableCell className="text-right">{s.staff}</TableCell>
                </TableRow>
              ))}
              {data.top_stores.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No data.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MedicineSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getMedicineAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "medicines", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false, staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total Medicines" value={data.kpis.total} />
        <KpiCard label="Active" value={data.kpis.active} />
        <KpiCard label="Pending" value={data.kpis.pending} />
        <KpiCard label="Rejected" value={data.kpis.rejected} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Medicine Growth</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
                <Area type="monotone" dataKey="count" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Top Generics</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_categories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={140} /><Tooltip />
                <Bar dataKey="value" fill={CHART_COLORS[1]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Top Manufacturers</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_manufacturers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={140} /><Tooltip />
                <Bar dataKey="value" fill={CHART_COLORS[3]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Most Adopted Medicines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead>Generic</TableHead><TableHead>Manufacturer</TableHead><TableHead className="text-right">Stores Using</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.most_adopted.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.generic}</TableCell>
                  <TableCell>{m.manufacturer}</TableCell>
                  <TableCell className="text-right">{m.stores_using}</TableCell>
                  <TableCell><Badge variant="outline">{m.status}</Badge></TableCell>
                </TableRow>
              ))}
              {data.most_adopted.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No data.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditSection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getAuditReports);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "audit", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false, staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total Activities" value={data.kpis.total} />
        <KpiCard label="Today" value={data.kpis.today} />
        <KpiCard label="Admin Actions" value={data.kpis.admin} />
        <KpiCard label="Store Actions" value={data.kpis.store} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Activity Timeline</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
                <Area type="monotone" dataKey="count" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Actions Breakdown</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.actions} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={150} /><Tooltip />
                <Bar dataKey="value" fill={CHART_COLORS[2]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Recent Activities</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Store</TableHead><TableHead>IP</TableHead><TableHead>Entity</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.recent.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(r.time).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{r.user.slice(0, 8)}…</TableCell>
                  <TableCell>{r.action}</TableCell>
                  <TableCell>{r.store}</TableCell>
                  <TableCell className="font-mono text-xs">{r.ip}</TableCell>
                  <TableCell>{r.result}</TableCell>
                </TableRow>
              ))}
              {data.recent.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No activity in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SecuritySection({ filters, refreshInterval }: SecProps) {
  const fn = useServerFn(getSecurityReports);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", "security", filters],
    queryFn: () => fn({ data: filters }),
    refetchInterval: refreshInterval || false, staleTime: 60_000,
  });
  if (isLoading || !data) return <SectionSkeleton rows={2} />;
  const sevColor = (s: string) => ({
    critical: "destructive", high: "destructive", medium: "default", low: "secondary",
  }[s.toLowerCase()] ?? "outline") as "default" | "destructive" | "secondary" | "outline";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total Events" value={data.kpis.total} />
        <KpiCard label="Failed Logins" value={data.kpis.failed_logins} />
        <KpiCard label="Alerts" value={data.kpis.alerts} />
        <KpiCard label="Critical" value={data.kpis.critical} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Security Trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
                <Area type="monotone" dataKey="count" stroke={CHART_COLORS[3]} fill={CHART_COLORS[3]} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Severity</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.severity_distribution} dataKey="value" nameKey="name" outerRadius={90} label>
                  {data.severity_distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Recent Security Events</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Store</TableHead><TableHead>Severity</TableHead><TableHead>Message</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.recent.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(r.time).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{r.user.slice(0, 8)}…</TableCell>
                  <TableCell>{r.store}</TableCell>
                  <TableCell><Badge variant={sevColor(r.severity)}>{r.severity}</Badge></TableCell>
                  <TableCell className="max-w-md truncate" title={r.message}>{r.message}</TableCell>
                </TableRow>
              ))}
              {data.recent.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No security events.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Export Center ----------

// Pulls the most recent React Query cache entry for the active tab and shapes it as tabular rows.
function tabularForTab(tab: string, qc: ReturnType<typeof useQueryClient>): { headers: string[]; rows: Array<Array<string | number>> } {
  const cache = qc.getQueriesData<unknown>({ queryKey: ["admin-reports", tabKey(tab)] });
  const entry = cache?.[cache.length - 1];
  const data = (entry?.[1] ?? null) as Record<string, unknown> | null;
  if (!data) return { headers: ["No data"], rows: [] };

  // KPIs are universal — flatten any { kpis: {...} } block into a 2-column table.
  const kpiBlock = (data.kpis as Record<string, unknown> | undefined);
  if (kpiBlock) {
    const rows: Array<Array<string | number>> = Object.entries(kpiBlock).map(([k, v]) => {
      if (typeof v === "object" && v && "current" in (v as Record<string, unknown>)) {
        return [k, Number((v as { current: number }).current)];
      }
      return [k, typeof v === "number" ? v : String(v)];
    });
    return { headers: ["Metric", "Value"], rows };
  }

  // Fall back to first array property.
  const firstArrKey = Object.keys(data).find((k) => Array.isArray((data as Record<string, unknown>)[k]));
  if (firstArrKey) {
    const arr = (data as Record<string, unknown>)[firstArrKey] as Array<Record<string, unknown>>;
    if (!arr.length) return { headers: [firstArrKey], rows: [] };
    const headers = Object.keys(arr[0]);
    const rows = arr.map((r) => headers.map((h) => {
      const v = r[h];
      return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : (v as string | number);
    }));
    return { headers, rows };
  }
  return { headers: ["data"], rows: [[JSON.stringify(data)]] };
}

function tabKey(tab: string): string {
  return ({
    executive: "executive", revenue: "revenue", stores: "stores",
    subscriptions: "subs", payments: "payments", financial: "financial",
    branches: "branches", users: "users", medicines: "medicines",
    audit: "audit", security: "security",
  } as Record<string, string>)[tab] ?? tab;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv(tab: string, filters: Filters, qc: ReturnType<typeof useQueryClient>) {
  const { headers, rows } = tabularForTab(tab, qc);
  const meta = [["# Report", tab], ["# From", filters.from], ["# To", filters.to]];
  const all = [...meta, headers, ...rows];
  const csv = all.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `report-${tab}-${Date.now()}.csv`);
}

async function exportExcel(tab: string, filters: Filters, qc: ReturnType<typeof useQueryClient>) {
  const XLSX = await import("xlsx");
  const { headers, rows } = tabularForTab(tab, qc);
  const ws = XLSX.utils.aoa_to_sheet([
    ["Report", tab], ["From", filters.from], ["To", filters.to], [],
    headers, ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tab.slice(0, 30));
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(new Blob([buf], { type: "application/octet-stream" }), `report-${tab}-${Date.now()}.xlsx`);
}

async function exportPdf(ref: React.RefObject<HTMLDivElement | null>, tab: string, _filters: Filters) {
  if (!ref.current) return;
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = (html2canvasMod as { default: (e: HTMLElement, o?: object) => Promise<HTMLCanvasElement> }).default;
  const canvas = await html2canvas(ref.current, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
  const pdf = new jsPDF("p", "mm", "a4");
  const imgData = canvas.toDataURL("image/png");
  const imgWidth = 190;
  const pageHeight = 297;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 10;
  pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(`report-${tab}-${Date.now()}.pdf`);
}
