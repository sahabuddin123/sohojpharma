import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRegisterSummary, type ActiveRegister, type RegisterSummary } from "@/hooks/use-active-register";
import { Wallet, ArrowUpFromLine, ArrowDownToLine, Receipt, Clock, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

function txnLabel(t: (k: string) => string, type: "cash_in" | "cash_out" | "expense") {
  if (type === "cash_in") return t("ipos.cashInTip");
  if (type === "cash_out") return t("ipos.cashOutTip");
  return t("ipos.expenseTip");
}

/* ====================================================================== */
/* OPEN REGISTER                                                           */
/* ====================================================================== */
export function OpenRegisterDialog({
  open, onOpenChange, branchId,
}: { open: boolean; onOpenChange: (v: boolean) => void; branchId?: string | null }) {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("0");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      const d = new Date();
      setName(`Drawer ${d.toLocaleDateString()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`);
      setAmount("0");
      setNotes("");
    }
  }, [open]);

  const m = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error(t("toast.noTenant"));
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 0) throw new Error(t("toast.openingNumberInvalid"));
      const { data, error } = await supabase.rpc("open_cash_register" as never, {
        _tenant_id: currentTenantId,
        _branch_id: branchId ?? null,
        _register_name: name,
        _opening_amount: amt,
        _notes: notes || null,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(t("toast.registerOpened"));
      qc.invalidateQueries({ queryKey: ["active-register"] });
      qc.invalidateQueries({ queryKey: ["register-history"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> {t("dialog.openCashRegister")}</DialogTitle>
          <DialogDescription>{t("ipos.openMustOpenRegister")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{t("ipos.registerName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("ipos.openingCash")}</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("ipos.notesLabel")}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("ipos.cancelBtn")}</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? t("ipos.opening") : t("ipos.openRegisterBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================== */
/* CASH IN / OUT / EXPENSE                                                 */
/* ====================================================================== */
export function CashTxnDialog({
  open, onOpenChange, register, type,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  register: ActiveRegister | null;
  type: "cash_in" | "cash_out" | "expense";
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("cash");

  useEffect(() => { if (open) { setAmount(""); setNotes(""); setMethod("cash"); } }, [open]);

  const m = useMutation({
    mutationFn: async () => {
      if (!register) throw new Error(t("toast.noActiveRegister"));
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error(t("toast.amountPositive"));
      const { error } = await supabase.rpc("record_cash_txn" as never, {
        _tenant_id: register.tenant_id,
        _register_id: register.id,
        _type: type,
        _amount: amt,
        _payment_method: type === "expense" ? method : "cash",
        _notes: notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("toast.txnRecorded", { label: txnLabel(t, type) }));
      qc.invalidateQueries({ queryKey: ["register-summary", register?.id] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const Icon = type === "cash_in" ? ArrowDownToLine : type === "cash_out" ? ArrowUpFromLine : Receipt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon className="h-5 w-5" /> {txnLabel(t, type)}</DialogTitle>
          <DialogDescription>
            {type === "cash_in" && t("ipos.cashInDescTxt")}
            {type === "cash_out" && t("ipos.cashOutDescTxt")}
            {type === "expense" && t("ipos.expenseDescTxt")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{t("ipos.amountLbl")}</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          {type === "expense" && (
            <div className="grid gap-1.5">
              <Label>{t("ipos.paidVia")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="rocket">Rocket</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>{type === "expense" ? t("ipos.reasonCategory") : t("ipos.reasonNotes")}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("ipos.cancelBtn")}</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? t("ipos.saving") : t("ipos.saveBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====================================================================== */
/* CLOSE REGISTER                                                          */
/* ====================================================================== */
export function CloseRegisterDialog({
  open, onOpenChange, register,
}: { open: boolean; onOpenChange: (v: boolean) => void; register: ActiveRegister | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: sum } = useRegisterSummary(register?.id);
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<{
    expected: number;
    actual: number;
    registerName: string;
    summary: RegisterSummary | null;
  } | null>(null);

  const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [showDenoms, setShowDenoms] = useState(true);

  useEffect(() => {
    if (open) { setActual(""); setNotes(""); setDone(null); setCounts({}); }
  }, [open]);

  const updateCount = (denom: number, count: number) => {
    const next = { ...counts, [denom]: Math.max(0, count) };
    setCounts(next);
    const totalCounted = Object.entries(next).reduce(
      (s, [d, c]) => s + Number(d) * (Number(c) || 0),
      0
    );
    setActual(String(totalCounted));
  };

  const expected = sum?.expected_cash ?? 0;
  const diff = Number(actual || 0) - expected;

  const m = useMutation({
    mutationFn: async () => {
      if (!register) throw new Error(t("toast.noActiveRegister"));
      const amt = Number(actual);
      if (!Number.isFinite(amt) || amt < 0) throw new Error(t("toast.actualCashInvalid"));
      const { error } = await supabase.rpc("close_cash_register" as never, {
        _register_id: register.id,
        _actual_cash: amt,
        _notes: notes || null,
      } as never);
      if (error) throw error;
      return amt;
    },
    onSuccess: (amt) => {
      setDone({
        expected,
        actual: amt,
        registerName: register?.register_name ?? "",
        summary: sum ?? null,
      });
      toast.success(t("toast.registerClosed"));
      qc.invalidateQueries({ queryKey: ["active-register"] });
      qc.invalidateQueries({ queryKey: ["register-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function Row({ label, value, accent }: { label: string; value: number; accent?: string }) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-mono font-semibold", accent)}>৳ {value.toFixed(2)}</span>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-warning" /> {t("dialog.closeRegister")}</DialogTitle>
          <DialogDescription>{t("ipos.closeRegisterDesc")}</DialogDescription>
        </DialogHeader>

        {!done ? (
          <>
            <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
              <Row label={t("ipos.openingCashRow")} value={sum?.opening_cash ?? 0} />
              <Row label={t("ipos.cashSales")} value={sum?.cash_sales ?? 0} accent="text-success" />
              <Row label={t("ipos.dueCollectionCash")} value={sum?.due_collection_cash ?? 0} accent="text-success" />
              <Row label={t("ipos.cashInRow")} value={sum?.cash_in ?? 0} accent="text-success" />
              <Row label={t("ipos.refundsCash")} value={-(sum?.refunds_cash ?? 0)} accent="text-destructive" />
              <Row label={t("ipos.expensesCash")} value={-(sum?.expenses_cash ?? 0)} accent="text-destructive" />
              <Row label={t("ipos.supplierPaidCash")} value={-(sum?.supplier_payment_cash ?? 0)} accent="text-destructive" />
              <Row label={t("ipos.cashOutRow")} value={-(sum?.cash_out ?? 0)} accent="text-destructive" />
              <Separator className="my-1" />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">ক্যাশে থাকা উচিত (Expected)</span>
                <span className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">৳ {expected.toFixed(2)}</span>
              </div>
            </div>

            {/* Note banner */}
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-900 dark:text-blue-300">
              💡 <b>মনে রাখবেন:</b> bKash, Nagad ও কার্ডের টাকা ক্যাশে থাকে না, তাই এখানে গোণা হয় না।
            </div>

            {/* Cash Denominations Note Counter */}
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  নোট গোনার হিসাব (Note Denominations)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDenoms(!showDenoms)}
                  className="h-6 text-xs text-emerald-600"
                >
                  {showDenoms ? "লুকান" : "দেখান"}
                </Button>
              </div>

              {showDenoms && (
                <div className="grid grid-cols-2 gap-2 text-xs max-h-48 overflow-y-auto pr-1">
                  {DENOMS.map((denom) => {
                    const cnt = counts[denom] || 0;
                    const sub = denom * cnt;
                    return (
                      <div key={denom} className="flex items-center justify-between gap-1 rounded bg-muted/30 p-1.5 border border-border/60">
                        <span className="font-bold text-xs w-12">৳{denom}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">×</span>
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={cnt > 0 ? cnt : ""}
                            onChange={(e) => updateCount(denom, Number(e.target.value) || 0)}
                            className="h-7 w-14 text-center font-bold text-xs p-1"
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold text-right w-14 text-muted-foreground">
                          {sub > 0 ? `৳${sub}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="font-semibold text-xs">ক্যাশে মোট গুনে পাওয়া টাকা (Actual Cash)</Label>
                <Input type="number" min={0} step="0.01" autoFocus value={actual} onChange={(e) => setActual(e.target.value)} className="font-bold text-base" />
              </div>
              {actual !== "" && (
                <div className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-bold shadow-2xs",
                  Math.abs(diff) < 0.01 && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
                  diff > 0.01 && "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30",
                  diff < -0.01 && "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30",
                )}>
                  <span>{Math.abs(diff) < 0.01 ? "✓ ক্যাশ হুবহু মিলেছে (Balanced)" : diff > 0 ? "অতিরিক্ত ক্যাশ (+)" : "ক্যাশ ঘাটতি (-)"}</span>
                  <span className="font-mono text-base font-black">৳ {diff.toFixed(2)}</span>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>{t("ipos.closingNotes")}</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t("ipos.cancelBtn")}</Button>
              <Button onClick={() => m.mutate()} disabled={m.isPending || actual === ""}>
                {m.isPending ? t("ipos.closing") : t("ipos.closeRegisterBtn")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">{t("ipos.shiftReport")}</p>
              <div className="mt-2 grid gap-1.5">
                <Row label={t("ipos.expectedCash")} value={done.expected} />
                <Row label={t("ipos.actualCash")} value={done.actual} />
                <Row label={t("ipos.differenceLbl")} value={done.actual - done.expected}
                  accent={Math.abs(done.actual - done.expected) < 0.01 ? "text-success"
                    : done.actual > done.expected ? "text-warning" : "text-destructive"} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                const node = document.getElementById("register-close-print");
                console.log("REGISTER PRINT NODE", node);
                if (node) console.log("HTML", node.outerHTML);
                setTimeout(() => window.print(), 50);
              }}>{t("ipos.printReport")}</Button>
              <Button onClick={() => onOpenChange(false)}>{t("ipos.done")}</Button>
            </DialogFooter>
            {typeof document !== "undefined" && createPortal(
              <div id="register-close-print">
                <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                  {t("ipos.shiftReport")}
                </div>
                <div style={{ textAlign: "center", fontSize: 11, marginBottom: 8 }}>
                  {done.registerName}<br />
                  {new Date().toLocaleString()}
                </div>
                <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
                <table style={{ width: "100%", fontSize: 12 }}>
                  <tbody>
                    <tr><td>{t("ipos.openingCashRow")}</td><td style={{ textAlign: "right" }}>৳ {(done.summary?.opening_cash ?? 0).toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.cashSales")}</td><td style={{ textAlign: "right" }}>৳ {(done.summary?.cash_sales ?? 0).toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.dueCollectionCash")}</td><td style={{ textAlign: "right" }}>৳ {(done.summary?.due_collection_cash ?? 0).toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.cashInRow")}</td><td style={{ textAlign: "right" }}>৳ {(done.summary?.cash_in ?? 0).toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.refundsCash")}</td><td style={{ textAlign: "right" }}>-৳ {(done.summary?.refunds_cash ?? 0).toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.expensesCash")}</td><td style={{ textAlign: "right" }}>-৳ {(done.summary?.expenses_cash ?? 0).toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.supplierPaidCash")}</td><td style={{ textAlign: "right" }}>-৳ {(done.summary?.supplier_payment_cash ?? 0).toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.cashOutRow")}</td><td style={{ textAlign: "right" }}>-৳ {(done.summary?.cash_out ?? 0).toFixed(2)}</td></tr>
                  </tbody>
                </table>
                <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
                <table style={{ width: "100%", fontSize: 12, fontWeight: 700 }}>
                  <tbody>
                    <tr><td>{t("ipos.expectedCash")}</td><td style={{ textAlign: "right" }}>৳ {done.expected.toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.actualCash")}</td><td style={{ textAlign: "right" }}>৳ {done.actual.toFixed(2)}</td></tr>
                    <tr><td>{t("ipos.differenceLbl")}</td><td style={{ textAlign: "right" }}>৳ {(done.actual - done.expected).toFixed(2)}</td></tr>
                  </tbody>
                </table>
                {notes && (
                  <>
                    <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
                    <div style={{ fontSize: 11 }}>{notes}</div>
                  </>
                )}
              </div>,
              document.body
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


/* ====================================================================== */
/* ACTIVE REGISTER CHIP (header)                                           */
/* ====================================================================== */
export function ActiveRegisterChip({ register }: { register: ActiveRegister | null }) {
  const { t } = useTranslation();
  const { data: sum } = useRegisterSummary(register?.id);
  const duration = useMemo(() => {
    if (!register) return "";
    const diff = Date.now() - new Date(register.opened_at).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
  }, [register, sum]); // recompute when summary refetches

  if (!register) {
    return (
      <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
        <Lock className="mr-1 h-3 w-3" /> {t("ipos.noRegisterChip")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
      <Clock className="mr-1 h-3 w-3" />
      {register.register_name} · ৳{(sum?.expected_cash ?? register.opening_amount).toFixed(0)} · {duration}
    </Badge>
  );
}
