import type { CheckoutLine, CartLineChange } from "./types.js";
import { el } from "./polarisDom.js";

export function getPlanTitle(line: CheckoutLine): string {
  return line.merchandise?.product?.title || line.merchandise?.title || "Mobile plan";
}

export function showBanner(
  container: HTMLElement,
  tone: string,
  heading: string,
  textContent: string,
): void {
  container.replaceChildren(
    el("s-banner", { tone, heading, textContent }),
  );
}

export async function applyCartLineChange(change: CartLineChange): Promise<void> {
  const result = await shopify.applyCartLinesChange(change);
  if (result?.type === "error") {
    throw new Error(result.message || "Unable to update mobile plans.");
  }
}

export function getComparablePlanPrice(plan: { monthlyPrice: number }): number {
  return plan.monthlyPrice || 0;
}

/**
 * Clicks on nested Polaris components often target inner shadow DOM nodes.
 * Use `composedPath()` and stable ids.
 */
function pathIndexOfId(path: EventTarget[], id: string): number {
  if (!id || !path?.length) return -1;
  for (let i = 0; i < path.length; i++) {
    const n = path[i] as HTMLElement;
    if (n?.id === id) return i;
  }
  return -1;
}

function pathIndexOfNode(path: EventTarget[], node: HTMLElement): number {
  if (!node || !path?.length) return -1;
  const idx = path.indexOf(node);
  if (idx !== -1) return idx;
  const id = node.id;
  return id ? pathIndexOfId(path, id) : -1;
}

/** Prefer the card closest to the event target (smaller path index). */
export function resolveBinaryChoiceFromEvent<L, R>(
  event: Event,
  leftNode: HTMLElement,
  rightNode: HTMLElement,
  leftValue: L,
  rightValue: R,
): L | R | null {
  const path =
    typeof (event as { composedPath?: () => EventTarget[] }).composedPath === "function"
      ? (event as { composedPath: () => EventTarget[] }).composedPath()
      : [];
  const li = pathIndexOfNode(path, leftNode);
  const ri = pathIndexOfNode(path, rightNode);
  if (li === -1 && ri === -1) return null;
  if (li !== -1 && ri !== -1) return li <= ri ? leftValue : rightValue;
  if (li !== -1) return leftValue;
  return rightValue;
}

/**
 * Checkout UI extensions only reliably support Polaris `s-*` components.
 */
export function applyChoiceCardAppearance(card: HTMLElement | null, selected: boolean): void {
  if (!card) return;
  (card as unknown as Record<string, unknown>).background = selected ? "subdued" : "base";
  (card as unknown as Record<string, unknown>).border = selected ? "large base solid" : "large-200 base solid";
  (card as unknown as Record<string, unknown>).borderRadius = "large";
  (card as unknown as Record<string, unknown>).padding = "base";
  (card as unknown as Record<string, unknown>).minBlockSize = "large-200";
}

export function formatSwissPhoneNumber(value: string): string {
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
