# Deployment & configuration

## Docker (on-prem, certbot-central TLS)

See **`docs/DOCKER.md`** for `docker compose` with nginx and the shared `certbot-central-certs` volume.

## Shopify app (Remix backend)

1. **App URL & OAuth redirects**  
   Replace placeholders in the Partner Dashboard (and `shopify.app.toml` after `shopify app config link` / deploy):
   - `application_url` must be your production app origin (e.g. `https://your-app.example.com`).
   - **Allowed redirection URL(s)** must include `{appUrl}/auth/callback` (or your `authPathPrefix` + callback), matching `SHOPIFY_APP_URL` in production.

2. **Environment variables** (see `.env.example`)
   - `SHOPIFY_APP_URL` — public URL of the Remix app (no trailing slash).
   - `SCOPES` — comma-separated; must match `[access_scopes]` in `shopify.app.toml` after deploy.
   - `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` — from Partner Dashboard.

3. **Access scopes**  
   `shopify.app.toml` declares scopes used at install time. Keep them in sync with `SCOPES` and the template’s Admin API usage (e.g. product mutations need `write_products`).

4. **Webhooks**  
   Subscriptions are declared in `shopify.app.toml`. `api_version` should stay aligned with your Admin API usage (`app/shopify.server.ts` → `ApiVersion`).

## Checkout UI extension

- **Dev vs editor (“duplicate” block)** — While `shopify app dev` runs, you may see the block once in a **dev/preview** area and once in the **section you placed in Customize checkout**. Stopping `app dev` removes the dev-side copy; the editor placement remains. See **`docs/CHECKOUT_DEV.md`**.
- **Checkout extensibility / Plus** — UI extensions in checkout require a store with the right plan and checkout customization enabled.
- **Storefront API — product metafields** — For `custom.monthly_price` to load in the checkout block (`monthlyPricing.js` / `Checkout.jsx`), enable **Storefront API** read access on that metafield definition in **Settings → Custom data → Products**.
- **`shopify.query()` version** — Checkout extensions only support Storefront API versions up to **`2025-10`** in the `version` option. The pricing summary uses `version: '2025-10'` explicitly so queries work even when `api_version` in `shopify.extension.toml` is newer (e.g. `2026-01`).
- **`[[extensions.metafields]]`** — Declaring `custom.monthly_price` in `shopify.extension.toml` preloads metafields for checkout and feeds `shopify.appMetafields`.
- **Online Store publication** — The Storefront API only returns products that are available to the storefront. If `product` queries return `null`, open the product in Admin → **Publishing** (or **Sales channels**) and ensure **Online Store** is enabled.
- **Monthly price (right column)** — In **Customize checkout**, add the **Mobile Plan Order Summary** app block and drag it into the **order summary** column. Details: **`docs/RIGHT_COLUMN_CHECKOUT.md`**. Optional left fallback: **`docs/ORDER_SUMMARY_STATIC.md`**.

## Data & privacy

- Cart attributes used for mobile onboarding may contain personal data; document retention and use in your privacy policy and merchant-facing materials.
