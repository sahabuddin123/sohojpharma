// B8.4 — Standard mobile API envelope.
// All /api/mobile/v1/* responses MUST go through these helpers so Flutter /
// Android clients can rely on a single shape.
import { JSON_HEADERS } from "./auth";

export interface MobilePagination {
  page: number;
  per_page: number;
  total?: number;
  next_cursor?: string | null;
}

export interface MobileEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
  pagination: MobilePagination | null;
  errors: Array<{ code: string; message: string; field?: string }> | null;
  timestamp: string;
  request_id: string;
  api_version: "v1";
}

function newRequestId(req?: Request): string {
  const fromHeader = req?.headers.get("x-request-id");
  if (fromHeader) return fromHeader;
  // crypto.randomUUID is available in workerd
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
}

export function mobileOk<T>(
  data: T,
  opts: {
    request?: Request;
    message?: string;
    pagination?: MobilePagination | null;
    status?: number;
  } = {},
): Response {
  const body: MobileEnvelope<T> = {
    success: true,
    message: opts.message ?? "ok",
    data,
    pagination: opts.pagination ?? null,
    errors: null,
    timestamp: new Date().toISOString(),
    request_id: newRequestId(opts.request),
    api_version: "v1",
  };
  return new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: { ...JSON_HEADERS, "X-Request-Id": body.request_id },
  });
}

export function mobileError(
  code: string,
  message: string,
  status: number,
  opts: { request?: Request; field?: string; extra?: Record<string, unknown> } = {},
): Response {
  const body: MobileEnvelope<null> = {
    success: false,
    message,
    data: null,
    pagination: null,
    errors: [{ code, message, ...(opts.field ? { field: opts.field } : {}) }],
    timestamp: new Date().toISOString(),
    request_id: newRequestId(opts.request),
    api_version: "v1",
  };
  return new Response(JSON.stringify({ ...body, ...(opts.extra ?? {}) }), {
    status,
    headers: { ...JSON_HEADERS, "X-Request-Id": body.request_id },
  });
}
