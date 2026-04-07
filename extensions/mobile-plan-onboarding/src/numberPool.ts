import type { PoolNumber, LockResult } from "./types.js";
import { formState, queueAttributeChange } from "./formState.js";

let apiOrigin = "";

/** Set the numbers API origin (called once from Checkout entry). */
export function setApiOrigin(origin: string): void {
  apiOrigin = origin.replace(/\/$/, "");
}

export function getApiOrigin(): string {
  return apiOrigin;
}

// --- Session ID ---

function getNumberPoolSessionIdFallback(): string {
  return `np_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Resolves a session id for GET /available and matching POST /lock.
 * Always prefers the current checkout token so a new load uses an up-to-date id.
 */
export async function resolveNumberPoolSessionId(): Promise<string> {
  const immediate = shopify.checkoutToken?.current;
  if (immediate) return String(immediate);

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | undefined;

    const finish = (id: string) => {
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
    timer = setTimeout(() => finish(getNumberPoolSessionIdFallback()), 3000);
  });
}

// --- API calls ---

export async function fetchNumberPoolAvailable(
  sessionId: string,
): Promise<{ numbers: PoolNumber[]; pool_exhausted?: boolean; high_demand?: boolean }> {
  const token = await shopify.sessionToken.get();
  const u = new URL(`${apiOrigin}/api/numbers/available`);
  u.searchParams.set("sessionId", sessionId);
  const response = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error("available_failed");
  return response.json();
}

export async function postNumberPoolLock(
  sessionId: string,
  numberId: string | number,
): Promise<Response> {
  const token = await shopify.sessionToken.get();
  return fetch(`${apiOrigin}/api/numbers/lock`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ numberId, sessionId }),
  });
}

export async function postNumberPoolUnlock(
  sessionId: string,
  numberId: string | number,
  lockId: string,
): Promise<Response> {
  const token = await shopify.sessionToken.get();
  return fetch(`${apiOrigin}/api/numbers/unlock`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ numberId, lockId, sessionId }),
  });
}

// --- Lock management ---

/** DOM `e.target.value` is always a string; API `id` may be number or string. */
export function numberPoolIdKey(id: string | number): string {
  return String(id);
}

/**
 * Releases a hard lock (abandon, order complete, or before a new lock).
 * @param clearSelection - clear cart attributes when buyer leaves "new number" flow
 */
export async function releaseNumberPoolLock(
  options: { clearSelection?: boolean } = {},
): Promise<void> {
  const clearSelection = options.clearSelection !== false;
  const { numberPoolLockId: lockId, numberPoolLockedNumberId: numberId, numberPoolSessionIdForApi: sessionId } = formState;

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
    await postNumberPoolUnlock(sessionId, numberId, lockId);
  } catch {
    /* best-effort; 404 = already released */
  }
}

/**
 * Attempts to lock a number, trying the selected one first, then falling back
 * through the list. If all 409, refreshes the pool and retries.
 */
export async function lockNumberFromPool(
  sessionId: string,
  numbers: PoolNumber[],
  selectedId: string | number,
): Promise<LockResult> {
  const selectedKey = numberPoolIdKey(selectedId);
  const startIdx = numbers.findIndex(
    (n) => numberPoolIdKey(n.id) === selectedKey,
  );
  const ordered =
    startIdx === -1
      ? numbers
      : [...numbers.slice(startIdx), ...numbers.slice(0, startIdx)];

  const tryList = async (list: PoolNumber[]): Promise<LockResult> => {
    for (const num of list) {
      const res = await postNumberPoolLock(sessionId, num.id);
      if (res.ok) {
        const data = await res.json();
        const lockId = data.lockId as string | undefined;
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

  const fresh = await fetchNumberPoolAvailable(sessionId);
  const freshNumbers = fresh.numbers || [];
  if (fresh.pool_exhausted || freshNumbers.length === 0) {
    return { ok: false, poolEmpty: true };
  }
  result = await tryList(freshNumbers);
  if (result.ok) return result;
  return { ok: false, failed: true };
}
