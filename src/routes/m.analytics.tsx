import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneCard,
  PhoneChip,
  PhoneChipRow,
  PhoneEmpty,
  PhoneKpi,
  PhoneKpiGrid,
  PhoneRow,
  money,
} from "@/components/mobile/phone-ui";
import { useAuth } from "@/hooks/use-auth";
import { getStoreDashboard } from "@/lib/api/dashboard.functions";
import {
  PhoneFilterPanel,
  defaultPhoneFilters,
  withinRange,
  type PhoneFilters,
} from "@/components/mobile/phone-filter-panel";

export const Route = createFileRoute("/m/analytics")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Analytics — Pharmacy Phone App" },
      { name: "description", content: "Sales trend, top medicines and inventory analytics on your phone." },
      { property: "og:title", content: "Analytics — Pharmacy Phone App" },
      { property: "og:description", content: "See sale trends, best sellers and stock value from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileAnalytics,
});

type Tab = "trend" | "top" | "stock";

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">{i.label}</span>
            <span className="font-semibold text-foreground">{money(i.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((i.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileAnalytics() {
  const { currentTenantId } = useAuth();
  const fetchDashboard = useServerFn(getStoreDashboard);
  const [tab, setTab] = useState<Tab>("trend");
  const [filters, setFilters] = useState<PhoneFilters>(defaultPhoneFilters);

  const { data, isLoading } = useQuery({
    queryKey: ["m-analytics", currentTenantId, filters.warehouseId],
    enabled: !!currentTenantId,
    staleTime: 60_000,
    queryFn: () =>
      fetchDashboard({
        data: { tenant_id: currentTenantId!, warehouse_id: filters.warehouseId },
      }),
  });

  const k = data?.kpi;
  const daily = (data?.dailySales ?? []).filter((d) => withinRange(d.day, filters.from, filters.to));
  const monthly = (data?.monthly ?? []).filter((m) => withinRange(m.m, filters.from, filters.to));
  const topMeds = data?.topMedicines ?? [];
  const topCos = data?.topCompanies ?? [];
  const cats = data?.categoryInventory ?? [];

  return (
    <PhoneShell title="Analytics" back>
      <PhoneFilterPanel value={filters} onChange={setFilters} />

      <PhoneKpiGrid>
        <PhoneKpi tone="mint" value={money(data?.sales.mtd.amount)} label="Sale this month" />
        <PhoneKpi tone="lilac" value={money(k?.todayProfit)} label="Today profit" />
        <PhoneKpi tone="sky" value={data?.sales.last7.invoices ?? 0} label="Invoices (7d)" />
        <PhoneKpi tone="rose" value={money(k?.inventoryValue)} label="Stock value" />
      </PhoneKpiGrid>

      <PhoneChipRow>
        <PhoneChip active={tab === "trend"} onClick={() => setTab("trend")}>Trend</PhoneChip>
        <PhoneChip active={tab === "top"} onClick={() => setTab("top")}>Top sellers</PhoneChip>
        <PhoneChip active={tab === "stock"} onClick={() => setTab("stock")}>Stock</PhoneChip>
      </PhoneChipRow>

      {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && tab === "trend" && (
        <div className="mt-3 space-y-3">
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-foreground">Daily sale</p>
            {daily.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sale data yet</p>
            ) : (
              <Bars items={daily.map((d) => ({ label: d.day, value: d.sales }))} />
            )}
          </PhoneCard>
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-foreground">Monthly sale vs purchase</p>
            {monthly.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No monthly data yet</p>
            ) : (
              monthly.map((m) => (
                <PhoneRow
                  key={m.m}
                  label={m.m}
                  value={`${money(m.sales)} / ${money(m.purchase)}`}
                />
              ))
            )}
          </PhoneCard>
        </div>
      )}

      {!isLoading && tab === "top" && (
        <div className="mt-3 space-y-3">
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-foreground">Top medicines</p>
            {topMeds.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales yet</p>
            ) : (
              topMeds.map((m) => (
                <PhoneRow key={m.name} label={`${m.name} · ${m.qty} pcs`} value={money(m.revenue)} />
              ))
            )}
          </PhoneCard>
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-foreground">Top companies</p>
            {topCos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No data</p>
            ) : (
              <Bars items={topCos.map((c) => ({ label: c.name, value: c.revenue }))} />
            )}
          </PhoneCard>
        </div>
      )}

      {!isLoading && tab === "stock" && (
        <div className="mt-3 space-y-3">
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-foreground">Inventory by category</p>
            {cats.length === 0 ? (
              <PhoneEmpty message="No inventory data yet" />
            ) : (
              <Bars items={cats.map((c) => ({ label: c.name, value: c.value }))} />
            )}
          </PhoneCard>
          <PhoneCard>
            <p className="mb-2 text-sm font-bold text-foreground">Alerts</p>
            <PhoneRow label="Low stock" value={k?.lowStock ?? 0} />
            <PhoneRow label="Near expiry" value={k?.nearExpiry ?? 0} />
            <PhoneRow label="Expired" value={k?.expired ?? 0} />
            <PhoneRow label="Recalled" value={k?.recalledCount ?? 0} />
          </PhoneCard>
        </div>
      )}
    </PhoneShell>
  );
}
