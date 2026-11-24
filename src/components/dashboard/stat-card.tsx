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
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
};

export function StatCard({ label, value, delta, icon: Icon, tone = "primary" }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="border-border/60 shadow-card transition-shadow hover:shadow-elevated">
      <CardContent className="flex items-start justify-between gap-2 p-3 sm:gap-4 sm:p-5">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:whitespace-normal sm:text-xs">{label}</p>
          <p className="mt-1 truncate text-lg font-bold tracking-tight text-foreground sm:mt-2 sm:text-2xl">{value}</p>
          {delta !== undefined && (
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-1 text-[10px] font-semibold sm:mt-2 sm:text-xs",
                positive ? "text-success" : "text-destructive",
              )}
            >
              {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(delta)}% vs last week
            </p>
          )}
        </div>
        <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-11 sm:w-11 sm:rounded-xl", toneMap[tone])}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
