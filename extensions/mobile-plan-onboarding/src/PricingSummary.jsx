import "@shopify/ui-extensions/preact";

const MOBILE_SUBSCRIPTION_TYPE = "Mobile-subscription";

function parseMoneyValue(raw) {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.,]/g, "").replace(",", ".");
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

async function fetchMonthlyPrice(productId) {
  try {
    const result = await shopify.query(
      `query ProductMetafield($id: ID!) {
        product(id: $id) {
          metafield(namespace: "custom", key: "monthly_price") {
            value
            type
          }
        }
      }`,
      { variables: { id: productId } },
    );
    return result?.data?.product?.metafield?.value || null;
  } catch (e) {
    return null;
  }
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "textContent") {
        node.textContent = v;
      } else {
        node.setAttribute(k, v);
      }
    }
  }
  if (children) {
    for (const child of Array.isArray(children) ? children : [children]) {
      if (typeof child === "string") {
        node.appendChild(document.createTextNode(child));
      } else if (child) {
        node.appendChild(child);
      }
    }
  }
  return node;
}

export default function () {
  const lines = shopify.lines.current;
  const currencyCode = getCurrencyCode();

  const subscriptionLines = lines.filter(
    (line) =>
      line.merchandise?.product?.productType === MOBILE_SUBSCRIPTION_TYPE,
  );
  if (subscriptionLines.length === 0) return;

  const wrapper = el("s-box", { padding: "extraTight none" });
  document.body.appendChild(wrapper);

  (async () => {
    try {
      let monthlyTotal = 0;
      const planNames = [];

      for (const line of subscriptionLines) {
        const productId = line.merchandise?.product?.id;
        const raw = await fetchMonthlyPrice(productId);
        if (raw) {
          monthlyTotal += parseMoneyValue(raw) * (line.quantity || 1);
        }
        const title = line.merchandise?.title || line.merchandise?.product?.title;
        if (title) planNames.push(title);
      }

      if (monthlyTotal > 0) {
        wrapper.appendChild(el("s-divider"));

        const row = el("s-box", {
          display: "flex",
          "justify-content": "space-between",
          padding: "tight none",
        });

        row.appendChild(
          el("s-text", {
            size: "small",
            textContent: "Monthly subscription",
          }),
        );

        row.appendChild(
          el("s-text", {
            size: "small",
            emphasis: "bold",
            textContent: formatPrice(monthlyTotal, currencyCode) + " /mo",
          }),
        );

        wrapper.appendChild(row);

        if (planNames.length > 0) {
          const detail = el("s-text", {
            size: "small",
            appearance: "subdued",
            textContent: planNames.join(", "),
          });
          wrapper.appendChild(detail);
        }
      }
    } catch (e) {
      // Non-critical, fail silently
    }
  })();
}
