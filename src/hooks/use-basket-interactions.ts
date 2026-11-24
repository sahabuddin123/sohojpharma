// Phase 3.4 — Module 11: POS interaction warnings (READ-ONLY, non-blocking).
// Wrap the POS cart with this hook to fetch interactions for the current basket.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBasketInteractions } from "@/lib/api/clinical.functions";

export type BasketInteraction = {
  medicine_a: string; medicine_b: string;
  severity: "minor" | "moderate" | "major";
  description: string | null; clinical_effect: string | null; recommendation: string | null;
  a_name: string; b_name: string;
};

export function useBasketInteractions(medicineIds: string[]) {
  const fn = useServerFn(getBasketInteractions);
  const ids = [...new Set(medicineIds.filter(Boolean))].sort();
  return useQuery({
    enabled: ids.length >= 2,
    queryKey: ["basket-interactions", ids],
    queryFn: async () => (await fn({ data: { medicine_ids: ids } })) as BasketInteraction[],
    staleTime: 60_000,
  });
}
