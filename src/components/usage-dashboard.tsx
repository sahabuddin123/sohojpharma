import { AlertTriangle, Infinity as InfIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useUsageSummary } from "@/hooks/use-usage";
import type { UsageRow } from "@/lib/api/usage.functions";

const LABELS: Record<UsageRow["metric"], string> = {
  products: "Products",
  users: "Users",
  branches: "Branches",
  warehouses: "Warehouses",
  storage_mb: "Storage (MB)",
  api_requests: "API requests / month",
};

const STATUS_CLR: Record<UsageRow["status"], string> = {
  ok: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-900",
  critical: "bg-orange-100 text-orange-900",
  blocked: "bg-red-100 text-red-800",
  unlimited: "bg-slate-100 text-slate-700",
};

function thresholdMessage(r: UsageRow): string | null {
  if (r.status === "blocked") return "Limit reached — creation blocked. Upgrade to continue.";
  if (r.status === "critical") return "≥ 90% used. Upgrade soon.";
  if (r.status === "warn") return "≥ 80% used.";
  return null;
}

export function UsageDashboard() {
  const { data, isLoading } = useUsageSummary();
  const rows = (data ?? []) as UsageRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Usage &amp; Plan Limits
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <div className="text-sm text-muted-foreground">Loading usage…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="text-sm text-muted-foreground">No active subscription.</div>
        )}
        {rows.map((r) => {
          const unlimited = r.limit_value === null;
          const note = thresholdMessage(r);
          return (
            <div key={r.metric} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="font-medium">{LABELS[r.metric] ?? r.metric}</div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">
                    {r.current_usage.toLocaleString()}{" "}
                    {unlimited ? (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        / <InfIcon className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">/ {r.limit_value!.toLocaleString()}</span>
                    )}
                  </span>
                  <Badge variant="outline" className={STATUS_CLR[r.status]}>
                    {unlimited ? "unlimited" : `${r.usage_percent}%`}
                  </Badge>
                </div>
              </div>
              {!unlimited && (
                <Progress
                  value={Math.min(r.usage_percent, 100)}
                  className={
                    r.status === "blocked" ? "[&>div]:bg-red-500" :
                    r.status === "critical" ? "[&>div]:bg-orange-500" :
                    r.status === "warn" ? "[&>div]:bg-amber-500" : ""
                  }
                />
              )}
              {note && (
                <div className={`text-xs flex items-center gap-1.5 ${
                  r.status === "blocked" ? "text-red-700" :
                  r.status === "critical" ? "text-orange-700" : "text-amber-700"
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5" /> {note}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
