import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useUIStore } from "@/stores/ui-store";
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

const v2ToneMap = {
  primary: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  secondary: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
  success: "bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-300",
  warning: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
};

export function StatCard({ label, value, delta, icon: Icon, tone = "primary" }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  const isV2 = useUIStore((s) => s.desktopUiVersion === "v2");

  if (isV2) {
    return (
      <Card className="transition-all hover:translate-y-[-1px]">
        <CardContent className="flex items-center gap-3.5 p-4 sm:p-5">
          <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", v2ToneMap[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-600 dark:text-slate-300">
              {label}
            </p>
            <p className="mt-0.5 truncate text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white sm:text-[26px]">
              {value}
            </p>
            {delta !== undefined && (
              <p className={cn("mt-0.5 inline-flex items-center gap-1 text-xs font-semibold", positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                <span className="tabular-nums">{Math.abs(delta)}%</span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

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
