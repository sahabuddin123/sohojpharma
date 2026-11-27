import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Search, X } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty } from "@/components/mobile/phone-ui";
import {
  getMobileProductAccounting,
  type MobileProductSalesRow,
  type MobileProductStuckRow,
} from "@/lib/api/mobile-products.functions";
import { useAuth } from "@/hooks/use-auth";
import { listCachedProducts } from "@/lib/offline/db";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/products")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "পণ্যের হিসাব — SohojPharma" },
      { name: "description", content: "মোবাইলে পণ্যের বিক্রি, লাভ ও পড়ে থাকা স্টকের হিসাব।" },
    ],
  }),
  component: MobileProducts,
});

type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "custom";

type ProductMode = "sales" | "profit" | "qty" | "stuck";

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

const PAGE_SIZE = 30;

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      return { from: toIsoDate(start), to: today };
    }
    case "last_week": {
      const end = new Date(now);
      end.setDate(end.getDate() - end.getDay() - 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIsoDate(start), to: today };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case "custom":
      return { from: customFrom || undefined, to: customTo || undefined };
  }
}

function formatDisplayDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatMonthYear(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatNum(val: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(val ?? 0));
}

function buildTitleSuffix(name: string, strength?: string | null, medicineType?: string | null): string {
  const lower = name.toLowerCase();
  const parts: string[] = [];
  if (strength && !lower.includes(strength.toLowerCase())) parts.push(strength);
  if (medicineType && !lower.includes(medicineType.toLowerCase())) parts.push(medicineType);
  return parts.join(" ");
}

function formatQtyDisplay(qty: number, qtyPerBox: number, unit?: string | null): string {
  const rounded = Math.round(qty);
  if (qtyPerBox > 1 && rounded >= qtyPerBox) {
    const strips = Math.floor(rounded / qtyPerBox);
    const rem = rounded % qtyPerBox;
    return rem > 0 ? `${formatNum(strips)} পাতা + ${rem}` : `${formatNum(strips)} পাতা`;
  }
  return `${formatNum(rounded)} ${unit || "পিস"}`;
}

