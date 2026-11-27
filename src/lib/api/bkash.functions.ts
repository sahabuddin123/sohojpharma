import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BILLING = ["monthly", "yearly"] as const;

async function assertAppAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_app_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: SaaS Admin only");
}

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

export const getBkashCheckoutPublicConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getBkashPublicStatus } = await import("./bkash.server");
    return getBkashPublicStatus();
  });

export const adminGetBkashConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context.supabase, context.userId);
    const {
      loadPlatformBkashRow,
      maskSecretValue,
      defaultBkashBaseUrl,
      resolveBkashFromPlatformRow,
    } = await import("./bkash.server");

    const row = await loadPlatformBkashRow();
    const rawEnv = process.env as Record<string, string | undefined>;
    const envIsSandbox =
      rawEnv.BKASH_IS_SANDBOX === "true" ||
      (rawEnv.BKASH_BASE_URL ?? "").includes("sandbox");

    const envHasLive = Boolean(
      (rawEnv.BKASH_LIVE_APP_KEY || (!envIsSandbox ? rawEnv.BKASH_APP_KEY || rawEnv.BKASH_CHECKOUT_APP_KEY : "")) &&
      (rawEnv.BKASH_LIVE_APP_SECRET || (!envIsSandbox ? rawEnv.BKASH_APP_SECRET || rawEnv.BKASH_CHECKOUT_APP_SECRET : "")) &&
      (rawEnv.BKASH_LIVE_USERNAME || (!envIsSandbox ? rawEnv.BKASH_USERNAME || rawEnv.BKASH_CHECKOUT_USER_NAME : "")) &&
      (rawEnv.BKASH_LIVE_PASSWORD || (!envIsSandbox ? rawEnv.BKASH_PASSWORD || rawEnv.BKASH_CHECKOUT_PASSWORD : "")),
    );
    const envHasSandbox = Boolean(
      (rawEnv.BKASH_SANDBOX_APP_KEY || (envIsSandbox ? rawEnv.BKASH_APP_KEY || rawEnv.BKASH_CHECKOUT_APP_KEY : "")) &&
      (rawEnv.BKASH_SANDBOX_APP_SECRET || (envIsSandbox ? rawEnv.BKASH_APP_SECRET || rawEnv.BKASH_CHECKOUT_APP_SECRET : "")) &&
      (rawEnv.BKASH_SANDBOX_USERNAME || (envIsSandbox ? rawEnv.BKASH_USERNAME || rawEnv.BKASH_CHECKOUT_USER_NAME : "")) &&
      (rawEnv.BKASH_SANDBOX_PASSWORD || (envIsSandbox ? rawEnv.BKASH_PASSWORD || rawEnv.BKASH_CHECKOUT_PASSWORD : "")),
    );

    const dbHasSandbox = Boolean(
      row?.sandbox_app_key && row?.sandbox_app_secret && row?.sandbox_username && row?.sandbox_password,
    );
    const dbHasLive = Boolean(
      row?.live_app_key && row?.live_app_secret && row?.live_username && row?.live_password,
    );

    let activeReady = false;
    try {
      resolveBkashFromPlatformRow(row, rawEnv);
      activeReady = true;
    } catch {
      activeReady = false;
    }

    const checkoutFlow = (row?.checkout_flow ?? (rawEnv.BKASH_CHECKOUT_MODE === "tokenized" ? "tokenized" : "checkout")) as
      | "checkout"
      | "tokenized";

    return {
      is_enabled: row?.is_enabled ?? true,
      active_mode: (row?.active_mode ?? (envIsSandbox ? "sandbox" : "live")) as "sandbox" | "live",
      checkout_flow: checkoutFlow,
      merchant_number: row?.merchant_number ?? rawEnv.BKASH_MERCHANT_NUMBER ?? "01951413828",
      gateway_fee_percent: Number(row?.gateway_fee_percent ?? 1.5),
      active_ready: activeReady,
      sandbox: {
        configured: dbHasSandbox || envHasSandbox,
        source: dbHasSandbox ? "database" : envHasSandbox ? "env" : "none",
        base_url: row?.sandbox_base_url || defaultBkashBaseUrl(checkoutFlow, true),
        app_key_hint: maskSecretValue(row?.sandbox_app_key),
        app_secret_hint: maskSecretValue(row?.sandbox_app_secret),
        username: row?.sandbox_username ?? "",
        has_password: Boolean(row?.sandbox_password),
      },
      live: {
        configured: dbHasLive || envHasLive,
        source: dbHasLive ? "database" : envHasLive ? "env" : "none",
        base_url: row?.live_base_url || defaultBkashBaseUrl(checkoutFlow, false),
        app_key_hint: maskSecretValue(row?.live_app_key),
        app_secret_hint: maskSecretValue(row?.live_app_secret),
        username: row?.live_username ?? "",
        has_password: Boolean(row?.live_password),
      },
      updated_at: row?.updated_at ?? null,
    };
  });

