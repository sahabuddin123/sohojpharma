// Phase 3 — EAN-13 helpers (client-side; canonical issuance is the DB RPC).
export function ean13Checksum(digits12: string): string {
  if (!/^\d{12}$/.test(digits12)) throw new Error("ean13Checksum expects 12 digits");
  let s = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(digits12[i]);
    s += (i % 2 === 0 ? d : d * 3);
  }
  return String((10 - (s % 10)) % 10);
}

export function buildInternalEan13(tenantCode: number, serial: number): string {
  const d = "200" + String(tenantCode).padStart(4, "0") + String(serial % 100000).padStart(5, "0");
  return d + ean13Checksum(d);
}

export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;
  return ean13Checksum(barcode.slice(0, 12)) === barcode[12];
}
