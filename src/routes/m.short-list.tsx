import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CheckSquare, Copy, Search, ShoppingBag, Square } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/short-list")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "শর্ট লিস্ট — SohojPharma" },
      { name: "description", content: "দোকানের শর্ট লিস্ট তৈরি, কোম্পানি অনুযায়ী ফিল্টার ও শেয়ার করুন।" },
    ],
  }),
  component: MobileShortList,
});

type Row = {
  id: string;
  name: string;
  strength: string | null;
  medicine_type: string | null;
  reorder_level: number | null;
  purchase_price: number | null;
  manufacturers: { name: string | null } | null;
  batches: { qty_on_hand: number | null }[] | null;
};

function MobileShortList() {
  const { currentTenantId } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ["m-short-list", currentTenantId, debounced],
    enabled: !!currentTenantId,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id,name,strength,medicine_type,reorder_level,purchase_price,manufacturers(name),batches(qty_on_hand)")
        .eq("tenant_id", currentTenantId!)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (debounced) q = q.ilike("name", `%${debounced}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const { companies, rows } = useMemo(() => {
    const mapped = data
      .map((p) => {
        const stock = (p.batches ?? []).reduce((s, b) => s + Number(b.qty_on_hand ?? 0), 0);
        const min = Number(p.reorder_level ?? 0);
        const needed = Math.max(1, min > stock ? min - stock : 1);
        return {
          ...p,
          stock,
          min,
          needed,
          company: p.manufacturers?.name ?? "অন্যান্য",
        };
      })
      .filter((p) => p.stock <= Math.max(p.min, 0));

    const compSet = Array.from(new Set(mapped.map((m) => m.company))).sort();
    const filtered = companyFilter === "all" ? mapped : mapped.filter((m) => m.company === companyFilter);
    return { companies: compSet, rows: filtered };
  }, [data, companyFilter]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds[r.id]),
    [rows, selectedIds],
  );

  const toggleAll = () => {
    if (selectedRows.length === rows.length && rows.length > 0) {
      setSelectedIds({});
    } else {
      const next: Record<string, boolean> = {};
      rows.forEach((r) => {
        next[r.id] = true;
      });
      setSelectedIds(next);
    }
  };

  const copyList = async () => {
    const target = selectedRows.length > 0 ? selectedRows : rows;
    if (target.length === 0) return;
    const text = target
      .map((r, i) => `${i + 1}. ${r.name}${r.strength ? ` (${r.strength})` : ""} — দরকার: ${r.needed} (${r.company})`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${target.length}টি পণ্যের শর্ট লিস্ট কপি হয়েছে!`);
    } catch {
      toast.error("কপি করা যায়নি");
    }
  };

  const estCost = (selectedRows.length > 0 ? selectedRows : rows).reduce(
    (s, r) => s + Number(r.purchase_price ?? 0) * r.needed,
    0,
  );

  return (
    <PhoneShell title="শর্ট লিস্ট" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={rows.length} label="মোট শর্ট লিস্ট" />
        <PhoneKpi tone="sky" value={money(estCost)} label="আনুমানিক ক্রয়মূল্য" />
      </PhoneKpiGrid>

      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ওষুধের নাম লিখে খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setCompanyFilter("all")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition",
              companyFilter === "all"
                ? "bg-[#0d5c46] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            সব কোম্পানি
          </button>
          {companies.slice(0, 15).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCompanyFilter(c)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition",
                companyFilter === c
                  ? "bg-[#0d5c46] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700"
          >
            {selectedRows.length === rows.length && rows.length > 0 ? (
              <CheckSquare className="h-4 w-4 text-[#0d5c46]" />
            ) : (
              <Square className="h-4 w-4 text-slate-400" />
            )}
            {selectedRows.length > 0 ? `${selectedRows.length}টি নির্বাচিত` : "সব নির্বাচন"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyList}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
            >
              <Copy className="h-3.5 w-3.5" />
              লিস্ট কপি
            </button>
            <Link
              to={"/m/purchase" as never}
              className="inline-flex items-center gap-1 rounded-xl bg-[#0d5c46] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#094735]"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              নতুন ক্রয়
            </Link>
          </div>
        </div>
      </div>

      <div className={cn("mt-3 space-y-2.5 transition-opacity", isFetching && "opacity-60")}>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && rows.length === 0 && (
          <PhoneEmpty message="কোনো শর্ট লিস্ট আইটেম পাওয়া যায়নি" />
        )}
        {rows.map((p) => {
          const checked = !!selectedIds[p.id];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedIds((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-2xl border bg-white p-3.5 text-left shadow-[0_1px_4px_rgba(0,0,0,0.03)] transition",
                checked ? "border-[#0d5c46] bg-emerald-50/30" : "border-slate-200/90",
              )}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {checked ? (
                  <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#0d5c46]" />
                ) : (
                  <Square className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[p.medicine_type, p.strength].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-[#0d5c46]">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {p.company}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold",
                    p.stock <= 0 ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700",
                  )}
                >
                  স্টক: {p.stock}
                </span>
                <p className="mt-1 text-xs font-bold text-slate-800">দরকার: {p.needed}</p>
              </div>
            </button>
          );
        })}
      </div>
    </PhoneShell>
  );
}
