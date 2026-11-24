import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyHmac } from "@/lib/public-api/auth";

function sign(secret: string, ts: string, method: string, path: string, body: string) {
  return createHmac("sha256", secret).update(`${ts}.${method}.${path}.${body}`).digest("hex");
}

describe("public-api HMAC", () => {
  const secret = "s3cret";
  const path = "/api/public/v1/products";
  const ts = String(Math.floor(Date.now() / 1000));

  it("accepts a valid signature", () => {
    const body = "{}";
    const sig = sign(secret, ts, "POST", path, body);
    const req = new Request(`https://x${path}`, {
      method: "POST",
      headers: { "x-signature": sig, "x-timestamp": ts },
    });
    expect(verifyHmac(req, body, secret).ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = sign(secret, ts, "POST", path, "{}");
    const req = new Request(`https://x${path}`, {
      method: "POST",
      headers: { "x-signature": sig, "x-timestamp": ts },
    });
    const res = verifyHmac(req, '{"evil":1}', secret);
    expect(res.ok).toBe(false);
  });

  it("rejects a stale timestamp", () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 600);
    const sig = sign(secret, oldTs, "POST", path, "{}");
    const req = new Request(`https://x${path}`, {
      method: "POST",
      headers: { "x-signature": sig, "x-timestamp": oldTs },
    });
    expect(verifyHmac(req, "{}", secret).ok).toBe(false);
  });
});
