import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getSystemPreferences,
  updateSystemPreferences,
  DEFAULT_SYSTEM_PREFERENCES,
  type SystemPreferences,
} from "@/lib/api/system-preferences.functions";

export function useSystemPreferences(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getSystemPreferences);
  const updateFn = useServerFn(updateSystemPreferences);
  const key = ["system-preferences", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<SystemPreferences>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SystemPreferences>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save preferences");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      toast.success("System preferences saved");
    },
  });

  return {
    prefs: (query.data ?? DEFAULT_SYSTEM_PREFERENCES) as SystemPreferences,
    isLoading: query.isLoading,
    save: mutation.mutate,
    isSaving: mutation.isPending,
  };
}

/**
 * Apply tenant system preferences globally:
 * - Dark mode → toggles `dark` class on <html>
 * - Compact mode → toggles `compact` class on <html>
 */
export function useApplySystemPreferences(tenant_id: string | undefined) {
  const { prefs } = useSystemPreferences(tenant_id);
  const router = useRouter();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    // Note: `dark` class is owned by the user's UI store (src/stores/ui-store.ts)
    // so the user's theme toggle persists across pages. Only apply compact here.
    root.classList.toggle("compact", !!prefs.compact_mode);
  }, [prefs.compact_mode]);


  // One-shot landing-page redirect per session, only from the default /store entry.
  useEffect(() => {
    if (typeof window === "undefined" || !tenant_id) return;
    const flagKey = `pc.landing.redirected:${tenant_id}`;
    if (sessionStorage.getItem(flagKey) === "1") return;
    const target = prefs.landing_page;
    if (!target || target === "/store") {
      sessionStorage.setItem(flagKey, "1");
      return;
    }
    if (window.location.pathname === "/store") {
      sessionStorage.setItem(flagKey, "1");
      router.navigate({ to: target, replace: true });
    }
  }, [tenant_id, prefs.landing_page, router]);
}
