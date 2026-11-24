import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getReportSettings,
  updateReportSettings,
  DEFAULT_REPORT_SETTINGS,
  type ReportSettings,
} from "@/lib/api/report-settings.functions";

export function useReportSettings(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getReportSettings);
  const updateFn = useServerFn(updateReportSettings);
  const key = ["report-settings", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<ReportSettings>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ReportSettings>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save report settings");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("Report settings saved");
    },
  });

  return {
    settings: (query.data ?? DEFAULT_REPORT_SETTINGS) as ReportSettings,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
