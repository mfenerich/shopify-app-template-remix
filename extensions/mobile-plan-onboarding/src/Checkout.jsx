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
const formState = {
  choice: "",
  portNumber: "",
  termination: "",
  portConsent: false,
  selectedNumberId: "",
};

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

/**
 * Clicks on nested Polaris components often target inner shadow DOM nodes.
 * Use `composedPath()` and stable ids (not only `path.includes(node)` — remote
 * DOM can make host references not match path entries).
 */
function pathIndexOfId(path, id) {
  if (!id || !path?.length) return -1;
  for (let i = 0; i < path.length; i++) {
    const n = path[i];
    if (n && n.id === id) return i;
  }
  return -1;
}

function pathIndexOfNode(path, node) {
  if (!node || !path?.length) return -1;
  const idx = path.indexOf(node);
  if (idx !== -1) return idx;
  const id = node.id;
  return id ? pathIndexOfId(path, id) : -1;
}

/** Prefer the card closest to the event target (smaller path index). */
function resolvePortChoiceFromEvent(event, yesNode, noNode) {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  const yi = pathIndexOfNode(path, yesNode);
  const ni = pathIndexOfNode(path, noNode);
  if (yi === -1 && ni === -1) return null;
  if (yi !== -1 && ni !== -1) return yi <= ni ? "yes" : "no";
  if (yi !== -1) return "yes";
  return "no";
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

/**
 * Checkout UI extensions only reliably support Polaris `s-*` components.
 * Plain HTML (`div`) can prevent the extension from rendering.
 */
function applyChoiceCardAppearance(card, selected) {
  if (!card) return;
  card.background = selected ? "subdued" : "base";
  // Border sizes must use Polaris keywords (not arbitrary CSS).
  card.border = selected ? "large base solid" : "large-200 base solid";
  card.borderRadius = "large";
  card.padding = "base";
  card.minBlockSize = "large-200";
}

function getValidationErrors() {
  const errors = [];

  if (!formState.choice) {
    errors.push("Choose whether you want to port your number or select a new number.");
    return errors;
  }

  if (formState.choice === "yes") {
    if (formState.portNumber.length < 16) {
      errors.push("Enter your Swiss phone number.");
    }
    if (!formState.termination) {
      errors.push("Choose a termination option.");
    }
    if (!formState.portConsent) {
      errors.push("Allow Revendo to port your number (POW).");
    }
  }

  if (formState.choice === "no" && !formState.selectedNumberId) {
    errors.push("Select a new phone number.");
  }

  return errors;
}

/** One string for a single in-section banner (avoid multiple checkout toasts). */
function formatValidationBannerText(errors) {
  if (!errors?.length) return "";
  return errors.join(" · ");
}

function renderPricingSummary(host) {
  const currentPlans = getSubscriptionLines(shopify.lines.current);
  if (currentPlans.length === 0) {
    host.replaceChildren();
    return;
  }
  mountOrderSummaryMonthlyPricing(host, currentPlans);
}

async function validateSubscriptionCart(subscriptionLines, bannerHost, monthlyHost) {
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

    renderPricingSummary(monthlyHost);

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

  const formValidationHost = el("s-stack", { gap: "small" });
  // First in this section: in-block validation only (no `errors` on intercept — that
  // triggers separate page-level toasts).
  stack.appendChild(formValidationHost);

  const cartValidationHost = el("s-stack", { gap: "small" });
  stack.appendChild(cartValidationHost);

  // Stable placement: show recurring monthly price at the top of the setup block.
  const monthlyHost = el("s-stack", { gap: "small" });
  stack.appendChild(monthlyHost);
  renderPricingSummary(monthlyHost);
  void validateSubscriptionCart(subscriptionLines, cartValidationHost, monthlyHost);

  const linesSignal = shopify.lines;
  if (linesSignal && typeof linesSignal.subscribe === "function") {
    linesSignal.subscribe(() => renderPricingSummary(monthlyHost));
  }

  if (shopify.buyerJourney?.intercept) {
    void shopify.buyerJourney.intercept(({ canBlockProgress }) => {
      const errors = getValidationErrors();
      if (canBlockProgress && errors.length > 0) {
        return {
          behavior: "block",
          reason: "InvalidExtensionState",
          perform: () => {
            // `perform` runs after *all* interceptors finish. `result.behavior` is an
            // aggregate outcome and can be `'allow'` even when this extension blocked,
            // which would incorrectly skip the banner. Re-read validation and show.
            const currentErrors = getValidationErrors();
            if (currentErrors.length > 0) {
              showBanner(
                formValidationHost,
                "critical",
                "Complete mobile plan setup",
                formatValidationBannerText(currentErrors),
              );
            } else {
              formValidationHost.replaceChildren();
            }
          },
        };
      }
      return {
        behavior: "allow",
        perform: () => {
          formValidationHost.replaceChildren();
        },
      };
    });
  }

  stack.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent:
        "Set up your mobile plan below. Choose to keep your current number or pick a new one.",
    }),
  );

  stack.appendChild(
    el("s-text", {
      type: "strong",
      textContent: "Port your number?",
    }),
  );

  // `minmax(0, 1fr)` + `minInlineSize: 0` on items prevents the first column
  // from swallowing hits (classic grid min-width:auto overflow).
  const choiceGrid = el("s-grid", {
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "base",
    inlineSize: "100%",
  });

  // Use s-clickable (not s-stack): layout stacks are not reliably activatable in
  // checkout; clickable wraps content and wires pointer + keyboard activation.
  const yesOption = el("s-clickable", {
    type: "button",
    id: "mobile-plan-choice-yes",
    accessibilityLabel: "Port your existing number",
    inlineSize: "100%",
    maxInlineSize: "100%",
  });
  applyChoiceCardAppearance(yesOption, false);
  const yesInner = el("s-stack", { direction: "block", gap: "small" });
  yesInner.appendChild(
    el("s-text", {
      type: "strong",
      textContent: "Yes",
    }),
  );
  yesInner.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent: "Keep your current number and let Revendo port it.",
    }),
  );
  yesOption.appendChild(yesInner);

  const noOption = el("s-clickable", {
    type: "button",
    id: "mobile-plan-choice-no",
    accessibilityLabel: "Choose a new Swiss number",
    inlineSize: "100%",
    maxInlineSize: "100%",
  });
  applyChoiceCardAppearance(noOption, false);
  const noInner = el("s-stack", { direction: "block", gap: "small" });
  noInner.appendChild(
    el("s-text", {
      type: "strong",
      textContent: "No",
    }),
  );
  noInner.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent: "Choose a brand new Swiss mobile number.",
    }),
  );
  noOption.appendChild(noInner);

  const yesCell = el("s-grid-item", {
    minInlineSize: "0",
    overflow: "hidden",
  });
  yesCell.appendChild(yesOption);
  const noCell = el("s-grid-item", {
    minInlineSize: "0",
    overflow: "hidden",
  });
  noCell.appendChild(noOption);
  choiceGrid.appendChild(yesCell);
  choiceGrid.appendChild(noCell);
  stack.appendChild(choiceGrid);

  const dynamicArea = el("s-stack", { gap: "base" });
  stack.appendChild(dynamicArea);

  function updateChoiceButtons() {
    applyChoiceCardAppearance(yesOption, formState.choice === "yes");
    applyChoiceCardAppearance(noOption, formState.choice === "no");
  }

  function handleChoiceChange(value) {
    dynamicArea.replaceChildren();
    formValidationHost.replaceChildren();
    formState.choice = value || "";
    formState.portNumber = "";
    formState.termination = "";
    formState.portConsent = false;
    formState.selectedNumberId = "";
    updateChoiceButtons();

    queueAttributeChange("mobile_number_choice", value === "yes" ? "port" : "new");

    if (value === "yes") {
      renderPortFields(dynamicArea);
    } else if (value === "no") {
      renderNewNumberFields(dynamicArea);
    }
  }

  // Delegate with path tie-break: YES checked first used to steal NO hits when
  // the grid overflowed; `resolvePortChoiceFromEvent` picks the innermost card.
  choiceGrid.addEventListener("click", (e) => {
    const choice = resolvePortChoiceFromEvent(e, yesOption, noOption);
    if (choice) {
      e.preventDefault();
      handleChoiceChange(choice);
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
    placeholder: "+41 7x xxx xx xx",
    value: "+41 ",
    maxLength: 16,
  });
  phoneField.addEventListener("input", (e) => {
    const masked = formatSwissPhoneNumber(e.target.value || "");
    e.target.value = masked;
    formState.portNumber = masked;
    if (masked !== "+41") queueAttributeChange("mobile_port_number", masked);
  });
  stack.appendChild(phoneField);

  const terminationSelect = el("s-select", {
    label: "Termination",
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
    formState.termination = val;
    if (val) queueAttributeChange("mobile_port_termination", val);
  });
  stack.appendChild(terminationSelect);

  const consentCheckbox = el("s-checkbox", {
    id: "port-consent",
    label: "Allow Revendo to port your number (POW)",
  });
  consentCheckbox.addEventListener("change", (e) => {
    formState.portConsent = !!e.target.checked;
    const checked = formState.portConsent ? "true" : "false";
    queueAttributeChange("mobile_port_consent", checked);
    if (formState.portConsent) {
      queueAttributeChange(
        "mobile_port_consent_timestamp",
        new Date().toISOString(),
      );
    }
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
        container.replaceChildren();
        renderNewNumberFields(container);
      });
      stack.appendChild(retryBtn);
      return;
    }

    const select = el("s-select", {
      label: "Select number",
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
      formState.selectedNumberId = selectedId;
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
      container.replaceChildren();
      renderNewNumberFields(container);
    });
    stack.appendChild(retryBtn);
  }
}
