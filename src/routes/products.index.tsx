import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { exportCatalogData } from "@/lib/api/catalog-export.functions";
import {
  Plus, Search, Download, Upload, Eye, Pencil, QrCode, Trash2, Zap, Copy, History, LineChart,
  Package, PackageCheck, PackageX, AlertTriangle, TrendingDown, Wallet, RefreshCw,
  ChevronLeft, ChevronRight, ChevronDown,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { downloadSampleTemplate } from "@/components/products/import-dialog";
import { QuickEditProductDialog, type QuickEditProduct } from "@/components/products/quick-edit-dialog";
import { cn } from "@/lib/utils";
import {
  getProductStats,
  getTenantProductCapacity,
  listProductsForManagement,
} from "@/lib/api/product-management.functions";
import { buildProductDisplayName } from "@/lib/product-display";

export const Route = createFileRoute("/products/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Products — SohojPharma" },
      { name: "description", content: "Pharmacy product list, inventory analytics and bulk Excel import." },
    ],
  }),
  component: ProductsPage,
});

type ProductRow = {
  id: string;
  name: string;
  displayName: string;
  sku: string | null;
  barcode: string | null;
  retail_price: number | null;
  purchase_price: number | null;
  is_active: boolean | null;
  reorder_level: number | null;
  strength: string | null;
  medicineType: string | null;
  unit: string | null;
  generic: string;
  company: string;
  stock: number;
};

type StockStatus = "in" | "low" | "out" | "neg";

function statusOf(p: ProductRow): StockStatus {
  if (p.stock < 0) return "neg";
  if (p.stock === 0) return "out";
  if (p.reorder_level != null && p.stock > 0 && p.stock <= p.reorder_level) return "low";
  if (p.stock <= 20) return "low";
  return "in";
}

const fmtBdt = (n: number) =>
  "৳" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n.toFixed(2)));

const fmtInt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

function ProductsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const statsFn = useServerFn(getProductStats);
  const capFn = useServerFn(getTenantProductCapacity);
  const listFn = useServerFn(listProductsForManagement);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<"all" | StockStatus>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<50 | 100 | 200>(50);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [quickEdit, setQuickEdit] = useState<QuickEditProduct | null>(null);

  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => { setPage(1); setExpanded(new Set()); }, [filter, pageSize, debouncedSearch]);

  const stats = useQuery({
    queryKey: ["products-stats", tenantId],
    enabled: !!tenantId,
    queryFn: () => statsFn({ data: { tenantId } }),
    staleTime: 60_000,
  });

  const capacity = useQuery({
    queryKey: ["products-capacity", tenantId],
    enabled: !!tenantId,
    queryFn: () => capFn({ data: { tenantId } }),
    staleTime: 60_000,
  });

  const lastCountRef = useRef<{ key: string; count: number } | null>(null);
  const statusFilter = filter === "in" || filter === "low" || filter === "out" || filter === "neg" ? filter : undefined;
  const filterKey = `${debouncedSearch}|${statusFilter ?? ""}|${pageSize}`;
  const needCount = lastCountRef.current?.key !== filterKey;

  const fetchPage = (p: number, withCount: boolean) =>
    listFn({
      data: {
        tenantId,
        search: debouncedSearch || undefined,
        page: p,
        pageSize,
        statusFilter,
        withCount,
      },
    });

  type Raw = {
    id: string; name: string; sku: string | null; barcode: string | null;
    retail_price: number | null; purchase_price: number | null;
    is_active: boolean | null; reorder_level: number | null;
    strength: string | null; medicine_type: string | null; volume: string | null;
    pack_size: number | null; qty_per_box: number | null;
    generics: { name: string } | null;
    manufacturers: { name: string } | null;
    batches: { qty_on_hand: number | null }[] | null;
  };

  const loadPage = async (p: number, withCount: boolean) => {
    const res = await fetchPage(p, withCount);
    const rows = ((res.rows ?? []) as unknown as Raw[]).map((r): ProductRow => ({
      id: r.id, name: r.name,
      displayName: buildProductDisplayName({ name: r.name, strength: r.strength, medicine_type: r.medicine_type, volume: r.volume, pack_size: r.pack_size }),
      sku: r.sku, barcode: r.barcode,
      retail_price: r.retail_price, purchase_price: r.purchase_price,
      is_active: r.is_active, reorder_level: r.reorder_level,
      strength: r.strength,
      medicineType: r.medicine_type,
      unit: r.qty_per_box && r.qty_per_box > 1 ? "Box" : "Pcs",
      generic: r.generics?.name ?? "",
      company: r.manufacturers?.name ?? "",
      stock: (r.batches ?? []).reduce((s, b) => s + Number(b.qty_on_hand ?? 0), 0),
    }));
    if (res.count != null) lastCountRef.current = { key: filterKey, count: res.count };
    const count = res.count ?? lastCountRef.current?.count ?? rows.length;
    return { rows, count };
  };

  const list = useQuery({
    queryKey: ["products-list-paged", tenantId, filterKey, page, needCount],
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: () => loadPage(page, needCount),
  });

  const products = list.data?.rows ?? [];
  const knownCount = list.data?.count ?? lastCountRef.current?.count ?? 0;
  const totalForPage = knownCount;
  const totalPages = Math.max(1, Math.ceil(totalForPage / pageSize));

  const qc = useQueryClient();
  useEffect(() => {
    if (!tenantId || page >= totalPages) return;
    const nextPage = page + 1;
    qc.prefetchQuery({
      queryKey: ["products-list-paged", tenantId, filterKey, nextPage, false],
      queryFn: () => loadPage(nextPage, false),
      staleTime: 30_000,
    });
  }, [tenantId, page, totalPages, filterKey, qc]);



  const refetchAll = () => {
    lastCountRef.current = null;
    stats.refetch(); capacity.refetch(); list.refetch();
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportCatalog = useServerFn(exportCatalogData);
  const [exporting, setExporting] = useState(false);

  const exportFile = async (scope: "page" | "all", fmt: "xlsx" | "csv") => {
    let rows: Record<string, unknown>[];
    if (scope === "all") {
      if (!tenantId || exporting) return;
      setExporting(true);
      try {
        const data = await exportCatalog({ data: { tenantId, kind: "products" } });
        rows = data.rows.map((r) => Object.fromEntries(data.header.map((h, i) => [h, r[i]])));
        toast.success(t("pages.products.exportedAll", { n: rows.length, defaultValue: `Exported ${rows.length} products` }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("Export failed"));
        return;
      } finally {
        setExporting(false);
      }
    } else {
      rows = products.map((p) => ({
        "Product Name": p.name,
        "Generic Name": p.generic,
        "Company Name": p.company,
        "Quantity": p.stock,
        "Average Purchase Price": p.purchase_price ?? 0,
        "Sale Price": p.retail_price ?? 0,
        "Barcode": p.barcode ?? p.sku ?? "",
        "Status": statusOf(p),
      }));
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, `products-${scope}-${Date.now()}.${fmt}`, { bookType: fmt });
  };

  const updatedTime = list.dataUpdatedAt ? new Date(list.dataUpdatedAt).toLocaleTimeString() : "—";
  const kpi = stats.data ?? { total: 0, inStock: 0, low: 0, out: 0, neg: 0, value: 0 };
  const cap = capacity.data;
  const capPct = cap && cap.maxProducts ? Math.min(100, Math.round((cap.used / cap.maxProducts) * 100)) : 0;

  // Virtualizer
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (expanded.has(products[i]?.id) ? 280 : 104),
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Re-measure when expand state changes
  useEffect(() => { rowVirtualizer.measure(); }, [expanded, rowVirtualizer]);

  const isInitialLoading = list.isFetching && products.length === 0;

  const filterChips = useMemo(() => ([
    ["all", t("pages.products.filterAll")],
    ["in", t("pages.products.filterIn")],
    ["low", t("pages.products.filterLow")],
    ["out", t("pages.products.filterOut")],
    ["neg", t("pages.products.filterNeg")],
  ] as const), [t]);

  return (
    <AppShell variant="store" title={t("pages.products.title")}>
      <TooltipProvider delayDuration={200}>
        <PageHeader
          title={t("pages.products.title")}
          description={`${t("pages.products.countItems", { n: kpi.total })} · ${t("pages.products.updatedAt", { time: updatedTime })}`}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={refetchAll}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
              </Button>
              <Button asChild variant="outline">
                <Link to="/inventory/import-v2"><Upload className="mr-1.5 h-4 w-4" /> {t("pages.products.import")}</Link>
              </Button>
              <Button asChild>
                <Link to="/products/new"><Plus className="mr-1.5 h-4 w-4" /> {t("pages.products.add")}</Link>
              </Button>
            </>
          }
        />

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label={t("pages.products.kpiTotal")} value={kpi.total.toLocaleString()} icon={Package} tone="primary" />
          <StatCard label={t("pages.products.kpiIn")} value={kpi.inStock.toLocaleString()} icon={PackageCheck} tone="success" />
          <StatCard label={t("pages.products.kpiLow")} value={kpi.low.toLocaleString()} icon={AlertTriangle} tone="warning" />
          <StatCard label={t("pages.products.kpiOut")} value={kpi.out.toLocaleString()} icon={PackageX} tone="warning" />
          <StatCard label={t("pages.products.kpiNeg")} value={kpi.neg.toLocaleString()} icon={TrendingDown} tone="warning" />
          <StatCard label={t("pages.products.kpiValue")} value={fmtBdt(kpi.value)} icon={Wallet} tone="secondary" />
        </div>

        {/* Plan capacity */}
        {cap && (
          <Card className="mt-4 shadow-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {cap.planCode ? `${cap.planCode.toUpperCase()} plan` : "Plan"} · {cap.used.toLocaleString()} / {cap.maxProducts != null ? cap.maxProducts.toLocaleString() : "∞"} products
                </p>
                {cap.maxProducts != null && <Progress value={capPct} className="mt-2 h-2" />}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/billing">Upgrade plan</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Sticky search/filter */}
        <div className="sticky top-0 z-20 -mx-1 mt-4 rounded-2xl border border-border bg-card/95 px-1 py-3 shadow-card backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex flex-wrap items-center gap-3 px-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("pages.products.searchPh")}
                className="h-10 rounded-xl pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" className="rounded-xl" onClick={() => { setSearch(""); setFilter("all"); setPage(1); }}>
              {t("pages.products.reset")}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 px-3">
            {filterChips.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k as typeof filter)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                  filter === k
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Virtualized row list */}
        <div
          ref={scrollRef}
          className="mt-4 max-h-[calc(100vh-340px)] min-h-[400px] overflow-y-auto rounded-2xl"
        >
          {isInitialLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[96px] w-full rounded-2xl" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
              {t("pages.products.empty", { action: t("pages.products.add") })}
            </div>
          ) : (
            <div
              style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}
            >
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const p = products[vi.index];
                if (!p) return null;
                const isOpen = expanded.has(p.id);
                return (
                  <div
                    key={p.id}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vi.start}px)`,
                      paddingBottom: 8,
                    }}
                  >
                    <ProductRowCard
                      p={p}
                      open={isOpen}
                      onToggle={() => toggleExpand(p.id)}
                      onQuickEdit={() =>
                        setQuickEdit({
                          id: p.id,
                          name: p.displayName,
                          stock: p.stock,
                          purchase_price: p.purchase_price,
                          retail_price: p.retail_price,
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky pagination */}
        <div className="sticky bottom-0 z-20 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-card backdrop-blur">
          <span>
            Page <span className="font-semibold text-foreground">{page}</span> of {totalPages} ·{" "}
            <span className="font-semibold text-foreground">{totalForPage.toLocaleString()}</span> matches
            {debouncedSearch ? "" : ` · ${kpi.total.toLocaleString()} total`}
          </span>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as 50 | 100 | 200)}
            >
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={200}>200 / page</option>
            </select>
            <Button variant="outline" size="sm" className="rounded-lg" disabled={page <= 1 || list.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg" disabled={page >= totalPages || list.isFetching} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {quickEdit && tenantId && (
          <QuickEditProductDialog
            tenantId={tenantId}
            product={quickEdit}
            onClose={() => setQuickEdit(null)}
            onDone={refetchAll}
          />
        )}
      </TooltipProvider>
    </AppShell>
  );
}

/* ============================================================
   Horizontal row card
   ============================================================ */

const STOCK_TONE: Record<StockStatus, { wrap: string; dot: string; label: string }> = {
  in:  { wrap: "bg-success/10 text-success border-success/30",           dot: "bg-success",      label: "In Stock" },
  low: { wrap: "bg-warning/10 text-warning border-warning/30",           dot: "bg-warning",      label: "Low" },
  out: { wrap: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive", label: "Out" },
  neg: { wrap: "bg-destructive/20 text-destructive border-destructive",  dot: "bg-destructive",  label: "Negative" },
};

function ProductRowCard({
  p, open, onToggle, onQuickEdit,
}: {
  p: ProductRow;
  open: boolean;
  onToggle: () => void;
  onQuickEdit: () => void;
}) {
  const s = statusOf(p);
  const tone = STOCK_TONE[s];
  const avg = Number(p.purchase_price ?? 0);
  const cost = avg;
  const mrp = Number(p.retail_price ?? 0);

  return (
    <div className="group rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-md">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-col gap-2 rounded-2xl p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-stretch sm:gap-4 sm:p-4"
      >
        {/* LEFT: stock + product info */}
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <div className={cn(
            "flex w-[62px] shrink-0 flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center sm:w-[110px] sm:px-2 sm:py-2",
            tone.wrap,
          )}>
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider sm:gap-1.5 sm:text-[10px]">
              <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
              {tone.label}
            </span>
            <span className="mt-0.5 text-base font-black leading-none tabular-nums sm:mt-1 sm:text-xl">{fmtInt(p.stock)}</span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-80 sm:text-[10px]">{p.unit ?? "Pcs"}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-foreground sm:truncate sm:text-[15px]">{p.name}</h3>
              {p.strength && <span className="text-xs font-medium text-primary">{p.strength}</span>}
              {p.medicineType && <span className="hidden rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">{p.medicineType}</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:mt-1 sm:text-xs">
              {p.generic && <span className="truncate"><span className="text-foreground/60">Generic:</span> <span className="font-medium text-foreground/80">{p.generic}</span></span>}
              {p.company && <span className="truncate"><span className="text-foreground/60">Mfg:</span> <span className="font-medium text-foreground/80">{p.company}</span></span>}
              {(p.barcode || p.sku) && <span className="hidden font-mono text-[11px] text-muted-foreground/80 md:inline">{p.barcode ?? p.sku}</span>}
            </div>
            <p className="mt-1 text-xs font-semibold text-foreground sm:hidden">MRP {fmtBdt(mrp)}</p>
          </div>
        </div>

        {/* CENTER: prices */}
        <div className="hidden shrink-0 items-center gap-6 self-center md:flex">
          <PriceBlock label="Avg Purchase" value={fmtBdt(avg)} />
          <PriceBlock label="Purchase" value={fmtBdt(cost)} />
          <PriceBlock label="MRP" value={fmtBdt(mrp)} accent />
        </div>

        {/* RIGHT: actions */}
        <div className="flex shrink-0 items-center justify-end gap-1 self-stretch border-t border-border/60 pt-2 sm:self-center sm:border-0 sm:pt-0">
          <RowAction icon={Zap} label="Quick Edit" onClick={(e) => { e.stopPropagation(); onQuickEdit(); }} className="text-primary hover:bg-primary/10" />
          <RowActionLink icon={Eye}    label="View"        to={`/products/${p.id}`} />
          <RowActionLink icon={Pencil} label="Edit"        to={`/products/${p.id}`} />
          <RowActionLink icon={QrCode} label="Barcode"     to={`/products/${p.id}`} className="hidden sm:inline-flex" />
          <RowAction     icon={Copy}   label="Duplicate"   onClick={(e) => e.stopPropagation()} className="hidden sm:inline-flex" />
          <RowAction     icon={History} label="Stock History" onClick={(e) => e.stopPropagation()} className="hidden lg:inline-flex" />
          <RowAction     icon={LineChart} label="Price History" onClick={(e) => e.stopPropagation()} className="hidden lg:inline-flex" />
          <RowAction     icon={Trash2} label="Delete"      onClick={(e) => e.stopPropagation()} className="text-destructive hover:bg-destructive/10" />
          <ChevronDown className={cn("ml-1 h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-muted/30 px-4 py-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <DetailBlock title="Batches & Expiry">
              <p className="text-xs text-muted-foreground">Aggregate on-hand: <span className="font-semibold text-foreground">{fmtInt(p.stock)} {p.unit}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">Reorder at: {p.reorder_level ?? "—"}</p>
              <Link to={`/inventory`} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open batch control →</Link>
            </DetailBlock>
            <DetailBlock title="Purchase History">
              <p className="text-xs text-muted-foreground">Last cost: <span className="font-semibold text-foreground">{fmtBdt(cost)}</span></p>
              <Link to={`/purchases`} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">View purchases →</Link>
            </DetailBlock>
            <DetailBlock title="Price History">
              <p className="text-xs text-muted-foreground">MRP: <span className="font-semibold text-foreground">{fmtBdt(mrp)}</span></p>
              <p className="text-xs text-muted-foreground">Margin: {mrp > 0 && cost > 0 ? `${Math.round(((mrp - cost) / mrp) * 100)}%` : "—"}</p>
            </DetailBlock>
            <DetailBlock title="Last Sale / Movement">
              <p className="text-xs text-muted-foreground">Status: <span className="font-semibold text-foreground">{p.is_active ? "Active" : "Inactive"}</span></p>
              <Link to={`/sales`} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open sales →</Link>
            </DetailBlock>
          </div>
        </div>
      )}
    </div>
  );
}

function PriceBlock({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", accent ? "text-primary" : "text-foreground")}>{value}</span>
    </div>
  );
}

function RowAction({
  icon: Icon, label, onClick, className,
}: {
  icon: typeof Eye; label: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className={cn("h-8 w-8", className)} onClick={onClick}>
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RowActionLink({
  icon: Icon, label, to, className,
}: {
  icon: typeof Eye; label: string; to: string; className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className={cn("h-8 w-8", className)} asChild onClick={(e) => e.stopPropagation()}>
          <Link to={to as never}><Icon className="h-4 w-4" /></Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}
