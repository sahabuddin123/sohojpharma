import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BarcodeBatchInfo = {
  batch_no: string | null;
  expiry_date: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  qty_on_hand: number;
};

const EMPTY: BarcodeBatchInfo = {
  batch_no: null,
  expiry_date: null,
  warehouse_id: null,
  warehouse_name: null,
  qty_on_hand: 0,
};

const SingleInput = z.object({
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
});

const BulkInput = z.object({
  tenantId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).max(500),
});

// Loose RPC caller — the generated Database types may not yet include the new RPC
// names; we cast at the call site to avoid widening the auth-middleware context type.
type RpcCaller = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

async function fetchBatch(rpc: RpcCaller, tenantId: string, productId: string): Promise<BarcodeBatchInfo> {
  const { data, error } = await rpc("get_product_batch_for_barcode", { _tenant_id: tenantId, _product_id: productId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return EMPTY;
  const r = row as Partial<BarcodeBatchInfo>;
  return {
    batch_no: r.batch_no ?? null,
    expiry_date: r.expiry_date ?? null,
    warehouse_id: r.warehouse_id ?? null,
    warehouse_name: r.warehouse_name ?? null,
    qty_on_hand: Number(r.qty_on_hand ?? 0),
  };
}

export const getBarcodeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SingleInput.parse(d))
  .handler(async ({ data, context }) => {
    const rpc = ((context.supabase as unknown as { rpc: RpcCaller }).rpc).bind(context.supabase) as RpcCaller;
    return await fetchBatch(rpc, data.tenantId, data.productId);
  });

export const getBarcodeBatchBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkInput.parse(d))
  .handler(async ({ data, context }) => {
    const rpc = ((context.supabase as unknown as { rpc: RpcCaller }).rpc).bind(context.supabase) as RpcCaller;
    const out: Record<string, BarcodeBatchInfo> = {};
    await Promise.all(
      data.productIds.map(async (pid) => {
        out[pid] = await fetchBatch(rpc, data.tenantId, pid);
      }),
    );
    return out;
  });

export const generateAutoBarcode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const rpc = ((context.supabase as unknown as { rpc: RpcCaller }).rpc).bind(context.supabase) as RpcCaller;
    const { data: code, error } = await rpc("next_auto_barcode", { _tenant_id: data.tenantId });
    if (error) throw new Error(error.message);
    return { barcode: String(code ?? "") };
  });
