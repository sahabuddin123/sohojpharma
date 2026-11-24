import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type WarehouseOption = {
  id: string;
  name: string;
  branch_id: string | null;
  branch_name: string | null;
};

const lsKey = (tenantId: string) => `sohojpharma.pos.warehouse_id:${tenantId}`;

/**
 * Lists warehouses for the active tenant and tracks the cashier's currently
 * selected warehouse in localStorage so the choice survives reloads.
 *
 * - `warehouses`        — all warehouses available to the tenant
 * - `warehouseId`       — currently selected warehouse id (null until chosen)
 * - `setWarehouseId`    — change selection and persist it per tenant
 * - `selected`          — full record for the active warehouse, if any
 */
export function useActiveWarehouse() {
  const { currentTenantId, isAppAdmin, impersonating } = useAuth();
  const tenantId = currentTenantId ?? "";
  const useAdminRpc = isAppAdmin && impersonating;

  const { data: warehouses = [], isLoading, isFetched } = useQuery<WarehouseOption[]>({
    enabled: !!tenantId,
    queryKey: ["warehouses-for-pos", tenantId, useAdminRpc ? "admin" : "member"],
    queryFn: async () => {
      if (useAdminRpc) {
        const { data, error } = await (supabase.rpc as any)("admin_list_warehouses", {
          _tenant_id: tenantId,
        });
        if (error) throw error;
        return ((data ?? []) as Array<{
          id: string; name: string; branch_id: string | null; branch_name: string | null;
        }>).map((w) => ({
          id: w.id,
          name: w.name,
          branch_id: w.branch_id,
          branch_name: w.branch_name ?? null,
        }));
      }
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, branch_id, branches:branch_id(name)")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string; name: string; branch_id: string | null;
        branches: { name: string } | null;
      }>).map((w) => ({
        id: w.id,
        name: w.name,
        branch_id: w.branch_id,
        branch_name: w.branches?.name ?? null,
      }));
    },
  });

  const [warehouseId, setWarehouseIdState] = useState<string | null>(null);

  // Hydrate from localStorage once tenant is known.
  useEffect(() => {
    if (!tenantId || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(lsKey(tenantId));
    setWarehouseIdState(stored && stored.length > 0 ? stored : null);
  }, [tenantId]);

  // If only one warehouse exists, auto-select it.
  useEffect(() => {
    if (!tenantId || warehouseId || warehouses.length !== 1) return;
    setWarehouseId(warehouses[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, warehouses, warehouseId]);

  // If the stored value no longer matches any warehouse, clear it.
  useEffect(() => {
    if (!warehouseId || warehouses.length === 0) return;
    if (!warehouses.some((w) => w.id === warehouseId)) {
      setWarehouseId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses]);

  const setWarehouseId = (id: string | null) => {
    setWarehouseIdState(id);
    if (!tenantId || typeof window === "undefined") return;
    if (id) window.localStorage.setItem(lsKey(tenantId), id);
    else window.localStorage.removeItem(lsKey(tenantId));
  };

  const selected = warehouses.find((w) => w.id === warehouseId) ?? null;

  return { warehouses, warehouseId, setWarehouseId, selected, isLoading, isFetched };
}
