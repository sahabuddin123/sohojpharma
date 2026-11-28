import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function applySecurityHeaders(response: Response, requestUrl?: string): Response {
  const headers = new Headers(response.headers);

  // Prevent MIME-sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  if (!headers.has("X-Frame-Options")) {
    headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  // Control referrer information
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Restrict browser permissions (allow camera for barcode & blister scanning)
  headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");

  // Legacy XSS filter protection & cross-domain / opener isolation
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

  if (!headers.has("Content-Security-Policy")) {
    headers.set(
      "Content-Security-Policy",
      "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self' https://*.bka.sh;",
    );
  }

  if (requestUrl) {
    try {
      const pathname = new URL(requestUrl).pathname;
      if (
        (pathname.startsWith("/_serverFn/") ||
          (pathname.startsWith("/api/") && !pathname.startsWith("/api/public/media/"))) &&
        !headers.has("Cache-Control")
      ) {
        headers.set("Cache-Control", "no-store");
      }
    } catch {
      // Ignore unparseable request URL
    }
  }

  // HSTS in production
  if (process.env.NODE_ENV === "production") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const rawResponse = await handler.fetch(request, env, ctx);
      const normalizedResponse = await normalizeCatastrophicSsrResponse(rawResponse);
      return applySecurityHeaders(normalizedResponse, request.url);
    } catch (error) {
      console.error(error);
      const fallbackResponse = new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      return applySecurityHeaders(fallbackResponse, request.url);
    }
  },
};
