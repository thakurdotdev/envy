# Deploying Envy

The API and the web dashboard run on Shipyard on the owner's server. Only the
CLI is published, as GitHub release binaries. No third-party hosting.

## 1. Database (once)

On the existing Postgres server, as a superuser. This reuses the existing
`appuser` role; do not create new roles. Port 5432 must stay closed to the
internet.

```sql
CREATE DATABASE envy OWNER appuser;
-- Optional, for a staging copy:
CREATE DATABASE envy_staging OWNER appuser;
```

## 2. API (Shipyard app)

| Setting       | Value                                                               |
| ------------- | ------------------------------------------------------------------- |
| Build command | `bun install --frozen-lockfile && bun run --filter @envy/api build` |
| Release step  | `bun run db:migrate` (runs before the new version starts)           |
| Start command | `apps/api/dist/envy-api`                                            |
| Health check  | `GET /health`                                                       |
| Logs          | stdout, one JSON object per line                                    |

Environment variables (the API refuses to start if one is missing or wrong):

| Variable               | Example                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `APP_ENV`              | `production` (turns on secure cookies and HSTS)                                          |
| `PORT`                 | set by Shipyard                                                                          |
| `DATABASE_URL`         | `postgres://appuser:…@localhost:5432/envy` (add `?sslmode=require` over a network)       |
| `API_URL`              | `https://api.<domain>`                                                                   |
| `WEB_URL`              | `https://envy.thakur.dev` (CORS allow-list and sign-in redirect)                         |
| `JWT_SECRET`           | `openssl rand -base64 48`                                                                |
| `GITHUB_CLIENT_ID`     | from the GitHub OAuth app                                                                |
| `GITHUB_CLIENT_SECRET` | from the GitHub OAuth app                                                                |
| `TRUST_PROXY`          | `1`: nginx appends the visitor's address (restored from Cloudflare) to `X-Forwarded-For` |

GitHub OAuth app: enable **Device Flow**; callback URL
`https://api.<domain>/v1/auth/github/callback`.

The web lives at `https://envy.thakur.dev`. Keep the API on the same site
(for example `api.envy.thakur.dev`), so the refresh cookie (`SameSite=Lax`)
works. The web build also serves the CLI install script at
`https://envy.thakur.dev/install.sh`.

## 3. Web (Shipyard static site)

| Setting       | Value                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Build command | `bun install --frozen-lockfile && NEXT_PUBLIC_API_URL=https://api.<domain> bun run --filter @envy/web build` |
| Output folder | `apps/web/out`                                                                                               |
| Routing       | serve `/<path>.html` for `/<path>` (Next.js static export)                                                   |

The build downloads the Geist font from Google Fonts, so it needs internet
access. Recommended response headers for the site:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.<domain>; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; frame-ancestors 'none'
```

(`wasm-unsafe-eval` is needed by libsodium, which runs as WebAssembly.) The
pages also carry their own policy as a `<meta>` tag (`apps/web/lib/content-security-policy.ts`),
so they stay protected if the headers are missing. The public pages (landing,
docs) additionally allow the Umami analytics script from `analytics.thakur.dev`;
the dashboard never loads it, and links between the two halves are full page
loads so its script never runs next to decrypted secrets. A header policy is
combined with the page's own, so if you set one on the host, keep the
dashboard's version above and do not add the analytics origin to it.

## 4. CLI release

1. Set the repository variable `ENVY_API_URL` to `https://api.<domain>`; the
   release build bakes it in as the default server.
2. Bump `apps/cli/package.json` `version`, add a `CHANGELOG.md` entry, merge.
3. `git tag v<version> && git push origin v<version>`. The Release workflow
   builds and smoke-tests every binary and publishes them with
   `checksums.txt`.

The install script and `envy upgrade` download from GitHub releases, so the
repository (or at least its releases) must be public.

## 5. Backups and monitoring

Nightly `pg_dump`, kept 14 days, copied to a second disk or machine:

```cron
# m h dom mon dow   command
15 3 * * *  pg_dump --format=custom --dbname=envy --file=/backups/envy/envy-$(date +\%F).dump && find /backups/envy -name 'envy-*.dump' -mtime +14 -delete && rsync -a /backups/envy/ backup-host:/backups/envy/
```

Test a restore once a month:

```sh
createdb envy_restore_test
pg_restore --dbname=envy_restore_test /backups/envy/envy-<date>.dump
psql envy_restore_test -c 'select count(*) from secret_versions'
dropdb envy_restore_test
```

Uptime: Shipyard's health check on `/health`, or a cron job that calls it and
alerts by email or webhook.

## Client addresses behind Cloudflare

Rate limits count per client address. Requests come through Cloudflare, then
nginx. nginx restores the visitor's real address for every site from
`CF-Connecting-IP`, but only when the connection comes from one of
Cloudflare's ranges:

```
# /etc/nginx/conf.d/cloudflare-realip.conf
include /etc/nginx/snippets/tunl-cloudflare-realip.conf;
```

nginx then appends that address to `X-Forwarded-For`, so the API runs with
`TRUST_PROXY=1` and takes the last entry. Someone who connects to the server
directly cannot fake it: their connection is not from Cloudflare, so nginx
keeps their own address.

Without that nginx file, the last entry is Cloudflare's edge and the visitor
is second from the right (`TRUST_PROXY=2`), but then a direct connection can
put any address in that position.

Keep the Cloudflare ranges current: `update-cloudflare-ips.sh` (in the tunl
repository) regenerates the snippet. Port 443 cannot be limited to Cloudflare
in the firewall while `tunl.online` (DNS-only, for SSH on port 2222) serves
HTTPS from the same address.
