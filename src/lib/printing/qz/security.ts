// QZ Tray production security layer (additive).
// Initializes qz.security.setCertificatePromise + setSignaturePromise BEFORE
// any connect() call. Never throws; never blocks printing. If the certificate
// or signing endpoint is unavailable, falls back to anonymous/development mode
// (current behavior — popup may appear, but printing still works).
import { getQz } from "./connection";

// Primary: DB-backed cert (managed via the admin Security Setup wizard).
// Fallback: static /qz/certificate.pem committed to the project.
const CERT_URL_PRIMARY = "/api/public/qz-certificate";
const CERT_URL_FALLBACK = "/qz/certificate.pem";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
const DEFAULT_SIGN_ENDPOINT = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/printing-qz-sign`
  : "/api/printing/qz/sign";
const STORAGE_KEY = "pc.printing.qz.security";

export type QzSecurityMode = "development" | "production";

export type QzSecurityConfig = {
  enabled: boolean;
  mode: QzSecurityMode;
  signEndpoint: string;
};

export const DEFAULT_QZ_SECURITY: QzSecurityConfig = {
  enabled: false,
  mode: "development",
  signEndpoint: DEFAULT_SIGN_ENDPOINT,
};

export function loadQzSecurity(): QzSecurityConfig {
  if (typeof window === "undefined") return DEFAULT_QZ_SECURITY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QZ_SECURITY;
    return { ...DEFAULT_QZ_SECURITY, ...(JSON.parse(raw) as Partial<QzSecurityConfig>) };
  } catch {
    return DEFAULT_QZ_SECURITY;
  }
}

export function saveQzSecurity(cfg: Partial<QzSecurityConfig>): QzSecurityConfig {
  const next = { ...loadQzSecurity(), ...cfg };
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  }
  return next;
}

let cachedCert: string | null = null;
let certFingerprint: string | null = null;
let lastCertStatus: "missing" | "loaded" | "error" = "missing";

async function tryFetchCert(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes("BEGIN CERTIFICATE") || text.includes("REPLACE_THIS_FILE")) return null;
    return text;
  } catch { return null; }
}

export async function fetchCertificate(): Promise<string | null> {
  if (cachedCert) return cachedCert;
  if (typeof window === "undefined") return null;
  // Bust the in-module cache flag.
  cachedCert = null;
  const text =
    (await tryFetchCert(CERT_URL_PRIMARY)) ??
    (await tryFetchCert(CERT_URL_FALLBACK));
  if (!text) { lastCertStatus = "missing"; return null; }
  cachedCert = text;
  lastCertStatus = "loaded";
  certFingerprint = await sha256Hex(text);
  return text;
}

export function clearCertificateCache(): void {
  cachedCert = null;
  certFingerprint = null;
  lastCertStatus = "missing";
}

async function sha256Hex(input: string): Promise<string | null> {
  try {
    const buf = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0")).join(":").toUpperCase();
  } catch { return null; }
}

export function getCertificateStatus(): { status: typeof lastCertStatus; fingerprint: string | null } {
  return { status: lastCertStatus, fingerprint: certFingerprint };
}

let lastSignStatus: "idle" | "ok" | "error" = "idle";

async function signViaEndpoint(endpoint: string, toSign: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    // Attach anon key when calling the Supabase edge function.
    if (SUPABASE_ANON && endpoint.includes("/functions/v1/")) {
      headers["apikey"] = SUPABASE_ANON;
      headers["authorization"] = `Bearer ${SUPABASE_ANON}`;
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ toSign }),
    });
    if (!res.ok) { lastSignStatus = "error"; return null; }
    const json = (await res.json()) as { signature?: string };
    if (json.signature) { lastSignStatus = "ok"; return json.signature; }
    lastSignStatus = "error";
    return null;
  } catch { lastSignStatus = "error"; return null; }
}

export function getSignStatus(): "idle" | "ok" | "error" { return lastSignStatus; }

let initialized = false;

/**
 * Configure QZ security. Safe to call multiple times — no-ops after first
 * successful init. Always resolves; never throws.
 */
export async function initQzSecurity(): Promise<void> {
  if (initialized) return;
  const qz = await getQz();
  if (!qz) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = qz as any;
  if (!api?.security?.setCertificatePromise) return;

  const cfg = loadQzSecurity();
  if (!cfg.enabled) { initialized = true; return; }

  const cert = await fetchCertificate();

  api.security.setCertificatePromise((resolve: (v: string) => void, reject: (e?: unknown) => void) => {
    if (cert) resolve(cert);
    else reject();
  });

  const endpoint = cfg.signEndpoint || DEFAULT_SIGN_ENDPOINT;
  api.security.setSignaturePromise((toSign: string) => {
    return (resolve: (v: string) => void, reject: (e?: unknown) => void) => {
      if (cfg.mode !== "production") { reject(); return; }
      signViaEndpoint(endpoint, toSign).then((sig) => {
        if (sig) resolve(sig);
        else reject();
      }).catch(() => reject());
    };
  });

  initialized = true;
}
