import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, PieChart, ClipboardList, CloudDownload, ChevronLeft, HelpCircle, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { SupportTicketDialog } from "./support-ticket-dialog";

const tabs: Array<{ to: string; label: string; icon: typeof Home; exact?: boolean }> = [
  { to: "/m", label: "Home", icon: Home, exact: true },
  { to: "/m/analytics", label: "Analytics", icon: PieChart },
  { to: "/m/report", label: "Report", icon: ClipboardList },
  { to: "/m/subscription", label: "Subscription", icon: CloudDownload },
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
  const { memberships, currentTenantId } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);
  const tenantName =
    memberships.find((m) => m.tenant_id === currentTenantId)?.tenants?.name ?? "SohojPharma";

  return (
    <header className="sticky top-0 z-30 bg-brand-gradient text-primary-foreground shadow-[var(--shadow-elevated)]">
      <div className="h-[env(safe-area-inset-top)]" />
      <div className="mx-auto flex min-h-14 max-w-md items-center gap-3 px-4 py-3 sm:max-w-3xl">
        {back ? (
          <Link
            to="/m"
            aria-label="Back"
            className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground active:scale-95 transition-transform"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold leading-tight text-primary-foreground">
            {title ?? tenantName}
          </p>
          {!title && (
            <p className="truncate text-xs text-primary-foreground/80">Pharmacy owner</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {help ?? (
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              aria-label="সাপোর্ট টিকেট"
              title="সাপোর্ট টিকেট"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground active:scale-95 transition-transform"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          )}
          <Link
            to={"/m/settings" as never}
            aria-label="সেটিংস ও প্রোফাইল"
            title="সেটিংস ও প্রোফাইল"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground active:scale-95 transition-transform"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </div>
      <SupportTicketDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </header>
  );
}


export function PhoneTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/95 shadow-[var(--shadow-elevated)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <ul className="mx-auto grid max-w-md grid-cols-[repeat(4,minmax(0,1fr))] px-2 pt-2">
        {tabs.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <li key={to} className="flex justify-center">
              <Link
                to={to as never}
                className="flex flex-col items-center gap-1 pb-2 active:scale-95 transition-transform"
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "grid h-9 w-16 place-items-center rounded-2xl transition-colors",
                    active
                      ? "bg-brand-gradient text-primary-foreground shadow-[var(--shadow-glow)]"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
                </span>
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
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
      <main className={cn("mx-auto max-w-md px-4 pb-32 pt-4", contentClassName)}>{children}</main>

      <PhoneTabBar />
    </div>
  );
}
