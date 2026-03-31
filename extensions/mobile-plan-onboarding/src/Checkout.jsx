import "@shopify/ui-extensions/preact";
import { useShop } from "@shopify/ui-extensions/checkout/preact";

import { el } from "./polarisDom.js";
import {
  getSubscriptionPricingDetails,
  mountOrderSummaryMonthlyPricing,
} from "./monthlyPricing.js";
import { getSubscriptionLines } from "./subscriptionLines.js";

/**
 * Number pool via Shopify App Proxy (shopify.app.toml [app_proxy]: prefix apps, subpath numbers).
 * Requests go to https://{shop}/apps/numbers/* → numbers_proxy (not the public Cloud Function URL).
 */
function numberPoolAppProxyBaseUrl(myshopifyDomain) {
  return `https://${myshopifyDomain}/apps/numbers`;
}

const pendingAttributes = {};
let saveTimer = null;
/** Bumped when leaving "new number" mode, clearing the select, or starting a new lock — stale async completions must not touch formState. */
let numberPoolLockOpSeq = 0;

const formState = {
  choice: "",
  portNumber: "",
  termination: "",
  portConsent: false,
  selectedNumberId: "",
  numberPoolSessionIdForApi: "",
  numberPoolLockId: "",
  numberPoolLockedNumberId: "",
  numberPoolLocking: false,
};

/**
 * Intercept runs again as soon as the buyer changes our UI (e.g. taps Yes/No),
 * not only on Pay — so we suppress the *banner* briefly after local edits.
 * Checkout can still be blocked when invalid; this matches “red only on submit”.
 */
let suppressValidationBannerUntilMs = 0;

function touchChoiceInteraction() {
  suppressValidationBannerUntilMs = Date.now() + 4500;
}

function touchFieldInteraction() {
  suppressValidationBannerUntilMs = Date.now() + 900;
}

function shouldShowValidationBannerInPerform() {
  return Date.now() >= suppressValidationBannerUntilMs;
}

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

function getNumberPoolSessionIdFallback() {
  return `np_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Resolves a session id for GET /available and matching POST /lock for this picker
 * instance. No module-level cache — always prefers the current checkout token so a
 * new load (e.g. Retry) uses an up-to-date id. `formState.numberPoolSessionIdForApi`
 * is set only after a successful lock (for unlock).
 */
async function resolveNumberPoolSessionId() {
  const immediate = shopify.checkoutToken?.current;
  if (immediate) return String(immediate);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let unsub = null;
    const finish = (id) => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      if (typeof unsub === "function") unsub();
      resolve(id);
    };
    unsub = shopify.checkoutToken?.subscribe?.(() => {
      const t = shopify.checkoutToken?.current;
      if (t) finish(String(t));
    });
    timer = setTimeout(() => {
      finish(getNumberPoolSessionIdFallback());
    }, 3000);
  });
}

async function fetchNumberPoolAvailable(baseUrl, sessionId) {
  const url = `${baseUrl}/available?sessionId=${encodeURIComponent(sessionId)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("available_failed");
  return response.json();
}

async function postNumberPoolLock(baseUrl, sessionId, numberId) {
  return fetch(`${baseUrl}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numberId, sessionId }),
  });
}

async function postNumberPoolUnlock(baseUrl, sessionId, numberId, lockId) {
  return fetch(`${baseUrl}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numberId, lockId, sessionId }),
  });
}

/**
 * Releases a hard lock (abandon, order complete, or before a new lock).
 * @param {{ clearSelection?: boolean }} options — clear cart attributes when buyer leaves "new number" flow
 */
async function releaseNumberPoolLock(baseUrl, options = {}) {
  const clearSelection = options.clearSelection !== false;
  const lockId = formState.numberPoolLockId;
  const numberId = formState.numberPoolLockedNumberId;
  const sessionId = formState.numberPoolSessionIdForApi;
  if (clearSelection) {
    formState.selectedNumberId = "";
    queueAttributeChange("mobile_number_lock_id", "");
    queueAttributeChange("mobile_selected_number", "");
    queueAttributeChange("mobile_selected_number_id", "");
  }
  formState.numberPoolLockId = "";
  formState.numberPoolLockedNumberId = "";
  formState.numberPoolSessionIdForApi = "";
  if (!lockId || !numberId || !sessionId) return;
  try {
    await postNumberPoolUnlock(baseUrl, sessionId, numberId, lockId);
  } catch {
    /* best-effort; 404 = already released */
  }
}

