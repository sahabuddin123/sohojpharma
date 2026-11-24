import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const LineSchema = z.object({
  po_item_id: z.string().uuid(),
  batch_no: z.string().min(1),
  mfg_date: z.string().optional(),
  expiry_date: z.string().min(1),
  qty_received: z.number().positive(),
  unit_cost: z.number().min(0).optional(),
});

const ReceiveSchema = z.object({
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(),
  po_id: z.string().uuid(),
  grn_no: z.string().min(1),
  notes: z.string().optional(),
  allow_over: z.boolean().default(false),
  lines: z.array(LineSchema).min(1),
});

export const grnReceive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator((i: unknown) => ReceiveSchema.parse(i))
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: grn, error } = await context.supabase.rpc("grn_receive", {
      _tenant_id: data.tenant_id,
      _po_id: data.po_id,
      _grn_no: data.grn_no,
      _notes: data.notes,
      _allow_over: data.allow_over,
      _lines: data.lines,
    });
    if (error) throw new Error(error.message);

    const grnId = (grn as { id?: string } | null)?.id;
    if (grnId && data.branch_id) {
      await context.supabase.from("goods_receipts").update({ branch_id: data.branch_id }).eq("id", grnId);
      await context.supabase.from("goods_receipt_items").update({ branch_id: data.branch_id }).eq("grn_id", grnId);
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "grn.receive", entity_table: "goods_receipts", entity_id: grnId,
        after_data: { po_id: data.po_id, grn_no: data.grn_no, lines: data.lines.length },
      });
    }
    return grn;
  });

export const listGrnsForPo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("purchase")])
  .inputValidator((i: unknown) =>
    z.object({ tenant_id: z.string().uuid(), po_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("goods_receipts")
      .select("*, goods_receipt_items(*)")
      .eq("tenant_id", data.tenant_id)
      .eq("po_id", data.po_id)
      .order("received_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const grnApprove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("purchase")])
  .inputValidator((i: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      branch_id: z.string().uuid().optional(),
      grn_id: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: grn, error } = await context.supabase.rpc("grn_approve", {
      _tenant_id: data.tenant_id,
      _grn_id: data.grn_id,
    });
    if (error) throw new Error(error.message);
    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "grn.approve", entity_table: "goods_receipts", entity_id: data.grn_id,
      });
    }
    return grn;
  });

export const listPendingGrns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireFeature("purchase")])
  .inputValidator((i: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("goods_receipts")
      .select("*, goods_receipt_items(*)")
      .eq("tenant_id", data.tenant_id)
      .eq("status", "pending_approval")
      .order("received_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
