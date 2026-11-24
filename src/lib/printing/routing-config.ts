// Print routing configuration — additive, localStorage backed (no DB schema changes).
// Stores a per-document-type routing rule that points at an existing PrinterProfile.

export type RouteEngine = "inherit" | "chrome" | "qz" | "auto";
export type RoutePaper = "inherit" | "38mm" | "58mm" | "80mm" | "A4";

export interface DocumentRoute {
  profileId: string | null;
  engine: RouteEngine;
  paperWidth: RoutePaper;
  copies: number; // 0 = inherit
  autoPrint: boolean;
  enabled: boolean;
}

export interface DocumentTypeDef {
  id: string;
  label: string;
  group: "Sales" | "Purchase" | "Labels" | "Financial" | "Inventory" | "Other";
}

export const DOCUMENT_TYPES: DocumentTypeDef[] = [
  { id: "pos-receipt", label: "POS Receipt", group: "Sales" },
  { id: "pos-invoice", label: "POS Invoice", group: "Sales" },
  { id: "sales-invoice", label: "Sales Invoice", group: "Sales" },
  { id: "quotation", label: "Quotation", group: "Sales" },
  { id: "return-receipt", label: "Return Receipt", group: "Sales" },

  { id: "purchase-invoice", label: "Purchase Invoice", group: "Purchase" },
  { id: "purchase-order", label: "Purchase Order", group: "Purchase" },
  { id: "supplier-receipt", label: "Supplier Receipt", group: "Purchase" },

  { id: "barcode-label", label: "Barcode Label", group: "Labels" },
  { id: "medicine-label", label: "Medicine Label", group: "Labels" },
  { id: "shelf-label", label: "Shelf Label", group: "Labels" },
  { id: "batch-label", label: "Batch Label", group: "Labels" },
  { id: "expiry-label", label: "Expiry Label", group: "Labels" },

  { id: "customer-receipt", label: "Customer Receipt", group: "Financial" },
  { id: "payment-receipt", label: "Payment Receipt", group: "Financial" },
  { id: "money-receipt", label: "Money Receipt", group: "Financial" },
  { id: "credit-note", label: "Credit Note", group: "Financial" },
  { id: "debit-note", label: "Debit Note", group: "Financial" },

  { id: "stock-transfer", label: "Stock Transfer", group: "Inventory" },
  { id: "stock-adjustment", label: "Stock Adjustment", group: "Inventory" },

  { id: "reports", label: "Reports", group: "Other" },
  { id: "a4-documents", label: "A4 Documents", group: "Other" },
];

export const DEFAULT_ROUTE: DocumentRoute = {
  profileId: null,
  engine: "inherit",
  paperWidth: "inherit",
  copies: 0,
  autoPrint: false,
  enabled: true,
};

export type RoutingMap = Record<string, DocumentRoute>;

const STORAGE_KEY = "sohojpharma.printing.routes";
const k = (tenantId?: string | null) => (tenantId ? `${STORAGE_KEY}.${tenantId}` : STORAGE_KEY);

