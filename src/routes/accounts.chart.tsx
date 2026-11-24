import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listAccounts } from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/accounts/chart")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Chart of Accounts — SohojPharma" }] }),
  component: ChartPage,
});

function ChartPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listAccounts);
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["chart-of-accounts", tenantId],
    queryFn: () => listFn({ data: { tenant_id: tenantId, active_only: true } }),
    enabled: !!tenantId,
  });

  const TYPE_META: Record<string, { labelKey: string; color: string }> = {
    asset: { labelKey: "acct.chart.assets", color: "text-primary" },
    liability: { labelKey: "acct.chart.liabilities", color: "text-warning" },
    equity: { labelKey: "acct.chart.equity", color: "text-info" },
    income: { labelKey: "acct.chart.income", color: "text-success" },
    expense: { labelKey: "acct.chart.expenses", color: "text-destructive" },
    cogs: { labelKey: "acct.chart.cogs", color: "text-destructive" },
  };

  const grouped = (accounts as Array<{ id: string; code: string; name: string; type: string; is_active: boolean }>).reduce(
    (acc, a) => {
      (acc[a.type] ??= []).push(a);
      return acc;
    },
    {} as Record<string, Array<{ id: string; code: string; name: string; type: string; is_active: boolean }>>,
  );

  return (
    <>
      <PageHeader title={t("acct.chart.title")} description={t("acct.chart.desc")} />
      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("acct.common.loading")}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(TYPE_META).map(([type, meta]) => {
            const items = grouped[type] ?? [];
            if (items.length === 0) return null;
            return (
              <Card key={type} className="shadow-card">
                <CardHeader>
                  <CardTitle className={`text-base ${meta.color}`}>{t(meta.labelKey)} ({items.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-foreground">
                        <span><span className="font-mono text-xs text-muted-foreground mr-2">{i.code}</span>{i.name}</span>
                        <Badge variant={i.is_active ? "outline" : "secondary"} className="text-xs">{i.is_active ? t("acct.chart.active") : t("acct.chart.inactive")}</Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
