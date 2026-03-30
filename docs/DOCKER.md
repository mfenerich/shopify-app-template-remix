# Docker deployment (on-prem / staging)

This stack runs the Remix app behind **nginx** with TLS certificates from **certbot-central** (shared Docker volume), per internal docs: **SSL Certificates (certbot-central)** (`docs/infrastructure/ssl-certificates.md` in the internal wiki).

## Prerequisites

1. **Host** with Docker and Docker Compose v2.
2. **DNS** for your app hostname (e.g. `poc-nextphone-staging.revendo.com`) pointing to that host.
3. **Certificate** issued on the same Docker host that runs `revendo-certs` (or wherever `certbot-central-certs` exists):

   ```bash
   ssh -p 7023 dockerdeploy@marketplaces.revendo.com
   cd /srv/dockerdeploy/revendo-certs
   ./scripts/add-domain.sh your-app-hostname.revendo.com
   ```

4. **Shopify Partner app** configured with:
   - **App URL** = `https://your-app-hostname.revendo.com`
   - **Allowed redirection URL(s)** = `https://your-app-hostname.revendo.com/auth/callback`
5. **Environment** file (see below) with `SHOPIFY_*`, `SCOPES`, and matching `SHOPIFY_APP_URL` (HTTPS, no trailing slash).

## certbot-central volume

`docker-compose.yml` declares:

```yaml
volumes:
  certbot-central-certs:
    external: true
```

The volume name must match the one created by **revendo-certs** on that server. If your ops team uses a different name, change `external: true` and the volume name accordingly.

The **nginx** container name includes `nginx` so cert renewal can auto-reload it (see wiki).

## Configure and run

1. Copy env:

   ```bash
   cp .env.example .env
   # Fill SHOPIFY_*, SCOPES, DATABASE_URL if not using default
   ```

2. Set at least:

   | Variable | Example |
   |----------|---------|
   | `APP_HOSTNAME` | `poc-nextphone-staging.revendo.com` (must match cert + DNS) |
   | `SHOPIFY_APP_URL` | `https://poc-nextphone-staging.revendo.com` |
   | `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Partner Dashboard |
   | `DATABASE_URL` | `file:/data/prod.sqlite` (default in compose) or omit |

3. Build and start:

   ```bash
   docker compose build --no-cache
   docker compose up -d
   ```

4. **Deploy app + extensions** to Shopify (from a machine with Shopify CLI):

   ```bash
   npm run deploy
   ```

5. **Install** the app on the staging store from the Partner Dashboard.

## SQLite persistence

Sessions live in SQLite at `DATABASE_URL` (default `file:/data/prod.sqlite` on volume `app-data`). Back up `/var/lib/docker/volumes/...` or your named volume as needed.

For production-grade concurrency, consider PostgreSQL and a Prisma migration to `provider = "postgresql"`.

## Troubleshooting

- **502 / bad gateway** — Check `docker compose logs app` and that the app listens on `3000` inside the network.
- **Certificate not found** — Run `./scripts/list-certs.sh` on the certbot host; paths must be `/etc/letsencrypt/live/<APP_HOSTNAME>/`.
- **OAuth redirect mismatch** — `SHOPIFY_APP_URL` must exactly match App URL in Partner Dashboard (scheme, host, no trailing slash).
