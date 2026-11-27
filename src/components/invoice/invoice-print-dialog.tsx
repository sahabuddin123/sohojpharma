import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download, MessageCircle, Mail, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { InvoiceDoc, type InvoiceData, type InvoiceFormat, type InvoiceSettings } from "./invoice-doc";
import { useTranslation } from "react-i18next";
import { buildProductDisplayName } from "@/lib/product-display";
import { getCachedSale, getOfflineMeta } from "@/lib/offline/db";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";

const DEFAULT_SETTINGS: InvoiceSettings = {
  company_name: "",
  footer_message: "Thank you for your purchase!",
  primary_color: "#0ea5e9",
  show_logo: true,
  show_qr: true,
  show_bin: true,
  show_tin: true,
  show_drug_license: true,
  show_signature: false,
};

const INVOICE_PRINT_CSS = `
  html, body { background: #fff !important; color: #000 !important; margin: 0 !important; padding: 0 !important; }
  body { font-family: system-ui, sans-serif; }
  .invoice-doc { color: #000; background: #fff; font-family: var(--inv-font, system-ui, sans-serif); box-sizing: border-box; }
  .invoice-doc * { box-sizing: border-box; }
  .invoice-doc h1, .invoice-doc h2, .invoice-doc h3 { margin: 0; }
  .invoice-doc table { width: 100%; border-collapse: collapse; }
  .invoice-doc .muted { color: #555; }
  .invoice-doc.thermal-38 { width: 38mm; padding: 1mm; font-size: 8px; line-height: 1.2; }
  .invoice-doc.thermal-38 .logo { max-height: 28px; margin: 0 auto 2px; display: block; }
  .invoice-doc.thermal-38 .center { text-align: center; }
  .invoice-doc.thermal-38 .row { display: flex; justify-content: space-between; gap: 2px; }
  .invoice-doc.thermal-38 .sep { border-top: 1px dashed #000; margin: 2px 0; }
  .invoice-doc.thermal-38 table td { padding: 1px 0; vertical-align: top; }
  .invoice-doc.thermal-38 .item-name { font-weight: 600; }
  .invoice-doc.thermal-38 .thermal-signature { margin-top: 8px; text-align: center; font-size: 7px; }
  .invoice-doc.thermal-38 .thermal-signature .signature-line { display: flex; align-items: flex-end; justify-content: center; height: 16px; border-bottom: 1px dashed #000; }
  .invoice-doc.thermal-38 .thermal-signature img { max-height: 15px; max-width: 28mm; object-fit: contain; }
  .invoice-doc.thermal-58 { width: 58mm; padding: 2mm; font-size: 10px; line-height: 1.25; }
  .invoice-doc.thermal-58 .logo { max-height: 40px; margin: 0 auto 4px; display: block; }
  .invoice-doc.thermal-58 .center { text-align: center; }
  .invoice-doc.thermal-58 .row { display: flex; justify-content: space-between; gap: 4px; }
  .invoice-doc.thermal-58 .sep { border-top: 1px dashed #000; margin: 4px 0; }
  .invoice-doc.thermal-58 table td { padding: 1px 0; vertical-align: top; }
  .invoice-doc.thermal-58 .item-name { font-weight: 600; }
  .invoice-doc.thermal-58 .thermal-signature { margin-top: 10px; text-align: center; font-size: 9px; }
  .invoice-doc.thermal-58 .thermal-signature .signature-line { display: flex; align-items: flex-end; justify-content: center; height: 24px; border-bottom: 1px dashed #000; }
  .invoice-doc.thermal-58 .thermal-signature img { max-height: 22px; max-width: 42mm; object-fit: contain; }
  .invoice-doc.thermal-80 { width: 80mm; padding: 3mm; font-size: 11px; line-height: 1.3; }
  .invoice-doc.thermal-80 .logo { max-height: 50px; margin: 0 auto 6px; display: block; }
  .invoice-doc.thermal-80 .center { text-align: center; }
  .invoice-doc.thermal-80 .row { display: flex; justify-content: space-between; gap: 6px; }
  .invoice-doc.thermal-80 .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .invoice-doc.thermal-80 table td { padding: 2px 2px; vertical-align: top; }
  .invoice-doc.thermal-80 th { text-align: left; border-bottom: 1px solid #000; padding: 2px; }
  .invoice-doc.thermal-80 .thermal-signature { margin-top: 12px; text-align: center; font-size: 10px; }
  .invoice-doc.thermal-80 .thermal-signature .signature-line { display: flex; align-items: flex-end; justify-content: center; height: 30px; border-bottom: 1px dashed #000; }
  .invoice-doc.thermal-80 .thermal-signature img { max-height: 28px; max-width: 55mm; object-fit: contain; }
  .invoice-doc.a4 { width: 210mm; min-height: 297mm; padding: 18mm 15mm; font-size: 12px; }
  .invoice-doc.a4 .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 3px solid var(--inv-color, #0ea5e9); margin-bottom: 18px; }
  .invoice-doc.a4 .header .logo { max-height: 80px; }
  .invoice-doc.a4 .header h1 { font-size: 22px; color: var(--inv-color, #0ea5e9); }
  .invoice-doc.a4 .header .meta { text-align: right; font-size: 11px; }
  .invoice-doc.a4 .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 18px; }
  .invoice-doc.a4 .parties h3 { font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; margin-bottom: 6px; }
  .invoice-doc.a4 table.items { margin-bottom: 18px; }
  .invoice-doc.a4 table.items th { background: var(--inv-color, #0ea5e9); color: #fff; padding: 8px; text-align: left; font-size: 11px; }
  .invoice-doc.a4 table.items td { padding: 7px 8px; border-bottom: 1px solid #eee; }
  .invoice-doc.a4 table.items tr:nth-child(even) td { background: #fafafa; }
  .invoice-doc.a4 .totals { margin-left: auto; width: 280px; }
  .invoice-doc.a4 .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .invoice-doc.a4 .totals .grand { border-top: 2px solid #000; font-weight: 700; font-size: 14px; margin-top: 6px; padding-top: 8px; }
  .invoice-doc.a4 .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 10px; color: #555; text-align: center; }
  .invoice-doc.a4 .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-top: 50px; font-size: 11px; }
  .invoice-doc.a4 .signatures .box { text-align: center; }
  .invoice-doc.a4 .signatures .signature-line { display: flex; align-items: flex-end; justify-content: center; height: 44px; border-bottom: 1px solid #000; }
  .invoice-doc.a4 .signatures img { max-height: 40px; max-width: 100%; object-fit: contain; display: block; }
`;

