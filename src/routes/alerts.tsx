// Phase 10.10 — Smart Alerts center + settings
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getAlertSettings, updateAlertSettings } from "@/lib/alerts.functions";
import { listMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api/notifications.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Check, AlertTriangle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Smart Alerts — SohojPharma" },
      { name: "description", content: "Low-stock, expiry and due-payment alerts with configurable thresholds." },
    ],
  }),
  component: AlertsPage,
});

const parseDays = (s: string) =>
  s.split(",").map((p) => parseInt(p.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);

function AlertsPage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const getSettings = useServerFn(getAlertSettings);
  const saveSettings = useServerFn(updateAlertSettings);
  const listNotif = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);

  const { data: settings } = useQuery({
    enabled: !!currentTenantId,
    queryKey: ["alert-settings", currentTenantId],
    queryFn: () => getSettings({ data: { tenant_id: currentTenantId! } }),
  });

  const { data: notifs } = useQuery({
    enabled: !!currentTenantId,
    queryKey: ["alerts-feed", currentTenantId],
    queryFn: () => listNotif({ data: { tenant_id: currentTenantId!, unread_only: false, limit: 100 } }),
  });

  const [lowStock, setLowStock] = useState(true);
  const [expiryOn, setExpiryOn] = useState(true);
  const [expiryDays, setExpiryDays] = useState("90, 60, 30, 7");
  const [dueOn, setDueOn] = useState(true);
  const [dueDays, setDueDays] = useState("7, 3, 1");

  useEffect(() => {
    if (!settings) return;
    setLowStock(settings.low_stock_enabled);
    setExpiryOn(settings.expiry_enabled);
    setExpiryDays((settings.expiry_days ?? []).join(", "));
    setDueOn(settings.due_reminder_enabled);
    setDueDays((settings.due_reminder_days ?? []).join(", "));
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          tenant_id: currentTenantId!,
          low_stock_enabled: lowStock,
          expiry_enabled: expiryOn,
          expiry_days: parseDays(expiryDays),
          due_reminder_enabled: dueOn,
          due_reminder_days: parseDays(dueDays),
        },
      }),
    onSuccess: () => {
      toast.success(t("toast.alertSettingsSaved"));
      qc.invalidateQueries({ queryKey: ["alert-settings", currentTenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts-feed", currentTenantId] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => markAll({ data: { tenant_id: currentTenantId! } }),
    onSuccess: () => {
      toast.success(t("toast.allMarkedRead"));
      qc.invalidateQueries({ queryKey: ["alerts-feed", currentTenantId] });
    },
  });

  const unread = (notifs ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Smart Alerts
          </h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "All caught up"} · low-stock, expiry and overdue dues.
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllMut.mutate()}>
            <Check className="h-4 w-4 mr-2" /> Mark all read
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent alerts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!notifs?.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center flex flex-col items-center gap-2">
                <BellOff className="h-8 w-8 opacity-50" />
                No alerts yet.
              </p>
            ) : (
              notifs.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    n.read_at ? "bg-muted/30" : "bg-background"
                  }`}
                >
                  <div className="mt-0.5">
                    {n.type === "critical" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{n.title}</span>
                      <Badge variant="outline" className="text-[10px]">{n.type}</Badge>
                    </div>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!n.read_at && (
                    <Button size="sm" variant="ghost" onClick={() => markReadMut.mutate(n.id)}>
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Settings</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">Low stock alerts</Label>
              <Switch checked={lowStock} onCheckedChange={setLowStock} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Expiry alerts</Label>
                <Switch checked={expiryOn} onCheckedChange={setExpiryOn} />
              </div>
              <Input
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                placeholder="90, 60, 30, 7"
                disabled={!expiryOn}
              />
              <p className="text-[11px] text-muted-foreground">Days before expiry (comma-separated).</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Due payment reminders</Label>
                <Switch checked={dueOn} onCheckedChange={setDueOn} />
              </div>
              <Input
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
                placeholder="7, 3, 1"
                disabled={!dueOn}
              />
              <p className="text-[11px] text-muted-foreground">Days before due date.</p>
            </div>

            <Button
              className="w-full"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : "Save settings"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
