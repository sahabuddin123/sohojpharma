import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useState } from "react";
import { RefreshCw, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listOps, deleteOp, clearDone, subscribe as subscribeOutbox, type OutboxOp,
} from "@/lib/offline/db";
import { flushNow, subscribeSync, type SyncState } from "@/lib/offline/sync";

export const Route = createFileRoute("/ops/offline")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  component: OfflineQueuePage,
});

function OfflineQueuePage() {
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [sync, setSync] = useState<SyncState>({
    online: true, syncing: false, lastRunAt: null, lastError: null,
  });

  useEffect(() => {
    const refresh = () => { void listOps().then(setOps); };
    refresh();
    const unsubOutbox = subscribeOutbox(refresh);
    const unsubSync = subscribeSync(setSync);
    return () => { unsubOutbox(); unsubSync(); };
  }, []);

  const pending = ops.filter((o) => o.status !== "done");
  const failed = ops.filter((o) => o.status === "failed");

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Offline Queue</h1>
          <p className="text-sm text-muted-foreground">
            Operations recorded locally are pushed to the server when you're back online.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sync.online ? "outline" : "destructive"}>
            {sync.online ? "Online" : "Offline"}
          </Badge>
          <Button size="sm" onClick={() => void flushNow()} disabled={sync.syncing || !sync.online}>
            <RefreshCw className={`mr-2 h-4 w-4 ${sync.syncing ? "animate-spin" : ""}`} />
            Sync now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void clearDone()}>
            <Trash2 className="mr-2 h-4 w-4" /> Clear done
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Pending" value={pending.length} />
        <Stat label="Failed (will retry)" value={failed.length} accent="destructive" />
        <Stat label="Last sync" value={sync.lastRunAt ? new Date(sync.lastRunAt).toLocaleTimeString() : "—"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Queue</CardTitle></CardHeader>
        <CardContent>
          {ops.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p>The queue is empty.</p>
            </div>
          ) : (
            <div className="divide-y">
              {ops.map((op) => (
                <div key={op.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{op.id.slice(0, 8)}</span>
                      <Badge variant="secondary">{op.kind}</Badge>
                      <StatusBadge status={op.status} />
                      {op.attempts > 0 && (
                        <span className="text-xs text-muted-foreground">{op.attempts} attempts</span>
                      )}
                    </div>
                    {op.lastError && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" /> {op.lastError}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created {new Date(op.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void deleteOp(op.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: "destructive" }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${accent === "destructive" ? "text-destructive" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: OutboxOp["status"] }) {
  const map: Record<OutboxOp["status"], { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "border-amber-500/40 text-amber-600" },
    syncing: { label: "Syncing", cls: "border-sky-500/40 text-sky-600" },
    failed:  { label: "Failed",  cls: "border-destructive/40 text-destructive" },
    done:    { label: "Done",    cls: "border-emerald-500/40 text-emerald-600" },
  };
  const m = map[status];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}
