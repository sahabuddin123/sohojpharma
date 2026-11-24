import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { Activity, AlertTriangle, CheckCircle2, Timer } from "lucide-react";

export const Route = createFileRoute("/developer/analytics")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: AnalyticsPage });

const series = [42, 55, 60, 48, 72, 88, 96, 80, 64, 58, 70, 82, 90, 100, 95, 84, 72, 66, 78, 90, 86, 70, 60, 52];
const max = Math.max(...series);

const endpoints = [
  { path: "GET /products", reqs: 12_480, err: 0.4, p95: "92 ms" },
  { path: "POST /sales", reqs: 6_120, err: 1.1, p95: "210 ms" },
  { path: "GET /inventory", reqs: 4_980, err: 0.2, p95: "78 ms" },
  { path: "POST /purchases", reqs: 1_240, err: 0.6, p95: "180 ms" },
  { path: "GET /reports/profit-loss", reqs: 612, err: 0.0, p95: "412 ms" },
];

function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { l: "Total requests (24h)", v: "25,432", icon: Activity, tone: "bg-blue-500/10 text-blue-600" },
          { l: "Success rate", v: "99.4%", icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-600" },
          { l: "Failed", v: "152", icon: AlertTriangle, tone: "bg-rose-500/10 text-rose-600" },
          { l: "Avg latency", v: "118 ms", icon: Timer, tone: "bg-violet-500/10 text-violet-600" },
        ].map((k) => (
          <div key={k.l} className="rounded-2xl border bg-card p-4">
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${k.tone}`}><k.icon className="h-4 w-4" /></span>
            <p className="mt-3 text-xs text-muted-foreground">{k.l}</p>
            <p className="text-2xl font-semibold">{k.v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <h3 className="text-sm font-semibold">Requests per hour (last 24h)</h3>
        <div className="mt-4 flex h-40 items-end gap-1">
          {series.map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-primary/80 hover:bg-primary" style={{ height: `${(v / max) * 100}%` }} title={`${i}:00 — ${v * 50} req`} />
          ))}
        </div>
      </div>

      <section className="rounded-2xl border bg-card">
        <header className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Top endpoints</h3></header>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Endpoint</th><th className="px-4 py-2 text-right">Requests</th><th className="px-4 py-2 text-right">Error %</th><th className="px-4 py-2 text-right">p95</th></tr>
          </thead>
          <tbody className="divide-y">
            {endpoints.map((e) => (
              <tr key={e.path}>
                <td className="px-4 py-2.5 font-mono text-xs">{e.path}</td>
                <td className="px-4 py-2.5 text-right">{e.reqs.toLocaleString()}</td>
                <td className={`px-4 py-2.5 text-right ${e.err > 1 ? "text-rose-600" : "text-muted-foreground"}`}>{e.err.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{e.p95}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
