import {
  Bell,
  Menu,
  Moon,
  Search,
  Sun,
  Building2,
  Check,
  LogOut,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
  ClipboardList,
  User as UserIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
} from "@/lib/api/notifications.functions";
import {
  getAdminNotificationsSummary,
  markAdminNotificationsRead,
  markAllAdminNotificationsRead,
} from "@/lib/api/admin-notifications.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useUIStore } from "@/stores/ui-store";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useNotificationsRealtime } from "@/hooks/use-notifications-realtime";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { BranchSwitcher } from "@/components/layout/branch-switcher";

interface TopbarProps {
  onMenuClick?: () => void;
  onCollapseToggle?: () => void;
  collapsed?: boolean;
  title?: string;
}

function humanize(segment: string) {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Topbar({ onMenuClick, onCollapseToggle, collapsed, title }: TopbarProps) {
  const { t } = useTranslation();
  const { theme, toggleTheme, desktopUiVersion } = useUIStore();
  const isV2 = desktopUiVersion === "v2";
  const { user, memberships, adminTenants, impersonating, currentTenantId, setCurrentTenantId, signOut, isAppAdmin } = useAuth();
  const availableTenants = isAppAdmin ? adminTenants : memberships;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts.map((seg, i) => ({
      label: humanize(seg),
      href: "/" + parts.slice(0, i + 1).join("/"),
    }));
  }, [pathname]);

  const currentTenant = availableTenants.find((m) => m.tenant_id === currentTenantId)?.tenants;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta.display_name as string | undefined) ||
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    (isAppAdmin ? "Super Admin" : undefined) ||
    (user?.email ? user.email.split("@")[0] : t("topbar.account"));
  const roleLabel = isAppAdmin
    ? t("topbar.roleSuperAdmin", "Super Admin")
    : currentTenant?.name ?? "";
  const initials = (displayName || user?.email || "PC")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true, search: { redirect: undefined, blocked: undefined } });
  };

  // Live notifications — admin vs tenant routes are isolated
  const qc = useQueryClient();
  const fetchNotif = useServerFn(getNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const fetchAdminNotif = useServerFn(getAdminNotificationsSummary);
  const markAdminRead = useServerFn(markAdminNotificationsRead);
  const markAllAdmin = useServerFn(markAllAdminNotificationsRead);

  useNotificationsRealtime(isAppAdmin ? null : currentTenantId);

  const tenantQ = useQuery({
    enabled: !isAppAdmin && !!currentTenantId,
    queryKey: ["topbar-notifications", currentTenantId],
    queryFn: () => fetchNotif({ data: { tenant_id: currentTenantId! } }),
    refetchOnWindowFocus: true,
  });
  const adminQ = useQuery({
    enabled: !!isAppAdmin,
    queryKey: ["topbar-admin-notifications"],
    queryFn: () => fetchAdminNotif(),
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
  const notifData = isAppAdmin ? adminQ.data : tenantQ.data;
  const unreadCount = notifData?.unread ?? 0;
  const notifItems = notifData?.items ?? [];

  const invalidateNotif = () =>
    isAppAdmin
      ? qc.invalidateQueries({ queryKey: ["topbar-admin-notifications"] })
      : qc.invalidateQueries({ queryKey: ["topbar-notifications", currentTenantId] });

  const markOneMut = useMutation({
    mutationFn: (id: string) =>
      isAppAdmin
        ? markAdminRead({ data: { ids: [id] } })
        : markRead({ data: { ids: [id] } }),
    onSuccess: invalidateNotif,
  });
  const markAllMut = useMutation({
    mutationFn: () =>
      isAppAdmin
        ? markAllAdmin()
        : markAll({ data: { tenant_id: currentTenantId! } }),
    onSuccess: invalidateNotif,
  });

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-xl",
        isV2
          ? "border-white/60 bg-white/40 dark:border-white/10 dark:bg-[#0b181c]/60"
          : "border-border bg-card/85 supports-[backdrop-filter]:bg-card/70",
      )}
    >
      <div className="flex h-14 items-center gap-1 px-2 sm:h-16 sm:gap-2 sm:px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label={t("topbar.openMenu")}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {onCollapseToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={onCollapseToggle}
            aria-label={collapsed ? t("topbar.expandSidebar") : t("topbar.collapseSidebar")}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
        )}

        {/* Mobile page title */}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground md:hidden">
          {crumbs.length ? crumbs[crumbs.length - 1]!.label : (title ?? t("nav.dashboard"))}
        </span>

        {/* Breadcrumbs */}
        <nav aria-label={t("topbar.breadcrumb")} className="hidden min-w-0 shrink items-center overflow-hidden md:flex">
          <ol className="flex items-center gap-1.5 text-sm">
            {crumbs.length === 0 ? (
              <li className="font-semibold text-foreground">{title ?? t("nav.dashboard")}</li>
            ) : (
              crumbs.map((c, i) => (
                <li key={c.href} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  )}
                  {i === crumbs.length - 1 ? (
                    <span className="truncate font-semibold text-foreground">{c.label}</span>
                  ) : (
                    <Link
                      to={c.href as never}
                      className="truncate text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {c.label}
                    </Link>
                  )}
                </li>
              ))
            )}
          </ol>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Global search */}
          <div className="relative hidden w-44 2xl:w-64 xl:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("common.search")}
              className="h-9 rounded-xl border-border/70 bg-muted/40 pl-9 text-sm focus-visible:bg-card"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 items-center rounded border border-border bg-card px-1.5 text-[10px] font-medium text-muted-foreground 2xl:inline-flex">
              ⌘K
            </kbd>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex xl:hidden"
            aria-label={t("common.search")}
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Pharmacy switcher — also used by app admins for tenant impersonation */}
          {availableTenants.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden h-9 gap-2 rounded-xl border-border/70 md:flex"
                >
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="max-w-[100px] lg:max-w-[140px] truncate text-xs font-semibold">
                    {currentTenant?.name ?? t("common.tenant")}
                  </span>
                  {impersonating && (
                    <Badge variant="outline" className="ml-1 h-5 border-amber-500 px-1.5 text-[10px] font-bold text-amber-600">
                      IMPERSONATING
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-96 w-64 overflow-y-auto rounded-xl">
                <DropdownMenuLabel>
                  {isAppAdmin ? "Impersonate Tenant" : t("common.switchTenant")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableTenants.map((m) => (
                  <DropdownMenuItem
                    key={m.tenant_id}
                    onClick={() => {
                      setCurrentTenantId(m.tenant_id);
                      qc.invalidateQueries();
                    }}
                  >
                    <span className="flex-1 truncate">{m.tenants?.name}</span>
                    {m.tenant_id === currentTenantId && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Branch switcher — hidden for SaaS admins */}
          {!isAppAdmin && <BranchSwitcher />}

          {/* POS quick launch — hidden for SaaS admins (icon-only on phones) */}
          {!isAppAdmin && (
            <Button
              asChild
              size="sm"
              className="h-9 gap-1.5 rounded-xl bg-primary px-2 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:px-3"
              aria-label={t("topbar.launchPosAria")}
            >
              <Link to={"/sales/pos" as never}>
                <ShoppingCart className="h-4 w-4" />
                <span className="hidden sm:inline">{t("topbar.launchPos")}</span>
              </Link>
            </Button>
          )}

          {/* Purchase Requisition quick launch — hidden for SaaS admins */}
          {!isAppAdmin && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="hidden h-9 gap-1.5 rounded-xl border-slate-200 bg-white px-3 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 lg:flex"
              aria-label="Open Purchase Requisition"
            >
              <Link to={"/purchase-requisition" as never}>
                <ClipboardList className="h-4 w-4 text-[#0d5c46]" />
                <span className="hidden lg:inline">Purchase Requisition</span>
              </Link>
            </Button>
          )}

          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={t("topbar.toggleTheme")}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label={t("topbar.notifications")}>
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <Badge className="absolute right-1 top-1 h-4 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 rounded-xl">
              <DropdownMenuLabel className="flex items-center justify-between gap-2">
                <span>{t("topbar.notifications")}</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-primary hover:underline"
                    onClick={() => markAllMut.mutate()}
                  >
                    {t("topbar.markAllRead")}
                  </button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifItems.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("topbar.noNotifications")}
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto py-1">
                  {notifItems.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className="flex flex-col items-start gap-0.5 rounded-lg py-2"
                      onClick={() => { if (!n.read) markOneMut.mutate(n.id); if (n.link) navigate({ to: n.link as never }); }}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className={`truncate text-sm ${n.read ? "font-normal text-muted-foreground" : "font-medium"}`}>
                          {n.title}
                        </span>
                        {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      {n.body && (
                        <span className="line-clamp-1 text-xs text-muted-foreground">{n.body}</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: (isAppAdmin ? "/admin/notifications" : "/notifications") as never })} className="justify-center text-sm font-medium text-primary">
                {t("topbar.viewAll", "View all notifications")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 gap-2 rounded-xl pl-1 pr-2"
                aria-label={t("topbar.accountMenu")}
              >
                <Avatar className="h-7 w-7 overflow-hidden">
                  {typeof meta.avatar_url === "string" && meta.avatar_url ? (
                    <img
                      src={meta.avatar_url}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="hidden max-w-[150px] flex-col items-start leading-tight xl:flex">
                  <span className="truncate text-sm font-medium">{displayName}</span>
                  {roleLabel && (
                    <span className="truncate text-[10px] text-muted-foreground">{roleLabel}</span>
                  )}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/admin/profile" as never })}>
                <UserIcon className="mr-2 h-4 w-4" /> {t("topbar.profile")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/settings" as never })}>
                <Settings className="mr-2 h-4 w-4" /> {t("nav.settings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" /> {t("auth.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

