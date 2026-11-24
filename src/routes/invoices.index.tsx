import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Settings, Search, Eye, Pencil, Ban, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { listInvoices, addInvoicePayment, cancelInvoice } from "@/lib/api/invoices.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/invoices/")({
  head: () => ({ meta: [{ title: "Invoices — SohojPharma" }] }),
  component: InvoiceListPage,
  errorComponent: (props) => <RouteErrorPanel {...props} />,
});

const STATUSES = ["all", "paid", "partial", "due", "cancelled", "returned"] as const;
const PAYMENT_METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "card", "other"] as const;

const toneFor = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "paid") return "default";
  if (s === "partial" || s === "due") return "secondary";
  if (s === "cancelled" || s === "returned") return "destructive";
  return "outline";
};

type Row = {
  id: string; invoice_no: string; date: string;
  total: number; paid: number; due: number;
  derived_status: string; edit_count: number;
};

function InvoiceListPage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listInvoices);
  const addPay = useServerFn(addInvoicePayment);
  const delFn = useServerFn(cancelInvoice);
  const [kind, setKind] = useState<"sale" | "purchase">("sale");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [range, setRange] = useState<"today" | "week" | "month" | "all">("month");

  const [payFor, setPayFor] = useState<Row | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [payRef, setPayRef] = useState("");
  const [cancelFor, setCancelFor] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [reverseStock, setReverseStock] = useState(true);

  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (range === "today") start.setHours(0, 0, 0, 0);
    else if (range === "week") start.setDate(now.getDate() - 7);
    else if (range === "month") start.setDate(now.getDate() - 30);
    else return { from: undefined, to: undefined };
    return { from: start.toISOString(), to: now.toISOString() };
  }, [range]);

  const queryKey = ["invoices", currentTenantId, kind, search, status, range];
  const { data: rawData, isLoading } = useQuery({
    queryKey,
    enabled: !!currentTenantId,
    queryFn: () => list({ data: {
      tenantId: currentTenantId!, kind, search: search || undefined,
      status: status === "all" ? undefined : (status as never),
      from, to, limit: 100,
    }}),
  });
  const data: Row[] = Array.isArray(rawData) ? (rawData as Row[]) : [];

  const payMutation = useMutation({
    mutationFn: async () => addPay({ data: {
      tenantId: currentTenantId!, branchId: branchId!, kind, id: payFor!.id,
      amount: Number(payAmount), method: payMethod,
      reference: payRef || undefined,
    }}),
    onSuccess: () => {
      toast.success(t("toast.paymentAdded"));
      setPayFor(null); setPayAmount(""); setPayRef(""); setPayMethod("cash");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => delFn({ data: {
      tenantId: currentTenantId!, branchId: branchId!, id: cancelFor!.id,
      reason: cancelReason.trim(), reverseStock,
    }}),
    onSuccess: () => {
      toast.success(t("toast.invoiceCancelled"));
      setCancelFor(null); setCancelReason(""); setReverseStock(true);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell variant="store" title={t("ipos.invoicesTitle")}>
      <PageHeader
        title={t("ipos.invoicesTitle")}
        description={t("ipos.invoicesDesc")}
        actions={
          <Button asChild variant="outline">
            <Link to="/invoices/settings"><Settings className="mr-1.5 h-4 w-4" /> {t("ipos.settings")}</Link>
          </Button>
        }
      />

      <Tabs value={kind} onValueChange={(v) => setKind(v as "sale" | "purchase")} className="mb-4">
        <TabsList>
          <TabsTrigger value="sale">{t("ipos.salesTab")}</TabsTrigger>
          <TabsTrigger value="purchase">{t("ipos.purchaseTab")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("ipos.searchInvoicePh")} className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`ipos.status${s.charAt(0).toUpperCase()}${s.slice(1)}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t("ipos.rangeToday")}</SelectItem>
              <SelectItem value="week">{t("ipos.rangeWeek")}</SelectItem>
              <SelectItem value="month">{t("ipos.rangeMonth")}</SelectItem>
              <SelectItem value="all">{t("ipos.rangeAll")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ipos.colInvoice")}</TableHead>
                <TableHead>{t("ipos.colDate")}</TableHead>
                <TableHead className="text-right">{t("ipos.colTotal")}</TableHead>
                <TableHead className="text-right">{t("ipos.colPaid")}</TableHead>
                <TableHead className="text-right">{t("ipos.colDue")}</TableHead>
                <TableHead className="text-right">{t("ipos.colStatus")}</TableHead>
                <TableHead className="text-right">{t("ipos.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">{t("ipos.loading")}</TableCell></TableRow>
              )}
              {!isLoading && data.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">{t("ipos.noInvoices")}</TableCell></TableRow>
              )}
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Link to="/invoices/$id" params={{ id: r.id }} search={{ kind }} className="hover:underline">
                        {r.invoice_no}
                      </Link>
                      {r.edit_count > 0 && (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          title={t("ipos.editedTitle", { n: r.edit_count, s: r.edit_count === 1 ? "" : "s" })}>
                          {t("ipos.editedBadge")}{r.edit_count > 1 ? ` ×${r.edit_count}` : ""}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.date ? new Date(r.date).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right">৳ {r.total.toFixed(2)}</TableCell>
                  <TableCell className="text-right">৳ {r.paid.toFixed(2)}</TableCell>
                  <TableCell className="text-right">৳ {r.due.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={toneFor(r.derived_status)}>{t(`ipos.status${r.derived_status.charAt(0).toUpperCase()}${r.derived_status.slice(1)}`, r.derived_status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title={t("ipos.tipView")}
                        onClick={() => navigate({ to: "/invoices/$id", params: { id: r.id }, search: { kind } })}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {kind === "sale" && (
                        <Button size="icon" variant="ghost" title={t("ipos.tipEditPos")}
                          onClick={() => navigate({ to: "/sales/pos", search: { edit: r.id } })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {kind === "sale" && r.due > 0 && (
                        <Button size="icon" variant="ghost" title={t("ipos.tipAddPayment")}
                          onClick={() => { setPayFor(r); setPayAmount(r.due.toFixed(2)); }}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                      {kind === "sale" && r.derived_status !== "cancelled" && r.derived_status !== "returned" && (
                        <Button size="icon" variant="ghost" title={t("ipos.tipCancel")}
                          onClick={() => setCancelFor(r)}>
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("dialog.addPayment", { no: payFor?.invoice_no ?? "" })}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("ipos.amountDue", { amt: (payFor?.due ?? 0).toFixed(2) })}</Label>
              <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("ipos.method")}</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as typeof payMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("ipos.referenceOpt")}</Label>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={t("ipos.refPh")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>{t("ipos.cancelBtn")}</Button>
            <Button onClick={() => payMutation.mutate()}
              disabled={payMutation.isPending || !payAmount || Number(payAmount) <= 0}>
              {payMutation.isPending ? t("ipos.saving") : t("ipos.savePayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialog.cancelInvoiceTitle", { no: cancelFor?.invoice_no ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("ipos.cancelDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>{t("ipos.reasonReq")}</Label>
              <Textarea rows={3} value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t("ipos.reasonPh")} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={reverseStock}
                onCheckedChange={(v) => setReverseStock(v === true)} />
              {t("ipos.restoreStock")}
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("ipos.back")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); cancelMutation.mutate(); }}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 3}>
              {cancelMutation.isPending ? t("ipos.cancelling") : t("ipos.cancelInvoice")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
