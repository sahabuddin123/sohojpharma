import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type OnboardingStatus = {
  branchCount: number;
  warehouseCount: number;
  registerCount: number;
  defaultWarehouseId: string | null;
  completionPct: number;
  isComplete: boolean;
  isLoading: boolean;
};

/**
 * Counts the minimum entities a tenant needs to operate the POS:
 * branches, warehouses, and cash registers. Used by the global
 * onboarding gate and the dashboard checklist card.
 */
export function useOnboardingStatus(): OnboardingStatus {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const query = useQuery({
    enabled: !!tenantId,
    queryKey: ["onboarding-status", tenantId],
    staleTime: 10_000,
    queryFn: async () => {
      const [branches, warehouses, registers, defaultWh] = await Promise.all([
        supabase
          .from("branches")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("deleted_at", null),
        supabase
          .from("warehouses")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("deleted_at", null),
        supabase
          .from("cash_registers")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
        supabase
          .from("warehouses")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("is_default", true)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        branchCount: branches.count ?? 0,
        warehouseCount: warehouses.count ?? 0,
        registerCount: registers.count ?? 0,
        defaultWarehouseId: (defaultWh.data?.id as string | undefined) ?? null,
      };
    },
  });

  const data = query.data ?? {
    branchCount: 0,
    warehouseCount: 0,
    registerCount: 0,
    defaultWarehouseId: null,
  };

  const steps = [data.branchCount > 0, data.warehouseCount > 0, data.registerCount > 0];
  const completionPct = Math.round((steps.filter(Boolean).length / steps.length) * 100);

  return {
    ...data,
    completionPct,
    isComplete: completionPct === 100,
    isLoading: query.isLoading,
  };
}
