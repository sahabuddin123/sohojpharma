import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  PieChart,
  FileBarChart2,
  Crown,
  ChevronLeft,
  HelpCircle,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { countPending, subscribe as subscribeOutbox } from "@/lib/offline/db";
import { subscribeSync, flushNow, type SyncState } from "@/lib/offline/sync";
import { setAppLanguage } from "@/i18n";
import { useUIStore } from "@/stores/ui-store";
import { SupportTicketDialog } from "./support-ticket-dialog";

const tabs: Array<{ to: string; key: string; icon: typeof Home; exact?: boolean }> = [
  { to: "/m", key: "m.shell.tabHome", icon: Home, exact: true },
  { to: "/m/analytics", key: "m.shell.tabAnalytics", icon: PieChart },
  { to: "/m/report", key: "m.shell.tabReports", icon: FileBarChart2 },
  { to: "/m/subscription", key: "m.shell.tabPlan", icon: Crown },
];

export function PhoneHeader({
  title,
  back,
  help,
}: {
  title?: string;
  back?: boolean;
  help?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { memberships, currentTenantId, user } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);

  const currentLang = (i18n.resolvedLanguage ?? i18n.language) === "en" ? "en" : "bn";
  const nextLang = currentLang === "bn" ? "en" : "bn";

  const meta = (user?.user_metadata ?? {}) as { full_name?: string; avatar_url?: string };
  const avatarUrl = meta.avatar_url;
  const displayName = meta.full_name || user?.email || t("m.common.userFallback");
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U";
  const tenantName =
    memberships.find((m) => m.tenant_id === currentTenantId)?.tenants?.name ?? "SohojPharma";

  const handleToggleLanguage = async () => {
    await setAppLanguage(nextLang);
    useUIStore.setState({ language: nextLang });
  };

  return (
    <header className="sticky top-0 z-30 mx-auto max-w-md sm:max-w-3xl">
      <div className="rounded-b-[22px] bg-gradient-to-r from-[#094735] via-[#0d5c46] to-[#0f766e] text-white shadow-[0_6px_20px_rgba(9,71,53,0.18)]">
        <div className="h-[env(safe-area-inset-top)]" />
        <div className="flex min-h-14 items-center gap-2.5 px-4 py-3">
          {back ? (
            <Link
              to="/m"
              aria-label="Back"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-md active:scale-95 transition-transform"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-xs font-black tracking-tight text-white ring-1 ring-white/25 backdrop-blur-md">
              {tenantName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-extrabold leading-tight tracking-tight text-white">
              {title ?? tenantName}
            </p>
            {!title && (
              <p className="mt-0.5 truncate text-[11px] font-medium text-emerald-100/85">
                {t("m.shell.portalSubtitle")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleToggleLanguage()}
              aria-label={currentLang === "bn" ? "Switch to English" : "বাংলায় পরিবর্তন করুন"}
              title={currentLang === "bn" ? "Switch to English" : "বাংলায় পরিবর্তন করুন"}
              className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-white/15 px-2 text-[11px] font-extrabold tracking-tight text-white ring-1 ring-white/25 backdrop-blur-md active:scale-95 transition-transform hover:bg-white/25"
            >
              {currentLang === "bn" ? "EN" : "বাং"}
            </button>
            {help ?? (
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                aria-label={t("m.shell.supportTitle")}
                title={t("m.shell.supportTitle")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-md active:scale-95 transition-transform hover:bg-white/20"
              >
                <HelpCircle className="h-4.5 w-4.5" />
              </button>
            )}
            <Link
              to={"/m/settings" as never}
              aria-label={t("m.shell.profileTitle")}
              title={t("m.shell.profileTitle")}
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/20 text-xs font-extrabold tracking-wide text-white ring-2 ring-white/45 shadow-sm backdrop-blur-md active:scale-95 transition-transform hover:bg-white/30"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </Link>
          </div>
        </div>
      </div>
      <SupportTicketDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </header>
  );
}

export function PhoneTabBar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname.startsWith(to);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:max-w-3xl">
      <ul className="phone-grid-keep grid grid-cols-4 items-center gap-1 rounded-[22px] border border-border/80 bg-card/95 p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.to, tab.exact);
          return (
            <li key={tab.to}>
              <Link
                to={tab.to as never}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.75} />
                <span>{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function PhoneOfflineBanner() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(0);
  const [sync, setSync] = useState<SyncState>({ online: true, syncing: false, lastRunAt: null, lastError: null });

  useEffect(() => {
    const refresh = () => {
      void countPending().then(setPending);
    };
    refresh();
    const u1 = subscribeOutbox(refresh);
    const u2 = subscribeSync(setSync);
    return () => {
      u1();
      u2();
    };
  }, []);

  if (sync.online && pending === 0) return null;

  return (
    <div className="mx-auto max-w-md px-4 pt-2.5">
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
          !sync.online
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-sky-200 bg-sky-50 text-sky-900",
        )}
      >
        <Link to={"/m/sync" as never} className="flex min-w-0 flex-1 items-center gap-2">
          {!sync.online ? (
            <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          ) : (
            <RefreshCw className={cn("h-3.5 w-3.5 shrink-0 text-sky-600", sync.syncing && "animate-spin")} />
          )}
          <span className="truncate">
            {!sync.online
              ? pending > 0
                ? t("m.shell.offlinePending", { count: pending })
                : t("m.shell.offlineLocal")
              : sync.syncing
                ? t("m.shell.syncingQueue", { count: pending })
                : t("m.shell.pendingQueue", { count: pending })}
          </span>
        </Link>
        {sync.online && pending > 0 && (
          <button
            type="button"
            onClick={() => void flushNow()}
            disabled={sync.syncing}
            className="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-[#0d5c46] shadow-xs"
          >
            {t("m.common.sync")}
          </button>
        )}
      </div>
    </div>
  );
}

export function PhoneShell({
  children,
  title,
  back,
  help,
  contentClassName,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  help?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="min-h-screen bg-[color-mix(in_oklab,var(--color-primary)_5%,var(--color-background))]">
      <PhoneHeader title={title} back={back} help={help} />
      <PhoneOfflineBanner />
      <main className={cn("mx-auto max-w-md px-4 pb-32 pt-4", contentClassName)}>{children}</main>

      <PhoneTabBar />
    </div>
  );
}
