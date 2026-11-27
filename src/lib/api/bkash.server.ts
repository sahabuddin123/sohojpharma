// Server-only bKash Checkout client (supports Classic Checkout Modal & Tokenized Redirect).
// Reads credentials from env at call time. Never import from the browser.

export type BkashMode = "checkout" | "tokenized";

export type BkashEnv = {
  mode: BkashMode;
  isSandbox: boolean;
  base: string;
  scriptUrl: string;
  username: string;
  password: string;
  app_key: string;
  app_secret: string;
};

export function resolveBkashConfig(raw: Record<string, string | undefined>): BkashEnv {
  const username = (raw.BKASH_USERNAME || raw.BKASH_CHECKOUT_USER_NAME || "").trim();
  const password = (raw.BKASH_PASSWORD || raw.BKASH_CHECKOUT_PASSWORD || "").trim();
  const app_key = (raw.BKASH_APP_KEY || raw.BKASH_CHECKOUT_APP_KEY || "").trim();
  const app_secret = (raw.BKASH_APP_SECRET || raw.BKASH_CHECKOUT_APP_SECRET || "").trim();

  if (!username || !password || !app_key || !app_secret) {
    throw new Error("bKash credentials not configured");
  }

  const explicitBase = (raw.BKASH_BASE_URL || "").trim().replace(/\/+$/, "");
  const isSandbox =
    raw.BKASH_IS_SANDBOX === "true" ||
    (explicitBase.length > 0 && explicitBase.includes("sandbox"));

  const modeEnv = (raw.BKASH_CHECKOUT_MODE || "").trim().toLowerCase();
  const mode: BkashMode =
    modeEnv === "tokenized" || explicitBase.includes("tokenized")
      ? "tokenized"
      : "checkout";

  const base =
    explicitBase ||
    (mode === "tokenized"
      ? isSandbox
        ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta"
        : "https://tokenized.pay.bka.sh/v1.2.0-beta"
      : isSandbox
        ? "https://checkout.sandbox.bka.sh/v1.2.0-beta"
        : "https://checkout.pay.bka.sh/v1.2.0-beta");

  const scriptUrl = isSandbox
    ? "https://scripts.sandbox.bka.sh/versions/1.2.0-beta/checkout/bKash-checkout-sandbox.js"
    : "https://scripts.pay.bka.sh/versions/1.2.0-beta/checkout/bKash-checkout.js";

  return { mode, isSandbox, base, scriptUrl, username, password, app_key, app_secret };
}

function env(): BkashEnv {
  return resolveBkashConfig(process.env as Record<string, string | undefined>);
}

let cachedToken: { key: string; token: string; expires_at: number } | null = null;

async function grantToken(e: BkashEnv, forceRefresh = false): Promise<string> {
  const now = Date.now();
  const cacheKey = `${e.base}|${e.app_key}|${e.username}`;
  if (!forceRefresh && cachedToken && cachedToken.key === cacheKey && cachedToken.expires_at > now + 30_000) {
    return cachedToken.token;
  }

  const tokenPath =
    e.mode === "tokenized" ? "/tokenized/checkout/token/grant" : "/checkout/token/grant";

  const res = await fetch(`${e.base}${tokenPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: e.username,
      password: e.password,
    },
    body: JSON.stringify({ app_key: e.app_key, app_secret: e.app_secret }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    expires_in?: number;
    statusMessage?: string;
    errorMessage?: string;
    msg?: string;
  };

  if (!res.ok || !json.id_token) {
    throw new Error(
      `bKash token grant failed: ${json.statusMessage ?? json.errorMessage ?? json.msg ?? res.status}`,
    );
  }

  cachedToken = {
    key: cacheKey,
    token: json.id_token,
    expires_at: now + Math.min(Number(json.expires_in ?? 3500) * 1000, 3_500_000),
  };
  return cachedToken.token;
}

// Retry wrapper: 3 attempts with exponential backoff for network / 5xx / 429 / expired token.
async function withRetry<T>(
  fn: (attempt: number) => Promise<{ res: Response; json: T }>,
  attempts = 3,
): Promise<{ result: T; retries: number }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const { res, json } = await fn(i);
      if (res.status === 401) {
        cachedToken = null;
        lastErr = new Error("bKash HTTP 401");
      } else if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`bKash HTTP ${res.status}`);
      } else {
        return { result: json, retries: i };
      }
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 300 * Math.pow(2, i)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("bKash request failed");
}

async function authedFetch<T = any>(
  path: string,
  body?: unknown,
  method: "GET" | "POST" = "POST",
): Promise<{ result: T; retries: number; env: BkashEnv }> {
  const e = env();
  const { result, retries } = await withRetry<T>(async (attempt) => {
    const token = await grantToken(e, attempt > 0 && cachedToken === null);
    const res = await fetch(`${e.base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
        "X-App-Key": e.app_key,
      },
      body: method === "GET" || body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { res, json };
  });
  return { result, retries, env: e };
}

