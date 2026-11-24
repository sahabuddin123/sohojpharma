import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneCard,
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
  type PhoneFilters,
} from "@/components/mobile/phone-filter-panel";

export const Route = createFileRoute("/m/report")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Report — Pharmacy Phone App" },
      { name: "description", content: "Closing balance, profit, sale and inventory summary report for your pharmacy." },
      { property: "og:title", content: "Report — Pharmacy Phone App" },
      { property: "og:description", content: "Balances, profit and sale summary in one phone report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileReport,
});

function MobileReport() {
  const { currentTenantId } = useAuth();
  const fetchDashboard = useServerFn(getStoreDashboard);
  const [filters, setFilters] = useState<PhoneFilters>(defaultPhoneFilters);
  const { data, isLoading } = useQuery({
    queryKey: ["m-report", currentTenantId, filters.warehouseId],
    enabled: !!currentTenantId,
    staleTime: 60_000,
    queryFn: () =>
      fetchDashboard({
        data: { tenant_id: currentTenantId!, warehouse_id: filters.warehouseId },
      }),
  });

  const k = data?.kpi;
  const s = data?.sales;

  return (
    <PhoneShell title="Report" back>
      <PhoneFilterPanel value={filters} onChange={setFilters} />

      {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}

      <PhoneKpiGrid className="mt-3">
        <PhoneKpi tone="mint" value={money(k?.todaySales)} label="Today sale" />
        <PhoneKpi tone="sky" value={money(k?.todayPurchase)} label="Today purchase" />
        <PhoneKpi tone="lilac" value={money(k?.todayProfit)} label="Today profit" />
        <PhoneKpi tone="rose" value={money(k?.cashInHand)} label="Cash in hand" />
      </PhoneKpiGrid>

      <PhoneCard className="mt-3">
        <p className="mb-2 text-sm font-bold text-foreground">Sale summary</p>
        <PhoneRow label="Today" value={`${money(s?.today.amount)} · ${s?.today.invoices ?? 0} inv`} />
        <PhoneRow label="Yesterday" value={`${money(s?.yesterday.amount)} · ${s?.yesterday.invoices ?? 0} inv`} />
        <PhoneRow label="Last 7 days" value={`${money(s?.last7.amount)} · ${s?.last7.invoices ?? 0} inv`} />
        <PhoneRow label="This month" value={`${money(s?.mtd.amount)} · ${s?.mtd.invoices ?? 0} inv`} />
      </PhoneCard>

      <PhoneCard className="mt-3">
        <p className="mb-2 text-sm font-bold text-foreground">Balances</p>
        <PhoneRow label="Customer due" value={money(k?.customerDueTotal)} />
        <PhoneRow label="Supplier due" value={money(k?.supplierDueTotal)} />
        <PhoneRow label="Due collection (today)" value={money(k?.dueCollection)} />
        <PhoneRow label="Inventory value" value={money(k?.inventoryValue)} />
      </PhoneCard>

      <PhoneCard className="mt-3">
        <p className="mb-2 text-sm font-bold text-foreground">Inventory health</p>
        <PhoneRow label="Total products" value={k?.totalProducts ?? 0} />
        <PhoneRow label="Short / low stock" value={k?.lowStock ?? 0} />
        <PhoneRow label="Near expiry" value={k?.nearExpiry ?? 0} />
        <PhoneRow label="Expired" value={k?.expired ?? 0} />
      </PhoneCard>

      <PhoneCard className="mt-3">
        <p className="mb-2 text-sm font-bold text-foreground">Parties & pending</p>
        <PhoneRow label="Customers" value={k?.totalCustomers ?? 0} />
        <PhoneRow label="Suppliers" value={k?.totalSuppliers ?? 0} />
        <PhoneRow label="Pending POs" value={k?.pendingPOs ?? 0} />
        <PhoneRow label="Cancelled sales" value={`${k?.cancelledCount ?? 0} · ${money(k?.cancelledAmount)}`} />
      </PhoneCard>
    </PhoneShell>
  );
}
