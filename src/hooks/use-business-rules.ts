import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getBusinessRules,
  updateBusinessRules,
  DEFAULT_BUSINESS_RULES,
  type BusinessRules,
} from "@/lib/api/business-rules.functions";

export function useBusinessRules(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getBusinessRules);
  const updateFn = useServerFn(updateBusinessRules);
  const key = ["business-rules", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<BusinessRules>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BusinessRules>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save business rules");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("Business rules saved");
    },
  });

  return {
    rules: (query.data ?? DEFAULT_BUSINESS_RULES) as BusinessRules,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
