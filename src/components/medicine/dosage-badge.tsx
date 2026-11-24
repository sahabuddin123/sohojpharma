import { cn } from "@/lib/utils";

const VARIANTS: Record<string, string> = {
  tablet: "bg-blue-100 text-blue-700",
  capsule: "bg-violet-100 text-violet-700",
  syrup: "bg-orange-100 text-orange-700",
  suspension: "bg-amber-100 text-amber-700",
  injection: "bg-red-100 text-red-700",
  suppository: "bg-pink-100 text-pink-700",
  drop: "bg-cyan-100 text-cyan-700",
  drops: "bg-cyan-100 text-cyan-700",
  cream: "bg-green-100 text-green-700",
  ointment: "bg-emerald-100 text-emerald-700",
  gel: "bg-lime-100 text-lime-700",
  inhaler: "bg-indigo-100 text-indigo-700",
  powder: "bg-yellow-100 text-yellow-800",
};

const UNKNOWN = "bg-gray-100 text-gray-600";

export function getDosageBadgeVariant(dosageForm?: string | null): string {
  if (!dosageForm) return UNKNOWN;
  const key = dosageForm.trim().toLowerCase();
  if (VARIANTS[key]) return VARIANTS[key];
  // partial keyword match (e.g. "eye drop", "im injection", "oral suspension")
  for (const k of Object.keys(VARIANTS)) {
    if (key.includes(k)) return VARIANTS[k];
  }
  return UNKNOWN;
}

export function DosageBadge({
  dosageForm,
  className,
}: {
  dosageForm?: string | null;
  className?: string;
}) {
  const label = (dosageForm ?? "").trim();
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-[2px] text-[12px] font-bold leading-none",
        getDosageBadgeVariant(label),
        className,
      )}
    >
      {label}
    </span>
  );
}
