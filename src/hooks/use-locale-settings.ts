import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getLocaleSettings,
  updateLocaleSettings,
  DEFAULT_LOCALE,
  type LocaleSettings,
} from "@/lib/api/locale.functions";

export function useLocaleSettings(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getLocaleSettings);
  const updateFn = useServerFn(updateLocaleSettings);
  const key = ["locale-settings", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<LocaleSettings>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<LocaleSettings>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save locale");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("Locale saved");
    },
  });

  return {
    locale: (query.data ?? DEFAULT_LOCALE) as LocaleSettings,
    isLoading: query.isLoading,
    save: mutation.mutate,
    saveAsync: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
