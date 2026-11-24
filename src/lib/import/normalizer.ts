// Phase 3 — Data Normalizer.
// Pure functions. No DB, no imports of project state.

const UNIT_MAP: Record<string, string> = {
  ml: "ML", "ml.": "ML",
  l: "L", lt: "L", ltr: "L", litre: "L", liter: "L",
  mg: "MG", g: "G", gm: "G", gms: "G", kg: "KG",
  iu: "IU", mcg: "MCG", ug: "MCG", µg: "MCG",
  pcs: "PCS", pc: "PCS", piece: "PCS", pieces: "PCS",
  box: "BOX", boxes: "BOX",
  strip: "STRIP", strips: "STRIP",
  pack: "PACK", packs: "PACK",
};

const TYPE_MAP: Record<string, string> = {
  tab: "Tablet", tablet: "Tablet", tablets: "Tablet",
  cap: "Capsule", caps: "Capsule", capsule: "Capsule", capsules: "Capsule",
  syp: "Syrup", syrup: "Syrup",
  susp: "Suspension", suspension: "Suspension",
  drop: "Drops", drops: "Drops",
  cream: "Cream", crm: "Cream",
  gel: "Gel",
  oint: "Ointment", ointment: "Ointment",
  lotion: "Lotion",
  powder: "Powder", pwd: "Powder",
  inj: "Injection", injection: "Injection",
  "im injection": "IM Injection",
  "iv injection": "IV Injection",
  "iv infusion": "IV Infusion",
  ampoule: "Ampoule", amp: "Ampoule",
  vial: "Vial",
  btl: "Bottle", bottle: "Bottle",
  tube: "Tube",
  sachet: "Sachet",
  pfs: "PFS",
  inhaler: "Inhaler",
  "nasal spray": "Nasal Spray",
  "eye drop": "Eye Drop", "eye drops": "Eye Drop",
  "ear drop": "Ear Drop", "ear drops": "Ear Drop",
  "oral solution": "Oral Solution",
  "oral powder": "Oral Powder",
};

export function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function titleCase(s: string): string {
  return collapseSpaces(s).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function normalizeUnit(s: string | null | undefined): string {
  if (!s) return "";
  const k = collapseSpaces(s).toLowerCase();
  return UNIT_MAP[k] ?? k.toUpperCase();
}

export function normalizeType(s: string | null | undefined): string {
  if (!s) return "";
  const k = collapseSpaces(s).toLowerCase();
  return TYPE_MAP[k] ?? titleCase(s);
}

export function normalizeManufacturer(s: string | null | undefined): string {
  if (!s) return "";
  let out = collapseSpaces(s)
    .replace(/\bltd\.?\b/gi, "Ltd")
    .replace(/\blimited\b/gi, "Ltd")
    .replace(/\bpharmaceuticals?\b/gi, "Pharmaceuticals")
    .replace(/\b(p|pvt)\b\.?\s+ltd\b/gi, "Pvt Ltd");
  return titleCase(out);
}

export function normalizeGeneric(s: string | null | undefined): string {
  if (!s) return "";
  return titleCase(collapseSpaces(s));
}

export function slugifyName(s: string): string {
  return collapseSpaces(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Mirrors public.normalize_master_row() trigger: lower, non-alnum → '-', trim '-', max 40 chars.
export function canonicalMasterCode(name: string): string {
  const trimmed = collapseSpaces(name);
  if (!trimmed) return "";
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 40 ? slug.slice(0, 40) : slug;
}


export function normalizeBarcode(b: string | null | undefined): string {
  if (!b) return "";
  return String(b).replace(/\D+/g, "");
}

export function isValidEan13(b: string): boolean {
  if (!/^\d{13}$/.test(b)) return false;
  const digits = b.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.forEach((d, i) => { sum += (i % 2 === 0 ? d : d * 3); });
  return ((10 - (sum % 10)) % 10) === check;
}
