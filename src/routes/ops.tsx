import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/ops", k: "sections.tabs.notifications", exact: true },
  { to: "/ops/audit", k: "sections.tabs.audit" },
  { to: "/ops/security", k: "sections.tabs.security" },
  { to: "/ops/health", k: "sections.tabs.systemHealth" },
  { to: "/ops/backup", k: "sections.tabs.backup" },
  { to: "/ops/automation", k: "sections.tabs.automation" },
  { to: "/ops/reminders", k: "sections.tabs.reminders" },
  { to: "/ops/sharing", k: "sections.tabs.sharing" },
];

export const Route = createFileRoute("/ops")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Operations Center — SohojPharma" },
      { name: "description", content: "Notifications, audit log, security, backup, automation and messaging." },
    ],
  }),
  component: OpsLayout,
});

function OpsLayout() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell variant="store" title={t("sections.ops.title")}>
      <PageHeader title={t("sections.ops.title")} description={t("sections.ops.desc")} />
      <nav className="-mt-2 mb-4 flex gap-1 overflow-x-auto border-b border-border/60 pb-0">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "whitespace-nowrap rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tab.k)}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </AppShell>
  );
}
