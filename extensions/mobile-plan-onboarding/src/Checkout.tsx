import "@shopify/ui-extensions/preact";

import { el } from "./polarisDom.js";
import { getSubscriptionLines } from "./subscriptionLines.js";
import {
  getSubscriptionPricingDetails,
  mountOrderSummaryMonthlyPricing,
} from "./monthlyPricing.js";
import {
  formState,
  bumpLockOpSeq,
  queueAttributeChange,
  touchChoiceInteraction,
  shouldShowValidationBannerInPerform,
} from "./formState.js";
import { setApiOrigin, releaseNumberPoolLock } from "./numberPool.js";
import {
  getValidationErrors,
  formatValidationBannerText,
  getBuyerJourneyStepHandle,
  shouldDeferMobilePlanValidation,
} from "./validation.js";
import {
  showBanner,
  applyChoiceCardAppearance,
  resolveBinaryChoiceFromEvent,
  getPlanTitle,
  getComparablePlanPrice,
  applyCartLineChange,
} from "./uiHelpers.js";
import { renderPortFields } from "./portForm.js";
import { renderNewNumberFields } from "./newNumberForm.js";

/**
 * Resolve the numbers API origin from extension settings, falling back to
 * the application_url in shopify.app.toml (embedded in the checkout context).
 */
function resolveApiOrigin(): string {
  const settings = (shopify as unknown as Record<string, unknown>).settings as
    | { current?: Record<string, unknown> }
    | undefined;
  const fromSettings = settings?.current?.numbers_api_origin;
  if (typeof fromSettings === "string" && fromSettings.trim()) {
    return fromSettings.trim();
  }
  // Fallback: use extension.origin which equals the app's application_url
  const ext = (shopify as unknown as Record<string, unknown>).extension as
    | { origin?: string }
    | undefined;
  if (ext?.origin) return ext.origin;
  return "";
}

function renderPricingSummary(host: HTMLElement): void {
  const currentPlans = getSubscriptionLines(shopify.lines.current);
  if (currentPlans.length === 0) {
    host.replaceChildren();
    return;
  }
  mountOrderSummaryMonthlyPricing(host, currentPlans);
}

async function validateSubscriptionCart(
  subscriptionLines: ReturnType<typeof getSubscriptionLines>,
  bannerHost: HTMLElement,
  monthlyHost: HTMLElement,
): Promise<void> {
  bannerHost.replaceChildren();
  const messages: string[] = [];

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
        const removedTitles = removePlans.map((p) => `"${p.title}"`).join(", ");
        messages.push(
          `Only one mobile plan is allowed. Kept "${keepPlan.title}" and removed ${removedTitles}.`,
        );
      }
    }

    renderPricingSummary(monthlyHost);

    if (messages.length > 0) {
      showBanner(bannerHost, "info", "Mobile plan updated", messages.join(" "));
    }
  } catch (error) {
    showBanner(
      bannerHost,
      "warning",
      "Mobile plan validation",
      String((error as Error)?.message || error),
    );
  }
}

