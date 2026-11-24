import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getInventorySettings,
  updateInventorySettings,
  DEFAULT_INVENTORY_SETTINGS,
  type InventorySettings,
} from "@/lib/api/inventory-settings.functions";

export function useInventorySettings(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getInventorySettings);
  const updateFn = useServerFn(updateInventorySettings);
  const key = ["inventory-settings", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<InventorySettings>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<InventorySettings>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save inventory settings");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("Inventory settings saved");
    },
  });

  return {
    settings: (query.data ?? DEFAULT_INVENTORY_SETTINGS) as InventorySettings,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
