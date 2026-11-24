import { createFileRoute } from "@tanstack/react-router";

// bKash redirects the user back here after checkout with:
//   ?paymentID=...&status=success|failure|cancel&ref=<payment-row-uuid>
// We treat `ref` as the callback nonce: it is the UUID we generated when
// creating the pending payment row, so an attacker would have to guess it.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALLBACK_TTL_MS = 30 * 60 * 1000; // 30 minutes

function redirect(to: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: to } });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const paymentID = (url.searchParams.get("paymentID") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").toLowerCase();
  const ref = (url.searchParams.get("ref") ?? "").trim();

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const ua = request.headers.get("user-agent") ?? null;

  const back = (qs: string) => redirect(`/billing/history?${qs}`);

  // Validate nonce (ref) — must be a UUID we issued.
  if (!ref || !UUID_RE.test(ref)) return jsonError("invalid_ref", 400);
  if (!paymentID && !status) return jsonError("missing_params", 400);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Locate row by ref (canonical) and cross-check paymentID if provided.
  const { data: row, error: lookupErr } = await supabaseAdmin
    .from("subscription_payments")
    .select("*")
    .eq("id", ref)
    .maybeSingle();

  if (lookupErr) return jsonError(lookupErr.message, 500);
  if (!row) return jsonError("payment_not_found", 404);

  // Ownership / mismatch: refuse if paymentID was forged.
  if (paymentID && row.gateway_payment_id && row.gateway_payment_id !== paymentID) {
    await supabaseAdmin.from("audit_log").insert({
      tenant_id: row.tenant_id,
      action: "payment_callback_mismatch",
      entity_table: "subscription_payments",
      entity_id: row.id,
      after_data: { expected: row.gateway_payment_id, got: paymentID, ip, ua } as any,
    });
    return jsonError("payment_id_mismatch", 400);
  }

  // Staleness: row must have been created in the last 30 minutes for a fresh callback.
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
  if (createdAt && Date.now() - createdAt > CALLBACK_TTL_MS && !row.processed_at) {
    await supabaseAdmin
      .from("subscription_payments")
      .update({
        gateway_error: "callback_stale",
        callback_processed_at: new Date().toISOString(),
        callback_ip: ip,
        callback_user_agent: ua,
        callback_nonce: ref,
      })
      .eq("id", row.id);
    return jsonError("callback_stale", 410);
  }

  // Persist callback metadata up-front (idempotent merge).
  await supabaseAdmin
    .from("subscription_payments")
    .update({
      callback_ip: ip,
      callback_user_agent: ua,
      callback_nonce: ref,
    })
    .eq("id", row.id);

  // Idempotency — already processed.
  if (row.processed_at) {
    await supabaseAdmin
      .from("subscription_payments")
      .update({ callback_processed_at: new Date().toISOString() })
      .eq("id", row.id);
    return back(`bkash=success&ref=${row.id}`);
  }

  const effectivePaymentID = paymentID || row.gateway_payment_id;

  const writeEvent = async (event_type: string, payload: any, evtStatus?: string) => {
    await supabaseAdmin.rpc("write_billing_event" as any, {
      _tenant_id: row.tenant_id,
      _subscription_id: row.subscription_id,
      _event_type: event_type,
      _payload: payload,
      _amount: row.amount,
      _currency: row.currency,
      _status: evtStatus ?? null,
      _event_id: `${event_type}:${row.id}`,
    } as any);
  };

  // User-cancelled or failed at gateway.
  if (status && status !== "success") {
    const finalStatus = status === "cancel" ? "cancelled" : "failed";
    await supabaseAdmin
      .from("subscription_payments")
      .update({
        status: finalStatus,
        payment_status: finalStatus,
        gateway_response: { callback_status: status } as any,
        callback_processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await supabaseAdmin.from("audit_log").insert({
      tenant_id: row.tenant_id,
      action: `payment_${finalStatus}`,
      entity_table: "subscription_payments",
      entity_id: row.id,
      after_data: { reason: status, ip, ua } as any,
    });
    await writeEvent(`payment_${finalStatus}`, { reason: status }, finalStatus);
    return back(`bkash=${finalStatus}&ref=${row.id}`);
  }

  if (!effectivePaymentID) return jsonError("missing_payment_id", 400);

  // Execute the payment (with retry inside bkash.server.ts).
  const { bkashExecutePayment, bkashQueryPayment } = await import("@/lib/api/bkash.server");
  let exec: any;
  let retries = 0;
  let executeErr: string | null = null;
  try {
    exec = await bkashExecutePayment(effectivePaymentID);
    retries += exec?._retries ?? 0;
  } catch (e: any) {
    executeErr = e?.message ?? "execute_failed";
  }

  // Fallback to query if execute did not confirm.
  if (!exec || (exec.statusCode !== "0000" && exec.transactionStatus !== "Completed")) {
    try {
      const q = await bkashQueryPayment(effectivePaymentID);
      retries += q?._retries ?? 0;
      exec = q;
    } catch (e: any) {
      executeErr = (executeErr ? executeErr + " | " : "") + (e?.message ?? "query_failed");
    }
  }

  const ok = exec && (exec.statusCode === "0000" || exec.transactionStatus === "Completed");
  if (!ok) {
    await supabaseAdmin
      .from("subscription_payments")
      .update({
        status: "failed",
        payment_status: "failed",
        gateway_response: exec as any,
        gateway_error: executeErr ?? `unexpected_status:${exec?.statusCode ?? "none"}`,
        gateway_retry_count: retries,
        callback_processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    await supabaseAdmin.from("audit_log").insert({
      tenant_id: row.tenant_id,
      action: "payment_failed",
      entity_table: "subscription_payments",
      entity_id: row.id,
      after_data: { stage: "execute", response: exec, error: executeErr, ip, ua } as any,
    });
    await writeEvent("payment_failed", { stage: "execute", error: executeErr, response: exec }, "failed");
    return back(`bkash=failed&ref=${row.id}`);
  }

  // Persist execute result.
  const { error: updErr } = await supabaseAdmin
    .from("subscription_payments")
    .update({
      payment_status: "paid",
      status: "paid",
      gateway_transaction_id: exec.trxID ?? null,
      gateway_response: exec as any,
      gateway_retry_count: retries,
      verified_at: new Date().toISOString(),
      transaction_id: exec.trxID ?? row.transaction_id,
      callback_processed_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) return jsonError(updErr.message, 500);

  await supabaseAdmin.from("audit_log").insert({
    tenant_id: row.tenant_id,
    action: "payment_executed",
    entity_table: "subscription_payments",
    entity_id: row.id,
    after_data: { trxID: exec.trxID, amount: exec.amount, ip, ua } as any,
  });
  await writeEvent("payment_executed", { trxID: exec.trxID, amount: exec.amount }, "paid");

  // Activate subscription (idempotent; RPC writes its own audit + billing_event).
  const { error: actErr } = await supabaseAdmin.rpc(
    "activate_subscription_from_payment" as any,
    { _payment_id: row.id } as any,
  );
  if (actErr) return back(`bkash=activation_failed&ref=${row.id}`);

  return back(`bkash=success&ref=${row.id}`);
}

async function withWebhookGuard(request: Request): Promise<Response> {
  try {
    const res = await handle(request);
    if (res.status >= 400 && res.status !== 410) {
      const { notifyAdmin } = await import("@/lib/notify-admin.server");
      const url = new URL(request.url);
      const ref = (url.searchParams.get("ref") ?? "").trim() || null;
      const paymentID = (url.searchParams.get("paymentID") ?? "").trim() || null;
      const body = await res.clone().text().catch(() => "");
      await notifyAdmin({
        severity: "error",
        type: "webhook_failed",
        title: "bKash Callback Failed",
        message: `bKash callback returned ${res.status}.`,
        link: "/admin/payments",
        entityType: "subscription_payment",
        entityId: ref && /^[0-9a-f-]{36}$/i.test(ref) ? ref : null,
        metadata: { status: res.status, payment_id: paymentID, error: body.slice(0, 500) },
      });
    }
    return res;
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    const { notifyAdmin } = await import("@/lib/notify-admin.server");
    await notifyAdmin({
      severity: "error",
      type: "webhook_failed",
      title: "bKash Callback Exception",
      message: err.slice(0, 500),
      link: "/admin/payments",
      metadata: { error: err, url: request.url },
    });
    return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/bkash/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => withWebhookGuard(request),
      POST: async ({ request }) => withWebhookGuard(request),
    },
  },
});

