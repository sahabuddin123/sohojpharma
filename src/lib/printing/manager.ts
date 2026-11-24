// PrintManager — decides engine, paper width, and printer per job.
// Additive: existing window.print() callsites are unaffected.
import { toast } from "sonner";
import { chromePrint } from "./browser/chrome.service";
import { connect, isConnected } from "./qz/connection";
import { findPrinters, findPrinterByPattern, findDefaultPrinter } from "./qz/printer";
import { printRaw } from "./qz/barcode";
import { printHtmlReceipt } from "./qz/receipt";
import { printA4Invoice } from "./qz/invoice";
import { loadPrintingSettings } from "./storage";
import type { PrintJob, PrintResult, PrintingSettings } from "./types";

async function resolveEngine(s: PrintingSettings): Promise<"chrome" | "qz"> {
  if (s.engine === "chrome") return "chrome";
  if (s.engine === "qz") return "qz";
  // auto
  if (await isConnected()) return "qz";
  const status = await connect();
  return status.connected ? "qz" : "chrome";
}

async function resolveReceiptPrinter(s: PrintingSettings): Promise<string | null> {
  if (s.receiptPrinter) return s.receiptPrinter;
  const all = await findPrinters();
  if (all.length === 1) return all[0];
  return await findDefaultPrinter();
}

async function resolveBarcodePrinter(s: PrintingSettings): Promise<string | null> {
  if (s.barcodePrinter) return s.barcodePrinter;
  const rp = await findPrinterByPattern(/RP400|ZPL/i);
  if (rp) return rp;
  return await findDefaultPrinter();
}

export interface PrintManagerOptions {
  storeId?: string | null;
  /** If true, do not show toasts (caller handles UX). */
  silent?: boolean;
}

export async function print(job: PrintJob, opts: PrintManagerOptions = {}): Promise<PrintResult> {
  const settings = loadPrintingSettings(opts.storeId);
  const engine = await resolveEngine(settings);
  const width = job.paperWidth ?? settings.paperWidth;

  if (engine === "chrome") {
    return chromePrint({ ...job, paperWidth: width });
  }

  try {
    if (job.kind === "barcode" || job.kind === "shelf-label" || job.kind === "medicine-label") {
      const printer = job.printer ?? (await resolveBarcodePrinter(settings));
      if (!printer) throw new Error("No barcode printer configured");
      await printRaw({ printer, data: job.payload, language: job.language ?? settings.printerLanguage });
      return { ok: true, engine: "qz" };
    }
    if (job.kind === "a4-invoice" || job.kind === "report") {
      const printer = job.printer ?? (await resolveReceiptPrinter(settings));
      if (!printer) throw new Error("No printer configured");
      await printA4Invoice({ printer, html: job.payload });
      return { ok: true, engine: "qz" };
    }
    // pos-invoice or thermal-receipt
    const printer = job.printer ?? (await resolveReceiptPrinter(settings));
    if (!printer) throw new Error("No receipt printer configured");
    await printHtmlReceipt({ printer, html: job.payload, width });
    return { ok: true, engine: "qz" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!opts.silent) toast.error(`QZ print failed — falling back to browser. ${message}`);
    const fb = await chromePrint({ ...job, paperWidth: width });
    return { ...fb, fallbackUsed: true, error: message };
  }
}

// Phase 2 — queue-backed entry point. Existing `print` keeps its exact behavior.
// Callers that opt into the enterprise pipeline (queue + retry + history) use this.
export { printQueue } from "./queue";
import { printQueue as _printQueue } from "./queue";
export async function printViaQueue(input: {
  tenantId: string;
  branchId?: string | null;
  job: PrintJob;
  documentType: string;
  documentId?: string | null;
  dedupeKey?: string | null;
  fallbackEnabled?: boolean;
  silent?: boolean;
}) {
  return _printQueue.enqueue(input);
}
