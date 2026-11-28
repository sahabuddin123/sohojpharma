import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getProductFilterOptions, type ProductFilterOptionsResult } from "@/lib/api/product-management.functions";
import { getCachedProductFilterOptions } from "@/lib/offline/db";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";

export type FilterOption = { id: string; name: string };

const EMPTY_OPTIONS: ProductFilterOptionsResult = { manufacturers: [], generics: [], categories: [] };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asUuidOrUndefined(id?: string): string | undefined {
  return id && UUID_RE.test(id) ? id : undefined;
}

/**
 * Loads searchable Company / Generic / Category options for the tenant,
 * falling back to the local IndexedDB catalog mirror when offline.
 */
export function useProductFilterOptions(tenantId: string) {
  const optionsFn = useServerFn(getProductFilterOptions);
  return useQuery({
    queryKey: ["product-filter-options", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductFilterOptionsResult> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await getCachedProductFilterOptions(tenantId);
      }
      try {
        return await optionsFn({ data: { tenantId } });
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await getCachedProductFilterOptions(tenantId);
        }
        throw err;
      }
    },
    placeholderData: EMPTY_OPTIONS,
  });
}

interface ProductFilterComboboxProps {
  label: string;
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  narrowHint?: string;
  options: FilterOption[];
  value?: string;
  onChange: (value: string | undefined) => void;
  icon?: React.ReactNode;
  variant?: "desktop" | "mobile";
  className?: string;
}

const MAX_RENDERED_OPTIONS = 80;

/**
 * High-performance searchable filter selector for large pharmacy catalogs
 * (400+ companies, 1,800+ generics, categories). Uses a Popover on desktop
 * and a touch-friendly Dialog sheet on mobile viewports.
 */
export function ProductFilterCombobox({
  label,
  allLabel,
  searchPlaceholder,
  emptyLabel,
  narrowHint,
  options,
  value,
  onChange,
  icon,
  variant = "desktop",
  className,
}: ProductFilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => (value ? options.find((o) => o.id === value) : undefined),
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, MAX_RENDERED_OPTIONS);
    const out: FilterOption[] = [];
    for (const o of options) {
      if (o.name.toLowerCase().includes(q)) {
        out.push(o);
        if (out.length >= MAX_RENDERED_OPTIONS) break;
      }
    }
    return out;
  }, [options, query]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const handleSelect = (nextId: string | undefined) => {
    onChange(nextId);
    handleOpenChange(false);
  };

  const listContent = (
    <div className="flex flex-col">
      <div className="flex items-center border-b border-border px-2.5 py-2">
        <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter query"
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className={cn("overflow-y-auto p-1.5", variant === "mobile" ? "max-h-[55dvh]" : "max-h-64")}>
        <button
          type="button"
          onClick={() => handleSelect(undefined)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors",
            !value ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted",
          )}
        >
          <span>{allLabel}</span>
          {!value && <Check className="size-3.5 shrink-0" />}
        </button>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          filtered.map((opt) => {
            const active = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <span className="truncate">{opt.name}</span>
                {active && <Check className="size-3.5 shrink-0" />}
              </button>
            );
          })
        )}

        {!query && options.length > MAX_RENDERED_OPTIONS && narrowHint && (
          <p className="border-t border-border/60 px-2.5 py-1.5 text-center text-[11px] text-muted-foreground tabular-nums">
            {narrowHint}
          </p>
        )}
      </div>
    </div>
  );

  if (variant === "mobile") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex h-9 w-full items-center justify-between gap-1 rounded-xl border px-2.5 text-xs font-semibold transition-colors active:scale-[0.98]",
            selected
              ? "border-[#0d5c46] bg-[#0d5c46] text-white shadow-xs"
              : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-[#0d5c46]/40 hover:bg-white",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1">
            {icon}
            <span className="truncate">{selected ? selected.name : label}</span>
          </span>
          {selected ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Clear ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange(undefined);
                }
              }}
              className="shrink-0 rounded-full bg-white/20 p-0.5 hover:bg-white/30"
            >
              <X className="size-3" />
            </span>
          ) : (
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          )}
        </button>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="top-[8%] max-w-[calc(100vw-1.5rem)] translate-y-0 rounded-2xl p-0 sm:max-w-md">
            <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3 text-left">
              <DialogTitle className="text-sm font-bold">{label}</DialogTitle>
              <span className="mr-6 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                {options.length}
              </span>
            </DialogHeader>
            {listContent}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center justify-between gap-2 rounded-xl border px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border bg-background/70 text-foreground hover:border-primary/40 hover:bg-muted/40",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("shrink-0", selected ? "text-primary" : "text-muted-foreground")}>
              {icon}
            </span>
            <span className="truncate">
              {selected ? selected.name : allLabel}
            </span>
          </span>
          {selected ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Clear ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange(undefined);
                }
              }}
              className="shrink-0 rounded-full p-0.5 hover:bg-primary/15"
            >
              <X className="size-3.5" />
            </span>
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-70" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
          <span>{label}</span>
          <span className="tabular-nums">{options.length}</span>
        </div>
        {listContent}
      </PopoverContent>
    </Popover>
  );
}
