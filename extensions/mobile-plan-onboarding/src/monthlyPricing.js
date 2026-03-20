/**
 * Monthly recurring price from product metafield custom.monthly_price (Storefront API).
 */
import { el } from "./polarisDom.js";
import { isMobileSubscriptionLine } from "./subscriptionLines.js";

const STOREFRONT_VERSION = "2025-10";

export function parseMoneyValue(raw) {
  if (!raw) return 0;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed);
      const amt = j.amount ?? j.value;
      if (amt != null) return parseFloat(String(amt)) || 0;
    } catch {
      /* fall through */
    }
  }
  const cleaned = trimmed.replace(/[^0-9.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function formatPrice(amount, currencyCode) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyCode || "CHF",
  }).format(num);
}

function getCurrencyCode() {
  const cost = shopify.cost?.current;
  return cost?.totalAmount?.currencyCode || "CHF";
}

function getOneTimePrice(line) {
  const amount = line?.cost?.totalAmount?.amount;
  return typeof amount === "string" ? parseFloat(amount) || 0 : amount || 0;
}

function productIdMatchesTarget(productGid, target) {
  if (!productGid || !target || target.type !== "product") return false;
  if (target.id === productGid) return true;
  const gidTail = productGid.split("/").pop();
  return (
    target.id === gidTail ||
    target.id === `gid://shopify/Product/${gidTail}`
  );
}

function getMetafieldFromAppEntries(productId, entries) {
  if (!entries?.length) return null;
  const hit = entries.find(
    (e) =>
      e?.metafield?.namespace === "custom" &&
      e?.metafield?.key === "monthly_price" &&
      productIdMatchesTarget(productId, e.target),
  );
  return hit?.metafield?.value ?? null;
}

