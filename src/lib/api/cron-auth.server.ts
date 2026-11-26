/**
 * Verifies cron / background job requests using `x-cron-secret` (or Bearer token)
 * against `process.env.CRON_SECRET` using constant-time comparison.
 */
import { timingSafeEqual } from "node:crypto";

export function verifyCronRequest(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  const headerSecret =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")!.slice(7)
      : null);

  if (!expected || !headerSecret) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const a = Buffer.from(expected);
  const b = Buffer.from(headerSecret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}
