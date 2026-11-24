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

    // Verify caller belongs to tenant.
    const { data: member } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden: not a member of this tenant");

    const { data: plan, error: planErr } = await supabase
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

    // Insert a pending payment row first (so we have an id for the invoice).
    const { data: row, error: insErr } = await supabase
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

    if (!created.paymentID || !created.bkashURL) {
      await supabase
        .from("subscription_payments")
        .update({
          status: "failed",
          payment_status: "failed",
          gateway_response: created as any,
        })
        .eq("id", row.id);
      throw new Error(`bKash create failed: ${created.statusMessage ?? "unknown"}`);
    }

    const { error: updErr } = await supabase
      .from("subscription_payments")
      .update({
        gateway_payment_id: created.paymentID,
        payment_status: "processing",
        gateway_response: created as any,
      })
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);

    // Audit
    await supabase.from("audit_log").insert({
      tenant_id: data.tenant_id,
      user_id: userId,
      action: "payment_created",
      entity_table: "subscription_payments",
      entity_id: row.id,
      after_data: {
        gateway: "bkash",
        gateway_payment_id: created.paymentID,
        amount,
      } as any,
    });

    // Billing event (idempotent via event_id)
    await supabase.rpc("write_billing_event" as any, {
      _tenant_id: data.tenant_id,
      _subscription_id: null,
      _event_type: "payment_created",
      _payload: { gateway: "bkash", gateway_payment_id: created.paymentID, plan_id: data.plan_id } as any,
      _amount: amount,
      _currency: "BDT",
      _status: "processing",
      _event_id: `payment_created:${row.id}`,
    } as any);

    return { payment_id: row.id, redirect_url: created.bkashURL };
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
