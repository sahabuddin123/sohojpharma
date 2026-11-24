import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Check } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { recordPayment } from "@/lib/api/collections.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/credit-adjustment")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Credit Adjustment — Pharmacy Phone App" },
      { name: "description", content: "Adjust customer credit and settle outstanding due from your phone." },
      { property: "og:title", content: "Credit Adjustment — Pharmacy Phone App" },
      { property: "og:description", content: "Pick a customer, enter an amount and settle credit instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileCreditAdjustment,
});

type DueRow = {
  customer_id: string;
  name: string | null;
  phone: string | null;
  net_due: number | null;
  credit_limit: number | null;
};

const METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "card", "other"] as const;
type Method = (typeof METHODS)[number];

function MobileCreditAdjustment() {
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DueRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [notes, setNotes] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-credit-adjustment", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_customer_due")
        .select("customer_id,name,phone,net_due,credit_limit")
        .eq("tenant_id", currentTenantId!)
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as DueRow[];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data
      .filter((c) => (q ? `${c.name ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q) : true))
      .sort((a, b) => Number(b.net_due ?? 0) - Number(a.net_due ?? 0));
  }, [data, search]);

  const stats = useMemo(() => {
    let due = 0;
    let count = 0;
    for (const c of data) {
      const d = Number(c.net_due ?? 0);
      if (d > 0) {
        due += d;
        count += 1;
      }
    }
    return { due, count };
  }, [data]);

  const submitFn = useServerFn(recordPayment);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!currentTenantId || !branchId) throw new Error("No active branch");
      if (!selected) throw new Error("Select a customer first");
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid amount");
      return submitFn({
        data: {
          tenantId: currentTenantId,
          branchId,
          customer_id: selected.customer_id,
          amount: Math.round(value * 100) / 100,
          method,
          notes: notes.trim() || undefined,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Adjusted. Remaining due ${money(res?.new_due ?? 0)}`);
      setAmount("");
      setNotes("");
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ["m-credit-adjustment"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PhoneShell title="Credit adjustment" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={money(stats.due)} label="Total Due" />
        <PhoneKpi tone="sky" accent="info" value={String(stats.count)} label="Due Customers" />
      </PhoneKpiGrid>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer by name or phone"
          className="h-12 rounded-2xl pl-9"
        />
      </div>

      {selected ? (
        <PhoneCard className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{selected.name ?? "Customer"}</p>
              <p className="truncate text-xs text-muted-foreground">{selected.phone ?? "No phone"}</p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-primary"
              onClick={() => setSelected(null)}
            >
              Change
            </button>
          </div>

          <div className="mt-2 border-t border-border pt-2">
            <PhoneRow
              label="Current due"
              value={
                <span className={Number(selected.net_due ?? 0) > 0 ? "text-destructive" : ""}>
                  {money(selected.net_due)}
                </span>
              }
            />
            <PhoneRow label="Credit limit" value={money(selected.credit_limit)} />
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Adjustment amount</label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1 h-12 rounded-2xl text-lg font-bold"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">Method</p>
              <PhoneChipRow>
                {METHODS.map((m) => (
                  <PhoneChip key={m} active={method === m} onClick={() => setMethod(m)}>
                    {m}
                  </PhoneChip>
                ))}
              </PhoneChipRow>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Note (optional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Reason for adjustment"
                className="mt-1 rounded-2xl"
              />
            </div>

            <Button
              className="h-12 w-full rounded-2xl text-base font-bold"
              disabled={mutation.isPending || !branchId}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Saving…" : "Save adjustment"}
            </Button>
          </div>
        </PhoneCard>
      ) : (
        <div className="mt-4 space-y-3">
          {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && rows.length === 0 && <PhoneEmpty message="No customer found" />}
          {rows.slice(0, 100).map((c) => (
            <button
              key={c.customer_id}
              type="button"
              onClick={() => setSelected(c)}
              className="w-full text-left"
            >
              <PhoneCard className="active:scale-[0.99] transition-transform">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{c.name ?? "Customer"}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.phone ?? "No phone"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-extrabold",
                        Number(c.net_due ?? 0) > 0 ? "text-destructive" : "text-success",
                      )}
                    >
                      {money(c.net_due)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {Number(c.net_due ?? 0) > 0 ? "due" : "clear"}
                    </p>
                  </div>
                </div>
              </PhoneCard>
            </button>
          ))}
        </div>
      )}

      {!branchId && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5" /> Select an active branch to save adjustments.
        </p>
      )}
    </PhoneShell>
  );
}
