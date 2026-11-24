import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { customerAnalytics } from "@/lib/api/customer-analytics.functions";
import { Loader2 } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/reports/customer-analytics")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Analytics — SohojPharma" }] }),
  component: Page,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function Page() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(customerAnalytics);
  const q = useQuery({
    queryKey: ["customer-analytics", tenantId],
    queryFn: () => fn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  if (q.isLoading)
    return (
      <AppShell variant="store">
        <PageHeader title="Customer Analytics" />
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );

  const d = q.data;
  if (!d) return null;

  return (
    <AppShell variant="store">
      <PageHeader title="Customer Analytics" description="Last 12 months" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Total Customers", fmt(d.kpis.total)],
          ["Repeat (≥3 orders)", fmt(d.kpis.repeat)],
          ["Inactive (>90d)", fmt(d.kpis.inactive)],
          ["New (30d)", fmt(d.kpis.newThisMonth)],
          ["Avg Basket", fmt2(d.kpis.avgBasket)],
          ["Avg Purchase Freq", d.kpis.avgFreq.toFixed(2)],
          ["Customer LTV", fmt2(d.kpis.ltv)],
          ["Total Revenue", fmt2(d.kpis.totalRevenue)],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="mt-1 text-xl font-semibold">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Monthly Sales</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={d.monthlySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" /><YAxis />
                <Tooltip /><Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Customer Growth</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={d.growth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" /><YAxis />
                <Tooltip /><Bar dataKey="count" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Segments</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.segments} dataKey="count" nameKey="name" outerRadius={90} label>
                  {d.segments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top 20 Customers</CardTitle></CardHeader>
          <CardContent className="max-h-[280px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Customer</TableHead><TableHead>Orders</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {d.top.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone ?? "—"}</div>
                    </TableCell>
                    <TableCell>{c.order_count}</TableCell>
                    <TableCell className="text-right">{fmt2(c.total_sales)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>All Customers</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead><TableHead>Type</TableHead>
                <TableHead>Orders</TableHead><TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Avg Basket</TableHead><TableHead className="text-right">Due</TableHead>
                <TableHead>Last Purchase</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.customers.slice(0, 200).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                  <TableCell>{c.order_count}</TableCell>
                  <TableCell className="text-right">{fmt2(c.total_sales)}</TableCell>
                  <TableCell className="text-right">{fmt2(c.avg_basket)}</TableCell>
                  <TableCell className="text-right">{fmt2(c.due_balance)}</TableCell>
                  <TableCell className="text-xs">{c.last_purchase ? new Date(c.last_purchase).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
