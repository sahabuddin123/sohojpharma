import { useState } from "react";
import { Calendar, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type DateFilterPreset =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "custom";

const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function getPresetDates(preset: DateFilterPreset): { from: string | undefined; to: string | undefined } {
  if (preset === "all") return { from: undefined, to: undefined };
  const now = new Date();
  const today = toISO(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = toISO(y);
      return { from: s, to: s };
    }
    case "this_week": {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 6 ? 0 : day + 1;
      d.setDate(d.getDate() - diff);
      return { from: toISO(d), to: today };
    }
    case "last_week": {
      const d = new Date(now);
      const day = d.getDay();
      const diffToSat = day === 6 ? 0 : day + 1;
      const thisSat = new Date(d);
      thisSat.setDate(d.getDate() - diffToSat);
      const lastSat = new Date(thisSat);
      lastSat.setDate(thisSat.getDate() - 7);
      const lastFri = new Date(thisSat);
      lastFri.setDate(thisSat.getDate() - 1);
      return { from: toISO(lastSat), to: toISO(lastFri) };
    }
    case "this_month":
      return { from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "last_month":
      return {
        from: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "this_year":
      return { from: toISO(new Date(now.getFullYear(), 0, 1)), to: today };
    case "last_year":
      return {
        from: toISO(new Date(now.getFullYear() - 1, 0, 1)),
        to: toISO(new Date(now.getFullYear() - 1, 11, 31)),
      };
    case "custom":
    default:
      return { from: today, to: today };
  }
}

export function useDateRangeFilter(defaultPreset: DateFilterPreset = "this_month") {
  const [preset, setPresetState] = useState<DateFilterPreset>(defaultPreset);
  const init = getPresetDates(defaultPreset);
  const [from, setFrom] = useState<string | undefined>(init.from);
  const [to, setTo] = useState<string | undefined>(init.to);

  const setPreset = (p: DateFilterPreset) => {
    setPresetState(p);
    if (p !== "custom") {
      const r = getPresetDates(p);
      setFrom(r.from);
      setTo(r.to);
    } else if (!from || !to) {
      const today = toISO(new Date());
      setFrom(from ?? today);
      setTo(to ?? today);
    }
  };

  const setCustom = (f: string | undefined, t: string | undefined) => {
    setPresetState("custom");
    setFrom(f);
    setTo(t);
  };

  const reset = () => setPreset(defaultPreset);

  return { preset, from, to, setPreset, setCustom, reset };
}

export function ModernDateRangeFilter({
  preset,
  from,
  to,
  onPresetChange,
  onCustomChange,
  allowAll = true,
  className = "",
}: {
  preset: DateFilterPreset;
  from: string | undefined;
  to: string | undefined;
  onPresetChange: (p: DateFilterPreset) => void;
  onCustomChange: (from: string | undefined, to: string | undefined) => void;
  allowAll?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-border/80 bg-card/90 p-1 shadow-xs backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center gap-1.5 pl-2">
        <Calendar className="h-3.5 w-3.5 text-primary" />
        <Select value={preset} onValueChange={(v) => onPresetChange(v as DateFilterPreset)}>
          <SelectTrigger className="h-8 w-[165px] border-0 bg-transparent px-1.5 text-xs font-medium shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowAll && <SelectItem value="all">সব সময় (All Time)</SelectItem>}
            <SelectItem value="today">আজ (Today)</SelectItem>
            <SelectItem value="yesterday">গতকাল (Yesterday)</SelectItem>
            <SelectItem value="this_week">এই সপ্তাহ (This Week)</SelectItem>
            <SelectItem value="last_week">গত সপ্তাহ (Last Week)</SelectItem>
            <SelectItem value="this_month">এই মাস (This Month)</SelectItem>
            <SelectItem value="last_month">গত মাস (Last Month)</SelectItem>
            <SelectItem value="this_year">এই বছর (This Year)</SelectItem>
            <SelectItem value="last_year">গত বছর (Last Year)</SelectItem>
            <SelectItem value="custom">কাস্টম রেঞ্জ (Custom)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {preset !== "all" && (
        <div className="flex items-center gap-1 border-l border-border/60 pl-1.5">
          <Input
            type="date"
            value={from ?? ""}
            onChange={(e) => onCustomChange(e.target.value || undefined, to)}
            className="h-7 w-[126px] rounded-lg border-0 bg-muted/60 px-2 text-xs shadow-none focus-visible:ring-1"
            aria-label="From date"
          />
          <span className="text-[11px] text-muted-foreground">→</span>
          <Input
            type="date"
            value={to ?? ""}
            onChange={(e) => onCustomChange(from, e.target.value || undefined)}
            className="h-7 w-[126px] rounded-lg border-0 bg-muted/60 px-2 text-xs shadow-none focus-visible:ring-1"
            aria-label="To date"
          />
          {allowAll && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => onPresetChange("all")}
              title="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
