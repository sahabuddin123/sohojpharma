import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone, ShieldOff } from "lucide-react";
import { listMyDevices, revokeDevice } from "@/lib/api/devices.functions";
import { getDeviceId } from "@/lib/offline/device-id";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/m/devices")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
  component: DevicesPage,
});

function DevicesPage() {
  const qc = useQueryClient();
  const currentDeviceId = typeof window !== "undefined" ? getDeviceId() : "";
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["my-devices"],
    queryFn: () => listMyDevices(),
  });

  async function onRevoke(id: string) {
    setBusy(id);
    try {
      await revokeDevice({ data: { id } });
      toast.success("Device revoked");
      await qc.invalidateQueries({ queryKey: ["my-devices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">My devices</h1>
      <p className="text-xs text-muted-foreground">
        Devices bound to your account. Revoke any you don't recognize.
      </p>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !data?.length ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No registered devices yet.</Card>
      ) : (
        <div className="space-y-2">
          {data.map((d) => {
            const isThis = d.device_id === currentDeviceId;
            const revoked = !d.is_active;
            return (
              <Card key={d.id} className="flex items-start justify-between gap-3 p-3">
                <div className="flex items-start gap-3">
                  <Smartphone className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{d.device_name ?? "Device"}</span>
                      {isThis && <Badge variant="outline" className="border-primary/40 text-primary">This device</Badge>}
                      {revoked && <Badge variant="destructive">Revoked</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{d.platform ?? "web"}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      Last seen {new Date(d.last_seen).toLocaleString()}
                    </div>
                  </div>
                </div>
                {!revoked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === d.id}
                    onClick={() => onRevoke(d.id)}
                  >
                    <ShieldOff className="mr-1 h-3.5 w-3.5" />
                    Revoke
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
