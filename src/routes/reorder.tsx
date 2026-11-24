// Phase 10.5 — Smart Reorder Engine UI
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getReorderSuggestions } from "@/lib/reorder.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Sparkles } from "lucide-react";

export const Route = createFileRoute("/reorder")({
  head: () => ({
    meta: [
      { title: "Smart Reorder Engine — SohojPharma" },
      { name: "description", content: "AI-suggested purchase orders based on sales velocity, current stock and lead times." },
    ],
  }),
  component: ReorderPage,
});

const urgencyColor: Record<string, string> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

function ReorderPage() {
  const { currentTenantId } = useAuth();
  const fetchSuggestions = useServerFn(getReorderSuggestions);
  const [leadTime, setLeadTime] = useState(7);
  const [coverDays, setCoverDays] = useState(30);

  const { data, isLoading, refetch, isFetching } = useQuery({
    enabled: !!currentTenantId,
    queryKey: ["reorder", currentTenantId, leadTime, coverDays],
    queryFn: () =>
      fetchSuggestions({
        data: {
          tenant_id: currentTenantId!,
          lead_time_days: leadTime,
          cover_days: coverDays,
          limit: 200,
        },
      }),
  });

  const suggestions = data ?? [];
  const totalUnits = suggestions.reduce((sum, s) => sum + s.suggested_qty, 0);

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Smart Reorder Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Products to reorder based on 30-day sales velocity and stock cover.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Recalculate
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Parameters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Lead time (days)</Label>
            <Input type="number" min={1} max={90} value={leadTime}
              onChange={(e) => setLeadTime(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div>
            <Label>Cover after lead (days)</Label>
            <Input type="number" min={7} max={180} value={coverDays}
              onChange={(e) => setCoverDays(Math.max(7, Number(e.target.value) || 7))} />
          </div>
          <div className="flex items-end">
            <div className="text-sm text-muted-foreground">
              <div><span className="font-semibold text-foreground">{suggestions.length}</span> items to reorder</div>
              <div><span className="font-semibold text-foreground">{totalUnits.toLocaleString()}</span> total units suggested</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Suggestions</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Analyzing sales history…</p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">All stock levels look healthy.</p>
          ) : (
            <>
            {/* Mobile card list */}
            <div className="space-y-3 md:hidden">
              {suggestions.map((s) => (
                <div key={s.product_id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug break-words">{s.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground break-all">{s.sku}</p>
                    </div>
                    <Badge variant={urgencyColor[s.urgency] as never} className="shrink-0 capitalize">{s.urgency}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/60 py-1.5">
                      <p className="text-[11px] text-muted-foreground">On hand</p>
                      <p className="text-sm font-semibold">{s.on_hand}</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 py-1.5">
                      <p className="text-[11px] text-muted-foreground">Sold 30d</p>
                      <p className="text-sm font-semibold">{s.sold_last_30d}</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 py-1.5">
                      <p className="text-[11px] text-muted-foreground">Suggested</p>
                      <p className="text-sm font-semibold text-primary">{s.suggested_qty}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reorder lvl {s.reorder_level} · Daily {s.daily_velocity} · Cover {s.days_of_cover ?? "—"}d
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Urgency</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Reorder lvl</TableHead>
                    <TableHead className="text-right">Sold 30d</TableHead>
                    <TableHead className="text-right">Daily</TableHead>
                    <TableHead className="text-right">Days cover</TableHead>
                    <TableHead className="text-right">Suggested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((s) => (
                    <TableRow key={s.product_id}>
                      <TableCell>
                        <Badge variant={urgencyColor[s.urgency] as never}>{s.urgency}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="text-right">{s.on_hand}</TableCell>
                      <TableCell className="text-right">{s.reorder_level}</TableCell>
                      <TableCell className="text-right">{s.sold_last_30d}</TableCell>
                      <TableCell className="text-right">{s.daily_velocity}</TableCell>
                      <TableCell className="text-right">{s.days_of_cover ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{s.suggested_qty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
