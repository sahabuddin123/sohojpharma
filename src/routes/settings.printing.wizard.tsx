import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { PrintingSetupWizard } from "@/components/printing/setup-wizard";

export const Route = createFileRoute("/settings/printing/wizard")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Printing Setup Wizard — SohojPharma" }] }),
  component: PrintingWizardPage,
});

function PrintingWizardPage() {
  const { currentTenantId } = useAuth();
  return (
    <AppShell variant="store" title="Printing Setup Wizard">
      <PageHeader
        title="Printing Setup Wizard"
        description="Configure your store's printing in a few guided steps"
      />
      <PrintingSetupWizard tenantId={currentTenantId} />
    </AppShell>
  );
}
