import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneCard,
  PhoneEmpty,
  PhoneKpi,
  PhoneKpiGrid,
  PhoneRow,
  money,
} from "@/components/mobile/phone-ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/m/collect")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Cash Collect — Pharmacy Phone App" },
      { name: "description", content: "Collect cash against recent invoices from your phone." },
      { property: "og:title", content: "Cash Collect — Pharmacy Phone App" },
      { property: "og:description", content: "See today's invoices and collect outstanding cash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileCashCollect,
});

type SaleRow = {
  id: string;
  invoice_no: string | null;
  created_at: string;
  total: number | null;
  paid: number | null;
  due: number | null;
  customers: { name: string | null; phone: string | null } | null;
};

function MobileCashCollect() {
  const { currentTenantId } = useAuth();

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-collect", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const { data, error } = await supabase
        .from("sales")
        .select("id,invoice_no,created_at,total,paid,due,customers(name,phone)")
        .eq("tenant_id", currentTenantId!)
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  const stats = useMemo(() => {
    let collected = 0, due = 0;
    for (const s of data) {
      collected += Number(s.paid ?? 0);
      due += Number(s.due ?? 0);
    }
    return { collected, due };
  }, [data]);

  return (
    <PhoneShell title="Cash collect" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="sky" accent="success" value={money(stats.collected)} label="Collected (7 days)" />
        <PhoneKpi tone="rose" accent="danger" value={money(stats.due)} label="Uncollected Due" />
      </PhoneKpiGrid>

      <div className="mt-4 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && data.length === 0 && <PhoneEmpty message="No invoice in the last 7 days" />}
        {data.map((s) => (
          <PhoneCard key={s.id}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-semibold text-destructive">
                {new Date(s.created_at).toLocaleDateString("en-GB").replace(/\//g, "-")}
              </p>
              <p className="text-muted-foreground">
                {new Date(s.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <PhoneRow label="Sale id" value={s.invoice_no ?? s.id.slice(0, 8)} />
              <PhoneRow label="Customer" value={s.customers?.name ?? "Walk-in"} />
              <PhoneRow label="Total price" value={money(s.total)} />
              <PhoneRow label="Paid amount" value={money(s.paid)} />
              <PhoneRow
                label="Due"
                value={<span className={Number(s.due ?? 0) > 0 ? "text-destructive" : ""}>{money(s.due)}</span>}
              />
            </div>
          </PhoneCard>
        ))}
      </div>
    </PhoneShell>
  );
}
