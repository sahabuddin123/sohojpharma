// B8.5 — Offline sync. Mobile clients post a batch of queued operations
// captured while offline; server replays each through existing RPCs and
// returns a per-op result so the client can ack/retry.
import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, guard } from "@/lib/public-api/auth";
import { mobileError, mobileOk } from "@/lib/public-api/mobile";

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
              const rpcArgs: Record<string, unknown> = {
                _tenant_id: tenantId,
                _customer_id: p.customer_id ?? null,
                _cashier_id: p.cashier_id ?? null,
                _invoice_no: String(p.invoice_no ?? `MOB-${op.client_op_id.slice(0, 8)}`),
                _discount: Number(p.discount ?? 0),
                _notes: p.notes ?? null,
                _client_op_id: op.client_op_id,
                _items: p.items ?? [],
                _payments: p.payments ?? [],
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
              const p = op.payload as Record<string, unknown>;
              const name = String(p.name ?? "").trim();
              if (!name) throw new Error("customer name required");
              const { data, error } = await supabaseAdmin
                .from("customers")
                .upsert(
                  { ...(p as Record<string, unknown>), name, tenant_id: tenantId } as never,
                  { onConflict: "tenant_id,phone", ignoreDuplicates: false },
                )
                .select("id")
                .maybeSingle();
              if (error) throw error;
              results.push({ client_op_id: op.client_op_id, type: op.type, status: "applied", id: data?.id });
            } else if (op.type === "inventory.adjust") {
              const p = op.payload as Record<string, unknown>;
              const adjArgs: Record<string, unknown> = {
                _tenant_id: tenantId,
                _product_id: String(p.product_id),
                _batch_id: String(p.batch_id),
                _qty_change: Number(p.qty_change),
                _movement_type: String(p.movement_type ?? "adjustment"),
                _reason: p.reason ?? "mobile sync",
                _reference_no: p.reference_no ?? null,
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
