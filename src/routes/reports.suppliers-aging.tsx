import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { supplierAgingReport } from "@/lib/api/supplier-ledger.functions";
import { FileDown } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/reports/suppliers-aging")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Supplier Aging — SohojPharma" }] }),
  component: SupplierAgingPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function SupplierAgingPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(supplierAgingReport);

  const q = useQuery({
    queryKey: ["supplier-aging", tenantId],
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
      overdue: a.overdue + r.overdue,
    }),
    { current: 0, d_1_30: 0, d_31_60: 0, d_61_90: 0, d_90_plus: 0, total_due: 0, overdue: 0 },
  );

  const exportXLSX = () => {
    const data = rows.map((r) => ({
      Supplier: r.supplier_name,
      Current: r.current,
      "1-30": r.d_1_30,
      "31-60": r.d_31_60,
      "61-90": r.d_61_90,
      "90+": r.d_90_plus,
      "Total Due": r.total_due,
      Overdue: r.overdue,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Aging");
    XLSX.writeFile(wb, "supplier-aging.xlsx");
  };

  if (!tenantId) {
    return (
      <Alert><AlertTitle>No tenant</AlertTitle><AlertDescription>Sign in to view.</AlertDescription></Alert>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Supplier Aging Report"
        description="Outstanding payables bucketed by age."
        actions={
          <Button variant="outline" onClick={exportXLSX} disabled={rows.length === 0}>
            <FileDown className="mr-1.5 h-4 w-4" /> Excel
          </Button>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">By Supplier</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">1-30</TableHead>
                <TableHead className="text-right">31-60</TableHead>
                <TableHead className="text-right">61-90</TableHead>
                <TableHead className="text-right">90+</TableHead>
                <TableHead className="text-right">Total Due</TableHead>
                <TableHead className="text-right text-destructive">Overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-6">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No outstanding dues</TableCell></TableRow>
              ) : (
                <>
                  {rows.map((r) => (
                    <TableRow key={r.supplier_id}>
                      <TableCell className="font-medium">{r.supplier_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.current)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.d_1_30)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.d_31_60)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.d_61_90)}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{fmt(r.d_90_plus)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(r.total_due)}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{fmt(r.overdue)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold bg-muted/50">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totals.current)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totals.d_1_30)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totals.d_31_60)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totals.d_61_90)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totals.d_90_plus)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totals.total_due)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{fmt(totals.overdue)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
