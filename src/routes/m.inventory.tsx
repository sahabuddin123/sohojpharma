import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Flame,
  Layers,
  Loader2,
  Package,
  PackageMinus,
  Search,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  inventoryAdjust,
  inventoryExpireBatches,
  inventoryPhysicalCount,
  listInventoryInStockProducts,
  type InventoryInStockSortBy,
  type InventoryInStockSortDir,
} from "@/lib/api/inventory.functions";
import {
  createDamageEntry,
  expirySummary,
  listBatches,
} from "@/lib/api/inventory-control.functions";
import { buildProductDisplayName } from "@/lib/product-display";
import { listCachedProducts } from "@/lib/offline/db";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/inventory")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "ইনভেন্টরি — SohojPharma" },
      {
        name: "description",
        content: "মোবাইল ইনভেন্টরি: স্টক তালিকা, ব্যাচ ও মেয়াদ নিয়ন্ত্রণ, স্টক অ্যাডজাস্ট, ড্যামেজ ও লো-স্টক সতর্কতা।",
      },
    ],
  }),
  component: MobileInventoryPage,
});

type TabKey = "stock" | "batches" | "alerts" | "expiry";
type BatchFilter = "all" | "30" | "90" | "expired";

type ProductMini = {
  strength?: string | null;
  medicine_type?: string | null;
  volume?: string | null;
  pack_size?: number | null;
};
type LowRow = { id: string; name: string; sku: string | null; stock: number; reorder_level: number | null } & ProductMini;
type OutRow = { id: string; name: string; sku: string | null; reorder_level: number | null } & ProductMini;
type ExpRow = { name: string; batch: string; days: number } & ProductMini;
type OverviewResp = {
  kpi: {
    totalStock: number;
    totalValue: number;
    lowCount: number;
    outCount: number;
    noBatchCount: number;
    noOpeningCount: number;
    expiredCount: number;
  };
  lowStock: LowRow[] | null;
  outStock: OutRow[] | null;
  expiring: ExpRow[] | null;
};

type BatchRow = {
  id: string;
  batch_no: string;
  expiry_date: string;
  qty_on_hand: number | string;
  purchase_price: number | string;
  products: ({
    id: string;
    name: string;
    sku: string | null;
    retail_price: number | null;
  } & ProductMini) | null;
};

function fmtNum(n: number | undefined | null): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n ?? 0));
}

function fmtMoney(n: number | undefined | null): string {
  return `৳${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(n ?? 0))}`;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((target - now) / 86_400_000);
}

const DAMAGE_REASONS = [
  { value: "broken", label: "ভাঙা / নষ্ট (Broken)" },
  { value: "expired", label: "মেয়াদোত্তীর্ণ (Expired)" },
  { value: "water_damage", label: "পানিতে নষ্ট (Water Damage)" },
  { value: "packaging", label: "প্যাকেজিং নষ্ট (Packaging)" },
  { value: "supplier_defect", label: "সাপ্লায়ার ত্রুটি (Defect)" },
  { value: "other", label: "অন্যান্য (Other)" },
] as const;

function MobileInventoryPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { currentTenantId, activeBranchId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const [tab, setTab] = useState<TabKey>("stock");

  // Stock tab state
  const [stockSearch, setStockSearch] = useState("");
  const [stockPage, setStockPage] = useState(1);
  const [sortBy, setSortBy] = useState<InventoryInStockSortBy>("name");
  const [sortDir, setSortDir] = useState<InventoryInStockSortDir>("asc");

  // Batches tab state
  const [batchSearch, setBatchSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState<BatchFilter>("all");

  // Modals for batch actions
  const [countModalBatch, setCountModalBatch] = useState<BatchRow | null>(null);
  const [countMode, setCountMode] = useState<"count" | "adjust">("count");
  const [countQty, setCountQty] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [countReason, setCountReason] = useState("");

  const [damageModalBatch, setDamageModalBatch] = useState<BatchRow | null>(null);
  const [damageQty, setDamageQty] = useState("");
  const [damageReason, setDamageReason] = useState<(typeof DAMAGE_REASONS)[number]["value"]>("broken");
  const [damageNotes, setDamageNotes] = useState("");

  const listInStockFn = useServerFn(listInventoryInStockProducts);
  const listBatchesFn = useServerFn(listBatches);
  const expirySummaryFn = useServerFn(expirySummary);
  const physicalCountFn = useServerFn(inventoryPhysicalCount);
  const adjustFn = useServerFn(inventoryAdjust);
  const damageFn = useServerFn(createDamageEntry);
  const expireBatchesFn = useServerFn(inventoryExpireBatches);

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["inventory-overview", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<OverviewResp> => {
      const offlineOverview = async (): Promise<OverviewResp> => {
        const cached = await listCachedProducts(tenantId, { page: 1, pageSize: 1 });
        return {
          kpi: {
            totalStock: cached.stats.totalStock,
            totalValue: cached.stats.stockValue,
            lowCount: cached.stats.lowStock,
            outCount: cached.stats.outOfStock,
            noBatchCount: 0,
            noOpeningCount: 0,
            expiredCount: 0,
          },
          lowStock: [],
          outStock: [],
          expiring: [],
        };
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await offlineOverview();
      }
      try {
        const { data, error } = await supabase.rpc("get_inventory_overview", { _tenant_id: tenantId });
        if (error) throw error;
        return (data ?? null) as unknown as OverviewResp;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await offlineOverview();
        }
        throw err;
      }
    },
  });

  const { data: stockItemCount } = useQuery({
    queryKey: ["inventory-stock-item-count", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const offlineCnt = async () => {
        const cached = await listCachedProducts(tenantId, { inStockOnly: true, page: 1, pageSize: 1 });
        return cached.total;
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await offlineCnt();
      }
      try {
        const { data, error } = await supabase.rpc("count_products_with_stock", { _tenant_id: tenantId });
        if (error) throw error;
        return Number(data ?? 0);
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await offlineCnt();
        }
        throw err;
      }
    },
  });

  const { data: stockData, isFetching: fetchingStock } = useQuery({
    queryKey: ["m-inv-stock", tenantId, stockSearch, stockPage, sortBy, sortDir],
    enabled: !!tenantId && tab === "stock",
    staleTime: 20_000,
    queryFn: async () => {
      const offlineStock = async () => {
        const res = await listCachedProducts(tenantId, {
          inStockOnly: true,
          search: stockSearch.trim(),
          page: stockPage,
          pageSize: 25,
          sortBy: sortBy === "stock" ? "stock" : "name",
          sortDir,
        });
        return {
          rows: res.rows.map((p) => ({
            id: p.id,
            name: p.name,
            generic_name: p.generic_name ?? null,
            manufacturer_name: p.company_name ?? null,
            stock: p.stock,
            purchase_price: p.cost,
            retail_price: p.price,
            mrp: p.price,
          })),
          totalCount: res.total,
          currentPage: stockPage,
          totalPages: Math.max(1, Math.ceil(res.total / 25)),
        };
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await offlineStock();
      }
      try {
        return await listInStockFn({
          data: {
            tenantId,
            search: stockSearch.trim(),
            page: stockPage,
            pageSize: 25,
            sortBy,
            sortDir,
          },
        });
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await offlineStock();
        }
        throw err;
      }
    },
  });

  const maxDaysToExpiry =
    batchFilter === "30" ? 30 : batchFilter === "90" ? 90 : batchFilter === "expired" ? 0 : undefined;

  const { data: batchesRaw, isFetching: fetchingBatches } = useQuery({
    queryKey: ["m-inv-batches", tenantId, batchSearch, batchFilter],
    enabled: !!tenantId && tab === "batches",
    staleTime: 20_000,
    queryFn: () =>
      listBatchesFn({
        data: {
          tenantId,
          search: batchSearch.trim() || undefined,
          maxDaysToExpiry,
          onlyInStock: true,
        },
      }),
  });

  const batches = useMemo(() => {
    const rows = (batchesRaw ?? []) as unknown as BatchRow[];
    if (batchFilter === "expired") {
      return rows.filter((b) => daysUntil(b.expiry_date) < 0);
    }
    return rows;
  }, [batchesRaw, batchFilter]);

  const { data: expSummary, isFetching: fetchingExpiry } = useQuery({
    queryKey: ["m-inv-expiry-summary", tenantId],
    enabled: !!tenantId && tab === "expiry",
    staleTime: 30_000,
    queryFn: () => expirySummaryFn({ data: { tenantId } }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["inventory-overview", tenantId] });
    qc.invalidateQueries({ queryKey: ["inventory-stock-item-count", tenantId] });
    qc.invalidateQueries({ queryKey: ["m-inv-stock", tenantId] });
    qc.invalidateQueries({ queryKey: ["m-inv-batches", tenantId] });
    qc.invalidateQueries({ queryKey: ["m-inv-expiry-summary", tenantId] });
  };

  const countMutation = useMutation({
    mutationFn: async () => {
      if (!countModalBatch?.products?.id) throw new Error("পণ্য পাওয়া যায়নি");
      if (countMode === "count") {
        const qty = Number(countQty);
        if (!Number.isFinite(qty) || qty < 0) throw new Error("সঠিক পরিমাণ লিখুন");
        return physicalCountFn({
          data: {
            tenant_id: tenantId,
            product_id: countModalBatch.products.id,
            batch_id: countModalBatch.id,
            counted_qty: qty,
            reason: countReason.trim() || "Mobile physical count",
          },
        });
      }
      const delta = Number(adjustDelta);
      if (!Number.isFinite(delta) || delta === 0) throw new Error("শূন্য ছাড়া অন্য সংখ্যা দিন");
      return adjustFn({
        data: {
          tenant_id: tenantId,
          product_id: countModalBatch.products.id,
          batch_id: countModalBatch.id,
          qty_change: delta,
          movement_type: "adjustment",
          reason: countReason.trim() || "Mobile stock adjustment",
        },
      });
    },
    onSuccess: () => {
      toast.success("স্টক সফলভাবে আপডেট হয়েছে!");
      setCountModalBatch(null);
      setCountQty("");
      setAdjustDelta("");
      setCountReason("");
      invalidateAll();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "স্টক আপডেট করা যায়নি");
    },
  });

  const damageMutation = useMutation({
    mutationFn: async () => {
      if (!damageModalBatch) throw new Error("ব্যাচ নির্বাচন করুন");
      const qty = Number(damageQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("সঠিক ড্যামেজ পরিমাণ দিন");
      return damageFn({
        data: {
          tenantId,
          branch_id: activeBranchId || undefined,
          batchId: damageModalBatch.id,
          qty,
          reason: damageReason,
          notes: damageNotes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("ড্যামেজ এন্ট্রি সংরক্ষণ হয়েছে!");
      setDamageModalBatch(null);
      setDamageQty("");
      setDamageNotes("");
      invalidateAll();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "ড্যামেজ এন্ট্রি ব্যর্থ হয়েছে");
    },
  });

  const expireMutation = useMutation({
    mutationFn: () => expireBatchesFn({ data: { tenant_id: tenantId } }),
    onSuccess: (res) => {
      toast.success(`${res?.expired ?? 0}টি মেয়াদোত্তীর্ণ ব্যাচ আপডেট হয়েছে!`);
      invalidateAll();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "আপডেট করা যায়নি");
    },
  });

  const kpi = {
    totalStock: Number(overview?.kpi?.totalStock ?? 0),
    totalValue: Number(overview?.kpi?.totalValue ?? 0),
    lowCount: Number(overview?.kpi?.lowCount ?? 0),
    outCount: Number(overview?.kpi?.outCount ?? 0),
    expiredCount: Number(overview?.kpi?.expiredCount ?? 0),
    noBatchCount: Number(overview?.kpi?.noBatchCount ?? 0),
    noOpeningCount: Number(overview?.kpi?.noOpeningCount ?? 0),
  };

  const lowStock = (overview?.lowStock ?? []).map((r) => ({ ...r, stock: Number(r.stock) }));
  const outStock = overview?.outStock ?? [];
  const expiring = (overview?.expiring ?? []).map((e) => ({ ...e, days: Number(e.days) }));

  function toggleSort(col: InventoryInStockSortBy) {
    setStockPage(1);
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "stock" ? "asc" : "asc");
    }
  }

  return (
    <PhoneShell title={t("m.inventory.title")} back>
      {/* Top KPI Cards */}
      <div className={cn("space-y-2.5", loadingOverview && "opacity-70")}>
        <div className="phone-grid-keep grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>{t("m.inventory.tabStock")}</span>
              <Package className="h-4 w-4 text-[#0d5c46]" />
            </div>
            <p className="mt-1 text-lg font-extrabold text-slate-900">{fmtNum(kpi.totalStock)}</p>
            <p className="text-[10px] text-slate-500">{t("m.productList.totalProducts")}: {fmtNum(stockItemCount ?? 0)}</p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>{t("m.productList.stockValue")}</span>
              <Wallet className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-1 text-lg font-extrabold text-[#0d5c46]">{fmtMoney(Math.round(kpi.totalValue))}</p>
            <p className="text-[10px] text-slate-500">{t("m.productList.atCost")}</p>
          </div>
        </div>

        <div className="phone-grid-keep grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setTab("alerts")}
            className="rounded-xl border border-amber-100 bg-amber-50/70 p-2.5 text-left active:scale-[0.98] transition"
          >
            <div className="flex items-center justify-between text-[10px] font-semibold text-amber-800">
              <span>লো স্টক</span>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <p className="mt-0.5 text-base font-extrabold text-amber-900">{fmtNum(kpi.lowCount)}</p>
          </button>

          <button
            type="button"
            onClick={() => setTab("alerts")}
            className="rounded-xl border border-rose-100 bg-rose-50/70 p-2.5 text-left active:scale-[0.98] transition"
          >
            <div className="flex items-center justify-between text-[10px] font-semibold text-rose-700">
              <span>স্টক আউট</span>
              <PackageMinus className="h-3.5 w-3.5 text-rose-600" />
            </div>
            <p className="mt-0.5 text-base font-extrabold text-rose-900">{fmtNum(kpi.outCount)}</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setBatchFilter("expired");
              setTab("batches");
            }}
            className="rounded-xl border border-rose-100 bg-white p-2.5 text-left shadow-xs active:scale-[0.98] transition"
          >
            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
              <span>মেয়াদোত্তীর্ণ</span>
              <CalendarX className="h-3.5 w-3.5 text-rose-600" />
            </div>
            <p className="mt-0.5 text-base font-extrabold text-rose-600">{fmtNum(kpi.expiredCount)}</p>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-3 phone-grid-keep grid grid-cols-4 gap-1 rounded-full bg-[#e9eeea] p-1">
        {(
          [
            { id: "stock", label: t("m.inventory.tabStock"), icon: Boxes },
            { id: "batches", label: t("m.inventory.tabBatches"), icon: Layers },
            { id: "alerts", label: t("m.productList.alertBadge"), icon: AlertTriangle },
            { id: "expiry", label: t("m.home.tiles.expired"), icon: CalendarClock },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-full py-2 text-[11px] font-semibold transition",
                tab === item.id
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: In-Stock Products */}
      {tab === "stock" && (
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={stockSearch}
                onChange={(e) => {
                  setStockSearch(e.target.value);
                  setStockPage(1);
                }}
                placeholder={t("m.inventory.searchPlaceholder")}
                className="h-10 rounded-xl bg-white pl-9 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => toggleSort(sortBy === "name" ? "stock" : "name")}
              className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 active:scale-95"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-[#0d5c46]" />
              {sortBy === "stock" ? "স্টক" : "নাম"} ({sortDir === "asc" ? "↑" : "↓"})
            </button>
          </div>

          {fetchingStock && !stockData ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> লোড হচ্ছে...
            </div>
          ) : (stockData?.rows.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              কোনো স্টক পণ্য পাওয়া যায়নি।
            </div>
          ) : (
            <div className={cn("space-y-2", fetchingStock && "opacity-70")}>
              {stockData?.rows.map((p) => {
                const stockValue = Number(p.stock) * Number(p.purchase_price ?? 0);
                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{p.name}</p>
                        {(p.generic_name || p.manufacturer_name) && (
                          <p className="truncate text-[11px] text-slate-500">
                            {[p.generic_name, p.manufacturer_name].filter(Boolean).join(" • ")}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold",
                          p.stock <= 5
                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            : "bg-emerald-50 text-[#0d5c46] ring-1 ring-emerald-200",
                        )}
                      >
                        {fmtNum(p.stock)} পিস
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                      <span>ক্রয়: {fmtMoney(p.purchase_price ?? 0)}</span>
                      <span>বিক্রি: {fmtMoney(p.retail_price ?? p.mrp ?? 0)}</span>
                      <span className="font-semibold text-slate-800">মূল্য: {fmtMoney(Math.round(stockValue))}</span>
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              {stockData && stockData.totalPages > 1 && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                  <button
                    type="button"
                    disabled={stockPage <= 1}
                    onClick={() => setStockPage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1 font-semibold text-slate-700 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" /> আগের
                  </button>
                  <span className="text-[11px] font-medium text-slate-500">
                    পৃষ্ঠা {stockData.currentPage} / {stockData.totalPages} ({fmtNum(stockData.totalCount)} টি)
                  </span>
                  <button
                    type="button"
                    disabled={stockPage >= stockData.totalPages}
                    onClick={() => setStockPage((p) => p + 1)}
                    className="flex items-center gap-1 font-semibold text-slate-700 disabled:opacity-40"
                  >
                    পরের <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Batches & Adjustments */}
      {tab === "batches" && (
        <div className="mt-3 space-y-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              placeholder="পণ্য বা SKU দিয়ে ব্যাচ খুঁজুন..."
              className="h-10 rounded-xl bg-white pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {(
              [
                { id: "all", label: "সব ব্যাচ" },
                { id: "30", label: "৩০ দিনে মেয়াদ" },
                { id: "90", label: "৯০ দিনে মেয়াদ" },
                { id: "expired", label: "মেয়াদোত্তীর্ণ" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setBatchFilter(f.id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                  batchFilter === f.id
                    ? "bg-[#0d5c46] text-white"
                    : "border border-slate-200 bg-white text-slate-600",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {fetchingBatches && !batchesRaw ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> ব্যাচ লোড হচ্ছে...
            </div>
          ) : batches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              এই ফিল্টারে কোনো ব্যাচ পাওয়া যায়নি।
            </div>
          ) : (
            <div className={cn("space-y-2", fetchingBatches && "opacity-70")}>
              {batches.map((b) => {
                const days = daysUntil(b.expiry_date);
                const isExpired = days < 0;
                const isSoon = days >= 0 && days <= 30;
                const displayName = b.products
                  ? buildProductDisplayName(b.products)
                  : "Unknown Product";

                return (
                  <div
                    key={b.id}
                    className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{displayName}</p>
                        <p className="text-[11px] text-slate-500">
                          ব্যাচ: <span className="font-semibold text-slate-700">{b.batch_no}</span> • মেয়াদ: {b.expiry_date}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          isExpired
                            ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                            : isSoon
                              ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                              : "bg-emerald-50 text-[#0d5c46]",
                        )}
                      >
                        {isExpired ? `${Math.abs(days)} দিন আগে শেষ` : `${days} দিন বাকি`}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <div className="text-xs">
                        <span className="text-slate-500">স্টক: </span>
                        <span className="font-extrabold text-slate-900">{fmtNum(Number(b.qty_on_hand))}</span>
                        <span className="ml-2 text-slate-500">দর: {fmtMoney(Number(b.purchase_price))}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCountModalBatch(b);
                            setCountMode("count");
                            setCountQty(String(Number(b.qty_on_hand)));
                            setAdjustDelta("");
                            setCountReason("");
                          }}
                          className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-[#0d5c46] hover:bg-emerald-100"
                        >
                          <SlidersHorizontal className="h-3 w-3" />
                          অ্যাডজাস্ট
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDamageModalBatch(b);
                            setDamageQty("");
                            setDamageReason("broken");
                            setDamageNotes("");
                          }}
                          className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100"
                        >
                          <Flame className="h-3 w-3" />
                          ড্যামেজ
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Low / Out / Expiring Alerts */}
      {tab === "alerts" && (
        <div className="mt-3 space-y-3">
          {/* Low Stock */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                লো স্টক ({lowStock.length})
              </h3>
              <Link to={"/m/short-items" as never} className="text-[11px] font-bold text-[#0d5c46] underline">
                শর্ট আইটেম দেখুন
              </Link>
            </div>
            {lowStock.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">কোনো লো স্টক পণ্য নেই।</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {lowStock.slice(0, 15).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-semibold text-slate-800">{buildProductDisplayName(r)}</p>
                      <p className="text-[10px] text-slate-400">রি-অর্ডার লেভেল: {r.reorder_level ?? 0}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-700">
                      {fmtNum(r.stock)} পিস
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Out of Stock */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <PackageMinus className="h-4 w-4 text-rose-600" />
                স্টক আউট ({outStock.length})
              </h3>
              <Link to={"/m/purchase" as never} className="text-[11px] font-bold text-[#0d5c46] underline">
                ক্রয় করুন
              </Link>
            </div>
            {outStock.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">কোনো পণ্য স্টক আউট নেই।</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {outStock.slice(0, 15).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                    <span className="truncate font-semibold text-slate-800">{buildProductDisplayName(r)}</span>
                    <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                      ০ পিস
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expiring Soon */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <CalendarClock className="h-4 w-4 text-rose-600" />
                শীঘ্রই মেয়াদ শেষ ({expiring.length})
              </h3>
              <Link to={"/m/expired" as never} className="text-[11px] font-bold text-[#0d5c46] underline">
                বিস্তারিত
              </Link>
            </div>
            {expiring.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">কোনো আসন্ন মেয়াদোত্তীর্ণ ব্যাচ নেই।</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {expiring.slice(0, 15).map((e, idx) => (
                  <div key={`${e.batch}-${idx}`} className="flex items-center justify-between py-2 text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-semibold text-slate-800">{buildProductDisplayName(e)}</p>
                      <p className="text-[10px] text-slate-400">ব্যাচ: {e.batch}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                      {e.days < 0 ? "মেয়াদ শেষ" : `${e.days} দিন`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Expiry Summary & Quick Links */}
      {tab === "expiry" && (
        <div className="mt-3 space-y-3">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">মেয়াদ ভিত্তিক স্টক সারাংশ</h3>
              <button
                type="button"
                disabled={expireMutation.isPending}
                onClick={() => expireMutation.mutate()}
                className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
              >
                {expireMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                এক্সপায়ার্ড প্রসেস
              </button>
            </div>

            {fetchingExpiry || !expSummary ? (
              <div className="flex items-center justify-center py-8 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> হিসাব করা হচ্ছে...
              </div>
            ) : (
              <div className="phone-grid-keep grid grid-cols-2 gap-2">
                {(
                  [
                    ["expired", "মেয়াদোত্তীর্ণ", "border-rose-200 bg-rose-50/70 text-rose-800"],
                    ["d7", "৭ দিনের মধ্যে", "border-rose-100 bg-rose-50/40 text-rose-700"],
                    ["d15", "১৫ দিনের মধ্যে", "border-amber-200 bg-amber-50/70 text-amber-800"],
                    ["d30", "৩০ দিনের মধ্যে", "border-amber-100 bg-amber-50/40 text-amber-700"],
                    ["d60", "৬০ দিনের মধ্যে", "border-slate-200 bg-slate-50 text-slate-700"],
                    ["d90", "৯০ দিনের মধ্যে", "border-slate-200 bg-slate-50 text-slate-700"],
                    ["d180", "১৮০ দিনের মধ্যে", "border-slate-200 bg-slate-50 text-slate-700"],
                    ["safe", "নিরাপদ (>১৮০ দিন)", "border-emerald-200 bg-emerald-50/70 text-[#0d5c46]"],
                  ] as const
                ).map(([key, label, cls]) => {
                  const item = expSummary[key] ?? { qty: 0, value: 0 };
                  return (
                    <div key={key} className={cn("rounded-xl border p-2.5", cls)}>
                      <p className="text-[10px] font-semibold">{label}</p>
                      <p className="mt-0.5 text-sm font-extrabold">{fmtNum(item.qty)} পিস</p>
                      <p className="text-[10px] opacity-80">{fmtMoney(Math.round(item.value))}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Useful Inventory Shortcuts */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs space-y-2">
            <h3 className="text-xs font-bold text-slate-900">দ্রুত নেভিগেশন</h3>
            <div className="phone-grid-keep grid grid-cols-2 gap-2">
              <Link
                to={"/m/products" as never}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                পণ্যের তালিকা
              </Link>
              <Link
                to={"/m/short-items" as never}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                শর্ট আইটেম
              </Link>
              <Link
                to={"/inventory/opening-stock" as never}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                ওপেনিং স্টক
              </Link>
              <Link
                to={"/inventory/reports" as never}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                ইনভেন্টরি রিপোর্ট
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Physical Count / Stock Adjust */}
      {countModalBatch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <ClipboardCheck className="h-4 w-4 text-[#0d5c46]" />
                  স্টক কাউন্ট / অ্যাডজাস্ট
                </h3>
                <p className="text-xs text-slate-500">
                  {countModalBatch.products?.name} • ব্যাচ: {countModalBatch.batch_no} (বর্তমান: {fmtNum(Number(countModalBatch.qty_on_hand))})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCountModalBatch(null)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                বন্ধ
              </button>
            </div>

            <div className="phone-grid-keep grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setCountMode("count")}
                className={cn(
                  "rounded-full py-1.5 text-xs font-semibold",
                  countMode === "count" ? "bg-white text-[#0d5c46] shadow-xs" : "text-slate-600",
                )}
              >
                ফিজিক্যাল কাউন্ট
              </button>
              <button
                type="button"
                onClick={() => setCountMode("adjust")}
                className={cn(
                  "rounded-full py-1.5 text-xs font-semibold",
                  countMode === "adjust" ? "bg-white text-[#0d5c46] shadow-xs" : "text-slate-600",
                )}
              >
                যোগ / বিয়োগ (+/-)
              </button>
            </div>

            {countMode === "count" ? (
              <div className="space-y-1">
                <Label className="text-xs">নতুন মোট স্টক সংখ্যা *</Label>
                <Input
                  type="number"
                  min={0}
                  value={countQty}
                  onChange={(e) => setCountQty(e.target.value)}
                  placeholder="যেমন: 50"
                  className="h-10"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">পরিবর্তন (+ যোগ বা - বিয়োগ) *</Label>
                <Input
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  placeholder="যেমন: 10 অথবা -5"
                  className="h-10"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">কারণ / নোট</Label>
              <Input
                value={countReason}
                onChange={(e) => setCountReason(e.target.value)}
                placeholder="ঐচ্ছিক নোট"
                className="h-10"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCountModalBatch(null)}
                className="flex-1 h-10 rounded-xl"
              >
                বাতিল
              </Button>
              <Button
                type="button"
                disabled={countMutation.isPending}
                onClick={() => countMutation.mutate()}
                className="flex-1 h-10 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white font-bold"
              >
                {countMutation.isPending ? "সেভ হচ্ছে..." : "আপডেট করুন"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Damage Entry */}
      {damageModalBatch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-rose-600">
                  <Flame className="h-4 w-4" />
                  ড্যামেজ এন্ট্রি
                </h3>
                <p className="text-xs text-slate-500">
                  {damageModalBatch.products?.name} • ব্যাচ: {damageModalBatch.batch_no} (স্টক: {fmtNum(Number(damageModalBatch.qty_on_hand))})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDamageModalBatch(null)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                বন্ধ
              </button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">ড্যামেজ পরিমাণ *</Label>
              <Input
                type="number"
                min={1}
                max={Number(damageModalBatch.qty_on_hand)}
                value={damageQty}
                onChange={(e) => setDamageQty(e.target.value)}
                placeholder="সংখ্যা লিখুন"
                className="h-10"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">কারণ</Label>
              <select
                value={damageReason}
                onChange={(e) => setDamageReason(e.target.value as (typeof DAMAGE_REASONS)[number]["value"])}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs"
              >
                {DAMAGE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">নোট</Label>
              <Input
                value={damageNotes}
                onChange={(e) => setDamageNotes(e.target.value)}
                placeholder="বিস্তারিত (ঐচ্ছিক)"
                className="h-10"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDamageModalBatch(null)}
                className="flex-1 h-10 rounded-xl"
              >
                বাতিল
              </Button>
              <Button
                type="button"
                disabled={damageMutation.isPending}
                onClick={() => damageMutation.mutate()}
                className="flex-1 h-10 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                {damageMutation.isPending ? "সেভ হচ্ছে..." : "ড্যামেজ সেভ করুন"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PhoneShell>
  );
}
