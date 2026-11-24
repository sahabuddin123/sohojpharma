// React hooks for the Phase 2 printing module.
// All hooks scope by tenantId; pass null to no-op (e.g. before tenant ready).
import { useCallback, useEffect, useState } from "react";
import {
  getPrintingSettings,
  upsertPrintingSettings,
  listPrinterProfiles,
  upsertPrinterProfile,
  deletePrinterProfile,
  listPrintJobs,
  cancelPrintJob,
  listLabelTemplates,
  upsertLabelTemplate,
  getPrinterHealthSnapshot,
} from "./server.functions";
import { printQueue, type QueueItem } from "./queue";
import { printerHealth, type HealthSnapshot } from "./health";

interface TenantArg { tenantId: string | null; branchId?: string | null }

export function usePrintingSettingsRemote({ tenantId, branchId }: TenantArg) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const row = await getPrintingSettings({ data: { tenant_id: tenantId, branch_id: branchId ?? null } });
      setData(row as Record<string, unknown> | null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tenantId, branchId]);

  useEffect(() => { void reload(); }, [reload]);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    if (!tenantId) return;
    const row = await upsertPrintingSettings({ data: { tenant_id: tenantId, branch_id: branchId ?? null, ...patch } });
    setData(row as Record<string, unknown>);
    return row;
  }, [tenantId, branchId]);

  return { data, loading, error, reload, save };
}

export function usePrinterProfiles({ tenantId, branchId }: TenantArg) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const rows = await listPrinterProfiles({ data: { tenant_id: tenantId, branch_id: branchId ?? null } });
      setItems(rows as Array<Record<string, unknown>>);
    } finally {
      setLoading(false);
    }
  }, [tenantId, branchId]);

  useEffect(() => { void reload(); }, [reload]);

  const upsert = useCallback(async (input: Record<string, unknown>) => {
    if (!tenantId) return;
    await upsertPrinterProfile({ data: { tenant_id: tenantId, branch_id: branchId ?? null, ...input } as never });
    await reload();
  }, [tenantId, branchId, reload]);

  const remove = useCallback(async (id: string) => {
    if (!tenantId) return;
    await deletePrinterProfile({ data: { tenant_id: tenantId, id } });
    await reload();
  }, [tenantId, reload]);

  return { items, loading, reload, upsert, remove };
}

export function usePrintHistory({ tenantId, branchId, status }: TenantArg & { status?: string }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const rows = await listPrintJobs({
        data: {
          tenant_id: tenantId,
          branch_id: branchId ?? null,
          status: status as never,
          limit: 200,
        },
      });
      setItems(rows as Array<Record<string, unknown>>);
    } finally {
      setLoading(false);
    }
  }, [tenantId, branchId, status]);

  useEffect(() => { void reload(); }, [reload]);

  const cancel = useCallback(async (id: string) => {
    if (!tenantId) return;
    await cancelPrintJob({ data: { tenant_id: tenantId, id } });
    await reload();
  }, [tenantId, reload]);

  return { items, loading, reload, cancel };
}

export function usePrintQueue() {
  const [items, setItems] = useState<ReadonlyArray<QueueItem>>(printQueue.snapshot());
  useEffect(() => printQueue.subscribe(setItems), []);
  return items;
}

export function usePrinterHealthMonitor({ tenantId, branchId }: TenantArg): HealthSnapshot {
  const [snap, setSnap] = useState<HealthSnapshot>(printerHealth.snapshot());
  useEffect(() => {
    printerHealth.configure(tenantId, branchId ?? null);
    return printerHealth.subscribe(setSnap);
  }, [tenantId, branchId]);
  return snap;
}

export function useLabelTemplates({ tenantId, kind }: { tenantId: string | null; kind?: string }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const rows = await listLabelTemplates({ data: { tenant_id: tenantId, kind: kind as never } });
      setItems(rows as Array<Record<string, unknown>>);
    } finally {
      setLoading(false);
    }
  }, [tenantId, kind]);

  useEffect(() => { void reload(); }, [reload]);

  const upsert = useCallback(async (input: Record<string, unknown>) => {
    if (!tenantId) return;
    await upsertLabelTemplate({ data: { tenant_id: tenantId, ...input } as never });
    await reload();
  }, [tenantId, reload]);

  return { items, loading, reload, upsert };
}

export function useHealthHistory({ tenantId }: { tenantId: string | null }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const reload = useCallback(async () => {
    if (!tenantId) return;
    const rows = await getPrinterHealthSnapshot({ data: { tenant_id: tenantId } });
    setItems(rows as Array<Record<string, unknown>>);
  }, [tenantId]);
  useEffect(() => { void reload(); }, [reload]);
  return { items, reload };
}
