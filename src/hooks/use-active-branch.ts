import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type BranchOption = {
  id: string;
  name: string;
  code: string;
  branch_role: "head_office" | "branch" | "sub_branch";
  parent_branch_id: string | null;
  is_main: boolean;
};

const lsKey = (tenantId: string) => `sohojpharma.branch_id:${tenantId}`;

/**
 * Active-branch context for multi-branch enterprise mode.
 *
 * - `branches`     — all branches in the active tenant the user can see (RLS-filtered)
 * - `branchId`     — currently selected branch (null until chosen)
 * - `setBranchId`  — persist selection per tenant
 * - `selected`     — full record for the active branch
 * - `headOffice`   — convenience pointer to the tenant's head office
 */
export function useActiveBranch() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const { data: branches = [] } = useQuery<BranchOption[]>({
    enabled: !!tenantId,
    queryKey: ["branches-active", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, code, branch_role, parent_branch_id, is_main")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as BranchOption[];
    },
  });

  const [branchId, setBranchIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(lsKey(tenantId));
    setBranchIdState(stored && stored.length > 0 ? stored : null);
  }, [tenantId]);

  // Auto-pick head office, single branch, or first available.
  useEffect(() => {
    if (!tenantId || branchId || branches.length === 0) return;
    const head = branches.find((b) => b.branch_role === "head_office");
    const main = branches.find((b) => b.is_main);
    const pick = head ?? main ?? branches[0];
    if (pick) setBranchId(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, branches, branchId]);

  // Drop stale selection if it disappears.
  useEffect(() => {
    if (!branchId || branches.length === 0) return;
    if (!branches.some((b) => b.id === branchId)) {
      setBranchId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches]);

  const setBranchId = (id: string | null) => {
    setBranchIdState(id);
    if (!tenantId || typeof window === "undefined") return;
    if (id) window.localStorage.setItem(lsKey(tenantId), id);
    else window.localStorage.removeItem(lsKey(tenantId));
  };

  const selected = branches.find((b) => b.id === branchId) ?? null;
  const headOffice = branches.find((b) => b.branch_role === "head_office") ?? null;

  return { branches, branchId, setBranchId, selected, headOffice };
}
