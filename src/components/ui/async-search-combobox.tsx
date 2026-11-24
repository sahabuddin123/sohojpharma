import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface AsyncOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface AsyncSearchComboboxProps {
  value: string;                             // selected label (name) displayed on trigger
  onChange: (label: string, option?: AsyncOption) => void;
  placeholder?: string;
  emptyText?: string;
  createLabel?: string;
  onCreateNew?: (query: string) => void;
  error?: boolean;
  disabled?: boolean;
  className?: string;
  minChars?: number;                         // default 2
  pageSize?: number;                         // default 20
  fetchPage: (args: { search: string; page: number; pageSize: number }) => Promise<{ rows: AsyncOption[]; hasMore: boolean }>;
  reloadToken?: number;
}

/**
 * Real Combobox: Popover + cmdk Command + CommandInput.
 * Works correctly inside Dialog — CommandInput keeps focus, typing filters,
 * arrow keys navigate, Enter selects, Esc closes.
 */
export function AsyncSearchCombobox({
  value,
  onChange,
  placeholder = "Search…",
  emptyText = "No results found.",
  createLabel,
  onCreateNew,
  error,
  disabled,
  className,
  minChars = 2,
  pageSize = 20,
  fetchPage,
  reloadToken = 0,
}: AsyncSearchComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [rows, setRows] = React.useState<AsyncOption[]>([]);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const reqIdRef = React.useRef(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const focusSearchInput = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    });
  }, []);

  React.useEffect(() => {
    if (open) focusSearchInput();
  }, [focusSearchInput, open]);

  // Debounce input 250ms
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Reset & load first page when opened / query changes / reloadToken bumps
  React.useEffect(() => {
    if (!open) return;
    if (debounced.length > 0 && debounced.length < minChars) {
      setRows([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const rid = ++reqIdRef.current;
    setLoading(true);
    fetchPage({ search: debounced, page: 1, pageSize })
      .then((res) => {
        if (cancelled || rid !== reqIdRef.current) return;
        setRows(res.rows);
        setHasMore(res.hasMore);
        setPage(1);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open, minChars, pageSize, fetchPage, reloadToken]);

  const loadMore = React.useCallback(async () => {
    if (loading || !hasMore) return;
    const next = page + 1;
    const rid = ++reqIdRef.current;
    setLoading(true);
    try {
      const res = await fetchPage({ search: debounced, page: next, pageSize });
      if (rid !== reqIdRef.current) return;
      setRows((r) => [...r, ...res.rows]);
      setHasMore(res.hasMore);
      setPage(next);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, debounced, pageSize, fetchPage]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) void loadMore();
  };

  const pick = (opt: AsyncOption) => {
    onChange(opt.label, opt);
    setOpen(false);
    setQuery("");
  };

  const closeSearchOnly = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };

  const stopDialogKeyboardShortcuts = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") return;
    event.stopPropagation();
  };

  const trimmed = query.trim();
  const canCreate =
    !!onCreateNew &&
    trimmed.length >= minChars &&
    !loading &&
    !rows.some((r) => r.label.toLowerCase() === trimmed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-12 w-full justify-between font-normal",
            !value && "text-muted-foreground",
            error && "border-red-500",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[70] max-h-[min(356px,var(--radix-popover-content-available-height))] w-[--radix-popover-trigger-width] overflow-hidden p-0"
        align="start"
        sideOffset={4}
        portalled={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusSearchInput();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={stopDialogKeyboardShortcuts}
      >
        {/* shouldFilter=false — filtering is server-side */}
        <Command shouldFilter={false} className="max-h-[inherit] min-h-0 bg-popover">
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            onKeyDown={closeSearchOnly}
            placeholder={placeholder}
            autoFocus
            wrapperClassName="sticky top-0 z-20 h-11 shrink-0 bg-popover px-3"
            className="h-11 text-sm"
          />
          {loading && (
            <Loader2 className="pointer-events-none absolute right-3 top-3.5 z-30 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <CommandList
            ref={listRef}
            onScroll={onScroll}
            className="max-h-72 min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {debounced.length > 0 && debounced.length < minChars && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Type at least {minChars} characters…
              </div>
            )}
            {!loading && rows.length === 0 && debounced.length >= minChars && (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            {rows.length > 0 && (
              <CommandGroup>
                {rows.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.id}
                    onSelect={() => pick(opt)}
                    onMouseDown={(event) => event.preventDefault()}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === opt.label ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="truncate text-xs text-muted-foreground">
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
                {loading && rows.length > 0 && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </CommandGroup>
            )}
            {canCreate && onCreateNew && (
              <CommandGroup className="border-t">
                <CommandItem
                  value={`__create__${trimmed}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onSelect={() => {
                    onCreateNew(trimmed);
                    setOpen(false);
                  }}
                  className="cursor-pointer text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {createLabel ?? "Create new"}
                  {trimmed && <span className="ml-1 font-medium">"{trimmed}"</span>}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
