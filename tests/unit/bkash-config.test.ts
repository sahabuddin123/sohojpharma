import { describe, expect, it } from "vitest";
import {
  isBkashPaymentSuccess,
  resolveBkashConfig,
  resolveBkashFromPlatformRow,
} from "@/lib/api/bkash.server";

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

  it("resolves SaaS Admin Sandbox credentials without leaking Live .env credentials", () => {
    const row = {
      is_enabled: true,
      active_mode: "sandbox" as const,
      checkout_flow: "checkout" as const,
      merchant_number: "01951413828",
      gateway_fee_percent: 1.5,
      sandbox_app_key: "sbx_k",
      sandbox_app_secret: "sbx_s",
      sandbox_username: "sbx_u",
      sandbox_password: "sbx_p",
      sandbox_base_url: null,
    };
    const cfg = resolveBkashFromPlatformRow(row, {
      BKASH_CHECKOUT_APP_KEY: "live_k",
      BKASH_CHECKOUT_APP_SECRET: "live_s",
      BKASH_CHECKOUT_USER_NAME: "live_u",
      BKASH_CHECKOUT_PASSWORD: "live_p",
    });
    expect(cfg.isSandbox).toBe(true);
    expect(cfg.app_key).toBe("sbx_k");
    expect(cfg.base).toBe("https://checkout.sandbox.bka.sh/v1.2.0-beta");
    expect(cfg.scriptUrl).toBe("https://scripts.sandbox.bka.sh/versions/1.2.0-beta/checkout/bKash-checkout-sandbox.js");

    // When sandbox creds are missing while active_mode is sandbox, throw instead of using Live .env
    expect(() =>
      resolveBkashFromPlatformRow(
        { active_mode: "sandbox", checkout_flow: "checkout" },
        {
          BKASH_CHECKOUT_APP_KEY: "live_k",
          BKASH_CHECKOUT_APP_SECRET: "live_s",
          BKASH_CHECKOUT_USER_NAME: "live_u",
          BKASH_CHECKOUT_PASSWORD: "live_p",
        },
      ),
    ).toThrow(/Sandbox credentials/);
  });

  it("falls back to Live .env credentials when active_mode is live and DB live slots are empty", () => {
    const cfg = resolveBkashFromPlatformRow(
      { active_mode: "live", checkout_flow: "checkout", merchant_number: "01951413828", gateway_fee_percent: 1.5 },
      {
        BKASH_CHECKOUT_APP_KEY: "live_k",
        BKASH_CHECKOUT_APP_SECRET: "live_s",
        BKASH_CHECKOUT_USER_NAME: "live_u",
        BKASH_CHECKOUT_PASSWORD: "live_p",
      },
    );
    expect(cfg.isSandbox).toBe(false);
    expect(cfg.app_key).toBe("live_k");
    expect(cfg.source).toBe("env");
    expect(cfg.base).toBe("https://checkout.pay.bka.sh/v1.2.0-beta");
  });

  it("adapts incompatible base_url when switching checkout_flow to tokenized", () => {
    const cfg = resolveBkashFromPlatformRow(
      {
        active_mode: "sandbox",
        checkout_flow: "tokenized",
        sandbox_app_key: "sbx_k",
        sandbox_app_secret: "sbx_s",
        sandbox_username: "sbx_u",
        sandbox_password: "sbx_p",
        sandbox_base_url: "https://checkout.sandbox.bka.sh/v1.2.0-beta",
      },
      {},
    );
    expect(cfg.mode).toBe("tokenized");
    expect(cfg.base).toBe("https://tokenized.sandbox.bka.sh/v1.2.0-beta");
  });

  it("evaluates classic and tokenized payment completion responses safely", () => {
    expect(isBkashPaymentSuccess({ transactionStatus: "Completed", trxID: "A123" })).toBe(true);
    expect(isBkashPaymentSuccess({ statusCode: "0000", trxID: "A123" })).toBe(true);
    expect(isBkashPaymentSuccess({ errorCode: "2056", errorMessage: "Invalid Payment State" })).toBe(false);
    expect(isBkashPaymentSuccess({ transactionStatus: "Initiated" })).toBe(false);
    expect(isBkashPaymentSuccess(null)).toBe(false);
  });
});
