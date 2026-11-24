// B4.11 — Health check endpoint. No auth, no PII.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const checks: Record<string, { status: "healthy" | "warning" | "critical"; ms?: number; error?: string }> = {
          api: { status: "healthy" },
        };

        // Database round-trip via PostgREST (publishable key, hits a tiny public-ish RPC-free read)
        try {
          const t0 = Date.now();
          const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
          const key =
            process.env.SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const r = await fetch(`${url}/rest/v1/plans?select=code&limit=1`, {
            headers: { apikey: key as string, Authorization: `Bearer ${key}` },
          });
          checks.database = {
            status: r.ok ? "healthy" : "critical",
            ms: Date.now() - t0,
            ...(r.ok ? {} : { error: `HTTP ${r.status}` }),
          };
        } catch (e) {
          checks.database = { status: "critical", error: (e as Error).message };
        }

        // Auth endpoint reachable
        try {
          const t0 = Date.now();
          const url = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
          const r = await fetch(`${url}/auth/v1/health`);
          checks.auth = {
            status: r.ok ? "healthy" : "warning",
            ms: Date.now() - t0,
            ...(r.ok ? {} : { error: `HTTP ${r.status}` }),
          };
        } catch (e) {
          checks.auth = { status: "warning", error: (e as Error).message };
        }

        const overall: "healthy" | "warning" | "critical" = Object.values(checks).some(
          (c) => c.status === "critical",
        )
          ? "critical"
          : Object.values(checks).some((c) => c.status === "warning")
          ? "warning"
          : "healthy";

        return Response.json(
          {
            status: overall,
            release: process.env.VITE_APP_VERSION ?? "dev",
            checked_at: new Date().toISOString(),
            duration_ms: Date.now() - started,
            checks,
          },
          { status: overall === "critical" ? 503 : 200 },
        );
      },
    },
  },
});
