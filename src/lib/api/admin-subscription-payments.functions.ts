import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAppAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_app_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: SaaS Admin only");
}

export const adminListSubscriptionPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["all", "pending", "pending_review", "approved", "rejected"]).default("all"),
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { supabase } = context;

    let query = supabase
      .from("subscription_payments")
      .select(`
        id,
        tenant_id,
        plan_id,
        billing_cycle,
        amount,
        currency,
        method,
        gateway,
        transaction_id,
        proof_url,
        notes,
        status,
        payment_status,
        review_notes,
        reviewed_at,
        created_at,
        updated_at,
        tenants (id, name, slug, status, email, phone, mobile),
        plans (id, name, code, price_bdt, price_yearly_bdt)
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.status !== "all") {
      if (data.status === "pending") {
        query = query.in("status", ["pending", "pending_review"]);
      } else {
        query = query.eq("status", data.status);
      }
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    let list = rows ?? [];
    if (data.search && data.search.trim()) {
      const q = data.search.toLowerCase();
      list = list.filter((r: any) =>
        r.tenants?.name?.toLowerCase().includes(q) ||
        r.transaction_id?.toLowerCase().includes(q) ||
        r.plans?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  });

export const adminApproveSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      paymentId: z.string().uuid(),
      notes: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { supabase, userId } = context;

    // Fetch the payment
    const { data: payment, error: pErr } = await supabase
      .from("subscription_payments")
      .select("*, plans(id, name, code, price_bdt, price_yearly_bdt), tenants(id, name, status)")
      .eq("id", data.paymentId)
      .single();
    if (pErr) throw new Error(pErr.message);
    if (!payment) throw new Error("Payment record not found");

    // Calculate subscription period extension
    const isYearly = payment.billing_cycle === "yearly";
    const durationMonths = isYearly ? 12 : 1;

    // Fetch existing active subscription if any
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, current_period_end, expires_at, status")
      .eq("tenant_id", payment.tenant_id)
      .maybeSingle();

    const now = new Date();
    let startDate = now;
    let baseDate = now;

    if (sub?.current_period_end) {
      const curEnd = new Date(sub.current_period_end);
      if (curEnd > now) {
        // Still valid, extend from current period end
        baseDate = curEnd;
      }
    }

    const newPeriodEnd = new Date(baseDate);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + durationMonths);

    // 1. Mark payment as approved
    const { error: updPErr } = await supabase
      .from("subscription_payments")
      .update({
        status: "approved",
        payment_status: "completed",
        reviewed_by: userId,
        reviewed_at: now.toISOString(),
        review_notes: data.notes || "Approved by SaaS Admin",
        updated_at: now.toISOString(),
      })
      .eq("id", data.paymentId);
    if (updPErr) throw new Error(updPErr.message);

    // 2. Activate or extend tenant subscription
    const { error: subErr } = await supabase
      .from("subscriptions")
      .upsert({
        tenant_id: payment.tenant_id,
        plan_id: payment.plan_id!,
        status: "active",
        billing_cycle: payment.billing_cycle,
        current_period_start: startDate.toISOString(),
        current_period_end: newPeriodEnd.toISOString(),
        expires_at: newPeriodEnd.toISOString(),
        trial_ends_at: null,
        grace_until: new Date(newPeriodEnd.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        starts_at: startDate.toISOString(),
        auto_renew: false,
        updated_at: now.toISOString(),
      }, { onConflict: "tenant_id" });
    if (subErr) throw new Error(subErr.message);

    // 3. Set tenant to active with updated plan code
    const planCode = payment.plans?.code || "basic";
    await supabase
      .from("tenants")
      .update({
        status: "active",
        plan: planCode as any,
        updated_at: now.toISOString(),
      })
      .eq("id", payment.tenant_id);

    // 4. Audit log
    await supabase.from("audit_log").insert({
      tenant_id: payment.tenant_id,
      user_id: userId,
      action: "subscription_payment_approved",
      entity_table: "subscription_payments",
      entity_id: payment.id,
      after_data: {
        payment_id: payment.id,
        amount: payment.amount,
        plan: planCode,
        cycle: payment.billing_cycle,
        expires_at: newPeriodEnd.toISOString(),
      },
    });

    return { ok: true, expires_at: newPeriodEnd.toISOString() };
  });

export const adminRejectSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      paymentId: z.string().uuid(),
      notes: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { supabase, userId } = context;

    const { error } = await supabase
      .from("subscription_payments")
      .update({
        status: "rejected",
        payment_status: "failed",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: data.notes || "Rejected by SaaS Admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.paymentId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
