import { createFileRoute } from "@tanstack/react-router";
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
  money,
} from "@/components/mobile/phone-ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/m/suppliers")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Suppliers — Pharmacy Phone App" },
      { name: "description", content: "Supplier payables, advances and contacts on your phone." },
      { property: "og:title", content: "Suppliers — Pharmacy Phone App" },
      { property: "og:description", content: "See supplier due and advance balances at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileSuppliers,
});

type Row = { id: string; name: string; phone: string | null; due_balance: number | null };

function MobileSuppliers() {
  const { currentTenantId } = useAuth();
  const [filter, setFilter] = useState<"all" | "due" | "advance">("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-suppliers", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name,phone,due_balance")
        .eq("tenant_id", currentTenantId!)
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const stats = useMemo(() => {
    let due = 0, adv = 0, dueCount = 0, advCount = 0;
    for (const r of data) {
      const b = Number(r.due_balance ?? 0);
      if (b > 0) { due += b; dueCount++; }
      if (b < 0) { adv += -b; advCount++; }
    }
    return { due, adv, dueCount, advCount };
  }, [data]);

  const rows = useMemo(
    () =>
      data.filter((r) => {
        const b = Number(r.due_balance ?? 0);
        if (filter === "due") return b > 0;
        if (filter === "advance") return b < 0;
        return true;
      }),
    [data, filter],
  );

  return (
    <PhoneShell title="Supplier" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={money(stats.due)} label="Total Due Balance" />
        <PhoneKpi tone="sky" accent="info" value={money(stats.adv)} label="Total Advance Balance" />
        <PhoneKpi tone="rose" accent="danger" value={stats.dueCount} label="No of Due Supplier" />
        <PhoneKpi tone="sky" accent="info" value={stats.advCount} label="No of Advance Supplier" />
      </PhoneKpiGrid>

      <PhoneChipRow>
        <PhoneChip active={filter === "all"} onClick={() => setFilter("all")}>All</PhoneChip>
        <PhoneChip active={filter === "due"} onClick={() => setFilter("due")}>Due</PhoneChip>
        <PhoneChip active={filter === "advance"} onClick={() => setFilter("advance")}>Advance</PhoneChip>
      </PhoneChipRow>

      <div className="mt-3 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && <PhoneEmpty message="No supplier found for this filter" />}
        {rows.map((r) => {
          const b = Number(r.due_balance ?? 0);
          return (
            <PhoneCard key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-foreground">{r.name}</p>
                  <p className="truncate text-sm text-primary">{r.phone ?? "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={b > 0 ? "font-bold text-destructive" : b < 0 ? "font-bold text-primary" : "font-semibold"}>
                    {money(Math.abs(b))}
                  </p>
                  {b !== 0 && (
                    <p className={b > 0 ? "text-sm font-semibold text-destructive" : "text-sm font-semibold text-primary"}>
                      {b > 0 ? "Due" : "Advance"}
                    </p>
                  )}
                </div>
              </div>
            </PhoneCard>
          );
        })}
      </div>
    </PhoneShell>
  );
}
