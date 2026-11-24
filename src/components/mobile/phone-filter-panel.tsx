import { useMemo, useState } from "react";
import { CalendarRange, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneCard, PhoneChip } from "@/components/mobile/phone-ui";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { useActiveWarehouse } from "@/hooks/use-active-warehouse";

export type RangePreset = "today" | "7d" | "30d" | "mtd" | "custom";

export interface PhoneFilters {
  preset: RangePreset;
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  branchId: string | null;
  warehouseId: string | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function rangeForPreset(preset: RangePreset, from?: string, to?: string) {
  const today = new Date();
  const end = iso(today);
  if (preset === "custom" && from && to) return { from, to };
  if (preset === "today") return { from: end, to: end };
  if (preset === "mtd") {
    return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: end };
  }
  const days = preset === "7d" ? 6 : 29;
  const start = new Date(today);
  start.setDate(start.getDate() - days);
  return { from: iso(start), to: end };
}

export function defaultPhoneFilters(): PhoneFilters {
  const r = rangeForPreset("30d");
  return { preset: "30d", from: r.from, to: r.to, branchId: null, warehouseId: null };
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "mtd", label: "This month" },
  { id: "custom", label: "Custom" },
];

export function PhoneFilterPanel({
  value,
  onChange,
}: {
  value: PhoneFilters;
  onChange: (next: PhoneFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const { branches } = useActiveBranch();
  const { warehouses } = useActiveWarehouse();

  const scopedWarehouses = useMemo(
    () => (value.branchId ? warehouses.filter((w) => w.branch_id === value.branchId) : warehouses),
    [warehouses, value.branchId],
  );

  const set = (patch: Partial<PhoneFilters>) => onChange({ ...value, ...patch });

  const setPreset = (preset: RangePreset) => {
    if (preset === "custom") return set({ preset });
    const r = rangeForPreset(preset);
    set({ preset, from: r.from, to: r.to });
  };

  const branchName = branches.find((b) => b.id === value.branchId)?.name;
  const whName = warehouses.find((w) => w.id === value.warehouseId)?.name;
  const summary = [
    PRESETS.find((p) => p.id === value.preset)?.label,
    branchName,
    whName,
  ].filter(Boolean).join(" · ");

  const isFiltered = value.branchId || value.warehouseId || value.preset !== "30d";

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-left text-sm",
          isFiltered ? "border-primary/40 bg-primary/5" : "border-border bg-card",
        )}
      >
        <Filter className="h-4 w-4 text-primary" />
        <span className="flex-1 truncate font-medium text-foreground">{summary || "Filters"}</span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Change"}</span>
      </button>

      {open && (
        <PhoneCard className="mt-2 space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" /> Date range
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <PhoneChip key={p.id} active={value.preset === p.id} onClick={() => setPreset(p.id)}>
                  {p.label}
                </PhoneChip>
              ))}
            </div>
            {value.preset === "custom" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">
                  From
                  <input
                    type="date"
                    value={value.from}
                    onChange={(e) => set({ from: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  To
                  <input
                    type="date"
                    value={value.to}
                    onChange={(e) => set({ to: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branch</p>
            <div className="flex flex-wrap gap-2">
              <PhoneChip active={!value.branchId} onClick={() => set({ branchId: null, warehouseId: null })}>
                All
              </PhoneChip>
              {branches.map((b) => (
                <PhoneChip
                  key={b.id}
                  active={value.branchId === b.id}
                  onClick={() => set({ branchId: b.id, warehouseId: null })}
                >
                  {b.name}
                </PhoneChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Warehouse</p>
            <div className="flex flex-wrap gap-2">
              <PhoneChip active={!value.warehouseId} onClick={() => set({ warehouseId: null })}>
                All
              </PhoneChip>
              {scopedWarehouses.map((w) => (
                <PhoneChip
                  key={w.id}
                  active={value.warehouseId === w.id}
                  onClick={() => set({ warehouseId: w.id })}
                >
                  {w.name}
                </PhoneChip>
              ))}
              {scopedWarehouses.length === 0 && (
                <span className="py-2 text-xs text-muted-foreground">No warehouses in this branch.</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onChange(defaultPhoneFilters())}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" /> Reset filters
          </button>
        </PhoneCard>
      )}
    </div>
  );
}

/** Keeps only rows whose parsed date falls inside the selected range. */
export function withinRange(label: string, from: string, to: string) {
  const t = Date.parse(label);
  if (Number.isNaN(t)) return true;
  const d = new Date(t).toISOString().slice(0, 10);
  return d >= from && d <= to;
}
