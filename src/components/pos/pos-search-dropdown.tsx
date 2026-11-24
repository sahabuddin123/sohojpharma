import { forwardRef, useEffect, useMemo, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Pill, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DosageBadge } from "@/components/medicine/dosage-badge";

export type PosSearchResult = {
  id: string;
  name: string;
  displayName: string;
  sku: string;
  barcode: string | null;
  retail_price: number;
  stock: number;
  generic_name: string | null;
  manufacturer_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  nearest_expiry: string | null;
};

const ROW_HEIGHT = 96;

type Props = {
  results: PosSearchResult[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onSelect: (p: PosSearchResult) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  query: string;
  isFetching: boolean;
  isLoadingInitial: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onCreateNew?: () => void;
};

/* ---------- helpers ---------- */

function initials(name: string) {
  const s = (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("");
  return s.toUpperCase() || "?";
}

function initialsColor(seed: string) {
  const palette = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-violet-100 text-violet-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
    "bg-orange-100 text-orange-700",
    "bg-indigo-100 text-indigo-700",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function Highlight({ text, query }: { text: string | null | undefined; query: string }) {
  const t = text ?? "";
  const q = query.trim();
  if (!q) return <>{t}</>;
  const parts: React.ReactNode[] = [];
  const lower = t.toLowerCase();
  const lq = q.toLowerCase();
  let i = 0;
  let idx = lower.indexOf(lq, i);
  let k = 0;
  while (idx !== -1) {
    if (idx > i) parts.push(<span key={`p${k++}`}>{t.slice(i, idx)}</span>);
    parts.push(
      <mark key={`m${k++}`} className="rounded bg-yellow-200/70 px-0.5 font-semibold text-foreground">
        {t.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
    idx = lower.indexOf(lq, i);
  }
  if (i < t.length) parts.push(<span key={`p${k++}`}>{t.slice(i)}</span>);
  return <>{parts}</>;
}

function StockBadge({ qty }: { qty: number }) {
  if (qty <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Out of stock
      </span>
    );
  }
  if (qty <= 10) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {qty} Pcs
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {qty}
    </span>
  );
}

function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const days = Math.floor((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) {
    return (
      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        Expired
      </span>
    );
  }
  if (days <= 60) {
    return (
      <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
        ⚠ Expires in {days}d
      </span>
    );
  }
  return null;
}

/* ---------- skeleton row ---------- */

function SkeletonRow() {
  return (
    <div className="flex items-start gap-2 sm:gap-3 border-b border-border/60 px-4 py-3">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-muted" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted/70" />
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted/50" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-14 animate-pulse rounded bg-muted/70" />
      </div>
    </div>
  );
}

/* ---------- main ---------- */

export const PosSearchDropdown = forwardRef<HTMLDivElement, Props>(function PosSearchDropdown(
  { results, activeIndex, setActiveIndex, onSelect, scrollRef,
    query, isFetching, isLoadingInitial, hasMore, onLoadMore, onCreateNew },
  ref,
) {
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // Auto-scroll to keep active row visible
  useEffect(() => {
    if (results.length > 0) virtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, results.length, virtualizer]);

  // Infinite scroll: when bottom sentinel comes into view, fetch next page
  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    if (!items.length || !hasMore || isFetching) return;
    const last = items[items.length - 1];
    if (last.index >= results.length - 5) onLoadMore();
  }, [virtualizer, virtualizer.getVirtualItems(), hasMore, isFetching, onLoadMore, results.length]);

  const items = virtualizer.getVirtualItems();
  const showSkeleton = isLoadingInitial && results.length === 0;
  const showEmpty = !isLoadingInitial && results.length === 0;
  const headerLabel = useMemo(() => {
    if (showSkeleton) return "Searching…";
    if (showEmpty) return "No results";
    return `Search Results (${results.length}${hasMore ? "+" : ""})`;
  }, [showSkeleton, showEmpty, results.length, hasMore]);

  return (
    <div
      ref={ref}
      className={cn(
        "absolute left-0 right-0 top-full z-50 mt-2",
        "overflow-hidden rounded-xl border border-border bg-popover shadow-2xl",
        "mx-2 md:mx-0", // Side margins on mobile
      )}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-popover/95 px-4 py-2 text-xs font-semibold text-muted-foreground backdrop-blur">
        <span>{headerLabel}</span>
        <span className="hidden md:inline text-[10px] font-normal">↑ ↓ navigate · Enter add · Esc close</span>
      </div>

      <div
        ref={scrollRef}
        className="pos-search-scroll overflow-y-auto overscroll-contain"
        style={{ maxHeight: "min(520px, calc(100vh - 220px))" }}
        onWheel={(e) => e.stopPropagation()}
      >
        {showSkeleton && (
          <div>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="rounded-full bg-muted p-3"><Pill className="h-6 w-6 text-muted-foreground" /></div>
            <div className="text-sm font-semibold text-foreground">No products found</div>
            <div className="text-xs text-muted-foreground">Try a different keyword, barcode or SKU.</div>
            {onCreateNew && (
              <button
                type="button"
                onClick={onCreateNew}
                className="mt-1 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" /> Create Product
                <kbd className="ml-1 rounded bg-primary/10 px-1 text-[10px]">F2</kbd>
              </button>
            )}
          </div>
        )}

        {!showSkeleton && !showEmpty && (
          <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {items.map((v) => {
              const p = results[v.index];
              const active = v.index === activeIndex;
              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(v.index)}
                  onClick={() => onSelect(p)}
                  className={cn(
                    "group absolute left-0 top-0 flex w-full cursor-pointer items-start gap-2 sm:gap-3 border-b border-border/60 px-2.5 py-2.5 text-left sm:px-4 transition-all",
                    "border-l-2",
                    active
                      ? "border-l-primary bg-primary/10"
                      : "border-l-transparent hover:border-l-primary/60 hover:bg-primary/5",
                  )}
                  style={{ transform: `translateY(${v.start}px)`, height: v.size }}
                >
                  {/* Thumbnail (hidden on phones to give the name full width) */}
                  <div
                    className={cn(
                      "hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xs font-bold sm:flex",
                      initialsColor(p.id),
                    )}
                    aria-hidden
                  >
                    {initials(p.name)}
                  </div>

                  {/* Main info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        <Highlight text={p.name} query={query} />
                      </p>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-primary sm:hidden">
                        ৳{p.retail_price.toFixed(2)}
                      </span>
                    </div>
                    <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                      <span className="truncate">
                        <Highlight text={p.generic_name ?? ""} query={query} />
                        {p.generic_name && p.strength ? ` • ${p.strength}` : p.strength ?? ""}
                      </span>
                      {p.dosage_form && (
                        <>
                          {(p.generic_name || p.strength) && <span>•</span>}
                          <DosageBadge dosageForm={p.dosage_form} />
                        </>
                      )}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/90">
                      {p.manufacturer_name && (
                        <span className="truncate font-medium text-muted-foreground">{p.manufacturer_name}</span>
                      )}
                      {(p.barcode || p.sku) && (
                        <span className="hidden truncate font-mono text-muted-foreground/70 sm:inline">
                          <Highlight text={p.barcode || p.sku} query={query} />
                        </span>
                      )}
                      <span className="ml-auto shrink-0 sm:hidden">
                        <StockBadge qty={p.stock} />
                      </span>
                    </div>
                  </div>

                  {/* Right stack (tablet & up) */}
                  <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    <StockBadge qty={p.stock} />
                    <ExpiryBadge date={p.nearest_expiry} />
                    <span className="text-base font-bold tabular-nums text-primary">
                      ৳{p.retail_price.toFixed(2)}

                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Loading-more footer */}
        {!showSkeleton && !showEmpty && isFetching && (
          <div className="border-t px-4 py-2 text-center text-[11px] text-muted-foreground">Loading more…</div>
        )}
      </div>

      <style>{`
        .pos-search-scroll::-webkit-scrollbar { width: 6px; }
        .pos-search-scroll::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 3px; }
        .pos-search-scroll::-webkit-scrollbar-track { background: transparent; }
        @media (max-width: 1023px) { .pos-search-scroll { max-height: 420px !important; } }
        @media (max-width: 640px)  { .pos-search-scroll { max-height: 350px !important; } }
      `}</style>
    </div>
  );
});