async function storefrontGraphql(query, variables) {
  const url = `shopify:storefront/api/${STOREFRONT_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function fetchMonthlyPriceFromStorefront(productId, variantId) {
  const qProduct = `query ProductMetafield($id: ID!) {
    product(id: $id) {
      metafield(namespace: "custom", key: "monthly_price") { value type }
    }
  }`;
  const qVariant = `query VariantProductMetafield($id: ID!) {
    node(id: $id) {
      ... on ProductVariant {
        product {
          metafield(namespace: "custom", key: "monthly_price") { value type }
        }
      }
    }
  }`;
  const qNode = `query NodeMetafield($id: ID!) {
    node(id: $id) {
      ... on Product {
        metafield(namespace: "custom", key: "monthly_price") { value type }
      }
    }
  }`;

  const opts = { variables: { id: productId }, version: STOREFRONT_VERSION };

  let result = await shopify.query(qProduct, opts);
  if (result?.errors?.length) {
    return {
      value: null,
      error: result.errors.map((e) => e.message).join(" "),
    };
  }

  let mf = result?.data?.product?.metafield;
  const productMissing =
    result?.data && result.data.product === null && !result?.errors?.length;

  if (!mf?.value && variantId) {
    const vr = await shopify.query(qVariant, {
      variables: { id: variantId },
      version: STOREFRONT_VERSION,
    });
    if (!vr?.errors?.length) {
      mf = vr?.data?.node?.product?.metafield ?? mf;
    }
  }

  if (!mf?.value) {
    const nr = await shopify.query(qNode, opts);
    if (!nr?.errors?.length) {
      mf = nr?.data?.node?.metafield ?? mf;
    }
  }

  if (!mf?.value) {
    try {
      const fr = await storefrontGraphql(qProduct, { id: productId });
      if (fr?.errors?.length) {
        return {
          value: null,
          error: fr.errors.map((e) => e.message).join(" "),
        };
      }
      mf = fr?.data?.product?.metafield ?? mf;
    } catch (e) {
      return { value: null, error: String(e?.message || e) };
    }
  }

  if (!mf?.value && productMissing) {
    return {
      value: null,
      error:
        "Storefront could not load this product. Publish it to the Online Store sales channel.",
    };
  }

  return { value: mf?.value ?? null, error: null };
}

async function resolveMonthlyRaw(productId, variantId) {
  const fromApp = getMetafieldFromAppEntries(
    productId,
    shopify.appMetafields?.current ?? [],
  );
  if (fromApp) return { value: fromApp, error: null };
  return fetchMonthlyPriceFromStorefront(productId, variantId);
}

/**
 * Aggregates monthly total and plan titles for subscription lines.
 */
export async function getMonthlyPricingDetails(subscriptionLines) {
  const pricing = await getSubscriptionPricingDetails(subscriptionLines);
  return {
    monthlyTotal: pricing.monthlyTotal,
    planNames: pricing.planNames,
    anyError: pricing.anyError,
  };
}

/**
 * Aggregates recurring and one-time totals plus per-line pricing.
 */
export async function getSubscriptionPricingDetails(subscriptionLines) {
  let monthlyTotal = 0;
  let oneTimeTotal = 0;
  const planNames = [];
  let anyError = null;
  const plans = [];

  for (const line of subscriptionLines) {
    const productId = line.merchandise?.product?.id;
    const variantId = line.merchandise?.id;
    const { value: raw, error } = await resolveMonthlyRaw(productId, variantId);
    if (error) anyError = error;
    const monthlyPrice = raw ? parseMoneyValue(raw) * (line.quantity || 1) : 0;
    const oneTimePrice = getOneTimePrice(line);
    if (raw) {
      monthlyTotal += monthlyPrice;
    }
    oneTimeTotal += oneTimePrice;
    const title = line.merchandise?.title || line.merchandise?.product?.title;
    if (title) planNames.push(title);
    plans.push({
      line,
      title: title || "Mobile plan",
      monthlyPrice,
      oneTimePrice,
    });
  }

  return { monthlyTotal, oneTimeTotal, planNames, anyError, plans };
}

/**
 * Order summary (right column): divider + label/price row + plan name — matches native totals styling.
 */
export function mountOrderSummaryMonthlyPricing(container, subscriptionLines) {
  container.replaceChildren();

  const currencyCode = getCurrencyCode();
  const wrapper = el("s-stack", { gap: "small" });
  container.appendChild(wrapper);

  const loading = el("s-stack", {
    direction: "inline",
    gap: "small",
    alignItems: "center",
  });
  loading.appendChild(el("s-spinner"));
  loading.appendChild(
    el("s-text", { color: "subdued", textContent: "Loading monthly price…" }),
  );
  wrapper.appendChild(loading);

  (async () => {
    try {
      const { monthlyTotal, oneTimeTotal, planNames, anyError } =
        await getSubscriptionPricingDetails(subscriptionLines);
      loading.remove();

      if (monthlyTotal > 0 || oneTimeTotal > 0) {
        wrapper.appendChild(el("s-divider"));
        const oneTimeRow = el("s-stack", {
          direction: "inline",
          justifyContent: "space-between",
          inlineSize: "100%",
        });
        oneTimeRow.appendChild(
          el("s-text", { textContent: "One-time fees today" }),
        );
        oneTimeRow.appendChild(
          el("s-text", {
            textContent: formatPrice(oneTimeTotal, currencyCode),
          }),
        );
        wrapper.appendChild(oneTimeRow);

        const row = el("s-stack", {
          direction: "inline",
          justifyContent: "space-between",
          inlineSize: "100%",
        });
        row.appendChild(
          el("s-text", { type: "strong", textContent: "Monthly subscription" }),
        );
        row.appendChild(
          el("s-text", {
            type: "strong",
            textContent: formatPrice(monthlyTotal, currencyCode) + " /mo",
          }),
        );
        wrapper.appendChild(row);
        if (planNames.length > 0) {
          wrapper.appendChild(
            el("s-paragraph", {
              type: "small",
              color: "subdued",
              textContent: planNames.join(", "),
            }),
          );
        }
      } else if (anyError) {
        wrapper.appendChild(
          el("s-banner", {
            tone: "warning",
            heading: "Monthly price",
            textContent: anyError,
          }),
        );
      } else if (
        subscriptionLines.some(isMobileSubscriptionLine) &&
        monthlyTotal <= 0 &&
        !anyError
      ) {
        // Expected subscription product but metafield missing / zero
        wrapper.appendChild(
          el("s-banner", {
            tone: "info",
            heading: "Monthly price",
            textContent:
              "No monthly amount was found. Check product metafield custom.monthly_price (Money), Storefront API access on the definition, and that the product is published to Online Store.",
          }),
        );
      }
    } catch (e) {
      loading.remove();
      wrapper.appendChild(
        el("s-banner", {
          tone: "critical",
          textContent: String(e?.message || e),
        }),
      );
    }
  })();
}
