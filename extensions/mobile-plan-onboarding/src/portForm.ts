import { el } from "./polarisDom.js";
import { formState, queueAttributeChange, touchFieldInteraction } from "./formState.js";
import { applyChoiceCardAppearance, resolveBinaryChoiceFromEvent, formatSwissPhoneNumber } from "./uiHelpers.js";

function mountTerminationSelector(stack: HTMLElement): void {
  stack.appendChild(
    el("s-text", { type: "strong", textContent: "Termination" }),
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

  const asapCell = el("s-grid-item", { minInlineSize: "0", overflow: "hidden" });
  asapCell.appendChild(asapCard);
  const eocCell = el("s-grid-item", { minInlineSize: "0", overflow: "hidden" });
  eocCell.appendChild(eocCard);
  termGrid.appendChild(asapCell);
  termGrid.appendChild(eocCell);
  stack.appendChild(termGrid);

  function updateTerminationCards(): void {
    applyChoiceCardAppearance(asapCard, formState.termination === "asap");
    applyChoiceCardAppearance(eocCard, formState.termination === "end_of_contract");
  }

  termGrid.addEventListener("click", (e) => {
    const picked = resolveBinaryChoiceFromEvent(
      e,
      asapCard,
      eocCard,
      "asap" as const,
      "end_of_contract" as const,
    );
    if (!picked) return;
    e.preventDefault();
    touchFieldInteraction();
    formState.termination = picked;
    updateTerminationCards();
    queueAttributeChange("mobile_port_termination", picked);
  });
}

export function renderPortFields(container: HTMLElement): void {
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
    const target = e.target as HTMLInputElement;
    const masked = formatSwissPhoneNumber(target.value || "");
    target.value = masked;
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
    formState.portConsent = !!(e.target as HTMLInputElement).checked;
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
