import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/staff", k: "sections.tabs.dashboard", exact: true as const },
  { to: "/staff/list", k: "sections.tabs.employees" },
  { to: "/staff/roles", k: "sections.tabs.rolesPerms" },
  { to: "/staff/attendance", k: "sections.tabs.attendance" },
  { to: "/staff/leave", k: "sections.tabs.leave" },
  { to: "/staff/shifts", k: "sections.tabs.shifts" },
  { to: "/staff/payroll", k: "sections.tabs.payroll" },
  { to: "/staff/performance", k: "sections.tabs.performance" },
  { to: "/staff/activity", k: "sections.tabs.activity" },
  { to: "/staff/security", k: "sections.tabs.security" },
] as const;

export const Route = createFileRoute("/staff")({
  component: StaffLayout,
});

function StaffLayout() {
  const { t } = useTranslation();
  return (
    <AppShell variant="store" title={t("nav.staff")}>
      <div className="-mx-4 -mt-2 mb-4 flex gap-1 overflow-x-auto border-b border-border/60 px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: "exact" in tab ? tab.exact : false }}
            className={cn("shrink-0 whitespace-nowrap rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground")}
            activeProps={{ className: "border-primary text-foreground" }}
          >
            {t(tab.k)}
          </Link>
        ))}
      </div>
      <Outlet />
    </AppShell>
  );
}
