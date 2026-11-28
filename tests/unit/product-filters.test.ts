import { describe, it, expect } from "vitest";
import { matchesCachedProductQuery } from "@/lib/offline/db";
import { asUuidOrUndefined } from "@/components/products/product-filter-combobox";

const sampleProducts = [
  {
    name: "Napa",
    displayName: "Napa 500mg Tablet",
    generic_name: "Paracetamol",
    company_name: "Beximco Pharmaceuticals Ltd.",
    category_name: "Tablet",
    form: "Tablet",
    sku: "NAPA-500",
    barcode: "8801234560001",
  },
  {
    name: "Ace Plus",
    displayName: "Ace Plus 500mg+65mg Tablet",
    generic_name: "Paracetamol + Caffeine",
    company_name: "Square Pharmaceuticals PLC",
    category_name: "Tablet",
    form: "Tablet",
    sku: "ACE-PLUS",
    barcode: "8801234560002",
  },
  {
    name: "Napa Syrup",
    displayName: "Napa 120mg/5ml Syrup",
    generic_name: "Paracetamol",
    company_name: "Beximco Pharmaceuticals Ltd.",
    category_name: "Syrup",
    form: "Syrup",
    sku: "NAPA-SYR",
    barcode: "8801234560003",
  },
];

describe("product-filters: multi-field and scoped search matching", () => {
  it("matches product name, company, generic, category, and barcode in 'all' mode", () => {
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "beximco", "all"))).toHaveLength(2);
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "paracetamol", "all"))).toHaveLength(3);
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "syrup", "all"))).toHaveLength(1);
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "8801234560002", "all"))).toHaveLength(1);
  });

  it("narrows search strictly when scoped to name, company, generic, category, or barcode", () => {
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "square", "company"))).toHaveLength(1);
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "napa", "company"))).toHaveLength(0);
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "caffeine", "generic"))).toHaveLength(1);
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "syrup", "category"))).toHaveLength(1);
    expect(sampleProducts.filter((p) => matchesCachedProductQuery(p, "NAPA-500", "barcode"))).toHaveLength(1);
  });

  it("only forwards valid UUIDs for online RPC master filters", () => {
    expect(asUuidOrUndefined("720fca0f-5bdb-4592-b8dd-45e16f28fc49")).toBe(
      "720fca0f-5bdb-4592-b8dd-45e16f28fc49",
    );
    expect(asUuidOrUndefined("name:beximco")).toBeUndefined();
    expect(asUuidOrUndefined(undefined)).toBeUndefined();
  });
});
