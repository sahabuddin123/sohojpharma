import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Warehouse, Package, AlertTriangle, CalendarX, Wallet, TrendingUp, ShoppingBag, ShoppingCart, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RouteErrorPanel } from "@/components/route-error";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/inventory/warehouses")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Warehouses — SohojPharma" }, { name: "description", content: "Per-warehouse KPIs: stock value, low stock, expiring, sales and purchases." }] }),
  component: WarehousesPage,
});

type Kpi = {
  stock_value: number; total_products: number; low_stock_count: number;
  out_of_stock_count: number; expiring_count: number;
  sales_today: number; sales_this_month: number; purchase_this_month: number;
};

function fmtMoney(n: number | null | undefined) {
  return "৳ " + Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function WarehousesPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  const { data: warehouses = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["warehouses-list", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses").select("id, name, branch_id, is_default, branches:branch_id(name)")
        .eq("tenant_id", tenantId).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; is_default: boolean; branches: { name: string } | null }>;
    },
  });

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      setWarehouseId(warehouses.find((w) => w.is_default)?.id ?? warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  const { data: kpi, isLoading } = useQuery<Kpi | null>({
    enabled: !!tenantId && !!warehouseId,
    queryKey: ["warehouse-kpis", tenantId, warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("warehouse_kpis", { _tenant_id: tenantId, _warehouse_id: warehouseId! });
      if (error) throw error;
      return Array.isArray(data) ? (data[0] as Kpi) : (data as Kpi);
    },
  });

  const selected = warehouses.find((w) => w.id === warehouseId);

  return (
    <AppShell variant="store" title="Warehouses">
      <PageHeader title="Warehouse Dashboard" description="Switch warehouse to view per-location KPIs." actions={
        <Link to="/inventory/transfers" className="text-sm text-primary underline">Transfers →</Link>
      } />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <WarehouseFilter value={warehouseId} onChange={setWarehouseId} allowAll={false} className="w-72" />
        {selected && (
          <div className="text-sm text-muted-foreground">
            Branch: <span className="font-medium">{selected.branches?.name ?? "—"}</span>
          </div>
        )}
      </div>

      {!warehouseId ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Select a warehouse to view KPIs.</CardContent></Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Stock Value" value={fmtMoney(kpi?.stock_value)} icon={Wallet} />
          <StatCard label="Total Products" value={String(kpi?.total_products ?? 0)} icon={Package} />
          <StatCard label="Low Stock" value={String(kpi?.low_stock_count ?? 0)} icon={AlertTriangle} />
          <StatCard label="Out of Stock" value={String(kpi?.out_of_stock_count ?? 0)} icon={AlertTriangle} />
          <StatCard label="Expiring (30d)" value={String(kpi?.expiring_count ?? 0)} icon={CalendarX} />
          <StatCard label="Sales Today" value={fmtMoney(kpi?.sales_today)} icon={TrendingUp} />
          <StatCard label="Sales This Month" value={fmtMoney(kpi?.sales_this_month)} icon={ShoppingBag} />
          <StatCard label="Purchases This Month" value={fmtMoney(kpi?.purchase_this_month)} icon={ShoppingCart} />
        </div>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Warehouse className="h-4 w-4" /> All Warehouses</CardTitle></CardHeader>
        <CardContent>
          {warehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warehouses configured.</p>
          ) : (
            <ul className="divide-y">
              {warehouses.map((w) => (
                <li key={w.id} className="py-2 flex items-center justify-between">
                  <button className="text-left hover:underline" onClick={() => setWarehouseId(w.id)}>
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">{w.branches?.name ?? "—"}</div>
                  </button>
                  {w.is_default && <span className="text-xs text-muted-foreground">Default</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
