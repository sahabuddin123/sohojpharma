import { describe, it, expect } from "vitest";
import { parseMedicine } from "@/lib/import/medicine-parser";

describe("parseMedicine", () => {
  it("parses NAPA TABLET 500 MG", () => {
    const r = parseMedicine("NAPA TABLET 500 MG");
    expect(r.name).toBe("NAPA");
    expect(r.type).toBe("Tablet");
    expect(r.strength.replace(/\s+/g, "")).toBe("500MG");
  });

  it("parses A-FENAC PLUS IM INJECTION (75 MG+20 MG)/2 ML 2 ML AMPOULE", () => {
    const r = parseMedicine("A-FENAC PLUS IM INJECTION (75 MG+20 MG)/2 ML 2 ML AMPOULE");
    expect(r.name.toUpperCase()).toContain("A-FENAC PLUS");
    expect(r.type).toBe("IM Injection");
    expect(r.strength).toMatch(/75 MG\+20 MG\/2 ML/i);
    expect(r.volume.toUpperCase()).toContain("AMPOULE");
  });

  it("parses syrup with volume", () => {
    const r = parseMedicine("BENADRYL SYRUP 100 ML BOTTLE");
    expect(r.name).toBe("BENADRYL");
    expect(r.type).toBe("Syrup");
    expect(r.volume.toUpperCase()).toContain("BOTTLE");
  });

  it("parses capsule with percent strength", () => {
    const r = parseMedicine("OMEPRAZOLE CAPSULE 20 MG");
    expect(r.name).toBe("OMEPRAZOLE");
    expect(r.type).toBe("Capsule");
  });

  it("handles eye drop", () => {
    const r = parseMedicine("CIPROCIN EYE DROP 0.3% 5 ML BOTTLE");
    expect(r.type).toBe("Eye Drop");
    expect(r.strength).toMatch(/0\.3%/);
  });

  it("returns low confidence for unparseable input", () => {
    const r = parseMedicine("");
    expect(r.confidence).toBeLessThan(0.5);
  });
});
