import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { customerLedger } from "@/lib/api/collections.functions";

export const Route = createFileRoute("/dues/ledger")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Ledger — SohojPharma" }] }),
  component: LedgerPage,
});

function LedgerPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [customerId, setCustomerId] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    void supabase.from("customers").select("id,name").eq("tenant_id", tenantId).order("name").limit(500)
      .then(({ data }) => setCustomers(data ?? []));
  }, [tenantId]);

  const fn = useServerFn(customerLedger);
  const { data } = useQuery({
    queryKey: ["customer-ledger", tenantId, customerId],
    queryFn: () => fn({ data: { tenantId, customer_id: customerId } }),
    enabled: !!tenantId && !!customerId,
  });

  return (
    <AppShell variant="store" title={t("sections.dues.ledgerTitle")}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("sections.dues.ledgerTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("sections.dues.ledgerDesc")}</p>
        </div>

        <Card>
          <CardContent className="py-4">
            <Label>{t("sections.dues.customer")}</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("sections.dues.selectCustomer")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </CardContent>
        </Card>

        {data?.customer && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{data.customer.name}</span>
                <Badge variant={data.currentDue > 0 ? "destructive" : "outline"}>
                  {t("sections.dues.currentDue")}: {Number(data.currentDue).toLocaleString()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("sections.dues.date")}</TableHead>
                    <TableHead>{t("sections.dues.ref")}</TableHead>
                    <TableHead>{t("sections.dues.typeCol")}</TableHead>
                    <TableHead className="text-right">{t("sections.dues.debit")}</TableHead>
                    <TableHead className="text-right">{t("sections.dues.credit")}</TableHead>
                    <TableHead className="text-right">{t("sections.dues.balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ledger.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.date}</TableCell>
                      <TableCell className="font-mono text-xs">{e.ref}</TableCell>
                      <TableCell><Badge variant="outline">{e.type}</Badge></TableCell>
                      <TableCell className="text-right">{e.debit ? Number(e.debit).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right">{e.credit ? Number(e.credit).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(e.balance).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {data.ledger.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t("sections.dues.noTx")}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
