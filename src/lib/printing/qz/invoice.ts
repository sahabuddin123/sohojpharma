// A4 / invoice printing via QZ Tray (rasterized HTML).
import { getQz, connect, isConnected } from "./connection";

export interface InvoicePrintOptions {
  printer: string;
  html: string;
  copies?: number;
}

export async function printA4Invoice(options: InvoicePrintOptions): Promise<void> {
  const qz = await getQz();
  if (!qz) throw new Error("QZ Tray module not available");
  if (!(await isConnected())) {
    const status = await connect();
    if (!status.connected) throw new Error(status.error ?? "QZ Tray not connected");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = qz as any;
  const config = api.configs.create(options.printer, {
    copies: options.copies ?? 1,
    size: { width: 210, height: 297 },
    units: "mm",
    rasterize: true,
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>@page { size: A4; margin: 0; } html,body{margin:0;padding:0;}</style>
</head><body>${options.html}</body></html>`;
  await api.print(config, [{ type: "pixel", format: "html", flavor: "plain", data: html }]);
}
