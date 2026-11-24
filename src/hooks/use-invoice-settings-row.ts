import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getInvoiceSettingsRow,
  updateInvoiceSettingsRow,
  previewNextInvoiceNo,
  DEFAULT_INVOICE_SETTINGS,
  type InvoiceSettingsRow,
} from "@/lib/api/invoice-settings.functions";

export function useInvoiceSettingsRow(tenant_id: string | undefined) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getInvoiceSettingsRow);
  const updateFn = useServerFn(updateInvoiceSettingsRow);
  const previewFn = useServerFn(previewNextInvoiceNo);
  const key = ["invoice-settings-row", tenant_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id,
    staleTime: 30_000,
  });

  const preview = useQuery({
    queryKey: ["invoice-settings-preview-no", tenant_id, query.data?.invoice_prefix, query.data?.starting_number],
    queryFn: () => previewFn({ data: { tenant_id: tenant_id! } }),
    enabled: !!tenant_id && !!query.data,
    staleTime: 10_000,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<InvoiceSettingsRow>) =>
      updateFn({ data: { tenant_id: tenant_id!, patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<InvoiceSettingsRow>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to save invoice settings");
    },
    onSuccess: (row) => {
      qc.setQueryData(key, row);
      qc.invalidateQueries({ queryKey: ["invoice-settings"] }); // legacy consumers
      qc.invalidateQueries({ queryKey: ["pos-invoice-print-settings", tenant_id] });
      qc.invalidateQueries({ queryKey: ["invoice-settings-preview-no", tenant_id] });
      toast.success("Invoice settings saved");
    },
  });

  return {
    settings: (query.data ?? DEFAULT_INVOICE_SETTINGS) as InvoiceSettingsRow,
    nextInvoiceNo: preview.data?.next ?? "—",
    isLoading: query.isLoading,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
