import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { customerDashboard } from "@/lib/api/customer-analytics.functions";
import { Loader2, Users, TrendingUp, Wallet, ArrowRight } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/customers/dashboard")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Dashboard — SohojPharma" }] }),
  component: Page,
});

const fmt = (n: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#8b5cf6"];

function Page() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(customerDashboard);
  const q = useQuery({
    queryKey: ["customer-dashboard", tenantId],
    queryFn: () => fn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  if (q.isLoading || !q.data)
    return (
      <AppShell variant="store">
        <PageHeader title="Customer Dashboard" />
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );

  const d = q.data;
  const kpis = [
    { label: "Total Customers", value: fmt(d.kpis.total), icon: Users },
    { label: "New This Month", value: fmt(d.kpis.newThisMonth), icon: TrendingUp },
    { label: "Active", value: fmt(d.kpis.active), icon: Users },
    { label: "Inactive", value: fmt(d.kpis.inactive), icon: Users },
    { label: "Total Due", value: fmt2(d.kpis.totalDue), icon: Wallet },
    { label: "Month Revenue", value: fmt2(d.kpis.monthRevenue), icon: TrendingUp },
    { label: "Month Collections", value: fmt2(d.kpis.monthCollections), icon: Wallet },
  ];

  return (
    <AppShell variant="store">
      <PageHeader
        title="Customer Dashboard"
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/reports/customer-analytics">Analytics</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/customers/reminders">Reminders</Link></Button>
            <Button asChild size="sm"><Link to="/customers">All Customers</Link></Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <k.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-1 text-xl font-semibold">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Customer Growth</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={d.growth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" /><YAxis />
                <Tooltip /><Bar dataKey="count" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Customer Type</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.typeDist} dataKey="count" nameKey="name" outerRadius={90} label>
                  {d.typeDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Top Customers This Month</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {d.top.length === 0 && <div className="p-6 text-sm text-muted-foreground">No sales this month yet.</div>}
            {d.top.map((c) => (
              <Link
                key={c.id}
                to="/customers/$id"
                params={{ id: c.id }}
                className="flex items-center justify-between p-3 hover:bg-muted/40"
              >
                <div className="font-medium">{c.name}</div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{fmt2(c.total)}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
