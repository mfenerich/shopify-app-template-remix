import type { CheckoutLine } from "./types.js";

/**
 * Lines that count as "mobile subscription" for monthly recurring pricing.
 * Prefer product type; fall back to title when productType is missing in some contexts.
 */
const MOBILE_SUBSCRIPTION_TYPE = "Mobile-subscription";

export function isMobileSubscriptionLine(line: CheckoutLine): boolean {
  const product = line.merchandise?.product;
  const pt = product?.productType?.trim() ?? "";
  if (
    pt === MOBILE_SUBSCRIPTION_TYPE ||
    pt.toLowerCase() === "mobile-subscription"
  ) {
    return true;
  }
  const title = (
    product?.title ||
    line.merchandise?.title ||
    ""
  ).toLowerCase();
  return title.includes("mobile plan");
}

export function getSubscriptionLines(lines: CheckoutLine[]): CheckoutLine[] {
  return (lines || []).filter(isMobileSubscriptionLine);
}
