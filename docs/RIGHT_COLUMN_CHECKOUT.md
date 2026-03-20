# Monthly price in the **order summary (right side)**

## Recommended approach: `purchase.checkout.block.render` (merchant placement)

Shopify’s docs: **block** extensions are **not** tied to a single core feature — merchants use **Settings → Checkout → Customize** to **add the app block** and **drag it** into checkout, **including the order summary area**.

So the reliable way to get the recurring line next to Subtotal / Total is:

1. Deploy the app (includes extension **`Mobile Plan Order Summary`** — `extensions/mobile-plan-order-summary/`).
2. In the store: **Settings → Checkout → Customize checkout**.
3. Click **Add app block** (bottom of the editor) and choose **Mobile Plan Order Summary** (or the name shown for handle `mobile-plan-order-summary`).
4. **Drag** that block into the **order summary** column (same area as line items / discounts / totals).  
   - Default placement in `shopify.extension.toml` is **`PAYMENT4`** (near payment / totals); you can move it.
5. **Save**.

Preview with a cart URL, e.g. add `?placement-reference=PAYMENT4` to test placement ([test checkout UI extensions](https://shopify.dev/docs/apps/build/checkout/test-checkout-ui-extensions)).

### Two extensions from this app

| Extension | Target | Purpose |
|-----------|--------|---------|
| **Mobile Plan Onboarding** | `purchase.checkout.block.render` | Contact / onboarding form (number choice, etc.). May still include a **fallback** monthly row at the top. |
| **Mobile Plan Order Summary** | `purchase.checkout.block.render` | **Only** the monthly recurring **CHF … /mo** row — meant to be placed in the **summary** column. |

If you **only** want the **monthly price on the right**, add **Order Summary** block there and **remove** the `monthlyHost` / `mountOrderSummaryMonthlyPricing` block from `Checkout.jsx` in the onboarding extension to avoid duplicates.

---

## Static targets (optional / advanced)

These can work in some stores but often **do not mount** depending on checkout layout:

- `purchase.checkout.reductions.render-before` / `render-after`
- `purchase.checkout.cart-line-list.render-after`
- `purchase.checkout.cart-line-item.render-after`

This repo **no longer** ships those in the **order-summary** extension; the **block** path above matches Shopify’s documented “flexible placement” model.

---

## Capabilities (align with Shopify docs)

In `shopify.extension.toml`:

- **`api_access = true`** — Storefront API from checkout (`shopify.query` for metafields).
- **`network_access = true`** — External HTTP; ensure **Partner Dashboard → App → API access** allows **network access in checkout UI extensions** if publishing fails validation.

---

## If the block still doesn’t show

- Confirm **Shopify Plus** and checkout customization.
- **Redeploy** after `shopify.extension.toml` changes.
- In the editor, confirm **two** app blocks exist for this app (Onboarding + Order Summary) if you use both.
- Use DevTools → **Sources** → find sandbox scripts for `mobile-plan-order-summary` / `purchase.checkout.block.render`.

---

## Old vs new config names

The docs you may have seen (`shopify.ui.extension.toml`, `extension_points`, `shopify.extend(...)`) are **legacy** patterns. This app uses **`shopify.extension.toml`** + **`[[extensions.targeting]]`** + **`export default function()`** entry modules, which matches **current** Shopify CLI (2026–01).
