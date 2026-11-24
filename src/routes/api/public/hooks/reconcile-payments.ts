import { createFileRoute } from "@tanstack/react-router";

// Reconciliation job — scheduled via pg_cron.
// Finds payments stuck in `processing` (no processed_at) and queries bKash
// to confirm or fail them. Activates subscription when paid.

const MAX_AGE_MIN = 10; // only look at payments at least 10 minutes old
const MAX_BATCH = 25;

async function handle(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { bkashQueryPayment } = await import("@/lib/api/bkash.server");

  const cutoff = new Date(Date.now() - MAX_AGE_MIN * 60_000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("subscription_payments")
    .select("id,tenant_id,gateway,gateway_payment_id,amount,currency,gateway_retry_count")
    .eq("payment_status", "processing")
    .is("processed_at", null)
    .eq("gateway", "bkash")
    .lt("created_at", cutoff)
    .limit(MAX_BATCH);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; outcome: string }> = [];

  for (const row of rows ?? []) {
    if (!row.gateway_payment_id) {
      results.push({ id: row.id, outcome: "skipped_no_payment_id" });
      continue;
    }
    try {
      const q = await bkashQueryPayment(row.gateway_payment_id);
      const ok = q.statusCode === "0000" || q.transactionStatus === "Completed";
      const failed = q.transactionStatus === "Cancelled" || q.transactionStatus === "Failed";

      if (ok) {
        await supabaseAdmin
          .from("subscription_payments")
          .update({
            payment_status: "paid",
            status: "paid",
            gateway_transaction_id: q.trxID ?? null,
            gateway_response: q as any,
            verified_at: new Date().toISOString(),
            gateway_retry_count: (row.gateway_retry_count ?? 0) + (q._retries ?? 0) + 1,
          })
          .eq("id", row.id);
        await supabaseAdmin.from("audit_log").insert({
          tenant_id: row.tenant_id,
          action: "payment_reconciled",
          entity_table: "subscription_payments",
          entity_id: row.id,
          after_data: { trxID: q.trxID, via: "reconcile" } as any,
        });
        await supabaseAdmin.rpc("write_billing_event" as any, {
          _tenant_id: row.tenant_id,
          _subscription_id: null,
          _event_type: "payment_executed",
          _payload: { trxID: q.trxID, via: "reconcile" } as any,
          _amount: row.amount,
          _currency: row.currency,
          _status: "paid",
          _event_id: `payment_executed:${row.id}`,
        } as any);
        const { error: actErr } = await supabaseAdmin.rpc(
          "activate_subscription_from_payment" as any,
          { _payment_id: row.id } as any,
        );
        results.push({ id: row.id, outcome: actErr ? "activation_failed" : "activated" });
      } else if (failed) {
        await supabaseAdmin
          .from("subscription_payments")
          .update({
            status: "failed",
            payment_status: "failed",
            gateway_response: q as any,
            gateway_error: `reconcile:${q.transactionStatus}`,
            gateway_retry_count: (row.gateway_retry_count ?? 0) + (q._retries ?? 0) + 1,
          })
          .eq("id", row.id);
        await supabaseAdmin.from("audit_log").insert({
          tenant_id: row.tenant_id,
          action: "payment_failed",
          entity_table: "subscription_payments",
          entity_id: row.id,
          after_data: { via: "reconcile", status: q.transactionStatus } as any,
        });
        await supabaseAdmin.rpc("write_billing_event" as any, {
          _tenant_id: row.tenant_id,
          _subscription_id: null,
          _event_type: "payment_failed",
          _payload: { via: "reconcile", status: q.transactionStatus } as any,
          _amount: row.amount,
          _currency: row.currency,
          _status: "failed",
          _event_id: `payment_failed:${row.id}`,
        } as any);
        results.push({ id: row.id, outcome: "failed" });
      } else {
        results.push({ id: row.id, outcome: `pending:${q.transactionStatus ?? "unknown"}` });
      }
    } catch (e: any) {
      await supabaseAdmin
        .from("subscription_payments")
        .update({
          gateway_error: `reconcile_error:${e?.message ?? "unknown"}`,
          gateway_retry_count: (row.gateway_retry_count ?? 0) + 1,
        })
        .eq("id", row.id);
      results.push({ id: row.id, outcome: "error" });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/reconcile-payments")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
