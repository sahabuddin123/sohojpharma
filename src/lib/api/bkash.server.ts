// Server-only bKash Checkout (Tokenized) client.
// Reads credentials from env at call time. Never import from the browser.

type BkashEnv = {
  base: string;
  username: string;
  password: string;
  app_key: string;
  app_secret: string;
};

function env(): BkashEnv {
  const base = process.env.BKASH_BASE_URL;
  const username = process.env.BKASH_USERNAME;
  const password = process.env.BKASH_PASSWORD;
  const app_key = process.env.BKASH_APP_KEY;
  const app_secret = process.env.BKASH_APP_SECRET;
  if (!base || !username || !password || !app_key || !app_secret) {
    throw new Error("bKash credentials not configured");
  }
  return { base: base.replace(/\/+$/, ""), username, password, app_key, app_secret };
}

let cachedToken: { token: string; expires_at: number } | null = null;

async function grantToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expires_at > now + 30_000) return cachedToken.token;
  const e = env();
  const res = await fetch(`${e.base}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: e.username,
      password: e.password,
    },
    body: JSON.stringify({ app_key: e.app_key, app_secret: e.app_secret }),
  });
  const json = (await res.json()) as { id_token?: string; expires_in?: number; statusMessage?: string };
  if (!res.ok || !json.id_token) {
    throw new Error(`bKash token grant failed: ${json.statusMessage ?? res.status}`);
  }
  cachedToken = {
    token: json.id_token,
    expires_at: now + Math.min(Number(json.expires_in ?? 3500) * 1000, 3_500_000),
  };
  return cachedToken.token;
}

// Retry wrapper: 3 attempts with exponential backoff for network / 5xx / 429.
async function withRetry<T>(
  fn: () => Promise<{ res: Response; json: T }>,
  attempts = 3,
): Promise<{ result: T; retries: number }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const { res, json } = await fn();
      if (res.status >= 500 || res.status === 429) {
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

async function authedFetch<T = any>(path: string, body: unknown): Promise<{ result: T; retries: number }> {
  const e = env();
  return withRetry<T>(async () => {
    const token = await grantToken();
    const res = await fetch(`${e.base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
        "X-App-Key": e.app_key,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { res, json };
  });
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
  successCallbackURL?: string;
  failureCallbackURL?: string;
  cancelledCallbackURL?: string;
  statusCode?: string;
  statusMessage?: string;
};

export async function bkashCreatePayment(input: BkashCreateInput): Promise<BkashCreateResponse & { _retries: number }> {
  const { result, retries } = await authedFetch<BkashCreateResponse>("/tokenized/checkout/create", {
    mode: "0011",
    payerReference: input.payerReference ?? input.invoice,
    callbackURL: input.callbackURL,
    amount: input.amount.toFixed(2),
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: input.invoice,
  });
  return { ...result, _retries: retries };
}

export type BkashExecuteResponse = {
  paymentID?: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  currency?: string;
  statusCode?: string;
  statusMessage?: string;
};

export async function bkashExecutePayment(paymentID: string): Promise<BkashExecuteResponse & { _retries: number }> {
  const { result, retries } = await authedFetch<BkashExecuteResponse>("/tokenized/checkout/execute", { paymentID });
  return { ...result, _retries: retries };
}

export async function bkashQueryPayment(paymentID: string): Promise<BkashExecuteResponse & { _retries: number }> {
  const { result, retries } = await authedFetch<BkashExecuteResponse>("/tokenized/checkout/payment/status", { paymentID });
  return { ...result, _retries: retries };
}
