/**
 * Monthly recurring price from product metafield custom.monthly_price (Storefront API).
 */
import type { CheckoutLine, AppMetafieldEntry, SubscriptionPricingDetails } from "./types.js";
import { el } from "./polarisDom.js";
import { isMobileSubscriptionLine } from "./subscriptionLines.js";

const STOREFRONT_VERSION = "2025-10";

export function parseMoneyValue(raw: unknown): number {
  if (!raw) return 0;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>;
      const amt = j.amount ?? j.value;
      if (amt != null) return parseFloat(String(amt)) || 0;
    } catch {
      /* fall through */
    }
  }
  const cleaned = trimmed.replace(/[^0-9.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function formatPrice(amount: number | string, currencyCode: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyCode || "CHF",
  }).format(num);
}

function getCurrencyCode(): string {
  return shopify.cost?.current?.totalAmount?.currencyCode || "CHF";
}

function getOneTimePrice(line: CheckoutLine): number {
  const amount = line?.cost?.totalAmount?.amount;
  return typeof amount === "string" ? parseFloat(amount) || 0 : 0;
}

function productIdMatchesTarget(
  productGid: string,
  target: AppMetafieldEntry["target"],
): boolean {
  if (!productGid || !target || target.type !== "product") return false;
  if (target.id === productGid) return true;
  const gidTail = productGid.split("/").pop();
  return (
    target.id === gidTail ||
    target.id === `gid://shopify/Product/${gidTail}`
  );
}

function getMetafieldFromAppEntries(
  productId: string,
  entries: AppMetafieldEntry[],
): string | null {
  if (!entries?.length) return null;
  const hit = entries.find(
    (e) =>
      e?.metafield?.namespace === "custom" &&
      e?.metafield?.key === "monthly_price" &&
      productIdMatchesTarget(productId, e.target),
  );
  return hit?.metafield?.value ?? null;
}

async function storefrontGraphql(
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string }> }> {
  const url = `shopify:storefront/api/${STOREFRONT_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function fetchMonthlyPriceFromStorefront(
  productId: string,
  variantId: string | undefined,
): Promise<{ value: string | null; error: string | null }> {
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

  type MF = { value?: string; type?: string } | null | undefined;
  let mf: MF = (result?.data?.product as { metafield?: MF } | undefined)?.metafield;
  const productMissing =
    result?.data && result.data.product === null && !result?.errors?.length;

  if (!mf?.value && variantId) {
    const vr = await shopify.query(qVariant, {
      variables: { id: variantId },
      version: STOREFRONT_VERSION,
    });
    if (!vr?.errors?.length) {
      mf = (vr?.data?.node as { product?: { metafield?: MF } } | undefined)?.product?.metafield ?? mf;
    }
  }

  if (!mf?.value) {
    const nr = await shopify.query(qNode, opts);
    if (!nr?.errors?.length) {
      mf = (nr?.data?.node as { metafield?: MF } | undefined)?.metafield ?? mf;
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
      mf = (fr?.data?.product as { metafield?: MF } | undefined)?.metafield ?? mf;
    } catch (e) {
      return { value: null, error: String((e as Error)?.message || e) };
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

async function resolveMonthlyRaw(
  productId: string,
  variantId: string | undefined,
): Promise<{ value: string | null; error: string | null }> {
  const fromApp = getMetafieldFromAppEntries(
    productId,
    shopify.appMetafields?.current ?? [],
  );
  if (fromApp) return { value: fromApp, error: null };
  return fetchMonthlyPriceFromStorefront(productId, variantId);
}

/**
 * Aggregates recurring and one-time totals plus per-line pricing.
 */
export async function getSubscriptionPricingDetails(
  subscriptionLines: CheckoutLine[],
): Promise<SubscriptionPricingDetails> {
  let monthlyTotal = 0;
  let oneTimeTotal = 0;
  const planNames: string[] = [];
  let anyError: string | null = null;
  const plans: SubscriptionPricingDetails["plans"] = [];

  for (const line of subscriptionLines) {
    const productId = line.merchandise?.product?.id;
    const variantId = line.merchandise?.id;
    const { value: raw, error } = await resolveMonthlyRaw(productId || "", variantId);
    if (error) anyError = error;
    const monthlyPrice = raw ? parseMoneyValue(raw) * (line.quantity || 1) : 0;
    const oneTimePrice = getOneTimePrice(line);
    if (raw) monthlyTotal += monthlyPrice;
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
 * Order summary: divider + label/price row + plan name -- matches native totals styling.
 */
export function mountOrderSummaryMonthlyPricing(
  container: HTMLElement,
  subscriptionLines: CheckoutLine[],
): void {
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
    el("s-text", { color: "subdued", textContent: "Loading monthly price\u2026" }),
  );
  wrapper.appendChild(loading);

  void (async () => {
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
          el("s-text", { textContent: formatPrice(oneTimeTotal, currencyCode) }),
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
          textContent: String((e as Error)?.message || e),
        }),
      );
    }
  })();
}
