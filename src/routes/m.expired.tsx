import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneCard, PhoneChip, PhoneChipRow, PhoneEmpty } from "@/components/mobile/phone-ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/m/expired")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Expired Products — Pharmacy Phone App" },
      { name: "description", content: "Expiring and expired medicine batches grouped by expiry date." },
      { property: "og:title", content: "Expired Products — Pharmacy Phone App" },
      { property: "og:description", content: "Spot expiring medicine batches before they cost you money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileExpired,
});

type BatchRow = {
  id: string;
  expiry_date: string | null;
  qty_on_hand: number | null;
  batch_no: string | null;
  products: { name: string | null; strength: string | null; medicine_type: string | null } | null;
};

function MobileExpired() {
  const { currentTenantId } = useAuth();
  const [days, setDays] = useState(60);

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-expired", currentTenantId, days],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const until = new Date();
      until.setDate(until.getDate() + days);
      const { data, error } = await supabase
        .from("batches")
        .select("id,expiry_date,qty_on_hand,batch_no,products(name,strength,medicine_type)")
        .eq("tenant_id", currentTenantId!)
        .is("deleted_at", null)
        .gt("qty_on_hand", 0)
        .not("expiry_date", "is", null)
        .lte("expiry_date", until.toISOString().slice(0, 10))
        .order("expiry_date", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as BatchRow[];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, BatchRow[]>();
    for (const b of data) {
      const key = b.expiry_date ?? "—";
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [data]);

  return (
    <PhoneShell title="Expired products" back>
      <PhoneChipRow>
        {[30, 60, 90, 180].map((d) => (
          <PhoneChip key={d} active={days === d} onClick={() => setDays(d)}>
            {d} in days
          </PhoneChip>
        ))}
      </PhoneChipRow>

      <div className="mt-4 space-y-4">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && groups.length === 0 && (
          <PhoneEmpty message="No expiring batch in this window" />
        )}
        {groups.map(([date, rows]) => (
          <section key={date} className="space-y-3">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-destructive">
              <CalendarDays className="h-4 w-4" />
              {date === "—" ? "—" : new Date(date).toLocaleDateString("en-GB").replace(/\//g, "-")}
            </p>
            {rows.map((b) => (
              <PhoneCard key={b.id}>
                <p className="font-bold text-foreground">{b.products?.name ?? "—"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[b.products?.medicine_type, b.products?.strength].filter(Boolean).join(", ") || "—"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Batch : {b.batch_no ?? "—"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Available Qty : <span className="font-semibold text-foreground">{Number(b.qty_on_hand ?? 0)}</span>
                </p>
              </PhoneCard>
            ))}
          </section>
        ))}
      </div>
    </PhoneShell>
  );
}
