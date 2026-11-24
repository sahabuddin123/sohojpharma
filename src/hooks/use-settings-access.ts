import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettingsAccess } from "@/lib/api/tenant-settings.functions";

export function useSettingsAccess(tenant_id: string | undefined) {
  const fetchFn = useServerFn(getSettingsAccess);
  const q = useQuery({
    queryKey: ["settings-access", tenant_id],
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 60_000,
    retry: false,
  });
  return {
    loading: q.isLoading,
    role: q.data?.role ?? null,
    canView: q.data?.canView ?? false,
    canEdit: q.data?.canEdit ?? false,
    readOnly: q.data?.readOnly ?? false,
    error: q.error,
  };
}
