// Additive per-store enterprise preferences (localStorage, no DB change).
// Routing, Receipt, Barcode, Invoice, Auto-print rules.
// Existing PrintingSettings remains untouched.

export type CustomWidth = number; // mm

export interface RoutingPrefs {
  receipt: string | null;
  invoice: string | null;
  barcode: string | null;
  medicineLabel: string | null;
  purchase: string | null;
  report: string | null;
}

export interface ReceiptPrefs {
  paperWidth: "38mm" | "58mm" | "80mm" | "custom";
  customWidth: CustomWidth;
  layout: "compact" | "standard" | "detailed";
  // Show / Hide
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showBin: boolean;
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showSalesperson: boolean;
  showCashier: boolean;
  showPaymentMethod: boolean;
  showDiscount: boolean;
  showVat: boolean;
  showDue: boolean;
  showQR: boolean;
  showBarcode: boolean;
  showFooter: boolean;
  showThankYou: boolean;
  // Legacy
  showTaxSummary: boolean;
  // Printing
  autoCut: boolean;
  openDrawer: boolean;
  characterSet: string;
  copies: number;
  margin: number;
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  bottomMargin: number;
  fontSize: number;
  lineHeight: number;
  feedBefore: number;
  feedAfter: number;
  footerMessage: string;
  thankYouMessage: string;
}

export interface BarcodePrefs {
  profileId: string | null;
  engine: "ZPL" | "ESCPOS" | "TSPL";
  driver: "Auto" | "ZPL" | "ESCPOS" | "RAW";
  paperWidth: "38mm" | "58mm" | "80mm" | "custom";
  type: "Code128" | "Code39" | "EAN13" | "EAN8" | "QR";
  labelSize: "38x20" | "40x20" | "50x25" | "58x30" | "custom";
  customW: number;
  customH: number;
  rotation: "portrait" | "landscape";
  barcodeHeight: number;
  barcodeWidth: number;
  font: string;
  copies: number;
  textPosition: "top" | "bottom" | "none";
  // Label content toggles
  showName: boolean;
  showGeneric: boolean;
  showStrength: boolean;
  showCompany: boolean;
  showMrp: boolean;
  showBatch: boolean;
  showExpiry: boolean;
  showSku: boolean;
  showBarcode: boolean;
  showQR: boolean;
  showLogo: boolean;
}

export interface InvoicePrefs {
  engine: "chrome" | "qz";
  paper: "A4" | "A5" | "thermal" | "38mm" | "58mm" | "80mm";
  orientation: "portrait" | "landscape";
  silent: boolean;
  autoPrintAfterSale: boolean;
  copies: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  headerHeight: number;
  footerHeight: number;
  showLogo: boolean;
  showSignature: boolean;
  showQR: boolean;
  showBarcode: boolean;
  showTerms: boolean;
  showSeal: boolean;
}

export interface AutoPrintRules {
  receiptAfterSale: boolean;
  invoiceAfterSale: boolean;
  barcodeAfterProductCreate: boolean;
  purchaseLabelAfterPurchase: boolean;
  autoReprintOnRetry: boolean;
}

export interface PrintingExtras {
  routing: RoutingPrefs;
  receipt: ReceiptPrefs;
  barcode: BarcodePrefs;
  invoice: InvoicePrefs;
  autoPrint: AutoPrintRules;
}

export const DEFAULT_EXTRAS: PrintingExtras = {
  routing: {
    receipt: null, invoice: null, barcode: null,
    medicineLabel: null, purchase: null, report: null,
  },
  receipt: {
    paperWidth: "80mm", customWidth: 80, layout: "standard",
    showLogo: true, showAddress: true, showPhone: true, showBin: true,
    showCustomerName: true, showCustomerPhone: true, showSalesperson: false,
    showCashier: true, showPaymentMethod: true, showDiscount: true,
    showVat: true, showDue: true, showQR: false, showBarcode: false,
    showFooter: true, showThankYou: true, showTaxSummary: true,
    autoCut: true, openDrawer: false,
    characterSet: "UTF-8", copies: 1, margin: 2,
    leftMargin: 2, rightMargin: 2, topMargin: 2, bottomMargin: 2,
    fontSize: 12, lineHeight: 1.3, feedBefore: 0, feedAfter: 3,
    footerMessage: "Thank you for your purchase!",
    thankYouMessage: "Please come again",
  },
  barcode: {
    profileId: null, engine: "ZPL", driver: "Auto", paperWidth: "58mm",
    type: "Code128", labelSize: "50x25",
    customW: 50, customH: 25, rotation: "portrait",
    barcodeHeight: 50, barcodeWidth: 2, font: "Arial",
    copies: 1, textPosition: "bottom",
    showName: true, showGeneric: false, showStrength: true, showCompany: false,
    showMrp: true, showBatch: true, showExpiry: true, showSku: false,
    showBarcode: true, showQR: false, showLogo: false,
  },
  invoice: {
    engine: "chrome", paper: "A4", orientation: "portrait",
    silent: false, autoPrintAfterSale: false, copies: 1,
    marginTop: 10, marginBottom: 10, marginLeft: 10, marginRight: 10,
    headerHeight: 30, footerHeight: 20,
    showLogo: true, showSignature: true, showQR: false, showBarcode: false,
    showTerms: true, showSeal: false,
  },
  autoPrint: {
    receiptAfterSale: false,
    invoiceAfterSale: false,
    barcodeAfterProductCreate: false,
    purchaseLabelAfterPurchase: false,
    autoReprintOnRetry: true,
  },
};

const KEY = "sohojpharma.printing.extras";
const k = (storeId?: string | null) => (storeId ? `${KEY}.${storeId}` : KEY);

export function loadExtras(storeId?: string | null): PrintingExtras {
  if (typeof window === "undefined") return structuredClone(DEFAULT_EXTRAS);
  try {
    const raw = window.localStorage.getItem(k(storeId));
    if (!raw) return structuredClone(DEFAULT_EXTRAS);
    const parsed = JSON.parse(raw) as Partial<PrintingExtras>;
    return {
      routing: { ...DEFAULT_EXTRAS.routing, ...(parsed.routing ?? {}) },
      receipt: { ...DEFAULT_EXTRAS.receipt, ...(parsed.receipt ?? {}) },
      barcode: { ...DEFAULT_EXTRAS.barcode, ...(parsed.barcode ?? {}) },
      invoice: { ...DEFAULT_EXTRAS.invoice, ...(parsed.invoice ?? {}) },
      autoPrint: { ...DEFAULT_EXTRAS.autoPrint, ...(parsed.autoPrint ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_EXTRAS);
  }
}

export function saveExtras(extras: PrintingExtras, storeId?: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(k(storeId), JSON.stringify(extras));
}

export function resetTab(storeId: string | null, tab: keyof PrintingExtras): PrintingExtras {
  const cur = loadExtras(storeId);
  const next = { ...cur, [tab]: structuredClone(DEFAULT_EXTRAS[tab]) } as PrintingExtras;
  saveExtras(next, storeId);
  return next;
}

export function resetAll(storeId: string | null): PrintingExtras {
  const next = structuredClone(DEFAULT_EXTRAS);
  saveExtras(next, storeId);
  return next;
}
