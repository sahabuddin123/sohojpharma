import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { Database, HardDrive, Cloud, RefreshCw, Activity } from "lucide-react";

export const Route = createFileRoute("/ops/health")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: HealthPage });

function Bar({ value, tone = "bg-primary" }: { value: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${tone}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function HealthPage() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><Database className="h-5 w-5" /></span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Database</p>
            <p className="text-xs text-muted-foreground">Connected · 42ms avg latency</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">Healthy</span>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><HardDrive className="h-5 w-5" /></span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Storage</p>
            <p className="text-xs text-muted-foreground">3.2 GB of 10 GB used</p>
          </div>
          <span className="text-xs font-semibold">32%</span>
        </div>
        <div className="mt-3"><Bar value={32} /></div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600"><Cloud className="h-5 w-5" /></span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Last Backup</p>
            <p className="text-xs text-muted-foreground">Today · 03:00 · Auto</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">OK</span>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><RefreshCw className="h-5 w-5" /></span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Sync</p>
            <p className="text-xs text-muted-foreground">Last sync 2 min ago · 0 pending</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">In sync</span>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 md:col-span-2">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Service uptime (30d)</h3>
        </div>
        <div className="grid grid-cols-30 gap-1">
          {Array.from({ length: 30 }).map((_, i) => {
            const bad = i === 9 || i === 22;
            return <div key={i} className={`h-8 rounded-sm ${bad ? "bg-amber-500" : "bg-emerald-500"}`} title={`Day ${i + 1}`} />;
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">99.7% uptime · 2 degraded days</p>
      </div>
    </div>
  );
}
