// Isolated printing module — types
export type PrintEngine = "chrome" | "qz" | "auto";
export type PaperWidth = "38mm" | "58mm" | "80mm";
export type PrinterLanguage = "ZPL" | "TSPL" | "EPL" | "ESCPOS";

export interface PrintingSettings {
  engine: PrintEngine;
  paperWidth: PaperWidth;
  receiptPrinter: string | null;
  barcodePrinter: string | null;
  printerLanguage: PrinterLanguage;
}

export const DEFAULT_PRINTING_SETTINGS: PrintingSettings = {
  engine: "auto",
  paperWidth: "80mm",
  receiptPrinter: null,
  barcodePrinter: null,
  printerLanguage: "ZPL",
};

export type PrintKind =
  | "barcode"
  | "shelf-label"
  | "medicine-label"
  | "pos-invoice"
  | "thermal-receipt"
  | "a4-invoice"
  | "report";

export interface PrintJob {
  kind: PrintKind;
  /** HTML for browser printing OR raw command string for QZ */
  payload: string;
  /** Optional override for paper width */
  paperWidth?: PaperWidth;
  /** Optional override printer name */
  printer?: string;
  /** Optional raw language hint */
  language?: PrinterLanguage;
}

export interface PrintResult {
  ok: boolean;
  engine: "chrome" | "qz";
  error?: string;
  fallbackUsed?: boolean;
}

export interface QzStatus {
  available: boolean;
  connected: boolean;
  version?: string;
  error?: string;
}
