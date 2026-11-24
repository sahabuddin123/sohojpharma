import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, UserPlus, Repeat } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reports/customers")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Analytics — SohojPharma" }] }),
  component: CustomerAnalyticsPage,
});

function CustomerAnalyticsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const { data: customers = [] } = useQuery({
    queryKey: ["rep-customers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,due_balance,created_at").eq("tenant_id", tenantId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["rep-customer-sales", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("customer_id,total").eq("tenant_id", tenantId).neq("status", "void");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const cMap = new Map<string, { name: string; due: number }>();
    for (const c of customers as Array<{ id: string; name: string; due_balance: number | null }>) {
      cMap.set(c.id, { name: c.name, due: Number(c.due_balance ?? 0) });
    }
    const agg = new Map<string, { name: string; purchases: number; value: number; due: number }>();
    for (const s of sales as Array<{ customer_id: string | null; total: number | null }>) {
      if (!s.customer_id) continue;
      const c = cMap.get(s.customer_id);
      if (!c) continue;
      const cur = agg.get(s.customer_id) ?? { name: c.name, purchases: 0, value: 0, due: c.due };
      cur.purchases += 1;
      cur.value += Number(s.total ?? 0);
      agg.set(s.customer_id, cur);
    }
    const top = Array.from(agg.values()).sort((a, b) => b.value - a.value).slice(0, 10);
    const now = Date.now();
    const thirtyDays = 30 * 86400000;
    const newCust = (customers as Array<{ created_at: string }>).filter(
      (c) => now - new Date(c.created_at).getTime() < thirtyDays,
    ).length;
    return { active: customers.length, newCust, repeat: Array.from(agg.values()).filter((c) => c.purchases > 1).length, top };
  }, [customers, sales]);

  return (
    <>
      <PageHeader title={t("rpt.customers.title")} description={t("rpt.customers.desc")} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("rpt.customers.activeCustomers")} value={stats.active.toString()} icon={Users} tone="primary" />
        <StatCard label={t("rpt.customers.newThirtyDays")} value={stats.newCust.toString()} icon={UserPlus} tone="success" />
        <StatCard label={t("rpt.customers.returning")} value={stats.repeat.toString()} icon={Repeat} tone="secondary" />
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("rpt.customers.topCustomers")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("rpt.customers.col.customer")}</TableHead>
              <TableHead className="text-right">{t("rpt.customers.col.purchases")}</TableHead>
              <TableHead className="text-right">{t("rpt.customers.col.value")}</TableHead>
              <TableHead className="text-right">{t("rpt.customers.col.due")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {stats.top.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t("rpt.customers.empty")}</TableCell></TableRow>
              ) : stats.top.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.purchases}</TableCell>
                  <TableCell className="text-right">৳ {r.value.toLocaleString("en-IN")}</TableCell>
                  <TableCell className={`text-right ${r.due > 0 ? "text-destructive" : "text-muted-foreground"}`}>৳ {r.due.toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
