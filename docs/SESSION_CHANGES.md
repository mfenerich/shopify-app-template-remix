# Session changes — 2026-04-07

Full record of every change made to the project in this session, including motivation, what was done, and any known follow-up items.

---

## 1. Project assessment

Before touching any code, the project was audited for production readiness. Issues found:

| Issue | Severity |
|-------|----------|
| Hardcoded staging URL in extension code | High |
| No tests at all | High |
| Template boilerplate left in (snowboard demo) | Medium |
| 1048-line JS monolith — no type safety | Medium |
| Scopes over-permissioned (`write_products` no longer needed) | Medium |
| `.DS_Store` tracked in subdirectories | Low |
| `.env.example` missing `NUMBERS_*` variables | Low |
| Empty `mobile-plan-order-summary` extension directory | Low |
| No CI/CD pipeline | Medium |
| README was the stock Shopify template | Medium |

---

## 2. Cleanup

### 2.1 `.gitignore` — nested `.DS_Store`

**File:** `.gitignore`

**Change:** Added `**/.DS_Store` alongside the existing `.DS_Store` entry.

**Why:** The top-level rule only ignores `.DS_Store` at the repo root. Nested copies (found in `prisma/`, `docker/`, `extensions/`) were being created by macOS and could be tracked on future commits.

### 2.2 Removed template boilerplate pages

**Files removed:**
- `app/routes/app.additional.tsx` — stock "Additional page" with instructions for adding nav links
- `app/routes/app.tsx` — removed the "Additional page" `<Link>` from `<NavMenu>`

**Why:** Both were leftover from `shopify app init`. They served as an example, not as actual app functionality.

### 2.3 Removed empty extension

**Directory removed:** `extensions/mobile-plan-order-summary/`

**Why:** The directory existed with `src/` and `dist/` subdirectories but contained zero source files, no `package.json`, and no TOML. It was never implemented and was confusing documentation references to a non-existent extension.

---

## 3. App dashboard page rewrite

**File:** `app/routes/app._index.tsx`

**Before:** Stock Shopify template showing a "Congrats on creating a new Shopify app 🎉" heading with a button to generate random-colour snowboard products via GraphQL mutation.

**After:** Real dashboard for this app showing:
- A description of the checkout extension's purpose
- A setup checklist (metafield Storefront API access, product type, Online Store publication, checkout block)
- A "Stack" card (Remix, Prisma/SQLite, Polaris)
- A deep link to `shopify:admin/settings/checkout`

**Why:** The old page was actively misleading for anyone opening the admin app. The new one reflects what the app actually does and guides the merchant through setup.

---

## 4. Extension: JS → TypeScript

**Before:** All extension source files were plain JavaScript (`.js` / `.jsx`) with no type annotations.

**After:** All extension source files are TypeScript (`.ts` / `.tsx`) with strict types.

### New files added

| File | Description |
|------|-------------|
| `extensions/mobile-plan-onboarding/tsconfig.json` | TypeScript config for the extension workspace |
| `extensions/mobile-plan-onboarding/src/types.ts` | Shared type definitions (see §5 below) |

### Files converted

| Old | New |
|-----|-----|
| `src/Checkout.jsx` | `src/Checkout.tsx` |
| `src/monthlyPricing.js` | `src/monthlyPricing.ts` |
| `src/polarisDom.js` | `src/polarisDom.ts` |
| `src/subscriptionLines.js` | `src/subscriptionLines.ts` |

**Why:** The extension contains the most complex business logic in the project (number pool locking, form validation, metafield resolution fallback chain). Plain JS meant no IDE autocomplete, no compile-time safety, and silent bugs from typos in property names. TypeScript makes refactoring safe and documents intent at the call site.

### Known pre-existing TypeScript issue (not introduced here)

`app/shopify.server.ts` line 24 has a type error from a version mismatch between `@shopify/shopify-api` (top-level, used by `@shopify/shopify-app-session-storage-prisma`) and the version bundled inside `@shopify/shopify-app-remix`. This error existed before this session and is caused by Shopify's own nested dependency structure. It does not affect runtime behaviour. The `typecheck` script targets the extension only; `typecheck:all` includes the app-level check for when this is eventually resolved by upgrading.

---

## 5. Extension: monolith split into modules

**Before:** `Checkout.jsx` — 1048 lines handling everything in one file.

**After:** 11 focused modules, each with a single responsibility.

### Module map

```
src/
  Checkout.tsx          Entry point + orchestration (~175 lines)
  types.ts              Shared TypeScript interfaces and global declarations
  formState.ts          Mutable form state + batched cart attribute writes
  validation.ts         Form validation rules + buyer journey helpers
  numberPool.ts         Number pool API calls (available/lock/unlock) + lock management
  portForm.ts           "Port your number" form rendering
  newNumberForm.ts      "Choose a new number" picker rendering
  monthlyPricing.ts     Recurring price display from Storefront API metafields
  subscriptionLines.ts  Filter cart lines to mobile subscription products
  uiHelpers.ts          Shared UI: card appearance, banners, phone formatting, DOM path helpers
  polarisDom.ts         Type-safe DOM helper for Polaris s-* web components
```

