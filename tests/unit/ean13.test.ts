import { describe, it, expect } from "vitest";
import { ean13Checksum, buildInternalEan13, isValidEan13 } from "@/lib/import/ean13";

describe("ean13", () => {
  it("computes checksum", () => {
    expect(ean13Checksum("400638133393")).toBe("1");
  });
  it("builds and validates internal barcode", () => {
    const b = buildInternalEan13(1, 1);
    expect(b).toHaveLength(13);
    expect(isValidEan13(b)).toBe(true);
  });
  it("rejects malformed input", () => {
    expect(() => ean13Checksum("abc")).toThrow();
  });
});
