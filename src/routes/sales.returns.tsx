import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Undo2, Loader2, Printer, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { buildProductDisplayName } from "@/lib/product-display";

export const Route = createFileRoute("/sales/returns")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Return Sale — SohojPharma" },
      { name: "description", content: "Process full and partial returns against existing invoices." },
    ],
  }),
  component: ReturnSalePage,
});

type SaleHit = {
  id: string;
  invoice_no: string;
  sale_date: string;
  total: number;
  status: string;
  customer_id: string | null;
  customer?: { name: string; phone: string | null } | null;
};

type SaleItem = {
  id: string;
  product_id: string;
  batch_id: string | null;
  qty: number;
  unit_price: number;
  discount: number;
  vat: number;
  line_total: number;
  returned_qty: number;
  product?: { name: string; sku: string; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null } | null;
};

type ReturnRow = {
  id: string;
  return_no: string;
  sale_id: string | null;
  return_date: string;
  total: number;
  refunded_amount: number;
  refund_method: string;
  reason: string | null;
  sale?: { invoice_no: string } | null;
};

const REFUND_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "bank", label: "Bank" },
  { value: "card", label: "Card" },
  { value: "store_credit", label: "Store Credit" },
  { value: "due", label: "Customer Due Adjustment" },
];

function ReturnSalePage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [receipt, setReceipt] = useState<null | { return_no: string; total: number; refund: number; method: string }>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // F10 focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F10") {
        e.preventDefault();
        (document.getElementById("return-search") as HTMLInputElement | null)?.focus();
      } else if (e.key === "Escape") {
        if (returnOpen) setReturnOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [returnOpen]);

  // Invoice search
  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["return-search", tenantId, debounced],
    enabled: !!tenantId,
    queryFn: async () => {
      let qb = supabase
        .from("sales")
        .select("id,invoice_no,sale_date,total,status,customer_id,customer:customers(name,phone)")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .order("sale_date", { ascending: false })
        .limit(20);
      if (debounced) qb = qb.ilike("invoice_no", `%${debounced}%`);
      const { data, error } = await qb;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SaleHit[];
    },
  });

  // Selected sale items
  const { data: items = [], isFetching: itemsLoading } = useQuery({
    queryKey: ["return-items", selectedSaleId],
    enabled: !!selectedSaleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id,product_id,batch_id,qty,unit_price,discount,vat,line_total,returned_qty,product:products(name,sku,strength,medicine_type,volume,pack_size)")
        .eq("sale_id", selectedSaleId!)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SaleItem[];
    },
  });

  // Recent returns
  const { data: returns = [] } = useQuery({
    queryKey: ["recent-returns", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select("id,return_no,sale_id,return_date,total,refunded_amount,refund_method,reason,sale:sales(invoice_no)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ReturnRow[];
    },
  });

  const sale = hits.find((s) => s.id === selectedSaleId) ?? null;

  function openReturnModal() {
    const init: Record<string, number> = {};
    items.forEach((it) => { init[it.id] = 0; });
    setReturnQty(init);
    setReason("");
    setRefundMethod("cash");
    setReturnOpen(true);
  }

  function fillAll() {
    const next: Record<string, number> = {};
    items.forEach((it) => { next[it.id] = Math.max(0, it.qty - it.returned_qty); });
    setReturnQty(next);
  }

  const refundPreview = useMemo(() => {
    let sub = 0, vat = 0;
    items.forEach((it) => {
      const q = returnQty[it.id] || 0;
      if (!q) return;
      const lineValue = it.unit_price * q - (it.discount * q) / (it.qty || 1);
      const lineVat = (it.vat * q) / (it.qty || 1);
      sub += lineValue;
      vat += lineVat;
    });
    return { sub: Math.round(sub * 100) / 100, vat: Math.round(vat * 100) / 100, total: Math.round((sub + vat) * 100) / 100 };
  }, [items, returnQty]);

  const doReturn = useMutation({
    mutationFn: async () => {
      if (!selectedSaleId) throw new Error(t("toast.noSaleSelected"));
      const payload = Object.entries(returnQty)
        .filter(([, q]) => q > 0)
        .map(([sale_item_id, q]) => ({ sale_item_id, qty: q }));
      if (!payload.length) throw new Error(t("toast.enterReturnQty"));
      // P1-A: idempotent — one client_op_id per return attempt, persisted via mutation key
      const clientOpId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const { data, error } = await supabase.rpc("pos_return", {
        _tenant_id: tenantId,
        _sale_id: selectedSaleId,
        _items: payload as never,
        _reason: reason || undefined,
        _refund_method: refundMethod,
        _refund_amount: refundPreview.total,
        _client_op_id: clientOpId,
      } as never);
      if (error) throw new Error(error.message);
      return data as { return_no: string; total: number; refunded_amount: number; refund_method: string };
    },
    onSuccess: (r) => {
      toast.success(t("toast.returnProcessed", { no: r.return_no }));
      setReceipt({ return_no: r.return_no, total: Number(r.total), refund: Number(r.refunded_amount), method: r.refund_method });
      setReturnOpen(false);
      qc.invalidateQueries({ queryKey: ["return-items", selectedSaleId] });
      qc.invalidateQueries({ queryKey: ["return-search"] });
      qc.invalidateQueries({ queryKey: ["recent-returns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/sales"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-lg font-bold">{t("ipos.returnSale")}</h1>
            <p className="text-xs text-muted-foreground">{t("ipos.returnSaleDesc")}</p>
          </div>
        </div>
        <Badge variant="outline">{t("ipos.shortcut")} <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">F10</kbd></Badge>
      </header>

      <div className="grid flex-1 gap-4 overflow-hidden lg:grid-cols-[380px_1fr]">
        {/* Left: search list */}
        <Card className="flex min-h-0 flex-col p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="return-search" autoFocus placeholder={t("ipos.searchInvoicePh")}
              className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mt-3 flex-1 overflow-y-auto">
            {isFetching && <div className="p-4 text-center text-xs text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>}
            {!isFetching && hits.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">{t("ipos.noInvoicesFound")}</p>}
            <ul className="space-y-1">
              {hits.map((s) => (
                <li key={s.id}>
                  <button onClick={() => setSelectedSaleId(s.id)}
                    className={cn(
                      "w-full rounded-md border p-2 text-left text-sm transition-colors hover:bg-accent",
                      selectedSaleId === s.id ? "border-primary bg-accent" : "border-border",
                    )}>
                    <div className="flex justify-between">
                      <span className="font-semibold">{s.invoice_no}</span>
                      <span className="text-xs text-muted-foreground">{new Date(s.sale_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{s.customer?.name ?? t("ipos.walkIn")}</span>
                      <span>৳ {Number(s.total).toFixed(2)}</span>
                    </div>
                    {s.status !== "completed" && (
                      <Badge variant="outline" className="mt-1 h-4 px-1 text-[9px]">{s.status}</Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Right: details */}
        <Card className="flex min-h-0 flex-col p-3">
          {!sale ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <p>{t("ipos.selectInvoiceToStart")}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <p className="text-sm font-semibold">{sale.invoice_no}</p>
                  <p className="text-xs text-muted-foreground">
                    {sale.customer?.name ?? t("ipos.walkIn")}{sale.customer?.phone ? ` · ${sale.customer.phone}` : ""} · {new Date(sale.sale_date).toLocaleString()}
                  </p>
                </div>
                <Button onClick={openReturnModal} disabled={itemsLoading || !items.length}>
                  <Undo2 className="mr-1 h-4 w-4" /> {t("ipos.processReturn")}
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-muted-foreground">
                    <tr><th className="px-2 py-2 text-left">{t("ipos.th_product")}</th>
                      <th className="px-2 py-2 text-right">{t("ipos.th_sold")}</th>
                      <th className="px-2 py-2 text-right">{t("ipos.th_returned")}</th>
                      <th className="px-2 py-2 text-right">{t("ipos.th_available")}</th>
                      <th className="px-2 py-2 text-right">{t("ipos.th_price")}</th>
                      <th className="px-2 py-2 text-right">{t("ipos.th_line")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const avail = it.qty - it.returned_qty;
                      return (
                        <tr key={it.id} className="border-t">
                          <td className="px-2 py-2">
                            <div className="font-medium">{it.product ? buildProductDisplayName(it.product) : it.product_id}</div>
                            <div className="text-[11px] text-muted-foreground">{it.product?.sku}</div>
                          </td>
                          <td className="px-2 py-2 text-right">{it.qty}</td>
                          <td className="px-2 py-2 text-right">{it.returned_qty}</td>
                          <td className={cn("px-2 py-2 text-right font-semibold", avail === 0 && "text-muted-foreground")}>{avail}</td>
                          <td className="px-2 py-2 text-right">৳ {Number(it.unit_price).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">৳ {Number(it.line_total).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Recent returns */}
      <Card className="p-3">
        <p className="mb-2 text-sm font-semibold">{t("ipos.recentReturns")}</p>
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground">
              <tr><th className="px-2 py-1 text-left">{t("ipos.th_returnNo")}</th>
                <th className="px-2 py-1 text-left">{t("ipos.th_refInvoice")}</th>
                <th className="px-2 py-1 text-left">{t("ipos.dateLbl")}</th>
                <th className="px-2 py-1 text-left">{t("ipos.th_method")}</th>
                <th className="px-2 py-1 text-right">{t("ipos.th_refund")}</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-xs text-muted-foreground">{t("ipos.noReturnsYet")}</td></tr>}
              {returns.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1 font-medium">{r.return_no}</td>
                  <td className="px-2 py-1">{r.sale?.invoice_no ?? "—"}</td>
                  <td className="px-2 py-1 text-xs text-muted-foreground">{r.return_date}</td>
                  <td className="px-2 py-1 capitalize">{r.refund_method}</td>
                  <td className="px-2 py-1 text-right font-semibold">৳ {Number(r.refunded_amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Return modal */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("dialog.returnSale", { no: sale?.invoice_no ?? "" })}</DialogTitle>
            <DialogDescription>{t("ipos.returnDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={fillAll}>{t("ipos.returnAll")}</Button>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase">
                <tr><th className="px-2 py-2 text-left">{t("ipos.th_product")}</th>
                  <th className="px-2 py-2 text-right">{t("ipos.th_sold")}</th>
                  <th className="px-2 py-2 text-right">{t("ipos.th_returned")}</th>
                  <th className="px-2 py-2 text-right">{t("ipos.th_available")}</th>
                  <th className="px-2 py-2 text-right w-32">{t("ipos.th_returnQty")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const avail = it.qty - it.returned_qty;
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-2">{it.product ? buildProductDisplayName(it.product) : it.product_id}</td>
                      <td className="px-2 py-2 text-right">{it.qty}</td>
                      <td className="px-2 py-2 text-right">{it.returned_qty}</td>
                      <td className="px-2 py-2 text-right">{avail}</td>
                      <td className="px-2 py-2 text-right">
                        <Input type="number" min={0} max={avail} disabled={avail === 0}
                          value={returnQty[it.id] ?? 0}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(avail, Number(e.target.value) || 0));
                            setReturnQty((s) => ({ ...s, [it.id]: v }));
                          }}
                          className="h-8 text-right" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{t("ipos.refundMethod")}</label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REFUND_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{t("ipos.reasonLbl2")}</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("ipos.reasonPhReturn")} />
            </div>
          </div>
          <Separator />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>{t("ipos.subtotalLbl")}</span><span>৳ {refundPreview.sub.toFixed(2)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>{t("ipos.vatLbl")}</span><span>৳ {refundPreview.vat.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-bold"><span>{t("ipos.refundTotal")}</span><span className="text-primary">৳ {refundPreview.total.toFixed(2)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}><X className="mr-1 h-3.5 w-3.5" /> {t("ipos.cancelBtn")}</Button>
            <Button onClick={() => doReturn.mutate()} disabled={doReturn.isPending || refundPreview.total <= 0}>
              {doReturn.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("ipos.confirmReturn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt */}
      <Dialog open={!!receipt} onOpenChange={(v) => { if (!v) setReceipt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("dialog.returnReceipt")}</DialogTitle></DialogHeader>
          {receipt && (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("ipos.th_returnNo")}</span><span className="font-semibold">{receipt.return_no}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("ipos.invoiceLbl")}</span><span>{sale?.invoice_no}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("ipos.totalLbl")}</span><span>৳ {receipt.total.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("ipos.receiptRefund")}</span><span className="font-semibold text-primary">৳ {receipt.refund.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("ipos.method")}</span><span className="capitalize">{receipt.method}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("ipos.dateLbl")}</span><span>{new Date().toLocaleString()}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-3.5 w-3.5" /> {t("ipos.printBtn")}</Button>
            <Button onClick={() => setReceipt(null)}>{t("ipos.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
