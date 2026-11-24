import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type ActiveRegister = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  user_id: string;
  register_name: string;
  opening_amount: number;
  opened_at: string;
  status: "open" | "closed";
  notes: string | null;
};

/** Returns the currently-open register for the signed-in cashier (if any). */
export function useActiveRegister() {
  const { currentTenantId, user } = useAuth();
  const tenantId = currentTenantId ?? "";
  const userId = user?.id ?? "";

  return useQuery({
    queryKey: ["active-register", tenantId, userId],
    enabled: !!tenantId && !!userId,
    queryFn: async (): Promise<ActiveRegister | null> => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("id,tenant_id,branch_id,user_id,register_name,opening_amount,opened_at,status,notes")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ActiveRegister) ?? null;
    },
    staleTime: 15_000,
  });
}

export type RegisterSummary = {
  opening_cash: number;
  cash_sales: number;
  card_sales: number;
  bkash_sales: number;
  nagad_sales: number;
  rocket_sales: number;
  bank_sales: number;
  refunds_cash: number;
  refunds_total: number;
  due_collection_cash: number;
  supplier_payment_cash: number;
  expenses_cash: number;
  cash_in: number;
  cash_out: number;
  expected_cash: number;
};

export function useRegisterSummary(registerId: string | null | undefined) {
  return useQuery({
    queryKey: ["register-summary", registerId],
    enabled: !!registerId,
    queryFn: async (): Promise<RegisterSummary | null> => {
      const { data, error } = await supabase.rpc("cash_register_summary" as never, {
        _register_id: registerId,
      } as never);
      if (error) throw error;
      return data as unknown as RegisterSummary;
    },
    refetchInterval: 10_000,
  });
}
