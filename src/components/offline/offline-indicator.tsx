"use client";
import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { countPending, subscribe as subscribeOutbox } from "@/lib/offline/db";
import { startSyncEngine, subscribeSync, flushNow, type SyncState } from "@/lib/offline/sync";

export function OfflineIndicator() {
  const [pending, setPending] = useState(0);
  const [sync, setSync] = useState<SyncState>({
    online: true, syncing: false, lastRunAt: null, lastError: null,
  });

  useEffect(() => {
    startSyncEngine();
    const refreshCount = () => { void countPending().then(setPending); };
    refreshCount();
    const unsubOutbox = subscribeOutbox(refreshCount);
    const unsubSync = subscribeSync(setSync);
    return () => { unsubOutbox(); unsubSync(); };
  }, []);

  if (sync.online && pending === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={
          sync.online
            ? "gap-1.5 border-amber-500/40 text-amber-600"
            : "gap-1.5 border-destructive/40 text-destructive"
        }
      >
        {sync.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {sync.online ? "Syncing" : "Offline"}
        {pending > 0 && <span className="ml-1 font-semibold">· {pending} pending</span>}
      </Badge>
      {sync.online && pending > 0 && (
        <Button size="sm" variant="ghost" onClick={() => void flushNow()} disabled={sync.syncing}>
          <RefreshCw className={`h-3.5 w-3.5 ${sync.syncing ? "animate-spin" : ""}`} />
        </Button>
      )}
    </div>
  );
}
