import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Landmark, ArrowDownCircle, ArrowUpCircle, Receipt, TrendingUp, Loader2 } from "lucide-react";
import { listExpenses, listIncomes, getAccountLedger } from "@/lib/api/finance.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/accounts/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Accounts — SohojPharma" }] }),
  component: AccountsDashboard,
});

function AccountsDashboard() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listExpFn = useServerFn(listExpenses);
  const listIncFn = useServerFn(listIncomes);
  const ledgerFn = useServerFn(getAccountLedger);

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-dash", tenantId],
    enabled: !!tenantId,
    queryFn: () => listExpFn({ data: { tenant_id: tenantId, from: monthStart, limit: 500 } }),
  });
  const { data: incomes = [] } = useQuery({
    queryKey: ["incomes-dash", tenantId],
    enabled: !!tenantId,
    queryFn: () => listIncFn({ data: { tenant_id: tenantId, from: monthStart, limit: 500 } }),
  });
  const { data: sales = [] } = useQuery({
    queryKey: ["sales-month", tenantId, monthStart],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("sales")
        .select("sale_date,total,is_return")
        .eq("tenant_id", tenantId).neq("status", "void").gte("sale_date", monthStart);
      return data ?? [];
    },
  });
  const { data: cashLedger } = useQuery({
    queryKey: ["cash-ledger", tenantId],
    enabled: !!tenantId,
    queryFn: () => ledgerFn({ data: { tenant_id: tenantId, account_code: "1000" } }),
  });
  const { data: bankLedger } = useQuery({
    queryKey: ["bank-ledger", tenantId],
    enabled: !!tenantId,
    queryFn: () => ledgerFn({ data: { tenant_id: tenantId, account_code: "1010" } }),
  });

  const todaysSales = sales.filter((s) => s.sale_date?.slice(0, 10) === today).reduce((s, x) => s + (x.is_return ? -Number(x.total) : Number(x.total)), 0);
  const monthlySales = sales.reduce((s, x) => s + (x.is_return ? -Number(x.total) : Number(x.total)), 0);
  const todaysIncome = incomes.filter((e) => e.income_date === today).reduce((s, e) => s + Number(e.amount), 0) + todaysSales;
  const monthlyIncome = incomes.reduce((s, e) => s + Number(e.amount), 0) + monthlySales;
  const todaysExpense = expenses.filter((e) => e.expense_date === today).reduce((s, e) => s + Number(e.amount), 0);
  const monthlyExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const loading = !cashLedger || !bankLedger;

  return (
    <>
      <PageHeader title={t("sections.accounts.title")} description={t("sections.accounts.desc")} />
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("sections.accounts.loading")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label={t("sections.accounts.cashInHand")} value={`৳ ${Math.round(cashLedger?.closing_balance ?? 0).toLocaleString()}`} icon={Wallet} tone="primary" />
            <StatCard label={t("sections.accounts.bankBalance")} value={`৳ ${Math.round(bankLedger?.closing_balance ?? 0).toLocaleString()}`} icon={Landmark} tone="secondary" />
            <StatCard label={t("sections.accounts.todayIncome")} value={`৳ ${Math.round(todaysIncome).toLocaleString()}`} icon={ArrowDownCircle} tone="success" />
            <StatCard label={t("sections.accounts.todayExpense")} value={`৳ ${Math.round(todaysExpense).toLocaleString()}`} icon={ArrowUpCircle} tone="warning" />
            <StatCard label={t("sections.accounts.monthlyIncome")} value={`৳ ${Math.round(monthlyIncome).toLocaleString()}`} icon={TrendingUp} tone="success" />
            <StatCard label={t("sections.accounts.monthlyExpense")} value={`৳ ${Math.round(monthlyExpense).toLocaleString()}`} icon={Receipt} tone="warning" />
          </div>
          <Card className="mt-6 shadow-card">
            <CardHeader><CardTitle className="text-base">{t("sections.accounts.monthGlance")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-3 text-sm">
                <div><div className="text-xs uppercase text-muted-foreground">{t("sections.accounts.sales")}</div><div className="text-2xl font-bold text-primary">৳ {Math.round(monthlySales).toLocaleString()}</div></div>
                <div><div className="text-xs uppercase text-muted-foreground">{t("sections.accounts.otherIncome")}</div><div className="text-2xl font-bold text-success">৳ {Math.round(incomes.reduce((s, e) => s + Number(e.amount), 0)).toLocaleString()}</div></div>
                <div><div className="text-xs uppercase text-muted-foreground">{t("sections.accounts.expenses")}</div><div className="text-2xl font-bold text-warning">৳ {Math.round(monthlyExpense).toLocaleString()}</div></div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