const AdminSaveBkashSchema = z.object({
  is_enabled: z.boolean().default(true),
  active_mode: z.enum(["sandbox", "live"]),
  checkout_flow: z.enum(["checkout", "tokenized"]).default("checkout"),
  merchant_number: z.string().trim().max(32).optional().default(""),
  gateway_fee_percent: z.number().min(0).max(20).default(1.5),
  sandbox: z.object({
    base_url: z.string().trim().max(300).optional().default(""),
    app_key: z.string().trim().max(256).optional().default(""),
    app_secret: z.string().trim().max(256).optional().default(""),
    username: z.string().trim().max(256).optional().default(""),
    password: z.string().trim().max(256).optional().default(""),
    clear_credentials: z.boolean().optional().default(false),
  }),
  live: z.object({
    base_url: z.string().trim().max(300).optional().default(""),
    app_key: z.string().trim().max(256).optional().default(""),
    app_secret: z.string().trim().max(256).optional().default(""),
    username: z.string().trim().max(256).optional().default(""),
    password: z.string().trim().max(256).optional().default(""),
    clear_credentials: z.boolean().optional().default(false),
  }),
});

export const adminSaveBkashConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminSaveBkashSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadPlatformBkashRow, clearBkashTokenCache } = await import("./bkash.server");

    const existing = await loadPlatformBkashRow();

    const pickVal = (
      incoming: string,
      prev: string | null | undefined,
      clear?: boolean,
    ) => {
      if (clear) return null;
      if (incoming.trim()) return incoming.trim();
      return prev ?? null;
    };

    const payload = {
      provider: "bkash",
      is_enabled: data.is_enabled,
      active_mode: data.active_mode,
      checkout_flow: data.checkout_flow,
      merchant_number: data.merchant_number || "01951413828",
      gateway_fee_percent: data.gateway_fee_percent,
      sandbox_base_url: data.sandbox.base_url || null,
      sandbox_app_key: pickVal(data.sandbox.app_key, existing?.sandbox_app_key, data.sandbox.clear_credentials),
      sandbox_app_secret: pickVal(data.sandbox.app_secret, existing?.sandbox_app_secret, data.sandbox.clear_credentials),
      sandbox_username: pickVal(data.sandbox.username, existing?.sandbox_username, data.sandbox.clear_credentials),
      sandbox_password: pickVal(data.sandbox.password, existing?.sandbox_password, data.sandbox.clear_credentials),
      live_base_url: data.live.base_url || null,
      live_app_key: pickVal(data.live.app_key, existing?.live_app_key, data.live.clear_credentials),
      live_app_secret: pickVal(data.live.app_secret, existing?.live_app_secret, data.live.clear_credentials),
      live_username: pickVal(data.live.username, existing?.live_username, data.live.clear_credentials),
      live_password: pickVal(data.live.password, existing?.live_password, data.live.clear_credentials),
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("platform_payment_gateways" as any)
      .upsert(payload, { onConflict: "provider" });

    if (error) throw new Error(error.message);

    clearBkashTokenCache();

    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      action: "bkash_gateway_updated",
      entity_table: "platform_payment_gateways",
      after_data: {
        is_enabled: data.is_enabled,
        active_mode: data.active_mode,
        checkout_flow: data.checkout_flow,
        merchant_number: payload.merchant_number,
        gateway_fee_percent: data.gateway_fee_percent,
      } as any,
    });

    return { ok: true };
  });