### What each module owns

**`formState.ts`**
- `formState` object (choice, portNumber, termination, portConsent, numberPool fields)
- `numberPoolLockOpSeq` counter + `bumpLockOpSeq()` to invalidate stale async operations
- `queueAttributeChange()` — debounced batch writer for cart attributes (1500 ms window)
- Validation banner suppression timers (`touchChoiceInteraction`, `touchFieldInteraction`, `shouldShowValidationBannerInPerform`)

**`validation.ts`**
- `getValidationErrors()` — returns an array of error strings based on current `formState`
- `formatValidationBannerText()` — joins errors with ` · ` for the in-section banner
- `getBuyerJourneyStepHandle()` — reads current step handle
- `shouldDeferMobilePlanValidation()` — prevents blocking on information/shipping steps and on the first intercept run of single-page checkout

**`numberPool.ts`**
- `setApiOrigin()` / `getApiOrigin()` — configured once from `Checkout.tsx` entry point
- `resolveNumberPoolSessionId()` — prefers `shopify.checkoutToken.current`, falls back to a subscriber with a 3 s timeout, then generates a random fallback ID
- `fetchNumberPoolAvailable()`, `postNumberPoolLock()`, `postNumberPoolUnlock()` — raw API calls with session token auth
- `releaseNumberPoolLock()` — clears state + calls unlock best-effort (404 tolerated)
- `lockNumberFromPool()` — attempts lock starting from selected number, falls back through the list, refreshes pool on full exhaustion

**`uiHelpers.ts`**
- `formatSwissPhoneNumber()` — normalises any input to `+41 XX XXX XX XX` format
- `applyChoiceCardAppearance()` — applies Polaris token-based border/background to clickable cards
- `resolveBinaryChoiceFromEvent()` — uses `composedPath()` to pick the innermost card in click events on shadow DOM trees
- `showBanner()`, `applyCartLineChange()`, `getPlanTitle()`, `getComparablePlanPrice()`

**`portForm.ts`**
- `renderPortFields()` — mounts phone input, termination selector (asap / end_of_contract), consent checkbox

**`newNumberForm.ts`**
- `renderNewNumberFields()` — fetches available numbers, renders `s-select`, handles lock/unlock cycle, shows confirmation and error banners, includes retry button on pool exhaustion or connection error

---

## 6. API origin made configurable

**Before:** `Checkout.jsx` had a hardcoded constant at the top of the file:
```js
const CHECKOUT_NUMBERS_API_ORIGIN = "https://mobile-onboarding-stage.revendo.com:8889";
```
This meant every URL change required a code edit, a build, and a full `shopify app deploy`.

**After:**

**`extensions/mobile-plan-onboarding/shopify.extension.toml`** — added:
```toml
[extensions.settings]

  [[extensions.settings.fields]]
  key = "numbers_api_origin"
  type = "single_line_text_field"
  name = "Numbers API origin"
  description = "Base URL of the Remix app for number pool API calls (e.g. https://mobile-onboarding.example.com). No trailing slash."
```

**`Checkout.tsx`** — `resolveApiOrigin()` reads from `shopify.settings.current.numbers_api_origin` first, then falls back to `shopify.extension.origin` (which equals `application_url` from the app config).

**How to configure:** In the Shopify admin → Settings → Checkout → Customize → click the **Mobile Plan Onboarding** block → set **Numbers API origin** in the settings panel → Save.

---

## 7. `.env.example` and `docker-compose.env.example` updated

**Files:** `.env.example`, `docker-compose.env.example`

**Changes:**
- Added `NUMBERS_FUNCTION_URL` and `NUMBERS_API_KEY` to `.env.example` (they existed in `.env` but not in the example)
- Changed `SCOPES=write_products` → `SCOPES=read_products` in both files (see §9)

---

## 8. Test infrastructure

### Setup

