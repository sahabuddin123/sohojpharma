// E19 — Executive dashboard route with KPI cards, sales/product/inventory/customer/supplier/clinical/alerts/forecast tabs, and Excel export.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";
import {
  executiveKpis, salesSeries, productAnalytics, inventoryAging,
  customerAnalytics, supplierAnalytics, clinicalAnalytics,
  listExecutiveAlerts, acknowledgeAlert, detectExecutiveAlerts,
} from "@/lib/api/bi.functions";
import { linearForecast, movingAverage, type Point } from "@/lib/bi/forecast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorPanel } from "@/components/route-error";
import { Download, AlertTriangle, TrendingDown, TrendingUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/executive")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
  head: () => ({
    meta: [
      { title: "Executive Dashboard — SohojPharma" },
      { name: "description", content: "Revenue, profit, inventory turnover, customer growth, supplier exposure, forecasts, and executive alerts." },
    ],
  }),
  component: ExecutivePage,
});

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n ?? 0);

function KpiCard({ label, value, delta, accent }: { label: string; value: string; delta?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
        {delta && <div className="mt-0.5 text-xs text-muted-foreground">{delta}</div>}
      </CardContent>
    </Card>
  );
}

function ExecutivePage() {
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const [days, setDays] = useState(30);

  const fromTo = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const tenant = currentTenantId ?? "";
  const enabled = !!tenant;

  const kpiQ = useQuery({
    queryKey: ["bi-kpis", tenant, days],
    queryFn: () => executiveKpis({ data: { tenant_id: tenant, ...fromTo } }),
    enabled,
  });
  const seriesQ = useQuery({
    queryKey: ["bi-series", tenant, days],
    queryFn: () => salesSeries({ data: { tenant_id: tenant, ...fromTo } }),
    enabled,
  });
  const prodQ = useQuery({
    queryKey: ["bi-prod", tenant],
    queryFn: () => productAnalytics({ data: { tenant_id: tenant } }),
    enabled,
  });
  const invQ = useQuery({
    queryKey: ["bi-inv", tenant],
    queryFn: () => inventoryAging({ data: { tenant_id: tenant } }),
    enabled,
  });
  const custQ = useQuery({
    queryKey: ["bi-cust", tenant],
    queryFn: () => customerAnalytics({ data: { tenant_id: tenant } }),
    enabled,
  });
  const supQ = useQuery({
    queryKey: ["bi-sup", tenant],
    queryFn: () => supplierAnalytics({ data: { tenant_id: tenant } }),
    enabled,
  });
  const clinQ = useQuery({
    queryKey: ["bi-clin", tenant],
    queryFn: () => clinicalAnalytics({ data: { tenant_id: tenant } }),
    enabled,
  });
  const alertsQ = useQuery({
    queryKey: ["bi-alerts", tenant],
    queryFn: () => listExecutiveAlerts({ data: { tenant_id: tenant } }),
    enabled,
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => acknowledgeAlert({ data: { id } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["bi-alerts", tenant] }); toast.success("Alert acknowledged"); },
  });
  const detectMut = useMutation({
    mutationFn: () => detectExecutiveAlerts({ data: { tenant_id: tenant } }),
    onSuccess: (r) => { toast.success(`Detected ${r.created} new alert(s)`); void qc.invalidateQueries({ queryKey: ["bi-alerts", tenant] }); },
  });

  const forecast = useMemo(() => {
    const history: Point[] = (seriesQ.data ?? []).map((r) => ({ date: r.day, value: Number(r.revenue ?? 0) }));
    const f = linearForecast(history, 30);
    const ma = movingAverage(history, 7);
    return { history, forecast: f, ma };
  }, [seriesQ.data]);

  if (!currentTenantId) {
    return <div className="p-6 text-muted-foreground">Select a store to view executive analytics.</div>;
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const kpi = kpiQ.data;
    if (kpi) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
        Revenue: kpi.revenue, "Gross Profit": kpi.grossProfit, COGS: kpi.cogs,
        "Inventory Value": kpi.inventoryValue, "Stock Turnover": kpi.stockTurnover.toFixed(2),
        "Avg Basket": kpi.avgBasket.toFixed(2), "Txn Count": kpi.txnCount,
        "Customer Growth (30d)": kpi.customerGrowth, "Supplier Exposure": kpi.supplierExposure,
      }]), "KPIs");
    }
    if (seriesQ.data) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seriesQ.data), "Sales daily");
    if (prodQ.data) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prodQ.data.topSellers), "Top sellers");
    if (custQ.data) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custQ.data.topCustomers), "Top customers");
    if (supQ.data) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supQ.data.topSuppliers), "Top suppliers");
    if (forecast.forecast.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(forecast.forecast), "Forecast 30d");
    XLSX.writeFile(wb, `sohojpharma-executive-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time KPIs · last {days} days</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${detectMut.isPending ? "animate-spin" : ""}`} /> Scan alerts
          </Button>
          <Button size="sm" onClick={exportExcel}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiQ.isLoading || !kpiQ.data ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <KpiCard label="Revenue" value={`৳${fmt(kpiQ.data.revenue)}`} />
            <KpiCard label="Gross Profit" value={`৳${fmt(kpiQ.data.grossProfit)}`} accent="text-emerald-600" />
            <KpiCard label="COGS" value={`৳${fmt(kpiQ.data.cogs)}`} />
            <KpiCard label="Inventory Value" value={`৳${fmt(kpiQ.data.inventoryValue)}`} />
            <KpiCard label="Stock Turnover" value={kpiQ.data.stockTurnover.toFixed(2)} delta="revenue / inventory" />
            <KpiCard label="Avg Basket" value={`৳${fmt(kpiQ.data.avgBasket)}`} />
            <KpiCard label="New Customers (30d)" value={fmt(kpiQ.data.customerGrowth)} />
            <KpiCard label="Supplier Exposure" value={`৳${fmt(kpiQ.data.supplierExposure)}`} accent="text-amber-600" />
          </>
        )}
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="clinical">Clinical</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <Card>
            <CardHeader><CardTitle>Daily revenue + 7-day moving average</CardTitle></CardHeader>
            <CardContent style={{ height: 320 }}>
              {seriesQ.isLoading ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={seriesQ.data ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.2} name="Revenue" />
                    <Line type="monotone" dataKey="gross_profit" stroke={COLORS[1]} name="Gross Profit" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { title: "Top sellers (30d)", rows: prodQ.data?.topSellers ?? [], icon: TrendingUp },
              { title: "Slow movers", rows: prodQ.data?.slowMovers ?? [], icon: TrendingDown },
              { title: "Dead stock (no sales 60d+)", rows: prodQ.data?.deadStock ?? [], icon: AlertTriangle },
              { title: "High margin", rows: prodQ.data?.highMargin ?? [], icon: TrendingUp },
            ].map(({ title, rows, icon: Icon }) => (
              <Card key={title}>
                <CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-4 w-4" />{title}</CardTitle></CardHeader>
                <CardContent>
                  {prodQ.isLoading ? <Skeleton className="h-40" /> : (
                    <div className="space-y-1 text-sm">
                      {rows.slice(0, 8).map((p) => (
                        <div key={p.product_id} className="flex justify-between border-b py-1 last:border-0">
                          <span className="truncate">{p.name}</span>
                          <span className="text-muted-foreground">৳{fmt(Number(p.revenue_30d))} · {Number(p.margin_pct).toFixed(0)}%</span>
                        </div>
                      ))}
                      {rows.length === 0 && <div className="text-xs text-muted-foreground">No data.</div>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="inventory">
          <Card>
            <CardHeader><CardTitle>Inventory aging</CardTitle></CardHeader>
            <CardContent style={{ height: 320 }}>
              {invQ.isLoading || !invQ.data ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { bucket: "0–30", count: invQ.data.totals.aging_0_30 },
                    { bucket: "31–60", count: invQ.data.totals.aging_31_60 },
                    { bucket: "61–90", count: invQ.data.totals.aging_61_90 },
                    { bucket: "90+", count: invQ.data.totals.aging_90_plus },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill={COLORS[2]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle>Top customers</CardTitle>
              {custQ.data && (
                <div className="text-xs text-muted-foreground">
                  Repeat rate {custQ.data.repeatRate.toFixed(1)}% · Avg LTV ৳{fmt(custQ.data.ltv)} · {custQ.data.totalCustomers} customers
                </div>
              )}
            </CardHeader>
            <CardContent>
              {custQ.isLoading ? <Skeleton className="h-40" /> : (
                <div className="space-y-1 text-sm">
                  {(custQ.data?.topCustomers ?? []).map((c) => (
                    <div key={c.customer_id} className="flex justify-between border-b py-1 last:border-0">
                      <span className="truncate">{c.name}</span>
                      <span className="text-muted-foreground">৳{fmt(Number(c.total_spent))} · {Number(c.purchase_count)} orders</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers">
          <Card>
            <CardHeader>
              <CardTitle>Top suppliers</CardTitle>
              {supQ.data && (
                <div className="text-xs text-muted-foreground">
                  Top-5 concentration {supQ.data.top5ConcentrationPct.toFixed(1)}% · Total purchased ৳{fmt(supQ.data.totalPurchased)}
                </div>
              )}
            </CardHeader>
            <CardContent style={{ height: 320 }}>
              {supQ.isLoading || !supQ.data ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={supQ.data.topSuppliers.slice(0, 6)} dataKey="total_purchased" nameKey="name" outerRadius={110} label>
                      {supQ.data.topSuppliers.slice(0, 6).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinical">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Top doctors (90d)</CardTitle></CardHeader>
              <CardContent>
                {clinQ.isLoading ? <Skeleton className="h-40" /> : (
                  <div className="space-y-1 text-sm">
                    {(clinQ.data?.topDoctors ?? []).map((d) => (
                      <div key={d.id} className="flex justify-between border-b py-1 last:border-0">
                        <span className="truncate font-mono text-xs">{d.id.slice(0, 8)}…</span>
                        <span className="text-muted-foreground">{d.count} Rx</span>
                      </div>
                    ))}
                    {(clinQ.data?.topDoctors ?? []).length === 0 && <div className="text-xs text-muted-foreground">No data.</div>}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top diagnoses (90d)</CardTitle></CardHeader>
              <CardContent>
                {clinQ.isLoading ? <Skeleton className="h-40" /> : (
                  <div className="space-y-1 text-sm">
                    {(clinQ.data?.topDiagnoses ?? []).map((d) => (
                      <div key={d.name} className="flex justify-between border-b py-1 last:border-0">
                        <span className="truncate">{d.name}</span>
                        <span className="text-muted-foreground">{d.count}</span>
                      </div>
                    ))}
                    {(clinQ.data?.topDiagnoses ?? []).length === 0 && <div className="text-xs text-muted-foreground">No data.</div>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader><CardTitle>Executive alerts</CardTitle></CardHeader>
            <CardContent>
              {alertsQ.isLoading ? <Skeleton className="h-40" /> : (
                <div className="space-y-2">
                  {(alertsQ.data ?? []).map((a) => (
                    <div key={a.id} className="flex items-start justify-between rounded border p-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Badge variant={a.severity === "critical" ? "destructive" : "outline"}>{a.severity}</Badge>
                          {a.title}
                          {a.acknowledged && <Badge variant="secondary">Acknowledged</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{a.message}</div>
                        <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                      </div>
                      {!a.acknowledged && (
                        <Button size="sm" variant="ghost" onClick={() => ackMut.mutate(a.id)}>
                          Ack
                        </Button>
                      )}
                    </div>
                  ))}
                  {(alertsQ.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">No alerts. Click "Scan alerts".</div>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast">
          <Card>
            <CardHeader><CardTitle>30-day revenue forecast (linear regression)</CardTitle></CardHeader>
            <CardContent style={{ height: 320 }}>
              {seriesQ.isLoading ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[
                    ...forecast.history.map((p) => ({ date: p.date, actual: p.value, ma: undefined as number | undefined, forecast: undefined as number | undefined })),
                    ...forecast.ma.map((p, i) => ({ date: p.date, actual: undefined, ma: p.value, forecast: undefined })).slice(forecast.history.length, forecast.history.length),
                    ...forecast.forecast.map((p) => ({ date: p.date, actual: undefined, ma: undefined, forecast: p.value })),
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="actual" stroke={COLORS[0]} name="Actual" dot={false} />
                    <Line type="monotone" dataKey="forecast" stroke={COLORS[3]} strokeDasharray="4 4" name="Forecast" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
