import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { listExpenses } from "@/lib/api/finance.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/reports/pnl")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Profit & Loss — SohojPharma" }] }),
  component: PnLPage,
});

const fmt = (n: number) => `৳ ${Math.round(n).toLocaleString("en-IN")}`;

function PnLPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);

  const listExpFn = useServerFn(listExpenses);

  const { data: sales = [] } = useQuery({
    queryKey: ["pnl-sales", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("sales")
        .select("total,subtotal,is_return,sale_items(qty,unit_cost)")
        .eq("tenant_id", tenantId).neq("status", "void").gte("sale_date", from).lte("sale_date", to);
      return data ?? [];
    },
  });
  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ["pnl-expenses", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: () => listExpFn({ data: { tenant_id: tenantId, from, to, limit: 500 } }),
  });

  const revenue = sales.reduce((s, x) => s + (x.is_return ? -Number(x.total) : Number(x.total)), 0);
  const cogs = sales.reduce((sum, s) => {
    const lines = (s as unknown as { sale_items: { qty: number; unit_cost: number | null }[] }).sale_items ?? [];
    const lineCost = lines.reduce((c, l) => c + Number(l.qty) * Number(l.unit_cost ?? 0), 0);
    return sum + (s.is_return ? -lineCost : lineCost);
  }, 0);
  const opex = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const gross = revenue - cogs;
  const net = gross - opex;

  // Group expenses by account name for breakdown
  const expByAcc = new Map<string, number>();
  expenses.forEach((e) => {
    const acc = (e as unknown as { chart_of_accounts: { name: string } | null }).chart_of_accounts;
    const k = acc?.name ?? "Other";
    expByAcc.set(k, (expByAcc.get(k) ?? 0) + Number(e.amount));
  });

  return (
    <>
      <PageHeader title={t("rpt.pnl.title")} description={t("rpt.pnl.desc")} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">{t("rpt.pnl.from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" /></div>
        <div><Label className="text-xs">{t("rpt.pnl.to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" /></div>
      </div>
      {expLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("rpt.pnl.calculating")}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t("rpt.pnl.revenue.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={t("rpt.pnl.revenue.productSales")} value={fmt(revenue)} />
              <Row label={t("rpt.pnl.revenue.totalRevenue")} value={fmt(revenue)} bold />
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t("rpt.pnl.cost.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={t("rpt.pnl.cost.cogs")} value={fmt(cogs)} />
              {Array.from(expByAcc.entries()).map(([k, v]) => <Row key={k} label={k} value={fmt(v)} />)}
              <Row label={t("rpt.pnl.cost.totalCost")} value={fmt(cogs + opex)} bold />
            </CardContent>
          </Card>
          <Card className="shadow-card lg:col-span-2 bg-gradient-to-br from-primary/5 to-secondary/5">
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("rpt.pnl.grossProfit")}</p>
                <p className="mt-1 text-3xl font-bold text-primary">{fmt(gross)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("rpt.pnl.netProfit")}</p>
                <p className={`mt-1 text-3xl font-bold ${net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(net)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between border-b border-border/40 py-1.5 ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
