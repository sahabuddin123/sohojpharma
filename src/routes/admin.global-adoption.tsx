import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RouteErrorPanel } from "@/components/route-error";
import { topAdoptedBreakdown } from "@/lib/api/global-adoption.functions";

export const Route = createFileRoute("/admin/global-adoption")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-6">Not Found</div>,
  head: () => ({ meta: [{ title: "Global Adoption — SohojPharma Admin" }] }),
  component: GlobalAdoptionAdmin,
});

function GlobalAdoptionAdmin() {
  const { t } = useTranslation();
  const fn = useServerFn(topAdoptedBreakdown);
  const q = useQuery({
    queryKey: ["top-adopted-breakdown"],
    queryFn: () => fn(),
  });

  const d = q.data ?? { medicines: [], generics: [], manufacturers: [] };

  return (
    <AppShell variant="admin">
      <PageHeader
        title={t("nav.globalAdoption")}
        description={t("globalAdoption.dashboardDescription")}
      />

      {q.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Panel title={t("globalAdoption.topMedicines")}
            rows={d.medicines.map((m) => ({ label: m.brand_name, count: m.adoptions }))} />
          <Panel title={t("globalAdoption.topGenerics")}
            rows={d.generics.map((g) => ({ label: g.generic_name, count: g.adoptions }))} />
          <Panel title={t("globalAdoption.topManufacturers")}
            rows={d.manufacturers.map((m) => ({ label: m.manufacturer_name, count: m.adoptions }))} />
        </div>
      )}
    </AppShell>
  );
}

function Panel({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead className="text-right">{t("globalAdoption.adoptions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="truncate max-w-[200px]">{r.label}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
