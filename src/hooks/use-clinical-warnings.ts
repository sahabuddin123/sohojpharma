import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClinicalWarnings, getAlternativeSuggestions, smartMedicineSearch, getMedicineInsight } from "@/lib/api/clinical.functions";

/** Module 4 — POS Clinical Warning Panel (non-blocking) */
export function useClinicalWarnings(medicineIds: string[]) {
  const fn = useServerFn(getClinicalWarnings);
  return useQuery({
    queryKey: ["clinical", "warnings", [...medicineIds].sort()],
    queryFn: () => fn({ data: { medicine_ids: medicineIds } }),
    enabled: medicineIds.length > 0,
    staleTime: 60_000,
  });
}

/** Module 1 — Alternative Suggestions */
export function useAlternativeSuggestions(medicineId?: string) {
  const fn = useServerFn(getAlternativeSuggestions);
  return useQuery({
    queryKey: ["clinical", "alternatives", medicineId],
    queryFn: () => fn({ data: { medicine_id: medicineId! } }),
    enabled: !!medicineId,
    staleTime: 5 * 60_000,
  });
}

/** Module 6 — Smart Medicine Search */
export function useSmartMedicineSearch(q: string, limit = 25) {
  const fn = useServerFn(smartMedicineSearch);
  return useQuery({
    queryKey: ["clinical", "search", q, limit],
    queryFn: () => fn({ data: { q, limit } }),
    staleTime: 30_000,
  });
}

/** Module 7 — Medicine Insight Panel */
export function useMedicineInsight(medicineId?: string) {
  const fn = useServerFn(getMedicineInsight);
  return useQuery({
    queryKey: ["clinical", "insight", medicineId],
    queryFn: () => fn({ data: { medicine_id: medicineId! } }),
    enabled: !!medicineId,
    staleTime: 60_000,
  });
}
