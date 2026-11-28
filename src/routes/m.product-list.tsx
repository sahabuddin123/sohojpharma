import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  Building2,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  ScanBarcode,
  Search,
  ShoppingCart,
  Tags,
  Truck,
  X,
} from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneChip, PhoneChipRow, PhoneEmpty } from "@/components/mobile/phone-ui";
import { MobileCameraScanner } from "@/components/mobile/mobile-camera-scanner";
import {
  ProductFilterCombobox,
  useProductFilterOptions,
  asUuidOrUndefined,
} from "@/components/products/product-filter-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  getProductStats,
  listProductsForManagement,
  type ProductSearchScope,
} from "@/lib/api/product-management.functions";
import { buildProductDisplayName } from "@/lib/product-display";
import { listCachedProducts } from "@/lib/offline/db";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/product-list")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Product List — SohojPharma" },
      { name: "description", content: "মোবাইলে অনলাইন ও অফলাইন সব প্রোডাক্টের সম্পূর্ণ তালিকা, মূল্য এবং স্টক।" },
    ],
  }),
  component: MobileProductListPage,
});

type StockFilter = "all" | "in" | "low" | "out" | "neg";

type MobileProductItem = {
  id: string;
  name: string;
  displayName: string;
  strength: string | null;
  form: string | null;
  generic: string;
  company: string;
  category: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  reorderLevel: number | null;
  qtyPerBox: number;
};

type RawRpcRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  retail_price: number | null;
  purchase_price: number | null;
  reorder_level: number | null;
  strength: string | null;
  medicine_type: string | null;
  volume?: string | null;
  pack_size?: number | null;
  qty_per_box: number | null;
  generics: { name: string } | null;
  manufacturers: { name: string } | null;
  categories?: { name: string } | null;
  batches: { qty_on_hand: number | null }[] | null;
};

const PAGE_SIZE = 30;

const FILTER_TABS: Array<{ id: StockFilter; key: string }> = [
  { id: "all", key: "m.productList.filterAll" },
  { id: "in", key: "m.productList.filterIn" },
  { id: "low", key: "m.productList.filterLow" },
  { id: "out", key: "m.productList.filterOut" },
  { id: "neg", key: "m.productList.filterNeg" },
];

function fmtInt(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n ?? 0)));
}

function fmtMoney(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n ?? 0));
}

function getStockStatus(stock: number, reorderLevel: number | null): Exclude<StockFilter, "all"> {
  if (stock < 0) return "neg";
  if (stock === 0) return "out";
  if (reorderLevel != null && stock <= reorderLevel) {
    return "low";
  }
  return "in";
}

function MobileProductListPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const statsFn = useServerFn(getProductStats);
  const listFn = useServerFn(listProductsForManagement);

  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [searchBy, setSearchBy] = useState<ProductSearchScope>("all");
  const [manufacturerId, setManufacturerId] = useState<string | undefined>(undefined);
  const [genericId, setGenericId] = useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<StockFilter>("all");
  const [page, setPage] = useState(1);
  const [showCost, setShowCost] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const filterOptsQ = useProductFilterOptions(tenantId);
  const filterOptions = filterOptsQ.data ?? { manufacturers: [], generics: [], categories: [] };

  const selectedCompanyName = useMemo(
    () => (manufacturerId ? filterOptions.manufacturers.find((m) => m.id === manufacturerId)?.name : undefined),
    [filterOptions.manufacturers, manufacturerId],
  );
  const selectedGenericName = useMemo(
    () => (genericId ? filterOptions.generics.find((g) => g.id === genericId)?.name : undefined),
    [filterOptions.generics, genericId],
  );
  const selectedCategoryName = useMemo(
    () => (categoryId ? filterOptions.categories.find((c) => c.id === categoryId)?.name : undefined),
    [filterOptions.categories, categoryId],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(term.trim());
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    setPage(1);
  }, [filter, searchBy, manufacturerId, genericId, categoryId]);

  const stats = useQuery({
    queryKey: ["m-product-list-stats", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const offlineStats = async () => {
        const res = await listCachedProducts(tenantId, { page: 1, pageSize: 1 });
        return {
          total: res.stats.totalProducts,
          inStock: res.stats.inStock,
          low: res.stats.lowStock,
          out: res.stats.outOfStock,
          neg: res.stats.negStock,
          value: res.stats.stockValue,
          fromOffline: true as const,
        };
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await offlineStats();
      }
      try {
        const online = await statsFn({ data: { tenantId } });
        return { ...online, fromOffline: false as const };
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await offlineStats();
        }
        throw err;
      }
    },
  });

  const statusFilter = filter === "all" ? undefined : filter;

  const list = useQuery({
    queryKey: [
      "m-product-list-rows",
      tenantId,
      search,
      searchBy,
      manufacturerId ?? "",
      genericId ?? "",
      categoryId ?? "",
      filter,
      page,
    ],
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
    staleTime: 25_000,
    queryFn: async () => {
      const offlineList = async () => {
        const res = await listCachedProducts(tenantId, {
          search: search || undefined,
          searchBy,
          manufacturerId: asUuidOrUndefined(manufacturerId),
          genericId: asUuidOrUndefined(genericId),
          categoryId: asUuidOrUndefined(categoryId),
          manufacturerName: selectedCompanyName,
          genericName: selectedGenericName,
          categoryName: selectedCategoryName,
          filter,
          page,
          pageSize: PAGE_SIZE,
        });
        const rows: MobileProductItem[] = res.rows.map((r) => ({
          id: r.id,
          name: r.name,
          displayName: r.displayName || r.name,
          strength: r.strength ?? null,
          form: r.form ?? null,
          generic: r.generic_name ?? "",
          company: r.company_name ?? "",
          category: r.category_name ?? "",
          sku: r.sku ?? null,
          barcode: r.barcode ?? null,
          price: Number(r.price ?? 0),
          cost: Number(r.cost ?? 0),
          stock: Number(r.stock ?? 0),
          reorderLevel: r.reorder_level ?? null,
          qtyPerBox: Number(r.pcsPerBox ?? 1) || 1,
        }));
        return { rows, total: res.total, fromOffline: true as const };
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await offlineList();
      }
      try {
        const res = await listFn({
          data: {
            tenantId,
            search: search || undefined,
            searchBy,
            manufacturerId: asUuidOrUndefined(manufacturerId),
            genericId: asUuidOrUndefined(genericId),
            categoryId: asUuidOrUndefined(categoryId),
            page,
            pageSize: PAGE_SIZE,
            statusFilter,
            withCount: true,
          },
        });
        const rawRows = (res.rows ?? []) as unknown as RawRpcRow[];
        const rows: MobileProductItem[] = rawRows.map((r) => ({
          id: r.id,
          name: r.name,
          displayName: buildProductDisplayName({
            name: r.name,
            strength: r.strength,
            medicine_type: r.medicine_type,
            volume: r.volume ?? null,
            pack_size: r.pack_size ?? null,
          }),
          strength: r.strength ?? null,
          form: r.medicine_type ?? null,
          generic: r.generics?.name ?? "",
          company: r.manufacturers?.name ?? "",
          category: r.categories?.name ?? "",
          sku: r.sku ?? null,
          barcode: r.barcode ?? null,
          price: Number(r.retail_price ?? 0),
          cost: Number(r.purchase_price ?? 0),
          stock: (r.batches ?? []).reduce((sum, b) => sum + Number(b.qty_on_hand ?? 0), 0),
          reorderLevel: r.reorder_level ?? null,
          qtyPerBox: Number(r.qty_per_box ?? 1) || 1,
        }));
        return { rows, total: res.count ?? rows.length, fromOffline: false as const };
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await offlineList();
        }
        throw err;
      }
    },
  });

  const rows = list.data?.rows ?? [];
  const totalCount = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const kpiTotal = stats.data?.total ?? 0;
  const kpiInStock = stats.data?.inStock ?? 0;
  const kpiLowOut = (stats.data?.low ?? 0) + (stats.data?.out ?? 0);
  const kpiValue = stats.data?.value ?? 0;

  return (
    <PhoneShell title={t("m.productList.title")} back>
      <div className="space-y-3.5">
        {/* 4 KPI Summary Tiles */}
        <div className="phone-grid-keep grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-2xl border p-3 text-left transition",
              filter === "all"
                ? "border-[#0d5c46] bg-[#0d5c46]/5"
                : "border-slate-200/90 bg-white",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">{t("m.productList.totalProducts")}</span>
              <Package className="h-4 w-4 text-[#0d5c46]" />
            </div>
            <p className="mt-1 text-lg font-extrabold text-slate-900 tabular-nums">{fmtInt(kpiTotal)}</p>
          </button>

          <button
            type="button"
            onClick={() => setFilter("in")}
            className={cn(
              "rounded-2xl border p-3 text-left transition",
              filter === "in"
                ? "border-emerald-600 bg-emerald-50"
                : "border-slate-200/90 bg-white",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">{t("m.productList.inStock")}</span>
              <Boxes className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-1 text-lg font-extrabold text-emerald-700 tabular-nums">{fmtInt(kpiInStock)}</p>
          </button>

          <button
            type="button"
            onClick={() => setFilter((prev) => (prev === "low" ? "out" : "low"))}
            className={cn(
              "rounded-2xl border p-3 text-left transition",
              filter === "low" || filter === "out"
                ? "border-amber-500 bg-amber-50"
                : "border-slate-200/90 bg-white",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">{t("m.productList.lowOrOut")}</span>
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                {t("m.productList.alertBadge")}
              </span>
            </div>
            <p className="mt-1 text-lg font-extrabold text-amber-700 tabular-nums">{fmtInt(kpiLowOut)}</p>
          </button>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">{t("m.productList.stockValue")}</span>
              <span className="text-[10px] font-semibold text-sky-700">{t("m.productList.atCost")}</span>
            </div>
            <p className="mt-1 text-lg font-extrabold text-sky-700 tabular-nums">৳{fmtInt(kpiValue)}</p>
          </div>
        </div>

        {/* Search + Scan */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t("m.productList.searchPlaceholder")}
              className="h-11 rounded-2xl border-slate-200 bg-white pl-9 pr-9 text-sm shadow-2xs"
            />
            {term && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="h-11 shrink-0 rounded-2xl bg-[#0d5c46] hover:bg-[#094735] px-3.5 text-white font-semibold gap-1.5 shadow-xs"
          >
            <ScanBarcode className="h-4.5 w-4.5" />
            <span className="text-xs">{t("m.common.scan")}</span>
          </Button>
        </div>

        {/* Specific Filters Card: 3-col always-visible Company/Generic/Category + Scope */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-2xs space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            <ProductFilterCombobox
              variant="mobile"
              label={t("pages.products.company")}
              allLabel={t("pages.products.allCompanies")}
              searchPlaceholder={t("pages.products.searchCompanyPh")}
              emptyLabel={t("pages.products.noOptions")}
              narrowHint={t("pages.products.narrowOptionsHint", { n: filterOptions.manufacturers.length })}
              options={filterOptions.manufacturers}
              value={manufacturerId}
              onChange={setManufacturerId}
              icon={<Building2 className="size-3.5 shrink-0" />}
            />

            <ProductFilterCombobox
              variant="mobile"
              label={t("pages.products.generic")}
              allLabel={t("pages.products.allGenerics")}
              searchPlaceholder={t("pages.products.searchGenericPh")}
              emptyLabel={t("pages.products.noOptions")}
              narrowHint={t("pages.products.narrowOptionsHint", { n: filterOptions.generics.length })}
              options={filterOptions.generics}
              value={genericId}
              onChange={setGenericId}
              icon={<FlaskConical className="size-3.5 shrink-0" />}
            />

            <ProductFilterCombobox
              variant="mobile"
              label={t("pages.products.category")}
              allLabel={t("pages.products.allCategories")}
              searchPlaceholder={t("pages.products.searchCategoryPh")}
              emptyLabel={t("pages.products.noOptions")}
              narrowHint={t("pages.products.narrowOptionsHint", { n: filterOptions.categories.length })}
              options={filterOptions.categories}
              value={categoryId}
              onChange={setCategoryId}
              icon={<Tags className="size-3.5 shrink-0" />}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <select
              aria-label={t("pages.products.searchByAll")}
              value={searchBy}
              onChange={(e) => setSearchBy(e.target.value as ProductSearchScope)}
              className={cn(
                "h-8 rounded-lg border px-2.5 text-xs font-semibold outline-none",
                searchBy !== "all"
                  ? "border-[#0d5c46] bg-[#0d5c46]/10 text-[#0d5c46]"
                  : "border-slate-200 bg-slate-50 text-slate-700",
              )}
            >
              <option value="all">{t("pages.products.searchByAll")}</option>
              <option value="name">{t("pages.products.searchByName")}</option>
              <option value="company">{t("pages.products.searchByCompany")}</option>
              <option value="generic">{t("pages.products.searchByGeneric")}</option>
              <option value="category">{t("pages.products.searchByCategory")}</option>
              <option value="barcode">{t("pages.products.searchByBarcode")}</option>
            </select>

            {(term || searchBy !== "all" || manufacturerId || genericId || categoryId || filter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setTerm("");
                  setSearch("");
                  setSearchBy("all");
                  setManufacturerId(undefined);
                  setGenericId(undefined);
                  setCategoryId(undefined);
                  setFilter("all");
                  setPage(1);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700"
              >
                <RotateCcw className="size-3" />
                {t("m.productList.reset")}
              </button>
            )}
          </div>
        </div>

        {/* Filter & Action Chips */}
        <div>
          <PhoneChipRow>
            {FILTER_TABS.map((tab) => (
              <PhoneChip key={tab.id} active={filter === tab.id} onClick={() => setFilter(tab.id)}>
                {t(tab.key)}
              </PhoneChip>
            ))}
            <PhoneChip active={showCost} onClick={() => setShowCost((v) => !v)}>
              {showCost ? (
                <EyeOff className="mr-1 inline h-3.5 w-3.5" />
              ) : (
                <Eye className="mr-1 inline h-3.5 w-3.5" />
              )}
              {showCost ? t("m.productList.hideCost") : t("m.productList.showCost")}
            </PhoneChip>
            <Link
              to={"/products/new" as never}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#0d5c46]/30 bg-[#0d5c46]/5 px-3 py-1.5 text-xs font-semibold text-[#0d5c46]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("m.productList.newProduct")}
            </Link>
          </PhoneChipRow>
        </div>

        {/* Result Header */}
        <div className="flex items-center justify-between px-0.5 text-xs text-slate-500">
          <span>
            {t("m.common.foundCount")} <strong className="text-slate-800">{fmtInt(totalCount)}{t("m.common.itemsSuffix")}</strong>
          </span>
          {list.isFetching && !list.isLoading && (
            <span className="inline-flex items-center gap-1 text-[#0d5c46]">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("m.common.loading")}
            </span>
          )}
        </div>

        {/* Product List */}
        {list.isLoading ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <Loader2 className="mb-2 h-6 w-6 animate-spin text-[#0d5c46]" />
            <span className="text-xs">{t("m.productList.loadingList")}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="space-y-2">
            <PhoneEmpty
              message={
                search
                  ? t("m.productList.emptySearch", { query: search })
                  : t("m.productList.emptyFilter")
              }
            />
            {(term || searchBy !== "all" || manufacturerId || genericId || categoryId || filter !== "all") && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTerm("");
                    setSearch("");
                    setSearchBy("all");
                    setManufacturerId(undefined);
                    setGenericId(undefined);
                    setCategoryId(undefined);
                    setFilter("all");
                    setPage(1);
                  }}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {t("m.productList.reset")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((p) => {
              const st = getStockStatus(p.stock, p.reorderLevel);
              const badgeCls =
                st === "neg"
                  ? "bg-rose-100 text-rose-700"
                  : st === "out"
                    ? "bg-slate-100 text-slate-600"
                    : st === "low"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800";
              const badgeLabel =
                st === "out"
                  ? t("m.productList.outOfStock")
                  : `${fmtInt(p.stock)} ${t("m.common.pcs")}`;

              const boxes = p.qtyPerBox > 1 && p.stock > 0 ? Math.floor(p.stock / p.qtyPerBox) : 0;

              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold leading-snug text-slate-900">
                        {p.displayName}
                      </p>
                      {(p.generic || p.company || p.category) && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {[p.generic, p.company, p.category].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {(p.sku || p.barcode) && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {[p.sku ? `SKU: ${p.sku}` : "", p.barcode ? `${p.barcode}` : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-base font-extrabold text-[#0d5c46] tabular-nums">
                        ৳{fmtMoney(p.price)}
                      </p>
                      {showCost && (
                        <p className="text-[11px] font-semibold text-slate-500 tabular-nums">
                          {t("m.productList.costPrefix")} ৳{fmtMoney(p.cost)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", badgeCls)}>
                        {badgeLabel}
                      </span>
                      {boxes > 0 && (
                        <span className="text-[11px] text-slate-500">
                          ({boxes} {t("m.common.box")})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        to={"/m/sale" as never}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0d5c46]/10 px-2.5 py-1 text-[11px] font-bold text-[#0d5c46]"
                      >
                        <ShoppingCart className="h-3 w-3" />
                        {t("m.common.pos")}
                      </Link>
                      <Link
                        to={"/m/purchase" as never}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                      >
                        <Truck className="h-3 w-3" />
                        {t("m.common.purchase")}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("m.common.prev")}
            </Button>
            <span className="text-xs font-semibold text-slate-600 tabular-nums">
              {t("m.common.pageOf", { page, total: totalPages })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("m.common.next")}
            </Button>
          </div>
        )}
      </div>

      <MobileCameraScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        tenantId={tenantId}
        onAddProduct={(item) => {
          setTerm(item.name);
          setScannerOpen(false);
        }}
      />
    </PhoneShell>
  );
}
