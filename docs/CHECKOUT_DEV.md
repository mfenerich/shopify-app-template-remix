# Checkout UI extension & `shopify app dev`

## Why checkout still works after you stop `shopify app dev`

Your extension is **installed** on the shop and **deployed** (`shopify app deploy`). Shopify serves the **bundled extension from Shopify’s CDN**, so checkout keeps working **without** your laptop or the CLI tunnel.

- **`shopify app dev`** — Hot reload / local bundle while the session runs (optional for day-to-day buying on the dev store once a version is deployed).
- **Stopped dev** — Checkout uses the **last deployed** app version (e.g. the **Active** version on the Partner Dashboard), not your local machine.

So: block still visible after killing dev is **normal**, not a ghost session.

## Partner Dashboard: “no activity today”

The app **Overview** mostly shows **releases** (each `shopify app deploy`), **API health**, and **webhooks** — **not** “someone used checkout today.”

- **Running only `shopify app dev`** does **not** create a new **version** on the dashboard. Your **Active** version (e.g. `poc-nextphone-onboarding-30`) stays whatever you last **deployed**.
- **Webhook errors** (e.g. 7 in the last 7 days) often happen when Shopify tries to call your app while **`app dev` is off** (tunnel down) or after **uninstall** — that’s normal during local dev; fix production URLs when you host the app.

## After uninstall: monthly price / extension “gone”

Uninstalling the app **removes** it from the store. Checkout UI extensions only run when the app is **installed** again.

1. **Reinstall** — From the terminal where `shopify app dev` runs, use the **preview / install** URL and complete OAuth on your **dev store** (or install from the Partner Dashboard **Test your app** flow).
2. **Re-add checkout blocks** — Go to **Settings → Checkout → Customize**, click **Add app block**, and add **Mobile Plan Onboarding** again if it disappeared. Uninstall often clears app blocks from the saved checkout layout.
3. **Cart with the mobile plan** — The **monthly recurring price** is rendered **inside the Mobile Plan block** (`Checkout.jsx`). It only shows if the cart has a matching line: **product type** `Mobile-subscription` (case-insensitive), or product/variant title containing **“mobile plan”** as a fallback. Add that product again and go to checkout.
4. **Deploy vs dev** — With **`shopify app dev`**, the store should use your **local** extension bundle while the session is active. If something still looks stale, run **`shopify app deploy`** once so the **Active** version matches your code, then retest.

## Seeing the block twice while `shopify app dev` is running

It’s common to see **two** instances of the same checkout UI extension while developing:

1. **A “floating” / full-width / top-of-page copy** — Often from how the **dev session** surfaces your extension (CLI preview, development bundle, or a **default placement** for the block target) so hot reload works.
2. **The copy in the place you chose in the checkout editor** — **Settings → Checkout → Customize → Add app block** and drag the block into a **section** (e.g. Information / Delivery). That placement is **saved on the shop** and uses your **development** extension while `app dev` is connected.

When you **stop** `shopify app dev`, the **tunnel / dev preview** side goes away, so the **top / odd** copy usually **disappears**. The version that stays is the one **wired through checkout customization**, loading the **last deployed** extension build from Shopify’s CDN (until you run `app dev` again).

So: **duplicate while dev is on** + **single correct placement when dev is off** often means **dev preview + saved checkout placement**, not necessarily a bug in your JSX/DOM code.

## Things to verify

1. **Only one app block in the editor**  
   In **Customize checkout**, confirm **Mobile Plan Onboarding** is **not** added twice (two different placements). Remove duplicates if you see two identical blocks in the preview.

2. **Which URL you open**  
   Prefer the checkout preview from **Admin → Settings → Checkout → Customize** (or the cart URL your CLI suggests with `--checkout-cart-url`). Avoid mixing an old **CLI “preview”** tab and the **editor preview** if both load the same extension.

3. **Block placement preview**  
   For `purchase.checkout.block.render`, you can append a **placement reference** to the checkout URL to test where the block would sit, e.g. `?placement-reference=INFORMATION1` (see [Test checkout UI extensions](https://shopify.dev/docs/apps/build/checkout/test-checkout-ui-extensions)).

## Monthly price placement

- **Right column:** Add the **Mobile Plan Order Summary** block in **Customize checkout** and drag it into the **order summary** area — **`docs/RIGHT_COLUMN_CHECKOUT.md`** (use `?placement-reference=PAYMENT4` to preview default slot).
- **Left fallback:** The same line may appear at the top of **Mobile Plan Setup** — **`docs/ORDER_SUMMARY_STATIC.md`**.

## If something still looks wrong

- Inspect the checkout page in the browser: checkout extensions usually run in **separate iframes / shadow roots**. Two **different** rectangles often mean **two different mount points** (preview vs editor), not `appendChild` running twice in the same tree.
- After changing targets or `shopify.extension.toml`, run **`shopify app deploy`** and re-test a **fresh checkout** session.
