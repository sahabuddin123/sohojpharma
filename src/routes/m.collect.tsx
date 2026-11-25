import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, HandCoins, Loader2, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { recordPayment } from "@/lib/api/collections.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/collect")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "ক্যাশ কালেক্ট — SohojPharma" },
      { name: "description", content: "মোবাইল থেকে ইনভয়েস ও গ্রাহকের বাকি টাকা আদায় করুন।" },
    ],
  }),
  component: MobileCashCollect,
});

type SaleRow = {
  id: string;
  invoice_no: string | null;
  customer_id: string | null;
  created_at: string;
  total: number | null;
  paid: number | null;
  due: number | null;
  customers: { name: string | null; phone: string | null } | null;
};

type FilterTab = "due" | "all" | "paid";

function MobileCashCollect() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const payFn = useServerFn(recordPayment);

  const [tab, setTab] = useState<FilterTab>("due");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<SaleRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bkash" | "nagad" | "rocket" | "bank" | "card" | "other">("cash");
  const [notes, setNotes] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-collect", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const { data, error } = await supabase
        .from("sales")
        .select("id,invoice_no,customer_id,created_at,total,paid,due,customers(name,phone)")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  const stats = useMemo(() => {
    let collected = 0;
    let due = 0;
    let dueCount = 0;
    for (const s of data) {
      collected += Number(s.paid ?? 0);
      const d = Number(s.due ?? 0);
      due += d;
      if (d > 0) dueCount++;
    }
    return { collected, due, dueCount };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((s) => {
      const d = Number(s.due ?? 0);
      if (tab === "due" && d <= 0) return false;
      if (tab === "paid" && d > 0) return false;
      if (!q) return true;
      return (
        (s.invoice_no?.toLowerCase().includes(q) ?? false) ||
        (s.customers?.name?.toLowerCase().includes(q) ?? false) ||
        (s.customers?.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [data, tab, search]);

  const collectMut = useMutation({
    mutationFn: async () => {
      if (!target || !tenantId || !branchId) {
        throw new Error("স্টোর বা শাখা পাওয়া যায়নি");
      }
      if (!target.customer_id) {
        throw new Error("এই ইনভয়েসে কোনো গ্রাহক যুক্ত নেই");
      }
      const amt = Math.round((Number(amount) || 0) * 100) / 100;
      if (amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      return await payFn({
        data: {
          tenantId,
          branchId,
          customer_id: target.customer_id,
          sale_id: target.id,
          amount: amt,
          method,
          notes: notes.trim() || `Mobile collect (${target.invoice_no ?? ""})`,
        },
      });
    },
    onSuccess: () => {
      toast.success("বাকি টাকা সফলভাবে আদায় হয়েছে!");
      qc.invalidateQueries({ queryKey: ["m-collect", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-home-kpi", tenantId] });
      setTarget(null);
      setAmount("");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message || "আদায় করতে সমস্যা হয়েছে"),
  });

  const openCollect = (s: SaleRow) => {
    setTarget(s);
    setAmount(String(Number(s.due ?? 0).toFixed(2)));
    setMethod("cash");
    setNotes("");
  };

  return (
    <PhoneShell title="ক্যাশ কালেক্ট (বাকি আদায়)" back>
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-200/80 bg-white p-3.5 text-center shadow-xs">
          <p className="text-[11px] font-medium text-slate-500">আদায় (৩০ দিন)</p>
          <p className="mt-1 text-lg font-extrabold text-[#0d6e4e]">{money(stats.collected)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200/80 bg-white p-3.5 text-center shadow-xs">
          <p className="text-[11px] font-medium text-slate-500">মোট বাকি ({stats.dueCount}টি)</p>
          <p className="mt-1 text-lg font-extrabold text-rose-600">{money(stats.due)}</p>
        </div>
      </div>

      {/* Search + Filter Pills */}
      <div className="mt-3 space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="গ্রাহকের নাম, ফোন বা ইনভয়েস খুঁজুন..."
            className="h-11 rounded-2xl border-slate-200 bg-white pl-9 text-sm shadow-xs"
          />
        </div>

        <div className="phone-grid-keep grid grid-cols-3 rounded-full bg-[#e9eeea] p-1">
          {(
            [
              { id: "due", label: `বাকি (${stats.dueCount})` },
              { id: "all", label: "সব" },
              { id: "paid", label: "পরিশোধিত" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-full py-1.5 text-xs font-semibold transition",
                tab === t.id ? "bg-[#0d5c46] text-white shadow-xs" : "text-slate-600",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice Cards */}
      <div className="mt-3 space-y-3 pb-24">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-[#0d5c46] mb-2" />
            <span className="text-xs">লোড হচ্ছে...</span>
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <PhoneEmpty
            title="কোনো তথ্য নেই"
            message={tab === "due" ? "কোনো বকেয়া ইনভয়েস পাওয়া যায়নি" : "কোনো ইনভয়েস পাওয়া যায়নি"}
          />
        )}
        {filtered.map((s) => {
          const dueAmt = Number(s.due ?? 0);
          const isDue = dueAmt > 0;
          return (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <UserRound className="h-3.5 w-3.5 text-[#0d5c46] shrink-0" />
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {s.customers?.name ?? "সাধারণ গ্রাহক"}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {s.invoice_no ?? s.id.slice(0, 8)} ·{" "}
                    {new Date(s.created_at).toLocaleDateString("bn-BD")}
                    {s.customers?.phone ? ` · ${s.customers.phone}` : ""}
                  </p>
                </div>

                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                    isDue ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {isDue ? "বাকি আছে" : "পরিশোধিত"}
                </span>
              </div>

              <div className="phone-grid-keep grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 text-center text-xs">
                <div>
                  <p className="text-[10px] text-slate-500">মোট বিল</p>
                  <p className="font-bold text-slate-900">{money(s.total)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">পরিশোধ</p>
                  <p className="font-bold text-[#0d6e4e]">{money(s.paid)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">বাকি</p>
                  <p className={cn("font-extrabold", isDue ? "text-rose-600" : "text-slate-500")}>
                    {money(dueAmt)}
                  </p>
                </div>
              </div>

              {isDue && (
                <Button
                  type="button"
                  onClick={() => openCollect(s)}
                  disabled={!s.customer_id}
                  className="h-10 w-full rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white text-xs font-bold gap-1.5"
                >
                  <HandCoins className="h-4 w-4" />
                  {s.customer_id
                    ? `${money(dueAmt)} আদায় করুন`
                    : "গ্রাহক যুক্ত নেই"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Collect Due Modal */}
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#0d5c46]">
              <HandCoins className="h-5 w-5" />
              বাকি টাকা আদায়
            </DialogTitle>
          </DialogHeader>

          {target && (
            <div className="space-y-3 py-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">গ্রাহক:</span>
                  <span className="font-bold text-slate-900">{target.customers?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ইনভয়েস:</span>
                  <span className="font-semibold">{target.invoice_no ?? target.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">বর্তমান বাকি:</span>
                  <span className="font-bold text-rose-600">{money(target.due)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">আদায়ের পরিমাণ *</Label>
                  <button
                    type="button"
                    onClick={() => setAmount(String(Number(target.due ?? 0).toFixed(2)))}
                    className="text-[11px] font-semibold text-[#0d5c46] underline"
                  >
                    পুরো বাকি
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 text-base font-bold"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">পেমেন্ট মাধ্যম</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">নগদ (Cash)</SelectItem>
                    <SelectItem value="bkash">বিকাশ (bKash)</SelectItem>
                    <SelectItem value="nagad">নগদ অ্যাপ (Nagad)</SelectItem>
                    <SelectItem value="rocket">রকেট (Rocket)</SelectItem>
                    <SelectItem value="card">কার্ড (Card)</SelectItem>
                    <SelectItem value="bank">ব্যাংক (Bank)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">নোট (ঐচ্ছিক)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="প্রয়োজনীয় নোট..."
                  className="h-10"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTarget(null)}>
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={() => collectMut.mutate()}
              disabled={collectMut.isPending}
              className="bg-[#0d5c46] hover:bg-[#094735] text-white gap-1.5"
            >
              {collectMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  আদায় হচ্ছে...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  আদায় সম্পন্ন করুন
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
}
