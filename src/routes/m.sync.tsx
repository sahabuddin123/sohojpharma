import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listSyncLogs } from "@/lib/api/devices.functions";
import { countPending, listPending, subscribe } from "@/lib/offline/db";
import { flushNow } from "@/lib/offline/sync";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorPanel } from "@/components/route-error";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/m/sync")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
  component: SyncPage,
});

function SyncPage() {
  const [pending, setPending] = useState(0);
  const [ops, setOps] = useState<Awaited<ReturnType<typeof listPending>>>([]);
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["sync-logs"],
    queryFn: () => listSyncLogs(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const refresh = () => {
      void countPending().then(setPending);
      void listPending().then(setOps);
    };
    refresh();
    const unsub = subscribe(refresh);
    return () => { unsub(); };
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Sync</h1>
        <Button size="sm" variant="outline" onClick={async () => { await flushNow(); await refetch(); }}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Flush now
        </Button>
      </div>

      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Pending in queue</div>
        <div className="mt-1 text-2xl font-semibold">{pending}</div>
        {ops.length > 0 && (
          <div className="mt-3 space-y-1">
            {ops.slice(0, 10).map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs">
                <span className="font-mono">{o.kind}</span>
                <span className="text-muted-foreground">
                  {o.attempts > 0 ? `${o.attempts} attempts` : "queued"}
                  {o.status === "failed" && <Badge variant="destructive" className="ml-2">failed</Badge>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Recent sync runs</h2>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !logs?.length ? (
          <Card className="p-4 text-center text-xs text-muted-foreground">No sync runs yet.</Card>
        ) : (
          <div className="space-y-2">
            {logs.map((l) => (
              <Card key={l.id} className="p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {l.succeeded}/{l.batch_size} synced
                    {l.failed > 0 && <span className="ml-1 text-destructive">· {l.failed} failed</span>}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(l.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {l.duration_ms != null ? `${l.duration_ms} ms` : ""}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
