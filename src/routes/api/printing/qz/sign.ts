// POST /api/printing/qz/sign — abstraction stub for production QZ signing.
// Returns 501 by default; replace with a real RSA-SHA256 signer when the
// private key is provisioned on the server. Never invoked in development mode.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/printing/qz/sign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { toSign?: string };
          if (!body?.toSign) {
            return new Response(JSON.stringify({ error: "missing toSign" }), {
              status: 400, headers: { "content-type": "application/json" },
            });
          }
        } catch {
          return new Response(JSON.stringify({ error: "invalid body" }), {
            status: 400, headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ error: "signing_not_configured" }),
          { status: 501, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
