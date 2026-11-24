import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, FileText, Download } from "lucide-react";
import { staff } from "@/data/staff";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/staff/payroll")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Payroll — SohojPharma" }] }),
  component: PayrollPage,
});

function PayrollPage() {
  const { t } = useTranslation();
  const rows = staff.filter((s) => s.salary > 0).map((s) => {
    const bonus = Math.round(s.salary * 0.05);
    const overtime = 0;
    const deduction = 0;
    const net = s.salary + bonus + overtime - deduction;
    return { ...s, bonus, overtime, deduction, net };
  });
  const total = rows.reduce((a, r) => a + r.net, 0);
  return (
    <>
      <PageHeader title={t('ops.staff.payroll.title')} description={t('ops.staff.payroll.desc')} actions={<Button><FileText className="mr-1.5 h-4 w-4" />{t('ops.staff.payroll.generatePayslips')}</Button>} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('ops.staff.payroll.monthlyPayroll')} value={`৳ ${total.toLocaleString("en-IN")}`} icon={Wallet} tone="primary" />
        <StatCard label={t('ops.staff.payroll.employeesOnPayroll')} value={String(rows.length)} icon={Wallet} tone="secondary" />
        <StatCard label={t('ops.staff.payroll.monthStatus')} value="Pending" icon={FileText} tone="warning" />
      </div>
      <Card className="shadow-card"><CardHeader><CardTitle className="text-base flex items-center justify-between">{t('ops.staff.payroll.salarySheet')} <Button size="sm" variant="outline"><Download className="mr-1.5 h-4 w-4" /> {t('ops.staff.payroll.export')}</Button></CardTitle></CardHeader><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>{t('ops.staff.payroll.colEmployee')}</TableHead><TableHead className="text-right">{t('ops.staff.payroll.colBasic')}</TableHead><TableHead className="text-right">{t('ops.staff.payroll.colBonus')}</TableHead><TableHead className="text-right">{t('ops.staff.payroll.colOvertime')}</TableHead><TableHead className="text-right">{t('ops.staff.payroll.colDeduction')}</TableHead><TableHead className="text-right">{t('ops.staff.payroll.colNetPay')}</TableHead><TableHead className="text-right">{t('ops.staff.payroll.colPayslip')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.designation}</div></TableCell>
                <TableCell className="text-right">৳ {r.salary.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right text-success">৳ {r.bonus.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right">৳ {r.overtime.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right text-warning">৳ {r.deduction.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right font-semibold">৳ {r.net.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost"><FileText className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}