/** DOM `e.target.value` is always a string; API `id` may be number or string. */
function numberPoolIdKey(id) {
  return String(id);
}

/** Clears selection so the buyer can pick again; some hosts only re-fire `change` after a real reset. */
function resetNumberSelectAfterFailedLock(select) {
  select.value = "";
  requestAnimationFrame(() => {
    select.value = "";
  });
}

async function lockNumberFromPool(baseUrl, sessionId, numbers, selectedId) {
  const selectedKey = numberPoolIdKey(selectedId);
  const startIdx = numbers.findIndex(
    (n) => numberPoolIdKey(n.id) === selectedKey,
  );
  const ordered =
    startIdx === -1
      ? numbers
      : [...numbers.slice(startIdx), ...numbers.slice(0, startIdx)];

  const tryList = async (list) => {
    for (const num of list) {
      const res = await postNumberPoolLock(baseUrl, sessionId, num.id);
      if (res.ok) {
        const data = await res.json();
        const lockId = data.lockId;
        if (!lockId) return { ok: false, failed: true };
        return { ok: true, number: num, lockId };
      }
      if (res.status === 409) continue;
      return { ok: false, failed: true, status: res.status };
    }
    return { ok: false, exhausted: true };
  };

  let result = await tryList(ordered);
  if (result.ok) return result;
  if (!result.exhausted) return result;

  const fresh = await fetchNumberPoolAvailable(baseUrl, sessionId);
  const freshNumbers = fresh.numbers || [];
  if (fresh.pool_exhausted || freshNumbers.length === 0) {
    return { ok: false, poolEmpty: true };
  }
  result = await tryList(freshNumbers);
  if (result.ok) return result;
  return { ok: false, failed: true };
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
function resolveBinaryChoiceFromEvent(
  event,
  leftNode,
  rightNode,
  leftValue,
  rightValue,
) {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  const li = pathIndexOfNode(path, leftNode);
  const ri = pathIndexOfNode(path, rightNode);
  if (li === -1 && ri === -1) return null;
  if (li !== -1 && ri !== -1) return li <= ri ? leftValue : rightValue;
  if (li !== -1) return leftValue;
  return rightValue;
}

function resolvePortChoiceFromEvent(event, yesNode, noNode) {
  return resolveBinaryChoiceFromEvent(event, yesNode, noNode, "yes", "no");
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

  if (shopify.buyerJourney?.completed?.current) {
    return errors;
  }

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

  if (formState.choice === "no") {
    if (formState.numberPoolLocking) {
      errors.push("Please wait while your number is being reserved.");
    } else if (!formState.numberPoolLockId) {
      errors.push("Select a new phone number.");
    }
  }

  return errors;
}

/** One string for a single in-section banner (avoid multiple checkout toasts). */
function formatValidationBannerText(errors) {
  if (!errors?.length) return "";
  return errors.join(" · ");
}

function getBuyerJourneyStepHandle() {
  return shopify.buyerJourney?.activeStep?.current?.handle;
}

/**
 * `buyerJourney.intercept` runs on many progress evaluations (address edits,
 * re-validation, etc.), not only on Pay — especially on one-page checkout.
 * Defer blocking until it looks like a real submit attempt.
 */
function shouldDeferMobilePlanValidation(interceptRun, stepHandle) {
  if (
    stepHandle === "information" ||
    stepHandle === "shipping" ||
    stepHandle === "cart"
  ) {
    return true;
  }
  // Single-page checkout: `handle` stays `checkout`; first evaluation is often
  // before the buyer tries to complete the order.
  if (
    interceptRun === 1 &&
    (stepHandle === "checkout" ||
      stepHandle === "unknown" ||
      stepHandle == null)
  ) {
    return true;
  }
  return false;
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
  const shop = useShop();
  const numberPoolBaseUrl = numberPoolAppProxyBaseUrl(shop.myshopifyDomain);

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
    let buyerJourneyInterceptRun = 0;
    void shopify.buyerJourney.intercept(({ canBlockProgress }) => {
      buyerJourneyInterceptRun += 1;
      const stepHandle = getBuyerJourneyStepHandle();
      const errors = getValidationErrors();

      if (
        shouldDeferMobilePlanValidation(buyerJourneyInterceptRun, stepHandle)
      ) {
        return {
          behavior: "allow",
          perform: () => {},
        };
      }

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
              if (!shouldShowValidationBannerInPerform()) {
                formValidationHost.replaceChildren();
                return;
              }
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

  const journeyCompleted = shopify.buyerJourney?.completed;
  if (journeyCompleted?.subscribe) {
    journeyCompleted.subscribe((completed) => {
      if (completed)
        void releaseNumberPoolLock(numberPoolBaseUrl, { clearSelection: false });
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
    touchChoiceInteraction();
    const prevChoice = formState.choice;
    dynamicArea.replaceChildren();
    formValidationHost.replaceChildren();
    if (prevChoice === "no" && value !== "no") {
      numberPoolLockOpSeq += 1;
      void releaseNumberPoolLock(numberPoolBaseUrl, { clearSelection: true });
    }
    formState.choice = value || "";
    formState.portNumber = "";
    formState.termination = "";
    formState.portConsent = false;
    formState.selectedNumberId = "";
    formState.numberPoolLocking = false;
    updateChoiceButtons();

    queueAttributeChange("mobile_number_choice", value === "yes" ? "port" : "new");

    if (value === "yes") {
      renderPortFields(dynamicArea);
    } else if (value === "no") {
      renderNewNumberFields(dynamicArea, numberPoolBaseUrl);
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

function mountTerminationSelector(stack) {
  stack.appendChild(
    el("s-text", {
      type: "strong",
      textContent: "Termination",
    }),
  );

  const termGrid = el("s-grid", {
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "base",
    inlineSize: "100%",
  });

  const asapCard = el("s-clickable", {
    type: "button",
    id: "mobile-plan-termination-asap",
    accessibilityLabel: "As soon as possible",
    inlineSize: "100%",
    maxInlineSize: "100%",
  });
  applyChoiceCardAppearance(asapCard, formState.termination === "asap");
  const asapInner = el("s-stack", { direction: "block", gap: "small" });
  asapInner.appendChild(
    el("s-text", { type: "strong", textContent: "As soon as possible" }),
  );
  asapInner.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent: "Start the port as early as the process allows.",
    }),
  );
  asapCard.appendChild(asapInner);

  const eocCard = el("s-clickable", {
    type: "button",
    id: "mobile-plan-termination-eoc",
    accessibilityLabel: "By the end of the contract",
    inlineSize: "100%",
    maxInlineSize: "100%",
  });
  applyChoiceCardAppearance(eocCard, formState.termination === "end_of_contract");
  const eocInner = el("s-stack", { direction: "block", gap: "small" });
  eocInner.appendChild(
    el("s-text", { type: "strong", textContent: "End of contract" }),
  );
  eocInner.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent: "Align the port with your current contract end date.",
    }),
  );
  eocCard.appendChild(eocInner);

  const asapCell = el("s-grid-item", {
    minInlineSize: "0",
    overflow: "hidden",
  });
  asapCell.appendChild(asapCard);
  const eocCell = el("s-grid-item", {
    minInlineSize: "0",
    overflow: "hidden",
  });
  eocCell.appendChild(eocCard);
  termGrid.appendChild(asapCell);
  termGrid.appendChild(eocCell);
  stack.appendChild(termGrid);

  function updateTerminationCards() {
    applyChoiceCardAppearance(asapCard, formState.termination === "asap");
    applyChoiceCardAppearance(eocCard, formState.termination === "end_of_contract");
  }

  termGrid.addEventListener("click", (e) => {
    const picked = resolveBinaryChoiceFromEvent(
      e,
      asapCard,
      eocCard,
      "asap",
      "end_of_contract",
    );
    if (!picked) return;
    e.preventDefault();
    touchFieldInteraction();
    formState.termination = picked;
    updateTerminationCards();
    queueAttributeChange("mobile_port_termination", picked);
  });
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
    touchFieldInteraction();
    const masked = formatSwissPhoneNumber(e.target.value || "");
    e.target.value = masked;
    formState.portNumber = masked;
    if (masked !== "+41") queueAttributeChange("mobile_port_number", masked);
  });
  stack.appendChild(phoneField);

  mountTerminationSelector(stack);

  const consentCheckbox = el("s-checkbox", {
    id: "port-consent",
    label: "Allow Revendo to port your number (POW)",
  });
  consentCheckbox.addEventListener("change", (e) => {
    touchFieldInteraction();
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

async function renderNewNumberFields(container, baseUrl) {
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
    const sessionId = await resolveNumberPoolSessionId();
    const data = await fetchNumberPoolAvailable(baseUrl, sessionId);
    const numbers = data.numbers || [];

    loadingRow.remove();

    if (data.pool_exhausted || numbers.length === 0) {
      stack.appendChild(
        el("s-banner", {
          heading: "No numbers available right now",
          tone: "warning",
          textContent:
            "The pool is temporarily empty. Browsing sessions expire within a few minutes — please try again shortly.",
        }),
      );

      const retryBtn = el("s-button", {
        variant: "secondary",
        textContent: "Try again",
      });
      retryBtn.addEventListener("click", () => {
        container.replaceChildren();
        renderNewNumberFields(container, baseUrl);
      });
      stack.appendChild(retryBtn);
      return;
    }

    if (data.high_demand) {
      stack.appendChild(
        el("s-banner", {
          heading: "High demand",
          tone: "info",
          textContent:
            "Many customers are choosing numbers. If your first choice is taken, we will try the next available option automatically.",
        }),
      );
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
    let errorBanner = null;

    select.addEventListener("change", async (e) => {
      touchFieldInteraction();
      const selectedId = e.target.value;

      if (confirmBanner) {
        confirmBanner.remove();
        confirmBanner = null;
      }
      if (errorBanner) {
        errorBanner.remove();
        errorBanner = null;
      }

      if (!selectedId) {
        numberPoolLockOpSeq += 1;
        await releaseNumberPoolLock(baseUrl, { clearSelection: true });
        return;
      }

      const opSeq = (numberPoolLockOpSeq += 1);
      formState.numberPoolLocking = true;
      select.disabled = true;

      try {
        const lockIdHeldBeforeRelease = formState.numberPoolLockId;

        await releaseNumberPoolLock(baseUrl, { clearSelection: false });

        formState.selectedNumberId = "";
        queueAttributeChange("mobile_selected_number", "");
        queueAttributeChange("mobile_selected_number_id", "");
        queueAttributeChange("mobile_number_lock_id", "");

        const result = await lockNumberFromPool(
          baseUrl,
          sessionId,
          numbers,
          selectedId,
        );

        if (opSeq !== numberPoolLockOpSeq) {
          if (
            result.ok &&
            result.lockId &&
            result.lockId !== lockIdHeldBeforeRelease
          ) {
            void postNumberPoolUnlock(
              baseUrl,
              sessionId,
              result.number.id,
              result.lockId,
            );
          }
          return;
        }

        if (result.ok) {
          const numberObj = result.number;
          const lockedIdKey = numberPoolIdKey(numberObj.id);
          formState.selectedNumberId = lockedIdKey;
          formState.numberPoolSessionIdForApi = sessionId;
          formState.numberPoolLockId = result.lockId;
          formState.numberPoolLockedNumberId = lockedIdKey;
          queueAttributeChange("mobile_selected_number", numberObj.number);
          queueAttributeChange("mobile_selected_number_id", lockedIdKey);
          queueAttributeChange("mobile_number_lock_id", result.lockId);

          if (lockedIdKey !== numberPoolIdKey(selectedId)) {
            select.value = lockedIdKey;
          }

          confirmBanner = el("s-banner", {
            heading: numberObj.number,
            tone: "success",
            textContent: "This number will be assigned to your plan.",
          });
          stack.appendChild(confirmBanner);
        } else {
          resetNumberSelectAfterFailedLock(e.target);
          const msg = result.poolEmpty
            ? "No numbers are available right now. Please try again in a moment."
            : "Could not reserve a number. Please choose again or retry.";
          errorBanner = el("s-banner", {
            heading: "Could not reserve number",
            tone: "critical",
            textContent: msg,
          });
          stack.appendChild(errorBanner);
        }
      } catch {
        if (opSeq === numberPoolLockOpSeq) {
          resetNumberSelectAfterFailedLock(e.target);
          errorBanner = el("s-banner", {
            heading: "Could not reserve number",
            tone: "critical",
            textContent:
              "Something went wrong while reserving your number. Please try again.",
          });
          stack.appendChild(errorBanner);
        }
      } finally {
        formState.numberPoolLocking = false;
        select.disabled = false;
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
      renderNewNumberFields(container, baseUrl);
    });
    stack.appendChild(retryBtn);
  }
}
