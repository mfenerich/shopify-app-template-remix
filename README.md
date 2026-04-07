# Mobile Plan Checkout Onboarding

Shopify embedded app with checkout UI extensions for mobile plan onboarding. Customers can port their existing Swiss phone number or choose a new one from a number pool during checkout.

## Architecture

```
app/                    Remix app (Shopify embedded, Polaris UI)
  routes/
    app.tsx             Shell layout + nav
    app._index.tsx      Dashboard / setup checklist
    api.numbers.$segment.tsx  Proxy to number pool Cloud Function
    auth.*/webhooks.*   Shopify OAuth + webhooks
  shopify.server.ts     Shopify app config (scopes, API version, session storage)

extensions/
  mobile-plan-onboarding/   Checkout UI extension (TypeScript)
    src/
      Checkout.tsx      Entry point (orchestration)
      formState.ts      Shared mutable state + attribute batching
      validation.ts     Form validation logic
      numberPool.ts     Number pool API calls + lock management
      portForm.ts       "Port your number" form
      newNumberForm.ts  "Choose a new number" picker
      monthlyPricing.ts Recurring price display from metafields
      subscriptionLines.ts  Line filtering (Mobile-subscription)
      uiHelpers.ts      UI utilities (cards, banners, phone formatting)
      polarisDom.ts     DOM helper for Polaris web components
      types.ts          Shared TypeScript types

docker/
  nginx/templates/      nginx reverse proxy config (TLS termination)

prisma/
  schema.prisma         Session storage (SQLite)
```

## Prerequisites

- **Node.js** >= 20.19 (see `engines` in package.json)
- **Shopify CLI** (`npm install -g @shopify/cli`)
- **Shopify Partner Account** with a development store (Plus sandbox for checkout extensions)

## Quick start

```bash
# Install dependencies
npm install

# Generate Prisma client + run migrations
npm run setup

# Start dev server (opens Shopify CLI tunnel)
npm run dev
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_API_KEY` | Yes | Partner Dashboard -> App -> API credentials |
| `SHOPIFY_API_SECRET` | Yes | Partner Dashboard -> App -> API credentials |
| `SHOPIFY_APP_URL` | Dev only | Set automatically by `shopify app dev` |
| `SCOPES` | Yes | OAuth scopes, must match `shopify.app.toml` |
| `DATABASE_URL` | No | SQLite path (default: `file:./prisma/dev.sqlite`) |
| `NUMBERS_FUNCTION_URL` | Yes | Number pool Cloud Function URL |
| `NUMBERS_API_KEY` | Yes | API key for number pool authentication |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Shopify CLI |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run deploy` | Deploy app + extensions to Shopify |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript check (app + extension) |
| `npm run lint` | ESLint |

## Checkout extension setup

The **Mobile Plan Onboarding** extension runs during checkout for carts containing products with:
- Product type `Mobile-subscription`, or
- Product/variant title containing "mobile plan"

### Configuration

1. **Deploy** the app: `npm run deploy`
2. **Install** on your dev store from the Partner Dashboard
3. Go to **Settings -> Checkout -> Customize**
4. Click **Add app block** and select **Mobile Plan Onboarding**
5. Drag the block to your desired position
6. Configure the **Numbers API origin** in block settings (your app's public URL)

### Product requirements

- Set product type to `Mobile-subscription`
- Add a `custom.monthly_price` metafield (Money type) for recurring price display
- Enable **Storefront API** access on the metafield definition (Settings -> Custom data -> Products)
- Publish the product to the **Online Store** sales channel

### Extension settings

| Setting | Description |
|---------|-------------|
| `numbers_api_origin` | Base URL for number pool API calls. Falls back to `application_url` from app config. |

## Number pool API proxy

The app proxies number pool requests from the checkout extension to a Cloud Function:

- `GET /api/numbers/available?sessionId=...` - List available numbers
- `POST /api/numbers/lock` - Lock a number for a session
- `POST /api/numbers/unlock` - Release a locked number

The extension authenticates via Shopify session tokens. The proxy adds the `X-API-Key` header for the upstream Cloud Function.

## Deployment

### Docker (on-prem / staging)

See [docs/DOCKER.md](docs/DOCKER.md) for the full Docker Compose setup with nginx TLS termination.

```bash
cp docker-compose.env.example .env
# Fill in SHOPIFY_*, APP_HOSTNAME, etc.
docker compose build --no-cache
docker compose up -d
```

### Shopify configuration

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Partner Dashboard settings, OAuth redirect URLs, and extension configuration.

## Database

Sessions are stored in SQLite (`prisma/schema.prisma`). This is suitable for single-instance deployments. For multi-instance or high-concurrency production use, migrate to PostgreSQL:

1. Change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`
2. Update `DATABASE_URL` to a PostgreSQL connection string
3. Run `npx prisma migrate dev` to generate the migration

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run typecheck     # Type-check app + extension
```

Tests cover:
- Subscription line filtering logic
- Swiss phone number formatting
- Money value parsing (metafield formats)
- Form validation rules
- Polaris DOM helper

## CI

GitHub Actions runs on every push/PR to `main`:
- Lint (ESLint)
- Typecheck (TypeScript)
- Test (Vitest)
- Build (Remix)

## Further reading

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment and Shopify configuration
- [docs/DOCKER.md](docs/DOCKER.md) - Docker deployment with nginx + TLS
- [docs/CHECKOUT_DEV.md](docs/CHECKOUT_DEV.md) - Checkout extension development tips
- [docs/RIGHT_COLUMN_CHECKOUT.md](docs/RIGHT_COLUMN_CHECKOUT.md) - Order summary pricing placement
