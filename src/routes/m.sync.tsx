import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Database, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { listSyncLogs } from "@/lib/api/devices.functions";
import { countPending, listUnfinishedOps, subscribe, type OutboxOp } from "@/lib/offline/db";
import { flushNow, subscribeSync, type SyncState } from "@/lib/offline/sync";
import { subscribeWarmStatus, warmFullCatalog, type WarmStatus } from "@/lib/offline/warm-cache";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/m/sync")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
  component: SyncPage,
});

function SyncPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const KIND_LABELS: Record<string, string> = {
    sale: t("m.sync.kindSale"),
    purchase: t("m.sync.kindPurchase"),
    customer_create: t("m.sync.kindCustomer"),
    collection: t("m.sync.kindCollection"),
  };
  const [pending, setPending] = useState(0);
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [sync, setSync] = useState<SyncState>({ online: true, syncing: false, lastRunAt: null, lastError: null });
  const [warm, setWarm] = useState<WarmStatus>({ syncingCatalog: false, cachedProducts: 0, totalProducts: 0, lastSyncedAt: null });

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["sync-logs"],
    enabled: typeof navigator === "undefined" || navigator.onLine,
    queryFn: () => listSyncLogs(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const refresh = () => {
      void countPending().then(setPending);
      void listUnfinishedOps().then(setOps);
    };
    refresh();
    const unsub = subscribe(refresh);
    const unsubSync = subscribeSync(setSync);
    const unsubWarm = subscribeWarmStatus(setWarm);
    return () => {
      unsub();
      unsubSync();
      unsubWarm();
    };
  }, []);

  const handleFlush = async () => {
    if (!navigator.onLine) {
      toast.error("এখন ইন্টারনেট সংযোগ নেই — অনলাইনে এলেই অটো সিঙ্ক হবে।");
      return;
    }
    const res = await flushNow();
    await refetch();
    if (res.processed > 0) {
      toast.success(`${res.processed}টি এন্ট্রি সার্ভারে সিঙ্ক হয়েছে ✓`);
    } else if (res.failed > 0) {
      toast.error(`${res.failed}টি এন্ট্রি সিঙ্ক হতে পারেনি, আবার চেষ্টা করা হবে।`);
    } else {
      toast.info("সিঙ্ক করার মতো কোনো পেন্ডিং এন্ট্রি নেই।");
    }
  };

  const handleWarmCatalog = async () => {
    if (!tenantId) return;
    if (!navigator.onLine) {
      toast.error("ক্যাটালগ ডাউনলোডের জন্য ইন্টারনেট প্রয়োজন।");
      return;
    }
    toast.info("অফলাইন ক্যাটালগ সিঙ্ক শুরু হয়েছে...");
    await warmFullCatalog(tenantId, true);
    toast.success("অফলাইন ক্যাটালগ আপডেট হয়েছে ✓");
  };

  return (
    <PhoneShell title={t("m.sync.title")} back>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {sync.online ? (
                <Wifi className="h-4 w-4 text-[#0d5c46]" />
              ) : (
                <WifiOff className="h-4 w-4 text-amber-600" />
              )}
              <span className="text-sm font-bold">
                {sync.online ? t("m.sync.online") : t("m.sync.offline")}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleFlush()}
              disabled={sync.syncing || !sync.online}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${sync.syncing ? "animate-spin" : ""}`} />
              {t("m.sync.syncNow")}
            </Button>
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Database className="h-3.5 w-3.5 text-[#0d5c46]" />
                {t("m.sync.catalogTitle")}
              </span>
              <span className="font-bold text-[#0d5c46]">
                {warm.cachedProducts.toLocaleString("en-IN")}
                {warm.totalProducts > 0 ? ` / ${warm.totalProducts.toLocaleString("en-IN")}` : ""} {t("m.common.itemsSuffix")}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {warm.syncingCatalog
                  ? t("m.common.loading")
                  : warm.lastSyncedAt
                    ? new Date(warm.lastSyncedAt).toLocaleTimeString()
                    : t("m.sync.refreshCatalog")}
              </span>
              <button
                type="button"
                onClick={() => void handleWarmCatalog()}
                disabled={warm.syncingCatalog || !sync.online}
                className="font-bold text-[#0d5c46] hover:underline disabled:opacity-50"
              >
                {warm.syncingCatalog ? t("m.common.loading") : t("m.sync.refreshCatalog")}
              </button>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t("m.sync.queuedOps")}</span>
            <span className="text-xl font-extrabold text-slate-900">{pending}</span>
          </div>
          {ops.length === 0 ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {t("m.sync.noPending")}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {ops.slice(0, 20).map((o) => (
                <div key={o.id} className="rounded-xl border border-slate-200 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">{KIND_LABELS[o.kind] ?? o.kind}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(o.createdAt).toLocaleTimeString()}
                      </span>
                      {o.status === "failed" ? (
                        <Badge variant="destructive" className="text-[10px]">রিট্রাই ({o.attempts})</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          {o.status === "syncing" ? "সিঙ্ক হচ্ছে" : "অপেক্ষমান"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {o.lastError && (
                    <p className="mt-1 truncate text-[11px] text-rose-600">{o.lastError}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div>
          <h2 className="mb-2 text-sm font-semibold">{t("m.sync.logsTitle")}</h2>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !logs?.length ? (
            <Card className="p-4 text-center text-xs text-muted-foreground">{t("m.common.noData")}</Card>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <Card key={l.id} className="p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {l.succeeded}/{l.batch_size} সিঙ্ক হয়েছে
                      {l.failed > 0 && <span className="ml-1 text-destructive">· {l.failed} ব্যর্থ</span>}
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
    </PhoneShell>
  );
}
