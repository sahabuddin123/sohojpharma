import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { recordSalePayments } from "@/lib/api/payments.functions";
import { useTranslation } from "react-i18next";

type Method = "cash" | "bkash" | "nagad" | "rocket" | "bank" | "card" | "other";
type Line = { method: Method; amount: string; reference?: string; mobile_no?: string };

export function POSPaymentDialog({
  open, onOpenChange, tenantId, saleId, subtotal, discount, vat, total, hasCustomer, onPaid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  saleId: string;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  hasCustomer: boolean;
  onPaid?: () => void;
}) {
  const { t } = useTranslation();
  const METHODS: { value: Method; label: string }[] = [
    { value: "cash", label: t("ipos.payCash") },
    { value: "bkash", label: t("ipos.payBkash") },
    { value: "nagad", label: t("ipos.payNagad") },
    { value: "rocket", label: t("ipos.payRocket") },
    { value: "bank", label: t("ipos.payBank") },
    { value: "card", label: t("ipos.payCard") },
    { value: "other", label: t("ipos.payOther") },
  ];
  const [lines, setLines] = useState<Line[]>([{ method: "cash", amount: String(total) }]);
  const paid = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);
  const due = Math.max(0, +(total - paid).toFixed(2));
  const change = Math.max(0, +(paid - total).toFixed(2));

  const fn = useServerFn(recordSalePayments);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => fn({ data: {
      tenantId, saleId, due,
      payments: lines
        .filter((l) => Number(l.amount) > 0)
        .map((l) => ({
          method: l.method,
          amount: Math.min(Number(l.amount), l.method === "cash" ? Number(l.amount) : Number(l.amount)),
          reference: l.reference?.trim() || undefined,
          mobile_no: l.mobile_no?.trim() || undefined,
        })),
    } }),
    onSuccess: () => {
      toast.success(due > 0 ? t("toast.paidWithDue", { amt: due.toFixed(2) }) : t("toast.paymentRecorded"));
      qc.invalidateQueries({ queryKey: ["sale-payments", saleId] });
      qc.invalidateQueries({ queryKey: ["due-dashboard", tenantId] });
      onPaid?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function update(i: number, patch: Partial<Line>) {
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function add() {
    setLines((arr) => [...arr, { method: "bkash", amount: String(due || 0) }]);
  }
  function remove(i: number) {
    setLines((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)));
  }

  const invalid = Math.abs(paid - total) > 0.01 && !(hasCustomer && paid < total);
  const otherOverpay = lines.some((l) => l.method !== "cash" && Number(l.amount) > total + 0.01);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> {t("ipos.paymentTitle")}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border p-3 text-sm">
          <Row label={t("ipos.subtotalLbl")} value={subtotal} />
          <Row label={t("ipos.discountLbl")} value={-discount} />
          <Row label={t("ipos.vatLbl")} value={vat} />
          <div className="my-2 border-t" />
          <Row label={t("ipos.grandTotal")} value={total} bold />
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[120px,1fr,auto] gap-2 items-end">
              <div>
                <Label className="text-xs">{t("ipos.methodLabel")}</Label>
                <Select value={l.method} onValueChange={(v) => update(i, { method: v as Method })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("ipos.amountLabel")}</Label>
                <Input type="number" step="0.01" value={l.amount} onChange={(e) => update(i, { amount: e.target.value })} />
                {(l.method === "bkash" || l.method === "nagad" || l.method === "rocket") && (
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <Input placeholder={t("ipos.mobileNoPh")} value={l.mobile_no ?? ""} maxLength={40} onChange={(e) => update(i, { mobile_no: e.target.value })} />
                    <Input placeholder={t("ipos.trxIdPh")} value={l.reference ?? ""} maxLength={120} onChange={(e) => update(i, { reference: e.target.value })} />
                  </div>
                )}
                {(l.method === "bank" || l.method === "card") && (
                  <Input className="mt-1" placeholder={t("ipos.referencePh")} value={l.reference ?? ""} maxLength={120} onChange={(e) => update(i, { reference: e.target.value })} />
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(i)} disabled={lines.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" /> {t("ipos.addMethod")}</Button>
        </div>

        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <Row label={t("ipos.paidLbl")} value={paid} />
          {change > 0 && <Row label={t("ipos.change")} value={change} accent="success" />}
          {due > 0 && (
            <Row label={hasCustomer ? t("ipos.dueAddedLedger") : t("ipos.dueRequiresCustomerShort")} value={due} accent={hasCustomer ? "warning" : "destructive"} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("ipos.cancelBtn")}</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || (due > 0 && !hasCustomer) || otherOverpay}
          >
            {t("ipos.confirmPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: number; bold?: boolean; accent?: "success" | "warning" | "destructive" }) {
  const cls = accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : accent === "destructive" ? "text-destructive" : "";
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""} ${cls}`}>
      <span>{label}</span>
      <span>৳ {value.toFixed(2)}</span>
    </div>
  );
}