export type BkashCreateInput = {
  amount: number;
  invoice: string;
  callbackURL: string;
  payerReference?: string;
};

export type BkashCreateResponse = {
  paymentID?: string;
  bkashURL?: string;
  createTime?: string;
  orgLogo?: string;
  orgName?: string;
  transactionStatus?: string;
  amount?: string;
  currency?: string;
  intent?: string;
  merchantInvoiceNumber?: string;
  hash?: string;
  successCallbackURL?: string;
  failureCallbackURL?: string;
  cancelledCallbackURL?: string;
  statusCode?: string;
  statusMessage?: string;
  errorCode?: string;
  errorMessage?: string;
};

export async function bkashCreatePayment(
  input: BkashCreateInput,
): Promise<BkashCreateResponse & { _retries: number; _mode: BkashMode; _scriptUrl: string }> {
  const e = env();
  const path = e.mode === "tokenized" ? "/tokenized/checkout/create" : "/checkout/payment/create";
  const payload =
    e.mode === "tokenized"
      ? {
          mode: "0011",
          payerReference: input.payerReference ?? input.invoice,
          callbackURL: input.callbackURL,
          amount: input.amount.toFixed(2),
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: input.invoice,
        }
      : {
          amount: input.amount.toFixed(2),
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: input.invoice,
        };

  const { result, retries } = await authedFetch<BkashCreateResponse>(path, payload, "POST");
  return { ...result, _retries: retries, _mode: e.mode, _scriptUrl: e.scriptUrl };
}

export type BkashExecuteResponse = {
  paymentID?: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  currency?: string;
  customerMsisdn?: string;
  merchantInvoiceNumber?: string;
  statusCode?: string;
  statusMessage?: string;
  errorCode?: string;
  errorMessage?: string;
};

export function isBkashPaymentSuccess(res: BkashExecuteResponse | null | undefined): boolean {
  if (!res || res.errorCode) return false;
  return res.statusCode === "0000" || res.transactionStatus === "Completed";
}

export async function bkashExecutePayment(
  paymentID: string,
): Promise<BkashExecuteResponse & { _retries: number }> {
  const e = env();
  if (e.mode === "tokenized") {
    const { result, retries } = await authedFetch<BkashExecuteResponse>(
      "/tokenized/checkout/execute",
      { paymentID },
      "POST",
    );
    return { ...result, _retries: retries };
  }
  const { result, retries } = await authedFetch<BkashExecuteResponse>(
    `/checkout/payment/execute/${encodeURIComponent(paymentID)}`,
    undefined,
    "POST",
  );
  return { ...result, _retries: retries };
}

export async function bkashQueryPayment(
  paymentID: string,
): Promise<BkashExecuteResponse & { _retries: number }> {
  const e = env();
  if (e.mode === "tokenized") {
    const { result, retries } = await authedFetch<BkashExecuteResponse>(
      "/tokenized/checkout/payment/status",
      { paymentID },
      "POST",
    );
    return { ...result, _retries: retries };
  }
  const { result, retries } = await authedFetch<BkashExecuteResponse>(
    `/checkout/payment/query/${encodeURIComponent(paymentID)}`,
    undefined,
    "GET",
  );
  return { ...result, _retries: retries };
}

export type SettleBkashResult =
  | { ok: true; trxID: string | null; amount: string | null; activationFailed?: boolean; alreadyProcessed?: boolean }
  | { ok: false; error: string; httpStatus: number };

/**
 * Shared server-side execution, verification, audit logging, and subscription
 * activation used by both Classic Checkout JS (`executeBkashPayment`) and
 * Tokenized Checkout (`/api/public/bkash/callback`).
 */
