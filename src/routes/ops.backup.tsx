import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { DatabaseBackupPanel } from "@/components/backup/database-backup-panel";

export const Route = createFileRoute("/ops/backup")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  component: BackupPage,
});

function BackupPage() {
  const { currentTenantId, memberships, adminTenants } = useAuth();
  const t = [...memberships, ...adminTenants].find((m) => m.tenant_id === currentTenantId)?.tenants;
  if (!currentTenantId) return <div className="text-sm text-muted-foreground">Loading store…</div>;
  return <DatabaseBackupPanel scope="tenant" tenantId={currentTenantId} label={t?.slug ?? t?.name ?? "store"} />;
}
