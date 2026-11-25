import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Search } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/expired")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "মেয়াদোত্তীর্ণ — SohojPharma" },
      { name: "description", content: "মেয়াদোত্তীর্ণ ও মেয়াদ কাছাকাছি থাকা ওষুধের ব্যাচ।" },
      { property: "og:title", content: "মেয়াদোত্তীর্ণ — SohojPharma" },
      { property: "og:description", content: "মেয়াদোত্তীর্ণ ও আসন্ন মেয়াদ শেষ হওয়ার ওষুধ দেখুন।" },
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
  purchase_price: number | null;
  batch_no: string | null;
  products: {
    name: string | null;
    strength: string | null;
    medicine_type: string | null;
    manufacturers: { name: string | null } | null;
  } | null;
};

type WindowKey = 0 | 30 | 60 | 90 | 180;

function MobileExpired() {
  const { currentTenantId } = useAuth();
  const [days, setDays] = useState<WindowKey>(60);
  const [search, setSearch] = useState("");

  const todayIso = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ["m-expired", currentTenantId, days],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const until = new Date(Date.now() + 6 * 60 * 60 * 1000);
      until.setDate(until.getDate() + days);
      const untilIso = until.toISOString().slice(0, 10);
      let q = supabase
        .from("batches")
        .select("id,expiry_date,qty_on_hand,purchase_price,batch_no,products(name,strength,medicine_type,manufacturers(name))")
        .eq("tenant_id", currentTenantId!)
        .is("deleted_at", null)
        .gt("qty_on_hand", 0)
        .not("expiry_date", "is", null)
        .order("expiry_date", { ascending: true })
        .limit(400);
      if (days === 0) {
        q = q.lt("expiry_date", todayIso);
      } else {
        q = q.lte("expiry_date", untilIso);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BatchRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (b) =>
        (b.products?.name?.toLowerCase().includes(q) ?? false) ||
        (b.batch_no?.toLowerCase().includes(q) ?? false) ||
        (b.products?.manufacturers?.name?.toLowerCase().includes(q) ?? false),
    );
  }, [data, search]);

  const totalRiskValue = useMemo(
    () =>
      filtered.reduce(
        (s, b) => s + Number(b.qty_on_hand ?? 0) * Number(b.purchase_price ?? 0),
        0,
      ),
    [filtered],
  );

  const groups = useMemo(() => {
    const map = new Map<string, BatchRow[]>();
    for (const b of filtered) {
      const key = b.expiry_date ?? "—";
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const daysLeft = (dateStr: string) => {
    const t0 = new Date(todayIso).getTime();
    const t1 = new Date(dateStr).getTime();
    return Math.ceil((t1 - t0) / 86_400_000);
  };

  return (
    <PhoneShell title="মেয়াদোত্তীর্ণ পণ্য" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={filtered.length} label="মোট ব্যাচ" />
        <PhoneKpi tone="sky" value={money(totalRiskValue)} label="স্টক মূল্য" />
      </PhoneKpiGrid>

      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              [0, "মেয়াদ শেষ"],
              [30, "৩০ দিন"],
              [60, "৬০ দিন"],
              [90, "৯০ দিন"],
              [180, "১৮০ দিন"],
            ] as const
          ).map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                days === d
                  ? "bg-[#0d5c46] text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ওষুধের নাম, ব্যাচ বা কোম্পানি খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>
      </div>

      <div className={cn("mt-3 space-y-4 transition-opacity", isFetching && "opacity-60")}>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && groups.length === 0 && (
          <PhoneEmpty message="নির্বাচিত সময়ের মধ্যে কোনো মেয়াদোত্তীর্ণ বা কাছাকাছি ব্যাচ নেই" />
        )}
        {groups.map(([date, rows]) => {
          const left = date !== "—" ? daysLeft(date) : 0;
          const isPast = left < 0;
          return (
            <section key={date} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className={cn("flex items-center gap-1.5 text-xs font-bold", isPast ? "text-rose-600" : "text-amber-700")}>
                  <CalendarDays className="h-3.5 w-3.5" />
                  {date === "—" ? "—" : new Date(date).toLocaleDateString("en-GB").replace(/\//g, "-")}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    isPast ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700",
                  )}
                >
                  {isPast ? `${Math.abs(left)} দিন আগে মেয়াদ শেষ` : left === 0 ? "আজ মেয়াদ শেষ" : `${left} দিন বাকি`}
                </span>
              </div>
              {rows.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-900">{b.products?.name ?? "—"}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {[b.products?.medicine_type, b.products?.strength].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {b.products?.manufacturers?.name && (
                        <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-[#0d5c46]">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {b.products.manufacturers.name}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-slate-900">
                        {Number(b.qty_on_hand ?? 0)} পিস
                      </p>
                      <p className="text-[11px] text-slate-500">ব্যাচ: {b.batch_no ?? "—"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </PhoneShell>
  );
}
