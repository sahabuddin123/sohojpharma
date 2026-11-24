// Print service — opens templates in a hidden iframe or new window,
// supports auto-print, manual print, and live preview.
// Browser-only: import from components/event handlers, not loaders.

import { buildReceiptHtml, type PaperSize, type ReceiptData } from "./receipt-templates";

export interface PrintOptions {
  paper: PaperSize;
  /** Automatically trigger window.print() after the doc loads. Default true. */
  auto?: boolean;
  /** Use a new tab/window instead of a hidden iframe. Default false. */
  newWindow?: boolean;
  /** Called after print dialog closes (best-effort). */
  onAfterPrint?: () => void;
}

/** Print a receipt. Returns the HTML so callers can store/email it. */
export function printReceipt(data: ReceiptData, opts: PrintOptions): string {
  const html = buildReceiptHtml(data, opts.paper);
  const auto = opts.auto ?? true;

  if (typeof window === "undefined") return html;

  if (opts.newWindow) {
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) throw new Error("Pop-up blocked. Allow pop-ups to print.");
    w.document.open();
    w.document.write(html);
    w.document.close();
    if (auto) {
      w.addEventListener("load", () => {
        w.focus();
        w.print();
        opts.onAfterPrint?.();
      });
    }
    return html;
  }

  // Hidden iframe (no pop-up needed; survives in PWA / kiosk)
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
  });
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => iframe.parentNode?.removeChild(iframe), 1000);
    opts.onAfterPrint?.();
  };

  iframe.onload = () => {
    if (!auto) return;
    try {
      const cw = iframe.contentWindow!;
      cw.focus();
      cw.onafterprint = cleanup;
      cw.print();
      // Fallback cleanup if onafterprint never fires
      setTimeout(cleanup, 30_000);
    } catch (e) {
      console.error("Print failed:", e);
      cleanup();
    }
  };

  iframe.srcdoc = html;
  return html;
}

/** Build a Blob URL for in-app <iframe> preview (no print dialog). */
export function buildPreviewUrl(data: ReceiptData, paper: PaperSize): string {
  const html = buildReceiptHtml(data, paper);
  const blob = new Blob([html], { type: "text/html" });
  return URL.createObjectURL(blob);
}

/** Trigger print on an already-mounted preview iframe (manual print). */
export function printPreviewIframe(iframe: HTMLIFrameElement): void {
  const cw = iframe.contentWindow;
  if (!cw) throw new Error("Preview iframe is not ready");
  cw.focus();
  cw.print();
}

export { buildReceiptHtml };
export type { PaperSize, ReceiptData };
