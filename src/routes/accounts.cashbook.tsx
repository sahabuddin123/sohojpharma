import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { getAccountLedger } from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";
import { useAccountsDateFilter } from "@/components/accounts/accounts-date-filter";

export const Route = createFileRoute("/accounts/cashbook")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Cashbook — SohojPharma" }] }),
  component: CashbookPage,
});

function CashbookPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { from, to } = useAccountsDateFilter();
  const [accountCode, setAccountCode] = useState("1000");

  const ledgerFn = useServerFn(getAccountLedger);
  const { data, isLoading } = useQuery({
    queryKey: ["cashbook", tenantId, accountCode, from, to],
    queryFn: () =>
      ledgerFn({ data: { tenant_id: tenantId, account_code: accountCode, from, to } }),
    enabled: !!tenantId,
  });

  type Line = {
    debit: number;
    credit: number;
    description: string | null;
    running_balance: number;
    journal_entries: { entry_no: string; entry_date: string; ref_no: string | null };
  };
  const lines: Line[] = (data?.lines as Line[] | undefined) ?? [];
  const totalIn = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalOut = lines.reduce((s, l) => s + Number(l.credit), 0);
  const closing = totalIn - totalOut;

  return (
    <>
      <PageHeader title={t("acct.cashbook.title")} description={t("acct.cashbook.desc")} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label>{t("acct.common.account")}</Label>
          <select value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className="block h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="1000">{t("acct.cashbook.cashOnHand")}</option>
            <option value="1010">{t("acct.cashbook.bankOpt")}</option>
            <option value="1020">{t("acct.cashbook.bkashRocket")}</option>
            <option value="1030">{t("acct.cashbook.nagadOpt")}</option>
          </select>
        </div>
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("acct.cashbook.cashIn")} value={`৳ ${totalIn.toLocaleString("en-IN")}`} icon={ArrowDownCircle} tone="success" />
        <StatCard label={t("acct.cashbook.cashOut")} value={`৳ ${totalOut.toLocaleString("en-IN")}`} icon={ArrowUpCircle} tone="warning" />
        <StatCard label={t("acct.cashbook.netForDay")} value={`৳ ${closing.toLocaleString("en-IN")}`} icon={Wallet} tone="primary" />
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{from === to ? t("acct.cashbook.transactionsOn", { date: from }) : `${from} → ${to}`}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("acct.cashbook.entryNo")}</TableHead><TableHead>{t("acct.common.description")}</TableHead><TableHead>{t("acct.common.ref")}</TableHead>
              <TableHead className="text-right">{t("acct.cashbook.in")}</TableHead><TableHead className="text-right">{t("acct.cashbook.out")}</TableHead><TableHead className="text-right">{t("acct.common.running")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t("acct.common.loading")}</TableCell></TableRow>
              ) : lines.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t("acct.cashbook.noEntries")}</TableCell></TableRow>
              ) : lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{l.journal_entries.entry_no}</TableCell>
                  <TableCell className="text-muted-foreground">{l.description ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.journal_entries.ref_no ?? "—"}</TableCell>
                  <TableCell className="text-right text-success">{l.debit ? `৳ ${Number(l.debit).toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell className="text-right text-warning">{l.credit ? `৳ ${Number(l.credit).toLocaleString("en-IN")}` : "—"}</TableCell>
                  <TableCell className="text-right font-semibold">৳ {l.running_balance.toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
