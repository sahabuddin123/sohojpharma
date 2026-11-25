import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Share2, WifiOff } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { InvoiceShareDialog } from "@/components/mobile/invoice-share-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isConnected } from "@/lib/printing/qz/connection";
import { findDefaultPrinter, findPrinters } from "@/lib/printing/qz/printer";
import { printHtmlReceipt } from "@/lib/printing/qz/receipt";
import { loadPrintingSettings } from "@/lib/printing/storage";
import { toast } from "sonner";

export const Route = createFileRoute("/m/invoice/$saleId")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Invoice Preview (58mm) — SohojPharma" },
      { name: "description", content: "58mm thermal invoice preview with wireless printing and share." },
    ],
  }),
  component: MobileInvoicePreview,
});

type SaleRow = {
  id: string;
  invoice_no: string | null;
  created_at: string;
  total: number | null;
  paid: number | null;
  due: number | null;
  status: string | null;
  customers: { name: string | null; phone: string | null } | null;
  sale_items: Array<{ qty: number; unit_price: number; line_total: number; products: { name: string | null } | null }>;
};

type ShopInfo = {
  name: string | null;
  owner_name: string | null;
  address_line: string | null;
  area: string | null;
  district: string | null;
  phone: string | null;
  mobile: string | null;
};

function MobileInvoicePreview() {
  const { saleId } = Route.useParams();
  const { memberships, currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fallbackShopName = memberships.find((m) => m.tenant_id === currentTenantId)?.tenants?.name ?? "SohojPharma";

  const [shareOpen, setShareOpen] = useState(false);
  const [noPrinterOpen, setNoPrinterOpen] = useState(false);

  const { data: shop } = useQuery({
    queryKey: ["m-invoice-shop", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("name,owner_name,address_line,area,district,phone,mobile")
        .eq("id", tenantId)
        .maybeSingle();
      return (data ?? null) as ShopInfo | null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["m-invoice", saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id,invoice_no,created_at,total,paid,due,status,customers(name,phone),sale_items(qty,unit_price,line_total,products(name))",
        )
        .eq("id", saleId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SaleRow | null;
    },
  });

  const shopName = shop?.name || fallbackShopName;
  const shopAddress = [shop?.address_line, shop?.area, shop?.district].filter(Boolean).join(", ");
  const shopPhone = shop?.mobile || shop?.phone || "";

  const build58mmHtml = () => {
    const node = document.getElementById("m-receipt");
    if (!node) return "";
    return `<!doctype html><html><head><meta charset="utf-8" /><style>
      @page { size: 58mm auto; margin: 2mm; }
      * { box-sizing: border-box; }
      html, body { width: 54mm; margin: 0 auto; padding: 0; font-family: monospace; font-size: 11px; line-height: 1.35; color: #000; background: #fff; }
      .r-center { text-align: center; }
      .r-bold { font-weight: 700; }
      .r-row { display: flex; justify-content: space-between; gap: 4px; }
      .r-sep { border-top: 1px dashed #000; margin: 4px 0; }
    </style></head><body>${node.innerHTML}</body></html>`;
  };

  function print58mmBrowser() {
    const html = build58mmHtml();
    if (!html) return;
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(frame);
    frame.onload = () => {
      const cw = frame.contentWindow;
      if (!cw) return;
      cw.focus();
      cw.onafterprint = () => frame.remove();
      cw.print();
      setTimeout(() => frame.remove(), 30_000);
    };
    frame.srcdoc = html;
  }

  async function handlePrint() {
    const html = build58mmHtml();
    if (!html) return;

    try {
      const settings = loadPrintingSettings(tenantId);
      const qzOk = await isConnected();
      if (qzOk) {
        let printer: string | null = settings.receiptPrinter ?? null;
        if (!printer) {
          const all = await findPrinters();
          printer = all.length === 1 ? all[0] : await findDefaultPrinter();
        }
        if (printer) {
          await printHtmlReceipt({ printer, html, width: "58mm" });
          toast.success(`প্রিন্ট পাঠানো হয়েছে (${printer})`);
          return;
        }
      }
    } catch (err) {
      console.warn("[MobilePrint] wireless check failed:", err);
    }

    toast.error("No printer connected — কোনো ওয়্যারলেস প্রিন্টার কানেক্টেড নেই");
    setNoPrinterOpen(true);
  }

  return (
    <PhoneShell
      title="Invoice Preview (58mm)"
      back
      help={
        <div className="flex items-center gap-1.5">
          {data && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Share invoice"
              className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground active:scale-95 transition"
            >
              <Share2 className="h-4.5 w-4.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void handlePrint()}
            aria-label="Print invoice"
            className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground active:scale-95 transition"
          >
            <Printer className="h-5 w-5" />
          </button>
        </div>
      }
    >
      {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !data && <p className="py-10 text-center text-sm text-muted-foreground">Invoice not found</p>}

      {data && (
        <div className="mt-2 flex flex-col items-center gap-3">
          {/* 58mm Thermal Receipt Preview */}
          <div
            id="m-receipt"
            className="w-[232px] rounded-xl border border-slate-200 bg-white p-3.5 font-mono text-[11px] leading-snug text-black shadow-sm"
          >
            <div className="r-center text-center space-y-0.5 mb-2">
              <p className="r-bold text-sm font-bold">{shopName}</p>
              {shop?.owner_name && (
                <p className="text-[10px]">Prop: {shop.owner_name}</p>
              )}
              {shopAddress && (
                <p className="text-[10px]">{shopAddress}</p>
              )}
              {shopPhone && (
                <p className="text-[10px]">Mob: {shopPhone}</p>
              )}
            </div>

            <div className="r-sep border-t border-dashed border-black my-1.5" />
            <Line label="Invoice:" value={data.invoice_no ?? data.id.slice(0, 8)} />
            <Line label="Date:" value={new Date(data.created_at).toISOString().slice(0, 10)} />
            <Line label="Customer:" value={data.customers?.name ?? "Walk-in"} />
            <Line label="Status:" value={(data.status ?? "").toUpperCase()} />
            <div className="r-sep border-t border-dashed border-black my-1.5" />

            <div className="r-row flex justify-between font-bold text-[10px]">
              <span>Item</span>
              <span className="flex gap-2">
                <span>Qty</span>
                <span>Total</span>
              </span>
            </div>
            <div className="r-sep border-t border-dashed border-black my-1" />

            <div className="space-y-1.5 py-1">
              {data.sale_items.map((it, i) => (
                <div key={i} className="r-row flex items-start justify-between gap-1.5">
                  <span className="min-w-0 flex-1 break-words">{it.products?.name ?? "—"}</span>
                  <span className="w-7 text-right shrink-0">{Number(it.qty).toFixed(0)}</span>
                  <span className="w-12 text-right shrink-0">{Number(it.line_total).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="r-sep border-t border-dashed border-black my-1.5" />
            <Line label="Total:" value={Number(data.total ?? 0).toFixed(2)} />
            <Line label="Paid:" value={Number(data.paid ?? 0).toFixed(2)} />
            <Line label="Due:" value={Number(data.due ?? 0).toFixed(2)} />
            <div className="r-sep border-t border-dashed border-black my-2" />
            <p className="r-center text-center text-[10px]">Thank you! Come again.</p>
          </div>

          <div className="flex w-[232px] gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
              className="flex-1 rounded-xl gap-1.5"
            >
              <Share2 className="h-3.5 w-3.5" />
              শেয়ার
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handlePrint()}
              className="flex-1 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              প্রিন্ট (58mm)
            </Button>
          </div>
        </div>
      )}

      {/* No Wireless Printer Connected Dialog */}
      <Dialog open={noPrinterOpen} onOpenChange={setNoPrinterOpen}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-rose-600">
              <WifiOff className="h-5 w-5" />
              No printer connected
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600">
            ফোনের সাথে কোনো ওয়্যারলেস/থার্মাল প্রিন্টার কানেক্টেড নেই। প্রিন্টার কানেক্ট করুন অথবা ব্রাউজার ৫৮মিমি প্রিভিউ দিয়ে প্রিন্ট করুন।
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild className="w-full rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white">
              <Link to={"/settings/printing" as never}>প্রিন্টার সেটআপ করুন</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNoPrinterOpen(false);
                print58mmBrowser();
              }}
              className="w-full rounded-xl"
            >
              ব্রাউজার ৫৮মিমি প্রিভিউ দিয়ে প্রিন্ট
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog (WhatsApp + SMS) */}
      <InvoiceShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        tenantId={tenantId}
        invoice={
          data
            ? {
                invoiceNo: data.invoice_no ?? data.id.slice(0, 8),
                shopName,
                itemsSummary: data.sale_items.map((it) => `${it.products?.name ?? "—"} (${it.qty})`).join(", "),
                total: Number(data.total ?? 0),
                paid: Number(data.paid ?? 0),
                due: Number(data.due ?? 0),
                customerName: data.customers?.name ?? null,
                customerPhone: data.customers?.phone ?? null,
              }
            : null
        }
      />
    </PhoneShell>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="r-row flex justify-between gap-2 font-bold">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
