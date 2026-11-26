import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAccountsDateFilter } from "@/components/accounts/accounts-date-filter";

export const Route = createFileRoute("/accounts/audit")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Audit Log — SohojPharma" }] }),
  component: AuditPage,
});

function AuditPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { from, to } = useAccountsDateFilter();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["accounts-audit", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, created_at, action, entity_table, after_data, before_data, user_id")
        .eq("tenant_id", tenantId)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const toneFor = (action: string) => {
    if (action.includes("create") || action.includes("deposit")) return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300";
    if (action.includes("update")) return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300";
    if (action.includes("delete") || action.includes("cancel")) return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300";
    return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
  };

  return (
    <>
      <PageHeader title={t("acct.audit.title")} description={`${t("acct.audit.desc")} (${from} → ${to})`} />
      <Card>
        <CardHeader><CardTitle className="text-base">{t("acct.audit.recentActivity")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">এই তারিখের মধ্যে কোনো অডিট লগ নেই।</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("acct.audit.time")}</TableHead>
                  <TableHead>{t("acct.audit.user")}</TableHead>
                  <TableHead>{t("acct.audit.action")}</TableHead>
                  <TableHead>{t("acct.audit.entity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => {
                  const meta = (l.after_data ?? l.before_data ?? {}) as Record<string, unknown>;
                  const summary = meta.expense_no || meta.income_no || meta.notes || l.entity_table || "—";
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs">{l.user_id ? l.user_id.slice(0, 8) : "System"}</TableCell>
                      <TableCell><Badge className={toneFor(l.action)}>{l.action}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">
                        {String(summary)}{meta.amount != null ? ` · ৳ ${Number(meta.amount).toLocaleString()}` : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
