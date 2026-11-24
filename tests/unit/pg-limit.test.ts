import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { localizePgError, parsePgLimitError } from "@/lib/errors/pg-limit";

describe("localizePgError", () => {
  it("reads messages from plain database error objects", () => {
    const t = vi.fn((key: string) => key) as unknown as TFunction;

    expect(localizePgError(t, { message: "function public.provision_catalog_for_tenant(uuid, uuid) is not unique" }))
      .toBe("function public.provision_catalog_for_tenant(uuid, uuid) is not unique");
  });

  it("localizes a branch plan-limit error", () => {
    const t = vi.fn(() => "Branch limit reached (1). Upgrade your plan to add more.") as unknown as TFunction;
    const error = { message: '{"code":"plan_limit_exceeded","resource":"branches","limit":1}' };

    expect(localizePgError(t, error)).toBe("Branch limit reached (1). Upgrade your plan to add more.");
    expect(t).toHaveBeenCalledWith("errors.plan_limit_exceeded.branches", expect.objectContaining({ limit: 1 }));
  });

  it("falls back to the database message if translation returns an object", () => {
    const t = vi.fn(() => ({ branches: "wrong shape" })) as unknown as TFunction;
    const message = '{"code":"plan_limit_exceeded","resource":"unknown","limit":1}';

    expect(localizePgError(t, { message })).toBe(message);
  });

  it("does not turn an unknown object into [object Object]", () => {
    const t = vi.fn((key: string) => key) as unknown as TFunction;

    expect(localizePgError(t, { code: "P0001" })).toBe("Something went wrong. Please try again.");
  });
});

describe("parsePgLimitError", () => {
  it("parses a JSON payload wrapped in a database error", () => {
    expect(parsePgLimitError('ERROR: {"code":"plan_limit_exceeded","resource":"branches","limit":1}')).toEqual({
      key: "errors.plan_limit_exceeded.branches",
      values: { code: "plan_limit_exceeded", resource: "branches", limit: 1 },
    });
  });
});
