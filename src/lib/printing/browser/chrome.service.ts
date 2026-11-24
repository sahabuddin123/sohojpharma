// Chrome / browser print transport — isolated wrapper around window.print().
// Does NOT replace existing window.print() callsites; used only by PrintManager
// when callers explicitly route through the new module.
import type { PaperWidth, PrintJob, PrintResult } from "../types";

function widthToCss(width: PaperWidth): string {
  switch (width) {
    case "38mm": return "38mm 297mm";
    case "58mm": return "58mm 297mm";
    case "80mm": return "80mm 297mm";
  }
}

export async function chromePrint(job: PrintJob): Promise<PrintResult> {
  if (typeof window === "undefined") {
    return { ok: false, engine: "chrome", error: "Not in browser" };
  }

  // Use an isolated hidden iframe so we never touch the host document state.
  return await new Promise<PrintResult>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => iframe.remove(), 500);
    };

    const width = job.paperWidth ?? "80mm";
    const pageSize = job.kind === "a4-invoice" ? "A4" : widthToCss(width);

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { size: ${pageSize}; margin: 0; }
  html, body { margin: 0; padding: 0; }
</style>
</head><body>${job.payload}</body></html>`;

    const doc = iframe.contentDocument;
    if (!doc) {
      cleanup();
      resolve({ ok: false, engine: "chrome", error: "iframe doc unavailable" });
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const trigger = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        cleanup();
        resolve({ ok: true, engine: "chrome" });
      } catch (err) {
        cleanup();
        resolve({ ok: false, engine: "chrome", error: String(err) });
      }
    };

    if (iframe.contentDocument?.readyState === "complete") trigger();
    else iframe.addEventListener("load", trigger, { once: true });
  });
}
