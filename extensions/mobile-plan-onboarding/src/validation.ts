import { formState } from "./formState.js";

export function getValidationErrors(): string[] {
  const errors: string[] = [];

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
export function formatValidationBannerText(errors: string[]): string {
  if (!errors?.length) return "";
  return errors.join(" \u00b7 ");
}

export function getBuyerJourneyStepHandle(): string | undefined {
  return shopify.buyerJourney?.activeStep?.current?.handle;
}

/**
 * `buyerJourney.intercept` runs on many progress evaluations, not only on Pay.
 * Defer blocking until it looks like a real submit attempt.
 */
export function shouldDeferMobilePlanValidation(
  interceptRun: number,
  stepHandle: string | undefined,
): boolean {
  if (
    stepHandle === "information" ||
    stepHandle === "shipping" ||
    stepHandle === "cart"
  ) {
    return true;
  }
  if (
    interceptRun === 1 &&
    (stepHandle === "checkout" || stepHandle === "unknown" || stepHandle == null)
  ) {
    return true;
  }
  return false;
}
