import { describe, it, expect } from "vitest";
import { isMobileSubscriptionLine, getSubscriptionLines } from "./subscriptionLines.js";
import type { CheckoutLine } from "./types.js";

function makeLine(overrides: Partial<CheckoutLine> = {}): CheckoutLine {
  return {
    id: "line-1",
    quantity: 1,
    merchandise: {
      id: "variant-1",
      title: "Default Variant",
      product: {
        id: "product-1",
        title: "Some Product",
        productType: "",
      },
    },
    ...overrides,
  };
}

describe("isMobileSubscriptionLine", () => {
  it("matches exact product type Mobile-subscription", () => {
    const line = makeLine({
      merchandise: {
        id: "v1",
        product: { id: "p1", title: "Plan X", productType: "Mobile-subscription" },
      },
    });
    expect(isMobileSubscriptionLine(line)).toBe(true);
  });

  it("matches case-insensitive product type", () => {
    const line = makeLine({
      merchandise: {
        id: "v1",
        product: { id: "p1", title: "Plan X", productType: "mobile-subscription" },
      },
    });
    expect(isMobileSubscriptionLine(line)).toBe(true);
  });

  it("matches product title containing 'mobile plan'", () => {
    const line = makeLine({
      merchandise: {
        id: "v1",
        product: { id: "p1", title: "Revendo Mobile Plan S", productType: "" },
      },
    });
    expect(isMobileSubscriptionLine(line)).toBe(true);
  });

  it("matches merchandise title fallback", () => {
    const line = makeLine({
      merchandise: {
        id: "v1",
        title: "Mobile Plan M",
        product: { id: "p1", title: "", productType: "" },
      },
    });
    expect(isMobileSubscriptionLine(line)).toBe(true);
  });

  it("rejects unrelated products", () => {
    const line = makeLine({
      merchandise: {
        id: "v1",
        product: { id: "p1", title: "iPhone 15 Case", productType: "Accessories" },
      },
    });
    expect(isMobileSubscriptionLine(line)).toBe(false);
  });

  it("handles missing merchandise gracefully", () => {
    const line: CheckoutLine = { id: "line-1" };
    expect(isMobileSubscriptionLine(line)).toBe(false);
  });
});

describe("getSubscriptionLines", () => {
  it("filters to only subscription lines", () => {
    const lines = [
      makeLine({
        id: "sub-1",
        merchandise: {
          id: "v1",
          product: { id: "p1", title: "Mobile Plan S", productType: "Mobile-subscription" },
        },
      }),
      makeLine({
        id: "accessory-1",
        merchandise: {
          id: "v2",
          product: { id: "p2", title: "Case", productType: "Accessories" },
        },
      }),
    ];
    const result = getSubscriptionLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sub-1");
  });

  it("returns empty array for null/undefined input", () => {
    expect(getSubscriptionLines(null as unknown as CheckoutLine[])).toEqual([]);
    expect(getSubscriptionLines([])).toEqual([]);
  });
});
