import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getNumberSeries,
  updateNumberSeries,
  previewNumberSeries,
  DEFAULT_NUMBER_SERIES,
  type DocType,
  type NumberSeries,
  type SeriesEntry,
} from "@/lib/api/number-series.functions";

export function useNumberSeries(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getNumberSeries);
  const updateFn = useServerFn(updateNumberSeries);
  const previewFn = useServerFn(previewNumberSeries);
  const key = ["number-series", tenant_id];
  const previewKey = ["number-series-preview", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 30_000,
  });

  const preview = useQuery({
    queryKey: previewKey,
    queryFn: () => previewFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<Record<DocType, Partial<SeriesEntry>>>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onSuccess: (series) => {
      qc.setQueryData(key, (old: { series: NumberSeries; counters: Record<string, number> } | undefined) =>
        old ? { ...old, series } : { series, counters: {} },
      );
      qc.invalidateQueries({ queryKey: previewKey });
      toast.success("Number series saved");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save number series");
    },
  });

  return {
    series: query.data?.series ?? DEFAULT_NUMBER_SERIES,
    counters: query.data?.counters ?? {},
    preview: (preview.data ?? {}) as Partial<Record<DocType, string>>,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
