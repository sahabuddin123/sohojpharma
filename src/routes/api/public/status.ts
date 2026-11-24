import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Public health endpoint for uptime monitoring.
 *   GET /api/public/status
 * Returns 200 + `{ status: "ok", db: "ok", ts }` when the database is reachable,
 * otherwise 503 + `{ status: "degraded", db: "fail" }`. No secrets, no PII.
 * Stable URL: https://project--<id>.lovable.app/api/public/status
 */
export const Route = createFileRoute("/api/public/status")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        let dbOk = false;
        let dbError: string | null = null;
        if (url && key) {
          try {
            const sb = createClient(url, key, {
              auth: { persistSession: false, autoRefreshToken: false },
            });
            // Cheap, public-safe probe: hit a table the anon role can never read,
            // we only care that PostgREST responds (RLS-denied is still "alive").
            const { error } = await sb.from("plans").select("id").limit(1);
            dbOk = !error || error.code === "PGRST116" || error.code === "42501";
            if (!dbOk) dbError = error?.message ?? "unknown";
          } catch (e) {
            dbError = (e as Error).message;
          }
        } else {
          dbError = "missing SUPABASE env";
        }
        const body = {
          status: dbOk ? "ok" : "degraded",
          db: dbOk ? "ok" : "fail",
          db_error: dbError,
          uptime_ms: Date.now() - started,
          ts: new Date().toISOString(),
        };
        return new Response(JSON.stringify(body), {
          status: dbOk ? 200 : 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
