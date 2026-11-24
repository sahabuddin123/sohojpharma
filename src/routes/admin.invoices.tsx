import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileText, Printer, Search } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import {
  adminListInvoices, adminGetInvoice, adminSetInvoiceStatus,
} from "@/lib/api/subscriptions.functions";

export const Route = createFileRoute("/admin/invoices")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-6">Not found</div>,
  head: () => ({ meta: [{ title: "Subscription Invoices — Super Admin" }] }),
  component: InvoicesPage,
});

type Inv = {
  id: string; invoice_no: string; tenant_id: string;
  plan_name: string; billing_cycle: string; kind: string;
  amount: number; discount: number; vat: number; vat_percent: number;
  grand_total: number; currency: string; status: string;
  period_start: string | null; period_end: string | null;
  due_at: string | null; paid_at: string | null; created_at: string;
  tenant?: { name?: string; email?: string } | null;
};

const STATUS_CLR: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  unpaid: "bg-amber-100 text-amber-900",
  overdue: "bg-red-100 text-red-800",
  draft: "bg-slate-100 text-slate-800",
  cancelled: "bg-slate-200 text-slate-700",
  refunded: "bg-violet-100 text-violet-800",
};

function fmtMoney(n: number, cur = "BDT") {
  return `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}
function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function InvoicesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListInvoices);
  const getFn = useServerFn(adminGetInvoice);
  const setStatusFn = useServerFn(adminSetInvoiceStatus);

  const [status, setStatus] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-invoices", status, kind, search],
    queryFn: () => listFn({ data: {
      status: status === "all" ? undefined : (status as never),
      kind: kind === "all" ? undefined : (kind as never),
      search: search || undefined,
    }}),
  });
  const invoices = (data ?? []) as Inv[];

  const totals = useMemo(() => {
    const t = { count: invoices.length, paid: 0, due: 0, revenue: 0 };
    for (const i of invoices) {
      if (i.status === "paid") { t.paid++; t.revenue += Number(i.grand_total || 0); }
      if (i.status === "unpaid" || i.status === "overdue") t.due += Number(i.grand_total || 0);
    }
    return t;
  }, [invoices]);

  const { data: detail } = useQuery({
    queryKey: ["admin-invoice", openId],
    queryFn: () => getFn({ data: { id: openId! } }),
    enabled: !!openId,
  });

  const setStatusMut = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      setStatusFn({ data: { id: vars.id, status: vars.status as never } }),
    onSuccess: () => {
      toast.success("Invoice updated");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["admin-invoice"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    const headers = ["Invoice","Tenant","Plan","Cycle","Kind","Amount","Discount","VAT","Total","Status","Created","Paid"];
    const rows = invoices.map((i) => [
      i.invoice_no, i.tenant?.name ?? "", i.plan_name, i.billing_cycle, i.kind,
      i.amount, i.discount, i.vat, i.grand_total, i.status,
      new Date(i.created_at).toISOString(), i.paid_at ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscription-invoices-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell variant="admin" title="Invoices">
      <div className="space-y-6 p-6">
        <PageHeader
          title="Subscription Invoices"
          description="Billing history, payments, and exports"
          actions={
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" /> Export CSV / Excel
            </Button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label="Total Invoices" value={totals.count} />
          <StatBox label="Paid" value={totals.paid} />
          <StatBox label="Revenue" value={fmtMoney(totals.revenue)} />
          <StatBox label="Outstanding" value={fmtMoney(totals.due)} accent />
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search invoice no or tenant…" className="pl-9"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="renewal">Renewal</SelectItem>
                  <SelectItem value="upgrade">Upgrade</SelectItem>
                  <SelectItem value="downgrade">Downgrade</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                  )}
                  {!isLoading && invoices.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No invoices yet</TableCell></TableRow>
                  )}
                  {invoices.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.invoice_no}</TableCell>
                      <TableCell>
                        <div className="font-medium">{i.tenant?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{i.tenant?.email}</div>
                      </TableCell>
                      <TableCell>
                        {i.plan_name}
                        <div className="text-xs text-muted-foreground">{i.billing_cycle}</div>
                      </TableCell>
                      <TableCell className="capitalize">{i.kind}</TableCell>
                      <TableCell className="text-right font-medium">{fmtMoney(i.grand_total, i.currency)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_CLR[i.status] ?? ""} variant="outline">{i.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(i.created_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(i.due_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setOpenId(i.id)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-3xl print:shadow-none">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Invoice {(detail as Inv | undefined)?.invoice_no ?? ""}</span>
              <div className="flex gap-2 print:hidden">
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" /> Print / PDF
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {detail && <InvoiceView inv={detail as InvDetail} onStatus={(s) =>
            setStatusMut.mutate({ id: (detail as Inv).id, status: s })} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

type InvDetail = Inv & {
  notes: string | null;
  items: Array<{ id: string; description: string; quantity: number; unit_price: number; amount: number }>;
  tenant?: { name?: string; email?: string; phone?: string } | null;
};

function InvoiceView({ inv, onStatus }: { inv: InvDetail; onStatus: (s: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-between text-sm">
        <div>
          <div className="text-muted-foreground">Bill to</div>
          <div className="font-semibold">{inv.tenant?.name ?? "—"}</div>
          <div>{inv.tenant?.email}</div>
          <div>{inv.tenant?.phone}</div>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground">Created</div>
          <div>{fmtDate(inv.created_at)}</div>
          <div className="text-muted-foreground mt-2">Due</div>
          <div>{fmtDate(inv.due_at)}</div>
          <Badge className={STATUS_CLR[inv.status] ?? ""} variant="outline">{inv.status}</Badge>
        </div>
      </div>

      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inv.items.map((it) => (
              <TableRow key={it.id}>
                <TableCell>{it.description}</TableCell>
                <TableCell className="text-right">{it.quantity}</TableCell>
                <TableCell className="text-right">{fmtMoney(it.unit_price, inv.currency)}</TableCell>
                <TableCell className="text-right">{fmtMoney(it.amount, inv.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <div className="w-72 text-sm space-y-1">
          <Row k="Subtotal" v={fmtMoney(inv.amount, inv.currency)} />
          {Number(inv.discount) > 0 && <Row k="Discount" v={`- ${fmtMoney(inv.discount, inv.currency)}`} />}
          <Row k={`VAT (${inv.vat_percent}%)`} v={fmtMoney(inv.vat, inv.currency)} />
          <div className="h-px bg-border my-1" />
          <Row k="Grand Total" v={fmtMoney(inv.grand_total, inv.currency)} bold />
        </div>
      </div>

      {inv.notes && (
        <div className="text-sm">
          <div className="text-muted-foreground">Notes</div>
          <div>{inv.notes}</div>
        </div>
      )}

      <div className="flex gap-2 print:hidden">
        {inv.status !== "paid" && <Button size="sm" onClick={() => onStatus("paid")}>Mark Paid</Button>}
        {inv.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => onStatus("cancelled")}>Cancel</Button>}
        {inv.status === "paid" && <Button size="sm" variant="outline" onClick={() => onStatus("refunded")}>Refund</Button>}
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${accent ? "text-amber-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
