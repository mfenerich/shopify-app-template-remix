import { describe, it, expect } from "vitest";
import { parseMoneyValue } from "./monthlyPricing.js";

describe("parseMoneyValue", () => {
  it("parses plain number string", () => {
    expect(parseMoneyValue("29.90")).toBe(29.9);
  });

  it("parses JSON object with amount", () => {
    expect(parseMoneyValue('{"amount":"29.90","currency_code":"CHF"}')).toBe(29.9);
  });

  it("parses JSON object with value", () => {
    expect(parseMoneyValue('{"value":"15.00"}')).toBe(15);
  });

  it("returns 0 for null/undefined", () => {
    expect(parseMoneyValue(null)).toBe(0);
    expect(parseMoneyValue(undefined)).toBe(0);
    expect(parseMoneyValue("")).toBe(0);
  });

  it("handles CHF prefix", () => {
    expect(parseMoneyValue("CHF 29.90")).toBe(29.9);
  });

  it("handles comma as decimal separator", () => {
    expect(parseMoneyValue("29,90")).toBe(29.9);
  });

  it("returns 0 for non-numeric string", () => {
    expect(parseMoneyValue("abc")).toBe(0);
  });
});
