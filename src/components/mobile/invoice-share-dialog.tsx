import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { sendInvoiceSms } from "@/lib/api/comms.functions";
import { toast } from "sonner";

export interface ShareInvoicePayload {
  invoiceNo: string;
  shopName: string;
  itemsSummary: string;
  total: number;
  paid: number;
  due: number;
  customerName?: string | null;
  customerPhone?: string | null;
}

interface InvoiceShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  invoice: ShareInvoicePayload | null;
}

function normalizeWaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("01") && digits.length === 11) return `88${digits}`;
  return digits;
}

export function InvoiceShareDialog({
  open,
  onOpenChange,
  tenantId,
  invoice,
}: InvoiceShareDialogProps) {
  const sendSmsFn = useServerFn(sendInvoiceSms);
  const [phone, setPhone] = useState("");
  const [sendingSms, setSendingSms] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setPhone(invoice.customerPhone ?? "");
    }
  }, [open, invoice]);

  if (!invoice) return null;

  const message = [
    invoice.shopName || "SohojPharma",
    `ইনভয়েস: ${invoice.invoiceNo}`,
    invoice.customerName ? `গ্রাহক: ${invoice.customerName}` : null,
    invoice.itemsSummary ? `পণ্য: ${invoice.itemsSummary}` : null,
    `মোট বিল: ৳${invoice.total.toFixed(2)}`,
    `পরিশোধ: ৳${invoice.paid.toFixed(2)}`,
    invoice.due > 0 ? `বাকি: ৳${invoice.due.toFixed(2)}` : null,
    "ধন্যবাদ!",
  ]
    .filter(Boolean)
    .join("\n");

  const handleWhatsApp = () => {
    const cleanPhone = normalizeWaPhone(phone);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSms = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      toast.error("SMS পাঠাতে গ্রাহকের ফোন নম্বর লিখুন");
      return;
    }
    setSendingSms(true);
    try {
      await sendSmsFn({
        data: {
          tenantId,
          phone: trimmed,
          message,
        },
      });
      toast.success(`SMS সফলভাবে পাঠানো হয়েছে (${trimmed})`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SMS পাঠানো যায়নি");
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            ইনভয়েস শেয়ার করুন ({invoice.invoiceNo})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">
              গ্রাহকের মোবাইল নম্বর
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              inputMode="tel"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-line text-slate-700 max-h-40 overflow-y-auto">
            {message}
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Button
              type="button"
              onClick={handleWhatsApp}
              className="h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold gap-1.5"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>

            <Button
              type="button"
              onClick={() => void handleSms()}
              disabled={sendingSms}
              className="h-11 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white font-semibold gap-1.5"
            >
              {sendingSms ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  পাঠানো হচ্ছে...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  SMS পাঠান
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
