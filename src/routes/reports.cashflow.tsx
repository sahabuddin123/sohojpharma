import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reports/cashflow")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Cash Flow — SohojPharma" }] }),
  component: CashFlowPage,
});

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function CashFlowPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const year = new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data: lines = [] } = useQuery({
    queryKey: ["cashflow", tenantId, year],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: accts } = await supabase
        .from("chart_of_accounts")
        .select("id,code")
        .eq("tenant_id", tenantId)
        .in("code", ["1000", "1010", "1020", "1030"]);
      const ids = (accts ?? []).map((a) => a.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("journal_lines")
        .select("debit,credit,journal_entries!inner(entry_date)")
        .eq("tenant_id", tenantId)
        .in("account_id", ids)
        .gte("journal_entries.entry_date", from)
        .lte("journal_entries.entry_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthly = useMemo(() => {
    const rows = MONTHS.map((m) => ({ m, in: 0, out: 0 }));
    for (const l of lines as Array<{ debit: number; credit: number; journal_entries: { entry_date: string } }>) {
      const mi = new Date(l.journal_entries.entry_date).getMonth();
      rows[mi].in += Number(l.debit ?? 0);
      rows[mi].out += Number(l.credit ?? 0);
    }
    return rows;
  }, [lines]);

  const totals = useMemo(() => {
    const ci = monthly.reduce((s, r) => s + r.in, 0);
    const co = monthly.reduce((s, r) => s + r.out, 0);
    return { ci, co, net: ci - co };
  }, [monthly]);

  return (
    <>
      <PageHeader title={t("rpt.cashflow.title")} description={t("rpt.cashflow.desc", { year })} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("rpt.cashflow.cashIn")} value={`৳ ${totals.ci.toLocaleString("en-IN")}`} icon={ArrowDownCircle} tone="success" />
        <StatCard label={t("rpt.cashflow.cashOut")} value={`৳ ${totals.co.toLocaleString("en-IN")}`} icon={ArrowUpCircle} tone="warning" />
        <StatCard label={t("rpt.cashflow.netCashFlow")} value={`৳ ${totals.net.toLocaleString("en-IN")}`} icon={Wallet} tone="primary" />
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("rpt.cashflow.chartTitle")}</CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="in" name={t("rpt.cashflow.cashIn")} fill="var(--color-success)" radius={[6,6,0,0]} />
              <Bar dataKey="out" name={t("rpt.cashflow.cashOut")} fill="var(--color-warning)" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
}
