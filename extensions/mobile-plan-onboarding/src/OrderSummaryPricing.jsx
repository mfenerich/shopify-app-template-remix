import "@shopify/ui-extensions/preact";

import { mountOrderSummaryMonthlyPricing } from "./monthlyPricing.js";

const MOBILE_SUBSCRIPTION_TYPE = "Mobile-subscription";

function isMobileSubscriptionLine(line) {
  const pt = line.merchandise?.product?.productType?.trim() ?? "";
  return (
    pt === MOBILE_SUBSCRIPTION_TYPE ||
    pt.toLowerCase() === "mobile-subscription"
  );
}

/** Renders in purchase.checkout.reductions.render-after (order summary, right column). */
export default function () {
  const lines = shopify.lines.current;
  const subscriptionLines = lines.filter(isMobileSubscriptionLine);
  if (subscriptionLines.length === 0) return;

  mountOrderSummaryMonthlyPricing(document.body, subscriptionLines);
}
