/** Mutable form state shared across modules. */
export const formState = {
  choice: "" as "" | "yes" | "no",
  portNumber: "",
  termination: "" as "" | "asap" | "end_of_contract",
  portConsent: false,
  selectedNumberId: "",
  numberPoolSessionIdForApi: "",
  numberPoolLockId: "",
  numberPoolLockedNumberId: "",
  numberPoolLocking: false,
};

/**
 * Bumped when leaving "new number" mode, clearing the select, or starting
 * a new lock -- stale async completions must not touch formState.
 */
export let numberPoolLockOpSeq = 0;

export function bumpLockOpSeq(): number {
  return ++numberPoolLockOpSeq;
}

// --- Batched attribute changes ---

const pendingAttributes: Record<string, string> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function queueAttributeChange(key: string, value: string): void {
  pendingAttributes[key] = value;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushAttributes, 1500);
}

async function flushAttributes(): Promise<void> {
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

// --- Validation banner suppression ---

let suppressValidationBannerUntilMs = 0;

export function touchChoiceInteraction(): void {
  suppressValidationBannerUntilMs = Date.now() + 4500;
}

export function touchFieldInteraction(): void {
  suppressValidationBannerUntilMs = Date.now() + 900;
}

export function shouldShowValidationBannerInPerform(): boolean {
  return Date.now() >= suppressValidationBannerUntilMs;
}
