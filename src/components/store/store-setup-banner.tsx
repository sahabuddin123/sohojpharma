import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type SetupStatus = { complete: boolean; branches: unknown[]; warehouses: unknown[]; member_default_branch_id: string | null };

export function StoreSetupBanner() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { data } = useQuery({
    enabled: !!tenantId,
    queryKey: ["store-setup-status", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_store_setup_status" as never, { _tenant_id: tenantId } as never);
      if (error) throw error;
      return data as unknown as SetupStatus;
    },
    staleTime: 60_000,
  });

  if (!data || data.complete) return null;

  return (
    <Link
      to="/setup-store"
      className="flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 transition-colors hover:bg-warning/10"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-warning/15 text-warning">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Store setup incomplete</p>
          <p className="text-xs text-muted-foreground">
            Branch, warehouse, ba user assignment baki ache — POS/stock thik moto kaaj korar jonno setup wizard ta complete koro.
          </p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1 rounded-md bg-warning px-3 py-1.5 text-xs font-semibold text-warning-foreground">
        Setup now <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