export const adminTestBkashConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_mode: z.enum(["sandbox", "live"]),
        checkout_flow: z.enum(["checkout", "tokenized"]).optional(),
        base_url: z.string().trim().max(300).optional(),
        app_key: z.string().trim().max(256).optional(),
        app_secret: z.string().trim().max(256).optional(),
        username: z.string().trim().max(256).optional(),
        password: z.string().trim().max(256).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context.supabase, context.userId);
    const {
      loadPlatformBkashRow,
      resolveBkashFromPlatformRow,
      testBkashTokenGrant,
    } = await import("./bkash.server");

    const existing = await loadPlatformBkashRow();
    const isSandbox = data.target_mode === "sandbox";
    const mergedRow = {
      ...(existing ?? {
        provider: "bkash",
        is_enabled: true,
        active_mode: data.target_mode,
        checkout_flow: data.checkout_flow ?? "checkout",
      }),
      active_mode: data.target_mode,
      checkout_flow: data.checkout_flow ?? existing?.checkout_flow ?? "checkout",
      ...(isSandbox
        ? {
            sandbox_base_url: data.base_url || existing?.sandbox_base_url || null,
            sandbox_app_key: data.app_key || existing?.sandbox_app_key || null,
            sandbox_app_secret: data.app_secret || existing?.sandbox_app_secret || null,
            sandbox_username: data.username || existing?.sandbox_username || null,
            sandbox_password: data.password || existing?.sandbox_password || null,
          }
        : {
            live_base_url: data.base_url || existing?.live_base_url || null,
            live_app_key: data.app_key || existing?.live_app_key || null,
            live_app_secret: data.app_secret || existing?.live_app_secret || null,
            live_username: data.username || existing?.live_username || null,
            live_password: data.password || existing?.live_password || null,
          }),
    };

    try {
      const cfg = resolveBkashFromPlatformRow(
        mergedRow as any,
        process.env as Record<string, string | undefined>,
        data.target_mode,
      );
      return await testBkashTokenGrant(cfg);
    } catch (err: unknown) {
      return {
        ok: false,
        base: "",
        mode: data.checkout_flow ?? "checkout",
        isSandbox,
        error: err instanceof Error ? err.message : "bKash test failed",
      };
    }
  });

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

    const { getBkashConfig, bkashCreatePayment } = await import("./bkash.server");
    const bkashCfg = await getBkashConfig();
    if (bkashCfg.isEnabled === false) {
      throw new Error("bKash online payment is currently disabled by administrator");
    }

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("id,code,name,price_bdt,price_yearly_bdt,is_active")
      .eq("id", data.plan_id)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan || !plan.is_active || plan.code === "free") {
      throw new Error("Selected plan is not available for checkout");
    }

    const baseAmount =
      data.billing_cycle === "yearly"
        ? Number(plan.price_yearly_bdt ?? Number(plan.price_bdt) * 12)
        : Number(plan.price_bdt);
    if (!baseAmount || baseAmount <= 0) throw new Error("Plan amount is invalid");

    const feePercent = bkashCfg.feePercent ?? 1.5;
    const gatewayFee = Math.round(baseAmount * (feePercent / 100));
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
        notes: `Base: ৳${baseAmount} | bKash Fee (${feePercent}%): ৳${gatewayFee}${bkashCfg.isSandbox ? " [SANDBOX]" : ""}`,
        submitted_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const origin = await getOrigin();
    const callbackURL = `${origin}/api/public/bkash/callback?ref=${row.id}`;

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
        is_sandbox: created._isSandbox,
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
        is_sandbox: created._isSandbox,
        gateway_payment_id: created.paymentID,
        plan_id: data.plan_id,
      } as any,
      _amount: amount,
      _currency: "BDT",
      _status: "processing",
      _event_id: `payment_created:${row.id}`,
    } as any);

    const { _retries: _r, _mode, _scriptUrl, _isSandbox, ...paymentData } = created;
    return {
      payment_id: row.id,
      mode: _mode,
      is_sandbox: _isSandbox,
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
