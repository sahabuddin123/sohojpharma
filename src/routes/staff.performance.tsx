import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/staff/performance")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Performance — SohojPharma" }] }),
  component: PerformancePage,
});

const perf = [
  { name: "Sumon Ahmed", role: "Cashier", sales: 142500, invoices: 184, attendance: 96, leaves: 1, score: 92 },
  { name: "Karim Hossain", role: "Manager", sales: 98400, invoices: 0, attendance: 98, leaves: 0, score: 90 },
  { name: "Rina Khatun", role: "Pharmacist", sales: 64200, invoices: 96, attendance: 94, leaves: 2, score: 86 },
  { name: "Maliha Noor", role: "Accountant", sales: 0, invoices: 0, attendance: 100, leaves: 0, score: 88 },
  { name: "Joshim Ali", role: "Store Keeper", sales: 0, invoices: 0, attendance: 78, leaves: 4, score: 62 },
];

function PerformancePage() {
  const { t } = useTranslation();
  const top = [...perf].sort((a, b) => b.score - a.score).slice(0, 3);
  return (
    <>
      <PageHeader title={t('ops.staff.performance.title')} description={t('ops.staff.performance.desc')} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {top.map((p, i) => (
          <Card key={p.name} className="shadow-card">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><Trophy /></div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('ops.staff.performance.topPrefix', { n: i + 1 })}</p>
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.role} · {t('ops.staff.performance.scoreLabel', { n: p.score })}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t('ops.staff.performance.performanceRanking')}</CardTitle></CardHeader><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>{t('ops.staff.performance.colEmployee')}</TableHead><TableHead className="text-right">{t('ops.staff.performance.colSales')}</TableHead><TableHead className="text-right">{t('ops.staff.performance.colInvoices')}</TableHead><TableHead>{t('ops.staff.performance.colAttendance')}</TableHead><TableHead className="text-right">{t('ops.staff.performance.colLeaves')}</TableHead><TableHead className="text-right">{t('ops.staff.performance.colScore')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {perf.map((p) => (
              <TableRow key={p.name}>
                <TableCell><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.role}</div></TableCell>
                <TableCell className="text-right">{p.sales.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right">{p.invoices}</TableCell>
                <TableCell className="w-48"><div className="flex items-center gap-2"><Progress value={p.attendance} /><span className="text-xs">{p.attendance}%</span></div></TableCell>
                <TableCell className="text-right">{p.leaves}</TableCell>
                <TableCell className="text-right font-semibold">{p.score}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}
