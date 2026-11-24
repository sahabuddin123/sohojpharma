// B6.1 — API gateway index. Returns versions + status.
import { createFileRoute } from "@tanstack/react-router";
import { JSON_HEADERS, preflight } from "@/lib/public-api/auth";

export const Route = createFileRoute("/api/public/v1/")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async () =>
        new Response(
          JSON.stringify({
            name: "SohojPharma Public API",
            version: "v1",
            status: "operational",
            docs: "/api/public/v1/openapi.json",
            supported_versions: ["v1"],
            roadmap: ["v2", "v3"],
          }),
          { headers: JSON_HEADERS },
        ),
    },
  },
});
