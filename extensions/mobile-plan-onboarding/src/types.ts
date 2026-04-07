/** Shopify checkout line item (subset of fields used by this extension). */
export interface CheckoutLine {
  id: string;
  quantity?: number;
  merchandise?: {
    id?: string;
    title?: string;
    product?: {
      id?: string;
      title?: string;
      productType?: string;
    };
  };
  cost?: {
    totalAmount?: {
      amount?: string;
      currencyCode?: string;
    };
  };
}

/** A number returned by the number pool API. */
export interface PoolNumber {
  id: string | number;
  number: string;
}

/** Result of attempting to lock a number from the pool. */
export type LockResult =
  | { ok: true; number: PoolNumber; lockId: string }
  | { ok: false; poolEmpty?: boolean; failed?: boolean; exhausted?: boolean; status?: number };

/** Per-plan pricing details resolved from metafields. */
export interface PlanPricing {
  line: CheckoutLine;
  title: string;
  monthlyPrice: number;
  oneTimePrice: number;
}

/** Aggregated subscription pricing. */
export interface SubscriptionPricingDetails {
  monthlyTotal: number;
  oneTimeTotal: number;
  planNames: string[];
  anyError: string | null;
  plans: PlanPricing[];
}

/**
 * Minimal typing for the global `shopify` object available in checkout UI extensions.
 * Extend as needed; Shopify does not ship complete types for the imperative API.
 */
export interface ShopifyGlobal {
  lines: { current: CheckoutLine[]; subscribe: (cb: () => void) => () => void };
  cost?: { current?: { totalAmount?: { currencyCode?: string } } };
  checkoutToken?: { current?: string; subscribe?: (cb: () => void) => () => void };
  sessionToken: { get: () => Promise<string> };
  buyerJourney?: {
    completed?: { current?: boolean; subscribe?: (cb: (v: boolean) => void) => () => void };
    activeStep?: { current?: { handle?: string } };
    intercept?: (cb: (opts: { canBlockProgress: boolean }) => InterceptResult) => void;
  };
  appMetafields?: { current?: AppMetafieldEntry[] };
  applyAttributeChange: (change: { type: string; key: string; value: string }) => Promise<void>;
  applyCartLinesChange: (change: CartLineChange) => Promise<{ type?: string; message?: string }>;
  toast: { show: (msg: string) => void };
  query: (query: string, opts?: { variables?: Record<string, unknown>; version?: string }) => Promise<QueryResult>;
}

export interface InterceptResult {
  behavior: "allow" | "block";
  reason?: string;
  perform: (result?: { behavior?: string }) => void;
}

export interface AppMetafieldEntry {
  metafield?: { namespace?: string; key?: string; value?: string };
  target?: { type?: string; id?: string };
}

export type CartLineChange =
  | { type: "updateCartLine"; id: string; quantity: number }
  | { type: "removeCartLine"; id: string; quantity: number };

export interface QueryResult {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

declare global {
  // eslint-disable-next-line no-var
  var shopify: ShopifyGlobal;
}
