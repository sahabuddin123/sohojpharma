import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveRegister } from "@/hooks/use-active-register";
import { usePharmacyProfile } from "@/hooks/use-pharmacy-profile";
import { useBrandingSettings } from "@/hooks/use-branding-settings";
import { generateNextNumber } from "@/lib/api/number-series.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Printer, CheckCircle2, Wallet, Loader2, BookOpen, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { buildCustomerLedger } from "@/lib/api/customer-ledger-unified";



export type DueCustomer = {
  customer_id: string;
  name: string;
  phone: string | null;
  net_due: number;
  open_invoice_due: number;
  code?: string | null;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/* ====================================================================== */
/* PRINTABLE RECEIPT (only visible in print)                               */
/* ====================================================================== */
function CustomerPaymentThermalReceipt({
  pharmacy, customer, receiptNo, dateTime, method, reference, amount,
  previousDue, remainingDue, collectedBy, widthMm = 80,
}: {
  pharmacy: { name: string; address?: string; phone?: string; logoUrl?: string };
  customer: DueCustomer | null;
  receiptNo: string;
  dateTime: string;
  method: string;
  reference?: string;
  amount: number;
  previousDue: number;
  remainingDue: number;
  collectedBy?: string;
  widthMm?: number;
}) {
  const compact = widthMm === 58;
  const SEP = compact ? "------------------------" : "--------------------------------";
  const fmt = (n: number) =>
    `৳ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const center: React.CSSProperties = { textAlign: "center" };
  const baseFont = compact ? 10 : 12;
  const smallFont = compact ? 10 : 11;
  return (
    <div
      id="thermal-receipt-print"
      style={{
        width: `${widthMm}mm`,
        maxWidth: `${widthMm}mm`,
        boxSizing: "border-box",
        margin: "0 auto",
        fontFamily: 'ui-monospace, "Courier New", monospace',
        fontSize: baseFont,
        lineHeight: compact ? 1.3 : 1.4,
        color: "#000",
        background: "#fff",
        padding: compact ? "2mm" : "3mm",
      }}
    >
      {/* Header — fully dynamic */}
      {pharmacy.logoUrl && (
        <div style={{ ...center, marginBottom: "2mm" }}>
          <img
            src={pharmacy.logoUrl}
            alt=""
            style={{ maxHeight: "60px", maxWidth: "120px", display: "inline-block", objectFit: "contain" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      {pharmacy.name && (
        <div style={{
          ...center, fontWeight: 700, fontSize: compact ? 15 : 18,
          lineHeight: 1.2, textTransform: "uppercase", wordBreak: "break-word",
        }}>
          {pharmacy.name}
        </div>
      )}
      <div style={{ ...center, fontSize: smallFont, wordBreak: "break-word" }}>
        {pharmacy.address?.trim() || "-"}
      </div>
      <div style={{ ...center, fontSize: smallFont }}>
        Phone: {pharmacy.phone?.trim() || "-"}
      </div>

      <div style={center}>{SEP}</div>
      <div style={{ ...center, fontWeight: 700, fontSize: compact ? 14 : 16, letterSpacing: 1, margin: "2px 0" }}>
        PAYMENT RECEIPT
      </div>
      <div style={center}>{SEP}</div>

      {/* Customer info — always render values; use dash fallback so labels never appear alone */}
      <RcptRow l="Receipt No:" v={receiptNo || "-"} />
      <RcptRow l="Date:" v={dateTime || "-"} />
      <RcptRow l="Customer:" v={customer?.name || "-"} />
      <RcptRow l="Code:" v={customer?.code || "-"} />
      <RcptRow l="Mobile:" v={customer?.phone || "-"} />

      <div style={center}>{SEP}</div>
      <div style={{ ...center, fontWeight: 700, letterSpacing: 1 }}>PAYMENT DETAILS</div>
      <div style={center}>{SEP}</div>

      <RcptRow l="Previous Due" v={fmt(previousDue)} weight={400} />
      <RcptRow l="Collected" v={fmt(amount)} weight={600} />
      <div style={center}>{SEP}</div>
      <RcptRow l="Remaining Due" v={fmt(remainingDue)} weight={700} size={14} />
      <div style={center}>{SEP}</div>

      {/* Footer info */}
      <RcptRow l="Payment Method" v={method || "-"} />
      <RcptRow l="Reference" v={reference?.trim() || "-"} />
      <RcptRow l="Collected By" v={collectedBy?.trim() || "-"} />

      <div style={center}>{SEP}</div>
      <div style={{ ...center, fontWeight: 700, marginTop: "2mm" }}>Thank You For Your Payment</div>
      <div style={center}>Visit Again</div>
      <div style={center}>{SEP}</div>
      <div style={{ ...center, fontSize: 9, opacity: 0.7, marginTop: "1mm" }}>
        Powered by SohojPharma
      </div>
    </div>
  );
}


function RcptRow({ l, v, weight, size }: { l: string; v: string; weight?: number; size?: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm", fontWeight: weight, fontSize: size }}>
      <span style={{ whiteSpace: "nowrap" }}>{l}</span>
      <span style={{ textAlign: "right", wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}



/* ====================================================================== */
/* COLLECT PAYMENT                                                         */
/* ====================================================================== */
export function CollectPaymentDialog({
  open, onOpenChange, customer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: DueCustomer | null;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { currentTenantId, user } = auth;
  const profile = null as { full_name?: string } | null;
  const qc = useQueryClient();
  const { data: register } = useActiveRegister();
  const { profile: pharmacy } = usePharmacyProfile(currentTenantId ?? undefined);
  const { branding } = useBrandingSettings(currentTenantId ?? undefined);
  const generateNumber = useServerFn(generateNextNumber);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Runtime assertion: only one #thermal-receipt-print may exist in the DOM.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () => {
      const count = document.querySelectorAll("#thermal-receipt-print").length;
      if (count > 1) console.error("Duplicate thermal receipt detected", count);
    };
    const id = window.setTimeout(check, 0);
    return () => window.clearTimeout(id);
  });

  // Invoice/receipt settings: print_format + show_* gates
  const { data: invSettings } = useQuery({
    queryKey: ["invoice-settings", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoice_settings")
        .select("print_format, show_logo, company_name, address, phone, logo_url")
        .eq("tenant_id", currentTenantId!)
        .maybeSingle();
      return (data as {
        print_format?: string; show_logo?: boolean;
        company_name?: string | null; address?: string | null;
        phone?: string | null; logo_url?: string | null;
      } | null) ?? null;
    },
  });
  const widthMm = invSettings?.print_format === "58mm" ? 58 : 80;





  const PAY_METHODS = [
    { v: "cash", l: t("ipos.payCash") }, { v: "bkash", l: t("ipos.payBkash") }, { v: "nagad", l: t("ipos.payNagad") },
    { v: "rocket", l: t("ipos.payRocket") }, { v: "bank", l: t("ipos.payBank") }, { v: "card", l: t("ipos.payCard") },
    { v: "other", l: t("ipos.payChequeOther") },
  ];

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [linkRegister, setLinkRegister] = useState(true);
  const [receipt, setReceipt] = useState<null | {
    id: string; amount: number; method: string; remaining_due: number;
    previous_due: number; reference: string; receipt_no: string;
  }>(null);

  const parseMoneyInput = (value: string) => {
    const trimmed = value.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
      throw new Error("Enter a valid amount with maximum 2 decimal places");
    }
    const [whole, decimal = ""] = trimmed.split(".");
    const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error(t("toast.amountPositive"));
    return { cents, amount: cents / 100 };
  };

  useEffect(() => {
    if (open) {
      setAmount(customer?.net_due ? Math.max(customer.net_due, 0).toFixed(2) : "");
      setMethod("cash"); setReference(""); setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
      setLinkRegister(true);
      setReceipt(null);
    }
  }, [open, customer]);

  const dueAmt = Math.max(customer?.net_due ?? 0, 0);

  const m = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error(t("toast.noTenant"));
      if (!customer) throw new Error(t("toast.noTenant"));
      const parsed = parseMoneyInput(amount);
      const entered_amount = parsed.amount;
      const rpc_payload_amount = parsed.amount;

      const { data: previousDueDb, error: previousDueErr } = await supabase.rpc(
        "customer_due_summary" as never,
        { p_customer_id: customer.customer_id } as never,
      );
      if (previousDueErr) throw previousDueErr;
      const previous_due = roundMoney(Number(previousDueDb ?? 0));

      if (previous_due > 0 && rpc_payload_amount > previous_due + 0.01) {
        throw new Error(`Cannot collect more than current due (৳${previous_due.toFixed(2)})`);
      }

      if (rpc_payload_amount !== entered_amount) {
        throw new Error("Amount mismatch");
      }

      console.log("[collect_customer_due:before_save]", {
        entered_amount,
        rpc_payload_amount,
        saved_payment_amount: null,
        previous_due,
        calculated_due: null,
        customer_due_summary_due: previous_due,
        customer_card_due: roundMoney(Number(customer.net_due ?? 0)),
        receipt_due: null,
        customer_id: customer.customer_id,
      });

      const { data, error } = await supabase.rpc("collect_customer_due" as never, {
        _tenant_id: currentTenantId,
        _customer_id: customer.customer_id,
        _amount: rpc_payload_amount.toFixed(2),
        _method: method,
        _reference: reference || null,
        _notes: notes || null,
        _payment_date: date,
        _sale_id: null,
        _register_id: linkRegister && method === "cash" ? register?.id ?? null : null,
        _client_op_id: crypto.randomUUID(),
      } as never);
      if (error) throw error;
      const row = data as { id: string; amount: number | string; method: string };
      // Fetch authoritative saved row to display DB value on receipt (never the form value)
      const { data: savedRow, error: fetchErr } = await supabase
        .from("customer_payments")
        .select("id, amount, method")
        .eq("id", row.id)
        .single();
      if (fetchErr) throw fetchErr;
      const saved_amount = Number(savedRow.amount);
      if (Math.abs(saved_amount - rpc_payload_amount) > 0.001) {
        throw new Error(`Amount mismatch: entered ৳${rpc_payload_amount.toFixed(2)} but saved ৳${saved_amount.toFixed(2)}`);
      }
      // Race-safe receipt number from number series
      let receiptNo = "";
      try {
        const res = await generateNumber({ data: { tenant_id: currentTenantId, doc_type: "customer_receipt" } });
        receiptNo = res.number;
      } catch {
        receiptNo = `RCP-${String(row.id).slice(0, 8).toUpperCase()}`;
      }
      // Read authoritative remaining due from DB (no JS float math).
      const { data: remainingDb, error: remainingErr } = await supabase.rpc(
        "customer_due_summary" as never,
        { p_customer_id: customer.customer_id } as never,
      );
      if (remainingErr) throw remainingErr;
      const remaining = roundMoney(Number(remainingDb ?? 0));
      const { data: cardRow } = await supabase
        .from("customers")
        .select("due_balance")
        .eq("id", customer.customer_id)
        .maybeSingle();
      const customer_card_due = roundMoney(Number(cardRow?.due_balance ?? remaining));
      const calculated_due = roundMoney(previous_due - saved_amount);
      console.log("[collect_customer_due:forensic]", {
        entered_amount,
        rpc_payload_amount,
        saved_payment_amount: saved_amount,
        previous_due,
        calculated_due,
        customer_due_summary_due: remaining,
        customer_card_due,
        receipt_due: remaining,
        customer_id: customer.customer_id,
        payment_id: row.id,
      });
      if (Math.abs(customer_card_due - remaining) > 0.005) {
        console.warn("[collect_customer_due:variance]", { customer_card_due, customer_due_summary_due: remaining });
      }
      return { row, amt: saved_amount, receiptNo, remaining, previousDue: previous_due };
    },
    onSuccess: ({ row, amt, receiptNo, remaining, previousDue }) => {
      setReceipt({
        id: row.id, amount: amt, method, remaining_due: remaining,
        previous_due: previousDue, reference, receipt_no: receiptNo,
      });
      toast.success(t("toast.collected", { amt: amt.toFixed(2) }));

      qc.invalidateQueries({ queryKey: ["due-customers"] });
      qc.invalidateQueries({ queryKey: ["due-dashboard"] });
      qc.invalidateQueries({ queryKey: ["customer-ledger", customer?.customer_id] });
      qc.invalidateQueries({ queryKey: ["customer-ledger-unified"] });
      qc.invalidateQueries({ queryKey: ["customers-list"] });
      qc.invalidateQueries({ queryKey: ["customer", customer?.customer_id] });
      qc.invalidateQueries({ queryKey: ["customer-payments", customer?.customer_id] });
      qc.invalidateQueries({ queryKey: ["customer-statement", customer?.customer_id] });
      qc.invalidateQueries({ queryKey: ["customer-kpis"] });
      qc.invalidateQueries({ queryKey: ["register-summary", register?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPct = (pct: number) => setAmount((dueAmt * pct).toFixed(2));

  const handleDownloadPdf = async () => {
    console.log("Download PDF Clicked");
    const existing = document.querySelectorAll("#thermal-receipt-print");
    console.log("PDF RECEIPT COUNT", existing.length);
    if (existing.length !== 1) {
      console.error("Duplicate thermal receipt detected", existing.length);
    }
    const element = existing[0] as HTMLElement | undefined;
    if (!element) { toast.error("Receipt element not found"); return; }

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-thermal-pdf-clone", "true");
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-99999px";
    wrapper.style.top = "0";
    wrapper.style.background = "#fff";
    wrapper.style.padding = "0";
    const cloneId = `thermal-receipt-print-clone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clone = element.cloneNode(true) as HTMLElement;
    clone.id = cloneId;
    clone.style.position = "static";
    clone.style.left = "auto";
    clone.style.top = "auto";
    clone.style.visibility = "visible";
    clone.style.display = "block";
    clone.style.background = "#fff";
    clone.style.width = `${widthMm}mm`;
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    const sanitize = (root: HTMLElement) => {
      const unsafeColor = /oklch\(|oklab\(|\blch\(|\blab\(|color-mix\(|var\(--/i;
      const scrub = (value: string, fallback: string) => {
        if (!value || value === "initial" || value === "inherit" || value === "unset") return fallback;
        return unsafeColor.test(value) ? fallback : value;
      };
      const nodes: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
      for (const el of nodes) {
        const cs = getComputedStyle(el);
        el.style.color = scrub(cs.color, "#000000");
        const bg = scrub(cs.backgroundColor, el === root ? "#ffffff" : "transparent");
        el.style.background = bg === "rgba(0, 0, 0, 0)" ? (el === root ? "#ffffff" : "transparent") : bg;
        el.style.backgroundColor = el.style.background;
        el.style.backgroundImage = "none";
        el.style.borderTop = `${cs.borderTopWidth} ${cs.borderTopStyle === "none" ? "solid" : cs.borderTopStyle} #cccccc`;
        el.style.borderRight = `${cs.borderRightWidth} ${cs.borderRightStyle === "none" ? "solid" : cs.borderRightStyle} #cccccc`;
        el.style.borderBottom = `${cs.borderBottomWidth} ${cs.borderBottomStyle === "none" ? "solid" : cs.borderBottomStyle} #cccccc`;
        el.style.borderLeft = `${cs.borderLeftWidth} ${cs.borderLeftStyle === "none" ? "solid" : cs.borderLeftStyle} #cccccc`;
        el.style.borderColor = "#cccccc";
        el.style.outlineColor = "#cccccc";
        el.style.textDecorationColor = "#000000";
        el.style.caretColor = "#000000";
        el.style.accentColor = "#000000";
        el.style.boxShadow = "none";
        el.style.textShadow = "none";
        (el.style as any).fill = "#000000";
        (el.style as any).stroke = "#000000";
      }
    };
    sanitize(clone);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      console.log("USING NEW PDF EXPORT");
      const canvas = await html2canvas(clone, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: (clonedDocument) => {
          clonedDocument.documentElement.style.background = "#ffffff";
          clonedDocument.documentElement.style.color = "#000000";
          clonedDocument.body.style.background = "#ffffff";
          clonedDocument.body.style.color = "#000000";
          const clonedReceipt = clonedDocument.getElementById(cloneId) as HTMLElement | null;
          if (clonedReceipt) sanitize(clonedReceipt);
        },
      });
      console.log("CANVAS CREATED");
      const imgData = canvas.toDataURL("image/png");
      const pdfHeight = (canvas.height * widthMm) / canvas.width;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [widthMm, pdfHeight] });
      pdf.addImage(imgData, "PNG", 0, 0, widthMm, pdfHeight);
      pdf.save(`Customer-Payment-${receipt?.receipt_no ?? "Receipt"}.pdf`);
      console.log("PDF SAVED");
    } catch (err: any) {
      console.error("PDF ERROR", err);
      toast.error(`PDF generation failed: ${err?.message ?? String(err)}`);
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      document.querySelectorAll('[data-thermal-pdf-clone="true"]').forEach((n) => n.parentNode?.removeChild(n));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {!receipt ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> Collect Due
              </DialogTitle>
              <DialogDescription>
                {customer ? (
                  <span className="block space-y-0.5">
                    <span className="block">Customer: <strong>{customer.name}</strong></span>
                    {customer.code && <span className="block">Code: <strong className="font-mono">{customer.code}</strong></span>}
                    <span className="block">Current Due: <strong className="text-destructive">৳ {dueAmt.toFixed(2)}</strong></span>
                  </span>
                ) : null}
              </DialogDescription>
            </DialogHeader>


            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label>{t("ipos.amountTk")}</Label>
                  <Input type="number" min={0} step="0.01" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("ipos.dateLbl")}</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              {dueAmt > 0 && (
                <div className="flex gap-1.5">
                  {[0.25, 0.5, 0.75, 1].map((p) => (
                    <Button key={p} type="button" size="sm" variant="outline"
                      className="flex-1 h-7 text-xs" onClick={() => setPct(p)}>
                      {Math.round(p * 100)}%
                    </Button>
                  ))}
                </div>
              )}


              <div className="grid gap-1.5">
                <Label>{t("ipos.methodLabel")}</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_METHODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>{t("ipos.refTxnLbl")}</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)}
                  placeholder={t("ipos.refTxnPh")} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("ipos.notesLbl")}</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {method === "cash" && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={linkRegister} onChange={(e) => setLinkRegister(e.target.checked)} />
                  {register ? <>{t("ipos.logIntoRegister", { name: register.register_name })}</> : <span className="text-warning">{t("ipos.noRegisterOpenWarn")}</span>}
                </label>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t("ipos.cancelBtn")}</Button>
              <Button onClick={() => m.mutate()} disabled={m.isPending}>
                {m.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("ipos.collectBtn")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="dialog-header-actions">
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" /> {t("dialog.paymentReceived")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <Row label="Receipt No" value={receipt.receipt_no} />
              <Row label={t("ipos.customerLbl")} value={customer?.name ?? "—"} />
              <Row label={t("ipos.amountLabel")} value={`৳ ${receipt.amount.toFixed(2)}`} />
              <Row label={t("ipos.methodLabel")} value={receipt.method} />
              <Row label={t("ipos.dateLbl")} value={date} />
              <Separator />
              <Row label="Previous Due" value={`৳ ${receipt.previous_due.toFixed(2)}`} />
              <Row label={t("ipos.remainingDueLbl")} value={`৳ ${receipt.remaining_due.toFixed(2)}`}
                accent={receipt.remaining_due > 0 ? "text-warning" : "text-success"} />
            </div>
            <DialogFooter className="action-buttons gap-2 flex-wrap sm:gap-2">
              <Button variant="outline" onClick={() => {
                // Strip any leftover PDF clones BEFORE the print snapshot.
                document.querySelectorAll('[data-thermal-pdf-clone="true"], [id^="thermal-receipt-print-clone"]')
                  .forEach((n) => n.parentNode?.removeChild(n));
                const receiptCount = document.querySelectorAll("#thermal-receipt-print").length;
                console.log("receipt count", receiptCount);
                const paymentNodes = Array.from(document.querySelectorAll<HTMLElement>("body *"))
                  .filter((el) => el.children.length === 0 && /PAYMENT RECEIPT/i.test(el.textContent ?? ""));
                console.log("PAYMENT RECEIPT nodes", paymentNodes.length, paymentNodes);
                if (receiptCount !== 1) {
                  console.error("Duplicate thermal receipt detected. Count:", receiptCount);
                }
                const node = document.getElementById("thermal-receipt-print");
                if (!node) { toast.error("Receipt not ready to print"); return; }
                const cleanup = () => { window.onafterprint = null; };
                window.onafterprint = cleanup;
                window.print();
              }}>
                <Printer className="mr-1 h-3.5 w-3.5" /> {t("ipos.printReceiptBtn")}
              </Button>

              <Button variant="outline" onClick={handleDownloadPdf}>
                <FileDown className="mr-1 h-3.5 w-3.5" /> Download PDF
              </Button>

              <Button onClick={() => onOpenChange(false)}>{t("ipos.done")}</Button>
            </DialogFooter>

          </>
        )}
      </DialogContent>
      {/* Render the printable thermal receipt OUTSIDE the Radix Dialog portal so
          @media print only sees this one node at body level (no overlay/dialog
          wrappers adding extra pages). */}
      {receipt && typeof document !== "undefined" && createPortal(
        <div ref={receiptRef} data-thermal-receipt-host="true">
          <CustomerPaymentThermalReceipt
            widthMm={widthMm}
            pharmacy={{
              name:
                invSettings?.company_name?.trim() ||
                pharmacy?.name ||
                "",
              address:
                invSettings?.address?.trim() ||
                [pharmacy?.address_line, pharmacy?.area, pharmacy?.district].filter(Boolean).join(", ") ||
                undefined,
              phone:
                invSettings?.phone?.trim() ||
                pharmacy?.mobile ||
                pharmacy?.phone ||
                undefined,
              logoUrl: invSettings?.show_logo !== false
                ? (invSettings?.logo_url
                    ?? branding?.receipt_logo_url
                    ?? branding?.logo_url
                    ?? pharmacy?.receipt_logo_url
                    ?? pharmacy?.logo_url
                    ?? undefined)
                : undefined,
            }}
            customer={customer}
            receiptNo={receipt.receipt_no}
            dateTime={new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            method={receipt.method}
            reference={receipt.reference}
            amount={receipt.amount}
            previousDue={receipt.previous_due}
            remainingDue={receipt.remaining_due}
            collectedBy={profile?.full_name ?? user?.email ?? undefined}
          />
        </div>,
        document.body,
      )}
    </Dialog>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", accent)}>{value}</span>
    </div>
  );
}

