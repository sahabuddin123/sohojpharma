import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTenantFeatures, type TenantFeatureMap } from "@/lib/api/features.functions";
import type { PlanFeature } from "@/lib/api/middleware/require-feature";

/** Single hook — caches tenant feature map for the session. */
export function useTenantFeatures() {
  const fn = useServerFn(getTenantFeatures);
  return useQuery<TenantFeatureMap>({
    queryKey: ["tenant-features"],
    queryFn: () => fn(),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export interface UseFeatureResult {
  enabled: boolean;
  loading: boolean;
  feature: PlanFeature;
}

/** Returns enablement for a single feature key. */
export function useFeature(featureKey: PlanFeature): UseFeatureResult {
  const { data, isLoading } = useTenantFeatures();
  return {
    enabled: Boolean(data?.[featureKey]),
    loading: isLoading,
    feature: featureKey,
  };
}
