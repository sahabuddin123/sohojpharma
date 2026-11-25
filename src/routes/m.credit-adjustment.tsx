import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronRight, Search, UserRound } from "lucide-react";
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
      { title: "ক্রেডিট অ্যাডজাস্ট — SohojPharma" },
      { name: "description", content: "গ্রাহকের বকেয়া ও ক্রেডিট অ্যাডজাস্ট করুন।" },
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

const METHODS = [
  { id: "cash", label: "নগদ" },
  { id: "bkash", label: "বিকাশ" },
  { id: "nagad", label: "নগদ অ্যাপ" },
  { id: "rocket", label: "রকেট" },
  { id: "bank", label: "ব্যাংক" },
  { id: "card", label: "কার্ড" },
  { id: "other", label: "অন্যান্য" },
] as const;
type Method = (typeof METHODS)[number]["id"];

function MobileCreditAdjustment() {
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "due" | "clear">("all");
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
      .filter((c) => {
        const d = Number(c.net_due ?? 0);
        if (tab === "due" && d <= 0) return false;
        if (tab === "clear" && d > 0) return false;
        return q ? `${c.name ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q) : true;
      })
      .sort((a, b) => Number(b.net_due ?? 0) - Number(a.net_due ?? 0));
  }, [data, search, tab]);

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
      if (!currentTenantId || !branchId) throw new Error("সক্রিয় শাখা পাওয়া যায়নি");
      if (!selected) throw new Error("প্রথমে গ্রাহক নির্বাচন করুন");
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      return submitFn({
        data: {
          tenantId: currentTenantId,
          branchId,
          customer_id: selected.customer_id,
          amount: Math.round(value * 100) / 100,
          method,
          notes: notes.trim() || `Credit adjustment (${selected.name ?? ""})`,
        },
      });
    },
    onSuccess: (res) => {
      const rem = Number((res as { remaining_due?: number; new_due?: number } | undefined)?.remaining_due ?? (res as { new_due?: number } | undefined)?.new_due ?? 0);
      toast.success(`অ্যাডজাস্ট সম্পন্ন! বর্তমান বাকি: ${money(Math.max(0, rem))}`);
      setAmount("");
      setNotes("");
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ["m-credit-adjustment"] });
      void queryClient.invalidateQueries({ queryKey: ["m-customers"] });
      void queryClient.invalidateQueries({ queryKey: ["m-collect"] });
      void queryClient.invalidateQueries({ queryKey: ["m-home-kpi"] });
    },
    onError: (e: Error) => toast.error(e.message || "অ্যাডজাস্ট করতে সমস্যা হয়েছে"),
  });

  return (
    <PhoneShell title="ক্রেডিট অ্যাডজাস্ট" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={money(stats.due)} label="মোট বাকি" />
        <PhoneKpi tone="sky" accent="info" value={String(stats.count)} label="বাকি গ্রাহক" />
      </PhoneKpiGrid>

      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="গ্রাহকের নাম বা ফোন দিয়ে খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>
        {!selected && (
          <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
            {(
              [
                ["all", `সব (${data.length})`],
                ["due", `বাকি (${stats.count})`],
                ["clear", "পরিশোধিত"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-full py-1.5 text-[11px] font-semibold transition",
                  tab === key
                    ? "bg-white text-[#0d5c46] shadow-xs"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <PhoneCard className="mt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-slate-900">{selected.name ?? "গ্রাহক"}</p>
              <p className="truncate text-xs text-slate-500">{selected.phone ?? "ফোন নেই"}</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-[#0d5c46]"
              onClick={() => setSelected(null)}
            >
              পরিবর্তন
            </button>
          </div>

          <div className="mt-2 border-t border-border pt-2">
            <PhoneRow
              label="বর্তমান বাকি"
              value={
                <span className={Number(selected.net_due ?? 0) > 0 ? "text-rose-600 font-bold" : "text-[#0d5c46] font-bold"}>
                  {money(Math.max(0, Number(selected.net_due ?? 0)))}
                </span>
              }
            />
            <PhoneRow label="ক্রেডিট লিমিট" value={money(selected.credit_limit)} />
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">অ্যাডজাস্ট পরিমাণ *</label>
                {Number(selected.net_due ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(Number(selected.net_due ?? 0).toFixed(2)))}
                    className="text-[11px] font-semibold text-[#0d5c46] underline"
                  >
                    পুরো বাকি
                  </button>
                )}
              </div>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1 h-11 rounded-xl text-base font-bold"
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">পেমেন্ট মাধ্যম</p>
              <PhoneChipRow>
                {METHODS.map((m) => (
                  <PhoneChip key={m.id} active={method === m.id} onClick={() => setMethod(m.id)}>
                    {m.label}
                  </PhoneChip>
                ))}
              </PhoneChipRow>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">নোট (ঐচ্ছিক)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="অ্যাডজাস্টমেন্টের কারণ..."
                className="mt-1 rounded-xl"
              />
            </div>

            <Button
              className="h-11 w-full rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white text-sm font-bold"
              disabled={mutation.isPending || !branchId}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "সেভ হচ্ছে…" : "অ্যাডজাস্ট সেভ করুন"}
            </Button>
          </div>
        </PhoneCard>
      ) : (
        <div className="mt-3 space-y-2.5">
          {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
          {!isLoading && rows.length === 0 && <PhoneEmpty message="কোনো গ্রাহক পাওয়া যায়নি" />}
          {rows.slice(0, 100).map((c) => {
            const d = Number(c.net_due ?? 0);
            return (
              <button
                key={c.customer_id}
                type="button"
                onClick={() => {
                  setSelected(c);
                  setAmount(d > 0 ? String(d.toFixed(2)) : "");
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left shadow-[0_1px_4px_rgba(0,0,0,0.03)] active:scale-[0.99] transition hover:border-[#0d5c46]/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-700">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-900">{c.name ?? "গ্রাহক"}</p>
                    <p className="truncate text-xs text-slate-500">{c.phone ?? "ফোন নেই"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className={cn("text-sm font-extrabold", d > 0 ? "text-rose-600" : "text-[#0d5c46]")}>
                      {money(Math.abs(d))}
                    </p>
                    <p className={cn("text-[10px] font-bold", d > 0 ? "text-rose-600" : "text-[#0d5c46]")}>
                      {d > 0 ? "বাকি" : d < 0 ? "অগ্রিম" : "পরিশোধিত"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!branchId && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5" /> অ্যাডজাস্ট সেভ করতে সক্রিয় শাখা নির্বাচন করুন।
        </p>
      )}
    </PhoneShell>
  );
}
