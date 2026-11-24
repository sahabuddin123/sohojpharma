import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/m/purchases")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Purchase Record — Pharmacy Phone App" },
      { name: "description", content: "Purchase orders, buy balance and supplier dues on your phone." },
      { property: "og:title", content: "Purchase Record — Pharmacy Phone App" },
      { property: "og:description", content: "Track purchase totals and order status from mobile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobilePurchaseRecord,
});

type Range = "30d" | "90d" | "all";

type PoRow = {
  id: string;
  po_number: string | null;
  status: string | null;
  order_date: string | null;
  total: number | null;
  created_at: string;
  suppliers: { name: string | null } | null;
};

function since(range: Range) {
  const d = new Date();
  if (range === "30d") d.setDate(d.getDate() - 30);
  if (range === "90d") d.setDate(d.getDate() - 90);
  if (range === "all") d.setFullYear(d.getFullYear() - 20);
  return d.toISOString();
}

function MobilePurchaseRecord() {
  const { currentTenantId } = useAuth();
  const [range, setRange] = useState<Range>("30d");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-purchases", currentTenantId, range],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id,po_number,status,order_date,total,created_at,suppliers(name)")
        .eq("tenant_id", currentTenantId!)
        .gte("created_at", since(range))
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PoRow[];
    },
  });

  const stats = useMemo(() => {
    let total = 0, pending = 0, received = 0;
    for (const p of data) {
      const t = Number(p.total ?? 0);
      total += t;
      if (p.status === "received") received += t;
      else pending += t;
    }
    return { total, pending, received };
  }, [data]);

  return (
    <PhoneShell title="Purchase Record" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" value={money(stats.total)} label="Buy Balance" />
        <PhoneKpi tone="sky" accent="danger" value={money(stats.pending)} label="Pending Value" />
        <PhoneKpi tone="lilac" value={money(stats.received)} label="Received Value" />
        <PhoneKpi tone="mint" value={data.length} label="No of Orders" />
      </PhoneKpiGrid>

      <PhoneChipRow>
        <PhoneChip active={range === "30d"} onClick={() => setRange("30d")}>Last 30 days</PhoneChip>
        <PhoneChip active={range === "90d"} onClick={() => setRange("90d")}>Last 90 days</PhoneChip>
        <PhoneChip active={range === "all"} onClick={() => setRange("all")}>All</PhoneChip>
      </PhoneChipRow>

      <div className="mt-3 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && data.length === 0 && (
          <PhoneEmpty message="Inventory will shown according to selected date range" />
        )}
        {data.map((p) => (
          <PhoneCard key={p.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-primary">{p.po_number ?? p.id.slice(0, 8)}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(p.order_date ?? p.created_at).toLocaleDateString("en-GB")}
              </p>
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <PhoneRow label="Supplier" value={p.suppliers?.name ?? "—"} />
              <PhoneRow label="Status" value={<span className="uppercase">{p.status ?? "—"}</span>} />
              <PhoneRow label="Total" value={money(p.total)} />
            </div>
            {!["received", "partially_received", "cancelled"].includes(p.status ?? "") && (
              <Link
                to="/m/purchase/$id"
                params={{ id: p.id }}
                className="mt-3 block rounded-xl border border-border py-2 text-center text-sm font-semibold text-primary"
              >
                Edit purchase
              </Link>
            )}
          </PhoneCard>

        ))}
      </div>
    </PhoneShell>
  );
}
