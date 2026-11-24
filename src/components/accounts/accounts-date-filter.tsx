import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";

export type DatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "custom";

export type AccountsDateRange = {
  preset: DatePreset;
  from: string;
  to: string;
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (from: string, to: string) => void;
};

const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function computePresetRange(preset: DatePreset): { from: string; to: string } {
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
      // Saturday as week start (Bangladesh standard) or Sunday/Monday; use last Saturday
      const d = new Date(now);
      const day = d.getDay(); // 0=Sun..6=Sat
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
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toISO(start), to: today };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toISO(start), to: toISO(end) };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: toISO(start), to: today };
    }
    case "last_year": {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31);
      return { from: toISO(start), to: toISO(end) };
    }
    case "custom":
    default:
      return { from: today, to: today };
  }
}

const AccountsDateContext = createContext<AccountsDateRange | null>(null);

export function AccountsDateProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<DatePreset>("this_month");
  const initial = computePresetRange("this_month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const setPreset = (p: DatePreset) => {
    setPresetState(p);
    if (p !== "custom") {
      const r = computePresetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const setCustomRange = (f: string, t: string) => {
    setPresetState("custom");
    setFrom(f);
    setTo(t);
  };

  const value = useMemo(
    () => ({ preset, from, to, setPreset, setCustomRange }),
    [preset, from, to],
  );

  return <AccountsDateContext.Provider value={value}>{children}</AccountsDateContext.Provider>;
}

export function useAccountsDateFilter(): AccountsDateRange {
  const ctx = useContext(AccountsDateContext);
  if (!ctx) {
    const r = computePresetRange("this_month");
    return {
      preset: "this_month",
      from: r.from,
      to: r.to,
      setPreset: () => {},
      setCustomRange: () => {},
    };
  }
  return ctx;
}

export function AccountsDateFilterBar() {
  const { preset, from, to, setPreset, setCustomRange } = useAccountsDateFilter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
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
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={from}
          onChange={(e) => setCustomRange(e.target.value, to)}
          className="h-8 w-[135px] text-xs"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setCustomRange(from, e.target.value)}
          className="h-8 w-[135px] text-xs"
          aria-label="To date"
        />
      </div>
    </div>
  );
}
