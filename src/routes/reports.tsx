import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/reports")({
  component: ReportsLayout,
});

function ReportsLayout() {
  const { t } = useTranslation();

  const tabs = [
    { to: "/reports", label: t("rpt.tabs.executive"), exact: true },
    { to: "/reports/pnl", label: t("rpt.tabs.pnl") },
    { to: "/reports/health", label: t("rpt.tabs.health") },
    { to: "/reports/analytics", label: t("rpt.tabs.analytics") },
    { to: "/reports/products", label: t("rpt.tabs.products") },
    { to: "/reports/customers", label: t("rpt.tabs.customers") },
    { to: "/reports/suppliers", label: t("rpt.tabs.suppliers") },
    { to: "/reports/cashflow", label: t("rpt.tabs.cashflow") },
    { to: "/reports/insights", label: t("rpt.tabs.insights") },
  ] as const;

  return (
    <AppShell variant="store" title={t("rpt.title")}>
      <div className="-mt-2 mb-4 flex flex-wrap gap-1 border-b border-border/60 pb-0">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: "exact" in tab ? tab.exact : false }}
            className={cn(
              "rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            )}
            activeProps={{ className: "border-primary text-foreground" }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <Outlet />
    </AppShell>
  );
}
