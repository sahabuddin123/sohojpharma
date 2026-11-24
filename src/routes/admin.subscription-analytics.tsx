import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  Users,
  Activity,
  Repeat,
  UserMinus,
  UserPlus,
  LineChart as LineIcon,
} from "lucide-react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Download, FileSpreadsheet, FileText, Printer, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { RouteErrorPanel } from "@/components/route-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminSubscriptionAnalytics,
  listPlansPublic,
} from "@/lib/api/subscriptions.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/subscription-analytics")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Subscription Analytics — Super Admin" }] }),
  component: SubscriptionAnalyticsPage,
});

const STATUS_OPTIONS = [
  "trial", "active", "past_due", "grace_period", "expired", "cancelled", "suspended",
] as const;
const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

function toISO(d: string) {
  return d ? new Date(d + "T00:00:00").toISOString() : "";
}

function downloadBlob(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function SubscriptionAnalyticsPage() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400000);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [planId, setPlanId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const analyticsFn = useServerFn(adminSubscriptionAnalytics);
  const plansFn = useServerFn(listPlansPublic);

  const plansQ = useQuery({ queryKey: ["plans-public"], queryFn: () => plansFn() });

  const filters = useMemo(
    () => ({
      from: toISO(from),
      to: new Date(toISO(to)).toISOString().replace(/00:00:00\.000Z$/, "23:59:59.999Z"),
      plan_id: planId === "all" ? undefined : planId,
      status: status === "all" ? undefined : (status as any),
    }),
    [from, to, planId, status],
  );

  const q = useQuery({
    queryKey: ["sub-analytics", filters],
    queryFn: () => analyticsFn({ data: filters }),
    refetchInterval: 30_000,
  });

  // Realtime invalidation when subscriptions / invoices / history change
  useEffect(() => {
    const ch = supabase
      .channel("subscription-analytics")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_invoices" }, () => q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_history" }, () => q.refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const a = q.data;
  const kpis = a?.kpis;
  const charts = a?.charts;

  const fmtBDT = (n: number) =>
    new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);

  const exportCsv = () => {
    if (!charts) return;
    const rows = charts.revenueTrend.map((r, i) => ({
      date: r.date,
      revenue: r.value,
      new_subscriptions: charts.subscriptionTrend[i]?.value ?? 0,
      churn: charts.churnTrend[i]?.value ?? 0,
      upgrades: charts.upgradeDowngradeTrend[i]?.upgrades ?? 0,
      downgrades: charts.upgradeDowngradeTrend[i]?.downgrades ?? 0,
    }));
    downloadBlob(`subscription-analytics-${from}_${to}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  };

  const exportExcel = () => {
    if (!charts) return;
    // Excel-compatible TSV (.xls opens cleanly in Excel)
    const rows = charts.revenueTrend.map((r, i) => ({
      Date: r.date,
      Revenue: r.value,
      "New Subs": charts.subscriptionTrend[i]?.value ?? 0,
      Churn: charts.churnTrend[i]?.value ?? 0,
      Upgrades: charts.upgradeDowngradeTrend[i]?.upgrades ?? 0,
      Downgrades: charts.upgradeDowngradeTrend[i]?.downgrades ?? 0,
    }));
    const header = Object.keys(rows[0]).join("\t");
    const body = rows.map((r) => Object.values(r).join("\t")).join("\n");
    downloadBlob(`subscription-analytics-${from}_${to}.xls`, header + "\n" + body, "application/vnd.ms-excel");
  };

  const exportPdf = () => window.print();

  return (
    <AppShell variant="admin" title="Subscription Analytics">
      <PageHeader
        title="Subscription Analytics"
        description="Real-time MRR, ARR, churn, LTV and growth KPIs from live data."
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => q.refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf}>
              <Printer className="h-4 w-4 mr-1" /> PDF
            </Button>
          </div>
        }
      />

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  {(plansQ.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="MRR" value={fmtBDT(kpis?.mrr ?? 0)} tone="success" />
        <StatCard icon={TrendingUp} label="ARR" value={fmtBDT(kpis?.arr ?? 0)} tone="success" />
        <StatCard icon={Users} label="Active Subscribers" value={String(kpis?.activeSubscribers ?? 0)} />
        <StatCard icon={Activity} label="ARPU" value={fmtBDT(kpis?.arpu ?? 0)} />
        <StatCard icon={LineIcon} label="LTV" value={fmtBDT(kpis?.ltv ?? 0)} />
        <StatCard icon={UserMinus} label="Churn Rate" value={`${kpis?.churnRate ?? 0}%`} tone="warning" />
        <StatCard icon={UserPlus} label="Trial Conversion" value={`${kpis?.trialConversionRate ?? 0}%`} tone="secondary" />
        <StatCard
          icon={Repeat}
          label="Revenue Growth"
          value={`${(kpis?.revenueGrowth ?? 0) >= 0 ? "+" : ""}${kpis?.revenueGrowth ?? 0}%`}
          tone={(kpis?.revenueGrowth ?? 0) >= 0 ? "success" : "warning"}
        />

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue Trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts?.revenueTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => fmtBDT(v)} />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">New Subscriptions</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.subscriptionTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Churn Trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts?.churnTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Upgrade / Downgrade Trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.upgradeDowngradeTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="upgrades" fill="#10b981" />
                <Bar dataKey="downgrades" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Plan Distribution</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts?.planDistribution ?? []}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={(d: any) => `${d.name}: ${d.count}`}
                >
                  {(charts?.planDistribution ?? []).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, _n, p: any) => [`${v} subs · ${fmtBDT(p.payload.mrr)} MRR`, p.payload.name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
