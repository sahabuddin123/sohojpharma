import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, PieChart, FileBarChart2, Crown, ChevronLeft, HelpCircle, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { SupportTicketDialog } from "./support-ticket-dialog";

const tabs: Array<{ to: string; label: string; icon: typeof Home; exact?: boolean }> = [
  { to: "/m", label: "হোম", icon: Home, exact: true },
  { to: "/m/analytics", label: "অ্যানালিটিক্স", icon: PieChart },
  { to: "/m/report", label: "রিপোর্ট", icon: FileBarChart2 },
  { to: "/m/subscription", label: "প্ল্যান", icon: Crown },
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
    <header className="sticky top-0 z-30 mx-auto max-w-md sm:max-w-3xl">
      <div className="rounded-b-[22px] bg-gradient-to-r from-[#094735] via-[#0d5c46] to-[#0f766e] text-white shadow-[0_6px_20px_rgba(9,71,53,0.18)]">
        <div className="h-[env(safe-area-inset-top)]" />
        <div className="flex min-h-14 items-center gap-3 px-4 py-3">
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
                ফার্মেসি ওনার পোর্টাল
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {help ?? (
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                aria-label="সাপোর্ট টিকেট"
                title="সাপোর্ট টিকেট"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-md active:scale-95 transition-transform hover:bg-white/20"
              >
                <HelpCircle className="h-4.5 w-4.5" />
              </button>
            )}
            <Link
              to={"/m/settings" as never}
              aria-label="সেটিংস ও প্রোফাইল"
              title="সেটিংস ও প্রোফাইল"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-md active:scale-95 transition-transform hover:bg-white/20"
            >
              <Settings className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </div>
      <SupportTicketDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </header>
  );
}


export function PhoneTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))]">
      <ul className="pointer-events-auto grid grid-cols-4 items-center rounded-2xl border border-slate-200/80 bg-white/92 p-1.5 shadow-[0_8px_30px_rgba(13,92,70,0.14)] backdrop-blur-xl">
        {tabs.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <li key={to} className="flex justify-center">
              <Link
                to={to as never}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 transition-all active:scale-95",
                  active
                    ? "bg-gradient-to-r from-[#094735] to-[#0d5c46] text-white shadow-[0_4px_12px_rgba(13,92,70,0.28)]"
                    : "text-slate-500 hover:text-slate-800",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("h-4.5 w-4.5", active ? "stroke-[2.3]" : "stroke-[1.9]")} />
                <span className={cn("text-[10px] font-bold tracking-tight", active ? "text-white" : "text-slate-500")}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
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
