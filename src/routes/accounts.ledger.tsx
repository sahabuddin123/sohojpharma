import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { listAccounts, getAccountLedger } from "@/lib/api/finance.functions";
import { customerLedger } from "@/lib/api/collections.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/accounts/ledger")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Ledger — SohojPharma" }] }),
  component: LedgerPage,
});

function LedgerPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  return (
    <>
      <PageHeader title={t("acct.ledger.title")} description={t("acct.ledger.desc")} />
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">{t("acct.ledger.accountLedger")}</TabsTrigger>
          <TabsTrigger value="customer">{t("acct.ledger.customerLedger")}</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="mt-4 space-y-3"><AccountLedger tenantId={tenantId} /></TabsContent>
        <TabsContent value="customer" className="mt-4 space-y-3"><CustomerLedger tenantId={tenantId} /></TabsContent>
      </Tabs>
    </>
  );
}

function AccountLedger({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const listAccFn = useServerFn(listAccounts);
  const ledgerFn = useServerFn(getAccountLedger);
  const [code, setCode] = useState<string>("1000");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", tenantId, "all"],
    enabled: !!tenantId,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId } }),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["account-ledger", tenantId, code],
    enabled: !!tenantId && !!code,
    queryFn: () => ledgerFn({ data: { tenant_id: tenantId, account_code: code } }),
  });

  return (
    <>
      <Select value={code} onValueChange={setCode}>
        <SelectTrigger className="h-9 w-[280px]"><SelectValue placeholder={t("acct.common.selectAccount")} /></SelectTrigger>
        <SelectContent>{accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
      </Select>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">
            {data?.account ? `${data.account.code} · ${data.account.name}` : t("acct.ledger.accountLedger")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}
            </div>
          ) : !data || data.lines.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("acct.ledger.noEntries")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("acct.common.date")}</TableHead>
                  <TableHead>{t("acct.common.entry")}</TableHead>
                  <TableHead>{t("acct.common.description")}</TableHead>
                  <TableHead className="text-right">{t("acct.common.debit")}</TableHead>
                  <TableHead className="text-right">{t("acct.common.credit")}</TableHead>
                  <TableHead className="text-right">{t("acct.common.balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.journal_entries.entry_date}</TableCell>
                    <TableCell className="font-mono text-xs">{r.journal_entries.entry_no}</TableCell>
                    <TableCell className="text-muted-foreground">{r.description ?? "-"}</TableCell>
                    <TableCell className="text-right">{Number(r.debit) ? `৳ ${Number(r.debit).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-right">{Number(r.credit) ? `৳ ${Number(r.credit).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">৳ {Number(r.running_balance).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function CustomerLedger({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const ledgerFn = useServerFn(customerLedger);
  const [customerId, setCustomerId] = useState<string>("");

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-min", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").eq("tenant_id", tenantId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data, isLoading } = useQuery({
    queryKey: ["customer-ledger", tenantId, customerId],
    enabled: !!tenantId && !!customerId,
    queryFn: () => ledgerFn({ data: { tenantId, customer_id: customerId } }),
  });

  return (
    <>
      <Select value={customerId} onValueChange={setCustomerId}>
        <SelectTrigger className="h-9 w-[280px]"><SelectValue placeholder={t("acct.ledger.selectCustomer")} /></SelectTrigger>
        <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">{data?.customer?.name ?? t("acct.ledger.customerLedger")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!customerId ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("acct.ledger.noCustomer")}</div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}
            </div>
          ) : !data || data.ledger.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("acct.ledger.noTxn")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("acct.common.date")}</TableHead>
                  <TableHead>{t("acct.ledger.reference")}</TableHead>
                  <TableHead>{t("acct.common.type")}</TableHead>
                  <TableHead className="text-right">{t("acct.common.debit")}</TableHead>
                  <TableHead className="text-right">{t("acct.common.credit")}</TableHead>
                  <TableHead className="text-right">{t("acct.common.balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ledger.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-mono text-xs">{r.ref}</TableCell>
                    <TableCell>{r.type}</TableCell>
                    <TableCell className="text-right">{r.debit ? `৳ ${r.debit.toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-right">{r.credit ? `৳ ${r.credit.toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">৳ {r.balance.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
