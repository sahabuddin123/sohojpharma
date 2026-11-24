import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DollarSign, ShoppingCart, TrendingUp, Wallet, Package, Receipt, CreditCard, Banknote } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reports/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Executive Dashboard — SohojPharma" }] }),
  component: ExecutiveDashboard,
});

function ExecutiveDashboard() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";

  const { data } = useQuery({
    queryKey: ["exec-kpis", tenantId, monthStart],
    enabled: !!tenantId,
    queryFn: async () => {
      const [sales, pos, exp, batches, cashAccts, payments, customers] = await Promise.all([
        supabase.from("sales").select("total").eq("tenant_id", tenantId).neq("status", "void").gte("sale_date", monthStart),
        supabase.from("purchase_orders").select("total").eq("tenant_id", tenantId).gte("order_date", monthStart),
        supabase.from("expenses").select("amount").eq("tenant_id", tenantId).gte("expense_date", monthStart),
        supabase.from("batches").select("qty_on_hand,purchase_price").eq("tenant_id", tenantId),
        supabase.from("chart_of_accounts").select("id,code").eq("tenant_id", tenantId).in("code", ["1000","1010","1020","1030"]),
        supabase.from("customer_payments").select("amount").eq("tenant_id", tenantId).gte("payment_date", monthStart),
        supabase.from("v_customer_due").select("due_balance").eq("tenant_id", tenantId),
      ]);

      const totalSales = (sales.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const totalPurchase = (pos.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const totalExp = (exp.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const invValue = (batches.data ?? []).reduce((s, r) => s + Number(r.qty_on_hand ?? 0) * Number(r.purchase_price ?? 0), 0);
      const dueCollection = (payments.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const outstandingDue = (customers.data ?? []).reduce((s, r) => s + Number(r.due_balance ?? 0), 0);

      // Cash balance from journal_lines on cash/bank accounts
      let cashBalance = 0;
      const ids = (cashAccts.data ?? []).map((a) => a.id);
      if (ids.length > 0) {
        const { data: lines } = await supabase
          .from("journal_lines")
          .select("debit,credit")
          .eq("tenant_id", tenantId)
          .in("account_id", ids);
        cashBalance = (lines ?? []).reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0);
      }

      const grossProfit = totalSales - totalPurchase;
      const netProfit = grossProfit - totalExp;

      return { totalSales, totalPurchase, totalExp, invValue, dueCollection, outstandingDue, cashBalance, grossProfit, netProfit };
    },
  });

  const fmt = (n: number) => `৳ ${Number(n ?? 0).toLocaleString("en-IN")}`;
  const k = useMemo(() => data ?? { totalSales:0,totalPurchase:0,totalExp:0,invValue:0,dueCollection:0,outstandingDue:0,cashBalance:0,grossProfit:0,netProfit:0 }, [data]);

  return (
    <>
      <PageHeader title={t("sections.reports.title")} description={t("sections.reports.desc")} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("sections.reports.totalSales")} value={fmt(k.totalSales)} icon={ShoppingCart} tone="primary" />
        <StatCard label={t("sections.reports.totalPurchase")} value={fmt(k.totalPurchase)} icon={Package} tone="secondary" />
        <StatCard label={t("sections.reports.grossProfit")} value={fmt(k.grossProfit)} icon={TrendingUp} tone="success" />
        <StatCard label={t("sections.reports.netProfit")} value={fmt(k.netProfit)} icon={DollarSign} tone="success" />
        <StatCard label={t("sections.reports.expenses")} value={fmt(k.totalExp)} icon={Receipt} tone="warning" />
        <StatCard label={t("sections.reports.dueCollection")} value={fmt(k.dueCollection)} icon={CreditCard} tone="primary" />
        <StatCard label={t("sections.reports.invValue")} value={fmt(k.invValue)} icon={Package} tone="secondary" />
        <StatCard label={t("sections.reports.cashBalance")} value={fmt(k.cashBalance)} icon={Banknote} tone="success" />
        <StatCard label={t("sections.reports.outstandingDue")} value={fmt(k.outstandingDue)} icon={Wallet} tone="warning" />
      </div>
    </>
  );
}
