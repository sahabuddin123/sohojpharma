import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, Receipt, DollarSign, TrendingUp, Loader2, Search, Eye, Pencil, Plus, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { addInvoicePayment, cancelInvoice } from "@/lib/api/invoices.functions";

const PAYMENT_METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "card", "other"] as const;

export const Route = createFileRoute("/sales/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Sales — SohojPharma" },
      { name: "description", content: "Track POS invoices, returns and revenue." },
    ],
  }),
  component: SalesPage,
});

type SaleRow = {
  id: string;
  invoice_no: string;
  sale_date: string;
  total: number;
  paid: number;
  due: number;
  status: string;
  is_return: boolean;
  customer: { name: string | null } | null;
  items: { id: string }[];
};

function deriveStatusKey(s: SaleRow): "Refunded" | "Cancelled" | "Paid" | "Partial" | "Due" {
  if (s.is_return) return "Refunded";
  if (s.status === "void") return "Cancelled";
  if (Number(s.due) <= 0) return "Paid";
  if (Number(s.paid) > 0) return "Partial";
  return "Due";
}

function SalesPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const addPay = useServerFn(addInvoicePayment);
  const delFn = useServerFn(cancelInvoice);
  const tenantId = currentTenantId ?? "";
  const [search, setSearch] = useState("");

  const [payFor, setPayFor] = useState<SaleRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [payRef, setPayRef] = useState("");
  const [cancelFor, setCancelFor] = useState<SaleRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [reverseStock, setReverseStock] = useState(true);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales-list", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,invoice_no,sale_date,total,paid,due,status,is_return,customer:customers(name),items:sale_items(id)")
        .eq("tenant_id", tenantId)
        .order("sale_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => addPay({ data: {
      tenantId, branchId: branchId!, kind: "sale", id: payFor!.id,
      amount: Number(payAmount), method: payMethod,
      reference: payRef || undefined,
    }}),
    onSuccess: () => {
      toast.success(t("toast.paymentAdded"));
      setPayFor(null); setPayAmount(""); setPayRef(""); setPayMethod("cash");
      qc.invalidateQueries({ queryKey: ["sales-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => delFn({ data: {
      tenantId, branchId: branchId!, id: cancelFor!.id,
      reason: cancelReason.trim(), reverseStock,
    }}),
    onSuccess: () => {
      toast.success(t("toast.invoiceCancelled"));
      setCancelFor(null); setCancelReason(""); setReverseStock(true);
      qc.invalidateQueries({ queryKey: ["sales-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);
  const todays = sales.filter((s) => s.sale_date?.slice(0, 10) === today);
  const todayRevenue = todays.reduce((sum, s) => sum + (s.is_return ? 0 : Number(s.total)), 0);
  const avgTicket = todays.length ? Math.round(todayRevenue / todays.length) : 0;

  const filtered = sales.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.invoice_no?.toLowerCase().includes(q) || (s.customer?.name ?? "").toLowerCase().includes(q);
  });

  const statusLabel: Record<string, string> = {
    Paid: t("pages.sales.statusPaid"),
    Due: t("pages.sales.statusDue"),
    Partial: t("pages.sales.statusPartial"),
    Refunded: t("pages.sales.statusRefunded"),
    Cancelled: t("pages.sales.statusCancelled"),
  };

  return (
    <AppShell variant="store" title={t("pages.sales.title")}>
      <PageHeader
        title={t("pages.sales.title")}
        description={t("pages.sales.desc")}
        actions={
          <Button asChild>
            <Link to="/sales/pos" search={{ edit: undefined, recall: undefined, ref: undefined }}><ShoppingCart className="mr-1.5 h-4 w-4" /> {t("pages.sales.openPos")}</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("pages.sales.today")} value={`৳ ${todayRevenue.toLocaleString()}`} icon={DollarSign} tone="primary" />
        <StatCard label={t("pages.sales.invoicesToday")} value={String(todays.length)} icon={Receipt} tone="secondary" />
        <StatCard label={t("pages.sales.avgTicket")} value={`৳ ${avgTicket.toLocaleString()}`} icon={TrendingUp} tone="success" />
      </div>

      <Card className="mt-6 shadow-card">
        <CardContent className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("pages.sales.searchPh")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("pages.sales.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("pages.sales.none")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pages.sales.colInvoice")}</TableHead>
                  <TableHead>{t("pages.sales.colCustomer")}</TableHead>
                  <TableHead>{t("pages.sales.colItems")}</TableHead>
                  <TableHead className="text-right">{t("pages.sales.colTotal")}</TableHead>
                  <TableHead className="text-right">{t("ipos.colPaid")}</TableHead>
                  <TableHead className="text-right">{t("ipos.colDue")}</TableHead>
                  <TableHead>{t("pages.sales.colDate")}</TableHead>
                  <TableHead className="text-right">{t("pages.sales.colStatus")}</TableHead>
                  <TableHead className="text-right">{t("ipos.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const status = deriveStatusKey(s);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">
                        <Link to="/invoices/$id" params={{ id: s.id }} className="hover:underline">{s.invoice_no}</Link>
                      </TableCell>
                      <TableCell className="font-medium">{s.customer?.name ?? t("pages.sales.walkIn")}</TableCell>
                      <TableCell>{s.items?.length ?? 0}</TableCell>
                      <TableCell className="text-right">৳ {Number(s.total).toLocaleString()}</TableCell>
                      <TableCell className="text-right">৳ {Number(s.paid).toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-medium ${status === "Cancelled" || status === "Refunded" ? "text-muted-foreground" : Number(s.due) > 0 ? "text-warning" : "text-success"}`}>
                        ৳ {Number(s.due).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.sale_date?.slice(0, 10)}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            status === "Paid"
                              ? "border-success/30 bg-success/10 text-success"
                              : status === "Due" || status === "Partial"
                              ? "border-warning/30 bg-warning/10 text-warning"
                              : "border-destructive/30 bg-destructive/10 text-destructive"
                          }
                        >
                          {statusLabel[status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title={t("ipos.tipView")}
                            onClick={() => navigate({ to: "/invoices/$id", params: { id: s.id } })}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {status !== "Cancelled" && status !== "Refunded" && (
                            <Button size="icon" variant="ghost" title={t("ipos.tipEditPos")}
                              onClick={() => navigate({ to: "/sales/pos", search: { edit: s.id } })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {Number(s.due) > 0 && status !== "Cancelled" && status !== "Refunded" && (
                            <Button size="icon" variant="ghost" title={t("ipos.tipAddPayment")}
                              onClick={() => { setPayFor(s); setPayAmount(Number(s.due).toFixed(2)); }}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          {status !== "Cancelled" && status !== "Refunded" && (
                            <Button size="icon" variant="ghost" title={t("ipos.tipCancel")}
                              onClick={() => setCancelFor(s)}>
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("dialog.addPayment", { no: payFor?.invoice_no ?? "" })}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("ipos.amountDue", { amt: Number(payFor?.due ?? 0).toFixed(2) })}</Label>
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
              {t("ipos.cancelDescShort")}
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
