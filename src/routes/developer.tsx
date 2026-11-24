import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/developer", k: "sections.tabs.overview", exact: true },
  { to: "/developer/keys", k: "sections.tabs.apiKeys" },
  { to: "/developer/docs", k: "sections.tabs.apiDocs" },
  { to: "/developer/webhooks", k: "sections.tabs.webhooks" },
  { to: "/developer/analytics", k: "sections.tabs.analytics" },
];

export const Route = createFileRoute("/developer")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Developer Portal — SohojPharma" },
      { name: "description", content: "API keys, docs, webhooks and analytics for SohojPharma integrations." },
    ],
  }),
  component: DeveloperLayout,
});

function DeveloperLayout() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <AppShell variant="store" title={t("sections.developer.title")}>
      <PageHeader title={t("sections.developer.title")} description={t("sections.developer.desc")} />
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