export async function settleBkashPayment(params: {
  row: {
    id: string;
    tenant_id: string;
    subscription_id: string | null;
    amount: number;
    currency: string;
    transaction_id: string | null;
    processed_at: string | null;
    gateway_transaction_id?: string | null;
  };
  bkashPaymentID: string;
  ip?: string | null;
  ua?: string | null;
}): Promise<SettleBkashResult> {
  const { row, bkashPaymentID, ip = null, ua = null } = params;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (row.processed_at) {
    return {
      ok: true,
      trxID: row.gateway_transaction_id ?? row.transaction_id ?? null,
      amount: String(row.amount),
      alreadyProcessed: true,
    };
  }

  const writeEvent = async (event_type: string, payload: unknown, evtStatus?: string) => {
    await supabaseAdmin.rpc("write_billing_event" as any, {
      _tenant_id: row.tenant_id,
      _subscription_id: row.subscription_id,
      _event_type: event_type,
      _payload: payload as any,
      _amount: row.amount,
      _currency: row.currency,
      _status: evtStatus ?? null,
      _event_id: `${event_type}:${row.id}`,
    } as any);
  };

  let exec: BkashExecuteResponse | undefined;
  let retries = 0;
  let executeErr: string | null = null;

  try {
    const ex = await bkashExecutePayment(bkashPaymentID);
    retries += ex?._retries ?? 0;
    exec = ex;
  } catch (e: unknown) {
    executeErr = e instanceof Error ? e.message : "execute_failed";
  }

  // Fallback to query if execute did not confirm completion yet.
  if (!isBkashPaymentSuccess(exec)) {
    try {
      const q = await bkashQueryPayment(bkashPaymentID);
      retries += q?._retries ?? 0;
      if (isBkashPaymentSuccess(q)) {
        exec = q;
      } else if (!exec) {
        exec = q;
      }
    } catch (e: unknown) {
      executeErr = (executeErr ? executeErr + " | " : "") + (e instanceof Error ? e.message : "query_failed");
    }
  }

  if (!isBkashPaymentSuccess(exec)) {
    const failReason =
      exec?.errorMessage ??
      exec?.statusMessage ??
      executeErr ??
      `unexpected_status:${exec?.statusCode ?? exec?.errorCode ?? "none"}`;

    await supabaseAdmin
      .from("subscription_payments")
      .update({
        status: "failed",
        payment_status: "failed",
        gateway_response: (exec ?? null) as any,
        gateway_error: failReason,
        gateway_retry_count: retries,
        callback_processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    await supabaseAdmin.from("audit_log").insert({
      tenant_id: row.tenant_id,
      action: "payment_failed",
      entity_table: "subscription_payments",
      entity_id: row.id,
      after_data: { stage: "execute", response: exec, error: failReason, ip, ua } as any,
    });

    await writeEvent("payment_failed", { stage: "execute", error: failReason, response: exec }, "failed");
    return { ok: false, error: failReason, httpStatus: 400 };
  }

  const { error: updErr } = await supabaseAdmin
    .from("subscription_payments")
    .update({
      payment_status: "paid",
      status: "paid",
      gateway_transaction_id: exec?.trxID ?? null,
      gateway_response: exec as any,
      gateway_retry_count: retries,
      verified_at: new Date().toISOString(),
      transaction_id: exec?.trxID ?? row.transaction_id,
      callback_processed_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updErr) {
    return { ok: false, error: updErr.message, httpStatus: 500 };
  }

  await supabaseAdmin.from("audit_log").insert({
    tenant_id: row.tenant_id,
    action: "payment_executed",
    entity_table: "subscription_payments",
    entity_id: row.id,
    after_data: { trxID: exec?.trxID, amount: exec?.amount, ip, ua } as any,
  });

  await writeEvent("payment_executed", { trxID: exec?.trxID, amount: exec?.amount }, "paid");

  const { error: actErr } = await supabaseAdmin.rpc(
    "activate_subscription_from_payment" as any,
    { _payment_id: row.id } as any,
  );

  if (actErr) {
    return {
      ok: true,
      trxID: exec?.trxID ?? null,
      amount: exec?.amount ?? String(row.amount),
      activationFailed: true,
    };
  }

  return {
    ok: true,
    trxID: exec?.trxID ?? null,
    amount: exec?.amount ?? String(row.amount),
  };
}
