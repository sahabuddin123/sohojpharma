// QZ Tray production signing endpoint.
// Signs the `toSign` payload using the QZ private key stored as a Supabase Secret.
//
// Required secrets:
//   QZ_PRIVATE_KEY     - PEM-encoded RSA private key (-----BEGIN PRIVATE KEY----- ... or RSA PRIVATE KEY)
//   QZ_SIGN_ALGORITHM  - optional: "SHA512" (QZ Tray >= 2.1) or "SHA1" (QZ Tray < 2.1). Default: SHA512.
//
// Returns: { signature: "<base64>" } or { error: "..." }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Wrap PKCS#1 (BEGIN RSA PRIVATE KEY) into PKCS#8 if needed.
function ensurePkcs8(pem: string): ArrayBuffer {
  if (pem.includes("BEGIN PRIVATE KEY")) return pemToPkcs8(pem);
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    // Prepend PKCS#8 wrapper for RSA.
    const inner = new Uint8Array(pemToPkcs8(pem));
    // PKCS#8 header for rsaEncryption
    const header = new Uint8Array([
      0x30, 0x82, 0x00, 0x00, 0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a,
      0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x04, 0x82,
      0x00, 0x00,
    ]);
    const innerLen = inner.length;
    const total = header.length + innerLen;
    header[2] = ((total - 4) >> 8) & 0xff;
    header[3] = (total - 4) & 0xff;
    header[24] = (innerLen >> 8) & 0xff;
    header[25] = innerLen & 0xff;
    const out = new Uint8Array(total);
    out.set(header, 0);
    out.set(inner, header.length);
    return out.buffer;
  }
  throw new Error("Unsupported key format. Use PEM PKCS#8 (BEGIN PRIVATE KEY).");
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  try {
    const { toSign } = await req.json().catch(() => ({ toSign: undefined }));
    if (typeof toSign !== "string" || !toSign) {
      return new Response(JSON.stringify({ error: "Missing 'toSign'" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Prefer the DB-stored private key (set via the admin Security Setup wizard).
    // Fall back to the QZ_PRIVATE_KEY env secret for legacy installs.
    let pem: string | null = null;
    try {
      const url = Deno.env.get("SUPABASE_URL");
      const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (url && srv) {
        const r = await fetch(`${url}/rest/v1/qz_credentials?id=eq.1&select=private_key`, {
          headers: { apikey: srv, authorization: `Bearer ${srv}` },
        });
        if (r.ok) {
          const rows = await r.json() as Array<{ private_key: string | null }>;
          if (rows?.[0]?.private_key) pem = rows[0].private_key;
        }
      }
    } catch { /* fall through to env */ }
    if (!pem) pem = Deno.env.get("QZ_PRIVATE_KEY") ?? null;
    if (!pem) {
      return new Response(JSON.stringify({ error: "QZ_PRIVATE_KEY not configured" }), {
        status: 501,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const algo = (Deno.env.get("QZ_SIGN_ALGORITHM") || "SHA512").toUpperCase();
    const hash = algo === "SHA1" ? "SHA-1" : algo === "SHA256" ? "SHA-256" : "SHA-512";

    const keyData = ensurePkcs8(pem);
    const key = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: { name: hash } },
      false,
      ["sign"],
    );

    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(toSign),
    );

    return new Response(JSON.stringify({ signature: b64(sig), algorithm: algo }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signing failed";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
