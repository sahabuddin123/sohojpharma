import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getMedicineSettings,
  updateMedicineSettings,
  DEFAULT_MEDICINE_SETTINGS,
  type MedicineSettings,
} from "@/lib/api/medicine-settings.functions";

export function useMedicineSettings(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getMedicineSettings);
  const updateFn = useServerFn(updateMedicineSettings);
  const key = ["medicine-settings", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<MedicineSettings>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<MedicineSettings>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save medicine settings");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("Medicine settings saved");
    },
  });

  return {
    settings: (query.data ?? DEFAULT_MEDICINE_SETTINGS) as MedicineSettings,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
