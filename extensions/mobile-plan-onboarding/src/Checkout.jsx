import "@shopify/ui-extensions/preact";

const MOBILE_SUBSCRIPTION_TYPE = "Mobile-subscription";
const NUMBER_API_BASE_URL =
  "https://mock-phone-numbers-759347772663.europe-west6.run.app";

const pendingAttributes = {};
let saveTimer = null;

function queueAttributeChange(key, value) {
  pendingAttributes[key] = value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushAttributes, 1500);
}

async function flushAttributes() {
  const entries = Object.entries(pendingAttributes);
  for (const [key, value] of entries) {
    delete pendingAttributes[key];
    await shopify.applyAttributeChange({
      type: "updateAttribute",
      key,
      value,
    });
  }
}

function getCurrencyCode() {
  const cost = shopify.cost?.current;
  return cost?.totalAmount?.currencyCode || "CHF";
}

function formatPrice(amount, currencyCode) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyCode || "CHF",
  }).format(num);
}

function parseMoneyValue(raw) {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
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

function renderPricingSummary(section) {
  const lines = shopify.lines.current;
  const currencyCode = getCurrencyCode();

  const subscriptionLines = lines.filter(
    (line) =>
      line.merchandise?.product?.productType === MOBILE_SUBSCRIPTION_TYPE,
  );
  if (subscriptionLines.length === 0) return;

  let oneTimeTotal = 0;
  let hasOneTimeProduct = false;
  for (const line of lines) {
    const isSubscription =
      line.merchandise?.product?.productType === MOBILE_SUBSCRIPTION_TYPE;
    const linePrice = parseFloat(line.cost?.totalAmount?.amount || "0");
    oneTimeTotal += linePrice;
    if (!isSubscription) hasOneTimeProduct = true;
  }

  const summaryBox = document.createElement("s-box");
  summaryBox.setAttribute("padding", "base");
  summaryBox.setAttribute("border", "base");
  summaryBox.setAttribute("border-radius", "base");

  const summaryHeading = document.createElement("s-heading");
  summaryHeading.textContent = "Price Summary";
  summaryBox.appendChild(summaryHeading);

  if (hasOneTimeProduct || oneTimeTotal > 0) {
    const oneTimeRow = document.createElement("s-box");
    oneTimeRow.setAttribute("display", "flex");
    oneTimeRow.setAttribute("justify-content", "space-between");
    oneTimeRow.setAttribute("padding", "tight");

    const oneTimeLabel = document.createElement("s-text");
    oneTimeLabel.textContent = "One-time payment (today)";
    oneTimeRow.appendChild(oneTimeLabel);

    const oneTimeValue = document.createElement("s-text");
    oneTimeValue.setAttribute("emphasis", "bold");
    oneTimeValue.textContent = formatPrice(oneTimeTotal, currencyCode);
    oneTimeRow.appendChild(oneTimeValue);

    summaryBox.appendChild(oneTimeRow);
  }

  section.appendChild(summaryBox);

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
        const monthlyRow = document.createElement("s-box");
        monthlyRow.setAttribute("display", "flex");
        monthlyRow.setAttribute("justify-content", "space-between");
        monthlyRow.setAttribute("padding", "tight");

        const monthlyLabel = document.createElement("s-text");
        monthlyLabel.textContent = "Monthly subscription";
        monthlyRow.appendChild(monthlyLabel);

        const monthlyValue = document.createElement("s-text");
        monthlyValue.setAttribute("emphasis", "bold");
        monthlyValue.textContent =
          formatPrice(monthlyTotal, currencyCode) + " /mo";
        monthlyRow.appendChild(monthlyValue);

        summaryBox.appendChild(monthlyRow);
      }
    } catch (e) {
      // Silently fail - pricing summary is non-critical
    }
  })();
}

export default function () {
  const lines = shopify.lines.current;
  const hasMobilePlan = lines.some(
    (line) =>
      line.merchandise?.product?.productType === MOBILE_SUBSCRIPTION_TYPE,
  );
  if (!hasMobilePlan) return;

  const section = document.createElement("s-section");

  try {
    renderPricingSummary(section);
  } catch (e) {
    // Don't let pricing summary crash the whole extension
  }

  const heading = document.createElement("s-heading");
  heading.textContent = "Mobile Plan Setup";
  section.appendChild(heading);

  const intro = document.createElement("s-text");
  intro.textContent = "Complete the following to set up your mobile plan.";
  section.appendChild(intro);

  const choiceList = document.createElement("s-choice-list");
  choiceList.setAttribute(
    "label",
    "How would you like to get your phone number?",
  );

  const choicePort = document.createElement("s-choice");
  choicePort.setAttribute("id", "port");
  choicePort.setAttribute("value", "port");
  choicePort.textContent = "Port my existing number";

  const choiceNew = document.createElement("s-choice");
  choiceNew.setAttribute("id", "new");
  choiceNew.setAttribute("value", "new");
  choiceNew.textContent = "Get a new number";

  choiceList.appendChild(choicePort);
  choiceList.appendChild(choiceNew);
  section.appendChild(choiceList);

  const dynamicArea = document.createElement("s-box");
  dynamicArea.setAttribute("padding", "base");
  section.appendChild(dynamicArea);

  choiceList.addEventListener("change", (e) => {
    const values = e.target.values || [];
    const value = Array.isArray(values) ? values[0] : values;
    dynamicArea.innerHTML = "";

    queueAttributeChange("mobile_number_choice", value || "");

    if (value === "port") {
      renderPortFields(dynamicArea);
    } else if (value === "new") {
      renderNewNumberFields(dynamicArea);
    }
  });

  document.body.appendChild(section);
}

