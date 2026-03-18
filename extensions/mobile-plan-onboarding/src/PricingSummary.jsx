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

export default function () {
  const lines = shopify.lines.current;
  const currencyCode = getCurrencyCode();

  const subscriptionLines = lines.filter(
    (line) =>
      line.merchandise?.product?.productType === MOBILE_SUBSCRIPTION_TYPE,
  );
  if (subscriptionLines.length === 0) return;

  const wrapper = document.createElement("s-box");
  wrapper.setAttribute("padding", "tight none");

  document.body.appendChild(wrapper);

  (async () => {
    try {
      let monthlyTotal = 0;
      for (const line of subscriptionLines) {
        const productId = line.merchandise?.product?.id;
        const raw = await fetchMonthlyPrice(productId);
        if (raw) {
          monthlyTotal += parseMoneyValue(raw) * (line.quantity || 1);
        }
      }
      if (monthlyTotal > 0) {
        const row = document.createElement("s-box");
        row.setAttribute("display", "flex");
        row.setAttribute("justify-content", "space-between");
        row.setAttribute("padding", "tight none");

        const label = document.createElement("s-text");
        label.textContent = "Monthly subscription";
        row.appendChild(label);

        const value = document.createElement("s-text");
        value.setAttribute("emphasis", "bold");
        value.textContent = formatPrice(monthlyTotal, currencyCode) + " /mo";
        row.appendChild(value);

        wrapper.appendChild(row);
      }
    } catch (e) {
      // Non-critical, fail silently
    }
  })();
}