- **Test runner:** [Vitest](https://vitest.dev/) v4
- **Environment:** jsdom (for DOM APIs used by `polarisDom.ts`)
- **Config:** `vitest.config.ts` at project root
- **Script:** `npm test` (run once), `npm run test:watch` (interactive)

### Test files — 42 tests across 5 files

| File | Tests | What is covered |
|------|-------|-----------------|
| `subscriptionLines.test.ts` | 9 | `isMobileSubscriptionLine`: product type exact, case-insensitive, title fallback, merchandise title fallback, rejection of unrelated products, missing merchandise. `getSubscriptionLines`: filtering, null/empty input. |
| `uiHelpers.test.ts` | 10 | `formatSwissPhoneNumber`: full 9-digit, leading-0 strip, `41` prefix strip, `0041` prefix strip, partial inputs (2, 5, 7 digits), empty, non-digit chars, truncation at 9 digits. |
| `monthlyPricing.test.ts` | 7 | `parseMoneyValue`: plain decimal, JSON `amount`, JSON `value`, null/undefined/empty, CHF prefix, comma decimal separator, non-numeric. |
| `validation.test.ts` | 10 | `getValidationErrors`: no choice, completed journey, port flow (missing phone, missing termination, missing consent, all valid), new number flow (no lock, locking in progress, lock present). |
| `polarisDom.test.ts` | 6 | `el()`: tag creation, textContent attr, id attr, string children, element children, null children skip, `__proto__` key ignored, `on*` handler keys ignored. |

### Running

```bash
npm test              # single run
npm run test:watch    # watch mode
```

---

## 9. Shopify scopes corrected

**Files changed:**
- `shopify.app.toml`
- `shopify.app.poc-nextphone-onboarding.toml`
- `app/shopify.server.ts`
- `.env.example`
- `docker-compose.env.example`

**Before:** `scopes = "write_products"` (inherited from the Shopify Remix template which included a product creation demo)

**After:** `scopes = "read_products"`

**Why:** The product creation demo was removed from the admin dashboard. The app's actual function is:
- Checkout UI extension (uses Storefront API — no admin scope needed)
- Number pool API proxy (uses `authenticate.public.checkout` — no product scope needed)
- Session management + webhooks (no product scope needed)

`write_products` gave unnecessary write access to the merchant's product catalogue. `read_products` is the minimal appropriate scope if the dashboard ever needs to query product data via Admin API.

**Migration note:** Stores that have the app installed will be prompted to re-approve the new (reduced) scope on the next admin page load. This is normal and expected for any scope change.

---

## 10. CI/CD — GitHub Actions

**File added:** `.github/workflows/ci.yml`

**Triggers:** push to `main`, pull requests targeting `main`

**Jobs (Node.js 22, ubuntu-latest):**

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with npm cache
3. `npm ci` — clean install from lockfile
4. `npx prisma generate` — required before building
5. `npm run lint` — ESLint
6. `npm run typecheck` — TypeScript check on the extension
7. `npm test` — Vitest (42 tests)
8. `npm run build` — Remix production build

---

## 11. New npm scripts

**File:** `package.json`

| Script | Command | Purpose |
|--------|---------|---------|
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Interactive watch mode |
| `typecheck` | `tsc --noEmit -p extensions/mobile-plan-onboarding/tsconfig.json` | Type-check extension only (clean) |
| `typecheck:all` | `tsc --noEmit && npm run typecheck` | Type-check app + extension (app has pre-existing SDK mismatch error) |

---

## 12. Documentation rewrite

### `README.md`

**Before:** The stock Shopify Remix template README with boilerplate quick-start instructions.

**After:** Project-specific documentation covering:
- Architecture diagram (file tree with descriptions)
- Prerequisites
- Quick start
- Environment variables table (all 7 variables with Required flag and description)
- All npm scripts table
- Checkout extension setup steps
- Product requirements for the extension
- Extension settings table
- Number pool API proxy documentation (3 endpoints)
- Deployment section (Docker + Shopify)
- Database section (SQLite caveat + PostgreSQL migration path)
- Testing section
- CI section
- Links to all docs/ files

### `docs/DEPLOYMENT.md`

Updated the checkout extension bullet to reference the new **Numbers API origin** extension setting instead of the old hardcoded URL approach.

---

## 13. `extensions/mobile-plan-onboarding/shopify.extension.toml`

Full list of changes to this file:

| Field | Before | After |
|-------|--------|-------|
| `module` | `./src/Checkout.jsx` | `./src/Checkout.tsx` |
| `[extensions.settings]` | (absent) | Added with `numbers_api_origin` field |

All other fields unchanged: `api_version`, `uid`, `type`, `name`, `handle`, `[[extensions.targeting]]`, `[[extensions.metafields]]`, `[extensions.capabilities]`.

---

## Known issues / follow-up items

| Item | Notes |
|------|-------|
| Pre-existing TS error in `app/shopify.server.ts` | `PrismaSessionStorage` type mismatch due to `@shopify/shopify-api` being bundled twice (top-level and inside `@shopify/shopify-app-remix`). Fix: align versions via `overrides`/`resolutions` or wait for Shopify to resolve. Does not affect runtime. |
| SQLite in production | Single-instance only. For multi-instance, migrate to PostgreSQL: change `provider` in `prisma/schema.prisma`, update `DATABASE_URL`, run `prisma migrate dev`. |
| `write_products` → `read_products` re-auth | Any store with the app installed will see a re-approval prompt on the next admin load. This is expected and safe — it is a scope reduction. |
| Extension settings require a deploy | The `numbers_api_origin` setting is only available after `npm run deploy`. In local dev (`shopify app dev`), the setting panel may not appear; the fallback to `shopify.extension.origin` is used instead. |
