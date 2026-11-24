// Raw barcode label printing through QZ Tray.
import { getQz, connect, isConnected } from "./connection";
import type { PrinterLanguage } from "../types";

export interface BarcodePrintOptions {
  printer: string;
  data: string;            // already-formatted raw command string (ZPL/TSPL/EPL/ESCPOS)
  language?: PrinterLanguage;
  copies?: number;
}

export async function printRaw(options: BarcodePrintOptions): Promise<void> {
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
  });
  const data = [{ type: "raw", format: "plain", data: options.data }];
  await api.print(config, data);
}

/** Minimal ZPL helper for a simple Code128 label (Rongta RP400H, 203 DPI). */
export function buildZplLabel(input: {
  text: string;
  barcode: string;
  widthDots?: number;
  heightDots?: number;
}): string {
  const w = input.widthDots ?? 320;
  const h = input.heightDots ?? 200;
  return [
    "^XA",
    `^PW${w}`,
    `^LL${h}`,
    "^CI28",
    `^FO20,20^A0N,24,24^FD${escapeZpl(input.text)}^FS`,
    `^FO20,60^BY2^BCN,80,Y,N,N^FD${escapeZpl(input.barcode)}^FS`,
    "^XZ",
  ].join("\n");
}

function escapeZpl(s: string): string {
  return s.replace(/\^/g, " ").replace(/~/g, " ");
}