function renderPortFields(container) {
  const phoneField = document.createElement("s-text-field");
  phoneField.setAttribute("label", "Phone number to port");
  phoneField.setAttribute("required", "");
  phoneField.setAttribute("placeholder", "+41 7x xxx xx xx");
  phoneField.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (val) {
      queueAttributeChange("mobile_port_number", val);
    }
  });

  const carrierField = document.createElement("s-text-field");
  carrierField.setAttribute("label", "Current carrier");
  carrierField.setAttribute("required", "");
  carrierField.setAttribute("placeholder", "e.g. Swisscom, Sunrise, Salt");
  carrierField.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (val) {
      queueAttributeChange("mobile_current_carrier", val);
    }
  });

  const consentBox = document.createElement("s-box");
  consentBox.setAttribute("padding", "tight");

  const consentCheckbox = document.createElement("s-checkbox");
  consentCheckbox.setAttribute("id", "port-consent");
  consentCheckbox.setAttribute(
    "label",
    "I authorize the transfer of my phone number to the new provider. " +
      "I understand that my current contract may be affected.",
  );
  consentCheckbox.addEventListener("change", (e) => {
    const checked = e.target.checked ? "true" : "false";
    queueAttributeChange("mobile_port_consent", checked);
    queueAttributeChange(
      "mobile_port_consent_timestamp",
      new Date().toISOString(),
    );
  });

  consentBox.appendChild(consentCheckbox);

  container.appendChild(phoneField);
  container.appendChild(carrierField);
  container.appendChild(consentBox);
}

async function renderNewNumberFields(container) {
  const spinner = document.createElement("s-spinner");
  const loadingText = document.createElement("s-text");
  loadingText.textContent = "Loading available numbers...";
  container.appendChild(spinner);
  container.appendChild(loadingText);

  try {
    const response = await fetch(
      `${NUMBER_API_BASE_URL}/api/numbers/available`,
    );
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    const numbers = data.numbers || [];

    container.innerHTML = "";

    if (numbers.length === 0) {
      const warning = document.createElement("s-banner");
      warning.setAttribute("tone", "warning");
      warning.textContent = "No numbers are currently available.";
      container.appendChild(warning);

      const retryBtn = document.createElement("s-button");
      retryBtn.setAttribute("variant", "secondary");
      retryBtn.textContent = "Try again";
      retryBtn.addEventListener("click", () => {
        container.innerHTML = "";
        renderNewNumberFields(container);
      });
      container.appendChild(retryBtn);
      return;
    }

    const select = document.createElement("s-select");
    select.setAttribute("label", "Choose your new phone number");
    select.setAttribute("required", "");

    const placeholder = document.createElement("s-option");
    placeholder.setAttribute("value", "");
    placeholder.setAttribute("disabled", "");
    placeholder.textContent = "Select a number";
    select.appendChild(placeholder);

    for (const num of numbers) {
      const option = document.createElement("s-option");
      option.setAttribute("value", num.id);
      option.textContent = num.number;
      select.appendChild(option);
    }

    select.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const numberObj = numbers.find((n) => n.id === selectedId);
      if (numberObj) {
        queueAttributeChange("mobile_selected_number", numberObj.number);
        queueAttributeChange("mobile_selected_number_id", numberObj.id);
      }
    });

    container.appendChild(select);
  } catch (err) {
    container.innerHTML = "";
    const errorBanner = document.createElement("s-banner");
    errorBanner.setAttribute("tone", "critical");
    errorBanner.textContent =
      "Unable to load available numbers. Please try again.";
    container.appendChild(errorBanner);

    const retryBtn = document.createElement("s-button");
    retryBtn.setAttribute("variant", "secondary");
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      container.innerHTML = "";
      renderNewNumberFields(container);
    });
    container.appendChild(retryBtn);
  }
}
