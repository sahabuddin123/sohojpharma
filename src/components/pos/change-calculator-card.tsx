import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChangeCalculatorProps {
  total: number;
  received: number;
  onReceivedChange: (val: number) => void;
  currency?: string;
}

export function ChangeCalculatorCard({
  total,
  received,
  onReceivedChange,
  currency = "৳",
}: ChangeCalculatorProps) {
  const change = Math.max(0, received - total);
  const due = Math.max(0, total - received);

  const quickButtons = [
    { label: "সঠিক", value: Math.round(total) },
    { label: `${currency}১০০`, value: 100 },
    { label: `${currency}২০০`, value: 200 },
    { label: `${currency}৫০০`, value: 500 },
    { label: `${currency}১,০০০`, value: 1000 },
  ];

  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-50/50 to-background dark:from-emerald-950/20 dark:to-background p-3.5 shadow-sm">
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          ফেরতের হিসাব (Change Calculator)
        </span>
        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          অ্যাপই স্বয়ংক্রিয় করে দেয়
        </span>
      </div>

      {/* Row 1: মোট পরিশোধ (Total to pay) */}
      <div className="flex items-center justify-between rounded-lg bg-card p-2 border border-border">
        <span className="text-xs text-muted-foreground font-medium">মোট পরিশোধ</span>
        <span className="text-lg font-bold text-foreground">
          {currency} {total.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Row 2: পেয়েছি (Received cash) */}
      <div className="flex items-center justify-between rounded-lg bg-card p-2 border border-border">
        <div>
          <span className="text-xs text-muted-foreground font-medium block">পেয়েছি</span>
          <span className="text-[10px] text-muted-foreground/80">মুছতে × চাপুন</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-center">
            <span className="absolute left-2.5 text-sm font-bold text-muted-foreground">{currency}</span>
            <Input
              type="number"
              min={0}
              step="any"
              value={received > 0 ? received : ""}
              placeholder="0"
              onChange={(e) => onReceivedChange(Math.max(0, Number(e.target.value) || 0))}
              className="h-9 w-32 pl-7 pr-8 text-right font-bold text-base"
              onFocus={(e) => e.target.select()}
            />
            {received > 0 && (
              <button
                type="button"
                onClick={() => onReceivedChange(0)}
                className="absolute right-2 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                title="মুছুন"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: ফেরত দিতে হবে (Change to return) OR বাকি */}
      {received >= total ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200 animate-in fade-in-50">
          <div>
            <span className="block text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              ফেরত দিতে হবে
            </span>
            <span className="text-[11px] font-medium text-emerald-700/80 dark:text-emerald-400/80">
              এটা কাস্টমারকে ফেরত দিন
            </span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300">
              {currency} {change.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 flex items-center justify-between text-amber-900 dark:text-amber-200">
          <div>
            <span className="text-xs font-semibold block text-amber-800 dark:text-amber-300">বাকি থাকবে</span>
            <span className="text-[10px] text-amber-700/80 dark:text-amber-400">কাস্টমার বকেয়া খাতা</span>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {currency} {due.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Quick Tender Cash Buttons */}
      <div className="grid grid-cols-5 gap-1.5 pt-1">
        {quickButtons.map((btn) => {
          const isActive = received === btn.value;
          return (
            <button
              key={btn.label}
              type="button"
              onClick={() => onReceivedChange(btn.value)}
              className={cn(
                "h-8 rounded-lg border text-xs font-bold transition-all flex items-center justify-center",
                isActive
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                  : "border-border bg-card hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 text-foreground"
              )}
            >
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
