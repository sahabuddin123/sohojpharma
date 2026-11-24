/**
 * Client-side parser for PG errors raised by plan-limit triggers.
 * Looks for the JSON payload our enforce_plan_limit_* / downgrade_plan
 * functions raise: { code, resource, limit, current? }
 *
 * Returns a translation key + interpolation values when it matches one
 * of the known codes; otherwise returns null so the caller can fall back
 * to the original message.
 */
import type { TFunction } from "i18next";

export type LimitErrorParts = {
  key: string;
  values: Record<string, unknown>;
};

const KNOWN = new Set(["plan_limit_exceeded", "downgrade_blocked", "feature_disabled"]);

export function parsePgLimitError(message: string | undefined | null): LimitErrorParts | null {
  if (!message) return null;
  // Postgres may wrap the JSON inside "ERROR: " or similar prefixes; find the first {...}
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(message.slice(start, end + 1)) as Record<string, unknown>;
    const code = typeof parsed.code === "string" ? parsed.code : null;
    if (!code || !KNOWN.has(code)) return null;
    if (code === "feature_disabled") {
      return { key: `errors.feature_disabled.${parsed.feature ?? "sms_enabled"}`, values: parsed };
    }
    return { key: `errors.${code}.${parsed.resource ?? "branches"}`, values: parsed };
  } catch {
    return null;
  }
}

/** Convenience: returns a localized string for any error, falling back to its raw message. */
export function localizePgError(t: TFunction, err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
        ? err.message
        : typeof err === "string"
          ? err
          : "Something went wrong. Please try again.";
  const parts = parsePgLimitError(msg);
  if (!parts) return msg;
  const localized: unknown = t(parts.key, parts.values as Record<string, unknown>);
  return typeof localized === "string" && localized.trim() ? localized : msg;
}
