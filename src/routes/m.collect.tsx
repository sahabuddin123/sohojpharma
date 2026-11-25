import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, HandCoins, Loader2, Plus, Search, UserRound, X } from "lucide-react";
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
import { cacheCustomers, searchCachedCustomers } from "@/lib/offline/db";
import { queueCollection } from "@/lib/offline/queue";
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

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  due_balance: number;
};

type FilterTab = "due" | "all" | "paid";
type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "custom";

const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "all", label: "সব" },
  { id: "today", label: "আজ" },
  { id: "yesterday", label: "গতকাল" },
  { id: "this_week", label: "এই সপ্তাহ" },
  { id: "last_week", label: "গত সপ্তাহ" },
  { id: "this_month", label: "এই মাস" },
  { id: "last_month", label: "গত মাস" },
  { id: "custom", label: "কাস্টম" },
];

const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function getPresetRange(preset: DatePreset, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  const today = toIsoDate(now);
  switch (preset) {
    case "all":
      return {};
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toIsoDate(y);
      return { from: yStr, to: yStr };
    }
    case "this_week": {
      const s = new Date(now);
      s.setDate(s.getDate() - s.getDay());
      return { from: toIsoDate(s), to: today };
    }
    case "last_week": {
      const e = new Date(now);
      e.setDate(e.getDate() - e.getDay() - 1);
      const s = new Date(e);
      s.setDate(s.getDate() - 6);
      return { from: toIsoDate(s), to: toIsoDate(e) };
    }
    case "this_month":
      return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "last_month":
      return {
        from: toIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "custom":
      return { from: customFrom || undefined, to: customTo || undefined };
  }
}

