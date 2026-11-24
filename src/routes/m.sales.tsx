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
  PhoneRow,
  money,
} from "@/components/mobile/phone-ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/m/sales")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Sale Record — Pharmacy Phone App" },
      { name: "description", content: "Daily sales, dues and invoice history from your phone." },
      { property: "og:title", content: "Sale Record — Pharmacy Phone App" },
      { property: "og:description", content: "Review today's sales totals and invoice list on mobile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileSaleRecord,
});

type Range = "today" | "7d" | "30d";

type SaleRow = {
  id: string;
  invoice_no: string | null;
  sale_date: string | null;
  created_at: string;
  total: number | null;
  paid: number | null;
  due: number | null;
  status: string | null;
};

function since(range: Range) {
  const d = new Date();
  if (range === "today") d.setHours(0, 0, 0, 0);
  if (range === "7d") d.setDate(d.getDate() - 7);
  if (range === "30d") d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function MobileSaleRecord() {
  const { currentTenantId } = useAuth();
  const [range, setRange] = useState<Range>("today");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-sales", currentTenantId, range],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,invoice_no,sale_date,created_at,total,paid,due,status")
        .eq("tenant_id", currentTenantId!)
        .gte("created_at", since(range))
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
  });

  const stats = useMemo(() => {
    let total = 0, due = 0, paid = 0;
    for (const s of data) {
      total += Number(s.total ?? 0);
      due += Number(s.due ?? 0);
      paid += Number(s.paid ?? 0);
    }
    return { total, due, paid };
  }, [data]);

  return (
    <PhoneShell title="Sale Record" back>
      <PhoneKpiGrid>
        <PhoneKpi wide tone="rose" value={money(stats.total)} label="Total sale" />
        <PhoneKpi tone="sky" accent="success" value={money(stats.paid)} label="Collected" />
        <PhoneKpi tone="mint" accent="warning" value={money(stats.due)} label="Due Balance" />
      </PhoneKpiGrid>

      <PhoneChipRow>
        <PhoneChip active={range === "today"} onClick={() => setRange("today")}>Today</PhoneChip>
        <PhoneChip active={range === "7d"} onClick={() => setRange("7d")}>Last 7 days</PhoneChip>
        <PhoneChip active={range === "30d"} onClick={() => setRange("30d")}>Last 30 days</PhoneChip>
      </PhoneChipRow>

      <div className="mt-3 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && data.length === 0 && <PhoneEmpty message="No sale found in selected date range" />}
        {data.map((s) => (
          <PhoneCard key={s.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-primary">{s.invoice_no ?? s.id.slice(0, 8)}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(s.created_at).toLocaleString("en-GB", {
                  day: "2-digit", month: "2-digit", year: "2-digit",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <PhoneRow label="Total price" value={money(s.total)} />
              <PhoneRow label="Paid amount" value={money(s.paid)} />
              <PhoneRow
                label="Due"
                value={<span className={Number(s.due ?? 0) > 0 ? "text-destructive" : ""}>{money(s.due)}</span>}
              />
              <PhoneRow label="Status" value={<span className="uppercase">{s.status ?? "—"}</span>} />
            </div>
          </PhoneCard>
        ))}
      </div>
    </PhoneShell>
  );
}
