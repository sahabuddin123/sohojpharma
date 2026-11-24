// Reusable label template engine.
// Supports {{token}} substitution with HTML-escaping disabled
// (templates are raw printer commands, not HTML).
import type { PrinterLanguage } from "../types";

export interface LabelTemplate {
  name: string;
  kind: "medicine" | "shelf" | "price" | "batch" | "expiry" | "qr";
  language: PrinterLanguage;
  paperWidthMm: number;
  paperHeightMm: number;
  body: string;
}

export type TemplateContext = Record<string, string | number | null | undefined>;

const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function renderTemplate(template: LabelTemplate, ctx: TemplateContext): string {
  return template.body.replace(TOKEN_RE, (_match, key: string) => {
    const v = ctx[key];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

// Convenience renderers for the most common kinds — wrap renderTemplate.
export function renderMedicineLabel(template: LabelTemplate, p: {
  name: string;
  strength?: string;
  batch?: string;
  expiry?: string;
  barcode?: string;
  price?: string | number;
}): string {
  return renderTemplate(template, {
    name: p.name,
    strength: p.strength ?? "",
    batch: p.batch ?? "",
    expiry: p.expiry ?? "",
    barcode: p.barcode ?? "",
    price: p.price ?? "",
  });
}
