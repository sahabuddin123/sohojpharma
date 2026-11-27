import { describe, expect, it } from "vitest";
import { isBkashPaymentSuccess, resolveBkashConfig } from "@/lib/api/bkash.server";

describe("bKash server config resolution", () => {
  it("supports BKASH_CHECKOUT_* env aliases and defaults to classic production checkout", () => {
    const cfg = resolveBkashConfig({
      BKASH_CHECKOUT_APP_KEY: "app_k",
      BKASH_CHECKOUT_APP_SECRET: "app_s",
      BKASH_CHECKOUT_USER_NAME: "01951413828",
      BKASH_CHECKOUT_PASSWORD: "secret",
    });
    expect(cfg.mode).toBe("checkout");
    expect(cfg.isSandbox).toBe(false);
    expect(cfg.base).toBe("https://checkout.pay.bka.sh/v1.2.0-beta");
    expect(cfg.scriptUrl).toBe("https://scripts.pay.bka.sh/versions/1.2.0-beta/checkout/bKash-checkout.js");
    expect(cfg.username).toBe("01951413828");
  });

  it("switches to sandbox URLs when BKASH_IS_SANDBOX=true", () => {
    const cfg = resolveBkashConfig({
      BKASH_APP_KEY: "k",
      BKASH_APP_SECRET: "s",
      BKASH_USERNAME: "u",
      BKASH_PASSWORD: "p",
      BKASH_IS_SANDBOX: "true",
    });
    expect(cfg.mode).toBe("checkout");
    expect(cfg.isSandbox).toBe(true);
    expect(cfg.base).toBe("https://checkout.sandbox.bka.sh/v1.2.0-beta");
    expect(cfg.scriptUrl).toBe("https://scripts.sandbox.bka.sh/versions/1.2.0-beta/checkout/bKash-checkout-sandbox.js");
  });

  it("supports tokenized mode when configured", () => {
    const cfg = resolveBkashConfig({
      BKASH_APP_KEY: "k",
      BKASH_APP_SECRET: "s",
      BKASH_USERNAME: "u",
      BKASH_PASSWORD: "p",
      BKASH_CHECKOUT_MODE: "tokenized",
    });
    expect(cfg.mode).toBe("tokenized");
    expect(cfg.base).toBe("https://tokenized.pay.bka.sh/v1.2.0-beta");
  });

  it("throws when required credentials are missing", () => {
    expect(() => resolveBkashConfig({})).toThrow(/bKash credentials not configured/);
  });

  it("evaluates classic and tokenized payment completion responses safely", () => {
    expect(isBkashPaymentSuccess({ transactionStatus: "Completed", trxID: "A123" })).toBe(true);
    expect(isBkashPaymentSuccess({ statusCode: "0000", trxID: "A123" })).toBe(true);
    expect(isBkashPaymentSuccess({ errorCode: "2056", errorMessage: "Invalid Payment State" })).toBe(false);
    expect(isBkashPaymentSuccess({ transactionStatus: "Initiated" })).toBe(false);
    expect(isBkashPaymentSuccess(null)).toBe(false);
  });
});
