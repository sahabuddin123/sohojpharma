import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/accounts/audit")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Audit Log — SohojPharma" }] }),
  component: AuditPage,
});

const logs = [
  { time: "2026-06-14 16:42", user: "Tania (Owner)", action: "Expense Created", entity: "Electricity ৳ 4,200" },
  { time: "2026-06-14 15:20", user: "Karim (Cashier)", action: "Income Added", entity: "Consultation ৳ 3,500" },
  { time: "2026-06-14 14:11", user: "Tania (Owner)", action: "Expense Updated", entity: "Rent → ৳ 25,000" },
  { time: "2026-06-13 18:00", user: "System", action: "Ledger Updated", entity: "Day-close balance" },
  { time: "2026-06-13 11:05", user: "Tania (Owner)", action: "Expense Deleted", entity: "Misc ৳ 800" },
];

const tone: Record<string, string> = {
  "Expense Created": "bg-success/15 text-success",
  "Income Added": "bg-primary/15 text-primary",
  "Expense Updated": "bg-warning/15 text-warning",
  "Expense Deleted": "bg-destructive/15 text-destructive",
  "Ledger Updated": "bg-secondary/15 text-secondary",
};

function AuditPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("acct.audit.title")} description={t("acct.audit.desc")} />
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("acct.audit.recentActivity")}</CardTitle></CardHeader>
        <CardContent className="p-0">
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
              {logs.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{l.time}</TableCell>
                  <TableCell className="font-medium">{l.user}</TableCell>
                  <TableCell><Badge className={tone[l.action]}>{l.action}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{l.entity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
