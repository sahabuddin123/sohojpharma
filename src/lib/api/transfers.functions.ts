import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadBusinessRules } from "@/lib/api/business-rules.functions";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const ItemSchema = z.object({
  product_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  qty: z.number().positive(),
  unit_cost: z.number().nonnegative().optional(),
});

export const requestTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => z.object({
    tenant_id: z.string().uuid(),
    branch_id: z.string().uuid().optional(),
    to_branch_id: z.string().uuid().optional(),
    from_warehouse_id: z.string().uuid(),
    to_warehouse_id: z.string().uuid(),
    items: z.array(ItemSchema).min(1),
    notes: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: id, error } = await context.supabase.rpc("stock_transfer_request", {
      _tenant_id: data.tenant_id,
      _from_warehouse_id: data.from_warehouse_id,
      _to_warehouse_id: data.to_warehouse_id,
      _items: data.items as never,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    const transferId = id as unknown as string;

    // Explicit branch stamp on line items (header from_branch_id is set by RPC)
    if (data.branch_id) {
      await context.supabase
        .from("stock_transfer_items")
        .update({ branch_id: data.branch_id })
        .eq("transfer_id", transferId);
    }


    const rules = await loadBusinessRules(context.supabase, data.tenant_id);
    if (!rules.require_transfer_approval) {
      const ap = await context.supabase.rpc("stock_transfer_approve", { _transfer_id: transferId });
      if (ap.error) throw new Error(ap.error.message);
      const rc = await context.supabase.rpc("stock_transfer_receive", { _transfer_id: transferId });
      if (rc.error) throw new Error(rc.error.message);
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id ?? null, user_id: context.userId,
        action: "transfer.auto_approved",
        entity_table: "stock_transfers", entity_id: transferId,
        after_data: { reason: "require_transfer_approval=false" },
      });
    }
    return { id: transferId };
  });

const TransferAction = z.object({
  transfer_id: z.string().uuid(),
  tenant_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
});

export const approveTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => TransferAction.parse(i))
  .handler(async ({ data, context }) => {
    if (data.tenant_id && data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { error } = await context.supabase.rpc("stock_transfer_approve", { _transfer_id: data.transfer_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => TransferAction.extend({ reason: z.string().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.tenant_id && data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { error } = await context.supabase.rpc("stock_transfer_reject", { _transfer_id: data.transfer_id, _reason: data.reason ?? undefined });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const receiveTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => TransferAction.parse(i))
  .handler(async ({ data, context }) => {
    if (data.tenant_id && data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { error } = await context.supabase.rpc("stock_transfer_receive", { _transfer_id: data.transfer_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