function MobileCashCollect() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const payFn = useServerFn(recordPayment);

  const [tab, setTab] = useState<FilterTab>("due");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState(() => toIsoDate(new Date()));
  const [customTo, setCustomTo] = useState(() => toIsoDate(new Date()));
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<SaleRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bkash" | "nagad" | "rocket" | "bank" | "card" | "other">("cash");
  const [notes, setNotes] = useState("");

  // Direct Customer Collection modal state
  const [directOpen, setDirectOpen] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [selectedCust, setSelectedCust] = useState<CustomerOption | null>(null);
  const [directAmount, setDirectAmount] = useState("");
  const [directMethod, setDirectMethod] = useState<"cash" | "bkash" | "nagad" | "rocket" | "bank" | "card" | "other">("cash");
  const [directNotes, setDirectNotes] = useState("");

  const dateRange = useMemo(
    () => getPresetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-collect", tenantId, dateRange.from, dateRange.to],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("id,invoice_no,customer_id,created_at,total,paid,due,customers(name,phone)")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .order("created_at", { ascending: false })
        .limit(300);
      if (dateRange.from) q = q.gte("created_at", `${dateRange.from}T00:00:00+06:00`);
      if (dateRange.to) q = q.lte("created_at", `${dateRange.to}T23:59:59.999+06:00`);
      const { data, error } = await q;
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
    onError: (e: Error) => {
      const msg = e.message || "";
      toast.error(
        msg.trimStart().startsWith("<") || /<!doctype\s+html/i.test(msg)
          ? "সার্ভার আপডেট হয়েছে — অনুগ্রহ করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন"
          : msg || "আদায় করতে সমস্যা হয়েছে",
      );
    },
  });

  const openCollect = (s: SaleRow) => {
    setTarget(s);
    setAmount(String(Number(s.due ?? 0).toFixed(2)));
    setMethod("cash");
    setNotes("");
  };

  // Search customers for Direct Collection (only when user types a query)
  const { data: custResults = [], isFetching: searchingCust } = useQuery({
    queryKey: ["m-collect-customers", tenantId, custQuery],
    enabled: !!tenantId && directOpen && !selectedCust && custQuery.trim().length > 0,
    queryFn: async () => {
      const term = custQuery.trim();
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await searchCachedCustomers(tenantId, term);
      }
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("id,name,phone,due_balance")
          .eq("tenant_id", tenantId)
          .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
          .order("due_balance", { ascending: false })
          .limit(20);
        if (error) throw error;
        const rows = ((data ?? []) as Array<{ id: string; name: string; phone: string | null; due_balance: number | null }>).map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          due_balance: Number(c.due_balance ?? 0),
        }));
        void cacheCustomers(tenantId, rows).catch(() => {});
        return rows;
      } catch {
        return await searchCachedCustomers(tenantId, term);
      }
    },
  });

  // Authoritative live total due for selected customer
  const { data: liveCustDue } = useQuery({
    queryKey: ["m-collect-cust-due", selectedCust?.id],
    enabled: !!selectedCust?.id && directOpen,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_due_summary", {
        p_customer_id: selectedCust!.id,
      });
      if (error) return selectedCust!.due_balance;
      return Number(data ?? selectedCust!.due_balance);
    },
  });

  const totalCustDue = liveCustDue ?? selectedCust?.due_balance ?? 0;
  const enteredDirectAmt = Math.max(0, Number(directAmount) || 0);
  const currentDueAfter = Math.max(0, Math.round((totalCustDue - enteredDirectAmt) * 100) / 100);

  const directMut = useMutation({
    mutationFn: async () => {
      if (!selectedCust || !tenantId || !branchId) {
        throw new Error("গ্রাহক, স্টোর বা শাখা নির্বাচন করুন");
      }
      const amt = Math.round((Number(directAmount) || 0) * 100) / 100;
      if (amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      const noteText = directNotes.trim() || `Direct collection (${selectedCust.name})`;
      if (isOffline) {
        await queueCollection({
          tenant_id: tenantId,
          customer_id: selectedCust.id,
          amount: amt,
          method: directMethod,
          notes: noteText,
        });
        return { offline: true, remaining_due: Math.max(0, totalCustDue - amt) };
      }
      try {
        return await payFn({
          data: {
            tenantId,
            branchId,
            customer_id: selectedCust.id,
            sale_id: null,
            amount: amt,
            method: directMethod,
            notes: noteText,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if ((typeof navigator !== "undefined" && !navigator.onLine) || /failed to fetch|network|offline|load failed/i.test(msg)) {
          await queueCollection({
            tenant_id: tenantId,
            customer_id: selectedCust.id,
            amount: amt,
            method: directMethod,
            notes: noteText,
          });
          return { offline: true, remaining_due: Math.max(0, totalCustDue - amt) };
        }
        throw err;
      }
    },
    onSuccess: (res) => {
      const offline = Boolean((res as { offline?: boolean } | undefined)?.offline);
      const rem = Number((res as { remaining_due?: number } | undefined)?.remaining_due ?? currentDueAfter);
      toast.success(
        offline
          ? "অফলাইনে কালেকশন সেভ হয়েছে! অনলাইনে এলে অটো সিঙ্ক হবে।"
          : `আদায় সম্পন্ন হয়েছে! বর্তমান বাকি: ${money(rem)}`,
      );
      qc.invalidateQueries({ queryKey: ["m-collect", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-home-kpi", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-collect-customers", tenantId] });
      setDirectOpen(false);
      setSelectedCust(null);
      setCustQuery("");
      setDirectAmount("");
      setDirectNotes("");
    },
    onError: (e: Error) => {
      const msg = e.message || "";
      toast.error(
        msg.trimStart().startsWith("<") || /<!doctype\s+html/i.test(msg)
          ? "সার্ভার আপডেট হয়েছে — অনুগ্রহ করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন"
          : msg || "আদায় করতে সমস্যা হয়েছে",
      );
    },
  });

  const openDirectModal = () => {
    setSelectedCust(null);
    setCustQuery("");
    setDirectAmount("");
    setDirectMethod("cash");
    setDirectNotes("");
    setDirectOpen(true);
  };

  return (
    <PhoneShell title="ক্যাশ কালেক্ট (বাকি আদায়)" back>
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-200/80 bg-white p-3.5 text-center shadow-xs">
          <p className="text-[11px] font-medium text-slate-500">
            আদায় ({DATE_PRESETS.find((p) => p.id === preset)?.label ?? "সব"})
          </p>
          <p className="mt-1 text-lg font-extrabold text-[#0d6e4e]">{money(stats.collected)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200/80 bg-white p-3.5 text-center shadow-xs">
          <p className="text-[11px] font-medium text-slate-500">মোট বাকি ({stats.dueCount}টি)</p>
          <p className="mt-1 text-lg font-extrabold text-rose-600">{money(stats.due)}</p>
        </div>
      </div>

      {/* Direct Collection Button */}
      <button
        type="button"
        onClick={openDirectModal}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d5c46] py-3 text-sm font-bold text-white shadow-xs hover:bg-[#094735] active:scale-[0.98] transition"
      >
        <Plus className="h-4 w-4" />
        ডাইরেক্ট কালেকশন (গ্রাহক থেকে আদায়)
      </button>

      {/* Date Filter + Search + Status Tabs */}
      <div className="mt-3 space-y-2.5">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          {DATE_PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition active:scale-95",
                  active
                    ? "bg-[#0d5c46] text-white border-[#0d5c46] shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2.5">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-slate-500">শুরু</span>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 text-xs border-slate-200"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-slate-500">শেষ</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 text-xs border-slate-200"
              />
            </div>
          </div>
        )}

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

      {/* Direct Customer Collection Dialog */}
      <Dialog open={directOpen} onOpenChange={setDirectOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <HandCoins className="h-5 w-5 text-[#0d5c46]" />
              ডাইরেক্ট কালেকশন
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {!selectedCust ? (
              <div className="space-y-2">
                <Label className="text-xs">গ্রাহকের নাম বা ফোন খুঁজুন *</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={custQuery}
                    onChange={(e) => setCustQuery(e.target.value)}
                    placeholder="গ্রাহকের নাম বা মোবাইল নম্বর লিখুন..."
                    autoFocus
                    className="h-10 rounded-xl pl-9 text-xs"
                  />
                </div>
                {custQuery.trim().length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    গ্রাহকের নাম বা মোবাইল নম্বর লিখলে এখানে ফলাফল দেখাবে
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
                    {searchingCust && (
                      <p className="py-4 text-center text-xs text-slate-500">খুঁজছে...</p>
                    )}
                    {!searchingCust && custResults.length === 0 && (
                      <p className="py-4 text-center text-xs text-slate-500">কোনো গ্রাহক পাওয়া যায়নি</p>
                    )}
                    {custResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCust(c);
                          setDirectAmount(c.due_balance > 0 ? String(c.due_balance.toFixed(2)) : "");
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-transparent bg-white px-3 py-2 text-left text-xs shadow-2xs hover:border-[#0d5c46]/40 active:scale-[0.99] transition"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">{c.name}</p>
                          <p className="text-[11px] text-slate-500">{c.phone || "ফোন নেই"}</p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                            c.due_balance > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-[#0d5c46]",
                          )}
                        >
                          বাকি: {money(c.due_balance)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">{selectedCust.name}</p>
                      {selectedCust.phone && (
                        <p className="text-[11px] text-slate-500">{selectedCust.phone}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCust(null);
                        setDirectAmount("");
                      }}
                      className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:text-slate-800"
                      title="গ্রাহক পরিবর্তন করুন"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex justify-between border-t border-slate-200/80 pt-1.5">
                    <span className="text-slate-500">মোট বাকি (Total Due):</span>
                    <span className="font-bold text-rose-600">{money(totalCustDue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">আদায়ের পর বর্তমান বাকি:</span>
                    <span className={cn("font-extrabold", currentDueAfter > 0 ? "text-amber-700" : "text-[#0d5c46]")}>
                      {money(currentDueAfter)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">কালেকশন পরিমাণ *</Label>
                    {totalCustDue > 0 && (
                      <button
                        type="button"
                        onClick={() => setDirectAmount(String(totalCustDue.toFixed(2)))}
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
                    value={directAmount}
                    onChange={(e) => setDirectAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-11 text-base font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">পেমেন্ট মাধ্যম</Label>
                  <Select value={directMethod} onValueChange={(v) => setDirectMethod(v as any)}>
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
                    value={directNotes}
                    onChange={(e) => setDirectNotes(e.target.value)}
                    placeholder="প্রয়োজনীয় নোট..."
                    className="h-10"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDirectOpen(false)}>
              বাতিল
            </Button>
            {selectedCust && (
              <Button
                type="button"
                onClick={() => directMut.mutate()}
                disabled={directMut.isPending || enteredDirectAmt <= 0}
                className="bg-[#0d5c46] hover:bg-[#094735] text-white gap-1.5"
              >
                {directMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    সেভ হচ্ছে...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    সেভ করুন
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
}
