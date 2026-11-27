import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BILLING = ["monthly", "yearly"] as const;

async function getOrigin(): Promise<string> {
  const fromEnv = process.env.APP_PUBLIC_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  try {
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const host = getRequestHost();
    if (host) return `https://${host}`;
  } catch {
    /* fall through */
  }
  throw new Error("APP_PUBLIC_URL is not configured; cannot build bKash callback URL");
}

async function assertTenantMember(
  supabase: any,
  tenantId: string,
  userId: string,
) {
  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) throw new Error("Forbidden: not a member of this tenant");
}

export const createBkashPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      plan_id: z.string().uuid(),
      billing_cycle: z.enum(BILLING).default("monthly"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await assertTenantMember(supabase, data.tenant_id, userId);

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("id,name,price_bdt,price_yearly_bdt,is_active")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan || !plan.is_active) throw new Error("Plan not available");

    const baseAmount =
      data.billing_cycle === "yearly"
        ? Number(plan.price_yearly_bdt ?? Number(plan.price_bdt) * 12)
        : Number(plan.price_bdt);
    if (!baseAmount || baseAmount <= 0) throw new Error("Plan amount is invalid");

    // Gateway fee: 1.5% (৳15 per ৳1000)
    const gatewayFee = Math.round(baseAmount * 0.015);
    const amount = baseAmount + gatewayFee;

    // Insert a pending payment row first (so we have an id for invoice/callback ref).
    const { data: row, error: insErr } = await supabaseAdmin
      .from("subscription_payments")
      .insert({
        tenant_id: data.tenant_id,
        plan_id: data.plan_id,
        billing_cycle: data.billing_cycle,
        amount,
        currency: "BDT",
        method: "bkash",
        gateway: "bkash",
        status: "pending",
        payment_status: "pending",
        notes: `Base: ৳${baseAmount} | bKash Fee (1.5%): ৳${gatewayFee}`,
        submitted_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const origin = await getOrigin();
    const callbackURL = `${origin}/api/public/bkash/callback?ref=${row.id}`;

    const { bkashCreatePayment } = await import("./bkash.server");
    const created = await bkashCreatePayment({
      amount,
      invoice: `SUB-${row.id.slice(0, 8).toUpperCase()}`,
      callbackURL,
      payerReference: data.tenant_id.slice(0, 12),
    });

    const missingRedirect = created._mode === "tokenized" && !created.bkashURL;
    if (!created.paymentID || missingRedirect || created.errorCode) {
      const msg = created.errorMessage ?? created.statusMessage ?? "unknown";
      await supabaseAdmin
        .from("subscription_payments")
        .update({
          status: "failed",
          payment_status: "failed",
          gateway_error: msg,
          gateway_response: created as any,
        })
        .eq("id", row.id);
      throw new Error(`bKash create failed: ${msg}`);
    }

    const { error: updErr } = await supabaseAdmin
      .from("subscription_payments")
      .update({
        gateway_payment_id: created.paymentID,
        payment_status: "processing",
        gateway_response: created as any,
      })
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin.from("audit_log").insert({
      tenant_id: data.tenant_id,
      user_id: userId,
      action: "payment_created",
      entity_table: "subscription_payments",
      entity_id: row.id,
      after_data: {
        gateway: "bkash",
        mode: created._mode,
        gateway_payment_id: created.paymentID,
        amount,
      } as any,
    });

    await supabaseAdmin.rpc("write_billing_event" as any, {
      _tenant_id: data.tenant_id,
      _subscription_id: null,
      _event_type: "payment_created",
      _payload: {
        gateway: "bkash",
        mode: created._mode,
        gateway_payment_id: created.paymentID,
        plan_id: data.plan_id,
      } as any,
      _amount: amount,
      _currency: "BDT",
      _status: "processing",
      _event_id: `payment_created:${row.id}`,
    } as any);

    const { _retries: _r, _mode, _scriptUrl, ...paymentData } = created;
    return {
      payment_id: row.id,
      mode: _mode,
      redirect_url: created.bkashURL ?? null,
      script_url: _scriptUrl,
      payment_data: paymentData,
    };
  });

export const executeBkashPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      payment_row_id: z.string().uuid(),
      bkash_payment_id: z.string().min(4),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await assertTenantMember(supabase, data.tenant_id, userId);

    const { data: row, error: lookupErr } = await supabaseAdmin
      .from("subscription_payments")
      .select("id,tenant_id,subscription_id,amount,currency,transaction_id,processed_at,gateway_payment_id,gateway_transaction_id")
      .eq("id", data.payment_row_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();

    if (lookupErr) throw new Error(lookupErr.message);
    if (!row) throw new Error("Payment not found");

    if (row.gateway_payment_id && row.gateway_payment_id !== data.bkash_payment_id) {
      throw new Error("bKash payment ID mismatch");
    }

    const { settleBkashPayment } = await import("./bkash.server");
    const result = await settleBkashPayment({
      row,
      bkashPaymentID: data.bkash_payment_id,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    return result;
  });

export const cancelBkashPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      payment_row_id: z.string().uuid(),
      reason: z.enum(["cancelled", "failed"]).default("cancelled"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await assertTenantMember(supabase, data.tenant_id, userId);

    const { data: row } = await supabaseAdmin
      .from("subscription_payments")
      .select("id,processed_at,status,payment_status,subscription_id,amount,currency")
      .eq("id", data.payment_row_id)
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();

    if (!row || row.processed_at || row.payment_status === "paid" || row.status === "paid") {
      return { updated: false };
    }

    await supabaseAdmin
      .from("subscription_payments")
      .update({
        status: data.reason,
        payment_status: data.reason,
        callback_processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    await supabaseAdmin.rpc("write_billing_event" as any, {
      _tenant_id: data.tenant_id,
      _subscription_id: row.subscription_id,
      _event_type: `payment_${data.reason}`,
      _payload: { reason: data.reason } as any,
      _amount: row.amount,
      _currency: row.currency,
      _status: data.reason,
      _event_id: `payment_${data.reason}:${row.id}`,
    } as any);

    return { updated: true };
  });

export const verifyBkashPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ payment_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("subscription_payments")
      .select("id,payment_status,status,gateway_payment_id,gateway_transaction_id,processed_at,subscription_id")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Payment not found");
    return row;
  });
