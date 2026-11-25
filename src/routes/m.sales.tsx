import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ChevronRight, Search, UserRound } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneEmpty,
  PhoneKpi,
  PhoneKpiGrid,
  money,
} from "@/components/mobile/phone-ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/sales")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "বিক্রি রেকর্ড — SohojPharma" },
      { name: "description", content: "দৈনিক বিক্রি, বাকি ও ইনভয়েস বিস্তারিত।" },
      { property: "og:title", content: "বিক্রি রেকর্ড — SohojPharma" },
      { property: "og:description", content: "মোবাইলে তারিখ অনুযায়ী বিক্রি ও ইনভয়েস দেখুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileSaleRecord,
});

type DatePreset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";
type StatusTab = "all" | "paid" | "due";

type SaleRow = {
  id: string;
  invoice_no: string | null;
  sale_date: string | null;
  created_at: string;
  total: number | null;
  paid: number | null;
  due: number | null;
  discount: number | null;
  status: string | null;
  customer: { name: string | null; phone: string | null } | null;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getStatusBadge(s: SaleRow): { label: string; cls: string } {
  if (s.status === "void") return { label: "বাতিল", cls: "bg-slate-100 text-slate-600" };
  const due = Number(s.due ?? 0);
  const paid = Number(s.paid ?? 0);
  if (due <= 0.01) return { label: "পরিশোধিত", cls: "bg-emerald-50 text-[#0d5c46]" };
  if (paid > 0) return { label: "আংশিক", cls: "bg-amber-50 text-amber-700" };
  return { label: "বাকি", cls: "bg-rose-50 text-rose-600" };
}

function MobileSaleRecord() {
  const { currentTenantId } = useAuth();
  const todayStr = toYmd(new Date());
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");

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
    queryKey: ["m-sales", currentTenantId, from, to],
    enabled: !!currentTenantId,
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("id,invoice_no,sale_date,created_at,total,paid,due,discount,status,customer:customers(name,phone)")
        .eq("tenant_id", currentTenantId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (from) q = q.gte("created_at", `${from}T00:00:00+06:00`);
      if (to) q = q.lte("created_at", `${to}T23:59:59.999+06:00`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((s) => {
      if (statusTab === "paid" && (s.status === "void" || Number(s.due ?? 0) > 0.01)) return false;
      if (statusTab === "due" && (s.status === "void" || Number(s.due ?? 0) <= 0.01)) return false;
      if (!q) return true;
      const inv = (s.invoice_no ?? "").toLowerCase();
      const cname = (s.customer?.name ?? "").toLowerCase();
      const cphone = (s.customer?.phone ?? "").toLowerCase();
      return inv.includes(q) || cname.includes(q) || cphone.includes(q);
    });
  }, [data, search, statusTab]);

  const stats = useMemo(() => {
    let total = 0, due = 0, paid = 0, count = 0;
    for (const s of filtered) {
      if (s.status === "void") continue;
      count += 1;
      total += Number(s.total ?? 0);
      due += Number(s.due ?? 0);
      paid += Number(s.paid ?? 0);
    }
    return { total, due, paid, count };
  }, [filtered]);

  return (
    <PhoneShell title="বিক্রি রেকর্ড" back>
      <PhoneKpiGrid>
        <PhoneKpi wide tone="mint" value={money(stats.total)} label={`মোট বিক্রি (${stats.count}টি)`} />
        <PhoneKpi tone="sky" accent="success" value={money(stats.paid)} label="নগদ আদায়" />
        <PhoneKpi tone="rose" accent="warning" value={money(stats.due)} label="বাকি আছে" />
      </PhoneKpiGrid>

      {/* Date Filter + Search + Status */}
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
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ইনভয়েস নং, গ্রাহকের নাম বা ফোন খুঁজুন..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#0d5c46] focus:bg-white"
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["all", "সব"],
              ["paid", "পরিশোধিত"],
              ["due", "বাকি আছে"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusTab(key)}
              className={cn(
                "rounded-lg py-1.5 text-[11px] font-semibold transition",
                statusTab === key
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice List */}
      <div className={cn("mt-3 space-y-2.5 transition-opacity", isFetching && "opacity-60")}>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && filtered.length === 0 && (
          <PhoneEmpty message="নির্বাচিত তারিখে কোনো বিক্রি পাওয়া যায়নি" />
        )}
        {filtered.map((s) => {
          const badge = getStatusBadge(s);
          const dueAmt = Number(s.due ?? 0);
          return (
            <Link
              key={s.id}
              to={"/m/invoice/$saleId" as never}
              params={{ saleId: s.id } as never}
              className="block rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)] active:scale-[0.99] transition hover:border-[#0d5c46]/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-[#0d5c46]">
                      {s.invoice_no ?? s.id.slice(0, 8)}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-slate-600">
                    <UserRound className="h-3 w-3 shrink-0 text-slate-400" />
                    {s.customer?.name || "সাধারণ গ্রাহক"}
                    {s.customer?.phone ? ` · ${s.customer.phone}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-slate-400">
                    {new Date(s.created_at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#0d5c46]">
                    বিস্তারিত <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center">
                <div className="rounded-lg bg-slate-50 px-1.5 py-1.5">
                  <p className="text-[10px] text-slate-500">মোট বিল</p>
                  <p className="text-xs font-bold text-slate-900">{money(s.total)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50/60 px-1.5 py-1.5">
                  <p className="text-[10px] text-slate-500">পরিশোধ</p>
                  <p className="text-xs font-bold text-[#0d5c46]">{money(s.paid)}</p>
                </div>
                <div className={cn("rounded-lg px-1.5 py-1.5", dueAmt > 0 ? "bg-rose-50/70" : "bg-slate-50")}>
                  <p className="text-[10px] text-slate-500">বাকি</p>
                  <p className={cn("text-xs font-bold", dueAmt > 0 ? "text-rose-600" : "text-slate-600")}>
                    {money(s.due)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </PhoneShell>
  );
}
