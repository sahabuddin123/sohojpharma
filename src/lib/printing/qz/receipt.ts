// Thermal receipt printing via QZ Tray (silent).
import { getQz, connect, isConnected } from "./connection";
import type { PaperWidth } from "../types";

export interface ReceiptPrintOptions {
  printer: string;
  html: string;
  width: PaperWidth;
  copies?: number;
}

function widthMm(w: PaperWidth): number {
  return w === "38mm" ? 38 : w === "58mm" ? 58 : 80;
}

export async function printHtmlReceipt(options: ReceiptPrintOptions): Promise<void> {
  const qz = await getQz();
  if (!qz) throw new Error("QZ Tray module not available");
  if (!(await isConnected())) {
    const status = await connect();
    if (!status.connected) throw new Error(status.error ?? "QZ Tray not connected");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = qz as any;
  const mm = widthMm(options.width);

  const config = api.configs.create(options.printer, {
    copies: options.copies ?? 1,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    size: { width: mm, height: null }, // height=null → fit content (no extra feed)
    units: "mm",
    rasterize: true,
  });

  const html = wrapHtml(options.html, mm);
  const data = [{ type: "pixel", format: "html", flavor: "plain", data: html }];
  await api.print(config, data);
}

function wrapHtml(inner: string, mm: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { size: ${mm}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${mm}mm; }
  * { box-sizing: border-box; }
</style></head><body>${inner}</body></html>`;
}
