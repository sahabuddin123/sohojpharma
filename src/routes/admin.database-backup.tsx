import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { DatabaseBackupPanel } from "@/components/backup/database-backup-panel";

export const Route = createFileRoute("/admin/database-backup")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Database Backup — SohojPharma Admin" },
      { name: "description", content: "One-click full platform database backup in SQL and SQLite formats." },
      { property: "og:title", content: "Database Backup — SohojPharma Admin" },
      { property: "og:description", content: "One-click full platform database backup in SQL and SQLite formats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell variant="admin" title="Database Backup">
      <PageHeader title="Database Backup" description="Full platform backup in one click" />
      <DatabaseBackupPanel scope="full" label="sohojpharma-full" />
    </AppShell>
  ),
});
