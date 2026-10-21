import { describe, expect, it } from "vitest";
import { formatPrice, formatRand, parsePrice, productSchema } from "@/lib/product-rules";

describe("parsePrice", () => {
  it.each([
    ["250", "250.00"],
    ["R250", "250.00"],
    ["r 250", "250.00"],
    ["R 1 250", "1250.00"],
    ["1,250", "1250.00"],
    ["1,250.50", "1250.50"],
    ["1250,50", "1250.50"],
    ["99.5", "99.50"],
    ["1 000 000", "1000000.00"],
  ])("parses %s", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it.each(["", "0", "-5", "abc", "12.345", "1 000 001", "R", "1e3"])("rejects %s", (input) => {
    expect(parsePrice(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats rand the South African way", () => {
    expect(formatRand("1250.00")).toBe("R1 250");
    expect(formatRand("99.50")).toBe("R99.50");
    expect(formatRand(1000000)).toBe("R1 000 000");
  });

  it("labels each price type", () => {
    expect(formatPrice("FIXED", "850.00")).toBe("R850");
    expect(formatPrice("FROM", "350.00")).toBe("From R350");
    expect(formatPrice("ON_REQUEST", null)).toBe("Price on request");
  });
});

describe("productSchema", () => {
  const base = {
    kind: "PRODUCT",
    name: "  Brazilian body wave  ",
    categoryId: crypto.randomUUID(),
    description: "",
    priceType: "FIXED",
    price: "R 1 250",
    status: "AVAILABLE",
  };

  it("normalises a valid product", () => {
    const out = productSchema.parse(base);
    expect(out).toMatchObject({ name: "Brazilian body wave", description: null, price: "1250.00" });
  });

  it("drops the price when it is on request", () => {
    expect(productSchema.parse({ ...base, priceType: "ON_REQUEST", price: "999" }).price).toBeNull();
  });

  it("requires a price unless it is on request", () => {
    const result = productSchema.safeParse({ ...base, price: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["price"]);
  });

  it("will not accept ARCHIVED through the form", () => {
    expect(productSchema.safeParse({ ...base, status: "ARCHIVED" }).success).toBe(false);
  });
});
