import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { ArrowLeft, Wallet, Phone, Mail, Truck, FileDown, Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { getSupplierProfile } from "@/lib/api/supplier-ledger.functions";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/suppliers/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Supplier — SohojPharma" }] }),
  component: SupplierDetailsPage,
});

const fmt = (n: number) =>
  `৳ ${new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

type LedgerRow = {
  entry_date: string; entry_type: string; debit: number | null; credit: number | null;
  ref_table: string | null; ref_no: string | null; notes: string | null; running_balance: number | null;
};

function SupplierDetailsPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const profileFn = useServerFn(getSupplierProfile);

  const q = useQuery({
    queryKey: ["supplier-profile", tenantId, id],
    queryFn: () => profileFn({ data: { tenantId, supplierId: id } }),
    enabled: !!tenantId && !!id,
  });

  const supplier = q.data?.supplier;
  const ledger = (q.data?.ledger ?? []) as LedgerRow[];
  const closing = ledger.length ? Number(ledger[ledger.length - 1].running_balance ?? 0) : Number(supplier?.opening_balance ?? 0);
  const totalPurchase = ledger.filter((l) => l.entry_type === "purchase").reduce((s, l) => s + Number(l.credit ?? 0), 0);

  const exportExcel = () => {
    if (!supplier) return;
    const rows = ledger.map((l) => ({
      Date: l.entry_date?.slice(0, 10),
      Reference: l.ref_no ?? "",
      Type: l.entry_type,
      Debit: Number(l.debit ?? 0),
      Credit: Number(l.credit ?? 0),
      Balance: Number(l.running_balance ?? 0),
      Notes: l.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `${supplier.name}-statement.xlsx`);
  };

  const exportPDF = () => {
    if (!supplier) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const rowsHtml = ledger.map((l) => `
      <tr>
        <td>${(l.entry_date ?? "").slice(0, 10)}</td>
        <td>${l.ref_no ?? ""}</td>
        <td style="text-transform:capitalize">${l.entry_type}</td>
        <td style="text-align:right">${Number(l.debit ?? 0) ? fmt(Number(l.debit)) : "-"}</td>
        <td style="text-align:right">${Number(l.credit ?? 0) ? fmt(Number(l.credit)) : "-"}</td>
        <td style="text-align:right;font-weight:600">${fmt(Number(l.running_balance ?? 0))}</td>
      </tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>Statement - ${supplier.name}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{margin:0 0 4px} .meta{color:#555;font-size:13px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #ddd;padding:6px 8px}
        th{background:#f4f4f5;text-align:left}
        .totals{margin-top:12px;font-size:14px}
      </style></head><body>
      <h1>${supplier.name}</h1>
      <div class="meta">${supplier.phone ?? ""} • ${supplier.email ?? ""}<br/>
        ${supplier.address ?? ""}</div>
      <div class="totals">
        <strong>Opening Balance:</strong> ${fmt(Number(supplier.opening_balance ?? 0))}<br/>
        <strong>As of:</strong> ${new Date().toLocaleDateString()}
      </div>
      <table style="margin-top:16px">
        <thead><tr><th>Date</th><th>Reference</th><th>Type</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="6" style="text-align:center;padding:20px">No transactions</td></tr>'}</tbody>
      </table>
      <div class="totals"><strong>Closing Balance:</strong> ${fmt(closing)}</div>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <AppShell variant="store" title={t("cust.supplier.shellTitle")}>
      <PageHeader
        title={supplier?.name ?? "Supplier"}
        description={t("cust.supplier.idDesc", { id })}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/suppliers"><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("cust.back")}</Link>
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={!supplier}>
              <FileDown className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={exportPDF} disabled={!supplier}>
              <Printer className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("cust.supplier.totalPurchase")} value={fmt(totalPurchase)} icon={Truck} tone="primary" />
        <StatCard label={t("cust.supplier.outstandingDue")} value={fmt(closing)} icon={Wallet} tone="warning" />
        <StatCard label="Opening Balance" value={fmt(Number(supplier?.opening_balance ?? 0))} icon={Wallet} tone="secondary" />
        <StatCard label="Transactions" value={String(ledger.length)} icon={Truck} tone="success" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">{t("cust.supplier.contact")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium">{supplier?.name ?? "—"}</p>
            <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {supplier?.phone ?? "—"}</p>
            <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {supplier?.email ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{supplier?.address ?? ""}</p>
            {supplier?.vat_no && <p className="text-xs">VAT: {supplier.vat_no}</p>}
            {supplier?.bin_no && <p className="text-xs">BIN: {supplier.bin_no}</p>}
          </CardContent>
        </Card>

        <Card className="shadow-card lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Ledger</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ledger.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No transactions yet
                    </TableCell></TableRow>
                  ) : ledger.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{(l.entry_date ?? "").slice(0, 10)}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ref_no ?? ""}</TableCell>
                      <TableCell className="capitalize">{l.entry_type}</TableCell>
                      <TableCell className="text-right">{Number(l.debit ?? 0) ? fmt(Number(l.debit)) : "-"}</TableCell>
                      <TableCell className="text-right">{Number(l.credit ?? 0) ? fmt(Number(l.credit)) : "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(l.running_balance ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
