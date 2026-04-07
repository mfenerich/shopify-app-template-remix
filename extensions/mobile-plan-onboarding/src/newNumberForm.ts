import { el } from "./polarisDom.js";
import {
  formState,
  numberPoolLockOpSeq,
  bumpLockOpSeq,
  queueAttributeChange,
  touchFieldInteraction,
} from "./formState.js";
import {
  resolveNumberPoolSessionId,
  fetchNumberPoolAvailable,
  lockNumberFromPool,
  releaseNumberPoolLock,
  postNumberPoolUnlock,
  numberPoolIdKey,
} from "./numberPool.js";

/** Clears selection so the buyer can pick again. */
function resetNumberSelectAfterFailedLock(select: HTMLElement): void {
  (select as HTMLSelectElement).value = "";
  requestAnimationFrame(() => {
    (select as HTMLSelectElement).value = "";
  });
}

export async function renderNewNumberFields(container: HTMLElement): Promise<void> {
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
    const data = await fetchNumberPoolAvailable(sessionId);
    const numbers = data.numbers || [];

    loadingRow.remove();

    if (data.pool_exhausted || numbers.length === 0) {
      stack.appendChild(
        el("s-banner", {
          heading: "No numbers available right now",
          tone: "warning",
          textContent:
            "The pool is temporarily empty. Browsing sessions expire within a few minutes \u2014 please try again shortly.",
        }),
      );

      const retryBtn = el("s-button", {
        variant: "secondary",
        textContent: "Try again",
      });
      retryBtn.addEventListener("click", () => {
        container.replaceChildren();
        void renderNewNumberFields(container);
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

    const select = el("s-select", { label: "Select number" });
    select.appendChild(
      el("s-option", { value: "", disabled: "", textContent: "Select a number" }),
    );
    for (const num of numbers) {
      select.appendChild(
        el("s-option", { value: num.id, textContent: num.number }),
      );
    }

    let confirmBanner: HTMLElement | null = null;
    let errorBanner: HTMLElement | null = null;

    select.addEventListener("change", async (e) => {
      touchFieldInteraction();
      const selectedId = (e.target as HTMLSelectElement).value;

      if (confirmBanner) {
        confirmBanner.remove();
        confirmBanner = null;
      }
      if (errorBanner) {
        errorBanner.remove();
        errorBanner = null;
      }

      if (!selectedId) {
        bumpLockOpSeq();
        await releaseNumberPoolLock({ clearSelection: true });
        return;
      }

      const opSeq = bumpLockOpSeq();
      formState.numberPoolLocking = true;
      (select as HTMLSelectElement).disabled = true;

      try {
        const lockIdHeldBeforeRelease = formState.numberPoolLockId;
        await releaseNumberPoolLock({ clearSelection: false });

        formState.selectedNumberId = "";
        queueAttributeChange("mobile_selected_number", "");
        queueAttributeChange("mobile_selected_number_id", "");
        queueAttributeChange("mobile_number_lock_id", "");

        const result = await lockNumberFromPool(sessionId, numbers, selectedId);

        if (opSeq !== numberPoolLockOpSeq) {
          if (
            result.ok &&
            result.lockId &&
            result.lockId !== lockIdHeldBeforeRelease
          ) {
            void postNumberPoolUnlock(sessionId, result.number.id, result.lockId);
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
            (select as HTMLSelectElement).value = lockedIdKey;
          }

          confirmBanner = el("s-banner", {
            heading: numberObj.number,
            tone: "success",
            textContent: "This number will be assigned to your plan.",
          });
          stack.appendChild(confirmBanner);
        } else {
          resetNumberSelectAfterFailedLock(e.target as HTMLElement);
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
          resetNumberSelectAfterFailedLock(e.target as HTMLElement);
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
        (select as HTMLSelectElement).disabled = false;
      }
    });

    stack.appendChild(select);
  } catch {
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
      void renderNewNumberFields(container);
    });
    stack.appendChild(retryBtn);
  }
}
