/**
 * Branch write-guard helper for server functions.
 *
 * Every write-capable server function in Phase 4B-2 must:
 *   1. Receive `branch_id` from the client (`useActiveBranch().branchId`).
 *   2. Call `assertBranchWrite(supabase, tenantId, branchId)` BEFORE the
 *      insert/update. The DB function `validate_branch_write` checks
 *      `is_corporate_role(tenant_id) OR has_branch_access(uid, branch_id)`
 *      and returns a structured JSON result.
 *
 * Auto-derive triggers from Phase 4B-1 stay in place as a safety net,
 * but production code must NOT rely on them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type BranchWriteResult =
  | { ok: true; scope: "corporate" | "branch" }
  | { ok: false; code: "branch_access_denied" | "branch_id_required" | "unauthenticated"; branch_id?: string };

export class BranchAccessError extends Error {
  code: BranchWriteResult extends { ok: false; code: infer C } ? C : never;
  branch_id?: string;
  constructor(result: Extract<BranchWriteResult, { ok: false }>) {
    super(`branch_write_rejected:${result.code}`);
    this.name = "BranchAccessError";
    // @ts-expect-error narrowed
    this.code = result.code;
    this.branch_id = result.branch_id;
  }
}

/**
 * Throws BranchAccessError if the caller cannot write to the branch.
 * Use inside server-function handlers (RLS context active).
 */
export async function assertBranchWrite(
  supabase: SupabaseClient,
  tenantId: string,
  branchId: string | null | undefined,
): Promise<Extract<BranchWriteResult, { ok: true }>> {
  if (!branchId) {
    throw new BranchAccessError({ ok: false, code: "branch_id_required" });
  }
  const { data, error } = await supabase.rpc("validate_branch_write", {
    _tenant_id: tenantId,
    _branch_id: branchId,
  });
  if (error) throw error;
  const result = data as BranchWriteResult;
  if (!result?.ok) {
    throw new BranchAccessError(result as Extract<BranchWriteResult, { ok: false }>);
  }
  return result;
}

/**
 * Convenience: stamp tenant_id + branch_id onto a payload row.
 */
export function withBranchScope<T extends Record<string, unknown>>(
  payload: T,
  tenantId: string,
  branchId: string,
): T & { tenant_id: string; branch_id: string } {
  return { ...payload, tenant_id: tenantId, branch_id: branchId };
}
