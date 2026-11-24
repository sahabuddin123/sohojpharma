import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getPosSettings,
  updatePosSettings,
  DEFAULT_POS_SETTINGS,
  type PosSettings,
} from "@/lib/api/pos-settings.functions";

export function usePosSettings(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getPosSettings);
  const updateFn = useServerFn(updatePosSettings);
  const key = ["pos-settings", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<PosSettings>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PosSettings>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save POS settings");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("POS settings saved");
    },
  });

  return {
    settings: (query.data ?? DEFAULT_POS_SETTINGS) as PosSettings,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
