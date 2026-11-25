import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, ShoppingBag } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneEmpty,
  PhoneKpi,
  PhoneKpiGrid,
  money,
} from "@/components/mobile/phone-ui";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/short-items")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "শর্ট আইটেম — SohojPharma" },
      { name: "description", content: "কম স্টক ও স্টক শেষ হয়ে যাওয়া ওষুধের তালিকা।" },
      { property: "og:title", content: "শর্ট আইটেম — SohojPharma" },
      { property: "og:description", content: "মোবাইলে শর্ট আইটেম খুঁজুন ও দ্রুত অর্ডার করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileShortItems,
});

type Row = {
  id: string;
  name: string;
  strength: string | null;
  medicine_type: string | null;
  reorder_level: number | null;
  purchase_price: number | null;
  retail_price: number | null;
  manufacturers: { name: string | null } | null;
  batches: { qty_on_hand: number | null }[] | null;
};

type Mode = "all" | "out" | "low";

function MobileShortItems() {
  const { currentTenantId } = useAuth();
  const [mode, setMode] = useState<Mode>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ["m-short-items", currentTenantId, debounced],
    enabled: !!currentTenantId,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select(
          "id,name,strength,medicine_type,reorder_level,purchase_price,retail_price,manufacturers(name),batches(qty_on_hand)",
        )
        .eq("tenant_id", currentTenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (debounced) {
        q = q.ilike("name", `%${debounced}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const { shortAll, outCount, lowCount, rows } = useMemo(() => {
    const mapped = data.map((p) => ({
      ...p,
      stock: (p.batches ?? []).reduce((s, b) => s + Number(b.qty_on_hand ?? 0), 0),
      min: Number(p.reorder_level ?? 0),
    }));
    const short = mapped.filter((p) => p.stock <= Math.max(p.min, 0));
    const out = short.filter((p) => p.stock <= 0);
    const low = short.filter((p) => p.stock > 0 && p.stock <= p.min);
    const list = mode === "out" ? out : mode === "low" ? low : short;
    return { shortAll: short, outCount: out.length, lowCount: low.length, rows: list };
  }, [data, mode]);

  return (
    <PhoneShell title="শর্ট আইটেম" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={rows.length} label="শর্ট আইটেম" />
        <PhoneKpi
          tone="sky"
          value={money(rows.reduce((s, r) => s + Number(r.purchase_price ?? 0), 0))}
          label="রিঅর্ডার মূল্য (১ পিস)"
        />
      </PhoneKpiGrid>

      {/* Search + Filter Tabs */}
      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ওষুধের নাম দিয়ে খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>

        <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
          {(
            [
              { id: "all", label: `সব (${shortAll.length})` },
              { id: "out", label: `স্টক শূন্য (${outCount})` },
              { id: "low", label: `কম স্টক (${lowCount})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={cn(
                "rounded-full py-1.5 text-[11px] font-semibold transition",
                mode === t.id
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("mt-3 space-y-2.5 transition-opacity", isFetching && "opacity-60")}>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && rows.length === 0 && (
          <PhoneEmpty message={debounced ? "এই নামে কোনো শর্ট আইটেম পাওয়া যায়নি" : "এই মুহূর্তে কোনো শর্ট আইটেম নেই"} />
        )}
        {rows.map((p) => {
          const isOut = p.stock <= 0;
          return (
            <div
              key={p.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{p.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {[p.medicine_type, p.strength].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {p.manufacturers?.name && (
                    <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-[#0d5c46]">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {p.manufacturers.name}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      isOut ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700",
                    )}
                  >
                    {isOut ? "স্টক শূন্য" : "কম স্টক"}
                  </span>
                  <Link
                    to={"/m/purchase" as never}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2 py-1 text-[10px] font-bold text-[#0d5c46] hover:bg-emerald-100"
                  >
                    <ShoppingBag className="h-3 w-3" />
                    ক্রয় করুন
                  </Link>
                </div>
              </div>

              <div className="phone-grid-keep mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center">
                <div className="rounded-xl bg-slate-50 py-1.5">
                  <p className="text-[10px] text-slate-500">ক্রয়মূল্য</p>
                  <p className="text-xs font-bold text-slate-900">৳{Number(p.purchase_price ?? 0).toFixed(2)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 py-1.5">
                  <p className="text-[10px] text-slate-500">বিক্রয়মূল্য</p>
                  <p className="text-xs font-bold text-slate-900">৳{Number(p.retail_price ?? 0).toFixed(2)}</p>
                </div>
                <div className={cn("rounded-xl py-1.5", isOut ? "bg-rose-50/70" : "bg-amber-50/70")}>
                  <p className="text-[10px] text-slate-500">স্টক / মিনিমাম</p>
                  <p className={cn("text-xs font-extrabold", isOut ? "text-rose-600" : "text-amber-700")}>
                    {p.stock} / {p.min}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PhoneShell>
  );
}
