import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listNotificationCenter,
  markNotificationsRead,
  markAllNotificationsRead,
  archiveNotifications,
  deleteNotifications,
  type NotificationItem,
  type NotificationSeverity,
} from "@/lib/api/notifications.functions";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationsRealtime } from "@/hooks/use-notifications-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Archive, Bell, Check, ChevronLeft, ChevronRight, Inbox, Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/notifications")({
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("is_app_admin", {
      _user_id: userRes.user.id,
    });
    if (isAdmin) throw redirect({ to: "/admin/notifications" });
  },
  head: () => ({
    meta: [
      { title: "Notifications — SohojPharma" },
      { name: "description", content: "Realtime notification center: inventory, procurement, sales, accounting, and system events." },
    ],
  }),
  component: () => <NotificationCenter variant="store" />,
});

export { NotificationCenter };

type Status = "all" | "unread" | "read" | "archived";
type Severity = "all" | NotificationSeverity;

const severityTone: Record<NotificationSeverity, string> = {
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function NotificationCenter({ variant = "store" }: { variant?: "admin" | "store" } = {}) {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useNotificationsRealtime(currentTenantId);

  const [status, setStatus] = useState<Status>("all");
  const [severity, setSeverity] = useState<Severity>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pageSize = 20;

  const list = useServerFn(listNotificationCenter);
  const markRead = useServerFn(markNotificationsRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const archive = useServerFn(archiveNotifications);
  const del = useServerFn(deleteNotifications);

  const queryKey = useMemo(
    () => ["notification-center", currentTenantId, status, severity, from, to, page] as const,
    [currentTenantId, status, severity, from, to, page],
  );

  const { data, isLoading } = useQuery({
    enabled: !!currentTenantId,
    queryKey,
    queryFn: () => list({ data: {
      tenant_id: currentTenantId!,
      status,
      severity,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      page,
      page_size: pageSize,
    } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notification-center", currentTenantId] });

  const markMut = useMutation({
    mutationFn: (ids: string[]) => markRead({ data: { ids } }),
    onSuccess: () => { invalidate(); setSelected(new Set()); },
  });
  const archiveMut = useMutation({
    mutationFn: (ids: string[]) => archive({ data: { ids } }),
    onSuccess: () => { invalidate(); setSelected(new Set()); toast.success(t("notifications.archived", "Archived")); },
  });
  const deleteMut = useMutation({
    mutationFn: (ids: string[]) => del({ data: { ids } }),
    onSuccess: () => { invalidate(); setSelected(new Set()); toast.success(t("notifications.deleted", "Deleted")); },
  });
  const markAllMut = useMutation({
    mutationFn: () => markAll({ data: { tenant_id: currentTenantId! } }),
    onSuccess: invalidate,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)));
  };

  const open = (n: NotificationItem) => {
    if (!n.read) markMut.mutate([n.id]);
    if (n.link) navigate({ to: n.link as never }).catch(() => {});
  };

  const selectedIds = Array.from(selected);

  return (
    <AppShell variant={variant} title={t("topbar.notifications", "Notifications")}>
      <div className="container mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><Bell className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-semibold">{t("notifications.title", "Notifications")}</h1>
            <p className="text-sm text-muted-foreground">
              {data?.unread ?? 0} {t("notifications.unread", "unread")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => markAllMut.mutate()} disabled={!data?.unread}>
            <Check className="mr-1.5 h-4 w-4" /> {t("topbar.markAllRead", "Mark all read")}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t("common.filters", "Filters")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("notifications.status", "Status")}</label>
            <Select value={status} onValueChange={(v) => { setStatus(v as Status); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("notifications.all", "All active")}</SelectItem>
                <SelectItem value="unread">{t("notifications.unread", "Unread")}</SelectItem>
                <SelectItem value="read">{t("notifications.read", "Read")}</SelectItem>
                <SelectItem value="archived">{t("notifications.archived", "Archived")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("notifications.severity", "Type")}</label>
            <Select value={severity} onValueChange={(v) => { setSeverity(v as Severity); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("notifications.all", "All")}</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("common.from", "From")}</label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("common.to", "To")}</label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={items.length > 0 && selected.size === items.length}
              onCheckedChange={toggleAll}
              aria-label="Select all"
            />
            <span className="text-sm text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} ${t("common.selected", "selected")}`
                : `${total} ${t("notifications.results", "results")}`}
            </span>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => markMut.mutate(selectedIds)}>
                <Check className="mr-1.5 h-4 w-4" /> {t("notifications.markRead", "Mark read")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => archiveMut.mutate(selectedIds)}>
                <Archive className="mr-1.5 h-4 w-4" /> {t("notifications.archive", "Archive")}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteMut.mutate(selectedIds)}>
                <Trash2 className="mr-1.5 h-4 w-4" /> {t("common.delete", "Delete")}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("common.loading", "Loading...")}</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">{t("notifications.empty", "No notifications match your filters.")}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 transition hover:bg-muted/40 ${
                    !n.read ? "bg-primary/[0.03]" : ""
                  }`}
                >
                  <Checkbox
                    checked={selected.has(n.id)}
                    onCheckedChange={() => toggle(n.id)}
                    aria-label="Select"
                    className="mt-1"
                  />
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className="flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`${severityTone[n.severity]} border-0 px-2 py-0 text-[10px] uppercase`}>
                        {n.severity}
                      </Badge>
                      <span className={`text-sm ${n.read ? "text-muted-foreground" : "font-medium"}`}>
                        {n.title}
                      </span>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    {n.body && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      {new Date(n.created_at).toLocaleString()} · {n.type}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t("common.page", "Page")} {page} / {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
