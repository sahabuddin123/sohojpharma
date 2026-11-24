import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageCircle, Mail, Link2, Printer, MessageSquare, Download } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceNo: string;
  total: number;
  phone?: string;
  url: string;
  onPrint?: () => void;
}

export function InvoiceShareDialog({ open, onOpenChange, invoiceNo, total, phone, url, onPrint }: Props) {

  const { t } = useTranslation();
  const message = t("ipos.shareMsgTpl", { no: invoiceNo, amt: total.toFixed(2), url });
  const encoded = encodeURIComponent(message);
  const cleanPhone = (phone ?? "").replace(/\D/g, "");

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); toast.success(t("toast.linkCopied")); }
    catch { toast.error(t("toast.copyFailed")); }
  };

  const handlePrint = () => {
    if (onPrint) onPrint();
    else window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("dialog.shareInvoice", { no: invoiceNo })}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" asChild>
            <a href={`https://wa.me/${cleanPhone}?text=${encoded}`} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" /> {t("ipos.whatsapp")}
            </a>
          </Button>
          <Button variant="outline" asChild disabled={!cleanPhone}>
            <a href={`sms:${cleanPhone}?body=${encoded}`}>
              <MessageSquare className="mr-2 h-4 w-4" /> {t("ipos.smsBtn")}
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`mailto:?subject=Invoice%20${encodeURIComponent(invoiceNo)}&body=${encoded}`}>
              <Mail className="mr-2 h-4 w-4" /> {t("ipos.emailBtn")}
            </a>
          </Button>
          <Button variant="outline" onClick={copyLink}>
            <Link2 className="mr-2 h-4 w-4" /> {t("ipos.copyLinkBtn")}
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> {t("ipos.printShort")}
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Download className="mr-2 h-4 w-4" /> {t("ipos.pdfBtnShort")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

