// One-click production validation for the enterprise printing subsystem.
// Pure utility — UI consumes the returned checklist.

import { connect as qzConnect } from "./qz/connection";
import { findPrinters } from "./qz/printer";
import { printQueue } from "./queue";

export interface ValidationCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ValidationReport {
  ranAt: number;
  ok: boolean;
  checks: ValidationCheck[];
}

export async function runProductionValidation(opts: {
  hasProfile: boolean;
  fallbackEnabled: boolean;
}): Promise<ValidationReport> {
  const checks: ValidationCheck[] = [];

  // 1. QZ availability
  try {
    const status = await qzConnect();
    checks.push({
      id: "qz",
      label: "QZ Tray websocket",
      ok: status.connected,
      detail: status.connected
        ? `Connected${status.version ? ` (v${status.version})` : ""}`
        : status.error ?? "Not connected",
    });
  } catch (e) {
    checks.push({ id: "qz", label: "QZ Tray websocket", ok: false, detail: errMsg(e) });
  }

  // 2. Printer discovery
  try {
    const printers = await findPrinters();
    checks.push({
      id: "printers",
      label: "Printer discovery",
      ok: printers.length > 0,
      detail: `${printers.length} printer(s) visible`,
    });
  } catch (e) {
    checks.push({ id: "printers", label: "Printer discovery", ok: false, detail: errMsg(e) });
  }

  // 3. At least one printer profile configured
  checks.push({
    id: "profile",
    label: "Printer profile configured",
    ok: opts.hasProfile,
    detail: opts.hasProfile ? "OK" : "Add at least one printer profile",
  });

  // 4. Queue worker alive
  checks.push({
    id: "queue",
    label: "Queue worker",
    ok: typeof printQueue.snapshot === "function",
    detail: `${printQueue.snapshot().length} in queue`,
  });

  // 5. Chrome fallback available
  checks.push({
    id: "fallback",
    label: "Chrome fallback",
    ok: typeof window !== "undefined" && typeof window.print === "function" && opts.fallbackEnabled,
    detail: opts.fallbackEnabled ? "Enabled" : "Disabled in settings",
  });

  const ok = checks.every((c) => c.ok);
  return { ranAt: Date.now(), ok, checks };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