export default function (): void {
  const origin = resolveApiOrigin();
  setApiOrigin(origin);

  const lines = shopify.lines.current;
  const subscriptionLines = getSubscriptionLines(lines);
  const hasMobilePlan = subscriptionLines.length > 0;
  if (!hasMobilePlan) return;

  const section = el("s-section", { heading: "Mobile Plan Setup" });
  const stack = el("s-stack", { gap: "base" });

  const formValidationHost = el("s-stack", { gap: "small" });
  stack.appendChild(formValidationHost);

  const cartValidationHost = el("s-stack", { gap: "small" });
  stack.appendChild(cartValidationHost);

  const monthlyHost = el("s-stack", { gap: "small" });
  stack.appendChild(monthlyHost);
  renderPricingSummary(monthlyHost);
  void validateSubscriptionCart(subscriptionLines, cartValidationHost, monthlyHost);

  const linesSignal = shopify.lines;
  if (linesSignal && typeof linesSignal.subscribe === "function") {
    linesSignal.subscribe(() => renderPricingSummary(monthlyHost));
  }

  // --- Buyer journey intercept ---
  if (shopify.buyerJourney?.intercept) {
    let buyerJourneyInterceptRun = 0;
    void shopify.buyerJourney.intercept(({ canBlockProgress }) => {
      buyerJourneyInterceptRun += 1;
      const stepHandle = getBuyerJourneyStepHandle();
      const errors = getValidationErrors();

      if (shouldDeferMobilePlanValidation(buyerJourneyInterceptRun, stepHandle)) {
        return { behavior: "allow", perform: () => {} };
      }

      if (canBlockProgress && errors.length > 0) {
        return {
          behavior: "block",
          reason: "InvalidExtensionState",
          perform: () => {
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

  // Release lock on order completion
  const journeyCompleted = shopify.buyerJourney?.completed;
  if (journeyCompleted?.subscribe) {
    journeyCompleted.subscribe((completed) => {
      if (completed) void releaseNumberPoolLock({ clearSelection: false });
    });
  }

  // --- Choice UI: port vs new number ---
  stack.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent:
        "Set up your mobile plan below. Choose to keep your current number or pick a new one.",
    }),
  );

  stack.appendChild(
    el("s-text", { type: "strong", textContent: "Port your number?" }),
  );

  const choiceGrid = el("s-grid", {
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "base",
    inlineSize: "100%",
  });

  const yesOption = el("s-clickable", {
    type: "button",
    id: "mobile-plan-choice-yes",
    accessibilityLabel: "Port your existing number",
    inlineSize: "100%",
    maxInlineSize: "100%",
  });
  applyChoiceCardAppearance(yesOption, false);
  const yesInner = el("s-stack", { direction: "block", gap: "small" });
  yesInner.appendChild(el("s-text", { type: "strong", textContent: "Yes" }));
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
  noInner.appendChild(el("s-text", { type: "strong", textContent: "No" }));
  noInner.appendChild(
    el("s-paragraph", {
      color: "subdued",
      textContent: "Choose a brand new Swiss mobile number.",
    }),
  );
  noOption.appendChild(noInner);

  const yesCell = el("s-grid-item", { minInlineSize: "0", overflow: "hidden" });
  yesCell.appendChild(yesOption);
  const noCell = el("s-grid-item", { minInlineSize: "0", overflow: "hidden" });
  noCell.appendChild(noOption);
  choiceGrid.appendChild(yesCell);
  choiceGrid.appendChild(noCell);
  stack.appendChild(choiceGrid);

  const dynamicArea = el("s-stack", { gap: "base" });
  stack.appendChild(dynamicArea);

  function updateChoiceButtons(): void {
    applyChoiceCardAppearance(yesOption, formState.choice === "yes");
    applyChoiceCardAppearance(noOption, formState.choice === "no");
  }

  function handleChoiceChange(value: "yes" | "no"): void {
    touchChoiceInteraction();
    const prevChoice = formState.choice;
    dynamicArea.replaceChildren();
    formValidationHost.replaceChildren();
    if (prevChoice === "no" && value !== "no") {
      bumpLockOpSeq();
      void releaseNumberPoolLock({ clearSelection: true });
    }
    formState.choice = value;
    formState.portNumber = "";
    formState.termination = "";
    formState.portConsent = false;
    formState.selectedNumberId = "";
    formState.numberPoolLocking = false;
    updateChoiceButtons();

    queueAttributeChange("mobile_number_choice", value === "yes" ? "port" : "new");

    if (value === "yes") {
      renderPortFields(dynamicArea);
    } else {
      void renderNewNumberFields(dynamicArea);
    }
  }

  choiceGrid.addEventListener("click", (e) => {
    const choice = resolveBinaryChoiceFromEvent(
      e,
      yesOption,
      noOption,
      "yes" as const,
      "no" as const,
    );
    if (choice) {
      e.preventDefault();
      handleChoiceChange(choice);
    }
  });

  section.appendChild(stack);
  document.body.appendChild(section);
}
