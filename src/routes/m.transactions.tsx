import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Calendar, Search } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/transactions")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "লেনদেন — SohojPharma" },
      { name: "description", content: "গ্রাহক আদায়, সরবরাহকারী পরিশোধ ও খরচের হিসাব।" },
      { property: "og:title", content: "লেনদেন — SohojPharma" },
      { property: "og:description", content: "মোবাইলে সকল লেনদেন তারিখ অনুযায়ী দেখুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileTransactions,
});

type DatePreset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";
type KindFilter = "all" | "Customer" | "Supplier";

type Txn = {
  id: string;
  name: string;
  phone: string | null;
  kind: "Customer" | "Supplier";
  method: string;
  amount: number;
  date: string;
  reference: string | null;
  notes: string | null;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function methodLabel(m: string): string {
  const k = m.toLowerCase();
  if (k === "cash") return "নগদ";
  if (k === "bkash") return "বিকাশ";
  if (k === "nagad") return "নগদ অ্যাপ";
  if (k === "rocket") return "রকেট";
  if (k === "bank") return "ব্যাংক";
  if (k === "card") return "কার্ড";
  return m.toUpperCase();
}

function MobileTransactions() {
  const { currentTenantId } = useAuth();
  const todayStr = toYmd(new Date());
  const [preset, setPreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);
  const [filter, setFilter] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Txn | null>(null);

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (preset === "today") return { from: todayStr, to: todayStr };
    if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toYmd(y);
      return { from: yStr, to: yStr };
    }
    if (preset === "7d") {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { from: toYmd(s), to: todayStr };
    }
    if (preset === "month") return { from: `${todayStr.slice(0, 7)}-01`, to: todayStr };
    if (preset === "all") return { from: "", to: "" };
    return { from: customFrom || todayStr, to: customTo || customFrom || todayStr };
  }, [preset, todayStr, customFrom, customTo]);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ["m-transactions", currentTenantId, from, to],
    enabled: !!currentTenantId,
    queryFn: async (): Promise<Txn[]> => {
      let qCp = supabase
        .from("customer_payments")
        .select("id,amount,method,payment_date,reference,notes,created_at,customers(name,phone)")
        .eq("tenant_id", currentTenantId!)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      let qSp = supabase
        .from("supplier_payments")
        .select("id,amount,method,payment_date,reference,notes,created_at,suppliers(name,phone)")
        .eq("tenant_id", currentTenantId!)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);

      if (from) {
        qCp = qCp.gte("payment_date", from);
        qSp = qSp.gte("payment_date", from);
      }
      if (to) {
        qCp = qCp.lte("payment_date", to);
        qSp = qSp.lte("payment_date", to);
      }

      const [cp, sp] = await Promise.all([qCp, qSp]);
      if (cp.error) throw cp.error;
      if (sp.error) throw sp.error;

      type R = {
        id: string;
        amount: number;
        method: string;
        payment_date: string;
        reference: string | null;
        notes: string | null;
        created_at: string;
      };
      const rows: (Txn & { sortKey: string })[] = [
        ...((cp.data ?? []) as unknown as Array<R & { customers: { name: string | null; phone: string | null } | null }>).map(
          (r) => ({
            id: `c-${r.id}`,
            name: r.customers?.name ?? "সাধারণ গ্রাহক",
            phone: r.customers?.phone ?? null,
            kind: "Customer" as const,
            method: String(r.method || "cash"),
            amount: Number(r.amount),
            date: r.payment_date,
            reference: r.reference ?? null,
            notes: r.notes ?? null,
            sortKey: `${r.payment_date}T${r.created_at}`,
          }),
        ),
        ...((sp.data ?? []) as unknown as Array<R & { suppliers: { name: string | null; phone: string | null } | null }>).map(
          (r) => ({
            id: `s-${r.id}`,
            name: r.suppliers?.name ?? "সরবরাহকারী",
            phone: r.suppliers?.phone ?? null,
            kind: "Supplier" as const,
            method: String(r.method || "cash"),
            amount: Number(r.amount),
            date: r.payment_date,
            reference: r.reference ?? null,
            notes: r.notes ?? null,
            sortKey: `${r.payment_date}T${r.created_at}`,
          }),
        ),
      ];
      return rows
        .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
        .map(({ sortKey: _k, ...rest }) => rest);
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      if (filter !== "all" && r.kind !== filter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.phone?.toLowerCase().includes(q) ?? false) ||
        (r.reference?.toLowerCase().includes(q) ?? false) ||
        (r.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [data, filter, search]);

  const stats = useMemo(() => {
    let inAmt = 0, outAmt = 0;
    for (const r of rows) {
      if (r.kind === "Customer") inAmt += r.amount;
      else outAmt += r.amount;
    }
    return { inAmt, outAmt };
  }, [rows]);

  return (
    <PhoneShell title="লেনদেন" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="mint" accent="success" value={money(stats.inAmt)} label="গ্রাহক আদায় (ইন)" />
        <PhoneKpi tone="rose" accent="danger" value={money(stats.outAmt)} label="সরবরাহকারী পে (আউট)" />
      </PhoneKpiGrid>

      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <Calendar className="mr-0.5 h-3.5 w-3.5 shrink-0 text-[#0d5c46]" />
          {(
            [
              ["today", "আজ"],
              ["yesterday", "গতকাল"],
              ["7d", "৭ দিন"],
              ["month", "এই মাস"],
              ["all", "সব"],
              ["custom", "তারিখ"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                preset === key
                  ? "bg-[#0d5c46] text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium text-slate-500">শুরু</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || todayStr}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium text-slate-500">শেষ</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={todayStr}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
              />
            </label>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="নাম, ফোন বা রেফারেন্স খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>

        <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
          {(
            [
              ["all", "সব"],
              ["Customer", "গ্রাহক (আদায়)"],
              ["Supplier", "সরবরাহকারী"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full py-1.5 text-[11px] font-semibold transition",
                filter === key
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("mt-3 space-y-2.5 transition-opacity", isFetching && "opacity-60")}>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && rows.length === 0 && <PhoneEmpty message="নির্বাচিত সময়ে কোনো লেনদেন পাওয়া যায়নি" />}
        {rows.map((r) => {
          const isCustomer = r.kind === "Customer";
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r)}
              className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left shadow-[0_1px_4px_rgba(0,0,0,0.03)] active:scale-[0.99] transition hover:border-[#0d5c46]/40"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className={cn(
                    "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    isCustomer ? "bg-emerald-50 text-[#0d5c46]" : "bg-rose-50 text-rose-600",
                  )}
                >
                  {isCustomer ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{r.name}</p>
                  <p className="truncate text-xs text-slate-500">{r.phone ?? "—"}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        isCustomer ? "bg-emerald-50 text-[#0d5c46]" : "bg-rose-50 text-rose-600",
                      )}
                    >
                      {isCustomer ? "গ্রাহক আদায়" : "সরবরাহকারী পে"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {methodLabel(r.method)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("text-sm font-extrabold", isCustomer ? "text-[#0d5c46]" : "text-rose-600")}>
                  {isCustomer ? "+" : "−"}{money(r.amount)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {new Date(r.date).toLocaleDateString("en-GB").replace(/\//g, "-")}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">লেনদেন বিস্তারিত</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">ধরন:</span>
                <span className="font-bold">{selected.kind === "Customer" ? "গ্রাহক আদায়" : "সরবরাহকারী পরিশোধ"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">নাম:</span>
                <span className="font-bold text-slate-900">{selected.name}</span>
              </div>
              {selected.phone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">ফোন:</span>
                  <span>{selected.phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">পরিমাণ:</span>
                <span className="font-extrabold text-[#0d5c46]">{money(selected.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">মাধ্যম:</span>
                <span className="font-semibold">{methodLabel(selected.method)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">তারিখ:</span>
                <span>{new Date(selected.date).toLocaleDateString("en-GB")}</span>
              </div>
              {selected.reference && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">রেফারেন্স:</span>
                  <span className="text-right">{selected.reference}</span>
                </div>
              )}
              {selected.notes && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">নোট:</span>
                  <span className="text-right text-slate-700">{selected.notes}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelected(null)}>
              বন্ধ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
}
