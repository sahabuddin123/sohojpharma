import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { paymentMethodReport } from "@/lib/api/payments.functions";

export const Route = createFileRoute("/reports/payments")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Payment Reports — SohojPharma" }] }),
  component: PaymentReports,
});

const LABEL: Record<string, string> = {
  cash: "Cash", bkash: "bKash", nagad: "Nagad", rocket: "Rocket",
  bank: "Bank", card: "Card", other: "Other",
};

function PaymentReports() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const fn = useServerFn(paymentMethodReport);
  const { data } = useQuery({
    queryKey: ["payment-method-report", tenantId, from, to],
    queryFn: () => fn({ data: { tenantId, from, to } }),
    enabled: !!tenantId,
  });

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("rpt.payments.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("rpt.payments.desc")}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><Label className="text-xs">{t("rpt.payments.from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">{t("rpt.payments.to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label={t("rpt.payments.stat.totalCollected")} value={data?.grandTotal ?? 0} accent="success" />
        <Stat label={t("rpt.payments.stat.outstandingDue")} value={data?.dueTotal ?? 0} accent="warning" />
        <Stat label={t("rpt.payments.stat.methodsUsed")} value={data?.methods.length ?? 0} plain />
      </div>

      <Card>
        <CardHeader><CardTitle>{t("rpt.payments.byMethod")}</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rpt.payments.col.method")}</TableHead>
                <TableHead className="text-right">{t("rpt.payments.col.transactions")}</TableHead>
                <TableHead className="text-right">{t("rpt.payments.col.total")}</TableHead>
                <TableHead className="text-right">{t("rpt.payments.col.share")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.methods ?? []).map((m) => {
                const share = (data?.grandTotal ?? 0) > 0 ? (m.amount / (data!.grandTotal)) * 100 : 0;
                return (
                  <TableRow key={m.method}>
                    <TableCell className="font-medium">{LABEL[m.method] ?? m.method}</TableCell>
                    <TableCell className="text-right">{m.count}</TableCell>
                    <TableCell className="text-right">৳ {m.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{share.toFixed(1)}%</TableCell>
                  </TableRow>
                );
              })}
              {(data?.methods.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("rpt.payments.empty")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent, plain }: { label: string; value: number; accent?: "success" | "warning"; plain?: boolean }) {
  const cls = accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${cls}`}>{plain ? Number(value).toLocaleString() : `৳ ${Number(value).toFixed(2)}`}</div>
      </CardContent>
    </Card>
  );
}
