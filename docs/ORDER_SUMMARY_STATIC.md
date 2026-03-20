# Monthly price: order summary (right) + optional fallback (left)

## Primary: **block** in the order summary column

Per [Checkout UI extension targets](https://shopify.dev/docs/api/checkout-ui-extensions/latest/extension-targets-overview), **`purchase.checkout.block.render`** lets merchants **place** UI in checkout **including the order summary area** via the checkout editor.

This app ships a dedicated extension **`Mobile Plan Order Summary`** (`handle`: `mobile-plan-order-summary`) whose **only** job is the recurring **CHF … /mo** row. Default placement is **`PAYMENT4`** (near payment / totals); merchants can drag it.

**Steps:** **`docs/RIGHT_COLUMN_CHECKOUT.md`**

## Fallback: Mobile Plan Setup (left)

`Checkout.jsx` can still show the same monthly row at the **top of Mobile Plan Setup** so buyers see the amount even before the Order Summary block is added.

If you place **both** the onboarding block and the **Order Summary** block and see **duplicate** monthly lines, remove the `monthlyHost` / `mountOrderSummaryMonthlyPricing` section from `Checkout.jsx`.

## Static targets (not used in this repo for order summary)

`reductions.*` and `cart-line-list` static targets are valid for the sidebar but often **do not mount** on a given store. The **block** approach above is the one aligned with Shopify’s “merchant chooses placement” model.
