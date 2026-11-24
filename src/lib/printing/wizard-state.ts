// Tracks first-time completion of the Printing Setup Wizard (per tenant).
// Additive — localStorage only, no DB schema changes.

const KEY = "sohojpharma.printing.wizard.done";
const k = (tenantId?: string | null) => (tenantId ? `${KEY}.${tenantId}` : KEY);

export function isWizardDone(tenantId?: string | null): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(k(tenantId)) === "1";
  } catch {
    return true;
  }
}

export function markWizardDone(tenantId?: string | null): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(k(tenantId), "1"); } catch { /* noop */ }
}

export function resetWizard(tenantId?: string | null): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(k(tenantId)); } catch { /* noop */ }
}
