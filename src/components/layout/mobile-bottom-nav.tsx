import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutDashboard, Package, BarChart3, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const items: Array<{ to: string; key: string; icon: typeof Home; exact?: boolean }> = [
  { to: "/", key: "mobileNav.home", icon: Home, exact: true },
  { to: "/store", key: "mobileNav.dashboard", icon: LayoutDashboard },
  { to: "/products", key: "mobileNav.products", icon: Package },
  { to: "/reports", key: "mobileNav.reports", icon: BarChart3 },
  { to: "/settings", key: "mobileNav.profile", icon: User },
];

export function MobileBottomNav() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
      <ul className="grid grid-cols-[repeat(5,minmax(0,1fr))]">
        {items.map(({ to, key, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to}>
              <Link
                to={to as never}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
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