const HTML_ESCAPE_MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => HTML_ESCAPE_MAP[char] ?? char);

const firstText = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();

const invoiceFormatFromSettings = (settings?: InvoiceSettings): InvoiceFormat => {
  const raw = firstText(settings?.print_format, settings?.thermal_width)?.toLowerCase();
  if (raw === "a4") return "a4";
  if (raw === "38mm" || raw === "thermal-38") return "thermal-38";
  if (raw === "58mm" || raw === "thermal-58") return "thermal-58";
  return "thermal-80";
};

async function isolatedPrint(
  markup: string,
  format: InvoiceFormat,
  title: string,
  tenantId?: string,
) {
  const pageSize = format === "a4" ? "A4" : format === "thermal-38" ? "38mm 297mm" : format === "thermal-58" ? "58mm 297mm" : "80mm 297mm";
  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>@page{size:${pageSize};margin:0;} ${INVOICE_PRINT_CSS}</style></head><body>${markup}</body></html>`;

  // Route through PrintManager so QZ Tray silent printing engages when configured.
  // Falls back to Chrome's print dialog automatically when QZ is unavailable.
  try {
    const { print } = await import("@/lib/printing/manager");
    const kind = format === "a4" ? "a4-invoice" : format === "thermal-38" ? "thermal-receipt" : format === "thermal-58" ? "thermal-receipt" : "pos-invoice";
    const paperWidth = format === "thermal-38" ? "38mm" : format === "thermal-58" ? "58mm" : "80mm";
    const result = await print(
      { kind, payload: html, paperWidth: format === "a4" ? undefined : paperWidth },
      { storeId: tenantId ?? null, silent: true },
    );
    if (result.ok && !result.fallbackUsed) return; // QZ printed silently
    if (result.ok && result.fallbackUsed) return;  // chromePrint already handled it
  } catch {
    /* fall through to legacy iframe path */
  }

  // Legacy fallback (single popup, fixed double-fire bug).
  document.querySelectorAll('iframe[data-invoice-print-frame="true"]').forEach((node) => node.remove());
  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-invoice-print-frame", "true");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden",
  });

  const cleanup = () => window.setTimeout(() => iframe.parentNode?.removeChild(iframe), 1000);
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  // Use { once: true } so the about:blank initial load doesn't trigger a second print().
  iframe.addEventListener("load", () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) return cleanup();
    frameWindow.onafterprint = cleanup;
    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(cleanup, 30_000);
    }, 100);
  }, { once: true });
}

export function useInvoiceSettings(tenantId: string) {
  return useQuery({
    queryKey: ["pos-invoice-print-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<InvoiceSettings> => {
      const offlineSettings = async (): Promise<InvoiceSettings> => {
        const s = await getOfflineMeta<Record<string, unknown>>(`shopInfo:${tenantId}`);
        if (!s) return DEFAULT_SETTINGS;
        const addr = [s.address_line, s.area, s.district].filter((v): v is string => !!v && typeof v === "string").join(", ");
        return {
          ...DEFAULT_SETTINGS,
          company_name: firstText(s.name) ?? "",
          address: firstText(addr),
          phone: firstText(s.mobile, s.phone),
        };
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await offlineSettings();
      }
      try {
        // Identity + branding (company_name, address, phone, BIN/TIN, licenses, logo, colors,
        // footer) come from Pharmacy Profile + tenant_settings.branding — the single source of
        // truth. invoice_settings contributes cosmetic overrides + per-tenant visibility toggles.
        const [tenantRes, settingsRes, brandingRes] = await Promise.all([
          supabase
            .from("tenants")
            .select("name, phone, mobile, email, website, bin, tin, trade_license_no, drug_license_no, address_line, area, district, division, postal_code, country, logo_url, receipt_logo_url")
            .eq("id", tenantId)
            .maybeSingle(),
          supabase
            .from("invoice_settings" as never)
            .select("*")
            .eq("tenant_id", tenantId)
            .is("branch_id", null)
            .maybeSingle(),
          supabase
            .from("tenant_settings")
            .select("branding")
            .eq("tenant_id", tenantId)
            .maybeSingle(),
        ]);
        if (tenantRes.error && isOfflineNetworkError(tenantRes.error)) {
          return await offlineSettings();
        }
        const cosmetic = (settingsRes.data as unknown as Partial<InvoiceSettings> & {
          show_logo?: boolean; show_bin?: boolean; show_tin?: boolean;
          show_drug_license?: boolean; show_signature?: boolean; drug_license?: string;
        }) ?? {};
        const t = (tenantRes.data ?? {}) as Record<string, unknown>;
        const b = ((brandingRes.data?.branding ?? {}) as Record<string, unknown>);
        const addr = [t.address_line, t.area, t.district, t.division, t.postal_code, t.country]
          .filter((v): v is string => !!v && typeof v === "string")
          .join(", ");
        const storeFallback: Partial<InvoiceSettings> = {
          company_name: firstText(t.name) ?? "",
          address: firstText(addr),
          phone: firstText(t.phone, t.mobile),
          email: firstText(t.email),
          website: firstText(t.website),
          bin_number: firstText(t.bin),
          tin_number: firstText(t.tin),
          trade_license: firstText(t.trade_license_no),
          drug_license: firstText(cosmetic.drug_license, t.drug_license_no),
          logo_url: firstText(b.receipt_logo_url, b.logo_url, t.receipt_logo_url, t.logo_url),
          primary_color: firstText(b.primary_color, cosmetic.primary_color),
          footer_message: firstText(b.invoice_footer, b.receipt_footer),
          signature_url: firstText(b.signature_url),
        };
        const identity: Partial<InvoiceSettings> = {
          ...storeFallback,
          company_name: firstText(cosmetic.company_name, storeFallback.company_name) ?? "",
          address: firstText(cosmetic.address, storeFallback.address),
          phone: firstText(cosmetic.phone, storeFallback.phone),
          logo_url: firstText(cosmetic.logo_url, storeFallback.logo_url),
          footer_message: firstText(cosmetic.footer_message, storeFallback.footer_message, DEFAULT_SETTINGS.footer_message),
          terms_conditions: firstText(cosmetic.terms_conditions),
        };
        return { ...DEFAULT_SETTINGS, ...cosmetic, ...identity };
      } catch (err) {
        if (isOfflineNetworkError(err)) return await offlineSettings();
        throw err;
      }
    },
  });
}



export function useSaleInvoiceData(saleId: string | null, tenantId: string) {
  return useQuery({
    queryKey: ["sale-invoice", tenantId, saleId],
    enabled: !!saleId && !!tenantId,
    queryFn: async (): Promise<InvoiceData | null> => {
      if (!saleId) return null;
      const loadCached = async (): Promise<InvoiceData | null> => {
        const c = await getCachedSale(tenantId, saleId);
        if (!c) return null;
        return {
          invoice_no: c.invoice_no,
          date: c.created_at,
          cashier: "",
          customer_name: c.customer_name ?? "",
          customer_phone: c.customer_phone ?? "",
          items: (c.items ?? []).map((it) => ({
            name: it.name,
            sku: "",
            qty: Number(it.qty),
            unit_price: Number(it.unit_price),
            discount: Number(it.discount || 0),
            vat: Number(it.vat || 0),
            line_total: Number(it.line_total),
          })),
          subtotal: Number(c.subtotal),
          discount: Number(c.discount),
          vat: Number(c.vat),
          total: Number(c.total),
          paid: Number(c.paid),
          due: Number(c.due),
          payment_method: c.payment_method,
          notes: c.pendingSync ? "অফলাইন ইনভয়েস (সিঙ্ক বাকি)" : null,
          kind: "sale",
        };
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await loadCached();
      }
      try {
        const { data: sale, error } = await supabase
          .from("sales")
          .select("id, invoice_no, created_at, subtotal, discount, vat, total, paid, due, payment_method, notes, customer_id, cashier_id")
          .eq("id", saleId)
          .maybeSingle();
        if (error) {
          if (isOfflineNetworkError(error)) return await loadCached();
          return await loadCached();
        }
        if (!sale) return await loadCached();
        const { data: items } = await supabase
          .from("sale_items")
          .select("qty, unit_price, discount, vat, line_total, product_id, products(name, sku, strength, medicine_type, volume, pack_size)")
          .eq("sale_id", saleId);
        let customer_name = "", customer_phone = "";
        if (sale.customer_id) {
          const { data: c } = await supabase.from("customers").select("name, phone").eq("id", sale.customer_id).maybeSingle();
          customer_name = c?.name ?? ""; customer_phone = c?.phone ?? "";
        }
        let cashier = "";
        if (sale.cashier_id) {
          const { data: p } = await supabase.from("profiles").select("full_name").eq("id", sale.cashier_id).maybeSingle();
          cashier = p?.full_name ?? "";
        }
        return {
          invoice_no: sale.invoice_no,
          date: sale.created_at,
          cashier,
          customer_name,
          customer_phone,
          items: (items ?? []).map((it: { qty: number; unit_price: number; discount: number; vat: number; line_total: number; products: { name: string; sku: string; strength: string | null; medicine_type: string | null; volume: string | null; pack_size: number | null } | null }) => ({
            name: it.products ? buildProductDisplayName(it.products) : "",
            sku: it.products?.sku ?? "",
            qty: Number(it.qty),
            unit_price: Number(it.unit_price),
            discount: Number(it.discount || 0),
            vat: Number(it.vat || 0),
            line_total: Number(it.line_total),
          })),
          subtotal: Number(sale.subtotal),
          discount: Number(sale.discount),
          vat: Number(sale.vat),
          total: Number(sale.total),
          paid: Number(sale.paid),
          due: Number(sale.due),
          payment_method: sale.payment_method,
          notes: sale.notes,
          kind: "sale",
        };
      } catch (err) {
        if (isOfflineNetworkError(err)) return await loadCached();
        throw err;
      }
    },
  });
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saleId: string | null;
  tenantId: string;
};

export function InvoicePrintDialog({ open, onOpenChange, saleId, tenantId }: Props) {

  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: settings } = useInvoiceSettings(tenantId);
  const { data: invoice, isLoading } = useSaleInvoiceData(saleId, tenantId);
  const [format, setFormat] = useState<InvoiceFormat>("thermal-80");
  const [waPhone, setWaPhone] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (invoice?.customer_phone) setWaPhone(invoice.customer_phone);
  }, [invoice?.customer_phone]);

  const stng = settings ?? DEFAULT_SETTINGS;

  useEffect(() => {
    if (settings) setFormat(invoiceFormatFromSettings(settings));
  }, [settings]);

  async function logPrint(fmt: string) {
    if (!saleId || !invoice || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    await supabase.from("invoice_print_logs" as never).insert({
      tenant_id: tenantId, sale_id: saleId, invoice_no: invoice.invoice_no,
      format: fmt, printed_by: user?.id,
    } as never);
  }
  async function logShare(channel: string, recipient?: string) {
    if (!saleId || !invoice || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    await supabase.from("invoice_share_logs" as never).insert({
      tenant_id: tenantId, sale_id: saleId, invoice_no: invoice.invoice_no,
      channel, recipient, shared_by: user?.id,
    } as never);
  }

  function doPrint() {
    const printable = printRef.current?.querySelector(".invoice-doc") as HTMLElement | null;
    if (!invoice || !printable) {
      toast.error(t("ipos.loadingInvoiceText"));
      return;
    }
    void isolatedPrint(printable.outerHTML, format, invoice.invoice_no, tenantId);
    void logPrint(format);
  }

  function downloadPdf() {
    const printable = printRef.current?.querySelector(".invoice-doc") as HTMLElement | null;
    if (!invoice || !printable) {
      toast.error(t("ipos.loadingInvoiceText"));
      return;
    }
    // Browser print-to-PDF
    toast.info(t("toast.savePdfHint"));
    void isolatedPrint(printable.outerHTML, format, invoice.invoice_no, tenantId);
    void logPrint("pdf");
    void logShare("pdf_download");
  }

  function shareWhatsApp() {
    if (!invoice) return;
    const phone = waPhone.replace(/\D/g, "");
    const msg = encodeURIComponent(
      `${t("ipos.waGreeting", { name: invoice.customer_name || t("ipos.defaultCustomerName") })}\n\n` +
      `${t("ipos.waThanks", { company: stng.company_name })}\n\n` +
      `${t("ipos.waInvoiceLine", { no: invoice.invoice_no })}\n` +
      `${t("ipos.waAmountLine", { amt: invoice.total.toFixed(2) })}\n` +
      `${t("ipos.waPaidLine", { amt: invoice.paid.toFixed(2) })}\n` +
      (invoice.due > 0 ? `${t("ipos.waDueLine", { amt: invoice.due.toFixed(2) })}\n\n` : "\n") +
      (stng.footer_message || "")
    );
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");
    logShare("whatsapp", phone);
  }

  function shareEmail() {
    if (!invoice) return;
    const subject = encodeURIComponent(t("ipos.emailSubjectTpl", { no: invoice.invoice_no, company: stng.company_name }));
    const body = encodeURIComponent(
      `${t("ipos.waInvoiceLine", { no: invoice.invoice_no })}\n${t("ipos.waAmountLine", { amt: invoice.total.toFixed(2) })}\n\n${stng.footer_message || ""}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    logShare("email");
  }

  // Ctrl+P / Ctrl+Shift+P / Ctrl+D shortcuts while dialog open
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setFormat(e.shiftKey ? "thermal-80" : "a4");
        setTimeout(doPrint, 50);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        downloadPdf();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, format, invoice]);

  const previewWidth = useMemo(() => {
    if (format === "thermal-38") return "38mm";
    if (format === "thermal-58") return "58mm";
    if (format === "thermal-80") return "80mm";
    return "100%";
  }, [format]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> {t("ipos.invoiceShortLbl", { no: invoice?.invoice_no ?? "" })}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={format} onValueChange={(v) => setFormat(v as InvoiceFormat)}>
            <TabsList>
              <TabsTrigger value="thermal-38">38mm</TabsTrigger>
              <TabsTrigger value="thermal-58">58mm</TabsTrigger>
              <TabsTrigger value="thermal-80">80mm</TabsTrigger>
              <TabsTrigger value="a4">A4</TabsTrigger>
            </TabsList>
            <TabsContent value={format} className="mt-3">
              <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-4">
                <div style={{ width: previewWidth, margin: "0 auto", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
                  {isLoading || !invoice ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">{t("ipos.loadingInvoiceText")}</div>
                  ) : (
                    <InvoiceDoc format={format} data={invoice} settings={stng} />
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Input
              placeholder={t("ipos.waPhonePh")}
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
              className="h-9 max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={shareWhatsApp}>
              <MessageCircle className="mr-1 h-4 w-4" /> {t("ipos.whatsapp")}
            </Button>
            <Button variant="outline" size="sm" onClick={shareEmail}>
              <Mail className="mr-1 h-4 w-4" /> {t("ipos.emailBtn")}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={downloadPdf} disabled={isLoading || !invoice}>
              <Download className="mr-1 h-4 w-4" /> {t("ipos.savePdfBtn")} <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">Ctrl+D</kbd>
            </Button>
            <Button onClick={doPrint} disabled={isLoading || !invoice}>
              <Printer className="mr-1 h-4 w-4" /> {t("ipos.printShort")} <kbd className="ml-1 rounded bg-muted/40 px-1 text-[10px]">Ctrl+P</kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden printable area - only this prints */}
      {invoice && (
        <div ref={printRef} className="invoice-print-area" style={{ position: "fixed", left: "-10000px", top: 0 }}>
          <InvoiceDoc format={format} data={invoice} settings={stng} />
        </div>
      )}
    </>
  );
}