export function loadRoutes(tenantId?: string | null): RoutingMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(k(tenantId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RoutingMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveRoutes(routes: RoutingMap, tenantId?: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(k(tenantId), JSON.stringify(routes));
}

export function getRoute(routes: RoutingMap, docId: string): DocumentRoute {
  return routes[docId] ?? { ...DEFAULT_ROUTE };
}

export interface ProfileLike {
  id: string;
  name: string;
  language?: string;
  paper_width_mm?: number;
  is_default?: boolean;
  notes?: string | null;
}

export interface RouteIssue {
  level: "error" | "warning";
  message: string;
}

export function validateRoute(
  route: DocumentRoute,
  profiles: ProfileLike[],
): RouteIssue[] {
  const issues: RouteIssue[] = [];
  if (!route.enabled) return issues;
  if (!route.profileId) {
    issues.push({ level: "warning", message: "No printer assigned (will use store default)" });
    return issues;
  }
  const profile = profiles.find((p) => p.id === route.profileId);
  if (!profile) {
    issues.push({ level: "error", message: "Referenced printer profile no longer exists" });
    return issues;
  }
  const extras = parseProfileNotes(profile.notes);
  if (extras.enabled === false) {
    issues.push({ level: "error", message: "Assigned profile is disabled" });
  }
  const effectiveEngine = route.engine === "inherit" ? (extras.engine ?? "auto") : route.engine;
  if (!effectiveEngine) issues.push({ level: "warning", message: "Missing print engine" });
  const effectivePaper = route.paperWidth === "inherit"
    ? (profile.paper_width_mm ? `${profile.paper_width_mm}mm` : null)
    : route.paperWidth;
  if (!effectivePaper) issues.push({ level: "warning", message: "Missing paper size" });
  return issues;
}

interface ProfileNotes {
  engine?: "chrome" | "qz" | "auto";
  driver?: string;
  copies?: number;
  connectionType?: string;
  enabled?: boolean;
  note?: string;
  paperLabel?: string;
}

export function parseProfileNotes(notes: unknown): ProfileNotes {
  if (typeof notes !== "string" || !notes) return {};
  try {
    const v = JSON.parse(notes);
    return v && typeof v === "object" ? (v as ProfileNotes) : {};
  } catch {
    return {};
  }
}

export interface ResolvedRoute {
  profile: ProfileLike | null;
  engine: "chrome" | "qz" | "auto";
  paperWidth: "38mm" | "58mm" | "80mm" | "A4";
  copies: number;
  source: "route" | "store-default" | "chrome-fallback";
}

export function resolveRoute(
  docId: string,
  routes: RoutingMap,
  profiles: ProfileLike[],
): ResolvedRoute {
  const route = routes[docId];
  const storeDefault = profiles.find((p) => p.is_default) ?? null;

  let profile: ProfileLike | null = null;
  let source: ResolvedRoute["source"] = "chrome-fallback";

  if (route && route.enabled && route.profileId) {
    const found = profiles.find((p) => p.id === route.profileId) ?? null;
    if (found) {
      profile = found;
      source = "route";
    }
  }
  if (!profile && storeDefault) {
    profile = storeDefault;
    source = "store-default";
  }

  const extras = parseProfileNotes(profile?.notes);
  const inheritedEngine = (extras.engine as "chrome" | "qz" | "auto" | undefined) ?? "auto";
  const engine = route && route.engine !== "inherit" ? route.engine : inheritedEngine;

  const inheritedPaper = profile?.paper_width_mm
    ? (`${profile.paper_width_mm}mm` as "38mm" | "58mm" | "80mm")
    : "80mm";
  const paperWidth =
    route && route.paperWidth !== "inherit"
      ? route.paperWidth
      : (extras.paperLabel as "38mm" | "58mm" | "80mm" | "A4" | undefined) ?? inheritedPaper;

  const inheritedCopies = Math.max(1, extras.copies ?? 1);
  const copies = route && route.copies > 0 ? route.copies : inheritedCopies;

  return { profile, engine, paperWidth, copies, source };
}

export interface RoutingHealth {
  level: "green" | "yellow" | "red";
  configured: number;
  missing: number;
  disabled: number;
  errors: number;
  total: number;
}

export function computeHealth(
  routes: RoutingMap,
  profiles: ProfileLike[],
): RoutingHealth {
  let configured = 0;
  let missing = 0;
  let disabled = 0;
  let errors = 0;
  for (const doc of DOCUMENT_TYPES) {
    const route = routes[doc.id] ?? DEFAULT_ROUTE;
    if (!route.enabled) {
      disabled += 1;
      continue;
    }
    if (!route.profileId) {
      missing += 1;
      continue;
    }
    const issues = validateRoute(route, profiles);
    if (issues.some((i) => i.level === "error")) errors += 1;
    else configured += 1;
  }
  const level: RoutingHealth["level"] = errors > 0 ? "red" : missing > 0 ? "yellow" : "green";
  return { level, configured, missing, disabled, errors, total: DOCUMENT_TYPES.length };
}