function MobileProducts() {
  const { currentTenantId } = useAuth();
  const fetchAccounting = useServerFn(getMobileProductAccounting);

  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState(() => toIsoDate(new Date()));
  const [customTo, setCustomTo] = useState(() => toIsoDate(new Date()));
  const [mode, setMode] = useState<ProductMode>("sales");
  const [showSearch, setShowSearch] = useState(false);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setSearch(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    setPage(1);
  }, [preset, customFrom, customTo, mode, search]);

  const dateRange = useMemo(
    () => getPresetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["m-products-accounting", currentTenantId, dateRange.from, dateRange.to, mode, search, page],
    enabled: !!currentTenantId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const offlineFallback = async () => {
        const tid = currentTenantId!;
        const cached = await listCachedProducts(tid, { search, page, pageSize: PAGE_SIZE });
        const stuckRows: MobileProductStuckRow[] = cached.rows.map((p) => ({
          id: p.id,
          name: p.name,
          strength: p.strength ?? null,
          medicine_type: p.form ?? null,
          generic_name: p.generic_name ?? null,
          unit: p.unit ?? null,
          qty_per_box: p.pcsPerBox,
          manufacturer_name: p.company_name ?? null,
          stock_qty: p.stock,
          stuck_value: Math.round(p.stock * p.cost),
          earliest_expiry: null,
          days_to_expiry: null,
        }));
        const salesRows: MobileProductSalesRow[] = cached.rows.map((p) => {
          const profit = Math.max(0, p.price - p.cost);
          return {
            id: p.id,
            name: p.name,
            strength: p.strength ?? null,
            medicine_type: p.form ?? null,
            generic_name: p.generic_name ?? null,
            unit: p.unit ?? null,
            qty_per_box: p.pcsPerBox,
            manufacturer_name: p.company_name ?? null,
            sold_qty: 0,
            revenue: p.price,
            cost: p.cost,
            profit,
            margin_pct: p.price > 0 ? Math.round((profit / p.price) * 100) : 0,
            stock_qty: p.stock,
            days_left: null,
          };
        });
        return {
          summary: {
            soldBrandCount: cached.stats.totalProducts,
            totalRevenue: cached.stats.stockValue,
            totalProfit: 0,
            totalSoldQty: cached.stats.totalStock,
            stuckBrandCount: cached.stats.inStock + cached.stats.lowStock,
            totalStuckValue: cached.stats.stockValue,
            nextExpiry: null,
          },
          rows: mode === "stuck" ? stuckRows : salesRows,
          totalCount: cached.total,
        };
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await offlineFallback();
      }
      try {
        return await fetchAccounting({
          data: {
            tenantId: currentTenantId!,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            mode,
            search: search || undefined,
            page,
            pageSize: PAGE_SIZE,
          },
        });
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await offlineFallback();
        }
        throw err;
      }
    },
  });

  const summary = data?.summary ?? {
    soldBrandCount: 0,
    totalRevenue: 0,
    totalProfit: 0,
    totalSoldQty: 0,
    stuckBrandCount: 0,
    totalStuckValue: 0,
    nextExpiry: null,
  };

  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const dateRangeLabel =
    preset === "all"
      ? "সব সময়ের হিসাব"
      : `${formatDisplayDate(dateRange.from)} → ${formatDisplayDate(dateRange.to)}`;

  return (
    <PhoneShell
      title="পণ্যের হিসাব"
      back
      help={
        <button
          type="button"
          onClick={() => {
            setShowSearch((s) => !s);
            if (showSearch) setTerm("");
          }}
          aria-label="অনুসন্ধান"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground active:scale-95 transition-transform"
        >
          {showSearch ? <X className="h-4.5 w-4.5" /> : <Search className="h-4.5 w-4.5" />}
        </button>
      }
      contentClassName="space-y-3.5"
    >
      {/* Subtitle bar */}
      <div className="flex items-center justify-between px-0.5 text-xs text-slate-500">
        <span>
          {mode === "stuck"
            ? `${summary.stuckBrandCount}টি ব্র্যান্ড পড়ে আছে`
            : `${summary.soldBrandCount}টি ব্র্যান্ড বিক্রি হয়েছে`}
        </span>
        <span className="font-medium">{dateRangeLabel}</span>
      </div>
        {/* Optional Search Input */}
        {showSearch && (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-xs">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <Input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="ওষুধ, জেনেরিক বা কোম্পানি খুঁজুন..."
              className="h-10 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        )}

        {/* Date Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          {DATE_PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold border transition active:scale-95",
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

        {/* Custom Date Range Pickers */}
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

        {/* Summary Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
          {mode === "stuck" ? (
            <>
              <div className="phone-grid-keep grid grid-cols-3 divide-x divide-slate-100 text-center">
                <div className="px-1">
                  <p className="text-[11px] text-slate-500">আটকে আছে</p>
                  <p className="mt-1 text-base font-extrabold text-[#854d0e]">
                    ৳{formatNum(summary.totalStuckValue)}
                  </p>
                </div>
                <div className="px-1">
                  <p className="text-[11px] text-slate-500">ব্র্যান্ড</p>
                  <p className="mt-1 text-base font-extrabold text-slate-900">
                    {summary.stuckBrandCount}
                  </p>
                </div>
                <div className="px-1">
                  <p className="text-[11px] text-slate-500">পরের ফেরত</p>
                  <p className="mt-1 text-base font-extrabold text-slate-900">
                    {formatMonthYear(summary.nextExpiry)}
                  </p>
                </div>
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2.5 text-center text-[11px] text-slate-500">
                ক্রয়মূল্যে — ডিস্ট্রিবিউটর যত টাকা ফেরত দেবে, বিক্রি করলে যত পেতেন তা নয়।
              </p>
            </>
          ) : (
            <div className="phone-grid-keep grid grid-cols-3 divide-x divide-slate-100 text-center">
              <div className="px-1">
                <p className="text-[11px] text-slate-500">মোট বিক্রি</p>
                <p className="mt-1 text-base font-extrabold text-slate-900">
                  ৳{formatNum(summary.totalRevenue)}
                </p>
              </div>
              <div className="px-1">
                <p className="text-[11px] text-slate-500">মোট লাভ</p>
                <p className="mt-1 text-base font-extrabold text-[#0d6e4e]">
                  ৳{formatNum(summary.totalProfit)}
                </p>
              </div>
              <div className="px-1">
                <p className="text-[11px] text-slate-500">বিক্রিত পিস</p>
                <p className="mt-1 text-base font-extrabold text-slate-900">
                  {formatNum(summary.totalSoldQty)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Segmented Mode Bar + Dead Stock Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="phone-grid-keep grid grid-cols-3 flex-1 rounded-full bg-[#e9eeea] p-1">
            {(
              [
                { id: "sales", label: "বিক্রি" },
                { id: "profit", label: "লাভ" },
                { id: "qty", label: "পরিমাণ" },
              ] as const
            ).map((tab) => {
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMode(tab.id)}
                  className={cn(
                    "rounded-full py-1.5 text-xs font-semibold transition",
                    active
                      ? "bg-[#0d5c46] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setMode((m) => (m === "stuck" ? "sales" : "stuck"))}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition active:scale-95",
              mode === "stuck"
                ? "bg-[#094735] text-white ring-2 ring-[#0d5c46]/30"
                : "bg-[#0d5c46] text-white hover:bg-[#094735]",
            )}
          >
            {summary.stuckBrandCount}টি পড়ে আছে
          </button>
        </div>

        {/* Product List */}
        <div className="space-y-3 pt-0.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d5c46] mb-2" />
              <span className="text-xs">হিসাব লোড হচ্ছে...</span>
            </div>
          ) : rows.length === 0 ? (
            <PhoneEmpty
              message={
                mode === "stuck"
                  ? "পড়ে থাকা কোনো পণ্য পাওয়া যায়নি"
                  : "এই সময়ে কোনো পণ্য বিক্রি পাওয়া যায়নি"
              }
            />
          ) : mode === "stuck" ? (
            (rows as MobileProductStuckRow[]).map((r) => {
              const titleSuffix = buildTitleSuffix(r.name, r.strength, r.medicine_type);
              const subLine = [
                r.manufacturer_name,
                `${formatQtyDisplay(r.stock_qty, r.qty_per_box, r.unit)} দোকানে আছে`,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] leading-snug text-slate-900">
                        <span className="font-bold">{r.name}</span>
                        {titleSuffix && (
                          <span className="font-normal text-slate-700"> {titleSuffix}</span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{subLine}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-extrabold text-[#854d0e]">
                        ৳{formatNum(r.stuck_value)}
                      </p>
                      <p className="text-[11px] text-slate-500">আটকে আছে</p>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
                    {r.earliest_expiry ? (
                      <span>
                        {formatMonthYear(r.earliest_expiry)} তারিখের মধ্যে ফেরত ·{" "}
                        {r.days_to_expiry !== null && r.days_to_expiry > 0
                          ? `আর ${r.days_to_expiry} দিন`
                          : "মেয়াদোত্তীর্ণ"}
                      </span>
                    ) : (
                      <span>দোকানে মজুদ: {formatNum(r.stock_qty)} {r.unit || "পিস"}</span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            (rows as MobileProductSalesRow[]).map((r) => {
              const titleSuffix = buildTitleSuffix(r.name, r.strength, r.medicine_type);
              const subLine = [r.manufacturer_name, r.generic_name].filter(Boolean).join(" · ") || "—";
              const outOfStock = r.stock_qty <= 0;

              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] leading-snug text-slate-900">
                        <span className="font-bold">{r.name}</span>
                        {titleSuffix && (
                          <span className="font-normal text-slate-700"> {titleSuffix}</span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{subLine}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-extrabold text-slate-900">
                        ৳{formatNum(r.revenue)}
                      </p>
                      <p className="text-[11px] text-slate-500">{r.margin_pct}% লাভ</p>
                    </div>
                  </div>

                  <div className="phone-grid-keep mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                    <div>
                      <p className="text-[11px] text-slate-500">বিক্রি</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">
                        {formatQtyDisplay(r.sold_qty, r.qty_per_box, r.unit)}
                      </p>
                    </div>
                    <div className="border-l border-slate-100 pl-3">
                      <p className="text-[11px] text-slate-500">লাভ</p>
                      <p className="mt-0.5 text-sm font-bold text-[#0d6e4e]">
                        ৳{formatNum(r.profit)}
                      </p>
                    </div>
                    <div className="border-l border-slate-100 pl-3">
                      <p className="text-[11px] text-slate-500">চলবে</p>
                      <p
                        className={cn(
                          "mt-0.5 text-sm font-bold",
                          outOfStock ? "text-[#854d0e]" : "text-slate-900",
                        )}
                      >
                        {r.days_left !== null ? `${r.days_left} দিন` : "—"}
                      </p>
                    </div>
                  </div>

                  {outOfStock && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        স্টক শেষ — {formatNum(r.sold_qty)} {r.unit || "পিস"} বিক্রি হয়েছে, বিক্রি করার মতো কিছু নেই।
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              আগের পাতা
            </Button>
            <span className="text-xs text-slate-500">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              পরের পাতা
            </Button>
          </div>
        )}
    </PhoneShell>
  );
}
