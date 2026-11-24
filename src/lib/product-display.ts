// Shared product display-name helper. Format: "{name} ({strength} · {medicine_type} · {volume})"
// Falls back gracefully when fields are missing. NEVER mutates the underlying name.

export type ProductDisplayInput = {
  name: string;
  strength?: string | null;
  medicine_type?: string | null;
  medicineType?: string | null;
  volume?: string | null;
  pack_size?: number | null;
  packSize?: number | null;
};

export function buildProductDisplayName(p: ProductDisplayInput): string {
  const name = (p.name ?? "").trim();
  const strength = (p.strength ?? "").trim();
  const medType = ((p.medicine_type ?? p.medicineType) ?? "").trim();
  const volume = (p.volume ?? "").trim();
  const pack = p.pack_size ?? p.packSize ?? null;

  const parts: string[] = [];
  if (strength) parts.push(strength);
  if (medType) parts.push(medType);
  if (volume) parts.push(volume);
  if (!parts.length && pack && pack > 1) parts.push(`Pack ${pack}`);

  return parts.length ? `${name} (${parts.join(" · ")})` : name;
}

// Search helper — matches against name, sku, barcode, and computed display name.
export function matchesProductSearch(p: ProductDisplayInput & { sku?: string | null; barcode?: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    p.name,
    p.sku ?? "",
    p.barcode ?? "",
    buildProductDisplayName(p),
  ].join(" ").toLowerCase();
  return hay.includes(q);
}
