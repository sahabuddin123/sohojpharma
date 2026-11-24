import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Package, CalendarX, CreditCard, UserPlus, Bell, Check, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/ops/")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: NotificationsPage });

type Notif = { id: string; icon: LucideIcon; tone: string; title: string; body: string; time: string; read: boolean };

const seed: Notif[] = [
  { id: "1", icon: AlertTriangle, tone: "text-orange-600 bg-orange-500/10", title: "Low stock", body: "27 items are below MIN level.", time: "5m ago", read: false },
  { id: "2", icon: Package, tone: "text-rose-600 bg-rose-500/10", title: "Out of stock", body: "Napa Extra 500mg is out of stock.", time: "1h ago", read: false },
  { id: "3", icon: CalendarX, tone: "text-amber-600 bg-amber-500/10", title: "Expiry alert", body: "9 medicines expire within 30 days.", time: "3h ago", read: false },
  { id: "4", icon: CreditCard, tone: "text-emerald-600 bg-emerald-500/10", title: "New payment", body: "Customer Rahim paid ৳ 2,400.", time: "Yesterday", read: true },
  { id: "5", icon: UserPlus, tone: "text-blue-600 bg-blue-500/10", title: "New staff request", body: "Karim requested leave on 18 Jun.", time: "Yesterday", read: true },
  { id: "6", icon: Bell, tone: "text-violet-600 bg-violet-500/10", title: "Subscription expiring", body: "Your plan expires in 7 days.", time: "2 days ago", read: true },
];

function NotificationsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState(seed);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const unread = items.filter((i) => !i.read).length;
  const view = filter === "unread" ? items.filter((i) => !i.read) : items;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("sections.ops.notifCenter")}</h2>
          <p className="text-sm text-muted-foreground">{t("sections.ops.unread", { n: unread })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border bg-card p-0.5 text-xs">
            {(["all", "unread"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {f === "all" ? t("sections.ops.all") : t("sections.ops.unreadFilter")}
              </button>
            ))}
          </div>
          <button onClick={() => setItems((xs) => xs.map((x) => ({ ...x, read: true })))} className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted">{t("sections.ops.markAllRead")}</button>
        </div>
      </div>

      <ul className="divide-y rounded-2xl border bg-card">
        {view.map((n) => (
          <li key={n.id} className={`flex items-start gap-3 p-4 ${n.read ? "opacity-70" : ""}`}>
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${n.tone}`}><n.icon className="h-4 w-4" /></span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <p className="text-sm text-muted-foreground">{n.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
            </div>
            {!n.read && (
              <button onClick={() => setItems((xs) => xs.map((x) => x.id === n.id ? { ...x, read: true } : x))} className="rounded-md p-1.5 hover:bg-muted" aria-label={t("sections.ops.markRead")}>
                <Check className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </li>
        ))}
        {view.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">{t("sections.ops.allCaught")}</li>}
      </ul>
    </div>
  );
}
