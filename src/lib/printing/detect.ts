// Auto-detect printer role from its name. Suggestion only.
// Never overrides a manually selected printer (caller enforces that).
import type { PrinterLanguage } from "./types";

export type PrinterRole = "barcode" | "receipt" | "a4" | "other";

export interface DetectedPrinter {
  name: string;
  role: PrinterRole;
  language: PrinterLanguage;
  paperWidthMm: number;
  confidence: "high" | "medium" | "low";
}

const BARCODE_PATTERNS = /\b(RP400|RP-400|ZD\d{3}|ZD-?\d{3}|GK420|TSC|GP-\d|TLP|GX420|ZT\d{3})\b/i;
const RECEIPT_58_PATTERNS = /\b(58mm|XP-58|POS58|MTP-58|TM-T20)\b/i;
const RECEIPT_80_PATTERNS = /\b(80mm|XP-80|POS80|TM-T88|TM-T82|RP80)\b/i;
const A4_PATTERNS = /\b(LaserJet|HP\s|Canon|Brother|Epson\s?L\d{3}|Workforce|DeskJet|OfficeJet|Pixma)\b/i;

export function detectPrinter(name: string): DetectedPrinter {
  if (BARCODE_PATTERNS.test(name)) {
    return { name, role: "barcode", language: "ZPL", paperWidthMm: 40, confidence: "high" };
  }
  if (RECEIPT_80_PATTERNS.test(name)) {
    return { name, role: "receipt", language: "ESCPOS", paperWidthMm: 80, confidence: "high" };
  }
  if (RECEIPT_58_PATTERNS.test(name)) {
    return { name, role: "receipt", language: "ESCPOS", paperWidthMm: 58, confidence: "high" };
  }
  if (A4_PATTERNS.test(name)) {
    return { name, role: "a4", language: "ESCPOS", paperWidthMm: 210, confidence: "medium" };
  }
  return { name, role: "other", language: "ESCPOS", paperWidthMm: 80, confidence: "low" };
}

export function detectAll(names: string[]): DetectedPrinter[] {
  return names.map(detectPrinter);
}
