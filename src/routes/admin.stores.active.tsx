import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { TenantApprovalTable } from "@/components/admin/tenant-approval-table";

export const Route = createFileRoute("/admin/stores/active")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Active Stores — SohojPharma" }] }),
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  return (
    <AppShell variant="admin" title={t("saas.approval.pages.active")}>
      <PageHeader title={t("saas.approval.pages.active")} description={t("saas.approval.pages.activeDesc")} />
      <TenantApprovalTable status="active" allowed={["suspend"]} />
    </AppShell>
  );
}
