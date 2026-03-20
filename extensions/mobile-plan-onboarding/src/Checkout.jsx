import "@shopify/ui-extensions/preact";

import { el } from "./polarisDom.js";
import {
  getSubscriptionPricingDetails,
  mountOrderSummaryMonthlyPricing,
} from "./monthlyPricing.js";
import { getSubscriptionLines } from "./subscriptionLines.js";
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

function getPlanTitle(line) {
  return line.merchandise?.product?.title || line.merchandise?.title || "Mobile plan";
}

function showBanner(container, tone, heading, textContent) {
  container.replaceChildren(
    el("s-banner", {
      tone,
      heading,
      textContent,
    }),
  );
}

async function applyCartLineChange(change) {
  const result = await shopify.applyCartLinesChange(change);
  if (result?.type === "error") {
    throw new Error(result.message || "Unable to update mobile plans.");
  }
}

function getComparablePlanPrice(plan) {
  return plan.monthlyPrice || 0;
}

function formatSwissPhoneNumber(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("0041")) {
    digits = `41${digits.slice(4)}`;
  }
  if (digits.startsWith("41")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 9);

  const parts = ["+41"];
  if (digits.length > 0) parts.push(digits.slice(0, Math.min(2, digits.length)));
  if (digits.length > 2) parts.push(digits.slice(2, Math.min(5, digits.length)));
  if (digits.length > 5) parts.push(digits.slice(5, Math.min(7, digits.length)));
  if (digits.length > 7) parts.push(digits.slice(7, Math.min(9, digits.length)));
  return parts.join(" ");
}

async function validateSubscriptionCart(subscriptionLines, bannerHost) {
  bannerHost.replaceChildren();
  const messages = [];

  try {
    for (const line of subscriptionLines) {
      if ((line.quantity || 1) > 1) {
        await applyCartLineChange({
          type: "updateCartLine",
          id: line.id,
          quantity: 1,
        });
        messages.push(`Reduced "${getPlanTitle(line)}" to quantity 1.`);
      }
    }

    const currentPlans = getSubscriptionLines(shopify.lines.current);
    if (currentPlans.length > 1) {
      const { plans } = await getSubscriptionPricingDetails(currentPlans);
      const rankedPlans = [...plans].sort(
        (a, b) => getComparablePlanPrice(a) - getComparablePlanPrice(b),
      );
      const keepPlan = rankedPlans[rankedPlans.length - 1];
      const removePlans = rankedPlans.slice(0, -1);

      for (const plan of removePlans) {
        const refreshedLine = getSubscriptionLines(shopify.lines.current).find(
          (line) => line.merchandise?.id === plan.line.merchandise?.id,
        );
        if (!refreshedLine) continue;
        await applyCartLineChange({
          type: "removeCartLine",
          id: refreshedLine.id,
          quantity: refreshedLine.quantity || 1,
        });
      }

      if (removePlans.length > 0) {
        const removedTitles = removePlans.map((plan) => `"${plan.title}"`).join(", ");
        messages.push(
          `Only one mobile plan is allowed. Kept "${keepPlan.title}" and removed ${removedTitles}.`,
        );
      }
    }

    if (messages.length > 0) {
      showBanner(
        bannerHost,
        "info",
        "Mobile plan updated",
        messages.join(" "),
      );
    }
  } catch (error) {
    showBanner(
      bannerHost,
      "warning",
      "Mobile plan validation",
      String(error?.message || error),
    );
  }
}

export default function () {
  const lines = shopify.lines.current;
  const subscriptionLines = getSubscriptionLines(lines);
  const hasMobilePlan = subscriptionLines.length > 0;
  if (!hasMobilePlan) return;

  const section = el("s-section", { heading: "Mobile Plan Setup" });

  const stack = el("s-stack", { gap: "base" });

  const validationHost = el("s-stack", { gap: "small" });
  stack.appendChild(validationHost);
  void validateSubscriptionCart(subscriptionLines, validationHost);

  // Stable placement: show recurring monthly price at the top of the setup block.
  const monthlyHost = el("s-stack", { gap: "small" });
  stack.appendChild(monthlyHost);
  mountOrderSummaryMonthlyPricing(monthlyHost, subscriptionLines);

  stack.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent:
        "Set up your mobile plan below. Choose to keep your current number or pick a new one.",
    }),
  );

  const choiceList = el("s-choice-list", {
    label: "Port your number?",
  });
  choiceList.appendChild(
    el("s-choice", { id: "yes", value: "yes", textContent: "Yes" }),
  );
  choiceList.appendChild(
    el("s-choice", { id: "no", value: "no", textContent: "No" }),
  );
  stack.appendChild(choiceList);

  const dynamicArea = el("s-stack", { gap: "base" });
  stack.appendChild(dynamicArea);

  choiceList.addEventListener("change", (e) => {
    const values = e.target.values || [];
    const value = Array.isArray(values) ? values[0] : values;
    dynamicArea.innerHTML = "";

    queueAttributeChange("mobile_number_choice", value === "yes" ? "port" : "new");

    if (value === "yes") {
      renderPortFields(dynamicArea);
    } else if (value === "no") {
      renderNewNumberFields(dynamicArea);
    }
  });

  section.appendChild(stack);
  document.body.appendChild(section);
}

