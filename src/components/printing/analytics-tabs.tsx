// Phase 4 additive: Analytics + Fleet tabs. Lazy-loaded, no impact on existing tabs.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, Printer, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrintingAnalytics, getPrinterFleet } from "@/lib/printing/analytics.functions";

function toCSV(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function download(name: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function KPI({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function AnalyticsTab({ tenantId }: { tenantId: string | null }) {
  const fn = useServerFn(getPrintingAnalytics);
  const q = useQuery({
    queryKey: ["printing-analytics", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId! } }),
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const maxDaily = useMemo(() => Math.max(1, ...(q.data?.daily.map((d) => d.count) ?? [1])), [q.data]);

  if (!tenantId) return <p className="text-sm text-muted-foreground">Select a tenant to view analytics.</p>;
  if (q.isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…</div>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Failed to load analytics.</p>;

  const k = q.data.kpis;
  const successRate = k.success + k.failed > 0 ? Math.round((k.success / (k.success + k.failed)) * 100) : 100;

  const onExport = () => {
    const rows = q.data!.daily.map((d) => ({ date: d.date, prints: d.count }));
    download(`printing-analytics-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
    toast.success("Analytics exported");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /><h3 className="text-sm font-medium">Last 30 days</h3></div>
        <Button variant="outline" size="sm" onClick={onExport}><Download className="h-3.5 w-3.5 mr-1" /> Export CSV</Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KPI label="Today" value={k.today} />
        <KPI label="This Week" value={k.week} />
        <KPI label="This Month" value={k.month} />
        <KPI label="Success Rate" value={`${successRate}%`} sub={`${k.success} ok · ${k.failed} failed`} />
        <KPI label="Avg Print Time" value={`${(k.avgPrintMs / 1000).toFixed(2)}s`} />
        <KPI label="Avg Queue Time" value={`${(k.avgQueueMs / 1000).toFixed(2)}s`} />
        <KPI label="Top Printer" value={<span className="text-sm truncate block">{k.mostUsedPrinter}</span>} />
        <KPI label="Top Document" value={<span className="text-sm truncate block">{k.mostPrintedDoc}</span>} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Daily Print Volume</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32">
            {q.data.daily.map((d) => (
              <div
                key={d.date}
                className="flex-1 bg-primary/70 rounded-t hover:bg-primary transition-colors"
                style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count ? 2 : 0 }}
                title={`${d.date}: ${d.count}`}
                aria-label={`${d.date}: ${d.count} prints`}
              />
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex justify-between">
            <span>{q.data.daily[0]?.date}</span>
            <span>{q.data.daily[q.data.daily.length - 1]?.date}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Engine Usage</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {q.data.engines.map(([n, c]) => (
              <div key={n} className="flex items-center justify-between text-sm">
                <span className="capitalize">{n}</span><Badge variant="outline">{c}</Badge>
              </div>
            ))}
            {!q.data.engines.length && <p className="text-xs text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Document Types</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {q.data.docs.slice(0, 6).map(([n, c]) => (
              <div key={n} className="flex items-center justify-between text-sm">
                <span>{n}</span><Badge variant="outline">{c}</Badge>
              </div>
            ))}
            {!q.data.docs.length && <p className="text-xs text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const healthColor: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500",
};

export function FleetTab({ tenantId }: { tenantId: string | null }) {
  const fn = useServerFn(getPrinterFleet);
  const q = useQuery({
    queryKey: ["printer-fleet", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId! } }),
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  if (!tenantId) return <p className="text-sm text-muted-foreground">Select a tenant.</p>;
  if (q.isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading fleet…</div>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Failed to load fleet.</p>;

  const rows = q.data;

  const onExport = () => {
    download(
      `printer-fleet-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(rows.map((r) => ({
        name: r.name, role: r.printer_role, language: r.language,
        width_mm: r.paper_width_mm, total: r.totalPrints, failed: r.failedPrints,
        success_rate: r.successRate, last_used: r.lastUsed ?? "", health: r.health,
      }))),
    );
    toast.success("Fleet exported");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Printer className="h-4 w-4" /><h3 className="text-sm font-medium">{rows.length} printer{rows.length === 1 ? "" : "s"}</h3></div>
        <Button variant="outline" size="sm" onClick={onExport}><Download className="h-3.5 w-3.5 mr-1" /> Export CSV</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Language</TableHead>
                <TableHead className="text-right">Width</TableHead>
                <TableHead className="text-right">Prints</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id as string}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.printer_role}</Badge></TableCell>
                  <TableCell>{r.language}</TableCell>
                  <TableCell className="text-right">{r.paper_width_mm}mm</TableCell>
                  <TableCell className="text-right">{r.totalPrints}</TableCell>
                  <TableCell className="text-right">{r.successRate}%</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.lastUsed ? new Date(r.lastUsed).toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${healthColor[r.health] ?? "bg-muted"}`} aria-label={r.health} />
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No printer profiles configured.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
