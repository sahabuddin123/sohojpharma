import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, Loader2 } from "lucide-react";
import { listAccounts, getAccountLedger } from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/accounts/banks")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Bank & Cash — SohojPharma" }] }),
  component: BanksPage,
});

function BanksPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listAccFn = useServerFn(listAccounts);
  const ledgerFn = useServerFn(getAccountLedger);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["accounts", tenantId, "asset"],
    enabled: !!tenantId,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "asset" } }),
  });

  const cashLike = assets.filter((a) => /^10\d{2}$/.test(a.code));

  const balances = useQuery({
    queryKey: ["account-balances", tenantId, cashLike.map((a) => a.code).join(",")],
    enabled: !!tenantId && cashLike.length > 0,
    queryFn: async () => {
      const out: { code: string; name: string; balance: number }[] = [];
      for (const a of cashLike) {
        const led = await ledgerFn({ data: { tenant_id: tenantId, account_code: a.code } });
        out.push({ code: a.code, name: a.name, balance: led.closing_balance });
      }
      return out;
    },
  });

  const totalCash = (balances.data ?? []).reduce((s, b) => s + b.balance, 0);

  return (
    <>
      <PageHeader title={t("acct.banks.title")} description={t("acct.banks.desc")} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("acct.banks.totalCashBank")} value={`৳ ${Math.round(totalCash).toLocaleString()}`} icon={Landmark} tone="primary" />
        <StatCard label={t("acct.banks.accounts")} value={String(cashLike.length)} icon={Landmark} tone="secondary" />
        <StatCard label={t("acct.banks.withBalance")} value={String((balances.data ?? []).filter((b) => b.balance !== 0).length)} icon={Landmark} tone="success" />
      </div>
      <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t("acct.banks.accounts")}</CardTitle></CardHeader><CardContent className="p-0">
        {isLoading || balances.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}</div>
        ) : cashLike.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("acct.banks.noAccounts")}</div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>{t("acct.banks.code")}</TableHead><TableHead>{t("acct.banks.account")}</TableHead><TableHead className="text-right">{t("acct.banks.balance")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {(balances.data ?? cashLike.map((a) => ({ code: a.code, name: a.name, balance: 0 }))).map((b) => (
                <TableRow key={b.code}>
                  <TableCell className="font-mono text-xs">{b.code}</TableCell>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right font-semibold">৳ {Math.round(b.balance).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </>
  );
}
