import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getBrandingSettings,
  updateBrandingSettings,
  type BrandingAsset,
  type BrandingSettings,
} from "@/lib/api/branding.functions";

const SIGNED_TTL = 60 * 60 * 24 * 365; // 1 year

const FIELD_MAP: Record<BrandingAsset, { urlKey: keyof BrandingSettings; pathKey: keyof BrandingSettings }> = {
  logo:         { urlKey: "logo_url",         pathKey: "logo_path" },
  receipt_logo: { urlKey: "receipt_logo_url", pathKey: "receipt_logo_path" },
  favicon:      { urlKey: "favicon_url",      pathKey: "favicon_path" },
  signature:    { urlKey: "signature_url",    pathKey: "signature_path" },
};

export function useBrandingSettings(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getBrandingSettings);
  const updateFn = useServerFn(updateBrandingSettings);
  const key = ["branding-settings", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: (vars: { patch: Partial<BrandingSettings>; action?: "branding.updated" | "branding.asset_uploaded" | "branding.asset_deleted" }) =>
      updateFn({ data: { tenant_id: tenant_id!, patch: vars.patch, action: vars.action ?? "branding.updated" } }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BrandingSettings>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...vars.patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save branding");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
    },
  });

  const uploadAsset = useCallback(
    async (asset: BrandingAsset, file: File) => {
      if (!tenant_id) throw new Error("No tenant");
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${tenant_id}/${asset}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw new Error(upErr.message);

      const { data: signed, error: sErr } = await supabase.storage
        .from("branding").createSignedUrl(path, SIGNED_TTL);
      if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "Failed to sign URL");

      const map = FIELD_MAP[asset];
      // Best-effort: delete previous asset file so storage doesn't accumulate.
      const prev = query.data as BrandingSettings | undefined;
      const prevPath = prev?.[map.pathKey] as string | undefined;
      if (prevPath && prevPath !== path) {
        await supabase.storage.from("branding").remove([prevPath]).catch(() => {});
      }

      await updateMut.mutateAsync({
        patch: { [map.urlKey]: signed.signedUrl, [map.pathKey]: path } as Partial<BrandingSettings>,
        action: "branding.asset_uploaded",
      });
      toast.success("Asset uploaded");
    },
    [tenant_id, updateMut, query.data],
  );

  const deleteAsset = useCallback(
    async (asset: BrandingAsset) => {
      const map = FIELD_MAP[asset];
      const prev = query.data as BrandingSettings | undefined;
      const path = prev?.[map.pathKey] as string | undefined;
      if (path) await supabase.storage.from("branding").remove([path]).catch(() => {});
      await updateMut.mutateAsync({
        patch: { [map.urlKey]: null, [map.pathKey]: null } as Partial<BrandingSettings>,
        action: "branding.asset_deleted",
      });
      toast.success("Asset removed");
    },
    [updateMut, query.data],
  );

  return {
    branding: (query.data ?? {}) as BrandingSettings,
    isLoading: query.isLoading,
    error: query.error,
    save: (patch: Partial<BrandingSettings>) => updateMut.mutateAsync({ patch }),
    isSaving: updateMut.isPending,
    uploadAsset,
    deleteAsset,
  };
}
