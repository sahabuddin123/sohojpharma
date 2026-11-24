// Phase 4 additive analytics + fleet server functions. Read-only aggregates.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
});

type JobRow = {
  id: string;
  document_type: string;
  engine: string;
  status: string;
  printer_name: string | null;
  duration_ms: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export const getPrintingAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    let q = context.supabase
      .from("print_jobs")
      .select("id,document_type,engine,status,printer_name,duration_ms,created_at,started_at,completed_at")
      .eq("tenant_id", data.tenant_id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const jobs = (rows ?? []) as JobRow[];

    const now = Date.now();
    const dayMs = 86_400_000;
    const today = jobs.filter((j) => now - +new Date(j.created_at) < dayMs);
    const week = jobs.filter((j) => now - +new Date(j.created_at) < 7 * dayMs);
    const month = jobs;

    const succ = jobs.filter((j) => j.status === "completed");
    const fail = jobs.filter((j) => j.status === "failed");
    const durations = succ.map((j) => j.duration_ms ?? 0).filter((n) => n > 0);
    const queueTimes = jobs
      .filter((j) => j.started_at && j.created_at)
      .map((j) => +new Date(j.started_at!) - +new Date(j.created_at));

    const tally = (key: keyof JobRow) => {
      const map = new Map<string, number>();
      for (const j of jobs) {
        const v = (j[key] ?? "unknown") as string;
        map.set(v, (map.get(v) ?? 0) + 1);
      }
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    };
    const printers = tally("printer_name");
    const docs = tally("document_type");
    const engines = tally("engine");

    // Daily volume (last 30 days)
    const dailyMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * dayMs).toISOString().slice(0, 10);
      dailyMap.set(d, 0);
    }
    for (const j of jobs) {
      const d = j.created_at.slice(0, 10);
      if (dailyMap.has(d)) dailyMap.set(d, (dailyMap.get(d) ?? 0) + 1);
    }
    const daily = [...dailyMap.entries()].map(([date, count]) => ({ date, count }));

    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

    return {
      kpis: {
        today: today.length,
        week: week.length,
        month: month.length,
        success: succ.length,
        failed: fail.length,
        retries: jobs.filter((j) => (j as unknown as { attempts?: number }).attempts ?? 0).length,
        avgPrintMs: avg(durations),
        avgQueueMs: avg(queueTimes),
        mostUsedPrinter: printers[0]?.[0] ?? "—",
        mostPrintedDoc: docs[0]?.[0] ?? "—",
      },
      printers,
      docs,
      engines,
      daily,
    };
  });

export const getPrinterFleet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("printing_printer_profiles")
      .select("id,name,printer_role,language,paper_width_mm,branch_id,is_default,auto_detected,updated_at")
      .eq("tenant_id", data.tenant_id)
      .order("name");
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);

    // Recent usage by printer_name
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: jobs } = await context.supabase
      .from("print_jobs")
      .select("printer_name,status,duration_ms,created_at")
      .eq("tenant_id", data.tenant_id)
      .gte("created_at", since.toISOString())
      .limit(5000);

    const usage = new Map<string, { total: number; failed: number; lastUsed: string | null; avgMs: number }>();
    for (const j of (jobs ?? []) as Array<{ printer_name: string | null; status: string; duration_ms: number | null; created_at: string }>) {
      const k = j.printer_name ?? "";
      if (!k) continue;
      const e = usage.get(k) ?? { total: 0, failed: 0, lastUsed: null, avgMs: 0 };
      e.total += 1;
      if (j.status === "failed") e.failed += 1;
      if (!e.lastUsed || j.created_at > e.lastUsed) e.lastUsed = j.created_at;
      if (j.duration_ms) e.avgMs = Math.round((e.avgMs + j.duration_ms) / 2);
      usage.set(k, e);
    }

    type Profile = {
      id: string; name: string; printer_role: string; language: string;
      paper_width_mm: number; branch_id: string | null;
      is_default: boolean; auto_detected: boolean; updated_at: string;
    };
    return ((profiles ?? []) as Profile[]).map((p) => {
      const u = usage.get(p.name) ?? { total: 0, failed: 0, lastUsed: null, avgMs: 0 };
      const successRate = u.total ? Math.round(((u.total - u.failed) / u.total) * 100) : 100;
      const health = u.failed === 0 ? "green" : successRate >= 80 ? "yellow" : "red";
      return { ...p, totalPrints: u.total, failedPrints: u.failed, lastUsed: u.lastUsed, avgMs: u.avgMs, successRate, health };
    });
  });
