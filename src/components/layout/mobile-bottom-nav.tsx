import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutDashboard, Package, BarChart3, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const items: Array<{ to: string; key: string; icon: typeof Home; fa: string; exact?: boolean }> = [
  { to: "/", key: "mobileNav.home", icon: Home, fa: "fa-house", exact: true },
  { to: "/store", key: "mobileNav.dashboard", icon: LayoutDashboard, fa: "fa-table-cells-large" },
  { to: "/products", key: "mobileNav.products", icon: Package, fa: "fa-pills" },
  { to: "/reports", key: "mobileNav.reports", icon: BarChart3, fa: "fa-chart-pie" },
  { to: "/settings", key: "mobileNav.profile", icon: User, fa: "fa-user" },
];

export function MobileBottomNav() {
  const { t } = useTranslation();
  const isV2 = useUIStore((s) => s.desktopUiVersion === "v2");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t lg:hidden",
        isV2
          ? "sp-v2-sidebar border-white/60 dark:border-white/10"
          : "border-border bg-card/95 backdrop-blur",
      )}
    >
      <ul className="grid grid-cols-[repeat(5,minmax(0,1fr))]">
        {items.map(({ to, key, icon: Icon, fa, exact }) => {
          const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to}>
              <Link
                to={to as never}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  isV2
                    ? active
                      ? "font-semibold text-[#0d8590] dark:text-teal-300"
                      : "text-slate-600 dark:text-slate-300"
                    : active
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              >
                {isV2 ? (
                  <i className={cn("fa-solid text-base", fa)} />
                ) : (
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                )}
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
