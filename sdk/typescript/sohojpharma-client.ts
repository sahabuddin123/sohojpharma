// SohojPharma Public API — TypeScript / React Native client.
// Drop into any TS project. Works in browsers, React Native, and Node 18+.
// Auth: set apiKey to `pk_<prefix>.<secret>` from /developer/keys.
export interface SohojPharmaClientOpts {
  baseUrl: string;          // e.g. "https://your-app.lovable.app/api/public/v1"
  apiKey: string;           // "pk_xxx.yyy"
  hmacSecret?: string;      // optional, for HMAC-signed write requests
  fetchImpl?: typeof fetch;
}

export class SohojPharmaClient {
  constructor(private opts: SohojPharmaClientOpts) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const f = this.opts.fetchImpl ?? fetch;
    const headers: Record<string, string> = {
      "X-API-Key": this.opts.apiKey,
      "Accept": "application/json",
    };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
    if (this.opts.hmacSecret && method !== "GET" && typeof payload === "string") {
      const ts = String(Math.floor(Date.now() / 1000));
      const url = new URL(path, this.opts.baseUrl + "/");
      const msg = `${ts}.${method}.${url.pathname}.${payload}`;
      headers["X-Timestamp"] = ts;
      headers["X-Signature"] = await hmacSha256Hex(this.opts.hmacSecret, msg);
    }
    const r = await f(`${this.opts.baseUrl}${path}`, { method, headers, body: payload });
    if (!r.ok) throw new SohojPharmaError(r.status, await r.text());
    return r.json() as Promise<T>;
  }

  // ----- Resources -----
  products(q: { q?: string; barcode?: string; limit?: number; offset?: number } = {}) {
    return this.request<{ data: unknown[]; total: number }>("GET", `/products?${qs(q)}`);
  }
  customers(q: { q?: string; limit?: number; offset?: number } = {}) {
    return this.request("GET", `/customers?${qs(q)}`);
  }
  sales(q: { limit?: number; offset?: number } = {}) {
    return this.request("GET", `/sales?${qs(q)}`);
  }
  createSale(body: unknown) { return this.request("POST", "/sales", body); }
  holdSale(body: unknown) { return this.request("POST", "/sales/held", body); }
  resumeSale(id: string) { return this.request("POST", `/sales/held/${id}/resume`); }
  reportsSummary() { return this.request("GET", "/reports/summary"); }
  uploadPrescription(file: Blob, meta: Record<string, string> = {}) {
    const fd = new FormData();
    fd.append("file", file as Blob);
    for (const [k, v] of Object.entries(meta)) fd.append(k, v);
    return this.request("POST", "/prescriptions", fd);
  }
  prescription(id: string) { return this.request("GET", `/prescriptions/${id}`); }
}

export class SohojPharmaError extends Error {
  constructor(public status: number, public bodyText: string) {
    super(`SohojPharma API ${status}: ${bodyText}`);
  }
}

function qs(o: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) p.set(k, String(v));
  return p.toString();
}

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
