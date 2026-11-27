import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { setAppLanguage } from "@/i18n";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";
import {
  getLocaleSettings,
  updateLocaleSettings,
  DEFAULT_LOCALE,
  type LocaleSettings,
} from "@/lib/api/locale.functions";

function readCachedLocale(tenant_id: string | undefined): LocaleSettings {
  if (!tenant_id || typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(`pc_tenant_locale:${tenant_id}`);
    if (raw) return { ...DEFAULT_LOCALE, ...(JSON.parse(raw) as Partial<LocaleSettings>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function useLocaleSettings(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getLocaleSettings);
  const updateFn = useServerFn(updateLocaleSettings);
  const key = ["locale-settings", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return readCachedLocale(tenant_id);
      }
      try {
        const res = await fetchFn({ data: { tenant_id: tenant_id! } });
        if (typeof window !== "undefined" && tenant_id) {
          try {
            window.localStorage.setItem(`pc_tenant_locale:${tenant_id}`, JSON.stringify(res));
          } catch {
            /* ignore */
          }
        }
        return res;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return readCachedLocale(tenant_id);
        }
        throw err;
      }
    },
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
    onSuccess: (row, patch) => {
      qc.setQueryData(key, row);
      if (typeof window !== "undefined" && tenant_id) {
        try {
          window.localStorage.setItem(`pc_tenant_locale:${tenant_id}`, JSON.stringify(row));
        } catch {
          /* ignore */
        }
      }
      if (patch.language) {
        void setAppLanguage(patch.language);
      }
      toast.success("Locale saved");
    },
  });

  return {
    locale: (query.data ?? readCachedLocale(tenant_id)) as LocaleSettings,
    isLoading: query.isLoading,
    save: mutation.mutate,
    saveAsync: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
