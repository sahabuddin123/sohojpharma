import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'

export const Route = createFileRoute('/api/public/hooks/healthcheck')({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now()
        const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {}

        // DB ping
        const t0 = Date.now()
        try {
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false, autoRefreshToken: false } },
          )
          const { error } = await supabase.from('plans').select('id').limit(1)
          checks.database = error
            ? { ok: false, ms: Date.now() - t0, error: error.message }
            : { ok: true, ms: Date.now() - t0 }
        } catch (e) {
          checks.database = { ok: false, ms: Date.now() - t0, error: String(e) }
        }

        checks.runtime = { ok: true, ms: 0 }

        const allOk = Object.values(checks).every((c) => c.ok)
        return new Response(
          JSON.stringify({
            status: allOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime_ms: Date.now() - startedAt,
            checks,
          }),
          {
            status: allOk ? 200 : 503,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          },
        )
      },
    },
  },
})
