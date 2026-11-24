// B8.1 — Mobile API root. Returns version manifest + capability flags.
import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS } from "@/lib/public-api/auth";
import { mobileOk } from "@/lib/public-api/mobile";

export const Route = createFileRoute("/api/mobile/v1/")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) =>
        mobileOk(
          {
            name: "SohojPharma Mobile API",
            version: "v1",
            future_versions: ["v2", "v3"],
            capabilities: {
              auth: ["api_key", "jwt", "hmac_signing"],
              offline_sync: true,
              push_notifications: { provider: "fcm", ready: true },
              prescription_ocr: { ready_contract: true, implemented: false },
              file_upload: ["signed_url"],
            },
            endpoints: {
              auth: "/api/public/v1/auth/{action}",
              products: "/api/public/v1/products",
              customers: "/api/public/v1/customers",
              sales: "/api/public/v1/sales",
              reports: "/api/public/v1/reports/summary",
              prescriptions: "/api/public/v1/prescriptions",
              sync: "/api/mobile/v1/sync",
              push_register: "/api/mobile/v1/push/register",
              prescription_analyze: "/api/mobile/v1/prescription/analyze",
              upload: "/api/mobile/v1/upload",
              openapi: "/api/public/v1/openapi",
            },
          },
          { request, message: "SohojPharma mobile API v1" },
        ),
    },
  },
});
