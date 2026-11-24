import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { listExpenses, listIncomes, getAccountLedger } from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";
import { useAccountsDateFilter } from "@/components/accounts/accounts-date-filter";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/accounts/day-closing")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Day Closing — SohojPharma" }] }),
  component: DayClosingPage,
});

function DayClosingPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { from, to } = useAccountsDateFilter();
  const [counted, setCounted] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  const expFn = useServerFn(listExpenses);
  const incFn = useServerFn(listIncomes);
  const ledgerFn = useServerFn(getAccountLedger);

  const { data: sales = [] } = useQuery({
    queryKey: ["dc-sales", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total, status")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .gte("sale_date", from)
        .lte("sale_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["dc-exp", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: () => expFn({ data: { tenant_id: tenantId, from, to } }),
  });
  const { data: incomes = [] } = useQuery({
    queryKey: ["dc-inc", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: () => incFn({ data: { tenant_id: tenantId, from, to } }),
  });
  const { data: cashLedger } = useQuery({
    queryKey: ["dc-cash", tenantId, to],
    enabled: !!tenantId,
    queryFn: () => ledgerFn({ data: { tenant_id: tenantId, account_code: "1000", to } }),
  });

  const summary = useMemo(() => {
    const salesTotal = (sales as Array<{ total: number }>).reduce((s, r) => s + Number(r.total ?? 0), 0);
    const expTotal = (expenses as Array<{ amount: number }>).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const incTotal = (incomes as Array<{ amount: number }>).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const expectedCash = Number(cashLedger?.closing_balance ?? 0);
    return { salesTotal, expTotal, incTotal, expectedCash };
  }, [sales, expenses, incomes, cashLedger]);

  const difference = counted === "" ? 0 : Number(counted) - summary.expectedCash;

  const summaryRows = [
    { label: t("acct.dayClose.salesTotal"),    value: summary.salesTotal,    tone: "text-success" },
    { label: t("acct.dayClose.expensesTotal"), value: summary.expTotal,      tone: "text-warning" },
    { label: t("acct.dayClose.incomeOther"),   value: summary.incTotal,      tone: "text-success" },
    { label: t("acct.dayClose.expectedCash"),  value: summary.expectedCash,  tone: "text-foreground font-bold" },
  ];

  return (
    <>
      <PageHeader title={t("acct.dayClose.title")} description={`${t("acct.dayClose.desc")} (${from} → ${to})`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader><CardTitle className="text-base">{t("acct.dayClose.dayEndSummary")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {summaryRows.map((s) => (
              <div key={s.label} className="flex justify-between border-b border-border/40 py-2">
                <span className="text-muted-foreground">{s.label}</span>
                <span className={s.tone}>৳ {s.value.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">{t("acct.dayClose.cashVerification")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>{t("acct.dayClose.countedCash")}</Label>
              <Input type="number" placeholder="0.00" value={counted} onChange={(e) => setCounted(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div>
              <Label>{t("acct.dayClose.difference")}</Label>
              <Input value={`৳ ${difference.toLocaleString("en-IN")}`} readOnly className={difference !== 0 ? "text-destructive" : ""} />
            </div>
            <div>
              <Label>{t("acct.common.notes")}</Label>
              <Input placeholder={t("acct.dayClose.optional")} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button
              className="w-full"
              onClick={() => toast.success(t("acct.dayClose.closedToast", { date, diff: difference.toLocaleString("en-IN") }))}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> {t("acct.dayClose.closeDay")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
