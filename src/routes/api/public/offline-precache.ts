import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";

export const Route = createFileRoute("/api/public/offline-precache")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const candidates = [
            path.resolve(process.cwd(), ".output/sw-precache.json"),
            path.resolve(process.cwd(), "sw-precache.json"),
          ];
          for (const p of candidates) {
            if (fs.existsSync(p)) {
              const raw = fs.readFileSync(p, "utf8");
              return new Response(raw, {
                status: 200,
                headers: {
                  "Content-Type": "application/json; charset=utf-8",
                  "Cache-Control": "no-store",
                },
              });
            }
          }
        } catch {
          // fallback below
        }
        return Response.json(
          {
            version: "fallback",
            assets: ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"],
            routes: ["/m", "/m/sale", "/sales/pos"],
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
