// Phase 3 — Smart Medicine Parser.
// Parses a free-form medicine string into { name, type, strength, volume, pack }.
// Pure TS; tokenizer + ordered rules. No DB.

import { collapseSpaces, normalizeType } from "./normalizer";

// Longest-first list of medicine-type tokens; order matters.
const TYPE_TOKENS: string[] = [
  "IM INJECTION", "IV INJECTION", "IV INFUSION",
  "NASAL SPRAY", "EYE DROP", "EYE DROPS", "EAR DROP", "EAR DROPS",
  "ORAL SOLUTION", "ORAL POWDER",
  "TABLET", "CAPSULE", "SYRUP", "SUSPENSION", "DROPS", "DROP",
  "CREAM", "GEL", "OINTMENT", "LOTION", "POWDER",
  "INJECTION", "AMPOULE", "VIAL", "BOTTLE", "TUBE", "SACHET",
  "PFS", "INHALER",
  "TAB", "CAP", "CAPS", "SYP", "SUSP", "INJ", "OINT", "BTL",
];

// Trailing pack/volume e.g. "2 ML AMPOULE", "30 ML BOTTLE", "10x10".
// Pack/container token is REQUIRED so we don't swallow a bare strength like "500 MG".
const PACK_RE = /\b(\d+(?:\.\d+)?\s*(?:ML|L|MG|G|GM|MCG|IU)?)\s*(AMPOULE|VIAL|BOTTLE|TUBE|SACHET|PFS|BOX|STRIP|PACK)\s*$/i;
const GRID_RE = /\b(\d+\s*[x×]\s*\d+)\s*$/i;

// Strength: 500 MG | 5% | (75 MG+20 MG)/2 ML | 250 MG/5 ML
const STRENGTH_RE = /\(?\s*\d+(?:\.\d+)?\s*(?:MG|MCG|G|ML|IU|%)\s*(?:\+\s*\d+(?:\.\d+)?\s*(?:MG|MCG|G|ML|IU|%))*\s*\)?\s*(?:\/\s*\d+(?:\.\d+)?\s*(?:ML|MG|G|MCG|IU))?\s*\)?/i;

export interface ParsedMedicine {
  name: string;
  type: string;       // normalized (e.g. "Tablet")
  strength: string;
  volume: string;     // pack/volume trailing piece
  pack: string;
  confidence: number; // 0..1
}

function extractFirst(re: RegExp, src: string): { match: string; rest: string } {
  const m = src.match(re);
  if (!m) return { match: "", rest: src };
  return { match: m[0].trim(), rest: (src.slice(0, m.index!) + src.slice(m.index! + m[0].length)).replace(/\s{2,}/g, " ").trim() };
}

function extractType(src: string): { match: string; rest: string } {
  const upper = src.toUpperCase();
  for (const tok of TYPE_TOKENS) {
    const idx = upper.indexOf(tok);
    if (idx === -1) continue;
    // require word boundaries
    const before = idx === 0 || /[^A-Z0-9]/.test(upper[idx - 1]);
    const afterPos = idx + tok.length;
    const after = afterPos === upper.length || /[^A-Z0-9]/.test(upper[afterPos]);
    if (!before || !after) continue;
    return {
      match: tok,
      rest: collapseSpaces(src.slice(0, idx) + " " + src.slice(idx + tok.length)),
    };
  }
  return { match: "", rest: src };
}

export function parseMedicine(input: string): ParsedMedicine {
  let src = collapseSpaces(input).replace(/[^\S ]+/g, " ");
  let confidence = 1;

  // 1. Pack / volume (trailing)
  let pack = "";
  let volume = "";
  const grid = extractFirst(GRID_RE, src);
  if (grid.match) { pack = grid.match; src = grid.rest; }
  const packM = extractFirst(PACK_RE, src);
  if (packM.match) { volume = packM.match; src = packM.rest; }

  // 2. Strength group (anywhere; first match)
  const strengthM = extractFirst(STRENGTH_RE, src);
  const strength = strengthM.match.replace(/[()]/g, "").trim();
  if (strengthM.match) src = strengthM.rest;

  // 3. Medicine type
  const typeM = extractType(src);
  const type = normalizeType(typeM.match || "");
  if (typeM.match) src = typeM.rest;
  else confidence -= 0.3;

  // 4. Remainder = product name
  const name = collapseSpaces(src).replace(/[(),\-\/]+$/g, "").trim();

  if (!name) confidence -= 0.4;
  if (!strength) confidence -= 0.15;

  return {
    name,
    type,
    strength,
    volume,
    pack,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}
