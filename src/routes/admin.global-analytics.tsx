import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RouteErrorPanel } from "@/components/route-error";
import { BarChart3, Loader2 } from "lucide-react";
import { adminAdoptionAnalytics } from "@/lib/api/global-adoption.functions";

export const Route = createFileRoute("/admin/global-analytics")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Global Catalog Analytics — SohojPharma Admin" }] }),
  component: AdminGlobalAnalyticsPage,
});

function AdminGlobalAnalyticsPage() {
  const { t } = useTranslation();
  const fn = useServerFn(adminAdoptionAnalytics);
  const q = useQuery({ queryKey: ["admin-adoption-analytics"], queryFn: () => fn() });
  const d = q.data;

  return (
    <AppShell variant="admin" title={t("admin.adoption.title", { defaultValue: "Global Catalog Analytics" })}>
      <PageHeader
        title={t("admin.adoption.title", { defaultValue: "Global Catalog Analytics" })}
        description={t("admin.adoption.desc", { defaultValue: "Network-wide adoption of the global medicine catalog." })}
      />

      {q.isLoading || !d ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <Stat label={t("admin.adoption.medicines", { defaultValue: "Global Medicines" })} v={d.total_global_medicines} />
            <Stat label={t("admin.adoption.linked", { defaultValue: "Linked Products" })} v={d.total_linked_products} />
            <Stat label={t("admin.adoption.total", { defaultValue: "Total Products" })} v={d.total_products} />
            <Stat label={t("admin.adoption.pct", { defaultValue: "Adoption %" })} v={`${d.adoption_pct}%`} />
            <Stat label={t("admin.adoption.pending", { defaultValue: "Pending Contributions" })} v={d.total_pending_contributions} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>{t("admin.adoption.mostAdded", { defaultValue: "Most Added Medicines" })}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead className="text-right">Stores</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.most_added_medicines.map((m) => (
                      <TableRow key={m.id}><TableCell>{m.brand_name}</TableCell><TableCell className="text-right">{m.adoption_count}</TableCell></TableRow>
                    ))}
                    {d.most_added_medicines.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">—</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t("admin.adoption.topStores", { defaultValue: "Most Linked Stores" })}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Store</TableHead><TableHead className="text-right">Linked</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.most_linked_stores.map((s) => (
                      <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell className="text-right">{s.linked_count}</TableCell></TableRow>
                    ))}
                    {d.most_linked_stores.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">—</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{typeof v === "number" ? v.toLocaleString() : v}</div>
    </div>
  );
}
