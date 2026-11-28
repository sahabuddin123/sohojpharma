// B8.5 — Offline sync. Mobile clients post a batch of queued operations
// captured while offline; server replays each through existing RPCs and
// returns a per-op result so the client can ack/retry.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CORS_HEADERS, guard } from "@/lib/public-api/auth";
import { mobileError, mobileOk } from "@/lib/public-api/mobile";

const UuidZ = z.string().uuid();
const CustomerPayloadZ = z.object({
  name: z.string().trim().min(1).max(150),
  phone: z.string().trim().min(3).max(40).optional(),
  email: z.string().trim().email().max(150).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  gender: z.string().trim().max(24).nullable().optional(),
  date_of_birth: z.string().trim().max(32).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
const InventoryAdjustZ = z.object({
  product_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  qty_change: z.number().finite().refine((n) => n !== 0 && Math.abs(n) <= 100_000, "invalid qty_change"),
  movement_type: z.enum(["adjustment", "damage", "expired", "return", "restock"]).default("adjustment"),
  reason: z.string().trim().max(240).optional(),
  reference_no: z.string().trim().max(80).nullable().optional(),
});

type SyncOp =
  | { type: "sale.create"; client_op_id: string; payload: Record<string, unknown> }
  | { type: "customer.upsert"; client_op_id: string; payload: Record<string, unknown> }
  | { type: "payment.create"; client_op_id: string; payload: Record<string, unknown> }
  | { type: "inventory.adjust"; client_op_id: string; payload: Record<string, unknown> }
  | { type: "prescription.create"; client_op_id: string; payload: Record<string, unknown> };

export const Route = createFileRoute("/api/mobile/v1/sync")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const g = await guard(request, "write");
        if (!g.ok) return g.response;

        let body: { ops?: SyncOp[] };
        try {
          body = await request.json();
        } catch {
          await g.finish(400);
          return mobileError("invalid_json", "Body must be JSON", 400, { request });
        }
        const ops = Array.isArray(body?.ops) ? body.ops : [];
        if (ops.length === 0) {
          await g.finish(400);
          return mobileError("empty_batch", "ops[] is required", 400, { request });
        }
        if (ops.length > 200) {
          await g.finish(413);
          return mobileError("batch_too_large", "Max 200 ops per sync", 413, { request });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tenantId = g.key.tenantId;
        const results: Array<{
          client_op_id: string;
          type: string;
          status: "applied" | "duplicate" | "failed";
          id?: string;
          error?: string;
        }> = [];

        for (const op of ops) {
          try {
            if (op.type === "sale.create") {
              const p = op.payload as Record<string, unknown>;
              const customerId = p.customer_id ? UuidZ.parse(p.customer_id) : null;
              const cashierId = p.cashier_id ? UuidZ.parse(p.cashier_id) : null;
              const discount = Number(p.discount ?? 0);
              if (!Number.isFinite(discount) || discount < 0) throw new Error("invalid discount");
              const rpcArgs: Record<string, unknown> = {
                _tenant_id: tenantId,
                _customer_id: customerId,
                _cashier_id: cashierId,
                _invoice_no: String(p.invoice_no ?? `MOB-${op.client_op_id.slice(0, 8)}`).slice(0, 80),
                _discount: discount,
                _notes: p.notes ? String(p.notes).slice(0, 1000) : null,
                _client_op_id: String(op.client_op_id).slice(0, 80),
                _items: Array.isArray(p.items) ? p.items : [],
                _payments: Array.isArray(p.payments) ? p.payments : [],
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data, error } = await (supabaseAdmin.rpc as any)("pos_checkout", rpcArgs);
              if (error) throw error;
              results.push({
                client_op_id: op.client_op_id,
                type: op.type,
                status: "applied",
                id: (data as { id?: string } | null)?.id,
              });
            } else if (op.type === "customer.upsert") {
              // Whitelist fields strictly to prevent mass-assignment & cross-tenant id collisions
              const safeCust = CustomerPayloadZ.parse(op.payload);
              const { data, error } = await supabaseAdmin
                .from("customers")
                .upsert(
                  { ...safeCust, tenant_id: tenantId } as never,
                  { onConflict: "tenant_id,phone", ignoreDuplicates: false },
                )
                .select("id")
                .maybeSingle();
              if (error) throw error;
              results.push({ client_op_id: op.client_op_id, type: op.type, status: "applied", id: data?.id });
            } else if (op.type === "inventory.adjust") {
              const adj = InventoryAdjustZ.parse(op.payload);
              const adjArgs: Record<string, unknown> = {
                _tenant_id: tenantId,
                _product_id: adj.product_id,
                _batch_id: adj.batch_id,
                _qty_change: adj.qty_change,
                _movement_type: adj.movement_type,
                _reason: adj.reason ?? "mobile sync",
                _reference_no: adj.reference_no ?? null,
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data, error } = await (supabaseAdmin.rpc as any)("inventory_adjust", adjArgs);
              if (error) throw error;
              results.push({ client_op_id: op.client_op_id, type: op.type, status: "applied", id: (data as { id?: string } | null)?.id });
            } else {
              results.push({
                client_op_id: op.client_op_id,
                type: op.type,
                status: "failed",
                error: "unsupported_op_type",
              });
            }
          } catch (e) {
            results.push({
              client_op_id: op.client_op_id,
              type: op.type,
              status: "failed",
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        await g.finish(200);
        const failed = results.filter((r) => r.status === "failed").length;
        return mobileOk(
          { applied: results.length - failed, failed, results, server_time: new Date().toISOString() },
          { request, message: failed === 0 ? "All ops applied" : `${failed} op(s) failed` },
        );
      },
    },
  },
});
