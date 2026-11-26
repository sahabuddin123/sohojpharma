import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Package, AlertTriangle, CalendarX, Wallet, Loader2, PackagePlus, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { buildProductDisplayName } from "@/lib/product-display";
import { InStockProductsSection } from "@/components/inventory/in-stock-products";



export const Route = createFileRoute("/inventory/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Inventory — SohojPharma" },
      { name: "description", content: "Pharmacy stock dashboard — current stock, low stock, expired and damaged stock." },
    ],
  }),
  component: InventoryDashboard,
});

type ProductMini = { strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null };
type LowRow = { id: string; name: string; sku: string | null; stock: number; reorder_level: number | null } & ProductMini;
type OutRow = { id: string; name: string; sku: string | null; reorder_level: number | null } & ProductMini;
type ExpRow = { name: string; batch: string; days: number } & ProductMini;
type OverviewResp = {
  kpi: {
    totalStock: number; totalValue: number;
    lowCount: number; outCount: number;
    noBatchCount: number; noOpeningCount: number; expiredCount: number;
  };
  lowStock: LowRow[] | null;
  outStock: OutRow[] | null;
  expiring: ExpRow[] | null;
};

function InventoryDashboard() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["inventory-overview", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<OverviewResp> => {
      const { data, error } = await supabase.rpc("get_inventory_overview", { _tenant_id: tenantId });
      if (error) throw error;
      return (data ?? null) as unknown as OverviewResp;
    },
  });

  const { data: stockItemCount } = useQuery({
    queryKey: ["inventory-stock-item-count", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("count_products_with_stock", { _tenant_id: tenantId });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });


  const stats = {
    totalStock: Number(data?.kpi?.totalStock ?? 0),
    totalValue: Number(data?.kpi?.totalValue ?? 0),
    lowCount: Number(data?.kpi?.lowCount ?? 0),
    outCount: Number(data?.kpi?.outCount ?? 0),
    expiredCount: Number(data?.kpi?.expiredCount ?? 0),
    noBatchCount: Number(data?.kpi?.noBatchCount ?? 0),
    noOpeningCount: Number(data?.kpi?.noOpeningCount ?? 0),
  };
  const lowStock: LowRow[] = (data?.lowStock ?? []).map((r) => ({ ...r, stock: Number(r.stock) }));
  const outStock: OutRow[] = data?.outStock ?? [];
  const expiringBatches: ExpRow[] = (data?.expiring ?? []).map((e) => ({ ...e, days: Number(e.days) }));

  return (
    <AppShell variant="store" title={t("pages.inventory.title")}>
      <PageHeader
        title={t("pages.inventory.title")}
        description={t("pages.inventory.desc")}
        actions={
          <>
            <Button asChild variant="outline"><Link to="/inventory/opening-stock"><PackagePlus className="mr-1.5 h-4 w-4" /> {t("pinv.openingStockBtn")}</Link></Button>
            <Button asChild variant="outline"><Link to="/inventory/import-history">Import History</Link></Button>
            <Button asChild><Link to="/inventory/reports">{t("pages.inventory.reports")}</Link></Button>
          </>
        }
      />

      {stats.noOpeningCount > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200/80 dark:bg-amber-900/60 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-amber-900 dark:text-amber-200">{t("pinv.noOpeningWarnTpl", { n: stats.noOpeningCount })}</div>
              <div className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">{t("pinv.noOpeningWarnDesc")}</div>
            </div>
          </div>
          <Button size="sm" asChild className="shrink-0"><Link to="/inventory/opening-stock">{t("pinv.initializeBtn")}</Link></Button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("pages.inventory.currentStock")} value={`${stats.totalStock.toLocaleString()} ${t("pages.inventory.pcs")}`} icon={Package} tone="primary" />
        <StatCard label={t("pages.inventory.stockValue")} value={`৳ ${Math.round(stats.totalValue).toLocaleString()}`} icon={Wallet} tone="success" />
        <StatCard label={t("pinv.withoutBatch")} value={String(stats.noBatchCount)} icon={PackagePlus} tone="warning" />
        <StatCard label={t("pinv.withoutOpening")} value={String(stats.noOpeningCount)} icon={ShieldAlert} tone="secondary" />
        <StatCard label="Stock Item" value={Number(stockItemCount ?? 0).toLocaleString()} icon={Package} tone="primary" />
        <StatCard label={t("pages.inventory.lowStock")} value={String(stats.lowCount)} icon={AlertTriangle} tone="warning" />
        <StatCard label={t("pages.inventory.expired")} value={String(stats.expiredCount)} icon={CalendarX} tone="secondary" />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">{t("pages.inventory.alerts")}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("pages.inventory.loading")}</div>
          ) : (
          <Tabs defaultValue="low">
            <TabsList>
              <TabsTrigger value="low">{t("pages.inventory.tabLow")} ({lowStock.length})</TabsTrigger>
              <TabsTrigger value="out">{t("pages.inventory.tabOut")} ({outStock.length})</TabsTrigger>
              <TabsTrigger value="exp30">{t("pages.inventory.tabExp30")}</TabsTrigger>
              <TabsTrigger value="exp60">{t("pages.inventory.tabExp60")}</TabsTrigger>
              <TabsTrigger value="exp90">{t("pages.inventory.tabExp90")}</TabsTrigger>
            </TabsList>

            <TabsContent value="low" className="mt-4">
              {lowStock.length === 0 ? <p className="text-sm text-muted-foreground">{t("pages.inventory.allAbove")}</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("pages.inventory.colProduct")}</TableHead><TableHead>{t("pages.inventory.colSku")}</TableHead>
                  <TableHead className="text-right">{t("pages.inventory.colStock")}</TableHead>
                  <TableHead className="text-right">{t("pages.inventory.colReorder")}</TableHead>
                  <TableHead className="text-right">{t("pages.inventory.colStatus")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {lowStock.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{buildProductDisplayName(p)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.sku ?? "-"}</TableCell>
                      <TableCell className="text-right">{p.stock}</TableCell>
                      <TableCell className="text-right">{p.reorder_level}</TableCell>
                      <TableCell className="text-right"><Badge variant="warning">{t("pages.inventory.low")}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </TabsContent>

            <TabsContent value="out" className="mt-4">
              {outStock.length === 0 ? <p className="text-sm text-muted-foreground">{t("pages.inventory.noneOut")}</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>{t("pages.inventory.colProduct")}</TableHead><TableHead>{t("pages.inventory.colSku")}</TableHead><TableHead className="text-right">{t("pages.inventory.colReorder")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {outStock.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{buildProductDisplayName(p)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.sku ?? "-"}</TableCell>
                      <TableCell className="text-right">{p.reorder_level ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </TabsContent>

            {(["exp30", "exp60", "exp90"] as const).map((tab) => {
              const limit = tab === "exp30" ? 30 : tab === "exp60" ? 60 : 90;
              const rows = expiringBatches.filter((e) => e.days <= limit && e.days > -3650);
              return (
                <TabsContent key={tab} value={tab} className="mt-4">
                  {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("pages.inventory.noneWindow")}</p> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("pages.inventory.colProduct")}</TableHead><TableHead>{t("pages.inventory.colBatch")}</TableHead>
                      <TableHead className="text-right">{t("pages.inventory.colDaysLeft")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {rows.map((e, i) => (
                        <TableRow key={`${e.batch}-${i}`}>
                          <TableCell className="font-medium">{buildProductDisplayName(e)}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{e.batch}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={e.days <= 30 ? "destructive" : "warning"}>
                              {e.days <= 0 ? t("pages.inventory.expiredLabel") : t("pages.inventory.days", { n: e.days })}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
          )}
        </CardContent>
      </Card>

      
      <InStockProductsSection tenantId={tenantId} />
    </AppShell>
  );
}

