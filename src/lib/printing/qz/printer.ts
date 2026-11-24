// Printer discovery & selection.
import { getQz, isConnected, connect } from "./connection";

export async function findPrinters(): Promise<string[]> {
  const qz = await getQz();
  if (!qz) return [];
  if (!(await isConnected())) {
    const status = await connect();
    if (!status.connected) return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = qz as any;
  try {
    const result = await api.printers.find();
    if (Array.isArray(result)) return result as string[];
    if (typeof result === "string") return [result];
    return [];
  } catch {
    return [];
  }
}

export async function findDefaultPrinter(): Promise<string | null> {
  const qz = await getQz();
  if (!qz) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = qz as any;
  try {
    const p = await api.printers.getDefault();
    return typeof p === "string" ? p : null;
  } catch {
    return null;
  }
}

export async function findPrinterByPattern(pattern: RegExp): Promise<string | null> {
  const all = await findPrinters();
  return all.find((p) => pattern.test(p)) ?? null;
}
