// Global Catalog → Inventory Import — server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const OptionsSchema = z.object({
  create_products: z.boolean().default(true),
  create_inventory: z.boolean().default(true),
  create_barcodes: z.boolean().default(true),
  link_generic: z.boolean().default(true),
  link_manufacturer: z.boolean().default(true),
  create_categories: z.boolean().default(true),
  opening_stock: z.number().default(0),
  purchase_price: z.number().default(0),
  sale_price: z.number().default(0),
  status: z.enum(["active", "inactive"]).default("active"),
}).partial().passthrough();

const StartInput = z.object({
  tenant_id: z.string().uuid(),
  scope: z.enum(["selected", "search", "all"]),
  medicine_ids: z.array(z.string().uuid()).default([]),
  filter_q: z.string().nullable().optional(),
  filter_rx_only: z.boolean().nullable().optional(),
  options: OptionsSchema.default({}),
  branch_id: z.string().uuid().nullable().optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
});

export const startGlobalImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => StartInput.parse(d))
  .handler(async ({ data, context }): Promise<{ job_id: string }> => {
    const { data: jobId, error } = await context.supabase.rpc("start_global_import_job", {
      _tenant: data.tenant_id,
      _scope: data.scope,
      _medicine_ids: data.medicine_ids,
      _filter_q: data.filter_q ?? null,
      _filter_rx_only: data.filter_rx_only ?? null,
      _options: data.options as never,
      _branch: data.branch_id ?? null,
      _warehouse: data.warehouse_id ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { job_id: jobId as unknown as string };
  });

const ChunkInput = z.object({ job_id: z.string().uuid(), batch: z.number().int().min(1).max(500).default(100) });
export type ImportChunkResult = {
  status: string;
  has_more: boolean;
  processed: number;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
};

export const processImportChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => ChunkInput.parse(d))
  .handler(async ({ data, context }): Promise<ImportChunkResult> => {
    const { data: res, error } = await context.supabase.rpc("process_global_import_chunk", {
      _job: data.job_id, _batch: data.batch,
    } as never);
    if (error) throw new Error(error.message);
    return res as unknown as ImportChunkResult;
  });

const JobIn = z.object({ job_id: z.string().uuid() });
export const getImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => JobIn.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("import_jobs").select("*").eq("id", data.job_id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
