import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { AccountsDateProvider, AccountsDateFilterBar } from "@/components/accounts/accounts-date-filter";

export const Route = createFileRoute("/accounts")({
  component: AccountsLayout,
});

function AccountsLayout() {
  const { t } = useTranslation();
  const tabs = [
    { to: "/accounts", k: "sections.tabs.dashboard", exact: true as const },
    { to: "/accounts/expenses", k: "sections.tabs.expenses" },
    { to: "/accounts/income", k: "sections.tabs.income" },
    { to: "/accounts/cashbook", k: "sections.tabs.cashbook" },
    { to: "/accounts/ledger", k: "sections.tabs.ledger" },
    { to: "/accounts/banks", k: "sections.tabs.banks" },
    { to: "/accounts/chart", k: "sections.tabs.chart" },
    { to: "/accounts/day-closing", k: "sections.tabs.dayClose" },
    { to: "/accounts/audit", k: "sections.tabs.audit" },
  ] as const;
  return (
    <AppShell variant="store" title={t("nav.accounts")}>
      <AccountsDateProvider>
        <div className="-mt-2 mb-4 flex flex-col gap-2 border-b border-border/60 pb-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto pb-px [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden">
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
          <div className="shrink-0">
            <AccountsDateFilterBar />
          </div>
        </div>
        <Outlet />
      </AccountsDateProvider>
    </AppShell>
  );
}
