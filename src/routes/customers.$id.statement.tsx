import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Loader2, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { customerStatement } from "@/lib/api/customer-crud.functions";

export const Route = createFileRoute("/customers/$id/statement")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Statement — SohojPharma" }] }),
  component: StatementPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
};
const lastMonthRange = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const from = d.toISOString().slice(0, 10);
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from, to: e.toISOString().slice(0, 10) };
};

function StatementPage() {
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(customerStatement);

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const q = useQuery({
    queryKey: ["customer-statement", tenantId, id, from, to],
    enabled: !!tenantId && !!from && !!to,
    queryFn: () => fn({ data: { tenantId, customerId: id, from, to } }),
  });

  const data = q.data;

  const exportXLSX = () => {
    if (!data) return;
    const c = data.customer as {
      customer_code?: string | null; name: string; phone?: string | null;
      address?: string | null; credit_limit?: number | null;
      opening_balance?: number | null; due_balance?: number | null;
    };
    const header = [
      ["Customer Code", c.customer_code ?? ""],
      ["Customer Name", c.name],
      ["Mobile", c.phone ?? ""],
      ["Address", c.address ?? ""],
      ["Credit Limit", Number(c.credit_limit ?? 0)],
      ["Opening Balance", Number(c.opening_balance ?? 0)],
      ["Current Due", Number(c.due_balance ?? 0)],
      ["Period", `${from} → ${to}`],
      [],
    ];
    const cols = ["Date", "Type", "Reference", "Debit", "Credit", "Balance"];
    const rows: Array<Array<string | number>> = [
      ...header,
      cols,
      ["", "Opening Balance", "", "", "", data.opening],
      ...data.entries.map((e) => [
        new Date(e.entry_date).toLocaleDateString(),
        e.entry_type,
        e.ref_no ?? "",
        Number(e.debit ?? 0),
        Number(e.credit ?? 0),
        e.balance,
      ]),
      ["", "Closing Balance", "", "", "", data.closing],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `statement-${c.name.replace(/\s+/g, "_")}-${from}_to_${to}.xlsx`);
  };

  return (
    <AppShell variant="store" title="Customer Statement">
      <PageHeader
        title={data ? `Statement: ${data.customer.name}` : "Customer Statement"}
        description={data ? `${data.customer.customer_code ?? ""} • Period: ${from} → ${to}` : `Period: ${from} → ${to}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/customers/$id" params={{ id }}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
            </Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Print</Button>
            <Button variant="outline" onClick={exportXLSX} disabled={!data}>
              <FileDown className="mr-1.5 h-4 w-4" /> Excel
            </Button>
          </>
        }
      />

      <Card className="mb-4 shadow-card">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setFrom(today()); setTo(today()); }}>Today</Button>
            <Button size="sm" variant="outline" onClick={() => { setFrom(monthStart()); setTo(today()); }}>This Month</Button>
            <Button size="sm" variant="outline" onClick={() => { const r = lastMonthRange(); setFrom(r.from); setTo(r.to); }}>Last Month</Button>
          </div>
        </CardContent>
      </Card>

      {q.isLoading || !data ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <Card className="mb-4 shadow-card">
            <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
            <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs uppercase text-muted-foreground">Code</p><p className="font-mono font-semibold">{data.customer.customer_code ?? "—"}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">Name</p><p className="font-semibold">{data.customer.name}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">Mobile</p><p className="font-semibold">{data.customer.phone ?? "—"}</p></div>
              <div className="sm:col-span-2 lg:col-span-1"><p className="text-xs uppercase text-muted-foreground">Address</p><p className="font-semibold">{data.customer.address ?? "—"}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">Credit Limit</p><p className="font-semibold">৳ {fmt(Number(data.customer.credit_limit ?? 0))}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">Opening Balance</p><p className="font-semibold">৳ {fmt(Number(data.customer.opening_balance ?? 0))}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">Current Due</p><p className={`font-semibold ${Number(data.customer.due_balance ?? 0) > 0 ? "text-destructive" : "text-success"}`}>৳ {fmt(Number(data.customer.due_balance ?? 0))}</p></div>
            </CardContent>
          </Card>

          <div className="mb-4 grid gap-3 sm:grid-cols-5">
            <Kpi label="Opening" value={fmt(data.opening)} />
            <Kpi label="Sales" value={fmt(data.summary.sales)} tone="text-primary" />
            <Kpi label="Collections" value={fmt(data.summary.payments)} tone="text-success" />
            <Kpi label="Returns" value={fmt(data.summary.returns)} tone="text-warning" />
            <Kpi label="Closing" value={fmt(data.closing)} tone={data.closing > 0 ? "text-destructive" : "text-success"} />
          </div>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Ledger Movements</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={5}>Opening Balance</TableCell>
                    <TableCell className="text-right">{fmt(data.opening)}</TableCell>
                  </TableRow>
                  {data.entries.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No movements in this period.</TableCell></TableRow>
                  ) : data.entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{new Date(e.entry_date).toLocaleDateString()}</TableCell>
                      <TableCell className="capitalize">{e.entry_type}</TableCell>
                      <TableCell className="font-mono text-xs">{e.ref_no ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(e.debit) ? fmt(Number(e.debit)) : "-"}</TableCell>
                      <TableCell className="text-right text-success">{Number(e.credit) ? fmt(Number(e.credit)) : "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(e.balance)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell colSpan={5}>Closing Balance</TableCell>
                    <TableCell className={`text-right ${data.closing > 0 ? "text-destructive" : "text-success"}`}>{fmt(data.closing)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-bold ${tone ?? ""}`}>৳ {value}</p>
      </CardContent>
    </Card>
  );
}
