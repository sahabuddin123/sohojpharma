/**
 * Map Postgres errors (esp. plan-limit triggers raising JSON in MESSAGE)
 * to typed app errors that the UI can localize.
 */
export type PlanLimitError = {
  code: "plan_limit_exceeded" | "downgrade_blocked";
  resource: "branches" | "warehouses" | "users";
  limit?: number;
  current?: number;
};

export class AppError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function mapPgError(err: { message?: string; code?: string } | null): never {
  const msg = err?.message ?? "Unknown error";
  // Triggers raise JSON payloads as the message
  if (msg.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(msg) as Record<string, unknown>;
      const code = typeof parsed.code === "string" ? parsed.code : "app_error";
      throw new AppError(code, msg, parsed);
    } catch (e) {
      if (e instanceof AppError) throw e;
      // fallthrough to raw
    }
  }
  throw new AppError(err?.code ?? "db_error", msg);
}
