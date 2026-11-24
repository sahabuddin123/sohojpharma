import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTenantSettings, updateTenantSettings, type TenantSettings } from "@/lib/api/tenant-settings.functions";
import { toast } from "sonner";

export function useTenantSettings(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getTenantSettings);
  const updateFn = useServerFn(updateTenantSettings);
  const key = ["tenant-settings", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<Omit<TenantSettings, "tenant_id" | "updated_by" | "created_at" | "updated_at">>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TenantSettings>(key);
      if (prev) {
        const optimistic: TenantSettings = { ...prev };
        for (const [k, v] of Object.entries(patch)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (optimistic as any)[k] = { ...(((prev as any)[k] as object) ?? {}), ...((v as object) ?? {}) };
        }
        qc.setQueryData(key, optimistic);
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("Settings saved");
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    save: mutation.mutate,
    saveAsync: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
