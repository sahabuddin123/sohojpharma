import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { customerAgingReport } from "@/lib/api/customer-ledger.functions";
import { FileDown, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/reports/customer-aging")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Aging — SohojPharma" }] }),
  component: CustomerAgingPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function CustomerAgingPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(customerAgingReport);

  const q = useQuery({
    queryKey: ["customer-aging", tenantId],
    queryFn: () => fn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  const rows = q.data ?? [];
  const totals = rows.reduce(
    (a, r) => ({
      current: a.current + r.current,
      d_1_30: a.d_1_30 + r.d_1_30,
      d_31_60: a.d_31_60 + r.d_31_60,
      d_61_90: a.d_61_90 + r.d_61_90,
      d_90_plus: a.d_90_plus + r.d_90_plus,
      total_due: a.total_due + r.total_due,
    }),
    { current: 0, d_1_30: 0, d_31_60: 0, d_61_90: 0, d_90_plus: 0, total_due: 0 },
  );

  const exportXLSX = () => {
    const data = rows.map((r) => ({
      Customer: r.customer_name, Phone: r.phone ?? "",
      Current: r.current, "1-30": r.d_1_30, "31-60": r.d_31_60, "61-90": r.d_61_90, "90+": r.d_90_plus,
      "Total Due": r.total_due,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Aging");
    XLSX.writeFile(wb, `customer-aging-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <AppShell variant="store" title="Customer Aging">
      <PageHeader
        title="Customer Aging Report"
        description="Outstanding customer dues bucketed by age (FIFO offset)."
        actions={
          <Button variant="outline" onClick={exportXLSX} disabled={rows.length === 0}>
            <FileDown className="mr-1.5 h-4 w-4" /> Export Excel
          </Button>
        }
      />

      <Card className="shadow-card">
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No outstanding customer dues.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">1-30</TableHead>
                  <TableHead className="text-right">31-60</TableHead>
                  <TableHead className="text-right">61-90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.customer_id}>
                    <TableCell>
                      <Link to="/customers/$id" params={{ id: r.customer_id }} className="font-medium hover:underline">
                        {r.customer_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.phone ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(r.current)}</TableCell>
                    <TableCell className="text-right">{fmt(r.d_1_30)}</TableCell>
                    <TableCell className="text-right">{fmt(r.d_31_60)}</TableCell>
                    <TableCell className="text-right">{fmt(r.d_61_90)}</TableCell>
                    <TableCell className="text-right text-destructive">{fmt(r.d_90_plus)}</TableCell>
                    <TableCell className="text-right font-bold">{fmt(r.total_due)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold">
                  <TableCell colSpan={2}>Totals</TableCell>
                  <TableCell className="text-right">{fmt(totals.current)}</TableCell>
                  <TableCell className="text-right">{fmt(totals.d_1_30)}</TableCell>
                  <TableCell className="text-right">{fmt(totals.d_31_60)}</TableCell>
                  <TableCell className="text-right">{fmt(totals.d_61_90)}</TableCell>
                  <TableCell className="text-right text-destructive">{fmt(totals.d_90_plus)}</TableCell>
                  <TableCell className="text-right">{fmt(totals.total_due)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
