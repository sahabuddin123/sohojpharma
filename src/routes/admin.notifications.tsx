import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listAdminNotifications,
  markAdminNotificationsRead,
  markAllAdminNotificationsRead,
  archiveAdminNotifications,
  deleteAdminNotifications,
  type AdminNotificationItem,
  type AdminNotificationSeverity,
} from "@/lib/api/admin-notifications.functions";
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

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "SaaS Notifications — SohojPharma" },
      {
        name: "description",
        content:
          "SaaS admin notification center: registrations, approvals, subscriptions, payments, audits.",
      },
    ],
  }),
  component: AdminNotificationCenter,
});

type Status = "all" | "unread" | "read" | "archived";
type Severity = "all" | AdminNotificationSeverity;

const severityTone: Record<AdminNotificationSeverity, string> = {
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function AdminNotificationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [status, setStatus] = useState<Status>("all");
  const [severity, setSeverity] = useState<Severity>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pageSize = 20;

  const list = useServerFn(listAdminNotifications);
  const markRead = useServerFn(markAdminNotificationsRead);
  const markAll = useServerFn(markAllAdminNotificationsRead);
  const archive = useServerFn(archiveAdminNotifications);
  const del = useServerFn(deleteAdminNotifications);

  const queryKey = useMemo(
    () => ["admin-notification-center", status, severity, from, to, page] as const,
    [status, severity, from, to, page],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => list({ data: {
      status,
      severity,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      page,
      page_size: pageSize,
    } }),
    refetchInterval: 30000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-notification-center"] });

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
    mutationFn: () => markAll(),
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

  const open = (n: AdminNotificationItem) => {
    if (!n.read) markMut.mutate([n.id]);
    if (n.link) navigate({ to: n.link as never }).catch(() => {});
  };

  const selectedIds = Array.from(selected);

  return (
    <AppShell variant="admin" title={t("topbar.notifications", "Notifications")}>
      <div className="container mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary"><Bell className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-semibold">SaaS Admin Notifications</h1>
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
                  <SelectItem value="all">All active</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Severity</label>
              <Select value={severity} onValueChange={(v) => { setSeverity(v as Severity); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </div>
          </CardContent>
        </Card>

        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <div>{selectedIds.length} selected</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => markMut.mutate(selectedIds)}>
                <Check className="mr-1.5 h-4 w-4" /> Mark read
              </Button>
              <Button variant="outline" size="sm" onClick={() => archiveMut.mutate(selectedIds)}>
                <Archive className="mr-1.5 h-4 w-4" /> Archive
              </Button>
              <Button variant="outline" size="sm" onClick={() => deleteMut.mutate(selectedIds)}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8" />
                No notifications.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                <li className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
                  <Checkbox checked={selected.size === items.length && items.length > 0} onCheckedChange={toggleAll} />
                  <span>Select all on page</span>
                </li>
                {items.map((n) => (
                  <li key={n.id} className={`flex gap-3 px-4 py-3 hover:bg-muted/30 ${!n.read ? "bg-primary/5" : ""}`}>
                    <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggle(n.id)} />
                    <button onClick={() => open(n)} className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={severityTone[n.severity]}>{n.severity}</Badge>
                        <span className="text-xs text-muted-foreground">{n.type}</span>
                        {!n.read && <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
                      </div>
                      <div className="mt-1 text-sm font-medium">{n.title}</div>
                      {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>Page {page} of {totalPages} · {total} total</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
