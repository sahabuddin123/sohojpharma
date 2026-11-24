// Per-store printing settings (localStorage, additive only — no DB change).
import { DEFAULT_PRINTING_SETTINGS, type PrintingSettings } from "./types";

const KEY_PREFIX = "sohojpharma.printing.settings";

function key(storeId?: string | null): string {
  return storeId ? `${KEY_PREFIX}.${storeId}` : KEY_PREFIX;
}

export function loadPrintingSettings(storeId?: string | null): PrintingSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PRINTING_SETTINGS };
  try {
    const raw = window.localStorage.getItem(key(storeId)) ?? window.localStorage.getItem(key());
    if (!raw) return { ...DEFAULT_PRINTING_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PrintingSettings>;
    return { ...DEFAULT_PRINTING_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_PRINTING_SETTINGS };
  }
}

export function savePrintingSettings(
  settings: PrintingSettings,
  storeId?: string | null,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(storeId), JSON.stringify(settings));
}

const REMEMBER_KEY = "sohojpharma.printing.remembered-printers";

export function rememberPrinter(role: "receipt" | "barcode", name: string): void {
  if (typeof window === "undefined") return;
  const cur = loadPrintingSettings();
  const next: PrintingSettings = role === "receipt"
    ? { ...cur, receiptPrinter: name }
    : { ...cur, barcodePrinter: name };
  savePrintingSettings(next);
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(name)) list.push(name);
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}