function renderPortFields(container) {
  const stack = el("s-stack", { gap: "base" });

  stack.appendChild(
    el("s-paragraph", {
      type: "small",
      color: "subdued",
      textContent:
        "We'll transfer your existing number to your new plan. This usually takes 1-2 business days.",
    }),
  );

  const phoneField = el("s-text-field", {
    label: "What's your number",
    required: "",
    placeholder: "+41 7x xxx xx xx",
    value: "+41 ",
    maxLength: 16,
  });
  phoneField.addEventListener("input", (e) => {
    const masked = formatSwissPhoneNumber(e.target.value || "");
    e.target.value = masked;
    if (masked !== "+41") queueAttributeChange("mobile_port_number", masked);
  });
  stack.appendChild(phoneField);

  const terminationSelect = el("s-select", {
    label: "Termination",
    required: "",
  });
  terminationSelect.appendChild(
    el("s-option", {
      value: "",
      disabled: "",
      textContent: "Select termination timing",
    }),
  );
  terminationSelect.appendChild(
    el("s-option", {
      value: "asap",
      textContent: "As soon as possible",
    }),
  );
  terminationSelect.appendChild(
    el("s-option", {
      value: "end_of_contract",
      textContent: "By the end of the contract",
    }),
  );
  terminationSelect.addEventListener("change", (e) => {
    const val = e.target.value || "";
    if (val) queueAttributeChange("mobile_port_termination", val);
  });
  stack.appendChild(terminationSelect);

  const consentCheckbox = el("s-checkbox", {
    id: "port-consent",
    label: "Allow Revendo to port your number (POW)",
  });
  consentCheckbox.addEventListener("change", (e) => {
    const checked = e.target.checked ? "true" : "false";
    queueAttributeChange("mobile_port_consent", checked);
    queueAttributeChange(
      "mobile_port_consent_timestamp",
      new Date().toISOString(),
    );
  });
  stack.appendChild(consentCheckbox);

  container.appendChild(stack);
}

async function renderNewNumberFields(container) {
  const stack = el("s-stack", { gap: "base" });

  stack.appendChild(
    el("s-paragraph", {
      type: "small",
      color: "subdued",
      textContent: "Choose from our available Swiss mobile numbers.",
    }),
  );

  const loadingRow = el("s-stack", {
    direction: "inline",
    gap: "small",
    alignItems: "center",
  });
  loadingRow.appendChild(el("s-spinner"));
  loadingRow.appendChild(
    el("s-text", { color: "subdued", textContent: "Loading available numbers..." }),
  );
  stack.appendChild(loadingRow);

  container.appendChild(stack);

  try {
    const response = await fetch(
      `${NUMBER_API_BASE_URL}/api/numbers/available`,
    );
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    const numbers = data.numbers || [];

    loadingRow.remove();

    if (numbers.length === 0) {
      stack.appendChild(
        el("s-banner", {
          heading: "No numbers available",
          tone: "warning",
          textContent: "Please try again later.",
        }),
      );

      const retryBtn = el("s-button", {
        variant: "secondary",
        textContent: "Try again",
      });
      retryBtn.addEventListener("click", () => {
        container.innerHTML = "";
        renderNewNumberFields(container);
      });
      stack.appendChild(retryBtn);
      return;
    }

    const select = el("s-select", {
      label: "Select number",
      required: "",
    });
    select.appendChild(
      el("s-option", { value: "", disabled: "", textContent: "Select a number" }),
    );
    for (const num of numbers) {
      select.appendChild(
        el("s-option", { value: num.id, textContent: num.number }),
      );
    }

    let confirmBanner = null;

    select.addEventListener("change", (e) => {
      const selectedId = e.target.value;
      const numberObj = numbers.find((n) => n.id === selectedId);
      if (numberObj) {
        queueAttributeChange("mobile_selected_number", numberObj.number);
        queueAttributeChange("mobile_selected_number_id", numberObj.id);

        if (confirmBanner) confirmBanner.remove();
        confirmBanner = el("s-banner", {
          heading: numberObj.number,
          tone: "success",
          textContent: "This number will be assigned to your plan.",
        });
        stack.appendChild(confirmBanner);
      }
    });

    stack.appendChild(select);
  } catch (err) {
    loadingRow.remove();

    stack.appendChild(
      el("s-banner", {
        heading: "Connection error",
        tone: "critical",
        textContent: "Unable to load available numbers. Please try again.",
      }),
    );

    const retryBtn = el("s-button", {
      variant: "secondary",
      textContent: "Retry",
    });
    retryBtn.addEventListener("click", () => {
      container.innerHTML = "";
      renderNewNumberFields(container);
    });
    stack.appendChild(retryBtn);
  }
}
