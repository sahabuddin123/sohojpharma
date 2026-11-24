import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneCard, PhoneChip, PhoneChipRow, PhoneEmpty, money } from "@/components/mobile/phone-ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/m/transactions")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Transactions — Pharmacy Phone App" },
      { name: "description", content: "Money in and money out: customer collections and supplier payments." },
      { property: "og:title", content: "Transactions — Pharmacy Phone App" },
      { property: "og:description", content: "Track every collection and payment from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileTransactions,
});

type Txn = {
  id: string;
  name: string;
  phone: string | null;
  kind: "Customer" | "Supplier";
  status: string;
  amount: number;
  date: string;
};

function MobileTransactions() {
  const { currentTenantId } = useAuth();
  const [filter, setFilter] = useState<"all" | "Customer" | "Supplier">("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-transactions", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async (): Promise<Txn[]> => {
      const [cp, sp] = await Promise.all([
        supabase
          .from("customer_payments")
          .select("id,amount,method,payment_date,customers(name,phone)")
          .eq("tenant_id", currentTenantId!)
          .order("payment_date", { ascending: false })
          .limit(100),
        supabase
          .from("supplier_payments")
          .select("id,amount,method,payment_date,suppliers(name,phone)")
          .eq("tenant_id", currentTenantId!)
          .order("payment_date", { ascending: false })
          .limit(100),
      ]);
      if (cp.error) throw cp.error;
      if (sp.error) throw sp.error;
      type R = { id: string; amount: number; method: string; payment_date: string };
      const rows: Txn[] = [
        ...((cp.data ?? []) as unknown as Array<R & { customers: { name: string | null; phone: string | null } | null }>).map(
          (r) => ({
            id: `c-${r.id}`,
            name: r.customers?.name ?? "Walk-in",
            phone: r.customers?.phone ?? null,
            kind: "Customer" as const,
            status: `Received · ${String(r.method).toUpperCase()}`,
            amount: Number(r.amount),
            date: r.payment_date,
          }),
        ),
        ...((sp.data ?? []) as unknown as Array<R & { suppliers: { name: string | null; phone: string | null } | null }>).map(
          (r) => ({
            id: `s-${r.id}`,
            name: r.suppliers?.name ?? "Supplier",
            phone: r.suppliers?.phone ?? null,
            kind: "Supplier" as const,
            status: `Paid · ${String(r.method).toUpperCase()}`,
            amount: Number(r.amount),
            date: r.payment_date,
          }),
        ),
      ];
      return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    },
  });

  const rows = useMemo(
    () => (filter === "all" ? data : data.filter((r) => r.kind === filter)),
    [data, filter],
  );

  return (
    <PhoneShell title="Transaction" back>
      <PhoneChipRow>
        <PhoneChip active={filter === "all"} onClick={() => setFilter("all")}>Account type</PhoneChip>
        <PhoneChip active={filter === "Customer"} onClick={() => setFilter("Customer")}>Customer</PhoneChip>
        <PhoneChip active={filter === "Supplier"} onClick={() => setFilter("Supplier")}>Supplier</PhoneChip>
      </PhoneChipRow>

      <div className="mt-4 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && <PhoneEmpty message="No transaction found" />}
        {rows.map((r) => (
          <PhoneCard key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-foreground">{r.name}</p>
                <p className="truncate text-sm text-muted-foreground">{r.phone ?? "—"}</p>
                <p className="mt-1 text-sm font-semibold text-primary">{r.kind}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-extrabold text-info">{money(r.amount)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.status}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(r.date).toLocaleDateString("en-GB").replace(/\//g, "-")}
                </p>
              </div>
              <MoreVertical className="mt-1 h-5 w-5 shrink-0 text-primary" />
            </div>
          </PhoneCard>
        ))}
      </div>
    </PhoneShell>
  );
}
