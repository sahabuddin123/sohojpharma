import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, HandCoins, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { recordSupplierPayment } from "@/lib/api/supplier-ledger.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/suppliers")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "সরবরাহকারী — SohojPharma" },
      { name: "description", content: "সরবরাহকারীর বকেয়া, অগ্রিম ও পেমেন্ট পরিশোধ।" },
      { property: "og:title", content: "সরবরাহকারী — SohojPharma" },
      { property: "og:description", content: "মোবাইলে সরবরাহকারীর বকেয়া হিসাব দেখুন ও পরিশোধ করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileSuppliers,
});

type Row = { id: string; name: string; phone: string | null; due_balance: number | null };

function MobileSuppliers() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const paySupFn = useServerFn(recordSupplierPayment);

  const [filter, setFilter] = useState<"all" | "due" | "advance">("all");
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState<Row | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "bank" | "bkash" | "nagad" | "rocket" | "card">("cash");
  const [payNotes, setPayNotes] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-suppliers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name,phone,due_balance")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("due_balance", { ascending: false })
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

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      const b = Number(r.due_balance ?? 0);
      if (filter === "due" && b <= 0) return false;
      if (filter === "advance" && b >= 0) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [data, filter, search]);

  const payMut = useMutation({
    mutationFn: async () => {
      if (!payTarget || !tenantId) throw new Error("সরবরাহকারী বা স্টোর পাওয়া যায়নি");
      const amt = Math.round((Number(payAmount) || 0) * 100) / 100;
      if (amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      return await paySupFn({
        data: {
          tenantId,
          supplierId: payTarget.id,
          amount: amt,
          method: payMethod,
          branch_id: branchId || undefined,
          notes: payNotes.trim() || `Supplier due payment (${payTarget.name})`,
        },
      });
    },
    onSuccess: () => {
      toast.success("সরবরাহকারীর বকেয়া পরিশোধ হয়েছে!");
      qc.invalidateQueries({ queryKey: ["m-suppliers", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-home-kpi", tenantId] });
      setPayTarget(null);
      setPayAmount("");
      setPayNotes("");
    },
    onError: (e: Error) => {
      const msg = e.message || "";
      toast.error(
        msg.trimStart().startsWith("<") || /<!doctype\s+html/i.test(msg)
          ? "সার্ভার আপডেট হয়েছে — পেজ রিফ্রেশ করে আবার চেষ্টা করুন"
          : msg || "পেমেন্ট করতে সমস্যা হয়েছে",
      );
    },
  });

  const openPay = (r: Row) => {
    const b = Math.max(0, Number(r.due_balance ?? 0));
    setPayTarget(r);
    setPayAmount(b > 0 ? String(b.toFixed(2)) : "");
    setPayMethod("cash");
    setPayNotes("");
  };

  const targetDue = Math.max(0, Number(payTarget?.due_balance ?? 0));
  const remAfter = Math.max(0, Math.round((targetDue - (Number(payAmount) || 0)) * 100) / 100);

  return (
    <PhoneShell title="সরবরাহকারী" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={money(stats.due)} label="মোট বকেয়া" />
        <PhoneKpi tone="sky" accent="info" value={money(stats.adv)} label="মোট অগ্রিম" />
        <PhoneKpi tone="rose" accent="danger" value={stats.dueCount} label="বকেয়া সরবরাহকারী" />
        <PhoneKpi tone="sky" accent="info" value={stats.advCount} label="অগ্রিম সরবরাহকারী" />
      </PhoneKpiGrid>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="সরবরাহকারীর নাম বা ফোন খুঁজুন..."
          className="h-10 rounded-2xl border-slate-200 bg-white pl-9 text-xs shadow-xs"
        />
      </div>

      <PhoneChipRow>
        <PhoneChip active={filter === "all"} onClick={() => setFilter("all")}>সব ({data.length})</PhoneChip>
        <PhoneChip active={filter === "due"} onClick={() => setFilter("due")}>বকেয়া ({stats.dueCount})</PhoneChip>
        <PhoneChip active={filter === "advance"} onClick={() => setFilter("advance")}>অগ্রিম ({stats.advCount})</PhoneChip>
      </PhoneChipRow>

      <div className="mt-3 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && rows.length === 0 && <PhoneEmpty message="কোনো সরবরাহকারী পাওয়া যায়নি" />}
        {rows.map((r) => {
          const b = Number(r.due_balance ?? 0);
          return (
            <PhoneCard key={r.id} className="space-y-2.5">
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
                    <p className={b > 0 ? "text-xs font-semibold text-destructive" : "text-xs font-semibold text-primary"}>
                      {b > 0 ? "বকেয়া" : "অগ্রিম"}
                    </p>
                  )}
                </div>
              </div>
              {b > 0 && (
                <button
                  type="button"
                  onClick={() => openPay(r)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0d5c46] py-2 text-xs font-bold text-white hover:bg-[#094735] active:scale-[0.98] transition"
                >
                  <HandCoins className="h-3.5 w-3.5" />
                  {money(b)} বকেয়া পরিশোধ করুন
                </button>
              )}
            </PhoneCard>
          );
        })}
      </div>

      {/* Supplier Due Payment Dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <HandCoins className="h-5 w-5 text-[#0d5c46]" />
              সরবরাহকারী বকেয়া পরিশোধ
            </DialogTitle>
          </DialogHeader>

          {payTarget && (
            <div className="space-y-3 py-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">সরবরাহকারী:</span>
                  <span className="font-bold text-slate-900 truncate">{payTarget.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">মোট বকেয়া:</span>
                  <span className="font-bold text-rose-600">{money(targetDue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">পরিশোধের পর বাকি:</span>
                  <span className={cn("font-extrabold", remAfter > 0 ? "text-amber-700" : "text-[#0d5c46]")}>
                    {money(remAfter)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">পরিশোধের পরিমাণ *</Label>
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(targetDue.toFixed(2)))}
                    className="text-[11px] font-semibold text-[#0d5c46] underline"
                  >
                    পুরো বকেয়া
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="h-11 text-base font-bold"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">পেমেন্ট মাধ্যম</Label>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as any)}>
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">নগদ (Cash)</SelectItem>
                    <SelectItem value="bkash">বিকাশ (bKash)</SelectItem>
                    <SelectItem value="nagad">নগদ অ্যাপ (Nagad)</SelectItem>
                    <SelectItem value="rocket">রকেট (Rocket)</SelectItem>
                    <SelectItem value="bank">ব্যাংক (Bank)</SelectItem>
                    <SelectItem value="card">কার্ড (Card)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">নোট (ঐচ্ছিক)</Label>
                <Input
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="প্রয়োজনীয় নোট..."
                  className="h-10"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setPayTarget(null)}>
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={() => payMut.mutate()}
              disabled={payMut.isPending}
              className="bg-[#0d5c46] hover:bg-[#094735] text-white gap-1.5"
            >
              {payMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  পরিশোধ হচ্ছে...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  পরিশোধ সম্পন্ন করুন
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
}
