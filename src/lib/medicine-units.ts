// Shared unit & pack conversion helpers for Pharmacy Purchase & POS (Mobile + Desktop).
// Invariant: Database stock (`batches.qty_on_hand`), `purchase_price`, and `retail_price`
// are stored in base units (pieces / bottles / vials).

export type MedicineUnitMode = "pc" | "strip" | "box";

const STRIP_TYPES = /\b(tablet|tablets|tab|capsule|capsules|cap|pill|pills|lozenge|suppository)\b/i;
const NON_STRIP_TYPES = /\b(syrup|susp|suspension|bottle|drop|drops|injection|inj|vial|ampoule|cream|ointment|gel|inhaler|spray|solution|powder|sachet)\b/i;

export function supportsStripUnit(medicineType?: string | null, name?: string | null): boolean {
  const combined = `${medicineType ?? ""} ${name ?? ""}`;
  if (NON_STRIP_TYPES.test(combined) && !STRIP_TYPES.test(medicineType ?? "")) {
    return false;
  }
  return STRIP_TYPES.test(combined);
}

export function resolvePackConfig(p: {
  medicine_type?: string | null;
  name?: string | null;
  pack_size?: number | null;
  qty_per_box?: number | null;
}) {
  const hasStrip = supportsStripUnit(p.medicine_type, p.name);
  const rawPack = Number(p.pack_size ?? 0);
  const rawBox = Number(p.qty_per_box ?? 0);

  const pcsPerStrip = hasStrip ? (rawPack > 1 ? Math.round(rawPack) : 10) : 1;
  const pcsPerBox = rawBox > 1 ? Math.round(rawBox) : hasStrip ? pcsPerStrip * 10 : 1;

  return { hasStrip, pcsPerStrip, pcsPerBox };
}

export function getUnitMultiplier(
  mode: MedicineUnitMode,
  pcsPerStrip: number,
  pcsPerBox: number,
): number {
  if (mode === "strip") return Math.max(1, pcsPerStrip);
  if (mode === "box") return Math.max(1, pcsPerBox);
  return 1;
}

export function getAvailableUnits(hasStrip: boolean, pcsPerBox: number): MedicineUnitMode[] {
  if (hasStrip) return ["pc", "strip", "box"];
  return pcsPerBox > 1 ? ["pc", "box"] : ["pc"];
}

export function unitLabelBn(mode: MedicineUnitMode): string {
  if (mode === "strip") return "পাতা";
  if (mode === "box") return "বক্স";
  return "পিস";
}
