import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  delta?: number;
  icon: LucideIcon;
  tone?: "primary" | "secondary" | "success" | "warning";
}

const toneMap = {
  primary: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800/50",
  secondary: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700/60",
  success: "bg-teal-50 text-teal-700 ring-1 ring-teal-200/60 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800/50",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800/50",
};

export function StatCard({ label, value, delta, icon: Icon, tone = "primary" }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="transition-colors hover:border-slate-300/90 dark:hover:border-slate-700">
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:whitespace-normal sm:text-xs">{label}</p>
          <p className="mt-1.5 truncate text-xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white sm:text-2xl">{value}</p>
          {delta !== undefined && (
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold",
                positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
              )}
            >
              {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              <span className="tabular-nums">{Math.abs(delta)}% vs last week</span>
            </p>
          )}
        </div>
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10", toneMap[tone])}>
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </div>
      </CardContent>
    </Card>
  );
}
