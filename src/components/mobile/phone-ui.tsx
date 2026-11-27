import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type KpiTone = "rose" | "sky" | "lilac" | "mint";

const toneBg: Record<KpiTone, string> = {
  rose: "bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-card))]",
  sky: "bg-[color-mix(in_oklab,var(--color-accent)_28%,var(--color-card))]",
  lilac: "bg-[color-mix(in_oklab,var(--color-primary)_5%,var(--color-card))]",
  mint: "bg-[color-mix(in_oklab,var(--color-success,var(--color-accent))_18%,var(--color-card))]",
};

export function PhoneKpi({
  value,
  label,
  tone = "sky",
  accent,
  wide,
}: {
  value: ReactNode;
  label: string;
  tone?: KpiTone;
  accent?: "danger" | "info" | "success" | "warning";
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-4 text-center",
        toneBg[tone],
        wide && "col-span-2",
      )}
    >
      <p
        className={cn(
          "text-xl font-extrabold leading-tight",
          accent === "danger" && "text-destructive",
          accent === "info" && "text-primary",
          accent === "success" && "text-success",
          accent === "warning" && "text-warning",
          !accent && "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function PhoneKpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("phone-grid-keep grid grid-cols-2 gap-3", className)}>{children}</div>;
}

export function PhoneChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

export function PhoneChip({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-transparent bg-[#0d5c46] text-white font-semibold shadow-xs"
          : "border-border bg-card text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function PhoneEmpty({ title = "Hello There!", message }: { title?: string; message: string }) {
  return (
    <div className="py-20 text-center">
      <p className="text-3xl font-bold text-foreground">{title}</p>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function PhoneCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function PhoneRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function money(n: number | null | undefined) {
  return `৳ ${Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
