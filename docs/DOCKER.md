# Docker deployment (on-prem / staging)

This stack runs the Remix app behind **nginx** with TLS certificates from **certbot-central** (shared Docker volume), per internal docs: **SSL Certificates (certbot-central)** (`docs/infrastructure/ssl-certificates.md` in the internal wiki).

## Prerequisites

1. **Host** with Docker and Docker Compose v2.
2. **DNS** for your app hostname pointing at the server (or its edge), e.g. Cloudflare **CNAME** `mobile-onboarding-stage` → `basel.revendo.com` with DNS-only proxy if required by your edge.

### Staging (Revendo): example DevOps handoff

| Item | Example (confirm with your team) |
|------|----------------------------------|
| Public DNS | `mobile-onboarding-stage.revendo.com` (CNAME target per your edge, e.g. `basel.revendo.com`) |
| WAN port forward | e.g. `141.195.94.67:8889` (TCP) → `10.1.90.71:8889` (Docker staging VM) |
| `APP_HOSTNAME` | `mobile-onboarding-stage.revendo.com` |
| `HTTPS_PORT` / `HTTP_PORT` | Set in `.env` if nginx is published on non-default host ports (e.g. `HTTPS_PORT=8889` so host `8889` maps to container `443`) |
| `SHOPIFY_APP_URL` | Same host as buyers use; **include `:8889`** only if the Shopify admin / storefront loads the app over that port (if TLS is on 443 in front, omit the port) |

Partner Dashboard **App URL** and **Allowed redirection URL(s)** must match `SHOPIFY_APP_URL` exactly (including port if present).
3. **TLS** — pick one:

   **A. Central `revendo-certs` on marketplaces** (existing org setup) — shared volume `certbot-central-certs` already on that Docker host:

   ```bash
   ssh -p 7023 dockerdeploy@marketplaces.revendo.com
   cd /srv/dockerdeploy/revendo-certs
   ./scripts/add-domain.sh your-app-hostname.revendo.com
   ```

   Your app’s VM must mount that **same** volume name (usually only if the app runs on that host or shares the volume — most staging boxes do **not**).

   **A′. certbot-central on the staging VM** — if staging **does not** use marketplaces’ volume, deploy the **certbot-central** stack on **the same machine** that runs this app’s Docker Compose (e.g. clone [`certbot-central`](https://github.com/revendo/revendo-certs) or your internal mirror). That creates the `certbot-central-certs` volume locally.

   1. **Cloudflare:** The hostname must live in a zone your API token can edit (DNS-01). `mobile-onboarding-stage.revendo.com` under `revendo.com` is fine if the token has **Zone → DNS → Edit** for that zone.
   2. On the staging VM:

      ```bash
      cd /path/to/certbot-central
      cp certbot/cloudflare.ini.example certbot/cloudflare.ini
      # Paste API token; chmod 600 certbot/cloudflare.ini
      docker compose up -d
      ./scripts/add-domain.sh mobile-onboarding-stage.revendo.com
      ```

   3. Confirm: `./scripts/list-certs.sh` (or `docker compose run --rm --entrypoint certbot certbot certificates`).
   4. Then start **this** app: `docker compose up -d` (same Docker daemon → same `certbot-central-certs` volume).

   See the **certbot-central** repo `README.md` for details. Keep the renewal container running (`certbot-central`).

   **B. Commercial wildcard `*.revendo.com`** (e.g. `STAR_revendo_com.crt`, `STAR_revendo_com.ca-bundle`, `revendo_com.key`):

   On a secure machine, build nginx-ready files (do **not** commit them; keep `./docker/ssl/` only on the server):

   ```bash
   mkdir -p docker/ssl
   # Full chain = server cert + intermediates (order matters; follow your CA’s docs if unsure)
   cat STAR_revendo_com.crt STAR_revendo_com.ca-bundle > docker/ssl/fullchain.pem
   cp revendo_com.key docker/ssl/privkey.pem
   chmod 600 docker/ssl/privkey.pem
   ```

   Deploy with the wildcard override so nginx reads `/etc/nginx/tls/fullchain.pem` and `privkey.pem`:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.wildcard-tls.yml up -d
   ```

   `APP_HOSTNAME` must still be your exact staging FQDN (e.g. `mobile-onboarding-stage.revendo.com`). The wildcard covers that hostname; DNS and port forwarding must reach this stack.

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

The volume name must match **`certbot-central-certs`** (created when certbot-central runs once — either on **marketplaces** or on **staging** per TLS option A or A′ above). If your ops team renames it, change `external: true` and the volume name in `docker-compose.yml` accordingly.

The **nginx** container name includes `nginx` so cert renewal can auto-reload it (see wiki).

## Configure and run

1. Copy env on the **server** (next to `docker-compose.yml`):

   ```bash
   cp docker-compose.env.example .env
   # Fill SHOPIFY_*; set HTTPS_PORT/HTTP_PORT if DevOps published non-default ports
   ```

2. Set at least:

   | Variable | Example |
   |----------|---------|
   | `APP_HOSTNAME` | `mobile-onboarding-stage.revendo.com` (must match cert + DNS) |
   | `SHOPIFY_APP_URL` | `https://mobile-onboarding-stage.revendo.com` (add `:8889` if that is the public HTTPS port) |
   | `HTTPS_PORT` / `HTTP_PORT` | e.g. `8889` / `80` when WAN forwards a non-default HTTPS port |
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
- **OAuth redirect mismatch** — `SHOPIFY_APP_URL` must exactly match App URL in Partner Dashboard (scheme, host, **port if any**, no trailing slash).
