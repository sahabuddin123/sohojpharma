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

export const Route = createFileRoute("/m/short-items")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Short Items — Pharmacy Phone App" },
      { name: "description", content: "Low and out-of-stock medicines that need reordering." },
      { property: "og:title", content: "Short Items — Pharmacy Phone App" },
      { property: "og:description", content: "See which medicines are short and reorder in time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileShortItems,
});

type Row = {
  id: string;
  name: string;
  strength: string | null;
  medicine_type: string | null;
  reorder_level: number | null;
  purchase_price: number | null;
  retail_price: number | null;
  batches: { qty_on_hand: number | null }[] | null;
};

function MobileShortItems() {
  const { currentTenantId } = useAuth();
  const [mode, setMode] = useState<"all" | "out">("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-short-items", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,strength,medicine_type,reorder_level,purchase_price,retail_price,batches(qty_on_hand)",
        )
        .eq("tenant_id", currentTenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name")
        .limit(400);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const mapped = data.map((p) => ({
      ...p,
      stock: (p.batches ?? []).reduce((s, b) => s + Number(b.qty_on_hand ?? 0), 0),
      min: Number(p.reorder_level ?? 0),
    }));
    const short = mapped.filter((p) => p.stock <= Math.max(p.min, 0));
    return mode === "out" ? short.filter((p) => p.stock <= 0) : short;
  }, [data, mode]);

  return (
    <PhoneShell title="Short items" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={rows.length} label="Short items" />
        <PhoneKpi
          tone="sky"
          value={money(rows.reduce((s, r) => s + Number(r.purchase_price ?? 0), 0))}
          label="Reorder cost (1 unit)"
        />
      </PhoneKpiGrid>

      <PhoneChipRow>
        <PhoneChip active={mode === "all"} onClick={() => setMode("all")}>All</PhoneChip>
        <PhoneChip active={mode === "out"} onClick={() => setMode("out")}>Out of stock</PhoneChip>
      </PhoneChipRow>

      <div className="mt-3 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && <PhoneEmpty message="No short item right now" />}
        {rows.map((p) => (
          <PhoneCard key={p.id}>
            <p className="font-bold text-foreground">{p.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[p.medicine_type, p.strength].filter(Boolean).join(", ") || "—"}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center phone-grid-keep">
              <div className="rounded-xl bg-muted/60 py-2">
                <p className="text-[11px] text-muted-foreground">Cost</p>
                <p className="text-sm font-semibold">{Number(p.purchase_price ?? 0).toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-muted/60 py-2">
                <p className="text-[11px] text-muted-foreground">Sale</p>
                <p className="text-sm font-semibold">{Number(p.retail_price ?? 0).toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-muted/60 py-2">
                <p className="text-[11px] text-muted-foreground">Stk / Min</p>
                <p className="text-sm font-semibold text-destructive">
                  {p.stock} / {p.min}
                </p>
              </div>
            </div>
          </PhoneCard>
        ))}
      </div>
    </PhoneShell>
  );
}
