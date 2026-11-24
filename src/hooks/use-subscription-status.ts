import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type SubscriptionState =
  | "active"
  | "trial"
  | "grace"
  | "expired"
  | "suspended"
  | "none";

export interface SubscriptionStatus {
  state: SubscriptionState;
  days_remaining: number;
  subscription_id?: string | null;
  plan_id?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  status?: string | null;
}

export function useSubscriptionStatus() {
  const { currentTenantId } = useAuth();
  return useQuery({
    queryKey: ["subscription-status", currentTenantId],
    enabled: !!currentTenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<SubscriptionStatus> => {
      const { data, error } = await supabase.rpc(
        "current_tenant_subscription_status",
        { _tenant_id: currentTenantId! },
      );
      if (error) throw error;
      return (data ?? { state: "none", days_remaining: 0 }) as unknown as SubscriptionStatus;
    },
  });
}

export function isSubscriptionUsable(state: SubscriptionState | undefined) {
  return state === "active" || state === "trial" || state === "grace";
}