/* ====================================================================== */
/* CUSTOMER LEDGER DRAWER                                                  */
/* ====================================================================== */
type LedgerRow = {
  id: string; entry_date: string; entry_type: string;
  debit: number; credit: number; ref_no: string | null; notes: string | null;
  payment_id: string | null; created_at: string; running_balance: number;
};

export function CustomerLedgerDrawer({
  open, onOpenChange, customer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: DueCustomer | null;
}) {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["customer-ledger", customer?.customer_id, currentTenantId],
    enabled: open && !!customer && !!currentTenantId,
    queryFn: async () => {
      const [{ data: customerRow, error: customerError }, { data: sales, error: salesError }, { data: payments, error: paymentsError }, { data: returns, error: returnsError }, { data: summaryDue, error: summaryError }] = await Promise.all([
        supabase.from("customers").select("opening_balance").eq("tenant_id", currentTenantId!).eq("id", customer!.customer_id).single(),
        supabase.from("sales").select("id,sale_date,invoice_no,total,paid,status").eq("tenant_id", currentTenantId!).eq("customer_id", customer!.customer_id),
        supabase.from("customer_payments").select("id,payment_date,amount,reference,sale_id,created_at").eq("tenant_id", currentTenantId!).eq("customer_id", customer!.customer_id),
        supabase.from("sales_returns").select("id,return_date,return_no,total,refunded_amount").eq("tenant_id", currentTenantId!).eq("customer_id", customer!.customer_id),
        supabase.rpc("customer_due_summary" as never, { p_customer_id: customer!.customer_id } as never),
      ]);
      if (customerError) throw customerError;
      if (salesError) throw salesError;
      if (paymentsError) throw paymentsError;
      if (returnsError) throw returnsError;
      if (summaryError) throw summaryError;
      const { entries } = buildCustomerLedger({
        opening_balance: Number(customerRow?.opening_balance ?? 0),
        sales: sales ?? [],
        payments: payments ?? [],
        returns: returns ?? [],
      });
      const paymentCreatedAt = new Map((payments ?? []).map((p) => [p.id, p.created_at]));
      const rows = entries.map((entry) => {
        const payment_id = entry.id.startsWith("pay:") ? entry.id.slice(4) : null;
        return {
          ...entry,
          notes: null,
          payment_id,
          created_at: payment_id ? paymentCreatedAt.get(payment_id) ?? entry.entry_date : entry.entry_date,
          running_balance: entry.balance,
        };
      }) as LedgerRow[];
      const authoritativeDue = roundMoney(Number(summaryDue ?? 0));
      if (rows.length) {
        rows[rows.length - 1].running_balance = authoritativeDue;
      }
      return rows;
    },
  });

  const computed = rows;
  const finalBalance = computed.at(-1)?.running_balance ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> {t("dialog.ledger", { name: customer?.name ?? "" })}
          </SheetTitle>
          <SheetDescription>
            {customer?.phone ?? ""}
            {customer && (
              <span className={cn("ml-2 font-semibold",
                finalBalance > 0 ? "text-destructive"
                  : finalBalance < 0 ? "text-success" : "text-muted-foreground")}>
                {finalBalance > 0 ? t("ipos.dueAmt", { amt: finalBalance.toFixed(2) })
                  : finalBalance < 0 ? t("ipos.advanceAmt", { amt: Math.abs(finalBalance).toFixed(2) })
                  : t("ipos.settled")}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">{t("ipos.thDate")}</th>
                <th className="px-3 py-2 text-left">{t("ipos.thType")}</th>
                <th className="px-3 py-2 text-left">{t("ipos.thReference")}</th>
                <th className="px-3 py-2 text-right">{t("ipos.thDebit")}</th>
                <th className="px-3 py-2 text-right">{t("ipos.thCredit")}</th>
                <th className="px-3 py-2 text-right">{t("ipos.thBalance")}</th>
                <th className="px-3 py-2 text-left">payment_id</th>
                <th className="px-3 py-2 text-left">created_at</th>
                <th className="px-3 py-2 text-right">running_balance</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">{t("ipos.loadingDots")}</td></tr>
              )}
              {!isFetching && computed.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">{t("ipos.noLedgerEntries")}</td></tr>
              )}
              {computed.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5 whitespace-nowrap">{new Date(r.entry_date).toLocaleDateString()}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className="capitalize">{r.entry_type.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    <div className="font-mono">{r.ref_no ?? "—"}</div>
                    {r.notes && <div className="text-muted-foreground">{r.notes}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{Number(r.debit) > 0 ? r.debit.toFixed(2) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-success">{Number(r.credit) > 0 ? r.credit.toFixed(2) : ""}</td>
                  <td className={cn("px-3 py-1.5 text-right font-mono font-semibold",
                    r.running_balance > 0 ? "text-destructive" : r.running_balance < 0 ? "text-success" : "")}>
                    {r.running_balance.toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[10px]">{r.payment_id ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px]">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold">{r.running_balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
