import { describe, it, expect } from "vitest";
import { normalizeUnit, normalizeType, normalizeManufacturer, isValidEan13 } from "@/lib/import/normalizer";

describe("normalizer", () => {
  it("normalizes units", () => {
    expect(normalizeUnit("ml")).toBe("ML");
    expect(normalizeUnit("Ml")).toBe("ML");
    expect(normalizeUnit("ML")).toBe("ML");
    expect(normalizeUnit("Caps")).toBe("CAPS");
  });
  it("normalizes types", () => {
    expect(normalizeType("tab")).toBe("Tablet");
    expect(normalizeType("CAPSULE")).toBe("Capsule");
    expect(normalizeType("Btl")).toBe("Bottle");
  });
  it("normalizes manufacturer", () => {
    expect(normalizeManufacturer("square pharmaceuticals ltd.")).toMatch(/Square Pharmaceuticals Ltd/);
  });
  it("validates EAN-13", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("1234567890123")).toBe(false);
  });
});
