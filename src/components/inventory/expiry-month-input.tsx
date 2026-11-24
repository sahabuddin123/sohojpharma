import { useEffect, useRef, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Returns ISO yyyy-mm-dd for the LAST day of the given month.
export function lastDayOfMonthISO(year: number, month1to12: number): string {
  const d = new Date(Date.UTC(year, month1to12, 0)); // day 0 => last day prev month
  return d.toISOString().slice(0, 10);
}

export function isoToMonthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  if (!y || !m) return "";
  return `${m}/${y}`;
}

/** Parse "MM/YYYY" or "M/YYYY". Returns ISO date of last day of month, or null. */
export function parseMonthYear(input: string): string | null {
  const s = input.trim();
  const match = /^(\d{1,2})\s*[\/\-\.]\s*(\d{4})$/.exec(s);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  if (!Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12) return null;
  if (year < 1900 || year > 2999) return null;
  return lastDayOfMonthISO(year, month);
}

function addMonthsISO(baseISO: string, months: number): string {
  const d = baseISO ? new Date(baseISO + "T00:00:00Z") : new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1 + months;
  const targetYear = y + Math.floor((m - 1) / 12);
  const targetMonth = ((m - 1) % 12 + 12) % 12 + 1;
  return lastDayOfMonthISO(targetYear, targetMonth);
}

type Props = {
  /** ISO yyyy-mm-dd */
  value: string;
  onChange: (iso: string) => void;
  onEnter?: () => void;
  minISO?: string; // rejects any month whose last-day < minISO
  autoFocus?: boolean;
  className?: string;
};

export function ExpiryMonthInput({ value, onChange, onEnter, minISO, autoFocus, className }: Props) {
  const [text, setText] = useState(isoToMonthYear(value));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync text when value changes externally (quick buttons / calendar)
  useEffect(() => {
    setText(isoToMonthYear(value));
  }, [value]);

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => inputRef.current?.focus());
  }, [autoFocus]);

  const commit = (raw: string): boolean => {
    const iso = parseMonthYear(raw);
    if (!iso) { setError("Use MM/YYYY (e.g. 07/2026)"); return false; }
    if (minISO && iso < minISO) { setError("Expiry must be in the future / after mfg date"); return false; }
    setError(null);
    onChange(iso);
    return true;
  };

  const handleText = (v: string) => {
    // Auto-insert slash after 2 digits for smoother typing
    let s = v.replace(/[^\d\/\-\.]/g, "");
    if (/^\d{3,}$/.test(s)) s = s.slice(0, 2) + "/" + s.slice(2, 6);
    setText(s);
    setError(null);
    const iso = parseMonthYear(s);
    if (iso && (!minISO || iso >= minISO)) onChange(iso);
  };

  const quick = [
    { label: "+6 M", months: 6 },
    { label: "+1 Y", months: 12 },
    { label: "+2 Y", months: 24 },
    { label: "+3 Y", months: 36 },
    { label: "+5 Y", months: 60 },
  ];

  const base = value || new Date().toISOString().slice(0, 10);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={text}
          placeholder="MM/YYYY"
          inputMode="numeric"
          maxLength={7}
          onChange={(e) => handleText(e.target.value)}
          onBlur={(e) => { if (e.target.value) commit(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); if (commit(text)) onEnter?.(); }
          }}
          className={cn("font-mono", error && "border-destructive")}
          aria-invalid={!!error}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="Open calendar">
              <CalendarIcon className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={value ? new Date(value + "T00:00:00") : undefined}
              onSelect={(d) => {
                if (!d) return;
                const iso = lastDayOfMonthISO(d.getFullYear(), d.getMonth() + 1);
                if (minISO && iso < minISO) { setError("Expiry must be in the future / after mfg date"); return; }
                onChange(iso);
                setError(null);
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <Button
            key={q.label}
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              const iso = addMonthsISO(base, q.months);
              onChange(iso);
              setError(null);
            }}
          >
            {q.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Format ISO date as "MMM YYYY" (e.g. "Jul 2026") */
export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Format ISO date as "31 Jul 2026" for tooltips */
export function formatFullDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
