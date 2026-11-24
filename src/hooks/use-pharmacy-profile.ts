import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getPharmacyProfile,
  updatePharmacyProfile,
  type PharmacyProfile,
} from "@/lib/api/pharmacy-profile.functions";

export type PharmacyProfilePatch = Omit<
  PharmacyProfile,
  "id" | "profile_updated_at" | "profile_updated_by"
>;

export function usePharmacyProfile(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getPharmacyProfile);
  const saveFn = useServerFn(updatePharmacyProfile);
  const key = ["pharmacy-profile", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: PharmacyProfilePatch) =>
      saveFn({ data: { tenant_id: tenant_id!, patch: patch as never } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PharmacyProfile>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("Pharmacy profile saved");
    },
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    save: mutation.mutate,
    saveAsync: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
